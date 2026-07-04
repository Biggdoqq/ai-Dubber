"""In-process job manager for long-running tasks.

Long jobs (transcription, translation, TTS, export) run on background threads
and report progress via a polled REST endpoint — the legacy app used Qt
progress/finished signals; the frontend polls /api/jobs/{id} instead.
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

# Terminal jobs older than this are evicted from the store on every new job
# creation, preventing unbounded memory growth in long-running sessions.
_TTL_SECONDS = 1800  # 30 minutes


@dataclass
class Job:
    id: str
    kind: str
    status: str = "pending"  # pending | running | done | error | cancelled
    progress: int = 0
    message: str = ""
    result: Any = None
    error: Optional[str] = None
    _cancel: threading.Event = field(default_factory=threading.Event)
    _created: float = field(default_factory=time.monotonic)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def _evict(self) -> None:
        """Remove terminal jobs older than _TTL_SECONDS to cap memory use."""
        cutoff = time.monotonic() - _TTL_SECONDS
        with self._lock:
            stale = [
                k for k, j in self._jobs.items()
                if j.status in ("done", "error", "cancelled") and j._created < cutoff
            ]
            for k in stale:
                del self._jobs[k]

    def create(self, kind: str) -> Job:
        self._evict()  # opportunistic eviction on every new job
        job = Job(id=uuid.uuid4().hex, kind=kind)
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if job and job.status in ("pending", "running"):
            job._cancel.set()
            job.status = "cancelled"
            return True
        return False

    def run(self, kind: str, target: Callable[["Job"], Any]) -> Job:
        """Start `target(job)` on a background thread. target may set
        job.progress/message and should check job._cancel.is_set()."""
        job = self.create(kind)

        def _worker() -> None:
            job.status = "running"
            try:
                result = target(job)
                if job.status != "cancelled":
                    job.result = result
                    job.status = "done"
                    job.progress = 100
            except Exception as exc:  # noqa: BLE001
                job.error = f"{exc}\n{traceback.format_exc()}"
                job.status = "error"

        threading.Thread(target=_worker, daemon=True).start()
        return job


jobs = JobManager()

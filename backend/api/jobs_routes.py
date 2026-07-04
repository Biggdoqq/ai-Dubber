"""Job status endpoints (polled by the frontend instead of Qt signals)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.utils.jobs import jobs

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_dict()


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str) -> dict:
    ok = jobs.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=409, detail="Job not cancellable")
    return {"cancelled": True}

"""In-memory ring buffer log handler.

Captures recent backend log records so the Diagnostics/Debug UI can show them
without writing to disk. Installed once at app startup.
"""
from __future__ import annotations

import logging
from collections import deque
from datetime import datetime
from threading import Lock

_BUFFER: deque[dict] = deque(maxlen=500)
_LOCK = Lock()


class RingHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:  # noqa: BLE001
            msg = record.getMessage()
        with _LOCK:
            _BUFFER.append({
                "time": datetime.fromtimestamp(record.created).isoformat(timespec="seconds"),
                "level": record.levelname,
                "logger": record.name,
                "message": msg,
            })


def install() -> None:
    """Attach the ring handler to the root logger once."""
    root = logging.getLogger()
    if any(isinstance(h, RingHandler) for h in root.handlers):
        return
    handler = RingHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)
    if root.level > logging.INFO:
        root.setLevel(logging.INFO)


def get_logs(limit: int = 200, level: str | None = None) -> list[dict]:
    with _LOCK:
        items = list(_BUFFER)
    if level:
        wanted = level.upper()
        items = [r for r in items if r["level"] == wanted]
    return items[-limit:]


def clear() -> None:
    with _LOCK:
        _BUFFER.clear()

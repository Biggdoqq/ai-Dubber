"""Diagnostics, logs, and debug endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from backend.services import diagnostics_service as svc

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("")
def diagnostics() -> dict:
    return svc.diagnostics()


@router.get("/logs")
def logs(limit: int = 200, level: str | None = None) -> dict:
    return svc.get_logs(limit=limit, level=level)


@router.post("/logs/clear")
def clear_logs() -> dict:
    return svc.clear_logs()

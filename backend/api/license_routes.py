"""License + key-generation endpoints (reuse legacy License.py crypto)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import license_service as svc

router = APIRouter(prefix="/api/license", tags=["license"])


class ActivateRequest(BaseModel):
    key: str
    telegram_user: str = ""


class ValidateRequest(BaseModel):
    key: str


class GenerateKeyRequest(BaseModel):
    machine_id: str
    days: int = 0
    months: int = 0
    years: int = 0


@router.get("/machine-id")
def machine_id() -> dict:
    try:
        return svc.machine_id()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status")
def status() -> dict:
    try:
        return svc.status()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/validate")
def validate(req: ValidateRequest) -> dict:
    return svc.validate(req.key)


@router.post("/activate")
def activate(req: ActivateRequest) -> dict:
    return svc.activate(req.key, req.telegram_user)


@router.post("/deactivate")
def deactivate() -> dict:
    return svc.deactivate()


@router.post("/generate-key")
def generate_key(req: GenerateKeyRequest) -> dict:
    try:
        return svc.generate_key(req.machine_id, req.days, req.months, req.years)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))

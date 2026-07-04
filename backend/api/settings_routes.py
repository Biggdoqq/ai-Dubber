"""Settings + character-profile endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from backend.api.schemas import SettingsUpdate, CharacterProfilesUpdate
from backend.services import settings_service as svc

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings() -> dict:
    return svc.redacted_settings()


@router.put("")
def update_settings(req: SettingsUpdate) -> dict:
    svc.save_settings(req.values)
    return svc.redacted_settings()


@router.get("/characters")
def get_characters() -> dict:
    return svc.load_character_profiles()


@router.put("/characters")
def update_characters(req: CharacterProfilesUpdate) -> dict:
    return svc.save_character_profiles(req.profiles)

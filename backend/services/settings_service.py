"""Settings + character-profile persistence.

Reads/writes the SAME JSON files the legacy app uses so settings carry over:
  ~/.ai_video_dubber_settings.json   and   ./character_profiles.json
"""
from __future__ import annotations

import json
import logging
from typing import Any

from backend.config import settings as cfg

_log = logging.getLogger(__name__)

# The exact key set the legacy app persists (AI_Dubber_PyQt5_Complete.py:6266-6286).
SETTING_KEYS = [
    "language", "theme", "srt_offset",
    "use_gemini", "gemini_api_key", "use_gemini_transcribe", "gemini_model_name",
    "use_groq", "groq_api_key", "use_groq_translate",
    "use_nllb_translate", "nllb_model_name", "use_gpu_nllb",
    "whisper_model_size", "custom_translation_instructions",
    "groq_model_name", "translation_style",
    "auto_check_update", "update_check_url", "video_effects_config",
]

_DEFAULTS: dict[str, Any] = {
    "language": "km",
    "theme": "dark",
    "whisper_model_size": "base",
    "use_gemini": False,
    "use_groq": False,
    "use_nllb_translate": False,
    "video_effects_config": {"watermark": None, "blur": None, "text": None},
}


def load_settings() -> dict:
    data = dict(_DEFAULTS)
    try:
        if cfg.settings_file.exists():
            data.update(json.loads(cfg.settings_file.read_text(encoding="utf-8")))
    except Exception as exc:  # noqa: BLE001
        _log.warning("Failed to load settings (using defaults): %s", exc)
    return data


def save_settings(values: dict) -> dict:
    current = load_settings()
    for k, v in values.items():
        if k in SETTING_KEYS or k in _DEFAULTS:
            current[k] = v
    try:
        cfg.settings_file.write_text(
            json.dumps(current, indent=4, ensure_ascii=False), encoding="utf-8"
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Failed to save settings: {exc}")
    return current


def redacted_settings() -> dict:
    """Settings safe to send to the frontend (API keys masked)."""
    data = load_settings()
    out = dict(data)
    for key in ("gemini_api_key", "groq_api_key"):
        val = data.get(key)
        out[f"{key}_set"] = bool(val)
        if val:
            out[key] = "***"
    return out


def load_character_profiles() -> dict:
    try:
        if cfg.character_profiles_file.exists():
            return json.loads(cfg.character_profiles_file.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        _log.warning("Failed to load character profiles: %s", exc)
    return {}


def save_character_profiles(profiles: dict) -> dict:
    cfg.character_profiles_file.write_text(
        json.dumps(profiles, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return profiles

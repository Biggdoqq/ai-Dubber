"""Pydantic request/response schemas for the REST API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel

# Valid faster-whisper model sizes. Used as an allowlist to prevent unexpected
# values from reaching the transcription subprocess.
WhisperModelSize = Literal["tiny", "base", "small", "medium", "large-v2", "large-v3"]


class SubtitleModel(BaseModel):
    start: float = 0.0
    end: float = 0.0
    text: str = ""
    pitch: int = 0
    speed: float = 1.0
    volume: int = 100
    voice: str = ""
    echo: int = 0
    gender: Optional[str] = None
    emotion: Optional[str] = None


class ParseSrtRequest(BaseModel):
    content: str


class BuildSrtRequest(BaseModel):
    rows: list[SubtitleModel]


class TranscribeRequest(BaseModel):
    path: str
    model_size: WhisperModelSize = "base"
    use_gpu: bool = False
    engine: str = "faster-whisper"  # faster-whisper | groq | gemini
    target_lang: str = "Khmer"  # used by the Gemini transcribe+translate path


class SilenceSplitRequest(BaseModel):
    path: str
    silence_thresh: int = -35
    min_silence: float = 0.4
    min_speech: float = 0.3
    max_seg: float = 8.0


class BatchTranscribeRequest(BaseModel):
    videos: list[str]
    model_size: WhisperModelSize = "base"
    use_gpu: bool = False
    max_seg: float = 8.0


class TranslateRow(BaseModel):
    row_index: int
    text: str
    duration: float = 2.0


class TranslateRequest(BaseModel):
    rows: list[TranslateRow]
    source_lang: str = "auto"
    target_lang: str = "km"
    engine: str = "google"  # google | groq | gemini | nllb
    custom_instructions: str = ""


class TTSRequest(BaseModel):
    text: str
    voice: str = ""
    speed: float = 1.0
    reference_wav: Optional[str] = None


class SettingsUpdate(BaseModel):
    values: dict[str, Any]


class ProjectModel(BaseModel):
    video: str = ""
    subtitles: list[SubtitleModel] = []


class CharacterProfilesUpdate(BaseModel):
    profiles: dict[str, Any]

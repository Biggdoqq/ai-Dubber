"""Backend configuration: path resolution for bundled binaries, models, workers.

Resolves resources whether running from source or a frozen build. Never edits
or imports the legacy GUI app (which eagerly loads torch and gates on license).
"""
from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _project_root() -> Path:
    # backend/config/settings.py -> project root is two parents up from this file's dir
    return Path(__file__).resolve().parents[2]


def _frozen_base() -> Path | None:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
    return None


def _exe_dir() -> Path | None:
    """Directory containing the EXE (frozen) — where droppable assets live."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return None


def _resolve_asset(name: str) -> Path:
    """Find a resource by name, preferring the EXE dir (droppable big assets
    like models/python_runtime), then the bundled _internal dir, then source."""
    roots: list[Path] = []
    exe = _exe_dir()
    if exe is not None:
        roots.append(exe)
    base = _frozen_base()
    if base is not None:
        roots.append(base)
    roots.append(_project_root())
    for root in roots:
        cand = root / name
        if cand.exists():
            return cand
    # Default to the first root so callers get a sensible (creatable) path.
    return roots[0] / name


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DUBBER_", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8765
    open_browser: bool = True

    # API keys (optional; also persisted in the user settings JSON like the legacy app)
    groq_api_key: str = ""
    gemini_api_key: str = ""

    @property
    def root(self) -> Path:
        base = _frozen_base()
        return base if base is not None else _project_root()

    @property
    def bin_dir(self) -> Path:
        return _resolve_asset("bin")

    @property
    def ffmpeg(self) -> str:
        exe = self.bin_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        return str(exe) if exe.exists() else "ffmpeg"

    @property
    def ffprobe(self) -> str:
        exe = self.bin_dir / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
        return str(exe) if exe.exists() else "ffprobe"

    @property
    def models_dir(self) -> Path:
        return _resolve_asset("models")

    @property
    def reference_voices_dir(self) -> Path:
        return _resolve_asset("reference_voices")

    @property
    def worker_python(self) -> str:
        """Python interpreter used to run isolated GPU/ML subprocess workers.

        Mirrors the legacy app's subprocess-isolation strategy (faster-whisper /
        voxcpm run in a separate process to avoid Windows CUDA/OpenMP DLL crashes).
        """
        if getattr(sys, "frozen", False):
            # Portable Python runtime shipped beside the EXE so offline ML
            # workers (faster-whisper / voxcpm) run with no external install.
            exe_dir = Path(sys.executable).parent
            candidates = [
                exe_dir / "python_runtime" / "python.exe",
                exe_dir / "python.exe",
                self.root / "python_runtime" / "python.exe",
                self.root / "python.exe",
            ]
            for cand in candidates:
                if cand.exists():
                    return str(cand)
            # Never return sys.executable when frozen — it is the app EXE, not
            # a Python interpreter; rely on a system python as last resort.
            return "python"
        venv = _project_root() / "venv_cpu" / "Scripts" / "python.exe"
        if venv.exists():
            return str(venv)
        return sys.executable

    @property
    def transcribe_worker(self) -> Path:
        return _project_root() / "scripts" / "transcribe_worker_script.py"

    @property
    def voxcpm_worker(self) -> Path:
        return _project_root() / "scripts" / "voxcpm_worker_script.py"

    @property
    def video_effects_worker(self) -> Path:
        return _project_root() / "scripts" / "video_effects_worker.py"

    @property
    def settings_file(self) -> Path:
        # Same location the legacy app uses, for compatibility.
        return Path.home() / ".ai_video_dubber_settings.json"

    @property
    def character_profiles_file(self) -> Path:
        return _project_root() / "character_profiles.json"

    @property
    def temp_dir(self) -> Path:
        import tempfile
        d = Path(tempfile.gettempdir()) / "ai_dubber_backend"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def jobs_dir(self) -> Path:
        d = self.temp_dir / "jobs"
        d.mkdir(parents=True, exist_ok=True)
        return d


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

"""Assemble the production release into release/AI_Video_Dubber/.

Layout produced (everything the end user needs, no external Python):

    release/AI_Video_Dubber/
        AI_Video_Dubber.exe        # one-click launcher
        _internal/                 # PyInstaller payload (FastAPI + frontend + bin)
        python_runtime/            # self-contained Python for offline ML workers
            python.exe, *.dll, DLLs/, Lib/ (stdlib + ML site-packages)
        models/
            hf_cache/              # faster-whisper model(s) for offline transcribe
        reference_voices/          # VoxCPM cloning samples

Run:
    venv_cpu/Scripts/python assemble_release.py            # full assembly
    venv_cpu/Scripts/python assemble_release.py --runtime  # just python_runtime
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist" / "AI_Video_Dubber"
REL = ROOT / "release" / "AI_Video_Dubber"
VENV = ROOT / "venv_cpu"
BASE_PY = Path(sys.base_prefix)  # the real Python that backs the venv
HF_CACHE = Path.home() / ".cache" / "huggingface"

# Default whisper model bundled for offline transcription (smallest useful).
DEFAULT_WHISPER = "models--Systran--faster-whisper-base"


def _robocopy(src: Path, dst: Path, *, exclude_dirs: list[str] | None = None,
              exclude_files: list[str] | None = None) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    cmd = ["robocopy", str(src), str(dst), "/E", "/NFL", "/NDL", "/NJH",
           "/NJS", "/NC", "/NS", "/MT:8"]
    if exclude_dirs:
        cmd += ["/XD", *exclude_dirs]
    if exclude_files:
        cmd += ["/XF", *exclude_files]
    # robocopy exit codes < 8 are success.
    res = subprocess.run(cmd)
    if res.returncode >= 8:
        raise RuntimeError(f"robocopy failed ({res.returncode}): {src} -> {dst}")


def build_runtime() -> None:
    """Create a self-contained python_runtime from base Python + venv ML libs."""
    rt = REL / "python_runtime"
    print(f"[*] Building portable python_runtime -> {rt}")

    # 1. Core interpreter files (python.exe, DLLs, support libs) from base Python.
    for f in os.listdir(BASE_PY):
        p = BASE_PY / f
        if p.is_file() and (f.lower().endswith((".exe", ".dll")) or f.lower() == "python311._pth"):
            rt.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, rt / f)
    for sub in ("DLLs", "libs"):
        if (BASE_PY / sub).is_dir():
            _robocopy(BASE_PY / sub, rt / sub)

    # 2. Stdlib (base Lib) WITHOUT its bloated site-packages.
    print("[*] Copying stdlib…")
    _robocopy(BASE_PY / "Lib", rt / "Lib",
              exclude_dirs=["site-packages", "__pycache__", "test", "tests"])

    # 3. The venv's ML site-packages (torch, faster_whisper, ctranslate2, …).
    print("[*] Copying ML site-packages (this is the big one)…")
    _robocopy(VENV / "Lib" / "site-packages", rt / "Lib" / "site-packages",
              exclude_dirs=["__pycache__", "pip", "setuptools", "wheel",
                            "PyQt5", "PyQt5_sip"],
              exclude_files=["*.pyc"])
    print("[OK] python_runtime ready.")


def copy_dist() -> None:
    if not DIST.is_dir():
        raise SystemExit(f"[!] {DIST} not found — run PyInstaller first.")
    print(f"[*] Copying app dist -> {REL}")
    _robocopy(DIST, REL)


def copy_models() -> None:
    target = REL / "models" / "hf_cache" / "hub"
    src_hub = HF_CACHE / "hub"
    model_dir = src_hub / DEFAULT_WHISPER
    if model_dir.is_dir():
        print(f"[*] Bundling whisper model: {DEFAULT_WHISPER}")
        _robocopy(model_dir, target / DEFAULT_WHISPER,
                  exclude_dirs=["__pycache__", ".locks"])
    else:
        print(f"[!] {model_dir} not found — offline transcription model not bundled.")

    # Reference voices for VoxCPM cloning (small).
    rv = ROOT / "reference_voices"
    if rv.is_dir():
        _robocopy(rv, REL / "reference_voices")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runtime", action="store_true", help="only build python_runtime")
    ap.add_argument("--dist", action="store_true", help="only copy app dist")
    ap.add_argument("--models", action="store_true", help="only copy models/voices")
    args = ap.parse_args()

    any_flag = args.runtime or args.dist or args.models
    if not any_flag or args.dist:
        copy_dist()
    if not any_flag or args.runtime:
        build_runtime()
    if not any_flag or args.models:
        copy_models()

    print(f"\n[OK] Release at: {REL}")


if __name__ == "__main__":
    main()

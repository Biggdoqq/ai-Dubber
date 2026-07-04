"""Build + post-build helper for the single-EXE launcher.

Usage:
    # 1. Build the React frontend (produces frontend/dist)
    #    cd frontend && npm run build
    #
    # 2. Run PyInstaller against the launcher spec
    venv_cpu/Scripts/python build_launcher.py --build
    #
    # 3. Copy heavy ML libs + an embedded python.exe so subprocess workers run
    venv_cpu/Scripts/python build_launcher.py --postbuild
    #
    # Or do everything:
    venv_cpu/Scripts/python build_launcher.py --all

The heavy ML libraries (torch, faster_whisper, transformers, demucs ...) are
EXCLUDED from PyInstaller analysis (they crash/bloat it) and copied verbatim
afterwards into _internal/Lib/site-packages — the same strategy the legacy
Build.py / Build_FullOffline.py use.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.dirname(__file__))
VENV = os.path.join(ROOT, "venv_cpu")
SITE = os.path.join(VENV, "Lib", "site-packages")
DIST = os.path.join(ROOT, "dist", "AI_Video_Dubber")
INTERNAL = os.path.join(DIST, "_internal")

# Heavy libs excluded from the spec and copied in afterwards.
HEAVY_LIBS = [
    "torch", "torchaudio", "torchgen", "functorch",
    "faster_whisper", "ctranslate2", "tokenizers", "onnxruntime",
    "transformers", "huggingface_hub", "safetensors",
    "demucs", "julius", "openunmix", "dora", "diffq",
    "av", "soundfile", "soxr", "audioread", "lazy_loader",
    "librosa", "numba", "llvmlite", "scipy", "sklearn",
]


def run_frontend_build() -> None:
    fe = os.path.join(ROOT, "frontend")
    print("[*] Building frontend (npm run build)…")
    subprocess.run("npm run build", cwd=fe, shell=True, check=True)


def run_pyinstaller() -> None:
    spec = os.path.join(ROOT, "AI_Video_Dubber_Launcher.spec")
    pyinstaller = os.path.join(VENV, "Scripts", "pyinstaller.exe")
    if not os.path.isfile(pyinstaller):
        pyinstaller = "pyinstaller"
    print("[*] Running PyInstaller…")
    subprocess.run([pyinstaller, spec, "--noconfirm"], cwd=ROOT, check=True)


def copy_heavy_libs() -> None:
    target = os.path.join(INTERNAL, "Lib", "site-packages")
    os.makedirs(target, exist_ok=True)
    print(f"[*] Copying heavy ML libs -> {target}")
    for lib in HEAVY_LIBS:
        src = os.path.join(SITE, lib)
        if not os.path.isdir(src):
            # maybe a single-module .py / dist-info only
            continue
        dst = os.path.join(target, lib)
        if os.path.isdir(dst):
            continue
        print(f"    + {lib}")
        shutil.copytree(src, dst, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def copy_embedded_python() -> None:
    """Copy a real python.exe + stdlib so subprocess workers (whisper/voxcpm) run.

    The launcher resolves settings.worker_python to <dist>/python.exe when frozen.
    """
    print("[*] Embedding python.exe + DLLs for subprocess workers…")
    py_exe = os.path.join(VENV, "Scripts", "python.exe")
    base = os.path.dirname(os.path.dirname(py_exe))  # venv root
    # Prefer the venv's base interpreter files.
    for name in ("python.exe", "pythonw.exe"):
        src = os.path.join(VENV, "Scripts", name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(DIST, name))
    # python3xx.dll
    for f in os.listdir(base):
        if f.lower().startswith("python3") and f.lower().endswith(".dll"):
            shutil.copy2(os.path.join(base, f), os.path.join(DIST, f))
    print("    (if workers fail to start, copy a full embeddable python into dist/)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frontend", action="store_true", help="build the React frontend")
    ap.add_argument("--build", action="store_true", help="run PyInstaller")
    ap.add_argument("--postbuild", action="store_true", help="copy heavy libs + python")
    ap.add_argument("--all", action="store_true", help="frontend + build + postbuild")
    args = ap.parse_args()

    if args.all or args.frontend:
        run_frontend_build()
    if args.all or args.build:
        run_pyinstaller()
    if args.all or args.postbuild:
        if not os.path.isdir(DIST):
            print(f"[!] {DIST} not found — run --build first.")
            sys.exit(1)
        copy_heavy_libs()
        copy_embedded_python()

    if not any([args.frontend, args.build, args.postbuild, args.all]):
        ap.print_help()
    else:
        print("\n[OK] Done.")


if __name__ == "__main__":
    main()

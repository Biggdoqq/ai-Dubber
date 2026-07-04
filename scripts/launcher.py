"""Single-EXE launcher for AI Video Dubber.

Boot sequence (matches the desktop mission):
  1. Start the FastAPI/uvicorn backend on localhost in a background thread.
  2. Wait for /api/ping to respond.
  3. Open the default browser at the app URL.
  4. Keep the process alive (the window/console hosts the server).

When frozen with PyInstaller, the bundled `bin/` (ffmpeg), `frontend_dist/`,
worker scripts and (optionally) models sit alongside the executable / in
sys._MEIPASS, and config/settings.py resolves them automatically.
"""
from __future__ import annotations

import os
import sys
import threading
import time
import urllib.request
import webbrowser

# OpenMP / multiprocessing guards (same as the legacy app bootstrap).
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "True")

import multiprocessing

HOST = os.environ.get("DUBBER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DUBBER_PORT", "8765"))
URL = f"http://{HOST}:{PORT}/"


def _wait_for_backend(timeout: float = 60.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{URL}api/ping", timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def _run_server() -> None:
    import uvicorn
    from backend.app import app

    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


def main() -> None:
    multiprocessing.freeze_support()

    print("=" * 52)
    print("  AI Video Dubber  —  starting…")
    print("=" * 52)

    server = threading.Thread(target=_run_server, daemon=True)
    server.start()

    print(f"  Backend starting on {URL}")
    if _wait_for_backend():
        print("  Backend ready. Opening browser…")
        if os.environ.get("DUBBER_OPEN_BROWSER", "1") == "1":
            webbrowser.open(URL)
    else:
        print("  ! Backend did not become ready in time.")
        print(f"  Try opening {URL} manually.")

    print("\n  This window keeps the app running. Close it to quit.\n")
    try:
        while server.is_alive():
            server.join(1.0)
    except KeyboardInterrupt:
        print("\n  Shutting down…")


if __name__ == "__main__":
    main()

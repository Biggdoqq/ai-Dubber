"""GPU info service.

Probes CUDA availability in the worker python (never imports torch in the API
process), reusing the same subprocess-isolation strategy as
`audio_service._demucs_device`. Also surfaces the ffmpeg hardware encoders that
the export pipeline's nvenc->mf->libx264 ladder can fall back onto, so the UI
can show what acceleration is actually available.
"""
from __future__ import annotations

import json
import os
import subprocess

from backend.config import settings

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

_PROBE = (
    "import json,sys\n"
    "info={'available':False,'device_name':None,'device_count':0,'cuda_version':None,'torch_version':None}\n"
    "try:\n"
    "    import torch\n"
    "    info['torch_version']=torch.__version__\n"
    "    info['available']=bool(torch.cuda.is_available())\n"
    "    if info['available']:\n"
    "        info['device_count']=torch.cuda.device_count()\n"
    "        info['device_name']=torch.cuda.get_device_name(0)\n"
    "        info['cuda_version']=torch.version.cuda\n"
    "except Exception as e:\n"
    "    info['error']=str(e)\n"
    "sys.stdout.write(json.dumps(info))\n"
)


def gpu_info() -> dict:
    """Return CUDA availability + device details (probed in the worker runtime)."""
    result = {
        "available": False,
        "device_name": None,
        "device_count": 0,
        "cuda_version": None,
        "torch_version": None,
        "encoders": [],
        "worker_python": settings.worker_python,
    }
    try:
        proc = subprocess.run(
            [settings.worker_python, "-c", _PROBE],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=_NO_WINDOW, timeout=30,
        )
        out = (proc.stdout or "").strip()
        if out.startswith("{"):
            result.update(json.loads(out))
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)

    result["encoders"] = _hw_encoders()
    return result


def _hw_encoders() -> list[str]:
    """Which hardware H.264 encoders ffmpeg reports (matches the export ladder)."""
    found: list[str] = []
    try:
        proc = subprocess.run(
            [settings.ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=_NO_WINDOW, timeout=20,
        )
        text = proc.stdout or ""
        for enc in ("h264_nvenc", "h264_mf", "h264_qsv", "h264_amf", "libx264"):
            if enc in text:
                found.append(enc)
    except Exception:
        pass
    return found

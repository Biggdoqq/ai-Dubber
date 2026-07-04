"""Media + file endpoints: upload, HTTP range streaming for <video>, file listing.

Video playback uses HTTP range requests against an HTML5 <video> element — this
keeps the "frontend talks only via REST/HTTP" rule while preserving frame-accurate
playback that pure JSON request/response cannot provide.
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse

from backend.config import settings
from backend.services import waveform_service
from backend.utils import ffmpeg

router = APIRouter(prefix="/api/media", tags=["media"])

_CHUNK = 1024 * 1024  # 1 MiB


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    dest = settings.temp_dir / "uploads"
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / file.filename
    with open(target, "wb") as fh:
        while chunk := await file.read(_CHUNK):
            fh.write(chunk)
    return {
        "path": str(target),
        "name": file.filename,
        "duration": ffmpeg.probe_duration(str(target)),
    }


@router.get("/probe")
def probe(path: str) -> dict:
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": path, "duration": ffmpeg.probe_duration(path)}


@router.get("/waveform")
def waveform(path: str, buckets: int = 800) -> dict:
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        return waveform_service.generate_peaks(path, buckets=buckets)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/stream")
def stream(path: str, request: Request):
    """Stream a media file with HTTP Range support for <video>/<audio>."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(path)
    media_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    range_header = request.headers.get("range")

    if range_header is None:
        return FileResponse(path, media_type=media_type)

    # Parse "bytes=start-end"
    try:
        units, _, rng = range_header.partition("=")
        start_s, _, end_s = rng.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
    except Exception:
        raise HTTPException(status_code=416, detail="Invalid range")

    end = min(end, file_size - 1)
    length = end - start + 1

    def _iter():
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                data = fh.read(min(_CHUNK, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return StreamingResponse(_iter(), status_code=206, media_type=media_type, headers=headers)


@router.post("/upload-reference-voice")
async def upload_reference_voice(file: UploadFile = File(...)) -> dict:
    dest = settings.reference_voices_dir
    dest.mkdir(parents=True, exist_ok=True)
    
    # 1. Format validation: accept only .wav and .mp3
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".wav", ".mp3"):
        raise HTTPException(status_code=400, detail="Only .wav and .mp3 formats are supported.")
        
    base_name = os.path.splitext(file.filename)[0]
    
    # 2. Unique filename generation (final file is always .wav)
    target_ext = ".wav"
    final_name = f"{base_name}{target_ext}"
    counter = 1
    while (dest / final_name).exists():
        final_name = f"{base_name}_{counter}{target_ext}"
        counter += 1
        
    temp_target = dest / f"{base_name}_temp{ext}"
    
    # 3. Limit upload size to 100 MB
    MAX_SIZE = 100 * 1024 * 1024
    total_bytes = 0
    
    try:
        with open(temp_target, "wb") as fh:
            while chunk := await file.read(_CHUNK):
                total_bytes += len(chunk)
                if total_bytes > MAX_SIZE:
                    raise HTTPException(status_code=400, detail="File size exceeds the 100 MB limit.")
                fh.write(chunk)
    except HTTPException:
        if temp_target.exists():
            os.remove(temp_target)
        raise
    except Exception as e:
        if temp_target.exists():
            os.remove(temp_target)
        raise HTTPException(status_code=500, detail=f"File saving failed: {e}")
        
    # 4. Conversion & Verification (pydub)
    final_path = dest / final_name
    try:
        from pydub import AudioSegment
        AudioSegment.converter = settings.ffmpeg
        
        # Load and handle corrupted files gracefully
        if ext == ".mp3":
            sound = AudioSegment.from_mp3(str(temp_target))
        else:
            sound = AudioSegment.from_wav(str(temp_target))
            
        # Export as WAV (recreating/standardizing it)
        sound.export(str(final_path), format="wav")
        
        if temp_target.exists():
            os.remove(temp_target)
            
        # Extract metadata
        metadata = {
            "filename": final_path.name,
            "duration": round(sound.duration_seconds, 2),
            "sample_rate": sound.frame_rate,
            "channels": sound.channels,
            "file_size": os.path.getsize(final_path),
        }
    except Exception as e:
        if temp_target.exists():
            os.remove(temp_target)
        if final_path.exists():
            os.remove(final_path)
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted audio file: {e}")
        
    return {
        "path": str(final_path),
        "name": final_path.name,
        "metadata": metadata
    }


@router.delete("/delete-reference-voice")
def delete_reference_voice(path: str) -> dict:
    try:
        ref_dir = settings.reference_voices_dir.resolve()
        file_path = Path(path).resolve()
        
        # Security validation: only delete files inside reference_voices directory
        if not str(file_path).startswith(str(ref_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")

    if file_path.exists():
        try:
            os.remove(file_path)
            return {"deleted": True, "path": path}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")
            
    return {"deleted": False, "detail": "File not found"}


@router.get("/reference-voice-stream")
def reference_voice_stream(path: str, request: Request):
    try:
        ref_dir = settings.reference_voices_dir.resolve()
        file_path = Path(path).resolve()
        
        is_ref = str(file_path).startswith(str(ref_dir))
        is_temp = str(file_path).startswith(str(settings.temp_dir.resolve()))
        if not (is_ref or is_temp):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    return stream(str(file_path), request)


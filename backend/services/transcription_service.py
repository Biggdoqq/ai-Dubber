"""Transcription service.

Reuses the EXISTING standalone worker `transcribe_worker_script.py` via
subprocess — exactly the legacy isolation strategy (faster-whisper in a
separate process to avoid Windows CUDA/OpenMP DLL crashes). The worker script
is not modified.

Also provides cloud paths (Groq / Gemini) matching the legacy engine options.
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import time
from pathlib import Path

import requests

from backend.config import settings
from backend.core.srt import build_srt, srt_seconds_to_time
from backend.utils import ffmpeg
from backend.utils.jobs import Job

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def _worker_env() -> dict:
    """Env for the transcription subprocess.

    Points faster-whisper at a bundled HF cache when present (models/hf_cache),
    so offline transcription works with no network and no external Python.
    """
    env = dict(os.environ)
    env["KMP_DUPLICATE_LIB_OK"] = "True"
    bundled = settings.models_dir / "hf_cache"
    if bundled.is_dir():
        env["HF_HOME"] = str(bundled)
        env["HF_HUB_OFFLINE"] = "1"
    return env


def _segments_to_rows(segments: list[dict]) -> list[dict]:
    rows = []
    for seg in segments:
        rows.append({
            "start": float(seg.get("start", 0.0)),
            "end": float(seg.get("end", 0.0)),
            "text": str(seg.get("text", "")).strip(),
        })
    return rows


def transcribe_offline(
    audio_or_video: str,
    model_size: str = "base",
    use_gpu: bool = False,
    job: Job | None = None,
) -> dict:
    """Offline faster-whisper transcription via the existing worker script."""
    if job:
        job.message = "Extracting audio…"
        job.progress = 10

    src = Path(audio_or_video)
    wav = str(settings.temp_dir / f"transcribe_{src.stem}.wav")
    ffmpeg.extract_audio(str(src), wav, sample_rate=16000)

    device = "cuda" if use_gpu else "cpu"
    compute_type = "float16" if use_gpu else "int8"

    if job:
        job.message = f"Running faster-whisper ({model_size}, {device})…"
        job.progress = 40

    cmd = [
        settings.worker_python,
        str(settings.transcribe_worker),
        wav, model_size, device, compute_type,
    ]
    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW, env=_worker_env(),
    )
    # Worker prints a single JSON line on stdout.
    out = (proc.stdout or "").strip().splitlines()
    payload = None
    for line in reversed(out):
        line = line.strip()
        if line.startswith("{"):
            try:
                payload = json.loads(line)
                break
            except Exception:
                continue
    if payload is None:
        raise RuntimeError(
            f"Transcription worker produced no JSON. stderr={proc.stderr[-500:]}"
        )
    if not payload.get("success"):
        # GPU failure -> retry on CPU (mirrors legacy auto-retry).
        if device == "cuda":
            return transcribe_offline(audio_or_video, model_size, use_gpu=False, job=job)
        raise RuntimeError(payload.get("error", "Unknown transcription error"))

    rows = _segments_to_rows(payload.get("segments", []))
    if job:
        job.message = "Done"
        job.progress = 100
    return {
        "engine": "faster-whisper",
        "language": payload.get("language"),
        "segments": rows,
        "srt": build_srt(rows),
    }


def transcribe_groq(audio_or_video: str, api_key: str, job: Job | None = None) -> dict:
    """Cloud STT via Groq whisper-large-v3 (legacy GroqTranscriptionWorker)."""
    if not api_key:
        raise RuntimeError("No Groq API key set. Add one in Settings → API Keys.")
    src = Path(audio_or_video)
    wav = str(settings.temp_dir / f"transcribe_{src.stem}.wav")
    ffmpeg.extract_audio(str(src), wav, sample_rate=16000)
    if job:
        job.progress = 40
        job.message = "Uploading to Groq…"
    with open(wav, "rb") as fh:
        resp = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (os.path.basename(wav), fh, "audio/wav")},
            data={"model": "whisper-large-v3", "response_format": "verbose_json"},
            timeout=300,
        )
    resp.raise_for_status()
    data = resp.json()
    rows = _segments_to_rows(data.get("segments", []))
    return {"engine": "groq", "language": data.get("language"),
            "segments": rows, "srt": build_srt(rows)}


def transcribe_gemini(
    audio_or_video: str,
    api_key: str,
    target_lang: str = "Khmer",
    model_name: str = "gemini-1.5-flash",
    job: Job | None = None,
) -> dict:
    """Cloud STT + translate via Gemini (ported from legacy GeminiTranscriptionWorker).

    Multi-key rotation (comma-separated), model fallback chain, 429/400/403 key
    skip, and 503 retry are preserved verbatim from the legacy worker.
    """
    api_keys = [k.strip() for k in (api_key or "").split(",") if k.strip()]
    if not api_keys:
        raise RuntimeError("No Gemini API key set. Add one in Settings → API Keys.")

    src = Path(audio_or_video)
    mp3 = str(settings.temp_dir / f"transcribe_{src.stem}.mp3")
    # Gemini inline_data here declares audio/mp3; encode to mp3 first.
    subprocess.run(
        [settings.ffmpeg, "-y", "-i", str(src), "-vn", "-ac", "1",
         "-ar", "16000", "-b:a", "64k", mp3],
        capture_output=True, creationflags=_NO_WINDOW,
    )
    if job:
        job.progress = 15
        job.message = "Encoding audio…"

    with open(mp3, "rb") as fh:
        audio_data = base64.b64encode(fh.read()).decode("utf-8")

    prompt = (
        "You are an expert audio transcriber and translator. "
        "Analyze the attached audio and transcribe/translate it into "
        f"{target_lang}. Return the output as a valid JSON object in this exact format: "
        '{"segments": [{"start": float, "end": float, "text": "string"}]}. '
        "Make sure start and end are absolute time in seconds (floats). "
        "Only output the JSON block, no markdown code block formatting (do not wrap in ```json), no intro, no outro."
    )
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "audio/mp3", "data": audio_data}},
            {"text": prompt},
        ]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    models = [model_name]
    for fb in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
        if fb not in models:
            models.append(fb)

    last_resp = None
    success = False
    for key_idx, current_key in enumerate(api_keys):
        if job:
            job.message = f"Trying API key {key_idx + 1}/{len(api_keys)}…"
        key_exhausted = False
        for idx, model in enumerate(models):
            if job:
                job.progress = min(85, 20 + idx * 20)
                job.message = f"Sending audio to Gemini ({model})…"
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={current_key}"
            )
            for _attempt in range(2):
                try:
                    resp = requests.post(url, json=body, timeout=120)
                    last_resp = resp
                    if resp.status_code == 200:
                        success = True
                        break
                    if resp.status_code in (429, 400, 403):
                        key_exhausted = True
                        break
                    if resp.status_code == 503:
                        time.sleep(2)
                        continue
                    break
                except Exception:
                    break
            if success or key_exhausted:
                break
        if success:
            break

    if not (success and last_resp is not None):
        detail = ""
        if last_resp is not None:
            try:
                detail = last_resp.json().get("error", {}).get("message", last_resp.text)
            except Exception:
                detail = last_resp.text
        raise RuntimeError(f"Gemini transcription failed: {detail or 'no response'}")

    if job:
        job.progress = 90
        job.message = "Processing Gemini response…"
    raw = last_resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    data = json.loads(raw)
    rows = _segments_to_rows(data.get("segments", []))
    return {"engine": "gemini", "language": target_lang,
            "segments": rows, "srt": build_srt(rows)}


def detect_silence_segments(
    video_path: str,
    silence_thresh: int = -35,
    min_silence: float = 0.4,
    min_speech: float = 0.3,
    max_seg: float = 8.0,
    job: Job | None = None,
) -> dict:
    """Split media into speech segments via FFmpeg silencedetect.

    Ported verbatim from the legacy SilenceDetectWorker (AI_Dubber_PyQt5_Complete
    .py:3719). Returns empty-text rows so the user can fill them in, mirroring
    the legacy "auto split by silence" tool.
    """
    if job:
        job.progress = 10
        job.message = "Analyzing audio for silence…"

    cmd = [
        settings.ffmpeg, "-i", video_path,
        "-af", f"silencedetect=noise={silence_thresh}dB:d={min_silence}",
        "-f", "null", "-",
    ]
    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW,
    )
    output = proc.stderr or ""

    if job:
        job.progress = 50
        job.message = "Processing silence data…"

    starts = [float(m) for m in re.findall(r"silence_start:\s*([\d.]+)", output)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*([\d.]+)", output)]

    dur_match = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", output)
    if dur_match:
        h, m, s = dur_match.groups()
        total_dur = int(h) * 3600 + int(m) * 60 + float(s)
    else:
        total_dur = 0

    if job:
        job.progress = 70
        job.message = "Building speech segments…"

    speech_starts = [0.0] + ends
    speech_ends = starts + ([total_dur] if total_dur > 0 else [])

    raw_segments = []
    for s_start, s_end in zip(speech_starts, speech_ends):
        if s_end - s_start >= min_speech:
            raw_segments.append((round(s_start, 3), round(s_end, 3)))

    segments = []
    for ss, se in raw_segments:
        dur = se - ss
        if dur <= max_seg:
            segments.append((ss, se))
        else:
            n_parts = int(dur // max_seg) + 1
            part_dur = dur / n_parts
            for p in range(n_parts):
                p_start = ss + p * part_dur
                p_end = min(ss + (p + 1) * part_dur, se)
                segments.append((round(p_start, 3), round(p_end, 3)))

    rows = [{"start": ss, "end": se, "text": ""} for ss, se in segments]
    if job:
        job.progress = 100
        job.message = f"Found {len(rows)} speech segments!"
    return {"engine": "silencedetect", "segments": rows, "srt": build_srt(rows)}


def batch_transcribe(
    videos: list[str],
    model_size: str = "base",
    use_gpu: bool = False,
    max_seg: float = 8.0,
    job: Job | None = None,
) -> dict:
    """Transcribe many videos, writing a .srt next to each.

    Ported from the legacy BatchSRTWorker (AI_Dubber_PyQt5_Complete.py:4398):
    extract audio -> faster-whisper subprocess -> split long segments -> .srt.
    """
    ok = fail = 0
    results = []
    total = len(videos) or 1
    device = "cuda" if use_gpu else "cpu"
    compute_type = "float16" if use_gpu else "int8"

    for idx, video_path in enumerate(videos):
        if job and job._cancel.is_set():
            return {"cancelled": True, "ok": ok, "fail": fail, "results": results}
        if job:
            job.progress = int((idx / total) * 100)
            job.message = f"[{idx + 1}/{total}] {os.path.basename(video_path)}"

        wav = str(settings.temp_dir / f"_bsrt_{idx}.wav")
        try:
            ffmpeg.extract_audio(video_path, wav, sample_rate=16000)
            cmd = [
                settings.worker_python, str(settings.transcribe_worker),
                wav, model_size, device, compute_type,
            ]
            proc = subprocess.run(
                cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                creationflags=_NO_WINDOW, env=_worker_env(),
            )
            json_line = next(
                (l.strip() for l in (proc.stdout or "").splitlines()
                 if l.strip().startswith("{")),
                "",
            )
            if not json_line:
                raise RuntimeError(f"No JSON from worker. stderr={proc.stderr[-300:]}")
            payload = json.loads(json_line)
            if not payload.get("success"):
                raise RuntimeError(payload.get("error", "Transcription error"))

            merged = []
            for seg in payload.get("segments", []):
                text = (seg.get("text") or "").strip()
                if not text:
                    continue
                dur = seg["end"] - seg["start"]
                if dur > max_seg:
                    n = max(1, int(dur // max_seg))
                    part = dur / n
                    for p in range(n):
                        merged.append({
                            "start": seg["start"] + p * part,
                            "end": seg["start"] + (p + 1) * part,
                            "text": text if p == 0 else "…",
                        })
                else:
                    merged.append({"start": seg["start"], "end": seg["end"], "text": text})

            srt_path = os.path.splitext(video_path)[0] + ".srt"
            with open(srt_path, "w", encoding="utf-8") as fh:
                fh.write(build_srt(_segments_to_rows(merged)))
            results.append({"video": video_path, "ok": True, "srt": srt_path,
                            "count": len(merged)})
            ok += 1
        except Exception as exc:  # noqa: BLE001
            results.append({"video": video_path, "ok": False, "error": str(exc)})
            fail += 1
        finally:
            try:
                os.remove(wav)
            except OSError:
                pass

    if job:
        job.progress = 100
        job.message = f"Done: {ok} ok, {fail} failed"
    return {"engine": "batch", "ok": ok, "fail": fail, "results": results}

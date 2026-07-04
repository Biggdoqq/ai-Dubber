"""Gameplay Recap service (TikTok-style recap generator).

Ports the core pipeline from the legacy standalone Gameplay_Recap_Tool.py:
  1. Transcribe the source video (reuses transcription_service faster-whisper).
  2. Generate a genre/duration-paced recap script via Gemini/Groq REST — the
     legacy _generate_recap prompt (Gameplay_Recap_Tool.py:84) is ported
     verbatim (≈110 wpm pacing, native-script enforcement, genre tone).
  3. Synthesize an edge-TTS voiceover of the script (reuses tts_service).
  4. Mux the voiceover onto the video, optionally hardsubbing the script.

Reuses existing services rather than the legacy moviepy/genai stack so it stays
dependency-light and consistent with the rest of the backend.
"""
from __future__ import annotations

import json
import os
import subprocess

import requests

from backend.config import settings
from backend.services import transcription_service, tts_service
from backend.utils import ffmpeg
from backend.utils.jobs import Job

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

GENRES = [
    "Gaming Highlights", "Movie/Anime Recap", "Horror/Ghost",
    "Funny/Vlog", "News/Drama",
]
DURATIONS = ["Short", "Medium", "Long", "Full Sync"]


def _build_recap_prompt(transcript: str, genre: str, duration: str,
                        target_language: str, vid_duration: float) -> str:
    """Verbatim port of the legacy _generate_recap prompt (pacing rules included)."""
    mins = int(vid_duration // 60)
    secs = int(vid_duration % 60)
    vid_length_str = f"{mins} minutes and {secs} seconds"
    word_limit = int((vid_duration / 60) * 110)  # ~110 wpm pacing

    if "Short" in duration:
        duration_rule = "- MUST fit in a 60-second short video! Keep spoken narration under 45 seconds."
    elif "Medium" in duration:
        duration_rule = "- Target length: 2 to 3 minutes of spoken narration. Provide a bit more detail and context."
    elif "Long" in duration:
        duration_rule = "- Target length: 5+ minutes of spoken narration. Be highly detailed, comprehensive, and tell a full engaging story."
    else:
        duration_rule = (
            f"- CRITICAL: The exact length of this video is {vid_length_str}. You MUST write exactly "
            f"around {word_limit} words so the voiceover finishes exactly when the video ends! "
            f"Do not write too much, otherwise the voice will continue after the video stops. "
            f"End the story naturally at the exact {vid_length_str} mark."
        )

    return (
        f"You are a viral creator and narrator specializing in {genre}.\n"
        f"Write a punchy and incredibly exciting recap script in {target_language}.\n\n"
        f"STYLE & RULES:\n"
        f"- Style: fast-paced, high energy, matching the {genre} genre.\n"
        f"{duration_rule}\n"
        f"- Focus ONLY on highlights and the most interesting/intense moments.\n"
        f"- Use appropriate slang/tone for {genre}.\n"
        f"- Start with a strong hook to grab attention!\n"
        f"- Do not include timestamps, brackets, or any markdown formatting. ONLY output the spoken script.\n"
        f"- CRITICAL: You MUST write the script using the native alphabet of {target_language}. "
        f"For example, if Khmer, you MUST use the Khmer Alphabet. DO NOT use Romanized/English letters.\n\n"
        f"Audio Transcript Context (if available):\n{transcript}"
    )


def _generate_script(prompt: str, groq_api_key: str, gemini_api_key: str,
                     groq_model: str, gemini_model: str) -> str:
    """Generate the recap script. Gemini first, then Groq (REST, no SDK)."""
    keys = [k.strip() for k in (gemini_api_key or "").split(",") if k.strip()]
    for key in keys:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
        try:
            resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=120)
            if resp.status_code == 200:
                return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            continue

    if groq_api_key:
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json={"model": groq_model,
                      "messages": [{"role": "user", "content": prompt}],
                      "temperature": 0.7, "max_tokens": 2048},
                headers={"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"},
                timeout=120,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            pass

    raise RuntimeError("Script generation failed (no working Gemini/Groq key).")


def generate_script(
    video_path: str,
    genre: str = "Gaming Highlights",
    duration: str = "Short",
    target_language: str = "Khmer",
    analysis_mode: str = "listen",
    groq_api_key: str = "",
    gemini_api_key: str = "",
    groq_model: str = "llama-3.3-70b-versatile",
    gemini_model: str = "gemini-1.5-flash",
    job: Job | None = None,
) -> dict:
    """Step 1: transcribe (if listening) then draft the recap script."""
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError("Source video not found.")

    vid_duration = ffmpeg.probe_duration(video_path)
    transcript = "No audio transcript available."
    if analysis_mode in ("listen", "watch_listen"):
        if job:
            job.progress = 20
            job.message = "Transcribing gameplay…"
        result = transcription_service.transcribe_offline(video_path, "base", use_gpu=False)
        transcript = " ".join(s["text"] for s in result.get("segments", [])).strip() or transcript

    if job:
        job.progress = 60
        job.message = "AI drafting the script…"
    prompt = _build_recap_prompt(transcript, genre, duration, target_language, vid_duration)
    script = _generate_script(prompt, groq_api_key, gemini_api_key, groq_model, gemini_model)

    if job:
        job.progress = 100
        job.message = "Script generated!"
    return {"script": script, "transcript": transcript, "video_duration": vid_duration}


def export_recap(
    video_path: str,
    script: str,
    output_path: str,
    voice: str = "km-KH-PisethNeural",
    burn_subtitles: bool = True,
    job: Job | None = None,
) -> dict:
    """Step 2: synthesize voiceover (edge-tts) and mux onto the video.

    Mirrors the legacy ExportVideoWorker continuous-voiceover path: original
    audio ducked low, AI voice on top, optional hardsubbed script.
    """
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError("Source video not found.")
    if not script.strip():
        raise RuntimeError("Script is empty.")

    temp_dir = settings.temp_dir / "recap"
    os.makedirs(temp_dir, exist_ok=True)

    if job:
        job.progress = 20
        job.message = "Generating voiceover…"
    voice_mp3 = str(temp_dir / "recap_voice.mp3")
    tts_service.generate_edge_tts(script, voice, speed=1.15, out_path=voice_mp3)

    if job:
        job.progress = 60
        job.message = "Mixing audio + muxing…"

    # Optional hardsub: write the whole script as one centered .ass line band.
    vf = "format=yuv420p"
    if burn_subtitles:
        srt_path = str(temp_dir / "recap.srt")
        dur = ffmpeg.probe_duration(voice_mp3) or 60.0
        with open(srt_path, "w", encoding="utf-8") as fh:
            fh.write(f"1\n00:00:00,000 --> {transcription_service.srt_seconds_to_time(dur)}\n{script.strip()}\n")
        sp = srt_path.replace("\\", "/").replace(":", "\\:")
        vf = f"subtitles='{sp}':force_style='Fontsize=18',format=yuv420p"

    # Original audio ducked to 0.1, AI voice at 1.5 (legacy mix levels).
    cmd = [
        settings.ffmpeg, "-y",
        "-i", video_path,
        "-i", voice_mp3,
        "-filter_complex",
        "[0:a]volume=0.1[orig];[1:a]volume=1.5[voice];[orig][voice]amix=inputs=2:duration=first[aout]",
        "-map", "0:v:0", "-map", "[aout]",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "256k",
        output_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", creationflags=_NO_WINDOW)
    if proc.returncode != 0 or not os.path.exists(output_path):
        # Retry without the original-audio mix (some inputs have no audio track).
        cmd_novid = [
            settings.ffmpeg, "-y", "-i", video_path, "-i", voice_mp3,
            "-map", "0:v:0", "-map", "1:a:0", "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-c:a", "aac", "-b:a", "256k", "-shortest", output_path,
        ]
        proc = subprocess.run(cmd_novid, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", creationflags=_NO_WINDOW)
        if proc.returncode != 0 or not os.path.exists(output_path):
            raise RuntimeError(f"Recap export failed: {(proc.stderr or '')[-400:]}")

    if job:
        job.progress = 100
        job.message = "Recap exported!"
    return {"output": output_path}

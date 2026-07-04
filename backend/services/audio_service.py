"""Audio processing service.

Ports two legacy audio capabilities onto the backend job model, reusing the
same external tools the legacy app relied on:

- Vocal removal via Demucs (mdx_extra, two-stems) run as a subprocess of the
  portable Python runtime — the legacy `remove_vocal_from_video`
  (AI_Dubber_PyQt5_Complete.py:10843). GPU/CPU auto-detected.
- Noise reduction via `noisereduce` with an FFmpeg `afftdn` fallback — the
  legacy `_apply_noise_reduction` (AI_Dubber_PyQt5_Complete.py:2028).

Demucs/torch are NOT imported in this process. Demucs runs through
`settings.worker_python` (the portable runtime), matching the legacy
subprocess-isolation strategy that avoids Windows CUDA/OpenMP DLL crashes.
"""
from __future__ import annotations

import glob
import logging
import os
import shutil
import subprocess
from pathlib import Path

from backend.config import settings
from backend.utils.jobs import Job

_log = logging.getLogger(__name__)
_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def _demucs_device() -> str:
    """Return 'cuda' if the worker runtime has CUDA, else 'cpu'.

    Probed in the worker runtime (not this process) so we never import torch here.
    """
    try:
        proc = subprocess.run(
            [settings.worker_python, "-c",
             "import torch,sys; sys.stdout.write('cuda' if torch.cuda.is_available() else 'cpu')"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=_NO_WINDOW, timeout=30,
        )
        out = (proc.stdout or "").strip()
        return "cuda" if out == "cuda" else "cpu"
    except Exception as exc:  # noqa: BLE001
        _log.debug("CUDA probe failed (defaulting to cpu): %s", exc)
        return "cpu"


def remove_vocals(
    video_path: str,
    output_path: str,
    use_gpu: bool = False,
    job: Job | None = None,
) -> dict:
    """Strip vocals from a video, muxing the instrumental back over the video.

    Verbatim pipeline from the legacy standalone vocal remover: extract 44.1k
    wav -> Demucs mdx_extra two-stems -> locate no_vocals.wav -> mux with the
    original video (copy video, AAC 320k audio).
    """
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError("Load a video first.")

    temp_dir = settings.temp_dir / "vocal_removal"
    shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        if job:
            job.progress = 10
            job.message = "Extracting audio…"
        raw_audio = str(temp_dir / "raw_audio.wav")
        subprocess.run(
            [settings.ffmpeg, "-y", "-i", video_path, "-vn",
             "-acodec", "pcm_s16le", "-ar", "44100", raw_audio],
            check=True, capture_output=True, creationflags=_NO_WINDOW,
        )

        device = "cuda" if (use_gpu and _demucs_device() == "cuda") else "cpu"
        if job:
            job.progress = 30
            job.message = f"Running Demucs ({device.upper()})…"

        env = dict(os.environ)
        bundled_models = settings.root / "demucs_models"
        if bundled_models.is_dir():
            env["TORCH_HOME"] = str(bundled_models)
            env["XDG_CACHE_HOME"] = str(bundled_models)

        demucs_args = [
            settings.worker_python, "-m", "demucs.separate",
            "-n", "mdx_extra",
            "--two-stems=vocals",
            "--float32",
            "--device", device,
            "-j", "1",
            "-o", str(temp_dir),
            raw_audio,
        ]
        proc = subprocess.run(
            demucs_args, env=env, capture_output=True, text=True,
            encoding="utf-8", errors="replace", creationflags=_NO_WINDOW,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Demucs failed:\n{(proc.stderr or '')[-400:]}")

        if job:
            job.progress = 70
            job.message = "Locating instrumental track…"
        candidates = glob.glob(str(temp_dir / "**" / "no_vocals.wav"), recursive=True)
        if not candidates:
            raise RuntimeError("no_vocals.wav not found.")

        if job:
            job.progress = 85
            job.message = "Muxing video…"
        subprocess.run(
            [settings.ffmpeg, "-y",
             "-i", video_path, "-i", candidates[0],
             "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "copy",
             "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
             "-shortest", output_path],
            check=True, capture_output=True, creationflags=_NO_WINDOW,
        )
        if job:
            job.progress = 100
            job.message = "Vocals removed!"
        return {"output": output_path, "device": device}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def reduce_noise(input_path: str, output_path: str, job: Job | None = None) -> dict:
    """Denoise an audio/video's audio track.

    Tries `noisereduce` (best quality) then FFmpeg `afftdn` fallback — same
    two-tier strategy as the legacy `_apply_noise_reduction`. Operates on the
    file's audio and writes a cleaned WAV.
    """
    if not input_path or not os.path.exists(input_path):
        raise RuntimeError("Input file not found.")

    temp_dir = settings.temp_dir / "noise_reduction"
    temp_dir.mkdir(parents=True, exist_ok=True)
    nr_in = str(temp_dir / "nr_input.wav")

    if job:
        job.progress = 20
        job.message = "Extracting audio…"
    subprocess.run(
        [settings.ffmpeg, "-y", "-i", input_path, "-vn",
         "-acodec", "pcm_s16le", nr_in],
        check=True, capture_output=True, creationflags=_NO_WINDOW,
    )

    # Method 1: noisereduce library (best quality).
    try:
        import numpy as np
        import noisereduce as nr
        from pydub import AudioSegment
        AudioSegment.converter = settings.ffmpeg

        if job:
            job.progress = 50
            job.message = "Denoising (noisereduce)…"
        seg = AudioSegment.from_wav(nr_in)
        sr = seg.frame_rate
        channels = seg.channels
        max_val = float(2 ** (seg.sample_width * 8 - 1))
        raw = np.array(seg.get_array_of_samples(), dtype=np.float32) / max_val

        if channels == 2:
            stereo = raw.reshape(-1, 2).T
            left = nr.reduce_noise(y=stereo[0], sr=sr, prop_decrease=0.75, stationary=False)
            right = nr.reduce_noise(y=stereo[1], sr=sr, prop_decrease=0.75, stationary=False)
            cleaned = np.stack([left, right], axis=1).flatten()
        else:
            cleaned = nr.reduce_noise(y=raw, sr=sr, prop_decrease=0.75, stationary=False)

        cleaned_int = (cleaned * max_val).astype(np.int16)
        seg._spawn(cleaned_int.tobytes()).export(
            output_path, format="wav", parameters=["-acodec", "pcm_s16le"])
        if job:
            job.progress = 100
            job.message = "Noise reduction complete (noisereduce)."
        return {"output": output_path, "method": "noisereduce"}
    except Exception:
        pass

    # Method 2: FFmpeg afftdn (built-in fallback).
    if job:
        job.progress = 60
        job.message = "Denoising (FFmpeg afftdn)…"
    proc = subprocess.run(
        [settings.ffmpeg, "-y", "-i", nr_in,
         "-af", "afftdn=nf=-25:nr=30:nt=w",
         "-acodec", "pcm_s16le", output_path],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Noise reduction failed: {(proc.stderr or '')[-400:]}")
    if job:
        job.progress = 100
        job.message = "Noise reduction complete (afftdn)."
    return {"output": output_path, "method": "afftdn"}


# Speech-clarity chain (single FFmpeg pass): remove rumble, tame hiss, cut
# low-mid mud, lift presence ~3 kHz, even out dynamics, then loudness-normalize.
_ENHANCE_FILTER = (
    "highpass=f=90,"
    "lowpass=f=9000,"
    "equalizer=f=250:width_type=o:width=1.5:g=-3,"
    "equalizer=f=3000:width_type=o:width=1.5:g=4,"
    "acompressor=threshold=-18dB:ratio=3:attack=20:release=250,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)

# Duration-preserving, sample-rate-safe audio effects (kept A/V-sync-safe by
# avoiding tempo/pitch changes that would desync a copied video stream).
AUDIO_EFFECTS: dict[str, str] = {
    "Bass Boost": "bass=g=10",
    "Treble Boost": "treble=g=8",
    "Vocal Clarity": "equalizer=f=3000:width_type=o:width=2:g=5",
    "Warmth": "equalizer=f=200:width_type=o:width=1.5:g=4",
    "Echo": "aecho=0.8:0.9:1000:0.3",
    "Reverb (Hall)": "aecho=0.8:0.9:40|55|70:0.4|0.3|0.2",
    "Reverb (Medium)": "aecho=0.8:0.88:25|35|45:0.3|0.25|0.15",
    "Compressor": "aconvert,acompressor=threshold=-20dB:ratio=4:attack=20:release=100",
    "Telephone": "highpass=f=300,lowpass=f=3400",
    "Loudness Normalize": "loudnorm=I=-16:TP=-1.5:LRA=11",
    "Stereo Widen": "extrastereo",
    "Tremolo": "tremolo=f=5:d=0.7",
}


def _run_audio_filter(
    input_path: str,
    output_path: str,
    afilter: str,
    label: str,
    job: Job | None = None,
) -> dict:
    """Apply an FFmpeg `-af` chain, preserving any video stream (-c:v copy).

    Single-pass; matches the subprocess pattern used by reduce_noise. Works for
    both video (audio filtered, video copied) and audio-only inputs.
    """
    if not input_path or not os.path.exists(input_path):
        raise RuntimeError("Input file not found.")

    if job:
        job.progress = 15
        job.message = f"{label}…"

    proc = subprocess.run(
        [settings.ffmpeg, "-y", "-i", input_path,
         "-af", afilter,
         "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
         output_path],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW,
    )
    if proc.returncode != 0 or not os.path.exists(output_path):
        raise RuntimeError(f"{label} failed: {(proc.stderr or '')[-400:]}")
    if job:
        job.progress = 100
        job.message = f"{label} complete."
    return {"output": output_path}


def enhance_voice(input_path: str, output_path: str, job: Job | None = None) -> dict:
    """Enhance speech clarity via a fixed FFmpeg filter chain (video preserved)."""
    return _run_audio_filter(input_path, output_path, _ENHANCE_FILTER, "Enhancing voice", job)


def mix_background_audio(
    video_path: str,
    bg_audio_path: str,
    output_path: str,
    bg_volume: float = 30.0,
    main_volume: float = 100.0,
    loop_bg: bool = True,
    job: Job | None = None,
) -> dict:
    """Mix a background audio track under the video's existing audio.

    Reuses the legacy amix strategy (AI_Dubber_PyQt5_Complete.py:1691):
    amix=inputs=2:duration=first:normalize=0 with per-input volume factors, then
    aresample/aformat to a stereo 48k output. The video stream is copied. The
    background is looped to cover the whole video when loop_bg is set.
    """
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError("Load a video first.")
    if not bg_audio_path or not os.path.exists(bg_audio_path):
        raise RuntimeError("Background audio file not found.")

    if job:
        job.progress = 15
        job.message = "Mixing background audio…"

    main_f = max(0.0, main_volume / 100.0)
    bg_f = max(0.0, bg_volume / 100.0)
    filter_complex = (
        f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"volume={main_f:.2f}[main];"
        f"[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"volume={bg_f:.2f}[bg];"
        f"[main][bg]amix=inputs=2:duration=first:normalize=0,"
        f"aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]"
    )

    cmd = [settings.ffmpeg, "-y", "-i", video_path]
    if loop_bg:
        cmd += ["-stream_loop", "-1", "-i", bg_audio_path]
    else:
        cmd += ["-i", bg_audio_path]
    cmd += [
        "-filter_complex", filter_complex,
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
        "-shortest", output_path,
    ]

    proc = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW,
    )
    if proc.returncode != 0 or not os.path.exists(output_path):
        raise RuntimeError(f"Background mix failed: {(proc.stderr or '')[-400:]}")
    if job:
        job.progress = 100
        job.message = "Background audio mixed."
    return {"output": output_path}


def list_audio_effects() -> dict:
    return {"effects": list(AUDIO_EFFECTS.keys())}


def apply_audio_effect(
    input_path: str, output_path: str, effect_name: str, job: Job | None = None
) -> dict:
    """Apply one named audio effect from AUDIO_EFFECTS (video preserved)."""
    afilter = AUDIO_EFFECTS.get(effect_name)
    if not afilter:
        raise RuntimeError(f"Unknown audio effect: {effect_name}")
    return _run_audio_filter(input_path, output_path, afilter, f"Applying {effect_name}", job)


# Inline librosa analyzer (ported from _analyze_audio_pitch_for_row:8062). Run in
# the worker python so librosa/numpy stay out of the API process. Returns one
# gender label per row window via JSON on stdout.
_GENDER_SCRIPT = r"""
import json, sys
import numpy as np
import librosa

audio = sys.argv[1]
rows = json.loads(sys.argv[2])  # [{start,end}]
MALE_MAX, FEMALE_MIN = 155, 185
out = []
for r in rows:
    start = float(r["start"]); end = float(r["end"]); dur = end - start
    label = "Unknown"
    if dur > 0.1:
        try:
            y, sr = librosa.load(audio, sr=16000, offset=start, duration=dur)
            if len(y) and float(np.sqrt(np.mean(y ** 2))) >= 0.01:
                try:
                    y_harm, _ = librosa.effects.hpss(y)
                except Exception:
                    y_harm = y
                f0 = librosa.yin(y_harm, fmin=70, fmax=350, sr=sr)
                f0v = f0[(f0 > 70) & (f0 < 350)]
                if len(f0v) >= 3:
                    median = float(np.median(f0v))
                    p25 = float(np.percentile(f0v, 25))
                    avg = median * 0.6 + p25 * 0.4
                    if avg < MALE_MAX:
                        label = "Male"
                    elif avg > FEMALE_MIN:
                        label = "Female"
        except Exception:
            pass
    out.append(label)
print(json.dumps({"genders": out}))
"""


def analyze_gender(audio_path: str, rows: list[dict], job: Job | None = None) -> dict:
    """Per-row gender from original audio pitch (librosa yin + HPSS).

    Ported verbatim from the legacy _analyze_audio_pitch_for_row (weighted
    median/p25, <155 Hz male, >185 Hz female, 155-185 uncertain). rows:
    [{start,end}] in seconds. Runs librosa in the worker python.
    """
    if not audio_path or not os.path.exists(audio_path):
        raise RuntimeError("Audio/video file not found.")

    # Ensure we feed a decodable wav (handles video input too).
    wav = str(settings.temp_dir / "gender_src.wav")
    subprocess.run(
        [settings.ffmpeg, "-y", "-i", audio_path, "-vn", "-ac", "1",
         "-ar", "16000", "-acodec", "pcm_s16le", wav],
        capture_output=True, creationflags=_NO_WINDOW,
    )
    if job:
        job.progress = 30
        job.message = "Analyzing pitch…"

    import json as _json
    proc = subprocess.run(
        [settings.worker_python, "-c", _GENDER_SCRIPT, wav, _json.dumps(rows)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=_NO_WINDOW,
    )
    out = (proc.stdout or "").strip().splitlines()
    for line in reversed(out):
        line = line.strip()
        if line.startswith("{"):
            try:
                data = _json.loads(line)
                if job:
                    job.progress = 100
                    job.message = "Gender analysis complete"
                return {"genders": data.get("genders", [])}
            except Exception:
                continue
    raise RuntimeError(f"Gender analysis failed: {(proc.stderr or '')[-300:]}")

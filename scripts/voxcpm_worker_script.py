"""
voxcpm_worker_script.py
=======================
Standalone subprocess worker for VoxCPM TTS.
Called by AI_Dubber_PyQt5_Complete.py via subprocess so that the heavy
VoxCPM / torch model runs in a SEPARATE process (like Demucs / Whisper).

Usage (internal):
    python voxcpm_worker_script.py \
        --text      "ជំរាបសួរ ..." \
        --voice     "female_km" \
        --speed     "1.2" \
        --output    "/tmp/clip_0.mp3" \
        [--ref_wav  "path/to/reference.wav"]

Output (stdout):
    JSON  {"success": true,  "output": "path/to/clip_0.mp3"}
    JSON  {"success": false, "error": "...message..."}
"""

import sys
import os
import json
import argparse
import traceback

# --- Path Injection: Prioritize Lib/site-packages to avoid PyInstaller shadowing ---
_exe_dir = os.path.dirname(sys.executable)
_sp_path = os.path.join(_exe_dir, "Lib", "site-packages")
if os.path.isdir(_sp_path):
    if _sp_path not in sys.path:
        sys.path.insert(0, _sp_path)

# ── Fix OpenMP / DLL conflicts ─────────────────────────────────────────────
os.environ['KMP_DUPLICATE_LIB_OK'] = 'True'


def _dll_inject():
    """Inject torch lib path into DLL search path (Windows)."""
    if sys.platform != 'win32':
        return
    try:
        import torch
        t_lib = os.path.join(os.path.dirname(torch.__file__), 'lib')
        if os.path.isdir(t_lib):
            if hasattr(os, 'add_dll_directory'):
                os.add_dll_directory(t_lib)
            os.environ['PATH'] = t_lib + os.pathsep + os.environ.get('PATH', '')

        # Also add bundled bin (FFmpeg DLLs)
        for _bin in [
            os.path.join(os.path.dirname(sys.executable), 'bin'),
            os.path.join(getattr(sys, '_MEIPASS', '.'), 'bin'),
        ]:
            if os.path.isdir(_bin):
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(_bin)
                os.environ['PATH'] = _bin + os.pathsep + os.environ.get('PATH', '')
    except Exception:
        pass


def _build_voice_prompt(voice: str) -> str:
    """Return VoxCPM creative voice-design prefix based on voice label."""
    v = voice.lower()
    if 'male' in v or 'ប្រុស' in voice or 'piseth' in v:
        return "(A confident Cambodian man's voice speaking Khmer)"
    elif 'english' in v or 'jenny' in v or 'us' in v:
        return "(A clear and natural American female voice)"
    else:
        # Default: warm Khmer female
        return "(A gentle and warm Cambodian woman's voice speaking Khmer)"


def _strip_speaker_tag(text: str) -> str:
    """Remove [ប្រុស]:, (ស្រី)៖ … prefixes so they are not spoken."""
    import re
    clean = re.sub(
        r'^[\[\(\{]?(ប្រុស|ស្រី|លោក|នាង|Male|Female|Man|Woman)'
        r'[\]\)\}]?[\s]*[:៖\-]?[\s]*',
        '', text, flags=re.IGNORECASE
    ).strip()
    return clean or text


def _apply_speed_ffmpeg(wav_in: str, mp3_out: str, speed: float):
    """Convert WAV → MP3 and apply atempo speed filter via FFmpeg."""
    import subprocess as _sp

    speed = max(0.5, min(2.0, speed))

    # Build atempo chain (atempo is clamped to 0.5–2.0 per filter)
    chain = []
    tmp = speed
    while tmp > 2.0:
        chain.append('atempo=2.0')
        tmp /= 2.0
    while tmp < 0.5:
        chain.append('atempo=0.5')
        tmp /= 0.5
    chain.append(f'atempo={tmp:.4f}')
    filter_str = ','.join(chain)

    cmd = [
        'ffmpeg', '-y', '-i', wav_in,
        '-filter:a', filter_str,
        '-ar', '44100', '-ab', '192k',
        mp3_out,
    ]
    flags = _sp.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    _sp.run(cmd, capture_output=True, creationflags=flags)


def main():
    parser = argparse.ArgumentParser(description='VoxCPM TTS Worker')
    parser.add_argument('--text',    required=True,  help='Text to synthesise')
    parser.add_argument('--voice',   required=True,  help='Voice label')
    parser.add_argument('--speed',   required=True,  help='Speed multiplier (float)')
    parser.add_argument('--output',  required=True,  help='Output file path (.mp3 or .wav)')
    parser.add_argument('--ref_wav', default='',     help='Optional reference WAV for voice cloning')
    args = parser.parse_args()

    # ── DLL injection (Windows) ────────────────────────────────────────────
    _dll_inject()

    try:
        import soundfile as sf
    except ImportError:
        print(json.dumps({
            'success': False,
            'error': 'soundfile not installed. Run: pip install soundfile'
        }))
        sys.exit(1)

    try:
        from voxcpm import VoxCPM
    except ImportError:
        print(json.dumps({
            'success': False,
            'error': 'voxcpm not installed. Run: pip install voxcpm soundfile'
        }))
        sys.exit(1)

    # ── Prepare text ───────────────────────────────────────────────────────
    clean_text = _strip_speaker_tag(args.text)
    prompt_prefix = _build_voice_prompt(args.voice)
    synthesis_text = f"{prompt_prefix}{clean_text}"

    try:
        speed = float(args.speed)
    except ValueError:
        speed = 1.0

    # ── Load model ─────────────────────────────────────────────────────────
    # Each subprocess call loads the model fresh.
    # The CALLER (main app) manages a persistent subprocess to avoid
    # repeated loading — but for simplicity we load here.
    try:
        model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False)
    except Exception as e:
        print(json.dumps({'success': False, 'error': f'Model load failed: {e}'}))
        sys.exit(1)

    # ── Synthesize ─────────────────────────────────────────────────────────
    try:
        gen_kwargs = {'text': synthesis_text}
        if args.ref_wav and os.path.isfile(args.ref_wav):
            gen_kwargs['reference_wav_path'] = args.ref_wav

        wav = model.generate(**gen_kwargs)

        import tempfile
        wav_tmp = tempfile.mktemp(suffix='.wav')
        sf.write(wav_tmp, wav, samplerate=48000)

        output = args.output
        if output.lower().endswith('.mp3'):
            _apply_speed_ffmpeg(wav_tmp, output, speed)
            try:
                os.remove(wav_tmp)
            except Exception:
                pass
        else:
            # WAV output — copy with speed applied via sox or just rename
            os.replace(wav_tmp, output)

        if not os.path.exists(output) or os.path.getsize(output) == 0:
            raise RuntimeError('Output file is empty or missing after synthesis')

        print(json.dumps({'success': True, 'output': output}))

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e) + '\n' + traceback.format_exc()}))
        sys.exit(1)


if __name__ == '__main__':
    main()

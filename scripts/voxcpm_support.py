# -*- coding: utf-8 -*-
import os
import sys
import json
import tempfile
import threading
import subprocess
import shutil
import importlib.util
import hashlib
import random
import re

try:
    from runtime_paths import get_app_dir, resolve_binary_path
except ImportError:
    def get_app_dir():
        if getattr(sys, 'frozen', False):
            return os.path.dirname(sys.executable)
        return os.path.dirname(os.path.abspath(__file__))

    def resolve_binary_path(binary_name):
        return binary_name


VOXCPM_VOICE_PREFIX = "voxcpm2:"

VOXCPM_KHMER_FEMALE_PROMPT = (
    "adult Khmer female speaker, beautiful pleasant feminine woman voice, warm smooth tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality, gentle and expressive"
)
VOXCPM_KHMER_MALE_PROMPT = (
    "adult Khmer male speaker, handsome pleasant masculine man voice, warm smooth deeper tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality, confident and expressive"
)
VOXCPM_KHMER_GIRL_PROMPT = (
    "young Khmer female child speaker, cute pleasant girl voice, bright smooth feminine child tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality"
)
VOXCPM_KHMER_BOY_PROMPT = (
    "young Khmer male child speaker, cute pleasant boy voice, bright smooth masculine child tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality"
)
VOXCPM_KHMER_OLD_WOMAN_PROMPT = (
    "elderly Khmer female speaker, pleasant old woman voice, warm mature feminine tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality, gentle and expressive"
)
VOXCPM_KHMER_OLD_MAN_PROMPT = (
    "elderly Khmer male speaker, pleasant old man voice, warm mature deeper masculine tone, "
    "clear natural Cambodian Khmer pronunciation, studio quality, calm and expressive"
)

# --- GAME VOICE OVER STYLES (MLBB STYLE) ---
VOXCPM_GAME_HERO_MALE_PROMPT = (
    "adult Khmer male speaker, EPIC HERO voice, powerful intense masculine tone, "
    "deep resonant voice, clear natural Cambodian Khmer pronunciation, "
    "Moba game style, brave and commanding, studio quality"
)
VOXCPM_GAME_HERO_FEMALE_PROMPT = (
    "adult Khmer female speaker, POWERFUL HEROINE voice, sharp elegant feminine tone, "
    "commanding and confident, clear natural Cambodian Khmer pronunciation, "
    "Moba game style, epic and expressive, studio quality"
)
VOXCPM_GAME_ANNOUNCER_PROMPT = (
    "professional Khmer speaker, GAME ANNOUNCER style, high energy, "
    "very clear loud voice, authoritative tone, natural Cambodian Khmer pronunciation, "
    "studio quality, epic moba feel"
)
VOXCPM_GAME_ASSASSIN_PROMPT = (
    "Khmer speaker, MYSTERIOUS ASSASSIN style, quiet dark cool voice, "
    "slightly whispery and sharp, fast but clear Cambodian Khmer pronunciation, "
    "stealthy and dangerous, studio quality"
)

VOXCPM_PROMPT_PRESETS = {
    "female": [
        (
            "តួឯកស្រី - រឿងខ្មែរ",
            "adult Khmer female speaker, beautiful sweet heroine voice, warm smooth feminine tone, "
            "natural Cambodian Khmer pronunciation, romantic Khmer drama style, emotional but clean, studio quality",
        ),
        (
            "តួឯកស្រី - រឿងចិន",
            "adult Khmer female speaker, elegant Chinese historical drama dubbing style, graceful sweet feminine voice, "
            "soft emotional delivery, clear natural Cambodian Khmer pronunciation, cinematic studio quality",
        ),
        (
            "តួរងស្រី",
            "adult Khmer female supporting character, natural friendly woman voice, warm clear feminine tone, "
            "realistic Cambodian Khmer pronunciation, expressive drama delivery, studio quality",
        ),
        (
            "តួចិត្តអាក្រក់ស្រី",
            "adult Khmer female villain character, elegant but cold feminine voice, sharp confident tone, "
            "dramatic Cambodian Khmer pronunciation, controlled intense emotion, cinematic studio quality",
        ),
        (
            "តួអ្នកជិតខាងស្រី",
            "adult Khmer female neighbor character, natural everyday woman voice, lively conversational tone, "
            "clear Cambodian Khmer pronunciation, friendly local drama style, studio quality",
        ),
        (
            "តួកំសត់ស្រី",
            "adult Khmer female tragic character, soft sad feminine voice, trembling emotional tone, "
            "clear natural Cambodian Khmer pronunciation, heartfelt Khmer drama style, studio quality",
        ),
    ],
    "male": [
        (
            "តួឯកប្រុស - រឿងខ្មែរ",
            "adult Khmer male speaker, handsome hero voice, warm smooth deeper masculine tone, "
            "natural Cambodian Khmer pronunciation, romantic Khmer drama style, confident emotional delivery, studio quality",
        ),
        (
            "តួឯកប្រុស - រឿងចិន",
            "adult Khmer male speaker, elegant Chinese historical drama dubbing style, noble calm masculine voice, "
            "deep warm tone, clear natural Cambodian Khmer pronunciation, cinematic studio quality",
        ),
        (
            "តួរងប្រុស",
            "adult Khmer male supporting character, natural friendly man voice, warm clear masculine tone, "
            "realistic Cambodian Khmer pronunciation, expressive drama delivery, studio quality",
        ),
        (
            "តួចិត្តអាក្រក់ប្រុស",
            "adult Khmer male villain character, cold confident masculine voice, deep sharp tone, "
            "dramatic Cambodian Khmer pronunciation, controlled intense emotion, cinematic studio quality",
        ),
        (
            "តួអ្នកជិតខាងប្រុស",
            "adult Khmer male neighbor character, natural everyday man voice, lively conversational tone, "
            "clear Cambodian Khmer pronunciation, friendly local drama style, studio quality",
        ),
        (
            "តួកំសត់ប្រុស",
            "adult Khmer male tragic character, soft sad masculine voice, heavy emotional tone, "
            "clear natural Cambodian Khmer pronunciation, heartfelt Khmer drama style, studio quality",
        ),
    ],
    "girl": [
        (
            "តួឯកក្មេងស្រី",
            "young Khmer female child speaker, cute sweet girl voice, bright smooth child tone, "
            "natural Cambodian Khmer pronunciation, gentle Khmer drama emotion, studio quality",
        ),
        (
            "ក្មេងស្រី - រឿងចិន",
            "young Khmer female child speaker, cute graceful Chinese drama dubbing style, "
            "bright sweet feminine child voice, clear natural Cambodian Khmer pronunciation, studio quality",
        ),
        (
            "តួរងក្មេងស្រី",
            "young Khmer female child supporting character, cute natural girl voice, friendly bright tone, "
            "clear Cambodian Khmer pronunciation, lively drama delivery, studio quality",
        ),
        (
            "តួក្មេងស្រីចិត្តអាក្រក់",
            "young Khmer female child character with mischievous villain style, sharp cute girl voice, "
            "clear Cambodian Khmer pronunciation, playful dramatic emotion, studio quality",
        ),
        (
            "តួកំសត់ក្មេងស្រី",
            "young Khmer female child tragic character, soft sad cute girl voice, emotional gentle tone, "
            "clear Cambodian Khmer pronunciation, heartfelt drama style, studio quality",
        ),
    ],
    "boy": [
        (
            "តួឯកក្មេងប្រុស",
            "young Khmer male child speaker, cute bright boy voice, smooth masculine child tone, "
            "natural Cambodian Khmer pronunciation, lively Khmer drama emotion, studio quality",
        ),
        (
            "ក្មេងប្រុស - រឿងចិន",
            "young Khmer male child speaker, brave cute Chinese drama dubbing style, "
            "bright clean masculine child voice, clear natural Cambodian Khmer pronunciation, studio quality",
        ),
        (
            "តួរងក្មេងប្រុស",
            "young Khmer male child supporting character, cute natural boy voice, friendly bright tone, "
            "clear Cambodian Khmer pronunciation, lively drama delivery, studio quality",
        ),
        (
            "តួក្មេងប្រុសចិត្តអាក្រក់",
            "young Khmer male child character with mischievous villain style, sharp cute boy voice, "
            "clear Cambodian Khmer pronunciation, playful dramatic emotion, studio quality",
        ),
        (
            "តួកំសត់ក្មេងប្រុស",
            "young Khmer male child tragic character, soft sad cute boy voice, emotional gentle tone, "
            "clear Cambodian Khmer pronunciation, heartfelt drama style, studio quality",
        ),
    ],
    "old_woman": [
        (
            "តួចាស់ស្រី - រឿងខ្មែរ",
            "elderly Khmer female speaker, warm wise old woman voice, gentle mature feminine tone, "
            "natural Cambodian Khmer pronunciation, emotional Khmer drama style, studio quality",
        ),
        (
            "តួចាស់ស្រី - រឿងចិន",
            "elderly Khmer female speaker, graceful Chinese drama elder woman dubbing style, "
            "warm mature feminine voice, clear natural Cambodian Khmer pronunciation, cinematic studio quality",
        ),
        (
            "តួចាស់ស្រីចិត្តអាក្រក់",
            "elderly Khmer female villain character, cold sharp old woman voice, mature intense feminine tone, "
            "clear Cambodian Khmer pronunciation, dramatic cinematic style, studio quality",
        ),
        (
            "តួអ្នកជិតខាងចាស់ស្រី",
            "elderly Khmer female neighbor character, natural local old woman voice, warm conversational tone, "
            "clear Cambodian Khmer pronunciation, village drama style, studio quality",
        ),
        (
            "តួកំសត់ចាស់ស្រី",
            "elderly Khmer female tragic character, soft sad old woman voice, fragile emotional tone, "
            "clear natural Cambodian Khmer pronunciation, heartfelt Khmer drama style, studio quality",
        ),
    ],
    "old_man": [
        (
            "តួចាស់ប្រុស - រឿងខ្មែរ",
            "elderly Khmer male speaker, wise warm old man voice, calm mature deeper masculine tone, "
            "natural Cambodian Khmer pronunciation, emotional Khmer drama style, studio quality",
        ),
        (
            "តួចាស់ប្រុស - រឿងចិន",
            "elderly Khmer male speaker, noble Chinese drama elder man dubbing style, "
            "deep calm mature masculine voice, clear natural Cambodian Khmer pronunciation, cinematic studio quality",
        ),
        (
            "តួចាស់ប្រុសចិត្តអាក្រក់",
            "elderly Khmer male villain character, cold deep old man voice, stern intense masculine tone, "
            "clear Cambodian Khmer pronunciation, dramatic cinematic style, studio quality",
        ),
        (
            "តួអ្នកជិតខាងចាស់ប្រុស",
            "elderly Khmer male neighbor character, natural local old man voice, warm conversational tone, "
            "clear Cambodian Khmer pronunciation, village drama style, studio quality",
        ),
        (
            "តួកំសត់ចាស់ប្រុស",
            "elderly Khmer male tragic character, soft sad old man voice, heavy emotional tone, "
            "clear natural Cambodian Khmer pronunciation, heartfelt Khmer drama style, studio quality",
        ),
    ],
    "tiktok": [
        (
            "អ្នកពោលរឿង TikTok (ប្រុស) 📱",
            "young adult Khmer male speaker, TikTok storyteller voice, energetic fast-paced enthusiastic tone, "
            "clear natural Cambodian Khmer pronunciation, engaging and lively social media style, studio quality",
        ),
        (
            "អ្នកពោលរឿង TikTok (ស្រី) 📱",
            "young adult Khmer female speaker, TikTok storyteller voice, bright cheerful enthusiastic feminine tone, "
            "clear natural Cambodian Khmer pronunciation, engaging and lively social media style, studio quality",
        ),
        (
            "អ្នក Review កុន/រឿង (ប្រុស) 🎬",
            "young adult Khmer male speaker, movie reviewer voice, deep thrilling masculine tone, "
            "clear fast Cambodian Khmer pronunciation, dramatic TikTok review style, studio quality",
        ),
        (
            "អ្នក Review តុក្កតា/កុន (ស្រី) 🎬",
            "young adult Khmer female speaker, movie reviewer voice, suspenseful exciting feminine tone, "
            "clear fast Cambodian Khmer pronunciation, dramatic TikTok review style, studio quality",
        ),
        (
            "អ្នក Review Game (ប្រុស) 🎮",
            "young adult Khmer male speaker, gaming streamer voice, highly energetic fast-paced enthusiastic tone, "
            "clear fast Cambodian Khmer pronunciation, intense TikTok gaming review style, studio quality",
        ),
        (
            "អ្នក Review Game (ស្រី) 🎮",
            "young adult Khmer female speaker, gaming streamer voice, highly energetic fast-paced enthusiastic feminine tone, "
            "clear fast Cambodian Khmer pronunciation, playful TikTok gaming review style, studio quality",
        ),
    ],
}

VOXCPM_VOICE_OPTIONS = [
    ("ស្រី ខ្មែរ (Female)", f"voxcpm2:{VOXCPM_KHMER_FEMALE_PROMPT}"),
    ("ប្រុស ខ្មែរ (Male)", f"voxcpm2:{VOXCPM_KHMER_MALE_PROMPT}"),
    ("ក្មេងស្រី (Girl)", f"voxcpm2:{VOXCPM_KHMER_GIRL_PROMPT}"),
    ("ក្មេងប្រុស (Boy)", f"voxcpm2:{VOXCPM_KHMER_BOY_PROMPT}"),
    ("មនុស្សស្រីចាស់ (Old Woman)", f"voxcpm2:{VOXCPM_KHMER_OLD_WOMAN_PROMPT}"),
    ("មនុស្សប្រុសចាស់ (Old Man)", f"voxcpm2:{VOXCPM_KHMER_OLD_MAN_PROMPT}"),
    ("តួឯកប្រុស (Hero Male) 🎮", f"voxcpm2:{VOXCPM_GAME_HERO_MALE_PROMPT}"),
    ("តួឯកស្រី (Hero Female) 🎮", f"voxcpm2:{VOXCPM_GAME_HERO_FEMALE_PROMPT}"),
    ("អ្នកពោល (Announcer) 🎮", f"voxcpm2:{VOXCPM_GAME_ANNOUNCER_PROMPT}"),
    ("បែបអាថ៌កំបាំង (Assassin) 🎮", f"voxcpm2:{VOXCPM_GAME_ASSASSIN_PROMPT}"),
]

# Add all detailed character presets to the UI options
for _category, _presets in VOXCPM_PROMPT_PRESETS.items():
    for _label, _prompt in _presets:
        VOXCPM_VOICE_OPTIONS.append((f"» {_label}", f"voxcpm2:{_prompt}"))


_MODEL = None
_MODEL_KEY = None
_MODEL_LOCK = threading.Lock()
_PYTHON_CUDA_CACHE = {}
_LAST_SOURCE_DIR_CANDIDATES = []
_VOXCPM_SEED_STYLE_TOKENS = {
    "angry",
    "intense",
    "firm",
    "sharp",
    "emotional",
    "happy",
    "cheerful",
    "bright",
    "energetic",
    "smiling tone",
    "sad",
    "soft",
    "slightly slow",
    "gentle",
    "warm",
    "calm",
    "tender",
    "steady",
    "relaxed",
    "natural",
    "clear",
    "confident",
    "sweet",
    "slightly deep",
    "beautiful",
    "pleasant",
    "handsome",
    "smooth",
    "deeper tone",
    "studio quality",
    "expressive",
    "cute",
    "mature",
}


def _get_ffmpeg_path():
    resolved = resolve_binary_path("ffmpeg.exe")
    if resolved != "ffmpeg.exe":
        return resolved
    local_ffmpeg = os.path.join(get_app_dir(), "ffmpeg.exe")
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
    return "ffmpeg"


def is_voxcpm_voice(voice_id):
    return str(voice_id or "").strip().lower().startswith(VOXCPM_VOICE_PREFIX)


def _canonicalize_voxcpm_control(control):
    text = str(control or "").strip()
    lowered = text.lower()
    if not lowered:
        return ""

    known_prompts = {
        VOXCPM_KHMER_FEMALE_PROMPT.lower(): VOXCPM_KHMER_FEMALE_PROMPT,
        VOXCPM_KHMER_MALE_PROMPT.lower(): VOXCPM_KHMER_MALE_PROMPT,
        VOXCPM_KHMER_GIRL_PROMPT.lower(): VOXCPM_KHMER_GIRL_PROMPT,
        VOXCPM_KHMER_BOY_PROMPT.lower(): VOXCPM_KHMER_BOY_PROMPT,
        VOXCPM_KHMER_OLD_WOMAN_PROMPT.lower(): VOXCPM_KHMER_OLD_WOMAN_PROMPT,
        VOXCPM_KHMER_OLD_MAN_PROMPT.lower(): VOXCPM_KHMER_OLD_MAN_PROMPT,
    }
    if lowered in known_prompts:
        return known_prompts[lowered]

    # Preserve detailed user-selected prompts. The role matching below is only
    # for old short aliases such as "male", "girl", or "old man voice".
    if len(text) > 80 or "," in text:
        return text

    gender_text = re.sub(r"\bnot\s+(male|female|boy|girl)\b", "", lowered)

    if re.search(r"\b(old\s+woman|elderly\s+khmer\s+female|old\s+female|grandma)\b", gender_text):
        return VOXCPM_KHMER_OLD_WOMAN_PROMPT
    if re.search(r"\b(old\s+man|elderly\s+khmer\s+male|old\s+male|grandpa)\b", gender_text):
        return VOXCPM_KHMER_OLD_MAN_PROMPT
    if re.search(r"\b(girl|female\s+child|young\s+khmer\s+female\s+child)\b", gender_text):
        return VOXCPM_KHMER_GIRL_PROMPT
    if re.search(r"\b(boy|male\s+child|young\s+khmer\s+male\s+child)\b", gender_text):
        return VOXCPM_KHMER_BOY_PROMPT
    if re.search(r"\b(woman|female|feminine|sreymom)\b", gender_text):
        return VOXCPM_KHMER_FEMALE_PROMPT
    if re.search(r"\b(man|male|masculine|piseth)\b", gender_text):
        return VOXCPM_KHMER_MALE_PROMPT
    return text


def get_voxcpm_control(voice_id):
    value = str(voice_id or "").strip()
    if not is_voxcpm_voice(value):
        return ""
    return _canonicalize_voxcpm_control(value.split(":", 1)[1].strip())


def _looks_like_voxcpm_source(source_dir):
    src_dir = os.path.join(source_dir, "src")
    package_dir = os.path.join(src_dir, "voxcpm")
    return os.path.isdir(package_dir) and (
        os.path.exists(os.path.join(package_dir, "__init__.py"))
        or os.path.exists(os.path.join(source_dir, "pyproject.toml"))
    )


def _normalize_candidate_dir(path):
    value = str(path or "").strip().strip('"')
    if not value:
        return ""
    return os.path.abspath(os.path.expandvars(os.path.expanduser(value)))


def _yield_existing_voxcpm_dirs(parent_dir):
    parent_dir = _normalize_candidate_dir(parent_dir)
    if not parent_dir or not os.path.isdir(parent_dir):
        return
    try:
        names = os.listdir(parent_dir)
    except Exception:
        return
    for name in names:
        candidate = os.path.join(parent_dir, name)
        if "voxcpm" in name.lower() and os.path.isdir(candidate):
            yield candidate


def _candidate_source_dirs():
    app_dir = get_app_dir()
    bundle_dir = os.path.dirname(os.path.abspath(__file__))
    desktop_dir = os.path.join(os.path.expanduser("~"), "Desktop")
    candidate_roots = [
        os.environ.get("VOXCPM_SOURCE_DIR", ""),
        os.path.join(app_dir, "VoxCPM-main"),
        os.path.join(app_dir, "VoxCPM"),
        os.path.join(os.path.dirname(app_dir), "VoxCPM-main"),
        os.path.join(os.path.dirname(app_dir), "VoxCPM"),
        os.path.join(bundle_dir, "VoxCPM-main"),
        os.path.join(os.path.dirname(bundle_dir), "VoxCPM-main"),
        os.path.join(os.getcwd(), "VoxCPM-main"),
        os.path.join(desktop_dir, "VoxCPM-main"),
        r"C:\Users\sheakmeng\Desktop\VoxCPM-main",
    ]

    for search_parent in (app_dir, os.path.dirname(app_dir), desktop_dir, os.getcwd()):
        candidate_roots.extend(_yield_existing_voxcpm_dirs(search_parent) or [])

    spec = importlib.util.find_spec("voxcpm")
    if spec and spec.origin:
        package_dir = os.path.dirname(os.path.abspath(spec.origin))
        if os.path.basename(package_dir).lower() == "voxcpm":
            src_dir = os.path.dirname(package_dir)
            candidate_roots.append(os.path.dirname(src_dir))

    seen = set()
    for candidate in candidate_roots:
        normalized = _normalize_candidate_dir(candidate)
        if not normalized:
            continue
        key = os.path.normcase(normalized)
        if key in seen:
            continue
        seen.add(key)
        yield normalized


def _ensure_voxcpm_importable():
    global _LAST_SOURCE_DIR_CANDIDATES
    
    # 1. Quick check: Is voxcpm already importable in the current environment?
    try:
        import importlib.util
        spec = importlib.util.find_spec("voxcpm")
        if spec and spec.origin:
            package_dir = os.path.dirname(os.path.abspath(spec.origin))
            parent = os.path.dirname(package_dir)  # e.g. site-packages
            os.environ["VOXCPM_SOURCE_DIR"] = parent
            return parent
    except Exception:
        pass

    # 2. Otherwise search candidate directories
    checked = []
    for source_dir in _candidate_source_dirs():
        checked.append(source_dir)
        src_dir = os.path.join(source_dir, "src")
        if _looks_like_voxcpm_source(source_dir):
            if src_dir not in sys.path:
                sys.path.insert(0, src_dir)
            os.environ["VOXCPM_SOURCE_DIR"] = source_dir
            _LAST_SOURCE_DIR_CANDIDATES = checked
            return source_dir
    _LAST_SOURCE_DIR_CANDIDATES = checked
    return ""


def _format_missing_source_error():
    checked = _LAST_SOURCE_DIR_CANDIDATES or list(_candidate_source_dirs())
    checked_text = "; ".join(checked[:8])
    if len(checked) > 8:
        checked_text += f"; ... ({len(checked)} total)"
    return (
        "Cannot find VoxCPM-main. Put the extracted VoxCPM-main folder next to AI Dubbing Tool, "
        "or set VOXCPM_SOURCE_DIR to the folder that contains src\\voxcpm. "
        f"Checked: {checked_text}"
    )


def _find_external_python():
    env_python = os.environ.get("VOXCPM_PYTHON", "").strip()
    candidates = []
    if env_python:
        candidates.append(env_python)

    app_dir = get_app_dir()
    candidates.extend(
        [
            os.path.join(app_dir, "RVC", "Applio", "env", "python.exe"),
            os.path.join(app_dir, "RVC", "Applio", "venv", "Scripts", "python.exe"),
            os.path.join(os.path.dirname(app_dir), "RVC", "Applio", "env", "python.exe"),
        ]
    )

    if not getattr(sys, "frozen", False):
        candidates.append(sys.executable)

    candidates.extend(
        [
            shutil.which("python") or "",
            shutil.which("python3") or "",
            os.path.join(os.path.expanduser("~"), "AppData", "Local", "Programs", "Python", "Python311", "python.exe"),
            os.path.join(os.path.expanduser("~"), "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
        ]
    )

    seen = set()
    existing = []
    for candidate in candidates:
        if not candidate:
            continue
        normalized = os.path.normcase(os.path.abspath(candidate))
        if normalized in seen:
            continue
        seen.add(normalized)
        if os.path.exists(candidate):
            existing.append(os.path.abspath(candidate))

    prefer_gpu = os.environ.get("VOXCPM_PREFER_GPU", "1").strip().lower() not in ("0", "false", "no", "off")
    if prefer_gpu:
        for candidate in existing:
            if _python_has_cuda(candidate):
                return candidate

    if existing:
        return existing[0]
    return ""


def _python_has_cuda(python_exe):
    python_exe = os.path.abspath(str(python_exe or ""))
    if not python_exe:
        return False
    if python_exe in _PYTHON_CUDA_CACHE:
        return _PYTHON_CUDA_CACHE[python_exe]
    try:
        result = subprocess.run(
            [
                python_exe,
                "-c",
                "import torch; print('1' if torch.cuda.is_available() else '0')",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=12,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        has_cuda = result.returncode == 0 and str(result.stdout or "").strip().endswith("1")
    except Exception:
        has_cuda = False
    _PYTHON_CUDA_CACHE[python_exe] = has_cuda
    return has_cuda


def _current_python_has_cuda():
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _preferred_voxcpm_device(python_exe=None):
    configured = os.environ.get("VOXCPM_DEVICE", "").strip()
    if configured:
        return configured
    if python_exe:
        return "cuda" if _python_has_cuda(python_exe) else "auto"
    return "cuda" if _current_python_has_cuda() else "auto"


def _should_use_external_gpu():
    prefer_gpu = os.environ.get("VOXCPM_PREFER_GPU", "1").strip().lower() not in ("0", "false", "no", "off")
    if not prefer_gpu or _current_python_has_cuda():
        return False
    python_exe = _find_external_python()
    return bool(python_exe and _python_has_cuda(python_exe))


def _emit_progress(progress_callback, message, percent=None):
    if progress_callback is None:
        return
    try:
        progress_callback(message, percent)
    except TypeError:
        progress_callback(message)
    except Exception:
        pass


def _voxcpm_seed_identity_control(voice_control):
    identity_parts = []
    for part in str(voice_control or "").split(","):
        cleaned = part.strip()
        if not cleaned or cleaned.lower() in _VOXCPM_SEED_STYLE_TOKENS:
            continue
        identity_parts.append(cleaned)
    return ", ".join(identity_parts).strip() or str(voice_control or "").strip()


def _stable_voxcpm_seed(voice_control, cfg_value, inference_timesteps):
    # Keep one stable sampling identity per VoxCPM2 voice. If the text is part
    # of the seed, every subtitle line can drift into a different speaker.
    seed_identity = _voxcpm_seed_identity_control(voice_control)
    seed_material = f"{seed_identity or 'voxcpm2-default'}\n{float(cfg_value):.4f}\n{int(inference_timesteps)}"
    digest = hashlib.sha256(seed_material.encode("utf-8", errors="ignore")).hexdigest()
    return int(digest[:8], 16) & 0x7FFFFFFF


def _seed_voxcpm_runtime(seed):
    seed = int(seed) & 0x7FFFFFFF
    random.seed(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except Exception:
        pass
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except Exception:
        pass


def _candidate_model_paths():
    env_model = os.environ.get("VOXCPM_MODEL_PATH", "").strip()
    if env_model:
        yield env_model

    for source_dir in _candidate_source_dirs():
        yield os.path.join(source_dir, "pretrained_models", "VoxCPM2")
        yield os.path.join(source_dir, "models", "openbmb__VoxCPM2")
        yield os.path.join(source_dir, "models", "VoxCPM2")

    app_dir = get_app_dir()
    yield os.path.join(app_dir, "models", "openbmb__VoxCPM2")
    yield os.path.join(app_dir, "models", "VoxCPM2")


def resolve_voxcpm_model_id():
    for model_path in _candidate_model_paths():
        config_path = os.path.join(model_path, "config.json")
        if os.path.isdir(model_path) and os.path.exists(config_path):
            return os.path.abspath(model_path)
    return os.environ.get("VOXCPM_HF_MODEL_ID", "openbmb/VoxCPM2").strip() or "openbmb/VoxCPM2"


def _get_model():
    global _MODEL, _MODEL_KEY
    source_dir = _ensure_voxcpm_importable()
    model_id = resolve_voxcpm_model_id()
    device = _preferred_voxcpm_device()
    model_key = (source_dir, model_id, device)

    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_KEY == model_key:
            return _MODEL

        try:
            from voxcpm import VoxCPM
        except Exception as exc:
            raise RuntimeError(
                "VoxCPM is not importable in this app runtime. "
                f"Source={source_dir or 'not found'}; error={exc}"
            ) from exc

        local_files_only = os.path.isdir(model_id)
        _MODEL = VoxCPM.from_pretrained(
            model_id,
            load_denoiser=False,
            local_files_only=local_files_only,
            optimize=True,
            device=device,
        )
        _MODEL_KEY = model_key
        return _MODEL


def _convert_wav_to_output(wav_path, output_path):
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    ext = os.path.splitext(output_path)[1].lower()
    if ext == ".wav":
        if os.path.abspath(wav_path) != os.path.abspath(output_path):
            import time
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    os.replace(wav_path, output_path)
                    break
                except PermissionError as e:
                    if attempt == max_retries - 1:
                        raise e
                    time.sleep(0.2)
        return

    result = subprocess.run(
        [
            _get_ffmpeg_path(),
            "-y",
            "-i",
            wav_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            output_path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if result.returncode != 0 or not os.path.exists(output_path):
        error_text = result.stderr.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(f"VoxCPM audio conversion failed: {error_text or 'unknown FFmpeg error'}")


def ensure_voxcpm_model_downloaded(progress_callback=None):
    import urllib.request
    import time

    model_dir = os.path.join(get_app_dir(), "models", "VoxCPM2")
    os.makedirs(model_dir, exist_ok=True)

    MODEL_FILES = [
        {
            "name": "config.json",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/config.json",
            "min_size": 1000,
        },
        {
            "name": "special_tokens_map.json",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/special_tokens_map.json",
            "min_size": 1000,
        },
        {
            "name": "tokenizer.json",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/tokenizer.json",
            "min_size": 1000000,
        },
        {
            "name": "tokenizer_config.json",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/tokenizer_config.json",
            "min_size": 1000,
        },
        {
            "name": "tokenization_voxcpm2.py",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/tokenization_voxcpm2.py",
            "min_size": 1000,
        },
        {
            "name": "audiovae.pth",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/audiovae.pth",
            "min_size": 370000000,
        },
        {
            "name": "model.safetensors",
            "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/model.safetensors",
            "min_size": 4500000000,
        }
    ]

    # Check which files need downloading
    to_download = []
    for f_info in MODEL_FILES:
        f_path = os.path.join(model_dir, f_info["name"])
        needs_dl = False
        if not os.path.exists(f_path):
            needs_dl = True
        elif os.path.getsize(f_path) < f_info["min_size"]:
            needs_dl = True
            
        if needs_dl:
            to_download.append(f_info)

    if not to_download:
        return True

    total_files = len(to_download)
    for idx, f_info in enumerate(to_download):
        f_path = os.path.join(model_dir, f_info["name"])
        url = f_info["url"]
        
        # Check current size for resuming
        current_size = 0
        if os.path.exists(f_path):
            current_size = os.path.getsize(f_path)
            
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        
        if current_size > 0:
            req.add_header('Range', f'bytes={current_size}-')
            
        try:
            response = urllib.request.urlopen(req)
            status_code = response.getcode()
        except urllib.error.HTTPError as e:
            # If 416 (Range Not Satisfiable), the file might be complete or corrupted.
            # Delete it and start clean.
            if e.code == 416:
                try: os.remove(f_path)
                except: pass
                current_size = 0
                req = urllib.request.Request(url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
                try:
                    response = urllib.request.urlopen(req)
                    status_code = response.getcode()
                except Exception as inner_e:
                    raise RuntimeError(f"បរាជ័យក្នុងការទាញយក {f_info['name']}: {inner_e}")
            else:
                raise RuntimeError(f"បរាជ័យក្នុងការទាញយក {f_info['name']}: {e}")
        except Exception as e:
            raise RuntimeError(f"បរាជ័យក្នុងការទាញយក {f_info['name']}: {e}")

        # Check response headers for content length
        headers = response.info()
        content_length = int(headers.get('Content-Length', 0))
        
        if status_code == 206: # Partial Content (Resume)
            total_size = current_size + content_length
            mode = 'ab' # append binary
        else:
            total_size = content_length
            current_size = 0
            mode = 'wb' # write binary

        # Start downloading in chunks of 1 MB
        chunk_size = 1024 * 1024
        downloaded = current_size
        start_time = time.time()
        last_report = 0
        
        try:
            with open(f_path, mode) as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    current_time = time.time()
                    if current_time - last_report >= 1.0 or downloaded >= total_size:
                        last_report = current_time
                        elapsed = current_time - start_time
                        session_downloaded = downloaded - current_size
                        speed = session_downloaded / (elapsed if elapsed > 0 else 1.0) / 1024 / 1024 # MB/s
                        percent = (downloaded / total_size) * 100 if total_size > 0 else 0
                        dl_mb = downloaded / 1024 / 1024
                        tot_mb = total_size / 1024 / 1024
                        
                        khmer_msg = f"កំពុងទាញយក {f_info['name']} ({idx + 1}/{total_files}): {percent:.1f}% ({dl_mb:.1f}/{tot_mb:.1f} MB) | {speed:.2f} MB/s"
                        global_pct = int((idx / total_files) * 100 + (percent / total_files))
                        
                        if progress_callback:
                            _emit_progress(progress_callback, khmer_msg, global_pct)
                        else:
                            print(f"{khmer_msg} | Global: {global_pct}%", flush=True)
                            
            if downloaded < total_size:
                raise RuntimeError(f"retrieval incomplete: got only {downloaded} out of {total_size} bytes")
        except Exception as e:
            raise RuntimeError(f"បរាជ័យក្នុងការទាញយក {f_info['name']}: {e}")

    return True


def generate_voxcpm_audio(text, voice_id, output_path, cfg_value=2.0, inference_timesteps=10, progress_callback=None, reference_wav_path=None, check_cancelled=None):
    clean_text = str(text or "").strip()
    if not clean_text:
        raise ValueError("VoxCPM text is empty.")

    if check_cancelled and check_cancelled():
        raise RuntimeError("Generation cancelled by user")

    _emit_progress(progress_callback, "VoxCPM2: verifying model files", 2)
    try:
        ensure_voxcpm_model_downloaded(progress_callback)
    except Exception as e:
        raise RuntimeError(f"Failed to auto-download VoxCPM model: {e}")

    # Force end punctuation to prevent VoxCPM endless generation (hallucination loop up to 4096)
    if not clean_text.endswith(("។", ".", "!", "?", '"', "'", "”", "’")):
        if any("\u1780" <= c <= "\u17FF" for c in clean_text):
            clean_text += "។"
        else:
            clean_text += "."

    control = get_voxcpm_control(voice_id)
    final_text = f"({control}){clean_text}" if control else clean_text
    seed = _stable_voxcpm_seed(control, cfg_value, inference_timesteps)
    _emit_progress(progress_callback, "VoxCPM2: preparing text and voice prompt", 5)

    temp_fd, temp_wav = tempfile.mkstemp(suffix=".wav")
    os.close(temp_fd)
    try:
        try:
            # Fail early if libraries are missing to avoid redundant generation
            try:
                import soundfile as sf
                import torch
            except ImportError:
                raise RuntimeError("Required libraries (soundfile/torch) missing in main environment.")

            if _should_use_external_gpu():
                raise RuntimeError("Using external CUDA Python for VoxCPM GPU generation.")
            
            _emit_progress(progress_callback, f"VoxCPM2: loading model on {_preferred_voxcpm_device()}", 15)
            model = _get_model()
            _seed_voxcpm_runtime(seed)
            _emit_progress(progress_callback, "VoxCPM2: generating speech", 35)
            
            # Start a background "fake" progress updater
            stop_fake_event = threading.Event()
            def fake_progress_loop():
                current_p = 35
                # Use wait() instead of sleep() for immediate exit when event is set
                while not stop_fake_event.wait(0.5) and current_p < 85:
                    current_p += 1
                    _emit_progress(progress_callback, "VoxCPM2: generating speech...", current_p)
            
            fake_thread = threading.Thread(target=fake_progress_loop, daemon=True)
            fake_thread.start()
            
            try:
                wav = model.generate(
                    text=final_text,
                    cfg_value=float(cfg_value),
                    inference_timesteps=int(inference_timesteps),
                    normalize=False,
                    reference_wav_path=reference_wav_path,
                )
            finally:
                stop_fake_event.set()
                # Thread will exit on next wait(0.5) or immediately if it just started waiting

            _emit_progress(progress_callback, "VoxCPM2: writing generated waveform", 88)
            import soundfile as sf
            sf.write(temp_wav, wav, model.tts_model.sample_rate)
        except Exception as in_process_error:
            if check_cancelled and check_cancelled():
                raise RuntimeError("Generation cancelled by user")
            _generate_voxcpm_audio_external(
                final_text,
                temp_wav,
                cfg_value=cfg_value,
                inference_timesteps=inference_timesteps,
                seed=seed,
                previous_error=in_process_error,
                progress_callback=progress_callback,
                reference_wav_path=reference_wav_path,
                check_cancelled=check_cancelled
            )

        _emit_progress(progress_callback, "VoxCPM2: converting audio for the app", 92)
        _convert_wav_to_output(temp_wav, output_path)
    finally:
        try:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
        except Exception:
            pass

    if not os.path.exists(output_path) or os.path.getsize(output_path) < 100:
        raise RuntimeError("VoxCPM did not create a usable audio file.")
    _emit_progress(progress_callback, "VoxCPM2: audio ready", 100)


def _generate_voxcpm_audio_external(
    final_text,
    wav_output_path,
    cfg_value=2.0,
    inference_timesteps=10,
    seed=None,
    previous_error=None,
    progress_callback=None,
    reference_wav_path=None,
    check_cancelled=None
):
    source_dir = _ensure_voxcpm_importable()
    if not source_dir:
        raise RuntimeError(_format_missing_source_error()) from previous_error

    python_exe = _find_external_python()
    if not python_exe:
        raise RuntimeError(
            "Cannot find an external Python for VoxCPM. Set VOXCPM_PYTHON to a Python that has VoxCPM dependencies."
        ) from previous_error
    device = _preferred_voxcpm_device(python_exe)
    _emit_progress(progress_callback, f"VoxCPM2: using {device.upper()} Python", 15)

    request_fd, request_path = tempfile.mkstemp(suffix=".json")
    os.close(request_fd)
    try:
        with open(request_path, "w", encoding="utf-8") as request_file:
            json.dump(
                {
                    "source_src": os.path.join(source_dir, "src") if os.path.isdir(os.path.join(source_dir, "src", "voxcpm")) else source_dir,
                    "model_id": resolve_voxcpm_model_id(),
                    "text": final_text,
                    "output": wav_output_path,
                    "cfg_value": float(cfg_value),
                    "inference_timesteps": int(inference_timesteps),
                    "device": device,
                    "seed": int(seed if seed is not None else _stable_voxcpm_seed(final_text, cfg_value, inference_timesteps)),
                    "reference_wav_path": reference_wav_path,
                },
                request_file,
                ensure_ascii=False,
            )

        script = (
            "import json, os, sys, random; "
            "sys.path.insert(0, os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages')); "
            "p=json.load(open(sys.argv[1], encoding='utf-8')); "
            "seed=int(p.get('seed', 0)) & 0x7fffffff; "
            "random.seed(seed); "
            "sys.path.insert(0, p['source_src']); "
            "import numpy as np; np.random.seed(seed); "
            "import torch; torch.manual_seed(seed); "
            "torch.cuda.manual_seed_all(seed) if torch.cuda.is_available() else None; "
            "from voxcpm import VoxCPM; "
            "import soundfile as sf; "
            "m=VoxCPM.from_pretrained(p['model_id'], load_denoiser=False, "
            "local_files_only=os.path.isdir(p['model_id']), optimize=True, device=p.get('device', 'auto')); "
            "w=m.generate(text=p['text'], cfg_value=p['cfg_value'], "
            "inference_timesteps=p['inference_timesteps'], normalize=False, reference_wav_path=p.get('reference_wav_path')); "
            "sf.write(p['output'], w, m.tts_model.sample_rate)"
        )
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join(
            [os.path.join(source_dir, "src") if os.path.isdir(os.path.join(source_dir, "src", "voxcpm")) else source_dir, env.get("PYTHONPATH", "")]
        ).strip(os.pathsep)
        _emit_progress(progress_callback, "VoxCPM2: loading model and generating speech", 30)
        log_fd, log_path = tempfile.mkstemp(suffix=".log")
        os.close(log_fd)
        start_time = None
        try:
            with open(log_path, "w", encoding="utf-8", errors="replace") as log_file:
                process = subprocess.Popen(
                    [python_exe, "-c", script, request_path],
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=env,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
                import time

                start_time = time.time()
                last_progress_value = 35
                while process.poll() is None:
                    if check_cancelled and check_cancelled():
                        try:
                            process.terminate()
                            process.wait(timeout=2)
                        except:
                            try: process.kill()
                            except: pass
                        raise RuntimeError("Generation cancelled by user")

                    elapsed = int(time.time() - start_time)
                    # Keep the bar alive with monotonic progress. This is not
                    # exact model progress, so cap it below the real completion
                    # steps emitted after the process exits.
                    progress_value = min(84, 35 + (elapsed // 2))
                    if progress_value < last_progress_value:
                        progress_value = last_progress_value
                    last_progress_value = progress_value
                    _emit_progress(
                        progress_callback,
                        f"VoxCPM2: generating speech on GPU ({elapsed}s elapsed)",
                        progress_value,
                    )
                    try:
                        process.wait(timeout=0.2)
                    except subprocess.TimeoutExpired:
                        continue

                result_returncode = process.returncode

            log_text = ""
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as log_file:
                    log_text = log_file.read()
            except Exception:
                log_text = ""
        finally:
            try:
                if os.path.exists(log_path):
                    os.remove(log_path)
            except Exception:
                pass

        if result_returncode != 0 or not os.path.exists(wav_output_path):
            stderr_text = (log_text or "").strip()
            base_error = f" Previous in-app import error: {previous_error}" if previous_error else ""
            raise RuntimeError(
                f"External VoxCPM Python failed ({python_exe}). {stderr_text}{base_error}"
            )
        _emit_progress(progress_callback, "VoxCPM2: speech generated", 85)
    finally:
        try:
            if os.path.exists(request_path):
                os.remove(request_path)
        except Exception:
            pass

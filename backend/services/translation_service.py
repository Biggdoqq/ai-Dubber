"""Translation service.

Ports the legacy engine logic VERBATIM from TranslateWorker
(AI_Dubber_PyQt5_Complete.py:3120-3660): priority NLLB-200 -> Groq -> Gemini
-> Google Translate, with the exact prompts and the automatic Google-Translate
fallback on quota exhaustion. UI/Qt signals are replaced by a progress callback.

Each engine returns a dict keyed by row_index. LLM engines (Groq/Gemini) return
{text, gender, emotion}; NLLB/Google return plain text (normalized here to the
same dict shape so the API surface is uniform).
"""
from __future__ import annotations

import json
import time
from typing import Callable, Optional

import requests

# Full language names for prompts (mirrors the legacy translation_languages_full).
LANG_FULL = {
    "auto": "Auto-Detect", "km": "Khmer", "en": "English", "th": "Thai",
    "vi": "Vietnamese", "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
    "ja": "Japanese", "ko": "Korean", "fr": "French", "es": "Spanish",
    "de": "German", "ru": "Russian",
}

ProgressCb = Optional[Callable[[int, int, str], None]]


def _emit(cb: ProgressCb, done: int, total: int, msg: str) -> None:
    if cb:
        try:
            cb(done, total, msg)
        except Exception:
            pass


def _google_fallback(rows: list[dict], target_lang: str, results: dict, cb: ProgressCb, total: int) -> None:
    from deep_translator import GoogleTranslator as _GT
    _gt = _GT(source="auto", target=target_lang)
    for r in rows:
        idx, text = r["row_index"], r["text"]
        try:
            translated = _gt.translate(text)
            results[idx] = {"text": translated or text, "gender": "Unknown", "emotion": "Normal"}
        except Exception:
            results[idx] = {"text": text, "gender": "Unknown", "emotion": "Normal"}
        time.sleep(0.15)


def _build_llm_prompt(chunk: list[dict], src_full: str, tgt_full: str, custom: str) -> str:
    prompt = (
        f"You are an expert subtitle translator and professional localizer.\n"
        f"Translate from {src_full} to {tgt_full}.\n\n"
        f"CRITICAL LOCALIZATION RULES:\n"
        f"1. Tone & Flow: Make the translation sound highly natural, engaging, and spoken like a popular local Cambodian content creator. Avoid stiff literal translations.\n"
        f"2. Khmer Pronouns & Style: Use warm, conversational Khmer pronouns (e.g., 'បង-អូន', 'ញ៉ុម', 'ហ្វេនៗ', 'ម៉ូយៗ') for casual styles. Feel free to inject trendy, friendly social media slangs where appropriate.\n"
        f"3. Syllable-to-Time Fitting (Duration Limit): Each line includes a 'Duration' in seconds. Ensure your translation has an appropriate syllable length to be spoken naturally within that time limit (around 2.5 to 3 syllables per second). If the literal translation is too long, dynamically shorten it by choosing natural, concise synonyms so the speaker never sounds rushed!\n\n"
    )
    if custom:
        prompt += f"Special Translation Instructions/Glossary to strictly follow:\n{custom}\n\n"
    prompt += (
        "Also detect speaker gender (Male/Female/Unknown) and emotion "
        "(Normal/Angry/Sad/Happy/Whispering/Shouting) from context.\n"
        "Return ONLY a valid JSON array (no markdown) with objects: "
        "{row_index: int, text: string, gender: string, emotion: string}\n\n"
    )
    for r in chunk:
        dur = max(0.5, r.get("duration", 2.0))
        prompt += f"[{r['row_index']}] (Duration: {dur:.1f}s) {r['text']}\n"
    return prompt


def translate_rows(
    rows: list[dict],
    source_lang: str,
    target_lang: str,
    engine: str = "google",
    groq_api_key: str = "",
    gemini_api_key: str = "",
    groq_model: str = "llama-3.3-70b-versatile",
    gemini_model: str = "gemini-1.5-flash",
    nllb_model: str = "facebook/nllb-200-distilled-600M",
    use_gpu_nllb: bool = True,
    custom_instructions: str = "",
    progress: ProgressCb = None,
) -> dict:
    """rows: [{row_index, text, duration?}]. Returns {row_index: {text,gender,emotion}}."""
    results: dict = {}
    total = len(rows)
    src_full = LANG_FULL.get(source_lang, source_lang)
    tgt_full = LANG_FULL.get(target_lang, target_lang)

    # ---- NLLB-200 offline ----
    if engine == "nllb":
        import torch
        from transformers import pipeline
        nllb_map = {
            "km": "khm_Khmr", "en": "eng_Latn", "th": "tha_Thai", "vi": "vie_Latn",
            "zh-CN": "zho_Hans", "zh-TW": "zho_Hant", "ja": "jpn_Jpan", "ko": "kor_Hang",
            "fr": "fra_Latn", "es": "spa_Latn", "de": "deu_Latn", "ru": "rus_Cyrl",
        }
        device = 0 if (torch.cuda.is_available() and use_gpu_nllb) else -1
        translator = pipeline(
            task="translation", model=nllb_model,
            src_lang=nllb_map.get(source_lang, "eng_Latn"),
            tgt_lang=nllb_map.get(target_lang, "khm_Khmr"), device=device,
        )
        for n, r in enumerate(rows):
            idx, text = r["row_index"], r["text"]
            if not text.strip():
                results[idx] = {"text": "", "gender": "Unknown", "emotion": "Normal"}
            else:
                try:
                    out = translator(text, max_length=256)
                    results[idx] = {"text": out[0]["translation_text"] or text,
                                    "gender": "Unknown", "emotion": "Normal"}
                except Exception:
                    results[idx] = {"text": text, "gender": "Unknown", "emotion": "Normal"}
            _emit(progress, n + 1, total, str(results.get(idx, {}).get("text", ""))[:60])
        return results

    # ---- Groq LLM ----
    if engine == "groq" and groq_api_key:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"}
        chunk_size = 5
        quota_exhausted = False
        for i in range(0, total, chunk_size):
            chunk = rows[i:i + chunk_size]
            if quota_exhausted:
                _google_fallback(chunk, target_lang, results, progress, total)
                _emit(progress, min(i + chunk_size, total), total, "Groq quota — Google Translate")
                continue
            prompt = _build_llm_prompt(chunk, src_full, tgt_full, custom_instructions)
            backoff = [30, 60, 90, 120, 180]
            done_chunk = False
            for attempt in range(6):
                try:
                    payload = {
                        "model": groq_model,
                        "messages": [
                            {"role": "system", "content": "You are a professional subtitle translator. Always return only raw JSON, never markdown code blocks."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.2, "max_tokens": 2048,
                    }
                    resp = requests.post(url, json=payload, headers=headers, timeout=60)
                    if resp.status_code == 429:
                        if attempt < 5:
                            time.sleep(backoff[min(attempt, 4)])
                            continue
                        quota_exhausted = True
                        _google_fallback(chunk, target_lang, results, progress, total)
                        done_chunk = True
                        break
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"].strip()
                    content = _strip_fences(content)
                    data = json.loads(content)
                    _apply_llm_data(data, chunk, results)
                    done_chunk = True
                    _emit(progress, min(i + chunk_size, total), total, "Groq translated chunk")
                    break
                except Exception as exc:  # noqa: BLE001
                    if attempt >= 5:
                        quota_exhausted = True
                        _google_fallback(chunk, target_lang, results, progress, total)
                        done_chunk = True
                        break
                    time.sleep(2)
            if not done_chunk:
                _google_fallback(chunk, target_lang, results, progress, total)
        return results

    # ---- Gemini ----
    if engine == "gemini" and gemini_api_key:
        api_keys = [k.strip() for k in gemini_api_key.split(",") if k.strip()]
        key_idx = 0
        quota_exhausted = False
        chunk_size = 10
        for i in range(0, total, chunk_size):
            chunk = rows[i:i + chunk_size]
            if quota_exhausted:
                _google_fallback(chunk, target_lang, results, progress, total)
                continue
            prompt = _build_llm_prompt(chunk, src_full, tgt_full, custom_instructions)
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "row_index": {"type": "INTEGER"}, "text": {"type": "STRING"},
                                "gender": {"type": "STRING"}, "emotion": {"type": "STRING"},
                            },
                            "required": ["row_index", "text", "gender", "emotion"],
                        },
                    },
                },
            }
            done_chunk = False
            while key_idx < len(api_keys):
                key = api_keys[key_idx]
                gurl = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
                try:
                    resp = requests.post(gurl, json=payload, headers={"Content-Type": "application/json"}, timeout=60)
                    if resp.status_code == 200:
                        txt = _strip_fences(resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip())
                        data = json.loads(txt)
                        if not isinstance(data, list):
                            data = [data]
                        _apply_llm_data(data, chunk, results)
                        done_chunk = True
                        time.sleep(2.0)
                        break
                    elif resp.status_code in (429, 503):
                        key_idx += 1
                        if key_idx >= len(api_keys):
                            quota_exhausted = True
                        continue
                    else:
                        key_idx += 1
                        if key_idx >= len(api_keys):
                            quota_exhausted = True
                        continue
                except Exception:
                    key_idx += 1
                    if key_idx >= len(api_keys):
                        quota_exhausted = True
                    continue
            if not done_chunk:
                _google_fallback(chunk, target_lang, results, progress, total)
            _emit(progress, min(i + chunk_size, total), total, "Gemini translated chunk")
            time.sleep(2)
        return results

    # ---- Google Translate (default/fallback) ----
    _google_fallback(rows, target_lang, results, progress, total)
    return results


def _strip_fences(text: str) -> str:
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _apply_llm_data(data: list, chunk: list[dict], results: dict) -> None:
    for pos, item in enumerate(data):
        if pos >= len(chunk):
            break
        idx = chunk[pos]["row_index"]
        text = (item.get("text", "") or "").strip() or chunk[pos]["text"]
        results[idx] = {
            "text": text,
            "gender": item.get("gender", "Unknown"),
            "emotion": item.get("emotion", "Normal"),
        }


def _spell_prompt(chunk: list[dict]) -> str:
    """Legacy spell-check prompt (AI_Dubber_PyQt5_Complete.py:7846), verbatim."""
    lines = [f"[{r['row_index']}] {r['text']}" for r in chunk]
    return (
        "You are an expert Khmer language editor.\n"
        "Your task is to spell-check and lightly correct the following Khmer subtitle lines.\n\n"
        "RULES:\n"
        "1. Fix obvious spelling/typo errors only - do NOT rephrase or change meaning.\n"
        "2. If a line is already correct, return it unchanged.\n"
        "3. Keep the same length/mood - subtitles must fit in the same time window.\n"
        "4. If a line is in English or another language, leave it EXACTLY as-is.\n\n"
        "Return ONLY a valid JSON array (no markdown) with objects:\n"
        '{"row_index": int, "corrected": string}\n\n'
        "Lines to check:\n" + "\n".join(lines)
    )


def spell_check_rows(
    rows: list[dict],
    groq_api_key: str = "",
    gemini_api_key: str = "",
    groq_model: str = "llama-3.3-70b-versatile",
    gemini_model: str = "gemini-1.5-flash",
    progress: ProgressCb = None,
) -> dict:
    """AI subtitle spell-check (ported from legacy spell_check_subtitles:7764).

    rows: [{row_index, text}]. Returns {row_index: {text}} with corrections.
    Engine priority: Groq -> Gemini. Rows are returned unchanged if no engine
    is available or a chunk fails.
    """
    results: dict = {}
    total = len(rows)
    chunk_size = 8
    use_groq = bool(groq_api_key.strip())
    use_gemini = bool(gemini_api_key.strip())

    for i in range(0, total, chunk_size):
        chunk = rows[i:i + chunk_size]
        corrected: dict = {}
        try:
            if use_groq:
                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json={
                        "model": groq_model,
                        "messages": [
                            {"role": "system", "content": "You are a Khmer subtitle spell-checker. Return only raw JSON, never markdown."},
                            {"role": "user", "content": _spell_prompt(chunk)},
                        ],
                        "temperature": 0.1, "max_tokens": 1024,
                    },
                    headers={"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"},
                    timeout=30,
                )
                if resp.status_code == 200:
                    data = json.loads(_strip_fences(resp.json()["choices"][0]["message"]["content"]))
                    if isinstance(data, dict):
                        data = [data]
                    for pos, item in enumerate(data):
                        if pos < len(chunk):
                            corrected[chunk[pos]["row_index"]] = item.get("corrected", chunk[pos]["text"])
                time.sleep(1.2)
            elif use_gemini:
                api_keys = [k.strip() for k in gemini_api_key.split(",") if k.strip()]
                for key in api_keys:
                    gurl = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={key}"
                    resp = requests.post(gurl, json={"contents": [{"parts": [{"text": _spell_prompt(chunk)}]}]}, timeout=30)
                    if resp.status_code == 200:
                        data = json.loads(_strip_fences(resp.json()["candidates"][0]["content"]["parts"][0]["text"]))
                        if isinstance(data, dict):
                            data = [data]
                        for pos, item in enumerate(data):
                            if pos < len(chunk):
                                corrected[chunk[pos]["row_index"]] = item.get("corrected", chunk[pos]["text"])
                        break
                    elif resp.status_code in (429, 503):
                        continue
                    else:
                        break
                time.sleep(0.5)
        except Exception:
            pass

        for r in chunk:
            idx = r["row_index"]
            results[idx] = {"text": corrected.get(idx, r["text"])}
        _emit(progress, min(i + chunk_size, total), total, "Spell-checked chunk")

    return results

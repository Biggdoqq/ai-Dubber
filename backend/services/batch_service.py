"""Batch import/export service.

Reuses existing building blocks (no new algorithms):
- Batch import: scans a folder for *.srt files and parses each via core.srt.
- Batch export: runs the existing export_service.export_mp3 over multiple
  (subtitles, duration, output) jobs sequentially, reporting aggregate progress.
- Batch video export: runs video_export_service.export_video per item.
- Batch video->MP3: bulk audio extraction (legacy BatchVideoToMP3Worker:3818).
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from backend.config import settings
from backend.core.srt import parse_srt, build_srt
from backend.models import Subtitle
from backend.services import export_service, video_export_service
from backend.services import translation_service, settings_service
from backend.utils.jobs import Job

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def batch_import_srt(folder: str, job: Job | None = None) -> dict:
    """Parse every .srt in a folder. Returns rows keyed by file for the UI."""
    base = Path(folder)
    if not base.is_dir():
        raise ValueError(f"Not a folder: {folder}")

    srts = sorted(base.glob("*.srt"))
    results = []
    total = len(srts) or 1
    for idx, srt_path in enumerate(srts):
        if job:
            job.progress = int((idx / total) * 100)
            job.message = f"[{idx + 1}/{total}] {srt_path.name}"
        try:
            rows = parse_srt(srt_path.read_text(encoding="utf-8", errors="replace"))
            results.append({"file": str(srt_path), "name": srt_path.name,
                            "ok": True, "rows": rows, "count": len(rows)})
        except Exception as exc:  # noqa: BLE001
            results.append({"file": str(srt_path), "name": srt_path.name,
                            "ok": False, "error": str(exc)})

    if job:
        job.progress = 100
        job.message = f"Imported {len(results)} file(s)"
    return {"folder": str(base), "files": results}


def batch_export_mp3(items: list[dict], job: Job | None = None) -> dict:
    """Export several dubs. Each item: {subtitles, video_duration, output_path,
    dub_volume?, auto_sync_speed?}. Reuses export_service.export_mp3 verbatim."""
    results = []
    total = len(items) or 1
    for idx, item in enumerate(items):
        if job and job._cancel.is_set():
            return {"cancelled": True, "results": results}
        if job:
            job.progress = int((idx / total) * 100)
            job.message = f"[{idx + 1}/{total}] {os.path.basename(item.get('output_path', ''))}"
        try:
            subs = [Subtitle.from_dict(s) for s in item["subtitles"]]
            out = export_service.export_mp3(
                subs,
                video_duration=float(item["video_duration"]),
                output_path=item["output_path"],
                dub_volume=int(item.get("dub_volume", 100)),
                auto_sync_speed=bool(item.get("auto_sync_speed", True)),
            )
            results.append({"output": out.get("output"), "ok": True, "clips": out.get("clips")})
        except Exception as exc:  # noqa: BLE001
            results.append({"output": item.get("output_path"), "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r["ok"])
    if job:
        job.progress = 100
        job.message = f"Exported {ok}/{len(results)}"
    return {"ok": ok, "fail": len(results) - ok, "results": results}


def batch_export_video(items: list[dict], job: Job | None = None) -> dict:
    """Export several video dubs. Each item: {subtitles, video_path, output_path,
    video_duration?, dub_volume?, auto_sync_speed?, burn_subtitles?, quality?,
    use_gpu?}. Reuses video_export_service.export_video verbatim."""
    results = []
    total = len(items) or 1
    for idx, item in enumerate(items):
        if job and job._cancel.is_set():
            return {"cancelled": True, "results": results}
        if job:
            job.progress = int((idx / total) * 100)
            job.message = f"[{idx + 1}/{total}] {os.path.basename(item.get('output_path', ''))}"
        try:
            subs = [Subtitle.from_dict(s) for s in item["subtitles"]]
            out = video_export_service.export_video(
                subs,
                video_path=item["video_path"],
                output_path=item["output_path"],
                video_duration=float(item.get("video_duration", 0.0)),
                dub_volume=int(item.get("dub_volume", 100)),
                auto_sync_speed=bool(item.get("auto_sync_speed", True)),
                burn_subtitles=bool(item.get("burn_subtitles", False)),
                quality=item.get("quality", "original"),
                use_gpu=bool(item.get("use_gpu", False)),
            )
            results.append({"output": out.get("output"), "ok": True, "encoder": out.get("encoder")})
        except Exception as exc:  # noqa: BLE001
            results.append({"output": item.get("output_path"), "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r["ok"])
    if job:
        job.progress = 100
        job.message = f"Exported {ok}/{len(results)}"
    return {"ok": ok, "fail": len(results) - ok, "results": results}


def batch_translate_srt(
    files: list[str],
    source_lang: str = "auto",
    target_lang: str = "km",
    engine: str = "google",
    job: Job | None = None,
) -> dict:
    """Translate several SRT files, writing <stem>_<target>.srt beside each.

    Reuses parse_srt -> translation_service.translate_rows -> build_srt. Timing
    and block structure are preserved (only the text is replaced). Mirrors the
    legacy batch_translate_srt output convention (filename_km.srt)."""
    cfg = settings_service.load_settings()
    results = []
    total = len(files) or 1
    for idx, path in enumerate(files):
        if job and job._cancel.is_set():
            return {"cancelled": True, "results": results}
        name = os.path.basename(path)
        if job:
            job.progress = int((idx / total) * 100)
            job.message = f"[{idx + 1}/{total}] {name}"
        try:
            rows = parse_srt(Path(path).read_text(encoding="utf-8", errors="replace"))
            payload = [
                {"row_index": i, "text": r.get("text", ""),
                 "duration": max(0.5, float(r.get("end", 0)) - float(r.get("start", 0)))}
                for i, r in enumerate(rows)
            ]
            translated = translation_service.translate_rows(
                payload,
                source_lang=source_lang,
                target_lang=target_lang,
                engine=engine,
                groq_api_key=cfg.get("groq_api_key", ""),
                gemini_api_key=cfg.get("gemini_api_key", ""),
                groq_model=cfg.get("groq_model_name", "llama-3.3-70b-versatile"),
                gemini_model=cfg.get("gemini_model_name", "gemini-1.5-flash"),
                nllb_model=cfg.get("nllb_model_name", "facebook/nllb-200-distilled-600M"),
                use_gpu_nllb=cfg.get("use_gpu_nllb", True),
                custom_instructions=cfg.get("custom_translation_instructions", ""),
            )
            for i, r in enumerate(rows):
                tr = translated.get(i) or translated.get(str(i))
                if tr:
                    r["text"] = tr.get("text", r.get("text", ""))
            stem = os.path.splitext(path)[0]
            out_path = f"{stem}_{target_lang}.srt"
            Path(out_path).write_text(build_srt(rows), encoding="utf-8")
            results.append({"file": path, "name": name, "ok": True,
                            "output": out_path, "count": len(rows)})
        except Exception as exc:  # noqa: BLE001
            results.append({"file": path, "name": name, "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r["ok"])
    if job:
        job.progress = 100
        job.message = f"Translated {ok}/{len(results)}"
    return {"ok": ok, "fail": len(results) - ok, "results": results}


_VIDEO_EXTS = (".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".m4v")


def batch_folder_export(
    folder: str,
    mode: str = "video",
    dub_volume: int = 100,
    auto_sync_speed: bool = True,
    burn_subtitles: bool = False,
    quality: str = "original",
    use_gpu: bool = False,
    job: Job | None = None,
) -> dict:
    """Scan a folder, pair each <stem>.<video> with its <stem>.srt, and export.

    mode="video" -> muxed .mp4 dub via batch_export_video.
    mode="mp3"   -> audio-only dub via batch_export_mp3.
    Only pairs with a matching SRT are processed; unpaired videos are reported
    as skipped. Parses SRT + probes duration here, then delegates to the
    existing export loops verbatim (no new export logic)."""
    base = Path(folder)
    if not base.is_dir():
        raise ValueError(f"Not a folder: {folder}")

    from backend.utils import ffmpeg

    videos = sorted(
        p for p in base.iterdir()
        if p.is_file() and p.suffix.lower() in _VIDEO_EXTS
    )
    items: list[dict] = []
    skipped: list[str] = []
    for vp in videos:
        srt = vp.with_suffix(".srt")
        if not srt.is_file():
            skipped.append(vp.name)
            continue
        rows = parse_srt(srt.read_text(encoding="utf-8", errors="replace"))
        out_ext = ".mp4" if mode == "video" else ".mp3"
        out_path = str(vp.with_name(f"{vp.stem}_dubbed{out_ext}"))
        item = {
            "subtitles": rows,
            "output_path": out_path,
            "dub_volume": dub_volume,
            "auto_sync_speed": auto_sync_speed,
        }
        if mode == "video":
            item.update({
                "video_path": str(vp),
                "video_duration": ffmpeg.probe_duration(str(vp)),
                "burn_subtitles": burn_subtitles,
                "quality": quality,
                "use_gpu": use_gpu,
            })
        else:
            item["video_duration"] = ffmpeg.probe_duration(str(vp))
        items.append(item)

    if not items:
        if job:
            job.progress = 100
            job.message = "No video+SRT pairs found"
        return {"ok": 0, "fail": 0, "results": [], "skipped": skipped}

    if mode == "video":
        result = batch_export_video(items, job=job)
    else:
        result = batch_export_mp3(items, job=job)
    result["skipped"] = skipped
    return result


def batch_video_to_mp3(videos: list[str], output_folder: str, job: Job | None = None) -> dict:
    """Bulk-extract audio from videos to .mp3 (legacy BatchVideoToMP3Worker:3818)."""
    os.makedirs(output_folder, exist_ok=True)
    results = []
    total = len(videos) or 1
    for idx, vpath in enumerate(videos):
        if job and job._cancel.is_set():
            return {"cancelled": True, "results": results}
        fname = os.path.basename(vpath)
        stem = os.path.splitext(fname)[0]
        out_path = os.path.join(output_folder, f"{stem}.mp3")
        if job:
            job.progress = int((idx / total) * 95)
            job.message = f"[{idx + 1}/{total}] {fname}"
        try:
            proc = subprocess.run(
                [settings.ffmpeg, "-y", "-i", vpath, "-vn",
                 "-acodec", "mp3", "-ab", "192k", out_path],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                creationflags=_NO_WINDOW,
            )
            if proc.returncode == 0 and os.path.exists(out_path):
                results.append({"video": vpath, "ok": True, "mp3": out_path})
            else:
                raise RuntimeError((proc.stderr or "")[-200:])
        except Exception as exc:  # noqa: BLE001
            results.append({"video": vpath, "ok": False, "error": str(exc)})

    ok = sum(1 for r in results if r["ok"])
    if job:
        job.progress = 100
        job.message = f"Extracted {ok}/{len(results)}"
    return {"ok": ok, "fail": len(results) - ok, "results": results, "output_folder": output_folder}

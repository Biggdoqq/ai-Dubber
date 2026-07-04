"""Batch import/export endpoints (async via job manager)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services import batch_service as svc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/batch", tags=["batch"])


class BatchImportRequest(BaseModel):
    folder: str


class BatchExportItem(BaseModel):
    subtitles: list[dict]
    video_duration: float
    output_path: str
    dub_volume: int = 100
    auto_sync_speed: bool = True


class BatchExportRequest(BaseModel):
    items: list[BatchExportItem]


class BatchVideoExportItem(BaseModel):
    subtitles: list[dict]
    video_path: str
    output_path: str
    video_duration: float = 0.0
    dub_volume: int = 100
    auto_sync_speed: bool = True
    burn_subtitles: bool = False
    quality: str = "original"
    use_gpu: bool = False


class BatchVideoExportRequest(BaseModel):
    items: list[BatchVideoExportItem]


class BatchVideoToMp3Request(BaseModel):
    videos: list[str]
    output_folder: str


class BatchTranslateSrtRequest(BaseModel):
    files: list[str]
    source_lang: str = "auto"
    target_lang: str = "km"
    engine: str = "google"


class BatchFolderExportRequest(BaseModel):
    folder: str
    mode: str = "video"  # video | mp3
    dub_volume: int = 100
    auto_sync_speed: bool = True
    burn_subtitles: bool = False
    quality: str = "original"
    use_gpu: bool = False


@router.post("/import-srt")
def import_srt(req: BatchImportRequest) -> dict:
    def _task(job: Job):
        return svc.batch_import_srt(req.folder, job=job)

    job = jobs.run("batch_import", _task)
    return {"job_id": job.id}


@router.post("/export-mp3")
def export_mp3(req: BatchExportRequest) -> dict:
    items = [i.model_dump() for i in req.items]

    def _task(job: Job):
        return svc.batch_export_mp3(items, job=job)

    job = jobs.run("batch_export", _task)
    return {"job_id": job.id}


@router.post("/export-video")
def export_video(req: BatchVideoExportRequest) -> dict:
    items = [i.model_dump() for i in req.items]

    def _task(job: Job):
        return svc.batch_export_video(items, job=job)

    job = jobs.run("batch_export_video", _task)
    return {"job_id": job.id}


@router.post("/video-to-mp3")
def video_to_mp3(req: BatchVideoToMp3Request) -> dict:
    def _task(job: Job):
        return svc.batch_video_to_mp3(req.videos, req.output_folder, job=job)

    job = jobs.run("batch_video_to_mp3", _task)
    return {"job_id": job.id}


@router.post("/translate-srt")
def translate_srt(req: BatchTranslateSrtRequest) -> dict:
    def _task(job: Job):
        return svc.batch_translate_srt(
            req.files,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            engine=req.engine,
            job=job,
        )

    job = jobs.run("batch_translate_srt", _task)
    return {"job_id": job.id}


@router.post("/folder-export")
def folder_export(req: BatchFolderExportRequest) -> dict:
    def _task(job: Job):
        return svc.batch_folder_export(
            req.folder,
            mode=req.mode,
            dub_volume=req.dub_volume,
            auto_sync_speed=req.auto_sync_speed,
            burn_subtitles=req.burn_subtitles,
            quality=req.quality,
            use_gpu=req.use_gpu,
            job=job,
        )

    job = jobs.run("batch_folder_export", _task)
    return {"job_id": job.id}

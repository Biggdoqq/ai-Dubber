"""Audio dub export endpoints (async via job manager)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.schemas import SubtitleModel
from backend.models import Subtitle
from backend.services import export_service as svc
from backend.services import video_export_service as vsvc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportMp3Request(BaseModel):
    subtitles: list[SubtitleModel]
    video_duration: float
    output_path: str
    dub_volume: int = 100
    auto_sync_speed: bool = True
    audio_start_offset_ms: int = 0
    audio_format: str = "mp3"  # mp3 | wav


class ExportVideoRequest(BaseModel):
    subtitles: list[SubtitleModel]
    video_path: str
    output_path: str
    video_duration: float = 0.0
    dub_volume: int = 100
    auto_sync_speed: bool = True
    audio_start_offset_ms: int = 0
    burn_subtitles: bool = False
    quality: str = "original"  # mobile | 720p | 1080p | 4k | original
    use_gpu: bool = False
    subtitle_font_size: int = 28
    video_encoder: str | None = None


@router.post("/mp3")
def export_mp3(req: ExportMp3Request) -> dict:
    subs = [Subtitle(**s.model_dump()) for s in req.subtitles]

    def _task(job: Job):
        return svc.export_mp3(
            subs,
            video_duration=req.video_duration,
            output_path=req.output_path,
            dub_volume=req.dub_volume,
            auto_sync_speed=req.auto_sync_speed,
            audio_start_offset_ms=req.audio_start_offset_ms,
            audio_format=req.audio_format,
            job=job,
        )

    job = jobs.run("export_mp3", _task)
    return {"job_id": job.id}


@router.post("/video")
def export_video(req: ExportVideoRequest) -> dict:
    subs = [Subtitle(**s.model_dump()) for s in req.subtitles]

    def _task(job: Job):
        return vsvc.export_video(
            subs,
            video_path=req.video_path,
            output_path=req.output_path,
            video_duration=req.video_duration,
            dub_volume=req.dub_volume,
            auto_sync_speed=req.auto_sync_speed,
            audio_start_offset_ms=req.audio_start_offset_ms,
            burn_subtitles=req.burn_subtitles,
            quality=req.quality,
            use_gpu=req.use_gpu,
            subtitle_font_size=req.subtitle_font_size,
            video_encoder=req.video_encoder,
            job=job,
        )

    job = jobs.run("export_video", _task)
    return {"job_id": job.id}

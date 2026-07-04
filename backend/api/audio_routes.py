"""Audio processing endpoints — vocal removal (Demucs) + noise reduction."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services import audio_service as svc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/audio", tags=["audio"])


class RemoveVocalsRequest(BaseModel):
    video_path: str
    output_path: str
    use_gpu: bool = False


class NoiseReduceRequest(BaseModel):
    input_path: str
    output_path: str


class EnhanceVoiceRequest(BaseModel):
    input_path: str
    output_path: str


class AudioEffectRequest(BaseModel):
    input_path: str
    output_path: str
    effect_name: str


class BackgroundAudioRequest(BaseModel):
    video_path: str
    bg_audio_path: str
    output_path: str
    bg_volume: float = 30.0
    main_volume: float = 100.0
    loop_bg: bool = True


class AnalyzeGenderRow(BaseModel):
    start: float
    end: float


class AnalyzeGenderRequest(BaseModel):
    audio_path: str
    rows: list[AnalyzeGenderRow]


@router.post("/remove-vocals")
def remove_vocals(req: RemoveVocalsRequest) -> dict:
    def _task(job: Job):
        return svc.remove_vocals(req.video_path, req.output_path, req.use_gpu, job=job)

    job = jobs.run("remove_vocals", _task)
    return {"job_id": job.id}


@router.post("/reduce-noise")
def reduce_noise(req: NoiseReduceRequest) -> dict:
    def _task(job: Job):
        return svc.reduce_noise(req.input_path, req.output_path, job=job)

    job = jobs.run("reduce_noise", _task)
    return {"job_id": job.id}


@router.post("/enhance-voice")
def enhance_voice(req: EnhanceVoiceRequest) -> dict:
    def _task(job: Job):
        return svc.enhance_voice(req.input_path, req.output_path, job=job)

    job = jobs.run("enhance_voice", _task)
    return {"job_id": job.id}


@router.get("/audio-effects")
def list_audio_effects() -> dict:
    return svc.list_audio_effects()


@router.post("/audio-effect")
def apply_audio_effect(req: AudioEffectRequest) -> dict:
    def _task(job: Job):
        return svc.apply_audio_effect(req.input_path, req.output_path, req.effect_name, job=job)

    job = jobs.run("apply_audio_effect", _task)
    return {"job_id": job.id}


@router.post("/background-audio")
def background_audio(req: BackgroundAudioRequest) -> dict:
    def _task(job: Job):
        return svc.mix_background_audio(
            req.video_path, req.bg_audio_path, req.output_path,
            bg_volume=req.bg_volume, main_volume=req.main_volume,
            loop_bg=req.loop_bg, job=job,
        )

    job = jobs.run("background_audio", _task)
    return {"job_id": job.id}


@router.post("/analyze-gender")
def analyze_gender(req: AnalyzeGenderRequest) -> dict:
    rows = [r.model_dump() for r in req.rows]

    def _task(job: Job):
        return svc.analyze_gender(req.audio_path, rows, job=job)

    job = jobs.run("analyze_gender", _task)
    return {"job_id": job.id}

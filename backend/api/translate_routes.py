"""Translation endpoints (async via job manager)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.schemas import TranslateRequest
from backend.services import translation_service as svc
from backend.services import settings_service
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/translate", tags=["translate"])


class SpellCheckRow(BaseModel):
    row_index: int
    text: str


class SpellCheckRequest(BaseModel):
    rows: list[SpellCheckRow]


@router.post("")
def translate(req: TranslateRequest) -> dict:
    cfg = settings_service.load_settings()
    rows = [r.model_dump() for r in req.rows]

    def _task(job: Job):
        def _progress(done: int, total: int, msg: str) -> None:
            job.progress = int(done / total * 100) if total else 0
            job.message = msg

        return svc.translate_rows(
            rows,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            engine=req.engine,
            groq_api_key=cfg.get("groq_api_key", ""),
            gemini_api_key=cfg.get("gemini_api_key", ""),
            groq_model=cfg.get("groq_model_name", "llama-3.3-70b-versatile"),
            gemini_model=cfg.get("gemini_model_name", "gemini-1.5-flash"),
            nllb_model=cfg.get("nllb_model_name", "facebook/nllb-200-distilled-600M"),
            use_gpu_nllb=cfg.get("use_gpu_nllb", True),
            custom_instructions=req.custom_instructions or cfg.get("custom_translation_instructions", ""),
            progress=_progress,
        )

    job = jobs.run("translate", _task)
    return {"job_id": job.id}


@router.post("/spell-check")
def spell_check(req: SpellCheckRequest) -> dict:
    cfg = settings_service.load_settings()
    rows = [r.model_dump() for r in req.rows]

    def _task(job: Job):
        def _progress(done: int, total: int, msg: str) -> None:
            job.progress = int(done / total * 100) if total else 0
            job.message = msg

        return svc.spell_check_rows(
            rows,
            groq_api_key=cfg.get("groq_api_key", ""),
            gemini_api_key=cfg.get("gemini_api_key", ""),
            groq_model=cfg.get("groq_model_name", "llama-3.3-70b-versatile"),
            gemini_model=cfg.get("gemini_model_name", "gemini-1.5-flash"),
            progress=_progress,
        )

    job = jobs.run("spell_check", _task)
    return {"job_id": job.id}

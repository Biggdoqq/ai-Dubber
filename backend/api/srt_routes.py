"""Subtitle/SRT endpoints."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from backend.api.schemas import ParseSrtRequest, BuildSrtRequest
from backend.core import srt

router = APIRouter(prefix="/api/srt", tags=["srt"])


@router.post("/parse")
def parse(req: ParseSrtRequest) -> dict:
    rows = srt.parse_srt(req.content)
    return {"rows": rows, "count": len(rows)}


@router.post("/build", response_class=PlainTextResponse)
def build(req: BuildSrtRequest) -> str:
    rows = [r.model_dump() for r in req.rows]
    return srt.build_srt(rows)

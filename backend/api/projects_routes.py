"""Project save/open endpoints — reads/writes the legacy *.aivd JSON format."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from backend.api.schemas import ProjectModel
from backend.models import Project, Subtitle

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/save")
def save_project(project: ProjectModel, path: str) -> dict:
    proj = Project(
        video=project.video,
        subtitles=[Subtitle(**s.model_dump()) for s in project.subtitles],
    )
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(proj.to_aivd(), fh, indent=2, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Save failed: {exc}")
    return {"saved": path}


@router.get("/open")
def open_project(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Open failed: {exc}")
    proj = Project.from_aivd(data)
    return {
        "video": proj.video,
        "subtitles": [s.to_dict() for s in proj.subtitles],
    }

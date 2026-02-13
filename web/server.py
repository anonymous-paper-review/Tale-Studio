"""
Camera Explorer - FastAPI backend.

Serves the 3D preview UI and proxies Kling API calls.

Usage:
    cd /path/to/tale
    python -m uvicorn web.server:app --reload --port 8000
"""
import sys
from pathlib import Path

# Ensure project root is on path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from adapters.gateways.kling_video import CameraParams, KlingVideoClient
from infrastructure.settings import Settings

app = FastAPI(title="Camera Explorer")

# --- Static files ---
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# --- Lazy-init globals ---
_kling_client: KlingVideoClient | None = None
_presets_cache: dict | None = None


def _get_kling() -> KlingVideoClient:
    global _kling_client
    if _kling_client is None:
        settings = Settings()
        if not settings.kling_access_key or not settings.kling_secret_key:
            raise HTTPException(500, "KLING_ACCESS_KEY / KLING_SECRET_KEY not set in .env")
        _kling_client = KlingVideoClient(
            access_key=settings.kling_access_key,
            secret_key=settings.kling_secret_key,
        )
    return _kling_client


def _load_presets() -> dict:
    global _presets_cache
    if _presets_cache is not None:
        return _presets_cache

    db_dir = PROJECT_ROOT / "databases" / "knowledge"

    # Camera presets
    with open(db_dir / "camera_presets.yaml") as f:
        camera_data = yaml.safe_load(f)

    # Lighting presets (from rendering_style.yaml)
    with open(db_dir / "rendering_style.yaml") as f:
        lighting_data = yaml.safe_load(f)

    _presets_cache = {
        "camera": camera_data.get("presets", []),
        "lighting": [
            {
                "id": t["id"],
                "name": t["name"],
                "description": t.get("description", ""),
                "prompt_fragment": t["prompt_fragment"],
                "emotional_tags": t.get("emotional_tags", []),
            }
            for t in lighting_data.get("techniques", [])
        ],
    }
    return _presets_cache


# --- Routes ---


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/presets")
async def get_presets():
    """Return camera and lighting presets."""
    return _load_presets()


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    camera: dict = {}  # {horizontal, vertical, pan, tilt, roll, zoom}
    lighting_prompt: str = ""  # appended to prompt
    duration: str = "5"
    aspect_ratio: str = "16:9"
    mode: str = "std"


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """Create Kling video generation task."""
    client = _get_kling()

    # Build full prompt with lighting
    full_prompt = req.prompt
    if req.lighting_prompt:
        full_prompt = f"{full_prompt}. {req.lighting_prompt}"

    # Camera params
    camera = CameraParams(**req.camera) if req.camera else None

    task = await client.generate(
        prompt=full_prompt,
        camera=camera,
        negative_prompt=req.negative_prompt,
        duration=req.duration,
        aspect_ratio=req.aspect_ratio,
        mode=req.mode,
    )

    if task.status == "failed":
        raise HTTPException(500, task.error or "Generation failed")

    return {"task_id": task.task_id, "status": task.status}


@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    """Poll Kling task status."""
    client = _get_kling()
    task = await client.get_status(task_id)
    return {
        "task_id": task.task_id,
        "status": task.status,
        "video_url": task.video_url,
        "error": task.error,
    }

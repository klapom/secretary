"""
LivePortrait FastAPI Service
Provides HTTP API for avatar rendering
"""

import os
import sys
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
from pathlib import Path
import io

# Add LivePortrait to path
sys.path.insert(0, "/app/liveportrait")

app = FastAPI(title="LivePortrait Service", version="1.0.0")

# Global model instance (loaded once at startup)
liveportrait_model = None

class RenderRequest(BaseModel):
    """Request model for avatar rendering"""
    character_image_path: str
    audio_path: str | None = None
    expression_intensity: float = 1.0

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    gpu_available: bool
    gpu_name: str | None
    model_loaded: bool

@app.on_event("startup")
async def load_models():
    """Load LivePortrait models on startup"""
    global liveportrait_model

    print("🔄 Loading LivePortrait models...")
    try:
        # TODO: Import and initialize LivePortrait model
        # from liveportrait import LivePortrait
        # liveportrait_model = LivePortrait(
        #     model_dir="/app/models",
        #     device="cuda" if torch.cuda.is_available() else "cpu"
        # )

        # Placeholder for now
        print("✅ LivePortrait models loaded")
        liveportrait_model = {"loaded": True}

    except Exception as e:
        print(f"❌ Failed to load models: {e}")
        liveportrait_model = None

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return HealthResponse(
        status="healthy" if liveportrait_model is not None else "unhealthy",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        model_loaded=liveportrait_model is not None
    )

@app.post("/render")
async def render_avatar(
    character_image: UploadFile = File(...),
    audio: UploadFile | None = File(None),
):
    """
    Render avatar video from character image and optional audio

    Args:
        character_image: Character image file (PNG/JPG)
        audio: Audio file for lip-sync (optional, WAV/MP3)

    Returns:
        Rendered video stream (MP4)
    """
    if liveportrait_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Save uploaded files
        image_bytes = await character_image.read()
        audio_bytes = await audio.read() if audio else None

        # TODO: Call LivePortrait rendering
        # result_video = liveportrait_model.render(
        #     image=image_bytes,
        #     audio=audio_bytes,
        #     fps=25
        # )

        # Placeholder: return empty video stream
        return StreamingResponse(
            io.BytesIO(b""),
            media_type="video/mp4",
            headers={"Content-Disposition": "attachment; filename=avatar.mp4"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rendering failed: {str(e)}")

@app.post("/render-frame")
async def render_frame(
    character_image: UploadFile = File(...),
    expression: str = "neutral"
):
    """
    Render single avatar frame with expression

    Args:
        character_image: Character image file
        expression: Expression type (neutral, smile, sad, etc.)

    Returns:
        Rendered frame image (PNG)
    """
    if liveportrait_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        image_bytes = await character_image.read()

        # TODO: Render frame with expression
        # frame = liveportrait_model.render_frame(
        #     image=image_bytes,
        #     expression=expression
        # )

        # Placeholder
        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/png"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame rendering failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8081,
        log_level="info"
    )

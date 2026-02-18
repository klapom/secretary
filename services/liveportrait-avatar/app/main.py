"""
LivePortrait Avatar Service - FastAPI Application
Provides GPU-accelerated portrait animation using LivePortrait model.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, generate_latest
from starlette.responses import Response

from app.renderer import LivePortraitRenderer
from app.models import RenderRequest, RenderResponse, EmotionType, HealthResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('liveportrait_requests_total', 'Total number of render requests')
REQUEST_LATENCY = Histogram('liveportrait_request_duration_seconds', 'Request latency in seconds')
RENDER_ERRORS = Counter('liveportrait_errors_total', 'Total number of render errors')

# Global renderer instance
renderer: Optional[LivePortraitRenderer] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - initialize and cleanup resources."""
    global renderer

    logger.info("Initializing LivePortrait renderer...")
    try:
        renderer = LivePortraitRenderer(
            model_path="/app/liveportrait/pretrained_weights",
            device="cuda" if torch.cuda.is_available() else "cpu"
        )
        await renderer.initialize()
        logger.info(f"Renderer initialized successfully on {renderer.device}")
        logger.info(f"CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
            logger.info(f"CUDA version: {torch.version.cuda}")
    except Exception as e:
        logger.error(f"Failed to initialize renderer: {e}")
        raise

    yield

    logger.info("Shutting down LivePortrait renderer...")
    if renderer:
        await renderer.cleanup()


app = FastAPI(
    title="LivePortrait Avatar Service",
    description="GPU-accelerated portrait animation with emotion support",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return HealthResponse(
        status="healthy" if renderer and renderer.is_ready else "initializing",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        cuda_version=torch.version.cuda if gpu_available else None,
        model_loaded=renderer.is_ready if renderer else False
    )


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type="text/plain")


@app.post("/render", response_model=RenderResponse)
async def render_avatar(
    source_image: UploadFile = File(..., description="Source portrait image"),
    emotion: EmotionType = Form(EmotionType.NEUTRAL, description="Target emotion"),
    intensity: float = Form(0.7, ge=0.0, le=1.0, description="Emotion intensity (0-1)"),
    output_format: str = Form("png", description="Output format (png/jpg)")
):
    """
    Render animated avatar from source image with specified emotion.

    Args:
        source_image: Source portrait image (JPEG/PNG)
        emotion: Target emotion (neutral, happy, sad, surprised)
        intensity: Emotion intensity (0.0 to 1.0)
        output_format: Output image format

    Returns:
        RenderResponse with output image path and metadata
    """
    REQUEST_COUNT.inc()

    if not renderer or not renderer.is_ready:
        RENDER_ERRORS.inc()
        raise HTTPException(status_code=503, detail="Renderer not ready")

    try:
        with REQUEST_LATENCY.time():
            # Read uploaded image
            image_data = await source_image.read()

            # Create render request
            request = RenderRequest(
                emotion=emotion,
                intensity=intensity,
                output_format=output_format
            )

            # Render avatar
            result = await renderer.render(image_data, request)

            logger.info(
                f"Render completed: emotion={emotion}, "
                f"latency={result.latency_ms}ms, "
                f"gpu={result.gpu_used}"
            )

            return result

    except Exception as e:
        RENDER_ERRORS.inc()
        logger.error(f"Render error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")


@app.post("/render/batch", response_model=list[RenderResponse])
async def render_batch(
    source_image: UploadFile = File(...),
    emotions: list[EmotionType] = Form(...),
    intensity: float = Form(0.7, ge=0.0, le=1.0)
):
    """
    Render multiple emotion variations from single source image.
    Useful for pre-generating emotion set for a character.
    """
    REQUEST_COUNT.inc()

    if not renderer or not renderer.is_ready:
        RENDER_ERRORS.inc()
        raise HTTPException(status_code=503, detail="Renderer not ready")

    try:
        image_data = await source_image.read()
        results = []

        for emotion in emotions:
            request = RenderRequest(
                emotion=emotion,
                intensity=intensity,
                output_format="png"
            )
            result = await renderer.render(image_data, request)
            results.append(result)

        return results

    except Exception as e:
        RENDER_ERRORS.inc()
        logger.error(f"Batch render error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch render failed: {str(e)}")


@app.get("/output/{filename}")
async def get_output_file(filename: str):
    """Retrieve rendered output file."""
    file_path = f"/tmp/liveportrait_output/{filename}"

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(file_path)


@app.delete("/output/{filename}")
async def delete_output_file(filename: str):
    """Delete rendered output file to free storage."""
    file_path = f"/tmp/liveportrait_output/{filename}"

    if os.path.exists(file_path):
        os.remove(file_path)
        return {"status": "deleted", "filename": filename}

    raise HTTPException(status_code=404, detail="Output file not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

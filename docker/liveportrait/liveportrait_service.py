#!/usr/bin/env python3
"""
LivePortrait FastAPI Service for DGX Spark (ARM64)
Renders avatar frames from a source portrait image with expression control.

Uses LivePortrait's PyTorch pipeline (.pth models on GPU) with InsightFace
face detection (ONNX on CPU — no ARM64 GPU onnxruntime wheels exist).

Port: 8081
Models: ~500MB PyTorch (.pth) + InsightFace ONNX (~300MB), cached in Docker volume
"""

import os
import sys
import io
import logging
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

# LivePortrait repo is cloned to /app/LivePortrait
sys.path.insert(0, "/app/LivePortrait")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LivePortrait Service", version="1.0.0")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_DIR = "/app/models"

# Global pipeline state
pipeline = None
source_cache = {}  # Cache processed source images by hash


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    gpu_name: Optional[str] = None
    model_loaded: bool
    device: str


# Predefined expression deltas for the 21 implicit keypoints (each has x,y,z).
# These are empirical offsets applied to the motion extractor's expression output.
# LivePortrait uses 21 keypoints x 3 dims = 63-dim expression vector.
EXPRESSION_PRESETS = {
    "neutral": None,  # No modification
    "happy": {
        # Raise mouth corners (keypoints ~12-15), slight squint (keypoints ~4-7)
        "mouth_smile": 0.4,
        "eye_squint": 0.15,
    },
    "sad": {
        "mouth_smile": -0.3,
        "brow_down": 0.2,
    },
    "surprised": {
        "eye_open": 0.4,
        "mouth_open": 0.3,
        "brow_up": 0.3,
    },
}


def _download_models():
    """Download LivePortrait pretrained weights from HuggingFace if not cached.

    Models are stored in /app/models/ (Docker volume for caching) and symlinked
    to /app/LivePortrait/pretrained_weights/ where the LivePortrait code expects them.
    """
    weights_dir = Path(MODEL_DIR) / "liveportrait"
    base_dir = weights_dir / "base_models"
    retarget_dir = weights_dir / "retargeting_models"

    required_files = [
        base_dir / "appearance_feature_extractor.pth",
        base_dir / "motion_extractor.pth",
        base_dir / "spade_generator.pth",
        base_dir / "warping_module.pth",
        retarget_dir / "stitching_retargeting_module.pth",
        weights_dir / "landmark.onnx",
    ]

    if not all(f.exists() for f in required_files):
        logger.info("Downloading LivePortrait models from HuggingFace...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="KlingTeam/LivePortrait",
            local_dir=MODEL_DIR,
            allow_patterns=["liveportrait/**"],
        )
        logger.info("Model download complete")
    else:
        logger.info("LivePortrait models already cached")

    # InsightFace models for face detection (downloaded by insightface lib automatically,
    # but we also check if available from HuggingFace)
    insightface_dir = Path(MODEL_DIR) / "insightface" / "models" / "buffalo_l"
    if not insightface_dir.exists():
        logger.info("Downloading InsightFace models...")
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="KlingTeam/LivePortrait",
            local_dir=MODEL_DIR,
            allow_patterns=["insightface/**"],
        )
        logger.info("InsightFace models downloaded")

    # Replace /app/LivePortrait/pretrained_weights/ with symlink to our volume-cached
    # models so LivePortrait code finds them at its expected relative path
    import shutil
    pretrained_link = Path("/app/LivePortrait/pretrained_weights")
    if pretrained_link.exists() and not pretrained_link.is_symlink():
        shutil.rmtree(pretrained_link)
    if not pretrained_link.exists():
        pretrained_link.symlink_to(MODEL_DIR)
        logger.info(f"Symlinked {pretrained_link} -> {MODEL_DIR}")


def _load_pipeline():
    """Initialize LivePortrait pipeline with PyTorch models."""
    from src.config.inference_config import InferenceConfig
    from src.config.crop_config import CropConfig
    from src.live_portrait_pipeline import LivePortraitPipeline

    # Configure for our model directory
    inf_cfg = InferenceConfig()

    # Override model paths to point to our volume-cached models
    weights_base = f"{MODEL_DIR}/liveportrait/base_models"
    weights_retarget = f"{MODEL_DIR}/liveportrait/retargeting_models"

    inf_cfg.checkpoint_F = f"{weights_base}/appearance_feature_extractor.pth"
    inf_cfg.checkpoint_M = f"{weights_base}/motion_extractor.pth"
    inf_cfg.checkpoint_G = f"{weights_base}/spade_generator.pth"
    inf_cfg.checkpoint_W = f"{weights_base}/warping_module.pth"
    inf_cfg.checkpoint_S = f"{weights_retarget}/stitching_retargeting_module.pth"

    # Use half precision on GPU for performance
    inf_cfg.flag_use_half_precision = (DEVICE == "cuda")
    inf_cfg.flag_force_cpu = (DEVICE != "cuda")

    crop_cfg = CropConfig()

    # Set InsightFace model dir
    insightface_root = f"{MODEL_DIR}/insightface"
    os.environ["INSIGHTFACE_ROOT"] = insightface_root

    lp_pipeline = LivePortraitPipeline(
        inference_cfg=inf_cfg,
        crop_cfg=crop_cfg,
    )

    logger.info(f"LivePortrait pipeline loaded on {DEVICE}")
    return lp_pipeline


@app.on_event("startup")
async def load_models():
    """Load LivePortrait models on startup."""
    global pipeline

    logger.info("Loading LivePortrait models...")
    try:
        # Disable flash attention for GB10 sm_121
        if torch.cuda.is_available():
            torch.backends.cuda.enable_flash_sdp(False)
            torch.backends.cuda.enable_mem_efficient_sdp(True)

        _download_models()
        pipeline = _load_pipeline()
        logger.info("LivePortrait ready")

    except Exception as e:
        logger.error(f"Failed to load LivePortrait: {e}", exc_info=True)
        pipeline = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    gpu_available = torch.cuda.is_available()
    return HealthResponse(
        status="healthy" if pipeline is not None else "unhealthy",
        gpu_available=gpu_available,
        gpu_name=torch.cuda.get_device_name(0) if gpu_available else None,
        model_loaded=pipeline is not None,
        device=DEVICE,
    )


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to BGR numpy array."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def _encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    """Encode BGR numpy array to JPEG bytes."""
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes()


def _apply_expression_to_kp(x_s_info: dict, expression: str) -> dict:
    """Apply expression preset by modifying keypoint expression deltas.

    LivePortrait's motion extractor outputs expression as a tensor of shape (1, 21, 3).
    We modify specific regions to simulate facial expressions.
    """
    preset = EXPRESSION_PRESETS.get(expression)
    if preset is None:
        return x_s_info

    exp = x_s_info["exp"].clone()  # (1, 21, 3)

    # Mouth region: keypoints 12-16 (approximate mapping)
    mouth_smile = preset.get("mouth_smile", 0.0)
    if mouth_smile != 0.0:
        # Raise/lower mouth corners
        exp[0, 12, 1] -= mouth_smile * 0.1  # left corner up (negative y = up)
        exp[0, 13, 1] -= mouth_smile * 0.1  # right corner up
        exp[0, 14, 1] += mouth_smile * 0.05  # center adjusts

    mouth_open = preset.get("mouth_open", 0.0)
    if mouth_open != 0.0:
        # Open mouth vertically
        exp[0, 15, 1] += mouth_open * 0.15  # lower lip down
        exp[0, 16, 1] += mouth_open * 0.15

    # Eye region: keypoints 4-7
    eye_squint = preset.get("eye_squint", 0.0)
    if eye_squint != 0.0:
        exp[0, 4, 1] += eye_squint * 0.1
        exp[0, 5, 1] += eye_squint * 0.1

    eye_open = preset.get("eye_open", 0.0)
    if eye_open != 0.0:
        exp[0, 4, 1] -= eye_open * 0.12
        exp[0, 5, 1] -= eye_open * 0.12

    # Brow region: keypoints 0-3
    brow_up = preset.get("brow_up", 0.0)
    if brow_up != 0.0:
        exp[0, 0, 1] -= brow_up * 0.1
        exp[0, 1, 1] -= brow_up * 0.1

    brow_down = preset.get("brow_down", 0.0)
    if brow_down != 0.0:
        exp[0, 0, 1] += brow_down * 0.1
        exp[0, 1, 1] += brow_down * 0.1

    x_s_info["exp"] = exp
    return x_s_info


@app.post("/api/render")
async def render_frame(
    source_image: UploadFile = File(...),
    expression: str = Form("neutral"),
    intensity: float = Form(1.0),
):
    """
    Render a single avatar frame with expression control.

    Args:
        source_image: Portrait image (PNG/JPG, ideally 256x256 or larger face crop)
        expression: One of: neutral, happy, sad, surprised
        intensity: Expression intensity multiplier (0.0-2.0, default 1.0)

    Returns:
        JPEG image of the rendered frame
    """
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if expression not in EXPRESSION_PRESETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown expression '{expression}'. Use: {list(EXPRESSION_PRESETS.keys())}",
        )

    try:
        t0 = time.time()
        image_bytes = await source_image.read()
        img_bgr = _decode_image(image_bytes)

        # Use the LivePortrait wrapper for single-frame rendering
        wrapper = pipeline.live_portrait_wrapper

        # Prepare source: resize to 256x256 and convert
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_256 = cv2.resize(img_rgb, (256, 256))

        # Prepare tensor
        I_s = wrapper.prepare_source(img_256)

        # Extract keypoints and features
        x_s_info = wrapper.get_kp_info(I_s)
        f_s = wrapper.extract_feature_3d(I_s)
        x_s = wrapper.transform_keypoint(x_s_info)

        # Apply expression modification
        if expression != "neutral":
            x_d_info = wrapper.get_kp_info(I_s)  # Start from source keypoints
            x_d_info = _apply_expression_to_kp(x_d_info, expression)
            # Scale by intensity
            if intensity != 1.0 and EXPRESSION_PRESETS.get(expression) is not None:
                diff = x_d_info["exp"] - x_s_info["exp"]
                x_d_info["exp"] = x_s_info["exp"] + diff * intensity
            x_d = wrapper.transform_keypoint(x_d_info)
        else:
            x_d = x_s

        # Warp and decode
        out = wrapper.warp_decode(f_s, x_s, x_d)
        rendered = wrapper.parse_output(out["out"])[0]

        # Convert to BGR for encoding
        if rendered.dtype != np.uint8:
            rendered = (rendered * 255).clip(0, 255).astype(np.uint8)
        if rendered.shape[-1] == 3:
            rendered_bgr = cv2.cvtColor(rendered, cv2.COLOR_RGB2BGR)
        else:
            rendered_bgr = rendered

        jpeg_bytes = _encode_jpeg(rendered_bgr)

        elapsed = time.time() - t0
        logger.info(f"Rendered frame [{expression}] in {elapsed:.3f}s")

        return Response(content=jpeg_bytes, media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Render failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Rendering failed: {str(e)}")


@app.post("/render")
async def render_video(
    character_image: UploadFile = File(...),
    audio: Optional[UploadFile] = File(None),
):
    """
    Render avatar video from character image and optional audio.
    Placeholder — full video rendering will be implemented in a future sprint.
    """
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    raise HTTPException(
        status_code=501,
        detail="Video rendering not yet implemented. Use POST /api/render for single frames.",
    )


@app.get("/expressions")
async def list_expressions():
    """List available expression presets."""
    return {
        "expressions": list(EXPRESSION_PRESETS.keys()),
        "description": {
            "neutral": "No expression modification (source image as-is)",
            "happy": "Smile with slight eye squint",
            "sad": "Downturned mouth, lowered brows",
            "surprised": "Wide eyes, open mouth, raised brows",
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081, log_level="info")

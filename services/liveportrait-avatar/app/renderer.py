"""
LivePortrait Renderer - Core rendering engine with GPU acceleration.
"""

import asyncio
import io
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np
import torch
from PIL import Image

from app.models import RenderRequest, RenderResponse, EmotionType, EmotionMapping

logger = logging.getLogger(__name__)


class LivePortraitRenderer:
    """
    GPU-accelerated LivePortrait renderer with emotion support.

    This class wraps the LivePortrait model and provides:
    - Async rendering interface
    - Emotion-based motion control
    - GPU acceleration with CUDA
    - Performance monitoring
    """

    # Emotion to motion parameter mappings
    EMOTION_MAPPINGS: Dict[EmotionType, EmotionMapping] = {
        EmotionType.NEUTRAL: EmotionMapping(
            emotion=EmotionType.NEUTRAL,
            rotation_x=0.0, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.0, mouth_open=0.0, eye_open=1.0, eyebrow_raise=0.0
        ),
        EmotionType.HAPPY: EmotionMapping(
            emotion=EmotionType.HAPPY,
            rotation_x=0.0, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.3, mouth_open=0.6, eye_open=0.9, eyebrow_raise=0.2
        ),
        EmotionType.SAD: EmotionMapping(
            emotion=EmotionType.SAD,
            rotation_x=0.15, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.0, mouth_open=0.0, eye_open=0.7, eyebrow_raise=-0.5
        ),
        EmotionType.SURPRISED: EmotionMapping(
            emotion=EmotionType.SURPRISED,
            rotation_x=-0.1, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.5, mouth_open=0.8, eye_open=1.0, eyebrow_raise=0.8
        ),
        EmotionType.ANGRY: EmotionMapping(
            emotion=EmotionType.ANGRY,
            rotation_x=-0.1, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.2, mouth_open=0.3, eye_open=0.8, eyebrow_raise=-0.7
        ),
        EmotionType.DISGUSTED: EmotionMapping(
            emotion=EmotionType.DISGUSTED,
            rotation_x=0.1, rotation_y=-0.2, rotation_z=0.0,
            expression_scale=1.1, mouth_open=0.2, eye_open=0.6, eyebrow_raise=-0.3
        ),
        EmotionType.FEARFUL: EmotionMapping(
            emotion=EmotionType.FEARFUL,
            rotation_x=0.0, rotation_y=0.0, rotation_z=0.0,
            expression_scale=1.2, mouth_open=0.4, eye_open=1.0, eyebrow_raise=0.6
        ),
    }

    def __init__(self, model_path: str, device: str = "cuda"):
        """
        Initialize LivePortrait renderer.

        Args:
            model_path: Path to pretrained model weights
            device: Device to use ('cuda' or 'cpu')
        """
        self.model_path = Path(model_path)
        self.device = device
        self.is_ready = False
        self.model_version = "1.0.0"

        # Add LivePortrait to Python path
        liveportrait_path = Path("/app/liveportrait/src")
        if str(liveportrait_path) not in sys.path:
            sys.path.insert(0, str(liveportrait_path))

        self.pipeline = None
        self.output_dir = Path("/tmp/liveportrait_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def initialize(self):
        """Initialize LivePortrait model and pipeline."""
        try:
            logger.info("Loading LivePortrait pipeline...")

            # Import LivePortrait modules
            # Note: Actual imports depend on LivePortrait's internal structure
            # This is a placeholder for the real implementation
            from config.inference_config import InferenceConfig
            from live_portrait_pipeline import LivePortraitPipeline

            # Configure inference
            config = InferenceConfig()
            config.models_config = str(self.model_path)

            # Initialize pipeline
            loop = asyncio.get_event_loop()
            self.pipeline = await loop.run_in_executor(
                None,
                lambda: LivePortraitPipeline(
                    inference_cfg=config,
                    device=self.device
                )
            )

            logger.info(f"Pipeline loaded on {self.device}")

            # Warm up model with dummy inference
            await self._warmup()

            self.is_ready = True
            logger.info("LivePortrait renderer ready")

        except Exception as e:
            logger.error(f"Failed to initialize renderer: {e}", exc_info=True)
            raise

    async def _warmup(self):
        """Warm up model with dummy inference for better initial performance."""
        try:
            logger.info("Warming up model...")
            dummy_image = np.zeros((512, 512, 3), dtype=np.uint8)
            dummy_image[:] = (128, 128, 128)  # Gray image

            # Run a quick inference
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._process_image(dummy_image, EmotionType.NEUTRAL, 0.5)
            )

            logger.info("Model warmup complete")
        except Exception as e:
            logger.warning(f"Warmup failed (non-critical): {e}")

    def _process_image(
        self,
        image: np.ndarray,
        emotion: EmotionType,
        intensity: float
    ) -> np.ndarray:
        """
        Process image with LivePortrait (synchronous, runs in executor).

        Args:
            image: Input image as numpy array (RGB)
            emotion: Target emotion
            intensity: Emotion intensity (0-1)

        Returns:
            Processed image as numpy array
        """
        # Get emotion mapping
        emotion_map = self.EMOTION_MAPPINGS[emotion]

        # Apply intensity scaling
        scaled_params = {
            'rotation_x': emotion_map.rotation_x * intensity,
            'rotation_y': emotion_map.rotation_y * intensity,
            'rotation_z': emotion_map.rotation_z * intensity,
            'expression_scale': 1.0 + (emotion_map.expression_scale - 1.0) * intensity,
            'mouth_open': emotion_map.mouth_open * intensity,
            'eye_open': 1.0 - (1.0 - emotion_map.eye_open) * intensity,
            'eyebrow_raise': emotion_map.eyebrow_raise * intensity,
        }

        # TODO: Implement actual LivePortrait inference
        # This is a placeholder that needs to be replaced with real LivePortrait API calls
        # The actual implementation will depend on LivePortrait's pipeline API

        # For now, return the input image (placeholder)
        # In real implementation, this would call:
        # output = self.pipeline.execute(image, motion_params=scaled_params)

        logger.warning("Using placeholder renderer - LivePortrait integration pending")
        return image

    async def render(
        self,
        image_data: bytes,
        request: RenderRequest
    ) -> RenderResponse:
        """
        Render avatar with specified emotion.

        Args:
            image_data: Source image bytes
            request: Render request with emotion parameters

        Returns:
            RenderResponse with output path and metadata
        """
        start_time = time.time()

        try:
            # Load and preprocess image
            image = Image.open(io.BytesIO(image_data)).convert("RGB")

            # Resize to target dimensions
            if request.width and request.height:
                image = image.resize((request.width, request.height), Image.Resampling.LANCZOS)

            # Convert to numpy array
            image_np = np.array(image)

            # Run inference in executor to avoid blocking event loop
            loop = asyncio.get_event_loop()
            output_np = await loop.run_in_executor(
                None,
                self._process_image,
                image_np,
                request.emotion,
                request.intensity
            )

            # Convert back to PIL Image
            output_image = Image.fromarray(output_np.astype('uint8'))

            # Save output
            output_filename = f"{uuid.uuid4()}.{request.output_format}"
            output_path = self.output_dir / output_filename
            output_image.save(output_path, format=request.output_format.upper())

            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000

            return RenderResponse(
                output_path=str(output_path),
                filename=output_filename,
                emotion=request.emotion,
                intensity=request.intensity,
                latency_ms=round(latency_ms, 2),
                gpu_used=(self.device == "cuda"),
                model_version=self.model_version,
                width=output_image.width,
                height=output_image.height
            )

        except Exception as e:
            logger.error(f"Render failed: {e}", exc_info=True)
            raise

    async def cleanup(self):
        """Clean up resources."""
        logger.info("Cleaning up renderer resources...")
        self.is_ready = False

        # Clear CUDA cache if using GPU
        if self.device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("Cleanup complete")

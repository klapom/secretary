"""
Data models for LivePortrait Avatar Service.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class EmotionType(str, Enum):
    """Supported emotion types for avatar rendering."""
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SAD = "sad"
    SURPRISED = "surprised"
    ANGRY = "angry"
    DISGUSTED = "disgusted"
    FEARFUL = "fearful"


class RenderRequest(BaseModel):
    """Request model for avatar rendering."""
    emotion: EmotionType = Field(
        default=EmotionType.NEUTRAL,
        description="Target emotion to render"
    )
    intensity: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Emotion intensity (0.0 = subtle, 1.0 = extreme)"
    )
    output_format: str = Field(
        default="png",
        description="Output image format (png, jpg, webp)"
    )
    width: Optional[int] = Field(
        default=512,
        ge=256,
        le=1024,
        description="Output image width"
    )
    height: Optional[int] = Field(
        default=512,
        ge=256,
        le=1024,
        description="Output image height"
    )


class RenderResponse(BaseModel):
    """Response model for avatar rendering."""
    output_path: str = Field(description="Path to rendered output image")
    filename: str = Field(description="Output filename")
    emotion: EmotionType = Field(description="Applied emotion")
    intensity: float = Field(description="Applied intensity")
    latency_ms: float = Field(description="Rendering latency in milliseconds")
    gpu_used: bool = Field(description="Whether GPU was used for rendering")
    model_version: str = Field(description="LivePortrait model version")
    width: int = Field(description="Output image width")
    height: int = Field(description="Output image height")


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str = Field(description="Service status (healthy, initializing, degraded)")
    gpu_available: bool = Field(description="GPU availability")
    gpu_name: Optional[str] = Field(default=None, description="GPU device name")
    cuda_version: Optional[str] = Field(default=None, description="CUDA version")
    model_loaded: bool = Field(description="Whether LivePortrait model is loaded")


class EmotionMapping(BaseModel):
    """Mapping configuration for emotion to motion parameters."""
    emotion: EmotionType
    rotation_x: float = Field(ge=-1.0, le=1.0, description="Head rotation X axis")
    rotation_y: float = Field(ge=-1.0, le=1.0, description="Head rotation Y axis")
    rotation_z: float = Field(ge=-1.0, le=1.0, description="Head rotation Z axis")
    expression_scale: float = Field(ge=0.0, le=2.0, description="Expression intensity scale")
    mouth_open: float = Field(ge=0.0, le=1.0, description="Mouth openness (0-1)")
    eye_open: float = Field(ge=0.0, le=1.0, description="Eye openness (0-1)")
    eyebrow_raise: float = Field(ge=-1.0, le=1.0, description="Eyebrow position (-1=down, 1=up)")

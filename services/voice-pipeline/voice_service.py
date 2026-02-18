#!/usr/bin/env python3
"""
Voice Pipeline Service - XTTS + Whisper with GPU acceleration
Provides TTS (Text-to-Speech) and STT (Speech-to-Text) capabilities
"""

import os
import tempfile
import time
from pathlib import Path
from typing import Optional, Dict, List

import torch
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import whisper
from faster_whisper import WhisperModel

# Initialize FastAPI
app = FastAPI(
    title="Voice Pipeline Service",
    description="TTS and STT service with GPU acceleration",
    version="0.1.0"
)

# Global model instances
whisper_model: Optional[WhisperModel] = None
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

# Configuration
DEFAULT_WHISPER_MODEL = "base"  # Options: tiny, base, small, medium, large
SUPPORTED_LANGUAGES = ["en", "de", "fr", "es", "it", "pt", "nl", "pl", "ru", "ja", "zh"]
VOICE_PROFILES_DIR = Path("./voice_profiles")
VOICE_PROFILES_DIR.mkdir(exist_ok=True)


class TTSRequest(BaseModel):
    """Text-to-Speech request"""
    text: str
    language: str = "en"
    voice_id: Optional[str] = None
    speed: float = 1.0
    emotion: str = "neutral"


class STTResponse(BaseModel):
    """Speech-to-Text response"""
    text: str
    language: str
    confidence: float
    duration: float
    segments: Optional[List[Dict]] = None


class VoiceProfile(BaseModel):
    """Voice profile for cloning"""
    name: str
    description: Optional[str] = None
    language: str = "en"


@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    global whisper_model

    print(f"🚀 Starting Voice Pipeline Service")
    print(f"📍 Device: {device}")
    print(f"🔢 Compute type: {compute_type}")

    # Load Whisper model (faster-whisper for better performance)
    print(f"🎤 Loading Whisper model ({DEFAULT_WHISPER_MODEL})...")
    start_time = time.time()

    whisper_model = WhisperModel(
        DEFAULT_WHISPER_MODEL,
        device=device,
        compute_type=compute_type,
        download_root="./models"
    )

    load_time = time.time() - start_time
    print(f"✅ Whisper loaded in {load_time:.2f}s")

    # TTS initialization (placeholder until we get XTTS working)
    print("⏳ TTS (XTTS) will be initialized separately")
    print("✅ Voice Pipeline Service ready!")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Voice Pipeline",
        "status": "running",
        "device": device,
        "whisper_loaded": whisper_model is not None,
        "tts_loaded": False,  # TODO: Update when XTTS is added
        "supported_languages": SUPPORTED_LANGUAGES
    }


@app.get("/health")
async def health():
    """Detailed health check"""
    return {
        "status": "healthy",
        "models": {
            "whisper": {
                "loaded": whisper_model is not None,
                "model": DEFAULT_WHISPER_MODEL,
                "device": device,
                "compute_type": compute_type
            },
            "xtts": {
                "loaded": False,  # TODO: Update when implemented
                "status": "not_implemented"
            }
        },
        "gpu": {
            "available": torch.cuda.is_available(),
            "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
        }
    }


@app.post("/stt/transcribe", response_model=STTResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: str = Form("transcribe"),  # transcribe or translate
    include_segments: bool = Form(False)
):
    """
    Transcribe audio file to text using Whisper

    Args:
        file: Audio file (mp3, wav, m4a, etc.)
        language: Optional language code (auto-detect if not provided)
        task: "transcribe" or "translate" (to English)
        include_segments: Include word-level timestamps

    Returns:
        Transcribed text with metadata
    """
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model not loaded")

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        start_time = time.time()

        # Transcribe with faster-whisper
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=language,
            task=task,
            beam_size=5,
            vad_filter=True,  # Voice Activity Detection
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        # Collect segments
        all_segments = []
        full_text = ""

        for segment in segments:
            segment_dict = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "confidence": segment.avg_logprob
            }
            all_segments.append(segment_dict)
            full_text += segment.text + " "

        duration = time.time() - start_time

        # Calculate average confidence
        avg_confidence = np.mean([s["confidence"] for s in all_segments]) if all_segments else 0.0

        return STTResponse(
            text=full_text.strip(),
            language=info.language,
            confidence=float(avg_confidence),
            duration=duration,
            segments=all_segments if include_segments else None
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        # Cleanup temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/tts/synthesize")
async def synthesize_speech(request: TTSRequest):
    """
    Generate speech from text using XTTS

    NOTE: This is a placeholder. XTTS integration pending.
    """
    return JSONResponse(
        status_code=501,
        content={
            "error": "Not Implemented",
            "message": "XTTS integration is in progress. Use alternative TTS for now.",
            "alternatives": [
                "node-edge-tts (already available in main project)",
                "ElevenLabs API",
                "OpenAI TTS API"
            ]
        }
    )


@app.post("/voice/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    language: str = Form("en"),
    reference_audio: UploadFile = File(...)
):
    """
    Clone a voice from reference audio

    NOTE: Requires XTTS implementation
    """
    return JSONResponse(
        status_code=501,
        content={
            "error": "Not Implemented",
            "message": "Voice cloning requires XTTS. Implementation pending."
        }
    )


@app.get("/voice/profiles")
async def list_voice_profiles():
    """List available voice profiles"""
    profiles = []
    for profile_dir in VOICE_PROFILES_DIR.iterdir():
        if profile_dir.is_dir():
            metadata_file = profile_dir / "metadata.json"
            if metadata_file.exists():
                import json
                with open(metadata_file) as f:
                    profiles.append(json.load(f))

    return {"profiles": profiles}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")

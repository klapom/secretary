"""
Whisper STT FastAPI Service
Speech-to-text with GPU acceleration using faster-whisper
"""

import torch
from fastapi import FastAPI, HTTPException, File, UploadFile
from pydantic import BaseModel
import uvicorn
from faster_whisper import WhisperModel
import tempfile
import os

app = FastAPI(title="Whisper STT Service", version="1.0.0")

# Global Whisper model
whisper_model = None

class TranscriptionResponse(BaseModel):
    """Response model for transcription"""
    text: str
    language: str
    confidence: float | None = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    gpu_available: bool
    model_loaded: bool

@app.on_event("startup")
async def load_model():
    """Load Whisper model on startup"""
    global whisper_model

    print("🔄 Loading Whisper model...")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        whisper_model = WhisperModel(
            "base",  # Can be: tiny, base, small, medium, large
            device=device,
            compute_type=compute_type
        )

        print(f"✅ Whisper model loaded on {device}")

    except Exception as e:
        print(f"❌ Failed to load Whisper model: {e}")
        whisper_model = None

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    gpu_available = torch.cuda.is_available()

    return HealthResponse(
        status="healthy" if whisper_model is not None else "unhealthy",
        gpu_available=gpu_available,
        model_loaded=whisper_model is not None
    )

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str | None = None
):
    """
    Transcribe audio file to text

    Args:
        audio: Audio file (WAV, MP3, M4A, etc.)
        language: Optional language hint (en, de, es, etc.)

    Returns:
        Transcription result with detected language
    """
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Save uploaded audio to temp file
        audio_bytes = await audio.read()

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(audio_bytes)
            audio_path = f.name

        try:
            # Transcribe
            segments, info = whisper_model.transcribe(
                audio_path,
                language=language,
                vad_filter=True,  # Voice activity detection
                beam_size=5
            )

            # Combine segments into full text
            text = " ".join([segment.text for segment in segments])

            return TranscriptionResponse(
                text=text.strip(),
                language=info.language,
                confidence=info.language_probability
            )

        finally:
            # Clean up temp file
            os.unlink(audio_path)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.post("/detect-language")
async def detect_language(audio: UploadFile = File(...)):
    """
    Detect language from audio without full transcription

    Args:
        audio: Audio file

    Returns:
        Detected language code and confidence
    """
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        audio_bytes = await audio.read()

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(audio_bytes)
            audio_path = f.name

        try:
            # Use only first 30 seconds for language detection
            _, info = whisper_model.transcribe(
                audio_path,
                beam_size=1,
                max_initial_timestamp=30.0
            )

            return {
                "language": info.language,
                "confidence": info.language_probability
            }

        finally:
            os.unlink(audio_path)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Language detection failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8083,
        log_level="info"
    )

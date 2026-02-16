"""
XTTS (Coqui TTS) FastAPI Service
Voice synthesis with GPU acceleration
"""

import torch
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
import io
from TTS.api import TTS

app = FastAPI(title="XTTS Service", version="1.0.0")

# Global TTS model
tts_model = None

class SynthesizeRequest(BaseModel):
    """Request model for voice synthesis"""
    text: str
    language: str = "en"
    speaker_wav: str | None = None  # Path to reference audio for voice cloning

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    gpu_available: bool
    gpu_name: str | None
    model_loaded: bool

@app.on_event("startup")
async def load_model():
    """Load XTTS model on startup"""
    global tts_model

    print("🔄 Loading XTTS model...")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        print(f"✅ XTTS model loaded on {device}")

    except Exception as e:
        print(f"❌ Failed to load XTTS model: {e}")
        tts_model = None

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return HealthResponse(
        status="healthy" if tts_model is not None else "unhealthy",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        model_loaded=tts_model is not None
    )

@app.post("/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """
    Synthesize speech from text

    Args:
        text: Text to synthesize
        language: Language code (en, de, es, fr, etc.)
        speaker_wav: Optional reference audio for voice cloning

    Returns:
        Audio stream (WAV)
    """
    if tts_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Synthesize speech
        wav = tts_model.tts(
            text=request.text,
            language=request.language,
            speaker_wav=request.speaker_wav
        )

        # Convert to bytes
        audio_buffer = io.BytesIO()
        # TODO: Save wav to audio_buffer
        # import soundfile as sf
        # sf.write(audio_buffer, wav, 24000, format='WAV')

        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")

@app.post("/synthesize-with-voice-clone")
async def synthesize_with_clone(
    text: str,
    language: str = "en",
    speaker_audio: UploadFile = File(...)
):
    """
    Synthesize speech with voice cloning from uploaded audio

    Args:
        text: Text to synthesize
        language: Language code
        speaker_audio: Reference audio file for voice cloning

    Returns:
        Audio stream (WAV)
    """
    if tts_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Save uploaded audio temporarily
        audio_bytes = await speaker_audio.read()

        # TODO: Save to temp file and use for voice cloning
        # with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        #     f.write(audio_bytes)
        #     speaker_wav_path = f.name

        # Synthesize with voice clone
        # wav = tts_model.tts(
        #     text=text,
        #     language=language,
        #     speaker_wav=speaker_wav_path
        # )

        # Placeholder
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice cloning failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8082,
        log_level="info"
    )

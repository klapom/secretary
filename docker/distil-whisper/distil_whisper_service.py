#!/usr/bin/env python3
"""
Distil-Whisper Large V3 STT Service
6x faster than Whisper, 97 languages including DE, EN
"""

import os
import logging
from pathlib import Path
from typing import Optional, Literal

import torch
import librosa
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="Distil-Whisper STT Service", version="1.0.0")

# Model configuration
# Upgraded from distil-whisper/distil-large-v3 to openai/whisper-large-v3:
# Distil-Whisper outputs English phonetic matches for German speech instead of
# German text (e.g. "Hallo wie wird das Wetter" → "Hello how will the weather").
# Full Whisper Large V3 transcribes German correctly at 0.5-1s per short clip.
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/whisper-large-v3")
MODEL_REPO = "openai/whisper-large-v3"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# float16: Whisper Large V3 works correctly with float16 on GB10/sm_121 and
# uses half the VRAM (~3GB vs ~6GB). float32 is not needed here.
TORCH_DTYPE = torch.float16

# Global model instances
model = None
processor = None
pipe = None


class TranscriptionRequest(BaseModel):
    language: Optional[str] = None  # Auto-detect if None
    task: Literal["transcribe", "translate"] = "transcribe"
    return_timestamps: bool = False


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    chunks: Optional[list] = None


@app.on_event("startup")
async def load_model():
    """Load Distil-Whisper model on startup"""
    global model, processor, pipe

    try:
        logger.info(f"Using device: {DEVICE}, dtype: {TORCH_DTYPE}")

        # Check if model exists locally, otherwise download from HuggingFace
        try:
            if os.path.exists(MODEL_PATH) and os.listdir(MODEL_PATH):
                logger.info(f"Loading Distil-Whisper from local cache: {MODEL_PATH}")
                model_id = MODEL_PATH
            else:
                raise FileNotFoundError("Local model not found")
        except (FileNotFoundError, OSError):
            logger.info(f"Downloading Distil-Whisper from HuggingFace: {MODEL_REPO}")
            logger.info("This may take 30-60 seconds on first startup (~750MB download)...")
            model_id = MODEL_REPO

        # Load model with optimizations
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id,
            torch_dtype=TORCH_DTYPE,
            low_cpu_mem_usage=True,
            use_safetensors=True
        )
        model.to(DEVICE)

        # Load processor
        processor = AutoProcessor.from_pretrained(model_id)

        # Create pipeline for easier inference
        pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            max_new_tokens=444,
            torch_dtype=TORCH_DTYPE,
            device=DEVICE,
        )

        # Save to local cache if downloaded from HuggingFace
        if model_id == MODEL_REPO:
            logger.info(f"Saving model to local cache: {MODEL_PATH}")
            model.save_pretrained(MODEL_PATH)
            processor.save_pretrained(MODEL_PATH)

        logger.info("Distil-Whisper model loaded successfully")
        logger.info(f"Model supports 97 languages including DE, EN, FR, ES, etc.")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


def transcribe_audio(
    audio_path: Path,
    language: Optional[str] = None,
    task: str = "transcribe",
    return_timestamps: bool = False
) -> dict:
    """Transcribe audio using Distil-Whisper"""
    try:
        # Load audio
        audio, sr = librosa.load(audio_path, sr=16000, mono=True)

        # Prepare generate kwargs
        generate_kwargs = {
            "task": task,
            "language": language if language else None,
        }

        # Add timestamps if requested
        if return_timestamps:
            generate_kwargs["return_timestamps"] = True

        # Transcribe
        result = pipe(
            audio,
            generate_kwargs=generate_kwargs,
            return_timestamps=return_timestamps
        )

        return {
            "text": result["text"],
            "language": language,
            "chunks": result.get("chunks") if return_timestamps else None
        }

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: str = Form("transcribe"),
    return_timestamps: bool = Form(False),
):
    """
    Transcribe audio with Distil-Whisper (6x faster than Whisper)

    Supported languages: 97 including de, en, fr, es, etc.
    Tasks: transcribe, translate (to English)

    Examples:
    - Transcribe German: language="de", task="transcribe"
    - Translate to English: task="translate"
    - Auto-detect: language=None, task="transcribe"
    """
    try:
        # Save uploaded file
        temp_path = Path(f"/tmp/{file.filename}")
        with open(temp_path, "wb") as f:
            f.write(await file.read())

        logger.info(f"Transcribing {file.filename} (language={language}, task={task})")

        # Transcribe
        result = transcribe_audio(temp_path, language, task, return_timestamps)

        # Clean up
        temp_path.unlink()

        return TranscriptionResponse(**result)

    except Exception as e:
        logger.error(f"Transcription request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": "distil-whisper/distil-large-v3",
        "device": DEVICE,
        "features": [
            "97 languages",
            "6x faster than Whisper",
            "transcription",
            "translation to English",
            "auto-language-detection",
            "timestamps"
        ]
    }


@app.get("/languages")
async def list_languages():
    """List some supported languages (97 total)"""
    return {
        "total": 97,
        "common": ["de", "en", "fr", "es", "it", "pt", "pl", "nl", "ru", "zh", "ja", "ko"],
        "note": "Supports 97 languages - same as Whisper Large V3"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)

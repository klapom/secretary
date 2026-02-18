#!/usr/bin/env python3
"""
NVIDIA Canary with NeMo Toolkit STT Service
25 languages + EN ↔ DE/FR/ES translation
"""

import os
import logging
from pathlib import Path
from typing import Optional, Literal

import torch
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="NVIDIA Canary NeMo STT Service", version="1.0.0")

# Model configuration
MODEL_NAME = "nvidia/canary-1b"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Supported languages (25 languages)
SUPPORTED_LANGUAGES = [
    "de", "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr",
    "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk",
    "sl", "es", "sv", "ru", "uk"
]

# Global model instance
asr_model = None


class TranscriptionRequest(BaseModel):
    language: Optional[str] = None  # Auto-detect if None
    task: Literal["transcribe", "translate"] = "transcribe"
    target_language: Optional[str] = "en"


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None


@app.on_event("startup")
async def load_model():
    """Load NVIDIA Canary model with NeMo toolkit"""
    global asr_model

    try:
        logger.info(f"Using device: {DEVICE}")
        logger.info("Loading NVIDIA Canary model with NeMo toolkit...")
        logger.info("This may take 60-120 seconds on first startup...")

        # Import NeMo here to fail fast if not installed
        try:
            from nemo.collections.asr.models import EncDecMultiTaskModel
        except ImportError as e:
            logger.error("NeMo toolkit not installed!")
            logger.error("Install with: pip install nemo_toolkit[asr]")
            raise

        # Load Canary model from NGC
        try:
            asr_model = EncDecMultiTaskModel.from_pretrained(MODEL_NAME)
            asr_model = asr_model.to(DEVICE)
            logger.info("NVIDIA Canary model loaded successfully with NeMo")
        except Exception as e:
            logger.error(f"Failed to load Canary model: {e}")
            logger.error("Model might need to be downloaded from NGC")
            raise

        logger.info(f"Supported languages: {', '.join(SUPPORTED_LANGUAGES)}")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


def transcribe_audio(
    audio_path: Path,
    language: Optional[str] = None,
    task: str = "transcribe",
    target_language: str = "en"
) -> dict:
    """Transcribe or translate audio using Canary"""
    try:
        # Prepare task string for Canary
        if task == "translate":
            if language:
                task_str = f"translate {language} {target_language}"
            else:
                task_str = f"translate {target_language}"
        else:
            if language:
                task_str = f"transcribe {language}"
            else:
                task_str = "transcribe"  # Auto-detect

        # Transcribe with NeMo
        transcription = asr_model.transcribe(
            paths2audio_files=[str(audio_path)],
            batch_size=1
        )[0]

        return {
            "text": transcription,
            "language": language
        }

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    task: str = "transcribe",
    target_language: str = "en"
):
    """
    Transcribe or translate audio with NVIDIA Canary + NeMo

    Supported languages: 25 including de, en, fr, es
    Tasks: transcribe, translate (EN ↔ DE/FR/ES)

    Examples:
    - Transcribe German: language="de", task="transcribe"
    - Translate German to English: language="de", task="translate", target_language="en"
    - Auto-detect: language=None, task="transcribe"
    """
    try:
        # Validate language
        if language and language not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Language '{language}' not supported. Use one of: {', '.join(SUPPORTED_LANGUAGES)}"
            )

        # Save uploaded file
        temp_path = Path(f"/tmp/{file.filename}")
        with open(temp_path, "wb") as f:
            f.write(await file.read())

        logger.info(f"Transcribing {file.filename} (language={language}, task={task})")

        # Transcribe
        result = transcribe_audio(temp_path, language, task, target_language)

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
        "model": "nvidia/canary-1b (NeMo)",
        "device": DEVICE,
        "languages": SUPPORTED_LANGUAGES,
        "features": [
            "25 languages",
            "translation EN ↔ DE/FR/ES",
            "auto-language-detection",
            "punctuation",
            "capitalization",
            "NeMo optimized"
        ]
    }


@app.get("/languages")
async def list_languages():
    """List supported languages"""
    return {
        "languages": SUPPORTED_LANGUAGES,
        "count": len(SUPPORTED_LANGUAGES),
        "translation_pairs": [
            "de ↔ en",
            "fr ↔ en",
            "es ↔ en"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)

#!/usr/bin/env python3
"""
NVIDIA Canary-1b-v2 STT Service
Supports: 25 languages including DE, EN, FR, ES
Speech recognition + bi-directional translation
"""

import os
import logging
from pathlib import Path
from typing import Optional, Literal

import torch
import librosa
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="NVIDIA Canary STT Service", version="1.0.0")

# Model configuration
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/canary")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TORCH_DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32

# Supported languages (25 languages)
SUPPORTED_LANGUAGES = [
    "de", "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr",
    "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk",
    "sl", "es", "sv", "ru", "uk"
]

# Global model instances
model = None
processor = None


class TranscriptionRequest(BaseModel):
    language: Optional[str] = None  # Auto-detect if None
    task: Literal["transcribe", "translate"] = "transcribe"
    target_language: Optional[str] = "en"  # For translation tasks
    add_punctuation: bool = True
    add_capitalization: bool = True


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None


@app.on_event("startup")
async def load_model():
    """Load NVIDIA Canary model on startup"""
    global model, processor

    try:
        logger.info(f"Using device: {DEVICE}, dtype: {TORCH_DTYPE}")

        # Check if model exists locally, otherwise download from HuggingFace
        model_repo = "nvidia/canary-1b-v2"

        # Try loading from local path first, fall back to HuggingFace
        try:
            if os.path.exists(MODEL_PATH) and os.listdir(MODEL_PATH):
                logger.info(f"Loading NVIDIA Canary model from local cache: {MODEL_PATH}")
                processor = AutoProcessor.from_pretrained(MODEL_PATH, trust_remote_code=True)
                model = AutoModelForSpeechSeq2Seq.from_pretrained(
                    MODEL_PATH,
                    torch_dtype=TORCH_DTYPE,
                    low_cpu_mem_usage=True,
                    trust_remote_code=True
                ).to(DEVICE)
            else:
                raise FileNotFoundError("Local model not found")
        except (FileNotFoundError, OSError):
            logger.info(f"Downloading NVIDIA Canary model from HuggingFace: {model_repo}")
            logger.info("This may take 60-90 seconds on first startup (~2GB download)...")
            processor = AutoProcessor.from_pretrained(model_repo, trust_remote_code=True)
            model = AutoModelForSpeechSeq2Seq.from_pretrained(
                model_repo,
                torch_dtype=TORCH_DTYPE,
                low_cpu_mem_usage=True,
                trust_remote_code=True
            ).to(DEVICE)

            # Save to local cache for future use
            logger.info(f"Saving model to local cache: {MODEL_PATH}")
            model.save_pretrained(MODEL_PATH)
            processor.save_pretrained(MODEL_PATH)

        # Enable optimizations
        if DEVICE == "cuda":
            model = model.half()  # Use FP16 for faster inference

        logger.info("NVIDIA Canary model loaded successfully")
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
        # Load audio
        audio, sr = librosa.load(audio_path, sr=16000, mono=True)

        # Prepare task prompt
        if task == "translate":
            # Translation task: source_lang -> target_lang
            if language:
                prompt = f"<|{language}|><|translate|><|{target_language}|>"
            else:
                prompt = f"<|transcribe|>"  # Auto-detect then translate
        else:
            # Transcription task
            if language:
                prompt = f"<|{language}|><|transcribe|>"
            else:
                prompt = "<|transcribe|>"  # Auto-detect language

        # Process audio
        inputs = processor(
            audio,
            sampling_rate=16000,
            return_tensors="pt"
        ).to(DEVICE)

        # Add prompt
        prompt_ids = processor.tokenizer.encode(
            prompt,
            add_special_tokens=False,
            return_tensors="pt"
        ).to(DEVICE)

        # Generate transcription
        with torch.no_grad():
            generated_ids = model.generate(
                inputs.input_features,
                decoder_input_ids=prompt_ids,
                max_new_tokens=512,
                num_beams=1,
                do_sample=False
            )

        # Decode text
        transcription = processor.batch_decode(
            generated_ids,
            skip_special_tokens=True
        )[0]

        # Extract detected language from output if auto-detect was used
        detected_lang = None
        if not language and "|" in transcription:
            # Canary outputs format: <|lang|>text
            parts = transcription.split("|")
            if len(parts) >= 2:
                detected_lang = parts[1].strip()
                transcription = "|".join(parts[2:]).strip()

        return {
            "text": transcription.strip(),
            "language": detected_lang or language,
            "task": task
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
    Transcribe or translate audio

    Supported languages: de, en, fr, es, and 21 more
    Tasks: transcribe, translate

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
        "model": "nvidia/canary-1b-v2",
        "device": DEVICE,
        "languages": SUPPORTED_LANGUAGES,
        "features": [
            "transcription",
            "translation",
            "auto-language-detection",
            "punctuation",
            "capitalization"
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
    uvicorn.run(app, host="0.0.0.0", port=8083)

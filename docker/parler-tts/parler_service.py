#!/usr/bin/env python3
"""
Parler-TTS Mini Multilingual Service
Supports: EN, DE, FR, ES, PT, PL, IT, NL
Voice control via natural language descriptions
"""

import os
import logging
from pathlib import Path
from typing import Optional

import torch
import soundfile as sf
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="Parler-TTS Service", version="1.0.0")

# Model configuration
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/parler-tts")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
OUTPUT_DIR = Path("/tmp/parler-tts-output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Global model instances
model = None
tokenizer = None


class TTSRequest(BaseModel):
    text: str
    description: Optional[str] = "A clear, neutral voice with moderate speed"
    language: Optional[str] = "en"  # en, de, fr, es, pt, pl, it, nl
    speaker_id: Optional[str] = None


class VoiceDescription:
    """Predefined voice descriptions for common use cases"""

    # English voices
    EN_NEUTRAL = "A clear, neutral voice with moderate speed"
    EN_WARM_FEMALE = "A warm, friendly female voice speaking slowly"
    EN_PROFESSIONAL_MALE = "A professional male voice with clear articulation"

    # German voices
    DE_NEUTRAL = "Eine klare, neutrale Stimme mit moderater Geschwindigkeit"
    DE_WARM_FEMALE = "Eine warme, freundliche weibliche Stimme"
    DE_PROFESSIONAL_MALE = "Eine professionelle männliche Stimme"

    # French voices
    FR_NEUTRAL = "Une voix claire et neutre avec une vitesse modérée"

    # Spanish voices
    ES_NEUTRAL = "Una voz clara y neutra con velocidad moderada"


@app.on_event("startup")
async def load_model():
    """Load Parler-TTS model on startup"""
    global model, tokenizer

    try:
        logger.info(f"Using device: {DEVICE}")

        # Check if model exists locally, otherwise download from HuggingFace
        model_repo = "parler-tts/parler-tts-mini-multilingual-v1.1"

        # Try loading from local path first, fall back to HuggingFace
        try:
            if os.path.exists(MODEL_PATH) and os.listdir(MODEL_PATH):
                logger.info(f"Loading Parler-TTS model from local cache: {MODEL_PATH}")
                model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL_PATH).to(DEVICE)
                tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
            else:
                raise FileNotFoundError("Local model not found")
        except (FileNotFoundError, OSError):
            logger.info(f"Downloading Parler-TTS model from HuggingFace: {model_repo}")
            logger.info("This may take 30-60 seconds on first startup...")
            model = ParlerTTSForConditionalGeneration.from_pretrained(model_repo).to(DEVICE)
            tokenizer = AutoTokenizer.from_pretrained(model_repo)

            # Save to local cache for future use
            logger.info(f"Saving model to local cache: {MODEL_PATH}")
            model.save_pretrained(MODEL_PATH)
            tokenizer.save_pretrained(MODEL_PATH)

        logger.info("Parler-TTS model loaded successfully")

        # Warm-up inference
        logger.info("Running warm-up inference...")
        _ = generate_speech("Hello world", VoiceDescription.EN_NEUTRAL)
        logger.info("Warm-up complete")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


def generate_speech(text: str, description: str, language: str = "en") -> Path:
    """Generate speech from text using Parler-TTS"""
    try:
        # Tokenize inputs
        input_ids = tokenizer(description, return_tensors="pt").input_ids.to(DEVICE)
        prompt_input_ids = tokenizer(text, return_tensors="pt").input_ids.to(DEVICE)

        # Generate speech
        with torch.no_grad():
            generation = model.generate(
                input_ids=input_ids,
                prompt_input_ids=prompt_input_ids,
                max_length=1000
            )

        audio_arr = generation.cpu().numpy().squeeze()

        # Save to file
        output_file = OUTPUT_DIR / f"output_{hash(text)}_{hash(description)}.wav"
        sf.write(output_file, audio_arr, model.config.sampling_rate)

        return output_file

    except Exception as e:
        logger.error(f"Speech generation failed: {e}")
        raise


@app.post("/synthesize")
async def synthesize(request: TTSRequest):
    """
    Synthesize speech from text

    Example descriptions:
    - English: "A warm, friendly female voice speaking slowly"
    - German: "Eine klare, professionelle männliche Stimme"
    - French: "Une voix féminine chaleureuse et amicale"
    """
    try:
        logger.info(f"Synthesizing: '{request.text[:50]}...' in {request.language}")

        # Use predefined description if available
        if not request.description:
            if request.language == "de":
                request.description = VoiceDescription.DE_NEUTRAL
            elif request.language == "fr":
                request.description = VoiceDescription.FR_NEUTRAL
            elif request.language == "es":
                request.description = VoiceDescription.ES_NEUTRAL
            else:
                request.description = VoiceDescription.EN_NEUTRAL

        output_file = generate_speech(request.text, request.description, request.language)

        return FileResponse(
            output_file,
            media_type="audio/wav",
            filename="output.wav"
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": "parler-tts-mini-multilingual-v1.1",
        "device": DEVICE,
        "languages": ["en", "de", "fr", "es", "pt", "pl", "it", "nl"]
    }


@app.get("/voices")
async def list_voices():
    """List available voice descriptions"""
    return {
        "english": {
            "neutral": VoiceDescription.EN_NEUTRAL,
            "warm_female": VoiceDescription.EN_WARM_FEMALE,
            "professional_male": VoiceDescription.EN_PROFESSIONAL_MALE
        },
        "german": {
            "neutral": VoiceDescription.DE_NEUTRAL,
            "warm_female": VoiceDescription.DE_WARM_FEMALE,
            "professional_male": VoiceDescription.DE_PROFESSIONAL_MALE
        },
        "french": {
            "neutral": VoiceDescription.FR_NEUTRAL
        },
        "spanish": {
            "neutral": VoiceDescription.ES_NEUTRAL
        },
        "supported_languages": ["en", "de", "fr", "es", "pt", "pl", "it", "nl"]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)

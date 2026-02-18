#!/usr/bin/env python3
"""
XTTS v2 (Coqui TTS) FastAPI Service
Voice synthesis with voice cloning support
Supports: EN, DE, FR, ES, IT, PT, PL, NL, CS, AR, TR, RU, HU, KO, JA, ZH, HI
"""

import os
import io
import tempfile
import logging
from pathlib import Path
from typing import Optional

import torch
import soundfile as sf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="XTTS Service", version="2.0.0")

# Model configuration
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAMPLE_RATE = 24000  # XTTS v2 native sample rate

# Default built-in speaker (from speakers_xtts.pth — pre-trained human voice embeddings).
# espeak-ng is NOT suitable: it produces out-of-distribution speaker embeddings and causes
# unintelligible audio. Use a named built-in speaker instead.
DEFAULT_SPEAKER = os.environ.get("XTTS_DEFAULT_SPEAKER", "Sofia Hellen")

# Official XTTS v2 synthesis parameters (from research paper + HuggingFace model card).
# DO NOT use temperature < 0.5 or repetition_penalty > 12 — causes mumbling/noise.
SYNTH_TEMPERATURE = float(os.environ.get("XTTS_TEMPERATURE", "0.75"))
SYNTH_REPETITION_PENALTY = float(os.environ.get("XTTS_REPETITION_PENALTY", "10.0"))
SYNTH_TOP_K = int(os.environ.get("XTTS_TOP_K", "50"))
SYNTH_TOP_P = float(os.environ.get("XTTS_TOP_P", "0.85"))

# Hard cap on generated audio tokens to prevent runaway generation.
# 240 tokens ≈ 10-12s max output. Default 602 tokens = ~25s (too long for assistant use).
MAX_GEN_MEL_TOKENS = int(os.environ.get("XTTS_MAX_GEN_MEL_TOKENS", "240"))

# Supported languages (XTTS v2)
SUPPORTED_LANGUAGES = {
    "en": "English",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "pl": "Polish",
    "nl": "Dutch",
    "cs": "Czech",
    "ar": "Arabic",
    "tr": "Turkish",
    "ru": "Russian",
    "hu": "Hungarian",
    "ko": "Korean",
    "ja": "Japanese",
    "zh-cn": "Chinese",
    "hi": "Hindi",
}

# Global TTS model
tts_model = None


class SynthesizeRequest(BaseModel):
    text: str
    language: str = "en"
    speaker: Optional[str] = None      # Named built-in speaker (e.g. "Claribel Dervla")
    speaker_wav: Optional[str] = None  # Path to reference WAV for voice cloning (overrides speaker)


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    gpu_available: bool
    gpu_name: Optional[str] = None
    languages: list
    default_speaker: str


@app.on_event("startup")
async def load_model():
    """Load XTTS v2 model on startup."""
    global tts_model

    try:
        from TTS.api import TTS

        os.environ["COQUI_TOS_AGREED"] = "1"

        logger.info(f"Loading XTTS v2 model on device: {DEVICE}")
        logger.info("First startup: downloading ~1.8GB model - may take 60-120 seconds...")

        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        tts_model.to(DEVICE)

        # Cap max audio tokens. Default 602 = ~25s causes runaway generation.
        tts_model.synthesizer.tts_model.gpt.max_gen_mel_tokens = MAX_GEN_MEL_TOKENS

        logger.info(f"XTTS v2 loaded on {DEVICE}, default speaker: '{DEFAULT_SPEAKER}'")
        logger.info(f"Parameters: temperature={SYNTH_TEMPERATURE}, rep_penalty={SYNTH_REPETITION_PENALTY}, top_k={SYNTH_TOP_K}, top_p={SYNTH_TOP_P}, max_tokens={MAX_GEN_MEL_TOKENS}")

    except Exception as e:
        logger.error(f"Failed to load XTTS model: {e}")
        tts_model = None


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    return HealthResponse(
        status="healthy" if tts_model is not None else "loading",
        model_loaded=tts_model is not None,
        device=DEVICE,
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        languages=list(SUPPORTED_LANGUAGES.keys()),
        default_speaker=DEFAULT_SPEAKER,
    )


@app.get("/languages")
async def list_languages():
    """List supported languages."""
    return {
        "languages": SUPPORTED_LANGUAGES,
        "count": len(SUPPORTED_LANGUAGES),
        "model": "xtts_v2",
        "voice_cloning": True,
    }


@app.get("/speakers")
async def list_speakers():
    """List available built-in speakers."""
    if tts_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    speakers = tts_model.speakers or []
    return {"speakers": speakers, "count": len(speakers), "default": DEFAULT_SPEAKER}


def _synthesize(text: str, language: str, speaker: Optional[str], speaker_wav: Optional[str]) -> list:
    """Core synthesis call with official XTTS v2 parameters."""
    kwargs = dict(
        text=text,
        language=language,
        do_sample=True,
        temperature=SYNTH_TEMPERATURE,
        repetition_penalty=SYNTH_REPETITION_PENALTY,
        top_k=SYNTH_TOP_K,
        top_p=SYNTH_TOP_P,
    )
    if speaker_wav:
        kwargs["speaker_wav"] = speaker_wav
        kwargs["split_sentences"] = True  # safe with real audio uploads
    else:
        kwargs["speaker"] = speaker or DEFAULT_SPEAKER
        kwargs["split_sentences"] = False  # avoids inter-sentence artifacts with built-in speakers

    return tts_model.tts(**kwargs)


@app.post("/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """
    Synthesize speech from text.

    Uses built-in speaker by default (no reference audio needed).
    Provide speaker_wav path for voice cloning, or speaker name for a different built-in voice.

    Examples:
      {"text": "Hallo Welt", "language": "de"}
      {"text": "Hello", "language": "en", "speaker": "Daisy Studious"}
      {"text": "Hello", "language": "en", "speaker_wav": "/app/my_voice.wav"}
    """
    if tts_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet, please wait")

    if request.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{request.language}' not supported. Use: {', '.join(SUPPORTED_LANGUAGES.keys())}",
        )

    # Validate speaker_wav if provided
    speaker_wav = request.speaker_wav
    if speaker_wav and not os.path.exists(speaker_wav):
        raise HTTPException(status_code=400, detail=f"speaker_wav not found: {speaker_wav}")

    try:
        logger.info(f"Synthesizing [{request.language}]: '{request.text[:60]}'")

        wav = _synthesize(request.text, request.language, request.speaker, speaker_wav)

        audio_buffer = io.BytesIO()
        sf.write(audio_buffer, wav, SAMPLE_RATE, format="WAV")
        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"},
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthesize-with-voice-clone")
async def synthesize_with_voice_clone(
    text: str = Form(...),
    language: str = Form("en"),
    speaker_audio: UploadFile = File(...),
):
    """
    Synthesize speech with voice cloning from uploaded reference audio.

    Upload a 6-15 second clear human speech sample (WAV, clean, no background noise).
    NOTE: synthetic TTS audio (espeak-ng etc.) does NOT work as reference — human voice required.

    Args:
        text: Text to synthesize
        language: Language code (en, de, fr, es, ...)
        speaker_audio: Reference WAV (6-15 seconds, natural human speech, mono, 22-24kHz)
    """
    if tts_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet, please wait")

    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Language '{language}' not supported.")

    tmp_path = None
    try:
        audio_bytes = await speaker_audio.read()
        suffix = Path(speaker_audio.filename).suffix if speaker_audio.filename else ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        logger.info(f"Voice clone [{language}]: '{text[:60]}' with {speaker_audio.filename}")

        wav = _synthesize(text, language, speaker=None, speaker_wav=tmp_path)

        audio_buffer = io.BytesIO()
        sf.write(audio_buffer, wav, SAMPLE_RATE, format="WAV")
        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=cloned_speech.wav"},
        )

    except Exception as e:
        logger.error(f"Voice cloning failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082, log_level="info")

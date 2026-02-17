# Parler-TTS Mini Multilingual v1.1 - Attempt 2
# Strategy: Install parler-tts with --no-deps to bypass torch version conflict
# The NGC PyTorch container has a custom ARM64 build (2.2.0a0+81ea7a4) that
# pip doesn't recognize as satisfying torch>=2.0.0 (pre-release version).
# Fix: Install ALL deps except torch manually, then install parler-tts --no-deps.

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Step 1: Install parler-tts's runtime deps WITHOUT touching torch
# Pin transformers to 4.x - transformers 5.x requires torch>=2.4 but we have 2.2.0
# accelerate and datasets don't have the same restriction
RUN pip install --no-cache-dir \
    "transformers>=4.43.0,<5.0.0" \
    "accelerate>=0.25.0" \
    "datasets>=2.14.0"

# Step 2: Install parler-tts itself WITHOUT resolving deps
# (torch + transformers + accelerate already installed above)
RUN pip install --no-cache-dir --no-deps "parler-tts>=0.2.0"

# Step 3: Install dac (Descript Audio Codec) - parler-tts internal dependency
# (skipped by --no-deps above)
RUN pip install --no-cache-dir "descript-audio-codec"

# Step 3: Install remaining service deps (no torch here)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create models directory
RUN mkdir -p /app/models

# Copy service
COPY parler_service.py /app/

# Expose HTTP API port (8085 - separate from XTTS on 8082)
EXPOSE 8085

# Health check
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:8085/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV TRANSFORMERS_CACHE=/app/models
ENV HF_HOME=/app/models

CMD ["python3", "/app/parler_service.py"]

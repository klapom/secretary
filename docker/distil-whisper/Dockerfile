# Whisper Large V3 (openai/whisper-large-v3) STT Dockerfile for DGX Spark (ARM64)
# Upgraded from distil-whisper: distil-whisper outputs English phonetic matches
# for German speech instead of German text. Whisper Large V3 is fully multilingual.
# 1.5B parameters, ~3GB model, 97 languages including DE, EN

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install CUDA-enabled torch 2.10.0+cu130 from PyTorch's wheel index.
# The NGC base container has torch 2.2.0a0+81ea7a4 (pre-release, Jan 2024) which
# predates the GB10 Blackwell GPU and does NOT support sm_121.
# torch 2.10.0+cu130 (stable, CUDA 13.0) supports GB10/sm_121 and pip
# recognizes it as satisfying requirements.txt torch>=2.0.0 → no CPU downgrade.
RUN pip install --no-cache-dir \
    "torch==2.10.0+cu130" \
    "torchvision==0.25.0+cu130" \
    "torchaudio==2.10.0+cu130" \
    --index-url https://download.pytorch.org/whl/cu130

# Install Python dependencies (torch already satisfied, no downgrade to CPU)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pin transformers to 4.x — transformers 5.x changed Whisper pipeline API
# (generate_kwargs handling, forced_decoder_ids, etc.)
RUN pip install --no-cache-dir "transformers>=4.43.0,<5.0.0"

# Create models directory (models will be downloaded at runtime on first use)
RUN mkdir -p /app/models

# Copy service wrapper
COPY distil_whisper_service.py /app/

# Expose HTTP API port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8083/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV TRANSFORMERS_CACHE=/app/models

CMD ["python3", "/app/distil_whisper_service.py"]

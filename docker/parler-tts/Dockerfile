# Parler-TTS Mini Multilingual Dockerfile for DGX Spark (ARM64)
# Supports: EN, DE, FR, ES, PT, PL, IT, NL
# Voice cloning with natural language control

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

# Fix torch/torchvision compatibility BEFORE installing parler-tts
# Force reinstall with --force-reinstall to ensure compatibility
RUN pip install --no-cache-dir --force-reinstall torch==2.2.0 torchvision==0.17.0

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --no-deps parler-tts>=0.2.0
RUN pip install --no-cache-dir -r requirements.txt

# Create models directory (models will be downloaded at runtime on first use)
# Note: First startup will be slower (~30-60s) while downloading models
RUN mkdir -p /app/models

# Copy service wrapper
COPY parler_service.py /app/

# Expose HTTP API port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV TRANSFORMERS_CACHE=/app/models

CMD ["python3", "/app/parler_service.py"]

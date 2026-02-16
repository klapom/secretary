# Whisper STT Dockerfile for DGX Spark (CUDA 13.0)
# Speech-to-text service using faster-whisper

FROM nvidia/cuda:13.0.0-runtime-ubuntu24.04

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Download Whisper models
COPY model-cache.sh .
RUN chmod +x model-cache.sh && ./model-cache.sh

# Copy service wrapper
COPY whisper_service.py /app/

# Expose HTTP API port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8083/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0

CMD ["python3", "/app/whisper_service.py"]

# XTTS (Coqui TTS) Dockerfile for DGX Spark (CUDA 12.1)
# Voice synthesis service with GPU acceleration
# Note: Using 24.01 for Python 3.11 (TTS requires <3.12)

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download XTTS models (pre-trained)
COPY model-download.sh .
RUN chmod +x model-download.sh && ./model-download.sh

# Copy service wrapper
COPY xtts_service.py /app/

# Expose HTTP API port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV COQUI_TOS_AGREED=1

CMD ["python3", "/app/xtts_service.py"]

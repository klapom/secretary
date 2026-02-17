# NVIDIA Canary with NeMo Dockerfile for DGX Spark (ARM64)
# Uses NVIDIA NeMo toolkit for proper Canary model loading
# 25 languages + EN ↔ DE/FR/ES translation

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libsndfile1 \
    sox \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Upgrade PyTorch and torchvision
RUN pip install --no-cache-dir --upgrade torch>=2.4.0 torchvision>=0.19.0

# Install NeMo toolkit and dependencies
# Note: This is a large install (~2GB of packages)
RUN pip install --no-cache-dir \
    nemo_toolkit[asr]==2.0.0rc1 \
    Cython \
    packaging

# Install additional dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create models directory
RUN mkdir -p /app/models

# Copy service wrapper
COPY canary_nemo_service.py /app/

# Expose HTTP API port (8084 to avoid conflict with distil-whisper on 8083)
EXPOSE 8084

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8084/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV NEMO_CACHE=/app/models

CMD ["python3", "/app/canary_nemo_service.py"]

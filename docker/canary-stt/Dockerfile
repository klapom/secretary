# NVIDIA Canary-1b-v2 STT Dockerfile for DGX Spark (ARM64)
# Supports: 25 languages including DE, EN
# Speech recognition + translation (EN ↔ DE/FR/ES)

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libsndfile1 \
    sox \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade PyTorch and torchvision to 2.4+ (required for Canary)
# Must upgrade both together to avoid version conflicts
RUN pip install --no-cache-dir --upgrade torch>=2.4.0 torchvision>=0.19.0

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create models directory (models will be downloaded at runtime on first use)
# Note: NVIDIA Canary-1b-v2 requires special loading - done at runtime
RUN mkdir -p /app/models

# Copy service wrapper
COPY canary_service.py /app/

# Expose HTTP API port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8083/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV TRANSFORMERS_CACHE=/app/models

CMD ["python3", "/app/canary_service.py"]

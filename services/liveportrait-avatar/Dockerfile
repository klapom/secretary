# LivePortrait Avatar Service with CUDA 12.1 Support
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    git \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

# Create working directory
WORKDIR /app

# Install PyTorch with CUDA 12.1 support
# Using latest available version for ARM64
RUN pip install --no-cache-dir \
    torch \
    torchvision \
    torchaudio \
    --index-url https://download.pytorch.org/whl/cu121

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Clone LivePortrait repository
RUN git clone https://github.com/KwaiVGI/LivePortrait.git /app/liveportrait

# Install LivePortrait dependencies
WORKDIR /app/liveportrait
RUN pip install --no-cache-dir -r requirements.txt

# Download pretrained models
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='KwaiVGI/LivePortrait', \
    local_dir='./pretrained_weights', \
    local_dir_use_symlinks=False)"

# Copy our FastAPI application
WORKDIR /app
COPY app/ ./app/

# Expose API port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8001/health')"

# Run the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]

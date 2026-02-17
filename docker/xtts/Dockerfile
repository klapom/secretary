# XTTS v2 (Coqui TTS) Dockerfile for DGX Spark (ARM64)
# Voice synthesis with voice cloning (17 languages incl. DE + EN)
# Models downloaded at runtime on first startup (~1.8GB)

FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Rust via rustup (needs 1.82+ for sudachipy's indexmap dependency)
# apt's rustc is too old (1.75); sudachipy 0.6.10 requires Rust 1.82+
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Install CUDA-enabled torch 2.10.0+cu130 from PyTorch's wheel index.
# The NGC base container has torch 2.2.0a0+81ea7a4 (pre-release, Jan 2024) which
# predates the GB10 Blackwell GPU and does NOT support sm_121.
# torch 2.10.0+cu130 (stable, CUDA 13.0) supports GB10/sm_121 and pip
# recognizes it as satisfying TTS's torch>=2.1 requirement → TTS won't re-download.
RUN pip install --no-cache-dir \
    "torch==2.10.0+cu130" \
    "torchvision==0.25.0+cu130" \
    "torchaudio==2.10.0+cu130" \
    --index-url https://download.pytorch.org/whl/cu130

# Install Python dependencies (TTS will find torch 2.10.0+cu130 already installed)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Fix 2: Pin transformers to <4.43.0.
# Root cause of mumbling/unintelligible audio: transformers 4.43+ changed the
# attention mask behavior for models where pad_token_id == eos_token_id (which XTTS uses).
# This causes the GPT to attend to wrong positions → wrong phoneme tokens → garbled audio.
# transformers 4.42.x is the last version with correct XTTS generation behavior.
# Note: BeamSearchScorer and GenerationMixin patches are NOT needed for <4.43.0.
RUN pip install --no-cache-dir "transformers>=4.33.0,<4.43.0"

# Fix 4: PyTorch 2.6+ changed torch.load default to weights_only=True, but
# XTTS model files use pickle with TTS-internal classes (not weights_only safe).
# Patch TTS's load_fsspec to always pass weights_only=False.
RUN sed -i 's|return torch.load(f, map_location=map_location, \*\*kwargs)|return torch.load(f, map_location=map_location, weights_only=False, **kwargs)|g' \
    /usr/local/lib/python3.10/dist-packages/TTS/utils/io.py

# Fix 5: torchaudio 2.9+ requires torchcodec for torchaudio.load, but torchcodec
# is not available for aarch64. Patch TTS's load_audio in xtts.py to use soundfile.
RUN python3 -c "f='/usr/local/lib/python3.10/dist-packages/TTS/tts/models/xtts.py'; c=open(f).read(); old='    audio, lsr = torchaudio.load(audiopath)'; new='    import soundfile as sf\n    audio_np, lsr = sf.read(audiopath, dtype=\"float32\", always_2d=True)\n    audio = __import__(\"torch\").from_numpy(audio_np.T)'; assert old in c, 'Pattern not found'; open(f,'w').write(c.replace(old,new)); print('Patched load_audio in xtts.py')"

# Fix 6: TTS installs numpy==1.22.0 on Python<=3.10, but base container
# packages are compiled against numpy 1.24+ (API 0x10).
# TTS Python code is compatible with numpy 1.24.x.
RUN pip install --no-cache-dir "numpy==1.24.4"

# Create models directory (downloaded at runtime on first use)
RUN mkdir -p /root/.local/share/tts

# Copy service
COPY xtts_service.py /app/

# Expose HTTP API port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:8082/health || exit 1

ENV CUDA_VISIBLE_DEVICES=0
ENV COQUI_TOS_AGREED=1

CMD ["python3", "/app/xtts_service.py"]

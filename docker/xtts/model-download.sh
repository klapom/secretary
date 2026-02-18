#!/bin/bash
set -e

echo "📥 Downloading XTTS models..."

# Create models directory
mkdir -p /app/models

# Download XTTS v2 models from Coqui
# Models will be cached in /root/.cache/tts
python3 -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2', gpu=True)"

echo "✅ XTTS models downloaded successfully"

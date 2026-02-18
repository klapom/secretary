#!/bin/bash
set -e

echo "📥 Downloading Whisper models..."

# Create models directory
mkdir -p /app/models

# Download faster-whisper models
# Using base model for balance between accuracy and speed
python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cuda', compute_type='float16')"

echo "✅ Whisper models cached successfully"

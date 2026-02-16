#!/bin/bash
set -e

echo "🚀 Starting LivePortrait Service"
echo "CUDA Version: $(nvcc --version | grep release)"
echo "GPU Info:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Warm up GPU (load models into memory)
echo "🔥 Warming up GPU and loading models..."
python3 -c "import torch; print(f'PyTorch CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"

# Start FastAPI service
echo "🌐 Starting LivePortrait API server on port 8081..."
exec python3 /app/liveportrait_service.py

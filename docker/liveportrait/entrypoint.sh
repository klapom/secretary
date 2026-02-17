#!/bin/bash
set -e

echo "=== LivePortrait Service Starting ==="
echo "GPU: $(python3 -c 'import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU-only")')"
echo "CUDA available: $(python3 -c 'import torch; print(torch.cuda.is_available())')"

# Disable Flash Attention for sm_121 (GB10)
export TORCH_BACKENDS_CUDA_ENABLE_FLASH_SDP=0

exec python3 /app/liveportrait_service.py

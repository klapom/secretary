#!/bin/bash
set -e

# DGX Spark CUDA 13.0 Environment
export TORCH_CUDA_ARCH_LIST="12.1a"
export TRITON_PTXAS_PATH=/usr/local/cuda/bin/ptxas
export CUDACXX=/usr/local/cuda-13.0/bin/nvcc
export CUDA_HOME=/usr/local/cuda-13.0
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH

echo "🚀 Starting LivePortrait Service (DGX Spark)"
echo "CUDA Version: $(nvcc --version | grep release || echo 'nvcc not found')"
echo "GPU Info:"
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader

# Warm up GPU (load models into memory)
echo "🔥 Warming up GPU and loading models..."
python3 -c "
import torch
# Flash Attention Workaround for sm_121
torch.backends.cuda.enable_flash_sdp(False)
torch.backends.cuda.enable_mem_efficient_sdp(True)
print(f'PyTorch CUDA available: {torch.cuda.is_available()}')
print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')
print(f'CUDA Compute Capability: {torch.cuda.get_device_capability(0) if torch.cuda.is_available() else \"N/A\"}')
print('Flash Attention: Disabled (sm_121 workaround)')
print('Memory-Efficient SDP: Enabled')
"

# Start FastAPI service
echo "🌐 Starting LivePortrait API server on port 8081..."
exec python3 /app/liveportrait_service.py

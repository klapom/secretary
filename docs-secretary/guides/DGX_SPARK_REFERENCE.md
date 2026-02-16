# DGX Spark Reference Guide

**Source:** AEGIS_Rag Production Deployment (2026-02)
**Purpose:** Production-tested configuration for NVIDIA DGX Spark deployment
**Status:** ✅ Validated in AEGIS_Rag (Sprints 124-129)

---

## 🖥️ Hardware Specifications

### DGX Spark System

| Component            | Specification                        | Notes                          |
| -------------------- | ------------------------------------ | ------------------------------ |
| **GPU**              | NVIDIA GB10 (Blackwell Architecture) | Latest generation GPU          |
| **CUDA Capability**  | sm_121 / sm_121a                     | CUDA 12.1+ required            |
| **Memory**           | 128GB Unified (CPU + GPU shared)     | ~119GB usable after OS         |
| **CPU**              | 20 ARM Cortex Cores (aarch64)        | ARM64 architecture             |
| **CUDA Version**     | 13.0                                 | CUDA 12.x not fully compatible |
| **Driver Version**   | 580.95.05+                           | Minimum required               |
| **Operating System** | Ubuntu 24.04 LTS                     | Officially supported           |

### Performance Characteristics

```
Training Performance:
- PyTorch cu130: ~10-12 sec/iteration (optimal)
- PyTorch cu128: ~30+ sec/iteration (3x slower - avoid!)

Inference Performance:
- llama.cpp (Qwen3-235B IQ3_M): ~15 tok/s @ 107GB VRAM
- vLLM (Nemotron-3-Nano NVFP4): ~60-80 tok/s @ 18GB VRAM

Memory Budget:
- OS Overhead: ~9GB
- Available for Applications: ~119GB
```

---

## 🐳 Docker Configuration

### Validated Base Images

| Framework        | Image                                    | Status         | Notes                         |
| ---------------- | ---------------------------------------- | -------------- | ----------------------------- |
| **PyTorch**      | `nvcr.io/nvidia/pytorch:25.09-py3`       | ✅ Recommended | Multi-arch (aarch64 + x86_64) |
| **CUDA Runtime** | `nvidia/cuda:13.0.0-runtime-ubuntu24.04` | ✅ Works       | Lighter than PyTorch base     |
| **vLLM**         | `vllm/vllm-openai:latest`                | ✅ Works       | Auto-detects sm_121           |

**DO NOT USE:**

- ❌ `nvcr.io/nvidia/pytorch:24.01-py3` (CUDA 12.1, too old)
- ❌ `nvidia/cuda:12.x` images (sm_121 issues)
- ❌ TensorFlow images (not supported on DGX Spark)

### Required Environment Variables

**CRITICAL - Must be set in Dockerfile or docker-compose:**

```bash
# CUDA 13.0 Configuration
export TORCH_CUDA_ARCH_LIST="12.1a"
export TRITON_PTXAS_PATH=/usr/local/cuda/bin/ptxas
export CUDACXX=/usr/local/cuda-13.0/bin/nvcc
export CUDA_HOME=/usr/local/cuda-13.0
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH
```

**Example Dockerfile:**

```dockerfile
FROM nvcr.io/nvidia/pytorch:25.09-py3

# DGX Spark CUDA 13.0 Environment
ENV TORCH_CUDA_ARCH_LIST="12.1a"
ENV TRITON_PTXAS_PATH=/usr/local/cuda/bin/ptxas
ENV CUDACXX=/usr/local/cuda-13.0/bin/nvcc
ENV CUDA_HOME=/usr/local/cuda-13.0
ENV PATH=$CUDA_HOME/bin:$PATH
ENV LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH

# Your application code here
```

---

## ⚠️ Common Issues & Solutions

### 1. Flash Attention Compilation Error

**Error:**

```
kernel fmha_cutlassF_f16_aligned_64x128_rf_sm80 is for sm80-sm100,
but was built for sm121
```

**Root Cause:** Flash Attention kernels not yet compiled for Blackwell sm_121.

**Solution (Workaround):**

```python
import torch

# Disable Flash Attention, use Memory-Efficient SDP
torch.backends.cuda.enable_flash_sdp(False)
torch.backends.cuda.enable_mem_efficient_sdp(True)
```

**Performance Impact:** ~10-12 sec/iter (acceptable for production)

### 2. Wrong nvcc Version

**Error:**

```
nvcc fatal: Unsupported gpu architecture 'compute_121'
```

**Root Cause:** `/usr/bin/nvcc` (CUDA 12.0) used instead of CUDA 13.0.

**Solution:**

```bash
# Option 1: Remove system CUDA toolkit
sudo apt remove nvidia-cuda-toolkit

# Option 2: Explicitly specify CUDA 13.0 compiler
cmake -DCMAKE_CUDA_COMPILER=/usr/local/cuda-13.0/bin/nvcc ...
```

### 3. PyTorch cu128 vs cu130

**Issue:** cu128 wheels 3x slower on DGX Spark.

**Solution:** Always use cu130 wheels:

```bash
# Correct
pip install torch==2.5.0+cu130 --index-url https://download.pytorch.org/whl/cu130

# Wrong (3x slower!)
pip install torch==2.5.0+cu128
```

### 4. PEP 668 "externally-managed-environment"

**Error:**

```
error: externally-managed-environment
```

**Solution:**

```bash
pip install --break-system-packages <package>

# OR use virtual environment
python3 -m venv venv
source venv/bin/activate
pip install <package>
```

### 5. Triton Compilation Issues

**Error:**

```
Triton requires --gpu-architecture=sm_121a
```

**Solution:** Triton must be built from source for sm_121a:

```bash
git clone https://github.com/openai/triton.git
cd triton/python
pip install cmake
pip install -e .
```

---

## 📦 Docker Compose Best Practices

### On-Demand GPU Services (Profiles)

**Problem:** GPU services consume VRAM even when idle.

**Solution:** Use Docker Compose profiles:

```yaml
services:
  gpu-service:
    image: my-gpu-service
    profiles: [gpu] # Only start when explicitly requested
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=0
```

**Usage:**

```bash
# Normal mode: No GPU services
docker compose up -d

# GPU mode: Start GPU services on-demand
docker compose --profile gpu up -d

# Stop GPU services only (free VRAM)
docker compose --profile gpu down
```

**Benefit:** Conserves VRAM and power when GPU not needed.

### GPU Resource Limits

```yaml
services:
  gpu-service:
    runtime: nvidia
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
          memory: 16G # RAM reservation
        limits:
          memory: 20G # Max RAM
    shm_size: "4gb" # Shared memory for PyTorch
```

**Memory Types:**

- `memory`: System RAM limit
- `shm_size`: Shared memory (`/dev/shm`) for inter-process communication
- VRAM: Not directly limited by Docker (controlled by application)

---

## 🔬 Validated Workloads (AEGIS_Rag Production)

### vLLM Inference (Nemotron-3-Nano)

**Configuration:**

```yaml
vllm:
  image: vllm/vllm-openai:latest
  runtime: nvidia
  command: >
    --model nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4
    --max-model-len 32768
    --max-num-seqs 8
    --gpu-memory-utilization 0.4
    --trust-remote-code
    --kv-cache-dtype fp8
  environment:
    - NVIDIA_VISIBLE_DEVICES=0
```

**Performance:**

- Throughput: 60-80 tok/s
- VRAM: ~18GB
- Latency: <100ms TTFT P99

### Docling (Document Processing)

**Configuration:**

```yaml
docling:
  image: quay.io/docling-project/docling-serve-cu124:latest
  runtime: nvidia
  environment:
    - DOCLING_DEVICE=cuda
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
      limits:
        memory: 8G
```

**Performance:**

- OCR Quality: 95% (German technical docs)
- Speed: ~120s for 247-page PDF
- GPU Usage: 85%

### PyTorch Training

**Environment Setup:**

```python
import torch

# Flash Attention Workaround
torch.backends.cuda.enable_flash_sdp(False)
torch.backends.cuda.enable_mem_efficient_sdp(True)

# Verify GPU
print(f"CUDA Available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"Compute Capability: {torch.cuda.get_device_capability(0)}")
```

**Performance:**

- Training: ~10-12 sec/iteration
- Memory: 128GB unified (CPU + GPU shared)

---

## 📊 VRAM Budgeting Examples

### Example 1: AEGIS_Rag Production Stack

```
Service           VRAM    RAM     Notes
-----------------------------------------
Ollama (Gemma)    25GB    2GB     Chat inference
BGE-M3 Embedder   2GB     1GB     Embeddings
Reranker          1GB     0.5GB   Reranking
vLLM (Nemotron)   18GB    4GB     Extraction (on-demand)
Docling           6GB     4GB     Document parsing (on-demand)
OS Overhead       -       9GB     System baseline
-----------------------------------------
Total (Normal):   28GB    16.5GB  = 44.5GB used, 83.5GB free
Total (Ingestion):52GB    24.5GB  = 76.5GB used, 51.5GB free
```

**Strategy:** On-demand services (vLLM, Docling) use Docker profiles.

### Example 2: Secretary Avatar System (Sprint 04)

```
Service           VRAM    RAM     Notes
-----------------------------------------
LivePortrait      8GB     4GB     Avatar rendering
XTTS              4GB     2GB     Voice synthesis
Whisper           2GB     1GB     Speech-to-text
OS Overhead       -       9GB     System baseline
-----------------------------------------
Total (Avatar):   14GB    16GB    = 30GB used, 98GB free
```

**Strategy:** Avatar services use `profiles: [avatar]` for on-demand start.

---

## 🔗 References

**External:**

- [NVIDIA NGC Catalog](https://catalog.ngc.nvidia.com/)
- [PyTorch CUDA Compatibility](https://pytorch.org/get-started/locally/)
- [vLLM Documentation](https://docs.vllm.ai/)

**Internal (AEGIS_Rag):**

- `TECH_STACK.md` - DGX Spark specifications
- `ADR-059-vllm-dual-engine-architecture.md` - vLLM deployment
- `ADR-027-docling-container-architecture.md` - GPU container patterns

**Secretary:**

- [SPRINT_04.md](../sprints/SPRINT_04.md) - Avatar System deployment
- [docker/README.md](../../docker/README.md) - Container setup guide

---

**Last Updated:** 2026-02-16 (Sprint 04 Phase 1)
**Validation Status:** ✅ Tested in AEGIS_Rag production (6 months)
**Maintainer:** Klaus Pommer

# vLLM Qwen3.5-35B-A3B-FP8 — Custom Image for DGX Spark (ARM64, Blackwell sm_121)
#
# Why the nightly image instead of latest-aarch64-cu130:
#   vllm/vllm-openai:latest-aarch64-cu130 = vLLM 0.16.0, does NOT have
#   Qwen3_5MoeForConditionalGeneration in its model registry.
#   vllm/vllm-openai:cu130-nightly-aarch64 = vLLM 0.16.0rc2.dev (nightly),
#   confirmed to have Qwen3.5 in ModelRegistry.get_supported_archs().
#
# Why we still upgrade transformers:
#   The nightly ships transformers==4.57.6. Qwen3.5 uses model_type "qwen3_5_moe"
#   which was added in transformers 5.0+. Without this, AutoConfig cannot parse
#   the model's config.json and falls back / errors on config loading.
#
# Model: Qwen/Qwen3.5-35B-A3B-FP8
#   - 35B total params, ~3B active (MoE: 256 experts, 8 routed + 1 shared)
#   - Hybrid architecture: DeltaNet (linear attention) + Standard Attention + MoE
#   - FP8 quantization: ~35GB on disk (FP8 weights), fits in 128GB unified memory
#   - Native context: 262,144 tokens
#
# Hardware: NVIDIA GB10 (Blackwell sm_121a), 128GB unified memory, CUDA 13.0

FROM vllm/vllm-openai:cu130-nightly-aarch64

# Upgrade transformers to support qwen3_5_moe model_type in config.json parsing.
# vLLM's own model implementation (Qwen3_5MoeForConditionalGeneration) is already
# in the nightly registry — transformers is only needed for config loading.
RUN pip install --no-cache-dir "transformers>=5.2.0" --upgrade

# Formerly: patch-anthropic-streaming.py — fixed the qwen3_xml streaming bug
# where tool_call.id set on every delta caused empty tool-call inputs. The
# upstream nightly now has equivalent dedup logic inline (see state.tool_use_id
# != tool_call.id check in entrypoints/anthropic/serving.py), so the patch is
# no longer needed. The file is kept in-tree for historical reference.

# Verify: transformers version, vLLM registry entry, and that upstream dedup fix is present.
RUN python3 -c "import transformers; print('transformers:', transformers.__version__)" && \
    python3 -c "from vllm.model_executor.models import ModelRegistry; archs = ModelRegistry.get_supported_archs(); assert 'Qwen3_5MoeForConditionalGeneration' in archs, 'MISSING'; print('Qwen3_5MoeForConditionalGeneration: OK in vLLM registry')" && \
    python3 -c "import pathlib; s = pathlib.Path('/usr/local/lib/python3.12/dist-packages/vllm/entrypoints/anthropic/serving.py').read_text(); assert 'state.tool_use_id != tool_call.id' in s, 'Upstream tool-call dedup fix missing — streaming bug may have regressed'; print('Anthropic streaming tool-call dedup: OK (upstream)')"

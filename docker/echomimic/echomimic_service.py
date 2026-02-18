"""
EchoMimic V3 Service — portrait + audio → lip-synced MP4
Port: 8086
Variant: flash-pro (8 steps, ~15-25s) or preview (25 steps, ~60s)

Endpoints:
  GET  /health        — service status
  POST /api/render    — source_image (file) + audio (file) + prompt (form, optional)
                        → returns MP4 video
"""

import argparse
import logging
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("echomimic")

# EchoMimicV3 repo must be on sys.path for "from src.xxx" imports
REPO_DIR = "/app/EchoMimicV3"
if REPO_DIR not in sys.path:
    sys.path.insert(0, REPO_DIR)

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
VARIANT = os.environ.get("ECHOMIMIC_VARIANT", "flash-pro")

# Paths inside the downloaded model dir
BASE_MODEL_DIR   = MODELS_DIR / VARIANT / "Wan2.1-Fun-V1.1-1.3B-InP"
TRANSFORMER_CKPT = MODELS_DIR / VARIANT / "transformer" / "diffusion_pytorch_model.safetensors"
WAV2VEC_DIR      = MODELS_DIR / VARIANT / (
    "chinese-wav2vec2-base" if VARIANT == "flash-pro" else "wav2vec2-base-960h"
)
CONFIG_FILE      = Path(REPO_DIR) / "config" / "config.yaml"

# HuggingFace repos
HF_BASE_MODEL    = "alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP"
HF_ECHOMIMIC_V3  = "BadToBest/EchoMimicV3"
HF_WAV2VEC_FLASH = "TencentGameMate/chinese-wav2vec2-base"
HF_WAV2VEC_PREV  = "facebook/wav2vec2-base-960h"


# ── Model download ────────────────────────────────────────────────────────────

def download_models():
    from huggingface_hub import snapshot_download, hf_hub_download
    import shutil

    # 1. Base Wan2.1 model
    if not BASE_MODEL_DIR.exists():
        log.info("Downloading base model Wan2.1-Fun-V1.1-1.3B-InP (~5GB) ...")
        snapshot_download(repo_id=HF_BASE_MODEL, local_dir=str(BASE_MODEL_DIR))
        log.info("Base model downloaded.")
    else:
        log.info("Base model already present.")

    # 2. EchoMimicV3 transformer weights (flash-pro or preview)
    hf_filename = (
        "echomimicv3-flash-pro/diffusion_pytorch_model.safetensors"
        if VARIANT == "flash-pro"
        else "transformer/diffusion_pytorch_model.safetensors"
    )
    if not TRANSFORMER_CKPT.exists():
        log.info("Downloading EchoMimicV3 transformer weights (%s) ...", hf_filename)
        TRANSFORMER_CKPT.parent.mkdir(parents=True, exist_ok=True)
        local_file = hf_hub_download(
            repo_id=HF_ECHOMIMIC_V3,
            filename=hf_filename,
            local_dir=str(MODELS_DIR / "_hf_download"),
        )
        shutil.copy(local_file, str(TRANSFORMER_CKPT))
        log.info("Transformer weights downloaded.")
    else:
        log.info("Transformer weights already present.")

    # 3. Wav2Vec2 for audio encoding
    wav2vec_repo = HF_WAV2VEC_FLASH if VARIANT == "flash-pro" else HF_WAV2VEC_PREV
    if not WAV2VEC_DIR.exists():
        log.info("Downloading %s ...", WAV2VEC_DIR.name)
        snapshot_download(repo_id=wav2vec_repo, local_dir=str(WAV2VEC_DIR))
        log.info("Wav2Vec2 downloaded.")
    else:
        log.info("Wav2Vec2 already present.")

    log.info("All models ready.")


# ── Pipeline (lazy-loaded on first request) ───────────────────────────────────

_state: dict = {"loaded": False, "error": None, "pipeline": None}


def _loudness_norm(audio_array, sr=16000, lufs=-23):
    try:
        import pyloudnorm as pyln
        meter = pyln.Meter(sr)
        loudness = meter.integrated_loudness(audio_array)
        if abs(loudness) > 100:
            return audio_array
        return pyln.normalize.loudness(audio_array, loudness, lufs)
    except ImportError:
        # pyloudnorm not available — skip normalization
        return audio_array


def _get_audio_embed(mel_input, wav2vec_feature_extractor, audio_encoder, video_length, sr=16000, fps=25):
    import torch
    import numpy as np
    from einops import rearrange

    audio_feature = np.squeeze(wav2vec_feature_extractor(mel_input, sampling_rate=sr).input_values)
    audio_feature = torch.from_numpy(audio_feature).float()
    audio_feature = audio_feature.unsqueeze(0)

    with torch.no_grad():
        embeddings = audio_encoder(audio_feature, seq_len=int(video_length), output_hidden_states=True)

    audio_emb = torch.stack(embeddings.hidden_states[1:], dim=1).squeeze(0)
    audio_emb = rearrange(audio_emb, "b s d -> s b d")
    return audio_emb.cpu().detach()


def _load_pipeline():
    try:
        import torch
        from omegaconf import OmegaConf
        from diffusers import FlowMatchEulerDiscreteScheduler
        from safetensors.torch import load_file
        from transformers import AutoTokenizer, Wav2Vec2FeatureExtractor

        # EchoMimicV3 src imports
        from src.wan_vae import AutoencoderKLWan
        from src.wan_image_encoder import CLIPModel
        from src.wan_text_encoder import WanT5EncoderModel
        from src.wan_transformer3d_audio_2512 import WanTransformerAudioMask3DModel as WanTransformer
        from src.pipeline_wan_fun_inpaint_audio_2512 import WanFunInpaintAudioPipeline
        from src.wav2vec2 import Wav2Vec2Model as EchoWav2Vec2

        log.info("Loading EchoMimicV3 pipeline (variant=%s) ...", VARIANT)
        t0 = time.time()

        config = OmegaConf.load(str(CONFIG_FILE))
        dtype  = torch.bfloat16
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        log.info("Device: %s, dtype: %s", device, dtype)

        # ── Transformer (base architecture + flash-pro fine-tune) ──
        transformer_subpath = config["transformer_additional_kwargs"].get("transformer_subpath", "transformer")
        transformer = WanTransformer.from_pretrained(
            str(BASE_MODEL_DIR / transformer_subpath),
            transformer_additional_kwargs=OmegaConf.to_container(config["transformer_additional_kwargs"]),
            low_cpu_mem_usage=True,
            torch_dtype=dtype,
        )
        log.info("Loading flash-pro weights from %s ...", TRANSFORMER_CKPT)
        state_dict = load_file(str(TRANSFORMER_CKPT))
        m, u = transformer.load_state_dict(state_dict, strict=False)
        log.info("Transformer override: missing=%d, unexpected=%d", len(m), len(u))
        transformer = transformer.to(device)

        # torch.compile() speeds up repeated forward passes by ~20-40%.
        # mode='reduce-overhead' avoids expensive max-autotune search.
        # First inference will be slow (compilation), subsequent ones faster.
        try:
            transformer = torch.compile(transformer, mode="reduce-overhead")
            log.info("torch.compile() applied to transformer")
        except Exception as compile_err:
            log.warning("torch.compile() failed (non-fatal): %s", compile_err)

        # ── VAE ──
        vae_subpath = config["vae_kwargs"].get("vae_subpath", "vae")
        vae = AutoencoderKLWan.from_pretrained(
            str(BASE_MODEL_DIR / vae_subpath),
            additional_kwargs=OmegaConf.to_container(config["vae_kwargs"]),
        ).to(dtype).to(device)

        # ── Text encoder + tokenizer ──
        te_subpath  = config["text_encoder_kwargs"].get("text_encoder_subpath", "text_encoder")
        tok_subpath = config["text_encoder_kwargs"].get("tokenizer_subpath", "google/umt5-xxl")
        text_encoder = WanT5EncoderModel.from_pretrained(
            str(BASE_MODEL_DIR / te_subpath),
            additional_kwargs=OmegaConf.to_container(config["text_encoder_kwargs"]),
            low_cpu_mem_usage=True,
            torch_dtype=dtype,
        // FIXME(sec-eval): ⚠️ SECURITY — eval() is a code injection risk, eliminate dynamic execution
        ).eval().to(device)
        tokenizer = AutoTokenizer.from_pretrained(str(BASE_MODEL_DIR / tok_subpath))

        # ── CLIP image encoder ──
        ie_subpath = config["image_encoder_kwargs"].get("image_encoder_subpath", "image_encoder")
        clip_image_encoder = CLIPModel.from_pretrained(
            // FIXME(sec-eval): ⚠️ SECURITY — eval() is a code injection risk, eliminate dynamic execution
            str(BASE_MODEL_DIR / ie_subpath),
        ).to(dtype).eval().to(device)

        # ── Scheduler (flash-pro: 8-step with shift=1) ──
        sched_kwargs = OmegaConf.to_container(config["scheduler_kwargs"])
        sched_kwargs.pop("scheduler_subpath", None)
        if VARIANT == "flash-pro":
            sched_kwargs["shift"] = 1
        scheduler = FlowMatchEulerDiscreteScheduler(**{
            k: v for k, v in sched_kwargs.items()
            if k in FlowMatchEulerDiscreteScheduler.__init__.__code__.co_varnames
        })

        # ── Pipeline ──
        pipe = WanFunInpaintAudioPipeline(
            transformer=transformer,
            vae=vae,
            tokenizer=tokenizer,
            text_encoder=text_encoder,
            scheduler=scheduler,
            clip_image_encoder=clip_image_encoder,
        ).to(device)

        # ── Audio encoder (EchoMimicV3 custom Wav2Vec2, runs on CPU) ──
        # attn_implementation="eager" required: transformers 5.x SDPA does not
        # support output_hidden_states=True used in get_audio_embed()
        audio_encoder = EchoWav2Vec2.from_pretrained(
            str(WAV2VEC_DIR), local_files_only=True, attn_implementation="eager"
        )
        audio_encoder.feature_extractor._freeze_parameters()
        wav2vec_extractor = Wav2Vec2FeatureExtractor.from_pretrained(
            str(WAV2VEC_DIR), local_files_only=True
        )

        _state["pipeline"] = {
            "pipe": pipe,
            "vae": vae,
            "audio_encoder": audio_encoder,
            "wav2vec_extractor": wav2vec_extractor,
            "device": device,
            "dtype": dtype,
        }
        _state["loaded"] = True
        log.info("Pipeline ready in %.1fs", time.time() - t0)

    except Exception as exc:
        _state["error"] = str(exc)
        log.exception("Pipeline load failed: %s", exc)


# ── Inference ────────────────────────────────────────────────────────────────

def render(image_path: str, audio_path: str, prompt: str = "A person speaking naturally.") -> bytes:
    import torch
    import librosa
    import numpy as np
    from PIL import Image
    from src.utils import get_image_to_video_latent2, save_videos_grid

    if not _state["loaded"]:
        raise RuntimeError("Pipeline not loaded")

    p      = _state["pipeline"]
    pipe   = p["pipe"]
    vae    = p["vae"]
    device = p["device"]
    dtype  = p["dtype"]

    fps = 25
    n_steps = 8 if VARIANT == "flash-pro" else 25

    # Load + preprocess audio
    audio_arr, sr = librosa.load(audio_path, sr=16000, mono=True)
    audio_arr = _loudness_norm(audio_arr, sr=16000)

    video_length = int(len(audio_arr) / sr * fps)
    # Align to VAE temporal compression
    tc = vae.config.temporal_compression_ratio
    video_length = int((video_length - 1) // tc * tc) + 1 if video_length > 1 else 1
    video_length = max(video_length, 9)   # min ~0.3s
    video_length = min(video_length, 201) # cap at 8s

    log.info("Audio %.1fs → %d frames, steps=%d", len(audio_arr) / sr, video_length, n_steps)

    # Audio embedding [F, 5, 12, 768]
    audio_emb_raw = _get_audio_embed(
        audio_arr[:int(video_length / fps * 16000)],
        p["wav2vec_extractor"],
        p["audio_encoder"],
        video_length,
    )
    indices = (torch.arange(2 * 2 + 1) - 2)
    center_indices = (
        torch.arange(0, video_length).unsqueeze(1) + indices.unsqueeze(0)
    ).clamp(0, audio_emb_raw.shape[0] - 1)
    audio_embeds = audio_emb_raw[center_indices].unsqueeze(0).to(device=device, dtype=dtype)

    # Load image
    ref_image = Image.open(image_path).convert("RGB")
    input_video, input_video_mask, clip_image = get_image_to_video_latent2(
        ref_image, None, video_length=video_length, sample_size=[768, 768]
    )

    generator = torch.Generator(device=device).manual_seed(42)

    with torch.no_grad():
        sample = pipe(
            prompt,
            num_frames=video_length,
            negative_prompt="blurry, low quality",
            audio_embeds=audio_embeds,
            audio_scale=1.0,
            ip_mask=None,
            use_un_ip_mask=False,
            height=768,
            width=768,
            generator=generator,
            guidance_scale=3.0,
            audio_guidance_scale=2.5,
            num_inference_steps=n_steps,
            video=input_video,
            mask_video=input_video_mask,
            clip_image=clip_image,
        )

    frames = sample.videos[0]  # [C, F, H, W] tensor

    with tempfile.TemporaryDirectory() as tmpdir:
        silent_path = os.path.join(tmpdir, "silent.mp4")
        output_path = os.path.join(tmpdir, "output.mp4")

        save_videos_grid(frames.unsqueeze(0), silent_path, fps=fps)

        os.system(
            f'ffmpeg -y -i "{silent_path}" -i "{audio_path}" '
            f'-c:v copy -c:a aac -shortest "{output_path}" -loglevel error'
        )

        with open(output_path, "rb") as f:
            return f.read()


# ── FastAPI app ───────────────────────────────────────────────────────────────

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
import asyncio

app = FastAPI(title="EchoMimic V3 Service")


@app.on_event("startup")
async def startup_event():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _load_pipeline)


@app.get("/health")
async def health():
    import torch
    return {
        "status":          "ready" if _state["loaded"] else ("error" if _state["error"] else "loading"),
        "variant":         VARIANT,
        "gpu_available":   torch.cuda.is_available(),
        "gpu_name":        torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "pipeline_loaded": _state["loaded"],
        "error":           _state["error"],
    }


@app.post("/api/render")
async def api_render(
    source_image: UploadFile = File(...),
    audio:        UploadFile = File(...),
    prompt:       Optional[str] = Form("A person speaking naturally."),
):
    if not _state["loaded"]:
        if _state["error"]:
            raise HTTPException(503, f"Pipeline error: {_state['error']}")
        raise HTTPException(503, "Pipeline still loading — try again in a moment")

    with tempfile.TemporaryDirectory() as tmpdir:
        img_path       = os.path.join(tmpdir, "source.jpg")
        audio_path_raw = os.path.join(tmpdir, "audio_raw")
        audio_path_wav = os.path.join(tmpdir, "audio_16k.wav")

        with open(img_path, "wb") as f:
            f.write(await source_image.read())
        with open(audio_path_raw, "wb") as f:
            f.write(await audio.read())

        # Normalise to 16kHz mono WAV
        ret = os.system(
            f'ffmpeg -y -i "{audio_path_raw}" -ar 16000 -ac 1 "{audio_path_wav}" -loglevel error'
        )
        audio_path = audio_path_wav if ret == 0 else audio_path_raw

        try:
            loop = asyncio.get_event_loop()
            mp4_bytes = await loop.run_in_executor(
                None, lambda: render(img_path, audio_path, prompt or "A person speaking naturally.")
            )
        except Exception as exc:
            log.exception("Render failed")
            raise HTTPException(500, f"Render failed: {exc}")

    return Response(content=mp4_bytes, media_type="video/mp4")


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()
    if args.download_only:
        download_models()
        sys.exit(0)

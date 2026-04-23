"""
Modal deployment for Qwen/Qwen3.5-9B - geotechCLI hosted beta backend.

Runs the native vLLM OpenAI-compatible server so the Cloudflare proxy can
forward both text and image chat completions without a custom translation
layer. This keeps the Modal API surface aligned with the proxy contract and
restores real hosted vision support.

Deploy:
    modal deploy modal/serve_qwen.py

Test locally:
    modal serve modal/serve_qwen.py
"""

import os
import shlex
import subprocess

import modal


def env_int(name: str, default: int, minimum: int | None = None) -> int:
    raw = os.environ.get(name, "").strip()
    value = int(raw) if raw else default
    if minimum is not None:
        value = max(minimum, value)
    return value


MODEL_ID = os.environ.get("GEOTECHCLI_HOSTED_MODEL_ID", "Qwen/Qwen3.5-9B").strip() or "Qwen/Qwen3.5-9B"
GPU = os.environ.get("GEOTECHCLI_MODAL_GPU", "L4").strip() or "L4"
IDLE_TIMEOUT_SECONDS = 600
STARTUP_TIMEOUT_SECONDS = 15 * 60
VLLM_PORT = 8000
MIN_CONTAINERS = env_int("GEOTECHCLI_MODAL_MIN_CONTAINERS", 0, minimum=0)
BUFFER_CONTAINERS = env_int("GEOTECHCLI_MODAL_BUFFER_CONTAINERS", 0, minimum=0)
MAX_CONTAINERS = env_int("GEOTECHCLI_MODAL_MAX_CONTAINERS", 1, minimum=1)
MAX_CONCURRENT_INPUTS = env_int("GEOTECHCLI_MODAL_MAX_INPUTS", 8, minimum=1)
VLLM_PIP_SPEC = os.environ.get("GEOTECHCLI_VLLM_PIP_SPEC", "vllm==0.18.1").strip() or "vllm==0.18.1"
GPU_MEMORY_UTILIZATION = os.environ.get("GEOTECHCLI_VLLM_GPU_MEMORY_UTILIZATION", "0.90").strip() or "0.90"
MAX_MODEL_LEN = os.environ.get("GEOTECHCLI_VLLM_MAX_MODEL_LEN", "4096").strip() or "4096"
MM_LIMIT_JSON = os.environ.get("GEOTECHCLI_VLLM_MM_LIMIT_JSON", '{"image": 1}').strip() or '{"image": 1}'
REASONING_PARSER = os.environ.get("GEOTECHCLI_VLLM_REASONING_PARSER", "qwen3").strip()
ATTENTION_BACKEND = os.environ.get("GEOTECHCLI_VLLM_ATTENTION_BACKEND", "").strip()
MAMBA_BACKEND = os.environ.get("GEOTECHCLI_VLLM_MAMBA_BACKEND", "").strip()
KV_CACHE_DTYPE = os.environ.get("GEOTECHCLI_VLLM_KV_CACHE_DTYPE", "").strip()
EXTRA_ARGS = os.environ.get("GEOTECHCLI_VLLM_EXTRA_ARGS", "").strip()

hf_cache = modal.Volume.from_name("geotechcli-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("geotechcli-vllm-cache", create_if_missing=True)

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        VLLM_PIP_SPEC,
        "huggingface_hub[hf_transfer]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("geotechcli-qwen")


@app.function(
    image=vllm_image,
    gpu=GPU,
    timeout=STARTUP_TIMEOUT_SECONDS,
    min_containers=MIN_CONTAINERS,
    buffer_containers=BUFFER_CONTAINERS,
    max_containers=MAX_CONTAINERS,
    scaledown_window=IDLE_TIMEOUT_SECONDS,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
    secrets=[modal.Secret.from_name("HF_TOKEN")],
)
@modal.concurrent(max_inputs=MAX_CONCURRENT_INPUTS)
@modal.web_server(port=VLLM_PORT, startup_timeout=STARTUP_TIMEOUT_SECONDS)
def serve():
    api_key = os.environ.get("MODAL_API_TOKEN", "").strip()

    cmd = [
        "vllm",
        "serve",
        MODEL_ID,
        "--host",
        "0.0.0.0",
        "--port",
        str(VLLM_PORT),
        "--served-model-name",
        MODEL_ID,
        "--tensor-parallel-size",
        "1",
        "--gpu-memory-utilization",
        GPU_MEMORY_UTILIZATION,
        "--max-model-len",
        MAX_MODEL_LEN,
        "--limit-mm-per-prompt",
        MM_LIMIT_JSON,
        "--enable-prefix-caching",
        "--generation-config",
        "vllm",
    ]

    if REASONING_PARSER:
        cmd.extend(["--reasoning-parser", REASONING_PARSER])

    if ATTENTION_BACKEND:
        cmd.extend(["--attention-backend", ATTENTION_BACKEND])

    if MAMBA_BACKEND:
        cmd.extend(["--mamba-backend", MAMBA_BACKEND])

    if KV_CACHE_DTYPE:
        cmd.extend(["--kv-cache-dtype", KV_CACHE_DTYPE])

    if EXTRA_ARGS:
        cmd.extend(shlex.split(EXTRA_ARGS))

    if api_key:
        cmd.extend(["--api-key", api_key])

    print(f"Launching hosted beta model: {MODEL_ID}")
    print(f"vLLM package spec: {VLLM_PIP_SPEC}")
    print(
        "Autoscaling:",
        f"min={MIN_CONTAINERS}",
        f"buffer={BUFFER_CONTAINERS}",
        f"max={MAX_CONTAINERS}",
        f"concurrent_inputs={MAX_CONCURRENT_INPUTS}",
    )
    print("Command:", " ".join(cmd))
    subprocess.Popen(cmd)

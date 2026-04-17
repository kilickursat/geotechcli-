"""
Modal deployment for Qwen/Qwen2.5-VL-7B-Instruct - geotechCLI hosted beta backend.

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
import subprocess

import modal

MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
GPU = "L4"
IDLE_TIMEOUT_SECONDS = 600
STARTUP_TIMEOUT_SECONDS = 15 * 60
VLLM_PORT = 8000

hf_cache = modal.Volume.from_name("geotechcli-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("geotechcli-vllm-cache", create_if_missing=True)

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8.0",
        "huggingface_hub[hf_transfer]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("geotechcli-qwen")


@app.function(
    image=vllm_image,
    gpu=GPU,
    timeout=STARTUP_TIMEOUT_SECONDS,
    scaledown_window=IDLE_TIMEOUT_SECONDS,
    volumes={
        "/root/.cache/huggingface": hf_cache,
        "/root/.cache/vllm": vllm_cache,
    },
    secrets=[modal.Secret.from_name("HF_TOKEN")],
)
@modal.concurrent(max_inputs=16)
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
        "0.90",
        "--max-model-len",
        "4096",
        "--limit-mm-per-prompt",
        "image=4",
        "--trust-remote-code",
        "--enforce-eager",
        "--generation-config",
        "vllm",
    ]

    if api_key:
        cmd.extend(["--api-key", api_key])

    print(f"Launching hosted beta model: {MODEL_ID}")
    print("Command:", " ".join(cmd))
    subprocess.Popen(cmd)

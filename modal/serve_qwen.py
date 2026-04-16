"""
Modal deployment for Qwen/Qwen3.5-9B — geotechCLI hosted beta backend.

Serves an OpenAI-compatible /v1/chat/completions endpoint on an NVIDIA L4 GPU.
Auto-scales to zero after 10 minutes of inactivity to conserve credits.

Deploy:
    modal deploy modal/serve_qwen.py

Test locally:
    modal serve modal/serve_qwen.py
"""

import modal

MODEL_ID = "Qwen/Qwen3.5-9B"
GPU = "L4"
IDLE_TIMEOUT_SECONDS = 600  # 10 minutes — freeze when no requests

# ---------------------------------------------------------------------------
# Image: vLLM + model weights baked in so cold starts pull from cache
# ---------------------------------------------------------------------------
vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8.0",
        "transformers",
        "torch",
        "huggingface_hub",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("geotechcli-qwen", image=vllm_image)

# Pre-download model weights into a Modal Volume for fast cold starts
model_volume = modal.Volume.from_name("geotechcli-qwen-weights", create_if_missing=True)
MODEL_DIR = "/models"


@app.function(
    gpu=GPU,
    volumes={MODEL_DIR: model_volume},
    container_idle_timeout=IDLE_TIMEOUT_SECONDS,
    timeout=600,
    allow_concurrent_inputs=16,
    secrets=[modal.Secret.from_name("HF_TOKEN")],
)
@modal.asgi_app()
def serve():
    """OpenAI-compatible vLLM server with cold-start download + idle freeze."""
    import os
    import time
    import json
    import uuid
    from pathlib import Path

    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    # -----------------------------------------------------------------------
    # Rate-limit / abuse guard (per-IP, in-memory for this container)
    # -----------------------------------------------------------------------
    _ip_buckets: dict[str, list[float]] = {}
    MAX_REQUESTS_PER_MINUTE = 30
    MAX_REQUESTS_PER_DAY_PER_IP = 200

    _daily_counts: dict[str, dict[str, int]] = {}

    def _get_today() -> str:
        return time.strftime("%Y-%m-%d", time.gmtime())

    def _is_rate_limited(ip: str) -> tuple[bool, str]:
        now = time.time()
        today = _get_today()

        # Per-minute check
        bucket = _ip_buckets.setdefault(ip, [])
        bucket[:] = [t for t in bucket if now - t < 60]
        if len(bucket) >= MAX_REQUESTS_PER_MINUTE:
            return True, "Too many requests per minute. Please wait."
        bucket.append(now)

        # Per-day check
        day_bucket = _daily_counts.setdefault(today, {})
        day_bucket.setdefault(ip, 0)
        day_bucket[ip] += 1
        if day_bucket[ip] > MAX_REQUESTS_PER_DAY_PER_IP:
            return True, "Daily request limit reached. Try again tomorrow."

        return False, ""

    # -----------------------------------------------------------------------
    # Download model on first cold start, then reuse from volume
    # -----------------------------------------------------------------------
    model_path = Path(MODEL_DIR) / MODEL_ID.replace("/", "--")
    if not model_path.exists():
        from huggingface_hub import snapshot_download

        snapshot_download(
            MODEL_ID,
            local_dir=str(model_path),
            token=os.environ.get("HF_TOKEN"),
        )
        model_volume.commit()

    # -----------------------------------------------------------------------
    # Spin up vLLM engine
    # -----------------------------------------------------------------------
    from vllm import LLM, SamplingParams

    llm = LLM(
        model=str(model_path),
        tensor_parallel_size=1,
        gpu_memory_utilization=0.92,
        max_model_len=8192,
        trust_remote_code=True,
    )

    # -----------------------------------------------------------------------
    # Routes
    # -----------------------------------------------------------------------
    async def health(request: Request) -> JSONResponse:
        return JSONResponse({
            "status": "ready",
            "model": MODEL_ID,
            "gpu": GPU,
            "idle_timeout_seconds": IDLE_TIMEOUT_SECONDS,
        })

    async def models(request: Request) -> JSONResponse:
        return JSONResponse({
            "object": "list",
            "data": [
                {
                    "id": MODEL_ID,
                    "object": "model",
                    "owned_by": "geotechcli",
                }
            ],
        })

    async def chat_completions(request: Request) -> JSONResponse:
        # Abuse guard
        client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "0.0.0.0")
        if "," in client_ip:
            client_ip = client_ip.split(",")[0].strip()

        limited, reason = _is_rate_limited(client_ip)
        if limited:
            return JSONResponse(
                {"error": {"message": reason, "type": "rate_limit_error"}},
                status_code=429,
            )

        try:
            body = await request.json()
        except Exception:
            return JSONResponse(
                {"error": {"message": "Invalid JSON body", "type": "invalid_request_error"}},
                status_code=400,
            )

        messages = body.get("messages", [])
        if not messages:
            return JSONResponse(
                {"error": {"message": "messages is required", "type": "invalid_request_error"}},
                status_code=400,
            )

        # Build prompt from messages (ChatML format for Qwen)
        prompt_parts: list[str] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            # Handle multimodal content arrays (extract text only for text model)
            if isinstance(content, list):
                text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
                content = "\n".join(text_parts)
            prompt_parts.append(f"<|im_start|>{role}\n{content}<|im_end|>")
        prompt_parts.append("<|im_start|>assistant\n")
        prompt = "\n".join(prompt_parts)

        temperature = body.get("temperature", 0.7)
        max_tokens = min(body.get("max_tokens", 4096), 4096)

        sampling = SamplingParams(
            temperature=max(temperature, 0.01),
            max_tokens=max_tokens,
            stop=["<|im_end|>", "<|im_start|>"],
        )

        start = time.time()
        outputs = llm.generate([prompt], sampling)
        latency_ms = int((time.time() - start) * 1000)

        generated_text = outputs[0].outputs[0].text.strip() if outputs and outputs[0].outputs else ""

        prompt_tokens = len(outputs[0].prompt_token_ids) if outputs else 0
        completion_tokens = len(outputs[0].outputs[0].token_ids) if outputs and outputs[0].outputs else 0

        return JSONResponse({
            "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": MODEL_ID,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": generated_text,
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        })

    return Starlette(
        routes=[
            Route("/health", health, methods=["GET"]),
            Route("/v1/models", models, methods=["GET"]),
            Route("/v1/chat/completions", chat_completions, methods=["POST"]),
        ],
    )

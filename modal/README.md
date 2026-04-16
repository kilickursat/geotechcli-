# Modal Deployment — geotechCLI Qwen Backend

Serves `Qwen/Qwen3.5-9B` on an NVIDIA L4 GPU via [Modal](https://modal.com).

## Setup

1. Install the Modal CLI:
   ```bash
   pip install modal
   modal setup
   ```

2. Create a Hugging Face secret in Modal (name: `geotechcli-hf-secret`):
   - Go to https://modal.com/secrets
   - Create a secret named `geotechcli-hf-secret` with key `HF_TOKEN` set to your HF token

3. Deploy:
   ```bash
   modal deploy modal/serve_qwen.py
   ```

4. Your endpoint will be at:
   ```
   https://<your-modal-workspace>--geotechcli-qwen-serve.modal.run
   ```

## Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | OpenAI-compatible chat completion |

## Cost Control

- **Idle timeout**: 10 minutes. The GPU container freezes after 10 minutes with no requests.
- **Rate limiting**: 30 req/min per IP, 200 req/day per IP (in-memory, per container).
- **Cold start**: ~60-90 seconds on first request after freeze. Model weights are cached in a Modal Volume.

## Environment

- GPU: NVIDIA L4
- Runtime: vLLM
- Model: Qwen/Qwen3.5-9B
- Max context: 8192 tokens
- Max output: 4096 tokens

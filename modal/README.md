# Modal Deployment - geotechCLI Qwen Backend

Serves `Qwen/Qwen3.5-9B` on an NVIDIA L4 GPU via [Modal](https://modal.com).

## Setup

1. Install the Modal CLI:
   ```bash
   pip install modal
   modal setup
   ```

2. Create a Hugging Face secret in Modal (name: `HF_TOKEN`):
   - Go to https://modal.com/secrets
   - Create a secret named `HF_TOKEN` with key `HF_TOKEN` set to your HF token

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
- **Cold start**: initial warm-up happens on first request after freeze. Hugging Face and vLLM caches are persisted in Modal Volumes.
- **Request limiting**: handled by the Cloudflare hosted-beta proxy so the Modal server can stay OpenAI-compatible.
- **Credit-safe defaults**: the L4 deployment defaults to one container, two concurrent admitted requests, and vLLM `--max-num-seqs 2` so slow multimodal PDF pages do not create an expensive queue.

## Environment

- GPU: NVIDIA L4
- Runtime: vLLM
- Model: Qwen/Qwen3.5-9B
- Max context: 4096 tokens
- Max output: 4096 tokens
- Default concurrent inputs: 2
- Default vLLM max sequences: 2

## Compatibility Overrides

When Qwen3.5 or vLLM compatibility changes upstream, you can adjust the Modal
runtime without hardcoding secrets or editing user-facing docs first.

- `GEOTECHCLI_VLLM_PIP_SPEC`
  Example: `vllm==0.18.1`
- `GEOTECHCLI_VLLM_REASONING_PARSER`
  Default: `qwen3`
- `GEOTECHCLI_VLLM_ATTENTION_BACKEND`
  Example: `FLASH_ATTN`
- `GEOTECHCLI_VLLM_MAMBA_BACKEND`
  Example: `TRITON`
- `GEOTECHCLI_VLLM_KV_CACHE_DTYPE`
  Example: `fp8`
- `GEOTECHCLI_VLLM_COMPILATION_CONFIG`
  Default: `{"cudagraph_mode":"NONE"}`
- `GEOTECHCLI_VLLM_EXTRA_ARGS`
  Example: `--swap-space 4`
- `GEOTECHCLI_MODAL_MIN_CONTAINERS`
  Default: `0`
- `GEOTECHCLI_MODAL_BUFFER_CONTAINERS`
  Default: `0`
- `GEOTECHCLI_MODAL_MAX_CONTAINERS`
  Default: `1`
- `GEOTECHCLI_MODAL_MAX_INPUTS`
  Default: `2`
- `GEOTECHCLI_VLLM_MAX_NUM_SEQS`
  Default: `2`

These are intended for deploy-time compatibility testing, not for storing
secrets. Keep tokens in Modal secrets or server environment variables only.

For the hosted-beta L4 path, avoid `--num-gpu-blocks-override` and
`--max-num-seqs` in `GEOTECHCLI_VLLM_EXTRA_ARGS`. The launcher strips those
flags because GPU block overrides can force KV-cache OOM and max sequence
admission is managed by `GEOTECHCLI_VLLM_MAX_NUM_SEQS`.

import type {
  ProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  LLMConfig,
} from '../types.js';

interface HFChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Hugging Face Inference Providers adapter.
 *
 * Uses the OpenAI-compatible router at https://router.huggingface.co/v1
 * backed by 15+ providers (Cerebras, Together, Groq, Sambanova, etc.)
 *
 * Users can specify ANY model from the Hugging Face Hub:
 *   - meta-llama/Llama-3.1-8B-Instruct
 *   - mistralai/Mistral-7B-Instruct-v0.3
 *   - Qwen/Qwen3.5-9B (vision)
 *   - deepseek-ai/DeepSeek-V3
 *   - google/gemma-2-27b-it
 *   - etc.
 *
 * Append :provider to force a specific backend:
 *   - meta-llama/Llama-3.1-8B-Instruct:cerebras
 *   - meta-llama/Llama-3.1-8B-Instruct:together
 *
 * Append :fastest or :cheapest for automatic routing:
 *   - meta-llama/Llama-3.1-8B-Instruct:fastest
 *   - meta-llama/Llama-3.1-8B-Instruct:cheapest
 *
 * Authentication: HF token (hf_xxx) from https://huggingface.co/settings/tokens
 * Required permission: "Make calls to Inference Providers"
 *
 * In strong beta, this provider can be used directly with the user's own token.
 */
export class HuggingFaceAdapter implements ProviderAdapter {
  readonly name = 'huggingface' as const;
  readonly defaultModel = 'meta-llama/Llama-3.1-8B-Instruct';
  readonly defaultVisionModel = 'Qwen/Qwen3.5-9B';

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    // router.huggingface.co auto-selects the fastest provider for any model
    this.baseUrl = baseUrl ?? 'https://router.huggingface.co/v1';
  }

  async complete(
    request: CompletionRequest,
    config: LLMConfig,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'Hugging Face token is required. Get one at https://huggingface.co/settings/tokens\n' +
        'Set it via: geotech config set llm.api_key hf_your_token',
      );
    }

    if (!config.apiKey.startsWith('hf_')) {
      throw new Error(
        'Invalid Hugging Face token format. HF tokens start with "hf_".\n' +
        'Get a token at https://huggingface.co/settings/tokens',
      );
    }

    const effectiveBaseUrl = config.baseUrl ?? this.baseUrl;
    const model =
      request.model ?? config.modelId ?? this.defaultModel;

    // Build messages in OpenAI-compatible format (HF supports this natively)
    const messages = request.messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Multimodal: HF supports OpenAI vision format directly
      return {
        role: msg.role,
        content: msg.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text ?? '' };
          }
          return {
            type: 'image_url' as const,
            image_url: {
              url: part.image_url?.url ?? '',
              detail: part.image_url?.detail ?? 'auto',
            },
          };
        }),
      };
    });

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    if (request.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const url = `${effectiveBaseUrl}/chat/completions`;
    const start = Date.now();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout ?? 90_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');

      // Friendly error messages for common HF issues
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'Hugging Face authentication failed. Check your token has "Make calls to Inference Providers" permission.\n' +
          'Manage tokens at: https://huggingface.co/settings/tokens',
        );
      }

      if (res.status === 404) {
        throw new Error(
          `Model "${model}" not found on Hugging Face Inference Providers.\n` +
          'Browse available models at: https://huggingface.co/models?pipeline_tag=text-generation',
        );
      }

      if (res.status === 429) {
        throw new Error(
          'Hugging Face rate limit reached. Wait a moment and retry, or use a HF PRO account for higher limits.',
        );
      }

      if (res.status === 503) {
        throw new Error(
          `Model "${model}" is currently loading or unavailable. Try again in 30-60 seconds, or use a different model.`,
        );
      }

      throw new Error(`Hugging Face API error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as HFChatResponse;
    const latencyMs = Date.now() - start;

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('Hugging Face API returned no choices.');
    }

    return {
      text: choice.message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model ?? model,
      provider: 'huggingface',
      latencyMs,
    };
  }
}

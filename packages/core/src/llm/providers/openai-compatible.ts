import type {
  ProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  LLMConfig,
  LLMProvider,
} from '../types.js';

interface OpenAIChatResponse {
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
 * OpenAI-compatible adapter.
 *
 * Works with:
 *   - OpenAI proper (api.openai.com)
 *   - Qwen on VPS via vLLM / Ollama (any OpenAI-compatible server)
 *   - Together, Groq, Fireworks, Deepseek, etc.
 *
 * This is the adapter used when Zhipu credits expire and you swap
 * to Qwen 3.5 4B on your VPS. Just change the baseUrl and modelId
 * in config — zero code changes needed.
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: LLMProvider;
  readonly defaultModel: string;
  readonly defaultVisionModel: string;

  private readonly baseUrl: string;

  constructor(options?: {
    name?: LLMProvider;
    baseUrl?: string;
    defaultModel?: string;
    defaultVisionModel?: string;
  }) {
    this.name = options?.name ?? 'openai';
    this.baseUrl = options?.baseUrl ?? 'https://api.openai.com/v1';
    this.defaultModel = options?.defaultModel ?? 'gpt-4o-mini';
    this.defaultVisionModel = options?.defaultVisionModel ?? 'gpt-4o';
  }

  async complete(
    request: CompletionRequest,
    config: LLMConfig,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        `API key is required for ${this.name}. Set it via config or environment variable.`,
      );
    }

    const effectiveBaseUrl = config.baseUrl ?? this.baseUrl;
    const model =
      request.model ?? config.modelId ?? this.defaultModel;

    const messages = request.messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Multimodal: pass content parts as-is (OpenAI format)
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
      signal: AbortSignal.timeout(config.timeout ?? 60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(
        `${this.name} API error (${res.status}): ${errText}`,
      );
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const latencyMs = Date.now() - start;

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`${this.name} API returned no choices.`);
    }

    return {
      text: choice.message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model ?? model,
      provider: this.name,
      latencyMs,
    };
  }
}

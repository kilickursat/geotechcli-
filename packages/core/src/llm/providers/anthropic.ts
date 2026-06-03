import type {
  ProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  LLMConfig,
} from '../types.js';
import { readProviderJsonResponse } from './response-json.js';

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic' as const;
  readonly defaultModel = 'claude-sonnet-4-20250514';
  readonly defaultVisionModel = 'claude-sonnet-4-20250514';
  readonly capabilities = {
    text: true,
    visionImages: true,
    nativePdfDocuments: false,
    jsonMode: true,
  } as const;

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? 'https://api.anthropic.com/v1';
  }

  async complete(
    request: CompletionRequest,
    config: LLMConfig,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'Anthropic API key is required. Set it via config or ANTHROPIC_API_KEY env var.',
      );
    }

    const model =
      request.model ?? config.modelId ?? this.defaultModel;

    // Anthropic separates system from messages
    let systemPrompt: string | undefined;
    const messages: Array<{ role: string; content: unknown }> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
        continue;
      }

      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        // Convert to Anthropic multimodal format
        const parts = msg.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          }
          if (part.type === 'document_url') {
            throw new Error(
              `Anthropic with model "${model}" does not support native PDF document parts in this adapter path yet. Export the page as PNG/JPG or use a provider/model with PDF-capable multimodal support.`,
            );
          }
          // Anthropic expects base64 images differently
          const url = part.image_url?.url ?? '';
          if (url.startsWith('data:')) {
            const match = url.match(
              /^data:(image\/\w+);base64,(.+)$/,
            );
            if (match) {
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: match[1],
                  data: match[2],
                },
              };
            }
          }
          return {
            type: 'image' as const,
            source: { type: 'url' as const, url },
          };
        });
        messages.push({ role: msg.role, content: parts });
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const url = `${this.baseUrl}/messages`;
    const start = Date.now();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout ?? 60_000),
    });

    const { data, rawText } = await readProviderJsonResponse<AnthropicResponse>(res, 'Anthropic');

    if (!res.ok) {
      const errText = rawText.trim() || 'Unknown error';
      throw new Error(
        `Anthropic API error (${res.status}): ${errText}`,
      );
    }

    const latencyMs = Date.now() - start;

    const text =
      data.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') ?? '';

    return {
      text,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens:
          (data.usage?.input_tokens ?? 0) +
          (data.usage?.output_tokens ?? 0),
      },
      model: data.model ?? model,
      provider: 'anthropic',
      latencyMs,
    };
  }
}

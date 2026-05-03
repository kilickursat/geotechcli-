import type {
  ProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  LLMConfig,
} from '../types.js';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '../../meta/index.js';
import { sanitizeUpstreamError } from '../util.js';

interface ZhipuChatResponse {
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

export class ZhipuAdapter implements ProviderAdapter {
  readonly name = 'zhipu' as const;
  readonly defaultModel = DEFAULT_LLM_MODEL;
  readonly defaultVisionModel = DEFAULT_LLM_VISION_MODEL;
  readonly capabilities = {
    text: true,
    visionImages: true,
    nativePdfDocuments: true,
    jsonMode: true,
  } as const;

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? 'https://api.z.ai/api/paas/v4';
  }

  async complete(
    request: CompletionRequest,
    config: LLMConfig,
  ): Promise<CompletionResponse> {
    if (!config.apiKey) {
      throw new Error(
        'Z.ai API key is required. Set it via `geotech config set llm.api_key <key>`, ZHIPU_API_KEY, or ZAI_API_KEY.',
      );
    }

    const model =
      request.model ?? config.modelId ?? this.defaultModel;

    const messages = request.messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Vision: convert ContentPart[] to Zhipu multimodal format
      const parts = msg.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: part.text };
        }
        if (part.type === 'document_url') {
          return {
            type: 'image_url' as const,
            image_url: {
              url: part.document_url.url,
            },
          };
        }
        return {
          type: 'image_url' as const,
          image_url: {
            url: part.image_url?.url ?? '',
          },
        };
      });
      return { role: msg.role, content: parts };
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
    if (request.thinkingMode) {
      body.thinking = { type: request.thinkingMode };
    }

    const baseUrl = (config.baseUrl?.trim() || this.baseUrl).replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
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
      const safeErr = sanitizeUpstreamError(errText);
      throw new Error(`Zhipu API error (${res.status}): ${safeErr}`);
    }

    const data = (await res.json()) as ZhipuChatResponse;
    const latencyMs = Date.now() - start;

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('Zhipu API returned no choices.');
    }

    return {
      text: choice.message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model ?? model,
      provider: 'zhipu',
      latencyMs,
    };
  }
}

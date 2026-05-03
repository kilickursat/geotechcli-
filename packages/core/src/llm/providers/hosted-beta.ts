import type {
  ProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  LLMConfig,
  ContentPart,
} from '../types.js';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
  GEOTECHCLI_VERSION,
} from '../../meta/index.js';
import { sanitizeUpstreamError } from '../util.js';

interface HostedBetaResponse {
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | ContentPart[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
    detail?: string;
    remaining?: number;
    retry_after_seconds?: number;
  };
}

type HostedBetaCallType = 'text' | 'vision' | 'agent';

function requestContainsNativeDocumentParts(request: CompletionRequest): boolean {
  return request.messages.some((message) =>
    Array.isArray(message.content) &&
    message.content.some((part) => part.type === 'document_url'),
  );
}

function inferCallType(request: CompletionRequest): HostedBetaCallType {
  const hasVisionInput = request.messages.some((message) =>
    Array.isArray(message.content) &&
    message.content.some((part) => part.type === 'image_url' || part.type === 'document_url'),
  );

  if (hasVisionInput) {
    return 'vision';
  }

  const hasAssistantTurns = request.messages.some((message) => message.role === 'assistant');
  if (hasAssistantTurns || request.messages.length > 2) {
    return 'agent';
  }

  return 'text';
}

function readMessageContent(content: string | ContentPart[] | undefined): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
    .join('\n')
    .trim();
}

function formatHostedBetaError(status: number, data: HostedBetaResponse, fallback: string): string {
  const rawMessage = data.error?.message?.trim() || fallback;
  const message = sanitizeUpstreamError(rawMessage);
  const rawDetail = data.error?.detail?.trim();
  const detail = rawDetail ? sanitizeUpstreamError(rawDetail) : undefined;
  const remaining =
    typeof data.error?.remaining === 'number'
      ? ` Remaining today: ${data.error.remaining}.`
      : '';
  const retryAfter =
    typeof data.error?.retry_after_seconds === 'number'
      ? ` Retry in about ${data.error.retry_after_seconds}s.`
      : '';

  if (status === 429) {
    return `${message}${remaining}${retryAfter}`.trim();
  }

  return detail ? `${message} ${detail}`.trim() : message;
}

function getMinimumHostedBetaTimeoutMs(callType: HostedBetaCallType): number {
  if (callType === 'agent') return 255_000;
  if (callType === 'vision') return 150_000;
  return 120_000;
}

export class HostedBetaAdapter implements ProviderAdapter {
  readonly name = 'hosted-beta' as const;
  readonly defaultModel = DEFAULT_LLM_MODEL;
  readonly defaultVisionModel = DEFAULT_LLM_VISION_MODEL;
  readonly capabilities = {
    text: true,
    visionImages: true,
    nativePdfDocuments: false,
    jsonMode: true,
  } as const;

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ??
      process.env.GEOTECHCLI_PROXY_URL?.trim() ??
      'https://beta.geotechcli.com/api/proxy';
  }

  async complete(
    request: CompletionRequest,
    config: LLMConfig,
  ): Promise<CompletionResponse> {
    if (requestContainsNativeDocumentParts(request)) {
      throw new Error(
        'Hosted beta currently accepts raster image inputs for multimodal analysis, not native PDF document parts. Render the PDF page to PNG/JPG before sending it through hosted-beta.',
      );
    }

    const callType = inferCallType(request);
    const timeoutMs = Math.max(config.timeout ?? 60_000, getMinimumHostedBetaTimeoutMs(callType));
    const effectiveBaseUrl =
      config.baseUrl?.trim() ||
      process.env.GEOTECHCLI_PROXY_URL?.trim() ||
      this.baseUrl;
    const model =
      request.model ??
      config.modelId ??
      (callType === 'vision' ? this.defaultVisionModel : this.defaultModel);

    const body = {
      messages: request.messages.map((message) => {
        if (typeof message.content === 'string') {
          return message;
        }
        return {
          ...message,
          content: message.content.map((part) => {
            if (part.type === 'document_url') {
              return part;
            }
            return part;
          }),
        };
      }),
      model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      jsonMode: request.jsonMode ?? false,
      thinkingMode: request.thinkingMode,
    };

    const start = Date.now();
    let res: Response;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Geotech-Client': 'geotechcli',
        'X-Geotech-Client-Version': GEOTECHCLI_VERSION,
        'X-Geotech-Call-Type': callType,
      };
      if (config.apiKey.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      }

      res = await fetch(effectiveBaseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && /abort|timeout/i.test(err.message)) {
        throw new Error(`Hosted beta request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw err;
    }

    let data: HostedBetaResponse = {};
    let fallbackError = 'Hosted beta AI request failed.';

    try {
      data = (await res.json()) as HostedBetaResponse;
    } catch {
      fallbackError = await res.text().catch(() => fallbackError);
    }

    if (!res.ok) {
      throw new Error(formatHostedBetaError(res.status, data, fallbackError));
    }

    const choice = data.choices?.[0];
    if (!choice?.message) {
      throw new Error('Hosted beta AI returned no completion choices.');
    }

    return {
      text: readMessageContent(choice.message.content),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model ?? model,
      provider: 'hosted-beta',
      latencyMs: Date.now() - start,
    };
  }
}

import type {
  LLMConfig,
  LLMProvider,
  ProviderAdapter,
  ProviderRegistry,
  CompletionRequest,
  CompletionResponse,
} from './types.js';
import { ZhipuAdapter } from './providers/zhipu.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { HuggingFaceAdapter } from './providers/huggingface.js';
import { HostedBetaAdapter } from './providers/hosted-beta.js';
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_VISION_MODEL } from '../meta/index.js';
export {
  resolveProviderCapabilities,
  providerSupportsNativePdfDocuments,
} from './capabilities.js';

// ---------------------------------------------------------------------------
// Provider registry — singleton, adapters registered once at startup
// ---------------------------------------------------------------------------

class Registry implements ProviderRegistry {
  private adapters = new Map<LLMProvider, ProviderAdapter>();

  get(name: LLMProvider): ProviderAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(
        `Unknown LLM provider: "${name}". Available: ${[...this.adapters.keys()].join(', ')}`,
      );
    }
    return adapter;
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  has(name: LLMProvider): boolean {
    return this.adapters.has(name);
  }
}

const registry = new Registry();

// Register built-in providers
registry.register(new HostedBetaAdapter());
registry.register(new ZhipuAdapter());

registry.register(
  new OpenAICompatibleAdapter({
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultVisionModel: 'gpt-4o',
  }),
);

// "openai-compatible" catch-all for Qwen on Modal, Ollama, vLLM, etc.
registry.register(
  new OpenAICompatibleAdapter({
    name: 'openai-compatible',
    baseUrl: 'http://localhost:8000/v1', // default; overridden by config.baseUrl
    defaultModel: DEFAULT_LLM_MODEL,
    defaultVisionModel: DEFAULT_LLM_VISION_MODEL,
  }),
);

registry.register(new AnthropicAdapter());

// Hugging Face Inference Providers — Pro tier only
// Supports any model on the Hub via router.huggingface.co
registry.register(new HuggingFaceAdapter());

export { registry };

// ---------------------------------------------------------------------------
// Main API: generateText / generateVision
// ---------------------------------------------------------------------------

const GEOTECH_SYSTEM_PROMPT = `You are a geotechnical engineering AI assistant integrated into geotechCLI. You have deep expertise in soil mechanics, rock mechanics, foundation engineering, tunnel engineering, slope stability, hydrogeology, and seismic analysis. Always provide technically accurate, concise responses suitable for professional engineers. Use standard geotechnical terminology and reference established methods (Terzaghi, Meyerhof, Bishop, Barton, Bieniawski, etc.) where applicable.`;

export async function generateText(
  prompt: string,
  config: LLMConfig,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    model?: string;
  },
): Promise<CompletionResponse> {
  const adapter = registry.get(config.provider);

  const messages = [
    {
      role: 'system' as const,
      content: options?.systemPrompt ?? GEOTECH_SYSTEM_PROMPT,
    },
    { role: 'user' as const, content: prompt },
  ];

  return adapter.complete(
    {
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      jsonMode: options?.jsonMode,
      model: options?.model,
    },
    config,
  );
}

/**
 * Multi-turn chat completion — accepts a full message array.
 * Used by the agent brain for proper conversation management.
 */
export async function generateChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config: LLMConfig,
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  },
): Promise<CompletionResponse> {
  const adapter = registry.get(config.provider);

  return adapter.complete(
    {
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      model: options?.model,
    },
    config,
  );
}

export async function generateVision(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  },
): Promise<CompletionResponse> {
  const adapter = registry.get(config.provider);
  const visionModel =
    options?.model ?? config.visionModelId ?? adapter.defaultVisionModel;

  const dataUri = `data:${mimeType};base64,${imageBase64}`;
  const messages = buildMultimodalMessages(
    {
      type: 'image_url',
      image_url: { url: dataUri },
    },
    prompt,
    options?.systemPrompt ??
      `${GEOTECH_SYSTEM_PROMPT}\nYou are analyzing a geotechnical image. Provide precise, quantitative observations.`,
  );

  return adapter.complete(
    {
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      model: visionModel,
    },
    config,
  );
}

export async function generateDocumentVision(
  prompt: string,
  documentBase64: string,
  mimeType: string,
  config: LLMConfig,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  },
): Promise<CompletionResponse> {
  const adapter = registry.get(config.provider);
  const visionModel =
    options?.model ?? config.visionModelId ?? adapter.defaultVisionModel;
  const dataUri = `data:${mimeType};base64,${documentBase64}`;
  const messages = buildMultimodalMessages(
    {
      type: 'document_url',
      document_url: { url: dataUri, mimeType },
    },
    prompt,
    options?.systemPrompt ??
      `${GEOTECH_SYSTEM_PROMPT}\nYou are analyzing a geotechnical document page. Provide precise, quantitative observations.`,
  );

  return adapter.complete(
    {
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      model: visionModel,
    },
    config,
  );
}

function buildMultimodalMessages(
  mediaPart: {
    type: 'image_url';
    image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
  } | {
    type: 'document_url';
    document_url: { url: string; mimeType?: string };
  },
  prompt: string,
  systemPrompt: string,
) {
  return [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    {
      role: 'user' as const,
      content: [
        mediaPart,
        { type: 'text' as const, text: prompt },
      ],
    },
  ];
}

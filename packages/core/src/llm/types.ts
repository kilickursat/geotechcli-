// ---------------------------------------------------------------------------
// LLM provider abstraction — types only, zero dependencies
// ---------------------------------------------------------------------------

export type LLMProvider =
  | 'hosted-beta'
  | 'zhipu'
  | 'openai'
  | 'anthropic'
  | 'openai-compatible'
  | 'huggingface';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  modelId?: string;
  visionModelId?: string;
  timeout?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  jsonMode?: boolean;
  model?: string;
}

export interface CompletionResponse {
  text: string;
  usage: TokenUsage;
  model: string;
  provider: LLMProvider;
  latencyMs: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderAdapter {
  readonly name: LLMProvider;
  readonly defaultModel: string;
  readonly defaultVisionModel: string;
  complete(request: CompletionRequest, config: LLMConfig): Promise<CompletionResponse>;
}

export interface ProviderRegistry {
  get(name: LLMProvider): ProviderAdapter;
  register(adapter: ProviderAdapter): void;
  has(name: LLMProvider): boolean;
}

// Tier definitions for metering
export type UserTier = 'free' | 'lite_pro' | 'pro' | 'annual';

export interface TierLimits {
  llmCallsPerMonth: number;
  visionCallsPerMonth: number;
  agentCallsPerMonth: number;
  byolEnabled: boolean;
  batchEnabled: boolean;
  reportGeneration: boolean;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    llmCallsPerMonth: 50,
    visionCallsPerMonth: 10,
    agentCallsPerMonth: 5,
    byolEnabled: false,
    batchEnabled: false,
    reportGeneration: false,
  },
  lite_pro: {
    llmCallsPerMonth: 1000,
    visionCallsPerMonth: 200,
    agentCallsPerMonth: 100,
    byolEnabled: false,
    batchEnabled: false,
    reportGeneration: true,
  },
  pro: {
    llmCallsPerMonth: Infinity,
    visionCallsPerMonth: Infinity,
    agentCallsPerMonth: Infinity,
    byolEnabled: true,
    batchEnabled: true,
    reportGeneration: true,
  },
  annual: {
    llmCallsPerMonth: Infinity,
    visionCallsPerMonth: Infinity,
    agentCallsPerMonth: Infinity,
    byolEnabled: true,
    batchEnabled: true,
    reportGeneration: true,
  },
};

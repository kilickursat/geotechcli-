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
  skillsEnabled?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageUrlContentPart {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface DocumentUrlContentPart {
  type: 'document_url';
  document_url: { url: string; mimeType?: string };
}

export type ContentPart =
  | TextContentPart
  | ImageUrlContentPart
  | DocumentUrlContentPart;

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  jsonMode?: boolean;
  model?: string;
  thinkingMode?: 'enabled' | 'disabled';
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

export interface ProviderCapabilities {
  text: boolean;
  visionImages: boolean;
  nativePdfDocuments: boolean;
  jsonMode: boolean;
}

export type ProviderCapabilityProfileId =
  | 'hosted-default'
  | 'direct-zai'
  | 'premium-byok'
  | 'open-byok'
  | 'unknown';

export type ProviderContextStrategy = 'full' | 'compact' | 'micro';

export interface ProviderPreprocessingPolicy {
  preferNativePdf: boolean;
  requirePreprocessedEvidence: boolean;
  allowImageInputs: boolean;
  allowLayoutOcr: boolean;
  maxContextStrategy: ProviderContextStrategy;
}

export interface ProviderCapabilityProfile {
  id: ProviderCapabilityProfileId;
  provider: LLMProvider;
  modelId: string | null;
  visionModelId: string | null;
  capabilities: ProviderCapabilities;
  likelyFreeRoute: boolean;
  contextStrategy: ProviderContextStrategy;
  reviewGates: string[];
  preprocessingPolicy: ProviderPreprocessingPolicy;
}

export interface ProviderAdapter {
  readonly name: LLMProvider;
  readonly defaultModel: string;
  readonly defaultVisionModel: string;
  readonly capabilities: ProviderCapabilities;
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

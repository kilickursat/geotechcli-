import type {
  LLMConfig,
  LLMProvider,
  ProviderCapabilities,
  ProviderCapabilityProfile,
  ProviderCapabilityProfileId,
  ProviderContextStrategy,
} from './types.js';

const PDF_NATIVE_MODEL_PATTERNS = [
  /qwen/i,
  /\bglm\b/i,
  /internvl/i,
  /\bqvq\b/i,
];

const VISION_MODEL_PATTERNS = [
  /vision/i,
  /\bvlm?\b/i,
  /image/i,
  /omni/i,
  /multimodal/i,
  /gpt-4o/i,
  /claude/i,
  /gemini/i,
  /pixtral/i,
  /llava/i,
  /internvl/i,
  /qwen.*(?:vl|vision)/i,
  /glm[-_.]?\d*v/i,
  /glm[-_.]?5v/i,
];

const KNOWN_TEXT_ONLY_OPEN_ROUTE_PATTERNS = [
  /poolside\/laguna/i,
  /liquid\/lfm/i,
  /minimax\/minimax-m/i,
];

function modelLooksPdfNative(model: string | undefined): boolean {
  if (!model) {
    return false;
  }

  return PDF_NATIVE_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

function modelLooksVisionCapable(model: string | undefined): boolean {
  if (!model) {
    return false;
  }

  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

function openRouteLooksTextOnly(model: string | undefined): boolean {
  if (!model) {
    return false;
  }

  return KNOWN_TEXT_ONLY_OPEN_ROUTE_PATTERNS.some((pattern) => pattern.test(model));
}

function normalizeModel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveProfileId(provider: LLMProvider): ProviderCapabilityProfileId {
  switch (provider) {
    case 'hosted-beta':
      return 'hosted-default';
    case 'zhipu':
      return 'direct-zai';
    case 'openai':
    case 'anthropic':
      return 'premium-byok';
    case 'openai-compatible':
    case 'huggingface':
      return 'open-byok';
    default:
      return 'unknown';
  }
}

export function isLikelyFreeRoute(value: string | null | undefined): boolean {
  return Boolean(value && /(?:^|[:/_-])free(?:$|[:/_-])/i.test(value));
}

function baseCapabilitiesForProvider(provider: LLMProvider): ProviderCapabilities {
  switch (provider) {
    case 'zhipu':
      return {
        text: true,
        visionImages: true,
        nativePdfDocuments: true,
        jsonMode: true,
      };
    case 'hosted-beta':
      return {
        text: true,
        visionImages: true,
        nativePdfDocuments: false,
        jsonMode: true,
      };
    case 'anthropic':
    case 'openai':
      return {
        text: true,
        visionImages: true,
        nativePdfDocuments: false,
        jsonMode: true,
      };
    case 'openai-compatible':
    case 'huggingface':
      return {
        text: true,
        visionImages: true,
        nativePdfDocuments: false,
        jsonMode: true,
      };
    default:
      return {
        text: true,
        visionImages: false,
        nativePdfDocuments: false,
        jsonMode: true,
      };
  }
}

export function resolveProviderCapabilities(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options?: { model?: string },
): ProviderCapabilities {
  const base = baseCapabilitiesForProvider(config.provider);
  const resolvedModel =
    options?.model?.trim()
    || config.visionModelId?.trim()
    || config.modelId?.trim()
    || undefined;

  if (
    (config.provider === 'openai-compatible' || config.provider === 'huggingface')
    && openRouteLooksTextOnly(resolvedModel)
    && !modelLooksVisionCapable(resolvedModel)
  ) {
    return {
      ...base,
      visionImages: false,
      nativePdfDocuments: false,
    };
  }

  if (
    !base.nativePdfDocuments
    && (config.provider === 'openai-compatible' || config.provider === 'huggingface')
    && modelLooksPdfNative(resolvedModel)
  ) {
    return {
      ...base,
      nativePdfDocuments: true,
    };
  }

  return base;
}

export function buildProviderReviewGates(
  capabilities: ProviderCapabilities,
  likelyFreeRoute: boolean,
  contextStrategy: ProviderContextStrategy,
): string[] {
  return [
    capabilities.text ? null : 'text-generation-unavailable',
    capabilities.visionImages ? null : 'image-understanding-unavailable',
    capabilities.nativePdfDocuments ? null : 'native-pdf-unavailable-use-preprocessed-evidence',
    capabilities.jsonMode ? null : 'strict-json-unavailable-validate-output',
    likelyFreeRoute ? 'free-route-capacity-and-feature-variance' : null,
    contextStrategy !== 'full' ? 'compact-context-required' : null,
  ].filter((value): value is string => value != null);
}

export function resolveProviderCapabilityProfile(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options?: { model?: string },
): ProviderCapabilityProfile {
  const modelId = normalizeModel(config.modelId);
  const visionModelId = normalizeModel(config.visionModelId);
  const resolvedModel = normalizeModel(options?.model) ?? visionModelId ?? modelId;
  const capabilities = resolveProviderCapabilities(config, options);
  const id = resolveProfileId(config.provider);
  const likelyFreeRoute = isLikelyFreeRoute(modelId)
    || isLikelyFreeRoute(visionModelId)
    || isLikelyFreeRoute(resolvedModel);
  const contextStrategy: ProviderContextStrategy = likelyFreeRoute
    ? 'micro'
    : id === 'open-byok'
      ? 'compact'
      : 'full';
  const reviewGates = buildProviderReviewGates(capabilities, likelyFreeRoute, contextStrategy);

  return {
    id,
    provider: config.provider,
    modelId,
    visionModelId,
    capabilities,
    likelyFreeRoute,
    contextStrategy,
    reviewGates,
    preprocessingPolicy: {
      preferNativePdf: capabilities.nativePdfDocuments,
      requirePreprocessedEvidence: !capabilities.nativePdfDocuments,
      allowImageInputs: capabilities.visionImages,
      allowLayoutOcr: config.provider === 'hosted-beta' || config.provider === 'zhipu',
      maxContextStrategy: contextStrategy,
    },
  };
}

export function providerSupportsNativePdfDocuments(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options?: { model?: string },
): boolean {
  return resolveProviderCapabilities(config, options).nativePdfDocuments;
}

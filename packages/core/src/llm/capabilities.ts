import type { LLMConfig, LLMProvider, ProviderCapabilities } from './types.js';

const PDF_NATIVE_MODEL_PATTERNS = [
  /qwen/i,
  /\bglm\b/i,
  /internvl/i,
  /\bqvq\b/i,
];

function modelLooksPdfNative(model: string | undefined): boolean {
  if (!model) {
    return false;
  }

  return PDF_NATIVE_MODEL_PATTERNS.some((pattern) => pattern.test(model));
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

export function providerSupportsNativePdfDocuments(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  options?: { model?: string },
): boolean {
  return resolveProviderCapabilities(config, options).nativePdfDocuments;
}

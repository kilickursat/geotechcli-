import { describe, expect, it } from 'vitest';

import {
  providerSupportsNativePdfDocuments,
  resolveProviderCapabilities,
} from '../src/llm/capabilities.js';

describe('provider multimodal capabilities', () => {
  it('keeps hosted beta image-capable but not natively PDF-capable through the public proxy', () => {
    const capabilities = resolveProviderCapabilities({
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    });

    expect(capabilities.visionImages).toBe(true);
    expect(capabilities.nativePdfDocuments).toBe(false);
  });

  it('keeps anthropic image-capable but not native PDF-capable', () => {
    const capabilities = resolveProviderCapabilities({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      visionModelId: 'claude-sonnet-4-20250514',
    });

    expect(capabilities.visionImages).toBe(true);
    expect(capabilities.nativePdfDocuments).toBe(false);
  });

  it('enables native PDF heuristics for Qwen-like openai-compatible models', () => {
    expect(providerSupportsNativePdfDocuments({
      provider: 'openai-compatible',
      modelId: 'Qwen/Qwen3.5-9B',
      visionModelId: '',
    })).toBe(true);

    expect(providerSupportsNativePdfDocuments({
      provider: 'huggingface',
      modelId: 'meta-llama/Llama-3.1-8B-Instruct',
      visionModelId: '',
    })).toBe(false);
  });

  it('does not over-advertise image understanding for known text-only free open routes', () => {
    const capabilities = resolveProviderCapabilities({
      provider: 'openai-compatible',
      modelId: 'poolside/laguna-m.1:free',
      visionModelId: '',
    });

    expect(capabilities.text).toBe(true);
    expect(capabilities.visionImages).toBe(false);
    expect(capabilities.nativePdfDocuments).toBe(false);
  });

  it('keeps known multimodal open routes image-capable while still requiring page preprocessing for PDFs', () => {
    const capabilities = resolveProviderCapabilities({
      provider: 'openai-compatible',
      modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      visionModelId: '',
    });

    expect(capabilities.visionImages).toBe(true);
    expect(capabilities.nativePdfDocuments).toBe(false);
  });
});

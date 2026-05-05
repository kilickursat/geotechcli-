import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
  generateText: vi.fn(),
}));

import { generateChat, generateText } from '../src/llm/router.js';
import { runAgent } from '../src/agents/brain.js';
import { runSwarm } from '../src/agents/swarm.js';
import {
  buildProviderOperatingContract,
  buildProviderOperatingPrompt,
} from '../src/agents/provider-operating-contract.js';

const mockedGenerateChat = vi.mocked(generateChat);
const mockedGenerateText = vi.mocked(generateText);

function response(text: string) {
  return {
    text,
    usage: { totalTokens: 1 },
    latencyMs: 1,
  } as any;
}

describe('provider-agnostic agent operating contract', () => {
  beforeEach(() => {
    mockedGenerateChat.mockReset();
    mockedGenerateText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('profiles free OpenRouter-style BYOK models with compact operating gates', () => {
    const contract = buildProviderOperatingContract({
      provider: 'openai-compatible',
      modelId: 'poolside/laguna-m.1:free',
      visionModelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    });

    expect(contract.profile).toBe('open-byok');
    expect(contract.likelyFreeRoute).toBe(true);
    expect(contract.contextStrategy).toBe('micro');
    expect(contract.reviewGates).toContain('native-pdf-unavailable-use-preprocessed-evidence');
    expect(contract.reviewGates).toContain('free-route-capacity-and-feature-variance');
    expect(contract.prompt).toContain('DocumentEvidencePacket');
    expect(contract.prompt).toContain('free/open routed model');
    expect(contract.prompt).toContain('Use GeotechCLI tools for calculations');
  });

  it('gates image understanding for text-only BYOK routes without a vision model', () => {
    const contract = buildProviderOperatingContract({
      provider: 'openai-compatible',
      modelId: 'poolside/laguna-m.1:free',
      visionModelId: '',
    });

    expect(contract.capabilities.visionImages).toBe(false);
    expect(contract.reviewGates).toContain('image-understanding-unavailable');
    expect(contract.prompt).toContain('images=no');
    expect(contract.prompt).toContain('ask GeotechCLI tools/preprocessing for OCR');
  });

  it('keeps multimodal BYOK routes image-capable while retaining open-route gates', () => {
    const contract = buildProviderOperatingContract({
      provider: 'openai-compatible',
      modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      visionModelId: '',
    });

    expect(contract.capabilities.visionImages).toBe(true);
    expect(contract.reviewGates).not.toContain('image-understanding-unavailable');
    expect(contract.reviewGates).toContain('free-route-capacity-and-feature-variance');
  });

  it('keeps hosted GLM on the same operating scaffold without free-route gates', () => {
    const prompt = buildProviderOperatingPrompt({
      provider: 'hosted-beta',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
    }, { compact: true });

    expect(prompt).toContain('provider=hosted-beta');
    expect(prompt).toContain('profile=hosted-default');
    expect(prompt).toContain('DocumentEvidencePacket');
    expect(prompt).not.toContain('free/open routed model');
  });

  it('injects the operating contract into single-agent prompts for BYOK models', async () => {
    mockedGenerateChat.mockResolvedValueOnce(response('Evidence-bound answer.'));

    await runAgent(
      'Summarize this geotechnical report evidence.',
      {
        provider: 'openai-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'poolside/laguna-m.1:free',
      },
      () => {},
    );

    const messages = mockedGenerateChat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain('PROVIDER-AGNOSTIC GEOTECHCLI OPERATING CONTRACT');
    expect(messages[0]?.content).toContain('provider=openai-compatible');
    expect(messages[0]?.content).toContain('free-route-capacity-and-feature-variance');
    expect(messages[0]?.content).toContain('If the provider/model lacks image or native-PDF capability');
  });

  it('injects the operating contract into swarm specialist prompts', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'))
      .mockResolvedValueOnce(response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'))
      .mockResolvedValueOnce(response('```review\n{"verdict":"APPROVED","notes":["ok"],"confidence":91}\n```'));
    mockedGenerateText.mockResolvedValueOnce(response('final report'));

    await runSwarm(
      'Review a shallow foundation check.',
      {
        provider: 'openai-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'poolside/laguna-m.1:free',
      },
      () => {},
    );

    const firstMessages = mockedGenerateChat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    const finalSynthesisOptions = mockedGenerateText.mock.calls[0]?.[2] as { systemPrompt?: string };
    expect(firstMessages[0]?.content).toContain('Interpretation task: collect and normalize evidence');
    expect(firstMessages[0]?.content).toContain('provider=openai-compatible');
    expect(finalSynthesisOptions.systemPrompt).toContain('Orchestrator task: synthesize agent outputs');
    expect(finalSynthesisOptions.systemPrompt).toContain('never hide provider capability failures');
  });
});

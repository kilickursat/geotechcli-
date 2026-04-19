import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
}));

import { generateChat } from '../src/llm/router.js';
import { runAgent } from '../src/agents/brain.js';

const mockedGenerateChat = vi.mocked(generateChat);

function response(text: string) {
  return {
    text,
    usage: { totalTokens: 1 },
    latencyMs: 1,
  } as any;
}

describe('Agent skill gating', () => {
  beforeEach(() => {
    mockedGenerateChat.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks skill tool calls when skills are disabled for the session', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(response('```tool\n{"tool":"list_skills","args":{}}\n```'))
      .mockResolvedValueOnce(response('Skills are disabled, continuing without them.'));

    const session = await runAgent(
      'help me assess a foundation concept',
      {
        provider: 'openai',
        apiKey: 'test-key',
        skillsEnabled: false,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 2, soilType: 'sand' }] }],
      },
    );

    expect(session.steps.some((step) => step.type === 'error' && step.content.includes('Skill tool blocked'))).toBe(true);
    expect(session.steps.some((step) => step.type === 'answer' && step.content.includes('continuing without them'))).toBe(true);
  });
});

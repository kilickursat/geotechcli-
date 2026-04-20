import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
}));

vi.mock('../src/skills/index.js', () => ({
  ensureBundledSkillsInstalled: vi.fn(),
  isAgentSkillToolName: (toolName: string) => ['list_skills', 'describe_skill', 'run_skill'].includes(toolName),
  listInstalledSkills: vi.fn(() => [
    {
      name: 'shallow-foundation-option-screening',
      displayName: 'Shallow Foundation Option Screening',
      description: 'screen shallow foundation options',
      runtime: 'python-script',
    },
  ]),
  getStrongBetaSkillApproval: vi.fn((name: string) => ({
    status: name === 'shallow-foundation-option-screening' ? 'approved' : 'held_back',
    reason: '',
    certifiedAt: '2026-04-19',
  })),
  isStrongBetaSkillApproved: vi.fn((name: string) => name === 'shallow-foundation-option-screening'),
  getInstalledSkill: vi.fn((name: string) => ({
    name,
    displayName: 'Shallow Foundation Option Screening',
    description: 'screen shallow foundation options',
    runtime: 'python-script',
    entryScript: 'scripts/shallow_foundation_option_screening.py',
    hasOpenAIYaml: true,
  })),
  readInstalledSkillGuide: vi.fn(() => '# Shallow Foundation Option Screening'),
  runInstalledSkill: vi.fn(() => ({
    success: true,
    skill: { name: 'shallow-foundation-option-screening' },
    summary: 'Shallow Foundation Option Screening completed successfully.',
    outputDir: 'output',
    runDir: 'run',
    swarmHandoff: null,
    engineeringReport: null,
    caseFileArtifactMap: null,
    stdout: '',
    stderr: '',
    persistedToProject: false,
  })),
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

  it('allows explicit skill tool calls when skills are enabled for the session', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(response('```tool\n{"tool":"list_skills","args":{}}\n```'))
      .mockResolvedValueOnce(response('```tool\n{"tool":"describe_skill","args":{"name":"shallow-foundation-option-screening"}}\n```'))
      .mockResolvedValueOnce(response('Used the installed skill catalog successfully.'));

    const session = await runAgent(
      'find the best installed skill for shallow foundation screening',
      {
        provider: 'openai',
        apiKey: 'test-key',
        skillsEnabled: true,
      },
      () => {},
    );

    expect(session.steps.some((step) => step.type === 'tool_result' && step.toolName === 'list_skills')).toBe(true);
    expect(session.steps.some((step) => step.type === 'tool_result' && step.toolName === 'describe_skill')).toBe(true);
    expect(session.steps.some((step) => step.type === 'error' && step.content.includes('Skill tool blocked'))).toBe(false);
    expect(session.steps.some((step) => step.type === 'answer' && step.content.includes('skill catalog successfully'))).toBe(true);
  });
});

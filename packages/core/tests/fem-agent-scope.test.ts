import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
  generateText: vi.fn(),
}));

import { generateChat } from '../src/llm/router.js';
import { runAgent } from '../src/agents/brain.js';
import { toolRegistry } from '../src/agents/tools.js';

import '../src/agents/runtime-bootstrap.js';

const mockedGenerateChat = vi.mocked(generateChat);

describe('FEM scoped agent', () => {
  beforeEach(() => {
    mockedGenerateChat.mockReset();
  });

  it('hides non-FEM tools from the prompt and blocks them at execution time', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will try a general calculation.\n```tool\n{"tool":"calculate_bearing_capacity","args":{"depth":2,"frictionAngle":30}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The general calculation tool was blocked. FEM planning must use only FEM route, draft, and validation tools.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'Plan a FEM excavation analysis.',
      {
        provider: 'openai-compatible',
        modelId: 'test',
        apiKey: 'test',
        timeout: 1000,
        skillsEnabled: false,
      },
      () => {},
      undefined,
      {
        allowedTools: [
          'list_fem_capabilities',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        systemPromptSuffix: 'FEM scoped-agent rule.',
      },
    );

    const systemPrompt = mockedGenerateChat.mock.calls[0]?.[0][0]?.content ?? '';
    expect(systemPrompt).toContain('list_fem_capabilities');
    expect(systemPrompt).toContain('prepare_fem_analysis_case');
    expect(systemPrompt).toContain('validate_fem_analysis_case');
    expect(systemPrompt).not.toContain('calculate_bearing_capacity');
    expect(session.steps.some((step) => step.type === 'error' && /scoped agent/i.test(step.content))).toBe(true);
    expect(session.steps.find((step) => step.type === 'answer')?.content).toContain('FEM planning');
  });

  it('allows deterministic FEM planning tools inside the scoped agent', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will list FEM capabilities.\n```tool\n{"tool":"list_fem_capabilities","args":{"objective":"excavation-deformation"}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The excavation-deformation route is available as a deterministic experimental preview.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'Which FEM route fits braced excavation?',
      {
        provider: 'openai-compatible',
        modelId: 'test',
        apiKey: 'test',
        timeout: 1000,
        skillsEnabled: false,
      },
      () => {},
      undefined,
      {
        allowedTools: [
          'list_fem_capabilities',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
      },
    );

    expect(session.steps.find((step) => step.type === 'tool_result')?.content).toContain('excavation-deformation');
    expect(session.steps.find((step) => step.type === 'answer')?.content).toContain('deterministic experimental preview');
  });

  it('blocks attempts to shell out to geotech fem run inside the scoped agent', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will run the reviewed case.\n```tool\n{"tool":"run_command","args":{"command":"geotech fem run analysis_case.json --experimental"}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'I cannot run the FEM solver from the scoped agent. I can only draft or validate the analysis case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });
    const executeSpy = vi.spyOn(toolRegistry, 'execute');

    const session = await runAgent(
      'Run this FEM case.',
      {
        provider: 'openai-compatible',
        modelId: 'test',
        apiKey: 'test',
        timeout: 1000,
        skillsEnabled: false,
      },
      () => {},
      undefined,
      {
        allowedTools: [
          'list_fem_capabilities',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        systemPromptSuffix: 'FEM scoped-agent rule.',
      },
    );

    const systemPrompt = mockedGenerateChat.mock.calls[0]?.[0][0]?.content ?? '';
    expect(systemPrompt).not.toContain('run_command');
    expect(systemPrompt).not.toContain('run_fem_analysis_case');
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        toolName: 'run_command',
        content: expect.stringMatching(/scoped agent|blocked/i),
      }),
    ]));
    expect(executeSpy).not.toHaveBeenCalledWith('run_command', expect.anything());
    expect(session.context).not.toHaveProperty('run_command');
  });
});

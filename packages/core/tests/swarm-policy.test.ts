import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/router.js', () => ({
  generateChat: vi.fn(),
  generateText: vi.fn(),
}));

import { generateChat, generateText } from '../src/llm/router.js';
import { toolRegistry } from '../src/agents/tools.js';
import { getAllowedToolsForAgent, isToolAllowedForAgent, runSwarm } from '../src/agents/swarm.js';

const mockedGenerateChat = vi.mocked(generateChat);
const mockedGenerateText = vi.mocked(generateText);

function response(text: string) {
  return {
    text,
    usage: { totalTokens: 1 },
    latencyMs: 1,
  } as any;
}

describe('Swarm tool policy', () => {
  beforeEach(() => {
    mockedGenerateChat.mockReset();
    mockedGenerateText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps each agent inside its allowlist', () => {
    expect(isToolAllowedForAgent('reviewer', 'query_standards')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'list_persisted_ingest_reviews')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'load_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'list_persisted_ingest_review_approvals')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'load_persisted_ingest_review_approval')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'approve_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'promote_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('reviewer', 'calculate_bearing_capacity')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'run_skill')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'calculate_bearing_capacity')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'ingest_geotech_document')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'list_persisted_ingest_reviews')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'load_persisted_ingest_review')).toBe(true);
    expect(isToolAllowedForAgent('interpretation', 'list_persisted_ingest_review_approvals')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'load_persisted_ingest_review_approval')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'approve_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'promote_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'list_skills')).toBe(false);
    expect(isToolAllowedForAgent('interpretation', 'list_skills', true)).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'calculate_bearing_capacity')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'ingest_geotech_document')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'list_persisted_ingest_review_approvals')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'load_persisted_ingest_review_approval')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'approve_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'promote_persisted_ingest_review')).toBe(false);
    expect(isToolAllowedForAgent('simulation', 'generate_report')).toBe(true);
    expect(isToolAllowedForAgent('simulation', 'query_standards')).toBe(false);
    expect(isToolAllowedForAgent('reviewer', 'generate_report')).toBe(false);
    expect(getAllowedToolsForAgent('reviewer')).not.toContain('project_add_assumption');
    expect(getAllowedToolsForAgent('reviewer', true)).not.toContain('run_skill');
  });

  it('blocks reviewer attempts to invoke simulation tools during runSwarm', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```tool\n{"tool":"calculate_bearing_capacity","args":{"width":2,"depth":1,"frictionAngle":30}}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["policy check"],"confidence":96}\n```'),
      );

    mockedGenerateText.mockResolvedValue(response('final report'));

    const executeSpy = vi.spyOn(toolRegistry, 'execute');

    const session = await runSwarm(
      'review a shallow foundation check',
      {} as any,
      () => {},
      {},
    );

    expect(session.reviewPassed).toBe(true);
    expect(executeSpy).not.toHaveBeenCalled();
    expect(mockedGenerateChat).toHaveBeenCalled();
  });

  it('returns a deterministic final answer when swarm synthesis fails', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"simulation","data":{"soil":"sand"},"summary":"parsed"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```handoff\n{"to":"reviewer","results":{"fos":1.6},"summary":"calculated"}\n```'),
      )
      .mockResolvedValueOnce(
        response('```review\n{"verdict":"APPROVED","notes":["policy check"],"confidence":96}\n```'),
      );

    mockedGenerateText.mockRejectedValue(new Error('hosted synthesis timed out'));

    const session = await runSwarm(
      'review a shallow foundation check',
      {} as any,
      () => {},
      {},
    );

    const finalStep = session.steps.at(-1);
    expect(finalStep?.type).toBe('answer');
    expect(finalStep?.content).toContain('Swarm analysis completed');
    expect(finalStep?.content).toContain('hosted synthesis timed out');
    expect(finalStep?.content).toContain('Simulation output');
  });
});

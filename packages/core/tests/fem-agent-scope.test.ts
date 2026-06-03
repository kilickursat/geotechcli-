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
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        systemPromptSuffix: 'FEM scoped-agent rule.',
      },
    );

    const systemPrompt = mockedGenerateChat.mock.calls[0]?.[0][0]?.content ?? '';
    expect(systemPrompt).toContain('list_fem_capabilities');
    expect(systemPrompt).toContain('assess_fem_production_readiness');
    expect(systemPrompt).toContain('prepare_fem_analysis_case');
    expect(systemPrompt).toContain('validate_fem_analysis_case');
    expect(systemPrompt).not.toContain('calculate_bearing_capacity');
    expect(session.steps.some((step) => step.type === 'error' && /scoped agent/i.test(step.content))).toBe(true);
    expect(session.steps.find((step) => step.type === 'answer')?.content).toContain('FEM planning');
  });

  it('blocks production-grade FEM answers until production readiness is assessed', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'The nonlinear FEM solver is production ready.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'I need to assess production readiness first.\n```tool\n{"tool":"assess_fem_production_readiness","args":{"objective":"excavation-deformation","requestedFeatures":["nonlinear-plasticity","consolidation","seepage-pore-pressure-coupling","support-design"]}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'Production-grade FEM is blocked until nonlinear, consolidation, seepage, support-design, benchmark, and reviewer gates are implemented.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'make excavation FEM production-grade with nonlinear plasticity, consolidation, seepage, and support design',
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
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
          'validate_fem_analysis_case',
        ],
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['assess_fem_production_readiness'],
      },
    );

    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        content: expect.stringContaining('Final answer blocked until required scoped tool'),
      }),
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'assess_fem_production_readiness',
      }),
      expect.objectContaining({
        type: 'tool_result',
        content: expect.stringContaining('FEM production readiness blocked'),
      }),
    ]));
    expect(session.steps.find((step) => step.type === 'answer')?.content).toContain('Production-grade FEM is blocked');
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

  it('keeps foundation-looking FEM prompts inside the scoped FEM tool loop', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft with explicit user values.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","geometry":{"raftLengthM":10,"raftWidthM":8},"load":{"pressureKpa":150},"material":{"elasticModulusKpa":50000,"poissonRatio":0.3}}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The FEM draft is prepared for human review only; it must not be run by the scoped agent.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case for a 10 by 8 m raft at 150 kPa, E 50000 kPa, nu 0.30; do not run it',
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
        disableDeterministicPreflight: true,
        systemPromptSuffix: 'FEM scoped-agent rule.',
      },
    );

    expect(mockedGenerateChat).toHaveBeenCalled();
    expect(session.totalTokens).toBeGreaterThan(0);
    expect(session.steps.find((step) => step.type === 'tool_call')?.toolName).toBe('prepare_fem_analysis_case');
    expect(session.steps.find((step) => step.type === 'tool_result')?.content).toContain('foundation-settlement');
    expect(session.steps.some((step) => step.type === 'error' && /blocked low-confidence/i.test(step.content))).toBe(false);
    expect(session.steps.find((step) => step.type === 'answer')?.content).toContain('human review');
  });

  it('normalizes provider-style FEM draft aliases before tool execution', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft with explicit user values.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","geometry":{"type":"raft","length_m":10,"width_m":8},"loading":{"bearing_pressure_kPa":150},"material":{"E_kPa":50000,"nu":0.3},"groundwater":{"assumed_depth_m":null}}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The FEM draft tool ran and returned a review-gated analysis case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case for a 10 by 8 m raft at 150 kPa, E 50000 kPa, nu 0.30; do not run it',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    const call = session.steps.find((step) => step.type === 'tool_call' && step.toolName === 'prepare_fem_analysis_case');
    expect(call?.toolArgs?.geometry).toMatchObject({ raftLengthM: 10, raftWidthM: 8 });
    expect(call?.toolArgs?.load).toMatchObject({ pressureKpa: 150 });
    expect(call?.toolArgs?.material).toMatchObject({ elasticModulusKpa: 50000, poissonRatio: 0.3 });

    const result = session.steps.find((step) => step.type === 'tool_result' && step.toolName === 'prepare_fem_analysis_case');
    const draft = result?.toolResult?.data as any;
    expect(result?.content).toContain('missing inputs: none');
    expect(session.steps.some((step) => step.type === 'error' && /blocked low-confidence/i.test(step.content))).toBe(false);
    expect(draft.analysisCase.geometry.raft.lengthM).toBe(10);
    expect(draft.analysisCase.geometry.raft.widthM).toBe(8);
    expect(draft.analysisCase.loads[0].pressureKpa).toBe(150);
  });

  it('normalizes nested FEM inputs payloads produced by hosted models', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","inputs":{"foundation_type":"raft","plan_dimensions":{"length_m":10,"width_m":8},"service_pressure_kPa":150,"soil_elastic_modulus_kPa":50000,"soil_poissons_ratio":0.3}}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The FEM draft tool ran and returned a review-gated analysis case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case for a 10 by 8 m raft at 150 kPa, E 50000 kPa, nu 0.30; do not run it',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    const call = session.steps.find((step) => step.type === 'tool_call' && step.toolName === 'prepare_fem_analysis_case');
    expect(call?.toolArgs?.geometry).toMatchObject({ raftLengthM: 10, raftWidthM: 8 });
    expect(call?.toolArgs?.load).toMatchObject({ pressureKpa: 150 });
    expect(call?.toolArgs?.material).toMatchObject({ elasticModulusKpa: 50000, poissonRatio: 0.3 });
    expect(session.steps.find((step) => step.type === 'tool_result')?.content).toContain('missing inputs: none');
    expect(session.steps.some((step) => step.type === 'error' && /FEM draft blocked|blocked low-confidence/i.test(step.content))).toBe(false);
  });

  it('normalizes flat top-level FEM prepare aliases from hosted models', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","raft_length_m":10,"raft_width_m":8,"service_pressure_kPa":150,"youngs_modulus_kPa":50000,"poissons_ratio":0.3}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The FEM draft tool ran and returned a review-gated analysis case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case for a 10 by 8 m raft at 150 kPa, E 50000 kPa, nu 0.30; do not run it',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    const call = session.steps.find((step) => step.type === 'tool_call' && step.toolName === 'prepare_fem_analysis_case');
    expect(call?.toolArgs?.geometry).toMatchObject({ raftLengthM: 10, raftWidthM: 8 });
    expect(call?.toolArgs?.load).toMatchObject({ pressureKpa: 150 });
    expect(call?.toolArgs?.material).toMatchObject({ elasticModulusKpa: 50000, poissonRatio: 0.3 });
    expect(session.steps.find((step) => step.type === 'tool_result')?.content).toContain('missing inputs: none');
    expect(session.steps.some((step) => step.type === 'error' && /FEM draft blocked|blocked low-confidence/i.test(step.content))).toBe(false);
  });

  it('normalizes raft dimension objects from hosted models', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","raft_dimensions_m":{"length":10,"width":8},"bearing_pressure_kPa":150,"soil_elastic_modulus_kPa":50000,"soil_poissons_ratio":0.3}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The FEM draft tool ran and returned a review-gated analysis case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case for a 10 by 8 m raft at 150 kPa, E 50000 kPa, nu 0.30; do not run it',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    const call = session.steps.find((step) => step.type === 'tool_call' && step.toolName === 'prepare_fem_analysis_case');
    expect(call?.toolArgs?.geometry).toMatchObject({ raftLengthM: 10, raftWidthM: 8 });
    expect(call?.toolArgs?.load).toMatchObject({ pressureKpa: 150 });
    expect(call?.toolArgs?.material).toMatchObject({ elasticModulusKpa: 50000, poissonRatio: 0.3 });
    expect(session.steps.find((step) => step.type === 'tool_result')?.content).toContain('missing inputs: none');
    expect(session.steps.some((step) => step.type === 'error' && /FEM draft blocked|blocked low-confidence/i.test(step.content))).toBe(false);
  });

  it('blocks final FEM draft answers until the required draft tool runs', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I already drafted the FEM case and it is ready for review.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'I need to run the required draft tool first.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","geometry":{"raftLengthM":10,"raftWidthM":8},"load":{"pressureKpa":150},"material":{"elasticModulusKpa":50000,"poissonRatio":0.3}}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The draft tool has now run; the case remains review-gated and must not be run by the scoped agent.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        content: expect.stringContaining('Final answer blocked until required scoped tool'),
      }),
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'prepare_fem_analysis_case',
      }),
      expect.objectContaining({
        type: 'answer',
        content: expect.stringContaining('draft tool has now run'),
      }),
    ]));
  });

  it('blocks FEM validation until a required draft tool has run', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will validate the draft first.\n```tool\n{"tool":"validate_fem_analysis_case","args":{"objective":"foundation-settlement","raft_dimensions_m":{"length":10,"width":8}}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'I need to prepare the draft first.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","raft_dimensions_m":{"length":10,"width":8},"bearing_pressure_kPa":150,"soil_elastic_modulus_kPa":50000,"soil_poissons_ratio":0.3}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The draft tool has run and returned a review-gated case.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        toolName: 'validate_fem_analysis_case',
        content: expect.stringContaining('Tool blocked until required scoped tool'),
      }),
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'prepare_fem_analysis_case',
      }),
    ]));
    expect(session.steps.some((step) => step.type === 'tool_result' && step.toolName === 'validate_fem_analysis_case')).toBe(false);
  });

  it('validates the prepared FEM case when a model references only the draft case id', async () => {
    mockedGenerateChat
      .mockResolvedValueOnce({
        text: 'I will prepare the FEM draft.\n```tool\n{"tool":"prepare_fem_analysis_case","args":{"objective":"foundation-settlement","raft_dimensions_m":{"length":10,"width":8},"bearing_pressure_kPa":150,"elasticModulus":50000,"poissonsRatio":0.3}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'I will validate the prepared case.\n```tool\n{"tool":"validate_fem_analysis_case","args":{"caseId":"raft-settlement-draft"}}\n```',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'The prepared draft validated as review-gated with no blockers.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });

    const session = await runAgent(
      'draft a foundation settlement FEM case and validate it',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    const validateCall = session.steps.find((step) => step.type === 'tool_call' && step.toolName === 'validate_fem_analysis_case');
    expect(validateCall?.toolArgs?.caseFile).toEqual(expect.objectContaining({
      schemaVersion: 'fem-analysis-case.v0',
      caseId: 'raft-settlement-draft',
    }));
    expect(session.steps.find((step) => step.type === 'tool_result' && step.toolName === 'validate_fem_analysis_case')?.content).toContain('FEM validation review');
    expect(session.steps.some((step) => step.type === 'error' && /schema\.shape-invalid/i.test(step.content))).toBe(false);
  });

  it('fails closed when required FEM tools never run before the iteration limit', async () => {
    for (let i = 0; i < 8; i++) {
      mockedGenerateChat.mockResolvedValueOnce({
        text: 'The FEM draft is complete and ready for review.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop',
      });
    }

    const session = await runAgent(
      'draft a foundation settlement FEM case',
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
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['prepare_fem_analysis_case'],
      },
    );

    expect(session.steps.filter((step) => step.type === 'error')).toHaveLength(8);
    expect(session.steps.at(-1)).toEqual(expect.objectContaining({
      type: 'answer',
      content: expect.stringContaining('Cannot complete this scoped agent task because required tool(s) did not run'),
    }));
    expect(session.steps.some((step) => step.type === 'tool_call')).toBe(false);
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

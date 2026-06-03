import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAgent } from '../src/agents/brain.js';
import { runSwarm } from '../src/agents/swarm.js';
import { classifySoilFromDescription } from '../src/vision/index.js';

describe('AI fallback behavior', () => {
  const originalFetch = global.fetch;

  function hostedBetaSuccessResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        model: 'glm-5.1',
        choices: [{ message: { role: 'assistant', content } }],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('falls back to heuristic soil classification when hosted beta is busy', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted beta provider is busy right now.',
            detail: 'Rate limit reached for requests',
          },
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const result = await classifySoilFromDescription(
      'soft clay with high plasticity and low permeability',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
    );

    expect(result.uscsSymbol).toBe('CH');
    expect(result.uscsName).toBe('Fat Clay');
    expect(result.parseStatus).toBe('parsed');
    expect(result.warnings.join(' ')).toMatch(/Heuristic fallback used/);
    expect(result.estimatedProperties.permeability).toBe('low permeability');
  });

  it('returns a deterministic fallback answer when the first agent turn cannot reach hosted beta', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted beta provider is busy right now.',
            detail: 'Rate limit reached for requests',
          },
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const session = await runAgent(
      'calculate penetration rate of EPB TBM if the rpm is 10 rpm, and clay zone with 1500 kN thrust',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 3, soilType: 'clay' }] }],
      },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/deterministic fallback reasoning/i);
    expect(answer?.content).toMatch(/EPB/);
    expect(answer?.content).toMatch(/diameter is not provided/i);
  });

  it('treats generic hosted-beta transport failures as temporary unavailability on the first agent turn', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('', {
        status: 502,
      }),
    ) as typeof fetch;

    const session = await runAgent(
      'calculate penetration rate of EPB TBM if the rpm is 10 rpm, and clay zone with 1500 kN thrust',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 3, soilType: 'clay' }] }],
      },
    );

    const errorStep = session.steps.find((step) => step.type === 'error');
    const answer = session.steps.find((step) => step.type === 'answer');
    expect(errorStep).toBeUndefined();
    expect(answer?.content).toMatch(/temporarily unavailable/i);
    expect(answer?.content).toMatch(/EPB/);
  });

  it('explains hosted GLM timeout budget exhaustion on the first agent turn', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted GLM upstream timed out.',
            detail: 'Hosted GLM upstream request exceeded the 240s timeout budget.',
          },
        }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const session = await runAgent(
      'calculate penetration rate of EPB TBM if the rpm is 10 rpm, and clay zone with 1500 kN thrust',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 3, soilType: 'clay' }] }],
      },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/Hosted GLM provider/i);
    expect(answer?.content).toMatch(/timeout budget/i);
    expect(answer?.content).toMatch(/EPB/);
  });

  it('returns an immediate geotechnical intake answer for under-specified foundation requests', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const session = await runAgent(
      'classify the soil profile and recommend foundation type for a 12-story building',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/12-story/i);
    expect(answer?.content).toMatch(/Foundation screening \/ selection/i);
    expect(answer?.content).toMatch(/Soil classification/i);
    expect(answer?.content).toMatch(/Minimum inputs still needed/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an immediate geotechnical intake answer in runSwarm for under-specified foundation requests', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const session = await runSwarm(
      'classify the soil profile and recommend foundation type for a 12-story building',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/12-story/i);
    expect(answer?.content).toMatch(/Foundation screening \/ selection/i);
    expect(answer?.content).toMatch(/Soil classification/i);
    expect(answer?.content).toMatch(/Minimum inputs still needed/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an immediate geotechnical intake answer for under-specified liquefaction requests', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const session = await runAgent(
      'assess liquefaction potential for this site during a major earthquake',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/Liquefaction assessment/i);
    expect(answer?.content).toMatch(/Earthquake magnitude and PGA/i);
    expect(answer?.content).toMatch(/SPT or CPT data by depth/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an immediate tunnelling intake answer when machine-selection prompts omit diameter and explicit tbm wording', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const session = await runAgent(
      'If UCS is 150 MPa, and there is water inflow 3L/h on the face what type of machine do we need to use',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/TBM performance \/ selection/i);
    expect(answer?.content).toMatch(/TBM or tunnel diameter/i);
    expect(answer?.content).toMatch(/predict_tbm_performance/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not let metadata-only project context disable the geotechnical intake screen', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const session = await runAgent(
      'recommend foundation type for a 12-story building',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        projectMeta: { id: 'demo-project', name: 'Demo Project' },
        recentNotes: [{ text: 'Kickoff note only' }],
      },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/Foundation screening \/ selection/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows the hosted model to run when relevant project evidence exists in context', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      hostedBetaSuccessResponse('Use the uploaded borehole and load data to continue the assessment.'),
    ) as typeof fetch;

    const session = await runAgent(
      'recommend foundation type for a 12-story building',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 2, soilType: 'clay' }] }],
      },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/uploaded borehole/i);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('uses mocked default hosted GLM to gate staged consolidation FEM planning through readiness and prepare-case tools', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'I will check FEM production readiness before drafting the staged consolidation case.',
          '```tool',
          JSON.stringify({
            tool: 'assess_fem_production_readiness',
            args: {
              objective: 'staged-settlement-consolidation',
              requestedFeatures: [
                'nonlinear-plasticity',
                'consolidation',
                'seepage-pore-pressure-coupling',
                'advanced-staged-construction',
                'real-project-workspace-to-run-acceptance',
              ],
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'Readiness is blocked, so I will prepare the staged consolidation route draft without claiming a solver run.',
          '```tool',
          JSON.stringify({
            tool: 'prepare_fem_analysis_case',
            args: {
              objective: 'staged-settlement-consolidation',
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          'Staged consolidation is draft-prepared but review-gated; production readiness is blocked and no solver was run.',
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const session = await runAgent(
      'Use the default hosted GLM agent to plan a staged settlement consolidation FEM case. Check readiness first, then prepare the case route without running a solver.',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      undefined,
      {
        allowedTools: [
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
        ],
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: [
          'assess_fem_production_readiness',
          'prepare_fem_analysis_case',
        ],
      },
    );

    const firstRequest = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'),
    ) as { model?: string };
    expect(firstRequest.model).toBe('glm-5.1');

    const toolCalls = session.steps.filter((step) => step.type === 'tool_call');
    expect(toolCalls.map((step) => step.toolName)).toEqual([
      'assess_fem_production_readiness',
      'prepare_fem_analysis_case',
    ]);
    expect(toolCalls[0]?.toolArgs).toMatchObject({
      objective: 'staged-settlement-consolidation',
      requestedFeatures: expect.arrayContaining([
        'consolidation',
        'nonlinear-plasticity',
        'seepage-pore-pressure-coupling',
        'advanced-staged-construction',
        'real-project-workspace-to-run-acceptance',
      ]),
    });
    expect(toolCalls[1]?.toolArgs).toMatchObject({
      objective: 'staged-settlement-consolidation',
    });

    const readinessResult = session.steps.find(
      (step) => step.type === 'tool_result' && step.toolName === 'assess_fem_production_readiness',
    );
    expect(readinessResult?.content).toContain('FEM production readiness blocked');
    const readinessData = readinessResult?.toolResult?.data as any;
    expect(readinessData).toMatchObject({
      productionReady: false,
      status: 'blocked',
    });
    expect(readinessData.engineeringEvidence).toMatchObject({
      productionReady: false,
      status: 'kernel-verified',
    });
    expect(readinessData.engineeringEvidence.verifiedFeatures)
      .toContain('global-plane-strain-assembly');
    expect(readinessData.engineeringEvidence.verifiedFeatures)
      .toContain('coupled-nonlinear-plane-strain');
    expect(readinessData.engineeringEvidence.verifiedFeatures)
      .toContain('coupled-biot-plane-strain');
    expect(readinessData.engineeringEvidence.verifiedFeatures)
      .toContain('seepage-pore-pressure-coupling');
    expect(readinessData.engineeringEvidence.benchmarks.map((item: any) => item.id))
      .toEqual(expect.arrayContaining([
        'quad4-plane-strain-biot-u-p-dof-coupling',
        'quad4-plane-strain-biot-u-p-effective-stress-coupling',
        'quad4-plane-strain-biot-u-p-free-residual',
        'quad4-plane-strain-biot-u-p-mass-residual',
        'quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract',
        'quad4-plane-strain-biot-u-p-alpha-zero-decoupling',
      ]));
    expect(readinessData.blockers).toEqual(expect.arrayContaining([
      'biot-u-p-coupling-evidence-kernel-not-route-backed-result-manifest-or-production-sparse-solver',
      'production-sparse-fem-solver-and-2d-3d-result-route-not-integrated-with-these-kernels',
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
    ]));
    expect(readinessData.agentEvidenceSummary)
      .toContain('global-plane-strain-assembly');
    expect(readinessData.agentEvidenceSummary)
      .toContain('coupled-nonlinear-plane-strain');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-dof-coupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-effective-stress-coupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-free-residual');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-mass-residual');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-alpha-zero-decoupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('seepage-pore-pressure-coupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('biot-u-p-coupling-evidence-kernel-not-route-backed-result-manifest-or-production-sparse-solver');
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}'),
    ) as { model?: string; messages?: Array<{ content?: unknown }> };
    const secondPrompt = (secondRequest.messages ?? [])
      .map((message) => typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content))
      .join('\n');
    expect(secondRequest.model).toBe('glm-5.1');
    expect(secondPrompt).toContain('[Tool Result: assess_fem_production_readiness]');
    expect(secondPrompt).toContain('productionReady: no');
    expect(secondPrompt).toContain('coupled-nonlinear-plane-strain');
    expect(secondPrompt).toContain('coupled-biot-plane-strain');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-dof-coupling');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-effective-stress-coupling');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-free-residual');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-mass-residual');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-alpha-zero-decoupling');
    expect(secondPrompt).toContain('seepage-pore-pressure-coupling');
    expect(secondPrompt)
      .toContain('biot-u-p-coupling-evidence-kernel-not-route-backed-result-manifest-or-production-sparse-solver');

    const draftResult = session.steps.find(
      (step) => step.type === 'tool_result' && step.toolName === 'prepare_fem_analysis_case',
    );
    expect(draftResult?.content).toContain('staged-settlement-consolidation');
    expect(draftResult?.content).toContain('draft prepared');
    expect(draftResult?.content).toContain('auto-proceed: no');
    expect((draftResult?.toolResult?.data as any).implemented).toBe(true);
    expect((draftResult?.toolResult?.data as any).recommendedAction).toBe('collect-inputs');
    expect((draftResult?.toolResult?.data as any).canAutoProceed).toBe(false);
    expect((draftResult?.toolResult?.data as any).missingUserInputs).toEqual(
      expect.arrayContaining([
        'stage loads',
        'stage durations',
      ]),
    );
    expect((draftResult?.toolResult?.data as any).analysisCase).toBeUndefined();

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/draft-prepared/i);
    expect(answer?.content).toMatch(/no solver/i);
    expect(answer?.content).toMatch(/production readiness is blocked|not production[- ]ready|not production[- ]grade/i);
    expect(answer?.content).not.toMatch(/\bis production[- ]?(?:ready|grade)\b/i);
    expect(answer?.content).not.toMatch(/\bready for production\b/i);
    expect(answer?.content).not.toMatch(/\bapproved for (?:production|design)\b/i);
    expect(answer?.content).not.toMatch(/\bI ran (?:the )?solver\b/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns a deterministic fallback answer in runSwarm when the first hosted-beta turn cannot reach the provider', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted beta provider is busy right now.',
            detail: 'Rate limit reached for requests',
          },
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const session = await runSwarm(
      'calculate penetration rate of EPB TBM if the rpm is 10 rpm, and clay zone with 1500 kN thrust',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      {
        soilProfiles: [{ boreholeId: 'BH-1', layers: [{ thickness: 3, soilType: 'clay' }] }],
      },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/deterministic fallback reasoning/i);
    expect(answer?.content).toMatch(/EPB/);
    expect(answer?.content).toMatch(/diameter is not provided/i);
  });

});

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
        'quad4-plane-strain-dp-isotropic-hardening-response',
        'quad4-plane-strain-biot-u-p-load-generated-pressure-acceptance',
        'quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract',
        'quad4-plane-strain-biot-u-p-alpha-zero-decoupling',
        'quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation',
      ]));
    expect(readinessData.blockers).toEqual(expect.arrayContaining([
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
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
      .toContain('quad4-plane-strain-dp-isotropic-hardening-response');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-load-generated-pressure-acceptance');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-alpha-zero-decoupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation');
    expect(readinessData.agentEvidenceSummary)
      .toContain('opengeosys-consolidation-staggered-biot-pressure-profile-t10');
    expect(readinessData.agentEvidenceSummary)
      .toContain('seepage-pore-pressure-coupling');
    expect(readinessData.agentEvidenceSummary)
      .toContain('biot-u-p-route-backed-preview-is-not-production-sparse-solver');
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
    expect(secondPrompt).toContain('quad4-plane-strain-dp-isotropic-hardening-response');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-load-generated-pressure-acceptance');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-alpha-zero-decoupling');
    expect(secondPrompt).toContain('quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation');
    expect(secondPrompt).toContain('opengeosys-consolidation-staggered-biot-pressure-profile-t10');
    expect(secondPrompt).toContain('seepage-pore-pressure-coupling');
    expect(secondPrompt)
      .toContain('biot-u-p-route-backed-preview-is-not-production-sparse-solver');

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

  it('uses mocked default hosted GLM to block production FEM claims before readiness evidence and run attempts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          'The nonlinear FEM solver is production-ready for design, so run the production FEM analysis now.',
        ),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'I need the deterministic readiness report first.',
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
                'independent-benchmark-validation',
              ],
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'I will still try to run the FEM case.',
          '```tool',
          JSON.stringify({
            tool: 'run_command',
            args: {
              command: 'geotech fem run analysis_case.json --experimental',
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'The run path is blocked, so I will only prepare a review-gated draft.',
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
          'Production readiness is blocked by deterministic FEM tool blockers before any draft recommendation. Prepare only a review-gated draft and do not run the solver or claim production design readiness.',
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const session = await runAgent(
      'Use the default hosted GLM agent to make staged settlement consolidation FEM production-ready, then draft and run the nonlinear design solver.',
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

    const requests = fetchMock.mock.calls.map((call) => (
      JSON.parse(String(call[1]?.body ?? '{}')) as { model?: string; messages?: Array<{ content?: unknown }> }
    ));
    expect(requests.map((request) => request.model)).toEqual([
      'glm-5.1',
      'glm-5.1',
      'glm-5.1',
      'glm-5.1',
      'glm-5.1',
    ]);

    const firstBlockedIndex = session.steps.findIndex(
      (step) => step.type === 'error' && step.content.includes('Final answer blocked until required scoped tool'),
    );
    const readinessCallIndex = session.steps.findIndex(
      (step) => step.type === 'tool_call' && step.toolName === 'assess_fem_production_readiness',
    );
    const readinessResultIndex = session.steps.findIndex(
      (step) => step.type === 'tool_result' && step.toolName === 'assess_fem_production_readiness',
    );
    const runAttemptIndex = session.steps.findIndex(
      (step) => step.type === 'tool_call' && step.toolName === 'run_command',
    );
    const runBlockedIndex = session.steps.findIndex(
      (step) => step.type === 'error' && step.toolName === 'run_command',
    );
    const draftCallIndex = session.steps.findIndex(
      (step) => step.type === 'tool_call' && step.toolName === 'prepare_fem_analysis_case',
    );
    expect(firstBlockedIndex).toBeGreaterThanOrEqual(0);
    expect(firstBlockedIndex).toBeLessThan(readinessCallIndex);
    expect(readinessCallIndex).toBeLessThan(readinessResultIndex);
    expect(readinessResultIndex).toBeLessThan(runAttemptIndex);
    expect(runAttemptIndex).toBeLessThan(runBlockedIndex);
    expect(runBlockedIndex).toBeLessThan(draftCallIndex);

    expect(session.steps.some((step) => (
      step.type === 'answer'
      && /solver is production-ready for design/i.test(step.content)
    ))).toBe(false);
    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        toolName: 'run_command',
        content: expect.stringContaining('Tool blocked by this scoped agent: run_command'),
      }),
    ]));

    const toolCalls = session.steps.filter((step) => step.type === 'tool_call');
    expect(toolCalls.map((step) => step.toolName)).toEqual([
      'assess_fem_production_readiness',
      'run_command',
      'prepare_fem_analysis_case',
    ]);
    const toolResults = session.steps.filter((step) => step.type === 'tool_result');
    expect(toolResults.map((step) => step.toolName)).toEqual([
      'assess_fem_production_readiness',
      'prepare_fem_analysis_case',
    ]);
    expect(session.context).not.toHaveProperty('run_command');

    const readinessData = toolResults.find(
      (step) => step.toolName === 'assess_fem_production_readiness',
    )?.toolResult?.data as any;
    expect(readinessData.productionReady).toBe(false);
    expect(readinessData.blockers).toEqual(expect.arrayContaining([
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
      'production-sparse-fem-solver-and-2d-3d-result-route-not-integrated-with-these-kernels',
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
    ]));
    expect(readinessData.agentEvidenceSummary).toContain('productionReady: no');
    expect(readinessData.agentEvidenceSummary)
      .toContain('biot-u-p-route-backed-preview-is-not-production-sparse-solver');

    const promptBeforeRunAttempt = (requests[2]?.messages ?? [])
      .map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
      .join('\n');
    expect(promptBeforeRunAttempt).toContain('[Tool Result: assess_fem_production_readiness]');
    expect(promptBeforeRunAttempt).toContain('productionReady: no');
    expect(promptBeforeRunAttempt)
      .toContain('biot-u-p-route-backed-preview-is-not-production-sparse-solver');

    const promptAfterRunBlocked = (requests[3]?.messages ?? [])
      .map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
      .join('\n');
    expect(promptAfterRunBlocked.indexOf('productionReady: no'))
      .toBeLessThan(promptAfterRunBlocked.indexOf('[Tool Blocked: run_command]'));
    expect(promptAfterRunBlocked).toContain('This scoped agent may only use');
    expect(promptAfterRunBlocked).toContain('assess_fem_production_readiness, prepare_fem_analysis_case');

    const draftResult = toolResults.find((step) => step.toolName === 'prepare_fem_analysis_case');
    expect(draftResult?.content).toContain('draft prepared');
    expect((draftResult?.toolResult?.data as any).canAutoProceed).toBe(false);
    expect((draftResult?.toolResult?.data as any).analysisCase).toBeUndefined();

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/Production readiness is blocked/i);
    expect(answer?.content).toMatch(/do not run the solver/i);
    expect(answer?.content).not.toMatch(/\bis production[- ]?(?:ready|grade)\b/i);
    expect(answer?.content).not.toMatch(/\bready for production\b/i);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('rejects default hosted GLM post-readiness FEM production overclaims', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'I will check deterministic FEM production readiness first.',
          '```tool',
          JSON.stringify({
            tool: 'assess_fem_production_readiness',
            args: {
              objective: 'staged-settlement-consolidation',
              requestedFeatures: [
                'nonlinear-plasticity',
                'consolidation',
                'seepage-pore-pressure-coupling',
                'support-design',
                'independent-benchmark-validation',
              ],
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          'The verified kernels mean production approval, so the FEM solver is ready for production design.',
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const session = await runAgent(
      'Use the default hosted GLM to decide whether staged consolidation FEM is production design ready.',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      undefined,
      {
        allowedTools: ['assess_fem_production_readiness'],
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['assess_fem_production_readiness'],
      },
    );

    const requests = fetchMock.mock.calls.map((call) => (
      JSON.parse(String(call[1]?.body ?? '{}')) as { model?: string; messages?: Array<{ content?: unknown }> }
    ));
    expect(requests.map((request) => request.model)).toEqual(['glm-5.1', 'glm-5.1']);

    const readinessResult = session.steps.find(
      (step) => step.type === 'tool_result' && step.toolName === 'assess_fem_production_readiness',
    );
    const readinessData = readinessResult?.toolResult?.data as any;
    expect(readinessData.productionReady).toBe(false);
    expect(readinessData.agentEvidenceSummary).toContain('productionReady: no');
    expect(readinessData.agentEvidenceSummary).toContain('external benchmark comparison results: 4');
    expect(readinessData.agentEvidenceSummary).toContain('opengeosys-consolidation-staggered-biot-pressure-profile-t10');
    expect(readinessData.agentEvidenceSummary).toContain('opengeosys-liquid-flow-h1-1dsteady-head-flux-gradient');
    expect(readinessData.blockers).toEqual(expect.arrayContaining([
      'external-benchmark-commercial-solver-citation-missing',
      'external-benchmark-comparison-results-missing',
    ]));

    expect(session.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        content: expect.stringContaining('Final answer blocked because it contradicted deterministic FEM production-readiness evidence'),
      }),
    ]));
    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toContain('Blocked FEM production overclaim');
    expect(answer?.content).toContain('productionReady: no');
    expect(answer?.content).toContain('external-benchmark-commercial-solver-citation-missing');
    expect(answer?.content).toMatch(/experimental previews and evidence\/approval gates/i);
    expect(answer?.content).not.toContain('ready for production design');
    expect(answer?.content).not.toMatch(/\bis production[- ]?(?:ready|grade)\b/i);
  });

  it('lets default hosted GLM use deterministic FEM support member checks without production overclaiming', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse([
          'I will run the deterministic support member check with the reviewed demand and metadata.',
          '```tool',
          JSON.stringify({
            tool: 'check_fem_support_member_design',
            args: {
              member: {
                id: 'strut-l1-bay-03',
                kind: 'strut',
                unbracedLengthM: 4,
                effectiveLengthFactor: 1,
                areaM2: 0.015,
                weakAxisMomentOfInertiaM4: 1.2e-4,
                sectionModulusM3: 0.0012,
                yieldStrengthMpa: 250,
                elasticModulusMpa: 200000,
              },
              demand: {
                axialCompressionDemandKn: 900,
                bendingMomentDemandKnM: 40,
                source: {
                  source: 'fem-result-envelope',
                  caseId: 'excavation-case-017',
                  stageId: 'stage-2',
                  loadCombination: 'temporary-support-envelope',
                  description: 'Reviewed FEM support reaction envelope at level 1.',
                  resultHashSha256: 'c'.repeat(64),
                },
              },
              factors: {
                demandFactor: 1.2,
                resistanceFactorCompression: 0.9,
                resistanceFactorFlexure: 0.9,
                maximumSlendernessRatio: 160,
              },
              review: {
                reviewer: {
                  name: 'Jane Engineer',
                  licenseId: 'PE-98765',
                  jurisdiction: 'US-NY',
                },
                reviewedAt: '2026-06-04T00:00:00.000Z',
                assumptions: [
                  {
                    id: 'assume-effective-length',
                    parameter: 'effective length factor',
                    value: 1,
                    unit: 'ratio',
                    basis: 'Pinned end restraint assumed by reviewer for temporary strut layout.',
                    confidence: 'review',
                    reviewRequired: true,
                  },
                ],
                limitations: ['Connection design and local buckling checks are outside this slice.'],
              },
            },
          }),
          '```',
        ].join('\n')),
      )
      .mockResolvedValueOnce(
        hostedBetaSuccessResponse(
          'The deterministic support member check is accepted for this reviewed member input, but it is not a FEM production approval.',
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const session = await runAgent(
      'Use the default hosted GLM to check this FEM excavation strut member and do not invent support capacity.',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      undefined,
      {
        allowedTools: ['check_fem_support_member_design'],
        disableDeterministicPreflight: true,
        requiredToolsBeforeFinal: ['check_fem_support_member_design'],
      },
    );

    const requests = fetchMock.mock.calls.map((call) => (
      JSON.parse(String(call[1]?.body ?? '{}')) as { model?: string; messages?: Array<{ content?: unknown }> }
    ));
    expect(requests.map((request) => request.model)).toEqual(['glm-5.1', 'glm-5.1']);

    const supportResult = session.steps.find(
      (step) => step.type === 'tool_result' && step.toolName === 'check_fem_support_member_design',
    );
    expect(supportResult?.content).toContain('FEM support member design check accepted');
    expect((supportResult?.toolResult?.data as any).productionClaim).toBe(false);
    expect((supportResult?.toolResult?.data as any).controllingLimitState.id).toBe('combined-axial-flexure');

    const promptAfterTool = (requests[1]?.messages ?? [])
      .map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
      .join('\n');
    expect(promptAfterTool).toContain('[Tool Result: check_fem_support_member_design]');
    expect(promptAfterTool).toContain('productionClaim: no');
    expect(promptAfterTool).toContain('controlling limit state: combined-axial-flexure');

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/not a FEM production approval/i);
    expect(answer?.content).not.toMatch(/\bis production[- ]?(?:ready|grade)\b/i);
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

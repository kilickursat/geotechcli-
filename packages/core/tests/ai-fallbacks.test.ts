import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAgent } from '../src/agents/brain.js';
import { runSwarm } from '../src/agents/swarm.js';
import { classifySoilFromDescription } from '../src/vision/index.js';

describe('AI fallback behavior', () => {
  const originalFetch = global.fetch;

  function hostedBetaSuccessResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        model: 'Qwen/Qwen3.5-9B',
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

  it('explains modal warmup or timeout budget exhaustion on the first agent turn', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Hosted model on Modal.com GPU timed out.',
            detail: 'Hosted model on Modal.com GPU is warming up or the upstream agent request exceeded the 240s timeout budget.',
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
    expect(answer?.content).toMatch(/Modal\.com GPU/i);
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

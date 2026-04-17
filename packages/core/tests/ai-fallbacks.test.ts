import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAgent } from '../src/agents/brain.js';
import { classifySoilFromDescription } from '../src/vision/index.js';

describe('AI fallback behavior', () => {
  const originalFetch = global.fetch;

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
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/deterministic fallback/i);
    expect(answer?.content).toMatch(/EPB/);
    expect(answer?.content).toMatch(/diameter is not provided/i);
  });

  it('returns an immediate deterministic screening answer for under-specified foundation requests', async () => {
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
    expect(answer?.content).toMatch(/needs site investigation data first/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a useful deterministic fallback for foundation requests when hosted beta is unavailable', async () => {
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
      'recommend foundation type for a 12-story building using the soil profile',
      {
        provider: 'hosted-beta',
        apiKey: '',
        timeout: 1000,
      },
      () => {},
      { importedDataset: { id: 'bh-1', summary: 'placeholder context to bypass preflight' } },
    );

    const answer = session.steps.find((step) => step.type === 'answer');
    expect(answer?.content).toMatch(/temporarily unavailable/i);
    expect(answer?.content).toMatch(/site investigation data/i);
    expect(answer?.content).toMatch(/calculate_bearing_capacity/i);
  });
});

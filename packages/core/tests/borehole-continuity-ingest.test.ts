import { describe, expect, it } from 'vitest';

import { ingestBoreholeLogDocument } from '../src/ingest/index.js';
import type { BoreholeInterpretation, BoreholeLayer } from '../src/vision/index.js';
import type { LLMConfig } from '../src/llm/types.js';

const config: LLMConfig = { provider: 'hosted-beta', apiKey: 'test-key', timeout: 120000 };

function layer(
  depthFrom: number | null,
  depthTo: number | null,
  description: string | null,
  uscsSymbol: string | null = null,
): BoreholeLayer {
  return { depthFrom, depthTo, description, uscsSymbol, sptN: null, waterContent: null, notes: null };
}

function pageResult(
  pageNumber: number,
  totalPages: number,
  layers: BoreholeLayer[],
  totalDepth: number,
): BoreholeInterpretation {
  return {
    boreholeId: 'BH1',
    totalDepth,
    waterTableDepth: null,
    layers,
    summary: 'Synthetic borehole page for continuity wiring test.',
    location: null,
    groundElevation: null,
    dateDrilled: null,
    drillingMethod: null,
    projectName: null,
    continuationDepth: totalDepth,
    pageNumber,
    totalPages,
    rawLLMText: '{}',
    latencyMs: 1,
    parseStatus: 'parsed',
    confidence: 88,
    warnings: [],
    canAutoProceed: true,
  };
}

async function runIngest(
  pageResults: BoreholeInterpretation[],
  extraOptions: { continuityRepair?: { gapSnapToleranceMeters?: number; maxRepairableOverlapMeters?: number } } = {},
) {
  const pages = pageResults.map((result) => ({
    base64: 'eA==',
    mimeType: 'image/png',
    pageNumber: result.pageNumber ?? 1,
    totalPages: pageResults.length,
  }));

  return ingestBoreholeLogDocument({
    config,
    source: { inputKind: 'pdf', fileName: 'continuity-test.pdf' },
    overrideBoreholeId: 'BH1',
    pages,
    ...extraOptions,
    // Avoid any network/model calls — inject deterministic page interpreters and text recovery.
    recoverTextHint: async () => ({ source: 'native-text', warnings: [] }),
    interpretPageWithContext: async (_base64, _mime, _cfg, context) => {
      const match = pageResults.find((result) => result.pageNumber === context.pageNumber);
      return match ?? pageResults[0]!;
    },
  });
}

describe('ingest borehole continuity wiring', () => {
  it('heals a page-break overlap into an advisory repair instead of a blocking restart', async () => {
    const result = await runIngest([
      pageResult(1, 2, [
        layer(0, 6, 'Made ground'),
        layer(6, 12, 'Dense sand', 'SP'),
        layer(12, 18, 'Stiff clay', 'CL'),
      ], 18),
      pageResult(2, 2, [
        layer(17.8, 24, 'Stiff clay', 'CL'),
        layer(24, 31, 'Rock'),
      ], 31),
    ]);

    expect(result.boreholes).toHaveLength(1);
    const layers = result.boreholes[0]!.layers;
    expect(layers.map((l) => l.depthFrom)).toContain(18);
    expect(layers.map((l) => l.depthFrom)).not.toContain(17.8);

    const codes = result.reviewFindings.map((f) => f.code);
    expect(codes).toContain('continuity_repair_applied');
    // The page-break overlap was healed, so the authoritative validator no longer blocks on it.
    expect(codes).not.toContain('layer_depth_restart');

    const repairFinding = result.reviewFindings.find((f) => f.code === 'continuity_repair_applied');
    expect(repairFinding?.severity).toBe('advisory');
    expect(result.warnings.some((w) => /trimmed .*overlap/i.test(w))).toBe(true);
  });

  it('leaves a genuine large overlap blocking while recording an advisory audit note', async () => {
    const result = await runIngest([
      pageResult(1, 1, [
        layer(0, 10, 'Dense sand', 'SP'),
        layer(4, 12, 'Stiff clay', 'CL'),
      ], 12),
    ]);

    expect(result.boreholes).toHaveLength(1);
    const layers = result.boreholes[0]!.layers;
    // Depths untouched: a 6 m overlap is a real anomaly, not a page-break artifact.
    expect(layers.map((l) => l.depthFrom)).toEqual([0, 4]);

    const codes = result.reviewFindings.map((f) => f.code);
    expect(codes).toContain('layer_depth_restart');
    expect(codes).toContain('continuity_unrepairable');

    const restart = result.reviewFindings.find((f) => f.code === 'layer_depth_restart');
    expect(restart?.severity).toBe('blocking');
    expect(result.reviewRequired).toBe(true);
  });

  it('honours custom continuity repair thresholds passed through ingest options', async () => {
    const pages = [
      pageResult(1, 1, [
        layer(0, 5, 'Dense sand', 'SP'),
        // 0.2 m gap: above the default 0.05 m snap tolerance, below the custom 0.3 m one.
        layer(5.2, 12, 'Stiff clay', 'CL'),
      ], 12),
    ];

    const defaultRun = await runIngest(pages);
    const defaultLayers = defaultRun.boreholes[0]!.layers;
    expect(defaultLayers.map((l) => l.depthFrom)).toEqual([0, 5.2]);
    expect(defaultRun.reviewFindings.map((f) => f.code)).not.toContain('continuity_repair_applied');

    const customRun = await runIngest(pages, {
      continuityRepair: { gapSnapToleranceMeters: 0.3 },
    });
    const customLayers = customRun.boreholes[0]!.layers;
    expect(customLayers.map((l) => l.depthFrom)).toEqual([0, 5]);
    expect(customRun.reviewFindings.map((f) => f.code)).toContain('continuity_repair_applied');
  });
});

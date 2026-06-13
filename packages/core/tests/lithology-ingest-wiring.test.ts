import { describe, expect, it } from 'vitest';

import { ingestBoreholeLogDocument } from '../src/ingest/index.js';
import type { BoreholeInterpretation, BoreholeLayer } from '../src/vision/index.js';
import type { LLMConfig } from '../src/llm/types.js';

const config: LLMConfig = { provider: 'hosted-beta', apiKey: 'test-key', timeout: 120000 };

function layer(depthFrom: number, depthTo: number, description: string, uscsSymbol: string | null = null): BoreholeLayer {
  return { depthFrom, depthTo, description, uscsSymbol, sptN: null, waterContent: null, notes: null };
}

function pageResult(pageNumber: number, totalPages: number, layers: BoreholeLayer[], totalDepth: number): BoreholeInterpretation {
  return {
    boreholeId: 'BH1',
    totalDepth,
    waterTableDepth: null,
    layers,
    summary: 'Synthetic page for lithology wiring test.',
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

async function runIngest(pageResults: BoreholeInterpretation[]) {
  const pages = pageResults.map((result) => ({
    base64: 'eA==',
    mimeType: 'image/png',
    pageNumber: result.pageNumber ?? 1,
    totalPages: pageResults.length,
  }));
  return ingestBoreholeLogDocument({
    config,
    source: { inputKind: 'pdf', fileName: 'lithology-wiring.pdf' },
    overrideBoreholeId: 'BH1',
    pages,
    recoverTextHint: async () => ({ source: 'native-text', warnings: [] }),
    interpretPageWithContext: async (_b, _m, _c, context) =>
      pageResults.find((r) => r.pageNumber === context.pageNumber) ?? pageResults[0]!,
  });
}

describe('ingest persists normalized lithology on every merged layer', () => {
  it('populates lithology with key, class, and confidence for each layer', async () => {
    const result = await runIngest([
      pageResult(1, 1, [
        layer(0, 4, 'Stiff CLAY', 'CL'),
        layer(4, 8, 'Dense sand with gravel'),
        layer(8, 12, 'PEAT, dark brown'),
        layer(12, 16, 'Mudstone'),
      ], 16),
    ]);

    const layers = result.boreholes[0]!.layers;
    expect(layers).toHaveLength(4);
    for (const l of layers) {
      expect(l.lithology).toBeTruthy();
      expect(typeof l.lithology?.key).toBe('string');
      expect(typeof l.lithology?.materialClass).toBe('string');
      expect(l.lithology!.confidence).toBeGreaterThan(0);
    }

    const find = (needle: string) => layers.find((l) => (l.description ?? '').toLowerCase().includes(needle));
    expect(find('clay')?.lithology?.key).toBe('clay');
    expect(find('sand')?.lithology?.key).toBe('gravel'); // "sand with gravel" -> gravel by precedence
    expect(find('peat')?.lithology?.key).toBe('organic');
    expect(find('peat')?.lithology?.materialClass).toBe('organic');
    expect(find('mudstone')?.lithology?.materialClass).toBe('rock');
  });

  it('keeps lithology on a layer whose depths were continuity-trimmed across a page break', async () => {
    const result = await runIngest([
      pageResult(1, 2, [layer(0, 12, 'Sand'), layer(12, 18, 'Stiff clay')], 18),
      pageResult(2, 2, [layer(17.8, 24, 'Stiff clay'), layer(24, 31, 'Rock')], 31),
    ]);

    const layers = result.boreholes[0]!.layers;
    const trimmed = layers.find((l) => l.depthFrom === 18);
    expect(trimmed).toBeTruthy();
    expect(trimmed?.lithology?.key).toBe('clay');
  });
});

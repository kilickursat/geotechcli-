import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifySoilFromDescription } from '../src/vision/index.js';
import { buildIngestDossier } from '../src/report/ingest-dossier.js';
import { buildIntegratedReviewModel } from '../src/report/integrated-review-model.js';
import type { BoreholeDocumentIngestResult } from '../src/ingest/geotech-extract.js';

/**
 * Characterization tests for the six ad-hoc lithology classifiers, exercised through public
 * surfaces. These lock CURRENT behavior for stable inputs and assert the APPROVED new values for the
 * fixes/deltas (F2 organic preserved; D1/D2 wider rock-name + moderately-strong recognition; D3
 * boulder descriptor). Run against current code, the only failures should be exactly those
 * delta rows; after delegation to the shared normalizer, all rows pass.
 */

const busyResponse = () =>
  new Response(
    JSON.stringify({ error: { message: 'Hosted beta provider is busy right now.' } }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );

const busyConfig = { provider: 'hosted-beta' as const, apiKey: '', timeout: 1000 };

describe('vision heuristic classification (classifySoilFromDescription fallback)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function classify(description: string) {
    global.fetch = vi.fn().mockResolvedValue(busyResponse()) as typeof fetch;
    return classifySoilFromDescription(description, busyConfig);
  }

  it('classifies high-plasticity clay as CH with full descriptor confidence', async () => {
    const r = await classify('soft clay with high plasticity and low permeability');
    expect(r.uscsSymbol).toBe('CH');
    expect(r.uscsName).toBe('Fat Clay');
    expect(r.confidence).toBe(90);
    expect(r.estimatedProperties.permeability).toBe('low permeability');
  });

  it('classifies stiff lean clay as CL', async () => {
    const r = await classify('stiff lean clay');
    expect(r.uscsSymbol).toBe('CL');
    expect(r.uscsName).toBe('Lean Clay');
  });

  it('locks the dead-branch behavior: silty SAND resolves to ML, not SM', async () => {
    const r = await classify('silty SAND, medium dense');
    expect(r.uscsSymbol).toBe('ML');
    expect(r.uscsName).toBe('Silt');
  });

  it('classifies well-graded gravel as GW', async () => {
    const r = await classify('well graded gravel');
    expect(r.uscsSymbol).toBe('GW');
    expect(r.uscsName).toBe('Well-Graded Gravel');
  });

  it('returns no symbol for a description without standard descriptors', async () => {
    const r = await classify('no recovery');
    expect(r.uscsSymbol).toBeNull();
    expect(r.parseStatus).toBe('failed');
  });

  // D3 (approved): boulder becomes a coarse-grained descriptor. Currently null -> after fix GP.
  it('[D3] recognizes boulders as a coarse-grained (gravel-family) descriptor', async () => {
    const r = await classify('large boulders');
    expect(r.uscsSymbol).toBe('GP');
  });
});

function layer(depthFrom: number, depthTo: number, description: string, uscsSymbol: string | null = null) {
  return { depthFrom, depthTo, description, uscsSymbol, sptN: null, waterContent: null, notes: null };
}

const BATTERY = [
  layer(0, 2, 'Made ground and brown silty clay', 'CL'),
  layer(2, 4, 'Dense sand with gravel'),
  layer(4, 6, 'Sandy CLAY'),
  layer(6, 8, 'Weathered shale, fractured'),
  layer(8, 10, 'Mudstone'),
  layer(10, 12, 'PEAT, dark brown'),
  layer(12, 14, 'Moderately strong mudstone'),
  layer(14, 16, 'Made ground with brick debris'),
];

function makeBoreholeResult(): BoreholeDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: '2026-06-13T00:00:00.000Z',
    source: { fileName: 'battery.pdf', inputKind: 'pdf', totalPages: 1, successfulPages: 1, failedPages: 0 },
    inspection: null,
    inspectionSummary: null,
    boreholes: [
      {
        boreholeId: 'BH1',
        totalDepth: 16,
        waterTableDepth: null,
        layers: BATTERY,
        summary: 'Battery borehole for lithology characterization.',
        location: null,
        groundElevation: null,
        dateDrilled: null,
        drillingMethod: null,
        projectName: null,
        continuationDepth: null,
        pageNumber: 1,
        totalPages: 1,
        rawLLMText: '{}',
        latencyMs: 1,
        parseStatus: 'parsed',
        confidence: 88,
        warnings: [],
        canAutoProceed: true,
      },
    ],
    pageAudits: [],
    pageFailures: [],
    warnings: [],
    reviewFindings: [],
    reviewReasons: [],
    reviewRequired: false,
    confidence: 88,
    canAutoProceed: true,
  };
}

describe('ingest-dossier materialKey + materialTone', () => {
  const dossier = buildIngestDossier(makeBoreholeResult());
  const layers = dossier.boreholeProfile?.columns[0]?.layers ?? [];
  const byText = (needle: string) =>
    layers.find((l) => l.description.toLowerCase().includes(needle.toLowerCase()));

  it.each([
    ['silty clay', 'clay', 'warning'],
    ['dense sand with gravel', 'gravel', 'accent'],
    ['sandy clay', 'sand', 'warning'], // THE TRAP: key sand, tone warning (independent precedence)
    ['weathered shale', 'weathered-rock', 'neutral'],
    ['peat', 'organic', 'good'],
    ['moderately strong mudstone', 'bedrock', 'good'],
    ['brick debris', 'fill', 'good'],
  ])('classifies "%s" -> key %s / tone %s', (needle, key, tone) => {
    const found = byText(needle);
    expect(found?.materialKey).toBe(key);
    expect(found?.tone).toBe(tone);
  });

  // D2 (approved): mudstone now recognized as weathered rock; tone stays good (verbatim matcher).
  it('[D2] classifies standalone "Mudstone" -> key weathered-rock / tone good', () => {
    const found = layers.find((l) => l.description.toLowerCase() === 'mudstone');
    expect(found?.materialKey).toBe('weathered-rock');
    expect(found?.tone).toBe('good');
  });
});

describe('integrated-review integratedClass (className per stratum)', () => {
  const model = buildIntegratedReviewModel(buildIngestDossier(makeBoreholeResult()));
  const strata = model.boreholes[0]?.strata ?? [];
  const classFor = (needle: string) =>
    strata.find((s) => s.description.toLowerCase().includes(needle.toLowerCase()))?.className;

  it('maps stable descriptions to their classes', () => {
    expect(classFor('silty clay')).toBe('clay');
    expect(classFor('dense sand with gravel')).toBe('gravel');
    expect(classFor('weathered shale')).toBe('rock');
    expect(classFor('brick debris')).toBe('fill');
  });

  // F2 (approved): organic was lost to 'mixed'; now preserved as 'organic'.
  it('[F2] preserves organic class for peat', () => {
    expect(classFor('peat')).toBe('organic');
  });

  // D1 (approved): wider rock recognition routes mudstone strata to 'rock' instead of 'mixed'.
  it('[D1] routes mudstone strata to rock', () => {
    expect(classFor('moderately strong mudstone')).toBe('rock');
    expect(strata.find((s) => s.description.toLowerCase() === 'mudstone')?.className).toBe('rock');
  });
});

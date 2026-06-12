import { describe, expect, it } from 'vitest';

import { ingestBoreholeLogDocument } from '../src/ingest/index.js';
import type { BoreholeInterpretation } from '../src/vision/index.js';
import type { BoreholeLocation } from '../src/ingest/geotech-schemas.js';
import type { LLMConfig } from '../src/llm/types.js';

const config: LLMConfig = { provider: 'hosted-beta', apiKey: 'test-key', timeout: 120000 };

function wgs84Location(boreholeId: string, latitude: number, longitude: number): BoreholeLocation {
  return {
    boreholeId,
    crs: { kind: 'geographic', code: 'EPSG:4326', epsg: 4326, source: 'explicit', confidence: 0.98 },
    wgs84: { latitude, longitude },
  };
}

function pageResult(
  boreholeId: string,
  pageNumber: number,
  totalPages: number,
  location: BoreholeLocation | null,
): BoreholeInterpretation {
  return {
    boreholeId,
    totalDepth: 12,
    waterTableDepth: null,
    layers: [
      { depthFrom: 0, depthTo: 5, description: 'Sand', uscsSymbol: 'SP', sptN: null, waterContent: null, notes: null },
      { depthFrom: 5, depthTo: 12, description: 'Clay', uscsSymbol: 'CL', sptN: null, waterContent: null, notes: null },
    ],
    summary: `${boreholeId} synthetic page for coordinate wiring test.`,
    location,
    groundElevation: null,
    dateDrilled: null,
    drillingMethod: null,
    projectName: null,
    continuationDepth: 12,
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
    source: { inputKind: 'pdf', fileName: 'coordinate-test.pdf' },
    pages,
    recoverTextHint: async () => ({ source: 'native-text', warnings: [] }),
    interpretPageWithContext: async (_base64, _mime, _cfg, context) => {
      const match = pageResults.find((result) => result.pageNumber === context.pageNumber);
      return match ?? pageResults[0]!;
    },
  });
}

describe('ingest coordinate validation wiring', () => {
  it('flags a spatial outlier borehole as a review finding', async () => {
    const result = await runIngest([
      pageResult('BH1', 1, 4, wgs84Location('BH1', 41.0, 29.0)),
      pageResult('BH2', 2, 4, wgs84Location('BH2', 41.005, 29.002)),
      pageResult('BH3', 3, 4, wgs84Location('BH3', 41.01, 29.004)),
      // ~55 km north of the cluster: the classic OCR digit-error signature.
      pageResult('BH4', 4, 4, wgs84Location('BH4', 41.5, 29.0)),
    ]);

    expect(result.boreholes).toHaveLength(4);

    const outlier = result.reviewFindings.find((finding) => finding.code === 'coordinate_outlier');
    expect(outlier).toBeDefined();
    expect(outlier?.severity).toBe('review');
    expect(outlier?.scope).toBe('borehole');
    expect(outlier?.boreholeId).toBe('BH4');
    expect(result.reviewRequired).toBe(true);
  });

  it('does not raise coordinate findings for a clean cluster', async () => {
    const result = await runIngest([
      pageResult('BH1', 1, 3, wgs84Location('BH1', 41.0, 29.0)),
      pageResult('BH2', 2, 3, wgs84Location('BH2', 41.005, 29.002)),
      pageResult('BH3', 3, 3, wgs84Location('BH3', 41.01, 29.004)),
    ]);

    const coordinateCodes = result.reviewFindings
      .map((finding) => finding.code)
      .filter((code) =>
        ['coordinate_outlier', 'mixed_coordinate_systems', 'suspected_axis_swap', 'projected_out_of_crs_range'].includes(code),
      );
    expect(coordinateCodes).toEqual([]);
  });

  it('flags a suspected axis swap on a single borehole', async () => {
    const swapped: BoreholeLocation = {
      boreholeId: 'BH1',
      crs: { kind: 'projected', code: 'EPSG:27700', epsg: 27700, source: 'explicit', confidence: 0.98 },
      // Valid BNG values transposed: easting exceeds the 700 km band but fits as a northing.
      projected: { easting: 800000, northing: 400000 },
    };

    const result = await runIngest([pageResult('BH1', 1, 1, swapped)]);

    const swap = result.reviewFindings.find((finding) => finding.code === 'suspected_axis_swap');
    expect(swap).toBeDefined();
    expect(swap?.severity).toBe('review');
    expect(swap?.boreholeId).toBe('BH1');
  });
});

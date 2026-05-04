import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildGeotechDocumentBenchmark,
  compareGeotechDocumentBenchmarks,
  type GeotechDocumentIngestResult,
} from '../src/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));

function makeResult(
  overrides: Partial<GeotechDocumentIngestResult> = {},
): GeotechDocumentIngestResult {
  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: '2026-05-04T00:00:00.000Z',
    source: {
      filePath: 'C:/reports/site.pdf',
      fileName: 'site.pdf',
      inputKind: 'pdf',
      totalPages: 3,
      successfulPages: 3,
      failedPages: 0,
    },
    inspection: null,
    inspectionSummary: {
      pageClassificationCounts: { 'digital-text': 1, 'image-only': 2 },
      imageHeavyPageCount: 2,
      nativeTextPageCount: 1,
      degradedPageCount: 1,
      ocrRecoveredPageCount: 2,
    },
    documentClass: 'site-investigation-report',
    title: 'Ground investigation report',
    summary: 'BH1 and BH2 terminated at maximum depth of 10.00 m.',
    materials: [
      { kind: 'soil', description: 'hard clayey silt with sand mixture', uscsSymbol: 'CL', lithology: null },
      { kind: 'rock', description: 'weathered fractured rock from about 8 m', uscsSymbol: null, lithology: 'gneiss' },
    ],
    classifications: [{ system: 'USCS', value: 'CL', context: 'page 2' }],
    parameters: [
      { name: 'Borehole depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH1', context: 'page 2 BH1' },
      { name: 'SPT N-value', valueText: '-', numericValue: null, unit: 'blows/300mm', material: 'sand', context: null },
      { name: 'Groundwater level', valueText: 'not reported', numericValue: null, unit: 'm bgl', material: null, context: null },
    ],
    risks: ['Weathered fractured rock may affect foundation selection.'],
    recommendations: ['Verify groundwater and SPT data before design.'],
    synthesis: {
      takeaways: ['BH1 and BH2 encountered clayey silt over weathered rock.'],
      groundModel: ['Conceptual profile: clayey silt over silty sand and weathered fractured rock.'],
      keyParameters: ['Maximum depth 10.00 m from page 2.'],
      interpretation: ['Ground model is suitable for review only.'],
      limitations: ['Groundwater and SPT values were not corroborated.'],
      sourcePages: [2, 3],
      latencyMs: 250,
    },
    contentChunks: [{
      chunkId: 'chunk-1',
      pageRange: [2, 3],
      headingAncestry: ['Borehole logs'],
      scope: 'section',
      sectionType: 'ground-model',
      significance: 0.9,
      text: 'B.H. No. 1 termination 10.00 m. B.H. No. 2 termination 10.00 m.',
      sourcePages: [2, 3],
    }],
    pageAudits: [
      {
        pageNumber: 1,
        classification: 'digital-text',
        textHintSource: 'native-text',
        parseStatus: 'parsed',
        confidence: 92,
        materialCount: 0,
        classificationCount: 0,
        parameterCount: 0,
        evidenceCache: {
          status: 'hit',
          entryId: 'entry-1',
          cacheKey: 'cache-1',
          fileHash: 'file-hash',
          pageHash: 'page-hash-1',
          pageNumber: 1,
          modelVersion: 'llm-glm',
          preprocessingVersion: 'preprocess-v1',
          schemaVersion: 1,
          createdAt: '2026-05-04T00:00:00.000Z',
        },
        warnings: [],
      },
      {
        pageNumber: 2,
        classification: 'image-only',
        textHintSource: 'glm-ocr',
        parseStatus: 'parsed',
        confidence: 88,
        materialCount: 2,
        classificationCount: 1,
        parameterCount: 2,
        evidenceCache: {
          status: 'stored',
          entryId: 'entry-2',
          cacheKey: 'cache-2',
          fileHash: 'file-hash',
          pageHash: 'page-hash-2',
          pageNumber: 2,
          modelVersion: 'llm-glm',
          preprocessingVersion: 'preprocess-v1',
          schemaVersion: 1,
          createdAt: '2026-05-04T00:00:00.000Z',
        },
        warnings: [],
      },
      {
        pageNumber: 3,
        classification: 'image-only',
        textHintSource: 'vision-visual',
        parseStatus: 'partial',
        confidence: 64,
        materialCount: 0,
        classificationCount: 0,
        parameterCount: 1,
        evidenceCache: {
          status: 'miss',
          entryId: 'entry-3',
          cacheKey: 'cache-3',
          fileHash: 'file-hash',
          pageHash: 'page-hash-3',
          pageNumber: 3,
          modelVersion: 'llm-glm',
          preprocessingVersion: 'preprocess-v1',
          schemaVersion: 1,
        },
        warnings: ['Depth column partially obscured.'],
      },
    ],
    pageFailures: [],
    warnings: ['Manual review required for missing groundwater.'],
    reviewFindings: [],
    reviewReasons: ['Missing SPT and groundwater data.'],
    parseStatus: 'partial',
    confidence: 82,
    reviewRequired: true,
    canAutoProceed: false,
    ...overrides,
  };
}

describe('geotech document benchmark', () => {
  it('summarizes cache reuse, hosted call estimates, traceability, and ground-model readiness', () => {
    const benchmark = buildGeotechDocumentBenchmark(makeResult(), {
      label: 'site.pdf first run',
      job: {
        jobId: 'ingest-job-1',
        startedAt: '2026-05-04T00:00:00.000Z',
        completedAt: '2026-05-04T00:00:05.000Z',
        durationMs: 5000,
      },
      generatedAt: '2026-05-04T00:00:06.000Z',
    });

    expect(benchmark.kind).toBe('geotech-document-benchmark');
    expect(benchmark.evidenceCache).toMatchObject({
      hit: 1,
      stored: 1,
      miss: 1,
      hitRate: 0.333,
      preprocessingVersions: ['preprocess-v1'],
    });
    expect(benchmark.hostedCallEstimate).toMatchObject({
      pageExtraction: 2,
      layoutOcr: 1,
      vision: 1,
      nativeOrPdfText: 0,
    });
    expect(benchmark.traceability).toMatchObject({
      parametersWithSourcePage: 1,
      parametersWithoutSourcePage: 2,
      directParameterTraceabilityRate: 0.333,
      auditBackedParameterTraceabilityRate: 1,
      traceabilityRate: 1,
      sourcePages: [2, 3],
      auditParameterSourcePages: [2, 3],
    });
    expect(benchmark.groundModelReadiness.boreholeIds).toEqual(['BH1', 'BH2']);
    expect(benchmark.groundModelReadiness.maxDepthMeters).toBe(10);
    expect(benchmark.groundModelReadiness.missingCriticalData).toEqual([
      'groundwater level',
      'SPT N-values',
      'RQD',
      'cohesion',
      'friction angle',
    ]);
    expect(benchmark.groundModelReadiness.gates).toContain('partial-pages-remain');
  });

  it('compares cached reruns against a baseline benchmark', () => {
    const baseline = buildGeotechDocumentBenchmark(makeResult(), {
      label: 'first run',
      generatedAt: '2026-05-04T00:00:00.000Z',
    });
    const rerun = buildGeotechDocumentBenchmark(makeResult({
      pageAudits: makeResult().pageAudits.map((audit) => ({
        ...audit,
        evidenceCache: audit.evidenceCache ? { ...audit.evidenceCache, status: 'hit' } : undefined,
      })),
    }), {
      label: 'cached rerun',
      generatedAt: '2026-05-04T00:05:00.000Z',
    });

    const comparison = compareGeotechDocumentBenchmarks(rerun, baseline, {
      generatedAt: '2026-05-04T00:05:01.000Z',
    });

    expect(comparison.delta.cacheHitRate).toBeGreaterThan(0.6);
    expect(comparison.delta.estimatedHostedCalls).toBeLessThan(0);
    expect(comparison.passed).toBe(true);
    expect(comparison.regressions).toEqual([]);
  });

  it('uses attributed parameter source pages for direct traceability metrics', () => {
    const benchmark = buildGeotechDocumentBenchmark(makeResult({
      parameters: [
        { name: 'Borehole depth', valueText: '10.00 m', numericValue: 10, unit: 'm', material: 'BH1', context: 'BH1 schedule', sourcePages: [4, 2, 2] },
        { name: 'cohesion', valueText: '24', numericValue: 24, unit: 'kPa', material: 'clay', context: 'triaxial test on page 5' },
        { name: 'RQD', valueText: '-', numericValue: null, unit: '%', material: 'weathered rock', context: null },
      ],
    }), {
      generatedAt: '2026-05-04T00:10:00.000Z',
    });

    expect(benchmark.traceability.parametersWithSourcePage).toBe(2);
    expect(benchmark.traceability.parametersWithoutSourcePage).toBe(1);
    expect(benchmark.traceability.directParameterTraceabilityRate).toBe(0.667);
    expect(benchmark.traceability.sourcePages).toEqual([2, 3, 4, 5]);
  });

  it('keeps the real PDF cached-rerun benchmark fixture inside acceptance bounds', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(testDir, 'fixtures', 'geotechnical-investigation-benchmark.v1.json'),
        'utf-8',
      ),
    );
    const hostedCalls =
      fixture.hostedCallEstimate.pageExtraction
      + fixture.hostedCallEstimate.layoutOcr
      + fixture.hostedCallEstimate.vision;

    expect(fixture.kind).toBe('geotech-document-benchmark');
    expect(fixture.source).toMatchObject({
      fileName: 'GeotechnicalInvestigationReport (1).pdf',
      totalPages: 34,
      successfulPages: 34,
      failedPages: 0,
    });
    expect(fixture.evidenceCache.hitRate).toBe(1);
    expect(hostedCalls).toBe(0);
    expect(fixture.traceability.directParameterTraceabilityRate).toBeGreaterThanOrEqual(0.95);
    expect(fixture.traceability.parametersWithoutSourcePage).toBe(0);
    expect(fixture.groundModelReadiness).toMatchObject({
      status: 'needs_engineering_review',
      score: 61,
      missingCriticalData: ['SPT N-values'],
    });
    expect(fixture.groundModelReadiness.gates).toEqual([
      'missing-spt-n-values',
      'partial-pages-remain',
      'low-confidence',
    ]);
  });
});

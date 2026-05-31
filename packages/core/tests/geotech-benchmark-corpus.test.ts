import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildGeotechBenchmarkCorpusReport,
  renderGeotechBenchmarkCorpusHtml,
  renderGeotechBenchmarkCorpusSvg,
  type GeotechBenchmarkCorpusFixture,
  type GeotechDocumentBenchmark,
} from '../src/index.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const benchmarkFixturePath = join(testDir, 'fixtures', 'geotechnical-investigation-benchmark.v1.json');
const corpusRegistryPath = join(testDir, 'fixtures', 'geotech-benchmark-corpus.fixtures.json');

describe('geotech benchmark corpus', () => {
  it('keeps the corpus fixture registry explicit and guardrail-ready', () => {
    const registry = readJson(corpusRegistryPath);

    expect(registry).toMatchObject({
      kind: 'geotech-benchmark-corpus-registry',
      schemaVersion: 1,
    });
    expect(registry.fixtures.length).toBeGreaterThanOrEqual(5);
    expect(registry.fixtures.map((fixture: any) => fixture.category)).toEqual(expect.arrayContaining([
      'full-geotechnical-report',
      'borehole-log',
      'cpt-table',
      'lab-table',
      'mixed-scanned-pdf',
      'malformed-scanned-pdf',
    ]));
    expect(registry.fixtures.map((fixture: any) => fixture.input?.env)).toEqual(expect.arrayContaining([
      'GEOTECHCLI_BENCHMARK_PDF',
      'GEOTECHCLI_BENCHMARK_BOREHOLE_PDF',
      'GEOTECHCLI_BENCHMARK_CPT_PDF',
      'GEOTECHCLI_BENCHMARK_LAB_PDF',
      'GEOTECHCLI_BENCHMARK_MIXED_SCANNED_PDF',
      'GEOTECHCLI_BENCHMARK_MALFORMED_SCANNED_PDF',
    ]));
    const regionV2Fixture = registry.fixtures.find((fixture: any) =>
      fixture.id === 'region-v2-scanned-borehole-table-v1',
    );
    expect(regionV2Fixture).toMatchObject({
      sourceType: 'public-sample',
      input: {
        path: 'geotech-corpus/region-v2-scanned-borehole-table.fixture.pdf',
      },
      expectations: {
        preprocessingModeExpectations: {
          'region-v2': {
            minPreprocessingRegions: expect.any(Number),
            minPersistedRegionAssets: expect.any(Number),
            minAverageRegionQualityScore: expect.any(Number),
            sameOrBetterTraceabilityThan: ['none', 'ocr-optimized'],
          },
        },
      },
    });
    expect(existsSync(join(testDir, 'fixtures', regionV2Fixture.input.path))).toBe(true);
    for (const fixture of registry.fixtures) {
      expect(fixture.expectations).toEqual(expect.objectContaining({
        minSuccessfulPageRate: expect.any(Number),
        minTraceabilityRate: expect.any(Number),
        maxEstimatedHostedCalls: expect.any(Number),
        requireFemExecutionBoundarySafe: true,
      }));
      if (fixture.baseline) {
        expect(existsSync(join(testDir, 'fixtures', fixture.baseline))).toBe(true);
      }
    }
  });

  it('aggregates provider profiles and preprocessing modes without changing the document benchmark contract', () => {
    const fixture = readJson(corpusRegistryPath).fixtures[0] as GeotechBenchmarkCorpusFixture;
    const inputs = [
      corpusInput(fixture, 'hosted-beta', 'none'),
      corpusInput(fixture, 'hosted-beta', 'ocr-optimized'),
      corpusInput(fixture, 'hosted-beta', 'region-v2'),
      corpusInput(fixture, 'open-byok-text-evidence', 'none'),
      corpusInput(fixture, 'open-byok-text-evidence', 'ocr-optimized'),
      corpusInput(fixture, 'open-byok-text-evidence', 'region-v2'),
    ];

    const report = buildGeotechBenchmarkCorpusReport(inputs, {
      generatedAt: '2026-05-31T00:00:00.000Z',
      label: 'test corpus',
    });

    expect(report.kind).toBe('geotech-benchmark-corpus-report');
    expect(report.summary).toMatchObject({
      fixtureCount: 1,
      runCount: 6,
      passedRuns: 6,
      failedRuns: 0,
      passed: true,
      providerProfiles: ['hosted-beta', 'open-byok-text-evidence'],
      preprocessingModes: ['none', 'ocr-optimized', 'region-v2'],
      totalEstimatedHostedCalls: 0,
    });
    expect(report.preprocessingComparisons).toHaveLength(4);
    expect(report.preprocessingComparisons[0]).toMatchObject({
      fixtureId: fixture.id,
      qualityDelta: 0.24,
      persistedRegionAssetsDelta: expect.any(Number),
    });
    expect(report.preprocessingComparisons.map((comparison) => comparison.currentMode)).toEqual(expect.arrayContaining([
      'ocr-optimized',
      'region-v2',
    ]));
    expect(report.runs[0]?.reviewGates).toEqual(expect.arrayContaining([
      'human-engineering-review-required',
    ]));
    expect(report.failures).toEqual([]);

    const svg = renderGeotechBenchmarkCorpusSvg(report);
    const html = renderGeotechBenchmarkCorpusHtml(report);
    expect(svg).toContain('GeotechCLI Benchmark Corpus');
    expect(svg).toContain('PASS');
    expect(html).toContain('Preprocessing Comparisons');
    expect(html).toContain('Region quality delta');
    expect(html).toContain('Review gates');
    expect(html).toContain('Pages');
  });

  it('fails region-v2 acceptance when borehole/table pages produce no preprocessing regions', () => {
    const fixture = readJson(corpusRegistryPath).fixtures.find((candidate: any) =>
      candidate.id === 'region-v2-scanned-borehole-table-v1',
    ) as GeotechBenchmarkCorpusFixture;
    const none = makeBenchmarkVariant('none', 'hosted-beta');
    const ocr = makeBenchmarkVariant('ocr-optimized', 'hosted-beta');
    const region = makeBenchmarkVariant('region-v2', 'hosted-beta');
    region.preprocessing!.preprocessingRegions = 0;
    region.preprocessing!.persistedRegionAssets = 0;
    region.preprocessing!.averageRegionQualityScore = 0.1;

    const report = buildGeotechBenchmarkCorpusReport([
      { fixture, benchmark: none, providerProfile: 'hosted-beta', preprocessingMode: 'none' },
      { fixture, benchmark: ocr, providerProfile: 'hosted-beta', preprocessingMode: 'ocr-optimized' },
      { fixture, benchmark: region, providerProfile: 'hosted-beta', preprocessingMode: 'region-v2' },
    ], {
      generatedAt: '2026-05-31T00:00:00.000Z',
    });

    expect(report.summary.passed).toBe(false);
    expect(report.failures.join(' ')).toMatch(/region-v2 preprocessing regions 0 below/i);
    expect(report.failures.join(' ')).toMatch(/region-v2 persisted region assets 0 below/i);
    expect(report.failures.join(' ')).toMatch(/region-v2 region quality/i);
  });

  it('fails region-v2 acceptance when traceability regresses against earlier preprocessing modes', () => {
    const fixture = readJson(corpusRegistryPath).fixtures.find((candidate: any) =>
      candidate.id === 'region-v2-scanned-borehole-table-v1',
    ) as GeotechBenchmarkCorpusFixture;
    const none = makeBenchmarkVariant('none', 'hosted-beta');
    const ocr = makeBenchmarkVariant('ocr-optimized', 'hosted-beta');
    const region = makeBenchmarkVariant('region-v2', 'hosted-beta');
    region.traceability.directParameterTraceabilityRate = 0.89;

    const report = buildGeotechBenchmarkCorpusReport([
      { fixture, benchmark: none, providerProfile: 'hosted-beta', preprocessingMode: 'none' },
      { fixture, benchmark: ocr, providerProfile: 'hosted-beta', preprocessingMode: 'ocr-optimized' },
      { fixture, benchmark: region, providerProfile: 'hosted-beta', preprocessingMode: 'region-v2' },
    ], {
      generatedAt: '2026-05-31T00:00:00.000Z',
    });

    expect(report.summary.passed).toBe(false);
    expect(report.failures.join(' ')).toMatch(/region-v2 traceability/i);
    expect(report.failures.join(' ')).toMatch(/regressed below ocr-optimized/i);
  });

  it('fails closed when FEM execution boundaries regress inside a corpus run', () => {
    const fixture = readJson(corpusRegistryPath).fixtures[0] as GeotechBenchmarkCorpusFixture;
    const unsafe = makeBenchmarkVariant('ocr-optimized', 'hosted-beta');
    const fem = unsafe.femDraftReadiness!;
    fem.canAutoProceed = true;
    fem.agentRunAllowedRoutes = ['foundation-settlement'];
    fem.agentWebglAllowedRoutes = ['foundation-settlement'];
    fem.agentResultManifestAllowedRoutes = ['foundation-settlement'];
    fem.caseOutputAvailableRoutes = ['foundation-settlement'];
    fem.humanRunCommandAvailableRoutes = ['foundation-settlement'];
    fem.staleRunCommandRoutes = ['foundation-settlement'];
    const route = fem.routes.find((candidate) => candidate.objective === 'foundation-settlement')!;
    (route as any).agentRunAllowed = true;
    (route as any).recommendedCommand = 'geotech fem run analysis_case.json --experimental';
    (route.executionBoundary as any).agentRunAllowed = true;
    (route.executionBoundary as any).agentWebglRenderAllowed = true;
    (route.executionBoundary as any).agentResultManifestAllowed = true;
    (route.executionBoundary as any).caseOutputAvailable = true;
    (route.executionBoundary as any).humanRunCommandAvailable = true;
    (route.executionBoundary as any).humanReviewRequired = false;

    const report = buildGeotechBenchmarkCorpusReport([{
      fixture,
      benchmark: unsafe,
      providerProfile: 'hosted-beta',
      preprocessingMode: 'ocr-optimized',
    }], {
      generatedAt: '2026-05-31T00:00:00.000Z',
    });

    expect(report.summary.passed).toBe(false);
    expect(report.failures.join(' ')).toMatch(/agent-run routes|agent solver execution/i);
    expect(report.failures.join(' ')).toMatch(/agent WebGL|WebGL rendering/i);
    expect(report.failures.join(' ')).toMatch(/result-manifest/i);
    expect(report.failures.join(' ')).toMatch(/unreviewed case/i);
    expect(report.failures.join(' ')).toMatch(/human-run|human run/i);
  });
});

function corpusInput(
  fixture: GeotechBenchmarkCorpusFixture,
  providerProfile: string,
  preprocessingMode: 'none' | 'ocr-optimized' | 'region-v2',
) {
  return {
    fixture,
    benchmark: makeBenchmarkVariant(preprocessingMode, providerProfile),
    providerProfile,
    preprocessingMode,
  };
}

function makeBenchmarkVariant(
  preprocessingMode: 'none' | 'ocr-optimized' | 'region-v2',
  providerProfile: string,
): GeotechDocumentBenchmark {
  const benchmark = readJson(benchmarkFixturePath) as GeotechDocumentBenchmark;
  const totalPages = benchmark.source.totalPages;
  benchmark.provider = {
    provider: providerProfile === 'hosted-beta' ? 'hosted-beta' : 'openai-compatible',
    profile: providerProfile as any,
    modelId: providerProfile === 'hosted-beta' ? 'glm-5.1' : 'byok-text-evidence-model',
    visionModelId: providerProfile === 'hosted-beta' ? 'glm-5v-turbo' : null,
    capabilities: {
      text: true,
      visionImages: providerProfile === 'hosted-beta',
      nativePdfDocuments: false,
      jsonMode: providerProfile === 'hosted-beta',
    } as any,
    likelyFreeRoute: providerProfile !== 'hosted-beta',
    contextStrategy: providerProfile === 'hosted-beta' ? 'full' : 'micro',
    reviewGates: ['human-engineering-review-required'],
    preprocessingPolicy: {
      preferNativePdf: false,
      requirePreprocessedEvidence: true,
      allowImageInputs: providerProfile === 'hosted-beta',
      allowLayoutOcr: providerProfile === 'hosted-beta',
      maxContextStrategy: providerProfile === 'hosted-beta' ? 'full' : 'micro',
    } as any,
  };
  benchmark.preprocessing = preprocessingMode === 'region-v2'
    ? {
        versions: ['page-evidence-preprocess-v4:region-v2'],
        modes: ['region-v2'],
        pagesWithPreprocessing: totalPages,
        pagesWithoutPreprocessing: 0,
        pagesWithRegions: 9,
        totalRegions: 24,
        preprocessingRegions: 17,
        layoutRegions: 7,
        pageRegionCoverage: 0.265,
        pagesWithPreprocessingMetadata: totalPages,
        operationCounts: {
          'detect-table-log-panels': 7,
          'detect-region-v2-table-panel': 5,
          'detect-region-v2-borehole-log-strip': 4,
          'projection-profile-fine-deskew': 4,
          'normalize-region-assets': 17,
        },
        regionLabelCounts: {
          'detected table/log panel candidate': 7,
          'region-v2 table panel crop': 5,
          'region-v2 borehole/log strip crop': 4,
        },
        persistedRegionAssets: 17,
        persistedRegionAssetBytes: 340000,
        pagesDeskewed: 4,
        averageDeskewAngleDeg: 0.82,
        averageQualityScore: 0.88,
        averageRegionQualityScore: 0.84,
        lowQualityRegions: 0,
        qualityWarningCounts: {},
        sourceCategories: {
          'native-text': 27,
          'layout-ocr': 17,
          vision: 0,
          none: 0,
        },
      }
    : preprocessingMode === 'ocr-optimized'
    ? {
        versions: ['page-evidence-preprocess-v4:ocr-optimized'],
        modes: ['ocr-optimized'],
        pagesWithPreprocessing: totalPages,
        pagesWithoutPreprocessing: 0,
        pagesWithRegions: 7,
        totalRegions: 14,
        preprocessingRegions: 7,
        layoutRegions: 7,
        pageRegionCoverage: 0.206,
        pagesWithPreprocessingMetadata: totalPages,
        operationCounts: { 'detect-table-log-panels': 7 },
        regionLabelCounts: { 'detected table/log panel candidate': 7 },
        persistedRegionAssets: 7,
        persistedRegionAssetBytes: 126000,
        pagesDeskewed: 3,
        averageDeskewAngleDeg: 0.7,
        averageQualityScore: 0.82,
        averageRegionQualityScore: 0.76,
        lowQualityRegions: 0,
        qualityWarningCounts: {},
        sourceCategories: {
          'native-text': 27,
          'layout-ocr': 7,
          vision: 0,
          none: 0,
        },
      }
    : {
        versions: ['page-evidence-preprocess-v4:none'],
        modes: ['none'],
        pagesWithPreprocessing: totalPages,
        pagesWithoutPreprocessing: 0,
        pagesWithRegions: 0,
        totalRegions: 0,
        preprocessingRegions: 0,
        layoutRegions: 0,
        pageRegionCoverage: 0,
        pagesWithPreprocessingMetadata: totalPages,
        operationCounts: {},
        regionLabelCounts: {},
        persistedRegionAssets: 0,
        persistedRegionAssetBytes: 0,
        pagesDeskewed: 0,
        averageDeskewAngleDeg: 0,
        averageQualityScore: 0.58,
        averageRegionQualityScore: 0.35,
        lowQualityRegions: 1,
        qualityWarningCounts: {
          'no-log-or-table-crops-detected': 1,
        },
        sourceCategories: {
          'native-text': 27,
          'layout-ocr': 0,
          vision: 7,
          none: 0,
        },
      };
  return benchmark;
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

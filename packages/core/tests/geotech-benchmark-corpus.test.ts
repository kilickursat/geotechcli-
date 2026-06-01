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
    const providerProfiles = [
      'hosted-beta',
      'openai-compatible-byok',
      'openrouter-free',
      'local-hf-compatible',
    ];
    const preprocessingModes = ['none', 'ocr-optimized', 'region-v2'] as const;
    const inputs = providerProfiles.flatMap((providerProfile) =>
      preprocessingModes.map((preprocessingMode) => corpusInput(fixture, providerProfile, preprocessingMode)),
    );

    const report = buildGeotechBenchmarkCorpusReport(inputs, {
      generatedAt: '2026-05-31T00:00:00.000Z',
      label: 'test corpus',
    });

    expect(report.kind).toBe('geotech-benchmark-corpus-report');
    expect(report.summary).toMatchObject({
      fixtureCount: 1,
      runCount: 12,
      passedRuns: 12,
      failedRuns: 0,
      passed: true,
      providerProfiles: ['hosted-beta', 'local-hf-compatible', 'openai-compatible-byok', 'openrouter-free'],
      preprocessingModes: ['none', 'ocr-optimized', 'region-v2'],
      averageConfidenceBreakdown: {
        overall: 55,
        extractionConfidence: 66,
        traceabilityScore: 100,
        corroborationScore: 30,
      },
      totalEstimatedHostedCalls: 0,
    });
    expect(report.preprocessingComparisons).toHaveLength(8);
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
    const freeRoute = report.runs.find((run) =>
      run.providerProfile === 'openrouter-free' && run.preprocessingMode === 'region-v2',
    );
    expect(freeRoute?.providerBenchmarkProfile).toMatchObject({
      evidenceInput: 'preprocessed-page-evidence',
      imageInputsAllowed: false,
      nativePdfAllowed: false,
      requiresPreprocessedEvidence: true,
      likelyFreeRoute: true,
    });
    expect(freeRoute?.reviewGates).toEqual(expect.arrayContaining([
      'free-route-capacity-and-feature-variance',
      'text-only-provider-uses-ocr-page-evidence',
    ]));
    expect(report.failures).toEqual([]);

    const svg = renderGeotechBenchmarkCorpusSvg(report);
    const html = renderGeotechBenchmarkCorpusHtml(report);
    expect(svg).toContain('GeotechCLI Benchmark Corpus');
    expect(svg).toContain('PASS');
    expect(html).toContain('Preprocessing Comparisons');
    expect(html).toContain('Evidence input');
    expect(html).toContain('preprocessed-page-evidence');
    expect(html).toContain('Trust E/T/C');
    expect(html).toContain('Region quality delta');
    expect(html).toContain('Review gates');
    expect(html).toContain('Pages');
  });

  it('fails closed when BYOK/free provider profiles bypass preprocessed page evidence', () => {
    const fixture = readJson(corpusRegistryPath).fixtures[0] as GeotechBenchmarkCorpusFixture;
    const unsafe = makeBenchmarkVariant('region-v2', 'openrouter-free');
    unsafe.provider!.preprocessingPolicy.requirePreprocessedEvidence = false;
    unsafe.provider!.preprocessingPolicy.allowImageInputs = true;
    unsafe.provider!.capabilities.visionImages = true;
    unsafe.provider!.reviewGates = ['human-engineering-review-required'];

    const report = buildGeotechBenchmarkCorpusReport([{
      fixture,
      benchmark: unsafe,
      providerProfile: 'openrouter-free',
      preprocessingMode: 'region-v2',
    }], {
      generatedAt: '2026-05-31T00:00:00.000Z',
    });

    expect(report.summary.passed).toBe(false);
    expect(report.failures.join(' ')).toMatch(/must require preprocessed page evidence/i);
    expect(report.failures.join(' ')).toMatch(/must not accept direct image tasks/i);
    expect(report.failures.join(' ')).toMatch(/missing capacity\/feature review gate/i);
    expect(report.failures.join(' ')).toMatch(/missing text-evidence review gate/i);
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
  benchmark.provider = testProviderBlock(providerProfile);
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

function testProviderBlock(providerProfile: string): NonNullable<GeotechDocumentBenchmark['provider']> {
  if (providerProfile === 'hosted-beta') {
    return {
      provider: 'hosted-beta',
      profile: 'hosted-default',
      modelId: 'glm-5.1',
      visionModelId: 'glm-5v-turbo',
      capabilities: {
        text: true,
        visionImages: true,
        nativePdfDocuments: false,
        jsonMode: true,
      },
      likelyFreeRoute: false,
      contextStrategy: 'full',
      reviewGates: ['human-engineering-review-required'],
      preprocessingPolicy: {
        preferNativePdf: false,
        requirePreprocessedEvidence: true,
        allowImageInputs: true,
        allowLayoutOcr: true,
        maxContextStrategy: 'full',
      },
    };
  }
  if (providerProfile === 'openai-compatible-byok') {
    return textEvidenceProviderBlock({
      provider: 'openai-compatible',
      modelId: 'openai-compatible/byok-text-evidence-model',
      likelyFreeRoute: false,
      contextStrategy: 'compact',
      jsonMode: true,
      reviewGates: [
        'openai-compatible-byok-uses-preprocessed-page-evidence',
        'native-pdf-unavailable-use-preprocessed-evidence',
        'human-engineering-review-required',
      ],
    });
  }
  if (providerProfile === 'openrouter-free') {
    return textEvidenceProviderBlock({
      provider: 'openai-compatible',
      modelId: 'google/gemma-4-26b-a4b-it:free',
      likelyFreeRoute: true,
      contextStrategy: 'micro',
      jsonMode: false,
      reviewGates: [
        'text-only-provider-uses-ocr-page-evidence',
        'free-route-capacity-and-feature-variance',
        'compact-context-required',
        'human-engineering-review-required',
      ],
    });
  }
  if (providerProfile === 'local-hf-compatible') {
    return textEvidenceProviderBlock({
      provider: 'huggingface',
      modelId: 'local-or-hf-compatible/text-evidence-model',
      likelyFreeRoute: false,
      contextStrategy: 'compact',
      jsonMode: false,
      reviewGates: [
        'local-hf-compatible-uses-preprocessed-page-evidence',
        'native-pdf-unavailable-use-preprocessed-evidence',
        'compact-context-required',
        'human-engineering-review-required',
      ],
    });
  }
  return textEvidenceProviderBlock({
    provider: 'openai-compatible',
    modelId: 'byok-text-evidence-model',
    likelyFreeRoute: true,
    contextStrategy: 'micro',
    jsonMode: false,
    reviewGates: [
      'text-only-provider-uses-ocr-page-evidence',
      'free-route-capacity-and-feature-variance',
      'human-engineering-review-required',
    ],
  });
}

function textEvidenceProviderBlock(
  options: {
    provider: 'openai-compatible' | 'huggingface';
    modelId: string;
    likelyFreeRoute: boolean;
    contextStrategy: 'compact' | 'micro';
    jsonMode: boolean;
    reviewGates: string[];
  },
): NonNullable<GeotechDocumentBenchmark['provider']> {
  return {
    provider: options.provider,
    profile: 'open-byok',
    modelId: options.modelId,
    visionModelId: null,
    capabilities: {
      text: true,
      visionImages: false,
      nativePdfDocuments: false,
      jsonMode: options.jsonMode,
    },
    likelyFreeRoute: options.likelyFreeRoute,
    contextStrategy: options.contextStrategy,
    reviewGates: options.reviewGates,
    preprocessingPolicy: {
      preferNativePdf: false,
      requirePreprocessedEvidence: true,
      allowImageInputs: false,
      allowLayoutOcr: false,
      maxContextStrategy: options.contextStrategy,
    },
  };
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

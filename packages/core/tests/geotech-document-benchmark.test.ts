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
        latencyMs: 5,
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
        latencyMs: 80,
        layoutPages: [{
          pageNumber: 2,
          width: 1000,
          height: 1400,
          elements: [
            { index: 1, label: 'table', bbox2d: [0.1, 0.2, 0.8, 0.4], content: 'BH1 table', height: null, width: null },
            { index: 2, label: 'text', bbox2d: [0.1, 0.5, 0.8, 0.7], content: 'weathered rock', height: null, width: null },
          ],
          text: 'BH1 table weathered rock',
          tables: ['BH1 table'],
          formulas: [],
          images: [],
        }],
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
          preprocessing: {
            schemaVersion: 1,
            pipelineVersion: 'vision-image-preprocess-v2',
            policy: 'ocr-optimized',
            transformed: true,
            input: {
              mimeType: 'image/jpeg',
              byteLength: 4096,
              width: 2400,
              height: 3200,
            },
            output: {
              mimeType: 'image/png',
              byteLength: 2048,
              width: 1350,
              height: 1800,
            },
            operations: [
              'auto-orient',
              'deskew-angle-1.25deg',
              'trim-white-margins-threshold-10',
              'resize-inside-1800-no-enlarge',
              'score-preprocessing-regions',
            ],
            quality: {
              score: 0.82,
              contentCoverageRatio: 0.72,
              darkPixelRatio: 0.08,
              regionCoverageRatio: 0.14,
              regionCount: 1,
              cropAssetCount: 1,
              deskew: {
                method: 'projection-profile',
                angleDeg: 1.25,
                confidence: 0.7,
                applied: true,
              },
              warnings: [],
            },
            regions: [{
              id: 'normalized-full-page',
              source: 'preprocessing',
              label: 'normalized full page',
              bbox2d: [0, 0, 1, 1],
              coverageRatio: 1,
              quality: {
                score: 0.78,
                darkPixelRatio: 0.08,
                lineDensity: 0.02,
                coverageRatio: 1,
                warnings: ['region-covers-full-page'],
              },
            }, {
              id: 'table-log-panel-candidate',
              source: 'preprocessing',
              label: 'detected table/log panel candidate',
              bbox2d: [0.1, 0.2, 0.8, 0.4],
              coverageRatio: 0.14,
              quality: {
                score: 0.91,
                darkPixelRatio: 0.18,
                lineDensity: 0.03,
                coverageRatio: 0.14,
                warnings: [],
              },
              asset: {
                mimeType: 'image/png',
                byteLength: 1234,
                sha256: 'b'.repeat(64),
                width: 700,
                height: 240,
                normalized: true,
                cacheRelativePath: 'assets/cache-2/table-log-panel-candidate-bbbbbbbbbbbbbbbb.png',
              },
            }],
            warnings: [],
          },
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
        latencyMs: 120,
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
    confidenceBreakdown: {
      schemaVersion: 1,
      overall: 82,
      extractionConfidence: 83,
      engineeringCompleteness: 48,
      traceabilityScore: 33,
      corroborationScore: 73,
      readinessScore: 54,
      pageEvidenceConfidence: 81,
      methodCoverage: {
        nativeTextPages: 1,
        layoutOcrPages: 1,
        visualReasoningPages: 1,
        directVisualPages: 1,
      },
      missingCriticalData: ['RQD', 'cohesion', 'friction angle'],
      reviewGates: ['partial-pages-remain', 'parameter-source-page-gaps'],
      notes: ['Confidence is provider-neutral workflow trust, not a model self-score.'],
    },
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
      providerConfig: {
        provider: 'openai-compatible',
        modelId: 'poolside/laguna-m.1:free',
        visionModelId: '',
      },
      fixture: {
        id: 'site-smoke',
        category: 'full-geotechnical-report',
      },
    });

    expect(benchmark.kind).toBe('geotech-document-benchmark');
    expect(benchmark.document.confidenceBreakdown).toEqual(expect.objectContaining({
      schemaVersion: 1,
      overall: 82,
      readinessScore: expect.any(Number),
    }));
    expect(benchmark.evidenceCache).toMatchObject({
      hit: 1,
      stored: 1,
      miss: 1,
      hitRate: 0.333,
      preprocessingVersions: ['preprocess-v1'],
    });
    expect(benchmark.provider).toMatchObject({
      provider: 'openai-compatible',
      profile: 'open-byok',
      likelyFreeRoute: true,
      contextStrategy: 'micro',
      preprocessingPolicy: {
        requirePreprocessedEvidence: true,
        allowImageInputs: false,
      },
    });
    expect(benchmark.fixture).toMatchObject({
      id: 'site-smoke',
      category: 'full-geotechnical-report',
    });
    expect(benchmark.preprocessing).toMatchObject({
      versions: ['preprocess-v1'],
      modes: ['ocr-optimized'],
      pagesWithPreprocessing: 3,
      pagesWithRegions: 1,
      totalRegions: 4,
      preprocessingRegions: 2,
      layoutRegions: 2,
      pageRegionCoverage: 0.333,
      pagesWithPreprocessingMetadata: 1,
      operationCounts: {
        'auto-orient': 1,
        'deskew-angle-1.25deg': 1,
        'resize-inside-1800-no-enlarge': 1,
        'score-preprocessing-regions': 1,
        'trim-white-margins-threshold-10': 1,
      },
      regionLabelCounts: {
        'detected table/log panel candidate': 1,
        'normalized full page': 1,
      },
      persistedRegionAssets: 1,
      persistedRegionAssetBytes: 1234,
      pagesDeskewed: 1,
      averageDeskewAngleDeg: 1.25,
      averageQualityScore: 0.82,
      averageRegionQualityScore: 0.845,
      lowQualityRegions: 0,
      qualityWarningCounts: {
        'region-covers-full-page': 1,
      },
    });
    expect(benchmark.latency).toMatchObject({
      pageLatencyMs: {
        count: 3,
        total: 205,
        average: 68,
        max: 120,
      },
      totalKnownLatencyMs: 455,
      jobDurationMs: 5000,
      synthesisLatencyMs: 250,
    });
    expect(benchmark.pages[1]).toMatchObject({
      pageNumber: 2,
      preprocessingVersion: 'preprocess-v1',
      preprocessingPipelineVersion: 'vision-image-preprocess-v2',
      preprocessingPolicy: 'ocr-optimized',
      preprocessingQualityScore: 0.82,
      preprocessingDeskewAngleDeg: 1.25,
      preprocessingDeskewApplied: true,
      preprocessingQualityWarnings: ['region-covers-full-page'],
      preprocessingRegionLabels: ['normalized full page', 'detected table/log panel candidate'],
      preprocessingRegionQualityScores: [0.78, 0.91],
      preprocessingOperationCount: 5,
      preprocessingRegionCount: 2,
      preprocessingAssetCount: 1,
      preprocessingAssetBytes: 1234,
      preprocessingLowQualityRegionCount: 0,
      layoutRegionCount: 2,
      latencyMs: 80,
      regionCount: 4,
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
      traceabilityRate: 0.333,
      sourcePages: [2, 3],
      auditParameterSourcePages: [2, 3],
    });
    expect(benchmark.groundModelReadiness.gates).toContain('parameter-source-page-gaps');
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
    expect(benchmark.femDraftReadiness).toMatchObject({
      schemaVersion: 1,
      providerNeutral: true,
      canAutoProceed: false,
      candidateRoutes: 9,
      implementedPreviewRoutes: [
        'foundation-settlement',
        'excavation-deformation',
        'tunnel-volume-loss-settlement',
        'staged-settlement-consolidation',
      ],
      contractOnlyRoutes: [
        'shaft-deformation',
        'pile-group-elastic-interaction',
        'slope-embankment-deformation',
        'retaining-wall-excavation-support',
        'seepage-groundwater-coupling',
      ],
      agentRunAllowedRoutes: [],
      agentWebglAllowedRoutes: [],
      agentResultManifestAllowedRoutes: [],
      caseOutputAvailableRoutes: [],
      humanRunCommandAvailableRoutes: [],
      draftCommandRoutes: [
        'foundation-settlement',
        'excavation-deformation',
        'shaft-deformation',
        'tunnel-volume-loss-settlement',
        'pile-group-elastic-interaction',
        'slope-embankment-deformation',
        'retaining-wall-excavation-support',
        'seepage-groundwater-coupling',
        'staged-settlement-consolidation',
      ],
      runCommandRoutes: [
        'foundation-settlement',
        'excavation-deformation',
        'tunnel-volume-loss-settlement',
        'staged-settlement-consolidation',
      ],
      staleRunCommandRoutes: [],
    });
    expect(benchmark.femDraftReadiness?.gates).toContain('ground-model-parameter-source-page-gaps');
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.agentRunAllowed === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.agentRunAllowed === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.agentWebglRenderAllowed === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.agentResultManifestAllowed === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.humanReviewRequired === true)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.caseOutputAvailable === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => route.executionBoundary.humanRunCommandAvailable === false)).toBe(true);
    expect(benchmark.femDraftReadiness?.routes.every((route) => !/\bfem run\b/i.test(route.recommendedCommand ?? ''))).toBe(true);
    expect(benchmark.femDraftReadiness?.gates).not.toContain('agent-webgl-route-exposed');
    expect(benchmark.femDraftReadiness?.gates).not.toContain('agent-result-manifest-route-exposed');
    expect(benchmark.femDraftReadiness?.gates).not.toContain('unreviewed-case-output-exposed');
    expect(benchmark.femDraftReadiness?.gates).not.toContain('unreviewed-human-run-command-exposed');
    const foundationRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'foundation-settlement');
    const shaftRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'shaft-deformation');
    const pileRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'pile-group-elastic-interaction');
    const slopeRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'slope-embankment-deformation');
    const retainingRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'retaining-wall-excavation-support');
    const seepageRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'seepage-groundwater-coupling');
    const stagedRoute = benchmark.femDraftReadiness?.routes.find((route) => route.objective === 'staged-settlement-consolidation');
    expect(foundationRoute?.executionBoundary).toMatchObject({
      schemaVersion: 'fem-benchmark-execution-boundary.v1',
      agentRunAllowed: false,
      agentWebglRenderAllowed: false,
      agentResultManifestAllowed: false,
      humanReviewRequired: true,
      caseOutputAvailable: false,
      humanRunCommandAvailable: false,
      draftCommand: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
      humanRunCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
    });
    expect(foundationRoute?.executionBoundary.blockedReasons).toEqual(expect.arrayContaining([
      'human-review-required',
      'analysis-case-not-reviewed',
      'ground-model-parameter-source-page-gaps',
    ]));
    expect(shaftRoute?.executionMode).toBe('contract-only');
    expect(shaftRoute?.requiredEvidence).toContain('shaft geometry');
    expect(shaftRoute?.requiredUserInputs).toContain('support sequence');
    expect(shaftRoute?.contractReadiness?.nonRunnableReason).toMatch(/planning contract only/i);
    expect(shaftRoute?.contractReadiness?.reviewGates).toEqual(expect.arrayContaining([
      'planned-only',
      'agent-run-disabled',
      'solver-backend-not-implemented',
      'human-review-required',
    ]));
    expect(shaftRoute?.contractReadiness?.blockedUntil).toContain('acceptance-fixture-approved');
    expect(shaftRoute?.contractReadiness?.disallowedAgentActions).toContain('run-solver');
    expect(shaftRoute?.reviewGates).toEqual(expect.arrayContaining([
      'agent-run-disabled',
      'solver-backend-not-implemented',
      'human-review-required',
    ]));
    expect(shaftRoute?.executionBoundary.humanRunCommandTemplate).toBeUndefined();
    expect(shaftRoute?.executionBoundary.blockedReasons).toContain('solver-or-preview-backend-implemented');
    expect(pileRoute?.executionMode).toBe('contract-only');
    expect(pileRoute?.requiredEvidence).toContain('pile layout');
    expect(pileRoute?.reviewGates).toEqual(expect.arrayContaining([
      'pile-soil-interface-review',
      'agent-run-disabled',
      'solver-backend-not-implemented',
    ]));
    expect(pileRoute?.contractReadiness?.disallowedAgentActions).toContain('invent-results');
    expect(slopeRoute?.executionMode).toBe('contract-only');
    expect(slopeRoute?.requiredUserInputs).toContain('slope height');
    expect(slopeRoute?.contractReadiness?.disallowedAgentActions).toContain('render-webgl');
    expect(retainingRoute?.executionMode).toBe('contract-only');
    expect(retainingRoute?.requiredUserInputs).toContain('prop/anchor levels');
    expect(retainingRoute?.contractReadiness?.blockedUntil).toContain('solver-or-preview-backend-implemented');
    expect(seepageRoute?.executionMode).toBe('contract-only');
    expect(seepageRoute?.requiredEvidence).toContain('groundwater observations');
    expect(seepageRoute?.reviewGates).toContain('seepage-solver-not-implemented');
    expect(stagedRoute?.executionMode).toBe('human-reviewed-preview');
    expect(stagedRoute?.requiredEvidence).toContain('compressibility/consolidation parameters');
    expect(stagedRoute?.reviewGates).toEqual(expect.arrayContaining([
      '1d-consolidation-only',
      'time-rate-review-required',
      'not-design-calculation',
    ]));
    expect(stagedRoute?.executionBoundary.humanRunCommandTemplate).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(stagedRoute?.contractReadiness).toBeUndefined();
    expect(benchmark.evidenceContract).toMatchObject({
      schemaVersion: 2,
      providerNeutral: true,
      pages: 3,
      observations: {
        materials: 2,
        classifications: 1,
        parameters: 3,
        total: 6,
      },
      methodCounts: {
        'native-pdf-text': 1,
        'layout-ocr': 1,
        'visual-reasoning': 1,
      },
      sourcePages: [2, 3],
      reviewGateCount: 4,
    });
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
    expect(comparison.delta.preprocessing).toMatchObject({
      modeChanged: false,
      averageQualityScore: 0,
      averageRegionQualityScore: 0,
      pagesDeskewed: 0,
      persistedRegionAssets: 0,
    });
    expect(comparison.passed).toBe(true);
    expect(comparison.regressions).toEqual([]);
  });

  it('reports preprocessing mode and quality deltas between benchmark variants', () => {
    const baseline = buildGeotechDocumentBenchmark(makeResult(), {
      label: 'ocr-optimized preprocessing',
      generatedAt: '2026-05-04T00:00:00.000Z',
    });
    const noPreprocessResult = makeResult({
      pageAudits: makeResult().pageAudits.map((audit) => {
        if (!audit.evidenceCache?.preprocessing) {
          return audit;
        }
        return {
          ...audit,
          evidenceCache: {
            ...audit.evidenceCache,
            preprocessingVersion: 'preprocess-none',
            preprocessing: {
              ...audit.evidenceCache.preprocessing,
              policy: 'none',
              transformed: false,
              operations: [],
              regions: [],
              quality: {
                score: 0.24,
                contentCoverageRatio: 0.72,
                darkPixelRatio: 0.08,
                regionCoverageRatio: 0,
                regionCount: 0,
                cropAssetCount: 0,
                deskew: {
                  method: 'projection-profile',
                  angleDeg: 0,
                  confidence: 0,
                  applied: false,
                },
                warnings: ['no-log-or-table-crops-detected'],
              },
            },
          },
        };
      }),
    });
    const current = buildGeotechDocumentBenchmark(noPreprocessResult, {
      label: 'none preprocessing',
      generatedAt: '2026-05-04T00:03:00.000Z',
    });

    const comparison = compareGeotechDocumentBenchmarks(current, baseline, {
      generatedAt: '2026-05-04T00:03:01.000Z',
    });

    expect(baseline.preprocessing.modes).toEqual(['ocr-optimized']);
    expect(current.preprocessing.modes).toEqual(['none']);
    expect(current.preprocessing.qualityWarningCounts).toEqual({
      'no-log-or-table-crops-detected': 1,
    });
    expect(comparison.delta.preprocessing).toMatchObject({
      modeChanged: true,
      averageQualityScore: -0.58,
      averageRegionQualityScore: -0.845,
      pagesDeskewed: -1,
      persistedRegionAssets: -1,
    });
  });

  it('fails benchmark comparisons when FEM execution boundaries regress', () => {
    const baseline = buildGeotechDocumentBenchmark(makeResult(), {
      label: 'baseline',
      generatedAt: '2026-05-04T00:00:00.000Z',
    });
    const unsafe = JSON.parse(JSON.stringify(baseline)) as typeof baseline;
    unsafe.label = 'unsafe FEM boundary';
    const fem = unsafe.femDraftReadiness!;
    fem.agentRunAllowedRoutes = ['foundation-settlement'];
    fem.agentWebglAllowedRoutes = ['foundation-settlement'];
    fem.agentResultManifestAllowedRoutes = ['foundation-settlement'];
    fem.caseOutputAvailableRoutes = ['foundation-settlement'];
    fem.humanRunCommandAvailableRoutes = ['foundation-settlement'];
    fem.staleRunCommandRoutes = ['foundation-settlement'];
    const foundationRoute = fem.routes.find((route) => route.objective === 'foundation-settlement')!;
    (foundationRoute as any).agentRunAllowed = true;
    (foundationRoute as any).recommendedCommand = 'geotech fem run analysis_case.json --experimental';
    (foundationRoute.executionBoundary as any).agentRunAllowed = true;
    (foundationRoute.executionBoundary as any).agentWebglRenderAllowed = true;
    (foundationRoute.executionBoundary as any).agentResultManifestAllowed = true;
    (foundationRoute.executionBoundary as any).caseOutputAvailable = true;
    (foundationRoute.executionBoundary as any).humanRunCommandAvailable = true;
    (foundationRoute.executionBoundary as any).humanReviewRequired = false;
    (foundationRoute as any).modelId = 'provider/geotech-private-fem-model';
    (foundationRoute as any).sourceEvidence = { prompt: 'invent FEM result', response: 'raw FEM payload' };
    (foundationRoute as any).resultManifest = { path: 'C:/Users/example/private-fem-result.json' };

    const comparison = compareGeotechDocumentBenchmarks(unsafe, baseline, {
      generatedAt: '2026-05-04T00:01:00.000Z',
    });

    expect(comparison.passed).toBe(false);
    expect(comparison.regressions).toEqual(expect.arrayContaining([
      'FEM benchmark exposed agent-run routes: foundation-settlement.',
      'FEM benchmark exposed agent WebGL routes: foundation-settlement.',
      'FEM benchmark exposed agent result-manifest routes: foundation-settlement.',
      'FEM benchmark exposed unreviewed case-output routes: foundation-settlement.',
      'FEM benchmark exposed unreviewed human-run routes: foundation-settlement.',
      'FEM benchmark recommended stale run commands: foundation-settlement.',
      'FEM route foundation-settlement exposed agent solver execution.',
      'FEM route foundation-settlement exposed agent WebGL rendering.',
      'FEM route foundation-settlement exposed agent result-manifest creation.',
      'FEM route foundation-settlement exposed unreviewed case output.',
      'FEM route foundation-settlement exposed an unreviewed human run command.',
      'FEM route foundation-settlement no longer requires human review.',
      'FEM route foundation-settlement recommended a run command instead of a draft command.',
    ]));
    expect(comparison.regressions.join('\n')).toMatch(/raw prompt\/response\/model\/source-evidence payload key/i);
    expect(comparison.regressions.join('\n')).toMatch(/result-manifest\/solver\/WebGL payload key/i);
    expect(comparison.regressions.join('\n')).toMatch(/private path or token-shaped value/i);
  });

  it('fails benchmark comparisons when contract-only FEM route metadata regresses', () => {
    const baseline = buildGeotechDocumentBenchmark(makeResult(), {
      label: 'baseline',
      generatedAt: '2026-05-04T00:00:00.000Z',
    });
    const unsafe = JSON.parse(JSON.stringify(baseline)) as typeof baseline;
    unsafe.label = 'unsafe FEM contract metadata';
    const shaftRoute = unsafe.femDraftReadiness!.routes.find((route) => route.objective === 'shaft-deformation')!;
    shaftRoute.recommendedCommand = 'geotech fem draft shaft-deformation --input <json> --case-output analysis_case.json';
    (shaftRoute.executionBoundary as any).humanRunCommandTemplate = 'geotech fem run analysis_case.json --experimental';
    shaftRoute.executionBoundary.blockedReasons = [];
    shaftRoute.reviewGates = ['planned-only'];
    shaftRoute.contractReadiness!.reviewGates = ['planned-only'];
    shaftRoute.contractReadiness!.blockedUntil = [];
    shaftRoute.contractReadiness!.disallowedAgentActions = [];

    const comparison = compareGeotechDocumentBenchmarks(unsafe, baseline, {
      generatedAt: '2026-05-04T00:01:00.000Z',
    });

    expect(comparison.passed).toBe(false);
    expect(comparison.regressions).toEqual(expect.arrayContaining([
      'FEM contract-only route shaft-deformation exposed case-output creation.',
      'FEM contract-only route shaft-deformation exposed a run command template.',
      'FEM contract-only route shaft-deformation is missing blocked-until requirement solver-or-preview-backend-implemented.',
      'FEM contract-only route shaft-deformation boundary is missing blocked reason solver-or-preview-backend-implemented.',
      'FEM contract-only route shaft-deformation no longer disallows create-analysis-case.',
      'FEM contract-only route shaft-deformation is missing review gate solver-backend-not-implemented.',
      'FEM contract-only route shaft-deformation boundary is missing review gate agent-run-disabled.',
    ]));
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
    expect(fixture.document.confidenceBreakdown).toMatchObject({
      schemaVersion: 1,
      overall: fixture.document.confidence,
      traceabilityScore: 100,
      readinessScore: 50,
      methodCoverage: {
        nativeTextPages: 27,
        visualReasoningPages: 7,
        directVisualPages: 7,
      },
    });
    expect(fixture.document.confidenceBreakdown.missingCriticalData).toEqual([
      'SPT N-values',
      'friction angle',
    ]);
    expect(fixture.evidenceCache.hitRate).toBe(1);
    expect(hostedCalls).toBe(0);
    expect(fixture.traceability.directParameterTraceabilityRate).toBeGreaterThanOrEqual(0.95);
    expect(fixture.traceability.parametersWithoutSourcePage).toBe(0);
    expect(fixture.evidenceContract).toMatchObject({
      schemaVersion: 2,
      providerNeutral: true,
      pages: 34,
      reviewGateCount: 3,
    });
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
    expect(fixture.femDraftReadiness).toMatchObject({
      schemaVersion: 1,
      providerNeutral: true,
      canAutoProceed: false,
      candidateRoutes: 9,
      implementedPreviewRoutes: [
        'foundation-settlement',
        'excavation-deformation',
        'tunnel-volume-loss-settlement',
        'staged-settlement-consolidation',
      ],
      contractOnlyRoutes: [
        'shaft-deformation',
        'pile-group-elastic-interaction',
        'slope-embankment-deformation',
        'retaining-wall-excavation-support',
        'seepage-groundwater-coupling',
      ],
      agentRunAllowedRoutes: [],
      agentWebglAllowedRoutes: [],
      agentResultManifestAllowedRoutes: [],
      caseOutputAvailableRoutes: [],
      humanRunCommandAvailableRoutes: [],
      runCommandRoutes: [
        'foundation-settlement',
        'excavation-deformation',
        'tunnel-volume-loss-settlement',
        'staged-settlement-consolidation',
      ],
      staleRunCommandRoutes: [],
    });
    expect(fixture.femDraftReadiness.gates).toEqual(expect.arrayContaining([
      'ground-model-missing-spt-n-values',
      'ground-model-partial-pages-remain',
      'ground-model-low-confidence',
      'missing-spt-n-values',
    ]));
    expect(fixture.femDraftReadiness.routes).toHaveLength(9);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.agentRunAllowed === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.agentRunAllowed === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.agentWebglRenderAllowed === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.agentResultManifestAllowed === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.humanReviewRequired === true)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.caseOutputAvailable === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => route.executionBoundary.humanRunCommandAvailable === false)).toBe(true);
    expect(fixture.femDraftReadiness.routes.every((route: any) => !/\bfem run\b/i.test(route.recommendedCommand ?? ''))).toBe(true);
    expect(fixture.femDraftReadiness.routes.find((route: any) => route.objective === 'shaft-deformation')?.contractReadiness.disallowedAgentActions).toContain('render-webgl');
    expect(fixture.femDraftReadiness.routes.find((route: any) => route.objective === 'pile-group-elastic-interaction')?.contractReadiness.disallowedAgentActions).toContain('invent-results');
    expect(fixture.femDraftReadiness.routes.find((route: any) => route.objective === 'seepage-groundwater-coupling')?.reviewGates).toContain('seepage-solver-not-implemented');
    expect(fixture.femDraftReadiness.routes.find((route: any) => route.objective === 'staged-settlement-consolidation')?.requiredEvidence).toContain('compressibility/consolidation parameters');
  });
});

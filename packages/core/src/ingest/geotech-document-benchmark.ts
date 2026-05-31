import type { PdfPageClassification } from './pdf.js';
import type {
  GeotechDocumentIngestResult,
  GeotechDocumentPageAudit,
  GeotechDocumentPageEvidenceCacheStatus,
} from './geotech-document.js';
import type { LLMConfig, ProviderCapabilityProfile } from '../llm/types.js';
import type { DocumentTextHintSource } from '../vision/ocr.js';
import {
  buildDocumentEvidencePacket,
  type DocumentEvidenceMethod,
} from './document-evidence-packet.js';
import { resolveProviderCapabilityProfile } from '../llm/capabilities.js';
import { listFemCapabilities, prepareFemAnalysisCaseDraft, type FemRouteObjective } from '../fem/index.js';

export interface GeotechDocumentBenchmarkJobContext {
  jobId?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  runCount?: number;
}

export interface GeotechDocumentBenchmarkOptions {
  job?: GeotechDocumentBenchmarkJobContext;
  label?: string;
  generatedAt?: string | Date;
  providerConfig?: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>;
  fixture?: {
    id?: string;
    category?: string;
    source?: string;
    description?: string;
  };
}

export interface GeotechDocumentBenchmark {
  kind: 'geotech-document-benchmark';
  schemaVersion: 1;
  generatedAt: string;
  label?: string;
  job?: GeotechDocumentBenchmarkJobContext;
  provider?: {
    provider: LLMConfig['provider'];
    profile: ProviderCapabilityProfile['id'];
    modelId: string | null;
    visionModelId: string | null;
    capabilities: ProviderCapabilityProfile['capabilities'];
    likelyFreeRoute: boolean;
    contextStrategy: ProviderCapabilityProfile['contextStrategy'];
    reviewGates: string[];
    preprocessingPolicy: ProviderCapabilityProfile['preprocessingPolicy'];
  };
  fixture?: {
    id?: string;
    category?: string;
    source?: string;
    description?: string;
  };
  source: {
    fileName?: string;
    filePath?: string;
    inputKind: GeotechDocumentIngestResult['source']['inputKind'];
    pageRange?: [number, number];
    totalPages: number;
    successfulPages: number;
    failedPages: number;
  };
  document: {
    class: string | null;
    title: string | null;
    parseStatus: GeotechDocumentIngestResult['parseStatus'];
    confidence: number;
    confidenceBreakdown?: GeotechDocumentIngestResult['confidenceBreakdown'];
    reviewRequired: boolean;
    canAutoProceed: boolean;
  };
  pageOutcomes: {
    totalAudited: number;
    parsed: number;
    partial: number;
    failed: number;
    failedPages: number;
    warningPages: number;
    averageConfidence: number;
  };
  pageClasses: Record<string, number>;
  extractionSources: Record<DocumentTextHintSource, number>;
  hostedCallEstimate: {
    pageExtraction: number;
    layoutOcr: number;
    vision: number;
    nativeOrPdfText: number;
    skippedOrUnavailable: number;
  };
  evidenceCache: {
    totalAudited: number;
    hit: number;
    miss: number;
    stored: number;
    skipped: number;
    unavailable: number;
    hitRate: number;
    modelVersions: string[];
    preprocessingVersions: string[];
    schemaVersions: number[];
  };
  preprocessing: {
    versions: string[];
    modes: string[];
    pagesWithPreprocessing: number;
    pagesWithoutPreprocessing: number;
    pagesWithRegions: number;
    totalRegions: number;
    preprocessingRegions: number;
    layoutRegions: number;
    pageRegionCoverage: number;
    pagesWithPreprocessingMetadata: number;
    operationCounts: Record<string, number>;
    regionLabelCounts: Record<string, number>;
    persistedRegionAssets: number;
    persistedRegionAssetBytes: number;
    pagesDeskewed: number;
    averageDeskewAngleDeg: number;
    averageQualityScore: number;
    averageRegionQualityScore: number;
    lowQualityRegions: number;
    qualityWarningCounts: Record<string, number>;
    sourceCategories: Record<'native-text' | 'layout-ocr' | 'vision' | 'none', number>;
  };
  latency: {
    pageLatencyMs: {
      count: number;
      total: number;
      average: number;
      max: number;
    };
    totalKnownLatencyMs: number;
    jobDurationMs?: number;
    synthesisLatencyMs?: number;
  };
  retainedSignals: {
    materials: number;
    classifications: number;
    parameters: number;
    risks: number;
    recommendations: number;
    contentChunks: number;
    synthesisGroundModelItems: number;
  };
  traceability: {
    parametersWithSourcePage: number;
    parametersWithoutSourcePage: number;
    directParameterTraceabilityRate: number;
    auditBackedParameterTraceabilityRate: number;
    traceabilityRate: number;
    sourcePages: number[];
    auditParameterSourcePages: number[];
    reviewFindings: number;
    warnings: number;
  };
  groundModelReadiness: {
    status: 'ready_for_engineering_review' | 'needs_engineering_review' | 'not_ready';
    score: number;
    boreholeIds: string[];
    maxDepthMeters: number | null;
    materialKinds: string[];
    hasGroundModelSynthesis: boolean;
    missingCriticalData: string[];
    gates: string[];
  };
  femDraftReadiness?: {
    schemaVersion: 1;
    providerNeutral: true;
    canAutoProceed: false;
    candidateRoutes: number;
    implementedPreviewRoutes: FemRouteObjective[];
    contractOnlyRoutes: FemRouteObjective[];
    agentRunAllowedRoutes: FemRouteObjective[];
    agentWebglAllowedRoutes: FemRouteObjective[];
    agentResultManifestAllowedRoutes: FemRouteObjective[];
    caseOutputAvailableRoutes: FemRouteObjective[];
    humanRunCommandAvailableRoutes: FemRouteObjective[];
    draftCommandRoutes: FemRouteObjective[];
    runCommandRoutes: FemRouteObjective[];
    staleRunCommandRoutes: FemRouteObjective[];
    gates: string[];
    routes: Array<{
      objective: FemRouteObjective;
      status: string;
      executionMode: string;
      agentRunAllowed: false;
      executionBoundary: {
        schemaVersion: 'fem-benchmark-execution-boundary.v1';
        agentRunAllowed: false;
        agentWebglRenderAllowed: false;
        agentResultManifestAllowed: false;
        humanReviewRequired: true;
        caseOutputAvailable: false;
        humanRunCommandAvailable: false;
        draftCommand?: string;
        humanRunCommandTemplate?: string;
        blockedReasons: string[];
      };
      recommendedCommand?: string;
      runCommandTemplate?: string;
      readinessStatus: GeotechDocumentBenchmark['groundModelReadiness']['status'];
      readinessScore: number;
      requiredEvidence: string[];
      requiredUserInputs: string[];
      reviewGates: string[];
      limitations: string[];
      contractReadiness?: {
        nonRunnableReason: string;
        blockedUntil: string[];
        allowedAgentActions: string[];
        disallowedAgentActions: string[];
      };
    }>;
  };
  evidenceContract: {
    schemaVersion: number;
    providerNeutral: true;
    pages: number;
    observations: {
      materials: number;
      classifications: number;
      parameters: number;
      total: number;
    };
    methodCounts: Record<DocumentEvidenceMethod, number>;
    sourcePages: number[];
    reviewGateCount: number;
  };
  pages: GeotechDocumentBenchmarkPage[];
}

export interface GeotechDocumentBenchmarkPage {
  pageNumber: number;
  classification: PdfPageClassification | null;
  parseStatus: GeotechDocumentPageAudit['parseStatus'];
  confidence: number;
  textHintSource: DocumentTextHintSource;
  sourceCategory: 'native-text' | 'layout-ocr' | 'vision' | 'none';
  materialCount: number;
  classificationCount: number;
  parameterCount: number;
  warningCount: number;
  cacheStatus: GeotechDocumentPageEvidenceCacheStatus | 'unavailable';
  cacheEntryId?: string;
  modelVersion?: string;
  preprocessingVersion?: string;
  preprocessingPipelineVersion?: string;
  preprocessingPolicy?: string;
  preprocessingQualityScore?: number;
  preprocessingDeskewAngleDeg?: number;
  preprocessingDeskewApplied?: boolean;
  preprocessingQualityWarnings: string[];
  preprocessingOperations: string[];
  preprocessingRegionLabels: string[];
  preprocessingRegionQualityScores: number[];
  preprocessingOperationCount: number;
  preprocessingRegionCount: number;
  preprocessingAssetCount: number;
  preprocessingAssetBytes: number;
  preprocessingLowQualityRegionCount: number;
  layoutRegionCount: number;
  latencyMs?: number;
  regionCount: number;
}

export interface GeotechDocumentBenchmarkComparison {
  kind: 'geotech-document-benchmark-comparison';
  schemaVersion: 1;
  generatedAt: string;
  baselineLabel?: string;
  currentLabel?: string;
  delta: {
    durationMs?: number;
    confidence: number;
    cacheHitRate: number;
    estimatedHostedCalls: number;
    traceabilityRate: number;
    groundModelReadinessScore: number;
    preprocessing: {
      modeChanged: boolean;
      averageQualityScore: number;
      averageRegionQualityScore: number;
      pagesDeskewed: number;
      persistedRegionAssets: number;
    };
  };
  passed: boolean;
  regressions: string[];
}

export function buildGeotechDocumentBenchmark(
  result: GeotechDocumentIngestResult,
  options: GeotechDocumentBenchmarkOptions = {},
): GeotechDocumentBenchmark {
  const pages = result.pageAudits.map(buildBenchmarkPage);
  const pageOutcomes = countPageOutcomes(result, pages);
  const evidenceCache = summarizeEvidenceCache(result.pageAudits);
  const preprocessing = summarizePreprocessing(pages, evidenceCache);
  const latency = summarizeLatency(result, pages, options.job);
  const extractionSources = countSources(result.pageAudits);
  const hostedCallEstimate = estimateHostedCalls(pages);
  const traceability = summarizeTraceability(result);
  const evidencePacket = result.evidencePacket ?? buildDocumentEvidencePacket(result);
  const provider = options.providerConfig
    ? summarizeProviderProfile(resolveProviderCapabilityProfile(options.providerConfig))
    : undefined;

  const groundModelReadiness = assessGroundModelReadiness(result, traceability, pageOutcomes);

  return {
    kind: 'geotech-document-benchmark',
    schemaVersion: 1,
    generatedAt: normalizeGeneratedAt(options.generatedAt),
    ...(options.label ? { label: options.label } : {}),
    ...(options.job ? { job: normalizeJobContext(options.job) } : {}),
    ...(provider ? { provider } : {}),
    ...(options.fixture ? { fixture: normalizeFixture(options.fixture) } : {}),
    source: {
      fileName: result.source.fileName,
      filePath: result.source.filePath,
      inputKind: result.source.inputKind,
      pageRange: result.source.pageRange,
      totalPages: result.source.totalPages,
      successfulPages: result.source.successfulPages,
      failedPages: result.source.failedPages,
    },
    document: {
      class: result.documentClass,
      title: result.title,
      parseStatus: result.parseStatus,
      confidence: result.confidence,
      ...(result.confidenceBreakdown ? { confidenceBreakdown: result.confidenceBreakdown } : {}),
      reviewRequired: result.reviewRequired,
      canAutoProceed: result.canAutoProceed,
    },
    pageOutcomes,
    pageClasses: countPageClasses(result.pageAudits),
    extractionSources,
    hostedCallEstimate,
    evidenceCache,
    preprocessing,
    latency,
    retainedSignals: {
      materials: result.materials.length,
      classifications: result.classifications.length,
      parameters: result.parameters.length,
      risks: result.risks.length,
      recommendations: result.recommendations.length,
      contentChunks: result.contentChunks?.length ?? 0,
      synthesisGroundModelItems: result.synthesis?.groundModel.length ?? 0,
    },
    traceability,
    groundModelReadiness,
    femDraftReadiness: summarizeFemDraftReadiness(groundModelReadiness),
    evidenceContract: {
      schemaVersion: evidencePacket.schemaVersion,
      providerNeutral: evidencePacket.providerContract.providerNeutral,
      pages: evidencePacket.pages.length,
      observations: {
        materials: evidencePacket.observations.materials.length,
        classifications: evidencePacket.observations.classifications.length,
        parameters: evidencePacket.observations.parameters.length,
        total:
          evidencePacket.observations.materials.length
          + evidencePacket.observations.classifications.length
          + evidencePacket.observations.parameters.length,
      },
      methodCounts: evidencePacket.traceability.methodCounts as Record<DocumentEvidenceMethod, number>,
      sourcePages: evidencePacket.traceability.sourcePages,
      reviewGateCount: evidencePacket.providerContract.reviewGates.length,
    },
    pages,
  };
}

export function compareGeotechDocumentBenchmarks(
  current: GeotechDocumentBenchmark,
  baseline: GeotechDocumentBenchmark,
  options: { generatedAt?: string | Date } = {},
): GeotechDocumentBenchmarkComparison {
  const currentCalls = totalEstimatedHostedCalls(current);
  const baselineCalls = totalEstimatedHostedCalls(baseline);
  const currentPreprocessing = current.preprocessing ?? emptyPreprocessingSummary();
  const baselinePreprocessing = baseline.preprocessing ?? emptyPreprocessingSummary();
  const delta = {
    durationMs: current.job?.durationMs != null && baseline.job?.durationMs != null
      ? current.job.durationMs - baseline.job.durationMs
      : undefined,
    confidence: current.document.confidence - baseline.document.confidence,
    cacheHitRate: current.evidenceCache.hitRate - baseline.evidenceCache.hitRate,
    estimatedHostedCalls: currentCalls - baselineCalls,
    traceabilityRate: current.traceability.traceabilityRate - baseline.traceability.traceabilityRate,
    groundModelReadinessScore: current.groundModelReadiness.score - baseline.groundModelReadiness.score,
    preprocessing: {
      modeChanged: currentPreprocessing.modes.join(',') !== baselinePreprocessing.modes.join(','),
      averageQualityScore: currentPreprocessing.averageQualityScore - baselinePreprocessing.averageQualityScore,
      averageRegionQualityScore: currentPreprocessing.averageRegionQualityScore - baselinePreprocessing.averageRegionQualityScore,
      pagesDeskewed: currentPreprocessing.pagesDeskewed - baselinePreprocessing.pagesDeskewed,
      persistedRegionAssets: currentPreprocessing.persistedRegionAssets - baselinePreprocessing.persistedRegionAssets,
    },
  };

  const regressions = [
    delta.confidence < -3 ? `Confidence dropped by ${Math.abs(delta.confidence)} points.` : null,
    delta.estimatedHostedCalls > 2 ? `Estimated hosted calls increased by ${delta.estimatedHostedCalls}.` : null,
    delta.traceabilityRate < -0.05 ? 'Source-page traceability rate dropped by more than 5%.' : null,
    delta.groundModelReadinessScore < -5 ? 'Ground-model readiness score dropped by more than 5 points.' : null,
    ...collectFemBoundaryRegressions(current, baseline),
  ].filter((value): value is string => value != null);

  return {
    kind: 'geotech-document-benchmark-comparison',
    schemaVersion: 1,
    generatedAt: normalizeGeneratedAt(options.generatedAt),
    baselineLabel: baseline.label,
    currentLabel: current.label,
    delta,
    passed: regressions.length === 0,
    regressions,
  };
}

function routeList(values: FemRouteObjective[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : 'none';
}

function collectFemBoundaryRegressions(
  current: GeotechDocumentBenchmark,
  baseline: GeotechDocumentBenchmark,
): string[] {
  const currentFem = current.femDraftReadiness;
  const baselineFem = baseline.femDraftReadiness;
  const regressions: Array<string | null> = [];

  if (baselineFem && !currentFem) {
    regressions.push('FEM draft readiness disappeared from benchmark output.');
    return regressions.filter((value): value is string => value != null);
  }
  if (!currentFem) {
    return [];
  }

  regressions.push(
    currentFem.canAutoProceed
      ? 'FEM draft readiness became auto-proceedable; FEM must remain review-gated.'
      : null,
    currentFem.agentRunAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent-run routes: ${routeList(currentFem.agentRunAllowedRoutes)}.`
      : null,
    currentFem.agentWebglAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent WebGL routes: ${routeList(currentFem.agentWebglAllowedRoutes)}.`
      : null,
    currentFem.agentResultManifestAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent result-manifest routes: ${routeList(currentFem.agentResultManifestAllowedRoutes)}.`
      : null,
    currentFem.caseOutputAvailableRoutes.length > 0
      ? `FEM benchmark exposed unreviewed case-output routes: ${routeList(currentFem.caseOutputAvailableRoutes)}.`
      : null,
    currentFem.humanRunCommandAvailableRoutes.length > 0
      ? `FEM benchmark exposed unreviewed human-run routes: ${routeList(currentFem.humanRunCommandAvailableRoutes)}.`
      : null,
    currentFem.staleRunCommandRoutes.length > 0
      ? `FEM benchmark recommended stale run commands: ${routeList(currentFem.staleRunCommandRoutes)}.`
      : null,
  );

  for (const route of currentFem.routes) {
    const boundary = route.executionBoundary;
    if (route.agentRunAllowed || boundary.agentRunAllowed) {
      regressions.push(`FEM route ${route.objective} exposed agent solver execution.`);
    }
    if (boundary.agentWebglRenderAllowed) {
      regressions.push(`FEM route ${route.objective} exposed agent WebGL rendering.`);
    }
    if (boundary.agentResultManifestAllowed) {
      regressions.push(`FEM route ${route.objective} exposed agent result-manifest creation.`);
    }
    if (boundary.caseOutputAvailable) {
      regressions.push(`FEM route ${route.objective} exposed unreviewed case output.`);
    }
    if (boundary.humanRunCommandAvailable) {
      regressions.push(`FEM route ${route.objective} exposed an unreviewed human run command.`);
    }
    if (!boundary.humanReviewRequired) {
      regressions.push(`FEM route ${route.objective} no longer requires human review.`);
    }
    if (/\bfem run\b/i.test(route.recommendedCommand ?? '')) {
      regressions.push(`FEM route ${route.objective} recommended a run command instead of a draft command.`);
    }
  }

  return [...new Set(regressions.filter((value): value is string => value != null))];
}

function buildBenchmarkPage(audit: GeotechDocumentPageAudit): GeotechDocumentBenchmarkPage {
  const evidenceCache = audit.evidenceCache;
  const preprocessing = evidenceCache?.preprocessing;
  const regionQualityScores = preprocessing?.regions
    .map((region) => region.quality?.score)
    .filter((value): value is number => Number.isFinite(value)) ?? [];
  const qualityWarnings = [
    ...(preprocessing?.quality?.warnings ?? []),
    ...(preprocessing?.regions.flatMap((region) => region.quality?.warnings ?? []) ?? []),
  ];
  return {
    pageNumber: audit.pageNumber,
    classification: audit.classification,
    parseStatus: audit.parseStatus,
    confidence: audit.confidence,
    textHintSource: audit.textHintSource,
    sourceCategory: categorizeSource(audit.textHintSource),
    materialCount: audit.materialCount,
    classificationCount: audit.classificationCount,
    parameterCount: audit.parameterCount,
    warningCount: audit.warnings.length,
    cacheStatus: evidenceCache?.status ?? 'unavailable',
    ...(evidenceCache?.entryId ? { cacheEntryId: evidenceCache.entryId } : {}),
    ...(evidenceCache?.modelVersion ? { modelVersion: evidenceCache.modelVersion } : {}),
    ...(evidenceCache?.preprocessingVersion ? { preprocessingVersion: evidenceCache.preprocessingVersion } : {}),
    ...(preprocessing?.pipelineVersion ? { preprocessingPipelineVersion: preprocessing.pipelineVersion } : {}),
    ...(preprocessing?.policy ? { preprocessingPolicy: preprocessing.policy } : {}),
    ...(preprocessing?.quality?.score != null ? { preprocessingQualityScore: preprocessing.quality.score } : {}),
    ...(preprocessing?.quality?.deskew ? { preprocessingDeskewAngleDeg: preprocessing.quality.deskew.angleDeg } : {}),
    ...(preprocessing?.quality?.deskew ? { preprocessingDeskewApplied: preprocessing.quality.deskew.applied } : {}),
    preprocessingQualityWarnings: [...new Set(qualityWarnings)].sort(),
    preprocessingOperations: preprocessing?.operations ?? [],
    preprocessingRegionLabels: preprocessing?.regions.map((region) => region.label) ?? [],
    preprocessingRegionQualityScores: regionQualityScores,
    preprocessingOperationCount: preprocessing?.operations.length ?? 0,
    preprocessingRegionCount: preprocessing?.regions.length ?? 0,
    preprocessingAssetCount: preprocessing?.regions.filter((region) => region.asset?.cacheRelativePath).length ?? 0,
    preprocessingAssetBytes: preprocessing?.regions.reduce((sum, region) => sum + (region.asset?.cacheRelativePath ? region.asset.byteLength : 0), 0) ?? 0,
    preprocessingLowQualityRegionCount: regionQualityScores.filter((score) => score < 0.45).length,
    layoutRegionCount: countLayoutRegions(audit),
    ...(Number.isFinite(audit.latencyMs) ? { latencyMs: Math.max(0, Math.round(audit.latencyMs as number)) } : {}),
    regionCount: countAuditRegions(audit),
  };
}

function summarizeProviderProfile(profile: ProviderCapabilityProfile): NonNullable<GeotechDocumentBenchmark['provider']> {
  return {
    provider: profile.provider,
    profile: profile.id,
    modelId: profile.modelId,
    visionModelId: profile.visionModelId,
    capabilities: profile.capabilities,
    likelyFreeRoute: profile.likelyFreeRoute,
    contextStrategy: profile.contextStrategy,
    reviewGates: profile.reviewGates,
    preprocessingPolicy: profile.preprocessingPolicy,
  };
}

function normalizeFixture(
  fixture: NonNullable<GeotechDocumentBenchmarkOptions['fixture']>,
): NonNullable<GeotechDocumentBenchmark['fixture']> {
  return {
    ...(fixture.id ? { id: fixture.id } : {}),
    ...(fixture.category ? { category: fixture.category } : {}),
    ...(fixture.source ? { source: fixture.source } : {}),
    ...(fixture.description ? { description: fixture.description } : {}),
  };
}

function countAuditRegions(audit: GeotechDocumentPageAudit): number {
  return countLayoutRegions(audit) + (audit.evidenceCache?.preprocessing?.regions.length ?? 0);
}

function countLayoutRegions(audit: GeotechDocumentPageAudit): number {
  return (audit.layoutPages ?? []).reduce((sum, page) => sum + page.elements.length, 0);
}

function summarizePreprocessing(
  pages: GeotechDocumentBenchmarkPage[],
  evidenceCache: GeotechDocumentBenchmark['evidenceCache'],
): GeotechDocumentBenchmark['preprocessing'] {
  const sourceCategories: GeotechDocumentBenchmark['preprocessing']['sourceCategories'] = {
    'native-text': 0,
    'layout-ocr': 0,
    vision: 0,
    none: 0,
  };
  for (const page of pages) {
    sourceCategories[page.sourceCategory] += 1;
  }

  const pagesWithPreprocessing = pages.filter((page) => Boolean(page.preprocessingVersion)).length;
  const pagesWithRegions = pages.filter((page) => page.regionCount > 0).length;
  const totalRegions = pages.reduce((sum, page) => sum + page.regionCount, 0);
  const preprocessingRegions = pages.reduce((sum, page) => sum + page.preprocessingRegionCount, 0);
  const layoutRegions = pages.reduce((sum, page) => sum + page.layoutRegionCount, 0);
  const qualityScores = pages
    .map((page) => page.preprocessingQualityScore)
    .filter((value): value is number => Number.isFinite(value));
  const regionQualityScores = pages.flatMap((page) => page.preprocessingRegionQualityScores);
  const deskewAngles = pages
    .filter((page) => page.preprocessingDeskewApplied)
    .map((page) => Math.abs(page.preprocessingDeskewAngleDeg ?? 0))
    .filter((value) => Number.isFinite(value));
  const pagesWithPreprocessingMetadata = pages.filter((page) =>
    Boolean(page.preprocessingPipelineVersion) || page.preprocessingOperationCount > 0 || page.preprocessingRegionCount > 0,
  ).length;

  return {
    versions: evidenceCache.preprocessingVersions,
    modes: [...new Set(pages.flatMap((page) => page.preprocessingPolicy ? [page.preprocessingPolicy] : []))].sort(),
    pagesWithPreprocessing,
    pagesWithoutPreprocessing: Math.max(0, pages.length - pagesWithPreprocessing),
    pagesWithRegions,
    totalRegions,
    preprocessingRegions,
    layoutRegions,
    pageRegionCoverage: pages.length > 0 ? roundRatio(pagesWithRegions / pages.length) : 0,
    pagesWithPreprocessingMetadata,
    operationCounts: summarizePreprocessingOperations(pages),
    regionLabelCounts: summarizePreprocessingRegionLabels(pages),
    persistedRegionAssets: pages.reduce((sum, page) => sum + page.preprocessingAssetCount, 0),
    persistedRegionAssetBytes: pages.reduce((sum, page) => sum + page.preprocessingAssetBytes, 0),
    pagesDeskewed: pages.filter((page) => page.preprocessingDeskewApplied).length,
    averageDeskewAngleDeg: deskewAngles.length > 0 ? roundRatio(deskewAngles.reduce((sum, value) => sum + value, 0) / deskewAngles.length) : 0,
    averageQualityScore: qualityScores.length > 0 ? roundRatio(qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length) : 0,
    averageRegionQualityScore: regionQualityScores.length > 0 ? roundRatio(regionQualityScores.reduce((sum, value) => sum + value, 0) / regionQualityScores.length) : 0,
    lowQualityRegions: pages.reduce((sum, page) => sum + page.preprocessingLowQualityRegionCount, 0),
    qualityWarningCounts: summarizePreprocessingQualityWarnings(pages),
    sourceCategories,
  };
}

function emptyPreprocessingSummary(): GeotechDocumentBenchmark['preprocessing'] {
  return {
    versions: [],
    modes: [],
    pagesWithPreprocessing: 0,
    pagesWithoutPreprocessing: 0,
    pagesWithRegions: 0,
    totalRegions: 0,
    preprocessingRegions: 0,
    layoutRegions: 0,
    pageRegionCoverage: 0,
    pagesWithPreprocessingMetadata: 0,
    operationCounts: {},
    regionLabelCounts: {},
    persistedRegionAssets: 0,
    persistedRegionAssetBytes: 0,
    pagesDeskewed: 0,
    averageDeskewAngleDeg: 0,
    averageQualityScore: 0,
    averageRegionQualityScore: 0,
    lowQualityRegions: 0,
    qualityWarningCounts: {},
    sourceCategories: {
      'native-text': 0,
      'layout-ocr': 0,
      vision: 0,
      none: 0,
    },
  };
}

function summarizePreprocessingOperations(
  pages: GeotechDocumentBenchmarkPage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const auditPage of pages) {
    for (const operation of auditPage.preprocessingOperations) {
      counts[operation] = (counts[operation] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizePreprocessingRegionLabels(
  pages: GeotechDocumentBenchmarkPage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const auditPage of pages) {
    for (const label of auditPage.preprocessingRegionLabels) {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizePreprocessingQualityWarnings(
  pages: GeotechDocumentBenchmarkPage[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const auditPage of pages) {
    for (const warning of auditPage.preprocessingQualityWarnings) {
      counts[warning] = (counts[warning] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeLatency(
  result: GeotechDocumentIngestResult,
  pages: GeotechDocumentBenchmarkPage[],
  job: GeotechDocumentBenchmarkJobContext | undefined,
): GeotechDocumentBenchmark['latency'] {
  const pageLatencies = pages
    .map((page) => page.latencyMs)
    .filter((value): value is number => Number.isFinite(value));
  const total = pageLatencies.reduce((sum, value) => sum + value, 0);
  const max = pageLatencies.length > 0 ? Math.max(...pageLatencies) : 0;
  const average = pageLatencies.length > 0 ? Math.round(total / pageLatencies.length) : 0;
  const synthesisLatencyMs = Number.isFinite(result.synthesis?.latencyMs)
    ? Math.max(0, Math.round(result.synthesis!.latencyMs as number))
    : undefined;
  const jobDurationMs = Number.isFinite(job?.durationMs)
    ? Math.max(0, Math.round(job!.durationMs as number))
    : undefined;
  return {
    pageLatencyMs: {
      count: pageLatencies.length,
      total,
      average,
      max,
    },
    totalKnownLatencyMs: total + (synthesisLatencyMs ?? 0),
    ...(jobDurationMs != null ? { jobDurationMs } : {}),
    ...(synthesisLatencyMs != null ? { synthesisLatencyMs } : {}),
  };
}

function countPageOutcomes(
  result: GeotechDocumentIngestResult,
  pages: GeotechDocumentBenchmarkPage[],
): GeotechDocumentBenchmark['pageOutcomes'] {
  const parsed = pages.filter((page) => page.parseStatus === 'parsed').length;
  const partial = pages.filter((page) => page.parseStatus === 'partial').length;
  const failed = pages.filter((page) => page.parseStatus === 'failed').length;
  const confidences = pages.map((page) => page.confidence).filter((value) => Number.isFinite(value));
  const averageConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : 0;
  return {
    totalAudited: pages.length,
    parsed,
    partial,
    failed,
    failedPages: result.source.failedPages,
    warningPages: pages.filter((page) => page.warningCount > 0).length,
    averageConfidence,
  };
}

function summarizeEvidenceCache(
  audits: GeotechDocumentPageAudit[],
): GeotechDocumentBenchmark['evidenceCache'] {
  const counts = {
    hit: 0,
    miss: 0,
    stored: 0,
    skipped: 0,
    unavailable: 0,
  };
  const modelVersions = new Set<string>();
  const preprocessingVersions = new Set<string>();
  const schemaVersions = new Set<number>();

  for (const audit of audits) {
    const cache = audit.evidenceCache;
    if (!cache) {
      counts.unavailable += 1;
      continue;
    }
    counts[cache.status] += 1;
    modelVersions.add(cache.modelVersion);
    preprocessingVersions.add(cache.preprocessingVersion);
    schemaVersions.add(cache.schemaVersion);
  }

  const totalAudited = audits.length;
  return {
    totalAudited,
    ...counts,
    hitRate: totalAudited > 0 ? roundRatio(counts.hit / totalAudited) : 0,
    modelVersions: [...modelVersions].sort(),
    preprocessingVersions: [...preprocessingVersions].sort(),
    schemaVersions: [...schemaVersions].sort((left, right) => left - right),
  };
}

function countSources(audits: GeotechDocumentPageAudit[]): Record<DocumentTextHintSource, number> {
  const counts: Record<DocumentTextHintSource, number> = {
    'native-text': 0,
    'pdfjs-text': 0,
    'local-ocr': 0,
    'vision-ocr': 0,
    'vision-visual': 0,
    'glm-ocr': 0,
    none: 0,
  };
  for (const audit of audits) {
    counts[audit.textHintSource] += 1;
  }
  return counts;
}

function countPageClasses(audits: GeotechDocumentPageAudit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const audit of audits) {
    const key = audit.classification ?? 'unclassified';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function estimateHostedCalls(pages: GeotechDocumentBenchmarkPage[]): GeotechDocumentBenchmark['hostedCallEstimate'] {
  const activePages = pages.filter((page) => page.cacheStatus !== 'hit');
  return {
    pageExtraction: activePages.filter((page) => page.parseStatus !== 'failed' && page.sourceCategory !== 'none').length,
    layoutOcr: activePages.filter((page) => page.textHintSource === 'glm-ocr').length,
    vision: activePages.filter((page) => page.sourceCategory === 'vision').length,
    nativeOrPdfText: activePages.filter((page) => page.sourceCategory === 'native-text').length,
    skippedOrUnavailable: activePages.filter((page) => page.sourceCategory === 'none').length,
  };
}

function summarizeTraceability(result: GeotechDocumentIngestResult): GeotechDocumentBenchmark['traceability'] {
  const sourcePages = new Set<number>();
  let parametersWithSourcePage = 0;

  for (const parameter of result.parameters) {
    const pages = sourcePagesFromObservation(parameter.sourcePages, parameter.context);
    for (const page of pages) {
      sourcePages.add(page);
    }
    if (pages.length > 0) {
      parametersWithSourcePage += 1;
    }
  }

  const auditParameterSourcePages = result.pageAudits
    .filter((audit) => audit.parameterCount > 0)
    .map((audit) => audit.pageNumber)
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0);
  for (const page of auditParameterSourcePages) {
    sourcePages.add(page);
  }

  for (const page of result.synthesis?.sourcePages ?? []) {
    if (Number.isInteger(page) && page > 0) {
      sourcePages.add(page);
    }
  }

  const parametersWithoutSourcePage = Math.max(0, result.parameters.length - parametersWithSourcePage);
  const auditBackedParameterCount = Math.min(
    result.parameters.length,
    result.pageAudits.reduce((sum, audit) => sum + Math.max(0, audit.parameterCount), 0),
  );
  const directParameterTraceabilityRate = result.parameters.length > 0
    ? roundRatio(parametersWithSourcePage / result.parameters.length)
    : 0;
  const auditBackedParameterTraceabilityRate = result.parameters.length > 0
    ? roundRatio(auditBackedParameterCount / result.parameters.length)
    : 0;
  return {
    parametersWithSourcePage,
    parametersWithoutSourcePage,
    directParameterTraceabilityRate,
    auditBackedParameterTraceabilityRate,
    traceabilityRate: directParameterTraceabilityRate,
    sourcePages: [...sourcePages].sort((left, right) => left - right),
    auditParameterSourcePages: [...new Set(auditParameterSourcePages)].sort((left, right) => left - right),
    reviewFindings: result.reviewFindings.length,
    warnings: result.warnings.length + result.pageAudits.reduce((sum, audit) => sum + audit.warnings.length, 0),
  };
}

function assessGroundModelReadiness(
  result: GeotechDocumentIngestResult,
  traceability: GeotechDocumentBenchmark['traceability'],
  pageOutcomes: GeotechDocumentBenchmark['pageOutcomes'],
): GeotechDocumentBenchmark['groundModelReadiness'] {
  const evidenceTexts = collectEvidenceTexts(result);
  const boreholeIds = inferBoreholeIdsFromText(...evidenceTexts);
  const maxDepthMeters = inferMaxDepthMeters(result, evidenceTexts);
  const materialKinds = [...new Set(result.materials.map((material) => material.kind))].sort();
  const missingCriticalData = inferMissingCriticalData(result);
  const gates = [
    boreholeIds.length === 0 ? 'no-boreholes-detected' : null,
    maxDepthMeters == null ? 'no-maximum-depth' : null,
    result.materials.length === 0 ? 'no-material-observations' : null,
    result.synthesis?.groundModel.length ? null : 'no-ground-model-synthesis',
    ...missingCriticalData.map((item) => `missing-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
    pageOutcomes.partial > 0 ? 'partial-pages-remain' : null,
    pageOutcomes.failed + result.source.failedPages > 0 ? 'failed-pages-remain' : null,
    result.confidence < 70 ? 'low-confidence' : null,
    traceability.traceabilityRate < 0.8 ? 'parameter-source-page-gaps' : null,
  ].filter((value): value is string => value != null);

  let score = 100;
  score -= Math.min(35, missingCriticalData.length * 9);
  if (boreholeIds.length === 0) score -= 18;
  if (maxDepthMeters == null) score -= 12;
  if (result.materials.length === 0) score -= 15;
  if (!result.synthesis?.groundModel.length) score -= 10;
  score -= Math.min(20, pageOutcomes.partial * 5 + (pageOutcomes.failed + result.source.failedPages) * 10);
  if (result.confidence < 70) score -= 15;
  else if (result.confidence < 80) score -= 8;
  score -= Math.min(10, Math.round(result.parameters.length * (1 - traceability.traceabilityRate)) * 2);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    status: score >= 80 && gates.length <= 2
      ? 'ready_for_engineering_review'
      : score >= 50
        ? 'needs_engineering_review'
        : 'not_ready',
    score,
    boreholeIds,
    maxDepthMeters,
    materialKinds,
    hasGroundModelSynthesis: Boolean(result.synthesis?.groundModel.length),
    missingCriticalData,
    gates,
  };
}

function summarizeFemDraftReadiness(
  readiness: GeotechDocumentBenchmark['groundModelReadiness'],
): NonNullable<GeotechDocumentBenchmark['femDraftReadiness']> {
  const capabilities = listFemCapabilities();
  const routes = capabilities.map((capability) => {
    const contractReadiness = capability.executionMode === 'contract-only'
      ? prepareFemAnalysisCaseDraft({ objective: capability.objective }).contractReadiness
      : undefined;
    const blockedReasons = [
      ...readiness.gates.map((gate) => `ground-model-${gate}`),
      ...readiness.missingCriticalData.map((item) => `missing-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
      ...capability.reviewGates,
      ...(contractReadiness?.blockedUntil ?? []),
      'human-review-required',
      'analysis-case-not-reviewed',
    ];
    return {
      objective: capability.objective,
      status: capability.status,
      executionMode: capability.executionMode,
      agentRunAllowed: capability.agentRunAllowed,
      executionBoundary: {
        schemaVersion: 'fem-benchmark-execution-boundary.v1' as const,
        agentRunAllowed: false as const,
        agentWebglRenderAllowed: false as const,
        agentResultManifestAllowed: false as const,
        humanReviewRequired: true as const,
        caseOutputAvailable: false as const,
        humanRunCommandAvailable: false as const,
        ...(capability.command ? { draftCommand: capability.command } : {}),
        ...(capability.runCommandTemplate ? { humanRunCommandTemplate: capability.runCommandTemplate } : {}),
        blockedReasons: [...new Set(blockedReasons)],
      },
      ...(capability.command ? { recommendedCommand: capability.command } : {}),
      ...(capability.runCommandTemplate ? { runCommandTemplate: capability.runCommandTemplate } : {}),
      readinessStatus: readiness.status,
      readinessScore: readiness.score,
      requiredEvidence: capability.requiredEvidence,
      requiredUserInputs: capability.requiredUserInputs,
      reviewGates: capability.reviewGates,
      limitations: capability.limitations,
      ...(contractReadiness ? {
        contractReadiness: {
          nonRunnableReason: contractReadiness.nonRunnableReason,
          blockedUntil: contractReadiness.blockedUntil,
          allowedAgentActions: contractReadiness.allowedAgentActions,
          disallowedAgentActions: contractReadiness.disallowedAgentActions,
        },
      } : {}),
    };
  });
  const implementedPreviewRoutes = routes
    .filter((route) => route.executionMode === 'human-reviewed-preview')
    .map((route) => route.objective);
  const contractOnlyRoutes = routes
    .filter((route) => route.executionMode === 'contract-only')
    .map((route) => route.objective);
  const agentRunAllowedRoutes = routes
    .filter((route) => route.agentRunAllowed)
    .map((route) => route.objective);
  const agentWebglAllowedRoutes = routes
    .filter((route) => route.executionBoundary.agentWebglRenderAllowed)
    .map((route) => route.objective);
  const agentResultManifestAllowedRoutes = routes
    .filter((route) => route.executionBoundary.agentResultManifestAllowed)
    .map((route) => route.objective);
  const caseOutputAvailableRoutes = routes
    .filter((route) => route.executionBoundary.caseOutputAvailable)
    .map((route) => route.objective);
  const humanRunCommandAvailableRoutes = routes
    .filter((route) => route.executionBoundary.humanRunCommandAvailable)
    .map((route) => route.objective);
  const draftCommandRoutes = routes
    .filter((route) => route.recommendedCommand?.startsWith('geotech fem draft '))
    .map((route) => route.objective);
  const runCommandRoutes = routes
    .filter((route) => route.runCommandTemplate?.startsWith('geotech fem run '))
    .map((route) => route.objective);
  const staleRunCommandRoutes = routes
    .filter((route) => /\bfem run\b/i.test(route.recommendedCommand ?? ''))
    .map((route) => route.objective);

  const gates = [
    ...readiness.gates.map((gate) => `ground-model-${gate}`),
    ...readiness.missingCriticalData.map((item) => `missing-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
    agentRunAllowedRoutes.length > 0 ? 'agent-run-route-exposed' : null,
    agentWebglAllowedRoutes.length > 0 ? 'agent-webgl-route-exposed' : null,
    agentResultManifestAllowedRoutes.length > 0 ? 'agent-result-manifest-route-exposed' : null,
    caseOutputAvailableRoutes.length > 0 ? 'unreviewed-case-output-exposed' : null,
    humanRunCommandAvailableRoutes.length > 0 ? 'unreviewed-human-run-command-exposed' : null,
    staleRunCommandRoutes.length > 0 ? 'stale-run-command-recommended' : null,
  ].filter((value): value is string => value != null);

  return {
    schemaVersion: 1,
    providerNeutral: true,
    canAutoProceed: false,
    candidateRoutes: routes.length,
    implementedPreviewRoutes,
    contractOnlyRoutes,
    agentRunAllowedRoutes,
    agentWebglAllowedRoutes,
    agentResultManifestAllowedRoutes,
    caseOutputAvailableRoutes,
    humanRunCommandAvailableRoutes,
    draftCommandRoutes,
    runCommandRoutes,
    staleRunCommandRoutes,
    gates: [...new Set(gates)],
    routes,
  };
}

function categorizeSource(source: DocumentTextHintSource): GeotechDocumentBenchmarkPage['sourceCategory'] {
  if (source === 'native-text' || source === 'pdfjs-text') {
    return 'native-text';
  }
  if (source === 'glm-ocr' || source === 'local-ocr') {
    return 'layout-ocr';
  }
  if (source === 'vision-ocr' || source === 'vision-visual') {
    return 'vision';
  }
  return 'none';
}

function normalizeGeneratedAt(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' && value.trim() ? value.trim() : new Date().toISOString();
}

function normalizeJobContext(job: GeotechDocumentBenchmarkJobContext): GeotechDocumentBenchmarkJobContext {
  return {
    ...(job.jobId ? { jobId: job.jobId } : {}),
    ...(job.createdAt ? { createdAt: job.createdAt } : {}),
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(Number.isFinite(job.durationMs) ? { durationMs: Math.max(0, Math.round(job.durationMs as number)) } : {}),
    ...(Number.isFinite(job.runCount) ? { runCount: Math.max(0, Math.round(job.runCount as number)) } : {}),
  };
}

function inferMissingCriticalData(result: GeotechDocumentIngestResult): string[] {
  const checks = [
    ['groundwater level', /ground\s*water|water\s*table|piezometer/i],
    ['SPT N-values', /\bspt\b|standard\s*penetration|n[-\s]?value/i],
    ['RQD', /\brqd\b|rock\s+quality\s+designation/i],
    ['cohesion', /cohesion|\bc\b/i],
    ['friction angle', /friction|phi|angle/i],
  ] as const;
  return checks.flatMap(([name, pattern]) => hasUsableParameter(result, pattern) ? [] : [name]);
}

function hasUsableParameter(result: GeotechDocumentIngestResult, pattern: RegExp): boolean {
  return result.parameters.some((parameter) => {
    const text = `${parameter.name} ${parameter.valueText} ${parameter.unit ?? ''} ${parameter.material ?? ''} ${parameter.context ?? ''}`;
    if (!pattern.test(text)) {
      return false;
    }
    return isUsableParameterValue(parameter.valueText, parameter.numericValue);
  });
}

function isUsableParameterValue(valueText: string | null | undefined, numericValue: number | null): boolean {
  if (numericValue != null && Number.isFinite(numericValue)) {
    return true;
  }
  const value = String(valueText ?? '').trim();
  return Boolean(value)
    && !/^(?:-|--|—|n\/?a|nil|none|not\s+(?:reported|extracted|encountered|available)|unavailable|missing)$/i.test(value);
}

function collectEvidenceTexts(result: GeotechDocumentIngestResult): string[] {
  return [
    result.title,
    result.summary,
    ...result.materials.flatMap((material) => [material.description, material.uscsSymbol, material.lithology]),
    ...result.parameters.flatMap((parameter) => [parameter.name, parameter.valueText, parameter.material, parameter.context]),
    ...result.classifications.flatMap((classification) => [classification.system, classification.value, classification.context]),
    ...result.risks,
    ...result.recommendations,
    ...(result.synthesis
      ? [
          ...result.synthesis.takeaways,
          ...result.synthesis.groundModel,
          ...result.synthesis.keyParameters,
          ...result.synthesis.interpretation,
          ...result.synthesis.limitations,
        ]
      : []),
    ...(result.contentChunks ?? []).flatMap((chunk) => [...chunk.headingAncestry, chunk.text]),
    ...(result.inspection?.pages ?? []).flatMap((page) => [
      page.normalizedText,
      page.extractedText,
      page.normalizedArtifact?.nativeText,
    ]),
  ].flatMap((value) => typeof value === 'string' && value.trim() ? [value.trim()] : []);
}

function inferBoreholeIdsFromText(...values: Array<string | null | undefined>): string[] {
  const text = values.filter(Boolean).join('\n');
  const patterns = [
    /\bB\.?\s*H\.?\s*(?:NO\.?)?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
    /\bBORE\s*HOLE\s*NO\.?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
    /\bBOREHOLE\s*NO\.?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
    /\bBOREHOLENO\s*[:#-]?\s*0*(\d{1,3})\b/gi,
  ];
  const ids = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)]
      .map((match) => `BH${match[1]}`)
      .filter((id) => !/^BH0$/.test(id)),
  );
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function inferMaxDepthMeters(result: GeotechDocumentIngestResult, evidenceTexts: string[]): number | null {
  const depths = result.parameters
    .filter((parameter) => /depth|elevation|thickness/i.test(parameter.name))
    .flatMap((parameter) => readDepthMeters(parameter.numericValue ?? parameter.valueText) ?? []);
  const preferredDepths: number[] = [];
  for (const text of evidenceTexts) {
    preferredDepths.push(...collectPreferredDepthMeters(text));
    depths.push(...collectDepthMeters(text));
  }
  if (preferredDepths.length > 0) {
    return Math.max(...preferredDepths);
  }
  return depths.length > 0 ? Math.max(...depths) : null;
}

function readDepthMeters(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (!value) {
    return null;
  }
  const text = String(value);
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*m\b/i)
    ?? text.match(/\b(?:depth|termination|terminating)\b[^0-9-]{0,40}(-?\d+(?:\.\d+)?)/i);
  const numeric = Number(match?.[1] ?? text);
  return Number.isFinite(numeric) ? numeric : null;
}

function collectDepthMeters(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }
  const normalized = value.replace(/\s+/g, ' ');
  return [
    ...[...normalized.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*m\b/gi)].map((match) => Number(match[1])),
    ...[...normalized.matchAll(/\b(?:maximum\s+depth|termination)\b[^0-9]{0,60}(\d{1,3}(?:\.\d+)?)\b/gi)].map((match) => Number(match[1])),
  ].filter((depth) => Number.isFinite(depth) && depth > 0 && depth <= 120);
}

function collectPreferredDepthMeters(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }
  const normalized = value.replace(/\s+/g, ' ');
  return [
    ...[...normalized.matchAll(/\bmaximum\s+depth\s+(?:of\s+)?(\d{1,2}(?:\.\d+)?)\s*m\b/gi)].map((match) => Number(match[1])),
    ...[...normalized.matchAll(/\bBH\s*[-:]?\s*0*\d{1,3}\s+(\d{1,2}(?:\.\d+)?)\s+(?:not\s+found|nil|no\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi)].map((match) => Number(match[1])),
    ...[...normalized.matchAll(/\bTERMINATION\s*[:#-]?\s*(\d{1,2}(?:\.\d+)?)\b/gi)].map((match) => Number(match[1])),
  ].filter((depth) => Number.isFinite(depth) && depth > 0 && depth <= 60);
}

function sourcePagesFromText(value: string | null | undefined): number[] {
  return [...(value ?? '').matchAll(/\bpage\s+(\d+)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((page) => Number.isInteger(page) && page > 0);
}

function sourcePagesFromObservation(sourcePages: number[] | undefined, context: string | null | undefined): number[] {
  const attributedPages = Array.isArray(sourcePages)
    ? [...new Set(
        sourcePages
          .map((page) => Number(page))
          .filter((page) => Number.isInteger(page) && page > 0),
      )].sort((left, right) => left - right)
    : [];
  return attributedPages.length > 0 ? attributedPages : sourcePagesFromText(context);
}

function totalEstimatedHostedCalls(benchmark: GeotechDocumentBenchmark): number {
  return benchmark.hostedCallEstimate.pageExtraction
    + benchmark.hostedCallEstimate.layoutOcr
    + benchmark.hostedCallEstimate.vision;
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

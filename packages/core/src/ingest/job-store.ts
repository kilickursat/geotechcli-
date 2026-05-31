import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LLMConfig } from '../llm/types.js';
import { inferPdfDocumentPageCountFallback, type PdfDocumentInspection, type PdfPageClassification } from './pdf.js';
import type { BoreholeDocumentIngestResult } from './geotech-extract.js';
import type { GeotechDocumentIngestResult, GeotechDocumentPageEvidenceCacheAudit } from './geotech-document.js';
import {
  buildHostedBetaPdfSegments,
  HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
  pageWeightForClassification,
  type IngestSegmentationMode,
  type IngestSegmentationSummary,
  type IngestSegmentSummary,
  type PdfPageRange,
  type PdfSegmentRange,
} from './segmentation.js';

export type PersistedIngestJobDocumentType = 'borehole-log' | 'geotech-document';
export type PersistedIngestJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type PersistedIngestJobPageStatus = 'pending' | 'completed' | 'failed';

export interface PersistedIngestJobPageCheckpoint {
  pageNumber: number;
  classification: PdfPageClassification | null;
  sourceKind: 'pdf-page' | 'raster-image';
  weight: number;
  status: PersistedIngestJobPageStatus;
  attempts: number;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  downgraded?: boolean;
  ocrTextHint?: string;
  ocrSource?: 'native-text' | 'pdfjs-text' | 'local-ocr' | 'vision-ocr' | 'vision-visual' | 'glm-ocr' | 'none';
  ocrWarnings?: string[];
  evidenceCache?: GeotechDocumentPageEvidenceCacheAudit;
  result?: unknown;
}

export interface PersistedIngestJobResultRecord {
  ingestResult: BoreholeDocumentIngestResult | GeotechDocumentIngestResult;
  persistedReview?: {
    datasetName: string;
    reviewId: string;
    createdAt?: string;
  };
}

export interface PersistedIngestJobRecord {
  kind: 'geotech-ingest-job-record';
  schemaVersion: 1;
  jobId: string;
  documentType: PersistedIngestJobDocumentType;
  status: PersistedIngestJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  source: {
    filePath: string;
    fileName: string;
    inputKind: 'pdf';
    totalPages: number;
    weightedPageCost: number;
    originalFilePath?: string;
    originalFileName?: string;
    pageRange?: [number, number];
  };
  config: {
    provider: LLMConfig['provider'];
    baseUrl?: string;
    modelId?: string;
    visionModelId?: string;
    timeout?: number;
  };
  processing: {
    pagePreprocessingConcurrency: number;
    chunkExtractionConcurrency: number;
  };
  request: {
    projectId?: string;
    overrideBoreholeId?: string;
    reviewTitle?: string;
  };
  segmentation?: IngestSegmentationSummary;
  inspection: PdfDocumentInspection | null;
  execution: {
    runCount: number;
    pid?: number;
    lastHeartbeatAt?: string;
    lastError?: string;
    cancelRequested?: boolean;
  };
  checkpoints: {
    pages: PersistedIngestJobPageCheckpoint[];
  };
  result?: PersistedIngestJobResultRecord;
}

export interface CreatePersistedIngestJobOptions {
  documentType: PersistedIngestJobDocumentType;
  filePath: string;
  inspection?: PdfDocumentInspection | null;
  totalPagesFallback?: number;
  config: Pick<LLMConfig, 'provider' | 'baseUrl' | 'modelId' | 'visionModelId' | 'timeout'>;
  projectId?: string;
  overrideBoreholeId?: string;
  reviewTitle?: string;
  originalFilePath?: string;
  originalFileName?: string;
  pageRange?: [number, number];
  segmentation?: IngestSegmentationSummary;
  now?: () => Date;
}

const JOB_SCHEMA_VERSION = 1;
const PAGE_PREPROCESSING_CONCURRENCY = 2;
const STALE_HEARTBEAT_FLOOR_MS = 10 * 60 * 1000;

function nowIso(now?: () => Date): string {
  return (now ?? (() => new Date()))().toISOString();
}

function getConfigRoot(): string {
  return process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli');
}

function getIngestJobsDir(): string {
  const dir = join(getConfigRoot(), 'ingest-jobs');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sanitizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function buildTimestampToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9tz]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildJobId(filePath: string, createdAt: string): string {
  const fileToken = sanitizeToken(basename(filePath)) || 'document';
  return `ingest-job-${buildTimestampToken(createdAt)}-${fileToken}`;
}

function getJobDir(jobId: string): string {
  return join(getIngestJobsDir(), sanitizeToken(jobId) || jobId);
}

function getJobRecordPath(jobId: string): string {
  return join(getJobDir(jobId), 'job.json');
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = dirname(filePath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(value, null, 2);
  writeFileSync(tempPath, serialized, 'utf-8');

  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
      throw error;
    }

    // Windows can reject the atomic rename when another process is briefly
    // reading the current job file; fall back to an in-place overwrite so the
    // async ingest worker can keep checkpointing progress.
    writeFileSync(filePath, serialized, 'utf-8');
    rmSync(tempPath, { force: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRatio(value: unknown): number | undefined {
  const parsed = asOptionalNumber(value);
  return parsed == null ? undefined : Math.max(0, Math.min(1, Math.round(parsed * 1000) / 1000));
}

function isPersistedIngestJobStatus(value: unknown): value is PersistedIngestJobStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'canceled';
}

function isPersistedIngestJobPageStatus(value: unknown): value is PersistedIngestJobPageStatus {
  return value === 'pending' || value === 'completed' || value === 'failed';
}

function normalizeEvidenceCacheAudit(value: unknown): GeotechDocumentPageEvidenceCacheAudit | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = asOptionalString(value.status);
  if (status !== 'hit' && status !== 'miss' && status !== 'stored' && status !== 'skipped') {
    return undefined;
  }

  const entryId = asOptionalString(value.entryId);
  const cacheKey = asOptionalString(value.cacheKey);
  const fileHash = asOptionalString(value.fileHash);
  const pageHash = asOptionalString(value.pageHash);
  const pageNumber = asOptionalNumber(value.pageNumber);
  const modelVersion = asOptionalString(value.modelVersion);
  const preprocessingVersion = asOptionalString(value.preprocessingVersion);
  const schemaVersion = asOptionalNumber(value.schemaVersion);
  if (
    !entryId
    || !cacheKey
    || !fileHash
    || !pageHash
    || pageNumber == null
    || !modelVersion
    || !preprocessingVersion
    || schemaVersion == null
  ) {
    return undefined;
  }

  return {
    status,
    entryId,
    cacheKey,
    fileHash,
    pageHash,
    pageNumber,
    modelVersion,
    preprocessingVersion,
    schemaVersion,
    createdAt: asOptionalString(value.createdAt),
    preprocessing: normalizePreprocessingMetadata(value.preprocessing),
    reason: asOptionalString(value.reason),
  };
}

function normalizePreprocessingMetadata(value: unknown): GeotechDocumentPageEvidenceCacheAudit['preprocessing'] {
  if (!isRecord(value)) {
    return undefined;
  }

  const schemaVersion = asOptionalNumber(value.schemaVersion);
  const pipelineVersion = asOptionalString(value.pipelineVersion);
  const policy = asOptionalString(value.policy);
  const transformed = typeof value.transformed === 'boolean' ? value.transformed : undefined;
  const input = normalizePreprocessingImageMetadata(value.input);
  const output = normalizePreprocessingImageMetadata(value.output);
  const quality = normalizePreprocessingQuality(value.quality);
  if (
    schemaVersion !== 1
    || !pipelineVersion
    || (policy !== 'none' && policy !== 'ocr-optimized')
    || transformed === undefined
    || !input
    || !output
  ) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    pipelineVersion,
    policy,
    transformed,
    input,
    output,
    operations: normalizeStringArray(value.operations),
    regions: normalizePreprocessingRegions(value.regions),
    ...(quality ? { quality } : {}),
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizePreprocessingImageMetadata(value: unknown): NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['input'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mimeType = asOptionalString(value.mimeType);
  const byteLength = asOptionalNumber(value.byteLength);
  if (!mimeType || byteLength == null || byteLength < 0) {
    return undefined;
  }

  const width = asOptionalNumber(value.width);
  const height = asOptionalNumber(value.height);
  return {
    mimeType,
    byteLength: Math.round(byteLength),
    ...(width != null ? { width: Math.round(width) } : {}),
    ...(height != null ? { height: Math.round(height) } : {}),
  };
}

function normalizePreprocessingRegions(value: unknown): NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['regions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['regions'] => {
    if (!isRecord(entry)) {
      return [];
    }
    const id = asOptionalString(entry.id);
    const label = asOptionalString(entry.label);
    const source = asOptionalString(entry.source);
    if (!id || !label || source !== 'preprocessing') {
      return [];
    }
    const bbox2d = normalizeBbox(entry.bbox2d);
    const coverageRatio = asOptionalNumber(entry.coverageRatio);
    const asset = normalizePreprocessingRegionAsset(entry.asset);
    const quality = normalizePreprocessingRegionQuality(entry.quality);
    return [{
      id,
      source: 'preprocessing',
      label,
      ...(bbox2d ? { bbox2d } : {}),
      ...(coverageRatio != null ? { coverageRatio: Math.max(0, Math.min(1, coverageRatio)) } : {}),
      ...(quality ? { quality } : {}),
      ...(asset ? { asset } : {}),
    }];
  });
}

function normalizePreprocessingRegionAsset(value: unknown): NonNullable<NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['regions'][number]['asset']> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mimeType = asOptionalString(value.mimeType);
  const byteLength = asOptionalNumber(value.byteLength);
  const sha256 = asOptionalString(value.sha256);
  if (!mimeType || byteLength == null || byteLength < 0 || !sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
    return undefined;
  }

  const width = asOptionalNumber(value.width);
  const height = asOptionalNumber(value.height);
  const cacheRelativePath = asOptionalString(value.cacheRelativePath);
  return {
    mimeType,
    byteLength: Math.round(byteLength),
    sha256: sha256.toLowerCase(),
    ...(width != null ? { width: Math.round(width) } : {}),
    ...(height != null ? { height: Math.round(height) } : {}),
    ...(typeof value.normalized === 'boolean' ? { normalized: value.normalized } : {}),
    ...(cacheRelativePath ? { cacheRelativePath } : {}),
  };
}

function normalizePreprocessingQuality(value: unknown): NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['quality'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const score = asRatio(value.score);
  const contentCoverageRatio = asRatio(value.contentCoverageRatio);
  const darkPixelRatio = asRatio(value.darkPixelRatio);
  const regionCoverageRatio = asRatio(value.regionCoverageRatio);
  const regionCount = asOptionalNumber(value.regionCount);
  const cropAssetCount = asOptionalNumber(value.cropAssetCount);
  const deskew = normalizePreprocessingDeskew(value.deskew);
  if (
    score == null
    || contentCoverageRatio == null
    || darkPixelRatio == null
    || regionCoverageRatio == null
    || regionCount == null
    || cropAssetCount == null
    || !deskew
  ) {
    return undefined;
  }
  return {
    score,
    contentCoverageRatio,
    darkPixelRatio,
    regionCoverageRatio,
    regionCount: Math.max(0, Math.round(regionCount)),
    cropAssetCount: Math.max(0, Math.round(cropAssetCount)),
    deskew,
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizePreprocessingDeskew(value: unknown): NonNullable<NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['quality']>['deskew'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const method = asOptionalString(value.method);
  const angleDeg = asOptionalNumber(value.angleDeg);
  const confidence = asRatio(value.confidence);
  const applied = typeof value.applied === 'boolean' ? value.applied : undefined;
  if (method !== 'projection-profile' || angleDeg == null || confidence == null || applied === undefined) {
    return undefined;
  }
  return {
    method,
    angleDeg: Math.round(angleDeg * 100) / 100,
    confidence,
    applied,
  };
}

function normalizePreprocessingRegionQuality(value: unknown): NonNullable<GeotechDocumentPageEvidenceCacheAudit['preprocessing']>['regions'][number]['quality'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const score = asRatio(value.score);
  const darkPixelRatio = asRatio(value.darkPixelRatio);
  const lineDensity = asRatio(value.lineDensity);
  const coverageRatio = asRatio(value.coverageRatio);
  if (score == null || darkPixelRatio == null || lineDensity == null || coverageRatio == null) {
    return undefined;
  }
  return {
    score,
    darkPixelRatio,
    lineDensity,
    coverageRatio,
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizeBbox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const numbers = value.map((item) => asOptionalNumber(item));
  return numbers.every((item) => item != null)
    ? numbers as [number, number, number, number]
    : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.flatMap((item) => {
    const normalized = asOptionalString(item);
    return normalized ? [normalized] : [];
  }))];
}

function normalizePageCheckpoint(value: unknown, index: number, now: string): PersistedIngestJobPageCheckpoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const pageNumber = asOptionalNumber(value.pageNumber);
  const classification = asOptionalString(value.classification) as PdfPageClassification | undefined;
  const sourceKind = asOptionalString(value.sourceKind);
  const weight = asOptionalNumber(value.weight);
  const status = value.status;
  if (
    pageNumber == null
    || !Number.isInteger(pageNumber)
    || !isPersistedIngestJobPageStatus(status)
    || weight == null
    || (sourceKind !== 'pdf-page' && sourceKind !== 'raster-image')
  ) {
    return null;
  }

  return {
    pageNumber,
    classification: classification ?? null,
    sourceKind,
    weight,
    status,
    attempts: asOptionalNumber(value.attempts) ?? 0,
    updatedAt: asOptionalString(value.updatedAt) ?? now,
    completedAt: asOptionalString(value.completedAt),
    error: asOptionalString(value.error),
    downgraded: value.downgraded === true,
    ocrTextHint: asOptionalString(value.ocrTextHint),
    ocrSource: (asOptionalString(value.ocrSource) as PersistedIngestJobPageCheckpoint['ocrSource']) ?? undefined,
    ocrWarnings: Array.isArray(value.ocrWarnings)
      ? value.ocrWarnings.flatMap((item) => {
          const normalized = asOptionalString(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    evidenceCache: normalizeEvidenceCacheAudit(value.evidenceCache),
    result: value.result,
  };
}

function normalizeTuplePageRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }

  const startPage = asOptionalNumber(value[0]);
  const endPage = asOptionalNumber(value[1]);
  if (
    startPage == null
    || endPage == null
    || !Number.isInteger(startPage)
    || !Number.isInteger(endPage)
    || startPage < 1
    || endPage < startPage
  ) {
    return undefined;
  }

  return [startPage, endPage];
}

function normalizeSegmentationSegments(value: unknown): IngestSegmentSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((segment): IngestSegmentSummary[] => {
    if (!isRecord(segment)) {
      return [];
    }
    const startPage = asOptionalNumber(segment.startPage);
    const endPage = asOptionalNumber(segment.endPage);
    const pageCount = asOptionalNumber(segment.pageCount);
    const effectivePageCost = asOptionalNumber(segment.effectivePageCost);
    const segmentIndex = asOptionalNumber(segment.segmentIndex);
    const segmentCount = asOptionalNumber(segment.segmentCount);
    if (
      startPage == null
      || endPage == null
      || pageCount == null
      || effectivePageCost == null
      || segmentIndex == null
      || segmentCount == null
    ) {
      return [];
    }

    return [{
      startPage,
      endPage,
      pageCount,
      effectivePageCost,
      segmentIndex,
      segmentCount,
      childJobId: asOptionalString(segment.childJobId),
      status: isPersistedIngestJobStatus(segment.status) ? segment.status : undefined,
      completedPages: asOptionalNumber(segment.completedPages),
      failedPages: asOptionalNumber(segment.failedPages),
      durationMs: asOptionalNumber(segment.durationMs),
    }];
  });
}

function normalizeSegmentationSummary(value: unknown): IngestSegmentationSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mode = asOptionalString(value.mode) as IngestSegmentationMode | undefined;
  const pageRange = normalizeTuplePageRange(value.pageRange);
  if (!mode || !pageRange || (mode !== 'single' && mode !== 'segmented-parent' && mode !== 'segment-child')) {
    return undefined;
  }

  return {
    mode,
    pageRange,
    effectivePageLimit: asOptionalNumber(value.effectivePageLimit),
    segmentCount: asOptionalNumber(value.segmentCount),
    segmentIndex: asOptionalNumber(value.segmentIndex),
    parentJobId: asOptionalString(value.parentJobId),
    segments: normalizeSegmentationSegments(value.segments),
  };
}

function resolvePdfTotalPagesFallback(
  filePath: string,
  explicitFallback?: number,
  pageRange?: [number, number],
): number {
  const scopedFallback =
    explicitFallback != null && Number.isInteger(explicitFallback) && explicitFallback > 0
      ? explicitFallback
      : 0;
  if (scopedFallback > 0) {
    return pageRange
      ? Math.min(scopedFallback, Math.max(0, pageRange[1] - pageRange[0] + 1))
      : scopedFallback;
  }

  try {
    const inferred = inferPdfDocumentPageCountFallback(filePath);
    if (!Number.isInteger(inferred) || inferred <= 0) {
      return 0;
    }
    return pageRange
      ? Math.max(0, Math.min(inferred, pageRange[1]) - pageRange[0] + 1)
      : inferred;
  } catch {
    return 0;
  }
}

function buildFallbackPageCheckpoints(
  pageCount: number,
  timestamp: string,
  pageRange?: [number, number],
): PersistedIngestJobPageCheckpoint[] {
  const startPage = pageRange?.[0] ?? 1;
  return Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: startPage + index,
    classification: null,
    sourceKind: 'pdf-page',
    weight: 1,
    status: 'pending',
    attempts: 0,
    updatedAt: timestamp,
  }));
}

function normalizePersistedIngestJobRecord(value: unknown): PersistedIngestJobRecord | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-job-record' || value.schemaVersion !== JOB_SCHEMA_VERSION) {
    return null;
  }

  const now = new Date().toISOString();
  const jobId = asOptionalString(value.jobId);
  const documentType = asOptionalString(value.documentType) as PersistedIngestJobDocumentType | undefined;
  const status = value.status;
  const createdAt = asOptionalString(value.createdAt);
  const updatedAt = asOptionalString(value.updatedAt);
  const source = isRecord(value.source) ? value.source : null;
  const config = isRecord(value.config) ? value.config : null;
  const processing = isRecord(value.processing) ? value.processing : null;
  const request = isRecord(value.request) ? value.request : {};
  const execution = isRecord(value.execution) ? value.execution : {};
  const checkpoints = isRecord(value.checkpoints) ? value.checkpoints : null;

  if (
    !jobId
    || (documentType !== 'borehole-log' && documentType !== 'geotech-document')
    || !isPersistedIngestJobStatus(status)
    || !createdAt
    || !updatedAt
    || !source
    || !config
    || !processing
    || !checkpoints
  ) {
    return null;
  }

  const filePath = asOptionalString(source.filePath);
  const fileName = asOptionalString(source.fileName);
  const inputKind = asOptionalString(source.inputKind);
  const totalPages = asOptionalNumber(source.totalPages);
  const weightedPageCost = asOptionalNumber(source.weightedPageCost);
  if (!filePath || !fileName || inputKind !== 'pdf' || totalPages == null || weightedPageCost == null) {
    return null;
  }

  const pages = Array.isArray(checkpoints.pages)
    ? checkpoints.pages
      .map((page, index) => normalizePageCheckpoint(page, index, now))
      .filter((page): page is PersistedIngestJobPageCheckpoint => page !== null)
      .sort((left, right) => left.pageNumber - right.pageNumber)
    : [];

  return {
    kind: 'geotech-ingest-job-record',
    schemaVersion: JOB_SCHEMA_VERSION,
    jobId,
    documentType,
    status,
    createdAt,
    updatedAt,
    startedAt: asOptionalString(value.startedAt),
    completedAt: asOptionalString(value.completedAt),
    canceledAt: asOptionalString(value.canceledAt),
    source: {
      filePath,
      fileName,
      inputKind: 'pdf',
      totalPages,
      weightedPageCost,
      originalFilePath: asOptionalString(source.originalFilePath),
      originalFileName: asOptionalString(source.originalFileName),
      pageRange: normalizeTuplePageRange(source.pageRange),
    },
    config: {
      provider: (asOptionalString(config.provider) as LLMConfig['provider']) ?? 'hosted-beta',
      baseUrl: asOptionalString(config.baseUrl),
      modelId: asOptionalString(config.modelId),
      visionModelId: asOptionalString(config.visionModelId),
      timeout: asOptionalNumber(config.timeout),
    },
    processing: {
      pagePreprocessingConcurrency: asOptionalNumber(processing.pagePreprocessingConcurrency) ?? PAGE_PREPROCESSING_CONCURRENCY,
      chunkExtractionConcurrency: asOptionalNumber(processing.chunkExtractionConcurrency) ?? 2,
    },
    request: {
      projectId: asOptionalString(request.projectId),
      overrideBoreholeId: asOptionalString(request.overrideBoreholeId),
      reviewTitle: asOptionalString(request.reviewTitle),
    },
    segmentation: normalizeSegmentationSummary(value.segmentation),
    inspection: isRecord(value.inspection) ? (value.inspection as unknown as PdfDocumentInspection) : null,
    execution: {
      runCount: asOptionalNumber(execution.runCount) ?? 0,
      pid: asOptionalNumber(execution.pid),
      lastHeartbeatAt: asOptionalString(execution.lastHeartbeatAt),
      lastError: asOptionalString(execution.lastError),
      cancelRequested: execution.cancelRequested === true,
    },
    checkpoints: {
      pages,
    },
    result: isRecord(value.result)
      ? {
          ingestResult: value.result.ingestResult as PersistedIngestJobResultRecord['ingestResult'],
          persistedReview: isRecord(value.result.persistedReview)
            ? {
                datasetName: asOptionalString(value.result.persistedReview.datasetName) ?? '',
                reviewId: asOptionalString(value.result.persistedReview.reviewId) ?? '',
                createdAt: asOptionalString(value.result.persistedReview.createdAt),
              }
            : undefined,
        }
      : undefined,
  };
}

export function computeWeightedPdfPageCost(inspection: PdfDocumentInspection | null | undefined): number {
  if (!inspection || inspection.pages.length === 0) {
    return 0;
  }

  return inspection.pages.reduce((sum, page) => sum + pageWeightForClassification(page.classification), 0);
}

export function shouldUseAsyncIngestJob(
  inspection: PdfDocumentInspection | null | undefined,
  totalPagesFallback?: number,
): boolean {
  const totalPages = inspection?.totalPages ?? totalPagesFallback ?? 0;
  const weightedPageCost = inspection ? computeWeightedPdfPageCost(inspection) : totalPages;
  return totalPages > 5 || weightedPageCost > 5;
}

export function resolvePersistedIngestJobExtractionConcurrency(
  config: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>,
  inspection?: PdfDocumentInspection | null,
  segmentation?: IngestSegmentationSummary,
): number {
  if (segmentation?.mode === 'segmented-parent' || segmentation?.mode === 'segment-child') {
    return 1;
  }

  if (config.provider === 'hosted-beta' && inspection) {
    const totalPages = Math.max(inspection.totalPages, inspection.pages.length);
    const visualPageCount = inspection.pages.filter((page) =>
      page.classification === 'image-only'
      || page.classification === 'text-unreadable'
      || page.classification === 'graphics-only',
    ).length;
    const weightedPageCost = computeWeightedPdfPageCost(inspection);
    const hasMixedVisualLoad = visualPageCount > 0 && visualPageCount < totalPages;
    const hasLongMixedVisualPressure =
      hasMixedVisualLoad
      && (
        (totalPages >= 10 && visualPageCount >= 3)
        || (totalPages >= 16 && visualPageCount >= 2)
        || (totalPages >= 24 && visualPageCount >= 1)
        || (weightedPageCost >= 18 && visualPageCount >= 2)
      );

    if (
      visualPageCount >= Math.max(2, Math.ceil(totalPages / 2))
      || hasLongMixedVisualPressure
    ) {
      return 1;
    }
  }

  const provider = config.provider;
  const visionModel = config.visionModelId?.toLowerCase() ?? '';
  const model = config.modelId?.toLowerCase() ?? '';
  const advertisesSafeMultimodalSupport =
    provider !== 'hosted-beta'
    && (
      provider === 'zhipu'
      || /qwen|internvl|glm|qvq/.test(visionModel)
      || /qwen|internvl|glm|qvq/.test(model)
    );

  return advertisesSafeMultimodalSupport ? 3 : 2;
}

export function createPersistedIngestJob(
  options: CreatePersistedIngestJobOptions,
): PersistedIngestJobRecord {
  const createdAt = nowIso(options.now);
  const resolvedFilePath = resolve(options.filePath);
  const jobId = buildJobId(resolvedFilePath, createdAt);
  const rawInspection = options.inspection && options.inspection.totalPages > 0 ? options.inspection : null;
  const pageRange = options.pageRange;
  const inspection = rawInspection && pageRange
    ? {
        ...rawInspection,
        totalPages: rawInspection.pages.filter((page) => page.pageNumber >= pageRange[0] && page.pageNumber <= pageRange[1]).length,
        pages: rawInspection.pages.filter((page) => page.pageNumber >= pageRange[0] && page.pageNumber <= pageRange[1]),
      }
    : rawInspection;
  const fallbackTotalPages = resolvePdfTotalPagesFallback(
    resolvedFilePath,
    options.totalPagesFallback,
    pageRange,
  );
  const totalPages = inspection && inspection.totalPages > 0
    ? inspection.totalPages
    : fallbackTotalPages;
  if (totalPages <= 0) {
    throw new Error(
      `Cannot create persisted ingest job for "${resolvedFilePath}" because the PDF page count could not be determined.`,
    );
  }
  const weightedPageCost = inspection && inspection.totalPages > 0 ? computeWeightedPdfPageCost(inspection) : totalPages;
  const record: PersistedIngestJobRecord = {
    kind: 'geotech-ingest-job-record',
    schemaVersion: JOB_SCHEMA_VERSION,
    jobId,
    documentType: options.documentType,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    source: {
      filePath: resolvedFilePath,
      fileName: basename(resolvedFilePath),
      inputKind: 'pdf',
      totalPages,
      weightedPageCost,
      originalFilePath: options.originalFilePath?.trim() || undefined,
      originalFileName: options.originalFileName?.trim() || undefined,
      pageRange: options.pageRange,
    },
    config: {
      provider: options.config.provider,
      baseUrl: options.config.baseUrl,
      modelId: options.config.modelId,
      visionModelId: options.config.visionModelId,
      timeout: options.config.timeout,
    },
    processing: {
      pagePreprocessingConcurrency: PAGE_PREPROCESSING_CONCURRENCY,
      chunkExtractionConcurrency: resolvePersistedIngestJobExtractionConcurrency(options.config, inspection, options.segmentation),
    },
    request: {
      projectId: options.projectId?.trim() || undefined,
      overrideBoreholeId: options.overrideBoreholeId?.trim() || undefined,
      reviewTitle: options.reviewTitle?.trim() || undefined,
    },
    segmentation: options.segmentation,
    inspection,
    execution: {
      runCount: 0,
      cancelRequested: false,
    },
    checkpoints: {
      pages: inspection && inspection.totalPages > 0 ? inspection.pages.map((page) => ({
        pageNumber: page.pageNumber,
        classification: page.classification,
        sourceKind: page.classification === 'image-only' || page.classification === 'text-unreadable' ? 'raster-image' : 'pdf-page',
        weight: pageWeightForClassification(page.classification),
        status: 'pending',
        attempts: 0,
        updatedAt: createdAt,
      })) : buildFallbackPageCheckpoints(totalPages, createdAt, pageRange),
    },
  };

  atomicWriteJson(getJobRecordPath(jobId), record);
  return record;
}

export function buildPersistedIngestJobSegments(
  inspection: PdfDocumentInspection,
  options?: {
    pageRange?: PdfPageRange;
    effectivePageLimit?: number;
  },
): PdfSegmentRange[] {
  return buildHostedBetaPdfSegments(
    inspection,
    options?.effectivePageLimit ?? HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
    options?.pageRange,
  );
}

export function shouldSegmentHostedBetaLongPdf(
  documentType: PersistedIngestJobDocumentType,
  config: Pick<LLMConfig, 'provider'>,
  inspection: PdfDocumentInspection | null | undefined,
  pageRange?: PdfPageRange,
): boolean {
  if (documentType !== 'geotech-document' || config.provider !== 'hosted-beta' || !inspection) {
    return false;
  }

  const scopedInspection = pageRange
    ? {
        ...inspection,
        totalPages: inspection.pages.filter((page) => page.pageNumber >= pageRange.startPage && page.pageNumber <= pageRange.endPage).length,
        pages: inspection.pages.filter((page) => page.pageNumber >= pageRange.startPage && page.pageNumber <= pageRange.endPage),
      }
    : inspection;

  return computeWeightedPdfPageCost(scopedInspection) > HOSTED_BETA_EFFECTIVE_PAGE_LIMIT;
}

export function loadPersistedIngestJob(jobId: string): PersistedIngestJobRecord | null {
  const filePath = getJobRecordPath(jobId);
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  return normalizePersistedIngestJobRecord(raw);
}

export function savePersistedIngestJob(record: PersistedIngestJobRecord): PersistedIngestJobRecord {
  atomicWriteJson(getJobRecordPath(record.jobId), record);
  return record;
}

export function updatePersistedIngestJob(
  jobId: string,
  updater: (record: PersistedIngestJobRecord) => PersistedIngestJobRecord,
): PersistedIngestJobRecord {
  const record = loadPersistedIngestJob(jobId);
  if (!record) {
    throw new Error(`No persisted ingest job named "${jobId}" was found.`);
  }

  const updated = updater(record);
  return savePersistedIngestJob(updated);
}

export function failPersistedIngestJob(
  jobId: string,
  message: string,
  options?: {
    now?: () => Date;
  },
): PersistedIngestJobRecord {
  return updatePersistedIngestJob(jobId, (record) => {
    if (isPersistedIngestJobTerminalStatus(record.status)) {
      return record;
    }

    const timestamp = nowIso(options?.now);
    return {
      ...record,
      status: 'failed',
      updatedAt: timestamp,
      execution: {
        ...record.execution,
        pid: undefined,
        lastHeartbeatAt: timestamp,
        lastError: message,
      },
    };
  });
}

export function isPersistedIngestJobTerminalStatus(status: PersistedIngestJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

export function isPersistedIngestJobProcessAlive(pid?: number): boolean {
  if (pid == null || !Number.isFinite(pid)) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolvePersistedIngestJobStaleHeartbeatMs(record: PersistedIngestJobRecord): number {
  const configuredTimeoutMs = Math.max(0, record.config.timeout ?? 0);
  return Math.max(STALE_HEARTBEAT_FLOOR_MS, configuredTimeoutMs * 6);
}

function isPersistedIngestJobHeartbeatStale(
  record: PersistedIngestJobRecord,
  options?: { now?: () => Date },
): boolean {
  const lastHeartbeatAt = record.execution.lastHeartbeatAt;
  if (!lastHeartbeatAt) {
    return false;
  }

  const lastHeartbeatMs = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(lastHeartbeatMs)) {
    return false;
  }

  return (options?.now?.() ?? new Date()).getTime() - lastHeartbeatMs > resolvePersistedIngestJobStaleHeartbeatMs(record);
}

function getIngestJobChildScriptPath(): string {
  return fileURLToPath(new URL('./ingest-job-child.js', import.meta.url));
}

export function startPersistedIngestJob(
  jobId: string,
  options?: { now?: () => Date },
): PersistedIngestJobRecord {
  const current = loadPersistedIngestJob(jobId);
  if (!current) {
    throw new Error(`No persisted ingest job named "${jobId}" was found.`);
  }

  if (current.status === 'completed') {
    return current;
  }

  const alive = isPersistedIngestJobProcessAlive(current.execution.pid);
  const staleHeartbeat = isPersistedIngestJobHeartbeatStale(current, options);
  if (current.status === 'running' && alive && !staleHeartbeat) {
    return current;
  }

  if (current.status === 'running' && alive && staleHeartbeat && current.execution.pid) {
    try {
      process.kill(current.execution.pid);
    } catch {
      // no-op: if the process exits between checks we can proceed normally.
    }
  }

  const childScript = getIngestJobChildScriptPath();
  if (!existsSync(childScript)) {
    throw new Error(`Ingest job child runner was not found at ${childScript}. Build @geotechcli/core before launching background ingest jobs.`);
  }

  const timestamp = nowIso(options?.now);
  const primed = updatePersistedIngestJob(jobId, (record) => ({
    ...record,
    status: 'running',
    startedAt: record.startedAt ?? timestamp,
    updatedAt: timestamp,
    canceledAt: undefined,
    execution: {
      ...record.execution,
      runCount: record.execution.runCount + 1,
      pid: undefined,
      lastHeartbeatAt: timestamp,
      lastError: undefined,
      cancelRequested: false,
    },
  }));

  const child = spawn(
    process.execPath,
    [childScript, jobId],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.unref();

  return updatePersistedIngestJob(jobId, (record) => {
    if (
      isPersistedIngestJobTerminalStatus(record.status)
      || record.execution.runCount !== primed.execution.runCount
    ) {
      return record;
    }

    return {
      ...record,
      updatedAt: nowIso(options?.now),
      execution: {
        ...record.execution,
        pid: child.pid,
        lastHeartbeatAt: record.execution.lastHeartbeatAt ?? timestamp,
      },
    };
  });
}

export function createAndStartPersistedIngestJob(
  options: CreatePersistedIngestJobOptions,
): PersistedIngestJobRecord {
  const created = createPersistedIngestJob(options);
  return startPersistedIngestJob(created.jobId, { now: options.now });
}

export function resumePersistedIngestJob(
  jobId: string,
  options?: { now?: () => Date },
): PersistedIngestJobRecord {
  const current = loadPersistedIngestJob(jobId);
  if (!current) {
    throw new Error(`No persisted ingest job named "${jobId}" was found.`);
  }

  const failedCheckpoints = current.checkpoints.pages.filter((page) => page.status === 'failed');
  if (current.status === 'completed' && failedCheckpoints.length === 0) {
    return current;
  }

  const alive = isPersistedIngestJobProcessAlive(current.execution.pid);
  const staleHeartbeat = isPersistedIngestJobHeartbeatStale(current, options);
  if (current.status === 'running' && alive && !staleHeartbeat) {
    return current;
  }

  if (current.status === 'running' && alive && staleHeartbeat && current.execution.pid) {
    try {
      process.kill(current.execution.pid);
    } catch {
      // no-op: if the process exits between checks we can proceed normally.
    }
  }

  updatePersistedIngestJob(jobId, (record) => ({
    ...record,
    status: 'queued',
    updatedAt: nowIso(options?.now),
    completedAt: failedCheckpoints.length > 0 ? undefined : record.completedAt,
    canceledAt: undefined,
    result: failedCheckpoints.length > 0 ? undefined : record.result,
    execution: {
      ...record.execution,
      cancelRequested: false,
      lastError: undefined,
      pid: undefined,
    },
    checkpoints: {
      pages: record.checkpoints.pages.map((page) =>
        page.status === 'failed'
          ? {
              ...page,
              status: 'pending',
              updatedAt: nowIso(options?.now),
              completedAt: undefined,
              error: undefined,
              downgraded: false,
              result: undefined,
            }
          : page
      ),
    },
  }));

  return startPersistedIngestJob(jobId, options);
}

export function cancelPersistedIngestJob(
  jobId: string,
  options?: { now?: () => Date },
): PersistedIngestJobRecord {
  const current = loadPersistedIngestJob(jobId);
  if (!current) {
    throw new Error(`No persisted ingest job named "${jobId}" was found.`);
  }

  if (current.status === 'completed') {
    return current;
  }

  if (isPersistedIngestJobProcessAlive(current.execution.pid)) {
    try {
      process.kill(current.execution.pid!);
    } catch {
      // no-op: the persisted state still reflects cancellation
    }
  }

  return updatePersistedIngestJob(jobId, (record) => {
    const timestamp = nowIso(options?.now);
    return {
      ...record,
      status: 'canceled',
      updatedAt: timestamp,
      canceledAt: timestamp,
      execution: {
        ...record.execution,
        pid: undefined,
        cancelRequested: true,
      },
    };
  });
}

export async function waitForPersistedIngestJob(
  jobId: string,
  options?: {
    pollMs?: number;
    timeoutMs?: number;
  },
): Promise<PersistedIngestJobRecord> {
  const pollMs = Math.max(250, options?.pollMs ?? 1000);
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 0);
  const start = Date.now();

  while (true) {
    const record = loadPersistedIngestJob(jobId);
    if (!record) {
      throw new Error(`No persisted ingest job named "${jobId}" was found.`);
    }

    if (isPersistedIngestJobTerminalStatus(record.status)) {
      return record;
    }

    if (record.status === 'running' && record.execution.pid && !isPersistedIngestJobProcessAlive(record.execution.pid)) {
      throw new Error(`Persisted ingest job "${jobId}" is no longer running. Resume it with geotech ingest resume ${jobId}.`);
    }

    if (record.status === 'running' && record.execution.pid && isPersistedIngestJobHeartbeatStale(record)) {
      throw new Error(`Persisted ingest job "${jobId}" stopped heartbeating and may be wedged. Resume it with geotech ingest resume ${jobId}.`);
    }

    if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
      throw new Error(`Timed out while waiting for persisted ingest job "${jobId}".`);
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }
}

export function loadPersistedIngestJobResult(jobId: string): PersistedIngestJobResultRecord | null {
  return loadPersistedIngestJob(jobId)?.result ?? null;
}

export function deletePersistedIngestJob(jobId: string): void {
  const dir = getJobDir(jobId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

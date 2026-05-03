import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { buildLLMConfig } from '../config/index.js';
import type { LLMConfig } from '../llm/types.js';
import { countDocumentPdfPages, readDocumentPdfPageInputs } from './document-inputs.js';
import {
  extractPrimaryPdfPageImages,
  inferPdfDocumentPageCountFallback,
  inspectPdfDocument,
  type PdfDocumentInspection,
  type PdfPageClassification,
} from './pdf.js';
import {
  ingestBoreholeLogDocument,
  summarizeBoreholeIngestInspection,
  type BoreholeDocumentIngestResult,
  type BoreholeIngestFinding,
  type BoreholeVisionPageInput,
} from './geotech-extract.js';
import {
  buildPreflightLowYieldInsight,
  ingestGeotechDocument,
  inferPreflightLowYieldPageRole,
  type GeotechDocumentFinding,
  type GeotechDocumentIngestResult,
  type GeotechDocumentPageInput,
} from './geotech-document.js';
import {
  extractGeotechDocumentDeterministicFactsFromText,
  extractGeotechDocumentFactsFromText,
  interpretGeotechDocumentPage,
  type GeotechDocumentContext,
  type GeotechDocumentInsight,
} from '../vision/geotech-document.js';
import {
  interpretBoreholeLogWithContext,
  transcribeDocumentImageText,
  type BoreholeInterpretation,
  type BoreholeLogContext,
} from '../vision/index.js';
import { recoverDocumentTextHint } from '../vision/ocr.js';
import { persistBoreholeIngestReview } from './review-store.js';
import {
  buildPersistedIngestJobSegments,
  createPersistedIngestJob,
  loadPersistedIngestJob,
  resolvePersistedIngestJobExtractionConcurrency,
  savePersistedIngestJob,
  type PersistedIngestJobDocumentType,
  type PersistedIngestJobPageCheckpoint,
  type PersistedIngestJobRecord,
} from './job-store.js';
import {
  HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
  slicePdfInspectionToRange,
  writePdfPageSubset,
  type IngestSegmentSummary,
  type IngestSegmentationSummary,
  type PdfPageRange,
} from './segmentation.js';

type PersistedIngestResult = BoreholeDocumentIngestResult | GeotechDocumentIngestResult;

export interface PersistedIngestJobWorkerDependencies {
  inspectPdfDocument?: typeof inspectPdfDocument;
  extractPrimaryPdfPageImages?: typeof extractPrimaryPdfPageImages;
  readDocumentPdfPageInputs?: typeof readDocumentPdfPageInputs;
  interpretBoreholeLogWithContext?: typeof interpretBoreholeLogWithContext;
  recoverDocumentTextHint?: typeof recoverDocumentTextHint;
  transcribeDocumentImageText?: typeof transcribeDocumentImageText;
  interpretGeotechDocumentPage?: typeof interpretGeotechDocumentPage;
  extractGeotechDocumentFactsFromText?: typeof extractGeotechDocumentFactsFromText;
  extractGeotechDocumentDeterministicFactsFromText?: typeof extractGeotechDocumentDeterministicFactsFromText;
  persistReview?: typeof persistBoreholeIngestReview;
  buildLLMConfig?: typeof buildLLMConfig;
  now?: () => Date;
  stopAfterNewPages?: number;
}

interface PreparedPdfPageInputBase {
  pageNumber: number;
  totalPages: number;
  sourceKind: 'pdf-page' | 'raster-image';
  base64: string;
  mimeType: string;
  fileBytes: number;
}

type PreparedBoreholePageInput = BoreholeVisionPageInput & PreparedPdfPageInputBase;
type PreparedGeotechPageInput = GeotechDocumentPageInput & PreparedPdfPageInputBase;

interface BoreholeProcessingState {
  currentGroupBoreholeId: string | null;
  hasCurrentGroup: boolean;
  lastResolvedBoreholeId?: string;
  priorContinuationDepth: number | null;
}

const SLOW_VISUAL_ERROR_PATTERNS = [
  /timeout/i,
  /\b524\b/i,
  /upstream(?: request)? (?:timed out|timeout|failed)/i,
  /provider is busy/i,
  /returned no content/i,
  /did not contain assistant text/i,
  /no completion choices/i,
  /empty completion/i,
  /temporarily unavailable/i,
  /\b503\b/i,
  /\b504\b/i,
];

const RETRYABLE_UPSTREAM_ERROR_PATTERNS = [
  /timeout/i,
  /\b524\b/i,
  /upstream(?: request)? (?:timed out|timeout|failed)/i,
  /provider is busy/i,
  /temporarily unavailable/i,
  /\b503\b/i,
  /\b504\b/i,
];

const FATAL_PROVIDER_STOP_PATTERNS = [
  /daily limit reached/i,
  /remaining today:\s*0/i,
  /insufficient[_\s-]?quota/i,
  /quota exceeded/i,
  /rate limit/i,
  /\b429\b/i,
];

const VISUAL_TAIL_RUN_MIN_PAGES = 3;
const VISUAL_TAIL_RUN_SLOW_FAILURE_THRESHOLD = 2;

function nowIso(now?: () => Date): string {
  return (now ?? (() => new Date()))().toISOString();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function getJobSourceDisplayPath(job: PersistedIngestJobRecord): string {
  return job.source.originalFilePath ?? job.source.filePath;
}

function getJobSourceDisplayName(job: PersistedIngestJobRecord): string {
  return job.source.originalFileName ?? basename(getJobSourceDisplayPath(job));
}

function cloneSegmentationSummary(segmentation: IngestSegmentationSummary | undefined): IngestSegmentationSummary | undefined {
  if (!segmentation) {
    return undefined;
  }

  return {
    ...segmentation,
    pageRange: [...segmentation.pageRange] as [number, number],
    segments: segmentation.segments?.map((segment) => ({ ...segment })),
  };
}

function buildJobResultSource(
  job: PersistedIngestJobRecord,
  counts: { successfulPages: number; failedPages: number },
): {
  filePath: string;
  fileName: string;
  inputKind: 'pdf';
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  pageRange?: [number, number];
  segmentation?: IngestSegmentationSummary;
} {
  return {
    filePath: getJobSourceDisplayPath(job),
    fileName: getJobSourceDisplayName(job),
    inputKind: 'pdf',
    totalPages: job.source.totalPages,
    successfulPages: counts.successfulPages,
    failedPages: counts.failedPages,
    pageRange: job.source.pageRange,
    segmentation: cloneSegmentationSummary(job.segmentation),
  };
}

function remapPageReferenceText(message: string | undefined, localPageNumber: number, originalPageNumber: number): string | undefined {
  if (!message) {
    return undefined;
  }

  return message
    .replace(new RegExp(`\\bPage ${localPageNumber}\\b`, 'g'), `Page ${originalPageNumber}`)
    .replace(new RegExp(`\\bpage ${localPageNumber}\\b`, 'g'), `page ${originalPageNumber}`);
}

function remapChildGeotechInsightToOriginalPage(
  insight: GeotechDocumentInsight,
  localPageNumber: number,
  originalPageNumber: number,
  parentTotalPages: number,
): GeotechDocumentInsight {
  return {
    ...insight,
    pageNumber: originalPageNumber,
    totalPages: parentTotalPages,
    warnings: uniqueStrings(insight.warnings.map((warning) => remapPageReferenceText(warning, localPageNumber, originalPageNumber))),
  };
}

function updateSegmentSummaryStatus(
  segmentation: IngestSegmentationSummary | undefined,
  segmentIndex: number,
  patch: Partial<IngestSegmentSummary>,
): IngestSegmentationSummary | undefined {
  if (!segmentation?.segments) {
    return segmentation;
  }

  return {
    ...segmentation,
    segments: segmentation.segments.map((segment) =>
      segment.segmentIndex === segmentIndex
        ? {
            ...segment,
            ...patch,
          }
        : segment
    ),
  };
}

function getIngestJobArtifactsRoot(): string {
  return process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli');
}

function getSegmentArtifactsDir(parentJobId: string): string {
  return join(getIngestJobArtifactsRoot(), 'ingest-jobs', parentJobId, 'segments');
}

function getJobScopedPageRange(job: PersistedIngestJobRecord): PdfPageRange {
  const [startPage, endPage] = job.source.pageRange ?? job.segmentation?.pageRange ?? [1, job.source.totalPages];
  return {
    startPage,
    endPage,
  };
}

function getJobOriginalTotalPages(job: PersistedIngestJobRecord): number {
  return Math.max(job.source.totalPages, job.source.pageRange?.[1] ?? 0, job.segmentation?.pageRange?.[1] ?? 0);
}

function filterPageInputsToSelectedPages(
  pageInputs: PreparedPdfPageInputBase[],
  selectedPageNumbers: number[],
): PreparedPdfPageInputBase[] {
  const selected = new Set(selectedPageNumbers);
  return pageInputs.filter((pageInput) => selected.has(pageInput.pageNumber));
}

function countCheckpointStatuses(
  pages: PersistedIngestJobPageCheckpoint[],
  range: PdfPageRange,
): { completedPages: number; failedPages: number } {
  let completedPages = 0;
  let failedPages = 0;

  for (const page of pages) {
    if (page.pageNumber < range.startPage || page.pageNumber > range.endPage) {
      continue;
    }
    if (page.status === 'completed') {
      completedPages += 1;
    } else if (page.status === 'failed') {
      failedPages += 1;
    }
  }

  return { completedPages, failedPages };
}

function isSegmentResolved(job: PersistedIngestJobRecord, range: PdfPageRange): boolean {
  return job.checkpoints.pages
    .filter((page) => page.pageNumber >= range.startPage && page.pageNumber <= range.endPage)
    .every((page) => page.status !== 'pending');
}

function remapSegmentCheckpointError(
  message: string | undefined,
  localPageNumber: number,
  originalPageNumber: number,
): string | undefined {
  const normalized = normalizeCheckpointErrorMessage(message ?? '');
  return remapPageReferenceText(normalized, localPageNumber, originalPageNumber);
}

function mergeSegmentChildJobIntoParentJob(
  parentJob: PersistedIngestJobRecord,
  childJob: PersistedIngestJobRecord,
  range: PdfPageRange,
  now?: () => Date,
): PersistedIngestJobRecord {
  const timestamp = nowIso(now);
  const originalTotalPages = getJobOriginalTotalPages(parentJob);

  return {
    ...parentJob,
    updatedAt: timestamp,
    execution: {
      ...parentJob.execution,
      lastHeartbeatAt: timestamp,
    },
    checkpoints: {
      pages: parentJob.checkpoints.pages.map((pageCheckpoint) => {
        if (pageCheckpoint.pageNumber < range.startPage || pageCheckpoint.pageNumber > range.endPage) {
          return pageCheckpoint;
        }

        const localPageNumber = pageCheckpoint.pageNumber - range.startPage + 1;
        const childCheckpoint = childJob.checkpoints.pages.find((page) => page.pageNumber === localPageNumber);

        if (!childCheckpoint || childCheckpoint.status === 'pending') {
          return {
            ...pageCheckpoint,
            status: 'failed',
            updatedAt: timestamp,
            error: `Page ${pageCheckpoint.pageNumber} did not complete within segment ${range.startPage}-${range.endPage}.`,
            downgraded: false,
          };
        }

        const remappedResult =
          parentJob.documentType === 'geotech-document'
          && childCheckpoint.status === 'completed'
          && childCheckpoint.result
            ? remapChildGeotechInsightToOriginalPage(
                childCheckpoint.result as GeotechDocumentInsight,
                localPageNumber,
                pageCheckpoint.pageNumber,
                originalTotalPages,
              )
            : childCheckpoint.result;

        return {
          ...pageCheckpoint,
          status: childCheckpoint.status,
          attempts: Math.max(pageCheckpoint.attempts, childCheckpoint.attempts),
          updatedAt: timestamp,
          completedAt: childCheckpoint.completedAt,
          error: remapSegmentCheckpointError(childCheckpoint.error, localPageNumber, pageCheckpoint.pageNumber),
          downgraded: childCheckpoint.downgraded,
          ocrTextHint: childCheckpoint.ocrTextHint,
          ocrSource: childCheckpoint.ocrSource,
          ocrWarnings: childCheckpoint.ocrWarnings,
          result: remappedResult,
        };
      }),
    },
  };
}

async function runSegmentedParentGeotechJob(
  jobId: string,
  currentJob: PersistedIngestJobRecord,
  mutateJob: (mutator: (job: PersistedIngestJobRecord) => PersistedIngestJobRecord) => Promise<void>,
  config: LLMConfig,
  dependencies: PersistedIngestJobWorkerDependencies,
): Promise<PersistedIngestJobRecord> {
  const effectivePageLimit =
    currentJob.segmentation?.effectivePageLimit
    ?? HOSTED_BETA_EFFECTIVE_PAGE_LIMIT;
  const scopedRange = getJobScopedPageRange(currentJob);
  const baseInspection = currentJob.inspection;
  if (!baseInspection) {
    throw new Error('Segmented parent ingest requires PDF inspection metadata.');
  }

  const baseSegments: IngestSegmentSummary[] = currentJob.segmentation?.segments?.length
    ? currentJob.segmentation.segments
    : buildPersistedIngestJobSegments(baseInspection, {
        pageRange: scopedRange,
        effectivePageLimit,
      }).map((segment, index, allSegments) => ({
        ...segment,
        segmentIndex: index + 1,
        segmentCount: allSegments.length,
        status: 'queued' as const,
      }));

  if (!currentJob.segmentation?.segments?.length) {
    await mutateJob((job) => ({
      ...job,
      updatedAt: nowIso(dependencies.now),
      segmentation: {
        mode: 'segmented-parent',
        pageRange: [scopedRange.startPage, scopedRange.endPage],
        effectivePageLimit,
        segmentCount: baseSegments.length,
        segments: baseSegments,
      },
    }));
    currentJob = loadPersistedIngestJob(jobId) ?? currentJob;
  }

  const segmentArtifactsDir = getSegmentArtifactsDir(jobId);

  for (const segment of currentJob.segmentation?.segments ?? baseSegments) {
    if (isCancelled(jobId)) {
      break;
    }

    currentJob = loadPersistedIngestJob(jobId) ?? currentJob;
    const latestSegment = currentJob.segmentation?.segments?.find((entry) => entry.segmentIndex === segment.segmentIndex) ?? segment;
    const range = {
      startPage: latestSegment.startPage,
      endPage: latestSegment.endPage,
    };

    if (isSegmentResolved(currentJob, range) && latestSegment.status === 'completed') {
      continue;
    }

    const packetPath = join(
      segmentArtifactsDir,
      `segment-${String(latestSegment.segmentIndex).padStart(2, '0')}-pages-${range.startPage}-${range.endPage}.pdf`,
    );
    await writePdfPageSubset(getJobSourceDisplayPath(currentJob), range, packetPath);

    const childInspection = slicePdfInspectionToRange(baseInspection, range, { rebasePageNumbers: true });
    if (!childInspection) {
      throw new Error(`Unable to create a scoped inspection for segment ${latestSegment.segmentIndex}.`);
    }

    let childJob = latestSegment.childJobId ? loadPersistedIngestJob(latestSegment.childJobId) : null;
    if (!childJob || childJob.status === 'failed' || childJob.status === 'canceled') {
      childJob = createPersistedIngestJob({
        documentType: currentJob.documentType,
        filePath: packetPath,
        inspection: childInspection,
        config: currentJob.config,
        overrideBoreholeId: currentJob.request.overrideBoreholeId,
        originalFilePath: getJobSourceDisplayPath(currentJob),
        originalFileName: getJobSourceDisplayName(currentJob),
        segmentation: {
          mode: 'segment-child',
          pageRange: [range.startPage, range.endPage],
          effectivePageLimit,
          segmentCount: currentJob.segmentation?.segmentCount ?? baseSegments.length,
          segmentIndex: latestSegment.segmentIndex,
          parentJobId: currentJob.jobId,
        },
        now: dependencies.now,
      });
    }

    const startedAt = Date.now();
    await mutateJob((job) => ({
      ...job,
      updatedAt: nowIso(dependencies.now),
      execution: {
        ...job.execution,
        lastHeartbeatAt: nowIso(dependencies.now),
      },
      segmentation: updateSegmentSummaryStatus(job.segmentation, latestSegment.segmentIndex, {
        childJobId: childJob.jobId,
        status: 'running',
      }),
    }));

    const completedChild = await runPersistedIngestJobWorker(childJob.jobId, dependencies);
    const durationMs = Date.now() - startedAt;

    await mutateJob((job) => {
      const mergedJob = mergeSegmentChildJobIntoParentJob(job, completedChild, range, dependencies.now);
      const counts = countCheckpointStatuses(mergedJob.checkpoints.pages, range);
      const childStatus =
        completedChild.status === 'completed'
          ? 'completed'
          : completedChild.status === 'canceled'
            ? 'canceled'
            : 'failed';

      return {
        ...mergedJob,
        segmentation: updateSegmentSummaryStatus(mergedJob.segmentation, latestSegment.segmentIndex, {
          childJobId: completedChild.jobId,
          status: childStatus,
          completedPages: counts.completedPages,
          failedPages: counts.failedPages,
          durationMs,
        }),
      };
    });
  }

  currentJob = loadPersistedIngestJob(jobId) ?? currentJob;
  if (currentJob.execution.cancelRequested) {
    await mutateJob((job) => ({
      ...job,
      status: 'canceled',
      updatedAt: nowIso(dependencies.now),
      canceledAt: nowIso(dependencies.now),
      execution: {
        ...job.execution,
        pid: undefined,
      },
    }));
    return loadPersistedIngestJob(jobId) ?? currentJob;
  }

  const replayPageInputs = filterPageInputsToSelectedPages(
    await preparePdfPageInputs(
      currentJob.source.filePath,
      null,
      currentJob.processing.pagePreprocessingConcurrency,
      dependencies,
    ),
    currentJob.checkpoints.pages.map((page) => page.pageNumber),
  );

  const finalResult = await finalizeJobResult(currentJob, replayPageInputs, config, dependencies);
  const persistedReview = currentJob.request.projectId
    ? (dependencies.persistReview ?? persistBoreholeIngestReview)(currentJob.request.projectId, finalResult, {
        title: currentJob.request.reviewTitle,
      })
    : null;

  await mutateJob((job) => ({
    ...job,
    status: 'completed',
    updatedAt: nowIso(dependencies.now),
    completedAt: nowIso(dependencies.now),
    execution: {
      ...job.execution,
      pid: undefined,
      lastHeartbeatAt: nowIso(dependencies.now),
    },
    result: {
      ingestResult: finalResult,
      persistedReview: persistedReview
        ? {
            datasetName: persistedReview.datasetName,
            reviewId: persistedReview.reviewId,
            createdAt: persistedReview.createdAt,
          }
        : undefined,
    },
  }));

  return loadPersistedIngestJob(jobId) ?? currentJob;
}

function isBoreholeResult(result: PersistedIngestResult): result is BoreholeDocumentIngestResult {
  return result.documentType === 'borehole-log';
}

function normalizeTextHint(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 1600) : undefined;
}

function mapPageSourceKind(classification: PdfPageClassification | null | undefined): 'pdf-page' | 'raster-image' {
  return classification === 'image-only' || classification === 'text-unreadable' ? 'raster-image' : 'pdf-page';
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  iterator: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (values.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, values.length));
  const results = new Array<R>(values.length);
  let cursor = 0;

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await iterator(values[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}

function pageTextHintLooksBoreholeLike(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return (
    /\bborehole\b/i.test(value)
    || /\bBH[-\s_/]?\d+\b/i.test(value)
    || /\bTP[-\s_/]?\d+\b/i.test(value)
    || /\bCPT[-\s_/]?\d+\b/i.test(value)
    || /\bSPT\b/i.test(value)
    || /\b(?:easting|northing|latitude|longitude|groundwater)\b/i.test(value)
    || /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*m\b/i.test(value)
  );
}

function normalizeKnownBoreholeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === 'BH-unknown') {
    return null;
  }

  return trimmed;
}

function minimumLayerDepth(result: BoreholeInterpretation): number | null {
  let minDepth: number | null = null;

  for (const layer of result.layers) {
    const candidates = [layer.depthFrom, layer.depthTo].filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
    for (const candidate of candidates) {
      minDepth = minDepth == null ? candidate : Math.min(minDepth, candidate);
    }
  }

  return minDepth;
}

function hasUsableBoreholeSignal(result: BoreholeInterpretation, detectedBoreholeId: string | null): boolean {
  return (
    detectedBoreholeId != null
    || result.layers.length > 0
    || result.totalDepth != null
    || result.waterTableDepth != null
    || result.location != null
    || result.groundElevation != null
    || result.dateDrilled != null
    || result.drillingMethod != null
  );
}

function shouldIgnoreNonLogPage(
  result: BoreholeInterpretation,
  detectedBoreholeId: string | null,
  pageTextHint: string | undefined,
): boolean {
  return (
    !hasUsableBoreholeSignal(result, detectedBoreholeId)
    && !pageTextHintLooksBoreholeLike(pageTextHint)
  );
}

function shouldStartNewAnonymousGroup(
  result: BoreholeInterpretation,
  state: BoreholeProcessingState,
): boolean {
  const currentStartDepth = minimumLayerDepth(result);

  return (
    state.hasCurrentGroup
    && state.priorContinuationDepth != null
    && state.priorContinuationDepth >= 3
    && currentStartDepth != null
    && currentStartDepth <= 0.5
  );
}

function advanceBoreholeProcessingState(
  state: BoreholeProcessingState,
  result: BoreholeInterpretation,
  pageTextHint: string | undefined,
  overrideBoreholeId?: string,
): BoreholeProcessingState {
  const next: BoreholeProcessingState = { ...state };
  const detectedBoreholeId = normalizeKnownBoreholeId(result.boreholeId);
  if (shouldIgnoreNonLogPage(result, detectedBoreholeId, pageTextHint)) {
    return next;
  }

  if (overrideBoreholeId) {
    next.hasCurrentGroup = true;
    next.currentGroupBoreholeId = overrideBoreholeId;
  } else if (!next.hasCurrentGroup) {
    next.hasCurrentGroup = true;
    next.currentGroupBoreholeId = detectedBoreholeId;
  } else if (
    detectedBoreholeId
    && next.currentGroupBoreholeId
    && detectedBoreholeId !== next.currentGroupBoreholeId
  ) {
    next.currentGroupBoreholeId = detectedBoreholeId;
  } else if (!detectedBoreholeId && shouldStartNewAnonymousGroup(result, next)) {
    next.currentGroupBoreholeId = null;
  } else if (detectedBoreholeId && !next.currentGroupBoreholeId) {
    next.currentGroupBoreholeId = detectedBoreholeId;
  }

  next.hasCurrentGroup = true;
  if (detectedBoreholeId && !overrideBoreholeId) {
    next.currentGroupBoreholeId = detectedBoreholeId;
  }

  next.lastResolvedBoreholeId = overrideBoreholeId ?? next.currentGroupBoreholeId ?? undefined;
  next.priorContinuationDepth = result.continuationDepth ?? null;
  return next;
}

function isSlowVisualPageError(message: string, classification: PdfPageClassification | null | undefined, sourceKind: string): boolean {
  const looksVisual = sourceKind === 'raster-image' || isVisualRunClassification(classification);
  return looksVisual && SLOW_VISUAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isVisualRunClassification(classification: PdfPageClassification | null | undefined): boolean {
  return classification === 'image-only' || classification === 'text-unreadable' || classification === 'graphics-only';
}

function isVisualRunCheckpoint(page: PersistedIngestJobPageCheckpoint): boolean {
  return page.sourceKind === 'raster-image' || isVisualRunClassification(page.classification);
}

function getInspectionLeadText(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
): string {
  if (!inspectionPage) {
    return '';
  }

  return uniqueStrings([
    ...(inspectionPage.normalizedArtifact?.headingHints ?? []),
    inspectionPage.normalizedArtifact?.nativeText,
    inspectionPage.normalizedText,
  ])
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasBoreholeAppendixCue(text: string): boolean {
  return /\b(record of boreholes?|borehole logs?|borehole records?|test pits?|cpt|cone penetration|standard penetration test|spt)\b/i.test(text);
}

function hasVisualAppendixCue(text: string): boolean {
  return (
    /\bappendix\b/i.test(text)
    && /\b(figures?|plates?|photos?|photographs?|drawings?|plans?|sketches?|site layout|certificates?|laboratory)\b/i.test(text)
    && !hasBoreholeAppendixCue(text)
  );
}

function findConsecutiveVisualRun(
  job: PersistedIngestJobRecord,
  pageNumber: number,
): PersistedIngestJobPageCheckpoint[] {
  const pages = [...job.checkpoints.pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const centerIndex = pages.findIndex((page) => page.pageNumber === pageNumber);
  if (centerIndex < 0 || !isVisualRunCheckpoint(pages[centerIndex]!)) {
    return [];
  }

  let startIndex = centerIndex;
  while (startIndex > 0 && isVisualRunCheckpoint(pages[startIndex - 1]!)) {
    startIndex -= 1;
  }

  let endIndex = centerIndex;
  while (endIndex + 1 < pages.length && isVisualRunCheckpoint(pages[endIndex + 1]!)) {
    endIndex += 1;
  }

  return pages.slice(startIndex, endIndex + 1);
}

function hasNearbyVisualAppendixCue(job: PersistedIngestJobRecord, runStartPage: number): boolean {
  if (!job.inspection) {
    return false;
  }

  const firstCandidatePage = Math.max(1, runStartPage - 3);
  for (let pageNumber = firstCandidatePage; pageNumber <= runStartPage; pageNumber += 1) {
    const inspectionPage = job.inspection.pages.find((page) => page.pageNumber === pageNumber);
    if (hasVisualAppendixCue(getInspectionLeadText(inspectionPage))) {
      return true;
    }
  }

  return false;
}

function isTailOrAppendixVisualRun(
  job: PersistedIngestJobRecord,
  run: PersistedIngestJobPageCheckpoint[],
): boolean {
  if (run.length < VISUAL_TAIL_RUN_MIN_PAGES) {
    return false;
  }

  const startPage = run[0]!.pageNumber;
  const endPage = run[run.length - 1]!.pageNumber;
  const totalPages = Math.max(job.source.totalPages, job.inspection?.totalPages ?? 0);
  const touchesTail =
    totalPages > 0
    && endPage >= totalPages
    && startPage >= Math.max(2, Math.ceil(totalPages * 0.55));

  return touchesTail || hasNearbyVisualAppendixCue(job, startPage);
}

function applyConsecutiveVisualRunDowngrades(
  job: PersistedIngestJobRecord,
  triggerPageNumber: number,
  now?: () => Date,
): PersistedIngestJobRecord {
  const run = findConsecutiveVisualRun(job, triggerPageNumber);
  if (!isTailOrAppendixVisualRun(job, run)) {
    return job;
  }

  const slowFailureCount = run.filter((page) =>
    page.status === 'failed'
    && page.downgraded
    && isSlowVisualPageError(page.error ?? '', page.classification, page.sourceKind)
  ).length;
  if (slowFailureCount < VISUAL_TAIL_RUN_SLOW_FAILURE_THRESHOLD) {
    return job;
  }

  const pendingPageNumbers = new Set(
    run
      .filter((page) => page.status === 'pending' && page.pageNumber > triggerPageNumber)
      .map((page) => page.pageNumber),
  );
  if (pendingPageNumbers.size === 0) {
    return job;
  }

  const timestamp = nowIso(now);
  return {
    ...job,
    updatedAt: timestamp,
    checkpoints: {
      pages: job.checkpoints.pages.map((page) =>
        pendingPageNumbers.has(page.pageNumber)
          ? {
              ...page,
              status: 'failed',
              updatedAt: timestamp,
              error: `Skipped page ${page.pageNumber} after ${slowFailureCount} slow visual failures in a consecutive image-only tail/appendix run.`,
              downgraded: true,
            }
          : page
      ),
    },
  };
}

function isRetryableUpstreamPageError(message: string): boolean {
  return RETRYABLE_UPSTREAM_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isFatalProviderStopError(message: string): boolean {
  return FATAL_PROVIDER_STOP_PATTERNS.some((pattern) => pattern.test(message));
}

function isTextExtractionTimeoutError(message: string): boolean {
  return (
    /text extraction timed out/i.test(message)
    || (
      /hosted beta request timed out|timed out after \d+s/i.test(message)
      && !/\b524\b|upstream request failed/i.test(message)
    )
  );
}

function normalizeCheckpointErrorMessage(message: string): string {
  let normalized = message.trim();
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const updated = normalized.replace(/^Page \d+:\s*/i, '').trim();
    if (updated === normalized) {
      break;
    }
    normalized = updated;
  }
  return normalized;
}

async function waitForCheckpointRetryBackoff(attempt: number): Promise<void> {
  const delayMs = Math.min(1000, 100 * Math.max(1, 2 ** Math.max(0, attempt - 1)));
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, delayMs);
    timer.unref?.();
  });
}

async function withWorkerPageTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
      timer.unref?.();
    }),
  ]);
}

function resolveWorkerPhaseTimeoutMs(
  config: LLMConfig,
  input: {
    classification?: PdfPageClassification | null;
    sourceKind?: string | null;
  },
  options?: {
    cheapRetry?: boolean;
  },
): number {
  const baseTimeoutMs = Math.min(Math.max(config.timeout ?? 120000, 60000), 120000);
  const isHeavyVisualPage =
    input.sourceKind === 'raster-image'
    || input.classification === 'image-only'
    || input.classification === 'text-unreadable';

  const phaseTimeoutMs = isHeavyVisualPage
    ? Math.min(Math.max(baseTimeoutMs, 180000), 180000)
    : baseTimeoutMs;

  return options?.cheapRetry
    ? Math.min(phaseTimeoutMs, isHeavyVisualPage ? 60000 : 90000)
    : phaseTimeoutMs;
}

function resolveWorkerTextExtractionTimeoutMs(
  baseTimeoutMs: number,
  textHint: string | undefined,
): number {
  if (!textHint) {
    return baseTimeoutMs;
  }

  if (textHint.length >= 1800) {
    return Math.min(Math.max(baseTimeoutMs, 150000), 180000);
  }

  if (textHint.length >= 1000) {
    return Math.max(baseTimeoutMs, 120000);
  }

  return baseTimeoutMs;
}

function shouldPreferDirectGeotechVisualExtraction(input: {
  config: LLMConfig;
  pageInput: PreparedGeotechPageInput;
  inspectionPage?: PdfDocumentInspection['pages'][number];
  textHint?: string | null;
}): boolean {
  if (input.config.provider !== 'hosted-beta') {
    return false;
  }

  const hasAcceptedText =
    typeof input.textHint === 'string'
    && input.textHint.trim().length >= 24
    && (input.inspectionPage?.normalizedArtifact?.textQuality.accepted ?? false);
  if (hasAcceptedText) {
    return false;
  }

  return input.pageInput.sourceKind === 'raster-image'
    && (
      input.inspectionPage?.classification === 'image-only'
      || input.inspectionPage?.classification === 'graphics-only'
      || input.inspectionPage?.classification === 'text-unreadable'
    );
}

async function preparePdfPageInputs(
  filePath: string,
  inspection: PdfDocumentInspection | null,
  concurrency: number,
  dependencies: Pick<PersistedIngestJobWorkerDependencies, 'extractPrimaryPdfPageImages' | 'readDocumentPdfPageInputs'> = {},
): Promise<PreparedPdfPageInputBase[]> {
  const readPageInputs = dependencies.readDocumentPdfPageInputs ?? readDocumentPdfPageInputs;
  const normalizedPageInputs = await readPageInputs(filePath, {
    inspection,
    dependencies: {
      extractPageImages: dependencies.extractPrimaryPdfPageImages,
    },
  });

  return mapWithConcurrency(normalizedPageInputs, concurrency, async (page) => ({
    base64: page.base64,
    mimeType: page.mimeType,
    fileBytes: page.fileBytes,
    pageNumber: page.pageNumber,
    totalPages: page.totalPages,
    sourceKind: page.sourceKind ?? 'pdf-page',
  }));
}

function buildInspectionSummary(inspection: PdfDocumentInspection | null | undefined): GeotechDocumentIngestResult['inspectionSummary'] {
  if (!inspection) {
    return null;
  }

  const pageClassificationCounts: Partial<Record<PdfPageClassification, number>> = {};
  let imageHeavyPageCount = 0;
  let nativeTextPageCount = 0;
  let degradedPageCount = 0;

  for (const page of inspection.pages) {
    pageClassificationCounts[page.classification] = (pageClassificationCounts[page.classification] ?? 0) + 1;
    if (page.classification === 'image-only' || page.classification === 'text-unreadable') {
      imageHeavyPageCount += 1;
    }
    if (page.capabilities.nativeTextExtraction !== 'unavailable') {
      nativeTextPageCount += 1;
    }
    if (page.degradation.level !== 'none') {
      degradedPageCount += 1;
    }
  }

  return {
    pageClassificationCounts,
    imageHeavyPageCount,
    nativeTextPageCount,
    degradedPageCount,
    ocrRecoveredPageCount: 0,
  };
}

function countCheckpointOcrRecoveredPages(checkpoints: PersistedIngestJobPageCheckpoint[]): number {
  return checkpoints.filter((page) =>
    page.ocrSource === 'local-ocr'
    || page.ocrSource === 'vision-ocr'
    || page.ocrSource === 'glm-ocr'
  ).length;
}

function applyCheckpointOcrRecoveredSummary<T extends PersistedIngestResult>(
  result: T,
  checkpoints: PersistedIngestJobPageCheckpoint[],
): T {
  const recoveredPageCount = countCheckpointOcrRecoveredPages(checkpoints);
  if (recoveredPageCount === 0 || !result.inspectionSummary) {
    return result;
  }

  return {
    ...result,
    inspectionSummary: {
      ...result.inspectionSummary,
      ocrRecoveredPageCount: Math.max(result.inspectionSummary.ocrRecoveredPageCount, recoveredPageCount),
    },
  };
}

function buildFallbackWorkerCheckpoints(
  job: PersistedIngestJobRecord,
  pageCount: number,
  timestamp: string,
): PersistedIngestJobPageCheckpoint[] {
  if (job.checkpoints.pages.length > 0) {
    return job.checkpoints.pages;
  }

  const startPage = job.source.pageRange?.[0] ?? job.segmentation?.pageRange?.[0] ?? 1;
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

async function inferWorkerPdfPageCount(job: PersistedIngestJobRecord): Promise<number> {
  if (job.source.totalPages > 0) {
    return job.source.totalPages;
  }

  try {
    const fullPageCount = await countDocumentPdfPages(job.source.filePath);
    return job.source.pageRange
      ? Math.max(0, Math.min(fullPageCount, job.source.pageRange[1]) - job.source.pageRange[0] + 1)
      : fullPageCount;
  } catch {
    try {
      const fullPageCount = inferPdfDocumentPageCountFallback(job.source.filePath);
      return job.source.pageRange
        ? Math.max(0, Math.min(fullPageCount, job.source.pageRange[1]) - job.source.pageRange[0] + 1)
        : fullPageCount;
    } catch {
      return 0;
    }
  }
}

function summarizeReviewReasons(findings: Array<{ severity: 'advisory' | 'review' | 'blocking'; message: string }>): string[] {
  return uniqueStrings(
    findings
      .filter((finding) => finding.severity !== 'advisory')
      .map((finding) => finding.message),
  );
}

function buildSyntheticBoreholeResult(job: PersistedIngestJobRecord, inspection: PdfDocumentInspection | null, now?: () => Date): BoreholeDocumentIngestResult {
  const pageFailures = job.checkpoints.pages
    .filter((page) => page.status === 'failed')
    .map((page) => page.error ?? `Page ${page.pageNumber} failed during async ingest.`);
  const downgradedPages = job.checkpoints.pages.filter((page) => page.status === 'failed' && page.downgraded);
  const normalFailedPages = job.checkpoints.pages.filter((page) => page.status === 'failed' && !page.downgraded);
  const reviewFindings: BoreholeIngestFinding[] = [
    ...job.checkpoints.pages
      .filter((page) => page.status === 'failed')
      .map((page) => ({
        code: page.downgraded ? 'page_visual_ingest_downgraded' : 'page_ingest_failed',
        severity: page.downgraded ? 'review' as const : 'blocking' as const,
        scope: 'page' as const,
        message: page.downgraded
          ? `Page ${page.pageNumber} exceeded the slow visual budget and was downgraded to manual review.`
          : page.error ?? `Page ${page.pageNumber} failed during ingest.`,
        pageNumber: page.pageNumber,
      })),
  ];

  if (downgradedPages.length > 0) {
    reviewFindings.push({
      code: 'slow_visual_pages_present',
      severity: 'review',
      scope: 'document',
      message: `${downgradedPages.length} slow visual page(s) were downgraded to manual review.`,
    });
  }

  if (normalFailedPages.length > 0) {
    reviewFindings.push({
      code: 'page_failures_present',
      severity: 'blocking',
      scope: 'document',
      message: `${normalFailedPages.length} page(s) failed during ingest and should be reviewed.`,
    });
  }

  return applyCheckpointOcrRecoveredSummary({
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: nowIso(now),
    source: buildJobResultSource(job, {
      successfulPages: 0,
      failedPages: pageFailures.length,
    }),
    inspection,
    inspectionSummary: summarizeBoreholeIngestInspection(inspection),
    boreholes: [],
    pageAudits: job.checkpoints.pages.map((page) => ({
      pageNumber: page.pageNumber,
      detectedBoreholeId: null,
      assignedGroup: 'unassigned',
      classification: page.classification,
      textHintSource: page.ocrSource ?? 'none',
      parseStatus: page.status === 'completed' ? 'partial' : 'failed',
      confidence: 0,
      continuationDepth: null,
      warnings: page.error ? [page.error] : [],
    })),
    pageFailures,
    warnings: uniqueStrings(pageFailures),
    reviewFindings,
    reviewReasons: summarizeReviewReasons(reviewFindings),
    reviewRequired: reviewFindings.some((finding) => finding.severity !== 'advisory'),
    confidence: 0,
    canAutoProceed: false,
  }, job.checkpoints.pages);
}

function buildSyntheticGeotechDocumentResult(
  job: PersistedIngestJobRecord,
  inspection: PdfDocumentInspection | null,
  now?: () => Date,
): GeotechDocumentIngestResult {
  const pageFailures = job.checkpoints.pages
    .filter((page) => page.status === 'failed')
    .map((page) => page.error ?? `Page ${page.pageNumber} failed during async ingest.`);
  const downgradedPages = job.checkpoints.pages.filter((page) => page.status === 'failed' && page.downgraded);
  const normalFailedPages = job.checkpoints.pages.filter((page) => page.status === 'failed' && !page.downgraded);
  const reviewFindings: GeotechDocumentFinding[] = [
    ...job.checkpoints.pages
      .filter((page) => page.status === 'failed')
      .map((page) => ({
        code: page.downgraded ? 'page_visual_ingest_downgraded' : 'page_ingest_failed',
        severity: page.downgraded ? 'review' as const : 'blocking' as const,
        scope: 'page' as const,
        message: page.downgraded
          ? `Page ${page.pageNumber} exceeded the slow visual budget and was downgraded to manual review.`
          : page.error ?? `Page ${page.pageNumber} failed during ingest.`,
        pageNumber: page.pageNumber,
      })),
  ];

  if (downgradedPages.length > 0) {
    reviewFindings.push({
      code: 'slow_visual_pages_present',
      severity: 'review',
      scope: 'document',
      message: `${downgradedPages.length} slow visual page(s) were downgraded to manual review.`,
    });
  }

  if (normalFailedPages.length > 0) {
    reviewFindings.push({
      code: 'page_failures_present',
      severity: 'blocking',
      scope: 'document',
      message: `${normalFailedPages.length} page(s) failed during ingest and should be reviewed.`,
    });
  }

  return applyCheckpointOcrRecoveredSummary({
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'geotech-document',
    generatedAt: nowIso(now),
    source: buildJobResultSource(job, {
      successfulPages: 0,
      failedPages: pageFailures.length,
    }),
    inspection,
    inspectionSummary: buildInspectionSummary(inspection),
    documentClass: null,
    title: null,
    summary: null,
    materials: [],
    classifications: [],
    parameters: [],
    risks: [],
    recommendations: [],
    pageAudits: job.checkpoints.pages.map((page) => ({
      pageNumber: page.pageNumber,
      classification: page.classification,
      textHintSource: page.ocrSource ?? 'none',
      parseStatus: page.status === 'completed' ? 'partial' : 'failed',
      confidence: 0,
      materialCount: 0,
      classificationCount: 0,
      parameterCount: 0,
      warnings: page.error ? [page.error] : [],
    })),
    pageFailures,
    warnings: uniqueStrings(pageFailures),
    reviewFindings,
    reviewReasons: summarizeReviewReasons(reviewFindings),
    parseStatus: 'failed',
    confidence: 0,
    reviewRequired: reviewFindings.some((finding) => finding.severity !== 'advisory'),
    canAutoProceed: false,
  }, job.checkpoints.pages);
}

function dedupeReviewFindings<T extends { code: string; severity: string; scope: string; message: string; pageNumber?: number }>(
  reviewFindings: T[],
): T[] {
  return [
    ...new Map(
      reviewFindings.map((finding) => {
        const key = [
          finding.code,
          finding.severity,
          finding.scope,
          finding.message,
          finding.pageNumber ?? '',
          'boreholeId' in finding ? finding.boreholeId ?? '' : '',
          'materialDescription' in finding ? finding.materialDescription ?? '' : '',
        ].join('|');
        return [key, finding] as const;
      }),
    ).values(),
  ];
}

function applyBoreholeFailureDowngrades(
  result: BoreholeDocumentIngestResult,
  checkpoints: PersistedIngestJobPageCheckpoint[],
): BoreholeDocumentIngestResult {
  const downgradedPageNumbers = new Set(
    checkpoints
      .filter((page) => page.status === 'failed' && page.downgraded)
      .map((page) => page.pageNumber),
  );
  if (downgradedPageNumbers.size === 0) {
    return result;
  }

  const pageFailureCount = checkpoints.filter((page) => page.status === 'failed').length;
  const nonDowngradedFailureCount = checkpoints.filter((page) => page.status === 'failed' && !page.downgraded).length;
  const downgradedFailureCount = pageFailureCount - nonDowngradedFailureCount;

  const reviewFindings: BoreholeIngestFinding[] = result.reviewFindings.map((finding) => {
    if (
      finding.code === 'page_ingest_failed'
      && typeof finding.pageNumber === 'number'
      && downgradedPageNumbers.has(finding.pageNumber)
    ) {
      return {
        ...finding,
        code: 'page_visual_ingest_downgraded',
        severity: 'review' as const,
        message: `Page ${finding.pageNumber} exceeded the slow visual budget and was downgraded to manual review.`,
      };
    }

    if (finding.code === 'page_failures_present' && nonDowngradedFailureCount === 0) {
      return {
        ...finding,
        code: 'slow_visual_pages_present',
        severity: 'review' as const,
        message: `${downgradedFailureCount} slow visual page(s) were downgraded to manual review.`,
      };
    }

    return finding;
  });

  const nextReviewFindings = dedupeReviewFindings(reviewFindings);
  const reviewReasons = summarizeReviewReasons(nextReviewFindings);

  return {
    ...result,
    reviewFindings: nextReviewFindings,
    reviewReasons,
    reviewRequired: reviewReasons.length > 0,
    canAutoProceed: false,
  };
}

function applyGeotechFailureDowngrades(
  result: GeotechDocumentIngestResult,
  checkpoints: PersistedIngestJobPageCheckpoint[],
): GeotechDocumentIngestResult {
  const downgradedPageNumbers = new Set(
    checkpoints
      .filter((page) => page.status === 'failed' && page.downgraded)
      .map((page) => page.pageNumber),
  );
  if (downgradedPageNumbers.size === 0) {
    return result;
  }

  const pageFailureCount = checkpoints.filter((page) => page.status === 'failed').length;
  const nonDowngradedFailureCount = checkpoints.filter((page) => page.status === 'failed' && !page.downgraded).length;
  const downgradedFailureCount = pageFailureCount - nonDowngradedFailureCount;

  const reviewFindings: GeotechDocumentFinding[] = result.reviewFindings.map((finding) => {
    if (
      finding.code === 'page_ingest_failed'
      && typeof finding.pageNumber === 'number'
      && downgradedPageNumbers.has(finding.pageNumber)
    ) {
      return {
        ...finding,
        code: 'page_visual_ingest_downgraded',
        severity: 'review' as const,
        message: `Page ${finding.pageNumber} exceeded the slow visual budget and was downgraded to manual review.`,
      };
    }

    if (finding.code === 'page_failures_present' && nonDowngradedFailureCount === 0) {
      return {
        ...finding,
        code: 'slow_visual_pages_present',
        severity: 'review' as const,
        message: `${downgradedFailureCount} slow visual page(s) were downgraded to manual review.`,
      };
    }

    return finding;
  });

  const nextReviewFindings = dedupeReviewFindings(reviewFindings);
  const reviewReasons = summarizeReviewReasons(nextReviewFindings);

  return {
    ...result,
    reviewFindings: nextReviewFindings,
    reviewReasons,
    reviewRequired: reviewReasons.length > 0,
    canAutoProceed: false,
  };
}

function buildJobConfig(
  job: PersistedIngestJobRecord,
  dependencies: Pick<PersistedIngestJobWorkerDependencies, 'buildLLMConfig'> = {},
): LLMConfig {
  const buildConfig = dependencies.buildLLMConfig ?? buildLLMConfig;
  const runtimeConfig = buildConfig();
  return {
    ...runtimeConfig,
    provider: job.config.provider,
    baseUrl: job.config.baseUrl ?? runtimeConfig.baseUrl,
    modelId: job.config.modelId ?? runtimeConfig.modelId,
    visionModelId: job.config.visionModelId ?? runtimeConfig.visionModelId,
    timeout: job.config.timeout ?? runtimeConfig.timeout,
  };
}

function findCheckpoint(job: PersistedIngestJobRecord, pageNumber: number): PersistedIngestJobPageCheckpoint {
  const checkpoint = job.checkpoints.pages.find((page) => page.pageNumber === pageNumber);
  if (!checkpoint) {
    throw new Error(`Persisted ingest job "${job.jobId}" is missing checkpoint metadata for page ${pageNumber}.`);
  }
  return checkpoint;
}

async function processGeotechDocumentPage(
  job: PersistedIngestJobRecord,
  pageInput: PreparedGeotechPageInput,
  config: LLMConfig,
  dependencies: PersistedIngestJobWorkerDependencies,
  options: {
    cheapRetry?: boolean;
  } = {},
): Promise<{
  result: GeotechDocumentInsight;
  ocrTextHint?: string;
  ocrSource?: PersistedIngestJobPageCheckpoint['ocrSource'];
  ocrWarnings?: string[];
}> {
  const inspect = dependencies.inspectPdfDocument ?? inspectPdfDocument;
  const recoverTextHint = dependencies.recoverDocumentTextHint ?? recoverDocumentTextHint;
  const interpretation = dependencies.interpretGeotechDocumentPage ?? interpretGeotechDocumentPage;
  const extractTextFacts = dependencies.extractGeotechDocumentFactsFromText ?? extractGeotechDocumentFactsFromText;
  const extractDeterministicFacts =
    dependencies.extractGeotechDocumentDeterministicFactsFromText
    ?? extractGeotechDocumentDeterministicFactsFromText;
  const transcribe = dependencies.transcribeDocumentImageText ?? transcribeDocumentImageText;
  const inspectionPage = job.inspection?.pages[pageInput.pageNumber - 1] ?? inspect(job.source.filePath).pages[pageInput.pageNumber - 1];
  const lowYieldRole = inferPreflightLowYieldPageRole({
    inspectionPage,
    previousInspectionPage: job.inspection?.pages[pageInput.pageNumber - 2],
    nextInspectionPage: job.inspection?.pages[pageInput.pageNumber],
    pageNumber: pageInput.pageNumber,
    totalPages: pageInput.totalPages,
    sourceKind: pageInput.sourceKind,
  });
  if (lowYieldRole && inspectionPage) {
    return {
      result: buildPreflightLowYieldInsight({
        role: lowYieldRole,
        inspectionPage,
        pageNumber: pageInput.pageNumber,
        totalPages: pageInput.totalPages,
      }),
      ocrTextHint: undefined,
      ocrSource: 'none',
      ocrWarnings: [
        lowYieldRole === 'administrative'
          ? 'Administrative/cover page was summarized without a full multimodal extraction call.'
          : 'Figure/appendix page was summarized without a full multimodal extraction call.',
      ],
    };
  }
  const phaseTimeoutMs = resolveWorkerPhaseTimeoutMs(config, {
    classification: inspectionPage?.classification,
    sourceKind: pageInput.sourceKind,
  }, {
    cheapRetry: options.cheapRetry,
  });
  const phaseConfig: LLMConfig = {
    ...config,
    timeout: phaseTimeoutMs,
  };
  const initialPageTextHint = inspectionPage?.normalizedArtifact?.nativeText ?? inspectionPage?.normalizedText;
  let pageTextHint: string | undefined;
  let ocrSource: PersistedIngestJobPageCheckpoint['ocrSource'] = 'none';
  let ocrWarnings: string[] = [];
  let textRecoveryAttempted = false;
  const directVisualPreferred = shouldPreferDirectGeotechVisualExtraction({
    config,
    pageInput,
    inspectionPage,
    textHint: initialPageTextHint,
  });
  if (directVisualPreferred) {
    ocrSource = 'vision-visual';
    ocrWarnings = ['Skipped OCR-only transcription and used direct visual extraction for an image-heavy hosted-beta page.'];
  }
  try {
    if (!directVisualPreferred) {
      textRecoveryAttempted = true;
      const recovery = await withWorkerPageTimeout(
        recoverTextHint({
          existingTextHint: initialPageTextHint,
          existingTextAccepted: inspectionPage?.normalizedArtifact?.textQuality.accepted ?? true,
          imageBase64: pageInput.base64,
          mimeType: pageInput.mimeType,
          config: phaseConfig,
          pdfFilePath: job.source.filePath,
          pdfPageNumber: pageInput.pageNumber,
          allowLayoutOcr: !(options.cheapRetry && pageInput.sourceKind === 'raster-image'),
          allowVisionOcr: !(options.cheapRetry && pageInput.sourceKind === 'raster-image'),
          visionTranscribe: transcribe,
        }),
        phaseTimeoutMs,
        `Page ${pageInput.pageNumber}: OCR/text recovery timed out after ${Math.round(phaseTimeoutMs / 1000)}s`,
      );
      pageTextHint = normalizeTextHint(recovery.textHint);
      ocrSource = recovery.source;
      ocrWarnings = recovery.warnings;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ocrWarnings = [
      `OCR/text recovery failed (${normalizeCheckpointErrorMessage(message)}); proceeded with direct page interpretation.`,
    ];
  }

  const context: GeotechDocumentContext = {
    pageNumber: pageInput.pageNumber,
    totalPages: pageInput.totalPages,
    pageClassification: inspectionPage?.classification,
    pageTextHint,
    textRecoveryAttempted: !pageTextHint && textRecoveryAttempted,
    directVisualPreferred,
  };
  const extractionTimeoutMs = resolveWorkerTextExtractionTimeoutMs(phaseTimeoutMs, pageTextHint);
  const extractionConfig: LLMConfig = {
    ...config,
    timeout: extractionTimeoutMs,
  };
  let result: GeotechDocumentInsight;
  if (pageTextHint) {
    try {
      result = await withWorkerPageTimeout(
        extractTextFacts(pageTextHint, extractionConfig, context),
        extractionTimeoutMs,
        `Page ${pageInput.pageNumber}: text extraction timed out after ${Math.round(extractionTimeoutMs / 1000)}s`,
      );
    } catch (error) {
      const message = normalizeCheckpointErrorMessage(error instanceof Error ? error.message : String(error));
      const deterministic = isTextExtractionTimeoutError(message)
        ? extractDeterministicFacts(pageTextHint, context, {
            forcePartial: true,
            warning: `Text extraction timed out (${message}); used deterministic partial extraction instead.`,
          })
        : null;
      if (!deterministic) {
        throw error;
      }
      result = deterministic;
    }
  } else {
    result = await withWorkerPageTimeout(
      interpretation(pageInput.base64, pageInput.mimeType, phaseConfig, context),
      phaseTimeoutMs,
      `Page ${pageInput.pageNumber}: visual page interpretation timed out after ${Math.round(phaseTimeoutMs / 1000)}s`,
    );
  }

  return {
    result,
    ocrTextHint: pageTextHint,
    ocrSource,
    ocrWarnings,
  };
}

async function processBoreholePage(
  job: PersistedIngestJobRecord,
  pageInput: PreparedBoreholePageInput,
  config: LLMConfig,
  state: BoreholeProcessingState,
  dependencies: PersistedIngestJobWorkerDependencies,
  options: {
    cheapRetry?: boolean;
  } = {},
): Promise<{
  result: BoreholeInterpretation;
  nextState: BoreholeProcessingState;
  ocrTextHint?: string;
  ocrSource?: PersistedIngestJobPageCheckpoint['ocrSource'];
  ocrWarnings?: string[];
}> {
  const recoverTextHint = dependencies.recoverDocumentTextHint ?? recoverDocumentTextHint;
  const transcribe = dependencies.transcribeDocumentImageText ?? transcribeDocumentImageText;
  const interpret = dependencies.interpretBoreholeLogWithContext ?? interpretBoreholeLogWithContext;
  const inspectionPage = job.inspection?.pages[pageInput.pageNumber - 1];
  const phaseTimeoutMs = resolveWorkerPhaseTimeoutMs(config, {
    classification: inspectionPage?.classification,
    sourceKind: pageInput.sourceKind,
  }, {
    cheapRetry: options.cheapRetry,
  });
  const phaseConfig: LLMConfig = {
    ...config,
    timeout: phaseTimeoutMs,
  };
  let pageTextHint = typeof inspectionPage?.normalizedText === 'string' ? inspectionPage.normalizedText : undefined;
  const recovery = await withWorkerPageTimeout(
    recoverTextHint({
      existingTextHint: pageTextHint,
      existingTextAccepted: inspectionPage?.normalizedArtifact?.textQuality.accepted ?? true,
      imageBase64: pageInput.base64,
      mimeType: pageInput.mimeType,
      config: phaseConfig,
      pdfFilePath: job.source.filePath,
      pdfPageNumber: pageInput.pageNumber,
      allowLayoutOcr: !(options.cheapRetry && pageInput.sourceKind === 'raster-image'),
      allowVisionOcr: !(options.cheapRetry && pageInput.sourceKind === 'raster-image'),
      visionTranscribe: transcribe,
    }),
    phaseTimeoutMs,
    `Page ${pageInput.pageNumber}: OCR/text recovery timed out after ${Math.round(phaseTimeoutMs / 1000)}s`,
  );
  if (recovery.textHint) {
    pageTextHint = recovery.textHint;
  }

  const context: BoreholeLogContext = {
    boreholeId: state.lastResolvedBoreholeId,
    pageNumber: pageInput.pageNumber,
    totalPages: pageInput.totalPages,
    priorContinuationDepth: state.priorContinuationDepth,
    pageClassification: inspectionPage?.classification,
    pageTextHint,
  };
  const result = await withWorkerPageTimeout(
    interpret(pageInput.base64, pageInput.mimeType, phaseConfig, context),
    phaseTimeoutMs,
    `Page ${pageInput.pageNumber}: visual page interpretation timed out after ${Math.round(phaseTimeoutMs / 1000)}s`,
  );
  const nextState = advanceBoreholeProcessingState(
    state,
    result,
    pageTextHint,
    job.request.overrideBoreholeId,
  );

  return {
    result,
    nextState,
    ocrTextHint: recovery.textHint,
    ocrSource: recovery.source,
    ocrWarnings: recovery.warnings,
  };
}

async function finalizeJobResult(
  job: PersistedIngestJobRecord,
  pageInputs: PreparedPdfPageInputBase[],
  config: LLMConfig,
  dependencies: PersistedIngestJobWorkerDependencies,
): Promise<PersistedIngestResult> {
  const completedPages = job.checkpoints.pages.filter((page) => page.status === 'completed');
  if (completedPages.length === 0) {
    return job.documentType === 'borehole-log'
      ? buildSyntheticBoreholeResult(job, job.inspection, dependencies.now)
      : buildSyntheticGeotechDocumentResult(job, job.inspection, dependencies.now);
  }

  if (job.documentType === 'borehole-log') {
    const pageInputMap = new Map(
      pageInputs.map((page) => [page.pageNumber, page as PreparedBoreholePageInput] as const),
    );

    try {
      const result = await ingestBoreholeLogDocument({
        config,
        source: buildJobResultSource(job, { successfulPages: 0, failedPages: 0 }),
        overrideBoreholeId: job.request.overrideBoreholeId,
        inspection: job.inspection,
        pages: job.checkpoints.pages
          .map((checkpoint) => pageInputMap.get(checkpoint.pageNumber))
          .filter((page): page is PreparedBoreholePageInput => Boolean(page)),
        interpretPageWithContext: async (_base64, _mimeType, _config, context) => {
          const pageNumber = context?.pageNumber;
          if (!pageNumber) {
            throw new Error('Replay borehole ingest requires a page number context.');
          }

          const checkpoint = findCheckpoint(job, pageNumber);
          if (checkpoint.status === 'completed' && checkpoint.result) {
            return checkpoint.result as BoreholeInterpretation;
          }

          throw new Error(normalizeCheckpointErrorMessage(checkpoint.error ?? `Page ${pageNumber} failed during async ingest.`));
        },
        transcribePageImageText: async (_base64, _mimeType, _config) => {
          const pageNumber = pageInputs.find((page) => page.base64 === _base64 && page.mimeType === _mimeType)?.pageNumber;
          const checkpoint = pageNumber ? findCheckpoint(job, pageNumber) : undefined;
          return {
            text: checkpoint?.ocrTextHint ?? '',
            warnings: checkpoint?.ocrWarnings ?? [],
            usedFallback: false,
            latencyMs: 0,
          };
        },
        now: dependencies.now,
      });
      return applyCheckpointOcrRecoveredSummary(
        applyBoreholeFailureDowngrades(result, job.checkpoints.pages),
        job.checkpoints.pages,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/No pages could be ingested successfully/i.test(message)) {
        return buildSyntheticBoreholeResult(job, job.inspection, dependencies.now);
      }
      throw error;
    }
  }

  const geotechPageInputMap = new Map(
    pageInputs.map((page) => [page.pageNumber, page as PreparedGeotechPageInput] as const),
  );

  try {
    const result = await ingestGeotechDocument({
      config,
      source: buildJobResultSource(job, { successfulPages: 0, failedPages: 0 }),
      inspection: job.inspection,
      pages: job.checkpoints.pages
        .map((checkpoint) => geotechPageInputMap.get(checkpoint.pageNumber))
        .filter((page): page is PreparedGeotechPageInput => Boolean(page)),
      interpretPage: async (_base64, _mimeType, _config, context) => {
        const pageNumber = typeof context?.pageNumber === 'number' ? context.pageNumber : undefined;
        if (!pageNumber) {
          throw new Error('Replay geotech-document ingest requires a page number context.');
        }
        const checkpoint = findCheckpoint(job, pageNumber);
        if (checkpoint.status === 'completed' && checkpoint.result) {
          return checkpoint.result as GeotechDocumentInsight;
        }
        throw new Error(normalizeCheckpointErrorMessage(checkpoint.error ?? `Page ${pageNumber} failed during async ingest.`));
      },
      extractTextFacts: async (_pageText, _config, context) => {
        const pageNumber = typeof context?.pageNumber === 'number' ? context.pageNumber : undefined;
        if (!pageNumber) {
          throw new Error('Replay geotech-document ingest requires a page number context.');
        }
        const checkpoint = findCheckpoint(job, pageNumber);
        if (checkpoint.status === 'completed' && checkpoint.result) {
          return checkpoint.result as GeotechDocumentInsight;
        }
        throw new Error(normalizeCheckpointErrorMessage(checkpoint.error ?? `Page ${pageNumber} failed during async ingest.`));
      },
      transcribePageImageText: async (_base64, _mimeType, _config) => {
        const pageNumber = pageInputs.find((page) => page.base64 === _base64 && page.mimeType === _mimeType)?.pageNumber;
        const checkpoint = pageNumber ? findCheckpoint(job, pageNumber) : undefined;
        return {
          text: checkpoint?.ocrTextHint ?? '',
          warnings: checkpoint?.ocrWarnings ?? [],
          usedFallback: false,
          latencyMs: 0,
        };
      },
      now: dependencies.now,
    });

    return applyCheckpointOcrRecoveredSummary(
      applyGeotechFailureDowngrades(result, job.checkpoints.pages),
      job.checkpoints.pages,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/No pages could be ingested successfully/i.test(message)) {
      return buildSyntheticGeotechDocumentResult(job, job.inspection, dependencies.now);
    }
    throw error;
  }
}

function isCancelled(jobId: string): boolean {
  return loadPersistedIngestJob(jobId)?.execution.cancelRequested === true;
}

export async function runPersistedIngestJobWorker(
  jobId: string,
  dependencies: PersistedIngestJobWorkerDependencies = {},
): Promise<PersistedIngestJobRecord> {
  const inspect = dependencies.inspectPdfDocument ?? inspectPdfDocument;
  const persistReview = dependencies.persistReview ?? persistBoreholeIngestReview;

  let currentJob = loadPersistedIngestJob(jobId);
  if (!currentJob) {
    throw new Error(`No persisted ingest job named "${jobId}" was found.`);
  }

  if (currentJob.status === 'completed') {
    return currentJob;
  }

  const mutateQueue: Promise<void>[] = [];
  const mutateJob = async (mutator: (job: PersistedIngestJobRecord) => PersistedIngestJobRecord) => {
    const run = async () => {
      const latest = loadPersistedIngestJob(jobId) ?? currentJob!;
      currentJob = mutator(latest);
      savePersistedIngestJob(currentJob);
    };
    const previous = mutateQueue[mutateQueue.length - 1];
    const next = previous ? previous.then(run) : run();
    mutateQueue.push(next);
    await next;
  };

  await mutateJob((job) => ({
    ...job,
    status: 'running',
    startedAt: job.startedAt ?? nowIso(dependencies.now),
    updatedAt: nowIso(dependencies.now),
    execution: {
      ...job.execution,
      pid: process.pid,
      lastHeartbeatAt: nowIso(dependencies.now),
      lastError: undefined,
      cancelRequested: false,
    },
  }));

  try {
    const inspection = currentJob.inspection && currentJob.inspection.totalPages > 0
      ? currentJob.inspection
      : inspect(currentJob.source.filePath);
    if (!currentJob.inspection || currentJob.inspection.totalPages === 0) {
      if (inspection.totalPages > 0) {
        await mutateJob((job) => ({
          ...job,
          inspection,
          source: {
            ...job.source,
            totalPages: inspection.totalPages,
            weightedPageCost: inspection.pages.reduce((sum, page) => sum + (page.classification === 'image-only' || page.classification === 'text-unreadable' ? 2 : 1), 0),
          },
          processing: {
            ...job.processing,
            chunkExtractionConcurrency: resolvePersistedIngestJobExtractionConcurrency(job.config, inspection, job.segmentation),
          },
          checkpoints: {
            pages: inspection.pages.map((page) => job.checkpoints.pages.find((existing) => existing.pageNumber === page.pageNumber) ?? ({
              pageNumber: page.pageNumber,
              classification: page.classification,
              sourceKind: mapPageSourceKind(page.classification),
              weight: page.classification === 'image-only' || page.classification === 'text-unreadable' ? 2 : 1,
              status: 'pending',
              attempts: 0,
              updatedAt: nowIso(dependencies.now),
            })),
          },
        }));
      } else {
        const inferredPageCount = await inferWorkerPdfPageCount(currentJob);

        if (inferredPageCount > 0) {
          await mutateJob((job) => {
            const timestamp = nowIso(dependencies.now);
            return {
              ...job,
              inspection: null,
              source: {
                ...job.source,
                totalPages: Math.max(job.source.totalPages, inferredPageCount),
                weightedPageCost: Math.max(job.source.weightedPageCost, inferredPageCount),
              },
              processing: {
                ...job.processing,
                chunkExtractionConcurrency: resolvePersistedIngestJobExtractionConcurrency(job.config, null, job.segmentation),
              },
              checkpoints: {
                pages: buildFallbackWorkerCheckpoints(job, inferredPageCount, timestamp),
              },
            };
          });
        }
      }
    }

    currentJob = loadPersistedIngestJob(jobId) ?? currentJob;
    const config = buildJobConfig(currentJob, dependencies);
    if (currentJob.documentType === 'geotech-document' && currentJob.segmentation?.mode === 'segmented-parent') {
      return await runSegmentedParentGeotechJob(jobId, currentJob, mutateJob, config, dependencies);
    }

    const pageInputs = await preparePdfPageInputs(
      currentJob.source.filePath,
      currentJob.inspection,
      currentJob.processing.pagePreprocessingConcurrency,
      dependencies,
    );
    let processedNewPages = 0;

    if (currentJob.documentType === 'geotech-document') {
      const geotechPageInputs = pageInputs as PreparedGeotechPageInput[];
      const pendingPages = geotechPageInputs
        .filter((page) => findCheckpoint(currentJob!, page.pageNumber).status !== 'completed')
        .sort((left, right) => left.pageNumber - right.pageNumber);
      let fatalProviderStopMessage: string | null = null;

      await mapWithConcurrency(
        pendingPages,
        currentJob.processing.chunkExtractionConcurrency,
        async (page) => {
          if (isCancelled(jobId)) {
            return;
          }

          if (findCheckpoint(currentJob!, page.pageNumber).status !== 'pending') {
            return;
          }

          if (fatalProviderStopMessage) {
            await mutateJob((job) => ({
              ...job,
              updatedAt: nowIso(dependencies.now),
              execution: {
                ...job.execution,
                lastHeartbeatAt: nowIso(dependencies.now),
              },
              checkpoints: {
                pages: job.checkpoints.pages.map((pageCheckpoint) =>
                  pageCheckpoint.pageNumber === page.pageNumber && pageCheckpoint.status === 'pending'
                ? {
                    ...pageCheckpoint,
                    status: 'failed',
                    updatedAt: nowIso(dependencies.now),
                    error: `skipped after upstream provider stop. ${normalizeCheckpointErrorMessage(fatalProviderStopMessage ?? '')}`,
                    downgraded: false,
                  }
                : pageCheckpoint
                ),
              },
            }));
            return;
          }

          await mutateJob((job) => ({
            ...job,
            updatedAt: nowIso(dependencies.now),
            execution: {
              ...job.execution,
              lastHeartbeatAt: nowIso(dependencies.now),
            },
            checkpoints: {
              pages: job.checkpoints.pages.map((checkpoint) =>
                checkpoint.pageNumber === page.pageNumber
                  ? {
                      ...checkpoint,
                      attempts: checkpoint.attempts + 1,
                      updatedAt: nowIso(dependencies.now),
                    }
                  : checkpoint
              ),
            },
          }));

          let processed: Awaited<ReturnType<typeof processGeotechDocumentPage>> | null = null;
          let finalErrorMessage = '';
          for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
            try {
              processed = await processGeotechDocumentPage(currentJob!, page, config, dependencies, {
                cheapRetry: attemptIndex > 0,
              });
              break;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              const normalizedMessage = normalizeCheckpointErrorMessage(message);
              if (
                attemptIndex === 0
                && isRetryableUpstreamPageError(normalizedMessage)
                && !isFatalProviderStopError(normalizedMessage)
              ) {
                await waitForCheckpointRetryBackoff(findCheckpoint(currentJob!, page.pageNumber).attempts);
                await mutateJob((job) => ({
                  ...job,
                  updatedAt: nowIso(dependencies.now),
                  execution: {
                    ...job.execution,
                    lastHeartbeatAt: nowIso(dependencies.now),
                  },
                  checkpoints: {
                    pages: job.checkpoints.pages.map((checkpoint) =>
                      checkpoint.pageNumber === page.pageNumber
                        ? {
                            ...checkpoint,
                            attempts: checkpoint.attempts + 1,
                            updatedAt: nowIso(dependencies.now),
                            error: `retrying after upstream timeout: ${normalizedMessage}`,
                          }
                        : checkpoint
                    ),
                  },
                }));
                continue;
              }
              finalErrorMessage = normalizedMessage;
              break;
            }
          }

          if (processed) {
            processedNewPages += 1;
            await mutateJob((job) => ({
              ...job,
              updatedAt: nowIso(dependencies.now),
              execution: {
                ...job.execution,
                lastHeartbeatAt: nowIso(dependencies.now),
              },
              checkpoints: {
                pages: job.checkpoints.pages.map((checkpoint) =>
                  checkpoint.pageNumber === page.pageNumber
                    ? {
                        ...checkpoint,
                        status: 'completed',
                        updatedAt: nowIso(dependencies.now),
                        completedAt: nowIso(dependencies.now),
                        error: undefined,
                        downgraded: false,
                        ocrTextHint: processed.ocrTextHint,
                        ocrSource: processed.ocrSource,
                        ocrWarnings: processed.ocrWarnings,
                        result: processed.result,
                      }
                    : checkpoint
                ),
              },
            }));
          } else {
            const normalizedMessage = finalErrorMessage || `Page ${page.pageNumber} failed during async ingest.`;
            const checkpoint = findCheckpoint(currentJob!, page.pageNumber);
            if (!fatalProviderStopMessage && isFatalProviderStopError(normalizedMessage)) {
              fatalProviderStopMessage = normalizedMessage;
            }
            await mutateJob((job) => {
              const timestamp = nowIso(dependencies.now);
              const failedJob = {
                ...job,
                updatedAt: timestamp,
                execution: {
                  ...job.execution,
                  lastHeartbeatAt: timestamp,
                },
                checkpoints: {
                  pages: job.checkpoints.pages.map((pageCheckpoint) =>
                    pageCheckpoint.pageNumber === page.pageNumber
                      ? {
                          ...pageCheckpoint,
                          status: 'failed' as const,
                          updatedAt: timestamp,
                          error: normalizedMessage,
                          downgraded: isSlowVisualPageError(normalizedMessage, checkpoint.classification, checkpoint.sourceKind),
                        }
                      : pageCheckpoint
                  ),
                },
              };
              return applyConsecutiveVisualRunDowngrades(failedJob, page.pageNumber, dependencies.now);
            });
          }
        },
      );

      if (fatalProviderStopMessage) {
        await mutateJob((job) => ({
          ...job,
          updatedAt: nowIso(dependencies.now),
          execution: {
            ...job.execution,
            lastHeartbeatAt: nowIso(dependencies.now),
          },
          checkpoints: {
            pages: job.checkpoints.pages.map((pageCheckpoint) =>
              pageCheckpoint.status === 'pending'
                ? {
                    ...pageCheckpoint,
                    status: 'failed',
                    updatedAt: nowIso(dependencies.now),
                    error: `skipped after upstream provider stop. ${normalizeCheckpointErrorMessage(fatalProviderStopMessage ?? '')}`,
                    downgraded: false,
                  }
                : pageCheckpoint
            ),
          },
        }));
      }
    } else {
      let state: BoreholeProcessingState = {
        currentGroupBoreholeId: null,
        hasCurrentGroup: false,
        lastResolvedBoreholeId: currentJob.request.overrideBoreholeId,
        priorContinuationDepth: null,
      };
      const boreholePageInputs = pageInputs as PreparedBoreholePageInput[];
      for (const page of boreholePageInputs.sort((left, right) => left.pageNumber - right.pageNumber)) {
        const checkpoint = findCheckpoint(currentJob, page.pageNumber);
        if (checkpoint.status === 'completed' && checkpoint.result) {
          state = advanceBoreholeProcessingState(
            state,
            checkpoint.result as BoreholeInterpretation,
            checkpoint.ocrTextHint,
            currentJob.request.overrideBoreholeId,
          );
          continue;
        }

        if (isCancelled(jobId)) {
          break;
        }

        if (dependencies.stopAfterNewPages != null && processedNewPages >= dependencies.stopAfterNewPages) {
          throw new Error('Ingest job worker interrupted after checkpoint for test harness.');
        }

        await mutateJob((job) => ({
          ...job,
          updatedAt: nowIso(dependencies.now),
          execution: {
            ...job.execution,
            lastHeartbeatAt: nowIso(dependencies.now),
          },
          checkpoints: {
            pages: job.checkpoints.pages.map((pageCheckpoint) =>
              pageCheckpoint.pageNumber === page.pageNumber
                ? {
                    ...pageCheckpoint,
                    attempts: pageCheckpoint.attempts + 1,
                    updatedAt: nowIso(dependencies.now),
                  }
                : pageCheckpoint
            ),
          },
        }));

        let processed: Awaited<ReturnType<typeof processBoreholePage>> | null = null;
        let finalErrorMessage = '';
        for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
          try {
            processed = await processBoreholePage(currentJob, page, config, state, dependencies, {
              cheapRetry: attemptIndex > 0,
            });
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const normalizedMessage = normalizeCheckpointErrorMessage(message);
            if (
              attemptIndex === 0
              && isRetryableUpstreamPageError(normalizedMessage)
              && !isFatalProviderStopError(normalizedMessage)
            ) {
              await waitForCheckpointRetryBackoff(findCheckpoint(currentJob, page.pageNumber).attempts);
              await mutateJob((job) => ({
                ...job,
                updatedAt: nowIso(dependencies.now),
                execution: {
                  ...job.execution,
                  lastHeartbeatAt: nowIso(dependencies.now),
                },
                checkpoints: {
                  pages: job.checkpoints.pages.map((pageCheckpoint) =>
                    pageCheckpoint.pageNumber === page.pageNumber
                      ? {
                          ...pageCheckpoint,
                          attempts: pageCheckpoint.attempts + 1,
                          updatedAt: nowIso(dependencies.now),
                          error: `retrying after upstream timeout: ${normalizedMessage}`,
                        }
                      : pageCheckpoint
                  ),
                },
              }));
              continue;
            }
            finalErrorMessage = normalizedMessage;
            break;
          }
        }

        if (processed) {
          processedNewPages += 1;
          state = processed.nextState;
          await mutateJob((job) => ({
            ...job,
            updatedAt: nowIso(dependencies.now),
            execution: {
              ...job.execution,
              lastHeartbeatAt: nowIso(dependencies.now),
            },
            checkpoints: {
              pages: job.checkpoints.pages.map((pageCheckpoint) =>
                pageCheckpoint.pageNumber === page.pageNumber
                  ? {
                      ...pageCheckpoint,
                      status: 'completed',
                      updatedAt: nowIso(dependencies.now),
                      completedAt: nowIso(dependencies.now),
                      error: undefined,
                      downgraded: false,
                      ocrTextHint: processed.ocrTextHint,
                      ocrSource: processed.ocrSource,
                      ocrWarnings: processed.ocrWarnings,
                      result: processed.result,
                    }
                  : pageCheckpoint
              ),
            },
          }));
        } else {
          const normalizedMessage = finalErrorMessage || `Page ${page.pageNumber} failed during async ingest.`;
          await mutateJob((job) => ({
            ...job,
            updatedAt: nowIso(dependencies.now),
            execution: {
              ...job.execution,
              lastHeartbeatAt: nowIso(dependencies.now),
            },
            checkpoints: {
              pages: job.checkpoints.pages.map((pageCheckpoint) =>
                pageCheckpoint.pageNumber === page.pageNumber
                  ? {
                      ...pageCheckpoint,
                      status: 'failed',
                      updatedAt: nowIso(dependencies.now),
                      error: normalizedMessage,
                      downgraded: isSlowVisualPageError(normalizedMessage, pageCheckpoint.classification, pageCheckpoint.sourceKind),
                    }
                  : pageCheckpoint
              ),
            },
          }));

          if (isFatalProviderStopError(normalizedMessage)) {
            await mutateJob((job) => ({
              ...job,
              updatedAt: nowIso(dependencies.now),
              execution: {
                ...job.execution,
                lastHeartbeatAt: nowIso(dependencies.now),
              },
              checkpoints: {
                pages: job.checkpoints.pages.map((pageCheckpoint) =>
                  pageCheckpoint.status === 'pending'
                    ? {
                        ...pageCheckpoint,
                        status: 'failed',
                        updatedAt: nowIso(dependencies.now),
                        error: `skipped after upstream provider stop. ${normalizedMessage}`,
                        downgraded: false,
                      }
                    : pageCheckpoint
                ),
              },
            }));
            break;
          }
        }
      }
    }

    currentJob = loadPersistedIngestJob(jobId) ?? currentJob;
    if (currentJob.execution.cancelRequested) {
      await mutateJob((job) => ({
        ...job,
        status: 'canceled',
        updatedAt: nowIso(dependencies.now),
        canceledAt: nowIso(dependencies.now),
        execution: {
          ...job.execution,
          pid: undefined,
        },
      }));
      return loadPersistedIngestJob(jobId) ?? currentJob;
    }

    const finalResult = await finalizeJobResult(currentJob, pageInputs, config, dependencies);
    const persistedReview = currentJob.request.projectId
      ? persistReview(currentJob.request.projectId, finalResult, {
          title: currentJob.request.reviewTitle,
        })
      : null;

    await mutateJob((job) => ({
      ...job,
      status: 'completed',
      updatedAt: nowIso(dependencies.now),
      completedAt: nowIso(dependencies.now),
      execution: {
        ...job.execution,
        pid: undefined,
        lastHeartbeatAt: nowIso(dependencies.now),
      },
      result: {
        ingestResult: finalResult,
        persistedReview: persistedReview
          ? {
              datasetName: persistedReview.datasetName,
              reviewId: persistedReview.reviewId,
              createdAt: persistedReview.createdAt,
            }
          : undefined,
      },
    }));
  } catch (error) {
    await mutateJob((job) => ({
      ...job,
      status: 'failed',
      updatedAt: nowIso(dependencies.now),
      execution: {
        ...job.execution,
        pid: undefined,
        lastHeartbeatAt: nowIso(dependencies.now),
        lastError: error instanceof Error ? error.message : String(error),
      },
    }));
  }

  return loadPersistedIngestJob(jobId) ?? currentJob;
}

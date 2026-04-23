import { basename, join, parse } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  approvePersistedBoreholeIngestReview,
  buildPersistedIngestJobSegments,
  buildIngestDossier,
  buildLLMConfig,
  cancelPersistedIngestJob,
  computeWeightedPdfPageCost,
  createAndStartPersistedIngestJob,
  DEFAULT_LLM_VISION_MODEL,
  HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
  ingestBoreholeLogDocument,
  ingestGeotechDocument,
  inspectPdfDocument,
  listPersistedBoreholeIngestReviewApprovals,
  listPersistedBoreholeIngestReviews,
  loadLatestPersistedBoreholeIngestReviewApproval,
  loadLatestPersistedBoreholeIngestReview,
  loadPersistedIngestJob,
  loadPersistedIngestJobResult,
  loadPersistedBoreholeIngestReviewApproval,
  loadPersistedBoreholeIngestReview,
  persistBoreholeIngestReview,
  promotePersistedBoreholeIngestReview,
  resolvePersistedIngestJobExtractionConcurrency,
  renderIngestDossierAsHtml,
  resumePersistedIngestJob,
  shouldSegmentHostedBetaLongPdf,
  shouldUseAsyncIngestJob,
  slicePdfInspectionToRange,
  waitForPersistedIngestJob,
  writePdfPageSubset,
  type IngestSegmentationSummary,
  type PdfPageRange,
} from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderTable, success, error, info, warn } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import {
  estimateHostedBetaVisionBodyBytes,
  formatByteSize,
  HOSTED_BETA_REQUEST_LIMIT_BYTES,
  HOSTED_BETA_REQUEST_SAFE_BYTES,
  countPdfPages,
  readVisionInput,
  readVisionPdfPageInputs,
  type VisionInput,
} from '../util/vision-output.js';

function formatMaybe(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return 'Unavailable';
  return `${value}${suffix}`;
}

type IngestPresentationFormat = 'plain' | 'html';

function resolveIngestPresentationFormat(value: unknown): IngestPresentationFormat {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || normalized === 'plain') {
    return 'plain';
  }
  if (normalized === 'html') {
    return 'html';
  }
  throw new Error(`Unsupported ingest format "${String(value)}". Supported formats: plain, html.`);
}

function assertIngestPresentationMode(
  flags: { json?: boolean },
  format: IngestPresentationFormat,
): void {
  if (flags.json && format === 'html') {
    throw new Error('Use either --json or --format html, not both.');
  }
}

function shouldRenderHtmlDossier(
  format: IngestPresentationFormat,
  outputPath?: string,
): boolean {
  return format === 'html' || (typeof outputPath === 'string' && /\.html?$/i.test(outputPath));
}

function slugifyOutputStem(value: string): string {
  const parsed = parse(value);
  const stem = (parsed.name || parsed.base || value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return stem || 'geotech-ingest';
}

function defaultDossierOutputPath(sourceLabel: string): string {
  return `${slugifyOutputStem(sourceLabel)}.ingest-dossier.html`;
}

function writeHtmlDossier(
  result: ProjectBackedIngestResult,
  options: {
    outputPath?: string;
    sourceLabel: string;
    storedReview?: PersistedReviewRenderDetails | null;
    approval?: PersistedReviewApprovalRenderDetails | null;
  },
): string {
  const dossier = buildIngestDossier(result, {
    sourceLabel: options.sourceLabel,
    storedReview: options.storedReview
      ? {
          projectId: options.storedReview.projectId,
          datasetName: options.storedReview.datasetName,
          reviewId: options.storedReview.reviewId,
          createdAt: options.storedReview.createdAt,
        }
      : null,
    approval: options.approval
      ? {
          datasetName: options.approval.datasetName,
          approvedAt: options.approval.approvedAt,
          approvedBy: options.approval.approvedBy,
          rationale: options.approval.rationale,
        }
      : null,
  });
  const outputPath = options.outputPath ?? defaultDossierOutputPath(options.sourceLabel);
  writeFileSync(outputPath, renderIngestDossierAsHtml(dossier));
  success(`HTML ingest dossier saved to ${outputPath}`);
  return outputPath;
}

function startProgress(flags: { json?: boolean; quiet?: boolean }, text: string) {
  if (flags.json || flags.quiet) {
    return null;
  }

  info(text);
  return {
    succeed(message: string) {
      success(message);
    },
    fail(message: string) {
      error(message);
    },
  };
}

function describeVisionInput(file: VisionInput, flags: { json?: boolean; quiet?: boolean }): void {
  if (flags.json || flags.quiet) {
    return;
  }

  if (file.kind !== 'pdf') {
    return;
  }

  console.log('');
  console.log(chalk.yellow('  PDF input detected.'));
  console.log(chalk.gray('    geotech ingest will pre-scan the PDF, split it into page-level requests, and preserve document-level warnings.'));
  console.log(chalk.gray('    Scanned/image-only pages are routed through raster-image recovery when possible, but ambiguous pages may still require manual review.'));
  console.log('');
}

function ensureHostedBetaVisionPayloadWithinLimit(
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  const estimatedBytes = estimateHostedBetaVisionBodyBytes({
    prompt: details.prompt,
    systemPrompt: details.systemPrompt,
    imageBase64: file.base64,
    mimeType: file.mimeType,
    model: details.model,
    temperature: details.temperature,
    maxTokens: details.maxTokens,
    jsonMode: false,
  });

  if (estimatedBytes <= HOSTED_BETA_REQUEST_SAFE_BYTES) {
    return;
  }

  const fileSize = formatByteSize(file.fileBytes);
  const payloadSize = formatByteSize(estimatedBytes);
  const limitSize = formatByteSize(HOSTED_BETA_REQUEST_SAFE_BYTES);
  const capSize = formatByteSize(HOSTED_BETA_REQUEST_LIMIT_BYTES);
  const baseMessage =
    file.kind === 'pdf'
      ? 'PDF ingest inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.'
      : 'Image ingest inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.';
  const mitigation =
    file.kind === 'pdf'
      ? 'Split the PDF into smaller files or export the relevant page as PNG/JPG, then retry.'
      : 'Resize or crop the image to the relevant region, then retry.';

  throw new Error(
    `${baseMessage} File: ${file.filePath} (${fileSize}). Estimated request body: ${payloadSize}. Safe limit: ${limitSize}. Hosted beta cap: ${capSize}.\n${mitigation}`,
  );
}

function maybeCheckHostedBetaVisionPayload(
  config: ReturnType<typeof buildLLMConfig>,
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  if (config.provider !== 'hosted-beta') {
    return;
  }

  ensureHostedBetaVisionPayloadWithinLimit(file, {
    ...details,
    model: config.visionModelId ?? DEFAULT_LLM_VISION_MODEL,
  });
}

function formatCoordinateSummary(borehole: {
  location: {
    crs?: { code?: string; name?: string } | null;
    raw?: Record<string, unknown> | null;
    wgs84?: { latitude: number; longitude: number } | null;
    projected?: { easting: number; northing: number } | null;
  } | null;
}): string {
  if (!borehole.location) {
    return 'Unavailable';
  }

  const rawCoordinateText =
    typeof borehole.location.raw?.rawCoordinateText === 'string'
      ? borehole.location.raw.rawCoordinateText
      : null;
  const parts = [
    borehole.location.crs?.code ?? borehole.location.crs?.name ?? null,
    rawCoordinateText,
    borehole.location.wgs84
      ? `lat ${borehole.location.wgs84.latitude}, lon ${borehole.location.wgs84.longitude}`
      : null,
    borehole.location.projected
      ? `E ${borehole.location.projected.easting}, N ${borehole.location.projected.northing}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(' | ') : 'Unavailable';
}

function formatClassificationSummary(counts: Partial<Record<string, number>> | undefined): string {
  if (!counts) {
    return 'Unavailable';
  }

  const entries = Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort((left, right) => left[0].localeCompare(right[0]));

  if (entries.length === 0) {
    return 'Unavailable';
  }

  return entries.map(([classification, count]) => `${classification}: ${count}`).join(', ');
}

type ReviewSeverity = 'advisory' | 'review' | 'blocking';
type ReviewScope = 'document' | 'page' | 'borehole' | 'material';

type ReviewFinding = {
  severity: ReviewSeverity;
  scope: ReviewScope;
  message: string;
  pageNumber?: number;
  boreholeId?: string;
  materialDescription?: string;
};

const REVIEW_SEVERITY_ORDER: ReviewSeverity[] = ['blocking', 'review', 'advisory'];

const REVIEW_SEVERITY_LABELS: Record<ReviewSeverity, string> = {
  advisory: 'Advisory',
  review: 'Needs review',
  blocking: 'Blocking',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReviewSeverity(value: unknown): value is ReviewSeverity {
  return value === 'advisory' || value === 'review' || value === 'blocking';
}

function isReviewScope(value: unknown): value is ReviewScope {
  return value === 'document' || value === 'page' || value === 'borehole' || value === 'material';
}

function asOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePageRange(value: unknown): PdfPageRange | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return undefined;
  }

  const match = normalized.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) {
    throw new Error(`Invalid --page-range "${String(value)}". Use start:end, for example 61:102.`);
  }

  const startPage = Number.parseInt(match[1]!, 10);
  const endPage = Number.parseInt(match[2]!, 10);
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage) {
    throw new Error(`Invalid --page-range "${String(value)}". Use start:end with positive page numbers.`);
  }

  return { startPage, endPage };
}

function formatPageRange(range: PdfPageRange | [number, number] | undefined): string | undefined {
  if (!range) {
    return undefined;
  }

  const startPage = Array.isArray(range) ? range[0] : range.startPage;
  const endPage = Array.isArray(range) ? range[1] : range.endPage;
  return `${startPage}-${endPage}`;
}

function getCommandOptionValue(commandLike: unknown, key: string): unknown {
  return typeof (commandLike as { getOptionValue?: (name: string) => unknown } | null)?.getOptionValue === 'function'
    ? (commandLike as { getOptionValue: (name: string) => unknown }).getOptionValue(key)
    : undefined;
}

function toLongOptionFlag(key: string): string {
  return `--${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

function getRawOptionValue(commandLike: unknown, key: string): unknown {
  const rawArgs = Array.isArray((commandLike as { rawArgs?: unknown[] } | null)?.rawArgs)
    ? ((commandLike as { rawArgs: unknown[] }).rawArgs)
    : [];
  if (rawArgs.length === 0) {
    return undefined;
  }

  const flag = toLongOptionFlag(key);
  for (let index = 0; index < rawArgs.length; index += 1) {
    const current = rawArgs[index];
    if (typeof current !== 'string') {
      continue;
    }

    if (current === flag) {
      const next = rawArgs[index + 1];
      return typeof next === 'string' && !next.startsWith('--') ? next : true;
    }

    if (current.startsWith(`${flag}=`)) {
      return current.slice(flag.length + 1);
    }
  }

  return undefined;
}

function getReviewFindings(result: unknown): ReviewFinding[] {
  if (!isRecord(result)) {
    return [];
  }

  const structured = Array.isArray(result.reviewFindings)
    ? result.reviewFindings.flatMap((finding): ReviewFinding[] => {
        if (!isRecord(finding)) {
          return [];
        }

        const severity = finding.severity;
        const scope = finding.scope;
        const message = asOptionalTrimmedString(finding.message);
        if (!isReviewSeverity(severity) || !isReviewScope(scope) || !message) {
          return [];
        }

        return [{
          severity,
          scope,
          message,
          pageNumber: asOptionalPositiveInteger(finding.pageNumber),
          boreholeId: asOptionalTrimmedString(finding.boreholeId),
          materialDescription: asOptionalTrimmedString(finding.materialDescription),
        }];
      })
    : [];

  if (structured.length > 0) {
    return structured;
  }

  return Array.isArray(result.reviewReasons)
    ? result.reviewReasons.flatMap((reason): ReviewFinding[] => {
        const message = asOptionalTrimmedString(reason);
        return message
          ? [{ severity: 'review', scope: 'document', message }]
          : [];
      })
    : [];
}

function formatReviewFinding(finding: ReviewFinding): string {
  const context: string[] = [];

  if (finding.scope === 'document') {
    context.push('Document');
  }

  if (finding.scope === 'page') {
    context.push(finding.pageNumber != null ? `Page ${finding.pageNumber}` : 'Page');
    if (finding.boreholeId) {
      context.push(`Borehole ${finding.boreholeId}`);
    }
  }

  if (finding.scope === 'borehole') {
    if (finding.pageNumber != null) {
      context.push(`Page ${finding.pageNumber}`);
    }
    context.push(finding.boreholeId ? `Borehole ${finding.boreholeId}` : 'Borehole');
  }

  if (finding.scope === 'material') {
    if (finding.pageNumber != null) {
      context.push(`Page ${finding.pageNumber}`);
    }
    context.push(finding.materialDescription ? `Material ${finding.materialDescription}` : 'Material');
  }

  return `${context.join(' | ')}: ${finding.message}`;
}

function renderReviewFindings(reviewFindings: ReviewFinding[]): void {
  if (reviewFindings.length === 0) {
    return;
  }

  console.log('');
  console.log(chalk.white('  Review findings:'));

  for (const severity of REVIEW_SEVERITY_ORDER) {
    const findings = reviewFindings.filter((finding) => finding.severity === severity);
    if (findings.length === 0) {
      continue;
    }

    console.log(chalk.white(`    ${REVIEW_SEVERITY_LABELS[severity]}:`));
    const render = severity === 'blocking' ? error : severity === 'review' ? warn : info;
    for (const finding of findings) {
      render(formatReviewFinding(finding));
    }
  }
}

function renderPersistedReviewDetails(details: {
  projectId: string;
  datasetName: string;
  reviewId: string;
  createdAt?: string;
} | null | undefined, approval?: {
  datasetName: string;
  approvedAt: string;
  approvedBy?: string;
  rationale?: string;
} | null): void {
  if (!details) {
    return;
  }

  console.log('');
  console.log(chalk.white('  Stored review:'));
  keyValue('  Project', details.projectId);
  keyValue('  Dataset', details.datasetName);
  keyValue('  Review ID', details.reviewId);
  if (details.createdAt) {
    keyValue('  Created', details.createdAt);
  }

  if (!approval) {
    return;
  }

  console.log('');
  console.log(chalk.white('  Approval:'));
  keyValue('  Dataset', approval.datasetName);
  keyValue('  Approved', approval.approvedAt);
  keyValue('  Approved by', approval.approvedBy ?? 'Unspecified');
  if (approval.rationale) {
    console.log(`    ${approval.rationale}`);
  }
}

type PersistedReviewRenderDetails = {
  projectId: string;
  datasetName: string;
  reviewId: string;
  createdAt?: string;
};

type PersistedReviewApprovalRenderDetails = {
  datasetName: string;
  approvedAt: string;
  approvedBy?: string;
  rationale?: string;
};

type BoreholeReviewReportResult = Parameters<typeof renderIngestResultReport>[0] & {
  documentType: 'borehole-log';
};

type GeotechDocumentReviewReportResult = Parameters<typeof renderGeotechDocumentResultReport>[0] & {
  documentType: 'geotech-document';
};

type PersistedReviewRecordForRender = {
  title: string;
  datasetName: string;
  reviewId: string;
  createdAt?: string;
  result: BoreholeReviewReportResult | GeotechDocumentReviewReportResult;
  approval?: PersistedReviewApprovalRenderDetails | null;
};

type ProjectBackedIngestResult =
  | Awaited<ReturnType<typeof ingestBoreholeLogDocument>>
  | Awaited<ReturnType<typeof ingestGeotechDocument>>;

function isGeotechDocumentReviewResult(
  result: PersistedReviewRecordForRender['result'],
): result is GeotechDocumentReviewReportResult {
  return result.documentType === 'geotech-document';
}

function renderIngestResultReport(
  result: {
    source: {
      fileName?: string;
      filePath?: string;
      successfulPages: number;
      totalPages: number;
    };
    boreholes: Array<{
      boreholeId: string;
      totalDepth?: number | null;
      waterTableDepth?: number | null;
      location: {
        crs?: { code?: string; name?: string } | null;
        raw?: Record<string, unknown> | null;
        wgs84?: { latitude: number; longitude: number } | null;
        projected?: { easting: number; northing: number } | null;
      } | null;
      confidence: number;
      parseStatus: string;
      projectName?: string | null;
      groundElevation?: number | null;
      summary?: string | null;
    }>;
    inspectionSummary?: {
      pageClassificationCounts?: Partial<Record<string, number>>;
      imageHeavyPageCount: number;
      ocrRecoveredPageCount: number;
    } | null;
    confidence: number;
    reviewRequired: boolean;
    canAutoProceed: boolean;
    pageFailures: string[];
    warnings: string[];
    reviewFindings?: unknown;
    reviewReasons?: unknown;
  },
  options?: {
    title?: string;
    sourceLabel?: string;
    persistedReview?: PersistedReviewRenderDetails | null;
    approval?: PersistedReviewApprovalRenderDetails | null;
  },
): void {
  heading(options?.title ?? 'Geotechnical Ingest');
  keyValue('Document type', 'borehole-log');
  keyValue('Source', options?.sourceLabel ?? result.source.fileName ?? result.source.filePath ?? 'Unknown');
  keyValue('Pages processed', `${result.source.successfulPages}/${result.source.totalPages}`);
  keyValue('Boreholes extracted', String(result.boreholes.length));
  keyValue('Confidence', `${result.confidence}%`);
  keyValue('Review required', result.reviewRequired ? 'Yes' : 'No');
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');

  if (result.inspectionSummary) {
    keyValue('PDF classes', formatClassificationSummary(result.inspectionSummary.pageClassificationCounts));
    keyValue('Image-heavy pages', String(result.inspectionSummary.imageHeavyPageCount));
    keyValue('Recovered OCR hints', String(result.inspectionSummary.ocrRecoveredPageCount));
  }

  renderPersistedReviewDetails(options?.persistedReview, options?.approval ?? null);

  console.log('');
  renderTable(
    ['Borehole', 'Total depth (m)', 'Water table (m)', 'Coordinates', 'Confidence', 'Status'],
    result.boreholes.map((borehole) => [
      borehole.boreholeId,
      borehole.totalDepth ?? '-',
      borehole.waterTableDepth ?? '-',
      formatCoordinateSummary(borehole),
      `${borehole.confidence}%`,
      borehole.parseStatus,
    ]),
  );

  const reviewFindings = getReviewFindings(result);
  renderReviewFindings(reviewFindings);

  if (result.pageFailures.length > 0) {
    console.log('');
    console.log(chalk.white('  Page failures:'));
    for (const failure of result.pageFailures) {
      warn(failure);
    }
  }

  const reviewFindingMessages = new Set(reviewFindings.map((finding) => finding.message));
  const standaloneWarnings = result.warnings.filter((warning) =>
    !result.pageFailures.includes(warning) && !reviewFindingMessages.has(warning),
  );
  if (standaloneWarnings.length > 0) {
    console.log('');
    console.log(chalk.white('  Warnings:'));
    for (const warningMessage of standaloneWarnings.slice(0, 8)) {
      warn(warningMessage);
    }
  }

  if (result.boreholes.length > 0) {
    const first = result.boreholes[0];
    console.log('');
    console.log(chalk.white(`  First borehole summary (${first.boreholeId}):`));
    keyValue('  Project', formatMaybe(first.projectName));
    keyValue('  Ground elevation', first.groundElevation != null ? `${first.groundElevation} m` : 'Unavailable');
    keyValue('  Coordinates', formatCoordinateSummary(first));
    console.log(`    ${formatMaybe(first.summary)}`);
  }

  console.log('');
}

function renderGeotechDocumentResultReport(
  result: {
    source: {
      fileName?: string;
      filePath?: string;
      successfulPages: number;
      totalPages: number;
    };
    documentClass?: string | null;
    title?: string | null;
    summary?: string | null;
    materials: Array<{
      kind: string;
      description: string;
      uscsSymbol?: string | null;
      lithology?: string | null;
    }>;
    classifications: Array<{
      system: string;
      value: string;
      context?: string | null;
    }>;
    parameters: Array<{
      name: string;
      valueText: string;
      unit?: string | null;
      material?: string | null;
      context?: string | null;
    }>;
    risks?: string[];
    recommendations?: string[];
    contentChunks?: Array<{
      chunkId: string;
      pageRange: [number, number];
      headingAncestry: string[];
      scope: 'page' | 'table' | 'figure' | 'section';
      sectionType?: string;
      significance?: number;
      text: string;
      sourcePages: number[];
    }>;
    inspectionSummary?: {
      pageClassificationCounts?: Partial<Record<string, number>>;
      imageHeavyPageCount: number;
      ocrRecoveredPageCount: number;
    } | null;
    confidence: number;
    parseStatus?: string;
    reviewRequired: boolean;
    canAutoProceed: boolean;
    pageFailures: string[];
    warnings: string[];
    reviewFindings?: unknown;
    reviewReasons?: unknown;
  },
  options?: {
    title?: string;
    sourceLabel?: string;
    persistedReview?: PersistedReviewRenderDetails | null;
    approval?: PersistedReviewApprovalRenderDetails | null;
  },
): void {
  heading(options?.title ?? 'Geotechnical Document Ingest');
  keyValue('Document type', 'geotech-document');
  keyValue('Source', options?.sourceLabel ?? result.source.fileName ?? result.source.filePath ?? 'Unknown');
  keyValue('Pages processed', `${result.source.successfulPages}/${result.source.totalPages}`);
  keyValue('Document class', result.documentClass ?? 'Unavailable');
  keyValue('Materials extracted', String(result.materials.length));
  keyValue('Parameters extracted', String(result.parameters.length));
  keyValue('Confidence', `${result.confidence}%`);
  if (result.parseStatus) {
    keyValue('Parse status', result.parseStatus);
  }
  keyValue('Review required', result.reviewRequired ? 'Yes' : 'No');
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');

  if (result.inspectionSummary) {
    keyValue('PDF classes', formatClassificationSummary(result.inspectionSummary.pageClassificationCounts));
    keyValue('Image-heavy pages', String(result.inspectionSummary.imageHeavyPageCount));
    keyValue('Recovered OCR hints', String(result.inspectionSummary.ocrRecoveredPageCount));
  }

  renderPersistedReviewDetails(options?.persistedReview, options?.approval ?? null);

  if (result.title || result.summary) {
    console.log('');
    console.log(chalk.white('  Document summary:'));
    keyValue('  Title', formatMaybe(result.title));
    console.log(`    ${formatMaybe(result.summary)}`);
  }

  if (result.materials.length > 0) {
    console.log('');
    console.log(chalk.white('  Materials:'));
    renderTable(
      ['Kind', 'Description', 'USCS', 'Lithology'],
      result.materials.slice(0, 10).map((material) => [
        material.kind,
        material.description,
        material.uscsSymbol ?? '-',
        material.lithology ?? '-',
      ]),
    );
  }

  if (result.classifications.length > 0) {
    console.log('');
    console.log(chalk.white('  Classifications:'));
    renderTable(
      ['System', 'Value', 'Context'],
      result.classifications.slice(0, 10).map((classification) => [
        classification.system,
        classification.value,
        classification.context ?? '-',
      ]),
    );
  }

  if (result.parameters.length > 0) {
    console.log('');
    console.log(chalk.white('  Parameters:'));
    renderTable(
      ['Parameter', 'Value', 'Unit', 'Material', 'Context'],
      result.parameters.slice(0, 12).map((parameter) => [
        parameter.name,
        parameter.valueText,
        parameter.unit ?? '-',
        parameter.material ?? '-',
        parameter.context ?? '-',
      ]),
    );
  }

  const reviewFindings = getReviewFindings(result);
  renderReviewFindings(reviewFindings);

  if (result.pageFailures.length > 0) {
    console.log('');
    console.log(chalk.white('  Page failures:'));
    for (const failure of result.pageFailures) {
      warn(failure);
    }
  }

  const reviewFindingMessages = new Set(reviewFindings.map((finding) => finding.message));
  const standaloneWarnings = result.warnings.filter((warning) =>
    !result.pageFailures.includes(warning) && !reviewFindingMessages.has(warning),
  );
  if (standaloneWarnings.length > 0) {
    console.log('');
    console.log(chalk.white('  Warnings:'));
    for (const warningMessage of standaloneWarnings.slice(0, 8)) {
      warn(warningMessage);
    }
  }

  if ((result.risks?.length ?? 0) > 0) {
    console.log('');
    console.log(chalk.white('  Risks:'));
    for (const risk of (result.risks ?? []).slice(0, 6)) {
      warn(risk);
    }
  }

  if ((result.recommendations?.length ?? 0) > 0) {
    console.log('');
    console.log(chalk.white('  Recommendations:'));
    for (const recommendation of (result.recommendations ?? []).slice(0, 6)) {
      info(recommendation);
    }
  }

  if ((result.contentChunks?.length ?? 0) > 0) {
    console.log('');
    console.log(chalk.white('  Report sections:'));
    renderTable(
      ['Pages', 'Section', 'Scope', 'Signal', 'Heading'],
      (result.contentChunks ?? []).slice(0, 8).map((chunk) => [
        chunk.pageRange[0] === chunk.pageRange[1]
          ? String(chunk.pageRange[0])
          : `${chunk.pageRange[0]}-${chunk.pageRange[1]}`,
        chunk.sectionType ?? '-',
        chunk.scope,
        chunk.significance != null ? String(chunk.significance) : '-',
        chunk.headingAncestry[0] ?? '-',
      ]),
    );
  }

  console.log('');
}

function renderPersistedReviewRecord(
  record: PersistedReviewRecordForRender,
  projectId: string,
): void {
  const persistedReview: PersistedReviewRenderDetails = {
    projectId,
    datasetName: String(record.datasetName),
    reviewId: String(record.reviewId),
    createdAt: asOptionalTrimmedString(record.createdAt),
  };
  const approval = record.approval
    ? {
        datasetName: record.approval.datasetName,
        approvedAt: record.approval.approvedAt,
        approvedBy: record.approval.approvedBy,
        rationale: record.approval.rationale,
      }
    : null;

  if (isGeotechDocumentReviewResult(record.result)) {
    renderGeotechDocumentResultReport(record.result, {
      title: 'Geotechnical Document Ingest Review',
      sourceLabel: record.title,
      persistedReview,
      approval,
    });
    return;
  }

  renderIngestResultReport(record.result, {
    title: 'Geotechnical Ingest Review',
    sourceLabel: record.title,
    persistedReview,
    approval,
  });
}

function buildPersistedReviewDossierDetails(
  record: PersistedReviewRecordForRender,
  projectId: string,
): {
  sourceLabel: string;
  storedReview: PersistedReviewRenderDetails;
  approval?: PersistedReviewApprovalRenderDetails | null;
} {
  return {
    sourceLabel: record.title,
    storedReview: {
      projectId,
      datasetName: String(record.datasetName),
      reviewId: String(record.reviewId),
      createdAt: asOptionalTrimmedString(record.createdAt),
    },
    approval: record.approval
      ? {
          datasetName: record.approval.datasetName,
          approvedAt: record.approval.approvedAt,
          approvedBy: record.approval.approvedBy,
          rationale: record.approval.rationale,
        }
      : null,
  };
}

function persistProjectIngestReview(
  projectId: string,
  result: ProjectBackedIngestResult,
): {
  datasetName: string;
  reviewId: string;
  createdAt?: string;
} {
  // The store accepts both result shapes in source, but the local package types can lag that source during monorepo edits.
  const persist = persistBoreholeIngestReview as unknown as (
    targetProjectId: string,
    ingestResult: ProjectBackedIngestResult,
  ) => {
    datasetName: string;
    reviewId: string;
    createdAt?: string;
  };

  return persist(projectId, result);
}

function createPersistedReviewDryRun(
  projectId: string,
  datasetName?: string,
): {
  kind: 'geotech-ingest-review-dry-run';
  projectId: string;
  datasetName?: string;
  sourceSelection: 'latest' | 'specific-dataset';
  wouldLoadPersistedReview: true;
} {
  return {
    kind: 'geotech-ingest-review-dry-run',
    projectId,
    datasetName,
    sourceSelection: datasetName ? 'specific-dataset' : 'latest',
    wouldLoadPersistedReview: true,
  };
}

function createPersistedReviewPromotionDryRun(
  projectId: string,
  datasetName?: string,
): {
  kind: 'geotech-ingest-review-promotion-dry-run';
  projectId: string;
  datasetName?: string;
  sourceSelection: 'latest' | 'specific-dataset';
  wouldLoadPersistedReview: true;
  wouldPromotePersistedReview: true;
} {
  return {
    kind: 'geotech-ingest-review-promotion-dry-run',
    projectId,
    datasetName,
    sourceSelection: datasetName ? 'specific-dataset' : 'latest',
    wouldLoadPersistedReview: true,
    wouldPromotePersistedReview: true,
  };
}

function createPersistedReviewApprovalDryRun(
  projectId: string,
  datasetName: string | undefined,
  note: string | undefined,
  approvedBy?: string,
): {
  kind: 'geotech-ingest-review-approval-dry-run';
  projectId: string;
  datasetName?: string;
  sourceSelection: 'latest' | 'specific-dataset';
  wouldLoadPersistedReview: true;
  wouldRecordApproval: true;
  note?: string;
  approvedBy?: string;
} {
  return {
    kind: 'geotech-ingest-review-approval-dry-run',
    projectId,
    datasetName,
    sourceSelection: datasetName ? 'specific-dataset' : 'latest',
    wouldLoadPersistedReview: true,
    wouldRecordApproval: true,
    note,
    approvedBy,
  };
}

function createPersistedReviewApprovalLookupDryRun(
  projectId: string,
  reviewDatasetName?: string,
  approvalDatasetName?: string,
  latest = false,
): {
  kind: 'geotech-ingest-review-approval-lookup-dry-run';
  projectId: string;
  reviewDatasetName?: string;
  approvalDatasetName?: string;
  latest?: boolean;
  wouldLoadPersistedReviewApproval: boolean;
  wouldListPersistedReviewApprovals: boolean;
} {
  return {
    kind: 'geotech-ingest-review-approval-lookup-dry-run',
    projectId,
    reviewDatasetName,
    approvalDatasetName,
    latest: latest || undefined,
    wouldLoadPersistedReviewApproval: Boolean(approvalDatasetName || latest),
    wouldListPersistedReviewApprovals: !approvalDatasetName && !latest,
  };
}

function resolveCommandOptions(
  opts: unknown,
  commandLike: unknown,
  extraKeys: string[] = [],
): Record<string, unknown> {
  const resolvedOpts =
    typeof (commandLike as { optsWithGlobals?: () => unknown } | null)?.optsWithGlobals === 'function'
      ? (commandLike as { optsWithGlobals: () => unknown }).optsWithGlobals()
      : undefined;

  const resolved: Record<string, unknown> = {
    ...(isRecord(opts) ? opts : {}),
    ...(isRecord(resolvedOpts) ? resolvedOpts : {}),
  };

  for (const key of ['json', 'quiet', 'dryRun', 'output', ...extraKeys]) {
    const value = getRawOptionValue(commandLike, key) ?? getCommandOptionValue(opts, key) ?? getCommandOptionValue(commandLike, key);
    if (value !== undefined) {
      resolved[key] = value;
    }
  }

  return resolved;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const normalized = asOptionalTrimmedString(item);
    return normalized ? [normalized] : [];
  });
}

function getNamedStringList(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const values = asStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }

    const value = asOptionalTrimmedString(record[key]);
    if (value) {
      return [value];
    }
  }

  return [];
}

function getPromotionWarnings(record: Record<string, unknown>): string[] {
  const warnings = new Set(asStringArray(record.warnings));

  if (Array.isArray(record.promotedBoreholes)) {
    for (const item of record.promotedBoreholes) {
      if (!isRecord(item)) {
        continue;
      }

      for (const warningMessage of asStringArray(item.warnings)) {
        warnings.add(warningMessage);
      }
    }
  }

  return [...warnings];
}

function normalizePromotionResult(result: unknown): {
  projectId?: string;
  sourceDatasetName?: string;
  approvalDatasetName?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvalRationale?: string;
  promotedDatasetNames: string[];
  promotedBoreholeIds: string[];
  supersededDatasetNames: string[];
  snapshotDatasetNames: string[];
  warnings: string[];
} {
  if (!isRecord(result)) {
    return {
      promotedDatasetNames: [],
      promotedBoreholeIds: [],
      supersededDatasetNames: [],
      snapshotDatasetNames: [],
      warnings: [],
    };
  }

  const promotedDatasetNames = getNamedStringList(result, [
    'promotedDatasetNames',
    'datasetNames',
  ]);
  const promotedBoreholeIds = getNamedStringList(result, [
    'promotedBoreholeIds',
    'boreholeIds',
  ]);
  const supersededDatasetNames = getNamedStringList(result, [
    'supersededDatasetNames',
    'supersededDatasets',
  ]);
  const snapshotDatasetNames = getNamedStringList(result, [
    'snapshotDatasetNames',
    'snapshotDatasets',
  ]);

  if (promotedDatasetNames.length === 0 && Array.isArray(result.promotedBoreholes)) {
    for (const item of result.promotedBoreholes) {
      if (!isRecord(item)) {
        continue;
      }

      const rawDatasetName = asOptionalTrimmedString(item.rawDatasetName);
      const soilProfileDatasetName = asOptionalTrimmedString(item.soilProfileDatasetName);
      if (rawDatasetName) {
        promotedDatasetNames.push(rawDatasetName);
      }
      if (soilProfileDatasetName) {
        promotedDatasetNames.push(soilProfileDatasetName);
      }
    }
  }

  if (promotedBoreholeIds.length === 0 && Array.isArray(result.promotedBoreholes)) {
    for (const item of result.promotedBoreholes) {
      if (!isRecord(item)) {
        continue;
      }

      const boreholeId = asOptionalTrimmedString(item.boreholeId);
      if (boreholeId) {
        promotedBoreholeIds.push(boreholeId);
      }

      for (const supersededDatasetName of asStringArray(item.supersededDatasetNames)) {
        supersededDatasetNames.push(supersededDatasetName);
      }

      for (const snapshotDatasetName of asStringArray(item.snapshotDatasetNames)) {
        snapshotDatasetNames.push(snapshotDatasetName);
      }
    }
  }

  return {
    projectId: asOptionalTrimmedString(result.projectId),
    sourceDatasetName: asOptionalTrimmedString(
      result.sourceDatasetName ?? result.sourceReviewDatasetName ?? result.datasetName,
    ),
    approvalDatasetName: asOptionalTrimmedString(result.approvalDatasetName),
    approvedAt: asOptionalTrimmedString(result.approvedAt),
    approvedBy: asOptionalTrimmedString(result.approvedBy),
    approvalRationale: asOptionalTrimmedString(result.approvalRationale),
    promotedDatasetNames: [...new Set(promotedDatasetNames)],
    promotedBoreholeIds: [...new Set(promotedBoreholeIds)],
    supersededDatasetNames: [...new Set(supersededDatasetNames)],
    snapshotDatasetNames: [...new Set(snapshotDatasetNames)],
    warnings: getPromotionWarnings(result),
  };
}

function renderPromotionResult(
  result: unknown,
  details: {
    projectId: string;
    datasetName?: string;
  },
): void {
  const normalized = normalizePromotionResult(result);

  heading('Persisted Ingest Review Promotion');
  keyValue('Project', normalized.projectId ?? details.projectId);
  keyValue('Review dataset', normalized.sourceDatasetName ?? details.datasetName ?? 'Latest persisted ingest review');
  if (normalized.approvalDatasetName) {
    keyValue('Approval dataset', normalized.approvalDatasetName);
    keyValue('Approved', normalized.approvedAt ?? 'Unknown');
    keyValue('Approved by', normalized.approvedBy ?? 'Unspecified');
  }
  keyValue('Promoted boreholes', String(normalized.promotedBoreholeIds.length));
  keyValue('Promoted datasets', String(normalized.promotedDatasetNames.length));
  if (normalized.supersededDatasetNames.length > 0) {
    keyValue('Superseded datasets', String(normalized.supersededDatasetNames.length));
  }
  if (normalized.snapshotDatasetNames.length > 0) {
    keyValue('Rollback snapshots', String(normalized.snapshotDatasetNames.length));
  }

  if (normalized.promotedDatasetNames.length > 0) {
    console.log('');
    console.log(chalk.white('  Project datasets:'));
    renderTable(
      ['Dataset'],
      normalized.promotedDatasetNames.map((datasetName) => [datasetName]),
    );
  }

  if (normalized.promotedBoreholeIds.length > 0) {
    console.log('');
    console.log(chalk.white('  Promoted boreholes:'));
    renderTable(
      ['Borehole'],
      normalized.promotedBoreholeIds.map((boreholeId) => [boreholeId]),
    );
  }

  if (normalized.snapshotDatasetNames.length > 0) {
    console.log('');
    console.log(chalk.white('  Snapshot datasets:'));
    renderTable(
      ['Dataset'],
      normalized.snapshotDatasetNames.map((datasetName) => [datasetName]),
    );
  }

  if (normalized.warnings.length > 0) {
    console.log('');
    console.log(chalk.white('  Warnings:'));
    for (const warningMessage of normalized.warnings.slice(0, 10)) {
      warn(warningMessage);
    }
  }

  if (normalized.approvalRationale) {
    console.log('');
    console.log(chalk.white('  Approval rationale:'));
    console.log(`    ${normalized.approvalRationale}`);
  }

  console.log('');
}

function renderApprovalResult(
  approval: {
    projectId: string;
    reviewDatasetName: string;
    datasetName: string;
    approvalId: string;
    approvedAt: string;
    approvedBy?: string;
    rationale: string;
  },
  details: {
    projectId: string;
    datasetName?: string;
  },
): void {
  heading('Persisted Ingest Review Approval');
  keyValue('Project', approval.projectId ?? details.projectId);
  keyValue('Review dataset', approval.reviewDatasetName ?? details.datasetName ?? 'Latest persisted ingest review');
  keyValue('Approval dataset', approval.datasetName);
  keyValue('Approval ID', approval.approvalId);
  keyValue('Approved', approval.approvedAt);
  keyValue('Approved by', approval.approvedBy ?? 'Unspecified');
  console.log('');
  console.log(chalk.white('  Rationale:'));
  console.log(`    ${approval.rationale}`);
  console.log('');
}

function renderApprovalHistory(
  approvals: Array<{
    datasetName: string;
    reviewDatasetName: string;
    approvedAt: string;
    approvedBy?: string;
    rationale: string;
    isLatestForReview?: boolean;
  }>,
  details: {
    projectId: string;
    reviewDatasetName?: string;
  },
): void {
  heading('Persisted Ingest Review Approvals');
  keyValue('Project', details.projectId);
  if (details.reviewDatasetName) {
    keyValue('Review dataset', details.reviewDatasetName);
  }
  keyValue('Count', String(approvals.length));
  console.log('');

  renderTable(
    ['Approval dataset', 'Review dataset', 'Approved', 'By', 'Latest'],
    approvals.map((approval) => [
      approval.datasetName,
      approval.reviewDatasetName,
      approval.approvedAt,
      approval.approvedBy ?? 'Unspecified',
      approval.isLatestForReview ? 'Yes' : 'No',
    ]),
  );

  if (approvals.length > 0) {
    console.log('');
    console.log(chalk.white('  Latest rationale:'));
    console.log(`    ${approvals[0]!.rationale}`);
  }

  console.log('');
}

type IngestJobPageStatus = 'pending' | 'completed' | 'failed';
type IngestJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

type NormalizedIngestJobRecord = {
  jobId: string;
  documentType: 'borehole-log' | 'geotech-document';
  status: IngestJobStatus;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  source: {
    filePath?: string;
    fileName?: string;
    totalPages: number;
    weightedPageCost: number;
    pageRange?: [number, number];
  };
  processing: {
    pagePreprocessingConcurrency: number;
    chunkExtractionConcurrency: number;
  };
  request: {
    projectId?: string;
    overrideBoreholeId?: string;
  };
  execution: {
    pid?: number;
    runCount: number;
    lastHeartbeatAt?: string;
    lastError?: string;
    cancelRequested?: boolean;
  };
  segmentation?: {
    mode: IngestSegmentationSummary['mode'];
    pageRange?: [number, number];
    effectivePageLimit?: number;
    segmentCount?: number;
    segments: Array<{
      segmentIndex: number;
      startPage: number;
      endPage: number;
      status?: string;
      childJobId?: string;
      completedPages?: number;
      failedPages?: number;
    }>;
  };
  pageCounts: Record<IngestJobPageStatus, number>;
  pages: Array<{
    pageNumber: number;
    status: IngestJobPageStatus;
    classification?: string;
    downgraded?: boolean;
    error?: string;
  }>;
  result?: {
    ingestResult?: ProjectBackedIngestResult;
    persistedReview?: {
      datasetName: string;
      reviewId: string;
      createdAt?: string;
    };
  };
};

function isIngestJobStatus(value: unknown): value is IngestJobStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'canceled';
}

function isIngestJobPageStatus(value: unknown): value is IngestJobPageStatus {
  return value === 'pending' || value === 'completed' || value === 'failed';
}

function normalizeIngestJobRecord(value: unknown): NormalizedIngestJobRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const jobId = asOptionalTrimmedString(value.jobId);
  const documentType = asOptionalTrimmedString(value.documentType);
  const status = value.status;
  const source = isRecord(value.source) ? value.source : null;
  const processing = isRecord(value.processing) ? value.processing : null;
  const request = isRecord(value.request) ? value.request : {};
  const execution = isRecord(value.execution) ? value.execution : {};
  const checkpoints = isRecord(value.checkpoints) ? value.checkpoints : null;
  if (
    !jobId
    || (documentType !== 'borehole-log' && documentType !== 'geotech-document')
    || !isIngestJobStatus(status)
    || !source
    || !processing
    || !checkpoints
  ) {
    return null;
  }

  const pages = Array.isArray(checkpoints.pages)
    ? checkpoints.pages.flatMap((page): NormalizedIngestJobRecord['pages'] => {
        if (!isRecord(page) || !isIngestJobPageStatus(page.status)) {
          return [];
        }

        const pageNumber = asOptionalPositiveInteger(page.pageNumber);
        if (pageNumber == null) {
          return [];
        }

        return [{
          pageNumber,
          status: page.status,
          classification: asOptionalTrimmedString(page.classification),
          downgraded: page.downgraded === true,
          error: asOptionalTrimmedString(page.error),
        }];
      })
    : [];

  const pageCounts: Record<IngestJobPageStatus, number> = { pending: 0, completed: 0, failed: 0 };
  for (const page of pages) {
    pageCounts[page.status] += 1;
  }

  const result = isRecord(value.result)
    ? {
        ingestResult: isRecord(value.result.ingestResult)
          ? value.result.ingestResult as unknown as ProjectBackedIngestResult
          : undefined,
        persistedReview: isRecord(value.result.persistedReview)
          ? {
              datasetName: asOptionalTrimmedString(value.result.persistedReview.datasetName) ?? '',
              reviewId: asOptionalTrimmedString(value.result.persistedReview.reviewId) ?? '',
              createdAt: asOptionalTrimmedString(value.result.persistedReview.createdAt),
            }
          : undefined,
      }
    : undefined;

  const segmentation = isRecord(value.segmentation)
    ? {
        mode: (asOptionalTrimmedString(value.segmentation.mode) as IngestSegmentationSummary['mode'] | undefined) ?? 'single',
        pageRange: Array.isArray(value.segmentation.pageRange)
          && value.segmentation.pageRange.length === 2
          && typeof value.segmentation.pageRange[0] === 'number'
          && typeof value.segmentation.pageRange[1] === 'number'
            ? [value.segmentation.pageRange[0], value.segmentation.pageRange[1]] as [number, number]
            : undefined,
        effectivePageLimit: asOptionalPositiveInteger(value.segmentation.effectivePageLimit),
        segmentCount: asOptionalPositiveInteger(value.segmentation.segmentCount),
        segments: Array.isArray(value.segmentation.segments)
          ? value.segmentation.segments.flatMap((segment) => {
              if (!isRecord(segment)) {
                return [];
              }
              const segmentIndex = asOptionalPositiveInteger(segment.segmentIndex);
              const startPage = asOptionalPositiveInteger(segment.startPage);
              const endPage = asOptionalPositiveInteger(segment.endPage);
              if (segmentIndex == null || startPage == null || endPage == null) {
                return [];
              }
              return [{
                segmentIndex,
                startPage,
                endPage,
                status: asOptionalTrimmedString(segment.status),
                childJobId: asOptionalTrimmedString(segment.childJobId),
                completedPages: asOptionalPositiveInteger(segment.completedPages),
                failedPages: typeof segment.failedPages === 'number' && Number.isFinite(segment.failedPages)
                  ? segment.failedPages
                  : undefined,
              }];
            })
          : [],
      }
    : undefined;

  return {
    jobId,
    documentType,
    status,
    createdAt: asOptionalTrimmedString(value.createdAt),
    updatedAt: asOptionalTrimmedString(value.updatedAt),
    startedAt: asOptionalTrimmedString(value.startedAt),
    completedAt: asOptionalTrimmedString(value.completedAt),
    canceledAt: asOptionalTrimmedString(value.canceledAt),
    source: {
      filePath: asOptionalTrimmedString(source.filePath),
      fileName: asOptionalTrimmedString(source.fileName),
      totalPages: asOptionalPositiveInteger(source.totalPages) ?? 0,
      weightedPageCost: typeof source.weightedPageCost === 'number' && Number.isFinite(source.weightedPageCost)
        ? source.weightedPageCost
        : 0,
      pageRange: Array.isArray(source.pageRange)
        && source.pageRange.length === 2
        && typeof source.pageRange[0] === 'number'
        && typeof source.pageRange[1] === 'number'
          ? [source.pageRange[0], source.pageRange[1]] as [number, number]
          : undefined,
    },
    processing: {
      pagePreprocessingConcurrency: asOptionalPositiveInteger(processing.pagePreprocessingConcurrency) ?? 0,
      chunkExtractionConcurrency: asOptionalPositiveInteger(processing.chunkExtractionConcurrency) ?? 0,
    },
    request: {
      projectId: asOptionalTrimmedString(request.projectId),
      overrideBoreholeId: asOptionalTrimmedString(request.overrideBoreholeId),
    },
    execution: {
      pid: asOptionalPositiveInteger(execution.pid),
      runCount: asOptionalPositiveInteger(execution.runCount) ?? 0,
      lastHeartbeatAt: asOptionalTrimmedString(execution.lastHeartbeatAt),
      lastError: asOptionalTrimmedString(execution.lastError),
      cancelRequested: execution.cancelRequested === true,
    },
    segmentation,
    pageCounts,
    pages,
    result,
  };
}

function renderIngestJobRecord(
  job: NormalizedIngestJobRecord,
  options?: {
    title?: string;
    includeCommands?: boolean;
  },
): void {
  heading(options?.title ?? 'Geotechnical Ingest Job');
  keyValue('Job ID', job.jobId);
  keyValue('Status', job.status);
  keyValue('Document type', job.documentType);
  keyValue('Source', job.source.fileName ?? job.source.filePath ?? 'Unknown');
  keyValue('Pages', String(job.source.totalPages));
  keyValue('Weighted page cost', String(job.source.weightedPageCost));
  if (job.source.pageRange) {
    keyValue('Selected range', formatPageRange(job.source.pageRange) ?? 'Unavailable');
  }
  if (job.segmentation && job.segmentation.mode !== 'single') {
    keyValue('Segmentation mode', job.segmentation.mode);
    if (job.segmentation.segmentCount) {
      keyValue('Segments', String(job.segmentation.segmentCount));
    }
    if (job.segmentation.effectivePageLimit) {
      keyValue('Effective-page window', String(job.segmentation.effectivePageLimit));
    }
  }
  keyValue('Completed pages', String(job.pageCounts.completed));
  keyValue('Failed pages', String(job.pageCounts.failed));
  keyValue('Pending pages', String(job.pageCounts.pending));
  if (job.request.projectId) {
    keyValue('Project', job.request.projectId);
  }
  if (job.request.overrideBoreholeId) {
    keyValue('Override borehole ID', job.request.overrideBoreholeId);
  }
  if (job.processing.pagePreprocessingConcurrency > 0) {
    keyValue('Preprocess concurrency', String(job.processing.pagePreprocessingConcurrency));
  }
  if (job.processing.chunkExtractionConcurrency > 0) {
    keyValue('Extraction concurrency', String(job.processing.chunkExtractionConcurrency));
  }
  if (job.createdAt) {
    keyValue('Created', job.createdAt);
  }
  if (job.startedAt) {
    keyValue('Started', job.startedAt);
  }
  if (job.completedAt) {
    keyValue('Completed', job.completedAt);
  }
  if (job.canceledAt) {
    keyValue('Canceled', job.canceledAt);
  }
  if (job.execution.pid) {
    keyValue('Worker PID', String(job.execution.pid));
  }
  if (job.execution.runCount > 0) {
    keyValue('Run count', String(job.execution.runCount));
  }
  if (job.execution.lastHeartbeatAt) {
    keyValue('Last heartbeat', job.execution.lastHeartbeatAt);
  }
  if (job.result?.persistedReview?.datasetName) {
    keyValue('Stored review', job.result.persistedReview.datasetName);
  }

  if (job.segmentation?.segments.length) {
    console.log('');
    console.log(chalk.white('  Segments:'));
    renderTable(
      ['Segment', 'Pages', 'Status', 'Completed', 'Failed'],
      job.segmentation.segments.map((segment) => [
        String(segment.segmentIndex),
        `${segment.startPage}-${segment.endPage}`,
        segment.status ?? 'queued',
        segment.completedPages != null ? String(segment.completedPages) : '-',
        segment.failedPages != null ? String(segment.failedPages) : '-',
      ]),
    );
  }

  const downgradedPages = job.pages.filter((page) => page.downgraded);
  const failedPages = job.pages.filter((page) => page.status === 'failed');
  if (failedPages.length > 0) {
    console.log('');
    console.log(chalk.white('  Failed pages:'));
    for (const page of failedPages.slice(0, 10)) {
      const message = page.downgraded
        ? `Page ${page.pageNumber} downgraded to manual review${page.error ? `: ${page.error}` : ''}`
        : `Page ${page.pageNumber}${page.error ? `: ${page.error}` : ''}`;
      (page.downgraded ? warn : error)(message);
    }
  }

  if (job.execution.lastError) {
    console.log('');
    console.log(chalk.white('  Worker error:'));
    error(job.execution.lastError);
  } else if (downgradedPages.length > 0) {
    console.log('');
    console.log(chalk.white('  Downgraded pages:'));
    warn(`${downgradedPages.length} slow visual page(s) were downgraded to manual review.`);
  }

  if (options?.includeCommands) {
    console.log('');
    console.log(chalk.white('  Next steps:'));
    info(`geotech ingest status ${job.jobId}`);
    info(`geotech ingest wait ${job.jobId}`);
    info(`geotech ingest result ${job.jobId}`);
    info(`geotech ingest wait ${job.jobId} --format html`);
    info(`geotech ingest result ${job.jobId} --format html`);
    info(`geotech ingest resume ${job.jobId}`);
    info(`geotech ingest cancel ${job.jobId}`);
  }

  console.log('');
}

function renderIngestJobResult(job: NormalizedIngestJobRecord): void {
  if (!job.result?.ingestResult) {
    throw new Error(`Persisted ingest job "${job.jobId}" does not have a completed result yet.`);
  }

  const persistedReview = job.result.persistedReview
    ? {
        projectId: job.request.projectId ?? 'Unknown',
        datasetName: job.result.persistedReview.datasetName,
        reviewId: job.result.persistedReview.reviewId,
        createdAt: job.result.persistedReview.createdAt,
      }
    : null;

  if (job.result.ingestResult.documentType === 'geotech-document') {
    renderGeotechDocumentResultReport(job.result.ingestResult, {
      title: 'Geotechnical Document Ingest Result',
      sourceLabel: job.result.ingestResult.source.fileName ?? job.result.ingestResult.source.filePath,
      persistedReview,
    });
    return;
  }

  renderIngestResultReport(job.result.ingestResult, {
    title: 'Geotechnical Ingest Result',
    sourceLabel: job.result.ingestResult.source.fileName ?? job.result.ingestResult.source.filePath,
    persistedReview,
  });
}

export function registerIngestCommand(program: Command): void {
  const cmd = new Command('ingest')
    .description('Extract structured geotechnical data from image/PDF documents')
    .enablePositionalOptions()
    .argument('<file>', 'Path to a geotechnical image or PDF document')
    .option('--type <type>', 'Document type to ingest', 'borehole-log')
    .option('--format <format>', 'Result presentation format: plain or html', 'plain')
    .option('--page-range <start:end>', 'Restrict PDF ingest to a contiguous page range, for example 61:102')
    .option('--borehole-id <id>', 'Override borehole ID for a single continuous borehole log')
    .option('--project <id>', 'Persist the ingest review into a stored project')
    .action(async (filePath, opts) => {
      const flags = getGlobalFlags(opts);
      const outputFormat = resolveIngestPresentationFormat((opts as { format?: unknown }).format);
      assertIngestPresentationMode(flags, outputFormat);
      const wantsHtmlDossier = shouldRenderHtmlDossier(outputFormat, flags.output);
      const documentType = String(opts.type ?? 'borehole-log').toLowerCase();
      const supportedTypes = new Set(['borehole-log', 'geotech-document']);

      if (!supportedTypes.has(documentType)) {
        throw new Error(`Unsupported ingest type "${documentType}". This MVP currently supports --type borehole-log and --type geotech-document.`);
      }

      let spinner: ReturnType<typeof startProgress> | null = null;
      try {
        const file = readVisionInput(filePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        const selectedPageRange = file.kind === 'pdf'
          ? parsePageRange((opts as { pageRange?: unknown }).pageRange)
          : undefined;
        if (selectedPageRange && file.kind !== 'pdf') {
          throw new Error('--page-range is only supported for PDF ingest.');
        }
        let countedPdfPages: number | null = null;
        if (file.kind === 'pdf') {
          try {
            countedPdfPages = await countPdfPages(filePath);
          } catch {
            countedPdfPages = null;
          }
        }

        if (selectedPageRange && countedPdfPages != null && selectedPageRange.endPage > countedPdfPages) {
          throw new Error(`--page-range ${selectedPageRange.startPage}:${selectedPageRange.endPage} exceeds the PDF page count (${countedPdfPages}).`);
        }

        const shouldInspectPdf =
          file.kind === 'pdf'
          && (
            selectedPageRange != null
            || countedPdfPages == null
            || countedPdfPages <= 5
            || documentType === 'geotech-document'
          );
        const inspection =
          file.kind === 'pdf' && shouldInspectPdf
            ? inspectPdfDocument(filePath)
            : null;
        const fullInspection = inspection && inspection.totalPages > 0 ? inspection : null;
        if (selectedPageRange && fullInspection && selectedPageRange.endPage > fullInspection.totalPages) {
          throw new Error(`--page-range ${selectedPageRange.startPage}:${selectedPageRange.endPage} exceeds the PDF page count (${fullInspection.totalPages}).`);
        }

        const effectiveInspection =
          fullInspection && selectedPageRange
            ? slicePdfInspectionToRange(fullInspection, selectedPageRange)
            : fullInspection;
        const totalPages =
          effectiveInspection?.totalPages
          ?? countedPdfPages
          ?? (selectedPageRange ? (selectedPageRange.endPage - selectedPageRange.startPage + 1) : null)
          ?? fullInspection?.totalPages
          ?? effectiveInspection?.totalPages
          ?? 1;
        const weightedPageCost =
          file.kind === 'pdf'
            ? (effectiveInspection ? computeWeightedPdfPageCost(effectiveInspection) : totalPages)
            : 1;
        const shouldCreateSegmentedParent =
          file.kind === 'pdf'
          && shouldSegmentHostedBetaLongPdf(
            documentType as 'borehole-log' | 'geotech-document',
            config,
            fullInspection,
            selectedPageRange,
          );
        const segmentationSummary: IngestSegmentationSummary | undefined =
          shouldCreateSegmentedParent && fullInspection
            ? {
                mode: 'segmented-parent',
                pageRange: [
                  selectedPageRange?.startPage ?? 1,
                  selectedPageRange?.endPage ?? fullInspection.totalPages,
                ],
                effectivePageLimit: HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
                segmentCount: buildPersistedIngestJobSegments(fullInspection, {
                  pageRange: selectedPageRange,
                  effectivePageLimit: HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
                }).length,
                segments: buildPersistedIngestJobSegments(fullInspection, {
                  pageRange: selectedPageRange,
                  effectivePageLimit: HOSTED_BETA_EFFECTIVE_PAGE_LIMIT,
                }).map((segment, index, segments) => ({
                  ...segment,
                  segmentIndex: index + 1,
                  segmentCount: segments.length,
                  status: 'queued',
                })),
              }
            : undefined;
        const shouldRunAsJob =
          file.kind === 'pdf'
          && (shouldCreateSegmentedParent || shouldUseAsyncIngestJob(effectiveInspection, totalPages));

        if (flags.dryRun) {
          if (shouldRunAsJob) {
            const dryRun = {
              kind: 'geotech-ingest-job-dry-run',
              documentType,
              source: {
                filePath,
                inputKind: 'pdf',
              },
              projectId: opts.project as string | undefined,
              totalPages,
              weightedPageCost,
              wouldCreateBackgroundJob: true,
              pagePreprocessingConcurrency: 2,
              chunkExtractionConcurrency: resolvePersistedIngestJobExtractionConcurrency(config, effectiveInspection, segmentationSummary),
              pageRange: selectedPageRange ? [selectedPageRange.startPage, selectedPageRange.endPage] : undefined,
              segmentation: segmentationSummary,
              pageClassifications: effectiveInspection?.pages.map((page) => ({
                pageNumber: page.pageNumber,
                classification: page.classification,
              })) ?? [],
              overrideBoreholeId: opts.boreholeId as string | undefined,
            };

            if (flags.json) {
              renderJSON(dryRun);
              return;
            }

            heading('Geotechnical Ingest Job Dry Run');
            keyValue('Document type', documentType);
            keyValue('Source', filePath);
            keyValue('Input kind', 'pdf');
            keyValue('Pages', String(totalPages));
            keyValue('Weighted page cost', String(weightedPageCost));
            keyValue('Would create background job', 'Yes');
            if (selectedPageRange) {
              keyValue('Selected range', formatPageRange(selectedPageRange) ?? 'Unavailable');
            }
            if (segmentationSummary?.segments?.length) {
              keyValue(
                'Segmentation',
                `Hosted-beta best-result window is ${HOSTED_BETA_EFFECTIVE_PAGE_LIMIT} effective pages; processing as ${segmentationSummary.segments.map((segment) => `${segment.startPage}-${segment.endPage}`).join(', ')}`,
              );
            }
            if (opts.project) {
              keyValue('Project', String(opts.project));
            }
            if (opts.boreholeId) {
              keyValue('Override borehole ID', String(opts.boreholeId));
            }
            console.log('');
            return;
          }

          const dryRun = {
            kind: 'geotech-ingest-dry-run',
            documentType,
              source: {
                filePath,
                inputKind: file.kind === 'pdf' ? 'pdf' : 'image',
              },
              wouldUseHostedVision: true,
              projectId: opts.project as string | undefined,
              totalPages,
              pageRange: selectedPageRange ? [selectedPageRange.startPage, selectedPageRange.endPage] : undefined,
              pageClassifications: effectiveInspection?.pages.map((page) => ({
                pageNumber: page.pageNumber,
                classification: page.classification,
              })) ?? Array.from({ length: totalPages }, (_, index) => ({
                pageNumber: index + 1,
              classification: 'n/a',
            })),
            overrideBoreholeId: opts.boreholeId as string | undefined,
          };

          if (flags.json) {
            renderJSON(dryRun);
            return;
          }

          heading('Geotechnical Ingest Dry Run');
          keyValue('Document type', documentType);
          keyValue('Source', filePath);
          keyValue('Input kind', file.kind === 'pdf' ? 'pdf' : 'image');
          keyValue('Pages', String(dryRun.totalPages));
          if (selectedPageRange) {
            keyValue('Selected range', formatPageRange(selectedPageRange) ?? 'Unavailable');
          }
          if (opts.project) {
            keyValue('Project', String(opts.project));
          }
          if (effectiveInspection) {
            keyValue('PDF classes', formatClassificationSummary(
              Object.fromEntries(
                effectiveInspection.pages.reduce((map, page) => {
                  map.set(page.classification, (map.get(page.classification) ?? 0) + 1);
                  return map;
                }, new Map<string, number>()),
              ),
            ));
          }
          if (opts.boreholeId) {
            keyValue('Override borehole ID', String(opts.boreholeId));
          }
          console.log('');
          return;
        }

        if (shouldRunAsJob) {
          if (wantsHtmlDossier && flags.output) {
            throw new Error(
              'HTML ingest dossiers are generated from completed results. Start the job first, then run geotech ingest wait <jobId> --format html --output <file>.',
            );
          }
          spinner = startProgress(flags, 'Creating resumable ingest job...');
          const job = createAndStartPersistedIngestJob({
            documentType: documentType as 'borehole-log' | 'geotech-document',
            filePath,
            inspection: effectiveInspection,
            config,
            projectId: opts.project as string | undefined,
            overrideBoreholeId: opts.boreholeId as string | undefined,
            pageRange: selectedPageRange ? [selectedPageRange.startPage, selectedPageRange.endPage] : undefined,
            segmentation: segmentationSummary,
          });
          const normalizedJob = normalizeIngestJobRecord(job);

          spinner?.succeed(`Ingest job started: ${job.jobId}`);
          if (flags.json) {
            renderJSON(job);
            return;
          }

          if (normalizedJob) {
            renderIngestJobRecord(normalizedJob, {
              title: 'Geotechnical Ingest Job Started',
              includeCommands: true,
            });
          }

          if (!flags.json && segmentationSummary?.segments?.length) {
            info(
              `Hosted-beta best-result window is ${HOSTED_BETA_EFFECTIVE_PAGE_LIMIT} effective pages; processing as linked segments ${segmentationSummary.segments.map((segment) => `${segment.startPage}-${segment.endPage}`).join(' and ')}.`,
            );
          }

          if (flags.output) {
            writeFileSync(flags.output, JSON.stringify(job, null, 2));
            success(`Job details saved to ${flags.output}`);
          }
          return;
        }

        spinner = startProgress(flags, 'Running geotechnical ingest...');
        const requestDetails = {
          prompt: documentType === 'borehole-log'
            ? 'Extract structured borehole log data.'
            : 'Extract structured geology, lithology, and geotechnical engineering parameters from this document.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 1500,
        };

        const result =
          file.kind === 'pdf'
            ? await (async () => {
                const scopedInspection = selectedPageRange && fullInspection
                  ? slicePdfInspectionToRange(fullInspection, selectedPageRange, { rebasePageNumbers: true })
                  : effectiveInspection;
                const pdfInputPath = selectedPageRange
                  ? join(
                      process.cwd(),
                      'tmp',
                      'cli-page-ranges',
                      `${slugifyOutputStem(basename(filePath))}-pages-${selectedPageRange.startPage}-${selectedPageRange.endPage}.pdf`,
                    )
                  : filePath;
                if (selectedPageRange) {
                  await writePdfPageSubset(filePath, selectedPageRange, pdfInputPath);
                }
                const pageInputs = await readVisionPdfPageInputs(pdfInputPath, { inspection: scopedInspection });
                for (const pageInput of pageInputs) {
                  maybeCheckHostedBetaVisionPayload(config, pageInput, requestDetails);
                }
                return documentType === 'borehole-log'
                  ? ingestBoreholeLogDocument({
                      config,
                      source: {
                        filePath,
                        fileName: basename(filePath),
                        inputKind: 'pdf',
                        pageRange: selectedPageRange ? [selectedPageRange.startPage, selectedPageRange.endPage] : undefined,
                      },
                      overrideBoreholeId: opts.boreholeId as string | undefined,
                      inspection: scopedInspection,
                      pages: pageInputs,
                    })
                  : ingestGeotechDocument({
                      config,
                      source: {
                        filePath,
                        fileName: basename(filePath),
                        inputKind: 'pdf',
                        pageRange: selectedPageRange ? [selectedPageRange.startPage, selectedPageRange.endPage] : undefined,
                      },
                      inspection: scopedInspection,
                      pages: pageInputs,
                    });
              })()
            : await (async () => {
                maybeCheckHostedBetaVisionPayload(config, file, requestDetails);
                return documentType === 'borehole-log'
                  ? ingestBoreholeLogDocument({
                      config,
                      source: {
                        filePath,
                        fileName: basename(filePath),
                        inputKind: 'image',
                      },
                      overrideBoreholeId: opts.boreholeId as string | undefined,
                      image: file,
                    })
                  : ingestGeotechDocument({
                      config,
                      source: {
                        filePath,
                        fileName: basename(filePath),
                        inputKind: 'image',
                      },
                      image: file,
                    });
              })();
        const boreholeResult =
          documentType === 'borehole-log'
            ? result as Awaited<ReturnType<typeof ingestBoreholeLogDocument>>
            : null;
        const geotechDocumentResult =
          documentType === 'geotech-document'
            ? result as Awaited<ReturnType<typeof ingestGeotechDocument>>
            : null;

        const persistedReview = opts.project
          ? persistProjectIngestReview(String(opts.project), result)
          : null;

        spinner?.succeed(boreholeResult
          ? `Ingest complete: ${boreholeResult.boreholes.length} borehole(s), ${boreholeResult.source.successfulPages}/${boreholeResult.source.totalPages} page(s) processed`
          : `Ingest complete: ${geotechDocumentResult?.materials.length ?? 0} material observation(s), ${geotechDocumentResult?.parameters.length ?? 0} parameter(s), ${geotechDocumentResult?.source.successfulPages ?? 0}/${geotechDocumentResult?.source.totalPages ?? 0} page(s) processed`);

        if (flags.json) {
          renderJSON(result);
          return;
        }

        const persistedReviewDetails = persistedReview
          ? {
              projectId: String(opts.project),
              datasetName: persistedReview.datasetName,
              reviewId: persistedReview.reviewId,
              createdAt: persistedReview.createdAt,
            }
          : null;

        if (boreholeResult) {
          renderIngestResultReport(boreholeResult, {
            sourceLabel: boreholeResult.source.fileName ?? boreholeResult.source.filePath ?? filePath,
            persistedReview: persistedReviewDetails,
          });
        } else if (geotechDocumentResult) {
          renderGeotechDocumentResultReport(geotechDocumentResult, {
            sourceLabel: geotechDocumentResult.source.fileName ?? geotechDocumentResult.source.filePath ?? filePath,
            persistedReview: persistedReviewDetails,
          });
        }

        if (wantsHtmlDossier) {
          writeHtmlDossier(result, {
            outputPath: flags.output,
            sourceLabel: result.source.fileName ?? result.source.filePath ?? filePath,
            storedReview: persistedReviewDetails,
          });
        } else if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
      } catch (err) {
        spinner?.fail('Geotechnical ingest failed');
        throw err;
      }
    });

  const reviewCmd = new Command('review')
    .description('Inspect a persisted geotechnical ingest review from a stored project')
    .argument('<projectId>', 'Stored project id containing persisted ingest reviews')
    .option('--format <format>', 'Result presentation format: plain or html', 'plain')
    .option(
      '--dataset <name>',
      'Specific persisted ingest review dataset name; defaults to the latest saved review in the project',
    )
    .option('--list', 'List persisted ingest reviews in the project')
    .action(async (...args: unknown[]) => {
      const [projectId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['list', 'dataset', 'format']);
      const flags = getGlobalFlags(resolvedOpts);
      const outputFormat = resolveIngestPresentationFormat(resolvedOpts.format);
      assertIngestPresentationMode(flags, outputFormat);
      const wantsHtmlDossier = shouldRenderHtmlDossier(outputFormat, flags.output);
      const resolvedProjectId = String(projectId);
      const datasetName = asOptionalTrimmedString(resolvedOpts.dataset);

      if (flags.dryRun) {
        const dryRun = createPersistedReviewDryRun(resolvedProjectId, datasetName);
        if (flags.json) {
          renderJSON(dryRun);
          return;
        }

        heading('Geotechnical Ingest Review Dry Run');
        keyValue('Project', resolvedProjectId);
        keyValue('Review dataset', datasetName ?? 'Latest persisted ingest review');
        keyValue('Would load persisted review', 'Yes');
        console.log('');
        return;
      }

      try {
        if (resolvedOpts.list) {
          if (wantsHtmlDossier) {
            throw new Error('HTML ingest dossiers are only available for a single persisted review. Remove --list or use plain/json output.');
          }
          const reviews = listPersistedBoreholeIngestReviews(resolvedProjectId);
          if (flags.json) {
            renderJSON(reviews);
            return;
          }

          heading('Persisted Ingest Reviews');
          keyValue('Project', resolvedProjectId);
          keyValue('Count', String(reviews.length));
          console.log('');
          renderTable(
            ['Dataset', 'Type', 'Created', 'Source', 'Confidence', 'Review', 'Auto', 'Approved'],
            reviews.map((record) => [
              record.datasetName,
              record.result.documentType,
              record.createdAt,
              record.result.source.fileName ?? record.result.source.filePath ?? record.title ?? record.result.documentType,
              `${record.summary.confidence}%`,
              record.summary.reviewRequired ? 'Yes' : 'No',
              record.summary.canAutoProceed ? 'Yes' : 'No',
              record.approval ? 'Yes' : 'No',
            ]),
          );
          console.log('');
          return;
        }

        const record = datasetName
          ? loadPersistedBoreholeIngestReview(resolvedProjectId, datasetName)
          : loadLatestPersistedBoreholeIngestReview(resolvedProjectId);

        if (!record) {
          throw new Error(
            datasetName
              ? `No persisted ingest review named "${datasetName}" was found in project "${resolvedProjectId}".`
              : `No persisted ingest reviews were found in project "${resolvedProjectId}".`,
          );
        }

        if (flags.json) {
          renderJSON(record);
          return;
        }

        renderPersistedReviewRecord(record, resolvedProjectId);

        if (wantsHtmlDossier) {
          const dossierDetails = buildPersistedReviewDossierDetails(record, resolvedProjectId);
          writeHtmlDossier(record.result, {
            outputPath: flags.output,
            sourceLabel: dossierDetails.sourceLabel,
            storedReview: dossierDetails.storedReview,
            approval: dossierDetails.approval,
          });
        } else if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(record, null, 2));
          success(`Review details saved to ${flags.output}`);
        }
      } catch (err) {
        throw err;
      }
    });

  const approveCmd = new Command('approve')
    .description('Record approval for a persisted geotechnical ingest review')
    .argument('<projectId>', 'Stored project id containing persisted ingest reviews')
    .option(
      '--dataset <name>',
      'Specific persisted ingest review dataset name; defaults to the latest saved review in the project',
    )
    .requiredOption('--note <text>', 'Approval rationale to store with the review')
    .option('--by <name>', 'Optional reviewer or approver label for the audit trail')
    .action(async (...args: unknown[]) => {
      const [projectId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['dataset', 'note', 'by']);
      const flags = getGlobalFlags(resolvedOpts);
      const resolvedProjectId = String(projectId);
      const datasetName = asOptionalTrimmedString(resolvedOpts.dataset);
      const note = asOptionalTrimmedString(resolvedOpts.note);
      const approvedBy = asOptionalTrimmedString(resolvedOpts.by);

      if (flags.dryRun) {
        const dryRun = createPersistedReviewApprovalDryRun(resolvedProjectId, datasetName, note, approvedBy);
        if (flags.json) {
          renderJSON(dryRun);
          return;
        }

        heading('Persisted Ingest Review Approval Dry Run');
        keyValue('Project', resolvedProjectId);
        keyValue('Review dataset', datasetName ?? 'Latest persisted ingest review');
        keyValue('Would load persisted review', 'Yes');
        keyValue('Would record approval', 'Yes');
        if (approvedBy) {
          keyValue('Approved by', approvedBy);
        }
        if (note) {
          console.log('');
          console.log(chalk.white('  Rationale:'));
          console.log(`    ${note}`);
        }
        console.log('');
        return;
      }

      const approval = approvePersistedBoreholeIngestReview(resolvedProjectId, datasetName, {
        rationale: note ?? '',
        approvedBy,
      });
      if (flags.json) {
        renderJSON(approval);
        return;
      }

      renderApprovalResult(approval, {
        projectId: resolvedProjectId,
        datasetName,
      });
      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(approval, null, 2));
        success(`Approval details saved to ${flags.output}`);
      }
    });

  const approvalsCmd = new Command('approvals')
    .description('Inspect approval history for persisted geotechnical ingest reviews')
    .argument('<projectId>', 'Stored project id containing persisted ingest review approvals')
    .option(
      '--dataset <name>',
      'Specific persisted ingest review dataset name to filter approval history',
    )
    .option(
      '--approval <name>',
      'Specific approval dataset name to load instead of listing approval history',
    )
    .option(
      '--latest',
      'Load the latest approval for the selected review dataset instead of listing approval history',
    )
    .action(async (...args: unknown[]) => {
      const [projectId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['dataset', 'approval', 'latest']);
      const flags = getGlobalFlags(resolvedOpts);
      const resolvedProjectId = String(projectId);
      const reviewDatasetName = asOptionalTrimmedString(resolvedOpts.dataset);
      const approvalDatasetName = asOptionalTrimmedString(resolvedOpts.approval);
      const latestOnly = resolvedOpts.latest === true;

      if (latestOnly && !reviewDatasetName) {
        throw new Error('Loading the latest approval requires --dataset <review-dataset>.');
      }

      if (latestOnly && approvalDatasetName) {
        throw new Error('Use either --latest or --approval <name>, not both.');
      }

      if (flags.dryRun) {
        const dryRun = createPersistedReviewApprovalLookupDryRun(
          resolvedProjectId,
          reviewDatasetName,
          approvalDatasetName,
          latestOnly,
        );
        if (flags.json) {
          renderJSON(dryRun);
          return;
        }

        heading('Persisted Ingest Review Approval Lookup Dry Run');
        keyValue('Project', resolvedProjectId);
        if (reviewDatasetName) {
          keyValue('Review dataset', reviewDatasetName);
        }
        if (approvalDatasetName) {
          keyValue('Approval dataset', approvalDatasetName);
        }
        keyValue('Would list approvals', approvalDatasetName || latestOnly ? 'No' : 'Yes');
        keyValue('Would load approval', approvalDatasetName || latestOnly ? 'Yes' : 'No');
        console.log('');
        return;
      }

      if (approvalDatasetName || latestOnly) {
        const approval = approvalDatasetName
          ? loadPersistedBoreholeIngestReviewApproval(resolvedProjectId, approvalDatasetName)
          : loadLatestPersistedBoreholeIngestReviewApproval(resolvedProjectId, reviewDatasetName!);
        if (!approval) {
          throw new Error(
            approvalDatasetName
              ? `No persisted ingest review approval named "${approvalDatasetName}" was found in project "${resolvedProjectId}".`
              : `No persisted ingest review approvals were found for "${reviewDatasetName}" in project "${resolvedProjectId}".`,
          );
        }

        if (flags.json) {
          renderJSON(approval);
          return;
        }

        renderApprovalResult(approval, {
          projectId: resolvedProjectId,
          datasetName: reviewDatasetName,
        });
        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(approval, null, 2));
          success(`Approval details saved to ${flags.output}`);
        }
        return;
      }

      const approvals = listPersistedBoreholeIngestReviewApprovals(resolvedProjectId, reviewDatasetName);
      const latestByReviewDataset = new Map<string, string>();
      for (const approval of approvals) {
        if (!latestByReviewDataset.has(approval.reviewDatasetName)) {
          latestByReviewDataset.set(approval.reviewDatasetName, approval.datasetName);
        }
      }
      const approvalSummaries = approvals.map((approval) => ({
        datasetName: approval.datasetName,
        reviewDatasetName: approval.reviewDatasetName,
        approvedAt: approval.approvedAt,
        approvedBy: approval.approvedBy,
        rationale: approval.rationale,
        isLatestForReview: latestByReviewDataset.get(approval.reviewDatasetName) === approval.datasetName,
      }));

      if (flags.json) {
        renderJSON(approvalSummaries);
        return;
      }

      renderApprovalHistory(approvalSummaries, {
        projectId: resolvedProjectId,
        reviewDatasetName,
      });
      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(approvalSummaries, null, 2));
        success(`Approval history saved to ${flags.output}`);
      }
    });

  const promoteCmd = new Command('promote')
    .description('Promote a persisted borehole-log ingest review into project datasets')
    .argument('<projectId>', 'Stored project id containing persisted ingest reviews')
    .option(
      '--dataset <name>',
      'Specific persisted ingest review dataset name; defaults to the latest saved review in the project',
    )
    .action(async (...args: unknown[]) => {
      const [projectId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['dataset']);
      const flags = getGlobalFlags(resolvedOpts);
      const resolvedProjectId = String(projectId);
      const datasetName = asOptionalTrimmedString(resolvedOpts.dataset);

      if (flags.dryRun) {
        const dryRun = createPersistedReviewPromotionDryRun(resolvedProjectId, datasetName);
        if (flags.json) {
          renderJSON(dryRun);
          return;
        }

        heading('Persisted Ingest Review Promotion Dry Run');
        keyValue('Project', resolvedProjectId);
        keyValue('Review dataset', datasetName ?? 'Latest persisted ingest review');
        keyValue('Would load persisted review', 'Yes');
        keyValue('Would promote persisted review', 'Yes');
        console.log('');
        return;
      }

      const promotion = await Promise.resolve(promotePersistedBoreholeIngestReview(resolvedProjectId, datasetName));
      if (flags.json) {
        renderJSON(promotion);
        return;
      }

      renderPromotionResult(promotion, {
        projectId: resolvedProjectId,
        datasetName,
      });
      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(promotion, null, 2));
        success(`Promotion details saved to ${flags.output}`);
      }
    });

  const statusCmd = new Command('status')
    .description('Inspect a persisted geotechnical ingest job')
    .argument('<jobId>', 'Persisted ingest job id')
    .action(async (...args: unknown[]) => {
      const [jobId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command);
      const flags = getGlobalFlags(resolvedOpts);
      const record = loadPersistedIngestJob(String(jobId));
      if (!record) {
        throw new Error(`No persisted ingest job named "${jobId}" was found.`);
      }

      if (flags.json) {
        renderJSON(record);
        return;
      }

      const normalized = normalizeIngestJobRecord(record);
      if (!normalized) {
        throw new Error(`Persisted ingest job "${jobId}" could not be normalized.`);
      }
      renderIngestJobRecord(normalized, { title: 'Geotechnical Ingest Job Status', includeCommands: true });

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(record, null, 2));
        success(`Job details saved to ${flags.output}`);
      }
    });

  const waitCmd = new Command('wait')
    .description('Wait for a persisted geotechnical ingest job to finish')
    .argument('<jobId>', 'Persisted ingest job id')
    .option('--format <format>', 'Result presentation format: plain or html', 'plain')
    .action(async (...args: unknown[]) => {
      const [jobId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['format']);
      const flags = getGlobalFlags(resolvedOpts);
      const outputFormat = resolveIngestPresentationFormat(resolvedOpts.format);
      assertIngestPresentationMode(flags, outputFormat);
      const wantsHtmlDossier = shouldRenderHtmlDossier(outputFormat, flags.output);
      const record = await waitForPersistedIngestJob(String(jobId));
      const normalized = normalizeIngestJobRecord(record);
      if (!normalized) {
        throw new Error(`Persisted ingest job "${jobId}" could not be normalized.`);
      }

      if (record.status !== 'completed' || !normalized.result?.ingestResult) {
        if (flags.json) {
          renderJSON(record);
          return;
        }

        renderIngestJobRecord(normalized, { title: 'Geotechnical Ingest Job Status', includeCommands: true });
        throw new Error(`Persisted ingest job "${jobId}" finished with status "${record.status}".`);
      }

      if (flags.json) {
        renderJSON(record.result);
        return;
      }

      const completedResult = normalized.result.ingestResult;
      const persistedReview = normalized.result.persistedReview
        ? {
            projectId: normalized.request.projectId ?? 'Unknown',
            datasetName: normalized.result.persistedReview.datasetName,
            reviewId: normalized.result.persistedReview.reviewId,
            createdAt: normalized.result.persistedReview.createdAt,
          }
        : null;

      renderIngestJobResult(normalized);
      if (wantsHtmlDossier) {
        writeHtmlDossier(completedResult, {
          outputPath: flags.output,
          sourceLabel: completedResult.source.fileName ?? completedResult.source.filePath ?? normalized.jobId,
          storedReview: persistedReview,
        });
      } else if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(record.result, null, 2));
        success(`Results saved to ${flags.output}`);
      }
    });

  const resumeCmd = new Command('resume')
    .description('Resume a persisted geotechnical ingest job from completed checkpoints')
    .argument('<jobId>', 'Persisted ingest job id')
    .action(async (...args: unknown[]) => {
      const [jobId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command);
      const flags = getGlobalFlags(resolvedOpts);
      const record = resumePersistedIngestJob(String(jobId));

      if (flags.json) {
        renderJSON(record);
        return;
      }

      const normalized = normalizeIngestJobRecord(record);
      if (!normalized) {
        throw new Error(`Persisted ingest job "${jobId}" could not be normalized.`);
      }
      renderIngestJobRecord(normalized, { title: 'Geotechnical Ingest Job Resumed', includeCommands: true });

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(record, null, 2));
        success(`Job details saved to ${flags.output}`);
      }
    });

  const resultCmd = new Command('result')
    .description('Load the completed result for a persisted geotechnical ingest job')
    .argument('<jobId>', 'Persisted ingest job id')
    .option('--format <format>', 'Result presentation format: plain or html', 'plain')
    .action(async (...args: unknown[]) => {
      const [jobId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command, ['format']);
      const flags = getGlobalFlags(resolvedOpts);
      const outputFormat = resolveIngestPresentationFormat(resolvedOpts.format);
      assertIngestPresentationMode(flags, outputFormat);
      const wantsHtmlDossier = shouldRenderHtmlDossier(outputFormat, flags.output);
      const record = loadPersistedIngestJob(String(jobId));
      const result = loadPersistedIngestJobResult(String(jobId));
      if (!record || !result) {
        throw new Error(`Persisted ingest job "${jobId}" does not have a completed result yet.`);
      }

      if (flags.json) {
        renderJSON(result);
        return;
      }

      const normalized = normalizeIngestJobRecord(record);
      if (!normalized) {
        throw new Error(`Persisted ingest job "${jobId}" could not be normalized.`);
      }
      if (!normalized.result?.ingestResult) {
        throw new Error(`Persisted ingest job "${jobId}" does not have a normalized completed result.`);
      }
      const completedResult = normalized.result.ingestResult;
      const persistedReview = normalized.result.persistedReview
        ? {
            projectId: normalized.request.projectId ?? 'Unknown',
            datasetName: normalized.result.persistedReview.datasetName,
            reviewId: normalized.result.persistedReview.reviewId,
            createdAt: normalized.result.persistedReview.createdAt,
          }
        : null;
      renderIngestJobResult(normalized);

      if (wantsHtmlDossier) {
        writeHtmlDossier(completedResult, {
          outputPath: flags.output,
          sourceLabel: completedResult.source.fileName ?? completedResult.source.filePath ?? normalized.jobId,
          storedReview: persistedReview,
        });
      } else if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(result, null, 2));
        success(`Results saved to ${flags.output}`);
      }
    });

  const cancelCmd = new Command('cancel')
    .description('Cancel a persisted geotechnical ingest job')
    .argument('<jobId>', 'Persisted ingest job id')
    .action(async (...args: unknown[]) => {
      const [jobId, opts, command] = args as [string, unknown, unknown];
      const resolvedOpts = resolveCommandOptions(opts, command);
      const flags = getGlobalFlags(resolvedOpts);
      const record = cancelPersistedIngestJob(String(jobId));

      if (flags.json) {
        renderJSON(record);
        return;
      }

      const normalized = normalizeIngestJobRecord(record);
      if (!normalized) {
        throw new Error(`Persisted ingest job "${jobId}" could not be normalized.`);
      }
      renderIngestJobRecord(normalized, { title: 'Geotechnical Ingest Job Canceled', includeCommands: true });

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(record, null, 2));
        success(`Job details saved to ${flags.output}`);
      }
    });

  addGlobalFlags(cmd);
  addGlobalFlags(reviewCmd);
  addGlobalFlags(approveCmd);
  addGlobalFlags(approvalsCmd);
  addGlobalFlags(promoteCmd);
  addGlobalFlags(statusCmd);
  addGlobalFlags(waitCmd);
  addGlobalFlags(resumeCmd);
  addGlobalFlags(resultCmd);
  addGlobalFlags(cancelCmd);
  reviewCmd.addCommand(approveCmd);
  reviewCmd.addCommand(approvalsCmd);
  reviewCmd.addCommand(promoteCmd);
  cmd.addCommand(reviewCmd);
  cmd.addCommand(statusCmd);
  cmd.addCommand(waitCmd);
  cmd.addCommand(resumeCmd);
  cmd.addCommand(resultCmd);
  cmd.addCommand(cancelCmd);
  program.addCommand(cmd);
}

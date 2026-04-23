import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { LLMConfig } from '../llm/types.js';
import {
  addArtifact,
  addNote,
  addSoilProfile,
  loadProject,
  saveNamedDataset,
  setActiveAnalysisContext,
  type ProjectData,
  type ProjectDataset,
  type SoilProfile,
} from '../storage/index.js';
import {
  readDocumentPdfPageInputs,
  readDocumentVisionInput,
  type DocumentInputKind,
} from './document-inputs.js';
import {
  ingestBoreholeLogDocument,
  type BoreholeDocumentIngestResult,
  type BoreholeIngestFinding,
} from './geotech-extract.js';
import {
  ingestGeotechDocument,
  type GeotechDocumentFinding,
  type GeotechDocumentIngestResult,
} from './geotech-document.js';
import { inspectPdfDocument, type PdfDocumentInspection } from './pdf.js';

type PersistedIngestResult = BoreholeDocumentIngestResult | GeotechDocumentIngestResult;
type PersistedReviewFinding = BoreholeIngestFinding | GeotechDocumentFinding;
type PersistedDocumentType = PersistedIngestResult['documentType'];
type GeotechIngestJobStatus = 'queued' | 'running' | 'completed' | 'failed';
type PromotionDatasetRole =
  | 'raw-borehole'
  | 'soil-profile'
  | 'document-insight'
  | 'material-observations'
  | 'parameter-catalog'
  | 'classification-summary'
  | 'promotion-result'
  | 'snapshot';

export interface PersistedIngestSourceStamps {
  sourceFingerprint: string;
  parserVersion: string;
  normalizedResultHash: string;
}

export interface PersistedGeotechIngestJobSourceStamps {
  sourceFingerprint: string;
  parserVersion: string;
  normalizedResultHash?: string;
}

export interface PersistedBoreholeIngestReviewSummary {
  reviewRequired: boolean;
  canAutoProceed: boolean;
  confidence: number;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  boreholeCount: number;
  boreholeIds: string[];
  blockingFindings: number;
  reviewFindings: number;
  advisoryFindings: number;
}

export interface PersistedBoreholeIngestReviewRecord {
  kind: 'geotech-ingest-review-record';
  schemaVersion: 1;
  reviewId: string;
  datasetName: string;
  projectId: string;
  createdAt: string;
  title: string;
  result: PersistedIngestResult;
  summary: PersistedBoreholeIngestReviewSummary;
  sourceStamps: PersistedIngestSourceStamps;
  approval?: PersistedBoreholeIngestReviewApprovalRecord;
}

export interface PersistBoreholeIngestReviewOptions {
  title?: string;
  sourceStamps?: Partial<PersistedIngestSourceStamps>;
}

export interface PersistedBoreholeIngestReviewApprovalRecord {
  kind: 'geotech-ingest-review-approval-record';
  schemaVersion: 1;
  approvalId: string;
  datasetName: string;
  projectId: string;
  reviewId: string;
  reviewDatasetName: string;
  approvedAt: string;
  approvedBy?: string;
  rationale: string;
  sourceSummary: PersistedBoreholeIngestReviewSummary;
  sourceStamps?: PersistedIngestSourceStamps;
  validForCurrentReview?: boolean;
  invalidationReasons?: string[];
}

export interface PersistedBoreholeIngestReviewApprovalSummary {
  approvalId: string;
  datasetName: string;
  projectId: string;
  reviewId: string;
  reviewDatasetName: string;
  approvedAt: string;
  approvedBy?: string;
  rationale: string;
  isLatestForReview: boolean;
  isValidForCurrentReview: boolean;
  invalidationReasons?: string[];
}

export interface ApprovePersistedBoreholeIngestReviewOptions {
  rationale: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PromotedBoreholeIngestReviewItem {
  boreholeId: string;
  rawDatasetName: string;
  soilProfileDatasetName?: string;
  promotedSoilProfile: boolean;
  supersededDatasetNames: string[];
  snapshotDatasetNames: string[];
  warnings: string[];
}

export interface PromotedGeotechDocumentIngestReviewItem {
  role: 'document-insight' | 'material-observations' | 'parameter-catalog' | 'classification-summary';
  datasetName: string;
  datasetKind: 'document-insight' | 'material-observations' | 'parameter-catalog' | 'classification-summary';
  supersededDatasetNames: string[];
  snapshotDatasetNames: string[];
  warnings: string[];
}

export interface PromotedBoreholeIngestReviewResult {
  kind: 'geotech-ingest-promotion-result';
  schemaVersion: 1;
  projectId: string;
  documentType: PersistedDocumentType;
  sourceDatasetName: string;
  sourceReviewDatasetName: string;
  sourceReviewId: string;
  sourceStamps: PersistedIngestSourceStamps;
  approvalDatasetName?: string;
  approvalId?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvalRationale?: string;
  promotedAt: string;
  promotionDatasetName: string;
  promotedDatasetNames: string[];
  promotedDatasetKinds: string[];
  promotedBoreholeIds: string[];
  supersededDatasetNames: string[];
  snapshotDatasetNames: string[];
  promotedBoreholes: PromotedBoreholeIngestReviewItem[];
  promotedDocuments: PromotedGeotechDocumentIngestReviewItem[];
  warnings: string[];
}

export interface PersistedGeotechIngestJobReviewLink {
  reviewId: string;
  datasetName: string;
  title: string;
  summary: PersistedBoreholeIngestReviewSummary;
  sourceStamps: PersistedIngestSourceStamps;
}

export interface PersistedGeotechIngestJobRecord {
  kind: 'geotech-ingest-job-record';
  schemaVersion: 1;
  jobId: string;
  datasetName: string;
  projectId: string;
  documentType: PersistedDocumentType;
  title: string;
  status: GeotechIngestJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  request: {
    path: string;
    boreholeId?: string;
    persistReview: boolean;
    reviewTitle?: string;
  };
  source: {
    filePath: string;
    fileName: string;
    inputKind: Extract<DocumentInputKind, 'image' | 'pdf'>;
    fileBytes: number;
    totalPages?: number;
  };
  inspection: {
    totalPages: number;
    warnings: string[];
    parserVersion: string;
  } | null;
  sourceStamps: PersistedGeotechIngestJobSourceStamps;
  result?: PersistedIngestResult;
  resultSummary?: PersistedBoreholeIngestReviewSummary;
  persistedReview?: PersistedGeotechIngestJobReviewLink;
  error?: string;
}

export interface StartGeotechIngestJobOptions {
  path: string;
  type?: PersistedDocumentType;
  boreholeId?: string;
  persistReview?: boolean;
  reviewTitle?: string;
}

export interface WaitGeotechIngestJobOptions {
  config: LLMConfig;
}

export interface LoadedGeotechIngestJobResult {
  jobId: string;
  datasetName: string;
  projectId: string;
  documentType: PersistedDocumentType;
  completedAt: string;
  sourceStamps: PersistedIngestSourceStamps;
  result: PersistedIngestResult;
  resultSummary: PersistedBoreholeIngestReviewSummary;
  persistedReview?: PersistedGeotechIngestJobReviewLink;
}

export type PersistedIngestReviewSummary = PersistedBoreholeIngestReviewSummary;
export type PersistedIngestReviewRecord = PersistedBoreholeIngestReviewRecord;
export type PersistIngestReviewOptions = PersistBoreholeIngestReviewOptions;
export type PersistedIngestReviewApprovalRecord = PersistedBoreholeIngestReviewApprovalRecord;
export type PersistedIngestReviewApprovalSummary = PersistedBoreholeIngestReviewApprovalSummary;
export type ApprovePersistedIngestReviewOptions = ApprovePersistedBoreholeIngestReviewOptions;
export type PersistedIngestJobRecord = PersistedGeotechIngestJobRecord;
export type PromotedIngestReviewResult = PromotedBoreholeIngestReviewResult;

interface PersistedBoreholeIngestReviewPointer {
  kind: 'geotech-ingest-review-pointer';
  schemaVersion: 1;
  datasetName: string;
  reviewId: string;
  updatedAt: string;
}

interface PersistedBoreholeIngestReviewApprovalPointer {
  kind: 'geotech-ingest-review-approval-pointer';
  schemaVersion: 1;
  reviewId: string;
  reviewDatasetName: string;
  approvalDatasetName: string;
  approvalId: string;
  updatedAt: string;
}

interface PersistedGeotechIngestJobPointer {
  kind: 'geotech-ingest-job-pointer';
  schemaVersion: 1;
  datasetName: string;
  jobId: string;
  updatedAt: string;
}

interface IngestPromotionSnapshotRecord {
  kind: 'geotech-ingest-promotion-snapshot-record';
  schemaVersion: 1;
  snapshotDatasetName: string;
  targetDatasetName: string;
  sourceReviewDatasetName: string;
  sourceReviewId: string;
  promotionDatasetName: string;
  promotedAt: string;
  previousDataset: ProjectDataset;
}

interface PromotedDocumentInsightRecord {
  kind: 'document-insight-record';
  schemaVersion: 1;
  reviewId: string;
  reviewDatasetName: string;
  sourceStamps: PersistedIngestSourceStamps;
  documentClass: string | null;
  title: string | null;
  summary: string | null;
  risks: string[];
  recommendations: string[];
  materialCount: number;
  classificationCount: number;
  parameterCount: number;
  source: GeotechDocumentIngestResult['source'];
}

interface PromotedMaterialObservationsRecord {
  kind: 'material-observations-record';
  schemaVersion: 1;
  reviewId: string;
  reviewDatasetName: string;
  sourceStamps: PersistedIngestSourceStamps;
  materials: GeotechDocumentIngestResult['materials'];
}

interface PromotedParameterCatalogRecord {
  kind: 'parameter-catalog-record';
  schemaVersion: 1;
  reviewId: string;
  reviewDatasetName: string;
  sourceStamps: PersistedIngestSourceStamps;
  parameters: GeotechDocumentIngestResult['parameters'];
}

interface PromotedClassificationSummaryRecord {
  kind: 'classification-summary-record';
  schemaVersion: 1;
  reviewId: string;
  reviewDatasetName: string;
  sourceStamps: PersistedIngestSourceStamps;
  classifications: GeotechDocumentIngestResult['classifications'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeForStableHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableHash(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForStableHash(value[key])]),
    );
  }

  return value;
}

function stableHash(value: unknown): string {
  return hashString(JSON.stringify(normalizeForStableHash(value)));
}

function isBoreholeIngestResult(result: PersistedIngestResult): result is BoreholeDocumentIngestResult {
  return result.documentType === 'borehole-log';
}

function isGeotechDocumentIngestResult(result: PersistedIngestResult): result is GeotechDocumentIngestResult {
  return result.documentType === 'geotech-document';
}

function reviewSourceLabel(result: PersistedIngestResult): string {
  return result.source.fileName ?? result.source.filePath ?? result.documentType;
}

function buildReviewId(result: PersistedIngestResult): string {
  const sourceToken = sanitizeToken(reviewSourceLabel(result)) || result.documentType;
  const timestampToken = buildTimestampToken(result.generatedAt);
  return `${timestampToken}-${sourceToken}`;
}

function buildApprovalId(reviewId: string, approvedAt: string): string {
  const reviewToken = sanitizeToken(reviewId) || 'review';
  const timestampToken = buildTimestampToken(approvedAt);
  return `${timestampToken}-${reviewToken}`;
}

function buildApprovalDatasetName(reviewId: string, approvedAt: string): string {
  return `ingest-review-approval:${reviewId}:${buildTimestampToken(approvedAt)}`;
}

function buildApprovalPointerDatasetName(reviewId: string): string {
  return `ingest-review-approval:latest:${reviewId}`;
}

function buildJobId(documentType: PersistedDocumentType, path: string, createdAt: string): string {
  const sourceToken = sanitizeToken(basename(path) || path) || documentType;
  return `${buildTimestampToken(createdAt)}-${sanitizeToken(documentType)}-${sourceToken}`;
}

function buildJobDatasetName(jobId: string): string {
  return `ingest-job:${jobId}`;
}

function buildPromotedBoreholeDatasetName(reviewId: string, boreholeId: string): string {
  return `promoted-borehole:${reviewId}:${sanitizeToken(boreholeId) || 'unknown-borehole'}`;
}

function buildPromotedDocumentDatasetName(
  reviewId: string,
  role: PromotedGeotechDocumentIngestReviewItem['role'],
): string {
  return `${role}:${reviewId}`;
}

function buildPromotionDatasetName(reviewId: string): string {
  return `ingest-promotion:${reviewId}`;
}

function buildPromotionSnapshotDatasetName(
  reviewId: string,
  targetDatasetName: string,
  promotedAt: string,
): string {
  const datasetToken = sanitizeToken(targetDatasetName) || 'dataset';
  const timestampToken = buildTimestampToken(promotedAt);
  return `ingest-promotion-snapshot:${reviewId}:${datasetToken}:${timestampToken}`;
}

function summarizeInspectionForStamps(inspection: PdfDocumentInspection | null | undefined): unknown {
  if (!inspection) {
    return null;
  }

  return {
    kind: inspection.kind,
    totalPages: inspection.totalPages,
    capabilities: inspection.capabilities,
    degradation: inspection.degradation,
    gracefulDegradationNotes: inspection.gracefulDegradationNotes,
    metadata: inspection.metadata,
    warnings: inspection.warnings,
    pages: inspection.pages.map((page) => ({
      pageNumber: page.pageNumber,
      totalPages: page.totalPages,
      classification: page.classification,
      degradation: page.degradation,
      capabilities: page.capabilities,
      metadata: page.metadata,
      warnings: page.warnings,
    })),
  };
}

function summarizeInspectionForJob(inspection: PdfDocumentInspection | null): PersistedGeotechIngestJobRecord['inspection'] {
  if (!inspection) {
    return null;
  }

  return {
    totalPages: inspection.totalPages,
    warnings: inspection.warnings,
    parserVersion: inspection.metadata.parser,
  };
}

function buildParserVersionForInput(
  documentType: PersistedDocumentType,
  inspection?: PdfDocumentInspection | null,
): string {
  const ingestFamily = documentType === 'borehole-log' ? 'geotech-extract@1' : 'geotech-document@1';
  return `${ingestFamily}|result-schema@1|pdf-parser:${inspection?.metadata.parser ?? 'none'}`;
}

function normalizeBoreholeForHash(result: BoreholeDocumentIngestResult): unknown {
  return {
    kind: result.kind,
    schemaVersion: result.schemaVersion,
    documentType: result.documentType,
    source: result.source,
    inspectionSummary: result.inspectionSummary,
    inspection: summarizeInspectionForStamps(result.inspection),
    boreholes: result.boreholes.map((borehole) => ({
      boreholeId: borehole.boreholeId,
      projectName: borehole.projectName,
      location: borehole.location,
      groundElevation: borehole.groundElevation,
      dateDrilled: borehole.dateDrilled,
      drillingMethod: borehole.drillingMethod,
      totalDepth: borehole.totalDepth,
      waterTableDepth: borehole.waterTableDepth,
      layers: borehole.layers,
      summary: borehole.summary,
      pageNumber: borehole.pageNumber,
      totalPages: borehole.totalPages,
      continuationDepth: borehole.continuationDepth,
      parseStatus: borehole.parseStatus,
      confidence: borehole.confidence,
      warnings: borehole.warnings,
      canAutoProceed: borehole.canAutoProceed,
    })),
    pageAudits: result.pageAudits,
    pageFailures: result.pageFailures,
    warnings: result.warnings,
    reviewFindings: result.reviewFindings,
    reviewReasons: result.reviewReasons,
    reviewRequired: result.reviewRequired,
    confidence: result.confidence,
    canAutoProceed: result.canAutoProceed,
  };
}

function normalizeGeotechDocumentForHash(result: GeotechDocumentIngestResult): unknown {
  return {
    kind: result.kind,
    schemaVersion: result.schemaVersion,
    documentType: result.documentType,
    source: result.source,
    inspectionSummary: result.inspectionSummary,
    inspection: summarizeInspectionForStamps(result.inspection),
    documentClass: result.documentClass,
    title: result.title,
    summary: result.summary,
    materials: result.materials,
    classifications: result.classifications,
    parameters: result.parameters,
    risks: result.risks,
    recommendations: result.recommendations,
    pageAudits: result.pageAudits,
    pageFailures: result.pageFailures,
    warnings: result.warnings,
    reviewFindings: result.reviewFindings,
    reviewReasons: result.reviewReasons,
    parseStatus: result.parseStatus,
    confidence: result.confidence,
    reviewRequired: result.reviewRequired,
    canAutoProceed: result.canAutoProceed,
  };
}

function readSourceFileDigest(filePath: string | undefined): string | undefined {
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return undefined;
  }
}

function buildSourceFingerprintForInput(input: {
  documentType: PersistedDocumentType;
  filePath?: string;
  fileName?: string;
  inputKind: Extract<DocumentInputKind, 'image' | 'pdf'>;
  fileBytes?: number;
  totalPages?: number;
  inspection?: PdfDocumentInspection | null;
}): string {
  return stableHash({
    documentType: input.documentType,
    fileDigest: readSourceFileDigest(input.filePath),
    filePath: input.filePath,
    fileName: input.fileName,
    inputKind: input.inputKind,
    fileBytes: input.fileBytes,
    totalPages: input.totalPages,
    inspection: summarizeInspectionForStamps(input.inspection),
  });
}

function buildSourceStampsForResult(
  result: PersistedIngestResult,
  overrides?: Partial<PersistedIngestSourceStamps>,
): PersistedIngestSourceStamps {
  return {
    sourceFingerprint: overrides?.sourceFingerprint ?? buildSourceFingerprintForInput({
      documentType: result.documentType,
      filePath: result.source.filePath,
      fileName: result.source.fileName,
      inputKind: result.source.inputKind,
      totalPages: result.source.totalPages,
      inspection: result.inspection,
    }),
    parserVersion: overrides?.parserVersion ?? buildParserVersionForInput(result.documentType, result.inspection),
    normalizedResultHash: overrides?.normalizedResultHash ?? stableHash(
      isBoreholeIngestResult(result)
        ? normalizeBoreholeForHash(result)
        : normalizeGeotechDocumentForHash(result),
    ),
  };
}

function buildJobSourceStamps(
  documentType: PersistedDocumentType,
  input: {
    filePath: string;
    fileName: string;
    inputKind: Extract<DocumentInputKind, 'image' | 'pdf'>;
    fileBytes: number;
    totalPages?: number;
    inspection?: PdfDocumentInspection | null;
  },
  normalizedResultHash?: string,
): PersistedGeotechIngestJobSourceStamps {
  return {
    sourceFingerprint: buildSourceFingerprintForInput({
      documentType,
      filePath: input.filePath,
      fileName: input.fileName,
      inputKind: input.inputKind,
      fileBytes: input.fileBytes,
      totalPages: input.totalPages,
      inspection: input.inspection,
    }),
    parserVersion: buildParserVersionForInput(documentType, input.inspection),
    normalizedResultHash,
  };
}

function buildSummary(result: PersistedIngestResult): PersistedBoreholeIngestReviewSummary {
  const counts = (result.reviewFindings as PersistedReviewFinding[]).reduce(
    (acc, finding) => {
      if (finding.severity === 'blocking') acc.blockingFindings += 1;
      else if (finding.severity === 'review') acc.reviewFindings += 1;
      else acc.advisoryFindings += 1;
      return acc;
    },
    { blockingFindings: 0, reviewFindings: 0, advisoryFindings: 0 },
  );
  const boreholeIds = isBoreholeIngestResult(result)
    ? result.boreholes.map((borehole) => borehole.boreholeId)
    : [];

  return {
    reviewRequired: result.reviewRequired,
    canAutoProceed: result.canAutoProceed,
    confidence: result.confidence,
    totalPages: result.source.totalPages,
    successfulPages: result.source.successfulPages,
    failedPages: result.source.failedPages,
    boreholeCount: boreholeIds.length,
    boreholeIds,
    ...counts,
  };
}

function buildTitle(result: PersistedIngestResult, explicitTitle?: string): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }

  return `Ingest review: ${reviewSourceLabel(result)}`;
}

function buildJobTitle(documentType: PersistedDocumentType, fileName: string): string {
  return `Ingest job: ${fileName || documentType}`;
}

function buildArtifactPreview(record: PersistedBoreholeIngestReviewRecord): string {
  const summary = record.summary;
  const findings: string[] = [];

  if (summary.blockingFindings > 0) findings.push(`${summary.blockingFindings} blocking`);
  if (summary.reviewFindings > 0) findings.push(`${summary.reviewFindings} review`);
  if (summary.advisoryFindings > 0) findings.push(`${summary.advisoryFindings} advisory`);

  const extractedSummary = isBoreholeIngestResult(record.result)
    ? [`Boreholes: ${summary.boreholeCount}`]
    : [
        `Materials: ${record.result.materials.length}`,
        `Classifications: ${record.result.classifications.length}`,
        `Parameters: ${record.result.parameters.length}`,
      ];

  return [
    `Document type: ${record.result.documentType}`,
    `Source: ${reviewSourceLabel(record.result)}`,
    ...extractedSummary,
    `Pages: ${summary.successfulPages}/${summary.totalPages}`,
    `Confidence: ${summary.confidence}%`,
    `Review required: ${summary.reviewRequired ? 'Yes' : 'No'}`,
    `Auto proceed: ${summary.canAutoProceed ? 'Yes' : 'No'}`,
    `Findings: ${findings.length > 0 ? findings.join(', ') : 'none'}`,
    `Source fingerprint: ${record.sourceStamps.sourceFingerprint.slice(0, 12)}`,
    `Parser version: ${record.sourceStamps.parserVersion}`,
  ].join('\n');
}

function buildApprovalArtifactPreview(
  record: PersistedBoreholeIngestReviewRecord,
  approval: PersistedBoreholeIngestReviewApprovalRecord,
): string {
  const extractedSummary = isBoreholeIngestResult(record.result)
    ? [`Boreholes at ingest: ${record.summary.boreholeCount}`]
    : [
        `Materials at ingest: ${record.result.materials.length}`,
        `Parameters at ingest: ${record.result.parameters.length}`,
      ];

  return [
    `Source review: ${record.datasetName}`,
    `Review title: ${record.title}`,
    `Document type: ${record.result.documentType}`,
    `Approved at: ${approval.approvedAt}`,
    `Approved by: ${approval.approvedBy ?? 'Unspecified'}`,
    `Rationale: ${approval.rationale}`,
    `Confidence: ${record.summary.confidence}%`,
    `Auto proceed at ingest: ${record.summary.canAutoProceed ? 'Yes' : 'No'}`,
    ...extractedSummary,
    `Blocking findings: ${record.summary.blockingFindings}`,
    `Review findings: ${record.summary.reviewFindings}`,
    `Source fingerprint: ${record.sourceStamps.sourceFingerprint.slice(0, 12)}`,
    `Result hash: ${record.sourceStamps.normalizedResultHash.slice(0, 12)}`,
  ].join('\n');
}

function buildJobArtifactPreview(record: PersistedGeotechIngestJobRecord): string {
  const lines = [
    `Job dataset: ${record.datasetName}`,
    `Status: ${record.status}`,
    `Document type: ${record.documentType}`,
    `Source: ${record.source.fileName}`,
    `Parser version: ${record.sourceStamps.parserVersion}`,
    `Source fingerprint: ${record.sourceStamps.sourceFingerprint.slice(0, 12)}`,
  ];

  if (record.resultSummary) {
    lines.push(`Confidence: ${record.resultSummary.confidence}%`);
    lines.push(`Blocking findings: ${record.resultSummary.blockingFindings}`);
    lines.push(`Review findings: ${record.resultSummary.reviewFindings}`);
  }

  if (record.persistedReview) {
    lines.push(`Persisted review: ${record.persistedReview.datasetName}`);
  }

  if (record.error) {
    lines.push(`Error: ${record.error}`);
  }

  return lines.join('\n');
}

function normalizeBoreholeReviewFindings(value: unknown): BoreholeIngestFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): BoreholeIngestFinding[] => {
    if (!isRecord(item)) {
      return [];
    }

    const code = asOptionalString(item.code);
    const severity = asOptionalString(item.severity);
    const scope = asOptionalString(item.scope);
    const message = asOptionalString(item.message);
    if (
      !code
      || !message
      || (severity !== 'advisory' && severity !== 'review' && severity !== 'blocking')
      || (scope !== 'document' && scope !== 'page' && scope !== 'borehole')
    ) {
      return [];
    }

    return [{
      code,
      severity,
      scope,
      message,
      pageNumber: typeof item.pageNumber === 'number' && Number.isFinite(item.pageNumber) ? item.pageNumber : undefined,
      boreholeId: asOptionalString(item.boreholeId),
    }];
  });
}

function normalizeGeotechDocumentReviewFindings(value: unknown): GeotechDocumentFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): GeotechDocumentFinding[] => {
    if (!isRecord(item)) {
      return [];
    }

    const code = asOptionalString(item.code);
    const severity = asOptionalString(item.severity);
    const scope = asOptionalString(item.scope);
    const message = asOptionalString(item.message);
    if (
      !code
      || !message
      || (severity !== 'advisory' && severity !== 'review' && severity !== 'blocking')
      || (scope !== 'document' && scope !== 'page' && scope !== 'material')
    ) {
      return [];
    }

    return [{
      code,
      severity,
      scope,
      message,
      pageNumber: typeof item.pageNumber === 'number' && Number.isFinite(item.pageNumber) ? item.pageNumber : undefined,
      materialDescription: asOptionalString(item.materialDescription),
    }];
  });
}

function normalizeReviewSummary(value: unknown): PersistedBoreholeIngestReviewSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const reviewRequired = typeof value.reviewRequired === 'boolean' ? value.reviewRequired : null;
  const canAutoProceed = typeof value.canAutoProceed === 'boolean' ? value.canAutoProceed : null;
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? value.confidence : null;
  const totalPages = typeof value.totalPages === 'number' && Number.isFinite(value.totalPages) ? value.totalPages : null;
  const successfulPages = typeof value.successfulPages === 'number' && Number.isFinite(value.successfulPages) ? value.successfulPages : null;
  const failedPages = typeof value.failedPages === 'number' && Number.isFinite(value.failedPages) ? value.failedPages : null;
  const boreholeCount = typeof value.boreholeCount === 'number' && Number.isFinite(value.boreholeCount) ? value.boreholeCount : null;
  const blockingFindings = typeof value.blockingFindings === 'number' && Number.isFinite(value.blockingFindings) ? value.blockingFindings : null;
  const reviewFindings = typeof value.reviewFindings === 'number' && Number.isFinite(value.reviewFindings) ? value.reviewFindings : null;
  const advisoryFindings = typeof value.advisoryFindings === 'number' && Number.isFinite(value.advisoryFindings) ? value.advisoryFindings : null;
  const boreholeIds = Array.isArray(value.boreholeIds)
    ? value.boreholeIds.flatMap((item) => {
        const normalized = asOptionalString(item);
        return normalized ? [normalized] : [];
      })
    : null;

  if (
    reviewRequired == null
    || canAutoProceed == null
    || confidence == null
    || totalPages == null
    || successfulPages == null
    || failedPages == null
    || boreholeCount == null
    || blockingFindings == null
    || reviewFindings == null
    || advisoryFindings == null
    || boreholeIds == null
  ) {
    return null;
  }

  return {
    reviewRequired,
    canAutoProceed,
    confidence,
    totalPages,
    successfulPages,
    failedPages,
    boreholeCount,
    boreholeIds,
    blockingFindings,
    reviewFindings,
    advisoryFindings,
  };
}

function normalizeSourceStamps(value: unknown): PersistedIngestSourceStamps | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceFingerprint = asOptionalString(value.sourceFingerprint);
  const parserVersion = asOptionalString(value.parserVersion);
  const normalizedResultHash = asOptionalString(value.normalizedResultHash);
  if (!sourceFingerprint || !parserVersion || !normalizedResultHash) {
    return null;
  }

  return {
    sourceFingerprint,
    parserVersion,
    normalizedResultHash,
  };
}

function normalizeJobSourceStamps(value: unknown): PersistedGeotechIngestJobSourceStamps | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceFingerprint = asOptionalString(value.sourceFingerprint);
  const parserVersion = asOptionalString(value.parserVersion);
  const normalizedResultHash = asOptionalString(value.normalizedResultHash);
  if (!sourceFingerprint || !parserVersion) {
    return null;
  }

  return {
    sourceFingerprint,
    parserVersion,
    normalizedResultHash,
  };
}

function normalizeBoreholeIngestResult(value: unknown): BoreholeDocumentIngestResult | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-result') {
    return null;
  }

  if (
    value.schemaVersion !== 1
    || value.documentType !== 'borehole-log'
    || !isRecord(value.source)
    || !Array.isArray(value.boreholes)
    || !Array.isArray(value.pageAudits)
    || !Array.isArray(value.pageFailures)
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.reviewReasons)
  ) {
    return null;
  }

  return {
    ...(value as unknown as BoreholeDocumentIngestResult),
    reviewFindings: normalizeBoreholeReviewFindings(value.reviewFindings),
  };
}

function normalizeGeotechDocumentIngestResult(value: unknown): GeotechDocumentIngestResult | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-result') {
    return null;
  }

  if (
    value.schemaVersion !== 1
    || value.documentType !== 'geotech-document'
    || !isRecord(value.source)
    || !Array.isArray(value.materials)
    || !Array.isArray(value.classifications)
    || !Array.isArray(value.parameters)
    || !Array.isArray(value.risks)
    || !Array.isArray(value.recommendations)
    || !Array.isArray(value.pageAudits)
    || !Array.isArray(value.pageFailures)
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.reviewReasons)
  ) {
    return null;
  }

  return {
    ...(value as unknown as GeotechDocumentIngestResult),
    reviewFindings: normalizeGeotechDocumentReviewFindings(value.reviewFindings),
  };
}

function normalizeIngestResult(value: unknown): PersistedIngestResult | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-result') {
    return null;
  }

  if (value.documentType === 'borehole-log') {
    return normalizeBoreholeIngestResult(value);
  }

  if (value.documentType === 'geotech-document') {
    return normalizeGeotechDocumentIngestResult(value);
  }

  return null;
}

function normalizeReviewRecord(value: unknown): PersistedBoreholeIngestReviewRecord | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-review-record') {
    return null;
  }

  const result = normalizeIngestResult(value.result);
  const reviewId = asOptionalString(value.reviewId);
  const datasetName = asOptionalString(value.datasetName);
  const projectId = asOptionalString(value.projectId);
  const createdAt = asOptionalString(value.createdAt);
  const title = asOptionalString(value.title);
  if (!result || !reviewId || !datasetName || !projectId || !createdAt || !title) {
    return null;
  }

  return {
    kind: 'geotech-ingest-review-record',
    schemaVersion: 1,
    reviewId,
    datasetName,
    projectId,
    createdAt,
    title,
    result,
    summary: buildSummary(result),
    sourceStamps: normalizeSourceStamps(value.sourceStamps) ?? buildSourceStampsForResult(result),
  };
}

function normalizeApprovalRecord(value: unknown): PersistedBoreholeIngestReviewApprovalRecord | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-review-approval-record') {
    return null;
  }

  const approvalId = asOptionalString(value.approvalId);
  const datasetName = asOptionalString(value.datasetName);
  const projectId = asOptionalString(value.projectId);
  const reviewId = asOptionalString(value.reviewId);
  const reviewDatasetName = asOptionalString(value.reviewDatasetName);
  const approvedAt = asOptionalString(value.approvedAt);
  const rationale = asOptionalString(value.rationale);
  const approvedBy = asOptionalString(value.approvedBy);
  const sourceSummary = normalizeReviewSummary(value.sourceSummary);
  if (
    value.schemaVersion !== 1
    || !approvalId
    || !datasetName
    || !projectId
    || !reviewId
    || !reviewDatasetName
    || !approvedAt
    || !rationale
    || !sourceSummary
  ) {
    return null;
  }

  return {
    kind: 'geotech-ingest-review-approval-record',
    schemaVersion: 1,
    approvalId,
    datasetName,
    projectId,
    reviewId,
    reviewDatasetName,
    approvedAt,
    approvedBy,
    rationale,
    sourceSummary,
    sourceStamps: normalizeSourceStamps(value.sourceStamps) ?? undefined,
  };
}

function normalizePointer(value: unknown): PersistedBoreholeIngestReviewPointer | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-review-pointer') {
    return null;
  }

  const datasetName = asOptionalString(value.datasetName);
  const reviewId = asOptionalString(value.reviewId);
  const updatedAt = asOptionalString(value.updatedAt);
  if (!datasetName || !reviewId || !updatedAt) {
    return null;
  }

  return {
    kind: 'geotech-ingest-review-pointer',
    schemaVersion: 1,
    datasetName,
    reviewId,
    updatedAt,
  };
}

function normalizeApprovalPointer(value: unknown): PersistedBoreholeIngestReviewApprovalPointer | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-review-approval-pointer') {
    return null;
  }

  const reviewId = asOptionalString(value.reviewId);
  const reviewDatasetName = asOptionalString(value.reviewDatasetName);
  const approvalDatasetName = asOptionalString(value.approvalDatasetName);
  const approvalId = asOptionalString(value.approvalId);
  const updatedAt = asOptionalString(value.updatedAt);
  if (!reviewId || !reviewDatasetName || !approvalDatasetName || !approvalId || !updatedAt) {
    return null;
  }

  return {
    kind: 'geotech-ingest-review-approval-pointer',
    schemaVersion: 1,
    reviewId,
    reviewDatasetName,
    approvalDatasetName,
    approvalId,
    updatedAt,
  };
}

function normalizeJobPointer(value: unknown): PersistedGeotechIngestJobPointer | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-job-pointer') {
    return null;
  }

  const datasetName = asOptionalString(value.datasetName);
  const jobId = asOptionalString(value.jobId);
  const updatedAt = asOptionalString(value.updatedAt);
  if (!datasetName || !jobId || !updatedAt) {
    return null;
  }

  return {
    kind: 'geotech-ingest-job-pointer',
    schemaVersion: 1,
    datasetName,
    jobId,
    updatedAt,
  };
}

function normalizeJobRecord(value: unknown): PersistedGeotechIngestJobRecord | null {
  if (!isRecord(value) || value.kind !== 'geotech-ingest-job-record') {
    return null;
  }

  const jobId = asOptionalString(value.jobId);
  const datasetName = asOptionalString(value.datasetName);
  const projectId = asOptionalString(value.projectId);
  const documentType = value.documentType === 'borehole-log' || value.documentType === 'geotech-document'
    ? value.documentType
    : null;
  const title = asOptionalString(value.title);
  const status =
    value.status === 'queued'
    || value.status === 'running'
    || value.status === 'completed'
    || value.status === 'failed'
      ? value.status
      : null;
  const createdAt = asOptionalString(value.createdAt);
  const updatedAt = asOptionalString(value.updatedAt);
  const startedAt = asOptionalString(value.startedAt);
  const completedAt = asOptionalString(value.completedAt);
  const request = isRecord(value.request)
    ? {
        path: asOptionalString(value.request.path),
        boreholeId: asOptionalString(value.request.boreholeId),
        persistReview: value.request.persistReview === true,
        reviewTitle: asOptionalString(value.request.reviewTitle),
      }
    : null;
  const source = isRecord(value.source)
    ? {
        filePath: asOptionalString(value.source.filePath),
        fileName: asOptionalString(value.source.fileName),
        inputKind: value.source.inputKind === 'image' || value.source.inputKind === 'pdf'
          ? value.source.inputKind
          : null,
        fileBytes: typeof value.source.fileBytes === 'number' && Number.isFinite(value.source.fileBytes)
          ? value.source.fileBytes
          : null,
        totalPages: typeof value.source.totalPages === 'number' && Number.isFinite(value.source.totalPages)
          ? value.source.totalPages
          : undefined,
      }
    : null;
  const inspection = value.inspection === null
    ? null
    : isRecord(value.inspection)
      ? {
          totalPages: typeof value.inspection.totalPages === 'number' && Number.isFinite(value.inspection.totalPages)
            ? value.inspection.totalPages
            : null,
          warnings: Array.isArray(value.inspection.warnings)
            ? value.inspection.warnings.flatMap((item) => {
                const normalized = asOptionalString(item);
                return normalized ? [normalized] : [];
              })
            : [],
          parserVersion: asOptionalString(value.inspection.parserVersion),
        }
      : null;
  const result = value.result ? normalizeIngestResult(value.result) : undefined;
  const resultSummary = value.resultSummary ? normalizeReviewSummary(value.resultSummary) : undefined;
  const persistedReview = isRecord(value.persistedReview)
    ? {
        reviewId: asOptionalString(value.persistedReview.reviewId),
        datasetName: asOptionalString(value.persistedReview.datasetName),
        title: asOptionalString(value.persistedReview.title),
        summary: normalizeReviewSummary(value.persistedReview.summary),
        sourceStamps: normalizeSourceStamps(value.persistedReview.sourceStamps),
      }
    : null;
  const error = asOptionalString(value.error);
  const sourceStamps =
    normalizeJobSourceStamps(value.sourceStamps)
    ?? (result
      ? buildJobSourceStamps(
          result.documentType,
          {
            filePath: result.source.filePath ?? source?.filePath ?? '',
            fileName: result.source.fileName ?? source?.fileName ?? '',
            inputKind: result.source.inputKind,
            fileBytes: source?.fileBytes ?? 0,
            totalPages: result.source.totalPages,
            inspection: result.inspection,
          },
          buildSourceStampsForResult(result).normalizedResultHash,
        )
      : null);

  if (
    value.schemaVersion !== 1
    || !jobId
    || !datasetName
    || !projectId
    || !documentType
    || !title
    || !status
    || !createdAt
    || !updatedAt
    || !request?.path
    || !source?.filePath
    || !source.fileName
    || !source.inputKind
    || source.fileBytes == null
    || (inspection !== null && (!inspection?.parserVersion || inspection.totalPages == null))
    || !sourceStamps
    || (result && !resultSummary)
    || (persistedReview !== null && (
      !persistedReview?.reviewId
      || !persistedReview.datasetName
      || !persistedReview.title
      || !persistedReview.summary
      || !persistedReview.sourceStamps
    ))
  ) {
    return null;
  }

  return {
    kind: 'geotech-ingest-job-record',
    schemaVersion: 1,
    jobId,
    datasetName,
    projectId,
    documentType,
    title,
    status,
    createdAt,
    updatedAt,
    startedAt,
    completedAt,
    request: {
      path: request.path,
      boreholeId: request.boreholeId,
      persistReview: request.persistReview,
      reviewTitle: request.reviewTitle,
    },
    source: {
      filePath: source.filePath,
      fileName: source.fileName,
      inputKind: source.inputKind as Extract<DocumentInputKind, 'image' | 'pdf'>,
      fileBytes: source.fileBytes,
      totalPages: source.totalPages,
    },
    inspection: inspection === null
      ? null
      : {
          totalPages: inspection.totalPages!,
          warnings: inspection.warnings,
          parserVersion: inspection.parserVersion!,
        },
    sourceStamps,
    result: result ?? undefined,
    resultSummary: resultSummary ?? undefined,
    persistedReview: persistedReview === null
      ? undefined
      : {
          reviewId: persistedReview.reviewId!,
          datasetName: persistedReview.datasetName!,
          title: persistedReview.title!,
          summary: persistedReview.summary!,
          sourceStamps: persistedReview.sourceStamps!,
        },
    error,
  };
}

function reviewSummariesMatch(
  left: PersistedBoreholeIngestReviewSummary,
  right: PersistedBoreholeIngestReviewSummary,
): boolean {
  return stableHash(left) === stableHash(right);
}

function validateApprovalForReview(
  record: PersistedBoreholeIngestReviewRecord,
  approval: PersistedBoreholeIngestReviewApprovalRecord,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (approval.reviewId !== record.reviewId) {
    reasons.push('review ID changed');
  }

  if (approval.reviewDatasetName !== record.datasetName) {
    reasons.push('review dataset changed');
  }

  if (approval.sourceStamps) {
    if (approval.sourceStamps.sourceFingerprint !== record.sourceStamps.sourceFingerprint) {
      reasons.push('source fingerprint changed');
    }
    if (approval.sourceStamps.parserVersion !== record.sourceStamps.parserVersion) {
      reasons.push('parser version changed');
    }
    if (approval.sourceStamps.normalizedResultHash !== record.sourceStamps.normalizedResultHash) {
      reasons.push('normalized result hash changed');
    }
  } else if (!reviewSummariesMatch(approval.sourceSummary, record.summary)) {
    reasons.push('review summary changed');
  }

  return { valid: reasons.length === 0, reasons };
}

function decorateApprovalValidity(
  project: ProjectData,
  approval: PersistedBoreholeIngestReviewApprovalRecord,
): PersistedBoreholeIngestReviewApprovalRecord {
  const review = normalizeReviewRecord(project.namedDatasets[approval.reviewDatasetName]?.data);
  if (!review) {
    return {
      ...approval,
      validForCurrentReview: false,
      invalidationReasons: ['review dataset not found'],
    };
  }

  const validation = validateApprovalForReview(review, approval);
  return {
    ...approval,
    validForCurrentReview: validation.valid,
    invalidationReasons: validation.valid ? undefined : validation.reasons,
  };
}

function getReviewDatasetEntries(project: ProjectData): Array<{ name: string; data: unknown }> {
  return Object.entries(project.namedDatasets)
    .filter(([, dataset]) => dataset.kind === 'geotech-ingest-review')
    .map(([name, dataset]) => ({ name, data: dataset.data }));
}

function getReviewApprovalDatasetEntries(project: ProjectData): Array<{ name: string; data: unknown }> {
  return Object.entries(project.namedDatasets)
    .filter(([, dataset]) => dataset.kind === 'geotech-ingest-review-approval')
    .map(([name, dataset]) => ({ name, data: dataset.data }));
}

function getJobDatasetEntries(project: ProjectData): Array<{ name: string; data: unknown }> {
  return Object.entries(project.namedDatasets)
    .filter(([, dataset]) => dataset.kind === 'geotech-ingest-job')
    .map(([name, dataset]) => ({ name, data: dataset.data }));
}

function findLatestApprovalForReview(
  project: ProjectData,
  review: PersistedBoreholeIngestReviewRecord,
): PersistedBoreholeIngestReviewApprovalRecord | undefined {
  const pointerDatasetName = buildApprovalPointerDatasetName(review.reviewId);
  const pointer = normalizeApprovalPointer(project.namedDatasets[pointerDatasetName]?.data);
  if (pointer) {
    const fromPointer = normalizeApprovalRecord(project.namedDatasets[pointer.approvalDatasetName]?.data);
    if (fromPointer?.reviewId === review.reviewId) {
      const decorated = decorateApprovalValidity(project, fromPointer);
      if (decorated.validForCurrentReview !== false) {
        return decorated;
      }
    }
  }

  return getReviewApprovalDatasetEntries(project)
    .map((entry) => normalizeApprovalRecord(entry.data))
    .filter((entry): entry is PersistedBoreholeIngestReviewApprovalRecord => entry !== null && entry.reviewId === review.reviewId)
    .map((entry) => decorateApprovalValidity(project, entry))
    .filter((entry) => entry.validForCurrentReview !== false)
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))[0];
}

function attachLatestApproval(
  project: ProjectData,
  record: PersistedBoreholeIngestReviewRecord,
): PersistedBoreholeIngestReviewRecord {
  const approval = findLatestApprovalForReview(project, record);
  return approval ? { ...record, approval } : record;
}

function getSelectedReview(projectId: string, datasetName?: string): PersistedBoreholeIngestReviewRecord | null {
  return datasetName
    ? loadPersistedBoreholeIngestReview(projectId, datasetName)
    : loadLatestPersistedBoreholeIngestReview(projectId);
}

function getSelectedJob(projectId: string, datasetName?: string): PersistedGeotechIngestJobRecord | null {
  return datasetName
    ? getGeotechIngestJob(projectId, datasetName)
    : getLatestGeotechIngestJob(projectId);
}

function saveJobRecord(projectId: string, record: PersistedGeotechIngestJobRecord): PersistedGeotechIngestJobRecord {
  saveNamedDataset(projectId, {
    name: record.datasetName,
    kind: 'geotech-ingest-job',
    data: record,
    source: record.request.path,
    metadata: {
      workflow: 'geotech-ingest-job',
      jobId: record.jobId,
      documentType: record.documentType,
      status: record.status,
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
      persistedReviewDatasetName: record.persistedReview?.datasetName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
    },
  });

  saveNamedDataset(projectId, {
    name: 'ingest-job:latest',
    kind: 'geotech-ingest-job-pointer',
    data: {
      kind: 'geotech-ingest-job-pointer',
      schemaVersion: 1,
      datasetName: record.datasetName,
      jobId: record.jobId,
      updatedAt: record.updatedAt,
    } satisfies PersistedGeotechIngestJobPointer,
    source: record.datasetName,
    metadata: {
      workflow: 'geotech-ingest-job',
      jobId: record.jobId,
      datasetName: record.datasetName,
      status: record.status,
      updatedAt: record.updatedAt,
    },
  });

  return record;
}

function createPromotionDatasetMetadata(
  role: PromotionDatasetRole,
  record: PersistedBoreholeIngestReviewRecord,
  promotedAt: string,
  promotionDatasetName: string,
  options?: {
    boreholeId?: string;
    targetDatasetName?: string;
    supersededDatasetName?: string;
    snapshotDatasetName?: string;
    approval?: PersistedBoreholeIngestReviewApprovalRecord;
  },
): Record<string, unknown> {
  return {
    workflow: 'geotech-ingest-review-promotion',
    documentType: record.result.documentType,
    promotedDatasetRole: role,
    promotedAt,
    promotedFromReviewId: record.reviewId,
    promotedFromReviewDatasetName: record.datasetName,
    promotionDatasetName,
    boreholeId: options?.boreholeId,
    targetDatasetName: options?.targetDatasetName,
    supersededDatasetName: options?.supersededDatasetName,
    snapshotDatasetName: options?.snapshotDatasetName,
    sourceFingerprint: record.sourceStamps.sourceFingerprint,
    parserVersion: record.sourceStamps.parserVersion,
    normalizedResultHash: record.sourceStamps.normalizedResultHash,
    approvalDatasetName: options?.approval?.datasetName,
    approvalId: options?.approval?.approvalId,
    approvedAt: options?.approval?.approvedAt,
    approvedBy: options?.approval?.approvedBy,
    approvalRationale: options?.approval?.rationale,
  };
}

function snapshotNamedDatasetForPromotion(
  projectId: string,
  existingDataset: ProjectDataset | undefined,
  targetDatasetName: string,
  record: PersistedBoreholeIngestReviewRecord,
  promotedAt: string,
  promotionDatasetName: string,
  approval?: PersistedBoreholeIngestReviewApprovalRecord,
): { supersededDatasetName?: string; snapshotDatasetName?: string } {
  if (!existingDataset) {
    return {};
  }

  const snapshotDatasetName = buildPromotionSnapshotDatasetName(record.reviewId, targetDatasetName, promotedAt);
  const snapshotRecord: IngestPromotionSnapshotRecord = {
    kind: 'geotech-ingest-promotion-snapshot-record',
    schemaVersion: 1,
    snapshotDatasetName,
    targetDatasetName,
    sourceReviewDatasetName: record.datasetName,
    sourceReviewId: record.reviewId,
    promotionDatasetName,
    promotedAt,
    previousDataset: existingDataset,
  };

  saveNamedDataset(projectId, {
    name: snapshotDatasetName,
    kind: 'geotech-ingest-promotion-snapshot',
    data: snapshotRecord,
    source: record.datasetName,
    metadata: createPromotionDatasetMetadata('snapshot', record, promotedAt, promotionDatasetName, {
      targetDatasetName,
      supersededDatasetName: targetDatasetName,
      snapshotDatasetName,
      approval,
    }),
  });

  return {
    supersededDatasetName: targetDatasetName,
    snapshotDatasetName,
  };
}

function createPromotionArtifactPreview(result: PromotedBoreholeIngestReviewResult): string {
  const lines = [
    `Source review: ${result.sourceReviewDatasetName}`,
    `Document type: ${result.documentType}`,
    `Promoted datasets: ${result.promotedDatasetNames.length}`,
  ];

  if (result.documentType === 'borehole-log') {
    lines.push(`Promoted boreholes: ${result.promotedBoreholes.length}`);
  } else {
    lines.push(`Promoted document views: ${result.promotedDocuments.length}`);
  }

  if (result.approvalDatasetName) {
    lines.push(`Recorded approval: ${result.approvalDatasetName}`);
  }

  if (result.supersededDatasetNames.length > 0) {
    lines.push(`Superseded datasets: ${result.supersededDatasetNames.length}`);
  }

  if (result.snapshotDatasetNames.length > 0) {
    lines.push(`Rollback snapshots: ${result.snapshotDatasetNames.length}`);
  }

  for (const item of result.promotedBoreholes) {
    lines.push(
      `- ${item.boreholeId}: raw dataset ${item.rawDatasetName}${item.promotedSoilProfile ? `, soil profile ${item.soilProfileDatasetName}` : ', soil profile skipped'}`,
    );
  }

  for (const item of result.promotedDocuments) {
    lines.push(`- ${item.role}: ${item.datasetName}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join(' | ')}`);
  }

  return lines.join('\n');
}

function toPromotableSoilProfile(
  borehole: BoreholeDocumentIngestResult['boreholes'][number],
): { profile: SoilProfile | null; warnings: string[] } {
  const warnings: string[] = [];

  if (borehole.layers.length === 0) {
    warnings.push(`Borehole ${borehole.boreholeId} has no parsed layers; skipped soil-profile promotion.`);
    return { profile: null, warnings };
  }

  const promotedLayers = borehole.layers.flatMap((layer, index) => {
    if (
      layer.depthFrom == null
      || layer.depthTo == null
      || !Number.isFinite(layer.depthFrom)
      || !Number.isFinite(layer.depthTo)
    ) {
      warnings.push(
        `Borehole ${borehole.boreholeId} layer ${index + 1} is missing complete depth geometry; skipped soil-profile promotion.`,
      );
      return [];
    }

    return [{
      depthFrom: layer.depthFrom,
      depthTo: layer.depthTo,
      description: layer.description ?? layer.notes ?? layer.uscsSymbol ?? 'Unknown layer',
      uscs: layer.uscsSymbol ?? undefined,
      sptN: layer.sptN ?? undefined,
    }];
  });

  if (promotedLayers.length !== borehole.layers.length) {
    return { profile: null, warnings };
  }

  return {
    profile: {
      boreholeId: borehole.boreholeId,
      location: borehole.location ?? undefined,
      layers: promotedLayers,
      waterTableDepth: borehole.waterTableDepth ?? undefined,
    },
    warnings,
  };
}

export function persistBoreholeIngestReview(
  projectId: string,
  result: PersistedIngestResult,
  options?: PersistBoreholeIngestReviewOptions,
): PersistedBoreholeIngestReviewRecord {
  const project = loadProject(projectId);
  const reviewId = buildReviewId(result);
  const datasetName = `ingest-review:${reviewId}`;
  const title = buildTitle(result, options?.title);
  const sourceStamps = buildSourceStampsForResult(result, options?.sourceStamps);
  const record: PersistedBoreholeIngestReviewRecord = {
    kind: 'geotech-ingest-review-record',
    schemaVersion: 1,
    reviewId,
    datasetName,
    projectId,
    createdAt: result.generatedAt,
    title,
    result,
    summary: buildSummary(result),
    sourceStamps,
  };

  saveNamedDataset(projectId, {
    name: datasetName,
    kind: 'geotech-ingest-review',
    data: record,
    source: 'geotech-ingest',
    metadata: {
      workflow: 'geotech-ingest-review',
      reviewId,
      documentType: result.documentType,
      sourceFingerprint: sourceStamps.sourceFingerprint,
      parserVersion: sourceStamps.parserVersion,
      normalizedResultHash: sourceStamps.normalizedResultHash,
    },
  });

  const pointer: PersistedBoreholeIngestReviewPointer = {
    kind: 'geotech-ingest-review-pointer',
    schemaVersion: 1,
    datasetName,
    reviewId,
    updatedAt: result.generatedAt,
  };

  saveNamedDataset(projectId, {
    name: 'ingest-review:latest',
    kind: 'geotech-ingest-review-pointer',
    data: pointer,
    source: 'geotech-ingest',
  });

  addArtifact(projectId, {
    kind: 'ingest-review',
    title,
    content: buildArtifactPreview(record),
    mimeType: 'text/plain',
    metadata: {
      datasetName,
      reviewId,
      source: reviewSourceLabel(result),
      documentType: result.documentType,
      reviewRequired: result.reviewRequired,
      canAutoProceed: result.canAutoProceed,
      confidence: result.confidence,
      sourceFingerprint: sourceStamps.sourceFingerprint,
      parserVersion: sourceStamps.parserVersion,
      normalizedResultHash: sourceStamps.normalizedResultHash,
      boreholeCount: isBoreholeIngestResult(result) ? result.boreholes.length : undefined,
      materialCount: isGeotechDocumentIngestResult(result) ? result.materials.length : undefined,
      classificationCount: isGeotechDocumentIngestResult(result) ? result.classifications.length : undefined,
      parameterCount: isGeotechDocumentIngestResult(result) ? result.parameters.length : undefined,
    },
  });

  addNote(
    projectId,
    `Persisted ingest review "${reviewId}" from ${reviewSourceLabel(result)} (${result.reviewRequired ? 'review required' : 'auto-proceed ready'}).`,
  );

  const relatedDatasets = [...new Set([...project.activeAnalysisContext.relatedDatasets, datasetName])];
  setActiveAnalysisContext(projectId, {
    currentTask: `Review ingest result for ${reviewSourceLabel(result)}`,
    context: {
      ...project.activeAnalysisContext.context,
      latestIngestReview: {
        datasetName,
        reviewId,
        documentType: result.documentType,
        reviewRequired: result.reviewRequired,
        canAutoProceed: result.canAutoProceed,
        sourceStamps,
      },
    },
    relatedDatasets,
  });

  return record;
}

export function loadPersistedBoreholeIngestReview(
  projectId: string,
  datasetName: string,
): PersistedBoreholeIngestReviewRecord | null {
  const project = loadProject(projectId);
  const record = normalizeReviewRecord(project.namedDatasets[datasetName]?.data);
  return record ? attachLatestApproval(project, record) : null;
}

export function listPersistedBoreholeIngestReviews(projectId: string): PersistedBoreholeIngestReviewRecord[] {
  const project = loadProject(projectId);
  return getReviewDatasetEntries(project)
    .map((entry) => normalizeReviewRecord(entry.data))
    .filter((entry): entry is PersistedBoreholeIngestReviewRecord => entry !== null)
    .map((entry) => attachLatestApproval(project, entry))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function loadLatestPersistedBoreholeIngestReview(
  projectId: string,
): PersistedBoreholeIngestReviewRecord | null {
  const project = loadProject(projectId);
  const pointer = normalizePointer(project.namedDatasets['ingest-review:latest']?.data);
  if (pointer) {
    const fromPointer = normalizeReviewRecord(project.namedDatasets[pointer.datasetName]?.data);
    if (fromPointer) {
      return attachLatestApproval(project, fromPointer);
    }
  }

  const reviews = getReviewDatasetEntries(project)
    .map((entry) => normalizeReviewRecord(entry.data))
    .filter((entry): entry is PersistedBoreholeIngestReviewRecord => entry !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return reviews[0] ? attachLatestApproval(project, reviews[0]) : null;
}

export function loadPersistedBoreholeIngestReviewApproval(
  projectId: string,
  approvalDatasetName: string,
): PersistedBoreholeIngestReviewApprovalRecord | null {
  const project = loadProject(projectId);
  const approval = normalizeApprovalRecord(project.namedDatasets[approvalDatasetName]?.data);
  return approval ? decorateApprovalValidity(project, approval) : null;
}

export function loadLatestPersistedBoreholeIngestReviewApproval(
  projectId: string,
  reviewDatasetName: string,
): PersistedBoreholeIngestReviewApprovalRecord | null {
  const project = loadProject(projectId);
  const review = normalizeReviewRecord(project.namedDatasets[reviewDatasetName]?.data);
  if (!review) {
    return null;
  }

  return findLatestApprovalForReview(project, review) ?? null;
}

export function listPersistedBoreholeIngestReviewApprovals(
  projectId: string,
  reviewDatasetName?: string,
): PersistedBoreholeIngestReviewApprovalRecord[] {
  const project = loadProject(projectId);
  const targetReview = reviewDatasetName
    ? normalizeReviewRecord(project.namedDatasets[reviewDatasetName]?.data)
    : null;
  const targetReviewId = targetReview?.reviewId;

  return getReviewApprovalDatasetEntries(project)
    .map((entry) => normalizeApprovalRecord(entry.data))
    .filter((entry): entry is PersistedBoreholeIngestReviewApprovalRecord =>
      entry !== null && (!targetReviewId || entry.reviewId === targetReviewId),
    )
    .map((entry) => decorateApprovalValidity(project, entry))
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt));
}

export function summarizePersistedBoreholeIngestReviewApproval(
  approval: PersistedBoreholeIngestReviewApprovalRecord,
  options?: {
    latestApprovalDatasetName?: string;
  },
): PersistedBoreholeIngestReviewApprovalSummary {
  return {
    approvalId: approval.approvalId,
    datasetName: approval.datasetName,
    projectId: approval.projectId,
    reviewId: approval.reviewId,
    reviewDatasetName: approval.reviewDatasetName,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
    rationale: approval.rationale,
    isLatestForReview: options?.latestApprovalDatasetName === approval.datasetName,
    isValidForCurrentReview: approval.validForCurrentReview !== false,
    invalidationReasons: approval.invalidationReasons,
  };
}

export function approvePersistedBoreholeIngestReview(
  projectId: string,
  datasetName: string | undefined,
  options: ApprovePersistedBoreholeIngestReviewOptions,
): PersistedBoreholeIngestReviewApprovalRecord {
  const rationale = options.rationale?.trim();
  if (!rationale) {
    throw new Error('Approving a persisted ingest review requires a non-empty rationale.');
  }

  const project = loadProject(projectId);
  const record = getSelectedReview(projectId, datasetName);

  if (!record) {
    throw new Error(
      datasetName
        ? `No persisted ingest review named "${datasetName}" was found in project "${projectId}".`
        : `No persisted ingest reviews were found in project "${projectId}".`,
    );
  }

  const approvedAt = options.approvedAt?.trim() || new Date().toISOString();
  const approvedBy = asOptionalString(options.approvedBy);
  const approvalId = buildApprovalId(record.reviewId, approvedAt);
  const approvalDatasetName = buildApprovalDatasetName(record.reviewId, approvedAt);
  const approvalRecord: PersistedBoreholeIngestReviewApprovalRecord = {
    kind: 'geotech-ingest-review-approval-record',
    schemaVersion: 1,
    approvalId,
    datasetName: approvalDatasetName,
    projectId,
    reviewId: record.reviewId,
    reviewDatasetName: record.datasetName,
    approvedAt,
    approvedBy,
    rationale,
    sourceSummary: record.summary,
    sourceStamps: record.sourceStamps,
  };

  saveNamedDataset(projectId, {
    name: approvalDatasetName,
    kind: 'geotech-ingest-review-approval',
    data: approvalRecord,
    source: record.datasetName,
    metadata: {
      workflow: 'geotech-ingest-review-approval',
      reviewId: record.reviewId,
      reviewDatasetName: record.datasetName,
      approvalId,
      approvedAt,
      approvedBy,
      documentType: record.result.documentType,
      rationale,
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
    },
  });

  saveNamedDataset(projectId, {
    name: buildApprovalPointerDatasetName(record.reviewId),
    kind: 'geotech-ingest-review-approval-pointer',
    data: {
      kind: 'geotech-ingest-review-approval-pointer',
      schemaVersion: 1,
      reviewId: record.reviewId,
      reviewDatasetName: record.datasetName,
      approvalDatasetName,
      approvalId,
      updatedAt: approvedAt,
    } satisfies PersistedBoreholeIngestReviewApprovalPointer,
    source: record.datasetName,
    metadata: {
      workflow: 'geotech-ingest-review-approval',
      reviewId: record.reviewId,
      reviewDatasetName: record.datasetName,
      approvalDatasetName,
      approvalId,
      approvedAt,
      documentType: record.result.documentType,
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
    },
  });

  addArtifact(projectId, {
    kind: 'ingest-review-approval',
    title: `Approved ingest review: ${record.title}`,
    content: buildApprovalArtifactPreview(record, approvalRecord),
    mimeType: 'text/plain',
    metadata: {
      reviewId: record.reviewId,
      reviewDatasetName: record.datasetName,
      approvalDatasetName,
      approvalId,
      approvedAt,
      approvedBy,
      documentType: record.result.documentType,
      rationale,
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
    },
  });

  addNote(
    projectId,
    `Approved ingest review "${record.reviewId}"${approvedBy ? ` by ${approvedBy}` : ''}.`,
  );

  const relatedDatasets = [
    ...new Set([
      ...project.activeAnalysisContext.relatedDatasets,
      record.datasetName,
      approvalDatasetName,
    ]),
  ];
  setActiveAnalysisContext(projectId, {
    currentTask: `Approved ingest review for ${reviewSourceLabel(record.result)}`,
    context: {
      ...project.activeAnalysisContext.context,
      latestApprovedIngestReview: {
        reviewDatasetName: record.datasetName,
        reviewId: record.reviewId,
        approvalDatasetName,
        approvalId,
        approvedAt,
        approvedBy,
        documentType: record.result.documentType,
        rationale,
        sourceStamps: record.sourceStamps,
      },
    },
    relatedDatasets,
  });

  return {
    ...approvalRecord,
    validForCurrentReview: true,
  };
}

function getLatestGeotechIngestJob(projectId: string): PersistedGeotechIngestJobRecord | null {
  const project = loadProject(projectId);
  const pointer = normalizeJobPointer(project.namedDatasets['ingest-job:latest']?.data);
  if (pointer) {
    const fromPointer = normalizeJobRecord(project.namedDatasets[pointer.datasetName]?.data);
    if (fromPointer) {
      return fromPointer;
    }
  }

  const jobs = getJobDatasetEntries(project)
    .map((entry) => normalizeJobRecord(entry.data))
    .filter((entry): entry is PersistedGeotechIngestJobRecord => entry !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return jobs[0] ?? null;
}

function markJobState(
  record: PersistedGeotechIngestJobRecord,
  updates: Partial<PersistedGeotechIngestJobRecord>,
): PersistedGeotechIngestJobRecord {
  return {
    ...record,
    ...updates,
    request: {
      ...record.request,
      ...(updates.request ?? {}),
    },
    source: {
      ...record.source,
      ...(updates.source ?? {}),
    },
    sourceStamps: {
      ...record.sourceStamps,
      ...(updates.sourceStamps ?? {}),
    },
  };
}

function runIngestForJob(
  record: PersistedGeotechIngestJobRecord,
  options: WaitGeotechIngestJobOptions,
): Promise<{
  result: PersistedIngestResult;
  inspection: PdfDocumentInspection | null;
  persistedReview?: PersistedBoreholeIngestReviewRecord;
}> {
  return (async () => {
    const file = readDocumentVisionInput(record.source.filePath);
    if (file.kind === 'unknown') {
      throw new Error(`Unsupported document type for ingest: ${record.source.filePath}`);
    }

    const inspection = file.kind === 'pdf' ? inspectPdfDocument(record.source.filePath) : null;

    if (record.documentType === 'borehole-log') {
      const result = await ingestBoreholeLogDocument({
        config: options.config,
        source: {
          filePath: record.source.filePath,
          fileName: record.source.fileName,
          inputKind: file.kind === 'pdf' ? 'pdf' : 'image',
        },
        overrideBoreholeId: record.request.boreholeId,
        inspection,
        image: file.kind === 'pdf' ? undefined : file,
        pages: file.kind === 'pdf'
          ? await readDocumentPdfPageInputs(record.source.filePath, { inspection })
          : undefined,
      });

      const persistedReview = record.request.persistReview
        ? persistBoreholeIngestReview(record.projectId, result, {
            title: record.request.reviewTitle,
          })
        : undefined;

      return { result, inspection, persistedReview };
    }

    const result = await ingestGeotechDocument({
      config: options.config,
      source: {
        filePath: record.source.filePath,
        fileName: record.source.fileName,
        inputKind: file.kind === 'pdf' ? 'pdf' : 'image',
      },
      inspection,
      image: file.kind === 'pdf' ? undefined : file,
      pages: file.kind === 'pdf'
        ? await readDocumentPdfPageInputs(record.source.filePath, { inspection })
        : undefined,
    });

    const persistedReview = record.request.persistReview
      ? persistBoreholeIngestReview(record.projectId, result, {
          title: record.request.reviewTitle,
        })
      : undefined;

    return { result, inspection, persistedReview };
  })();
}

export function startGeotechIngestJob(
  projectId: string,
  options: StartGeotechIngestJobOptions,
): PersistedGeotechIngestJobRecord {
  const filePath = options.path?.trim();
  if (!filePath) {
    throw new Error('Starting an ingest job requires a file path.');
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const document = readDocumentVisionInput(filePath);
  if (document.kind === 'unknown') {
    throw new Error(`Unsupported document type for ingest: ${filePath}`);
  }

  const documentType = options.type === 'borehole-log' ? 'borehole-log' : 'geotech-document';
  const createdAt = new Date().toISOString();
  const inspection = document.kind === 'pdf' ? inspectPdfDocument(filePath) : null;
  const jobId = buildJobId(documentType, filePath, createdAt);
  const datasetName = buildJobDatasetName(jobId);
  const title = buildJobTitle(documentType, basename(filePath));
  const record: PersistedGeotechIngestJobRecord = {
    kind: 'geotech-ingest-job-record',
    schemaVersion: 1,
    jobId,
    datasetName,
    projectId,
    documentType,
    title,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    request: {
      path: filePath,
      boreholeId: asOptionalString(options.boreholeId),
      persistReview: options.persistReview === true,
      reviewTitle: asOptionalString(options.reviewTitle),
    },
    source: {
      filePath,
      fileName: basename(filePath),
      inputKind: document.kind,
      fileBytes: document.fileBytes,
      totalPages: inspection?.totalPages,
    },
    inspection: summarizeInspectionForJob(inspection),
    sourceStamps: buildJobSourceStamps(documentType, {
      filePath,
      fileName: basename(filePath),
      inputKind: document.kind,
      fileBytes: document.fileBytes,
      totalPages: inspection?.totalPages,
      inspection,
    }),
  };

  saveJobRecord(projectId, record);
  const project = loadProject(projectId);
  const relatedDatasets = [...new Set([...project.activeAnalysisContext.relatedDatasets, datasetName])];
  setActiveAnalysisContext(projectId, {
    currentTask: `Queued ingest job for ${record.source.fileName}`,
    context: {
      ...project.activeAnalysisContext.context,
      latestIngestJob: {
        jobId,
        datasetName,
        documentType,
        status: 'queued',
        sourceFingerprint: record.sourceStamps.sourceFingerprint,
        parserVersion: record.sourceStamps.parserVersion,
      },
    },
    relatedDatasets,
  });

  addNote(
    projectId,
    `Queued ingest job "${jobId}" for ${record.source.fileName}.`,
  );

  return record;
}

export function getGeotechIngestJob(
  projectId: string,
  datasetName?: string,
): PersistedGeotechIngestJobRecord | null {
  const project = loadProject(projectId);
  if (datasetName) {
    return normalizeJobRecord(project.namedDatasets[datasetName]?.data);
  }

  return getLatestGeotechIngestJob(projectId);
}

export async function waitGeotechIngestJob(
  projectId: string,
  datasetName: string | undefined,
  options: WaitGeotechIngestJobOptions,
): Promise<PersistedGeotechIngestJobRecord> {
  const project = loadProject(projectId);
  const record = getSelectedJob(projectId, datasetName);

  if (!record) {
    throw new Error(
      datasetName
        ? `No persisted ingest job named "${datasetName}" was found in project "${projectId}".`
        : `No persisted ingest jobs were found in project "${projectId}".`,
    );
  }

  if (record.status === 'completed' || record.status === 'failed') {
    return record;
  }

  const startedAt = record.startedAt ?? new Date().toISOString();
  const runningRecord = markJobState(record, {
    status: 'running',
    startedAt,
    updatedAt: startedAt,
  });
  saveJobRecord(projectId, runningRecord);

  try {
    const executed = await runIngestForJob(runningRecord, options);
    const sourceStamps = buildSourceStampsForResult(executed.result);
    const completedAt = executed.result.generatedAt || new Date().toISOString();
    const completedRecord = markJobState(runningRecord, {
      status: 'completed',
      completedAt,
      updatedAt: completedAt,
      source: {
        ...runningRecord.source,
        totalPages: executed.result.source.totalPages,
      },
      inspection: summarizeInspectionForJob(executed.inspection),
      sourceStamps: {
        sourceFingerprint: sourceStamps.sourceFingerprint,
        parserVersion: sourceStamps.parserVersion,
        normalizedResultHash: sourceStamps.normalizedResultHash,
      },
      result: executed.result,
      resultSummary: buildSummary(executed.result),
      persistedReview: executed.persistedReview
        ? {
            reviewId: executed.persistedReview.reviewId,
            datasetName: executed.persistedReview.datasetName,
            title: executed.persistedReview.title,
            summary: executed.persistedReview.summary,
            sourceStamps: executed.persistedReview.sourceStamps,
          }
        : undefined,
      error: undefined,
    });

    saveJobRecord(projectId, completedRecord);
    addArtifact(projectId, {
      kind: 'ingest-job',
      title: `Completed ingest job: ${completedRecord.title}`,
      content: buildJobArtifactPreview(completedRecord),
      mimeType: 'text/plain',
      metadata: {
        jobId: completedRecord.jobId,
        datasetName: completedRecord.datasetName,
        status: completedRecord.status,
        documentType: completedRecord.documentType,
        sourceFingerprint: sourceStamps.sourceFingerprint,
        parserVersion: sourceStamps.parserVersion,
        normalizedResultHash: sourceStamps.normalizedResultHash,
        persistedReviewDatasetName: completedRecord.persistedReview?.datasetName,
      },
    });
    addNote(
      projectId,
      `Completed ingest job "${completedRecord.jobId}"${completedRecord.persistedReview ? ` and persisted review "${completedRecord.persistedReview.datasetName}"` : ''}.`,
    );

    const relatedDatasets = [
      ...new Set([
        ...project.activeAnalysisContext.relatedDatasets,
        completedRecord.datasetName,
        ...(completedRecord.persistedReview ? [completedRecord.persistedReview.datasetName] : []),
      ]),
    ];
    setActiveAnalysisContext(projectId, {
      currentTask: `Completed ingest job for ${completedRecord.source.fileName}`,
      context: {
        ...project.activeAnalysisContext.context,
        latestIngestJob: {
          jobId: completedRecord.jobId,
          datasetName: completedRecord.datasetName,
          documentType: completedRecord.documentType,
          status: completedRecord.status,
          persistedReviewDatasetName: completedRecord.persistedReview?.datasetName,
          sourceFingerprint: sourceStamps.sourceFingerprint,
          parserVersion: sourceStamps.parserVersion,
          normalizedResultHash: sourceStamps.normalizedResultHash,
        },
      },
      relatedDatasets,
    });

    return completedRecord;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failedRecord = markJobState(runningRecord, {
      status: 'failed',
      completedAt,
      updatedAt: completedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    saveJobRecord(projectId, failedRecord);
    addArtifact(projectId, {
      kind: 'ingest-job',
      title: `Failed ingest job: ${failedRecord.title}`,
      content: buildJobArtifactPreview(failedRecord),
      mimeType: 'text/plain',
      metadata: {
        jobId: failedRecord.jobId,
        datasetName: failedRecord.datasetName,
        status: failedRecord.status,
        documentType: failedRecord.documentType,
        sourceFingerprint: failedRecord.sourceStamps.sourceFingerprint,
        parserVersion: failedRecord.sourceStamps.parserVersion,
        error: failedRecord.error,
      },
    });
    addNote(projectId, `Ingest job "${failedRecord.jobId}" failed: ${failedRecord.error}.`);
    setActiveAnalysisContext(projectId, {
      currentTask: `Ingest job failed for ${failedRecord.source.fileName}`,
      context: {
        ...project.activeAnalysisContext.context,
        latestIngestJob: {
          jobId: failedRecord.jobId,
          datasetName: failedRecord.datasetName,
          documentType: failedRecord.documentType,
          status: failedRecord.status,
          error: failedRecord.error,
          sourceFingerprint: failedRecord.sourceStamps.sourceFingerprint,
          parserVersion: failedRecord.sourceStamps.parserVersion,
        },
      },
      relatedDatasets: [...new Set([...project.activeAnalysisContext.relatedDatasets, failedRecord.datasetName])],
    });
    return failedRecord;
  }
}

export function loadGeotechIngestJobResult(
  projectId: string,
  datasetName?: string,
): LoadedGeotechIngestJobResult {
  const record = getSelectedJob(projectId, datasetName);
  if (!record) {
    throw new Error(
      datasetName
        ? `No persisted ingest job named "${datasetName}" was found in project "${projectId}".`
        : `No persisted ingest jobs were found in project "${projectId}".`,
    );
  }

  if (record.status !== 'completed' || !record.result || !record.resultSummary || !record.completedAt || !record.sourceStamps.normalizedResultHash) {
    throw new Error(
      `Persisted ingest job "${record.datasetName}" is ${record.status} and does not have a completed result to load yet.`,
    );
  }

  return {
    jobId: record.jobId,
    datasetName: record.datasetName,
    projectId: record.projectId,
    documentType: record.documentType,
    completedAt: record.completedAt,
    sourceStamps: {
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
    },
    result: record.result,
    resultSummary: record.resultSummary,
    persistedReview: record.persistedReview,
  };
}

export function listGeotechIngestJobs(projectId: string): PersistedGeotechIngestJobRecord[] {
  const project = loadProject(projectId);
  return getJobDatasetEntries(project)
    .map((entry) => normalizeJobRecord(entry.data))
    .filter((entry): entry is PersistedGeotechIngestJobRecord => entry !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function promotePersistedBoreholeIngestReview(
  projectId: string,
  datasetName?: string,
): PromotedBoreholeIngestReviewResult {
  const project = loadProject(projectId);
  const record = getSelectedReview(projectId, datasetName);

  if (!record) {
    throw new Error(
      datasetName
        ? `No persisted ingest review named "${datasetName}" was found in project "${projectId}".`
        : `No persisted ingest reviews were found in project "${projectId}".`,
    );
  }

  const approval = record.approval;
  const promotionAllowedWithoutApproval =
    record.summary.canAutoProceed
    && !record.summary.reviewRequired
    && record.summary.blockingFindings === 0;
  if (!promotionAllowedWithoutApproval && !approval) {
    throw new Error(
      `Persisted ingest review "${record.datasetName}" requires recorded approval before promotion (auto-proceed: ${record.summary.canAutoProceed ? 'yes' : 'no'}, blocking findings: ${record.summary.blockingFindings}, review findings: ${record.summary.reviewFindings}).`,
    );
  }

  const promotedAt = new Date().toISOString();
  const promotionDatasetName = buildPromotionDatasetName(record.reviewId);
  const warnings: string[] = [];
  const promotedBoreholes: PromotedBoreholeIngestReviewItem[] = [];
  const promotedDocuments: PromotedGeotechDocumentIngestReviewItem[] = [];
  const promotedDatasetNames: string[] = [];
  const promotedDatasetKinds: string[] = [];
  const promotedBoreholeIds: string[] = [];
  const supersededDatasetNames: string[] = [];
  const snapshotDatasetNames: string[] = [];

  if (isBoreholeIngestResult(record.result)) {
    for (const borehole of record.result.boreholes) {
      const rawDatasetName = buildPromotedBoreholeDatasetName(record.reviewId, borehole.boreholeId);
      const itemSupersededDatasetNames: string[] = [];
      const itemSnapshotDatasetNames: string[] = [];

      const rawSnapshot = snapshotNamedDatasetForPromotion(
        projectId,
        project.namedDatasets[rawDatasetName],
        rawDatasetName,
        record,
        promotedAt,
        promotionDatasetName,
        approval,
      );
      if (rawSnapshot.supersededDatasetName) {
        itemSupersededDatasetNames.push(rawSnapshot.supersededDatasetName);
        supersededDatasetNames.push(rawSnapshot.supersededDatasetName);
      }
      if (rawSnapshot.snapshotDatasetName) {
        itemSnapshotDatasetNames.push(rawSnapshot.snapshotDatasetName);
        snapshotDatasetNames.push(rawSnapshot.snapshotDatasetName);
        warnings.push(
          `Raw promoted dataset "${rawDatasetName}" already existed and was snapshotted to "${rawSnapshot.snapshotDatasetName}" before update.`,
        );
      }

      saveNamedDataset(projectId, {
        name: rawDatasetName,
        kind: 'borehole-log',
        data: borehole,
        source: record.datasetName,
        metadata: createPromotionDatasetMetadata('raw-borehole', record, promotedAt, promotionDatasetName, {
          boreholeId: borehole.boreholeId,
          targetDatasetName: rawDatasetName,
          supersededDatasetName: rawSnapshot.supersededDatasetName,
          snapshotDatasetName: rawSnapshot.snapshotDatasetName,
          approval,
        }),
      });
      promotedDatasetNames.push(rawDatasetName);
      promotedDatasetKinds.push('borehole-log');
      promotedBoreholeIds.push(borehole.boreholeId);

      const soilProfileProjection = toPromotableSoilProfile(borehole);
      warnings.push(...soilProfileProjection.warnings);

      let promotedSoilProfile = false;
      let soilProfileDatasetName: string | undefined;
      if (soilProfileProjection.profile) {
        soilProfileDatasetName = borehole.boreholeId;
        const soilProfileSnapshot = snapshotNamedDatasetForPromotion(
          projectId,
          project.namedDatasets[soilProfileDatasetName],
          soilProfileDatasetName,
          record,
          promotedAt,
          promotionDatasetName,
          approval,
        );
        if (soilProfileSnapshot.supersededDatasetName) {
          itemSupersededDatasetNames.push(soilProfileSnapshot.supersededDatasetName);
          supersededDatasetNames.push(soilProfileSnapshot.supersededDatasetName);
        }
        if (soilProfileSnapshot.snapshotDatasetName) {
          itemSnapshotDatasetNames.push(soilProfileSnapshot.snapshotDatasetName);
          snapshotDatasetNames.push(soilProfileSnapshot.snapshotDatasetName);
          warnings.push(
            `Soil profile dataset "${soilProfileDatasetName}" already existed and was snapshotted to "${soilProfileSnapshot.snapshotDatasetName}" before update.`,
          );
        } else if (project.soilProfiles.some((profile) => profile.boreholeId === borehole.boreholeId)) {
          warnings.push(`Soil profile "${borehole.boreholeId}" already existed and was updated from the promoted review.`);
        }
        addSoilProfile(projectId, soilProfileProjection.profile);
        saveNamedDataset(projectId, {
          name: soilProfileDatasetName,
          kind: 'soil-profile',
          data: soilProfileProjection.profile,
          source: record.datasetName,
          metadata: createPromotionDatasetMetadata('soil-profile', record, promotedAt, promotionDatasetName, {
            boreholeId: borehole.boreholeId,
            targetDatasetName: soilProfileDatasetName,
            supersededDatasetName: soilProfileSnapshot.supersededDatasetName,
            snapshotDatasetName: soilProfileSnapshot.snapshotDatasetName,
            approval,
          }),
        });
        promotedSoilProfile = true;
        promotedDatasetNames.push(soilProfileDatasetName);
        promotedDatasetKinds.push('soil-profile');
      }

      promotedBoreholes.push({
        boreholeId: borehole.boreholeId,
        rawDatasetName,
        soilProfileDatasetName,
        promotedSoilProfile,
        supersededDatasetNames: [...new Set(itemSupersededDatasetNames)],
        snapshotDatasetNames: [...new Set(itemSnapshotDatasetNames)],
        warnings: soilProfileProjection.warnings,
      });
    }
  } else {
    const documentDatasets: Array<{
      role: PromotedGeotechDocumentIngestReviewItem['role'];
      kind: PromotedGeotechDocumentIngestReviewItem['datasetKind'];
      data:
        | PromotedDocumentInsightRecord
        | PromotedMaterialObservationsRecord
        | PromotedParameterCatalogRecord
        | PromotedClassificationSummaryRecord;
    }> = [
      {
        role: 'document-insight',
        kind: 'document-insight',
        data: {
          kind: 'document-insight-record',
          schemaVersion: 1,
          reviewId: record.reviewId,
          reviewDatasetName: record.datasetName,
          sourceStamps: record.sourceStamps,
          documentClass: record.result.documentClass,
          title: record.result.title,
          summary: record.result.summary,
          risks: record.result.risks,
          recommendations: record.result.recommendations,
          materialCount: record.result.materials.length,
          classificationCount: record.result.classifications.length,
          parameterCount: record.result.parameters.length,
          source: record.result.source,
        },
      },
      {
        role: 'material-observations',
        kind: 'material-observations',
        data: {
          kind: 'material-observations-record',
          schemaVersion: 1,
          reviewId: record.reviewId,
          reviewDatasetName: record.datasetName,
          sourceStamps: record.sourceStamps,
          materials: record.result.materials,
        },
      },
      {
        role: 'parameter-catalog',
        kind: 'parameter-catalog',
        data: {
          kind: 'parameter-catalog-record',
          schemaVersion: 1,
          reviewId: record.reviewId,
          reviewDatasetName: record.datasetName,
          sourceStamps: record.sourceStamps,
          parameters: record.result.parameters,
        },
      },
      {
        role: 'classification-summary',
        kind: 'classification-summary',
        data: {
          kind: 'classification-summary-record',
          schemaVersion: 1,
          reviewId: record.reviewId,
          reviewDatasetName: record.datasetName,
          sourceStamps: record.sourceStamps,
          classifications: record.result.classifications,
        },
      },
    ];

    for (const item of documentDatasets) {
      const datasetNameForRole = buildPromotedDocumentDatasetName(record.reviewId, item.role);
      const roleWarnings: string[] = [];
      const itemSupersededDatasetNames: string[] = [];
      const itemSnapshotDatasetNames: string[] = [];
      const snapshot = snapshotNamedDatasetForPromotion(
        projectId,
        project.namedDatasets[datasetNameForRole],
        datasetNameForRole,
        record,
        promotedAt,
        promotionDatasetName,
        approval,
      );
      if (snapshot.supersededDatasetName) {
        itemSupersededDatasetNames.push(snapshot.supersededDatasetName);
        supersededDatasetNames.push(snapshot.supersededDatasetName);
      }
      if (snapshot.snapshotDatasetName) {
        itemSnapshotDatasetNames.push(snapshot.snapshotDatasetName);
        snapshotDatasetNames.push(snapshot.snapshotDatasetName);
        roleWarnings.push(
          `Dataset "${datasetNameForRole}" already existed and was snapshotted to "${snapshot.snapshotDatasetName}" before update.`,
        );
      }

      saveNamedDataset(projectId, {
        name: datasetNameForRole,
        kind: item.kind,
        data: item.data,
        source: record.datasetName,
        metadata: createPromotionDatasetMetadata(item.role, record, promotedAt, promotionDatasetName, {
          targetDatasetName: datasetNameForRole,
          supersededDatasetName: snapshot.supersededDatasetName,
          snapshotDatasetName: snapshot.snapshotDatasetName,
          approval,
        }),
      });

      promotedDatasetNames.push(datasetNameForRole);
      promotedDatasetKinds.push(item.kind);
      promotedDocuments.push({
        role: item.role,
        datasetName: datasetNameForRole,
        datasetKind: item.kind,
        supersededDatasetNames: [...new Set(itemSupersededDatasetNames)],
        snapshotDatasetNames: [...new Set(itemSnapshotDatasetNames)],
        warnings: roleWarnings,
      });
      warnings.push(...roleWarnings);
    }
  }

  const promotionSnapshot = snapshotNamedDatasetForPromotion(
    projectId,
    project.namedDatasets[promotionDatasetName],
    promotionDatasetName,
    record,
    promotedAt,
    promotionDatasetName,
    approval,
  );
  if (promotionSnapshot.supersededDatasetName) {
    supersededDatasetNames.push(promotionSnapshot.supersededDatasetName);
  }
  if (promotionSnapshot.snapshotDatasetName) {
    snapshotDatasetNames.push(promotionSnapshot.snapshotDatasetName);
    warnings.push(
      `Promotion dataset "${promotionDatasetName}" already existed and was snapshotted to "${promotionSnapshot.snapshotDatasetName}" before update.`,
    );
  }

  const result: PromotedBoreholeIngestReviewResult = {
    kind: 'geotech-ingest-promotion-result',
    schemaVersion: 1,
    projectId,
    documentType: record.result.documentType,
    sourceDatasetName: record.datasetName,
    sourceReviewDatasetName: record.datasetName,
    sourceReviewId: record.reviewId,
    sourceStamps: record.sourceStamps,
    approvalDatasetName: approval?.datasetName,
    approvalId: approval?.approvalId,
    approvedAt: approval?.approvedAt,
    approvedBy: approval?.approvedBy,
    approvalRationale: approval?.rationale,
    promotedAt,
    promotionDatasetName,
    promotedDatasetNames: [...new Set(promotedDatasetNames)],
    promotedDatasetKinds: [...new Set(promotedDatasetKinds)],
    promotedBoreholeIds: [...new Set(promotedBoreholeIds)],
    supersededDatasetNames: [...new Set(supersededDatasetNames)],
    snapshotDatasetNames: [...new Set(snapshotDatasetNames)],
    promotedBoreholes,
    promotedDocuments,
    warnings: [...new Set(warnings)],
  };

  saveNamedDataset(projectId, {
    name: promotionDatasetName,
    kind: 'geotech-ingest-promotion',
    data: result,
    source: record.datasetName,
    metadata: createPromotionDatasetMetadata('promotion-result', record, promotedAt, promotionDatasetName, {
      targetDatasetName: promotionDatasetName,
      supersededDatasetName: promotionSnapshot.supersededDatasetName,
      snapshotDatasetName: promotionSnapshot.snapshotDatasetName,
      approval,
    }),
  });

  addArtifact(projectId, {
    kind: 'ingest-promotion',
    title: `Promoted ingest review: ${record.title}`,
    content: createPromotionArtifactPreview(result),
    mimeType: 'text/plain',
    metadata: {
      sourceReviewDatasetName: record.datasetName,
      sourceReviewId: record.reviewId,
      documentType: record.result.documentType,
      sourceFingerprint: record.sourceStamps.sourceFingerprint,
      parserVersion: record.sourceStamps.parserVersion,
      normalizedResultHash: record.sourceStamps.normalizedResultHash,
      promotedBoreholeIds: result.promotedBoreholeIds,
      promotedDatasetNames: result.promotedDatasetNames,
      promotedDatasetKinds: result.promotedDatasetKinds,
      supersededDatasetNames: result.supersededDatasetNames,
      snapshotDatasetNames: result.snapshotDatasetNames,
      approvalDatasetName: result.approvalDatasetName,
      approvalId: result.approvalId,
      approvedAt: result.approvedAt,
      approvedBy: result.approvedBy,
      approvalRationale: result.approvalRationale,
    },
  });

  addNote(
    projectId,
    `Promoted ingest review "${record.reviewId}" into ${result.promotedDatasetNames.length} dataset(s)${record.result.documentType === 'borehole-log' && promotedBoreholes.some((item) => item.promotedSoilProfile) ? ' with soil-profile updates' : ''}${approval ? ` using recorded approval "${approval.datasetName}"` : ''}${result.snapshotDatasetNames.length > 0 ? ` and ${result.snapshotDatasetNames.length} rollback snapshot(s)` : ''}.`,
  );

  const relatedDatasets = [
    ...new Set([
      ...project.activeAnalysisContext.relatedDatasets,
      record.datasetName,
      promotionDatasetName,
      ...result.promotedDatasetNames,
      ...result.snapshotDatasetNames,
    ]),
  ];
  setActiveAnalysisContext(projectId, {
    currentTask: `Promoted ingest review for ${reviewSourceLabel(record.result)}`,
    context: {
      ...project.activeAnalysisContext.context,
      latestPromotedIngestReview: {
        reviewDatasetName: record.datasetName,
        promotionDatasetName,
        approvalDatasetName: result.approvalDatasetName,
        approvalId: result.approvalId,
        approvedAt: result.approvedAt,
        approvedBy: result.approvedBy,
        reviewId: record.reviewId,
        documentType: result.documentType,
        sourceStamps: result.sourceStamps,
        promotedBoreholeIds: result.promotedBoreholeIds,
        promotedDatasetNames: result.promotedDatasetNames,
        promotedDatasetKinds: result.promotedDatasetKinds,
        supersededDatasetNames: result.supersededDatasetNames,
        snapshotDatasetNames: result.snapshotDatasetNames,
      },
    },
    relatedDatasets,
  });

  return result;
}

import { readFileSync } from 'node:fs';
import type { CompletionResponse, LLMConfig } from '../llm/types.js';
import { generateText } from '../llm/router.js';
import { resolveProviderCapabilities } from '../llm/index.js';
import { parseJsonObject } from '../vision/parse.js';
import {
  extractGeotechDocumentFactsFromText,
  interpretGeotechDocumentPage,
  type GeotechDocumentClassification,
  type GeotechDocumentContext,
  type GeotechDocumentInsight,
  type GeotechMaterialObservation,
  type GeotechParameterObservation,
  type ParseStatus,
} from '../vision/geotech-document.js';
import { transcribeDocumentImageText } from '../vision/index.js';
import { recoverDocumentTextHint, type DocumentTextHintSource } from '../vision/ocr.js';
import type { PdfDocumentInspection, PdfPageClassification } from './pdf.js';
import type { IngestSegmentationSummary } from './segmentation.js';
import {
  PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
  buildPageEvidenceCacheKey,
  buildPageEvidenceModelVersion,
  buildPageEvidencePreprocessingVersion,
  hashBuffer,
  hashString,
  readPageEvidenceCache,
  writePageEvidenceCache,
  type PageEvidenceCacheEntry,
  type PageEvidenceCacheKeyParts,
  type WritePageEvidenceCacheInput,
} from './page-evidence-cache.js';
import {
  attachDocumentEvidencePacket,
  buildDocumentEvidencePacket,
  compileDocumentEvidenceSynthesisPrompt,
  type DocumentEvidencePacket,
} from './document-evidence-packet.js';

export interface GeotechDocumentVisionInput {
  base64: string;
  mimeType: string;
  fileBytes?: number;
}

export interface GeotechDocumentPageInput extends GeotechDocumentVisionInput {
  pageNumber: number;
  totalPages: number;
  sourceKind?: 'pdf-page' | 'raster-image';
  filePath?: string;
}

export interface GeotechDocumentSource {
  filePath?: string;
  fileName?: string;
  inputKind: 'image' | 'pdf';
  pageRange?: [number, number];
  segmentation?: IngestSegmentationSummary;
}

export type GeotechDocumentPageEvidenceCacheStatus = 'hit' | 'miss' | 'stored' | 'skipped';

export interface GeotechDocumentPageEvidenceCacheAudit {
  status: GeotechDocumentPageEvidenceCacheStatus;
  entryId: string;
  cacheKey: string;
  fileHash: string;
  pageHash: string;
  pageNumber: number;
  modelVersion: string;
  preprocessingVersion: string;
  schemaVersion: number;
  createdAt?: string;
  reason?: string;
}

export interface GeotechDocumentPageAudit {
  pageNumber: number;
  classification: PdfPageClassification | null;
  textHintSource: DocumentTextHintSource;
  parseStatus: ParseStatus;
  confidence: number;
  materialCount: number;
  classificationCount: number;
  parameterCount: number;
  evidenceCache?: GeotechDocumentPageEvidenceCacheAudit;
  warnings: string[];
}

export type GeotechDocumentFindingSeverity = 'advisory' | 'review' | 'blocking';
export type GeotechDocumentFindingScope = 'document' | 'page' | 'material';

export interface GeotechDocumentFinding {
  code: string;
  severity: GeotechDocumentFindingSeverity;
  scope: GeotechDocumentFindingScope;
  message: string;
  pageNumber?: number;
  materialDescription?: string;
}

export interface GeotechDocumentInspectionSummary {
  pageClassificationCounts: Partial<Record<PdfPageClassification, number>>;
  imageHeavyPageCount: number;
  nativeTextPageCount: number;
  degradedPageCount: number;
  ocrRecoveredPageCount: number;
}

export interface GeotechDocumentIngestResult {
  kind: 'geotech-ingest-result';
  schemaVersion: 1;
  documentType: 'geotech-document';
  generatedAt: string;
  source: GeotechDocumentSource & {
    totalPages: number;
    successfulPages: number;
    failedPages: number;
  };
  inspection: PdfDocumentInspection | null;
  inspectionSummary: GeotechDocumentInspectionSummary | null;
  documentClass: string | null;
  title: string | null;
  summary: string | null;
  materials: GeotechMaterialObservation[];
  classifications: GeotechDocumentClassification[];
  parameters: GeotechParameterObservation[];
  risks: string[];
  recommendations: string[];
  synthesis?: GeotechDocumentSynthesis | null;
  contentChunks?: GeotechDocumentContentChunk[];
  evidencePacket?: DocumentEvidencePacket;
  pageAudits: GeotechDocumentPageAudit[];
  pageFailures: string[];
  warnings: string[];
  reviewFindings: GeotechDocumentFinding[];
  reviewReasons: string[];
  parseStatus: ParseStatus;
  confidence: number;
  reviewRequired: boolean;
  canAutoProceed: boolean;
}

export interface GeotechDocumentSynthesis {
  takeaways: string[];
  groundModel: string[];
  keyParameters: string[];
  interpretation: string[];
  limitations: string[];
  sourcePages: number[];
  rawLLMText?: string;
  latencyMs?: number;
}

export interface GeotechDocumentContentChunk {
  chunkId: string;
  pageRange: [number, number];
  headingAncestry: string[];
  scope: 'page' | 'table' | 'figure' | 'section';
  sectionType?: GeotechDocumentSectionType;
  significance?: number;
  text: string;
  sourcePages: number[];
}

export type GeotechDocumentSectionType =
  | 'administrative'
  | 'summary'
  | 'ground-model'
  | 'laboratory'
  | 'classification'
  | 'groundwater'
  | 'recommendation'
  | 'visual-appendix'
  | 'general';

interface PreparedGeotechDocumentChunk extends GeotechDocumentContentChunk {
  sectionType: GeotechDocumentSectionType;
  significance: number;
  documentClass: string | null;
  title: string | null;
  summary: string | null;
}

export interface IngestGeotechDocumentOptions {
  config: LLMConfig;
  source: GeotechDocumentSource;
  inspection?: PdfDocumentInspection | null;
  image?: GeotechDocumentVisionInput;
  pages?: GeotechDocumentPageInput[];
  interpretPage?: typeof interpretGeotechDocumentPage;
  extractTextFacts?: typeof extractGeotechDocumentFactsFromText;
  transcribePageImageText?: typeof transcribeDocumentImageText;
  synthesizeDocument?: (input: {
    config: LLMConfig;
    result: Omit<GeotechDocumentIngestResult, 'synthesis' | 'contentChunks'> & {
      contentChunks?: GeotechDocumentContentChunk[];
    };
  }) => Promise<GeotechDocumentSynthesis | null>;
  usePageEvidenceCache?: boolean;
  pageConcurrency?: number;
  now?: () => Date;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParseStatus(value: unknown): value is ParseStatus {
  return value === 'parsed' || value === 'partial' || value === 'failed';
}

function asCachedGeotechDocumentInsight(value: unknown): GeotechDocumentInsight | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isParseStatus(value.parseStatus)
    || typeof value.confidence !== 'number'
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.materials)
    || !Array.isArray(value.classifications)
    || !Array.isArray(value.parameters)
    || !Array.isArray(value.risks)
    || !Array.isArray(value.recommendations)
  ) {
    return null;
  }

  return value as unknown as GeotechDocumentInsight;
}

interface GeotechDocumentPageEvidenceCacheContext {
  parts: PageEvidenceCacheKeyParts;
  cacheKey: string;
  entryId: string;
  pageNumber: number;
}

function resolveSourceFileHash(
  source: GeotechDocumentSource,
  pages: GeotechDocumentPageInput[] | undefined,
): string {
  const sourceFilePath = source.filePath ?? pages?.find((page) => page.filePath)?.filePath;
  if (sourceFilePath) {
    try {
      return hashBuffer(readFileSync(sourceFilePath));
    } catch {
      // Fall through to a stable metadata hash when the source is a synthetic test input.
    }
  }

  return hashString(JSON.stringify({
    filePath: source.filePath ?? null,
    fileName: source.fileName ?? null,
    inputKind: source.inputKind,
    pageRange: source.pageRange ?? null,
  }));
}

function resolveEvidenceCachePageNumber(
  source: GeotechDocumentSource,
  page: GeotechDocumentPageInput,
): number {
  const pageRange = source.segmentation?.pageRange ?? source.pageRange;
  if (pageRange && page.pageNumber < pageRange[0]) {
    return pageRange[0] + page.pageNumber - 1;
  }
  return page.pageNumber;
}

function resolveResultSourcePageNumber(
  source: GeotechDocumentSource,
  pageNumber: number | null | undefined,
): number | null {
  if (pageNumber == null || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return null;
  }
  const pageRange = source.segmentation?.pageRange ?? source.pageRange;
  if (pageRange && pageNumber < pageRange[0]) {
    return pageRange[0] + pageNumber - 1;
  }
  return pageNumber;
}

function mergeObservationSourcePages(
  existing: number[] | undefined,
  extra: number | number[] | null | undefined,
): number[] | undefined {
  const values = [
    ...(existing ?? []),
    ...(Array.isArray(extra) ? extra : extra == null ? [] : [extra]),
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return values.length > 0 ? [...new Set(values)].sort((left, right) => left - right) : undefined;
}

function buildPageEvidenceCacheContext(input: {
  source: GeotechDocumentSource;
  page: GeotechDocumentPageInput;
  fileHash: string;
  modelVersion: string;
  preprocessingVersion: string;
}): GeotechDocumentPageEvidenceCacheContext {
  const pageNumber = resolveEvidenceCachePageNumber(input.source, input.page);
  const pageHash = input.source.inputKind === 'pdf'
    && (input.page.sourceKind === 'pdf-page' || input.page.mimeType === 'application/pdf')
    ? hashString(`pdf-page:${pageNumber}`)
    : hashString(`${input.page.mimeType}\n${input.page.base64}`);
  const parts: PageEvidenceCacheKeyParts = {
    fileHash: input.fileHash,
    pageHash,
    pageNumber,
    modelVersion: input.modelVersion,
    preprocessingVersion: input.preprocessingVersion,
    schemaVersion: PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
  };
  const cacheKey = buildPageEvidenceCacheKey(parts);
  return {
    parts,
    cacheKey,
    entryId: cacheKey.slice(0, 12),
    pageNumber,
  };
}

function buildPageEvidenceCacheAudit(
  context: GeotechDocumentPageEvidenceCacheContext,
  status: GeotechDocumentPageEvidenceCacheStatus,
  entry?: PageEvidenceCacheEntry | null,
  reason?: string,
): GeotechDocumentPageEvidenceCacheAudit {
  return {
    status,
    entryId: context.entryId,
    cacheKey: context.cacheKey,
    fileHash: context.parts.fileHash,
    pageHash: context.parts.pageHash,
    pageNumber: context.pageNumber,
    modelVersion: context.parts.modelVersion,
    preprocessingVersion: context.parts.preprocessingVersion,
    schemaVersion: context.parts.schemaVersion ?? PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
    createdAt: entry?.createdAt,
    reason,
  };
}

function safeReadPageEvidenceCache(context: GeotechDocumentPageEvidenceCacheContext): PageEvidenceCacheEntry | null {
  try {
    return readPageEvidenceCache(context.parts);
  } catch {
    return null;
  }
}

function safeWritePageEvidenceCache(
  context: GeotechDocumentPageEvidenceCacheContext,
  evidence: WritePageEvidenceCacheInput,
  now: () => Date,
): { entry: PageEvidenceCacheEntry | null; error?: string } {
  try {
    return {
      entry: writePageEvidenceCache(context.parts, evidence, { now }),
    };
  } catch (error) {
    return {
      entry: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function shouldUsePageEvidenceCache(option: boolean | undefined): boolean {
  if (option === true) {
    return true;
  }
  if (option === false) {
    return false;
  }
  return process.env.NODE_ENV !== 'test';
}

function normalizeTextItems(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value.map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '')),
  ).slice(0, limit);
}

function normalizeSourcePages(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )].sort((left, right) => left - right);
}

function createFindingKey(finding: GeotechDocumentFinding): string {
  return [
    finding.severity,
    finding.scope,
    finding.code,
    finding.message,
    finding.pageNumber ?? '',
    finding.materialDescription ?? '',
  ].join('|');
}

function uniqueFindings(findings: GeotechDocumentFinding[]): GeotechDocumentFinding[] {
  const seen = new Set<string>();
  const unique: GeotechDocumentFinding[] = [];

  for (const finding of findings) {
    const key = createFindingKey(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }

  return unique;
}

function findingRequiresReview(finding: GeotechDocumentFinding): boolean {
  return finding.severity !== 'advisory';
}

function summarizeReviewReasons(findings: GeotechDocumentFinding[]): string[] {
  return uniqueStrings(
    findings
      .filter(findingRequiresReview)
      .map((finding) => finding.message),
  );
}

function normalizePageErrorMessage(message: string): string {
  let normalized = message.trim();
  for (let index = 0; index < 4; index += 1) {
    const updated = normalized.replace(/^Page \d+:\s*/i, '').trim();
    if (updated === normalized) {
      break;
    }
    normalized = updated;
  }
  return normalized;
}

function summarizeInspection(
  inspection: PdfDocumentInspection | null | undefined,
  ocrRecoveredPageCount = 0,
): GeotechDocumentInspectionSummary | null {
  if (!inspection) {
    return null;
  }

  const counts: Partial<Record<PdfPageClassification, number>> = {};
  let imageHeavyPageCount = 0;
  let nativeTextPageCount = 0;
  let degradedPageCount = 0;

  for (const page of inspection.pages) {
    counts[page.classification] = (counts[page.classification] ?? 0) + 1;
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
    pageClassificationCounts: counts,
    imageHeavyPageCount,
    nativeTextPageCount,
    degradedPageCount,
    ocrRecoveredPageCount,
  };
}

function buildInspectionWarnings(
  inspection: PdfDocumentInspection | null | undefined,
): string[] {
  if (!inspection) {
    return [];
  }

  const warnings: string[] = [...inspection.warnings];
  for (const page of inspection.pages) {
    if (page.classification === 'image-only' || page.classification === 'text-unreadable') {
      warnings.push(
        `PDF page ${page.pageNumber} is ${page.classification}. Native text was not recovered from the PDF parser, so OCR-style transcription may be needed.`,
      );
    }
  }

  return uniqueStrings(warnings);
}

function mergeParseStatus(statuses: ParseStatus[]): ParseStatus {
  if (statuses.length === 0) {
    return 'failed';
  }
  if (statuses.every((status) => status === 'parsed')) {
    return 'parsed';
  }
  if (statuses.some((status) => status !== 'failed')) {
    return 'partial';
  }
  return 'failed';
}

function mergeMaterials(
  results: GeotechDocumentInsight[],
  source: GeotechDocumentSource,
): GeotechMaterialObservation[] {
  const seen = new Set<string>();
  const indexByKey = new Map<string, number>();
  const materials: GeotechMaterialObservation[] = [];

  for (const result of results) {
    const sourcePage = resolveResultSourcePageNumber(source, result.pageNumber);
    for (const material of result.materials) {
      const key = [
        material.kind,
        material.description.toLowerCase(),
        material.uscsSymbol ?? '',
        material.lithology?.toLowerCase() ?? '',
      ].join('|');
      if (seen.has(key)) {
        const index = indexByKey.get(key);
        if (index != null) {
          materials[index] = {
            ...materials[index]!,
            sourcePages: mergeObservationSourcePages(materials[index]!.sourcePages, material.sourcePages ?? sourcePage),
          };
        }
        continue;
      }
      seen.add(key);
      indexByKey.set(key, materials.length);
      materials.push({
        ...material,
        sourcePages: mergeObservationSourcePages(material.sourcePages, sourcePage),
      });
    }
  }

  return materials;
}

function mergeClassifications(
  results: GeotechDocumentInsight[],
  source: GeotechDocumentSource,
): GeotechDocumentClassification[] {
  const seen = new Set<string>();
  const indexByKey = new Map<string, number>();
  const classifications: GeotechDocumentClassification[] = [];

  for (const result of results) {
    const sourcePage = resolveResultSourcePageNumber(source, result.pageNumber);
    for (const classification of result.classifications) {
      const key = [
        classification.system.toLowerCase(),
        classification.value.toLowerCase(),
        classification.context?.toLowerCase() ?? '',
      ].join('|');
      if (seen.has(key)) {
        const index = indexByKey.get(key);
        if (index != null) {
          classifications[index] = {
            ...classifications[index]!,
            sourcePages: mergeObservationSourcePages(classifications[index]!.sourcePages, classification.sourcePages ?? sourcePage),
          };
        }
        continue;
      }
      seen.add(key);
      indexByKey.set(key, classifications.length);
      classifications.push({
        ...classification,
        sourcePages: mergeObservationSourcePages(classification.sourcePages, sourcePage),
      });
    }
  }

  return classifications;
}

function mergeParameters(
  results: GeotechDocumentInsight[],
  source: GeotechDocumentSource,
): GeotechParameterObservation[] {
  const seen = new Set<string>();
  const indexByKey = new Map<string, number>();
  const parameters: GeotechParameterObservation[] = [];

  for (const result of results) {
    const sourcePage = resolveResultSourcePageNumber(source, result.pageNumber);
    for (const parameter of result.parameters) {
      const key = [
        parameter.name.toLowerCase(),
        parameter.valueText.toLowerCase(),
        parameter.unit?.toLowerCase() ?? '',
        parameter.material?.toLowerCase() ?? '',
        parameter.context?.toLowerCase() ?? '',
      ].join('|');
      if (seen.has(key)) {
        const index = indexByKey.get(key);
        if (index != null) {
          parameters[index] = {
            ...parameters[index]!,
            sourcePages: mergeObservationSourcePages(parameters[index]!.sourcePages, parameter.sourcePages ?? sourcePage),
          };
        }
        continue;
      }
      seen.add(key);
      indexByKey.set(key, parameters.length);
      parameters.push({
        ...parameter,
        sourcePages: mergeObservationSourcePages(parameter.sourcePages, sourcePage),
      });
    }
  }

  return parameters;
}

function sanitizeImplausibleSptParameters(parameters: GeotechParameterObservation[]): {
  parameters: GeotechParameterObservation[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sanitized = parameters.filter((parameter) => {
    if (parameter.name.toLowerCase() !== 'sptn' || parameter.numericValue == null || parameter.numericValue <= 200) {
      return true;
    }

    warnings.push(
      `Ignored implausible SPT N value (${parameter.valueText}); it appears to be a standard/reference number rather than a blow count.`,
    );
    return false;
  });

  return { parameters: sanitized, warnings };
}

function resolvePageConcurrency(
  config: LLMConfig,
  requestedConcurrency?: number,
): number {
  if (requestedConcurrency != null && Number.isFinite(requestedConcurrency)) {
    return Math.max(1, Math.min(4, Math.trunc(requestedConcurrency)));
  }

  const capabilities = resolveProviderCapabilities(config);
  if (config.provider === 'hosted-beta') {
    return 2;
  }

  return capabilities.visionImages ? 3 : 2;
}

function shouldSeriallyProcessImageHeavyPages(
  config: LLMConfig,
  inspection: PdfDocumentInspection | null | undefined,
): boolean {
  if (config.provider !== 'hosted-beta' || !inspection || inspection.totalPages <= 1) {
    return false;
  }

  const imageHeavyPages = inspection.pages.filter((page) =>
    page.classification === 'image-only'
    || page.classification === 'text-unreadable'
    || page.classification === 'graphics-only',
  ).length;

  return imageHeavyPages >= Math.max(2, Math.ceil(inspection.totalPages / 2));
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker()),
  );

  return results;
}

async function withPageTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let handle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        handle = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (handle) {
      clearTimeout(handle);
    }
  }
}

function resolvePagePhaseTimeoutMs(
  config: LLMConfig,
  input: {
    classification?: PdfPageClassification | null;
    sourceKind?: GeotechDocumentPageInput['sourceKind'];
  },
): number {
  const baseTimeoutMs = Math.min(Math.max(config.timeout ?? 120000, 60000), 120000);
  const isHeavyVisualPage =
    input.sourceKind === 'raster-image'
    || input.classification === 'image-only'
    || input.classification === 'text-unreadable';

  return isHeavyVisualPage
    ? Math.min(Math.max(baseTimeoutMs, 180000), 180000)
    : baseTimeoutMs;
}

function resolveTextExtractionTimeoutMs(
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

function shouldPreferDirectVisualExtraction(input: {
  config: LLMConfig;
  page: GeotechDocumentPageInput;
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

  return input.page.sourceKind === 'raster-image'
    && (
      input.inspectionPage?.classification === 'image-only'
      || input.inspectionPage?.classification === 'graphics-only'
      || input.inspectionPage?.classification === 'text-unreadable'
    );
}

function normalizeHeadingText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/()-]+/g, '')
    .trim();
}

function buildHeadingKey(headings: string[]): string {
  return headings
    .map(normalizeHeadingText)
    .filter(Boolean)
    .join(' > ');
}

function collectResultTextSignals(result: GeotechDocumentInsight): string {
  return [
    result.title,
    result.summary,
    ...result.materials.map((material) => material.description),
    ...result.classifications.map((classification) =>
      `${classification.system} ${classification.value}${classification.context ? ` ${classification.context}` : ''}`.trim(),
    ),
    ...result.parameters.map((parameter) =>
      `${parameter.name} ${parameter.valueText}${parameter.unit ? ` ${parameter.unit}` : ''}${parameter.context ? ` ${parameter.context}` : ''}`.trim(),
    ),
    ...result.risks,
    ...result.recommendations,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .trim();
}

function inferChunkScope(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
): GeotechDocumentContentChunk['scope'] {
  return inspectionPage?.normalizedArtifact?.tablesDetected
    ? 'table'
    : inspectionPage?.normalizedArtifact?.figuresDetected
      ? 'figure'
      : (inspectionPage?.normalizedArtifact?.headingHints.length ?? 0) > 0
        ? 'section'
        : 'page';
}

function inferSectionType(input: {
  result: GeotechDocumentInsight;
  inspectionPage?: PdfDocumentInspection['pages'][number];
  scope: GeotechDocumentContentChunk['scope'];
}): GeotechDocumentSectionType {
  if (input.result.documentClass === 'administrative-document') {
    return 'administrative';
  }

  if (input.result.documentClass === 'visual-appendix-document') {
    return 'visual-appendix';
  }

  const leadingSignalText = buildPageLeadText(input.inspectionPage, {
    bodyLineLimit: 8,
    bodyCharacterLimit: 420,
    acceptedOnly: true,
  }).toLowerCase();
  const signalText = [
    input.result.title,
    input.result.summary,
    ...(input.inspectionPage?.normalizedArtifact?.headingHints ?? []),
    input.inspectionPage?.normalizedArtifact?.nativeText ?? '',
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();
  const extractedEngineeringSignals =
    input.result.materials.length > 0
    || input.result.classifications.length > 0
    || input.result.parameters.length > 0;
  const pageEngineeringSignals = hasEngineeringPageSignals(input.inspectionPage);
  const hasMeaningfulEngineeringSignals = extractedEngineeringSignals || pageEngineeringSignals;

  if (
    !hasMeaningfulEngineeringSignals
    && /\b(cover|title page|document control|distribution|revision|issue register|transmittal|copyright|prepared for|prepared by|checked by|approved by|table of contents|contents)\b/.test(leadingSignalText)
  ) {
    return 'administrative';
  }

  if (/\b(executive summary|summary|conclusion|overview|scope of works?)\b/.test(signalText)) {
    return 'summary';
  }

  if (input.result.recommendations.length > 0 || /\b(recommend|mitigation|next step|monitor|confirm|verify|further investigation)\b/.test(signalText)) {
    return 'recommendation';
  }

  if (/\b(groundwater|water table|seepage|piezometric|aquifer|dewatering)\b/.test(signalText)) {
    return 'groundwater';
  }

  if (
    input.result.classifications.length > 0
    || /\b(uscs|rmr|rqd|q-system|classification)\b/.test(signalText)
  ) {
    return 'classification';
  }

  if (
    input.result.materials.length > 0
    || /\b(geology|geological|lithology|lithological|strata|stratigraphy|formation|borehole|ground conditions?|subsurface|rock mass|weathered|fill|standard penetration test|spt|field methods?)\b/.test(signalText)
  ) {
    return 'ground-model';
  }

  if (
    input.result.parameters.length > 0
    || /\b(laboratory|lab report|triaxial|atterberg|plasticity|permeability|moisture content|ucs|uniaxial|direct shear|ccil|chain of custody)\b/.test(signalText)
  ) {
    return 'laboratory';
  }

  if (
    !hasMeaningfulEngineeringSignals
    && (
      input.scope === 'figure'
      || /\b(figure|fig\.|plate|photo|sketch|section view|appendix|appendices|photo log|drawing)\b/.test(leadingSignalText)
    )
  ) {
    return 'visual-appendix';
  }

  return 'general';
}

function scoreChunkSignificance(input: {
  result: GeotechDocumentInsight;
  scope: GeotechDocumentContentChunk['scope'];
  sectionType: GeotechDocumentSectionType;
}): number {
  let score = 0;

  score += Math.min(16, input.result.materials.length * 3);
  score += Math.min(15, input.result.classifications.length * 4);
  score += Math.min(24, input.result.parameters.length * 5);
  score += Math.min(8, input.result.risks.length * 2);
  score += Math.min(8, input.result.recommendations.length * 2);
  if (input.result.summary) {
    score += 6;
  }
  if (input.result.parseStatus === 'parsed') {
    score += 8;
  } else if (input.result.parseStatus === 'partial') {
    score += 3;
  }

  switch (input.sectionType) {
    case 'ground-model':
      score += 12;
      break;
    case 'laboratory':
      score += 14;
      break;
    case 'classification':
      score += 10;
      break;
    case 'groundwater':
      score += 9;
      break;
    case 'recommendation':
      score += 7;
      break;
    case 'summary':
      score += 5;
      break;
    case 'visual-appendix':
      score -= 6;
      break;
    case 'administrative':
      score -= 18;
      break;
    default:
      break;
  }

  if (input.scope === 'table') {
    score += 5;
  } else if (input.scope === 'figure') {
    score -= 4;
  }

  return Math.max(0, Math.min(100, score));
}

function buildPreparedPageChunks(
  results: GeotechDocumentInsight[],
  inspection: PdfDocumentInspection | null | undefined,
): PreparedGeotechDocumentChunk[] {
  return results
    .filter((result) => result.pageNumber != null)
    .map((result) => {
      const pageNumber = result.pageNumber ?? 0;
      const inspectionPage = inspection?.pages[pageNumber - 1];
      const text = collectResultTextSignals(result);
      const scope = inferChunkScope(inspectionPage);
      const sectionType = inferSectionType({ result, inspectionPage, scope });
      const significance = scoreChunkSignificance({ result, scope, sectionType });

      return {
        chunkId: `page-${pageNumber}`,
        pageRange: [pageNumber, pageNumber] as [number, number],
        headingAncestry: inspectionPage?.normalizedArtifact?.headingHints ?? [],
        scope,
        sectionType,
        significance,
        text,
        sourcePages: [pageNumber],
        documentClass: result.documentClass,
        title: result.title,
        summary: result.summary,
      };
    })
    .filter((chunk) => chunk.text.trim().length > 0);
}

function shouldMergePreparedChunks(
  previous: PreparedGeotechDocumentChunk,
  current: PreparedGeotechDocumentChunk,
): boolean {
  if (current.pageRange[0] !== previous.pageRange[1] + 1) {
    return false;
  }

  if (previous.sectionType !== current.sectionType) {
    return false;
  }

  if (
    previous.sectionType === 'administrative'
    || previous.sectionType === 'visual-appendix'
    || previous.scope === 'figure'
    || current.scope === 'figure'
  ) {
    return false;
  }

  const previousHeadingKey = buildHeadingKey(previous.headingAncestry);
  const currentHeadingKey = buildHeadingKey(current.headingAncestry);
  if (previousHeadingKey && currentHeadingKey) {
    return previousHeadingKey === currentHeadingKey;
  }

  return previous.scope === current.scope;
}

function mergePreparedChunks(chunks: PreparedGeotechDocumentChunk[]): PreparedGeotechDocumentChunk[] {
  const merged: PreparedGeotechDocumentChunk[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (!previous || !shouldMergePreparedChunks(previous, chunk)) {
      merged.push({
        ...chunk,
        sourcePages: [...chunk.sourcePages],
      });
      continue;
    }

    previous.chunkId = `${previous.chunkId}+${chunk.chunkId}`;
    previous.pageRange = [previous.pageRange[0], chunk.pageRange[1]];
    previous.sourcePages = [...new Set([...previous.sourcePages, ...chunk.sourcePages])];
    previous.headingAncestry = previous.headingAncestry.length >= chunk.headingAncestry.length
      ? previous.headingAncestry
      : chunk.headingAncestry;
    previous.text = `${previous.text}\n\n${chunk.text}`.trim();
    previous.significance = Math.min(100, previous.significance + chunk.significance);
    if (!previous.summary && chunk.summary) {
      previous.summary = chunk.summary;
    }
    if (!previous.title && chunk.title) {
      previous.title = chunk.title;
    }
    if (!previous.documentClass && chunk.documentClass) {
      previous.documentClass = chunk.documentClass;
    }
    if (previous.scope === 'page' && chunk.scope === 'section') {
      previous.scope = 'section';
    }
    if (previous.scope === 'page' && chunk.scope === 'table') {
      previous.scope = 'table';
    }
  }

  return merged;
}

function buildContentChunks(
  results: GeotechDocumentInsight[],
  inspection: PdfDocumentInspection | null | undefined,
): PreparedGeotechDocumentChunk[] {
  return mergePreparedChunks(buildPreparedPageChunks(results, inspection));
}

function isGenericDocumentTitle(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }

  return /\b(cover sheet|cover page|table of contents|contents|appendix|drawing register|revision history|project information)\b/i.test(value);
}

function isFigureOrAppendixTitle(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return /^(?:fig(?:ure)?\.?\s*\d*|plate\s*\d*|table\s*\d*|annexure|appendix)\b/.test(normalized)
    || /\b(?:graph|curve|chart|photograph|photo|grain size distribution|n['’]?\s*vs\.?\s*depth|drill log|bore\s*\/?\s*drill log)\b/.test(normalized);
}

function isReportLevelTitle(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }
  return /\b(?:geotechnical|geo-technical|geotech|ground|soil|subsurface|sub-soil|site)\b.{0,80}\b(?:investigation|assessment|report|study)\b/i.test(value)
    || /\b(?:site investigation report|ground investigation report|subsoil investigation report|geotechnical investigation report)\b/i.test(value);
}

function isReportDocumentClass(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'site-investigation-report'
    || normalized === 'geotechnical-investigation'
    || normalized === 'geotechnical-document';
}

function hasDocumentLevelReportCue(chunk: PreparedGeotechDocumentChunk): boolean {
  const signalText = [
    chunk.title,
    chunk.summary,
    chunk.text,
    chunk.headingAncestry.join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  return /\b(geotechnical report|site investigation|subsurface investigation|executive summary|foundation recommendations?|scope of work|ground model|recommendations?)\b/.test(signalText);
}

function chooseDocumentClass(chunks: PreparedGeotechDocumentChunk[]): string | null {
  const scores = new Map<string, number>();
  const firstMeaningfulClass = chunks.find((chunk) =>
    chunk.sectionType !== 'administrative'
    && chunk.sectionType !== 'visual-appendix'
    && typeof chunk.documentClass === 'string'
    && chunk.documentClass.trim().length > 0
    && chunk.documentClass.toLowerCase() !== 'unknown',
  )?.documentClass?.trim() ?? null;

  for (const chunk of chunks) {
    const documentClass = chunk.documentClass?.trim();
    if (!documentClass || documentClass.toLowerCase() === 'unknown') {
      continue;
    }

    const weight =
      chunk.sectionType === 'administrative' || chunk.sectionType === 'visual-appendix'
        ? 0
        : Math.max(1, chunk.significance);
    if (weight === 0) {
      continue;
    }

    scores.set(
      documentClass,
      (scores.get(documentClass) ?? 0)
      + weight
      - (documentClass === 'geotechnical-document' ? 3 : 0),
    );
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0) {
    return firstMeaningfulClass;
  }

  const hasBoreholeAppendixClass = scores.has('borehole-log');
  const firstMeaningfulReportChunk = chunks.find((chunk) =>
    chunk.sectionType !== 'administrative'
    && chunk.sectionType !== 'visual-appendix'
    && isReportDocumentClass(chunk.documentClass)
  );
  if (hasBoreholeAppendixClass && firstMeaningfulReportChunk) {
    const reportClass = firstMeaningfulReportChunk.documentClass?.trim() ?? firstMeaningfulClass;
    const reportScore = [...scores.entries()]
      .filter(([documentClass]) => isReportDocumentClass(documentClass))
      .reduce((sum, [, score]) => sum + score, 0);
    const boreholeScore = scores.get('borehole-log') ?? 0;
    if (
      reportClass
      && (
        firstMeaningfulClass === reportClass
        || hasDocumentLevelReportCue(firstMeaningfulReportChunk)
        || reportScore >= Math.max(18, boreholeScore * 0.15)
      )
    ) {
      return reportClass;
    }
  }

  if (
    hasBoreholeAppendixClass
    && chunks.some((chunk) =>
      chunk.sectionType !== 'administrative'
      && chunk.sectionType !== 'visual-appendix'
      && hasDocumentLevelReportCue(chunk)
    )
  ) {
    return 'geotechnical-document';
  }

  if (
    firstMeaningfulClass
    && ranked.length > 1
    && ranked[0]![1] - ranked[1]![1] <= 12
  ) {
    return firstMeaningfulClass;
  }

  return ranked[0]?.[0] ?? firstMeaningfulClass;
}

function chooseDocumentTitle(chunks: PreparedGeotechDocumentChunk[]): string | null {
  const usable = chunks
    .filter((chunk) =>
      typeof chunk.title === 'string'
      && chunk.title.trim().length > 0
      && !isGenericDocumentTitle(chunk.title)
      && !isFigureOrAppendixTitle(chunk.title),
    );
  const earlyReportTitle = usable
    .filter((chunk) =>
      chunk.pageRange[0] <= 5
      && (isReportLevelTitle(chunk.title) || hasDocumentLevelReportCue(chunk)),
    )
    .sort((left, right) =>
      left.pageRange[0] - right.pageRange[0]
      || right.significance - left.significance,
    )[0]?.title?.trim();
  if (earlyReportTitle) {
    return earlyReportTitle;
  }

  const reportCueTitle = usable
    .filter((chunk) => isReportLevelTitle(chunk.title) || hasDocumentLevelReportCue(chunk))
    .sort((left, right) => right.significance - left.significance)[0]?.title?.trim();
  if (reportCueTitle) {
    return reportCueTitle;
  }

  return usable
    .filter((chunk) => chunk.sectionType !== 'visual-appendix')
    .sort((left, right) => right.significance - left.significance)
    .map((chunk) => chunk.title?.trim())
    .find((value): value is string => typeof value === 'string' && value.length > 0)
    ?? null;
}

function chooseDocumentSummary(chunks: PreparedGeotechDocumentChunk[]): string | null {
  const ranked = [...chunks]
    .filter((chunk) => chunk.sectionType !== 'administrative')
    .sort((left, right) => right.significance - left.significance);
  const summaries = uniqueStrings(
    ranked
      .map((chunk) => chunk.summary)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
  ).slice(0, 3);

  return summaries.length > 0 ? summaries.join(' ') : null;
}

function isEmptySynthesisResponseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no content|empty.*content|assistant text|did not contain assistant text/i.test(message);
}

async function synthesizeGeotechDocumentResult(input: {
  config: LLMConfig;
  result: Omit<GeotechDocumentIngestResult, 'synthesis' | 'contentChunks'> & {
    contentChunks?: GeotechDocumentContentChunk[];
  };
}): Promise<GeotechDocumentSynthesis | null> {
  const evidencePacket = buildDocumentEvidencePacket({
    ...input.result,
    synthesis: null,
    contentChunks: input.result.contentChunks ?? [],
  } as GeotechDocumentIngestResult);
  const compiledPrompt = compileDocumentEvidenceSynthesisPrompt(evidencePacket);
  if (!compiledPrompt.hasEngineeringSignal) {
    return null;
  }

  const requestSynthesis = async (thinkingMode: 'enabled' | 'disabled'): Promise<CompletionResponse> =>
    generateText(compiledPrompt.prompt, input.config, {
      systemPrompt: compiledPrompt.systemPrompt,
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 1200,
      thinkingMode,
    });

  let response: CompletionResponse;
  try {
    response = await requestSynthesis('enabled');
    if (!response.text.trim()) {
      response = await requestSynthesis('disabled');
    }
  } catch (error) {
    if (!isEmptySynthesisResponseError(error)) {
      throw error;
    }
    response = await requestSynthesis('disabled');
  }
  const parsed = parseJsonObject(response.text);
  if (!parsed.value) {
    return {
      takeaways: [],
      groundModel: [],
      keyParameters: [],
      interpretation: [],
      limitations: ['GLM-5.1 synthesis did not return valid JSON; use extracted tables and page audits for review.'],
      sourcePages: [],
      rawLLMText: response.text,
      latencyMs: response.latencyMs,
    };
  }

  return {
    takeaways: normalizeTextItems(parsed.value.takeaways, 8),
    groundModel: normalizeTextItems(parsed.value.groundModel, 10),
    keyParameters: normalizeTextItems(parsed.value.keyParameters, 16),
    interpretation: normalizeTextItems(parsed.value.interpretation, 10),
    limitations: normalizeTextItems(parsed.value.limitations, 10),
    sourcePages: normalizeSourcePages(parsed.value.sourcePages),
    rawLLMText: response.text,
    latencyMs: response.latencyMs,
  };
}

function buildPageLeadText(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
  options?: { bodyLineLimit?: number; bodyCharacterLimit?: number; acceptedOnly?: boolean },
): string {
  if (!inspectionPage) {
    return '';
  }

  const bodyLineLimit = options?.bodyLineLimit ?? 8;
  const bodyCharacterLimit = options?.bodyCharacterLimit ?? 480;
  const acceptedOnly = options?.acceptedOnly ?? false;
  const accepted = inspectionPage.normalizedArtifact?.textQuality?.accepted ?? false;
  const nativeText =
    acceptedOnly && !accepted
      ? ''
      : inspectionPage.normalizedArtifact?.nativeText
        ?? inspectionPage.normalizedText
        ?? '';
  const bodyPreview = nativeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, bodyLineLimit)
    .join('\n')
    .slice(0, bodyCharacterLimit);

  return uniqueStrings([
    ...(inspectionPage.normalizedArtifact?.headingHints ?? []),
    bodyPreview,
  ])
    .join('\n')
    .trim();
}

function hasEngineeringPageSignals(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
): boolean {
  if (!inspectionPage) {
    return false;
  }

  if (inspectionPage.normalizedArtifact?.tablesDetected) {
    return true;
  }

  const cueText = buildPageLeadText(inspectionPage, {
    bodyLineLimit: 18,
    bodyCharacterLimit: 1200,
    acceptedOnly: false,
  }).toLowerCase();

  return /\b(bh\d{1,5}[a-z0-9-]*|borehole|northing|easting|elevation|masl|m asl|standard penetration test|spt|astm|soil sample|laboratory|triaxial|consolidation|plasticity|liquid limit|grain size|shear|friction angle|cohesion|unit weight|moisture content|permeability|groundwater|rqd|rmr|q-system|ucs)\b/.test(cueText);
}

function inferNonCriticalPageRole(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
): GeotechDocumentSectionType | null {
  if (!inspectionPage) {
    return null;
  }

  const engineeringSignals = hasEngineeringPageSignals(inspectionPage);
  const headingText = buildPageLeadText(inspectionPage, {
    bodyLineLimit: 6,
    bodyCharacterLimit: 360,
    acceptedOnly: true,
  }).toLowerCase();

  if (
    !engineeringSignals
    && /\b(cover|title page|table of contents|contents|document control|revision|distribution|transmittal|copyright)\b/.test(headingText)
  ) {
    return 'administrative';
  }

  if (
    !engineeringSignals
    && (
      inspectionPage.normalizedArtifact?.figuresDetected
      || /\b(appendix|figure|fig\.|plate|photo|sketch|drawing)\b/.test(headingText)
    )
  ) {
    return 'visual-appendix';
  }

  return null;
}

function inferAppendixDividerRole(
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined,
): GeotechDocumentSectionType | null {
  if (!inspectionPage) {
    return null;
  }

  const leadText = buildPageLeadText(inspectionPage, {
    bodyLineLimit: 6,
    bodyCharacterLimit: 320,
    acceptedOnly: true,
  }).toLowerCase();

  if (!leadText || !/\bappendix\b/.test(leadText)) {
    return null;
  }

  if (/\b(figures?|plates?|photos?|photographs?|drawings?|plans?|sketches?|site layout)\b/.test(leadText)) {
    return 'visual-appendix';
  }

  if (/\b(record of boreholes?|borehole logs?|borehole records?|test pits?|cpt|cone penetration)\b/.test(leadText)) {
    return null;
  }

  return null;
}

export function inferPreflightLowYieldPageRole(input: {
  inspectionPage: PdfDocumentInspection['pages'][number] | undefined;
  previousInspectionPage?: PdfDocumentInspection['pages'][number] | undefined;
  nextInspectionPage?: PdfDocumentInspection['pages'][number] | undefined;
  pageNumber?: number | null;
  totalPages?: number | null;
  sourceKind?: GeotechDocumentPageInput['sourceKind'];
}): GeotechDocumentSectionType | null {
  const explicitRole = inferNonCriticalPageRole(input.inspectionPage);
  if (explicitRole) {
    return explicitRole;
  }

  const inspectionPage = input.inspectionPage;
  if (!inspectionPage) {
    return null;
  }

  if (inspectionPage.classification === 'empty') {
    return input.pageNumber === 1 ? 'administrative' : 'visual-appendix';
  }

  const wordCount = inspectionPage.metadata?.wordCount ?? 0;
  const textSource = inspectionPage.normalizedArtifact?.textSource;
  const previousDividerRole = inferAppendixDividerRole(input.previousInspectionPage);
  const nextDividerRole = inferAppendixDividerRole(input.nextInspectionPage);
  const previousLooksVisual =
    previousDividerRole === 'visual-appendix'
    || input.previousInspectionPage?.classification === 'graphics-only';
  const nextLooksVisual =
    nextDividerRole === 'visual-appendix'
    || input.nextInspectionPage?.classification === 'graphics-only';

  if (
    input.pageNumber === 1
    && inspectionPage.classification === 'image-only'
    && textSource === 'native-text-low-quality'
    && wordCount > 0
    && wordCount <= 80
    && !inspectionPage.normalizedArtifact?.tablesDetected
    && !inspectionPage.normalizedArtifact?.figuresDetected
  ) {
    return 'administrative';
  }

  if (
    previousDividerRole === 'visual-appendix'
    && (inspectionPage.classification === 'image-only' || inspectionPage.classification === 'graphics-only')
    && textSource === 'native-text-low-quality'
    && wordCount <= 120
    && !hasEngineeringPageSignals(inspectionPage)
  ) {
    return 'visual-appendix';
  }

  if (
    (inspectionPage.classification === 'image-only' || inspectionPage.classification === 'graphics-only')
    && input.sourceKind === 'raster-image'
    && wordCount === 0
    && !hasEngineeringPageSignals(inspectionPage)
    && (
      nextLooksVisual
      || (previousLooksVisual && input.pageNumber != null && input.totalPages != null && input.pageNumber >= input.totalPages - 2)
    )
  ) {
    return 'visual-appendix';
  }

  if (
    inspectionPage.classification === 'graphics-only'
    && input.pageNumber === input.totalPages
  ) {
    return 'visual-appendix';
  }

  if (
    inspectionPage.classification === 'graphics-only'
    && input.sourceKind === 'raster-image'
    && wordCount <= 80
  ) {
    return 'visual-appendix';
  }

  return null;
}

export function buildPreflightLowYieldInsight(input: {
  role: GeotechDocumentSectionType;
  inspectionPage: PdfDocumentInspection['pages'][number];
  pageNumber: number;
  totalPages: number;
}): GeotechDocumentInsight {
  const headingSummary = buildPageLeadText(input.inspectionPage, {
    bodyLineLimit: 6,
    bodyCharacterLimit: 200,
    acceptedOnly: true,
  })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  const title =
    input.role === 'administrative'
      ? headingSummary || 'Administrative / cover page'
      : headingSummary || 'Figure / appendix page';

  const summary =
    input.role === 'administrative'
      ? `Page ${input.pageNumber} of ${input.totalPages} appears to be an administrative or cover-style page. No reliable engineering data was extracted, so this page was summarized without an expensive vision pass.`
      : `Page ${input.pageNumber} of ${input.totalPages} appears to be a graphics or appendix page. It was summarized as low-yield visual content without a full multimodal extraction pass.`;

  const warnings = [
    input.role === 'administrative'
      ? 'Low-yield administrative/cover page was short-circuited before multimodal extraction.'
      : 'Low-yield figure/appendix page was short-circuited before multimodal extraction.',
  ];

  return {
    documentClass: input.role === 'administrative' ? 'administrative-document' : 'visual-appendix-document',
    title,
    summary,
    materials: [],
    classifications: [],
    parameters: [],
    risks: [],
    recommendations: [],
    pageNumber: input.pageNumber,
    totalPages: input.totalPages,
    rawLLMText: '',
    latencyMs: 0,
    parseStatus: 'partial',
    confidence: input.role === 'administrative' ? 48 : 55,
    warnings,
    canAutoProceed: false,
  };
}

function deriveDocumentFindings(
  results: GeotechDocumentInsight[],
  pageFailures: string[],
  materials: GeotechMaterialObservation[],
  classifications: GeotechDocumentClassification[],
  parameters: GeotechParameterObservation[],
  inspection: PdfDocumentInspection | null | undefined,
): GeotechDocumentFinding[] {
  const findings: GeotechDocumentFinding[] = [];
  const hasEngineeringContent = materials.length > 0 || classifications.length > 0 || parameters.length > 0;

  for (const result of results) {
    const inspectionPage = result.pageNumber != null ? inspection?.pages[result.pageNumber - 1] : undefined;
    const previousInspectionPage = result.pageNumber != null ? inspection?.pages[result.pageNumber - 2] : undefined;
    const nextInspectionPage = result.pageNumber != null ? inspection?.pages[result.pageNumber] : undefined;
    const nonCriticalRole = inferPreflightLowYieldPageRole({
      inspectionPage,
      previousInspectionPage,
      nextInspectionPage,
      pageNumber: result.pageNumber,
      totalPages: result.totalPages,
      sourceKind:
        inspectionPage?.classification === 'image-only'
        || inspectionPage?.classification === 'graphics-only'
        || inspectionPage?.classification === 'text-unreadable'
          ? 'raster-image'
          : undefined,
    });
    if (result.parseStatus === 'failed') {
      findings.push({
        code: nonCriticalRole === 'administrative' ? 'administrative_page_low_yield' : nonCriticalRole === 'visual-appendix' ? 'visual_appendix_low_yield' : 'page_geotech_extraction_failed',
        severity: nonCriticalRole && hasEngineeringContent ? 'advisory' : 'blocking',
        scope: 'page',
        message: nonCriticalRole === 'administrative'
          ? `Page ${result.pageNumber ?? '?'} looked administrative (cover/contents/control) and did not contribute engineering content.`
          : nonCriticalRole === 'visual-appendix'
            ? `Page ${result.pageNumber ?? '?'} looked like a figure/appendix page and did not contribute structured engineering content.`
            : `Page ${result.pageNumber ?? '?'} did not yield usable geotechnical content.`,
        pageNumber: result.pageNumber ?? undefined,
      });
      continue;
    }

    if (result.parseStatus === 'partial' || result.confidence < 60) {
      findings.push({
        code: nonCriticalRole === 'administrative' ? 'administrative_page_partial' : nonCriticalRole === 'visual-appendix' ? 'visual_appendix_partial' : 'page_geotech_extraction_partial',
        severity: nonCriticalRole ? 'advisory' : 'review',
        scope: 'page',
        message: nonCriticalRole === 'administrative'
          ? `Page ${result.pageNumber ?? '?'} appears administrative and produced only low-yield extraction output.`
          : nonCriticalRole === 'visual-appendix'
            ? `Page ${result.pageNumber ?? '?'} appears to be a figure/appendix page and produced only partial engineering yield.`
            : `Page ${result.pageNumber ?? '?'} produced partial or low-confidence geotechnical interpretation.`,
        pageNumber: result.pageNumber ?? undefined,
      });
    }
  }

  for (const failure of pageFailures) {
    const pageNumber = Number((failure.match(/^Page (\d+):/) ?? [])[1]);
    const isTimeout = /timed out|timeout|\b524\b|upstream request failed/i.test(failure);
    const inspectionPage = Number.isFinite(pageNumber) ? inspection?.pages[pageNumber - 1] : undefined;
    const previousInspectionPage = Number.isFinite(pageNumber) ? inspection?.pages[pageNumber - 2] : undefined;
    const nextInspectionPage = Number.isFinite(pageNumber) ? inspection?.pages[pageNumber] : undefined;
    const nonCriticalRole = inferPreflightLowYieldPageRole({
      inspectionPage,
      previousInspectionPage,
      nextInspectionPage,
      pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
      totalPages: inspection?.totalPages ?? null,
      sourceKind:
        inspectionPage?.classification === 'image-only'
        || inspectionPage?.classification === 'graphics-only'
        || inspectionPage?.classification === 'text-unreadable'
          ? 'raster-image'
          : undefined,
    });
    findings.push({
      code:
        nonCriticalRole === 'administrative'
          ? 'administrative_page_failed'
          : nonCriticalRole === 'visual-appendix'
            ? (isTimeout ? 'visual_appendix_timeout' : 'visual_appendix_failed')
            : isTimeout
              ? 'visual_page_timeout'
              : 'page_ingest_failed',
      severity:
        nonCriticalRole && hasEngineeringContent
          ? 'advisory'
          : isTimeout
            ? 'review'
            : 'blocking',
      scope: 'page',
      message:
        nonCriticalRole === 'administrative'
          ? `${failure} This page appears administrative and was downgraded from a blocking failure.`
          : nonCriticalRole === 'visual-appendix'
            ? `${failure} This page appears to be a figure/appendix page and was downgraded from a blocking failure.`
            : failure,
      pageNumber: Number.isFinite(pageNumber) ? pageNumber : undefined,
    });
  }

  if (materials.length === 0 && classifications.length === 0 && parameters.length === 0) {
    findings.push({
      code: 'no_geotech_content_detected',
      severity: 'blocking',
      scope: 'document',
      message: 'No usable geology, lithology, or geotechnical engineering parameters were extracted from the supplied pages.',
    });
  } else if (parameters.length === 0) {
    findings.push({
      code: 'parameters_not_detected',
      severity: 'review',
      scope: 'document',
      message: 'Ground descriptions were found, but no explicit engineering parameters were extracted. Manual review may still be needed.',
    });
  } else if (classifications.length === 0) {
    findings.push({
      code: 'classifications_not_detected',
      severity: 'advisory',
      scope: 'document',
      message: 'Engineering parameters were found, but no formal soil/rock classification was extracted.',
    });
  }

  return uniqueFindings(findings);
}

export async function ingestGeotechDocument(
  options: IngestGeotechDocumentOptions,
): Promise<GeotechDocumentIngestResult> {
  const interpretPage = options.interpretPage ?? interpretGeotechDocumentPage;
  const extractTextFacts = options.extractTextFacts ?? extractGeotechDocumentFactsFromText;
  const transcribePageImageText = options.transcribePageImageText ?? transcribeDocumentImageText;
  const now = options.now ?? (() => new Date());

  if (!options.image && (!options.pages || options.pages.length === 0)) {
    throw new Error('Geotechnical document ingest requires either a single image input or one or more PDF page inputs.');
  }

  const pageAudits: GeotechDocumentPageAudit[] = [];
  const pageFailures: string[] = [];
  const pageResults: GeotechDocumentInsight[] = [];
  const documentWarnings = buildInspectionWarnings(options.inspection);
  const recoveredOcrPages = new Set<number>();
  const pageConcurrency = shouldSeriallyProcessImageHeavyPages(options.config, options.inspection)
    ? 1
    : resolvePageConcurrency(options.config, options.pageConcurrency);
  const usePageEvidenceCache = shouldUsePageEvidenceCache(options.usePageEvidenceCache);
  const pageEvidenceFileHash = usePageEvidenceCache
    ? resolveSourceFileHash(options.source, options.pages)
    : null;
  const pageEvidenceModelVersion = usePageEvidenceCache
    ? buildPageEvidenceModelVersion(options.config)
    : '';
  const pageEvidencePreprocessingVersion = usePageEvidenceCache
    ? buildPageEvidencePreprocessingVersion(options.config)
    : '';

  if (options.pages && options.pages.length > 0) {
    const pages = [...options.pages].sort((left, right) => left.pageNumber - right.pageNumber);
    const settledPages = await mapWithConcurrency(pages, pageConcurrency, async (page) => {
      const inspectionPage = options.inspection?.pages[page.pageNumber - 1];
      const lowYieldRole = inferPreflightLowYieldPageRole({
        inspectionPage,
        previousInspectionPage: options.inspection?.pages[page.pageNumber - 2],
        nextInspectionPage: options.inspection?.pages[page.pageNumber],
        pageNumber: page.pageNumber,
        totalPages: page.totalPages,
        sourceKind: page.sourceKind,
      });
      let pageTextHint =
        inspectionPage?.normalizedArtifact?.nativeText
        ?? inspectionPage?.normalizedText
        ?? undefined;
      let textHintSource: GeotechDocumentPageAudit['textHintSource'] = pageTextHint?.trim() ? 'native-text' : 'none';
      const cacheContext = usePageEvidenceCache && pageEvidenceFileHash
        ? buildPageEvidenceCacheContext({
            source: options.source,
            page,
            fileHash: pageEvidenceFileHash,
            modelVersion: pageEvidenceModelVersion,
            preprocessingVersion: pageEvidencePreprocessingVersion,
          })
        : null;
      const cachedEvidence = cacheContext ? safeReadPageEvidenceCache(cacheContext) : null;
      let evidenceCache = cacheContext
        ? buildPageEvidenceCacheAudit(cacheContext, cachedEvidence ? 'hit' : 'miss', cachedEvidence)
        : undefined;

      try {
        if (lowYieldRole && inspectionPage) {
          return {
            ok: true as const,
            pageNumber: page.pageNumber,
            inspectionPage,
            textHintSource,
            recoveryWarnings: [
              lowYieldRole === 'administrative'
                ? 'Administrative/cover page was summarized without a full multimodal extraction call.'
                : 'Figure/appendix page was summarized without a full multimodal extraction call.',
            ],
            ocrRecovered: false,
            evidenceCache: cacheContext
              ? buildPageEvidenceCacheAudit(cacheContext, 'skipped', null, 'low-yield page classified before model extraction')
              : evidenceCache,
            result: buildPreflightLowYieldInsight({
              role: lowYieldRole,
              inspectionPage,
              pageNumber: page.pageNumber,
              totalPages: page.totalPages,
            }),
          };
        }

        const cachedResult = asCachedGeotechDocumentInsight(cachedEvidence?.extractionResult);
        if (cachedResult) {
          return {
            ok: true as const,
            pageNumber: page.pageNumber,
            inspectionPage,
            textHintSource: cachedEvidence!.source,
            recoveryWarnings: cachedEvidence!.warnings,
            ocrRecovered: cachedEvidence!.source === 'local-ocr' || cachedEvidence!.source === 'vision-ocr' || cachedEvidence!.source === 'glm-ocr',
            evidenceCache,
            result: cachedResult,
          };
        }

        const cachedTextHint = cachedEvidence?.textHint;
        if (cachedTextHint) {
          pageTextHint = cachedTextHint;
          textHintSource = cachedEvidence.source;
        }

        const pageTimeoutMs = resolvePagePhaseTimeoutMs(options.config, {
          classification: inspectionPage?.classification,
          sourceKind: page.sourceKind,
        });
        const pagePhaseConfig: LLMConfig = {
          ...options.config,
          timeout: pageTimeoutMs,
        };
        if (shouldPreferDirectVisualExtraction({
          config: options.config,
          page,
          inspectionPage,
          textHint: pageTextHint,
        }) && !cachedTextHint) {
          const context: GeotechDocumentContext = {
            pageNumber: page.pageNumber,
            totalPages: page.totalPages,
            pageClassification: inspectionPage?.classification,
            directVisualPreferred: true,
          };
          const result = await withPageTimeout(
            interpretPage(page.base64, page.mimeType, pagePhaseConfig, context),
            pageTimeoutMs,
            `Page ${page.pageNumber}: direct visual page interpretation timed out after ${Math.round(pageTimeoutMs / 1000)}s`,
          );
          if (cacheContext) {
            const stored = safeWritePageEvidenceCache(cacheContext, {
              source: 'vision-visual',
              warnings: ['Skipped OCR-only transcription and used direct visual extraction for an image-heavy hosted-beta page.'],
              transformed: false,
              extractionResult: result,
            }, now);
            evidenceCache = stored.entry
              ? buildPageEvidenceCacheAudit(cacheContext, 'stored', stored.entry)
              : buildPageEvidenceCacheAudit(cacheContext, 'skipped', null, `cache write failed: ${stored.error}`);
          }

          return {
            ok: true as const,
            pageNumber: page.pageNumber,
            inspectionPage,
            textHintSource: 'vision-visual' as const,
            recoveryWarnings: ['Skipped OCR-only transcription and used direct visual extraction for an image-heavy hosted-beta page.'],
            ocrRecovered: false,
            evidenceCache,
            result,
          };
        }
        let recoveryWarnings = cachedEvidence?.warnings ?? [];
        let recoverySource: DocumentTextHintSource = textHintSource;
        let recoveryTransformed = cachedEvidence?.transformed ?? false;
        let layoutSummary = cachedEvidence?.layoutSummary;

        if (!cachedTextHint) {
          const recovery = await withPageTimeout(
            recoverDocumentTextHint({
              existingTextHint: pageTextHint,
              existingTextAccepted: inspectionPage?.normalizedArtifact?.textQuality.accepted ?? true,
              imageBase64: page.base64,
              mimeType: page.mimeType,
              config: pagePhaseConfig,
              pdfFilePath: page.filePath,
              pdfPageNumber: page.pageNumber,
              visionTranscribe: transcribePageImageText,
            }),
            pageTimeoutMs,
            `Page ${page.pageNumber}: OCR/text recovery timed out after ${Math.round(pageTimeoutMs / 1000)}s`,
          );
          if (recovery.textHint) {
            pageTextHint = recovery.textHint;
          }
          recoveryWarnings = recovery.warnings;
          recoverySource = recovery.source;
          recoveryTransformed = recovery.transformed;
          layoutSummary = recovery.layout
            ? `GLM-OCR parsed ${recovery.layout.pages.length} page(s), ${recovery.layout.pages.reduce((sum, layoutPage) => sum + layoutPage.tables.length, 0)} table(s).`
            : undefined;
        }
        textHintSource = recoverySource;

        const context: GeotechDocumentContext = {
          pageNumber: page.pageNumber,
          totalPages: page.totalPages,
          pageClassification: inspectionPage?.classification,
          pageTextHint,
          textRecoveryAttempted: !pageTextHint,
        };
        const extractionTimeoutMs = resolveTextExtractionTimeoutMs(pageTimeoutMs, pageTextHint);
        const extractionConfig: LLMConfig = {
          ...options.config,
          timeout: extractionTimeoutMs,
        };
        const result = pageTextHint
          ? await withPageTimeout(
            extractTextFacts(pageTextHint, extractionConfig, context),
            extractionTimeoutMs,
            `Page ${page.pageNumber}: text extraction timed out after ${Math.round(extractionTimeoutMs / 1000)}s`,
          )
          : await withPageTimeout(
            interpretPage(page.base64, page.mimeType, pagePhaseConfig, context),
            pageTimeoutMs,
            `Page ${page.pageNumber}: visual page interpretation timed out after ${Math.round(pageTimeoutMs / 1000)}s`,
          );

        if (cacheContext && !cachedEvidence) {
          const stored = safeWritePageEvidenceCache(cacheContext, {
            textHint: pageTextHint,
            source: textHintSource,
            warnings: recoveryWarnings,
            transformed: recoveryTransformed,
            layoutSummary,
            extractionResult: result,
          }, now);
          evidenceCache = stored.entry
            ? buildPageEvidenceCacheAudit(cacheContext, 'stored', stored.entry)
            : buildPageEvidenceCacheAudit(cacheContext, 'skipped', null, `cache write failed: ${stored.error}`);
        } else if (cacheContext && cachedEvidence && !cachedResult) {
          safeWritePageEvidenceCache(cacheContext, {
            textHint: pageTextHint,
            source: textHintSource,
            warnings: recoveryWarnings,
            transformed: recoveryTransformed,
            layoutSummary,
            extractionResult: result,
            createdAt: cachedEvidence.createdAt,
          }, now);
        }

        return {
          ok: true as const,
          pageNumber: page.pageNumber,
          inspectionPage,
          textHintSource,
          recoveryWarnings,
          ocrRecovered: textHintSource === 'local-ocr' || textHintSource === 'vision-ocr' || textHintSource === 'glm-ocr',
          evidenceCache,
          result,
        };
      } catch (error) {
        return {
          ok: false as const,
          pageNumber: page.pageNumber,
          inspectionPage,
          textHintSource,
          evidenceCache,
          error: normalizePageErrorMessage(error instanceof Error ? error.message : String(error)),
        };
      }
    });

    settledPages.sort((left, right) => left.pageNumber - right.pageNumber);
    for (const settled of settledPages) {
      if (settled.ok) {
        if (settled.ocrRecovered) {
          recoveredOcrPages.add(settled.pageNumber);
          documentWarnings.push(
            `Recovered ${
              settled.textHintSource === 'local-ocr'
                ? 'local OCR'
                : settled.textHintSource === 'glm-ocr'
                  ? 'GLM-OCR layout'
                  : 'OCR-style'
            } text hint for page ${settled.pageNumber}.`,
          );
        } else if (settled.textHintSource === 'pdfjs-text') {
          documentWarnings.push(
            `Recovered high-fidelity PDF text for page ${settled.pageNumber} without a multimodal OCR call.`,
          );
        }
        documentWarnings.push(
          ...settled.recoveryWarnings.map((warning) => `Page ${settled.pageNumber}: ${warning}`),
        );
        pageResults.push(settled.result);
        pageAudits.push({
          pageNumber: settled.pageNumber,
          classification: settled.inspectionPage?.classification ?? null,
          textHintSource: settled.textHintSource,
          parseStatus: settled.result.parseStatus,
          confidence: settled.result.confidence,
          materialCount: settled.result.materials.length,
          classificationCount: settled.result.classifications.length,
          parameterCount: settled.result.parameters.length,
          evidenceCache: settled.evidenceCache,
          warnings: uniqueStrings([
            ...settled.recoveryWarnings,
            ...settled.result.warnings,
          ]),
        });
        continue;
      }

      pageFailures.push(`Page ${settled.pageNumber}: ${settled.error}`);
      pageAudits.push({
        pageNumber: settled.pageNumber,
        classification: settled.inspectionPage?.classification ?? null,
        textHintSource: settled.textHintSource,
        parseStatus: 'failed',
        confidence: 0,
        materialCount: 0,
        classificationCount: 0,
        parameterCount: 0,
        evidenceCache: settled.evidenceCache,
        warnings: [settled.error],
      });
    }
  } else if (options.image) {
    const result = await interpretPage(
      options.image.base64,
      options.image.mimeType,
      options.config,
      { pageNumber: 1, totalPages: 1 },
    );
    pageResults.push(result);
    pageAudits.push({
      pageNumber: 1,
      classification: null,
      textHintSource: 'none',
      parseStatus: result.parseStatus,
      confidence: result.confidence,
      materialCount: result.materials.length,
      classificationCount: result.classifications.length,
      parameterCount: result.parameters.length,
      warnings: result.warnings,
    });
  }

  if (pageResults.length === 0) {
    throw new Error(
      pageFailures.length > 0
        ? `No pages could be ingested successfully.\n${pageFailures.join('\n')}`
        : 'No pages could be ingested successfully.',
    );
  }

  const materials = mergeMaterials(pageResults, options.source);
  const classifications = mergeClassifications(pageResults, options.source);
  const parameterSanitization = sanitizeImplausibleSptParameters(mergeParameters(pageResults, options.source));
  const parameters = parameterSanitization.parameters;
  const risks = uniqueStrings(pageResults.flatMap((result) => result.risks));
  const recommendations = uniqueStrings(pageResults.flatMap((result) => result.recommendations));
  const summaries = uniqueStrings(pageResults.map((result) => result.summary));
  const contentChunks = buildContentChunks(pageResults, options.inspection);
  const title = chooseDocumentTitle(contentChunks);
  const documentClass = chooseDocumentClass(contentChunks);
  const lowYieldPages = new Set(
    contentChunks
      .filter((chunk) => chunk.sectionType === 'administrative' || chunk.sectionType === 'visual-appendix')
      .flatMap((chunk) => chunk.sourcePages),
  );
  const partialAuditCount = pageAudits.filter((audit) =>
    audit.parseStatus === 'partial' && !lowYieldPages.has(audit.pageNumber)
  ).length;
  const failedAuditCount = pageAudits.filter((audit) =>
    audit.parseStatus === 'failed' && !lowYieldPages.has(audit.pageNumber)
  ).length;
  const parseStatus = pageFailures.length > 0
    ? 'partial'
    : mergeParseStatus(pageResults.map((result) => result.parseStatus));
  const baseConfidence = Math.round(
    pageResults.reduce((sum, result) => sum + result.confidence, 0) / pageResults.length,
  );
  const failurePenalty = Math.min(30, failedAuditCount * 12);
  const partialPenalty = Math.min(18, partialAuditCount * 6);
  const confidenceCap = failedAuditCount > 0
    ? 68
    : partialAuditCount > 0
      ? 78
      : 100;
  const confidence = Math.max(
    0,
    Math.min(
      confidenceCap,
      Math.round(baseConfidence - failurePenalty - partialPenalty),
    ),
  );
  const reviewFindings = deriveDocumentFindings(
    pageResults,
    pageFailures,
    materials,
    classifications,
    parameters,
    options.inspection,
  );
  for (const audit of pageAudits) {
    if (audit.textHintSource !== 'vision-visual') {
      continue;
    }
    reviewFindings.push({
      code: 'direct_visual_review_required',
      severity: 'review',
      scope: 'page',
      message: `Page ${audit.pageNumber} was interpreted directly from the rendered page image without accepted text or OCR transcription. Verify extracted values against the source page before approval.`,
      pageNumber: audit.pageNumber,
    });
  }
  const reviewRequired = reviewFindings.some(findingRequiresReview);
  const allPagesParsed = pageAudits.length > 0 && pageAudits.every((audit) => audit.parseStatus === 'parsed');
  const contentChunksForResult = contentChunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    pageRange: chunk.pageRange,
    headingAncestry: chunk.headingAncestry,
    scope: chunk.scope,
    sectionType: chunk.sectionType,
    significance: chunk.significance,
    text: chunk.text,
    sourcePages: chunk.sourcePages,
  }));
  const generatedAt = now().toISOString();
  const baseResult = {
    kind: 'geotech-ingest-result' as const,
    schemaVersion: 1 as const,
    documentType: 'geotech-document' as const,
    generatedAt,
    source: {
      ...options.source,
      totalPages: options.pages?.length ?? 1,
      successfulPages: pageResults.length,
      failedPages: pageFailures.length,
    },
    inspection: options.inspection ?? null,
    inspectionSummary: summarizeInspection(options.inspection, recoveredOcrPages.size),
    documentClass,
    title,
    summary: chooseDocumentSummary(contentChunks) ?? (summaries.length > 0 ? summaries.join(' ') : null),
    materials,
    classifications,
    parameters,
    risks,
    recommendations,
    contentChunks: contentChunksForResult,
    pageAudits,
    pageFailures,
    warnings: [],
    reviewFindings,
    reviewReasons: summarizeReviewReasons(reviewFindings),
    parseStatus,
    confidence,
    reviewRequired,
    canAutoProceed: !reviewRequired
      && parseStatus === 'parsed'
      && confidence >= 70
      && allPagesParsed
      && pageFailures.length === 0
      && parameterSanitization.warnings.length === 0,
  };
  let synthesis: GeotechDocumentSynthesis | null = null;
  const synthesisWarnings: string[] = [];
  const synthesisRunner =
    options.synthesizeDocument
    ?? (process.env.NODE_ENV === 'test' ? null : synthesizeGeotechDocumentResult);
  if (synthesisRunner) {
    try {
      synthesis = await synthesisRunner({
        config: options.config,
        result: baseResult,
      });
      if (synthesis && synthesis.takeaways.length > 0) {
        synthesisWarnings.push('GLM-5.1 synthesis generated report-level takeaways from extracted page evidence.');
      }
    } catch (error) {
      synthesisWarnings.push(
        `GLM-5.1 synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const warnings = uniqueStrings([
    ...documentWarnings,
    ...parameterSanitization.warnings,
    ...synthesisWarnings,
    ...pageResults.flatMap((result) => result.warnings),
  ]);

  const finalResult: GeotechDocumentIngestResult = {
    ...baseResult,
    summary: synthesis?.takeaways[0] ?? baseResult.summary,
    synthesis,
    warnings,
  };
  return attachDocumentEvidencePacket(finalResult);
}

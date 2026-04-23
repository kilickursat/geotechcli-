import type { LLMConfig } from '../llm/types.js';
import {
  interpretBoreholeLog,
  interpretBoreholeLogWithContext,
  mergeBoreholeLogPages,
  transcribeDocumentImageText,
  type BoreholeInterpretation,
  type BoreholeLogPageResult,
} from '../vision/index.js';
import { recoverDocumentTextHint, type DocumentTextHintSource } from '../vision/ocr.js';
import type { ParseStatus } from '../vision/parse.js';
import type { PdfDocumentInspection, PdfPageClassification } from './pdf.js';
import type { IngestSegmentationSummary } from './segmentation.js';

export interface BoreholeVisionInput {
  base64: string;
  mimeType: string;
  fileBytes?: number;
}

export interface BoreholeVisionPageInput extends BoreholeVisionInput {
  pageNumber: number;
  totalPages: number;
  sourceKind?: 'pdf-page' | 'raster-image';
  filePath?: string;
}

export interface BoreholeDocumentSource {
  filePath?: string;
  fileName?: string;
  inputKind: 'image' | 'pdf';
  pageRange?: [number, number];
  segmentation?: IngestSegmentationSummary;
}

export interface BoreholeIngestPageAudit {
  pageNumber: number;
  detectedBoreholeId: string | null;
  assignedGroup: string;
  classification: PdfPageClassification | null;
  textHintSource: DocumentTextHintSource;
  parseStatus: ParseStatus;
  confidence: number;
  continuationDepth: number | null;
  warnings: string[];
}

export type BoreholeIngestFindingSeverity = 'advisory' | 'review' | 'blocking';

export type BoreholeIngestFindingScope = 'document' | 'page' | 'borehole';

export interface BoreholeIngestFinding {
  code: string;
  severity: BoreholeIngestFindingSeverity;
  scope: BoreholeIngestFindingScope;
  message: string;
  pageNumber?: number;
  boreholeId?: string;
}

export interface BoreholeIngestInspectionSummary {
  pageClassificationCounts: Partial<Record<PdfPageClassification, number>>;
  imageHeavyPageCount: number;
  nativeTextPageCount: number;
  degradedPageCount: number;
  ocrRecoveredPageCount: number;
}

export interface BoreholeDocumentIngestResult {
  kind: 'geotech-ingest-result';
  schemaVersion: 1;
  documentType: 'borehole-log';
  generatedAt: string;
  source: BoreholeDocumentSource & {
    totalPages: number;
    successfulPages: number;
    failedPages: number;
  };
  inspection: PdfDocumentInspection | null;
  inspectionSummary: BoreholeIngestInspectionSummary | null;
  boreholes: BoreholeInterpretation[];
  pageAudits: BoreholeIngestPageAudit[];
  pageFailures: string[];
  warnings: string[];
  reviewFindings: BoreholeIngestFinding[];
  reviewReasons: string[];
  reviewRequired: boolean;
  confidence: number;
  canAutoProceed: boolean;
}

export interface IngestBoreholeLogDocumentOptions {
  config: LLMConfig;
  source: BoreholeDocumentSource;
  overrideBoreholeId?: string;
  inspection?: PdfDocumentInspection | null;
  image?: BoreholeVisionInput;
  pages?: BoreholeVisionPageInput[];
  interpretSingleImage?: typeof interpretBoreholeLog;
  interpretPageWithContext?: typeof interpretBoreholeLogWithContext;
  transcribePageImageText?: typeof transcribeDocumentImageText;
  now?: () => Date;
}

interface BoreholeGroupAccumulator {
  key: string;
  boreholeId: string | null;
  pages: BoreholeLogPageResult[];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function createFindingKey(finding: BoreholeIngestFinding): string {
  return [
    finding.severity,
    finding.scope,
    finding.code,
    finding.message,
    finding.pageNumber ?? '',
    finding.boreholeId ?? '',
  ].join('|');
}

function uniqueFindings(findings: BoreholeIngestFinding[]): BoreholeIngestFinding[] {
  const seen = new Set<string>();
  const unique: BoreholeIngestFinding[] = [];

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

function findingRequiresReview(finding: BoreholeIngestFinding): boolean {
  return finding.severity !== 'advisory';
}

function summarizeReviewReasons(findings: BoreholeIngestFinding[]): string[] {
  return uniqueStrings(
    findings
      .filter(findingRequiresReview)
      .map((finding) => finding.message),
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

function createGroupKey(
  boreholeId: string | null,
  anonymousIndex: number,
): { key: string; nextAnonymousIndex: number } {
  if (boreholeId) {
    return {
      key: `borehole:${boreholeId}`,
      nextAnonymousIndex: anonymousIndex,
    };
  }

  return {
    key: `unresolved:${anonymousIndex}`,
    nextAnonymousIndex: anonymousIndex + 1,
  };
}

function shouldStartNewAnonymousGroup(
  result: BoreholeInterpretation,
  currentGroup: BoreholeGroupAccumulator | null,
): boolean {
  if (!currentGroup || currentGroup.pages.length === 0) {
    return false;
  }

  const previousPage = currentGroup.pages[currentGroup.pages.length - 1]?.result;
  const previousContinuationDepth = previousPage?.continuationDepth ?? null;
  const currentStartDepth = minimumLayerDepth(result);

  return (
    previousContinuationDepth != null
    && previousContinuationDepth >= 3
    && currentStartDepth != null
    && currentStartDepth <= 0.5
  );
}

function summarizeInspection(
  inspection: PdfDocumentInspection | null | undefined,
  ocrRecoveredPageCount = 0,
): BoreholeIngestInspectionSummary | null {
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
        `PDF page ${page.pageNumber} is ${page.classification}. Native text was not recovered from the PDF parser, so an OCR-style transcription fallback may be needed.`,
      );
    }
  }

  return uniqueStrings(warnings);
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

function hasUsableBoreholeSignal(
  result: BoreholeInterpretation,
  detectedBoreholeId: string | null,
): boolean {
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

function averageConfidence(results: BoreholeInterpretation[]): number {
  if (results.length === 0) {
    return 0;
  }

  return Math.round(
    results.reduce((sum, result) => sum + result.confidence, 0) / results.length,
  );
}

function mergeParseStatuses(current: ParseStatus, next: ParseStatus | null): ParseStatus {
  if (!next) {
    return current;
  }

  if (current === 'failed' || next === 'failed') {
    return 'failed';
  }

  if (current === 'partial' || next === 'partial') {
    return 'partial';
  }

  return 'parsed';
}

function mergeConfidenceCap(current: number | null, next: number | null): number | null {
  if (current == null) {
    return next;
  }
  if (next == null) {
    return current;
  }
  return Math.min(current, next);
}

function maximumLayerDepth(result: BoreholeInterpretation): number | null {
  let maxDepth: number | null = null;

  for (const layer of result.layers) {
    const candidates = [layer.depthFrom, layer.depthTo].filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
    for (const candidate of candidates) {
      maxDepth = maxDepth == null ? candidate : Math.max(maxDepth, candidate);
    }
  }

  return maxDepth;
}

interface BoreholeValidationFeedback {
  warnings: string[];
  findings: BoreholeIngestFinding[];
  confidenceCap: number | null;
  degradedParseStatus: ParseStatus | null;
}

function validateMergedBorehole(result: BoreholeInterpretation): BoreholeValidationFeedback {
  const warnings: string[] = [];
  const findings: BoreholeIngestFinding[] = [];
  let confidenceCap: number | null = null;
  let degradedParseStatus: ParseStatus | null = null;

  const addIssue = (
    reason: string,
    options?: {
      code?: string;
      severity?: BoreholeIngestFindingSeverity;
      warning?: string;
      confidenceCap?: number;
      degradeParseStatus?: ParseStatus;
    },
  ): void => {
    findings.push({
      code: options?.code ?? 'validation_issue',
      severity: options?.severity ?? 'review',
      scope: 'borehole',
      message: reason,
      boreholeId: result.boreholeId,
    });
    warnings.push(options?.warning ?? reason);
    confidenceCap = mergeConfidenceCap(confidenceCap, options?.confidenceCap ?? null);
    degradedParseStatus = mergeParseStatuses(
      degradedParseStatus ?? 'parsed',
      options?.degradeParseStatus ?? null,
    );
  };

  if (result.totalDepth != null) {
    if (result.totalDepth < 0) {
      addIssue(
        `Borehole ${result.boreholeId} has a negative total depth (${result.totalDepth} m).`,
        {
          code: 'negative_total_depth',
          severity: 'blocking',
          confidenceCap: 55,
          degradeParseStatus: 'partial',
        },
      );
    } else if (result.totalDepth > 300) {
      addIssue(
        `Borehole ${result.boreholeId} has an unusually large total depth (${result.totalDepth} m) that should be reviewed.`,
        {
          code: 'unusually_large_total_depth',
          severity: 'review',
          confidenceCap: 68,
        },
      );
    }
  }

  if (result.waterTableDepth != null) {
    if (result.waterTableDepth < 0) {
      addIssue(
        `Borehole ${result.boreholeId} has a negative water table depth (${result.waterTableDepth} m).`,
        {
          code: 'negative_water_table_depth',
          severity: 'blocking',
          confidenceCap: 55,
          degradeParseStatus: 'partial',
        },
      );
    } else if (result.totalDepth != null && result.waterTableDepth > result.totalDepth + 0.5) {
      addIssue(
        `Borehole ${result.boreholeId} has a water table depth (${result.waterTableDepth} m) deeper than the total depth (${result.totalDepth} m).`,
        {
          code: 'water_table_below_total_depth',
          severity: 'blocking',
          confidenceCap: 68,
          degradeParseStatus: 'partial',
        },
      );
    }
  }

  if (result.groundElevation != null && (result.groundElevation < -500 || result.groundElevation > 9000)) {
    addIssue(
      `Borehole ${result.boreholeId} has an implausible ground elevation (${result.groundElevation} m).`,
      {
        code: 'implausible_ground_elevation',
        severity: 'review',
        confidenceCap: 68,
      },
    );
  }

  let previousDepthTo: number | null = null;
  result.layers.forEach((layer, index) => {
    const label = `Borehole ${result.boreholeId} layer ${index + 1}`;

    if (layer.depthFrom != null && layer.depthFrom < 0) {
      addIssue(`${label} has a negative top depth (${layer.depthFrom} m).`, {
        code: 'negative_layer_top_depth',
        severity: 'blocking',
        confidenceCap: 55,
        degradeParseStatus: 'partial',
      });
    }

    if (layer.depthTo != null && layer.depthTo < 0) {
      addIssue(`${label} has a negative bottom depth (${layer.depthTo} m).`, {
        code: 'negative_layer_bottom_depth',
        severity: 'blocking',
        confidenceCap: 55,
        degradeParseStatus: 'partial',
      });
    }

    if (layer.depthFrom != null && layer.depthTo != null && layer.depthTo < layer.depthFrom) {
      addIssue(
        `${label} ends above where it starts (${layer.depthFrom} m to ${layer.depthTo} m).`,
        {
          code: 'layer_depth_reversed',
          severity: 'blocking',
          confidenceCap: 55,
          degradeParseStatus: 'partial',
        },
      );
    }

    if (previousDepthTo != null && layer.depthFrom != null) {
      if (layer.depthFrom < previousDepthTo - 0.25) {
        addIssue(
          `Borehole ${result.boreholeId} has overlapping or restarted layer depths between ${previousDepthTo} m and ${layer.depthFrom} m.`,
          {
            code: 'layer_depth_restart',
            severity: 'blocking',
            confidenceCap: 55,
            degradeParseStatus: 'partial',
          },
        );
      } else if (layer.depthFrom > previousDepthTo + 1) {
        addIssue(
          `Borehole ${result.boreholeId} has a depth gap between ${previousDepthTo} m and ${layer.depthFrom} m.`,
          {
            code: 'layer_depth_gap',
            severity: 'review',
            confidenceCap: 68,
            degradeParseStatus: 'partial',
          },
        );
      }
    }

    if (layer.sptN != null && (layer.sptN < 0 || layer.sptN > 200)) {
      addIssue(`${label} has an implausible SPT N value (${layer.sptN}).`, {
        code: 'implausible_spt_n',
        severity: layer.sptN < 0 ? 'blocking' : 'review',
        confidenceCap: layer.sptN < 0 ? 55 : 68,
        degradeParseStatus: 'partial',
      });
    }

    if (layer.waterContent != null && (layer.waterContent < 0 || layer.waterContent > 200)) {
      addIssue(`${label} has an implausible water content (${layer.waterContent}%).`, {
        code: 'implausible_water_content',
        severity: layer.waterContent < 0 ? 'blocking' : 'review',
        confidenceCap: layer.waterContent < 0 ? 55 : 68,
        degradeParseStatus: 'partial',
      });
    }

    previousDepthTo =
      layer.depthTo
      ?? layer.depthFrom
      ?? previousDepthTo;
  });

  const deepestLayerDepth = maximumLayerDepth(result);
  if (
    result.totalDepth != null
    && deepestLayerDepth != null
    && Math.abs(deepestLayerDepth - result.totalDepth) > 1.5
  ) {
    addIssue(
      `Borehole ${result.boreholeId} has a declared total depth (${result.totalDepth} m) that does not align with the deepest parsed layer (${deepestLayerDepth} m).`,
      {
        code: 'total_depth_layer_mismatch',
        severity: 'review',
        confidenceCap: 68,
        degradeParseStatus: 'partial',
      },
    );
  }

  const location = result.location;
  if (location?.projected && !location.crs) {
    addIssue(
      `Borehole ${result.boreholeId} has projected coordinates but no coordinate reference system.`,
      {
        code: 'projected_coordinates_missing_crs',
        severity: 'review',
        confidenceCap: 68,
      },
    );
  }

  if (
    location?.projected
    && location.crs
    && (location.crs.confidence ?? 0) < 0.6
  ) {
    const crsLabel = location.crs.code ?? location.crs.name ?? 'the detected CRS';
    addIssue(
      `Borehole ${result.boreholeId} has projected coordinates with low CRS confidence (${Math.round((location.crs.confidence ?? 0) * 100)}%) for ${crsLabel}.`,
      {
        code: 'low_crs_confidence',
        severity: 'review',
        confidenceCap: 68,
      },
    );
  }

  if (
    location?.wgs84
    && Math.abs(location.wgs84.latitude) < 0.0001
    && Math.abs(location.wgs84.longitude) < 0.0001
  ) {
    addIssue(
      `Borehole ${result.boreholeId} resolved to WGS84 coordinates near 0,0 and should be reviewed.`,
      {
        code: 'wgs84_near_origin',
        severity: 'review',
        confidenceCap: 68,
      },
    );
  }

  return {
    warnings: uniqueStrings(warnings),
    findings: uniqueFindings(findings),
    confidenceCap,
    degradedParseStatus,
  };
}

export function summarizeBoreholeIngestInspection(
  inspection: PdfDocumentInspection | null | undefined,
): BoreholeIngestInspectionSummary | null {
  return summarizeInspection(inspection);
}

export async function ingestBoreholeLogDocument(
  options: IngestBoreholeLogDocumentOptions,
): Promise<BoreholeDocumentIngestResult> {
  const interpretSingleImage = options.interpretSingleImage ?? interpretBoreholeLog;
  const interpretPageWithContext = options.interpretPageWithContext ?? interpretBoreholeLogWithContext;
  const transcribePageImageText = options.transcribePageImageText ?? transcribeDocumentImageText;
  const now = options.now ?? (() => new Date());

  if (!options.image && (!options.pages || options.pages.length === 0)) {
    throw new Error('Borehole ingest requires either a single image input or one or more PDF page inputs.');
  }

  const pageAudits: BoreholeIngestPageAudit[] = [];
  const pageFailures: string[] = [];
  const documentWarnings = buildInspectionWarnings(options.inspection);
  const reviewFindings: BoreholeIngestFinding[] = [];

  const groups: BoreholeGroupAccumulator[] = [];
  let currentGroup: BoreholeGroupAccumulator | null = null;
  let anonymousGroupIndex = 1;
  let lastResolvedBoreholeId = options.overrideBoreholeId;
  let priorContinuationDepth: number | null = null;
  const recoveredOcrPages = new Set<number>();

  const ensureGroup = (boreholeId: string | null): BoreholeGroupAccumulator => {
    const { key, nextAnonymousIndex } = createGroupKey(boreholeId, anonymousGroupIndex);
    anonymousGroupIndex = nextAnonymousIndex;
    const group: BoreholeGroupAccumulator = {
      key,
      boreholeId,
      pages: [],
    };
    groups.push(group);
    return group;
  };

  if (options.pages && options.pages.length > 0) {
    const pages = [...options.pages].sort((left, right) => left.pageNumber - right.pageNumber);

    for (const page of pages) {
      const inspectionPage = options.inspection?.pages[page.pageNumber - 1];
      let pageTextHint =
        inspectionPage?.normalizedArtifact?.nativeText
        ?? inspectionPage?.normalizedText
        ?? undefined;
      let textHintSource: BoreholeIngestPageAudit['textHintSource'] =
        pageTextHint ? 'native-text' : 'none';

      try {
        const pagePhaseConfig: LLMConfig = {
          ...options.config,
          timeout: Math.min(Math.max(options.config.timeout ?? 120000, 60000), 180000),
        };
        const recovery = await recoverDocumentTextHint({
          existingTextHint: pageTextHint,
          existingTextAccepted: inspectionPage?.normalizedArtifact?.textQuality.accepted ?? true,
          imageBase64: page.base64,
          mimeType: page.mimeType,
          config: pagePhaseConfig,
          pdfFilePath: page.filePath,
          pdfPageNumber: page.pageNumber,
          visionTranscribe: transcribePageImageText,
        });
        if (recovery.textHint) {
          pageTextHint = recovery.textHint;
        }
        textHintSource = recovery.source;
        if (recovery.source === 'local-ocr' || recovery.source === 'vision-ocr') {
          recoveredOcrPages.add(page.pageNumber);
          documentWarnings.push(
            `Recovered ${recovery.source === 'local-ocr' ? 'local OCR' : 'OCR-style'} text hint for page ${page.pageNumber}.`,
          );
        } else if (recovery.source === 'pdfjs-text') {
          documentWarnings.push(
            `Recovered high-fidelity PDF text for page ${page.pageNumber} without a multimodal OCR call.`,
          );
        }
        documentWarnings.push(
          ...recovery.warnings.map((warning) => `Page ${page.pageNumber}: ${warning}`),
        );

        const result = await interpretPageWithContext(
          page.base64,
          page.mimeType,
          pagePhaseConfig,
          {
            boreholeId: lastResolvedBoreholeId,
            pageNumber: page.pageNumber,
            totalPages: page.totalPages,
            priorContinuationDepth,
            pageClassification: inspectionPage?.classification,
            pageTextHint,
          },
        );

        const detectedBoreholeId = normalizeKnownBoreholeId(result.boreholeId);
        if (shouldIgnoreNonLogPage(result, detectedBoreholeId, pageTextHint)) {
          const warning = `Page ${page.pageNumber} did not contain usable borehole signals and was excluded from grouping.`;
          documentWarnings.push(warning);
          pageAudits.push({
            pageNumber: page.pageNumber,
            detectedBoreholeId,
            assignedGroup: 'ignored:non-log',
            classification: inspectionPage?.classification ?? null,
            textHintSource,
            parseStatus: result.parseStatus,
            confidence: result.confidence,
            continuationDepth: result.continuationDepth,
            warnings: uniqueStrings([...result.warnings, warning]),
          });
          continue;
        }

        if (options.overrideBoreholeId) {
          currentGroup ??= ensureGroup(options.overrideBoreholeId);
        } else if (!currentGroup) {
          currentGroup = ensureGroup(detectedBoreholeId);
        } else if (
          detectedBoreholeId
          && currentGroup.boreholeId
          && detectedBoreholeId !== currentGroup.boreholeId
        ) {
          documentWarnings.push(
            `Page ${page.pageNumber} appears to start a new borehole (${detectedBoreholeId}) after ${currentGroup.boreholeId}.`,
          );
          currentGroup = ensureGroup(detectedBoreholeId);
        } else if (!detectedBoreholeId && shouldStartNewAnonymousGroup(result, currentGroup)) {
          documentWarnings.push(
            `Page ${page.pageNumber} appears to restart near surface depth without a stable borehole ID. Started a new unresolved group for manual review.`,
          );
          currentGroup = ensureGroup(null);
        } else if (detectedBoreholeId && !currentGroup.boreholeId) {
          currentGroup.boreholeId = detectedBoreholeId;
        }

        currentGroup ??= ensureGroup(detectedBoreholeId);
        if (detectedBoreholeId && !options.overrideBoreholeId) {
          currentGroup.boreholeId = detectedBoreholeId;
        }

        currentGroup.pages.push({
          pageNumber: page.pageNumber,
          result,
        });

        pageAudits.push({
          pageNumber: page.pageNumber,
          detectedBoreholeId,
          assignedGroup: currentGroup.key,
          classification: inspectionPage?.classification ?? null,
          textHintSource,
          parseStatus: result.parseStatus,
          confidence: result.confidence,
          continuationDepth: result.continuationDepth,
          warnings: result.warnings,
        });

        lastResolvedBoreholeId = options.overrideBoreholeId ?? currentGroup.boreholeId ?? undefined;
        priorContinuationDepth = result.continuationDepth;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pageFailures.push(`Page ${page.pageNumber}: ${message}`);
        reviewFindings.push({
          code: 'page_ingest_failed',
          severity: 'blocking',
          scope: 'page',
          message: `Page ${page.pageNumber} failed during ingest: ${message}`,
          pageNumber: page.pageNumber,
        });
        pageAudits.push({
          pageNumber: page.pageNumber,
          detectedBoreholeId: null,
          assignedGroup: currentGroup?.key ?? 'unassigned',
          classification: inspectionPage?.classification ?? null,
          textHintSource,
          parseStatus: 'failed',
          confidence: 0,
          continuationDepth: null,
          warnings: [message],
        });
      }
    }
  } else if (options.image) {
    const result = await interpretSingleImage(
      options.image.base64,
      options.image.mimeType,
      options.config,
      options.overrideBoreholeId,
    );
    const detectedBoreholeId = normalizeKnownBoreholeId(result.boreholeId);
    currentGroup = ensureGroup(options.overrideBoreholeId ?? detectedBoreholeId);
    currentGroup.pages.push({
      pageNumber: 1,
      result,
    });
    pageAudits.push({
      pageNumber: 1,
      detectedBoreholeId,
      assignedGroup: currentGroup.key,
      classification: null,
      textHintSource: 'none',
      parseStatus: result.parseStatus,
      confidence: result.confidence,
      continuationDepth: result.continuationDepth,
      warnings: result.warnings,
    });
  }

  if (groups.length === 0) {
    throw new Error(
      pageFailures.length > 0
        ? `No pages could be ingested successfully.\n${pageFailures.join('\n')}`
        : 'No pages could be ingested successfully.',
    );
  }

  const mergedBoreholes = groups
    .filter((group) => group.pages.length > 0)
    .map((group) =>
      mergeBoreholeLogPages(
        group.pages,
        options.overrideBoreholeId ?? group.boreholeId ?? undefined,
      ),
    );
  const boreholeValidationFeedback = mergedBoreholes.map((borehole) => validateMergedBorehole(borehole));
  const boreholes = mergedBoreholes.map((borehole, index) => {
    const validation = boreholeValidationFeedback[index];
    const parseStatus = mergeParseStatuses(borehole.parseStatus, validation?.degradedParseStatus ?? null);
    const confidence =
      validation?.confidenceCap == null
        ? borehole.confidence
        : Math.min(borehole.confidence, validation.confidenceCap);

    return {
      ...borehole,
      parseStatus,
      confidence,
      warnings: uniqueStrings([...borehole.warnings, ...(validation?.warnings ?? [])]),
      canAutoProceed:
        borehole.canAutoProceed
        && !(validation?.findings.some(findingRequiresReview) ?? false)
        && parseStatus === 'parsed'
        && confidence >= 70,
    };
  });

  if (pageFailures.length > 0) {
    reviewFindings.push({
      code: 'page_failures_present',
      severity: 'blocking',
      scope: 'document',
      message: `${pageFailures.length} page(s) failed during ingest and should be reviewed.`,
    });
  }

  const unrecoveredScanPages = options.inspection?.pages.filter((page) =>
    (page.classification === 'image-only' || page.classification === 'text-unreadable')
    && !recoveredOcrPages.has(page.pageNumber),
  ) ?? [];

  reviewFindings.push(
    ...unrecoveredScanPages.map((page) => ({
      code: 'missing_ocr_text_hint',
      severity: 'review' as const,
      scope: 'page' as const,
      message: `Page ${page.pageNumber} did not yield a recovered OCR-style text hint and should be reviewed manually.`,
      pageNumber: page.pageNumber,
    })),
  );

  if (unrecoveredScanPages.length > 0) {
    reviewFindings.push({
      code: 'unrecovered_scanned_pages_present',
      severity: 'review',
      scope: 'document',
      message: `${unrecoveredScanPages.length} scanned/image-heavy page(s) did not yield a recovered OCR-style text hint and should be reviewed manually.`,
    });
  }

  const partiallyParsedPageAudits = pageAudits.filter(
    (audit) => audit.assignedGroup !== 'ignored:non-log' && audit.parseStatus === 'partial',
  );
  reviewFindings.push(
    ...partiallyParsedPageAudits.map((audit) => ({
      code: 'page_partial_parse',
      severity: 'review' as const,
      scope: 'page' as const,
      message: `Page ${audit.pageNumber} parsed only partially and should be reviewed.`,
      pageNumber: audit.pageNumber,
      boreholeId: audit.detectedBoreholeId ?? undefined,
    })),
  );

  if (partiallyParsedPageAudits.length > 0 || pageFailures.length > 0) {
    reviewFindings.push({
      code: 'pages_incomplete',
      severity: 'review',
      scope: 'document',
      message: 'One or more pages parsed only partially or failed.',
    });
  }

  if (groups.some((group) => group.boreholeId == null)) {
    reviewFindings.push({
      code: 'unstable_borehole_group',
      severity: 'blocking',
      scope: 'document',
      message: 'At least one borehole group could not be assigned a stable borehole ID.',
    });
  }

  reviewFindings.push(
    ...boreholeValidationFeedback.flatMap((validation) => validation.findings),
  );

  if (boreholes.some((borehole) => borehole.confidence < 70 || borehole.parseStatus !== 'parsed')) {
    reviewFindings.push({
      code: 'merged_borehole_incomplete',
      severity: 'review',
      scope: 'document',
      message: 'At least one merged borehole result is low-confidence or incomplete.',
    });
  }

  const warnings = uniqueStrings([
    ...documentWarnings,
    ...pageFailures,
    ...boreholes.flatMap((borehole) => borehole.warnings),
  ]);
  const normalizedReviewFindings = uniqueFindings(reviewFindings);
  const uniqueReviewReasons = summarizeReviewReasons(normalizedReviewFindings);
  const totalPages = options.pages?.length ?? 1;
  const inspectionSummary = summarizeInspection(options.inspection, recoveredOcrPages.size);
  const confidence = averageConfidence(boreholes);

  return {
    kind: 'geotech-ingest-result',
    schemaVersion: 1,
    documentType: 'borehole-log',
    generatedAt: now().toISOString(),
    source: {
      ...options.source,
      totalPages,
      successfulPages: pageAudits.filter((audit) => audit.parseStatus !== 'failed').length,
      failedPages: pageFailures.length,
    },
    inspection: options.inspection ?? null,
    inspectionSummary,
    boreholes,
    pageAudits,
    pageFailures,
    warnings,
    reviewFindings: normalizedReviewFindings,
    reviewReasons: uniqueReviewReasons,
    reviewRequired: uniqueReviewReasons.length > 0,
    confidence,
    canAutoProceed:
      boreholes.length > 0
      && uniqueReviewReasons.length === 0
      && boreholes.every((borehole) => borehole.canAutoProceed),
  };
}

import type {
  BoreholeDocumentIngestResult,
  BoreholeIngestFinding,
  BoreholeIngestPageAudit,
} from '../ingest/geotech-extract.js';
import type {
  GeotechDocumentContentChunk,
  GeotechDocumentFinding,
  GeotechDocumentIngestResult,
  GeotechDocumentPageAudit,
} from '../ingest/geotech-document.js';

export type IngestDossierTone = 'accent' | 'good' | 'warning' | 'danger' | 'neutral';

export interface IngestDossierBadge {
  label: string;
  value: string;
  tone: IngestDossierTone;
}

export interface IngestDossierMetric {
  label: string;
  value: string;
  detail?: string;
  tone?: IngestDossierTone;
}

export interface IngestDossierTable {
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
  emptyState?: string;
}

export interface IngestDossierFindingGroup {
  severity: 'blocking' | 'review' | 'advisory';
  label: string;
  tone: IngestDossierTone;
  items: string[];
}

export interface IngestDossierPageCard {
  pageLabel: string;
  title: string;
  classification: string;
  parseStatus: string;
  confidence: number;
  tone: IngestDossierTone;
  sourceHint?: string;
  sectionType?: string;
  scope?: string;
  stageBadges?: string[];
  highlights: string[];
  warnings: string[];
}

export interface IngestDossierNarrativeSection {
  title: string;
  paragraphs: string[];
}

export interface IngestDossierStoredReview {
  projectId: string;
  datasetName: string;
  reviewId: string;
  createdAt?: string;
}

export interface IngestDossierApproval {
  datasetName: string;
  approvedAt: string;
  approvedBy?: string;
  rationale?: string;
}

export interface IngestDossier {
  title: string;
  subtitle: string;
  summary: string;
  sourceLabel: string;
  documentType: 'borehole-log' | 'geotech-document';
  generatedAt: string;
  badges: IngestDossierBadge[];
  metrics: IngestDossierMetric[];
  findings: IngestDossierFindingGroup[];
  tables: IngestDossierTable[];
  pageCards: IngestDossierPageCard[];
  sections: IngestDossierNarrativeSection[];
  storedReview?: IngestDossierStoredReview;
  approval?: IngestDossierApproval;
  footerNotes: string[];
}

export interface BuildIngestDossierOptions {
  sourceLabel?: string;
  storedReview?: IngestDossierStoredReview | null;
  approval?: IngestDossierApproval | null;
}

export type IngestDossierSourceResult =
  | BoreholeDocumentIngestResult
  | GeotechDocumentIngestResult;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function truncate(value: string | null | undefined, maxLength: number): string {
  if (!value) {
    return '';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
}

const ENGINEERING_UNIT_PATTERN = /(?<![A-Za-z])(?:(?:kN|KN|MN|N|kg|g|gm|t)\/(?:m|cm|mm|cc)(?:\^?[23])?|(?:kg|g|gm)\/cm(?:\^?2|\^?3)?|t\/m(?:\^?2|\^?3)?|N\/mm(?:\^?2)?|m\/s|MPa|kPa|Pa|kN|MN|mm|cm|m|deg)\b/gi;

function humanizeNarrative(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const units: string[] = [];
  const protectedValue = value.replace(ENGINEERING_UNIT_PATTERN, (unit) => {
    units.push(unit);
    return `@@${units.length - 1}@@`;
  });

  return protectedValue
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s*([=:/(),;%])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .replace(/@@(\d+)@@/g, (_match, index: string) => units[Number(index)] ?? '')
    .replace(/(\d)((?:kN|KN|MN|N|kg|g|gm|t)\/(?:m|cm|mm|cc)(?:\^?[23])?|(?:kg|g|gm)\/cm(?:\^?2|\^?3)?|t\/m(?:\^?2|\^?3)?|N\/mm(?:\^?2)?|m\/s|MPa|kPa|Pa|kN|MN|mm|cm|m|deg)\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeNoisyOcr(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const longCompactTokens = tokens.filter((token) =>
    token.length >= 28
    || /[A-Za-z]{8,}\d/.test(token)
    || /\d[A-Za-z]{8,}/.test(token),
  ).length;
  const denseSymbolCount = (value.match(/[<>{}[\]\\|_]/g) ?? []).length;
  const numericTokenCount = tokens.filter((token) => /\d/.test(token)).length;
  const measurementTokenCount = tokens.filter((token) =>
    /(?:%|mm|cm|kg\/cm|t\/m|n>|spt|b\.?h\.?|is:?|depth|gravel|sand|silt|clay|density|limit|friction|cohesion)/i.test(token),
  ).length;
  const sentenceBreakCount = (value.match(/[.!?]/g) ?? []).length;
  const tableHeadingCount = [
    'lab test',
    'laboratory test',
    'foundation size',
    'allowable bearing capacity',
    'natural moisture content',
    'plasticity index',
    'standard penetration',
  ].filter((needle) => value.toLowerCase().includes(needle)).length;

  return longCompactTokens >= Math.max(2, Math.ceil(tokens.length * 0.12))
    || denseSymbolCount > Math.max(4, value.length * 0.025)
    || (
      value.length > 240
      && numericTokenCount >= 14
      && measurementTokenCount >= 8
      && sentenceBreakCount <= 4
    )
    || (
      value.length > 280
      && tableHeadingCount >= 2
      && numericTokenCount >= 8
    );
}

function cleanNarrativeText(value: string | null | undefined, maxLength: number): string {
  const cleaned = humanizeNarrative(value);
  if (!cleaned || looksLikeNoisyOcr(cleaned)) {
    return '';
  }
  return truncate(cleaned, maxLength);
}

function cleanNarrativeList(values: string[], limit: number, maxLength: number): string[] {
  return uniqueStrings(
    values
      .map((value) => cleanNarrativeText(value, maxLength))
      .filter(Boolean),
  ).slice(0, limit);
}

function displayTableText(value: string | null | undefined, maxLength: number): string {
  const cleaned = humanizeNarrative(value);
  return cleaned ? truncate(cleaned, maxLength) : '-';
}

function parameterCategory(name: string): string {
  const normalized = name.toLowerCase();
  if (/spt|rqd|rmr|ucs|cohesion|friction|phi|strength|shear/i.test(normalized)) return 'Strength';
  if (/unitweight|density|moisture|watercontent|liquid|plasticity|atterberg|gradation|gravel|sand|silt|clay/i.test(normalized)) return 'Index/lab';
  if (/permeability|hydraulic|groundwater|watertable|seepage/i.test(normalized)) return 'Hydrogeology';
  if (/settlement|bearing|subgrade|modulus|capacity/i.test(normalized)) return 'Design';
  if (/depth|elevation|thickness/i.test(normalized)) return 'Geometry';
  return 'Other';
}

function sourcePageText(value: string | null | undefined): string {
  const matches = [...(value ?? '').matchAll(/\bpage\s+(\d+)\b/gi)]
    .map((match) => match[1])
    .filter((entry): entry is string => Boolean(entry));
  return matches.length > 0 ? [...new Set(matches)].join(', ') : '-';
}

function countGeotechPageStatuses(result: GeotechDocumentIngestResult): Record<'parsed' | 'partial' | 'failed', number> {
  return result.pageAudits.reduce<Record<'parsed' | 'partial' | 'failed', number>>(
    (counts, audit) => {
      counts[audit.parseStatus] += 1;
      return counts;
    },
    { parsed: 0, partial: 0, failed: 0 },
  );
}

function geotechOutcomeSummary(result: GeotechDocumentIngestResult): string {
  const statusCounts = countGeotechPageStatuses(result);
  const pageSummary = `${statusCounts.parsed} parsed, ${statusCounts.partial} partial, ${statusCounts.failed} failed`;
  const signalSummary = `${result.materials.length} material observation(s), ${result.classifications.length} classification(s), and ${result.parameters.length} parameter(s) retained`;
  const reviewSummary = result.reviewRequired
    ? 'Human review is required before this can be treated as trusted engineering input.'
    : 'No blocking review finding was retained.';

  return `${result.source.successfulPages}/${result.source.totalPages} pages processed (${pageSummary}); ${signalSummary}. ${reviewSummary}`;
}

function toneFromBoolean(value: boolean, inverted = false): IngestDossierTone {
  if (inverted) {
    return value ? 'danger' : 'good';
  }
  return value ? 'good' : 'warning';
}

function toneFromSeverity(severity: 'blocking' | 'review' | 'advisory'): IngestDossierTone {
  switch (severity) {
    case 'blocking':
      return 'danger';
    case 'review':
      return 'warning';
    default:
      return 'accent';
  }
}

function toneFromParseStatus(parseStatus: string, confidence: number): IngestDossierTone {
  if (parseStatus === 'failed') {
    return 'danger';
  }
  if (parseStatus === 'partial' || confidence < 60) {
    return 'warning';
  }
  return 'good';
}

function formatFindingMessage(finding: {
  message: string;
  pageNumber?: number;
  boreholeId?: string;
  materialDescription?: string;
  scope?: string;
}): string {
  const context: string[] = [];
  if (finding.pageNumber != null && !finding.message.startsWith(`Page ${finding.pageNumber}`)) {
    context.push(`Page ${finding.pageNumber}`);
  }
  if (finding.boreholeId) {
    context.push(`Borehole ${finding.boreholeId}`);
  }
  if (finding.materialDescription) {
    context.push(`Material ${finding.materialDescription}`);
  }
  return context.length > 0 ? `${context.join(' | ')}: ${finding.message}` : finding.message;
}

function buildFindingGroups(
  findings: Array<{
    severity: 'blocking' | 'review' | 'advisory';
    message: string;
    pageNumber?: number;
    boreholeId?: string;
    materialDescription?: string;
    scope?: string;
  }>,
): IngestDossierFindingGroup[] {
  const order: Array<'blocking' | 'review' | 'advisory'> = ['blocking', 'review', 'advisory'];
  const labels = {
    blocking: 'Blocking',
    review: 'Needs review',
    advisory: 'Advisory',
  } as const;
  const groups: IngestDossierFindingGroup[] = [];

  for (const severity of order) {
    const items = findings
      .filter((finding) => finding.severity === severity)
      .map((finding) => formatFindingMessage(finding));
    if (items.length === 0) {
      continue;
    }

    groups.push({
      severity,
      label: labels[severity],
      tone: toneFromSeverity(severity),
      items,
    });
  }

  return groups;
}

function buildGeotechTables(result: GeotechDocumentIngestResult): IngestDossierTable[] {
  const tables: IngestDossierTable[] = [];
  const auditTables: IngestDossierTable[] = [];

  if (result.source.segmentation?.mode === 'segmented-parent' && result.source.segmentation.segments?.length) {
    auditTables.push({
      title: 'Segment execution',
      description: `Hosted-beta best-result window: ${result.source.segmentation.effectivePageLimit ?? '-'} effective pages.`,
      columns: ['Segment', 'Pages', 'Status', 'Completed', 'Failed', 'Duration'],
      rows: result.source.segmentation.segments.map((segment) => [
        String(segment.segmentIndex),
        `${segment.startPage}-${segment.endPage}`,
        segment.status ?? 'queued',
        segment.completedPages != null ? String(segment.completedPages) : '-',
        segment.failedPages != null ? String(segment.failedPages) : '-',
        segment.durationMs != null ? `${Math.round(segment.durationMs / 1000)}s` : '-',
      ]),
    });
  }

  if (result.pageAudits.length > 0) {
    auditTables.push({
      title: 'Page audit matrix',
      description: 'Per-page extraction status, source path, retained signal counts, and warning volume.',
      columns: ['Page', 'Class', 'Status', 'Confidence', 'Source', 'Signals', 'Warnings'],
      rows: result.pageAudits.map((audit) => [
        String(audit.pageNumber),
        audit.classification ?? 'unknown',
        audit.parseStatus,
        `${audit.confidence}%`,
        audit.textHintSource,
        [
          audit.materialCount > 0 ? `${audit.materialCount} material` : null,
          audit.classificationCount > 0 ? `${audit.classificationCount} class` : null,
          audit.parameterCount > 0 ? `${audit.parameterCount} parameter` : null,
        ].filter(Boolean).join(', ') || '-',
        audit.warnings.length > 0 ? String(audit.warnings.length) : '-',
      ]),
    });
  }

  tables.push({
    title: 'Key engineering parameters',
    description: 'Grouped by engineering category. Source pages are inferred from extracted context when available; confidence is the document-level workflow confidence.',
    columns: ['Category', 'Parameter', 'Value', 'Unit', 'Material', 'Source pages', 'Confidence', 'Context'],
    rows: [...result.parameters]
      .sort((left, right) =>
        parameterCategory(left.name).localeCompare(parameterCategory(right.name))
        || left.name.localeCompare(right.name)
      )
      .map((parameter) => [
        parameterCategory(parameter.name),
        displayTableText(parameter.name, 90),
        displayTableText(parameter.valueText, 90),
        displayTableText(parameter.unit, 32),
        displayTableText(parameter.material, 110),
        sourcePageText(parameter.context),
        `${result.confidence}%`,
        displayTableText(parameter.context, 180),
      ]),
    emptyState: 'No explicit engineering parameters were extracted.',
  });

  tables.push({
    title: 'Material observations',
    columns: ['Kind', 'Description', 'USCS', 'Lithology'],
    rows: result.materials.map((material) => [
      displayTableText(material.kind, 48),
      displayTableText(material.description, 180),
      displayTableText(material.uscsSymbol, 24),
      displayTableText(material.lithology, 90),
    ]),
    emptyState: 'No material observations were extracted.',
  });

  tables.push({
    title: 'Classifications',
    columns: ['System', 'Value', 'Context'],
    rows: result.classifications.map((classification) => [
      displayTableText(classification.system, 48),
      displayTableText(classification.value, 110),
      displayTableText(classification.context, 180),
    ]),
    emptyState: 'No formal classification systems were extracted.',
  });

  if (result.contentChunks && result.contentChunks.length > 0) {
    tables.push({
      title: 'Document map',
      description: 'Normalized engineering sections and evidence-bearing pages.',
      columns: ['Pages', 'Section', 'Scope', 'Signal', 'Heading'],
      rows: result.contentChunks.map((chunk) => [
        chunk.pageRange[0] === chunk.pageRange[1]
          ? String(chunk.pageRange[0])
          : `${chunk.pageRange[0]}-${chunk.pageRange[1]}`,
        chunk.sectionType ?? '-',
        displayTableText(chunk.scope, 90),
        chunk.significance != null ? String(chunk.significance) : '-',
        displayTableText(chunk.headingAncestry[0], 180),
      ]),
    });
  }

  tables.push(...auditTables);

  return tables;
}

function buildBoreholeTables(result: BoreholeDocumentIngestResult): IngestDossierTable[] {
  return [{
    title: 'Boreholes',
    columns: ['Borehole', 'Total depth (m)', 'Water table (m)', 'Confidence', 'Status'],
    rows: result.boreholes.map((borehole) => [
      borehole.boreholeId,
      borehole.totalDepth != null ? String(borehole.totalDepth) : '-',
      borehole.waterTableDepth != null ? String(borehole.waterTableDepth) : '-',
      `${borehole.confidence}%`,
      borehole.parseStatus,
    ]),
    emptyState: 'No boreholes were extracted.',
  }];
}

function buildGeotechPageCards(result: GeotechDocumentIngestResult): IngestDossierPageCard[] {
  const chunkByPage = new Map<number, GeotechDocumentContentChunk>();
  for (const chunk of result.contentChunks ?? []) {
    for (const pageNumber of chunk.sourcePages) {
      if (!chunkByPage.has(pageNumber)) {
        chunkByPage.set(pageNumber, chunk);
      }
    }
  }

  return result.pageAudits.map((audit: GeotechDocumentPageAudit) => {
    const chunk = chunkByPage.get(audit.pageNumber);
    const stageBadges = uniqueStrings([
      audit.textHintSource === 'native-text' ? 'native text' : undefined,
      audit.textHintSource === 'pdfjs-text' ? 'pdf.js text' : undefined,
      audit.textHintSource === 'local-ocr' ? 'local OCR' : undefined,
      audit.textHintSource === 'glm-ocr' ? 'GLM-OCR' : undefined,
      audit.textHintSource === 'vision-ocr' ? 'GLM vision OCR' : undefined,
      audit.textHintSource === 'vision-visual' ? 'GLM-5V visual' : undefined,
      result.synthesis?.sourcePages.includes(audit.pageNumber) ? 'GLM-5.1 synthesis' : undefined,
    ]);
    const highlights = uniqueStrings([
      chunk?.text ? displayTableText(chunk.text, 180) : undefined,
      audit.materialCount > 0 ? `${audit.materialCount} material observation(s)` : undefined,
      audit.classificationCount > 0 ? `${audit.classificationCount} classification(s)` : undefined,
      audit.parameterCount > 0 ? `${audit.parameterCount} parameter(s)` : undefined,
    ]);

    return {
      pageLabel: `Page ${audit.pageNumber}`,
      title: chunk?.headingAncestry[0] ?? chunk?.sectionType ?? `Page ${audit.pageNumber}`,
      classification: audit.classification ?? 'unknown',
      parseStatus: audit.parseStatus,
      confidence: audit.confidence,
      tone: toneFromParseStatus(audit.parseStatus, audit.confidence),
      sourceHint: audit.textHintSource,
      sectionType: chunk?.sectionType,
      scope: chunk?.scope,
      stageBadges,
      highlights,
      warnings: audit.warnings,
    };
  });
}

function buildBoreholePageCards(result: BoreholeDocumentIngestResult): IngestDossierPageCard[] {
  return result.pageAudits.map((audit: BoreholeIngestPageAudit) => ({
    pageLabel: `Page ${audit.pageNumber}`,
    title: audit.detectedBoreholeId ?? audit.assignedGroup,
    classification: audit.classification ?? 'unknown',
    parseStatus: audit.parseStatus,
    confidence: audit.confidence,
    tone: toneFromParseStatus(audit.parseStatus, audit.confidence),
    sourceHint: audit.textHintSource,
    sectionType: audit.assignedGroup,
    highlights: uniqueStrings([
      audit.detectedBoreholeId ? `Detected borehole ${audit.detectedBoreholeId}` : undefined,
      audit.continuationDepth != null ? `Continuation depth ${audit.continuationDepth} m` : undefined,
    ]),
    warnings: audit.warnings,
  }));
}

function buildGeotechSections(result: GeotechDocumentIngestResult): IngestDossierNarrativeSection[] {
  const sections: IngestDossierNarrativeSection[] = [];
  const statusCounts = countGeotechPageStatuses(result);
  const cleanSummary = cleanNarrativeText(result.summary, 360);

  sections.push({
    title: 'Report takeaways',
    paragraphs: uniqueStrings([
      ...(result.synthesis?.takeaways ?? []),
      cleanSummary,
      result.documentClass ? `Document class: ${result.documentClass}.` : null,
      geotechOutcomeSummary(result),
      `Extraction posture: ${statusCounts.parsed} parsed page(s), ${statusCounts.partial} partial page(s), ${statusCounts.failed} failed page(s), ${result.inspectionSummary?.ocrRecoveredPageCount ?? 0} OCR/text recovery page(s). Confidence: ${result.confidence}%.`,
      'Workflow confidence and approval support review triage only; they do not replace engineering judgement, design checks, or source-page verification.',
    ]),
  });

  if ((result.synthesis?.groundModel.length ?? 0) > 0) {
    sections.push({
      title: 'Ground model',
      paragraphs: cleanNarrativeList(result.synthesis?.groundModel ?? [], 10, 320),
    });
  }

  if ((result.synthesis?.keyParameters.length ?? 0) > 0) {
    sections.push({
      title: 'Key parameters',
      paragraphs: cleanNarrativeList(result.synthesis?.keyParameters ?? [], 12, 280),
    });
  }

  if ((result.synthesis?.interpretation.length ?? 0) > 0) {
    sections.push({
      title: 'Interpretation',
      paragraphs: cleanNarrativeList(result.synthesis?.interpretation ?? [], 10, 320),
    });
  }

  if ((result.synthesis?.limitations.length ?? 0) > 0) {
    sections.push({
      title: 'Limitations',
      paragraphs: cleanNarrativeList(result.synthesis?.limitations ?? [], 10, 320),
    });
  }

  const risks = cleanNarrativeList(result.risks, 8, 300);
  if (risks.length > 0) {
    sections.push({
      title: 'Risks',
      paragraphs: risks,
    });
  }

  const recommendations = cleanNarrativeList(result.recommendations, 10, 300);
  if (recommendations.length > 0) {
    sections.push({
      title: 'Recommendations',
      paragraphs: recommendations,
    });
  }

  return sections;
}

function buildBoreholeSections(result: BoreholeDocumentIngestResult): IngestDossierNarrativeSection[] {
  const firstBorehole = result.boreholes[0];
  return [{
    title: 'Executive summary',
    paragraphs: uniqueStrings([
      firstBorehole?.summary,
      `Pages processed: ${result.source.successfulPages}/${result.source.totalPages}. Confidence: ${result.confidence}%.`,
      firstBorehole?.projectName ? `Project: ${firstBorehole.projectName}.` : null,
    ]),
  }];
}

function buildGeotechMetrics(result: GeotechDocumentIngestResult): IngestDossierMetric[] {
  const statusCounts = countGeotechPageStatuses(result);
  return [
    { label: 'Pages processed', value: `${result.source.successfulPages}/${result.source.totalPages}`, tone: result.source.failedPages > 0 ? 'warning' : 'good' },
    { label: 'Confidence', value: `${result.confidence}%`, tone: toneFromParseStatus(result.parseStatus ?? 'parsed', result.confidence) },
    { label: 'Page outcomes', value: `${statusCounts.parsed}/${result.pageAudits.length}`, detail: `${statusCounts.partial} partial, ${statusCounts.failed} failed`, tone: statusCounts.failed > 0 ? 'danger' : statusCounts.partial > 0 ? 'warning' : 'good' },
    { label: 'Materials', value: String(result.materials.length), detail: `${result.classifications.length} classifications`, tone: result.materials.length > 0 ? 'good' : 'warning' },
    { label: 'Parameters', value: String(result.parameters.length), detail: result.documentClass ?? 'No document class', tone: result.parameters.length > 0 ? 'good' : 'warning' },
    { label: 'OCR hints', value: String(result.inspectionSummary?.ocrRecoveredPageCount ?? 0), detail: `${result.inspectionSummary?.imageHeavyPageCount ?? 0} image-heavy pages`, tone: (result.inspectionSummary?.ocrRecoveredPageCount ?? 0) > 0 ? 'good' : 'neutral' },
  ];
}

function buildBoreholeMetrics(result: BoreholeDocumentIngestResult): IngestDossierMetric[] {
  return [
    { label: 'Pages processed', value: `${result.source.successfulPages}/${result.source.totalPages}`, tone: result.source.failedPages > 0 ? 'warning' : 'good' },
    { label: 'Confidence', value: `${result.confidence}%`, tone: result.confidence >= 70 ? 'good' : 'warning' },
    { label: 'Boreholes', value: String(result.boreholes.length), detail: `${result.pageAudits.length} page audits`, tone: result.boreholes.length > 0 ? 'good' : 'warning' },
    { label: 'Review required', value: result.reviewRequired ? 'Yes' : 'No', tone: toneFromBoolean(result.reviewRequired, true) },
    { label: 'Auto proceed', value: result.canAutoProceed ? 'Yes' : 'No', tone: toneFromBoolean(result.canAutoProceed) },
  ];
}

function buildGeotechBadges(result: GeotechDocumentIngestResult): IngestDossierBadge[] {
  return [
    { label: 'Document type', value: result.documentType, tone: 'accent' },
    { label: 'Document class', value: result.documentClass ?? 'Unavailable', tone: result.documentClass ? 'good' : 'neutral' },
    { label: 'Parse status', value: result.parseStatus ?? 'unknown', tone: toneFromParseStatus(result.parseStatus ?? 'unknown', result.confidence) },
    { label: 'Review required', value: result.reviewRequired ? 'Yes' : 'No', tone: toneFromBoolean(result.reviewRequired, true) },
    { label: 'Auto proceed', value: result.canAutoProceed ? 'Yes' : 'No', tone: toneFromBoolean(result.canAutoProceed) },
  ];
}

function buildBoreholeBadges(result: BoreholeDocumentIngestResult): IngestDossierBadge[] {
  return [
    { label: 'Document type', value: result.documentType, tone: 'accent' },
    { label: 'Boreholes extracted', value: String(result.boreholes.length), tone: result.boreholes.length > 0 ? 'good' : 'warning' },
    { label: 'Review required', value: result.reviewRequired ? 'Yes' : 'No', tone: toneFromBoolean(result.reviewRequired, true) },
    { label: 'Auto proceed', value: result.canAutoProceed ? 'Yes' : 'No', tone: toneFromBoolean(result.canAutoProceed) },
  ];
}

function buildFooterNotes(result: IngestDossierSourceResult): string[] {
  return uniqueStrings([
    result.source.fileName ?? result.source.filePath ?? null,
    result.source.pageRange ? `Selected page range: ${result.source.pageRange[0]}-${result.source.pageRange[1]}.` : null,
    result.source.segmentation?.mode === 'segmented-parent'
      ? `Segmented execution used ${result.source.segmentation.segmentCount ?? result.source.segmentation.segments?.length ?? 0} linked packet(s).`
      : null,
    result.pageFailures.length > 0 ? `${result.pageFailures.length} page failure(s) were recorded.` : null,
    result.warnings.length > 0 ? `${result.warnings.length} warning(s) were retained in the dossier.` : null,
    'Confidence, approval, and normalized tables are workflow aids for review, not engineering sign-off. Verify conclusions against the original source pages.',
  ]);
}

function sourceLabelFromResult(result: IngestDossierSourceResult, override?: string): string {
  return override ?? result.source.fileName ?? result.source.filePath ?? 'Unknown source';
}

export function buildIngestDossier(
  result: IngestDossierSourceResult,
  options?: BuildIngestDossierOptions,
): IngestDossier {
  const sourceLabel = sourceLabelFromResult(result, options?.sourceLabel);
  const storedReview = options?.storedReview ?? undefined;
  const approval = options?.approval ?? undefined;

  if (result.documentType === 'geotech-document') {
    const geotechResult = result as GeotechDocumentIngestResult;
    const title = geotechResult.title ?? 'Geotechnical ingest dossier';
    const cleanSummary = cleanNarrativeText(geotechResult.summary, 320);
    const summary =
      cleanSummary
      || geotechOutcomeSummary(geotechResult);

    return {
      title,
      subtitle: geotechResult.documentClass
        ? `${geotechResult.documentClass} dossier`
        : 'Geotechnical document dossier',
      summary,
      sourceLabel,
      documentType: geotechResult.documentType,
      generatedAt: geotechResult.generatedAt,
      badges: buildGeotechBadges(geotechResult),
      metrics: buildGeotechMetrics(geotechResult),
      findings: buildFindingGroups((geotechResult.reviewFindings ?? []) as GeotechDocumentFinding[]),
      tables: buildGeotechTables(geotechResult),
      pageCards: buildGeotechPageCards(geotechResult),
      sections: buildGeotechSections(geotechResult),
      storedReview,
      approval,
      footerNotes: buildFooterNotes(geotechResult),
    };
  }

  const boreholeResult = result as BoreholeDocumentIngestResult;
  const firstBorehole = boreholeResult.boreholes[0];
  return {
    title: firstBorehole?.boreholeId
      ? `Borehole dossier - ${firstBorehole.boreholeId}`
      : 'Borehole ingest dossier',
    subtitle: 'Borehole log dossier',
    summary:
      firstBorehole?.summary
      ?? `Borehole ingest completed with ${boreholeResult.boreholes.length} borehole(s) over ${boreholeResult.source.successfulPages}/${boreholeResult.source.totalPages} page(s).`,
    sourceLabel,
    documentType: boreholeResult.documentType,
    generatedAt: boreholeResult.generatedAt,
    badges: buildBoreholeBadges(boreholeResult),
    metrics: buildBoreholeMetrics(boreholeResult),
    findings: buildFindingGroups((boreholeResult.reviewFindings ?? []) as BoreholeIngestFinding[]),
    tables: buildBoreholeTables(boreholeResult),
    pageCards: buildBoreholePageCards(boreholeResult),
    sections: buildBoreholeSections(boreholeResult),
    storedReview,
    approval,
    footerNotes: buildFooterNotes(boreholeResult),
  };
}

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
  cacheStatus?: string;
  cacheEntryId?: string;
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

export interface IngestDossierExecutiveItem {
  label: string;
  value: string;
  detail?: string;
  tone?: IngestDossierTone;
}

export interface IngestDossierInsightCard {
  title: string;
  body: string;
  tone: IngestDossierTone;
  detail?: string;
}

export interface IngestDossierTrustItem {
  item: string;
  value: string;
  sourcePage: string;
  confidence: string;
  review: string;
  evidence: string;
  tone: IngestDossierTone;
}

export interface IngestDossierBoreholeProfileLayer {
  depthFrom: number;
  depthTo: number;
  label: string;
  description: string;
  uscsSymbol?: string | null;
  tone: IngestDossierTone;
  uncertain?: boolean;
}

export interface IngestDossierBoreholeProfileColumn {
  boreholeId: string;
  totalDepth: number | null;
  waterTableDepth: number | null;
  layers: IngestDossierBoreholeProfileLayer[];
}

export interface IngestDossierBoreholeProfile {
  title: string;
  maxDepth: number;
  depthUnit: string;
  columns: IngestDossierBoreholeProfileColumn[];
  notes: string[];
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
  executiveItems: IngestDossierExecutiveItem[];
  insightCards: IngestDossierInsightCard[];
  trustItems: IngestDossierTrustItem[];
  boreholeProfile?: IngestDossierBoreholeProfile;
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

function sourcePageText(value: string | null | undefined, sourcePages?: number[] | null): string {
  if (Array.isArray(sourcePages) && sourcePages.length > 0) {
    return [...new Set(
      sourcePages
        .map((page) => Number(page))
        .filter((page) => Number.isInteger(page) && page > 0),
    )].sort((left, right) => left - right).join(', ');
  }
  const matches = [...(value ?? '').matchAll(/\bpage\s+(\d+)\b/gi)]
    .map((match) => match[1])
    .filter((entry): entry is string => Boolean(entry));
  return matches.length > 0 ? [...new Set(matches)].join(', ') : '-';
}

function normalizeBoreholeId(value: string): string {
  const match = value.match(/\bBH[-\s]?0*(\d+)\b/i);
  return match ? `BH${match[1]}` : value.trim().toUpperCase();
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

function collectDepthMetersFromText(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }
  const normalized = value.replace(/\s+/g, ' ');
  const depths = [
    ...[...normalized.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*m\b/gi)].map((match) => Number(match[1])),
    ...[...normalized.matchAll(/\b(?:maximum\s+depth|termination)\b[^0-9]{0,60}(\d{1,3}(?:\.\d+)?)\b/gi)].map((match) => Number(match[1])),
  ].filter((depth) => Number.isFinite(depth) && depth > 0 && depth <= 120);
  return depths;
}

function collectPreferredBoreholeDepthsFromText(value: string | null | undefined): number[] {
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

function formatDepthMeters(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${value.toFixed(2)} m` : 'Unavailable';
}

function materialTone(description: string | null | undefined, uscsSymbol?: string | null): IngestDossierTone {
  const text = `${description ?? ''} ${uscsSymbol ?? ''}`.toLowerCase();
  if (/rock|shale|limestone|sandstone|fractured|weathered/.test(text)) return 'neutral';
  if (/clay|ci|cl|ch/.test(text)) return 'warning';
  if (/sand|sm|sp|sw|gravel|gm|gp|gw/.test(text)) return 'accent';
  return 'good';
}

function humanDocumentType(value: string | null | undefined): string {
  if (!value) {
    return 'Geotechnical document';
  }
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function includesParameter(result: GeotechDocumentIngestResult, pattern: RegExp): boolean {
  return result.parameters.some((parameter) =>
    pattern.test(`${parameter.name} ${parameter.valueText} ${parameter.unit ?? ''} ${parameter.material ?? ''} ${parameter.context ?? ''}`),
  );
}

function buildMissingCriticalItems(result: GeotechDocumentIngestResult): string[] {
  const missing: string[] = [];
  if (!includesParameter(result, /ground\s*water|water\s*table/i)) missing.push('groundwater level');
  if (!includesParameter(result, /\bspt\b|standard\s*penetration/i)) missing.push('SPT N-values');
  if (!includesParameter(result, /\brqd\b/i)) missing.push('RQD');
  if (!includesParameter(result, /cohesion|\bc\b/i)) missing.push('cohesion');
  if (!includesParameter(result, /friction|phi|angle/i)) missing.push('friction angle');
  return missing;
}

function firstMeaningful(values: Array<string | null | undefined>, maxLength: number): string {
  return values
    .map((value) => cleanNarrativeText(value, maxLength))
    .find(Boolean)
    ?? 'No concise evidence item was retained.';
}

function geotechEvidenceTexts(result: GeotechDocumentIngestResult): string[] {
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
    ...(result.contentChunks ?? []).flatMap((chunk) => [
      ...chunk.headingAncestry,
      chunk.text,
    ]),
    ...(result.inspection?.pages ?? []).flatMap((page) => [
      page.normalizedText,
      page.extractedText,
      page.normalizedArtifact?.nativeText,
    ]),
  ]
    .map((value) => typeof value === 'string' ? value : '')
    .filter(Boolean);
}

function inferGeotechBoreholeIds(result: GeotechDocumentIngestResult): string[] {
  return inferBoreholeIdsFromText(...geotechEvidenceTexts(result));
}

function inferGeotechMaxDepth(result: GeotechDocumentIngestResult): number | null {
  const depths = result.parameters
    .filter((parameter) => /depth|elevation|thickness/i.test(parameter.name))
    .map((parameter) => readDepthMeters(parameter.numericValue ?? parameter.valueText))
    .filter((value): value is number => value != null && value >= 0);
  const preferredDepths: number[] = [];
  for (const text of geotechEvidenceTexts(result)) {
    preferredDepths.push(...collectPreferredBoreholeDepthsFromText(text));
    depths.push(...collectDepthMetersFromText(text));
  }
  if (preferredDepths.length > 0) {
    return Math.max(...preferredDepths);
  }
  const fallbackDepth = readDepthMeters(result.summary);
  if (fallbackDepth != null) {
    depths.push(fallbackDepth);
  }
  return depths.length > 0 ? Math.max(...depths) : null;
}

function inferKeyConcern(result: GeotechDocumentIngestResult): string {
  const weatheredRock = result.materials.find((material) => /weathered|fractured|rock/i.test(material.description));
  return firstMeaningful([
    result.risks[0],
    weatheredRock ? `${weatheredRock.description} may affect bearing capacity, excavation stability, or foundation selection.` : null,
    result.synthesis?.interpretation[0],
  ], 180);
}

function inferMainLimitation(result: GeotechDocumentIngestResult): string {
  const missing = buildMissingCriticalItems(result);
  return firstMeaningful([
    result.synthesis?.limitations[0],
    missing.length > 0 ? `Missing or unverified: ${missing.join(', ')}.` : null,
    result.reviewReasons[0],
    result.warnings[0],
  ], 180);
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

function evidenceCacheStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'hit':
      return 'cache hit';
    case 'stored':
      return 'cache stored';
    case 'miss':
      return 'cache miss';
    case 'skipped':
      return 'cache skipped';
    default:
      return 'cache unavailable';
  }
}

function evidenceCacheTableCell(audit: GeotechDocumentPageAudit): string {
  if (!audit.evidenceCache) {
    return '-';
  }
  const label = evidenceCacheStatusLabel(audit.evidenceCache.status);
  return audit.evidenceCache.entryId
    ? `${label} (${audit.evidenceCache.entryId})`
    : label;
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
      description: 'Per-page extraction status, source path, cache reuse, retained signal counts, and warning volume.',
      columns: ['Page', 'Class', 'Status', 'Confidence', 'Source', 'Cache', 'Signals', 'Warnings'],
      rows: result.pageAudits.map((audit) => [
        String(audit.pageNumber),
        audit.classification ?? 'unknown',
        audit.parseStatus,
        `${audit.confidence}%`,
        audit.textHintSource,
        evidenceCacheTableCell(audit),
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
        sourcePageText(parameter.context, parameter.sourcePages),
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
      audit.evidenceCache ? evidenceCacheStatusLabel(audit.evidenceCache.status) : undefined,
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
      cacheStatus: audit.evidenceCache?.status,
      cacheEntryId: audit.evidenceCache?.entryId,
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
  const cacheHits = result.pageAudits.filter((audit) => audit.evidenceCache?.status === 'hit').length;
  const cacheStored = result.pageAudits.filter((audit) => audit.evidenceCache?.status === 'stored').length;
  return [
    { label: 'Pages processed', value: `${result.source.successfulPages}/${result.source.totalPages}`, tone: result.source.failedPages > 0 ? 'warning' : 'good' },
    { label: 'Confidence', value: `${result.confidence}%`, tone: toneFromParseStatus(result.parseStatus ?? 'parsed', result.confidence) },
    { label: 'Page outcomes', value: `${statusCounts.parsed}/${result.pageAudits.length}`, detail: `${statusCounts.partial} partial, ${statusCounts.failed} failed`, tone: statusCounts.failed > 0 ? 'danger' : statusCounts.partial > 0 ? 'warning' : 'good' },
    { label: 'Materials', value: String(result.materials.length), detail: `${result.classifications.length} classifications`, tone: result.materials.length > 0 ? 'good' : 'warning' },
    { label: 'Parameters', value: String(result.parameters.length), detail: result.documentClass ?? 'No document class', tone: result.parameters.length > 0 ? 'good' : 'warning' },
    { label: 'OCR hints', value: String(result.inspectionSummary?.ocrRecoveredPageCount ?? 0), detail: `${result.inspectionSummary?.imageHeavyPageCount ?? 0} image-heavy pages`, tone: (result.inspectionSummary?.ocrRecoveredPageCount ?? 0) > 0 ? 'good' : 'neutral' },
    { label: 'Evidence cache', value: String(cacheHits), detail: `${cacheStored} stored this run`, tone: cacheHits > 0 ? 'good' : cacheStored > 0 ? 'accent' : 'neutral' },
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

function buildGeotechExecutiveItems(result: GeotechDocumentIngestResult, sourceLabel: string): IngestDossierExecutiveItem[] {
  const boreholeIds = inferGeotechBoreholeIds(result);
  const maxDepth = inferGeotechMaxDepth(result);
  return [
    { label: 'Project/report', value: result.title ?? sourceLabel, detail: sourceLabel, tone: 'accent' },
    { label: 'Document type', value: humanDocumentType(result.documentClass ?? result.documentType), tone: 'accent' },
    {
      label: 'Processing status',
      value: result.reviewRequired ? 'Parsed, review required' : 'Parsed',
      detail: result.parseStatus,
      tone: result.reviewRequired ? 'warning' : 'good',
    },
    { label: 'Confidence', value: `${result.confidence}%`, tone: toneFromParseStatus(result.parseStatus, result.confidence) },
    { label: 'Boreholes detected', value: boreholeIds.length > 0 ? boreholeIds.join(', ') : 'Not explicitly detected', tone: boreholeIds.length > 0 ? 'good' : 'warning' },
    { label: 'Max depth', value: formatDepthMeters(maxDepth), tone: maxDepth != null ? 'good' : 'warning' },
    { label: 'Key engineering concern', value: inferKeyConcern(result), tone: 'warning' },
    { label: 'Main limitation', value: inferMainLimitation(result), tone: result.reviewRequired ? 'warning' : 'neutral' },
  ];
}

function buildBoreholeExecutiveItems(result: BoreholeDocumentIngestResult, sourceLabel: string): IngestDossierExecutiveItem[] {
  const boreholeIds = result.boreholes.map((borehole) => borehole.boreholeId).filter(Boolean);
  const maxDepth = result.boreholes
    .map((borehole) => borehole.totalDepth)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .reduce<number | null>((max, value) => max == null ? value : Math.max(max, value), null);
  const firstWarning = result.reviewReasons[0] ?? result.warnings[0] ?? null;
  return [
    { label: 'Project/report', value: result.boreholes[0]?.projectName ?? sourceLabel, detail: sourceLabel, tone: 'accent' },
    { label: 'Document type', value: 'Borehole log', tone: 'accent' },
    {
      label: 'Processing status',
      value: result.reviewRequired ? 'Parsed, review required' : 'Parsed',
      tone: result.reviewRequired ? 'warning' : 'good',
    },
    { label: 'Confidence', value: `${result.confidence}%`, tone: result.confidence >= 70 ? 'good' : 'warning' },
    { label: 'Boreholes detected', value: boreholeIds.length > 0 ? boreholeIds.join(', ') : 'Not explicitly detected', tone: boreholeIds.length > 0 ? 'good' : 'warning' },
    { label: 'Max depth', value: formatDepthMeters(maxDepth), tone: maxDepth != null ? 'good' : 'warning' },
    { label: 'Key engineering concern', value: firstMeaningful([firstWarning, result.boreholes[0]?.summary], 180), tone: firstWarning ? 'warning' : 'neutral' },
    { label: 'Main limitation', value: firstWarning ? cleanNarrativeText(firstWarning, 180) : 'No blocking limitation retained.', tone: firstWarning ? 'warning' : 'good' },
  ];
}

function buildGeotechInsightCards(result: GeotechDocumentIngestResult): IngestDossierInsightCard[] {
  const groundConditions = firstMeaningful([
    result.synthesis?.groundModel[0],
    result.synthesis?.takeaways[0],
    result.summary,
    result.materials.length > 0
      ? `${result.materials.map((material) => material.description).slice(0, 4).join(', ')}.`
      : null,
  ], 260);
  const designImplications = firstMeaningful([
    result.synthesis?.interpretation[0],
    result.risks[0],
    result.recommendations[0],
  ], 260);
  const missing = buildMissingCriticalItems(result);
  const verificationFocus = result.reviewRequired
    ? 'Human verification is recommended before this extraction is reused for design, reporting, or approval.'
    : 'No retained review gate blocks downstream use, but source-page verification is still recommended.';

  return [
    { title: 'Ground conditions', body: groundConditions, tone: 'accent' },
    { title: 'Design implications', body: designImplications, tone: 'warning' },
    {
      title: 'Missing critical data',
      body: missing.length > 0 ? `Not extracted or not corroborated: ${missing.join(', ')}.` : 'No common critical parameter gap was detected in the retained extraction.',
      tone: missing.length > 0 ? 'warning' : 'good',
    },
    { title: 'Verification focus', body: verificationFocus, tone: result.reviewRequired ? 'warning' : 'good' },
  ];
}

function buildBoreholeInsightCards(result: BoreholeDocumentIngestResult): IngestDossierInsightCard[] {
  const summaries = result.boreholes.map((borehole) => borehole.summary).filter(Boolean);
  const missingWater = result.boreholes.filter((borehole) => borehole.waterTableDepth == null).length;
  return [
    { title: 'Ground conditions', body: firstMeaningful(summaries, 260), tone: 'accent' },
    {
      title: 'Design implications',
      body: result.reviewRequired
        ? 'At least one borehole or page needs verification before the extracted profile is used as engineering input.'
        : 'The borehole profile is ready for engineering review against the source log.',
      tone: result.reviewRequired ? 'warning' : 'good',
    },
    {
      title: 'Missing critical data',
      body: missingWater > 0 ? `Groundwater was not extracted for ${missingWater} borehole(s).` : 'Groundwater was retained where available.',
      tone: missingWater > 0 ? 'warning' : 'good',
    },
    { title: 'Verification focus', body: result.reviewReasons[0] ?? 'Check layer boundaries, depth scale, and any low-confidence borehole metadata.', tone: result.reviewRequired ? 'warning' : 'neutral' },
  ];
}

function buildGeotechTrustItems(result: GeotechDocumentIngestResult): IngestDossierTrustItem[] {
  const visualExtractionUsed = result.pageAudits.some((audit) => audit.textHintSource === 'vision-visual' || audit.textHintSource === 'vision-ocr');
  const rows = result.parameters.slice(0, 16).map<IngestDossierTrustItem>((parameter) => {
    const sourcePage = sourcePageText(parameter.context, parameter.sourcePages);
    const reviewNeeded = result.reviewRequired || sourcePage === '-' || visualExtractionUsed;
    const valueText = displayTableText(parameter.valueText, 80);
    const unitText = displayTableText(parameter.unit, 28);
    const valueWithUnit =
      unitText !== '-' && valueText !== '-' && !valueText.toLowerCase().includes(unitText.toLowerCase())
        ? `${valueText} ${unitText}`
        : valueText;
    return {
      item: displayTableText(parameter.name, 80),
      value: valueWithUnit || '-',
      sourcePage,
      confidence: `${result.confidence}%`,
      review: reviewNeeded ? (visualExtractionUsed ? 'Visual verification recommended' : 'Manual review recommended') : 'Ready for review',
      evidence: displayTableText(parameter.context, 180),
      tone: reviewNeeded ? 'warning' : 'good',
    };
  });

  for (const missing of buildMissingCriticalItems(result).slice(0, 6)) {
    rows.push({
      item: missing,
      value: 'Not extracted',
      sourcePage: '-',
      confidence: 'Low',
      review: 'Required',
      evidence: 'No corroborated value was retained in the extraction.',
      tone: 'warning',
    });
  }

  return rows;
}

function buildBoreholeTrustItems(result: BoreholeDocumentIngestResult): IngestDossierTrustItem[] {
  const rows: IngestDossierTrustItem[] = [];
  for (const borehole of result.boreholes.slice(0, 8)) {
    rows.push({
      item: `${borehole.boreholeId} total depth`,
      value: formatDepthMeters(borehole.totalDepth),
      sourcePage: borehole.pageNumber != null ? String(borehole.pageNumber) : '-',
      confidence: `${borehole.confidence}%`,
      review: borehole.parseStatus === 'parsed' && !result.reviewRequired ? 'Ready for review' : 'Manual review recommended',
      evidence: cleanNarrativeText(borehole.summary, 180) || 'Borehole depth retained from structured extraction.',
      tone: borehole.parseStatus === 'parsed' && borehole.confidence >= 70 ? 'good' : 'warning',
    });
    rows.push({
      item: `${borehole.boreholeId} groundwater`,
      value: borehole.waterTableDepth != null ? formatDepthMeters(borehole.waterTableDepth) : 'Not extracted',
      sourcePage: borehole.pageNumber != null ? String(borehole.pageNumber) : '-',
      confidence: borehole.waterTableDepth != null ? `${borehole.confidence}%` : 'Low',
      review: borehole.waterTableDepth != null ? 'Verify against source log' : 'Required',
      evidence: borehole.waterTableDepth != null ? 'Groundwater value retained from structured extraction.' : 'No groundwater value was retained.',
      tone: borehole.waterTableDepth != null ? 'good' : 'warning',
    });
  }
  return rows;
}

function inferLayerLabel(description: string, fallback: string): string {
  if (/clayey\s+silt|silty\s+clay/i.test(description)) return 'CI/CL';
  if (/silty\s+sand/i.test(description)) return 'SM';
  if (/gravel/i.test(description)) return 'GM';
  if (/weathered|fractured|rock|gneiss/i.test(description)) return 'WR';
  if (/sand/i.test(description)) return 'SP/SM';
  if (/clay/i.test(description)) return 'CL';
  if (/silt/i.test(description)) return 'ML';
  return fallback;
}

function cleanLayerDescriptionText(value: string | null | undefined): string {
  return cleanNarrativeText(value, 150)
    .replace(/^generalized\s+sub\s+soil\s+profile\s+/i, '')
    .replace(/^the\s+soil\s+in\s+this\s+layer\s+consists\s+of\s+/i, '')
    .replace(/^it\s+can\s+be\s+described\s+as\s+/i, '')
    .trim();
}

function extractConceptualLayerDescriptions(result: GeotechDocumentIngestResult): string[] {
  const corpus = geotechEvidenceTexts(result).join('\n');
  const canonical = [
    /hard[^.\n]{0,50}clayey\s+silt/i.test(corpus)
      ? 'hard clayey silt with sand mixture'
      : null,
    /medium\s+dense[^.\n]{0,80}silty\s+sand/i.test(corpus)
      ? 'medium dense reddish silty sand'
      : null,
    /dense\s+to\s+very\s+dense[^.\n]{0,80}silty\s+sand/i.test(corpus)
      ? 'dense to very dense yellowish silty sand'
      : null,
    /weathered[^.\n]{0,80}(?:fractured\s+)?rock/i.test(corpus)
      ? 'weathered fractured rock'
      : null,
    /gneiss/i.test(corpus)
      ? 'gneissic rock'
      : null,
  ].filter((value): value is string => value != null);
  const candidates = [
    ...[...corpus.matchAll(/\bstratum\s*[-–]?\s*(?:iv|iii|ii|i|[1-4])\s*:\s*([^.\n]{18,220})[.\n]/gi)]
      .map((match) => match[1]),
    ...[...corpus.matchAll(/((?:hard|stiff|medium\s+dense|dense|very\s+dense|completely|highly|weathered|fractured)[^.\n]{0,180}?(?:clayey\s+silt|silty\s+sand|weathered\s+rock|fractured\s+rock|rock|sand|silt|clay)[^.\n]{0,120})[.\n]/gi)]
      .map((match) => match[1]),
    ...[...corpus.matchAll(/\b((?:clayey\s+silt|silty\s+sand|weathered\s+fractured\s+rock|weathered\s+rock|gneiss)[^.\n]{0,160})/gi)]
      .map((match) => match[1]),
    ...result.materials.map((material) => material.description),
  ]
    .map((value) => cleanLayerDescriptionText(value))
    .filter((value) =>
      value.length >= 4
      && !/^(clay|silt|sand|rock|water table|the soil in this layer)$/i.test(value)
      && !/\d{2,}\s+\d{2,}\s+\d{2,}/.test(value),
    );

  const canonicalUnique = [...new Set(canonical)];
  if (canonicalUnique.length >= 2) {
    return canonicalUnique.slice(0, 5);
  }
  return [...new Set([...canonicalUnique, ...candidates])].slice(0, 5);
}

function buildConceptualGeotechLayers(
  result: GeotechDocumentIngestResult,
  maxDepth: number,
): IngestDossierBoreholeProfileLayer[] {
  const descriptions = extractConceptualLayerDescriptions(result);
  if (descriptions.length === 0) {
    return [];
  }

  const layerHeight = maxDepth / descriptions.length;
  return descriptions.map((description, index) => ({
    depthFrom: Number((index * layerHeight).toFixed(2)),
    depthTo: Number(((index + 1) * layerHeight).toFixed(2)),
    label: inferLayerLabel(description, `L${index + 1}`),
    description,
    uscsSymbol: inferLayerLabel(description, `L${index + 1}`),
    tone: materialTone(description, inferLayerLabel(description, '')),
    uncertain: true,
  }));
}

function buildGeotechBoreholeProfile(result: GeotechDocumentIngestResult): IngestDossierBoreholeProfile | undefined {
  const boreholeIds = inferGeotechBoreholeIds(result);
  const maxDepth = inferGeotechMaxDepth(result);
  if (boreholeIds.length === 0 || maxDepth == null || maxDepth <= 0) {
    return undefined;
  }

  const conceptualLayers = buildConceptualGeotechLayers(result, maxDepth);
  if (conceptualLayers.length === 0) {
    return undefined;
  }

  const depthsByBorehole = new Map<string, number>();
  for (const parameter of result.parameters) {
    if (!/depth/i.test(parameter.name)) {
      continue;
    }
    const id = inferBoreholeIdsFromText(parameter.material, parameter.context)[0];
    const depth = readDepthMeters(parameter.numericValue ?? parameter.valueText);
    if (id && depth != null) {
      depthsByBorehole.set(id, Math.max(depthsByBorehole.get(id) ?? 0, depth));
    }
  }

  return {
    title: 'Borehole Stratigraphy Visualization',
    maxDepth,
    depthUnit: 'm',
    columns: boreholeIds.map((boreholeId) => ({
      boreholeId,
      totalDepth: depthsByBorehole.get(boreholeId) ?? maxDepth,
      waterTableDepth: null,
      layers: conceptualLayers,
    })),
    notes: [
      'Conceptual visualization from retained material observations.',
      'Dashed layer boundaries indicate missing or unverified stratum intervals.',
      'Use source logs before treating the profile as design-grade stratigraphy.',
    ],
  };
}

function buildBoreholeProfile(result: BoreholeDocumentIngestResult): IngestDossierBoreholeProfile | undefined {
  if (result.boreholes.length === 0) {
    return undefined;
  }
  const maxDepth = result.boreholes.reduce((max, borehole) => {
    const layerMax = Math.max(
      0,
      ...borehole.layers.map((layer) => layer.depthTo ?? layer.depthFrom ?? 0),
    );
    return Math.max(max, borehole.totalDepth ?? 0, layerMax);
  }, 0);
  if (maxDepth <= 0) {
    return undefined;
  }

  return {
    title: 'Borehole Stratigraphy Visualization',
    maxDepth,
    depthUnit: 'm',
    columns: result.boreholes.map((borehole) => ({
      boreholeId: borehole.boreholeId,
      totalDepth: borehole.totalDepth,
      waterTableDepth: borehole.waterTableDepth,
      layers: borehole.layers
        .map((layer, index): IngestDossierBoreholeProfileLayer | null => {
          const depthFrom = layer.depthFrom ?? (index === 0 ? 0 : null);
          const depthTo = layer.depthTo ?? borehole.totalDepth ?? maxDepth;
          if (depthFrom == null || depthTo == null || depthTo <= depthFrom) {
            return null;
          }
          return {
            depthFrom,
            depthTo,
            label: layer.uscsSymbol ?? layer.notes ?? `Layer ${index + 1}`,
            description: displayTableText(layer.description, 140),
            uscsSymbol: layer.uscsSymbol ?? null,
            tone: materialTone(layer.description, layer.uscsSymbol),
            uncertain: layer.depthFrom == null || layer.depthTo == null,
          };
        })
        .filter((layer): layer is IngestDossierBoreholeProfileLayer => layer != null),
    })),
    notes: ['Layer blocks are scaled to extracted depth intervals. Missing boundaries are shown as uncertain.'],
  };
}

function buildFooterNotes(result: IngestDossierSourceResult): string[] {
  return uniqueStrings([
    result.source.fileName ?? result.source.filePath ?? null,
    result.source.pageRange ? `Selected page range: ${result.source.pageRange[0]}-${result.source.pageRange[1]}.` : null,
    result.source.segmentation?.mode === 'segmented-parent'
      ? `Segmented execution used ${result.source.segmentation.segmentCount ?? result.source.segmentation.segments?.length ?? 0} linked packet(s).`
      : null,
    result.pageFailures.length > 0 ? `${result.pageFailures.length} page failure(s) were recorded.` : null,
    result.warnings.length > 0 ? `${result.warnings.length} warning(s) were retained in the report.` : null,
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
    const title = geotechResult.title ?? 'Geotechnical ingest report';
    const cleanSummary = cleanNarrativeText(geotechResult.summary, 320);
    const summary =
      cleanSummary
      || geotechOutcomeSummary(geotechResult);

    return {
      title,
      subtitle: geotechResult.documentClass
        ? `${geotechResult.documentClass} report`
        : 'Geotechnical document report',
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
      executiveItems: buildGeotechExecutiveItems(geotechResult, sourceLabel),
      insightCards: buildGeotechInsightCards(geotechResult),
      trustItems: buildGeotechTrustItems(geotechResult),
      boreholeProfile: buildGeotechBoreholeProfile(geotechResult),
      storedReview,
      approval,
      footerNotes: buildFooterNotes(geotechResult),
    };
  }

  const boreholeResult = result as BoreholeDocumentIngestResult;
  const firstBorehole = boreholeResult.boreholes[0];
  return {
    title: firstBorehole?.boreholeId
      ? `Borehole report - ${firstBorehole.boreholeId}`
      : 'Borehole ingest report',
    subtitle: 'Borehole log review report',
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
    executiveItems: buildBoreholeExecutiveItems(boreholeResult, sourceLabel),
    insightCards: buildBoreholeInsightCards(boreholeResult),
    trustItems: buildBoreholeTrustItems(boreholeResult),
    boreholeProfile: buildBoreholeProfile(boreholeResult),
    storedReview,
    approval,
    footerNotes: buildFooterNotes(boreholeResult),
  };
}

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
import { buildGroundModelMap, type GroundModel } from '../ground-model/index.js';
import {
  buildFemDraftCandidatesFromGroundModel,
  type FemGroundModelDraftCandidate,
} from '../fem/index.js';
import type { EvidenceMethod, EvidenceRef } from '../evidence/index.js';
import { buildBoreholeLocation } from '../geo/coordinates.js';
import type {
  IntegratedReviewAgentReview,
  IntegratedReviewSourceRegionLink,
  IntegratedReviewSourcePage,
} from './integrated-review-model.js';
import { buildIntegratedSourcePagesFromLayout } from './integrated-review-model.js';
import type { GlmOcrLayoutPage, GlmOcrLayoutElement } from '../vision/layout-ocr.js';

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

export interface IngestDossierConfidenceItem {
  label: string;
  value: string;
  detail: string;
  tone: IngestDossierTone;
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
  materialKey?: string | null;
  sourcePages?: number[];
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
  confidenceBreakdown?: IngestDossierConfidenceItem[];
  boreholeProfile?: IngestDossierBoreholeProfile;
  groundModel?: GroundModel;
  femDraftCandidates?: FemGroundModelDraftCandidate[];
  agentReviews?: IntegratedReviewAgentReview[];
  sourcePages?: IntegratedReviewSourcePage[];
  storedReview?: IngestDossierStoredReview;
  approval?: IngestDossierApproval;
  footerNotes: string[];
}

export interface BuildIngestDossierOptions {
  sourceLabel?: string;
  agentReviews?: IntegratedReviewAgentReview[];
  sourcePages?: IntegratedReviewSourcePage[];
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

function isNonReportDisplayTitle(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return /\b(?:fig(?:ure)?\.?\s*\d*|graph|curve|chart|grain size distribution|photograph|photo|annexure|appendix|drill log|bore\s*\/?\s*drill log|n['’]?\s*vs\.?\s*depth)\b/.test(normalized);
}

function deriveGeotechDisplayTitle(result: GeotechDocumentIngestResult): string {
  if (result.title && !isNonReportDisplayTitle(result.title)) {
    return result.title;
  }
  const corpus = [
    result.summary,
    ...(result.contentChunks ?? []).flatMap((chunk) => [
      ...chunk.headingAncestry,
      chunk.text,
    ]),
    ...(result.inspection?.pages ?? []).flatMap((page) => [
      page.normalizedText,
      page.extractedText,
      page.normalizedArtifact?.nativeText,
    ]),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n');
  const reportTitle = corpus.match(/\b(?:geotechnical|geo-technical|ground|site|subsoil|subsurface)\s+(?:investigation|assessment|study|report)(?:\s+report)?\b/i)?.[0]
    ?? corpus.match(/\b(?:site|ground|subsoil|subsurface)\s+investigation\s+report\b/i)?.[0];
  return reportTitle
    ? reportTitle.replace(/\s+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Geotechnical Intelligence Report';
}

function materialKey(description: string | null | undefined, uscsSymbol?: string | null): string {
  const text = `${description ?? ''} ${uscsSymbol ?? ''}`.toLowerCase();
  if (/peat|organic|top\s*soil|topsoil/.test(text)) return 'organic';
  if (/bedrock|fresh\s+rock|moderately\s+strong|strong\s+(?:shale|sandstone|siltstone|gneiss|rock)/.test(text)) return 'bedrock';
  if (/weathered|fractured|residual\s+rock|rocky\s+shale|shale|sandstone|gneiss|rock/.test(text)) return 'weathered-rock';
  if (/gravel|\bgm\b|\bgp\b|\bgw\b/.test(text)) return 'gravel';
  if (/sand|\bsm\b|\bsp\b|\bsw\b|\bsc\b/.test(text)) return 'sand';
  if (/clay|clayey|\bci\b|\bcl\b|\bch\b/.test(text)) return 'clay';
  if (/silt|silty|\bml\b|\bmh\b/.test(text)) return 'silt';
  if (/fill|made\s+ground|debris/.test(text)) return 'fill';
  return 'mixed';
}

function uniqueSortedPages(values: Array<number | null | undefined>): number[] {
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )].sort((left, right) => left - right);
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

function toneFromScore(score: number): IngestDossierTone {
  if (score >= 80) {
    return 'good';
  }
  if (score >= 60) {
    return 'warning';
  }
  return 'danger';
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

function buildFemDraftCandidatesSafe(groundModel: GroundModel | undefined): FemGroundModelDraftCandidate[] {
  if (!groundModel) {
    return [];
  }
  try {
    return buildFemDraftCandidatesFromGroundModel(groundModel);
  } catch {
    return [];
  }
}

function summarizeFemPrefill(candidate: FemGroundModelDraftCandidate): string {
  const input = candidate.bridge.input;
  return uniqueStrings([
    input.material?.elasticModulusKpa != null ? `E ${input.material.elasticModulusKpa} kPa` : undefined,
    input.material?.unitWeightKnM3 != null ? `unit weight ${input.material.unitWeightKnM3} kN/m3` : undefined,
    input.groundwater?.condition ? `groundwater ${input.groundwater.condition}${input.groundwater.depthM != null ? ` ${input.groundwater.depthM} m` : ''}` : undefined,
    `${candidate.evidenceIds.length} evidence ref(s)`,
  ]).join(', ') || '-';
}

function summarizeFemExecutionBoundary(candidate: FemGroundModelDraftCandidate): string {
  const boundary = candidate.executionBoundary;
  return uniqueStrings([
    boundary.executionMode.replace(/-/g, ' '),
    boundary.humanReviewRequired ? 'human review required' : undefined,
    boundary.agentRunAllowed === false ? 'agent run disabled' : undefined,
    boundary.agentWebglRenderAllowed === false ? 'agent WebGL disabled' : undefined,
    boundary.caseOutputAvailable ? 'case output available after review' : 'draft only',
    boundary.humanRunCommand ? `human run: ${boundary.humanRunCommand}` : undefined,
  ]).join('; ') || 'review boundary unavailable';
}

function buildFemDraftRoutingTable(candidates: FemGroundModelDraftCandidate[]): IngestDossierTable | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  return {
    title: 'FEM draft routing',
    description: 'Review-gated FEM candidate routes derived from the GroundModel. These prepare inputs only; a human must review geometry, loads, staging, and then explicitly run geotech fem run if appropriate.',
    columns: ['Route', 'Readiness', 'Score', 'Prefilled evidence', 'Missing user inputs', 'Review gates', 'Execution boundary', 'Draft command'],
    rows: candidates.map((candidate) => [
      candidate.draft.capability.label,
      candidate.status.replace(/_/g, ' '),
      `${candidate.score}/100`,
      displayTableText(summarizeFemPrefill(candidate), 120),
      displayTableText(candidate.missingUserInputs.join(', ') || 'review required', 160),
      displayTableText(candidate.reviewGates.join(', ') || 'review required', 180),
      displayTableText(summarizeFemExecutionBoundary(candidate), 220),
      displayTableText(candidate.command, 180),
    ]),
  };
}

function buildGeotechTables(
  result: GeotechDocumentIngestResult,
  femDraftCandidates: FemGroundModelDraftCandidate[] = [],
): IngestDossierTable[] {
  const tables: IngestDossierTable[] = [];
  const auditTables: IngestDossierTable[] = [];
  const materialRows = result.materials
    .filter((material) => {
      const description = material.description.replace(/\s+/g, ' ').trim();
      const digitRatio = (description.match(/\d/g) ?? []).length / Math.max(1, description.length);
      return description.length >= 12
        && description.length <= 220
        && digitRatio < 0.16
        && !looksLikeNoisyOcr(description)
        && !/[{}"]|%\s*\)|\b(?:run\s+tcr|depth\s*\(?m\)?|conducting\s+spt|0\s*-\s*15\s*cm|15\s*-\s*30\s*cm|30\s*-\s*45\s*cm|lab\s*test\s*result|json|materials\s*:|values\s+average|foundation\s+analysis|gondwana|sylhet\s+trap|intruded\s+by|idri?s?s|earthquake|structure\s+location|sieve|hydrometer|liquefiable|liquefaction|liquid\s+limit|plastic\s+limit|bowles|relative\s+density|criteria\s+is\s+satisfied)\b/i.test(description)
        && /\b(?:stratum|layer|hard|stiff|loose|medium\s*dense|dense|clayey|silty|sand|silt|clay|gravel|rock|shale|gneiss|groundwater|water\s+table|fill)\b/i.test(description);
    })
    .slice(0, 30);

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

  const femRoutingTable = buildFemDraftRoutingTable(femDraftCandidates);
  if (femRoutingTable) {
    tables.push(femRoutingTable);
  }

  tables.push({
    title: 'Material observations',
    description: 'Curated soil and rock observations. Noisy OCR/table fragments remain traceable in the processing audit and source evidence.',
    columns: ['Kind', 'Description', 'USCS', 'Lithology', 'Source pages'],
    rows: materialRows.map((material) => [
      displayTableText(material.kind, 48),
      displayTableText(material.description, 180),
      displayTableText(material.uscsSymbol, 24),
      displayTableText(material.lithology, 90),
      sourcePageText(material.description, material.sourcePages),
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

function buildBoreholeTables(
  result: BoreholeDocumentIngestResult,
  femDraftCandidates: FemGroundModelDraftCandidate[] = [],
): IngestDossierTable[] {
  const tables: IngestDossierTable[] = [{
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
  const femRoutingTable = buildFemDraftRoutingTable(femDraftCandidates);
  if (femRoutingTable) {
    tables.push(femRoutingTable);
  }
  return tables;
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
  const breakdown = result.confidenceBreakdown;
  return [
    { label: 'Pages processed', value: `${result.source.successfulPages}/${result.source.totalPages}`, tone: result.source.failedPages > 0 ? 'warning' : 'good' },
    {
      label: 'Review confidence',
      value: `${result.confidence}%`,
      detail: breakdown
        ? `pages avg ${breakdown.pageEvidenceConfidence}%, traceability ${breakdown.traceabilityScore}%, readiness ${breakdown.readinessScore}%`
        : 'Workflow confidence for review triage.',
      tone: toneFromParseStatus(result.parseStatus ?? 'parsed', result.confidence),
    },
    { label: 'Page outcomes', value: `${statusCounts.parsed}/${result.pageAudits.length}`, detail: `${statusCounts.partial} partial, ${statusCounts.failed} failed`, tone: statusCounts.failed > 0 ? 'danger' : statusCounts.partial > 0 ? 'warning' : 'good' },
    { label: 'Materials', value: String(result.materials.length), detail: `${result.classifications.length} classifications`, tone: result.materials.length > 0 ? 'good' : 'warning' },
    { label: 'Parameters', value: String(result.parameters.length), detail: result.documentClass ?? 'No document class', tone: result.parameters.length > 0 ? 'good' : 'warning' },
    { label: 'OCR hints', value: String(result.inspectionSummary?.ocrRecoveredPageCount ?? 0), detail: `${result.inspectionSummary?.imageHeavyPageCount ?? 0} image-heavy pages`, tone: (result.inspectionSummary?.ocrRecoveredPageCount ?? 0) > 0 ? 'good' : 'neutral' },
    { label: 'Evidence cache', value: String(cacheHits), detail: `${cacheStored} stored this run`, tone: cacheHits > 0 ? 'good' : cacheStored > 0 ? 'accent' : 'neutral' },
  ];
}

function buildGeotechConfidenceItems(result: GeotechDocumentIngestResult): IngestDossierConfidenceItem[] | undefined {
  const breakdown = result.confidenceBreakdown;
  if (!breakdown) {
    return undefined;
  }
  return [
    {
      label: 'Workflow confidence',
      value: `${breakdown.overall}%`,
      detail: 'Legacy review-triage score; synthesis cannot raise it.',
      tone: toneFromScore(breakdown.overall),
    },
    {
      label: 'Page evidence',
      value: `${breakdown.pageEvidenceConfidence}%`,
      detail: `${result.pageAudits.length} audited page(s); extraction score ${breakdown.extractionConfidence}%.`,
      tone: toneFromScore(breakdown.pageEvidenceConfidence),
    },
    {
      label: 'Source traceability',
      value: `${breakdown.traceabilityScore}%`,
      detail: `${result.parameters.filter((parameter) => sourcePageText(parameter.context, parameter.sourcePages) !== '-').length}/${result.parameters.length} parameter(s) with source pages.`,
      tone: toneFromScore(breakdown.traceabilityScore),
    },
    {
      label: 'Review gates',
      value: String(breakdown.reviewGates.length),
      detail: breakdown.reviewGates.length > 0 ? breakdown.reviewGates.slice(0, 3).join(', ') : 'No retained confidence gates.',
      tone: breakdown.reviewGates.length > 0 ? 'warning' : 'good',
    },
    {
      label: 'Engineering completeness',
      value: `${breakdown.engineeringCompleteness}%`,
      detail: breakdown.missingCriticalData.length > 0 ? `Missing: ${breakdown.missingCriticalData.join(', ')}.` : 'Common critical data categories retained.',
      tone: toneFromScore(breakdown.engineeringCompleteness),
    },
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
  const displayTitle = deriveGeotechDisplayTitle(result);
  return [
    { label: 'Project/report', value: displayTitle, detail: sourceLabel, tone: 'accent' },
    { label: 'Document type', value: humanDocumentType(result.documentClass ?? result.documentType), tone: 'accent' },
    {
      label: 'Processing status',
      value: result.reviewRequired ? 'Parsed, review required' : 'Parsed',
      detail: result.parseStatus,
      tone: result.reviewRequired ? 'warning' : 'good',
    },
    {
      label: 'Review confidence',
      value: `${result.confidence}%`,
      detail: result.confidenceBreakdown
        ? `Evidence ${result.confidenceBreakdown.pageEvidenceConfidence}%, readiness ${result.confidenceBreakdown.readinessScore}%.`
        : undefined,
      tone: toneFromParseStatus(result.parseStatus, result.confidence),
    },
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

function inferUscsSymbolFromText(value: string): string | null {
  const uscsMatch = value.match(/\bUSCS\s*[:=]?\s*([A-Z]{1,2}(?:\s*\/\s*[A-Z]{1,2})?)\b/i)
    ?? value.match(/\(([A-Z]{1,2}(?:\s*\/\s*[A-Z]{1,2})?)\)/);
  return uscsMatch?.[1]?.replace(/\s+/g, '').toUpperCase() ?? null;
}

function clampLayerDepth(value: number, maxDepth: number): number {
  return Number(Math.max(0, Math.min(maxDepth, value)).toFixed(2));
}

function extractMaterialPhrase(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const materialMatch = normalized.match(/\b((?:hard|stiff|loose|medium\s*dense|dense(?:\s*to\s*very\s*dense)?|very\s*dense|completely|highly|light\s+brown|brownish|reddish|yellowish)[^.;]{0,180}?(?:clayey|silty|sand|silt|clay|gravel|rock|shale|gneiss)[^.;]{0,120})/i);
  return materialMatch?.[1]?.trim() ?? normalized;
}

function makeIntervalLayer(input: {
  depthFrom: number;
  depthTo: number;
  label?: string | null;
  description: string;
  maxDepth: number;
  sourcePages?: number[];
  uncertain?: boolean;
}): IngestDossierBoreholeProfileLayer | null {
  const depthFrom = clampLayerDepth(input.depthFrom, input.maxDepth);
  const depthTo = clampLayerDepth(input.depthTo, input.maxDepth);
  if (!Number.isFinite(depthFrom) || !Number.isFinite(depthTo) || depthTo <= depthFrom) {
    return null;
  }
  const description = cleanLayerDescriptionText(extractMaterialPhrase(input.description));
  if (
    !description
    || description.length < 4
    || /^(depth|from|to|note|sample)$/i.test(description)
    || looksLikeNoisyOcr(description)
    || /\b(?:from\s+to|run\s+tcr|depth\s*\(?m\)?|conducting\s+spt|n['’]?\s*value|0\s*-\s*15\s*cm|15\s*-\s*30\s*cm|30\s*-\s*45\s*cm)\b/i.test(description)
  ) {
    return null;
  }
  const uscsSymbol = inferUscsSymbolFromText(`${input.label ?? ''} ${description}`);
  const fallbackLabel = input.label?.replace(/\s+/g, ' ').trim()
    || inferLayerLabel(description, 'Layer');
  return {
    depthFrom,
    depthTo,
    label: inferLayerLabel(`${fallbackLabel} ${description}`, fallbackLabel),
    description,
    uscsSymbol,
    materialKey: materialKey(description, uscsSymbol),
    sourcePages: uniqueSortedPages(input.sourcePages ?? []),
    tone: materialTone(description, uscsSymbol),
    uncertain: input.uncertain ?? false,
  };
}

function mergeIntervalLayers(layers: IngestDossierBoreholeProfileLayer[]): IngestDossierBoreholeProfileLayer[] {
  const byKey = new Map<string, IngestDossierBoreholeProfileLayer>();
  for (const layer of layers) {
    const key = [
      layer.depthFrom.toFixed(2),
      layer.depthTo.toFixed(2),
      layer.label.toLowerCase(),
      materialKey(layer.description, layer.uscsSymbol),
    ].join('|');
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, { ...layer, sourcePages: uniqueSortedPages(layer.sourcePages ?? []) });
      continue;
    }
    previous.description = previous.description.length >= layer.description.length
      ? previous.description
      : layer.description;
    previous.sourcePages = uniqueSortedPages([...(previous.sourcePages ?? []), ...(layer.sourcePages ?? [])]);
    previous.uncertain = Boolean(previous.uncertain || layer.uncertain);
  }
  return [...byKey.values()]
    .sort((left, right) => left.depthFrom - right.depthFrom || left.depthTo - right.depthTo)
    .slice(0, 10);
}

function extractDepthIntervalLayersFromText(
  text: string | null | undefined,
  maxDepth: number,
  sourcePages?: number[],
): IngestDossierBoreholeProfileLayer[] {
  if (!text?.trim()) {
    return [];
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  const layers: IngestDossierBoreholeProfileLayer[] = [];
  const parentheticalPattern = /\b((?:stratum|layer)\s*[-–]?\s*(?:[ivx]+|\d+))?[^().:\n]{0,90}\(\s*[>~<]?\s*(\d{1,2}(?:\.\d+)?)\s*m\s*(?:to|-|–)\s*[>~<]?\s*(\d{1,2}(?:\.\d+)?)\s*m\+?\s*\)\s*:?\s*([^.\n]{8,260})/gi;
  for (const match of normalized.matchAll(parentheticalPattern)) {
    const layer = makeIntervalLayer({
      depthFrom: Number(match[2]),
      depthTo: Number(match[3]),
      label: match[1],
      description: match[4] ?? '',
      maxDepth,
      sourcePages,
      uncertain: /[~+<>]|approximately|approx\.?/i.test(match[0]),
    });
    if (layer) {
      layers.push(layer);
    }
  }

  const descriptionBeforeRangePattern = /([^.\n]{12,180}?(?:clayey|silty|sand|silt|clay|gravel|rock|shale|gneiss)[^.\n]{0,120})\.\s*(\d{1,2}(?:\.\d+)?)\s+(\d{1,2}(?:\.\d+)?)(?=\s|$)/gi;
  for (const match of normalized.matchAll(descriptionBeforeRangePattern)) {
    const layer = makeIntervalLayer({
      depthFrom: Number(match[2]),
      depthTo: Number(match[3]),
      description: match[1] ?? '',
      maxDepth,
      sourcePages,
      uncertain: true,
    });
    if (layer) {
      layers.push(layer);
    }
  }

  const transition = normalized.match(/upper\s+stratum\s+consists\s+of\s+([^.\n]+?)\s*,?\s*transitioning\s+at\s+approximately\s+(\d{1,2}(?:\.\d+)?)\s*m\s+to\s+([^.\n]+)/i);
  if (transition) {
    const boundary = Number(transition[2]);
    const upper = makeIntervalLayer({
      depthFrom: 0,
      depthTo: boundary,
      description: transition[1] ?? '',
      maxDepth,
      sourcePages,
      uncertain: true,
    });
    const lower = makeIntervalLayer({
      depthFrom: boundary,
      depthTo: maxDepth,
      description: transition[3] ?? '',
      maxDepth,
      sourcePages,
      uncertain: true,
    });
    if (upper) layers.push(upper);
    if (lower) layers.push(lower);
  }

  return mergeIntervalLayers(layers);
}

function buildGlobalIntervalGeotechLayers(
  result: GeotechDocumentIngestResult,
  maxDepth: number,
): IngestDossierBoreholeProfileLayer[] {
  const layers: IngestDossierBoreholeProfileLayer[] = [];
  for (const statement of result.synthesis?.groundModel ?? []) {
    layers.push(...extractDepthIntervalLayersFromText(statement, maxDepth, result.synthesis?.sourcePages));
  }
  for (const chunk of result.contentChunks ?? []) {
    if (chunk.sectionType === 'ground-model' || chunk.sectionType === 'summary' || chunk.sectionType === 'visual-appendix') {
      layers.push(...extractDepthIntervalLayersFromText(chunk.text, maxDepth, chunk.sourcePages));
    }
  }
  return mergeIntervalLayers(layers);
}

function buildBoreholeIntervalLayers(
  result: GeotechDocumentIngestResult,
  maxDepth: number,
): Map<string, IngestDossierBoreholeProfileLayer[]> {
  const byBorehole = new Map<string, IngestDossierBoreholeProfileLayer[]>();
  for (const chunk of result.contentChunks ?? []) {
    const boreholeIds = inferBoreholeIdsFromText(chunk.headingAncestry.join(' '), chunk.text);
    if (boreholeIds.length !== 1) {
      continue;
    }
    const layers = extractDepthIntervalLayersFromText(chunk.text, maxDepth, chunk.sourcePages);
    if (layers.length === 0) {
      continue;
    }
    const boreholeId = boreholeIds[0]!;
    byBorehole.set(boreholeId, mergeIntervalLayers([...(byBorehole.get(boreholeId) ?? []), ...layers]));
  }
  return byBorehole;
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
    materialKey: materialKey(description, inferLayerLabel(description, '')),
    sourcePages: [],
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

  const globalIntervalLayers = buildGlobalIntervalGeotechLayers(result, maxDepth);
  const boreholeIntervalLayers = buildBoreholeIntervalLayers(result, maxDepth);
  const conceptualLayers = buildConceptualGeotechLayers(result, maxDepth);
  if (globalIntervalLayers.length === 0 && conceptualLayers.length === 0 && boreholeIntervalLayers.size === 0) {
    return undefined;
  }

  const depthsByBorehole = new Map<string, number>();
  const waterByBorehole = new Map<string, number>();
  for (const parameter of result.parameters) {
    const id = inferBoreholeIdsFromText(parameter.material, parameter.context)[0];
    if (/depth/i.test(parameter.name)) {
      const depth = readDepthMeters(parameter.numericValue ?? parameter.valueText);
      if (id && depth != null) {
        depthsByBorehole.set(id, Math.max(depthsByBorehole.get(id) ?? 0, depth));
      }
    }
    if (/water\s*table|ground\s*water/i.test(parameter.name)) {
      const depth = readDepthMeters(parameter.numericValue ?? parameter.valueText);
      if (id && depth != null) {
        waterByBorehole.set(id, depth);
      }
    }
  }

  const fallbackLayers = globalIntervalLayers.length > 0 ? globalIntervalLayers : conceptualLayers;
  const usesOnlyConceptualLayers = globalIntervalLayers.length === 0 && boreholeIntervalLayers.size === 0;

  return {
    title: 'Borehole Stratigraphy Review',
    maxDepth,
    depthUnit: 'm',
    columns: boreholeIds.map((boreholeId) => {
      const specificLayers = boreholeIntervalLayers.get(boreholeId);
      const layers = specificLayers && specificLayers.length > 0 ? specificLayers : fallbackLayers;
      return {
        boreholeId,
        totalDepth: depthsByBorehole.get(boreholeId) ?? maxDepth,
        waterTableDepth: waterByBorehole.get(boreholeId) ?? null,
        layers,
      };
    }),
    notes: [
      usesOnlyConceptualLayers
        ? 'Conceptual visualization from retained material observations; exact stratum intervals were not recovered.'
        : 'Depth-bounded strata were recovered where page evidence exposed intervals; unmatched boreholes reuse the report-level ground model.',
      'Dashed layer boundaries indicate missing or unverified stratum intervals. Inferred contacts remain approximate.',
      'Use source logs before treating the profile as design-grade stratigraphy.',
    ],
  };
}

type ReportGroundModelBorehole = GroundModel['boreholes'][number];
type ReportGroundModelStratum = GroundModel['strata'][number];
type ReportGroundModelParameter = GroundModel['parameters'][number];
type ReportGroundModelGroundwater = GroundModel['groundwater'][number];

interface ReportGroundModelEvidenceState {
  refs: EvidenceRef[];
  counter: number;
  sourcePath: string;
  result: GeotechDocumentIngestResult;
}

function confidenceRatio(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  const normalized = value > 1 ? value / 100 : value;
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100) / 100;
}

function firstSourcePage(values: Array<number[] | undefined>): number | undefined {
  return uniqueSortedPages(values.flatMap((pages) => pages ?? []))[0];
}

function evidenceMethodForPage(result: GeotechDocumentIngestResult, pageNumber?: number): EvidenceMethod {
  const audit = pageNumber != null
    ? result.pageAudits.find((candidate) => candidate.pageNumber === pageNumber)
    : undefined;
  if (!audit) {
    return 'manual';
  }
  switch (audit?.textHintSource) {
    case 'native-text':
    case 'pdfjs-text':
      return 'pdf-text';
    case 'none':
      return 'manual';
    default:
      return 'vision';
  }
}

function addReportEvidenceRef(
  state: ReportGroundModelEvidenceState,
  input: {
    pageNumber?: number;
    rawValue?: string | number | boolean | null;
    normalizedValue?: string | number | boolean | null;
    unit?: string | null;
    warnings?: string[];
  },
): string {
  state.counter += 1;
  const id = `doc-ev-${String(state.counter).padStart(5, '0')}`;
  const hasAudit = input.pageNumber == null
    || state.result.pageAudits.some((candidate) => candidate.pageNumber === input.pageNumber);
  const warnings = [
    ...(input.warnings ?? []),
    ...(!hasAudit ? [`Source page ${input.pageNumber} was not present in retained page audit; verify against the PDF.`] : []),
  ];
  state.refs.push({
    id,
    sourceType: 'pdf-page',
    sourcePath: state.sourcePath,
    location: {
      filePath: state.sourcePath,
      ...(input.pageNumber != null ? { pageNumber: input.pageNumber } : {}),
    },
    method: evidenceMethodForPage(state.result, input.pageNumber),
    confidence: confidenceRatio(state.result.confidence),
    rawValue: input.rawValue,
    normalizedValue: input.normalizedValue,
    ...(input.unit ? { unit: input.unit } : {}),
    warnings,
  });
  return id;
}

function depthFromEvidenceText(...values: Array<string | number | null | undefined>): number | undefined {
  for (const value of values) {
    const depth = readDepthMeters(value);
    if (depth != null && depth >= 0) {
      return depth;
    }
  }
  return undefined;
}

function numericParameterValue(parameter: GeotechDocumentIngestResult['parameters'][number]): number | undefined {
  if (parameter.numericValue != null && Number.isFinite(parameter.numericValue)) {
    return parameter.numericValue;
  }
  const value = Number(String(parameter.valueText ?? '').replace(/,/g, '').trim());
  return Number.isFinite(value) ? value : undefined;
}

function parameterBoreholeId(parameter: GeotechDocumentIngestResult['parameters'][number]): string | undefined {
  return inferBoreholeIdsFromText(parameter.material, parameter.context, parameter.name)[0];
}

interface ReportCoordinateTextEntry {
  text: string;
  pageNumber?: number;
}

interface ReportBoreholeCoordinateCandidate {
  boreholeId: string;
  rawText: string;
  pageNumber?: number;
  easting?: string;
  northing?: string;
  latitude?: string;
  longitude?: string;
  crs?: string;
}

function firstRegexGroup(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function labelledCoordinateValue(
  text: string,
  pattern: RegExp,
  allowedHemisphere: RegExp,
): string | undefined {
  const match = text.match(pattern);
  if (!match?.[2]) {
    return undefined;
  }
  const hemisphere = match[1]?.trim().toUpperCase();
  const value = match[2].trim();
  if (!hemisphere || /[NSEW]$/i.test(value) || !allowedHemisphere.test(hemisphere)) {
    return value;
  }
  return `${value} ${hemisphere}`;
}

function reportBoreholeCoordinateSegments(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const boreholeMarker = /\b(?:B\.?\s*H\.?|BH|BORE\s*HOLE|BOREHOLE|BOREHOLENO)\s*(?:NO\.?)?\s*[:#-]?\s*0*\d{1,3}\b/gi;
  const matches = [...normalized.matchAll(boreholeMarker)]
    .map((match) => match.index)
    .filter((index): index is number => index != null);
  if (matches.length === 0) {
    return normalized
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return matches
    .map((start, index) => normalized.slice(start, matches[index + 1] ?? normalized.length))
    .flatMap((segment) => segment.split(/(?<=\.)\s+(?=(?:BH|B\.?\s*H|Bore\s*Hole|Borehole)\b)/i))
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function reportCoordinateTextEntries(result: GeotechDocumentIngestResult): ReportCoordinateTextEntry[] {
  return [
    ...(result.contentChunks ?? []).map((chunk) => ({
      text: [chunk.headingAncestry.join(' '), chunk.text].filter(Boolean).join('\n'),
      pageNumber: firstSourcePage([chunk.sourcePages]),
    })),
    ...(result.inspection?.pages ?? []).map((page) => ({
      text: [
        page.normalizedText,
        page.extractedText,
        page.normalizedArtifact?.nativeText,
      ].filter(Boolean).join('\n'),
      pageNumber: page.pageNumber,
    })),
    ...result.parameters.map((parameter) => ({
      text: [parameter.name, parameter.valueText, parameter.unit, parameter.material, parameter.context].filter(Boolean).join(' '),
      pageNumber: firstSourcePage([parameter.sourcePages]),
    })),
  ].filter((entry) => entry.text.trim().length > 0);
}

function extractReportCoordinateCandidateFromLine(
  rawLine: string,
  pageNumber?: number,
): ReportBoreholeCoordinateCandidate | undefined {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!line || !/\b(?:coordinate|location|latitude|longitude|easting|northing|bore\s*hole|borehole|bh)\b/i.test(line)) {
    return undefined;
  }
  const boreholeIds = inferBoreholeIdsFromText(line);
  if (boreholeIds.length !== 1) {
    return undefined;
  }

  const easting = firstRegexGroup(line, /\b(?:easting|east)\s*(?:\([ex]\))?\s*[:=\-]?\s*([+-]?\d[\d,]*(?:\.\d+)?)/i);
  const northing = firstRegexGroup(line, /\b(?:northing|north)\s*(?:\([ny]\))?\s*[:=\-]?\s*([+-]?\d[\d,]*(?:\.\d+)?)/i);
  const latitude = labelledCoordinateValue(
    line,
    /\b(?:latitude|lat)\s*(?:\(([ns])\))?\s*[:=\-]?\s*([+-]?\d{1,2}(?:[.,]\d+)?\s*[NS]?)/i,
    /^[NS]$/i,
  );
  const longitude = labelledCoordinateValue(
    line,
    /\b(?:longitude|long|lon)\s*(?:\(([ew])\))?\s*[:=\-]?\s*([+-]?\d{1,3}(?:[.,]\d+)?\s*[EW]?)/i,
    /^[EW]$/i,
  );

  if (!((easting && northing) || (latitude && longitude))) {
    return undefined;
  }

  const epsg = firstRegexGroup(line, /\bEPSG\s*[:#-]?\s*(\d{3,5})\b/i);
  return {
    boreholeId: boreholeIds[0]!,
    rawText: line,
    ...(pageNumber != null ? { pageNumber } : {}),
    ...(easting ? { easting } : {}),
    ...(northing ? { northing } : {}),
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
    ...(epsg ? { crs: `EPSG:${epsg}` } : {}),
  };
}

function extractReportBoreholeCoordinateCandidates(
  result: GeotechDocumentIngestResult,
): ReportBoreholeCoordinateCandidate[] {
  const candidates: ReportBoreholeCoordinateCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of reportCoordinateTextEntries(result)) {
    for (const segment of reportBoreholeCoordinateSegments(entry.text)) {
      const candidate = extractReportCoordinateCandidateFromLine(segment, entry.pageNumber);
      if (!candidate) {
        continue;
      }
      const key = `${candidate.boreholeId}:${candidate.easting ?? ''}:${candidate.northing ?? ''}:${candidate.latitude ?? ''}:${candidate.longitude ?? ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function coordinateSystemFromReportBoreholes(
  boreholes: ReportGroundModelBorehole[],
): GroundModel['coordinateSystem'] {
  const coordinates = boreholes.map((borehole) => borehole.coordinates).filter(Boolean);
  const hasProjected = coordinates.some((coordinate) => coordinate?.easting != null && coordinate.northing != null);
  const hasGeographic = coordinates.some((coordinate) => coordinate?.latitude != null && coordinate.longitude != null);
  if (hasProjected) {
    return {
      kind: 'local-grid',
      warnings: ['PDF report coordinate evidence requires CRS/unit verification before design or GIS overlay use.'],
    };
  }
  if (hasGeographic) {
    return {
      kind: 'geographic',
      crs: 'EPSG:4326',
      warnings: ['Geographic borehole coordinates were extracted from report text; verify against the source PDF before design use.'],
    };
  }
  return {
    kind: 'unknown',
    warnings: ['PDF report evidence did not include plottable coordinate data.'],
  };
}

function looksLikeBearingTableSptFalsePositive(parameter: GeotechDocumentIngestResult['parameters'][number]): boolean {
  const normalizedName = parameter.name.toLowerCase().replace(/\s+/g, '');
  if (!/spt|nvalue|n-value|standardpenetration/.test(normalizedName)) {
    return false;
  }
  const retainedContext = [parameter.material, parameter.context].filter(Boolean).join(' ');
  return /\b(?:foundation|footing|allowable\s+bearing|bearing\s+pressure|net\s+bearing|dimension|size\s+of\s+footing)\b/i.test(retainedContext)
    && !/\b(?:spt|standard\s+penetration|n[-\s]?value|blows?\b)\b/i.test(retainedContext);
}

function buildGroundModelFromGeotechReport(
  result: GeotechDocumentIngestResult,
  profile: IngestDossierBoreholeProfile | undefined,
  sourceLabel: string,
): GroundModel | undefined {
  const evidenceState: ReportGroundModelEvidenceState = {
    refs: [],
    counter: 0,
    sourcePath: result.source.fileName ?? result.source.filePath ?? sourceLabel,
    result,
  };
  const boreholes = new Map<string, ReportGroundModelBorehole>();
  const strata: ReportGroundModelStratum[] = [];
  const groundwater: ReportGroundModelGroundwater[] = [];
  const parameters: ReportGroundModelParameter[] = [];
  let promotedCoordinateSystem: GroundModel['coordinateSystem'] | undefined;

  const ensureBorehole = (id: string, evidenceIds: string[] = []): ReportGroundModelBorehole => {
    const normalizedId = normalizeBoreholeId(id);
    const existing = boreholes.get(normalizedId);
    if (existing) {
      existing.evidenceIds = uniqueStrings([...existing.evidenceIds, ...evidenceIds]);
      return existing;
    }
    const borehole: ReportGroundModelBorehole = {
      id: normalizedId,
      sptTests: [],
      strata: [],
      groundwater: [],
      evidenceIds,
      confidence: confidenceRatio(result.confidence),
      warnings: [],
    };
    boreholes.set(normalizedId, borehole);
    return borehole;
  };

  for (const boreholeId of profile?.columns.map((column) => column.boreholeId) ?? inferGeotechBoreholeIds(result)) {
    ensureBorehole(boreholeId);
  }

  if (profile) {
    for (const column of profile.columns) {
      const borehole = ensureBorehole(column.boreholeId);
      for (const layer of column.layers) {
        const pageNumber = firstSourcePage([layer.sourcePages]);
        const warnings = layer.uncertain ? ['Layer boundary inferred or unverified.'] : [];
        const evidenceId = addReportEvidenceRef(evidenceState, {
          pageNumber,
          rawValue: layer.description,
          normalizedValue: `${layer.depthFrom}-${layer.depthTo}m ${layer.description}`,
          warnings,
        });
        const stratum: ReportGroundModelStratum = {
          boreholeId: borehole.id,
          topDepth: layer.depthFrom,
          bottomDepth: layer.depthTo,
          description: layer.description,
          evidenceIds: [evidenceId],
          confidence: confidenceRatio(result.confidence),
          warnings,
        };
        strata.push(stratum);
        borehole.strata.push(stratum);
        borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, evidenceId]);
      }

      // Groundwater is added from the source parameter rows below so page-level
      // evidence is preserved and duplicate profile-derived observations are avoided.
    }
  }

  for (const parameter of result.parameters) {
    const numericValue = numericParameterValue(parameter);
    const boreholeId = parameterBoreholeId(parameter);
    const depth = depthFromEvidenceText(parameter.context, parameter.material);
    const sourcePage = firstSourcePage([parameter.sourcePages]);
    const normalizedName = parameter.name.toLowerCase().replace(/\s+/g, '');

    if (numericValue != null && /spt|nvalue|n-value|standardpenetration/.test(normalizedName)) {
      if (!boreholeId || looksLikeBearingTableSptFalsePositive(parameter)) {
        continue;
      }
      const testDepth = depth ?? depthFromEvidenceText(parameter.valueText);
      if (testDepth != null && numericValue >= 0 && numericValue <= 100) {
        const evidenceId = addReportEvidenceRef(evidenceState, {
          pageNumber: sourcePage,
          rawValue: parameter.valueText,
          normalizedValue: numericValue,
          unit: parameter.unit,
        });
        ensureBorehole(boreholeId, [evidenceId]).sptTests.push({
          depth: testDepth,
          nValue: numericValue,
          ...(parameter.unit ? { unit: parameter.unit } : {}),
          evidenceIds: [evidenceId],
          confidence: confidenceRatio(result.confidence),
          warnings: [],
        });
      }
      continue;
    }

    if (numericValue != null && /groundwater|ground\s*water|watertable|water\s*table|gwl/.test(normalizedName)) {
      const groundwaterDepth = depthFromEvidenceText(parameter.valueText, parameter.context, numericValue);
      if (groundwaterDepth != null) {
        const evidenceId = addReportEvidenceRef(evidenceState, {
          pageNumber: sourcePage,
          rawValue: parameter.valueText,
          normalizedValue: groundwaterDepth,
          unit: parameter.unit,
        });
        const observation: ReportGroundModelGroundwater = {
          ...(boreholeId ? { boreholeId } : {}),
          depth: groundwaterDepth,
          evidenceIds: [evidenceId],
          confidence: confidenceRatio(result.confidence),
          warnings: [],
        };
        groundwater.push(observation);
        if (boreholeId) {
          ensureBorehole(boreholeId, [evidenceId]).groundwater.push(observation);
        }
      }
      continue;
    }

    if (numericValue == null || depth == null || /(?:^|[^a-z])depth|elevation|thickness/.test(normalizedName)) {
      continue;
    }

    const evidenceId = addReportEvidenceRef(evidenceState, {
      pageNumber: sourcePage,
      rawValue: parameter.valueText,
      normalizedValue: numericValue,
      unit: parameter.unit,
    });
    const visualParameter: ReportGroundModelParameter = {
      name: parameter.name,
      value: numericValue,
      ...(parameter.unit ? { unit: parameter.unit } : {}),
      ...(boreholeId ? { boreholeId } : {}),
      depth,
      evidenceIds: [evidenceId],
      confidence: confidenceRatio(result.confidence),
      warnings: [],
    };
    parameters.push(visualParameter);
  }

  for (const candidate of extractReportBoreholeCoordinateCandidates(result)) {
    const location = buildBoreholeLocation({
      boreholeId: candidate.boreholeId,
      source: 'pdf-report',
      description: candidate.rawText,
      crs: candidate.crs,
      easting: candidate.easting,
      northing: candidate.northing,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      raw: { rawCoordinateText: candidate.rawText },
    });
    const hasPlottableCoordinates = Boolean(location?.projected || location?.wgs84);
    if (!location || !hasPlottableCoordinates) {
      continue;
    }
    const locationCrs = location.crs?.code ?? (location.crs?.epsg != null ? `EPSG:${location.crs.epsg}` : location.crs?.name);
    if (!promotedCoordinateSystem) {
      promotedCoordinateSystem = location.projected
        ? {
            kind: 'local-grid',
            ...(locationCrs ? { crs: locationCrs } : {}),
            warnings: locationCrs
              ? ['PDF report coordinate evidence requires source-page verification before design or GIS overlay use.']
              : ['Projected borehole coordinates were extracted from report text without an explicit CRS.'],
          }
        : {
            kind: 'geographic',
            crs: locationCrs ?? 'EPSG:4326',
            warnings: ['Geographic borehole coordinates were extracted from report text; verify against the source PDF before design use.'],
          };
    }
    const evidenceId = addReportEvidenceRef(evidenceState, {
      pageNumber: candidate.pageNumber,
      rawValue: candidate.rawText,
      normalizedValue: location.projected
        ? `E ${location.projected.easting}, N ${location.projected.northing}`
        : location.wgs84
          ? `${location.wgs84.latitude}, ${location.wgs84.longitude}`
          : null,
      warnings: location.crs?.kind === 'unknown' ? ['Coordinate CRS is unknown.'] : [],
    });
    const borehole = ensureBorehole(candidate.boreholeId, [evidenceId]);
    borehole.coordinates = {
      ...(location.projected
        ? {
            easting: location.projected.easting,
            northing: location.projected.northing,
          }
        : {}),
      ...(location.wgs84
        ? {
            latitude: location.wgs84.latitude,
            longitude: location.wgs84.longitude,
          }
        : {}),
      evidenceIds: [evidenceId],
      confidence: confidenceRatio(result.confidence),
    };
    borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, evidenceId]);
  }

  const boreholeList = [...boreholes.values()].sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  const sptTestCount = boreholeList.reduce((count, borehole) => count + borehole.sptTests.length, 0);
  if (strata.length === 0 && groundwater.length === 0 && parameters.length === 0 && sptTestCount === 0) {
    return undefined;
  }
  const labTests = parameters
    .filter((parameter) => parameter.depth != null)
    .map((parameter, index) => ({
      sampleId: `report-sample-${index + 1}`,
      ...(parameter.boreholeId ? { boreholeId: parameter.boreholeId } : {}),
      depth: parameter.depth,
      parameters: [parameter],
      evidenceIds: parameter.evidenceIds,
      confidence: parameter.confidence,
      warnings: parameter.warnings,
    }));

  const model: GroundModel = {
    schemaVersion: 'ground-model.v1',
    generatedAt: result.generatedAt,
    project: {
      rootPath: result.source.filePath ?? result.source.fileName ?? sourceLabel,
    },
    coordinateSystem: promotedCoordinateSystem ?? coordinateSystemFromReportBoreholes(boreholeList),
    boreholes: boreholeList,
    strata,
    groundwater,
    labTests,
    parameters,
    monitoringSeries: [],
    evidence: evidenceState.refs,
    rejectedObservations: [],
    warnings: ['GroundModel visual review was adapted from PDF report evidence; source-page verification is required before design use.'],
    stats: {
      boreholes: boreholeList.length,
      sptTests: sptTestCount,
      strata: strata.length,
      groundwaterObservations: groundwater.length,
      labTests: labTests.length,
      parameters: parameters.length,
      monitoringSeries: 0,
      evidenceRefs: evidenceState.refs.length,
      rejectedObservations: 0,
    },
  };

  return {
    ...model,
    map: buildGroundModelMap(model),
  };
}

interface BoreholeGroundModelEvidenceState {
  refs: EvidenceRef[];
  counter: number;
  sourcePath: string;
  result: BoreholeDocumentIngestResult;
}

function evidenceMethodForBoreholePage(result: BoreholeDocumentIngestResult, pageNumber?: number): EvidenceMethod {
  const audit = pageNumber != null
    ? result.pageAudits.find((candidate) => candidate.pageNumber === pageNumber)
    : result.pageAudits[0];
  if (!audit) {
    return result.source.inputKind === 'image' ? 'vision' : 'manual';
  }
  switch (audit.textHintSource) {
    case 'native-text':
    case 'pdfjs-text':
      return 'pdf-text';
    case 'none':
      return 'manual';
    default:
      return 'vision';
  }
}

function addBoreholeEvidenceRef(
  state: BoreholeGroundModelEvidenceState,
  input: {
    pageNumber?: number | null;
    rawValue?: string | number | boolean | null;
    normalizedValue?: string | number | boolean | null;
    unit?: string | null;
    warnings?: string[];
  },
): string {
  state.counter += 1;
  const id = `bh-ev-${String(state.counter).padStart(5, '0')}`;
  const pageNumber = input.pageNumber ?? undefined;
  const hasAudit = pageNumber == null
    || state.result.pageAudits.some((candidate) => candidate.pageNumber === pageNumber);
  const warnings = [
    ...(input.warnings ?? []),
    ...(!hasAudit ? [`Source page ${pageNumber} was not present in retained borehole page audit; verify against the source log.`] : []),
  ];
  state.refs.push({
    id,
    sourceType: state.result.source.inputKind === 'image' ? 'image-region' : 'pdf-page',
    sourcePath: state.sourcePath,
    location: {
      filePath: state.sourcePath,
      ...(pageNumber != null ? { pageNumber } : {}),
    },
    method: evidenceMethodForBoreholePage(state.result, pageNumber),
    confidence: confidenceRatio(state.result.confidence),
    rawValue: input.rawValue,
    normalizedValue: input.normalizedValue,
    ...(input.unit ? { unit: input.unit } : {}),
    warnings,
  });
  return id;
}

function boreholeCoordinateSystem(result: BoreholeDocumentIngestResult): GroundModel['coordinateSystem'] {
  const locations = result.boreholes.map((borehole) => borehole.location).filter(Boolean);
  const projected = locations.find((location) => location?.projected);
  const geographic = locations.find((location) => location?.wgs84);
  const crs = locations.map((location) => location?.crs).find(Boolean);
  const code = crs?.code ?? (crs?.epsg != null ? `EPSG:${crs.epsg}` : crs?.name);
  if (projected) {
    return {
      kind: 'local-grid',
      ...(code ? { crs: code } : {}),
      warnings: code ? [] : ['Projected borehole coordinates were extracted without an explicit CRS.'],
    };
  }
  if (geographic) {
    return {
      kind: 'geographic',
      crs: code ?? 'EPSG:4326',
      warnings: code ? [] : ['Geographic borehole coordinates were extracted without an explicit CRS; EPSG:4326 display is assumed for review.'],
    };
  }
  return {
    kind: 'unknown',
    warnings: ['Borehole log evidence did not include plottable coordinate data.'],
  };
}

function midpointDepth(depthFrom: number, depthTo: number): number {
  return Number(((depthFrom + depthTo) / 2).toFixed(2));
}

function buildGroundModelFromBoreholeIngest(
  result: BoreholeDocumentIngestResult,
  sourceLabel: string,
): GroundModel | undefined {
  if (result.boreholes.length === 0) {
    return undefined;
  }
  const sourcePath = result.source.fileName ?? result.source.filePath ?? sourceLabel;
  const evidenceState: BoreholeGroundModelEvidenceState = {
    refs: [],
    counter: 0,
    sourcePath,
    result,
  };
  const strata: ReportGroundModelStratum[] = [];
  const groundwater: ReportGroundModelGroundwater[] = [];
  const parameters: ReportGroundModelParameter[] = [];
  const adapterWarnings: string[] = [];

  const boreholes: ReportGroundModelBorehole[] = result.boreholes.map((sourceBorehole) => {
    const boreholeId = normalizeBoreholeId(sourceBorehole.boreholeId);
    const pageNumber = sourceBorehole.pageNumber ?? undefined;
    const headerEvidenceId = addBoreholeEvidenceRef(evidenceState, {
      pageNumber,
      rawValue: sourceBorehole.boreholeId,
      normalizedValue: boreholeId,
      warnings: sourceBorehole.warnings,
    });
    const coordinateEvidenceIds: string[] = [];
    const coordinate = sourceBorehole.location
      ? (() => {
          const rawCoordinateText = sourceBorehole.location?.raw?.rawCoordinateText
            ?? sourceBorehole.location?.raw?.coordinates
            ?? sourceBorehole.location?.description
            ?? sourceBorehole.location?.source
            ?? null;
          const evidenceId = addBoreholeEvidenceRef(evidenceState, {
            pageNumber,
            rawValue: typeof rawCoordinateText === 'string' || typeof rawCoordinateText === 'number' ? rawCoordinateText : null,
            normalizedValue: sourceBorehole.location?.projected
              ? `E ${sourceBorehole.location.projected.easting}, N ${sourceBorehole.location.projected.northing}`
              : sourceBorehole.location?.wgs84
                ? `${sourceBorehole.location.wgs84.latitude}, ${sourceBorehole.location.wgs84.longitude}`
                : null,
            warnings: sourceBorehole.location?.crs?.kind === 'unknown' ? ['Coordinate CRS is unknown.'] : [],
          });
          coordinateEvidenceIds.push(evidenceId);
          return {
            ...(sourceBorehole.location?.projected
              ? {
                  easting: sourceBorehole.location.projected.easting,
                  northing: sourceBorehole.location.projected.northing,
                }
              : {}),
            ...(sourceBorehole.location?.wgs84
              ? {
                  latitude: sourceBorehole.location.wgs84.latitude,
                  longitude: sourceBorehole.location.wgs84.longitude,
                }
              : {}),
            evidenceIds: [evidenceId],
            confidence: confidenceRatio(sourceBorehole.confidence),
          };
        })()
      : undefined;

    const borehole: ReportGroundModelBorehole = {
      id: boreholeId,
      ...(coordinate ? { coordinates: coordinate } : {}),
      sptTests: [],
      strata: [],
      groundwater: [],
      evidenceIds: uniqueStrings([headerEvidenceId, ...coordinateEvidenceIds]),
      confidence: confidenceRatio(sourceBorehole.confidence),
      warnings: sourceBorehole.warnings,
    };

    for (const [layerIndex, layer] of sourceBorehole.layers.entries()) {
      const depthFrom = layer.depthFrom ?? (layerIndex === 0 ? 0 : null);
      const depthTo = layer.depthTo ?? sourceBorehole.totalDepth;
      if (depthFrom == null || depthTo == null || depthTo <= depthFrom) {
        adapterWarnings.push(`Skipped invalid layer interval for ${boreholeId}; verify source log depths.`);
        continue;
      }
      const layerWarnings = layer.depthFrom == null || layer.depthTo == null
        ? ['Layer boundary inferred from borehole log context.']
        : [];
      const stratumEvidenceId = addBoreholeEvidenceRef(evidenceState, {
        pageNumber,
        rawValue: layer.description,
        normalizedValue: `${depthFrom}-${depthTo}m ${layer.description ?? ''}`.trim(),
        warnings: layerWarnings,
      });
      const stratum: ReportGroundModelStratum = {
        boreholeId,
        topDepth: depthFrom,
        bottomDepth: depthTo,
        description: displayTableText(layer.description, 160) || layer.uscsSymbol || `Layer ${layerIndex + 1}`,
        evidenceIds: [stratumEvidenceId],
        confidence: confidenceRatio(sourceBorehole.confidence),
        warnings: layerWarnings,
      };
      strata.push(stratum);
      borehole.strata.push(stratum);
      borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, stratumEvidenceId]);

      if (layer.sptN != null && Number.isFinite(layer.sptN) && layer.sptN >= 0 && layer.sptN <= 100) {
        const inferredDepth = midpointDepth(depthFrom, depthTo);
        const warnings = ['SPT depth inferred from host layer interval; verify against source log.'];
        const evidenceId = addBoreholeEvidenceRef(evidenceState, {
          pageNumber,
          rawValue: layer.sptN,
          normalizedValue: layer.sptN,
          unit: 'blows/300mm',
          warnings,
        });
        borehole.sptTests.push({
          depth: inferredDepth,
          nValue: layer.sptN,
          unit: 'blows/300mm',
          evidenceIds: [evidenceId],
          confidence: confidenceRatio(sourceBorehole.confidence),
          warnings,
        });
        borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, evidenceId]);
        adapterWarnings.push(`SPT depth for ${boreholeId} was inferred from layer ${depthFrom}-${depthTo} m.`);
      }

      if (layer.waterContent != null && Number.isFinite(layer.waterContent)) {
        const depth = midpointDepth(depthFrom, depthTo);
        const evidenceId = addBoreholeEvidenceRef(evidenceState, {
          pageNumber,
          rawValue: layer.waterContent,
          normalizedValue: layer.waterContent,
          unit: '%',
        });
        parameters.push({
          name: 'waterContent',
          value: layer.waterContent,
          unit: '%',
          boreholeId,
          depth,
          evidenceIds: [evidenceId],
          confidence: confidenceRatio(sourceBorehole.confidence),
          warnings: [],
        });
        borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, evidenceId]);
      }
    }

    if (sourceBorehole.waterTableDepth != null && Number.isFinite(sourceBorehole.waterTableDepth)) {
      const evidenceId = addBoreholeEvidenceRef(evidenceState, {
        pageNumber,
        rawValue: sourceBorehole.waterTableDepth,
        normalizedValue: sourceBorehole.waterTableDepth,
        unit: 'm bgl',
        warnings: [],
      });
      const observation: ReportGroundModelGroundwater = {
        boreholeId,
        depth: sourceBorehole.waterTableDepth,
        evidenceIds: [evidenceId],
        confidence: confidenceRatio(sourceBorehole.confidence),
        warnings: [],
      };
      groundwater.push(observation);
      borehole.groundwater.push(observation);
      borehole.evidenceIds = uniqueStrings([...borehole.evidenceIds, evidenceId]);
    }

    return borehole;
  }).sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));

  const sptTestCount = boreholes.reduce((count, borehole) => count + borehole.sptTests.length, 0);
  const labTests = parameters
    .filter((parameter) => parameter.depth != null)
    .map((parameter, index) => ({
      sampleId: `borehole-sample-${index + 1}`,
      ...(parameter.boreholeId ? { boreholeId: parameter.boreholeId } : {}),
      depth: parameter.depth,
      parameters: [parameter],
      evidenceIds: parameter.evidenceIds,
      confidence: parameter.confidence,
      warnings: parameter.warnings,
    }));
  const coordinateSystem = boreholeCoordinateSystem(result);
  const model: GroundModel = {
    schemaVersion: 'ground-model.v1',
    generatedAt: result.generatedAt,
    project: {
      rootPath: result.source.filePath ?? result.source.fileName ?? sourceLabel,
    },
    coordinateSystem,
    boreholes,
    strata,
    groundwater,
    labTests,
    parameters,
    monitoringSeries: [],
    evidence: evidenceState.refs,
    rejectedObservations: [],
    warnings: uniqueStrings([
      ...result.warnings,
      ...coordinateSystem.warnings,
      ...adapterWarnings,
      'GroundModel visual review was adapted from borehole-log ingest evidence; source-page verification is required before design use.',
    ]),
    stats: {
      boreholes: boreholes.length,
      sptTests: sptTestCount,
      strata: strata.length,
      groundwaterObservations: groundwater.length,
      labTests: labTests.length,
      parameters: parameters.length,
      monitoringSeries: 0,
      evidenceRefs: evidenceState.refs.length,
      rejectedObservations: 0,
    },
  };

  return {
    ...model,
    map: buildGroundModelMap(model),
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

  const notes = ['Layer blocks are scaled to extracted depth intervals. Missing boundaries are shown as uncertain.'];
  const continuityRepairCount = result.reviewFindings.filter(
    (finding) => finding.code === 'continuity_repair_applied',
  ).length;
  const continuityFlagCount = result.reviewFindings.filter(
    (finding) => finding.code === 'continuity_unrepairable',
  ).length;
  if (continuityRepairCount > 0 || continuityFlagCount > 0) {
    const parts: string[] = [];
    if (continuityRepairCount > 0) {
      parts.push(`${continuityRepairCount} page-break continuity repair(s) applied`);
    }
    if (continuityFlagCount > 0) {
      parts.push(`${continuityFlagCount} unresolved continuity issue(s) flagged for review`);
    }
    notes.push(`Depth continuity: ${parts.join('; ')}. See findings for detail.`);
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
            materialKey: materialKey(layer.description, layer.uscsSymbol),
            sourcePages: borehole.pageNumber != null ? [borehole.pageNumber] : [],
            tone: materialTone(layer.description, layer.uscsSymbol),
            uncertain: layer.depthFrom == null || layer.depthTo == null,
          };
        })
        .filter((layer): layer is IngestDossierBoreholeProfileLayer => layer != null),
    })),
    notes,
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

type IngestPageAuditWithLayout = Pick<GeotechDocumentPageAudit | BoreholeIngestPageAudit, 'layoutPages'>;

function normalizedLayoutMatchText(value: string | number | boolean | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function evidenceMatchCandidates(ref: EvidenceRef): string[] {
  return uniqueStrings([
    typeof ref.normalizedValue === 'string' || typeof ref.normalizedValue === 'number'
      ? String(ref.normalizedValue)
      : null,
    typeof ref.rawValue === 'string' || typeof ref.rawValue === 'number'
      ? String(ref.rawValue)
      : null,
  ])
    .map(normalizedLayoutMatchText)
    .filter((value) => value.length >= 6);
}

function layoutElementMatchesCandidate(element: GlmOcrLayoutElement, candidate: string): boolean {
  return normalizedLayoutMatchText(element.content).includes(candidate);
}

function buildLayoutEvidenceLinks(
  pages: GlmOcrLayoutPage[],
  evidenceRefs: EvidenceRef[],
): IntegratedReviewSourceRegionLink[] {
  const links: IntegratedReviewSourceRegionLink[] = [];
  const assignedElements = new Set<string>();
  for (const ref of evidenceRefs) {
    const pageNumber = ref.location.pageNumber;
    if (pageNumber == null || !Number.isInteger(pageNumber) || pageNumber <= 0) {
      continue;
    }
    const candidates = evidenceMatchCandidates(ref);
    if (candidates.length === 0) {
      continue;
    }
    const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
    if (!page) {
      continue;
    }
    for (const candidate of candidates) {
      const matches = page.elements
        .map((element, elementOrdinal) => ({ element, elementOrdinal }))
        .filter(({ element }) => element.bbox2d && layoutElementMatchesCandidate(element, candidate));
      if (matches.length !== 1) {
        continue;
      }
      const match = matches[0]!;
      const key = `${pageNumber}:${match.elementOrdinal}`;
      if (assignedElements.has(key)) {
        continue;
      }
      assignedElements.add(key);
      links.push({
        pageNumber,
        evidenceId: ref.id,
        elementOrdinal: match.elementOrdinal,
        contentIncludes: candidate,
        confidence: ref.confidence,
        method: 'glm-ocr-layout',
        status: ref.warnings.length > 0 ? 'review_recommended' : 'accepted',
      });
      break;
    }
  }
  return links;
}

function buildIntegratedSourcePagesFromPageAudits(
  audits: IngestPageAuditWithLayout[],
  sourcePath: string,
  evidenceRefs: EvidenceRef[] = [],
): IntegratedReviewSourcePage[] {
  const layoutPages = audits.flatMap((audit) => audit.layoutPages ?? []);
  if (layoutPages.length === 0) {
    return [];
  }
  return buildIntegratedSourcePagesFromLayout(layoutPages, {
    sourcePath,
    links: buildLayoutEvidenceLinks(layoutPages, evidenceRefs),
  });
}

export function buildIngestDossier(
  result: IngestDossierSourceResult,
  options?: BuildIngestDossierOptions,
): IngestDossier {
  const sourceLabel = sourceLabelFromResult(result, options?.sourceLabel);
  const storedReview = options?.storedReview ?? undefined;
  const approval = options?.approval ?? undefined;
  const agentReviews = options?.agentReviews;
  const explicitSourcePages = options?.sourcePages;

  if (result.documentType === 'geotech-document') {
    const geotechResult = result as GeotechDocumentIngestResult;
    const title = deriveGeotechDisplayTitle(geotechResult);
    const cleanSummary = cleanNarrativeText(geotechResult.summary, 320);
    const summary =
      cleanSummary
      || geotechOutcomeSummary(geotechResult);
    const boreholeProfile = buildGeotechBoreholeProfile(geotechResult);
    const groundModel = buildGroundModelFromGeotechReport(geotechResult, boreholeProfile, sourceLabel);
    const femDraftCandidates = buildFemDraftCandidatesSafe(groundModel);
    const sourcePages = explicitSourcePages
      ?? buildIntegratedSourcePagesFromPageAudits(geotechResult.pageAudits, sourceLabel, groundModel?.evidence ?? []);

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
      tables: buildGeotechTables(geotechResult, femDraftCandidates),
      pageCards: buildGeotechPageCards(geotechResult),
      sections: buildGeotechSections(geotechResult),
      executiveItems: buildGeotechExecutiveItems(geotechResult, sourceLabel),
      insightCards: buildGeotechInsightCards(geotechResult),
      trustItems: buildGeotechTrustItems(geotechResult),
      confidenceBreakdown: buildGeotechConfidenceItems(geotechResult),
      boreholeProfile,
      groundModel,
      femDraftCandidates,
      agentReviews,
      sourcePages,
      storedReview,
      approval,
      footerNotes: buildFooterNotes(geotechResult),
    };
  }

  const boreholeResult = result as BoreholeDocumentIngestResult;
  const boreholeProfile = buildBoreholeProfile(boreholeResult);
  const groundModel = buildGroundModelFromBoreholeIngest(boreholeResult, sourceLabel);
  const femDraftCandidates = buildFemDraftCandidatesSafe(groundModel);
  const sourcePages = explicitSourcePages
    ?? buildIntegratedSourcePagesFromPageAudits(boreholeResult.pageAudits, sourceLabel, groundModel?.evidence ?? []);
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
    tables: buildBoreholeTables(boreholeResult, femDraftCandidates),
    pageCards: buildBoreholePageCards(boreholeResult),
    sections: buildBoreholeSections(boreholeResult),
    executiveItems: buildBoreholeExecutiveItems(boreholeResult, sourceLabel),
    insightCards: buildBoreholeInsightCards(boreholeResult),
    trustItems: buildBoreholeTrustItems(boreholeResult),
    boreholeProfile,
    groundModel,
    femDraftCandidates,
    agentReviews,
    sourcePages,
    storedReview,
    approval,
    footerNotes: buildFooterNotes(boreholeResult),
  };
}

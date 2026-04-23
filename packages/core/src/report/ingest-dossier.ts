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

  if (result.source.segmentation?.mode === 'segmented-parent' && result.source.segmentation.segments?.length) {
    tables.push({
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

  tables.push({
    title: 'Material observations',
    columns: ['Kind', 'Description', 'USCS', 'Lithology'],
    rows: result.materials.map((material) => [
      material.kind,
      material.description,
      material.uscsSymbol ?? '-',
      material.lithology ?? '-',
    ]),
    emptyState: 'No material observations were extracted.',
  });

  tables.push({
    title: 'Classifications',
    columns: ['System', 'Value', 'Context'],
    rows: result.classifications.map((classification) => [
      classification.system,
      classification.value,
      classification.context ?? '-',
    ]),
    emptyState: 'No formal classification systems were extracted.',
  });

  tables.push({
    title: 'Engineering parameters',
    columns: ['Parameter', 'Value', 'Unit', 'Material', 'Context'],
    rows: result.parameters.map((parameter) => [
      parameter.name,
      parameter.valueText,
      parameter.unit ?? '-',
      parameter.material ?? '-',
      parameter.context ?? '-',
    ]),
    emptyState: 'No explicit engineering parameters were extracted.',
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
        chunk.scope,
        chunk.significance != null ? String(chunk.significance) : '-',
        chunk.headingAncestry[0] ?? '-',
      ]),
    });
  }

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
    const highlights = uniqueStrings([
      chunk?.text ? truncate(chunk.text, 220) : undefined,
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

  sections.push({
    title: 'Executive summary',
    paragraphs: uniqueStrings([
      result.summary,
      result.documentClass ? `Document class: ${result.documentClass}.` : null,
      `Pages processed: ${result.source.successfulPages}/${result.source.totalPages}. Confidence: ${result.confidence}%.`,
      'Workflow confidence and approval support review triage only; they do not replace engineering judgement, design checks, or source-page verification.',
    ]),
  });

  if (result.risks.length > 0) {
    sections.push({
      title: 'Risks',
      paragraphs: result.risks,
    });
  }

  if (result.recommendations.length > 0) {
    sections.push({
      title: 'Recommendations',
      paragraphs: result.recommendations,
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
  return [
    { label: 'Pages processed', value: `${result.source.successfulPages}/${result.source.totalPages}`, tone: result.source.failedPages > 0 ? 'warning' : 'good' },
    { label: 'Confidence', value: `${result.confidence}%`, tone: toneFromParseStatus(result.parseStatus ?? 'parsed', result.confidence) },
    { label: 'Materials', value: String(result.materials.length), detail: `${result.classifications.length} classifications`, tone: result.materials.length > 0 ? 'good' : 'warning' },
    { label: 'Parameters', value: String(result.parameters.length), detail: result.documentClass ?? 'No document class', tone: result.parameters.length > 0 ? 'good' : 'warning' },
    { label: 'Review required', value: result.reviewRequired ? 'Yes' : 'No', tone: toneFromBoolean(result.reviewRequired, true) },
    { label: 'Auto proceed', value: result.canAutoProceed ? 'Yes' : 'No', tone: toneFromBoolean(result.canAutoProceed) },
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
    const summary =
      geotechResult.summary
      ?? `Geotechnical document ingest completed with ${geotechResult.materials.length} material observation(s) and ${geotechResult.parameters.length} parameter(s).`;

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

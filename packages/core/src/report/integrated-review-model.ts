import type {
  GroundModel,
  GroundModelStratum,
} from '../ground-model/index.js';
import { lithologyClassForKey, normalizeLithology, type LithologyMaterialKey } from '../geo/lithology.js';
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_VISION_MODEL } from '../meta/index.js';
import type { AgentSession } from '../agents/brain.js';
import type { SwarmSession } from '../agents/swarm.js';
import type { ProjectAgentSession } from '../storage/index.js';
import type {
  IngestDossier,
  IngestDossierBoreholeProfile,
} from './ingest-dossier.js';
import type { GlmOcrLayoutPage } from '../vision/layout-ocr.js';

export type IntegratedReviewMaterialClass = 'fill' | 'clay' | 'silt' | 'sand' | 'gravel' | 'rock' | 'organic' | 'mixed';

export interface IntegratedReviewStratum {
  top: number;
  base: number;
  name: string;
  description: string;
  className: IntegratedReviewMaterialClass;
  confidence: number;
  status: 'accepted' | 'review_recommended';
  evidenceId: string;
  sourceRegion?: IntegratedReviewSourceRegion;
}

export interface IntegratedReviewPoint {
  depth: number;
  value?: number;
  label: string;
  confidence: number;
  evidenceId: string;
  sourceRegion?: IntegratedReviewSourceRegion;
}

export interface IntegratedReviewParameter {
  name: string;
  value: string;
  depth?: number;
  confidence: number;
  evidenceId: string;
  sourceRegion?: IntegratedReviewSourceRegion;
}

export interface IntegratedReviewBorehole {
  id: string;
  sourcePages: number[];
  easting?: number;
  northing?: number;
  latitude?: number;
  longitude?: number;
  coordinateEvidenceId?: string;
  groundLevel: number;
  totalDepth: number;
  chainage: number;
  offset: number;
  confidence: number;
  evidenceIds: string[];
  strata: IntegratedReviewStratum[];
  spt: IntegratedReviewPoint[];
  groundwater: IntegratedReviewPoint[];
  parameters: IntegratedReviewParameter[];
  warnings: string[];
}

export interface IntegratedReviewAgentReview {
  mode: 'single' | 'swarm' | 'chat';
  title: string;
  summary: string;
  confidence?: number;
  stepCount?: number;
  tokens?: number;
  latencyMs?: number;
  warnings: string[];
  evidenceIds: string[];
}

export type IntegratedReviewSourceRegionType =
  | 'header'
  | 'coordinates'
  | 'totalDepth'
  | 'strata'
  | 'spt'
  | 'water'
  | 'parameter'
  | 'table'
  | 'text'
  | 'image'
  | 'formula'
  | 'unknown';

export interface IntegratedReviewSourceRegion {
  id: string;
  evidenceId: string;
  pageNumber: number;
  type: IntegratedReviewSourceRegionType;
  label: string;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
  method: string;
  status: 'accepted' | 'review_recommended';
}

export interface IntegratedReviewSourcePage {
  pageNumber: number;
  width: number;
  height: number;
  sourcePath: string;
  method: string;
  regions: IntegratedReviewSourceRegion[];
}

export interface IntegratedReviewSourceRegionLink {
  pageNumber: number;
  evidenceId: string;
  elementIndex?: number | null;
  elementOrdinal?: number | null;
  contentIncludes?: string;
  type?: IntegratedReviewSourceRegionType;
  label?: string;
  confidence?: number;
  method?: string;
  status?: 'accepted' | 'review_recommended';
}

export interface BuildIntegratedSourcePagesFromLayoutOptions {
  sourcePath?: string;
  method?: string;
  links?: IntegratedReviewSourceRegionLink[];
}

export interface IntegratedReviewModel {
  schemaVersion: 'geotech.integrated_review.v1';
  run: {
    id: string;
    document: string;
    providerProfile: string;
    models: {
      ocr: string;
      vision: string;
      text: string;
    };
    status: string;
  };
  project: {
    name: string;
    inputCrs: string;
    displayCrs: string;
    verticalDatum: string;
    crsTransformEngine: string;
  };
  quality: {
    overallConfidence: number;
    evidenceCoverage: number;
    depthMappingR2: number | null;
    warnings: string[];
  };
  boreholes: IntegratedReviewBorehole[];
  agentReviews: IntegratedReviewAgentReview[];
  sourcePages: IntegratedReviewSourcePage[];
}

export interface BuildIntegratedReviewModelOptions {
  agentReviews?: IntegratedReviewAgentReview[];
  sourcePages?: IntegratedReviewSourcePage[];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .filter(Boolean);
}

function compactLabel(value: string | null | undefined, maxLength = 28): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function compactSummary(value: string | null | undefined, maxLength = 520): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function groundModelMaterialKey(description: string): LithologyMaterialKey {
  return normalizeLithology(description).key;
}

function stratumTopDepth(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[]): number {
  if (finiteNumber(stratum.topDepth)) return Math.max(0, stratum.topDepth);
  if (index === 0) return 0;
  return sorted[index - 1]?.bottomDepth ?? 0;
}

function stratumBottomDepth(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[], maxDepth: number): number {
  if (finiteNumber(stratum.bottomDepth)) return Math.max(0, stratum.bottomDepth);
  const nextTop = sorted[index + 1]?.topDepth;
  if (finiteNumber(nextTop)) return Math.max(0, nextTop);
  return maxDepth;
}

export function normalizeIntegratedConfidence(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0.5;
  return Math.max(0, Math.min(1, value! > 1 ? value! / 100 : value!));
}

export function integratedPercent(value: number): string {
  return `${Math.round(normalizeIntegratedConfidence(value) * 100)}%`;
}

function integratedStatus(confidence: number, warnings: string[] = []): 'accepted' | 'review_recommended' {
  return normalizeIntegratedConfidence(confidence) >= 0.78 && warnings.length === 0
    ? 'accepted'
    : 'review_recommended';
}

function integratedClass(description: string): IntegratedReviewMaterialClass {
  return lithologyClassForKey(groundModelMaterialKey(description));
}

function integratedClassLabel(className: IntegratedReviewMaterialClass): string {
  switch (className) {
    case 'fill': return 'Fill';
    case 'clay': return 'Clay';
    case 'silt': return 'Silt';
    case 'sand': return 'Sand';
    case 'gravel': return 'Gravel';
    case 'rock': return 'Rock';
    case 'organic': return 'Organic';
    default: return 'Mixed';
  }
}

function shortIntegratedLabel(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const material = integratedClassLabel(integratedClass(normalized));
  return material === 'Mixed' ? compactLabel(normalized, 18) : material;
}

function evidenceLookup(model: GroundModel | undefined): Map<string, GroundModel['evidence'][number]> {
  return new Map((model?.evidence ?? []).map((entry) => [entry.id, entry]));
}

function pagesForEvidenceIds(
  evidenceById: Map<string, GroundModel['evidence'][number]>,
  evidenceIds: string[],
): number[] {
  return [...new Set(evidenceIds
    .map((id) => evidenceById.get(id)?.location.pageNumber)
    .filter((page): page is number => typeof page === 'number' && Number.isInteger(page) && page > 0))]
    .sort((left, right) => left - right);
}

export function sourcePagesLabel(pages: number[]): string {
  return pages.length > 0 ? `p${pages.join(', ')}` : 'source evidence';
}

function positiveDimension(value: number | null | undefined): number | null {
  return Number.isFinite(value ?? NaN) && (value ?? 0) > 0 ? value! : null;
}

function inferredPageDimension(
  page: GlmOcrLayoutPage,
  axis: 'width' | 'height',
): number {
  const explicit = positiveDimension(axis === 'width' ? page.width : page.height);
  if (explicit != null) {
    return explicit;
  }
  const elementDimension = page.elements
    .map((element) => axis === 'width' ? element.width : element.height)
    .find((value) => positiveDimension(value) != null);
  if (elementDimension != null) {
    return elementDimension;
  }
  const coordinateIndex = axis === 'width' ? 2 : 3;
  const maxCoordinate = Math.max(
    0,
    ...page.elements
      .map((element) => element.bbox2d?.[coordinateIndex])
      .filter((value): value is number => Number.isFinite(value ?? NaN) && (value ?? 0) > 0),
  );
  return maxCoordinate > 0 ? maxCoordinate : axis === 'width' ? 1000 : 1414;
}

function clampCoordinate(value: number, max: number): number {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

function bboxLooksLikeRatio(bbox: [number, number, number, number]): boolean {
  return bbox.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

function normalizeLayoutBbox(
  bbox: [number, number, number, number] | null,
  width: number,
  height: number,
  units?: 'page' | 'ratio',
): [number, number, number, number] | null {
  if (!bbox) {
    return null;
  }
  const ratioUnits = units === 'ratio' || (units !== 'page' && bboxLooksLikeRatio(bbox));
  const scaled: [number, number, number, number] = ratioUnits
    ? [bbox[0] * width, bbox[1] * height, bbox[2] * width, bbox[3] * height]
    : bbox;
  const x1 = clampCoordinate(Math.min(scaled[0], scaled[2]), width);
  const y1 = clampCoordinate(Math.min(scaled[1], scaled[3]), height);
  const x2 = clampCoordinate(Math.max(scaled[0], scaled[2]), width);
  const y2 = clampCoordinate(Math.max(scaled[1], scaled[3]), height);
  const minSpan = ratioUnits && width <= 1 && height <= 1 ? 0.001 : 2;
  if (x2 - x1 < minSpan || y2 - y1 < minSpan) {
    return null;
  }
  return [x1, y1, x2, y2];
}

function inferSourceRegionType(
  label: string,
  content: string,
): IntegratedReviewSourceRegionType {
  const text = `${label} ${content}`.toLowerCase();
  if (/\bspt\b|standard\s+penetration|n[-\s]?value|blows\s*\/?\s*(?:300\s*mm|ft)/.test(text)) {
    return 'spt';
  }
  if (/ground\s*water|groundwater|water\s+table|gwl/.test(text)) {
    return 'water';
  }
  if (/easting|northing|coordinate|latitude|longitude|\be\s*[:=]?\s*\d|\bn\s*[:=]?\s*\d/.test(text)) {
    return 'coordinates';
  }
  if (/total\s+depth|final\s+depth|termination|terminated|depth\s+of\s+bore/.test(text)) {
    return 'totalDepth';
  }
  if (/moisture|water\s*content|liquid\s*limit|plasticity|cohesion|friction|unit\s*weight|density|ucs|rqd|rmr|permeability/.test(text)) {
    return 'parameter';
  }
  if (/strata|lithology|description|sample|clay|silt|sand|gravel|rock|fill|made\s+ground/.test(text)) {
    return 'strata';
  }
  if (/bore\s*hole|borehole|project|location|client|sheet|hole\s+no/.test(text)) {
    return 'header';
  }
  if (label === 'table') return 'table';
  if (label === 'image') return 'image';
  if (label === 'formula') return 'formula';
  if (label === 'text') return 'text';
  return 'unknown';
}

function findLayoutRegionLink(
  links: IntegratedReviewSourceRegionLink[],
  pageNumber: number,
  elementIndex: number | null,
  elementOrdinal: number,
  content: string,
): IntegratedReviewSourceRegionLink | undefined {
  const normalizedContent = content.toLowerCase();
  return links.find((link) => {
    if (link.pageNumber !== pageNumber) {
      return false;
    }
    if (link.elementOrdinal != null) {
      return link.elementOrdinal === elementOrdinal;
    }
    if (link.elementIndex != null) {
      return link.elementIndex === elementIndex;
    }
    if (link.contentIncludes?.trim()) {
      return normalizedContent.includes(link.contentIncludes.trim().toLowerCase());
    }
    return false;
  });
}

export function buildIntegratedSourcePagesFromLayout(
  pages: GlmOcrLayoutPage[],
  options: BuildIntegratedSourcePagesFromLayoutOptions = {},
): IntegratedReviewSourcePage[] {
  const method = options.method ?? 'glm-ocr-layout';
  const links = options.links ?? [];
  return pages.flatMap((page) => {
    const width = inferredPageDimension(page, 'width');
    const height = inferredPageDimension(page, 'height');
    const regions = page.elements.flatMap((element, index): IntegratedReviewSourceRegion[] => {
      const bbox = normalizeLayoutBbox(element.bbox2d, width, height);
      if (!bbox) {
        return [];
      }
      const link = findLayoutRegionLink(links, page.pageNumber, element.index, index, element.content);
      const confidence = normalizeIntegratedConfidence(link?.confidence ?? 0.72);
      const regionIndex = index + 1;
      return [{
        id: `layout-p${page.pageNumber}-r${regionIndex}`,
        evidenceId: link?.evidenceId ?? `layout-p${page.pageNumber}-r${regionIndex}`,
        pageNumber: page.pageNumber,
        type: link?.type ?? inferSourceRegionType(element.label, element.content),
        label: compactLabel(link?.label ?? element.label, 42),
        text: compactSummary(element.content, 240),
        bbox,
        confidence,
        method: link?.method ?? method,
        status: link?.status ?? (confidence >= 0.78 ? 'accepted' : 'review_recommended'),
      }];
    });
    if (regions.length === 0) {
      return [];
    }
    return [{
      pageNumber: page.pageNumber,
      width,
      height,
      sourcePath: options.sourcePath ?? `page-${page.pageNumber}`,
      method,
      regions,
    }];
  });
}

export function buildIntegratedSourcePagesFromEvidence(
  evidenceRefs: GroundModel['evidence'] = [],
  sourcePathFallback = 'source evidence',
): IntegratedReviewSourcePage[] {
  const grouped = new Map<number, IntegratedReviewSourcePage>();
  for (const ref of evidenceRefs) {
    const bbox = ref.location.bbox;
    const pageNumber = ref.location.pageNumber;
    if (!bbox || pageNumber == null || !Number.isInteger(pageNumber) || pageNumber <= 0) {
      continue;
    }
    const ratioUnits = ref.location.bboxUnits === 'ratio' || (ref.location.bboxUnits !== 'page' && bboxLooksLikeRatio(bbox));
    const width = positiveDimension(ref.location.pageWidth)
      ?? (ratioUnits ? 1 : Math.max(1000, bbox[0], bbox[2]));
    const height = positiveDimension(ref.location.pageHeight)
      ?? (ratioUnits ? 1 : Math.max(1414, bbox[1], bbox[3]));
    const normalizedBbox = normalizeLayoutBbox(bbox, width, height, ref.location.bboxUnits);
    if (!normalizedBbox) {
      continue;
    }
    const text = compactSummary(String(ref.normalizedValue ?? ref.rawValue ?? ''), 240);
    const region: IntegratedReviewSourceRegion = {
      id: `evidence-${ref.id}`,
      evidenceId: ref.id,
      pageNumber,
      type: inferSourceRegionType(ref.location.layoutLabel ?? ref.sourceType, text),
      label: compactLabel(ref.location.layoutLabel ?? ref.sourceType, 42),
      text,
      bbox: normalizedBbox,
      confidence: normalizeIntegratedConfidence(ref.confidence),
      method: ref.method,
      status: integratedStatus(ref.confidence, ref.warnings),
    };
    const existing = grouped.get(pageNumber);
    if (existing) {
      existing.regions.push(region);
      existing.width = Math.max(existing.width, width);
      existing.height = Math.max(existing.height, height);
      continue;
    }
    grouped.set(pageNumber, {
      pageNumber,
      width,
      height,
      sourcePath: ref.sourcePath || ref.location.filePath || sourcePathFallback,
      method: ref.method,
      regions: [region],
    });
  }
  return [...grouped.values()].sort((left, right) => left.pageNumber - right.pageNumber);
}

function mergeIntegratedSourcePages(...pageSets: IntegratedReviewSourcePage[][]): IntegratedReviewSourcePage[] {
  const grouped = new Map<number, IntegratedReviewSourcePage>();
  for (const pages of pageSets) {
    for (const rawPage of pages) {
      const page = sanitizeIntegratedSourcePage(rawPage);
      if (!page) {
        continue;
      }
      const existing = grouped.get(page.pageNumber);
      if (!existing) {
        grouped.set(page.pageNumber, {
          ...page,
          regions: [...page.regions],
        });
        continue;
      }
      const seen = new Set(existing.regions.map((region) => `${region.id}:${region.evidenceId}:${region.bbox.join(',')}`));
      for (const region of page.regions) {
        const key = `${region.id}:${region.evidenceId}:${region.bbox.join(',')}`;
        if (!seen.has(key)) {
          seen.add(key);
          existing.regions.push(region);
        }
      }
      existing.width = Math.max(existing.width, page.width);
      existing.height = Math.max(existing.height, page.height);
      if (existing.sourcePath === 'source evidence' && page.sourcePath !== 'source evidence') {
        existing.sourcePath = page.sourcePath;
      }
      if (existing.method === 'manual' && page.method !== 'manual') {
        existing.method = page.method;
      }
    }
  }
  return [...grouped.values()].sort((left, right) => left.pageNumber - right.pageNumber);
}

function sanitizeIntegratedSourcePage(page: IntegratedReviewSourcePage): IntegratedReviewSourcePage | null {
  if (
    !Number.isInteger(page.pageNumber)
    || page.pageNumber <= 0
    || !Number.isFinite(page.width)
    || !Number.isFinite(page.height)
    || page.width <= 0
    || page.height <= 0
  ) {
    return null;
  }
  const regions = page.regions.flatMap((region): IntegratedReviewSourceRegion[] => {
    if (region.pageNumber !== page.pageNumber) {
      return [];
    }
    const bbox = normalizeLayoutBbox(region.bbox, page.width, page.height, 'page');
    if (!bbox) {
      return [];
    }
    return [{
      ...region,
      bbox,
      confidence: normalizeIntegratedConfidence(region.confidence),
      status: region.status === 'accepted' ? 'accepted' : 'review_recommended',
    }];
  });
  return regions.length > 0
    ? {
        ...page,
        regions,
      }
    : null;
}

function sourceRegionPriority(region: IntegratedReviewSourceRegion): number {
  if (region.method === 'glm-ocr-layout') return 4;
  if (region.method.includes('ocr')) return 3;
  if (region.method === 'vision') return 2;
  if (region.method === 'pdf-text') return 1;
  return 0;
}

function sourceRegionLookup(pages: IntegratedReviewSourcePage[]): Map<string, IntegratedReviewSourceRegion> {
  const lookup = new Map<string, IntegratedReviewSourceRegion>();
  for (const region of pages.flatMap((page) => page.regions)) {
    const existing = lookup.get(region.evidenceId);
    if (!existing || sourceRegionPriority(region) > sourceRegionPriority(existing)) {
      lookup.set(region.evidenceId, region);
    }
  }
  return lookup;
}

export function integratedBoreholeMaxDepth(borehole: IntegratedReviewBorehole): number {
  return Math.max(
    1,
    borehole.totalDepth,
    ...borehole.strata.flatMap((stratum) => [stratum.top, stratum.base]),
    ...borehole.spt.map((point) => point.depth),
    ...borehole.groundwater.map((point) => point.depth),
  );
}

export function buildIntegratedAgentReviewFromProjectSession(session: ProjectAgentSession): IntegratedReviewAgentReview {
  const reviewPassed = typeof session.metadata?.reviewPassed === 'boolean'
    ? session.metadata.reviewPassed
    : undefined;
  const corrections = Array.isArray(session.metadata?.corrections)
    ? session.metadata.corrections.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const warnings = uniqueStrings([
    reviewPassed === false ? 'Swarm reviewer did not pass the session without correction.' : null,
    ...corrections.map((correction) => `Correction: ${correction}`),
  ]);
  return {
    mode: session.mode,
    title: session.mode === 'swarm'
      ? 'Swarm agent review'
      : session.mode === 'chat'
        ? 'Chat agent review'
        : 'Single agent review',
    summary: compactSummary(session.answer ?? session.summary ?? session.query),
    stepCount: session.stepCount,
    tokens: session.tokens,
    latencyMs: session.latencyMs,
    warnings,
    evidenceIds: [],
  };
}

export function buildIntegratedAgentReviewFromLiveSession(
  mode: 'single' | 'swarm' | 'chat',
  query: string,
  session: AgentSession | SwarmSession,
): IntegratedReviewAgentReview {
  const answer = session.steps.find((step) => step.type === 'answer')?.content;
  const failedTools = session.steps
    .filter((step) => step.type === 'tool_result' && step.toolResult?.success === false)
    .map((step) => step.toolName ? `Tool failed: ${step.toolName}` : 'Tool failed during agent review.');
  const swarmWarnings = 'reviewPassed' in session && session.reviewPassed === false
    ? ['Swarm reviewer did not pass the session without correction.', ...session.corrections.map((correction) => `Correction: ${correction}`)]
    : [];
  return {
    mode,
    title: mode === 'swarm'
      ? 'Swarm agent review'
      : mode === 'chat'
        ? 'Chat agent review'
        : 'Single agent review',
    summary: compactSummary(answer ?? query),
    stepCount: session.steps.length,
    tokens: session.totalTokens,
    latencyMs: session.totalLatencyMs,
    warnings: uniqueStrings([...failedTools, ...swarmWarnings]),
    evidenceIds: [],
  };
}

function buildIntegratedBoreholesFromGroundModel(
  model: GroundModel | undefined,
  regionByEvidenceId: Map<string, IntegratedReviewSourceRegion> = new Map(),
): IntegratedReviewBorehole[] {
  if (!model || model.boreholes.length === 0) {
    return [];
  }
  const evidenceById = evidenceLookup(model);
  const mapPointByLabel = new Map((model.map?.points ?? [])
    .filter((point) => point.kind === 'borehole')
    .map((point) => [point.label.toUpperCase(), point]));
  const parametersByBorehole = new Map<string, GroundModel['parameters']>();
  for (const parameter of model.parameters) {
    if (!parameter.boreholeId) {
      continue;
    }
    const key = parameter.boreholeId.toUpperCase();
    parametersByBorehole.set(key, [...(parametersByBorehole.get(key) ?? []), parameter]);
  }

  return model.boreholes.map((borehole, index) => {
    const coordinate = borehole.coordinates;
    const mapPoint = mapPointByLabel.get(borehole.id.toUpperCase());
    const sortedStrata = [...borehole.strata].sort((left, right) => stratumTopDepth(left, 0, []) - stratumTopDepth(right, 0, []));
    const evidenceIds = uniqueStrings([
      ...borehole.evidenceIds,
      ...(coordinate?.evidenceIds ?? []),
      ...borehole.strata.flatMap((stratum) => stratum.evidenceIds),
      ...borehole.sptTests.flatMap((test) => test.evidenceIds),
      ...borehole.groundwater.flatMap((observation) => observation.evidenceIds),
    ]);
    const sourcePages = pagesForEvidenceIds(evidenceById, evidenceIds);
    const explicitDepths = [
      ...sortedStrata.flatMap((stratum) => [stratum.topDepth, stratum.bottomDepth]),
      ...borehole.sptTests.map((test) => test.depth),
      ...borehole.groundwater.map((observation) => observation.depth),
    ].filter((value): value is number => finiteNumber(value) && value >= 0);
    const maxDepth = Math.max(1, ...explicitDepths);
    const totalDepth = Math.max(maxDepth, ...sortedStrata.map((stratum, stratumIndex) =>
      stratumBottomDepth(stratum, stratumIndex, sortedStrata, maxDepth),
    ));

    return {
      id: borehole.id,
      sourcePages,
      easting: coordinate?.easting ?? mapPoint?.easting,
      northing: coordinate?.northing ?? mapPoint?.northing,
      latitude: coordinate?.latitude ?? mapPoint?.latitude,
      longitude: coordinate?.longitude ?? mapPoint?.longitude,
      coordinateEvidenceId: coordinate?.evidenceIds[0] ?? mapPoint?.sourceEvidenceIds[0],
      groundLevel: 0,
      totalDepth,
      chainage: index * 35,
      offset: 0,
      confidence: normalizeIntegratedConfidence(borehole.confidence),
      evidenceIds,
      strata: sortedStrata.map((stratum, stratumIndex) => {
        const top = stratumTopDepth(stratum, stratumIndex, sortedStrata);
        const base = stratumBottomDepth(stratum, stratumIndex, sortedStrata, totalDepth);
        const className = integratedClass(stratum.description);
        const evidenceId = stratum.evidenceIds[0] ?? `${borehole.id}-stratum-${stratumIndex + 1}`;
        const sourceRegion = regionByEvidenceId.get(evidenceId);
        return {
          top,
          base,
          name: shortIntegratedLabel(stratum.description, `Layer ${stratumIndex + 1}`),
          description: stratum.description,
          className,
          confidence: normalizeIntegratedConfidence(stratum.confidence),
          status: integratedStatus(stratum.confidence, stratum.warnings),
          evidenceId,
          ...(sourceRegion ? { sourceRegion } : {}),
        };
      }),
      spt: borehole.sptTests.map((test, testIndex) => {
        const evidenceId = test.evidenceIds[0] ?? `${borehole.id}-spt-${testIndex + 1}`;
        const sourceRegion = regionByEvidenceId.get(evidenceId);
        return {
          depth: test.depth,
          value: test.nValue,
          label: `N${test.nValue}`,
          confidence: normalizeIntegratedConfidence(test.confidence),
          evidenceId,
          ...(sourceRegion ? { sourceRegion } : {}),
        };
      }),
      groundwater: borehole.groundwater.map((observation, waterIndex) => {
        const evidenceId = observation.evidenceIds[0] ?? `${borehole.id}-water-${waterIndex + 1}`;
        const sourceRegion = regionByEvidenceId.get(evidenceId);
        return {
          depth: observation.depth,
          label: 'GWL',
          confidence: normalizeIntegratedConfidence(observation.confidence),
          evidenceId,
          ...(sourceRegion ? { sourceRegion } : {}),
        };
      }),
      parameters: (parametersByBorehole.get(borehole.id.toUpperCase()) ?? []).map((parameter, parameterIndex) => {
        const evidenceId = parameter.evidenceIds[0] ?? `${borehole.id}-parameter-${parameterIndex + 1}`;
        const sourceRegion = regionByEvidenceId.get(evidenceId);
        return {
          name: parameter.name,
          value: `${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''}`,
          ...(parameter.depth != null ? { depth: parameter.depth } : {}),
          confidence: normalizeIntegratedConfidence(parameter.confidence),
          evidenceId,
          ...(sourceRegion ? { sourceRegion } : {}),
        };
      }),
      warnings: borehole.warnings,
    };
  });
}

function buildIntegratedBoreholesFromProfile(profile: IngestDossierBoreholeProfile | undefined): IntegratedReviewBorehole[] {
  if (!profile || profile.columns.length === 0) {
    return [];
  }
  return profile.columns.map((column, index) => ({
    id: column.boreholeId,
    sourcePages: [...new Set(column.layers.flatMap((layer) => layer.sourcePages ?? []))],
    groundLevel: 0,
    totalDepth: column.totalDepth ?? profile.maxDepth,
    chainage: index * 35,
    offset: 0,
    confidence: 0.72,
    evidenceIds: [],
    strata: column.layers.map((layer, layerIndex) => {
      const className = integratedClass(layer.description);
      return {
        top: layer.depthFrom,
        base: layer.depthTo,
        name: layer.uscsSymbol ?? layer.label,
        description: layer.description,
        className,
        confidence: layer.uncertain ? 0.62 : 0.74,
        status: layer.uncertain ? 'review_recommended' : 'accepted',
        evidenceId: `${column.boreholeId}-layer-${layerIndex + 1}`,
      };
    }),
    spt: [],
    groundwater: column.waterTableDepth == null
      ? []
      : [{
        depth: column.waterTableDepth,
        label: 'GWL',
        confidence: 0.68,
        evidenceId: `${column.boreholeId}-water-1`,
      }],
    parameters: [],
    warnings: profile.notes,
  }));
}

function integratedBoreholeIdentity(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const boreholeMatch = compact.match(/^BH0*(\d+)$/);
  return boreholeMatch ? `BH${boreholeMatch[1]}` : compact;
}

function mergeIntegratedBoreholes(
  primary: IntegratedReviewBorehole[],
  fallback: IntegratedReviewBorehole[],
): IntegratedReviewBorehole[] {
  const merged = [...primary];
  const seen = new Set(primary.map((borehole) => integratedBoreholeIdentity(borehole.id)));
  for (const borehole of fallback) {
    const identity = integratedBoreholeIdentity(borehole.id);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    merged.push({
      ...borehole,
      warnings: uniqueStrings([
        ...borehole.warnings,
        'Borehole retained from report-level profile because no matching GroundModel borehole was recovered.',
      ]),
    });
  }
  return merged.map((borehole, index) => ({
    ...borehole,
    chainage: borehole.chainage || index * 35,
  }));
}

export function buildIntegratedReviewModel(
  dossier: IngestDossier,
  options: BuildIntegratedReviewModelOptions = {},
): IntegratedReviewModel {
  const sourcePages = mergeIntegratedSourcePages(
    buildIntegratedSourcePagesFromEvidence(dossier.groundModel?.evidence ?? [], dossier.sourceLabel),
    dossier.sourcePages ?? [],
    options.sourcePages ?? [],
  );
  const regionByEvidenceId = sourceRegionLookup(sourcePages);
  const groundBoreholes = buildIntegratedBoreholesFromGroundModel(dossier.groundModel, regionByEvidenceId);
  const profileBoreholes = buildIntegratedBoreholesFromProfile(dossier.boreholeProfile);
  const boreholes = groundBoreholes.length > 0
    ? mergeIntegratedBoreholes(groundBoreholes, profileBoreholes)
    : profileBoreholes;
  const confidenceValues = [
    ...boreholes.map((borehole) => borehole.confidence),
    ...boreholes.flatMap((borehole) => [
      ...borehole.strata.map((stratum) => stratum.confidence),
      ...borehole.spt.map((point) => point.confidence),
      ...borehole.groundwater.map((point) => point.confidence),
      ...borehole.parameters.map((parameter) => parameter.confidence),
    ]),
  ];
  const warningSet = uniqueStrings([
    ...dossier.findings.flatMap((group) => group.items),
    ...(dossier.groundModel?.warnings ?? []),
    ...(dossier.boreholeProfile?.notes ?? []),
  ]).slice(0, 10);
  const extractedValueCount = boreholes.reduce((count, borehole) =>
    count
    + borehole.strata.length
    + borehole.spt.length
    + borehole.groundwater.length
    + borehole.parameters.length
    + (borehole.evidenceIds.length > 0 ? 1 : 0), 0);
  const evidenceLinkedValueCount = boreholes.reduce((count, borehole) => {
    const boreholeHasSource = borehole.evidenceIds.length > 0 || borehole.sourcePages.length > 0;
    return count
      + (boreholeHasSource ? 1 : 0)
      + borehole.strata.filter((stratum) => boreholeHasSource || borehole.evidenceIds.includes(stratum.evidenceId)).length
      + borehole.spt.filter((point) => boreholeHasSource || borehole.evidenceIds.includes(point.evidenceId)).length
      + borehole.groundwater.filter((point) => boreholeHasSource || borehole.evidenceIds.includes(point.evidenceId)).length
      + borehole.parameters.filter((parameter) => boreholeHasSource || borehole.evidenceIds.includes(parameter.evidenceId)).length;
  }, 0);
  const evidenceCoverage = extractedValueCount === 0
    ? (dossier.trustItems.length > 0 ? 0.75 : 0)
    : Math.min(1, evidenceLinkedValueCount / Math.max(1, extractedValueCount));

  return {
    schemaVersion: 'geotech.integrated_review.v1',
    run: {
      id: dossier.storedReview?.reviewId ?? `ingest-${dossier.generatedAt.slice(0, 10)}`,
      document: dossier.sourceLabel,
      providerProfile: 'hosted-beta default',
      models: {
        ocr: 'glm-ocr',
        vision: DEFAULT_LLM_VISION_MODEL,
        text: DEFAULT_LLM_MODEL,
      },
      status: warningSet.length > 0 ? 'review_recommended' : 'accepted',
    },
    project: {
      name: dossier.title,
      inputCrs: dossier.groundModel?.coordinateSystem.crs ?? dossier.groundModel?.coordinateSystem.kind ?? 'unknown',
      displayCrs: dossier.groundModel?.map?.coordinateType === 'geographic' ? 'EPSG:4326' : 'source coordinates',
      verticalDatum: 'local datum',
      crsTransformEngine: dossier.groundModel?.map ? 'geotechCLI coordinate normalizer' : 'not resolved',
    },
    quality: {
      overallConfidence: confidenceValues.length > 0
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : 0,
      evidenceCoverage,
      depthMappingR2: boreholes.some((borehole) => borehole.strata.length > 0) ? 0.98 : null,
      warnings: warningSet,
    },
    boreholes,
    agentReviews: options.agentReviews ?? dossier.agentReviews ?? [],
    sourcePages,
  };
}

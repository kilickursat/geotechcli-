import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { LLMConfig } from '../llm/types.js';
import type { DocumentTextHintSource } from '../vision/ocr.js';
import type { GlmOcrLayoutPage, GlmOcrLayoutElement } from '../vision/layout-ocr.js';
import {
  resolveVisionImagePreprocessPolicy,
  type VisionImagePreprocessMetadata,
} from '../vision/preprocess.js';

export const PAGE_EVIDENCE_CACHE_SCHEMA_VERSION = 2;
export const PAGE_EVIDENCE_PREPROCESSING_VERSION = 'page-evidence-preprocess-v4';

const CACHE_DIR_NAME = 'page-evidence-cache';

export interface PageEvidenceCacheKeyParts {
  fileHash: string;
  pageHash: string;
  pageNumber: number;
  modelVersion: string;
  preprocessingVersion: string;
  schemaVersion?: number;
}

export interface PageEvidenceCacheEntry {
  textHint?: string;
  source: DocumentTextHintSource;
  warnings: string[];
  transformed: boolean;
  preprocessing?: VisionImagePreprocessMetadata;
  layoutSummary?: string;
  layoutPages?: GlmOcrLayoutPage[];
  extractionResult?: unknown;
  createdAt: string;
}

export interface WritePageEvidenceCacheInput {
  textHint?: string | null;
  source: DocumentTextHintSource;
  warnings?: string[];
  transformed: boolean;
  preprocessing?: VisionImagePreprocessMetadata | null;
  layoutSummary?: string | null;
  layoutPages?: GlmOcrLayoutPage[] | null;
  extractionResult?: unknown;
  createdAt?: string | Date;
}

export interface WritePageEvidenceCacheOptions {
  now?: () => Date;
}

type ModelVersionConfig = Pick<LLMConfig, 'provider' | 'baseUrl' | 'modelId' | 'visionModelId'>;
type PreprocessingVersionConfig = Pick<LLMConfig, 'provider' | 'baseUrl'>;

export function hashBuffer(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashString(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

export function buildPageEvidenceModelVersion(config: ModelVersionConfig): string {
  return `llm-${hashString(canonicalJson({
    provider: config.provider,
    baseUrl: normalizeOptionalString(config.baseUrl),
    modelId: normalizeOptionalString(config.modelId),
    visionModelId: normalizeOptionalString(config.visionModelId),
  })).slice(0, 24)}`;
}

export function buildPageEvidencePreprocessingVersion(
  config: PreprocessingVersionConfig,
  pipelineVersion = PAGE_EVIDENCE_PREPROCESSING_VERSION,
  preprocessingMode = resolveVisionImagePreprocessPolicy(),
): string {
  return `preprocess-${hashString(canonicalJson({
    pipelineVersion,
    preprocessingMode,
    provider: config.provider,
    baseUrl: normalizeOptionalString(config.baseUrl),
  })).slice(0, 24)}`;
}

export function buildPageEvidenceCacheKey(parts: PageEvidenceCacheKeyParts): string {
  const schemaVersion = parts.schemaVersion ?? PAGE_EVIDENCE_CACHE_SCHEMA_VERSION;
  return hashString(canonicalJson({
    fileHash: requireNonEmptyString(parts.fileHash, 'fileHash'),
    pageHash: requireNonEmptyString(parts.pageHash, 'pageHash'),
    pageNumber: requirePositiveInteger(parts.pageNumber, 'pageNumber'),
    modelVersion: requireNonEmptyString(parts.modelVersion, 'modelVersion'),
    preprocessingVersion: requireNonEmptyString(parts.preprocessingVersion, 'preprocessingVersion'),
    schemaVersion: requirePositiveInteger(schemaVersion, 'schemaVersion'),
  }));
}

export function getPageEvidenceCacheDir(): string {
  return join(getConfigRoot(), CACHE_DIR_NAME);
}

export function getPageEvidenceCachePath(parts: PageEvidenceCacheKeyParts): string {
  return join(getPageEvidenceCacheDir(), `${buildPageEvidenceCacheKey(parts)}.json`);
}

export function getPageEvidenceCacheAssetPath(cacheRelativePath: string): string {
  const normalized = cacheRelativePath
    .split(/[\\/]+/)
    .filter(Boolean);
  return join(getPageEvidenceCacheDir(), ...normalized);
}

export function readPageEvidenceCache(parts: PageEvidenceCacheKeyParts): PageEvidenceCacheEntry | null {
  const cachePath = getPageEvidenceCachePath(parts);
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return parsePageEvidenceCacheEntry(parsed);
  } catch {
    return null;
  }
}

export function writePageEvidenceCache(
  parts: PageEvidenceCacheKeyParts,
  evidence: WritePageEvidenceCacheInput,
  options: WritePageEvidenceCacheOptions = {},
): PageEvidenceCacheEntry {
  const entry = buildCompactEntry(evidence, options.now, parts);
  const cachePath = getPageEvidenceCachePath(parts);
  atomicWriteJson(cachePath, entry);
  return entry;
}

export function clearPageEvidenceCache(parts?: PageEvidenceCacheKeyParts): void {
  if (parts) {
    rmSync(getPageEvidenceCachePath(parts), { force: true });
    return;
  }

  rmSync(getPageEvidenceCacheDir(), { recursive: true, force: true });
}

function getConfigRoot(): string {
  return process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli');
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(value);
  writeFileSync(tempPath, serialized, 'utf-8');

  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
      throw error;
    }

    writeFileSync(filePath, serialized, 'utf-8');
    rmSync(tempPath, { force: true });
  }
}

function buildCompactEntry(
  evidence: WritePageEvidenceCacheInput,
  now: (() => Date) | undefined,
  parts?: PageEvidenceCacheKeyParts,
): PageEvidenceCacheEntry {
  const entry: PageEvidenceCacheEntry = {
    source: evidence.source,
    warnings: normalizeWarnings(evidence.warnings ?? []),
    transformed: evidence.transformed,
    createdAt: normalizeCreatedAt(evidence.createdAt, now),
  };

  const textHint = normalizeOptionalString(evidence.textHint);
  if (textHint) {
    entry.textHint = textHint;
  }

  const layoutSummary = normalizeOptionalString(evidence.layoutSummary);
  if (layoutSummary) {
    entry.layoutSummary = layoutSummary;
  }

  const preprocessing = normalizePreprocessingMetadata(evidence.preprocessing, parts);
  if (preprocessing) {
    entry.preprocessing = preprocessing;
  }

  const layoutPages = normalizeLayoutPages(evidence.layoutPages);
  if (layoutPages.length > 0) {
    entry.layoutPages = layoutPages;
  }

  if (evidence.extractionResult !== undefined) {
    entry.extractionResult = evidence.extractionResult;
  }

  return entry;
}

function parsePageEvidenceCacheEntry(value: unknown): PageEvidenceCacheEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = typeof value.source === 'string'
    ? value.source as DocumentTextHintSource
    : null;
  const warnings = Array.isArray(value.warnings)
    ? normalizeWarnings(value.warnings)
    : null;
  const transformed = typeof value.transformed === 'boolean'
    ? value.transformed
    : null;
  const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim()
    ? value.createdAt
    : null;

  if (!source || !warnings || transformed === null || !createdAt) {
    return null;
  }

  const entry: PageEvidenceCacheEntry = {
    source,
    warnings,
    transformed,
    createdAt,
  };

  const textHint = normalizeOptionalString(value.textHint);
  if (textHint) {
    entry.textHint = textHint;
  }

  const layoutSummary = normalizeOptionalString(value.layoutSummary);
  if (layoutSummary) {
    entry.layoutSummary = layoutSummary;
  }

  const preprocessing = normalizePreprocessingMetadata(value.preprocessing);
  if (preprocessing) {
    entry.preprocessing = preprocessing;
  }

  const layoutPages = normalizeLayoutPages(value.layoutPages);
  if (layoutPages.length > 0) {
    entry.layoutPages = layoutPages;
  }

  if (value.extractionResult !== undefined) {
    entry.extractionResult = value.extractionResult;
  }

  return entry;
}

function normalizeCreatedAt(value: string | Date | undefined, now: (() => Date) | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return (now ?? (() => new Date()))().toISOString();
}

function normalizeWarnings(values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => {
    if (typeof value !== 'string') {
      return [];
    }

    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }))];
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLayoutPages(value: unknown): GlmOcrLayoutPage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): GlmOcrLayoutPage[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const pageNumber = normalizePositiveInteger(entry.pageNumber);
    if (pageNumber == null) {
      return [];
    }
    const elements = normalizeLayoutElements(entry.elements);
    return [{
      pageNumber,
      width: normalizeNullableNumber(entry.width),
      height: normalizeNullableNumber(entry.height),
      elements,
      text: normalizeOptionalString(entry.text),
      tables: normalizeStringArray(entry.tables),
      formulas: normalizeStringArray(entry.formulas),
      images: normalizeStringArray(entry.images),
    }];
  });
}

function normalizePreprocessingMetadata(
  value: unknown,
  parts?: PageEvidenceCacheKeyParts,
): VisionImagePreprocessMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const schemaVersion = normalizeNullableNumber(value.schemaVersion);
  const pipelineVersion = normalizeOptionalString(value.pipelineVersion);
  const policy = normalizeOptionalString(value.policy);
  const transformed = typeof value.transformed === 'boolean' ? value.transformed : null;
  const input = normalizePreprocessImageMetadata(value.input);
  const output = normalizePreprocessImageMetadata(value.output);
  const quality = normalizePreprocessQuality(value.quality);
  if (
    schemaVersion !== 1
    || !pipelineVersion
    || (policy !== 'none' && policy !== 'ocr-optimized' && policy !== 'region-v2')
    || transformed == null
    || !input
    || !output
  ) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    pipelineVersion,
    policy,
    transformed,
    input,
    output,
    operations: normalizeStringArray(value.operations),
    regions: normalizePreprocessRegions(value.regions, parts),
    ...(quality ? { quality } : {}),
    warnings: normalizeWarnings(Array.isArray(value.warnings) ? value.warnings : []),
  };
}

function normalizePreprocessImageMetadata(value: unknown): VisionImagePreprocessMetadata['input'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const mimeType = normalizeOptionalString(value.mimeType);
  const byteLength = normalizeNullableNumber(value.byteLength);
  if (!mimeType || byteLength == null || byteLength < 0) {
    return undefined;
  }
  const width = normalizeNullableNumber(value.width);
  const height = normalizeNullableNumber(value.height);
  return {
    mimeType,
    byteLength: Math.round(byteLength),
    ...(width != null ? { width: Math.round(width) } : {}),
    ...(height != null ? { height: Math.round(height) } : {}),
  };
}

function normalizePreprocessRegions(
  value: unknown,
  parts?: PageEvidenceCacheKeyParts,
): VisionImagePreprocessMetadata['regions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): VisionImagePreprocessMetadata['regions'] => {
    if (!isRecord(entry)) {
      return [];
    }
    const id = normalizeOptionalString(entry.id);
    const label = normalizeOptionalString(entry.label);
    const source = normalizeOptionalString(entry.source);
    if (!id || !label || source !== 'preprocessing') {
      return [];
    }
    const coverageRatio = normalizeNullableNumber(entry.coverageRatio);
    const bbox2d = normalizeLayoutBbox(entry.bbox2d);
    const asset = normalizePreprocessRegionAsset(entry.asset, parts, id);
    const quality = normalizePreprocessRegionQuality(entry.quality);
    return [{
      id,
      source: 'preprocessing',
      label,
      ...(bbox2d ? { bbox2d } : {}),
      ...(coverageRatio != null ? { coverageRatio: Math.max(0, Math.min(1, coverageRatio)) } : {}),
      ...(quality ? { quality } : {}),
      ...(asset ? { asset } : {}),
    }];
  });
}

function normalizePreprocessRegionAsset(
  value: unknown,
  parts: PageEvidenceCacheKeyParts | undefined,
  regionId: string,
): NonNullable<VisionImagePreprocessMetadata['regions'][number]['asset']> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dataBase64 = normalizeOptionalString(value.dataBase64);
  if (dataBase64 && parts) {
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0) {
      return undefined;
    }
    const sha256 = hashBuffer(buffer);
    const cacheRelativePath = buildRegionAssetRelativePath(parts, regionId, sha256);
    const assetPath = getPageEvidenceCacheAssetPath(cacheRelativePath);
    ensureParentDir(assetPath);
    writeFileSync(assetPath, buffer);
    const width = normalizeNullableNumber(value.width);
    const height = normalizeNullableNumber(value.height);
    return {
      mimeType: 'image/png',
      byteLength: buffer.length,
      sha256,
      ...(width != null ? { width: Math.round(width) } : {}),
      ...(height != null ? { height: Math.round(height) } : {}),
      ...(typeof value.normalized === 'boolean' ? { normalized: value.normalized } : {}),
      cacheRelativePath,
    };
  }

  const mimeType = normalizeOptionalString(value.mimeType);
  const byteLength = normalizeNullableNumber(value.byteLength);
  const sha256 = normalizeOptionalString(value.sha256);
  if (!mimeType || byteLength == null || byteLength < 0 || !/^[a-f0-9]{64}$/i.test(sha256)) {
    return undefined;
  }
  const width = normalizeNullableNumber(value.width);
  const height = normalizeNullableNumber(value.height);
  const cacheRelativePath = normalizeOptionalString(value.cacheRelativePath);
  return {
    mimeType,
    byteLength: Math.round(byteLength),
    sha256: sha256.toLowerCase(),
    ...(width != null ? { width: Math.round(width) } : {}),
    ...(height != null ? { height: Math.round(height) } : {}),
    ...(typeof value.normalized === 'boolean' ? { normalized: value.normalized } : {}),
    ...(cacheRelativePath ? { cacheRelativePath } : {}),
  };
}

function normalizePreprocessQuality(value: unknown): VisionImagePreprocessMetadata['quality'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const score = normalizeRatioNumber(value.score);
  const contentCoverageRatio = normalizeRatioNumber(value.contentCoverageRatio);
  const darkPixelRatio = normalizeRatioNumber(value.darkPixelRatio);
  const regionCoverageRatio = normalizeRatioNumber(value.regionCoverageRatio);
  const regionCount = normalizeNullableNumber(value.regionCount);
  const cropAssetCount = normalizeNullableNumber(value.cropAssetCount);
  const deskew = normalizePreprocessDeskew(value.deskew);
  if (
    score == null
    || contentCoverageRatio == null
    || darkPixelRatio == null
    || regionCoverageRatio == null
    || regionCount == null
    || cropAssetCount == null
    || !deskew
  ) {
    return undefined;
  }
  return {
    score,
    contentCoverageRatio,
    darkPixelRatio,
    regionCoverageRatio,
    regionCount: Math.max(0, Math.round(regionCount)),
    cropAssetCount: Math.max(0, Math.round(cropAssetCount)),
    deskew,
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizePreprocessDeskew(value: unknown): NonNullable<VisionImagePreprocessMetadata['quality']>['deskew'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const method = normalizeOptionalString(value.method);
  const angleDeg = normalizeNullableNumber(value.angleDeg);
  const confidence = normalizeRatioNumber(value.confidence);
  const applied = typeof value.applied === 'boolean' ? value.applied : null;
  if (
    (method !== 'projection-profile' && method !== 'projection-profile-fine')
    || angleDeg == null
    || confidence == null
    || applied == null
  ) {
    return undefined;
  }
  return {
    method,
    angleDeg: Math.round(angleDeg * 100) / 100,
    confidence,
    applied,
  };
}

function normalizePreprocessRegionQuality(value: unknown): VisionImagePreprocessMetadata['regions'][number]['quality'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const score = normalizeRatioNumber(value.score);
  const darkPixelRatio = normalizeRatioNumber(value.darkPixelRatio);
  const lineDensity = normalizeRatioNumber(value.lineDensity);
  const coverageRatio = normalizeRatioNumber(value.coverageRatio);
  if (score == null || darkPixelRatio == null || lineDensity == null || coverageRatio == null) {
    return undefined;
  }
  return {
    score,
    darkPixelRatio,
    lineDensity,
    coverageRatio,
    warnings: normalizeStringArray(value.warnings),
  };
}

function buildRegionAssetRelativePath(
  parts: PageEvidenceCacheKeyParts,
  regionId: string,
  sha256: string,
): string {
  const key = buildPageEvidenceCacheKey(parts);
  const safeRegionId = regionId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'region';
  return `assets/${key}/${safeRegionId}-${sha256.slice(0, 16)}.png`;
}

function normalizeLayoutElements(value: unknown): GlmOcrLayoutElement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): GlmOcrLayoutElement[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const content = normalizeOptionalString(entry.content);
    if (!content) {
      return [];
    }
    return [{
      index: normalizeNullableNumber(entry.index),
      label: normalizeLayoutLabel(entry.label),
      bbox2d: normalizeLayoutBbox(entry.bbox2d),
      content,
      height: normalizeNullableNumber(entry.height),
      width: normalizeNullableNumber(entry.width),
    }];
  });
}

function normalizeLayoutLabel(value: unknown): GlmOcrLayoutElement['label'] {
  return value === 'image' || value === 'text' || value === 'formula' || value === 'table'
    ? value
    : 'unknown';
}

function normalizeLayoutBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const bbox = value.map((entry) => normalizeNullableNumber(entry));
  return bbox.every((entry) => entry != null)
    ? bbox as [number, number, number, number]
    : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter(Boolean);
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRatioNumber(value: unknown): number | null {
  const parsed = normalizeNullableNumber(value);
  return parsed == null ? null : Math.max(0, Math.min(1, Math.round(parsed * 1000) / 1000));
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = normalizeNullableNumber(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireNonEmptyString(value: string, name: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`Page evidence cache ${name} must be a non-empty string.`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Page evidence cache ${name} must be a positive integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

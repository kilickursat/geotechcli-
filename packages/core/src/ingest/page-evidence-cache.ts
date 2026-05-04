import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { LLMConfig } from '../llm/types.js';
import type { DocumentTextHintSource } from '../vision/ocr.js';

export const PAGE_EVIDENCE_CACHE_SCHEMA_VERSION = 1;
export const PAGE_EVIDENCE_PREPROCESSING_VERSION = 'page-evidence-preprocess-v2';

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
  layoutSummary?: string;
  extractionResult?: unknown;
  createdAt: string;
}

export interface WritePageEvidenceCacheInput {
  textHint?: string | null;
  source: DocumentTextHintSource;
  warnings?: string[];
  transformed: boolean;
  layoutSummary?: string | null;
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
): string {
  return `preprocess-${hashString(canonicalJson({
    pipelineVersion,
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
  const entry = buildCompactEntry(evidence, options.now);
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

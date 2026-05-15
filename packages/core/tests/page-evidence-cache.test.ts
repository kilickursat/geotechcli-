import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LLMConfig } from '../src/llm/types.js';
import {
  PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
  buildPageEvidenceCacheKey,
  buildPageEvidenceModelVersion,
  buildPageEvidencePreprocessingVersion,
  getPageEvidenceCachePath,
  hashBuffer,
  hashString,
  readPageEvidenceCache,
  writePageEvidenceCache,
} from '../src/ingest/page-evidence-cache.js';

describe('page evidence cache', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  const llmConfig: LLMConfig = {
    provider: 'hosted-beta',
    apiKey: 'not-part-of-cache-keys',
    baseUrl: 'https://beta.geotechcli.com/api/proxy/',
    modelId: 'glm-4.5',
    visionModelId: 'glm-4.5v',
    timeout: 60000,
  };

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-page-evidence-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('builds stable content hashes and cache keys', () => {
    const fileHash = hashString('source-pdf-bytes');
    const pageHash = hashBuffer(Buffer.from('rendered-page-bytes', 'utf-8'));
    const modelVersion = buildPageEvidenceModelVersion(llmConfig);
    const preprocessingVersion = buildPageEvidencePreprocessingVersion(llmConfig);

    const key = buildPageEvidenceCacheKey({
      fileHash,
      pageHash,
      pageNumber: 7,
      modelVersion,
      preprocessingVersion,
      schemaVersion: PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
    });

    expect(hashBuffer(Buffer.from('source-pdf-bytes', 'utf-8'))).toBe(fileHash);
    expect(key).toBe(buildPageEvidenceCacheKey({
      fileHash,
      pageHash,
      pageNumber: 7,
      modelVersion,
      preprocessingVersion,
      schemaVersion: PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
    }));
    expect(key).toHaveLength(64);
  });

  it('persists compact OCR evidence under GEOTECHCLI_CONFIG_DIR', () => {
    const parts = buildParts();
    const entry = writePageEvidenceCache(parts, {
      textHint: 'BH-01 encountered silty clay and groundwater at 3.2 m.',
      source: 'glm-ocr',
      warnings: ['Layout OCR should be spot checked.'],
      transformed: true,
      layoutSummary: 'One table and two text blocks.',
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    const cachePath = getPageEvidenceCachePath(parts);
    expect(cachePath.startsWith(join(configDir, 'page-evidence-cache'))).toBe(true);
    expect(existsSync(cachePath)).toBe(true);
    expect(readPageEvidenceCache(parts)).toEqual(entry);

    const raw = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(Object.keys(raw).sort()).toEqual([
      'createdAt',
      'layoutSummary',
      'source',
      'textHint',
      'transformed',
      'warnings',
    ].sort());
  });

  it('treats corrupt cache files as misses', () => {
    const parts = buildParts();
    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text.',
      source: 'vision-ocr',
      warnings: [],
      transformed: false,
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    writeFileSync(getPageEvidenceCachePath(parts), '{not valid json', 'utf-8');

    expect(readPageEvidenceCache(parts)).toBeNull();
  });

  it('invalidates entries when model, preprocessing, or schema versions change', () => {
    const parts = buildParts();
    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text.',
      source: 'vision-ocr',
      warnings: [],
      transformed: false,
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    expect(readPageEvidenceCache(parts)?.textHint).toBe('Recovered OCR text.');

    expect(readPageEvidenceCache({
      ...parts,
      modelVersion: buildPageEvidenceModelVersion({
        ...llmConfig,
        visionModelId: 'glm-4.6v',
      }),
    })).toBeNull();

    expect(readPageEvidenceCache({
        ...parts,
        preprocessingVersion: buildPageEvidencePreprocessingVersion(
          llmConfig,
          'page-evidence-preprocess-v3',
        ),
      })).toBeNull();

    expect(readPageEvidenceCache({
      ...parts,
      schemaVersion: PAGE_EVIDENCE_CACHE_SCHEMA_VERSION + 1,
    })).toBeNull();
  });

  it('persists an optional completed page extraction result with the compact evidence', () => {
    const parts = buildParts();
    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text.',
      source: 'glm-ocr',
      warnings: [],
      transformed: false,
      extractionResult: {
        parseStatus: 'parsed',
        confidence: 91,
        materials: [{ kind: 'soil', description: 'silty sand' }],
      },
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    expect(readPageEvidenceCache(parts)?.extractionResult).toEqual(expect.objectContaining({
      parseStatus: 'parsed',
      confidence: 91,
    }));
  });

  it('persists compact GLM-OCR layout pages without storing full provider payloads', () => {
    const parts = buildParts();
    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text with a table.',
      source: 'glm-ocr',
      warnings: [],
      transformed: false,
      layoutSummary: 'One table.',
      layoutPages: [{
        pageNumber: 7,
        width: 612,
        height: 792,
        text: 'SPT N = 12',
        tables: ['| Depth | SPT |'],
        formulas: [],
        images: [],
        elements: [{
          index: 1,
          label: 'table',
          bbox2d: [0.1, 0.2, 0.8, 0.4],
          content: '| Depth | SPT |\n| 2m | 12 |',
          width: 612,
          height: 792,
        }],
      }],
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    expect(readPageEvidenceCache(parts)?.layoutPages?.[0]).toMatchObject({
      pageNumber: 7,
      width: 612,
      height: 792,
      tables: ['| Depth | SPT |'],
      elements: [{
        index: 1,
        label: 'table',
        bbox2d: [0.1, 0.2, 0.8, 0.4],
      }],
    });

    const raw = JSON.parse(readFileSync(getPageEvidenceCachePath(parts), 'utf-8'));
    expect(raw.layoutPages).toHaveLength(1);
    expect(raw).not.toHaveProperty('usage');
    expect(raw).not.toHaveProperty('latencyMs');
    expect(raw).not.toHaveProperty('markdown');
  });

  function buildParts() {
    return {
      fileHash: hashString('source-pdf-bytes'),
      pageHash: hashString('page-7-raster-or-native-text'),
      pageNumber: 7,
      modelVersion: buildPageEvidenceModelVersion(llmConfig),
      preprocessingVersion: buildPageEvidencePreprocessingVersion(llmConfig),
      schemaVersion: PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
    };
  }
});

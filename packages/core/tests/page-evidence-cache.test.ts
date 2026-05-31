import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LLMConfig } from '../src/llm/types.js';
import {
  PAGE_EVIDENCE_CACHE_SCHEMA_VERSION,
  buildPageEvidenceCacheKey,
  buildPageEvidenceModelVersion,
  buildPageEvidencePreprocessingVersion,
  getPageEvidenceCacheAssetPath,
  getPageEvidenceCachePath,
  hashBuffer,
  hashString,
  readPageEvidenceCache,
  writePageEvidenceCache,
} from '../src/ingest/page-evidence-cache.js';
import { renderPdfPageToImageBuffer } from '../src/vision/preprocess.js';

const testDir = dirname(fileURLToPath(import.meta.url));

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
    expect(buildPageEvidencePreprocessingVersion(llmConfig, undefined, 'none')).not.toBe(
      buildPageEvidencePreprocessingVersion(llmConfig, undefined, 'ocr-optimized'),
    );
    expect(buildPageEvidencePreprocessingVersion(llmConfig, undefined, 'region-v2')).not.toBe(
      buildPageEvidencePreprocessingVersion(llmConfig, undefined, 'ocr-optimized'),
    );
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
          'page-evidence-preprocess-v5',
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

  it('persists preprocessing metadata for page-region evidence and cache auditability', () => {
    const parts = buildParts();
    const cropAsset = Buffer.from('synthetic cropped panel asset', 'utf-8');
    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text after normalization.',
      source: 'vision-ocr',
      warnings: [],
      transformed: true,
      preprocessing: {
        schemaVersion: 1,
        pipelineVersion: 'vision-image-preprocess-v2',
        policy: 'ocr-optimized',
        transformed: true,
        input: {
          mimeType: 'image/jpeg',
          byteLength: 4096,
          width: 2400,
          height: 3200,
        },
        output: {
          mimeType: 'image/png',
          byteLength: 2048,
          width: 1350,
          height: 1800,
        },
        operations: ['auto-orient', 'trim-white-margins-threshold-10', 'resize-inside-1800-no-enlarge'],
        quality: {
          score: 0.84,
          contentCoverageRatio: 0.72,
          darkPixelRatio: 0.08,
          regionCoverageRatio: 0.25,
          regionCount: 1,
          cropAssetCount: 1,
          deskew: {
            method: 'projection-profile',
            angleDeg: -1.5,
            confidence: 0.72,
            applied: true,
          },
          warnings: [],
        },
        regions: [{
          id: 'normalized-full-page',
          source: 'preprocessing',
          label: 'normalized full page',
          bbox2d: [0, 0, 1, 1],
          coverageRatio: 1,
          quality: {
            score: 0.75,
            darkPixelRatio: 0.08,
            lineDensity: 0.01,
            coverageRatio: 1,
            warnings: ['region-covers-full-page'],
          },
        }, {
          id: 'table-log-panel-candidate',
          source: 'preprocessing',
          label: 'detected table/log panel candidate',
          bbox2d: [0.1, 0.1, 0.6, 0.6],
          coverageRatio: 0.25,
          quality: {
            score: 0.9,
            darkPixelRatio: 0.2,
            lineDensity: 0.04,
            coverageRatio: 0.25,
            warnings: [],
          },
          asset: {
            mimeType: 'image/png',
            byteLength: cropAsset.length,
            sha256: '0'.repeat(64),
            width: 640,
            height: 480,
            normalized: true,
            dataBase64: cropAsset.toString('base64'),
          },
        }],
        warnings: [],
      },
      createdAt: '2026-05-03T00:00:00.000Z',
    });

    const cached = readPageEvidenceCache(parts);
    const asset = cached?.preprocessing?.regions.find((region) => region.id === 'table-log-panel-candidate')?.asset;
    expect(cached?.preprocessing).toMatchObject({
      pipelineVersion: 'vision-image-preprocess-v2',
      policy: 'ocr-optimized',
      transformed: true,
      output: {
        mimeType: 'image/png',
        width: 1350,
        height: 1800,
      },
      operations: ['auto-orient', 'trim-white-margins-threshold-10', 'resize-inside-1800-no-enlarge'],
      quality: {
        score: 0.84,
        contentCoverageRatio: 0.72,
        darkPixelRatio: 0.08,
        regionCoverageRatio: 0.25,
        regionCount: 1,
        cropAssetCount: 1,
        deskew: {
          method: 'projection-profile',
          angleDeg: -1.5,
          confidence: 0.72,
          applied: true,
        },
        warnings: [],
      },
      regions: [{
        id: 'normalized-full-page',
        source: 'preprocessing',
        label: 'normalized full page',
        bbox2d: [0, 0, 1, 1],
        coverageRatio: 1,
        quality: {
          score: 0.75,
          darkPixelRatio: 0.08,
          lineDensity: 0.01,
          coverageRatio: 1,
          warnings: ['region-covers-full-page'],
        },
      }, {
        id: 'table-log-panel-candidate',
        source: 'preprocessing',
        label: 'detected table/log panel candidate',
        bbox2d: [0.1, 0.1, 0.6, 0.6],
        coverageRatio: 0.25,
        quality: {
          score: 0.9,
          darkPixelRatio: 0.2,
          lineDensity: 0.04,
          coverageRatio: 0.25,
          warnings: [],
        },
        asset: {
          mimeType: 'image/png',
          byteLength: cropAsset.length,
          sha256: hashBuffer(cropAsset),
          width: 640,
          height: 480,
          normalized: true,
          cacheRelativePath: expect.stringMatching(/^assets\//),
        },
      }],
    });
    expect(asset?.cacheRelativePath).toBeTruthy();
    expect(readFileSync(getPageEvidenceCacheAssetPath(asset!.cacheRelativePath!))).toEqual(cropAsset);

    const raw = JSON.parse(readFileSync(getPageEvidenceCachePath(parts), 'utf-8'));
    const rawAsset = raw.preprocessing.regions.find((region: any) => region.id === 'table-log-panel-candidate').asset;
    expect(rawAsset.dataBase64).toBeUndefined();
    expect(rawAsset.cacheRelativePath).toBe(asset?.cacheRelativePath);
  });

  it('persists region-v2 crop assets from the committed scanned borehole/table PDF fixture', async () => {
    const fixture = readFileSync(join(
      testDir,
      'fixtures',
      'geotech-corpus',
      'region-v2-scanned-borehole-table.fixture.pdf',
    ));
    const rendered = await renderPdfPageToImageBuffer(fixture, 1, {
      scale: 2,
      preprocessPolicy: 'region-v2',
    });
    expect(rendered).not.toBeNull();
    const parts = {
      ...buildParts(),
      pageHash: hashBuffer(rendered!.buffer),
      preprocessingVersion: 'page-evidence-preprocess-v4:region-v2',
    };

    writePageEvidenceCache(parts, {
      textHint: 'Recovered OCR text from region-v2 fixture.',
      source: 'vision-ocr',
      warnings: [],
      transformed: true,
      preprocessing: rendered!.preprocessing,
      createdAt: '2026-05-31T00:00:00.000Z',
    });

    const cached = readPageEvidenceCache(parts);
    const assets = cached?.preprocessing?.regions
      .filter((region) => region.id.startsWith('region-v2-'))
      .map((region) => region.asset)
      .filter((asset): asset is NonNullable<typeof asset> => !!asset);
    expect(assets?.length).toBeGreaterThanOrEqual(2);
    for (const asset of assets ?? []) {
      expect(asset).toMatchObject({
        mimeType: 'image/png',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        normalized: true,
        cacheRelativePath: expect.stringMatching(/^assets\//),
      });
      expect(readFileSync(getPageEvidenceCacheAssetPath(asset.cacheRelativePath!)).length).toBe(asset.byteLength);
    }

    const raw = JSON.parse(readFileSync(getPageEvidenceCachePath(parts), 'utf-8'));
    const rawAssets = raw.preprocessing.regions
      .filter((region: any) => String(region.id).startsWith('region-v2-'))
      .map((region: any) => region.asset)
      .filter(Boolean);
    expect(rawAssets.length).toBeGreaterThanOrEqual(2);
    expect(rawAssets.every((asset: any) => asset.dataBase64 === undefined && /^assets\//.test(asset.cacheRelativePath))).toBe(true);
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

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { preprocessVisionImageBuffer, renderPdfPageToImageBuffer } from '../src/vision/preprocess.js';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('vision image preprocessing', () => {
  it('records normalization operations and detects table/log-panel region candidates', async () => {
    const svg = `
      <svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1100" fill="white"/>
        <g stroke="black" stroke-width="3">
          <rect x="120" y="100" width="400" height="400" fill="none"/>
          <line x1="120" y1="200" x2="520" y2="200"/>
          <line x1="120" y1="300" x2="520" y2="300"/>
          <line x1="120" y1="400" x2="520" y2="400"/>
          <line x1="220" y1="100" x2="220" y2="500"/>
          <line x1="320" y1="100" x2="320" y2="500"/>
          <line x1="420" y1="100" x2="420" y2="500"/>
        </g>
        <g fill="black">
          <rect x="650" y="850" width="120" height="10"/>
          <rect x="650" y="875" width="90" height="10"/>
        </g>
      </svg>
    `;
    const input = await sharp(Buffer.from(svg)).png().toBuffer();

    const result = await preprocessVisionImageBuffer(input, 'image/png');

    expect(result.mimeType).toBe('image/png');
    expect(result.transformed).toBe(true);
    expect(result.preprocessing).toMatchObject({
      pipelineVersion: 'vision-image-preprocess-v2',
      policy: 'ocr-optimized',
      transformed: true,
    });
    expect(result.preprocessing.operations).toEqual(expect.arrayContaining([
      'trim-white-margins-threshold-10',
      'resize-inside-1800-no-enlarge',
      'detect-table-log-panel-candidate',
      'score-preprocessing-regions',
      'normalize-region-crop-assets',
    ]));
    expect(result.preprocessing.quality).toMatchObject({
      score: expect.any(Number),
      contentCoverageRatio: expect.any(Number),
      darkPixelRatio: expect.any(Number),
      regionCoverageRatio: expect.any(Number),
      regionCount: expect.any(Number),
      cropAssetCount: expect.any(Number),
      deskew: {
        method: 'projection-profile',
        applied: expect.any(Boolean),
      },
    });
    expect(result.preprocessing.output.width).toBeGreaterThan(0);
    expect(result.preprocessing.output.height).toBeGreaterThan(0);
    expect(result.preprocessing.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'normalized-full-page',
        source: 'preprocessing',
        label: 'normalized full page',
        bbox2d: [0, 0, 1, 1],
        coverageRatio: 1,
      }),
      expect.objectContaining({
        id: 'table-log-panel-candidate',
        source: 'preprocessing',
        label: 'detected table/log panel candidate',
      }),
    ]));
    const panel = result.preprocessing.regions.find((region) => region.id === 'table-log-panel-candidate');
    expect(panel?.coverageRatio).toBeGreaterThan(0.05);
    expect(panel?.coverageRatio).toBeLessThan(0.8);
    expect(panel?.quality?.score).toBeGreaterThan(0.4);
    expect(panel?.asset).toMatchObject({
      mimeType: 'image/png',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      dataBase64: expect.any(String),
      width: expect.any(Number),
      height: expect.any(Number),
      normalized: true,
    });
    expect(panel?.asset?.byteLength).toBeGreaterThan(0);
  });

  it('deskews skewed table/log pages and keeps multiple normalized crop candidates', async () => {
    const svg = `
      <svg width="1200" height="1000" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="1000" fill="white"/>
        <g stroke="black" stroke-width="4" fill="none">
          <rect x="110" y="100" width="360" height="760"/>
          <line x1="110" y1="220" x2="470" y2="220"/>
          <line x1="110" y1="340" x2="470" y2="340"/>
          <line x1="110" y1="460" x2="470" y2="460"/>
          <line x1="110" y1="580" x2="470" y2="580"/>
          <line x1="110" y1="700" x2="470" y2="700"/>
          <line x1="230" y1="100" x2="230" y2="860"/>
          <line x1="350" y1="100" x2="350" y2="860"/>
          <rect x="700" y="130" width="320" height="700"/>
          <line x1="700" y1="250" x2="1020" y2="250"/>
          <line x1="700" y1="370" x2="1020" y2="370"/>
          <line x1="700" y1="490" x2="1020" y2="490"/>
          <line x1="700" y1="610" x2="1020" y2="610"/>
          <line x1="700" y1="730" x2="1020" y2="730"/>
          <line x1="800" y1="130" x2="800" y2="830"/>
          <line x1="920" y1="130" x2="920" y2="830"/>
        </g>
      </svg>
    `;
    const input = await sharp(Buffer.from(svg))
      .rotate(2, { background: '#ffffff' })
      .png()
      .toBuffer();

    const result = await preprocessVisionImageBuffer(input, 'image/png');

    expect(result.preprocessing.quality?.deskew.applied).toBe(true);
    expect(Math.abs(result.preprocessing.quality?.deskew.angleDeg ?? 0)).toBeGreaterThan(0.5);
    expect(result.preprocessing.operations.some((operation) => operation.startsWith('deskew-angle-'))).toBe(true);
    expect(result.preprocessing.operations).toContain('detect-multiple-table-log-candidates');
    const cropRegions = result.preprocessing.regions.filter((region) =>
      region.id.includes('panel-candidate') && region.asset,
    );
    expect(cropRegions.length).toBeGreaterThanOrEqual(2);
    expect(cropRegions.every((region) => region.asset?.normalized === true)).toBe(true);
  });

  it('supports region-v2 fine deskew and borehole/table crop scoring', async () => {
    const svg = `
      <svg width="1300" height="1100" xmlns="http://www.w3.org/2000/svg">
        <rect width="1300" height="1100" fill="white"/>
        <g stroke="black" stroke-width="4" fill="none">
          <rect x="90" y="90" width="270" height="860"/>
          <line x1="90" y1="230" x2="360" y2="230"/>
          <line x1="90" y1="370" x2="360" y2="370"/>
          <line x1="90" y1="510" x2="360" y2="510"/>
          <line x1="90" y1="650" x2="360" y2="650"/>
          <line x1="90" y1="790" x2="360" y2="790"/>
          <line x1="180" y1="90" x2="180" y2="950"/>
          <line x1="270" y1="90" x2="270" y2="950"/>
          <rect x="500" y="130" width="660" height="420"/>
          <line x1="500" y1="235" x2="1160" y2="235"/>
          <line x1="500" y1="340" x2="1160" y2="340"/>
          <line x1="500" y1="445" x2="1160" y2="445"/>
          <line x1="665" y1="130" x2="665" y2="550"/>
          <line x1="830" y1="130" x2="830" y2="550"/>
          <line x1="995" y1="130" x2="995" y2="550"/>
        </g>
      </svg>
    `;
    const input = await sharp(Buffer.from(svg))
      .rotate(-1.4, { background: '#ffffff' })
      .png()
      .toBuffer();

    const result = await preprocessVisionImageBuffer(input, 'image/png', 'region-v2');

    expect(result.preprocessing.policy).toBe('region-v2');
    expect(result.preprocessing.quality?.deskew.method).toBe('projection-profile-fine');
    expect(result.preprocessing.operations).toEqual(expect.arrayContaining([
      'resize-inside-2200-no-enlarge',
      'detect-region-v2-borehole-log-strip',
      'detect-region-v2-table-panel',
      'score-preprocessing-regions',
      'normalize-region-crop-assets',
    ]));
    expect(result.preprocessing.operations.some((operation) =>
      operation === 'projection-profile-fine-deskew'
      || operation === 'projection-profile-fine-deskew-not-applied',
    )).toBe(true);
    const regionV2Crops = result.preprocessing.regions.filter((region) => region.id.startsWith('region-v2-'));
    expect(regionV2Crops.length).toBeGreaterThanOrEqual(2);
    expect(regionV2Crops.every((region) => region.asset?.normalized === true)).toBe(true);
    expect(regionV2Crops.every((region) => (region.quality?.score ?? 0) > 0.4)).toBe(true);
    expect(result.preprocessing.quality?.regionCount).toBeGreaterThanOrEqual(regionV2Crops.length);
  });

  it('detects region-v2 crops from the committed scanned borehole/table PDF fixture', async () => {
    const fixture = readFileSync(join(
      testDir,
      'fixtures',
      'geotech-corpus',
      'region-v2-scanned-borehole-table.fixture.pdf',
    ));

    const result = await renderPdfPageToImageBuffer(fixture, 1, {
      scale: 2,
      preprocessPolicy: 'region-v2',
    });

    expect(result).not.toBeNull();
    expect(result?.preprocessing.policy).toBe('region-v2');
    expect(result?.preprocessing.operations).toEqual(expect.arrayContaining([
      'detect-region-v2-borehole-log-strip',
      'detect-region-v2-table-panel',
      'score-preprocessing-regions',
      'normalize-region-crop-assets',
    ]));
    const regionV2Crops = result!.preprocessing.regions.filter((region) =>
      region.id.startsWith('region-v2-') && region.asset?.normalized === true,
    );
    expect(regionV2Crops.length).toBeGreaterThanOrEqual(2);
    expect(result?.preprocessing.quality?.regionCount).toBeGreaterThanOrEqual(regionV2Crops.length);
    expect(result?.preprocessing.quality?.cropAssetCount).toBeGreaterThanOrEqual(2);
    expect(regionV2Crops.every((region) => (region.quality?.score ?? 0) > 0.4)).toBe(true);
  });

  it('keeps preprocessing v2 region coverage across broader scanned fixture types', async () => {
    const fixtures = [
      {
        fileName: 'preprocess-v2-cpt-table.fixture.pdf',
        label: 'CPT table',
        expectedOperations: ['detect-region-v2-table-panel'],
        minCrops: 1,
      },
      {
        fileName: 'preprocess-v2-lab-table.fixture.pdf',
        label: 'lab table',
        expectedOperations: ['detect-region-v2-table-panel'],
        minCrops: 1,
      },
      {
        fileName: 'preprocess-v2-mixed-scanned-report.fixture.pdf',
        label: 'mixed scanned report',
        expectedOperations: ['detect-region-v2-borehole-log-strip', 'detect-region-v2-table-panel'],
        minCrops: 2,
      },
    ];

    for (const fixture of fixtures) {
      const input = readFileSync(join(testDir, 'fixtures', 'geotech-corpus', fixture.fileName));
      const result = await renderPdfPageToImageBuffer(input, 1, {
        scale: 2,
        preprocessPolicy: 'region-v2',
      });

      expect(result, fixture.label).not.toBeNull();
      expect(result?.preprocessing.policy, fixture.label).toBe('region-v2');
      expect(result?.preprocessing.operations, fixture.label).toEqual(expect.arrayContaining([
        ...fixture.expectedOperations,
        'score-preprocessing-regions',
        'normalize-region-crop-assets',
      ]));
      const regionV2Crops = result!.preprocessing.regions.filter((region) =>
        region.id.startsWith('region-v2-') && region.asset?.normalized === true,
      );
      expect(regionV2Crops.length, fixture.label).toBeGreaterThanOrEqual(fixture.minCrops);
      expect(result?.preprocessing.quality?.cropAssetCount, fixture.label).toBeGreaterThanOrEqual(fixture.minCrops);
      expect(result?.preprocessing.quality?.regionCount, fixture.label).toBeGreaterThanOrEqual(regionV2Crops.length);
      const averageRegionQuality = regionV2Crops.reduce((sum, region) =>
        sum + (region.quality?.score ?? 0), 0) / regionV2Crops.length;
      expect(averageRegionQuality, fixture.label).toBeGreaterThan(0.4);
      expect(regionV2Crops.every((region) => (region.quality?.score ?? 0) > 0.35), fixture.label).toBe(true);
    }
  });
});

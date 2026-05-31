import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeSignalFile } from '../src/index.js';

function minimalWorkbookXml(sheetXml: string, sheetName = 'Daily'): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  });
}

describe('signal analysis', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('analyzes grouped timestamp signals with thresholds and missing intervals', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement-monitoring.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument_id,location,settlement_mm',
        '2026-01-01T00:00:00Z,SM-1,A,0',
        '2026-01-02T00:00:00Z,SM-1,A,1',
        '2026-01-05T00:00:00Z,SM-1,A,8',
        '2026-01-01T00:00:00Z,SM-2,B,0',
        '2026-01-02T00:00:00Z,SM-2,B,0.5',
      ].join('\n'),
      'utf-8',
    );

    const result = await analyzeSignalFile(filePath, {
      type: 'settlement',
      threshold: 5,
      rateThreshold: 2,
      expectedIntervalHours: 24,
    });

    expect(result.schemaVersion).toBe('signal-analysis.v0');
    expect(result.signalType).toBe('settlement');
    expect(result.source.rowsAnalyzed).toBe(5);
    expect(result.columns.value).toBe('settlement_mm');
    expect(result.series.map((series) => series.id)).toEqual(['SM-1', 'SM-2']);
    expect(result.trendSummary.find((trend) => trend.seriesId === 'SM-1')).toMatchObject({
      count: 3,
      delta: 8,
      direction: 'increasing',
    });
    expect(result.thresholdFlags.some((flag) => flag.kind === 'value-threshold' && flag.seriesId === 'SM-1')).toBe(true);
    expect(result.thresholdFlags.some((flag) => flag.kind === 'rate-threshold' && flag.seriesId === 'SM-1')).toBe(true);
    expect(result.missingIntervals).toEqual([
      expect.objectContaining({
        seriesId: 'SM-1',
        gapHours: 72,
        missingIntervals: 2,
      }),
    ]);
    expect(result.rateOfChange.find((rate) => rate.seriesId === 'SM-1')?.unit).toBe('per-day');
  });

  it('supports depth-based inclinometer profiles without timestamps', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-depth-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'inclinometer.csv');
    await writeFile(
      filePath,
      [
        'depth_m,instrument,displacement_mm',
        '0,I-1,0',
        '5,I-1,3',
        '10,I-1,7',
      ].join('\n'),
      'utf-8',
    );

    const result = await analyzeSignalFile(filePath);

    expect(result.signalType).toBe('inclinometer');
    expect(result.columns.depth).toBe('depth_m');
    expect(result.trendSummary[0].slopeUnit).toBe('per-meter');
    expect(result.series[0].x).toEqual([0, 5, 10]);
  });

  it('analyzes xlsx monitoring sheets with explicit sheet selection', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-xlsx-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement-readings.xlsx');
    const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet><sheetData>
        <row r="1">
          <c r="A1" t="inlineStr"><is><t>date</t></is></c>
          <c r="B1" t="inlineStr"><is><t>instrument</t></is></c>
          <c r="C1" t="inlineStr"><is><t>settlement_mm</t></is></c>
        </row>
        <row r="2">
          <c r="A2" t="inlineStr"><is><t>2026-01-01T00:00:00Z</t></is></c>
          <c r="B2" t="inlineStr"><is><t>SM-X</t></is></c>
          <c r="C2"><v>0</v></c>
        </row>
        <row r="3">
          <c r="A3" t="inlineStr"><is><t>2026-01-03T00:00:00Z</t></is></c>
          <c r="B3" t="inlineStr"><is><t>SM-X</t></is></c>
          <c r="C3"><v>6</v></c>
        </row>
      </sheetData></worksheet>`;
    await writeFile(filePath, minimalWorkbookXml(sheetXml, 'Daily'));

    const result = await analyzeSignalFile(filePath, {
      sheetName: 'Daily',
      type: 'settlement',
      threshold: 5,
      rateThreshold: 2,
      expectedIntervalHours: 24,
    });

    expect(result.source).toMatchObject({
      format: 'xlsx',
      sheetName: 'Daily',
      rowsAnalyzed: 2,
      rowsRejected: 0,
    });
    expect(result.series[0]).toMatchObject({
      id: 'SM-X',
      y: [0, 6],
    });
    expect(result.trendSummary[0]).toMatchObject({
      delta: 6,
      slopeUnit: 'per-day',
      direction: 'increasing',
    });
    expect(result.thresholdFlags).toEqual([
      expect.objectContaining({ kind: 'value-threshold', seriesId: 'SM-X', value: 6 }),
      expect.objectContaining({ kind: 'rate-threshold', seriesId: 'SM-X', value: 3 }),
    ]);
    expect(result.missingIntervals).toEqual([
      expect.objectContaining({ seriesId: 'SM-X', gapHours: 48, missingIntervals: 1 }),
    ]);
  });

  it('parses Excel serial dates and keeps timestamp-based trend semantics', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-xlsx-serial-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement-serials.xlsx');
    const firstSerial = 46023;
    const secondSerial = 46025;
    const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet><sheetData>
        <row r="1">
          <c r="A1" t="inlineStr"><is><t>date</t></is></c>
          <c r="B1" t="inlineStr"><is><t>instrument</t></is></c>
          <c r="C1" t="inlineStr"><is><t>settlement_mm</t></is></c>
        </row>
        <row r="2">
          <c r="A2"><v>${firstSerial}</v></c>
          <c r="B2" t="inlineStr"><is><t>SM-X</t></is></c>
          <c r="C2"><v>0</v></c>
        </row>
        <row r="3">
          <c r="A3"><v>${secondSerial}</v></c>
          <c r="B3" t="inlineStr"><is><t>SM-X</t></is></c>
          <c r="C3"><v>4</v></c>
        </row>
      </sheetData></worksheet>`;
    await writeFile(filePath, minimalWorkbookXml(sheetXml, 'Daily'));

    const result = await analyzeSignalFile(filePath, {
      sheetName: 'Daily',
      type: 'settlement',
    });

    expect(result.source.rowsAnalyzed).toBe(2);
    expect(result.source.rowsRejected).toBe(0);
    expect(result.series[0].x).toEqual([
      new Date(Date.UTC(1899, 11, 30) + firstSerial * 86_400_000).toISOString(),
      new Date(Date.UTC(1899, 11, 30) + secondSerial * 86_400_000).toISOString(),
    ]);
    expect(result.trendSummary[0]).toMatchObject({
      slope: 2,
      slopeUnit: 'per-day',
    });
    expect(result.thresholdFlags).toEqual([]);
  });

  it('rejects invalid timestamps instead of silently changing rate semantics', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-invalid-time-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement-invalid-time.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument_id,settlement_mm',
        '2026-01-01T00:00:00Z,SM-1,0',
        'not-a-date,SM-1,10',
        '2026-01-03T00:00:00Z,SM-1,4',
      ].join('\n'),
      'utf-8',
    );

    const result = await analyzeSignalFile(filePath, {
      type: 'settlement',
    });

    expect(result.source.rowsAnalyzed).toBe(2);
    expect(result.source.rowsRejected).toBe(1);
    expect(result.warnings).toContain('Rejected row with invalid timestamp in column "timestamp".');
    expect(result.trendSummary[0]).toMatchObject({
      slope: 2,
      slopeUnit: 'per-day',
    });
    expect(result.thresholdFlags).toEqual([]);
  });

  it('applies named instrument threshold profiles with review-gated metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-profile-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'piezometer.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument,pore_pressure_kpa',
        '2026-01-01T00:00:00Z,PZ-1,10',
        '2026-01-02T00:00:00Z,PZ-1,25',
        '2026-01-05T00:00:00Z,PZ-1,62',
      ].join('\n'),
      'utf-8',
    );

    const result = await analyzeSignalFile(filePath, {
      type: 'piezometer',
      thresholdProfile: 'piezometer-review-kpa',
    });

    expect(result.thresholdProfile).toMatchObject({
      id: 'piezometer-review-kpa',
      signalType: 'piezometer',
      explicitOverrides: {
        threshold: false,
        rateThreshold: false,
        expectedIntervalHours: false,
      },
    });
    expect(result.thresholdProfile?.reviewGates).toContain('project-trigger-levels-required');
    expect(result.thresholdFlags).toEqual([
      expect.objectContaining({
        kind: 'value-threshold',
        source: 'threshold-profile',
        profileId: 'piezometer-review-kpa',
        value: 62,
        threshold: 50,
      }),
      expect.objectContaining({
        kind: 'rate-threshold',
        source: 'threshold-profile',
        profileId: 'piezometer-review-kpa',
        value: 15,
        threshold: 10,
      }),
      expect.objectContaining({
        kind: 'rate-threshold',
        source: 'threshold-profile',
        profileId: 'piezometer-review-kpa',
        value: 12.333333,
        threshold: 10,
      }),
    ]);
    expect(result.missingIntervals).toEqual([
      expect.objectContaining({
        seriesId: 'PZ-1',
        gapHours: 72,
        missingIntervals: 2,
      }),
    ]);
    expect(result.warnings.join(' ')).toMatch(/generic review thresholds/i);
  });

  it('supports auto profiles with explicit project-threshold overrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-profile-override-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument,settlement_mm',
        '2026-01-01T00:00:00Z,SM-1,0',
        '2026-01-02T00:00:00Z,SM-1,7',
      ].join('\n'),
      'utf-8',
    );

    const result = await analyzeSignalFile(filePath, {
      type: 'settlement',
      thresholdProfile: 'auto',
      threshold: 6,
      rateThreshold: 6,
    });

    expect(result.thresholdProfile).toMatchObject({
      id: 'settlement-review-mm',
      source: 'auto-profile',
      explicitOverrides: {
        threshold: true,
        rateThreshold: true,
        expectedIntervalHours: false,
      },
    });
    expect(result.thresholdFlags).toEqual([
      expect.objectContaining({ kind: 'value-threshold', threshold: 6, profileId: 'settlement-review-mm' }),
      expect.objectContaining({ kind: 'rate-threshold', threshold: 6, profileId: 'settlement-review-mm' }),
    ]);
  });

  it('infers vibration PPV and load-test value columns for benchmark fixtures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-vibration-load-'));
    tempDirs.push(dir);
    const vibrationPath = join(dir, 'vibration.csv');
    const loadPath = join(dir, 'pile-load-test.csv');
    await writeFile(
      vibrationPath,
      [
        'timestamp,instrument,ppv_mm_s',
        '2026-01-01T00:00:00Z,VIB-1,1.1',
        '2026-01-01T00:05:00Z,VIB-1,5.4',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(
      loadPath,
      [
        'timestamp,instrument,load_kn',
        '2026-01-01T00:00:00Z,PLT-1,0',
        '2026-01-01T01:00:00Z,PLT-1,520',
      ].join('\n'),
      'utf-8',
    );

    const vibration = await analyzeSignalFile(vibrationPath, {
      type: 'vibration',
      thresholdProfile: 'auto',
    });
    const load = await analyzeSignalFile(loadPath, {
      type: 'load-test',
      thresholdProfile: 'auto',
    });

    expect(vibration.columns.value).toBe('ppv_mm_s');
    expect(vibration.thresholdProfile?.id).toBe('vibration-ppv-review-mm-s');
    expect(vibration.thresholdFlags).toEqual([
      expect.objectContaining({ kind: 'value-threshold', value: 5.4, threshold: 5 }),
    ]);
    expect(load.columns.value).toBe('load_kn');
    expect(load.thresholdProfile?.id).toBe('load-test-review-kn');
    expect(load.thresholdFlags).toEqual([
      expect.objectContaining({ kind: 'rate-threshold', value: 12480, threshold: 250 }),
    ]);
  });

  it('rejects mismatched threshold profiles instead of applying wrong instrument limits', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-profile-mismatch-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'settlement.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument,settlement_mm',
        '2026-01-01T00:00:00Z,SM-1,0',
        '2026-01-02T00:00:00Z,SM-1,7',
      ].join('\n'),
      'utf-8',
    );

    await expect(analyzeSignalFile(filePath, {
      type: 'settlement',
      thresholdProfile: 'vibration-ppv-review-mm-s',
    }))
      .rejects
      .toThrow(/profile .* is for vibration/i);
  });

  it('fails when no analyzable rows remain after validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-signal-empty-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'bad-monitoring.csv');
    await writeFile(
      filePath,
      [
        'timestamp,instrument_id,settlement_mm',
        'not-a-date,SM-1,1',
        'also-bad,SM-1,2',
      ].join('\n'),
      'utf-8',
    );

    await expect(analyzeSignalFile(filePath, { type: 'settlement' }))
      .rejects
      .toThrow(/no analyzable rows/i);
  });
});

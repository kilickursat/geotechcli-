import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChartsFromJson, loadVisualizationSource } from '../src/util/viz.js';

describe('visualization utilities', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('extracts liquefaction charts from JSON results', () => {
    const charts = buildChartsFromJson({
      method: 'boulanger-idriss-2014',
      estimatedSettlement: 24,
      layers: [
        { depth: 2, factorOfSafety: 1.2, CSR: 0.18, CRR: 0.22, N160cs: 15.5 },
        { depth: 4, factorOfSafety: 0.9, CSR: 0.23, CRR: 0.2, N160cs: 11.8 },
      ],
    }, 'liq-demo');

    expect(charts.length).toBeGreaterThanOrEqual(3);
    expect(charts.some((chart) => chart.title.includes('Liquefaction depth plots'))).toBe(true);
    expect(charts.some((chart) => chart.title.includes('Factor Of Safety'))).toBe(true);
  });

  it('loads numeric CSV data into chart specs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-csv-'));
    tempDirs.push(dir);

    const csvPath = join(dir, 'showcase.csv');
    await writeFile(
      csvPath,
      ['distance_m,settlement_mm,heave_mm', '-10,3.2,0.1', '0,7.5,0.4', '10,3.1,0.1'].join('\n'),
      'utf-8',
    );

    const source = await loadVisualizationSource(csvPath);
    expect(source.sourceType).toBe('csv');
    expect(source.charts.length).toBeGreaterThanOrEqual(2);
    expect(source.charts[0]?.title).toContain('Distance m');
  });

  it('loads workbook sheets into chart specs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-xlsx-'));
    tempDirs.push(dir);

    const workbookPath = join(dir, 'showcase.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('pile_profile');
    sheet.columns = [
      { header: 'depth_m', key: 'depth_m' },
      { header: 'unit_shaft_friction_kpa', key: 'unit_shaft_friction_kpa' },
      { header: 'cumulative_shaft_kn', key: 'cumulative_shaft_kn' },
    ];
    sheet.addRows([
      { depth_m: 0, unit_shaft_friction_kpa: 18, cumulative_shaft_kn: 42 },
      { depth_m: 4, unit_shaft_friction_kpa: 34, cumulative_shaft_kn: 183 },
      { depth_m: 8, unit_shaft_friction_kpa: 49, cumulative_shaft_kn: 392 },
    ]);
    await workbook.xlsx.writeFile(workbookPath);

    const source = await loadVisualizationSource(workbookPath);
    expect(source.sourceType).toBe('xlsx');
    expect(source.charts.some((chart) => chart.title.includes('pile_profile sheet'))).toBe(true);
  });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAtterbergChart,
  buildChartsFromJson,
  buildMohrCircleChart,
  loadVisualizationSource,
} from '../src/util/viz.js';

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

  it('turns GroundModel JSON into a coordinate map chart', () => {
    const charts = buildChartsFromJson({
      schemaVersion: 'ground-model.v1',
      generatedAt: '2026-05-09T00:00:00.000Z',
      project: { rootPath: '/tmp/site' },
      coordinateSystem: {
        kind: 'local-grid',
        warnings: ['Easting/northing coordinates were detected without a declared CRS.'],
      },
      boreholes: [
        {
          id: 'BH-01',
          coordinates: {
            easting: 500000,
            northing: 3200000,
            evidenceIds: ['ev-1'],
            confidence: 0.92,
          },
          sptTests: [
            {
              depth: 1.5,
              nValue: 12,
              evidenceIds: ['ev-spt-1'],
              confidence: 0.9,
              warnings: [],
            },
            {
              depth: 3,
              nValue: 18,
              evidenceIds: ['ev-spt-2'],
              confidence: 0.9,
              warnings: [],
            },
          ],
          strata: [
            {
              boreholeId: 'BH-01',
              topDepth: 0,
              bottomDepth: 2,
              description: 'medium dense silty sand',
              evidenceIds: ['ev-strata-1'],
              confidence: 0.86,
              warnings: [],
            },
          ],
          groundwater: [
            {
              boreholeId: 'BH-01',
              depth: 1.2,
              evidenceIds: ['ev-gwl-1'],
              confidence: 0.88,
              warnings: [],
            },
          ],
          evidenceIds: ['ev-1'],
          confidence: 0.92,
          warnings: [],
        },
      ],
      sptTests: [
        {
          depth: 1.5,
          nValue: 12,
          evidenceIds: ['ev-spt-1'],
          confidence: 0.9,
          warnings: [],
        },
      ],
      strata: [],
      groundwater: [
        {
          boreholeId: 'BH-01',
          depth: 1.2,
          evidenceIds: ['ev-gwl-1'],
          confidence: 0.88,
          warnings: [],
        },
      ],
      labTests: [
        {
          sampleId: 'S-01',
          boreholeId: 'BH-01',
          depth: 2,
          parameters: [],
          evidenceIds: ['ev-ll-1'],
          confidence: 0.87,
          warnings: [],
        },
      ],
      parameters: [
        {
          name: 'liquidLimit',
          value: 42,
          unit: '%',
          boreholeId: 'BH-01',
          sampleId: 'S-01',
          depth: 2,
          evidenceIds: ['ev-ll-1'],
          confidence: 0.87,
          warnings: [],
        },
      ],
      monitoringSeries: [],
      evidence: [],
      rejectedObservations: [],
      warnings: [],
      stats: {
        boreholes: 1,
        sptTests: 2,
        strata: 1,
        groundwaterObservations: 1,
        labTests: 1,
        parameters: 1,
        monitoringSeries: 0,
        evidenceRefs: 1,
        rejectedObservations: 0,
      },
    }, 'ground-model');

    expect(charts.length).toBeGreaterThanOrEqual(4);
    expect(charts[0]?.id).toContain('ground-model-map');
    expect(charts[0]?.kind).toBe('xy');
    expect(charts[0]?.xLabel).toBe('Easting');
    expect(charts[0]?.xySeries?.[0]?.points[0]?.label).toBe('BH-01');
    expect(charts[0]?.xySeries?.[0]?.points[0]?.meta?.evidence).toBe('ev-1');
    expect(charts[0]?.note).toContain('Local-grid map points');
    expect(charts.some((chart) => chart.id.includes('spt-depth'))).toBe(true);
    expect(charts.some((chart) => chart.id.includes('lab-liquidlimit'))).toBe(true);
    expect(charts.some((chart) => chart.id.includes('groundwater-depth'))).toBe(true);
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

  it('avoids mixed-unit overview charts for generic table sources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-mixed-units-'));
    tempDirs.push(dir);

    const csvPath = join(dir, 'mixed-units.csv');
    await writeFile(
      csvPath,
      [
        'depth_m,unit_shaft_friction_kpa,cumulative_shaft_kn',
        '0,18,42',
        '4,34,183',
        '8,49,392',
      ].join('\n'),
      'utf-8',
    );

    const source = await loadVisualizationSource(csvPath);
    expect(source.charts.some((chart) => chart.yLabel === 'Value')).toBe(false);
    expect(source.charts).toHaveLength(2);
  });

  it('builds a Mohr circle preset chart', () => {
    const chart = buildMohrCircleChart({
      sigma1: 240,
      sigma3: 80,
      cohesion: 10,
      frictionAngle: 28,
    });

    expect(chart.kind).toBe('xy');
    expect(chart.xySeries?.some((series) => series.label === 'Mohr circle')).toBe(true);
    expect(chart.note).toContain('radius');
  });

  it('builds an Atterberg chart and infers PI from PL', () => {
    const chart = buildAtterbergChart({
      liquidLimit: 55,
      plasticLimit: 25,
    });

    expect(chart.kind).toBe('xy');
    expect(chart.note).toContain('CH region');
    expect(chart.xySeries?.some((series) => series.label === 'Sample point')).toBe(true);
  });

  it('loads compaction template charts from CSV data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-compaction-'));
    tempDirs.push(dir);

    const csvPath = join(dir, 'compaction.csv');
    await writeFile(
      csvPath,
      [
        'moisture_content,dry_density_kn_m3',
        '8,16.8',
        '10,17.7',
        '12,18.5',
        '14,19.1',
        '16,19.4',
      ].join('\n'),
      'utf-8',
    );

    const source = await loadVisualizationSource(csvPath, { template: 'compaction' });
    expect(source.charts[0]?.kind).toBe('xy');
    expect(source.charts[0]?.title).toContain('compaction curve');
  });

  it('loads gradation template charts from CSV data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-gradation-'));
    tempDirs.push(dir);

    const csvPath = join(dir, 'gradation.csv');
    await writeFile(
      csvPath,
      [
        'particle_size_mm,percent_passing',
        '0.075,8',
        '0.15,14',
        '0.3,27',
        '0.6,46',
        '1.18,63',
        '2.36,78',
      ].join('\n'),
      'utf-8',
    );

    const source = await loadVisualizationSource(csvPath, { template: 'gradation' });
    expect(source.charts[0]?.kind).toBe('xy');
    expect(source.charts[0]?.xScale).toBe('log10');
  });

  it('loads CPT template charts as inverted depth profiles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-viz-cpt-'));
    tempDirs.push(dir);

    const csvPath = join(dir, 'cpt.csv');
    await writeFile(
      csvPath,
      [
        'depth_m,qc_mpa,fs_kpa,rf_percent',
        '1,2.4,45,1.2',
        '3,5.8,82,1.4',
        '5,7.1,96,1.3',
      ].join('\n'),
      'utf-8',
    );

    const source = await loadVisualizationSource(csvPath, { template: 'cpt' });
    expect(source.charts.length).toBeGreaterThanOrEqual(3);
    expect(source.charts.every((chart) => chart.kind === 'xy')).toBe(true);
    expect(source.charts.every((chart) => chart.invertY)).toBe(true);
    expect(source.charts.every((chart) => chart.yLabel.includes('Depth'))).toBe(true);
  });
});

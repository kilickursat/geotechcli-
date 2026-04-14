import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import ExcelJS from 'exceljs';
import type { XYSeriesSpec } from '../ui/terminal.js';

export interface ChartSpec {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  kind: 'series' | 'xy';
  xValues?: number[];
  series?: number[][];
  labels?: string[];
  xySeries?: XYSeriesSpec[];
  xScale?: 'linear' | 'log10';
  invertY?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  note?: string;
}

export interface VisualizationSource {
  sourceType: 'json' | 'csv' | 'xlsx' | 'preset';
  sourceName: string;
  charts: ChartSpec[];
}

interface TableChartOptions {
  sourceName: string;
  titlePrefix?: string;
  xColumn?: string;
  yColumns?: string[];
}

export interface MohrCircleOptions {
  sigma1: number;
  sigma3: number;
  cohesion?: number;
  frictionAngle?: number;
}

export interface AtterbergChartOptions {
  liquidLimit: number;
  plasticityIndex?: number;
  plasticLimit?: number;
}

type TableRow = Record<string, string | number | boolean | null>;
type TableTemplate = 'compaction' | 'gradation' | 'cpt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (match) => match.toUpperCase());
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (normalized.length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function rowsFromCsv(content: string): TableRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: TableRow = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = cells[index] ?? '';
    }
    return row;
  });
}

function rowsFromWorksheet(worksheet: ExcelJS.Worksheet): TableRow[] {
  const rows: TableRow[] = [];
  let headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];

    if (rowNumber === 1) {
      headers = values.map((value, index) => String(value ?? `Column ${index + 1}`).trim());
      return;
    }

    const record: TableRow = {};
    headers.forEach((header, index) => {
      const value = values[index];
      if (value instanceof Date) {
        record[header] = value.toISOString();
      } else if (typeof value === 'object' && value && 'text' in value) {
        record[header] = String((value as { text?: unknown }).text ?? '');
      } else {
        record[header] = (value ?? '') as string | number | boolean | null;
      }
    });

    if (Object.values(record).some((value) => String(value ?? '').trim().length > 0)) {
      rows.push(record);
    }
  });

  return rows;
}

function inferNumericColumns(rows: TableRow[]): string[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  return headers.filter((header) => {
    let numericCount = 0;
    let nonEmptyCount = 0;

    for (const row of rows) {
      const raw = row[header];
      if (raw == null || String(raw).trim() === '') {
        continue;
      }
      nonEmptyCount += 1;
      if (toFiniteNumber(raw) !== null) {
        numericCount += 1;
      }
    }

    return nonEmptyCount > 0 && numericCount === nonEmptyCount;
  });
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findColumn(headers: string[], aliases: string[]): string | undefined {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
  return headers.find((header) => aliasSet.has(normalizeHeader(header)));
}

function expandDomain(min: number, max: number): [number, number] {
  if (min === max) {
    const delta = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    return [min - delta, max + delta];
  }
  return [min, max];
}

function buildXYChart(options: {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  series: XYSeriesSpec[];
  xScale?: 'linear' | 'log10';
  invertY?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  note?: string;
}): ChartSpec {
  return {
    id: options.id,
    title: options.title,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    kind: 'xy',
    xySeries: options.series,
    xScale: options.xScale ?? 'linear',
    invertY: options.invertY,
    xDomain: options.xDomain,
    yDomain: options.yDomain,
    note: options.note,
  };
}

export function buildChartsFromTable(rows: TableRow[], options: TableChartOptions): ChartSpec[] {
  if (rows.length === 0) {
    return [];
  }

  const numericColumns = inferNumericColumns(rows);
  if (numericColumns.length === 0) {
    return [];
  }

  const xColumn = options.xColumn && numericColumns.includes(options.xColumn)
    ? options.xColumn
    : numericColumns[0];

  const yColumns = options.yColumns?.length
    ? options.yColumns.filter((column) => numericColumns.includes(column) && column !== xColumn)
    : numericColumns.filter((column) => column !== xColumn);

  if (yColumns.length === 0) {
    return [];
  }

  const normalizedRows = rows
    .map((row, index) => {
      const xValue = toFiniteNumber(row[xColumn]) ?? index + 1;
      const mapped: TableRow = { __rowIndex: index + 1, __x: xValue };
      for (const key of Object.keys(row)) {
        mapped[key] = row[key];
      }
      return mapped;
    })
    .sort((left, right) => Number(left.__x) - Number(right.__x));

  const xValues = normalizedRows.map((row) => Number(row.__x));
  const charts: ChartSpec[] = [];
  const titlePrefix = options.titlePrefix ?? options.sourceName;
  const combinedSeries = yColumns
    .slice(0, 4)
    .map((column) => normalizedRows.map((row) => toFiniteNumber(row[column]) ?? 0));

  if (combinedSeries.length > 1) {
    charts.push({
      id: slugify(`${options.sourceName}-${xColumn}-overview`),
      title: `${titlePrefix}: ${yColumns.slice(0, 4).map(humanizeKey).join(', ')} vs ${humanizeKey(xColumn)}`,
      xLabel: humanizeKey(xColumn),
      yLabel: 'Value',
      kind: 'series',
      xValues,
      series: combinedSeries,
      labels: yColumns.slice(0, 4).map(humanizeKey),
      note: `Combined chart from ${normalizedRows.length} samples`,
    });
  }

  for (const column of yColumns) {
    charts.push({
      id: slugify(`${options.sourceName}-${xColumn}-${column}`),
      title: `${titlePrefix}: ${humanizeKey(column)} vs ${humanizeKey(xColumn)}`,
      xLabel: humanizeKey(xColumn),
      yLabel: humanizeKey(column),
      kind: 'series',
      xValues,
      series: [normalizedRows.map((row) => toFiniteNumber(row[column]) ?? 0)],
      labels: [humanizeKey(column)],
      note: `Samples: ${normalizedRows.length}`,
    });
  }

  return charts;
}

function buildCompactionChart(rows: TableRow[], sourceName: string): ChartSpec[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  const moistureColumn = findColumn(headers, [
    'moisture_content',
    'moisture_percent',
    'water_content',
    'water_content_percent',
    'w',
    'wc',
  ]);
  const densityColumn = findColumn(headers, [
    'dry_density',
    'dry_density_g_cm3',
    'dry_density_kn_m3',
    'dry_unit_weight',
    'gamma_d',
    'gd',
  ]);

  if (!moistureColumn || !densityColumn) {
    return [];
  }

  const points = rows
    .map((row) => ({
      x: toFiniteNumber(row[moistureColumn]) ?? Number.NaN,
      y: toFiniteNumber(row[densityColumn]) ?? Number.NaN,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((left, right) => left.x - right.x);

  if (points.length === 0) {
    return [];
  }

  const optimumPoint = points.reduce((best, point) => (point.y > best.y ? point : best), points[0]);
  return [
    buildXYChart({
      id: slugify(`${sourceName}-compaction-curve`),
      title: `${sourceName}: Moisture-density compaction curve`,
      xLabel: 'Moisture content (%)',
      yLabel: humanizeKey(densityColumn),
      series: [
        { label: 'Compaction curve', points, style: 'line', symbol: '*' },
        { label: 'Optimum point', points: [optimumPoint], style: 'scatter', symbol: 'o' },
      ],
      note: `Peak dry density ${optimumPoint.y.toFixed(2)} at moisture content ${optimumPoint.x.toFixed(2)}%`,
    }),
  ];
}

function buildGradationChart(rows: TableRow[], sourceName: string): ChartSpec[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  const sizeColumn = findColumn(headers, [
    'particle_size_mm',
    'grain_size_mm',
    'diameter_mm',
    'sieve_mm',
    'opening_mm',
    'size_mm',
  ]);
  const passingColumn = findColumn(headers, [
    'percent_passing',
    'passing_percent',
    'percent_finer',
    'finer_percent',
    'passing',
    'finer',
  ]);

  if (!sizeColumn || !passingColumn) {
    return [];
  }

  const points = rows
    .map((row) => ({
      x: toFiniteNumber(row[sizeColumn]) ?? Number.NaN,
      y: toFiniteNumber(row[passingColumn]) ?? Number.NaN,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x > 0)
    .sort((left, right) => left.x - right.x);

  if (points.length === 0) {
    return [];
  }

  const [xMin, xMax] = expandDomain(Math.min(...points.map((point) => point.x)), Math.max(...points.map((point) => point.x)));

  return [
    buildXYChart({
      id: slugify(`${sourceName}-gradation-curve`),
      title: `${sourceName}: Grain-size distribution curve`,
      xLabel: 'Particle size (mm)',
      yLabel: 'Percent passing (%)',
      xScale: 'log10',
      xDomain: [xMin, xMax],
      yDomain: [0, 100],
      series: [{ label: 'Percent passing', points, style: 'line', symbol: '*' }],
      note: 'Semilog gradation plot with logarithmic particle-size axis',
    }),
  ];
}

function buildCptCharts(rows: TableRow[], sourceName: string): ChartSpec[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  const depthColumn = findColumn(headers, ['depth', 'depth_m', 'z', 'elevation_depth']);
  if (!depthColumn) {
    return [];
  }

  const yColumns = [
    findColumn(headers, ['qc', 'qc_mpa', 'tip_resistance', 'cone_resistance']),
    findColumn(headers, ['fs', 'fs_kpa', 'friction_sleeve', 'sleeve_friction']),
    findColumn(headers, ['rf', 'friction_ratio', 'rf_percent']),
    findColumn(headers, ['u2', 'pore_pressure', 'pore_pressure_kpa']),
    findColumn(headers, ['ic', 'soil_behavior_index']),
  ].filter((value): value is string => Boolean(value));

  if (yColumns.length === 0) {
    return [];
  }

  return buildChartsFromTable(rows, {
    sourceName: `${sourceName}-cpt`,
    titlePrefix: 'CPT depth plots',
    xColumn: depthColumn,
    yColumns,
  });
}

function buildChartsFromTemplate(rows: TableRow[], template: TableTemplate, sourceName: string): ChartSpec[] {
  switch (template) {
    case 'compaction':
      return buildCompactionChart(rows, sourceName);
    case 'gradation':
      return buildGradationChart(rows, sourceName);
    case 'cpt':
      return buildCptCharts(rows, sourceName);
    default:
      return [];
  }
}

function classifyPlasticityPoint(liquidLimit: number, plasticityIndex: number): string {
  const aLine = 0.73 * (liquidLimit - 20);
  if (liquidLimit < 50) {
    if (plasticityIndex > aLine && plasticityIndex > 7) return 'CL region';
    if (plasticityIndex < 4 || plasticityIndex < aLine) return 'ML region';
    return 'CL-ML border';
  }
  return plasticityIndex > aLine ? 'CH region' : 'MH region';
}

export function buildAtterbergChart(options: AtterbergChartOptions): ChartSpec {
  const liquidLimit = options.liquidLimit;
  const plasticityIndex = options.plasticityIndex ?? (
    options.plasticLimit !== undefined ? liquidLimit - options.plasticLimit : undefined
  );

  if (!Number.isFinite(liquidLimit)) {
    throw new Error('Atterberg chart requires --ll / liquid limit.');
  }
  if (!Number.isFinite(plasticityIndex)) {
    throw new Error('Atterberg chart requires either --pi or both --ll and --pl.');
  }

  const pi = Number(plasticityIndex);
  const maxX = Math.max(100, liquidLimit + 10);
  const maxY = Math.max(60, pi + 10);
  const aLine = Array.from({ length: Math.max(2, Math.ceil(maxX - 20)) }, (_, index) => {
    const ll = 20 + index;
    return { x: ll, y: 0.73 * (ll - 20) };
  });
  const uLine = Array.from({ length: Math.max(2, Math.ceil(maxX - 8)) }, (_, index) => {
    const ll = 8 + index;
    return { x: ll, y: 0.9 * (ll - 8) };
  });

  return buildXYChart({
    id: slugify(`atterberg-${liquidLimit}-${pi}`),
    title: 'Atterberg plasticity chart',
    xLabel: 'Liquid limit (%)',
    yLabel: 'Plasticity index (%)',
    xDomain: [0, maxX],
    yDomain: [0, maxY],
    series: [
      { label: 'A-line', points: aLine, style: 'line', symbol: '*' },
      { label: 'U-line', points: uLine, style: 'line', symbol: '+' },
      { label: 'LL = 50', points: [{ x: 50, y: 0 }, { x: 50, y: maxY }], style: 'line', symbol: '|' },
      { label: 'Sample point', points: [{ x: liquidLimit, y: pi }], style: 'scatter', symbol: 'o' },
    ],
    note: `${classifyPlasticityPoint(liquidLimit, pi)} | A-line PI = 0.73(LL - 20), U-line PI = 0.9(LL - 8)`,
  });
}

export function buildMohrCircleChart(options: MohrCircleOptions): ChartSpec {
  if (!Number.isFinite(options.sigma1) || !Number.isFinite(options.sigma3)) {
    throw new Error('Mohr circle requires both --sigma1 and --sigma3.');
  }

  const sigma1 = Math.max(options.sigma1, options.sigma3);
  const sigma3 = Math.min(options.sigma1, options.sigma3);
  const center = (sigma1 + sigma3) / 2;
  const radius = (sigma1 - sigma3) / 2;
  const thetaSteps = 72;
  const circle = Array.from({ length: thetaSteps + 1 }, (_, index) => {
    const theta = (index / thetaSteps) * Math.PI * 2;
    return {
      x: center + radius * Math.cos(theta),
      y: radius * Math.sin(theta),
    };
  });

  const series: XYSeriesSpec[] = [
    { label: 'Mohr circle', points: circle, style: 'line', symbol: '*' },
    { label: 'Principal stresses', points: [{ x: sigma3, y: 0 }, { x: sigma1, y: 0 }], style: 'scatter', symbol: 'o' },
    { label: 'Max shear', points: [{ x: center, y: radius }, { x: center, y: -radius }], style: 'scatter', symbol: 'x' },
  ];

  let maxEnvelope = radius;
  if (Number.isFinite(options.cohesion) || Number.isFinite(options.frictionAngle)) {
    const cohesion = options.cohesion ?? 0;
    const frictionAngle = (options.frictionAngle ?? 0) * Math.PI / 180;
    const maxX = Math.max(sigma1 * 1.1, sigma3 + radius * 2);
    const envelope = Array.from({ length: 30 }, (_, index) => {
      const x = (index / 29) * maxX;
      return { x, y: cohesion + x * Math.tan(frictionAngle) };
    });
    maxEnvelope = Math.max(maxEnvelope, ...envelope.map((point) => point.y));
    series.push({ label: 'Failure envelope', points: envelope, style: 'line', symbol: '+' });
  }

  const [xMin, xMax] = expandDomain(Math.min(0, sigma3 - radius * 0.2), Math.max(sigma1 + radius * 0.2, sigma1 * 1.1));
  const yLimit = Math.max(radius, maxEnvelope) * 1.15 || 1;

  return buildXYChart({
    id: slugify(`mohr-circle-${sigma1}-${sigma3}`),
    title: 'Mohr circle',
    xLabel: 'Normal stress',
    yLabel: 'Shear stress',
    xDomain: [xMin, xMax],
    yDomain: [-yLimit, yLimit],
    series,
    note: `Center = ${center.toFixed(2)}, radius = ${radius.toFixed(2)}, tau_max = ${radius.toFixed(2)}`,
  });
}

export function buildChartsFromJson(data: unknown, sourceName: string): ChartSpec[] {
  const charts: ChartSpec[] = [];

  if (!isRecord(data)) {
    if (Array.isArray(data) && data.every((item) => isRecord(item))) {
      return buildChartsFromTable(data as TableRow[], { sourceName });
    }
    return charts;
  }

  if (Array.isArray(data.timeSettlement) && data.timeSettlement.every((item) => isRecord(item))) {
    const transformedRows = data.timeSettlement.map((item) => ({
      timeYears: toFiniteNumber(item.timeYears) ?? 0,
      settlement: toFiniteNumber(item.settlement) ?? 0,
      consolidationPercent: Math.round((toFiniteNumber(item.consolidation) ?? 0) * 1000) / 10,
    }));
    charts.push(
      ...buildChartsFromTable(transformedRows, {
        sourceName: `${sourceName}-time-settlement`,
        titlePrefix: 'Consolidation time curve',
        xColumn: 'timeYears',
        yColumns: ['settlement', 'consolidationPercent'],
      }),
    );
  }

  if (Array.isArray(data.profile) && data.profile.every((item) => isRecord(item))) {
    charts.push(
      ...buildChartsFromTable(data.profile as TableRow[], {
        sourceName: `${sourceName}-profile`,
        titlePrefix: 'Settlement profile',
        xColumn: 'x',
        yColumns: ['settlement'],
      }),
    );
  }

  if (Array.isArray(data.layers) && data.layers.every((item) => isRecord(item))) {
    const layerRows = data.layers as TableRow[];
    const firstLayer = layerRows[0];
    if ('CSR' in firstLayer && 'CRR' in firstLayer && 'factorOfSafety' in firstLayer && 'depth' in firstLayer) {
      charts.push(
        ...buildChartsFromTable(layerRows, {
          sourceName: `${sourceName}-liquefaction`,
          titlePrefix: 'Liquefaction depth plots',
          xColumn: 'depth',
          yColumns: ['factorOfSafety', 'CSR', 'CRR', 'N160cs'],
        }),
      );
    }
  }

  if (Array.isArray(data.shaftFrictionPerLayer) && data.shaftFrictionPerLayer.every((item) => isRecord(item))) {
    const rows = (data.shaftFrictionPerLayer as TableRow[]).map((item, index, items) => {
      const cumulative = items
        .slice(0, index + 1)
        .reduce((total, entry) => total + (toFiniteNumber(entry.shaftResistance) ?? 0), 0);

      return {
        depth: toFiniteNumber(item.depth) ?? 0,
        unitShaftFriction: toFiniteNumber(item.unitShaftFriction) ?? 0,
        shaftResistance: toFiniteNumber(item.shaftResistance) ?? 0,
        cumulativeShaftResistance: Math.round(cumulative * 100) / 100,
      };
    });

    charts.push(
      ...buildChartsFromTable(rows, {
        sourceName: `${sourceName}-pile`,
        titlePrefix: 'Pile capacity profile',
        xColumn: 'depth',
        yColumns: ['unitShaftFriction', 'shaftResistance', 'cumulativeShaftResistance'],
      }),
    );
  }

  if (Array.isArray(data.sliceResults) && data.sliceResults.every((item) => isRecord(item))) {
    charts.push(
      ...buildChartsFromTable(data.sliceResults as TableRow[], {
        sourceName: `${sourceName}-slope`,
        titlePrefix: 'Slope slice plots',
        xColumn: 'sliceNumber',
        yColumns: ['shearStrength', 'normalForce', 'weight', 'baseAngle'],
      }),
    );
  }

  if (charts.length > 0) {
    return charts;
  }

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.every((item) => isRecord(item))) {
      charts.push(
        ...buildChartsFromTable(value as TableRow[], {
          sourceName: `${sourceName}-${key}`,
          titlePrefix: humanizeKey(key),
        }),
      );
    }
  }

  return charts;
}

export async function loadVisualizationSource(
  filePath: string,
  options?: { sheetName?: string; xColumn?: string; yColumns?: string[]; template?: TableTemplate },
): Promise<VisualizationSource> {
  const extension = extname(filePath).toLowerCase();
  const sourceName = basename(filePath, extension);

  if (extension === '.json') {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;

    if (options?.template && Array.isArray(parsed) && parsed.every((item) => isRecord(item))) {
      const charts = buildChartsFromTemplate(parsed as TableRow[], options.template, sourceName);
      if (charts.length === 0) {
        throw new Error(`Template "${options.template}" could not find the expected columns in ${filePath}.`);
      }
      return {
        sourceType: 'json',
        sourceName,
        charts,
      };
    }

    return {
      sourceType: 'json',
      sourceName,
      charts: buildChartsFromJson(parsed, sourceName),
    };
  }

  if (extension === '.csv') {
    const rows = rowsFromCsv(readFileSync(filePath, 'utf-8'));
    const charts = options?.template
      ? buildChartsFromTemplate(rows, options.template, sourceName)
      : buildChartsFromTable(rows, {
        sourceName,
        xColumn: options?.xColumn,
        yColumns: options?.yColumns,
      });

    if (options?.template && charts.length === 0) {
      throw new Error(`Template "${options.template}" could not find the expected columns in ${filePath}.`);
    }

    return {
      sourceType: 'csv',
      sourceName,
      charts,
    };
  }

  if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheets = options?.sheetName
      ? workbook.worksheets.filter((sheet) => sheet.name === options.sheetName)
      : workbook.worksheets;

    if (worksheets.length === 0) {
      throw new Error(`Sheet "${options?.sheetName}" not found in ${filePath}.`);
    }

    const charts = worksheets.flatMap((worksheet) => {
      const rows = rowsFromWorksheet(worksheet);
      return options?.template
        ? buildChartsFromTemplate(rows, options.template, `${sourceName}-${worksheet.name}`)
        : buildChartsFromTable(rows, {
          sourceName: `${sourceName}-${worksheet.name}`,
          titlePrefix: `${worksheet.name} sheet`,
          xColumn: options?.xColumn,
          yColumns: options?.yColumns,
        });
    });

    if (options?.template && charts.length === 0) {
      throw new Error(`Template "${options.template}" could not find the expected columns in ${filePath}.`);
    }

    return {
      sourceType: 'xlsx',
      sourceName,
      charts,
    };
  }

  throw new Error(`Unsupported visualization source: ${filePath}. Use .json, .csv, or .xlsx.`);
}

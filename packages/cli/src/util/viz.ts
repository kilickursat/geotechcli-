import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import ExcelJS from 'exceljs';

export interface ChartSpec {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  xValues: number[];
  series: number[][];
  labels: string[];
  note?: string;
}

export interface VisualizationSource {
  sourceType: 'json' | 'csv' | 'xlsx';
  sourceName: string;
  charts: ChartSpec[];
}

interface TableChartOptions {
  sourceName: string;
  titlePrefix?: string;
  xColumn?: string;
  yColumns?: string[];
}

type TableRow = Record<string, string | number | boolean | null>;

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

  const yColumns = (options.yColumns?.length
    ? options.yColumns.filter((column) => numericColumns.includes(column) && column !== xColumn)
    : numericColumns.filter((column) => column !== xColumn));

  if (yColumns.length === 0) {
    return [];
  }

  const normalizedRows = rows
    .map((row, index) => {
      const xValue = xColumn ? toFiniteNumber(row[xColumn]) : index + 1;
      if (xValue === null) {
        return null;
      }

      const mapped: TableRow = { __rowIndex: index + 1 };
      for (const key of Object.keys(row)) {
        mapped[key] = row[key];
      }
      mapped.__x = xValue;
      return mapped;
    })
    .filter((row): row is TableRow => row !== null)
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
      xValues,
      series: combinedSeries,
      labels: yColumns.slice(0, 4).map(humanizeKey),
      note: `Combined chart from ${normalizedRows.length} samples`,
    });
  }

  for (const column of yColumns) {
    const series = normalizedRows.map((row) => toFiniteNumber(row[column]) ?? 0);
    charts.push({
      id: slugify(`${options.sourceName}-${xColumn}-${column}`),
      title: `${titlePrefix}: ${humanizeKey(column)} vs ${humanizeKey(xColumn)}`,
      xLabel: humanizeKey(xColumn),
      yLabel: humanizeKey(column),
      xValues,
      series: [series],
      labels: [humanizeKey(column)],
      note: `Samples: ${normalizedRows.length}`,
    });
  }

  return charts;
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
  options?: { sheetName?: string; xColumn?: string; yColumns?: string[] },
): Promise<VisualizationSource> {
  const extension = extname(filePath).toLowerCase();
  const sourceName = basename(filePath, extension);

  if (extension === '.json') {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    return {
      sourceType: 'json',
      sourceName,
      charts: buildChartsFromJson(parsed, sourceName),
    };
  }

  if (extension === '.csv') {
    return {
      sourceType: 'csv',
      sourceName,
      charts: buildChartsFromTable(rowsFromCsv(readFileSync(filePath, 'utf-8')), {
        sourceName,
        xColumn: options?.xColumn,
        yColumns: options?.yColumns,
      }),
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

    const charts = worksheets.flatMap((worksheet) =>
      buildChartsFromTable(rowsFromWorksheet(worksheet), {
        sourceName: `${sourceName}-${worksheet.name}`,
        titlePrefix: `${worksheet.name} sheet`,
        xColumn: options?.xColumn,
        yColumns: options?.yColumns,
      }),
    );

    return {
      sourceType: 'xlsx',
      sourceName,
      charts,
    };
  }

  throw new Error(`Unsupported visualization source: ${filePath}. Use .json, .csv, or .xlsx.`);
}

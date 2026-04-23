import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBoreholeLocation, detectCoordinateReferenceSystem } from '../geo/coordinates.js';
import type { BoreholeLocation, CoordinateReferenceSystem } from './geotech-schemas.js';

// ---------------------------------------------------------------------------
// AGS 4.0 Format Parser
// Association of Geotechnical & Geoenvironmental Specialists
// Standard: AGS4 (2020) — Electronic Transfer of Geotechnical Data
// ---------------------------------------------------------------------------

export interface AGSGroup {
  name: string;
  headings: string[];
  units: string[];
  types: string[];
  data: Record<string, string | number | null>[];
}

export interface AGSFile {
  groups: Map<string, AGSGroup>;
  projectInfo: Record<string, string>;
  coordinateReferenceSystem?: CoordinateReferenceSystem;
  boreholes: Array<{
    id: string;
    easting: number | null;
    northing: number | null;
    groundLevel: number | null;
    finalDepth: number | null;
    location?: BoreholeLocation;
  }>;
  samples: Array<{
    boreholeId: string;
    depthTop: number;
    depthBase: number;
    type: string;
    description: string;
  }>;
  sptResults: Array<{
    boreholeId: string;
    depth: number;
    nValue: number;
    n60: number | null;
  }>;
  geology: Array<{
    boreholeId: string;
    depthTop: number;
    depthBase: number;
    legend: string;
    description: string;
    uscs: string;
  }>;
}

type AGSRow = Record<string, string | number | null>;

function firstDefinedValue(row: AGSRow | undefined, keys: string[]): string | number | null | undefined {
  if (!row) return undefined;

  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }

  return undefined;
}

function asNumberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const parsed = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asId(row: AGSRow | undefined): string | undefined {
  const value = firstDefinedValue(row, ['HOLE_ID', 'LOCA_ID']);
  return value != null && String(value).trim() ? String(value).trim() : undefined;
}

function extractCoordinateReferenceSystemHint(row: AGSRow | undefined): string | undefined {
  if (!row) return undefined;

  for (const [key, value] of Object.entries(row)) {
    if (!/(crs|epsg|grid|datum|proj|coordinate|zone)/i.test(key)) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  for (const value of Object.values(row)) {
    if (typeof value === 'string' && /(epsg|wgs|utm|mercator|british national grid|osgb|bng)/i.test(value)) {
      return value.trim();
    }
  }

  return undefined;
}

function extractLocationRaw(row: AGSRow): Record<string, string | number | null> | undefined {
  const entries = Object.entries(row).filter(
    ([key, value]) =>
      /(lat|lon|long|nate|natn|east|north|gl|rl|crs|epsg|datum|grid)/i.test(key) &&
      (typeof value === 'string' || typeof value === 'number' || value === null),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function parseAGS(filePath: string): AGSFile {
  const content = readFileSync(resolve(filePath), 'utf-8');
  return parseAGSContent(content);
}

export function parseAGSContent(content: string): AGSFile {
  const groups = new Map<string, AGSGroup>();
  let currentGroup: AGSGroup | null = null;
  let section: 'none' | 'heading' | 'unit' | 'type' | 'data' = 'none';

  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('**')) continue;

    // Detect group start
    if (line.startsWith('"GROUP"')) {
      const match = line.match(/"GROUP"\s*,\s*"([^"]+)"/);
      if (match) {
        currentGroup = { name: match[1], headings: [], units: [], types: [], data: [] };
        groups.set(match[1], currentGroup);
        section = 'none';
      }
      continue;
    }

    if (!currentGroup) continue;

    // Parse row: comma-separated quoted values
    const cells = parseAGSRow(line);
    if (cells.length === 0) continue;

    const rowType = cells[0];

    if (rowType === 'HEADING') {
      currentGroup.headings = cells.slice(1);
      section = 'heading';
    } else if (rowType === 'UNIT') {
      currentGroup.units = cells.slice(1);
      section = 'unit';
    } else if (rowType === 'TYPE') {
      currentGroup.types = cells.slice(1);
      section = 'type';
    } else if (rowType === 'DATA') {
      const row: AGSRow = {};
      const values = cells.slice(1);
      currentGroup.headings.forEach((h, i) => {
        const val = values[i] ?? '';
        const type = currentGroup!.types[i] ?? 'X';

        if (val === '' || val === 'null') {
          row[h] = null;
        } else if (type === '2DP' || type === '3DP' || type === '1DP' || type === '0DP' || type.startsWith('nDP') || type === 'SF') {
          const num = parseFloat(val);
          row[h] = isNaN(num) ? val : num;
        } else if (type === 'ID' || type === 'PA' || type === 'X' || type === 'XN' || type === 'DT') {
          row[h] = val;
        } else {
          const num = parseFloat(val);
          row[h] = isNaN(num) ? val : num;
        }
      });
      currentGroup.data.push(row);
    }
  }

  // Extract structured data from known AGS groups
  const projectInfo: Record<string, string> = {};
  const projGroup = groups.get('PROJ');
  if (projGroup && projGroup.data.length > 0) {
    const row = projGroup.data[0];
    for (const [k, v] of Object.entries(row)) {
      if (v !== null) projectInfo[k] = String(v);
    }
  }

  const coordinateReferenceSystem = detectCoordinateReferenceSystem({
    crs: extractCoordinateReferenceSystemHint(projGroup?.data[0] as AGSRow | undefined),
    description: Object.values(projectInfo).join(' '),
  });

  const locaRows = (groups.get('LOCA')?.data ?? []) as AGSRow[];
  const holeRows = (groups.get('HOLE')?.data ?? []) as AGSRow[];
  const rowsById = new Map<string, { loca?: AGSRow; hole?: AGSRow }>();

  for (const row of locaRows) {
    const id = asId(row);
    if (!id) continue;
    rowsById.set(id, { ...rowsById.get(id), loca: row });
  }

  for (const row of holeRows) {
    const id = asId(row);
    if (!id) continue;
    rowsById.set(id, { ...rowsById.get(id), hole: row });
  }

  const boreholes = [...rowsById.entries()].map(([id, rowSet]) => {
    const mergedRow: AGSRow = {
      ...(rowSet.loca ?? {}),
      ...(rowSet.hole ?? {}),
    };
    const easting = asNumberOrNull(firstDefinedValue(mergedRow, ['HOLE_NATE', 'LOCA_NATE', 'HOLE_EAST', 'LOCA_EAST']));
    const northing = asNumberOrNull(firstDefinedValue(mergedRow, ['HOLE_NATN', 'LOCA_NATN', 'HOLE_NORTH', 'LOCA_NORTH']));
    const groundLevel = asNumberOrNull(firstDefinedValue(mergedRow, ['HOLE_GL', 'LOCA_GL']));
    const finalDepth = asNumberOrNull(firstDefinedValue(mergedRow, ['HOLE_FDEP', 'LOCA_FDEP']));

    return {
      id,
      easting,
      northing,
      groundLevel,
      finalDepth,
      location: buildBoreholeLocation({
        boreholeId: id,
        easting: firstDefinedValue(mergedRow, ['HOLE_NATE', 'LOCA_NATE', 'HOLE_EAST', 'LOCA_EAST']),
        northing: firstDefinedValue(mergedRow, ['HOLE_NATN', 'LOCA_NATN', 'HOLE_NORTH', 'LOCA_NORTH']),
        latitude: firstDefinedValue(mergedRow, ['HOLE_LAT', 'LOCA_LAT', 'HOLE_LATI', 'LOCA_LATI']),
        longitude: firstDefinedValue(mergedRow, ['HOLE_LON', 'LOCA_LON', 'HOLE_LONG', 'LOCA_LONG', 'HOLE_LLON', 'LOCA_LLON']),
        groundLevel,
        reducedLevel: firstDefinedValue(mergedRow, ['HOLE_RL', 'LOCA_RL']),
        crs: extractCoordinateReferenceSystemHint(mergedRow) ?? coordinateReferenceSystem,
        source: 'ags',
        raw: extractLocationRaw(mergedRow),
      }),
    };
  });

  // Samples from SAMP group
  const samples = (groups.get('SAMP')?.data ?? []).map((row) => ({
    boreholeId: String(row['LOCA_ID'] ?? row['HOLE_ID'] ?? ''),
    depthTop: Number(row['SAMP_TOP'] ?? 0),
    depthBase: Number(row['SAMP_BASE'] ?? row['SAMP_TOP'] ?? 0),
    type: String(row['SAMP_TYPE'] ?? ''),
    description: String(row['SAMP_DESC'] ?? row['SAMP_REM'] ?? ''),
  }));

  // SPT from ISPT group
  const sptResults = (groups.get('ISPT')?.data ?? []).map((row) => ({
    boreholeId: String(row['LOCA_ID'] ?? row['HOLE_ID'] ?? ''),
    depth: Number(row['ISPT_TOP'] ?? 0),
    nValue: Number(row['ISPT_NVAL'] ?? row['ISPT_REP'] ?? 0),
    n60: row['ISPT_N60'] != null ? Number(row['ISPT_N60']) : null,
  }));

  // Geology from GEOL group
  const geology = (groups.get('GEOL')?.data ?? []).map((row) => ({
    boreholeId: String(row['LOCA_ID'] ?? row['HOLE_ID'] ?? ''),
    depthTop: Number(row['GEOL_TOP'] ?? 0),
    depthBase: Number(row['GEOL_BASE'] ?? 0),
    legend: String(row['GEOL_LEG'] ?? ''),
    description: String(row['GEOL_DESC'] ?? ''),
    uscs: String(row['GEOL_USCS'] ?? row['GEOL_STAT'] ?? ''),
  }));

  return { groups, projectInfo, coordinateReferenceSystem, boreholes, samples, sptResults, geology };
}

function parseAGSRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

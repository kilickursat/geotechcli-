import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  boreholes: Array<{
    id: string;
    easting: number | null;
    northing: number | null;
    groundLevel: number | null;
    finalDepth: number | null;
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
      const row: Record<string, string | number | null> = {};
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

  // Boreholes from HOLE group
  const boreholes = (groups.get('HOLE')?.data ?? []).map((row) => ({
    id: String(row['HOLE_ID'] ?? row['LOCA_ID'] ?? ''),
    easting: row['HOLE_NATE'] != null ? Number(row['HOLE_NATE']) : row['LOCA_NATE'] != null ? Number(row['LOCA_NATE']) : null,
    northing: row['HOLE_NATN'] != null ? Number(row['HOLE_NATN']) : row['LOCA_NATN'] != null ? Number(row['LOCA_NATN']) : null,
    groundLevel: row['HOLE_GL'] != null ? Number(row['HOLE_GL']) : row['LOCA_GL'] != null ? Number(row['LOCA_GL']) : null,
    finalDepth: row['HOLE_FDEP'] != null ? Number(row['HOLE_FDEP']) : row['LOCA_FDEP'] != null ? Number(row['LOCA_FDEP']) : null,
  }));

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

  return { groups, projectInfo, boreholes, samples, sptResults, geology };
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

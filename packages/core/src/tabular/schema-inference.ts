import type { TabularCell, TabularRow } from './csv.js';

export type InferredColumnRole =
  | 'depth'
  | 'time'
  | 'date'
  | 'easting'
  | 'northing'
  | 'latitude'
  | 'longitude'
  | 'borehole_id'
  | 'sample_id'
  | 'test_id'
  | 'spt_n'
  | 'cpt_qc'
  | 'cpt_fs'
  | 'water_content'
  | 'liquid_limit'
  | 'plastic_limit'
  | 'plasticity_index'
  | 'gradation_size'
  | 'percent_passing'
  | 'unit_weight'
  | 'settlement'
  | 'pore_pressure'
  | 'inclination'
  | 'vibration'
  | 'unknown';

export type InferredColumnType = 'number' | 'text' | 'boolean' | 'date' | 'empty' | 'mixed';

export type InferredDatasetType =
  | 'borehole-table'
  | 'cpt-profile'
  | 'spt-profile'
  | 'lab-test-summary'
  | 'coordinate-table'
  | 'monitoring-time-series'
  | 'pile-load-test'
  | 'signal-record'
  | 'generic-table';

export interface ColumnInference {
  name: string;
  normalizedName: string;
  type: InferredColumnType;
  unit?: string;
  roles: InferredColumnRole[];
  nonEmptyCount: number;
  numericCount: number;
  examples: string[];
}

export interface TabularSchemaInference {
  sourceName?: string;
  sheetName?: string;
  rowCount: number;
  sampledRowCount: number;
  columnCount: number;
  columns: ColumnInference[];
  datasetType: InferredDatasetType;
  branches: string[];
  detected: {
    depthColumns: string[];
    timeColumns: string[];
    coordinateColumns: string[];
    boreholeIdColumns: string[];
    sampleIdColumns: string[];
    sptColumns: string[];
    cptColumns: string[];
    labColumns: string[];
    monitoringColumns: string[];
  };
  confidence: number;
  warnings: string[];
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function humanCell(value: TabularCell): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function isFiniteNumber(value: TabularCell): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function inferColumnType(values: TabularCell[]): InferredColumnType {
  const present = values.filter((value) => value !== null && String(value).trim().length > 0);
  if (present.length === 0) return 'empty';

  const numeric = present.filter(isFiniteNumber).length;
  const boolean = present.filter((value) => typeof value === 'boolean').length;
  const dates = present.filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))).length;

  if (numeric === present.length) return 'number';
  if (boolean === present.length) return 'boolean';
  if (dates >= Math.max(2, Math.ceil(present.length * 0.8))) return 'date';
  if (numeric > 0 || boolean > 0) return 'mixed';
  return 'text';
}

function inferUnit(header: string): string | undefined {
  const explicit = header.match(/\(([^)]+)\)|\[([^\]]+)\]/);
  if (explicit) {
    return (explicit[1] ?? explicit[2]).trim();
  }

  const normalized = header
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/g, '_');
  const units = [
    'kn_m3',
    'g_cm3',
    'kpa',
    'mpa',
    'gpa',
    'kn',
    'mn',
    'mm',
    'cm',
    'm',
    'deg',
    'degree',
    'percent',
    'pct',
    'hz',
    's',
    'sec',
    'min',
    'hr',
    'day',
    'year',
  ];

  return units.find((unit) => new RegExp(`(?:^|_)${unit}(?:_|$)`).test(normalized));
}

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasAny(normalized: string, aliases: string[]): boolean {
  return aliases.some((rawAlias) => {
    const alias = normalizeAlias(rawAlias);
    if (alias.length <= 3) {
      return normalized === alias || normalized.startsWith(alias);
    }
    return normalized.includes(alias);
  });
}

function inferRoles(header: string, type: InferredColumnType): InferredColumnRole[] {
  const normalized = normalizeHeader(header);
  const roles = new Set<InferredColumnRole>();

  if (hasAny(normalized, ['depth', 'belowground', 'bgl', 'elevationdepth', 'z'])) roles.add('depth');
  if (hasAny(normalized, ['time', 'elapsed', 'duration'])) roles.add('time');
  if (hasAny(normalized, ['date', 'timestamp', 'datetime'])) roles.add('date');
  if (hasAny(normalized, ['easting', 'eastcoord', 'xcoord', 'gridx'])) roles.add('easting');
  if (hasAny(normalized, ['northing', 'northcoord', 'ycoord', 'gridy'])) roles.add('northing');
  if (hasAny(normalized, ['latitude', 'lat'])) roles.add('latitude');
  if (hasAny(normalized, ['longitude', 'lon', 'lng'])) roles.add('longitude');
  if (hasAny(normalized, ['borehole', 'holeid', 'bhid', 'bhno', 'locationid'])) roles.add('borehole_id');
  if (hasAny(normalized, ['sampleid', 'sampleno', 'sample', 'specimen'])) roles.add('sample_id');
  if (hasAny(normalized, ['testid', 'testno'])) roles.add('test_id');
  if (hasAny(normalized, ['sptn', 'nvalue', 'blowcount', 'blows', 'n60'])) roles.add('spt_n');
  if (hasAny(normalized, ['qc', 'coneresistance', 'tipresistance'])) roles.add('cpt_qc');
  if (hasAny(normalized, ['fs', 'sleevefriction', 'frictionsleeve'])) roles.add('cpt_fs');
  if (hasAny(normalized, ['watercontent', 'moisturecontent', 'naturalmoisture', 'wpercent'])) roles.add('water_content');
  if (hasAny(normalized, ['liquidlimit', 'll'])) roles.add('liquid_limit');
  if (hasAny(normalized, ['plasticlimit', 'pl'])) roles.add('plastic_limit');
  if (hasAny(normalized, ['plasticityindex', 'pi'])) roles.add('plasticity_index');
  if (hasAny(normalized, ['particlesize', 'grainsize', 'sievemm', 'openingmm'])) roles.add('gradation_size');
  if (hasAny(normalized, ['percentpassing', 'passingpercent', 'percentfiner', 'finerpercent'])) roles.add('percent_passing');
  if (hasAny(normalized, ['unitweight', 'bulkunitweight', 'dryunitweight', 'drydensity', 'gammad'])) roles.add('unit_weight');
  if (hasAny(normalized, ['settlement', 'heave', 'displacement'])) roles.add('settlement');
  if (hasAny(normalized, ['porepressure', 'piezometer', 'waterpressure'])) roles.add('pore_pressure');
  if (hasAny(normalized, ['inclinometer', 'inclination', 'tilt'])) roles.add('inclination');
  if (hasAny(normalized, ['vibration', 'acceleration', 'velocity', 'frequency', 'fft', 'psd'])) roles.add('vibration');

  if (roles.size === 0 && type === 'date') roles.add('date');
  return roles.size > 0 ? [...roles] : ['unknown'];
}

function namesByRole(columns: ColumnInference[], role: InferredColumnRole): string[] {
  return columns.filter((column) => column.roles.includes(role)).map((column) => column.name);
}

function inferDatasetType(columns: ColumnInference[]): InferredDatasetType {
  const has = (role: InferredColumnRole) => columns.some((column) => column.roles.includes(role));
  const hasAnyRole = (roles: InferredColumnRole[]) => roles.some(has);

  if (has('cpt_qc') && has('depth')) return 'cpt-profile';
  if (has('spt_n') && has('depth')) return 'spt-profile';
  if (hasAnyRole(['liquid_limit', 'plastic_limit', 'plasticity_index', 'gradation_size', 'percent_passing', 'water_content', 'unit_weight'])) return 'lab-test-summary';
  if ((has('easting') && has('northing')) || (has('latitude') && has('longitude'))) return 'coordinate-table';
  if (hasAnyRole(['settlement', 'pore_pressure', 'inclination']) && hasAnyRole(['time', 'date'])) return 'monitoring-time-series';
  if (has('vibration')) return 'signal-record';
  if (has('borehole_id') && has('depth')) return 'borehole-table';
  return 'generic-table';
}

function inferBranches(datasetType: InferredDatasetType, columns: ColumnInference[]): string[] {
  const branches = new Set<string>();
  const has = (role: InferredColumnRole) => columns.some((column) => column.roles.includes(role));

  switch (datasetType) {
    case 'cpt-profile':
    case 'spt-profile':
    case 'borehole-table':
    case 'lab-test-summary':
      branches.add('site-investigation');
      branches.add('foundation');
      break;
    case 'coordinate-table':
      branches.add('site-investigation');
      branches.add('mapping');
      break;
    case 'monitoring-time-series':
      branches.add('monitoring');
      branches.add('settlement');
      break;
    case 'signal-record':
      branches.add('monitoring');
      branches.add('signal-processing');
      break;
    default:
      break;
  }

  if (has('spt_n')) branches.add('liquefaction');
  if (has('settlement')) branches.add('settlement');
  if (has('pore_pressure')) branches.add('seepage');
  return [...branches];
}

function inferConfidence(datasetType: InferredDatasetType, columns: ColumnInference[], sampledRowCount: number): number {
  if (sampledRowCount === 0 || columns.length === 0) return 0.2;
  let score = datasetType === 'generic-table' ? 0.45 : 0.68;
  const recognizedColumns = columns.filter((column) => !column.roles.includes('unknown')).length;
  score += Math.min(0.22, recognizedColumns / Math.max(1, columns.length) * 0.22);
  if (sampledRowCount >= 5) score += 0.08;
  if (sampledRowCount >= 20) score += 0.04;
  return Math.round(Math.min(score, 0.96) * 100) / 100;
}

export function inferTabularSchema(options: {
  rows: TabularRow[];
  rowCount?: number;
  sourceName?: string;
  sheetName?: string;
  warnings?: string[];
}): TabularSchemaInference {
  const headers = options.rows.length > 0 ? Object.keys(options.rows[0]) : [];
  const columns = headers.map((header) => {
    const values = options.rows.map((row) => row[header]);
    const type = inferColumnType(values);
    const examples = values
      .map(humanCell)
      .filter((value) => value.length > 0)
      .slice(0, 3);
    const nonEmptyCount = values.filter((value) => value !== null && String(value).trim().length > 0).length;
    const numericCount = values.filter(isFiniteNumber).length;

    return {
      name: header,
      normalizedName: normalizeHeader(header),
      type,
      unit: inferUnit(header),
      roles: inferRoles(header, type),
      nonEmptyCount,
      numericCount,
      examples,
    };
  });

  const datasetType = inferDatasetType(columns);
  const branches = inferBranches(datasetType, columns);
  const warnings = [...(options.warnings ?? [])];

  if (datasetType === 'generic-table') {
    warnings.push('No geotechnical schema pattern was detected from sampled headers.');
  }

  return {
    sourceName: options.sourceName,
    sheetName: options.sheetName,
    rowCount: options.rowCount ?? options.rows.length,
    sampledRowCount: options.rows.length,
    columnCount: columns.length,
    columns,
    datasetType,
    branches,
    detected: {
      depthColumns: namesByRole(columns, 'depth'),
      timeColumns: [...new Set([...namesByRole(columns, 'time'), ...namesByRole(columns, 'date')])],
      coordinateColumns: [...new Set([
        ...namesByRole(columns, 'easting'),
        ...namesByRole(columns, 'northing'),
        ...namesByRole(columns, 'latitude'),
        ...namesByRole(columns, 'longitude'),
      ])],
      boreholeIdColumns: namesByRole(columns, 'borehole_id'),
      sampleIdColumns: namesByRole(columns, 'sample_id'),
      sptColumns: namesByRole(columns, 'spt_n'),
      cptColumns: [...new Set([...namesByRole(columns, 'cpt_qc'), ...namesByRole(columns, 'cpt_fs')])],
      labColumns: [...new Set([
        ...namesByRole(columns, 'water_content'),
        ...namesByRole(columns, 'liquid_limit'),
        ...namesByRole(columns, 'plastic_limit'),
        ...namesByRole(columns, 'plasticity_index'),
        ...namesByRole(columns, 'gradation_size'),
        ...namesByRole(columns, 'percent_passing'),
        ...namesByRole(columns, 'unit_weight'),
      ])],
      monitoringColumns: [...new Set([
        ...namesByRole(columns, 'settlement'),
        ...namesByRole(columns, 'pore_pressure'),
        ...namesByRole(columns, 'inclination'),
        ...namesByRole(columns, 'vibration'),
      ])],
    },
    confidence: inferConfidence(datasetType, columns, options.rows.length),
    warnings,
  };
}

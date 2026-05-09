import type { TabularCell, TabularRow } from './csv.js';

export type InferredColumnRole =
  | 'depth'
  | 'top_depth'
  | 'bottom_depth'
  | 'time'
  | 'date'
  | 'easting'
  | 'northing'
  | 'latitude'
  | 'longitude'
  | 'borehole_id'
  | 'sample_id'
  | 'test_id'
  | 'description'
  | 'spt_n'
  | 'cpt_qc'
  | 'cpt_fs'
  | 'groundwater_depth'
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

  const isTopDepth = hasAny(normalized, ['topdepth', 'fromdepth', 'depthfrom', 'startdepth']);
  const isBottomDepth = hasAny(normalized, ['bottomdepth', 'todepth', 'depthto', 'enddepth']);
  const isGroundwaterDepth = hasAny(normalized, ['groundwater', 'watertable', 'gwl', 'waterlevel']);
  if (isTopDepth) roles.add('top_depth');
  if (isBottomDepth) roles.add('bottom_depth');
  if (isGroundwaterDepth) roles.add('groundwater_depth');
  if (!isTopDepth && !isBottomDepth && !isGroundwaterDepth && hasAny(normalized, ['depth', 'belowground', 'bgl', 'elevationdepth', 'z'])) roles.add('depth');
  if (hasAny(normalized, ['time', 'elapsed', 'duration'])) roles.add('time');
  if (hasAny(normalized, ['date', 'timestamp', 'datetime'])) roles.add('date');
  if (hasAny(normalized, ['easting', 'eastcoord', 'xcoord', 'gridx'])) roles.add('easting');
  if (hasAny(normalized, ['northing', 'northcoord', 'ycoord', 'gridy'])) roles.add('northing');
  if (hasAny(normalized, ['latitude', 'lat'])) roles.add('latitude');
  if (hasAny(normalized, ['longitude', 'lon', 'lng'])) roles.add('longitude');
  if (hasAny(normalized, ['borehole', 'holeid', 'bhid', 'bhno', 'locationid'])) roles.add('borehole_id');
  if (hasAny(normalized, ['sampleid', 'sampleno', 'sample', 'specimen'])) roles.add('sample_id');
  if (hasAny(normalized, ['testid', 'testno'])) roles.add('test_id');
  if (hasAny(normalized, ['description', 'materialdescription', 'soiltype', 'lithology', 'stratum', 'geology'])) roles.add('description');
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

function addContextRole(column: ColumnInference, role: InferredColumnRole): ColumnInference {
  const roles = column.roles.includes('unknown')
    ? column.roles.filter((candidate) => candidate !== 'unknown')
    : [...column.roles];
  if (!roles.includes(role)) roles.push(role);
  return { ...column, roles };
}

function looksLikeBoreholeId(value: string): boolean {
  return /^(?:bh|borehole|cpt|tp|trialpit|ha|loc|location)[-_\s]?[a-z0-9]+$/i.test(value.trim());
}

function applyContextualRoles(columns: ColumnInference[], contextName: string): ColumnInference[] {
  let next = columns;
  const has = (role: InferredColumnRole) => next.some((column) => column.roles.includes(role));
  const hasCoordinates = (has('easting') && has('northing')) || (has('latitude') && has('longitude'));

  if (hasCoordinates && !has('borehole_id')) {
    const idCandidateIndex = next.findIndex((column) => {
      if (column.type !== 'text' || column.nonEmptyCount === 0) return false;
      const normalized = column.normalizedName;
      return ['id', 'location', 'locationname', 'point', 'pointid', 'hole', 'holeid', 'bh'].includes(normalized)
        || column.examples.some(looksLikeBoreholeId);
    });

    if (idCandidateIndex >= 0) {
      next = next.map((column, index) => (index === idCandidateIndex ? addContextRole(column, 'borehole_id') : column));
    }
  }

  const isGroundwaterSource = /\b(?:ground\s*water|groundwater|water\s*table|watertable|gwl|piezometer|standpipe)\b/i.test(contextName);
  if (isGroundwaterSource && !has('groundwater_depth')) {
    const depthCandidateIndex = next.findIndex((column) => column.roles.includes('depth'));
    if (depthCandidateIndex >= 0) {
      next = next.map((column, index) => (index === depthCandidateIndex ? addContextRole(column, 'groundwater_depth') : column));
    }
  }

  return next;
}

function inferDatasetType(columns: ColumnInference[]): InferredDatasetType {
  const has = (role: InferredColumnRole) => columns.some((column) => column.roles.includes(role));
  const hasAnyRole = (roles: InferredColumnRole[]) => roles.some(has);

  const hasDepth = has('depth') || has('top_depth') || has('bottom_depth');

  if (has('cpt_qc') && hasDepth) return 'cpt-profile';
  if (has('spt_n') && hasDepth) return 'spt-profile';
  if (hasAnyRole(['liquid_limit', 'plastic_limit', 'plasticity_index', 'gradation_size', 'percent_passing', 'water_content', 'unit_weight'])) return 'lab-test-summary';
  if ((has('easting') && has('northing')) || (has('latitude') && has('longitude'))) return 'coordinate-table';
  if (hasAnyRole(['settlement', 'pore_pressure', 'inclination']) && hasAnyRole(['time', 'date'])) return 'monitoring-time-series';
  if (has('vibration')) return 'signal-record';
  if (has('borehole_id') && hasDepth) return 'borehole-table';
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

  const columnsWithContext = applyContextualRoles(columns, `${options.sourceName ?? ''} ${options.sheetName ?? ''}`);
  const datasetType = inferDatasetType(columnsWithContext);
  const columnsForResult = columnsWithContext;
  const branches = inferBranches(datasetType, columnsForResult);
  const warnings = [...(options.warnings ?? [])];

  if (datasetType === 'generic-table') {
    warnings.push('No geotechnical schema pattern was detected from sampled headers.');
  }

  return {
    sourceName: options.sourceName,
    sheetName: options.sheetName,
    rowCount: options.rowCount ?? options.rows.length,
    sampledRowCount: options.rows.length,
    columnCount: columnsForResult.length,
    columns: columnsForResult,
    datasetType,
    branches,
    detected: {
      depthColumns: namesByRole(columnsForResult, 'depth'),
      timeColumns: [...new Set([...namesByRole(columnsForResult, 'time'), ...namesByRole(columnsForResult, 'date')])],
      coordinateColumns: [...new Set([
        ...namesByRole(columnsForResult, 'easting'),
        ...namesByRole(columnsForResult, 'northing'),
        ...namesByRole(columnsForResult, 'latitude'),
        ...namesByRole(columnsForResult, 'longitude'),
      ])],
      boreholeIdColumns: namesByRole(columnsForResult, 'borehole_id'),
      sampleIdColumns: namesByRole(columnsForResult, 'sample_id'),
      sptColumns: namesByRole(columnsForResult, 'spt_n'),
      cptColumns: [...new Set([...namesByRole(columnsForResult, 'cpt_qc'), ...namesByRole(columnsForResult, 'cpt_fs')])],
      labColumns: [...new Set([
        ...namesByRole(columnsForResult, 'water_content'),
        ...namesByRole(columnsForResult, 'liquid_limit'),
        ...namesByRole(columnsForResult, 'plastic_limit'),
        ...namesByRole(columnsForResult, 'plasticity_index'),
        ...namesByRole(columnsForResult, 'gradation_size'),
        ...namesByRole(columnsForResult, 'percent_passing'),
        ...namesByRole(columnsForResult, 'unit_weight'),
      ])],
      monitoringColumns: [...new Set([
        ...namesByRole(columnsForResult, 'settlement'),
        ...namesByRole(columnsForResult, 'pore_pressure'),
        ...namesByRole(columnsForResult, 'inclination'),
        ...namesByRole(columnsForResult, 'vibration'),
      ])],
    },
    confidence: inferConfidence(datasetType, columnsForResult, options.rows.length),
    warnings,
  };
}

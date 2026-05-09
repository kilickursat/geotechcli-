import type { EvidenceMethod, EvidenceRef } from '../evidence/index.js';
import { normalizeEvidenceConfidence } from '../evidence/index.js';
import {
  parseDelimitedFile,
  parseXlsxFile,
  type InferredColumnRole,
  type TabularCell,
  type TabularRow,
  type TabularSchemaInference,
} from '../tabular/index.js';
import type { ProjectManifest, WorkspaceFileEntry } from '../workspace/index.js';
import { buildGroundModelMap } from './map.js';
import {
  type GroundModel,
  type GroundModelBorehole,
  type GroundModelCoordinate,
  type GroundModelGroundwaterObservation,
  type GroundModelLabTest,
  type GroundModelMonitoringSeries,
  type GroundModelParameter,
  type GroundModelRejectedObservation,
  type GroundModelSptTest,
  type GroundModelStratum,
} from './model.js';

export interface BuildGroundModelOptions {
  maxRows?: number;
}

interface TabularSource {
  file: WorkspaceFileEntry;
  schema: TabularSchemaInference;
  rows: TabularRow[];
  method: EvidenceMethod;
}

interface BuilderState {
  evidence: EvidenceRef[];
  evidenceCounter: number;
  warnings: string[];
  rejectedObservations: GroundModelRejectedObservation[];
}

const DEFAULT_MAX_ROWS = 200;
const SPT_STANDARD_REFERENCE_VALUES = new Set([1892, 2131, 2132, 2720, 6403, 8009, 9640]);

const PARAMETER_ROLES: Array<{ role: InferredColumnRole; name: string }> = [
  { role: 'water_content', name: 'waterContent' },
  { role: 'liquid_limit', name: 'liquidLimit' },
  { role: 'plastic_limit', name: 'plasticLimit' },
  { role: 'plasticity_index', name: 'plasticityIndex' },
  { role: 'gradation_size', name: 'gradationSize' },
  { role: 'percent_passing', name: 'percentPassing' },
  { role: 'unit_weight', name: 'unitWeight' },
];

function roleColumn(schema: TabularSchemaInference, role: InferredColumnRole): string | undefined {
  return schema.columns.find((column) => column.roles.includes(role))?.name;
}

function roleColumns(schema: TabularSchemaInference, role: InferredColumnRole): string[] {
  return schema.columns.filter((column) => column.roles.includes(role)).map((column) => column.name);
}

function columnUnit(schema: TabularSchemaInference, columnName?: string): string | undefined {
  if (!columnName) return undefined;
  return schema.columns.find((column) => column.name === columnName)?.unit;
}

function cell(row: TabularRow, columnName?: string): TabularCell {
  return columnName ? row[columnName] ?? null : null;
}

function asNumber(value: TabularCell): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asText(value: TabularCell): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function evidenceConfidence(file: WorkspaceFileEntry, schema: TabularSchemaInference): number {
  return normalizeEvidenceConfidence(Math.min(file.classification.confidence, schema.confidence));
}

function addEvidence(
  state: BuilderState,
  source: TabularSource,
  rowIndex: number,
  columnName: string,
  rawValue: TabularCell,
  normalizedValue: TabularCell,
  warnings: string[] = [],
): string {
  state.evidenceCounter += 1;
  const id = `ev-${String(state.evidenceCounter).padStart(5, '0')}`;
  state.evidence.push({
    id,
    sourceType: 'tabular-cell',
    sourcePath: source.file.path,
    location: {
      filePath: source.file.path,
      absolutePath: source.file.absolutePath,
      sheetName: source.schema.sheetName,
      rowNumber: rowIndex + 2,
      columnName,
    },
    method: source.method,
    confidence: evidenceConfidence(source.file, source.schema),
    rawValue,
    normalizedValue,
    unit: columnUnit(source.schema, columnName),
    warnings,
  });
  return id;
}

function sourceBoreholeId(source: TabularSource): string | undefined {
  return source.file.name.match(/\bBH[-_\s]?\d+\b/i)?.[0].replace(/\s+/g, '-').toUpperCase();
}

function ensureBorehole(
  boreholes: Map<string, GroundModelBorehole>,
  id: string,
  evidenceIds: string[] = [],
  confidence = 0.5,
): GroundModelBorehole {
  const existing = boreholes.get(id);
  if (existing) {
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...evidenceIds])];
    existing.confidence = normalizeEvidenceConfidence(Math.max(existing.confidence, confidence));
    return existing;
  }

  const borehole: GroundModelBorehole = {
    id,
    sptTests: [],
    strata: [],
    groundwater: [],
    evidenceIds,
    confidence: normalizeEvidenceConfidence(confidence),
    warnings: [],
  };
  boreholes.set(id, borehole);
  return borehole;
}

function rowBoreholeId(source: TabularSource, row: TabularRow): string | undefined {
  const idColumn = roleColumn(source.schema, 'borehole_id');
  const fromRow = asText(cell(row, idColumn));
  return fromRow ?? sourceBoreholeId(source);
}

function rejectObservation(
  state: BuilderState,
  observation: GroundModelRejectedObservation,
): void {
  state.rejectedObservations.push(observation);
  state.warnings.push(observation.reason);
}

function rejectSptReason(value: number): string | undefined {
  if (SPT_STANDARD_REFERENCE_VALUES.has(Math.round(value))) {
    return `Rejected SPT N value ${value} because it matches a common standards/reference number, not a plausible blow count.`;
  }
  if (value < 0) return `Rejected SPT N value ${value} because blow count cannot be negative.`;
  if (value > 100) return `Rejected SPT N value ${value} because geotechCLI treats N > 100 as refusal/reference text requiring review.`;
  return undefined;
}

async function loadTabularSources(
  file: WorkspaceFileEntry,
  maxRows: number,
  warnings: string[],
): Promise<TabularSource[]> {
  if (!file.schemas || file.schemas.length === 0) return [];

  try {
    if (file.extension === '.csv' || file.extension === '.tsv') {
      const parsed = await parseDelimitedFile(file.absolutePath, {
        delimiter: file.extension === '.tsv' ? '\t' : undefined,
        maxRows,
      });
      return [{ file, schema: file.schemas[0], rows: parsed.rows, method: 'csv-sample' }];
    }

    if (file.extension === '.xlsx') {
      const workbook = await parseXlsxFile(file.absolutePath, { maxRows });
      return workbook.sheets.flatMap((sheet) => {
        const schema = file.schemas?.find((candidate) => candidate.sheetName === sheet.name);
        return schema ? [{ file, schema, rows: sheet.rows, method: 'xlsx-sample' as const }] : [];
      });
    }
  } catch (error) {
    warnings.push(`${file.path}: GroundModel table sampling failed (${error instanceof Error ? error.message : String(error)}).`);
  }

  return [];
}

function bindCoordinates(
  state: BuilderState,
  source: TabularSource,
  boreholes: Map<string, GroundModelBorehole>,
  row: TabularRow,
  rowIndex: number,
): void {
  const id = rowBoreholeId(source, row);
  const eastingColumn = roleColumn(source.schema, 'easting');
  const northingColumn = roleColumn(source.schema, 'northing');
  const latitudeColumn = roleColumn(source.schema, 'latitude');
  const longitudeColumn = roleColumn(source.schema, 'longitude');
  const easting = asNumber(cell(row, eastingColumn));
  const northing = asNumber(cell(row, northingColumn));
  const latitude = asNumber(cell(row, latitudeColumn));
  const longitude = asNumber(cell(row, longitudeColumn));

  if (!id || !((easting != null && northing != null) || (latitude != null && longitude != null))) return;

  const evidenceIds: string[] = [];
  if (eastingColumn && easting != null) evidenceIds.push(addEvidence(state, source, rowIndex, eastingColumn, cell(row, eastingColumn), easting));
  if (northingColumn && northing != null) evidenceIds.push(addEvidence(state, source, rowIndex, northingColumn, cell(row, northingColumn), northing));
  if (latitudeColumn && latitude != null) evidenceIds.push(addEvidence(state, source, rowIndex, latitudeColumn, cell(row, latitudeColumn), latitude));
  if (longitudeColumn && longitude != null) evidenceIds.push(addEvidence(state, source, rowIndex, longitudeColumn, cell(row, longitudeColumn), longitude));

  const coordinate: GroundModelCoordinate = {
    easting,
    northing,
    latitude,
    longitude,
    evidenceIds,
    confidence: evidenceConfidence(source.file, source.schema),
  };
  const borehole = ensureBorehole(boreholes, id, evidenceIds, coordinate.confidence);
  borehole.coordinates = coordinate;
}

function bindSpt(
  state: BuilderState,
  source: TabularSource,
  boreholes: Map<string, GroundModelBorehole>,
  row: TabularRow,
  rowIndex: number,
): void {
  const sptColumn = roleColumn(source.schema, 'spt_n');
  const depthColumn = roleColumn(source.schema, 'depth') ?? roleColumn(source.schema, 'top_depth');
  const nValue = asNumber(cell(row, sptColumn));
  const depth = asNumber(cell(row, depthColumn));
  if (!sptColumn || nValue == null || depth == null) return;

  const warnings: string[] = [];
  const sptEvidenceId = addEvidence(state, source, rowIndex, sptColumn, cell(row, sptColumn), nValue, warnings);
  const depthEvidenceId = depthColumn
    ? addEvidence(state, source, rowIndex, depthColumn, cell(row, depthColumn), depth)
    : undefined;
  const evidenceIds = depthEvidenceId ? [depthEvidenceId, sptEvidenceId] : [sptEvidenceId];
  const rejectedReason = rejectSptReason(nValue);
  if (rejectedReason) {
    rejectObservation(state, {
      kind: 'spt',
      reason: `${source.file.path} row ${rowIndex + 2}: ${rejectedReason}`,
      sourcePath: source.file.path,
      evidenceIds,
      rawValue: cell(row, sptColumn),
    });
    return;
  }

  const id = rowBoreholeId(source, row) ?? 'UNASSIGNED';
  const test: GroundModelSptTest = {
    depth,
    nValue,
    unit: columnUnit(source.schema, sptColumn),
    evidenceIds,
    confidence: evidenceConfidence(source.file, source.schema),
    warnings,
  };
  const borehole = ensureBorehole(boreholes, id, evidenceIds, test.confidence);
  borehole.sptTests.push(test);
}

function bindGroundwater(
  state: BuilderState,
  source: TabularSource,
  boreholes: Map<string, GroundModelBorehole>,
  groundwater: GroundModelGroundwaterObservation[],
  row: TabularRow,
  rowIndex: number,
): void {
  const groundwaterColumn = roleColumn(source.schema, 'groundwater_depth');
  const depth = asNumber(cell(row, groundwaterColumn));
  if (!groundwaterColumn || depth == null) return;

  const evidenceId = addEvidence(state, source, rowIndex, groundwaterColumn, cell(row, groundwaterColumn), depth);
  const observation: GroundModelGroundwaterObservation = {
    boreholeId: rowBoreholeId(source, row),
    depth,
    evidenceIds: [evidenceId],
    confidence: evidenceConfidence(source.file, source.schema),
    warnings: [],
  };
  groundwater.push(observation);
  if (observation.boreholeId) {
    ensureBorehole(boreholes, observation.boreholeId, [evidenceId], observation.confidence).groundwater.push(observation);
  }
}

function bindStrata(
  state: BuilderState,
  source: TabularSource,
  boreholes: Map<string, GroundModelBorehole>,
  strata: GroundModelStratum[],
  row: TabularRow,
  rowIndex: number,
): void {
  const descriptionColumn = roleColumn(source.schema, 'description');
  const description = asText(cell(row, descriptionColumn));
  if (!descriptionColumn || !description) return;

  const topDepthColumn = roleColumn(source.schema, 'top_depth') ?? roleColumn(source.schema, 'depth');
  const bottomDepthColumn = roleColumn(source.schema, 'bottom_depth');
  const topDepth = asNumber(cell(row, topDepthColumn));
  const bottomDepth = asNumber(cell(row, bottomDepthColumn));
  const evidenceIds = [addEvidence(state, source, rowIndex, descriptionColumn, cell(row, descriptionColumn), description)];
  if (topDepthColumn && topDepth != null) evidenceIds.push(addEvidence(state, source, rowIndex, topDepthColumn, cell(row, topDepthColumn), topDepth));
  if (bottomDepthColumn && bottomDepth != null) evidenceIds.push(addEvidence(state, source, rowIndex, bottomDepthColumn, cell(row, bottomDepthColumn), bottomDepth));

  const stratum: GroundModelStratum = {
    boreholeId: rowBoreholeId(source, row),
    topDepth,
    bottomDepth,
    description,
    evidenceIds,
    confidence: evidenceConfidence(source.file, source.schema),
    warnings: bottomDepth != null && topDepth != null && bottomDepth < topDepth ? ['Bottom depth is shallower than top depth.'] : [],
  };
  strata.push(stratum);
  if (stratum.boreholeId) {
    ensureBorehole(boreholes, stratum.boreholeId, evidenceIds, stratum.confidence).strata.push(stratum);
  }
}

function bindLabTests(
  state: BuilderState,
  source: TabularSource,
  labTests: GroundModelLabTest[],
  parameters: GroundModelParameter[],
  row: TabularRow,
  rowIndex: number,
): void {
  const sampleId = asText(cell(row, roleColumn(source.schema, 'sample_id')));
  const boreholeId = rowBoreholeId(source, row);
  const depth = asNumber(cell(row, roleColumn(source.schema, 'depth') ?? roleColumn(source.schema, 'top_depth')));
  const rowParameters: GroundModelParameter[] = [];

  for (const parameterRole of PARAMETER_ROLES) {
    for (const columnName of roleColumns(source.schema, parameterRole.role)) {
      const rawValue = cell(row, columnName);
      const numericValue = asNumber(rawValue);
      const textValue = asText(rawValue);
      if (numericValue == null && !textValue) continue;
      const normalizedValue = numericValue ?? textValue ?? '';
      const evidenceId = addEvidence(state, source, rowIndex, columnName, rawValue, normalizedValue);
      rowParameters.push({
        name: parameterRole.name,
        value: normalizedValue,
        unit: columnUnit(source.schema, columnName),
        boreholeId,
        sampleId,
        depth,
        evidenceIds: [evidenceId],
        confidence: evidenceConfidence(source.file, source.schema),
        warnings: [],
      });
    }
  }

  if (rowParameters.length === 0) return;
  parameters.push(...rowParameters);
  labTests.push({
    sampleId,
    boreholeId,
    depth,
    parameters: rowParameters,
    evidenceIds: rowParameters.flatMap((parameter) => parameter.evidenceIds),
    confidence: evidenceConfidence(source.file, source.schema),
    warnings: [],
  });
}

function bindMonitoringSeries(
  state: BuilderState,
  source: TabularSource,
  monitoringSeries: GroundModelMonitoringSeries[],
): void {
  if (source.schema.datasetType !== 'monitoring-time-series' && source.schema.datasetType !== 'signal-record') return;
  const detected = source.schema.detected.monitoringColumns;
  const kind = detected.some((column) => source.schema.columns.find((candidate) => candidate.name === column)?.roles.includes('settlement'))
    ? 'settlement'
    : detected.some((column) => source.schema.columns.find((candidate) => candidate.name === column)?.roles.includes('pore_pressure'))
      ? 'pore-pressure'
      : detected.some((column) => source.schema.columns.find((candidate) => candidate.name === column)?.roles.includes('inclination'))
        ? 'inclination'
        : detected.some((column) => source.schema.columns.find((candidate) => candidate.name === column)?.roles.includes('vibration'))
          ? 'vibration'
          : 'unknown';
  const evidenceIds: string[] = [];
  const firstColumn = detected[0] ?? source.schema.columns[0]?.name;
  source.rows.slice(0, 3).forEach((row, rowIndex) => {
    if (firstColumn) {
      const rawValue = cell(row, firstColumn);
      if (rawValue != null) {
        evidenceIds.push(addEvidence(state, source, rowIndex, firstColumn, rawValue, rawValue));
      }
    }
  });

  monitoringSeries.push({
    sourcePath: source.file.path,
    sheetName: source.schema.sheetName,
    kind,
    sampleCount: source.rows.length,
    evidenceIds,
    confidence: evidenceConfidence(source.file, source.schema),
    warnings: [],
  });
}

export async function buildGroundModelFromManifest(
  manifest: ProjectManifest,
  options: BuildGroundModelOptions = {},
): Promise<GroundModel> {
  const state: BuilderState = {
    evidence: [],
    evidenceCounter: 0,
    warnings: [],
    rejectedObservations: [],
  };
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
  const boreholes = new Map<string, GroundModelBorehole>();
  const strata: GroundModelStratum[] = [];
  const groundwater: GroundModelGroundwaterObservation[] = [];
  const labTests: GroundModelLabTest[] = [];
  const parameters: GroundModelParameter[] = [];
  const monitoringSeries: GroundModelMonitoringSeries[] = [];
  let hasGeographicCoordinates = false;
  let hasLocalCoordinates = false;

  for (const file of manifest.files) {
    const sources = await loadTabularSources(file, maxRows, state.warnings);
    for (const source of sources) {
      bindMonitoringSeries(state, source, monitoringSeries);
      for (const [rowIndex, row] of source.rows.entries()) {
        bindCoordinates(state, source, boreholes, row, rowIndex);
        bindSpt(state, source, boreholes, row, rowIndex);
        bindGroundwater(state, source, boreholes, groundwater, row, rowIndex);
        bindStrata(state, source, boreholes, strata, row, rowIndex);
        bindLabTests(state, source, labTests, parameters, row, rowIndex);
      }

      if (source.schema.detected.coordinateColumns.some((column) => {
        const roles = source.schema.columns.find((candidate) => candidate.name === column)?.roles ?? [];
        return roles.includes('latitude') || roles.includes('longitude');
      })) {
        hasGeographicCoordinates = true;
      }
      if (source.schema.detected.coordinateColumns.some((column) => {
        const roles = source.schema.columns.find((candidate) => candidate.name === column)?.roles ?? [];
        return roles.includes('easting') || roles.includes('northing');
      })) {
        hasLocalCoordinates = true;
      }
    }
  }

  const boreholeList = [...boreholes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const coordinateSystem = {
    kind: hasGeographicCoordinates ? 'geographic' as const : hasLocalCoordinates ? 'local-grid' as const : 'unknown' as const,
    crs: hasGeographicCoordinates ? 'WGS84-like latitude/longitude' : undefined,
    warnings: hasLocalCoordinates && !hasGeographicCoordinates
      ? ['Easting/northing coordinates were detected without an explicit CRS.']
      : [],
  };

  const stats = {
    boreholes: boreholeList.length,
    sptTests: boreholeList.reduce((count, borehole) => count + borehole.sptTests.length, 0),
    strata: strata.length,
    groundwaterObservations: groundwater.length,
    labTests: labTests.length,
    parameters: parameters.length,
    monitoringSeries: monitoringSeries.length,
    evidenceRefs: state.evidence.length,
    rejectedObservations: state.rejectedObservations.length,
  };

  const model: GroundModel = {
    schemaVersion: 'ground-model.v1',
    generatedAt: new Date().toISOString(),
    project: {
      rootPath: manifest.rootPath,
      requestedBranch: manifest.requestedBranch,
      requestedStandard: manifest.requestedStandard,
    },
    coordinateSystem,
    boreholes: boreholeList,
    strata,
    groundwater,
    labTests,
    parameters,
    monitoringSeries,
    evidence: state.evidence,
    rejectedObservations: state.rejectedObservations,
    warnings: [...new Set([...state.warnings, ...coordinateSystem.warnings])],
    stats,
  };

  return {
    ...model,
    map: buildGroundModelMap(model),
  };
}

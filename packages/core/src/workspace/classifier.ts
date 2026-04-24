import { extname } from 'node:path';
import type {
  WorkspaceDatasetType,
  WorkspaceFileClassification,
  WorkspaceFileKind,
} from './manifest.js';
import type { TabularSchemaInference } from '../tabular/index.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp']);
const GIS_EXTENSIONS = new Set(['.geojson', '.jsonl', '.shp', '.kml', '.kmz', '.gpkg']);
const CAD_EXTENSIONS = new Set(['.dxf', '.dwg']);
const OFFICE_EXTENSIONS = new Set(['.docx', '.doc', '.pptx']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.dat', '.tsv']);

function addBranch(branches: Set<string>, branch: string): void {
  branches.add(branch);
}

function filenameSignals(fileName: string): { datasetType?: WorkspaceDatasetType; branches: string[]; signals: string[] } {
  const lower = fileName.toLowerCase();
  const branches: string[] = [];
  const signals: string[] = [];

  const hit = (pattern: RegExp, signal: string): boolean => {
    if (!pattern.test(lower)) return false;
    signals.push(signal);
    return true;
  };

  if (hit(/\b(cpt|cone[-_\s]?penetration)\b/, 'filename:CPT')) {
    branches.push('site-investigation', 'foundation');
    return { datasetType: 'cpt-profile', branches, signals };
  }
  if (hit(/\b(spt|standard[-_\s]?penetration|n[-_\s]?value)\b/, 'filename:SPT')) {
    branches.push('site-investigation', 'foundation', 'liquefaction');
    return { datasetType: 'spt-profile', branches, signals };
  }
  if (hit(/\b(borehole|boring|bh[-_\s]?\d+|drill[-_\s]?log)\b/, 'filename:borehole')) {
    branches.push('site-investigation', 'foundation');
    return { datasetType: 'borehole-log', branches, signals };
  }
  if (hit(/\b(geotechnical|geotech[-_\s]?document|soil[-_\s]?investigation|ground[-_\s]?investigation|site[-_\s]?investigation)\b/, 'filename:geotechnical-report')) {
    branches.push('site-investigation', 'foundation');
    return { datasetType: 'geotechnical-report', branches, signals };
  }
  if (hit(/\b(atterberg|gradation|sieve|triaxial|consolidation|moisture|density|lab)\b/, 'filename:lab-test')) {
    branches.push('foundation', 'classification');
    return { datasetType: 'lab-test-summary', branches, signals };
  }
  if (hit(/\b(settlement|piezometer|inclinometer|monitoring|instrumentation)\b/, 'filename:monitoring')) {
    branches.push('monitoring');
    return { datasetType: 'monitoring-time-series', branches, signals };
  }
  if (hit(/\b(vibration|accelerometer|seismic[-_\s]?signal|fft|psd)\b/, 'filename:signal')) {
    branches.push('monitoring', 'signal-processing');
    return { datasetType: 'signal-record', branches, signals };
  }
  if (hit(/\b(load[-_\s]?test|pile[-_\s]?load)\b/, 'filename:pile-load-test')) {
    branches.push('foundation', 'pile');
    return { datasetType: 'pile-load-test', branches, signals };
  }
  if (hit(/\b(coordinate|location|easting|northing|survey)\b/, 'filename:coordinates')) {
    branches.push('mapping', 'site-investigation');
    return { datasetType: 'coordinate-table', branches, signals };
  }

  return { branches, signals };
}

function kindFromExtension(extension: string): WorkspaceFileKind {
  if (extension === '.pdf') return 'pdf';
  if (extension === '.csv' || extension === '.tsv') return 'csv';
  if (extension === '.xlsx') return 'xlsx';
  if (extension === '.ags') return 'ags';
  if (extension === '.json') return 'json';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (GIS_EXTENSIONS.has(extension)) return 'gis';
  if (CAD_EXTENSIONS.has(extension)) return 'cad';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'unknown';
}

function datasetTypeFromSchema(schema: TabularSchemaInference): WorkspaceDatasetType {
  switch (schema.datasetType) {
    case 'borehole-table':
      return 'borehole-table';
    case 'cpt-profile':
      return 'cpt-profile';
    case 'spt-profile':
      return 'spt-profile';
    case 'lab-test-summary':
      return 'lab-test-summary';
    case 'coordinate-table':
      return 'coordinate-table';
    case 'monitoring-time-series':
      return 'monitoring-time-series';
    case 'pile-load-test':
      return 'pile-load-test';
    case 'signal-record':
      return 'signal-record';
    default:
      return 'unknown';
  }
}

export function classifyWorkspaceFile(
  fileName: string,
  options: {
    schemas?: TabularSchemaInference[];
    agsSignature?: boolean;
  } = {},
): WorkspaceFileClassification {
  const extension = extname(fileName).toLowerCase();
  const kind = kindFromExtension(extension);
  const branches = new Set<string>();
  const warnings: string[] = [];
  const signals: string[] = [];
  let datasetType: WorkspaceDatasetType = 'unknown';
  let confidence = 0.35;

  const nameSignal = filenameSignals(fileName);
  nameSignal.branches.forEach((branch) => addBranch(branches, branch));
  signals.push(...nameSignal.signals);
  if (nameSignal.datasetType) {
    datasetType = nameSignal.datasetType;
    confidence = 0.64;
  }

  if (kind === 'ags') {
    datasetType = 'ags-ground-investigation';
    addBranch(branches, 'site-investigation');
    addBranch(branches, 'foundation');
    signals.push(options.agsSignature ? 'ags:GROUP/HEADING signature' : 'extension:.ags');
    confidence = options.agsSignature ? 0.92 : 0.76;
  }

  if (kind === 'gis') {
    datasetType = 'map-or-gis';
    addBranch(branches, 'mapping');
    signals.push('extension:GIS');
    confidence = Math.max(confidence, 0.74);
  }

  if (kind === 'cad') {
    addBranch(branches, 'mapping');
    signals.push('extension:CAD');
    confidence = Math.max(confidence, 0.55);
  }

  if (kind === 'image') {
    datasetType = datasetType === 'unknown' ? 'image-evidence' : datasetType;
    signals.push('extension:image');
    confidence = Math.max(confidence, 0.48);
  }

  if (kind === 'json' && datasetType === 'unknown') {
    datasetType = 'calculation-result';
    signals.push('extension:json');
    confidence = 0.45;
  }

  const schemas = options.schemas ?? [];
  const strongestSchema = schemas
    .filter((schema) => schema.datasetType !== 'generic-table')
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (strongestSchema) {
    const schemaDatasetType = datasetTypeFromSchema(strongestSchema);
    if (schemaDatasetType !== 'unknown') {
      datasetType = schemaDatasetType;
      confidence = Math.max(confidence, strongestSchema.confidence);
      strongestSchema.branches.forEach((branch) => addBranch(branches, branch));
      signals.push(`schema:${strongestSchema.datasetType}`);
    }
  }

  if (!strongestSchema && schemas.length > 0) {
    const schemaWithBranches = schemas.find((schema) => schema.branches.length > 0);
    if (schemaWithBranches) {
      schemaWithBranches.branches.forEach((branch) => addBranch(branches, branch));
      confidence = Math.max(confidence, schemaWithBranches.confidence);
      signals.push(`schema:${schemaWithBranches.datasetType}`);
    }
  }

  if ((kind === 'csv' || kind === 'xlsx') && schemas.length === 0) {
    signals.push(`extension:${extension.slice(1)}`);
    warnings.push('Tabular schema was not sampled.');
  }

  if (kind === 'pdf' && datasetType === 'unknown') {
    datasetType = 'geotechnical-report';
    addBranch(branches, 'site-investigation');
    signals.push('extension:pdf');
    confidence = 0.42;
  }

  return {
    kind,
    datasetType,
    branches: [...branches],
    confidence: Math.round(confidence * 100) / 100,
    signals: signals.length > 0 ? [...new Set(signals)] : ['extension-only'],
    warnings,
  };
}

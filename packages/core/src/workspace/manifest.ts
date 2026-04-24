import type { TabularSchemaInference } from '../tabular/index.js';
import type { GroundModel } from '../ground-model/index.js';
import type { GroundModelVerification } from '../verifier/index.js';

export type WorkspaceFileKind =
  | 'pdf'
  | 'csv'
  | 'xlsx'
  | 'ags'
  | 'json'
  | 'image'
  | 'gis'
  | 'cad'
  | 'office'
  | 'text'
  | 'unknown';

export type WorkspaceDatasetType =
  | 'geotechnical-report'
  | 'borehole-log'
  | 'borehole-table'
  | 'cpt-profile'
  | 'spt-profile'
  | 'lab-test-summary'
  | 'coordinate-table'
  | 'monitoring-time-series'
  | 'pile-load-test'
  | 'signal-record'
  | 'ags-ground-investigation'
  | 'map-or-gis'
  | 'calculation-result'
  | 'image-evidence'
  | 'unknown';

export interface WorkspaceFileClassification {
  kind: WorkspaceFileKind;
  datasetType: WorkspaceDatasetType;
  branches: string[];
  confidence: number;
  signals: string[];
  warnings: string[];
}

export interface WorkspaceFileEntry {
  path: string;
  absolutePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  classification: WorkspaceFileClassification;
  schemas?: TabularSchemaInference[];
}

export interface ProjectManifestSummary {
  totalFiles: number;
  supportedFiles: number;
  tabularFiles: number;
  pdfFiles: number;
  imageFiles: number;
  skippedFiles: number;
  kinds: Record<string, number>;
  datasetTypes: Record<string, number>;
  branches: string[];
  recommendations: string[];
}

export interface ProjectManifest {
  schemaVersion: 'workspace-manifest.v1';
  generatedAt: string;
  rootPath: string;
  requestedBranch?: string;
  requestedStandard?: string;
  files: WorkspaceFileEntry[];
  summary: ProjectManifestSummary;
  groundModel?: GroundModel;
  verifier?: GroundModelVerification;
  warnings: string[];
}

export interface AnalyzeWorkspaceOptions {
  maxDepth?: number;
  maxFiles?: number;
  maxSampleBytes?: number;
  maxRows?: number;
  branch?: string;
  standard?: string;
  includeGroundModel?: boolean;
}

export const DEFAULT_ANALYZE_WORKSPACE_OPTIONS = {
  maxDepth: 5,
  maxFiles: 600,
  maxSampleBytes: 2_500_000,
  maxRows: 200,
} as const;

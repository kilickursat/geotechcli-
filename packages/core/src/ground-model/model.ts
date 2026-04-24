import type { EvidenceRef } from '../evidence/index.js';

export type GroundModelSchemaVersion = 'ground-model.v1';

export type GroundModelCoordinateSystemKind = 'unknown' | 'local-grid' | 'geographic';

export interface GroundModelProject {
  rootPath: string;
  requestedBranch?: string;
  requestedStandard?: string;
}

export interface GroundModelCoordinateSystem {
  kind: GroundModelCoordinateSystemKind;
  crs?: string;
  warnings: string[];
}

export interface GroundModelCoordinate {
  easting?: number;
  northing?: number;
  latitude?: number;
  longitude?: number;
  evidenceIds: string[];
  confidence: number;
}

export interface GroundModelSptTest {
  depth: number;
  nValue: number;
  unit?: string;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelStratum {
  boreholeId?: string;
  topDepth?: number;
  bottomDepth?: number;
  description: string;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelGroundwaterObservation {
  boreholeId?: string;
  depth: number;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelParameter {
  name: string;
  value: number | string;
  unit?: string;
  boreholeId?: string;
  sampleId?: string;
  depth?: number;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelLabTest {
  sampleId?: string;
  boreholeId?: string;
  depth?: number;
  parameters: GroundModelParameter[];
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelMonitoringSeries {
  sourcePath: string;
  sheetName?: string;
  kind: 'settlement' | 'pore-pressure' | 'inclination' | 'vibration' | 'unknown';
  sampleCount: number;
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelBorehole {
  id: string;
  coordinates?: GroundModelCoordinate;
  sptTests: GroundModelSptTest[];
  strata: GroundModelStratum[];
  groundwater: GroundModelGroundwaterObservation[];
  evidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelRejectedObservation {
  kind: 'spt' | 'depth' | 'parameter';
  reason: string;
  sourcePath: string;
  evidenceIds: string[];
  rawValue?: string | number | boolean | null;
}

export interface GroundModelStats {
  boreholes: number;
  sptTests: number;
  strata: number;
  groundwaterObservations: number;
  labTests: number;
  parameters: number;
  monitoringSeries: number;
  evidenceRefs: number;
  rejectedObservations: number;
}

export interface GroundModel {
  schemaVersion: GroundModelSchemaVersion;
  generatedAt: string;
  project: GroundModelProject;
  coordinateSystem: GroundModelCoordinateSystem;
  boreholes: GroundModelBorehole[];
  strata: GroundModelStratum[];
  groundwater: GroundModelGroundwaterObservation[];
  labTests: GroundModelLabTest[];
  parameters: GroundModelParameter[];
  monitoringSeries: GroundModelMonitoringSeries[];
  evidence: EvidenceRef[];
  rejectedObservations: GroundModelRejectedObservation[];
  warnings: string[];
  stats: GroundModelStats;
}

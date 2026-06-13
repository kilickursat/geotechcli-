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
  /** Deterministic normalized lithology derived from the description (additive, optional). */
  lithology?: {
    key: string;
    materialClass: string;
    uscsSymbol: string | null;
    confidence: number;
  };
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

export type GroundModelMapSchemaVersion = 'ground-model-map.v1';

export type GroundModelMapPointKind = 'borehole' | 'cpt' | 'monitoring' | 'unknown';

export type GroundModelMapCoordinateType = 'projected' | 'geographic';

export interface GroundModelMapPoint {
  id: string;
  label: string;
  kind: GroundModelMapPointKind;
  coordinateType: GroundModelMapCoordinateType;
  x: number;
  y: number;
  easting?: number;
  northing?: number;
  latitude?: number;
  longitude?: number;
  sourceEvidenceIds: string[];
  confidence: number;
  warnings: string[];
}

export interface GroundModelMapExtent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface GroundModelMapSummary {
  totalPoints: number;
  boreholePoints: number;
  missingBoreholeCoordinates: number;
  averageConfidence: number;
}

export interface GroundModelMap {
  schemaVersion: GroundModelMapSchemaVersion;
  coordinateSystem: GroundModelCoordinateSystem;
  coordinateType?: GroundModelMapCoordinateType;
  points: GroundModelMapPoint[];
  extent?: GroundModelMapExtent;
  summary: GroundModelMapSummary;
  warnings: string[];
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
  map?: GroundModelMap;
  evidence: EvidenceRef[];
  rejectedObservations: GroundModelRejectedObservation[];
  warnings: string[];
  stats: GroundModelStats;
}

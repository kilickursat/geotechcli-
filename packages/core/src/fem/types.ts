export type FemObjective = 'foundation_settlement' | 'excavation_deformation';

export type FemAnalysisType = 'static_3d_small_strain' | 'static_3d_staged_elastic';

export type FemAssumptionConfidence = 'measured' | 'inferred' | 'review';

export type FemFindingSeverity = 'info' | 'review' | 'blocker';

export interface FemUnits {
  length: 'm';
  force: 'kN';
  stress: 'kPa';
  density: 'kN/m3';
  displacement: 'mm';
}

export interface FemEvidenceRef {
  id: string;
  source?: string;
  page?: number;
  note?: string;
}

export interface FemAssumption {
  id: string;
  parameter: string;
  value: string | number;
  unit?: string;
  basis: string;
  confidence: FemAssumptionConfidence;
  reviewRequired: boolean;
}

export interface FemMaterial {
  id: string;
  name: string;
  model: 'linear_elastic';
  elasticModulusKpa: number;
  poissonRatio: number;
  unitWeightKnM3: number;
  evidenceRefs: FemEvidenceRef[];
  assumptions: FemAssumption[];
}

export interface FemBoxDomain {
  type: 'box';
  lengthM: number;
  widthM: number;
  depthM: number;
}

export interface FemRaftGeometry {
  type: 'raft';
  lengthM: number;
  widthM: number;
  thicknessM: number;
  centerXM: number;
  centerYM: number;
}

export interface FemExcavationStage {
  id: string;
  label: string;
  depthM: number;
  supportLevelM?: number;
}

export interface FemExcavationGeometry {
  type: 'braced_excavation';
  lengthM: number;
  widthM: number;
  finalDepthM: number;
  centerXM: number;
  centerYM: number;
  wallToeDepthM: number;
  wallType: 'diaphragm_wall' | 'secant_pile_wall' | 'soldier_pile_lagging' | 'unsupported_screening';
  stages: FemExcavationStage[];
}

export interface FemPressureLoad {
  id: string;
  type: 'uniform_pressure';
  target: 'raft' | 'excavation_surcharge';
  pressureKpa: number;
  evidenceRefs: FemEvidenceRef[];
  assumptions: FemAssumption[];
}

export interface FemBoundaryCondition {
  id: string;
  type: 'fixed_base' | 'side_rollers';
  description: string;
}

export interface FemMeshSettings {
  elementType: 'hex8';
  divisionsX: number;
  divisionsY: number;
  divisionsZ: number;
}

export interface FemGroundwaterAssumption {
  condition: 'not_modelled' | 'below_domain' | 'specified';
  depthM?: number;
  note: string;
  reviewRequired: boolean;
}

export interface FemAnalysisCase {
  schemaVersion: 'fem-analysis-case.v0';
  caseId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  experimental: true;
  objective: FemObjective;
  analysisType: FemAnalysisType;
  units: FemUnits;
  geometry: {
    domain: FemBoxDomain;
    raft?: FemRaftGeometry;
    excavation?: FemExcavationGeometry;
  };
  materials: FemMaterial[];
  loads: FemPressureLoad[];
  boundaryConditions: FemBoundaryCondition[];
  mesh: FemMeshSettings;
  groundwater: FemGroundwaterAssumption;
  assumptions: FemAssumption[];
  evidenceRefs: FemEvidenceRef[];
  limitations: string[];
}

export interface FemValidationFinding {
  severity: FemFindingSeverity;
  code: string;
  message: string;
}

export interface FemValidationSummary {
  status: 'ready' | 'review' | 'blocked';
  blockers: number;
  reviewItems: number;
  findings: FemValidationFinding[];
}

export interface FemVisualizationMesh {
  base: number[];
  disp: number[];
  color: number[];
  tri: number[];
  edge: number[];
  outlineBase: number[];
  outlineDisp: number[];
  outlineIdx: number[];
  frames?: FemVisualizationFrame[];
}

export interface FemVisualizationFrame {
  field: string;
  fieldLabel: string;
  stageIndex?: number;
  stageLabel?: string;
  disp: number[];
  color: number[];
}

export interface FemResultEnvelope {
  maxSettlementMm: number;
  minSettlementMm: number;
  totalLoadKn: number;
  reactionKn: number;
  reactionBalanceRatio: number;
  maxSurfaceSettlementMm?: number;
  maxHorizontalDisplacementMm?: number;
  maxWallDeflectionMm?: number;
  maxBasalHeaveMm?: number;
  totalExcavatedWeightKn?: number;
  supportReactionKn?: number;
  boundaryReactionKn?: number;
  stageCount?: number;
}

export interface FemResultManifest {
  schemaVersion: 'fem-result-manifest.v0';
  caseId: string;
  title: string;
  generatedAt: string;
  backend: {
    id: 'builtin-elastic3d-demo' | 'builtin-staged-excavation-demo';
    label: string;
    deterministic: true;
    version: string;
  };
  analysisCase: FemAnalysisCase;
  validation: FemValidationSummary;
  mesh: {
    nodes: number;
    elements: number;
    elementType: 'hex8';
    divisions: [number, number, number];
    visualizationNodes: number;
    visualizationTriangles: number;
    visualizationEdges: number;
  };
  envelope: FemResultEnvelope;
  visualization: FemVisualizationMesh;
  assumptions: FemAssumption[];
  limitations: string[];
}

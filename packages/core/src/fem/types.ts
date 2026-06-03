import type { FemConvergencePolicy } from './engineering-evidence.js';

export type FemObjective =
  | 'foundation_settlement'
  | 'excavation_deformation'
  | 'tunnel_volume_loss_settlement'
  | 'staged_settlement_consolidation'
  | 'seepage_groundwater_coupling';

export type FemAnalysisType =
  | 'static_3d_small_strain'
  | 'static_3d_staged_elastic'
  | 'empirical_3d_settlement_surface'
  | 'time_dependent_1d_consolidation'
  | 'time_dependent_2d_biot_consolidation';

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
  model: 'linear_elastic' | 'mohr_coulomb';
  elasticModulusKpa: number;
  poissonRatio: number;
  unitWeightKnM3: number;
  constrainedModulusKpa?: number;
  frictionAngleDeg?: number;
  cohesionKpa?: number;
  coefficientOfConsolidationM2PerYear?: number;
  hydraulicConductivityMPerS?: number;
  hydraulicConductivityXMPerS?: number;
  hydraulicConductivityYMPerS?: number;
  biotCoefficient?: number;
  specificStorage1PerM?: number;
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

export interface FemTunnelGeometry {
  type: 'tunnel';
  diameterM: number;
  axisDepthM: number;
  lengthM: number;
  centerXM: number;
  centerYM: number;
  volumeLossPercent: number;
  troughWidthParameterK: number;
}

export interface FemConsolidationStage {
  id: string;
  label: string;
  loadKpa: number;
  durationYears: number;
}

export interface FemConsolidationGeometry {
  type: 'soil_column';
  layerThicknessM: number;
  surfaceAreaM2: number;
  drainage: 'single' | 'double';
  stages: FemConsolidationStage[];
}

export interface FemBiotPressureBoundary {
  id: string;
  boundary: 'top' | 'bottom' | 'left' | 'right';
  porePressureKpa: number;
}

export interface FemBiotPlaneStrainGeometry {
  type: 'plane_strain_biot_column';
  widthM: number;
  heightM: number;
  thicknessM: number;
  initialPorePressureKpa: number;
  timeStepsSeconds: number[];
  porePressureBoundaries: FemBiotPressureBoundary[];
}

export interface FemPressureLoad {
  id: string;
  type: 'uniform_pressure';
  target: 'raft' | 'excavation_surcharge' | 'ground_surface';
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
  elementType: 'hex8' | 'quad4_plane_strain';
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
    tunnel?: FemTunnelGeometry;
    consolidation?: FemConsolidationGeometry;
    biot?: FemBiotPlaneStrainGeometry;
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
  scalarValues?: number[];
}

export interface FemResultField {
  id: string;
  label: string;
  unit: string;
  location: 'surface_nodes' | 'outline_nodes' | 'envelope';
  quantity: 'displacement' | 'reaction' | 'load' | 'stage_count' | 'pore_pressure' | 'degree_of_consolidation' | 'strength_ratio';
  component?: 'x' | 'y' | 'z' | 'magnitude';
  signConvention?: string;
}

export interface FemResultStep {
  id: string;
  label: string;
  index: number;
  analysisStageId?: string;
  depthM?: number;
  timeSeconds?: number;
  deltaTimeSeconds?: number;
}

export interface FemResultDataset {
  id: string;
  fieldId: string;
  stepId?: string;
  values: number[];
  stride: 1 | 3;
  source: 'visualization.disp' | 'visualization.frame' | 'visualization.scalar-frame' | 'envelope';
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
  finalSettlementMm?: number;
  plasticSettlementMm?: number;
  finalDegreeOfConsolidation?: number;
  maxExcessPorePressureKpa?: number;
  maxMobilizedStrengthRatio?: number;
  drainagePathM?: number;
  consolidationDurationYears?: number;
  solverLoadSteps?: number;
  solverIterations?: number;
  maxSolverResidualRatio?: number;
  maxYieldResidualRatio?: number;
  nonlinearPlasticStrain?: number;
  timeStepCount?: number;
  minPorePressureKpa?: number;
  maxPorePressureKpa?: number;
  maxBiotCouplingKpa?: number;
  porePressureMassBalanceErrorRatio?: number;
  maxFreePorePressureResidualM3PerS?: number;
  freePorePressureResidualL1M3PerS?: number;
  prescribedPorePressureResidualL1M3PerS?: number;
  averagePorePressureKpa?: number;
  averageFreePorePressureKpa?: number;
  porePressureDissipationRatio?: number;
  maxPorePressureChangeRateKpaPerS?: number;
  coupledUnknownCount?: number;
  displacementDofCount?: number;
  porePressureDofCount?: number;
  tunnelDiameterM?: number;
  tunnelAxisDepthM?: number;
  volumeLossPercent?: number;
  troughWidthM?: number;
  influenceWidthM?: number;
  settlementVolumeM3?: number;
  settlementVolumePerM?: number;
}

export interface FemResultPressureAudit {
  freePorePressureResidualL1M3PerS: number;
  prescribedPorePressureResidualL1M3PerS: number;
  netPrescribedPressureBoundaryFlowM3PerS: number;
  appliedNodalFluxSumM3PerS: number;
  storageRateSumM3PerS: number;
  couplingRateSumM3PerS: number;
  darcyFlowRateSumM3PerS: number;
}

export type FemSolverConvergenceStatus = 'converged' | 'nonconverged';

export type FemSolverTerminationReason =
  | 'converged'
  | 'max_iterations'
  | 'force_residual_exceeded'
  | 'yield_residual_exceeded'
  | 'material_nonconvergence'
  | 'consolidation_nonconvergence';

export interface FemSolverResidualHistoryEntry {
  iteration: number;
  residualRatio: number;
  forceBalanceTolerance: number;
  yieldResidualRatio?: number;
  residualTolerance?: number;
  maxFreeResidualKn?: number;
  axialStrain?: number;
  verticalStressKpa?: number;
  converged: boolean;
}

export interface FemSolverLoadStepConvergence {
  step: number;
  stageId?: string;
  stageLabel?: string;
  loadFactor?: number;
  cumulativeLoadKpa?: number;
  iterations: number;
  residualRatio: number;
  forceBalanceTolerance: number;
  yieldResidualRatio?: number;
  residualTolerance?: number;
  converged: boolean;
  terminationReason: FemSolverTerminationReason;
  residualHistory: FemSolverResidualHistoryEntry[];
}

export interface FemSolverConvergenceFailure {
  step: number;
  stageId?: string;
  terminationReason: FemSolverTerminationReason;
  residualRatio: number;
  yieldResidualRatio?: number;
  message: string;
}

export interface FemSolverConvergenceReport {
  schemaVersion: 'fem-solver-convergence-report.v1';
  status: FemSolverConvergenceStatus;
  policy: FemConvergencePolicy;
  loadSteps: FemSolverLoadStepConvergence[];
  failure?: FemSolverConvergenceFailure;
}

export interface FemResultManifest {
  schemaVersion: 'fem-result-manifest.v0';
  caseId: string;
  title: string;
  generatedAt: string;
  backend: {
    id: 'builtin-elastic3d-demo' | 'builtin-staged-excavation-demo' | 'builtin-tunnel-volume-loss-demo' | 'builtin-staged-consolidation-1d' | 'builtin-nonlinear-column-v0' | 'builtin-biot-up-plane-strain-v0';
    label: string;
    deterministic: true;
    version: string;
  };
  analysisCase: FemAnalysisCase;
  validation: FemValidationSummary;
  mesh: {
    nodes: number;
    elements: number;
    elementType: 'hex8' | 'quad4_plane_strain';
    divisions: [number, number, number];
    visualizationNodes: number;
    visualizationTriangles: number;
    visualizationEdges: number;
  };
  envelope: FemResultEnvelope;
  pressureAudit?: FemResultPressureAudit;
  solverConvergence?: FemSolverConvergenceReport;
  visualization: FemVisualizationMesh;
  resultFields?: FemResultField[];
  steps?: FemResultStep[];
  datasets?: FemResultDataset[];
  assumptions: FemAssumption[];
  limitations: string[];
}

import {
  buildRaftDemoAnalysisCase,
} from './demo.js';
import type {
  FemAnalysisCase,
  FemAssumption,
  FemEvidenceRef,
  FemValidationSummary,
} from './types.js';
import { validateFemAnalysisCase } from './validation.js';

export type FemRouteObjective =
  | 'foundation-settlement'
  | 'excavation-deformation'
  | 'shaft-deformation'
  | 'tunnel-volume-loss-settlement'
  | 'pile-group-elastic-interaction';

export type FemCapabilityStatus = 'implemented-demo' | 'contract-draft' | 'planned';

export interface FemCapability {
  objective: FemRouteObjective;
  label: string;
  status: FemCapabilityStatus;
  analysisType: string;
  deterministicBackend: string | null;
  description: string;
  requiredEvidence: string[];
  requiredUserInputs: string[];
  visualizationFields: string[];
  reviewGates: string[];
  limitations: string[];
  command?: string;
}

export interface PrepareFemAnalysisCaseDraftInput {
  objective: FemRouteObjective;
  useDemoDefaults?: boolean;
  geometry?: {
    raftLengthM?: number;
    raftWidthM?: number;
    raftThicknessM?: number;
    domainLengthM?: number;
    domainWidthM?: number;
    domainDepthM?: number;
  };
  load?: {
    pressureKpa?: number;
  };
  material?: {
    elasticModulusKpa?: number;
    poissonRatio?: number;
    unitWeightKnM3?: number;
  };
  groundwater?: {
    condition?: 'not_modelled' | 'below_domain' | 'specified';
    depthM?: number;
    note?: string;
  };
  evidenceRefs?: FemEvidenceRef[];
}

export interface FemAnalysisCaseDraft {
  schemaVersion: 'fem-analysis-case-draft.v1';
  objective: FemRouteObjective;
  capability: FemCapability;
  implemented: boolean;
  canAutoProceed: false;
  recommendedAction: 'run-experimental-demo' | 'collect-inputs' | 'contract-only';
  missingUserInputs: string[];
  assumptions: FemAssumption[];
  reviewGates: string[];
  evidenceRefs: FemEvidenceRef[];
  analysisCase?: FemAnalysisCase;
  validation?: FemValidationSummary;
  recommendedCommand?: string;
}

const CAPABILITIES: FemCapability[] = [
  {
    objective: 'foundation-settlement',
    label: 'Foundation / raft settlement preview',
    status: 'implemented-demo',
    analysisType: 'static_3d_small_strain',
    deterministicBackend: 'builtin-elastic3d-demo',
    description: 'Experimental deterministic 3D elastic settlement preview for a uniformly loaded raft.',
    requiredEvidence: ['GroundModel strata', 'elastic modulus or SPT/lab correlation basis', 'unit weight', 'groundwater assumption'],
    requiredUserInputs: ['raft length', 'raft width', 'service pressure', 'foundation level / embedment'],
    visualizationFields: ['vertical displacement', 'settlement basin', 'mesh wireframe', 'load patch'],
    reviewGates: ['experimental-only', 'linear-elastic-only', 'groundwater-not-coupled', 'not-design-calculation'],
    limitations: ['No plasticity, consolidation, construction staging, or pore pressure coupling.'],
    command: 'geotech fem demo raft --experimental',
  },
  {
    objective: 'excavation-deformation',
    label: 'Staged excavation deformation preview',
    status: 'contract-draft',
    analysisType: 'static_3d_staged_elastic',
    deterministicBackend: null,
    description: 'Planned staged excavation preview for settlement trough, wall deflection proxy, and support reaction review.',
    requiredEvidence: ['stratigraphy', 'groundwater condition', 'wall geometry', 'support levels', 'elastic stiffness basis'],
    requiredUserInputs: ['excavation length', 'excavation width', 'final depth', 'stage depths', 'wall/support assumptions'],
    visualizationFields: ['surface settlement', 'horizontal displacement', 'wall deflection proxy', 'stage slider', 'support overlays'],
    reviewGates: ['contract-only', 'unsupported-wall-design', 'groundwater-coupling-required-review', 'not-basal-heave-verification'],
    limitations: ['No wall design, basal heave design, seepage, consolidation, or nonlinear soil response.'],
  },
  {
    objective: 'shaft-deformation',
    label: 'Shaft / pit deformation preview',
    status: 'planned',
    analysisType: 'static_3d_staged_elastic',
    deterministicBackend: null,
    description: 'Planned circular or polygonal shaft deformation preview using the staged excavation contract.',
    requiredEvidence: ['shaft geometry', 'stratigraphy', 'groundwater condition', 'support assumptions'],
    requiredUserInputs: ['shaft diameter/shape', 'final depth', 'support sequence', 'groundwater handling'],
    visualizationFields: ['radial ground movement', 'surface settlement', 'support reaction proxy'],
    reviewGates: ['planned-only', 'not-design-calculation'],
    limitations: ['No production solver or code acceptance check is available yet.'],
  },
  {
    objective: 'tunnel-volume-loss-settlement',
    label: 'Tunnel volume-loss settlement preview',
    status: 'planned',
    analysisType: 'empirical_3d_settlement_surface',
    deterministicBackend: null,
    description: 'Planned deterministic 3D settlement surface from prescribed tunnel volume loss.',
    requiredEvidence: ['tunnel geometry', 'cover depth', 'ground class', 'volume-loss assumption'],
    requiredUserInputs: ['diameter', 'axis depth', 'alignment', 'volume loss', 'trough width parameter'],
    visualizationFields: ['settlement trough', 'building influence corridor', 'alignment overlay'],
    reviewGates: ['planned-only', 'volume-loss-assumption-review', 'not-fem-solver'],
    limitations: ['Empirical preview only; not a tunnel lining or ground loss design model.'],
  },
  {
    objective: 'pile-group-elastic-interaction',
    label: 'Pile group elastic interaction preview',
    status: 'planned',
    analysisType: 'static_3d_soil_structure_screening',
    deterministicBackend: null,
    description: 'Planned pile group displacement and interaction preview after pile/soil spring contracts are stable.',
    requiredEvidence: ['pile layout', 'pile geometry', 'stratigraphy', 'stiffness/capacity basis'],
    requiredUserInputs: ['pile diameter', 'pile length', 'pile spacing', 'load case', 'pile head condition'],
    visualizationFields: ['pile head settlement', 'interaction contours', 'load share proxy'],
    reviewGates: ['planned-only', 'pile-soil-interface-review', 'not-design-calculation'],
    limitations: ['No pile group solver or code acceptance check is available yet.'],
  },
];

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function requirePositive(value: unknown, label: string, missing: string[]): number | undefined {
  if (finitePositive(value)) return value;
  missing.push(label);
  return undefined;
}

export function listFemCapabilities(objective?: FemRouteObjective): FemCapability[] {
  return CAPABILITIES.filter((capability) => objective == null || capability.objective === objective);
}

export function getFemCapability(objective: FemRouteObjective): FemCapability | undefined {
  return CAPABILITIES.find((capability) => capability.objective === objective);
}

export function prepareFemAnalysisCaseDraft(input: PrepareFemAnalysisCaseDraftInput): FemAnalysisCaseDraft {
  const capability = getFemCapability(input.objective);
  if (!capability) {
    return {
      schemaVersion: 'fem-analysis-case-draft.v1',
      objective: input.objective,
      capability: {
        objective: input.objective,
        label: 'Unknown FEM route',
        status: 'planned',
        analysisType: 'unknown',
        deterministicBackend: null,
        description: 'The requested FEM route is not registered in geotechCLI.',
        requiredEvidence: [],
        requiredUserInputs: [],
        visualizationFields: [],
        reviewGates: ['unknown-fem-route'],
        limitations: ['No FEM contract exists for this route.'],
      },
      implemented: false,
      canAutoProceed: false,
      recommendedAction: 'contract-only',
      missingUserInputs: ['supported FEM objective'],
      assumptions: [],
      reviewGates: ['unknown-fem-route'],
      evidenceRefs: input.evidenceRefs ?? [],
    };
  }

  if (capability.objective !== 'foundation-settlement') {
    return {
      schemaVersion: 'fem-analysis-case-draft.v1',
      objective: capability.objective,
      capability,
      implemented: false,
      canAutoProceed: false,
      recommendedAction: 'contract-only',
      missingUserInputs: capability.requiredUserInputs,
      assumptions: [],
      reviewGates: capability.reviewGates,
      evidenceRefs: input.evidenceRefs ?? [],
    };
  }

  const missing: string[] = [];
  const useDemoDefaults = input.useDemoDefaults === true;
  const raftLengthM = input.geometry?.raftLengthM ?? (useDemoDefaults ? 8 : undefined);
  const raftWidthM = input.geometry?.raftWidthM ?? (useDemoDefaults ? 8 : undefined);
  const pressureKpa = input.load?.pressureKpa ?? (useDemoDefaults ? 150 : undefined);
  const checkedRaftLengthM = requirePositive(raftLengthM, 'raft length', missing);
  const checkedRaftWidthM = requirePositive(raftWidthM, 'raft width', missing);
  const checkedPressureKpa = requirePositive(pressureKpa, 'service pressure', missing);

  if (!checkedRaftLengthM || !checkedRaftWidthM || !checkedPressureKpa) {
    return {
      schemaVersion: 'fem-analysis-case-draft.v1',
      objective: capability.objective,
      capability,
      implemented: true,
      canAutoProceed: false,
      recommendedAction: 'collect-inputs',
      missingUserInputs: missing,
      assumptions: [],
      reviewGates: ['missing-user-inputs', ...capability.reviewGates],
      evidenceRefs: input.evidenceRefs ?? [],
      recommendedCommand: capability.command,
    };
  }

  const analysisCase = buildRaftDemoAnalysisCase();
  analysisCase.caseId = 'raft-settlement-draft';
  analysisCase.title = 'Experimental 3D FEM raft settlement draft';
  analysisCase.createdBy = 'geotechcli-fem-routing';
  analysisCase.geometry.raft.lengthM = checkedRaftLengthM;
  analysisCase.geometry.raft.widthM = checkedRaftWidthM;
  analysisCase.geometry.raft.thicknessM = input.geometry?.raftThicknessM ?? analysisCase.geometry.raft.thicknessM;
  analysisCase.geometry.domain.lengthM = input.geometry?.domainLengthM ?? Math.max(checkedRaftLengthM * 3, analysisCase.geometry.domain.lengthM);
  analysisCase.geometry.domain.widthM = input.geometry?.domainWidthM ?? Math.max(checkedRaftWidthM * 3, analysisCase.geometry.domain.widthM);
  analysisCase.geometry.domain.depthM = input.geometry?.domainDepthM ?? Math.max(checkedRaftLengthM, checkedRaftWidthM, analysisCase.geometry.domain.depthM);
  analysisCase.loads[0].pressureKpa = checkedPressureKpa;
  analysisCase.evidenceRefs = input.evidenceRefs ?? [];
  analysisCase.materials[0].evidenceRefs = input.evidenceRefs ?? [];
  if (finitePositive(input.material?.elasticModulusKpa)) analysisCase.materials[0].elasticModulusKpa = input.material.elasticModulusKpa;
  if (typeof input.material?.poissonRatio === 'number') analysisCase.materials[0].poissonRatio = input.material.poissonRatio;
  if (finitePositive(input.material?.unitWeightKnM3)) analysisCase.materials[0].unitWeightKnM3 = input.material.unitWeightKnM3;
  if (input.groundwater?.condition) {
    analysisCase.groundwater.condition = input.groundwater.condition;
  }
  if (typeof input.groundwater?.depthM === 'number') {
    analysisCase.groundwater.depthM = input.groundwater.depthM;
  }
  if (input.groundwater?.note) {
    analysisCase.groundwater.note = input.groundwater.note;
  }

  const validation = validateFemAnalysisCase(analysisCase);
  const reviewGates = [
    ...capability.reviewGates,
    ...validation.findings
      .filter((finding) => finding.severity !== 'info')
      .map((finding) => finding.code),
  ];

  return {
    schemaVersion: 'fem-analysis-case-draft.v1',
    objective: capability.objective,
    capability,
    implemented: true,
    canAutoProceed: false,
    recommendedAction: 'run-experimental-demo',
    missingUserInputs: [],
    assumptions: analysisCase.assumptions,
    reviewGates: [...new Set(reviewGates)],
    evidenceRefs: analysisCase.evidenceRefs,
    analysisCase,
    validation,
    recommendedCommand: capability.command,
  };
}

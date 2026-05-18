import {
  buildExcavationDemoAnalysisCase,
  buildRaftDemoAnalysisCase,
  buildTunnelVolumeLossDemoAnalysisCase,
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
    excavationLengthM?: number;
    excavationWidthM?: number;
    excavationFinalDepthM?: number;
    wallToeDepthM?: number;
    tunnelDiameterM?: number;
    tunnelAxisDepthM?: number;
    tunnelLengthM?: number;
    tunnelCenterXM?: number;
    tunnelCenterYM?: number;
    tunnelVolumeLossPercent?: number;
    troughWidthParameterK?: number;
  };
  excavation?: {
    stageDepthsM?: number[];
    supportLevelsM?: number[];
    wallType?: 'diaphragm_wall' | 'secant_pile_wall' | 'soldier_pile_lagging' | 'unsupported_screening';
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
    status: 'implemented-demo',
    analysisType: 'static_3d_staged_elastic',
    deterministicBackend: 'builtin-staged-excavation-demo',
    description: 'Experimental deterministic staged excavation deformation preview for settlement trough, wall deflection proxy, and support reaction review.',
    requiredEvidence: ['stratigraphy', 'groundwater condition', 'wall geometry', 'support levels', 'elastic stiffness basis'],
    requiredUserInputs: ['excavation length', 'excavation width', 'final depth', 'stage depths', 'wall/support assumptions'],
    visualizationFields: ['surface settlement', 'horizontal displacement', 'wall deflection proxy', 'stage slider', 'support overlays'],
    reviewGates: ['experimental-only', 'unsupported-wall-design', 'groundwater-coupling-required-review', 'not-basal-heave-verification', 'not-design-calculation'],
    limitations: ['No wall design, basal heave design, seepage, consolidation, or nonlinear soil response.'],
    command: 'geotech fem demo excavation --experimental',
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
    status: 'implemented-demo',
    analysisType: 'empirical_3d_settlement_surface',
    deterministicBackend: 'builtin-tunnel-volume-loss-demo',
    description: 'Experimental deterministic 3D empirical settlement surface from prescribed tunnel volume loss.',
    requiredEvidence: ['tunnel geometry', 'cover depth', 'ground class', 'volume-loss assumption'],
    requiredUserInputs: ['diameter', 'axis depth', 'alignment', 'volume loss', 'trough width parameter'],
    visualizationFields: ['settlement trough', 'building influence corridor', 'alignment overlay'],
    reviewGates: ['experimental-only', 'volume-loss-assumption-review', 'not-fem-solver', 'not-design-calculation'],
    limitations: ['Empirical preview only; not a tunnel lining or ground loss design model.'],
    command: 'geotech fem demo tunnel --experimental',
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

function roundStageDepth(value: number): number {
  return Math.round(value * 10) / 10;
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

  if (
    capability.objective !== 'foundation-settlement' &&
    capability.objective !== 'excavation-deformation' &&
    capability.objective !== 'tunnel-volume-loss-settlement'
  ) {
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

  if (capability.objective === 'tunnel-volume-loss-settlement') {
    const missing: string[] = [];
    const useDemoDefaults = input.useDemoDefaults === true;
    const diameterM = input.geometry?.tunnelDiameterM ?? (useDemoDefaults ? 6 : undefined);
    const axisDepthM = input.geometry?.tunnelAxisDepthM ?? (useDemoDefaults ? 18 : undefined);
    const lengthM = input.geometry?.tunnelLengthM ?? (useDemoDefaults ? 56 : undefined);
    const volumeLossPercent = input.geometry?.tunnelVolumeLossPercent ?? (useDemoDefaults ? 1.2 : undefined);
    const troughWidthParameterK = input.geometry?.troughWidthParameterK ?? (useDemoDefaults ? 0.5 : undefined);
    const checkedDiameterM = requirePositive(diameterM, 'tunnel diameter', missing);
    const checkedAxisDepthM = requirePositive(axisDepthM, 'tunnel axis depth', missing);
    const checkedLengthM = requirePositive(lengthM, 'tunnel alignment length', missing);
    const checkedVolumeLossPercent = requirePositive(volumeLossPercent, 'tunnel volume loss', missing);
    const checkedTroughWidthParameterK = requirePositive(troughWidthParameterK, 'trough width parameter', missing);

    if (
      !checkedDiameterM ||
      !checkedAxisDepthM ||
      !checkedLengthM ||
      !checkedVolumeLossPercent ||
      !checkedTroughWidthParameterK
    ) {
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

    const analysisCase = buildTunnelVolumeLossDemoAnalysisCase();
    analysisCase.caseId = 'tunnel-volume-loss-settlement-draft';
    analysisCase.title = 'Experimental 3D tunnel volume-loss settlement draft';
    analysisCase.createdBy = 'geotechcli-fem-routing';
    analysisCase.evidenceRefs = input.evidenceRefs ?? [];
    analysisCase.materials.forEach((material) => {
      material.evidenceRefs = input.evidenceRefs ?? [];
    });
    if (analysisCase.geometry.tunnel) {
      analysisCase.geometry.tunnel.diameterM = checkedDiameterM;
      analysisCase.geometry.tunnel.axisDepthM = checkedAxisDepthM;
      analysisCase.geometry.tunnel.lengthM = checkedLengthM;
      analysisCase.geometry.tunnel.centerXM = input.geometry?.tunnelCenterXM ?? analysisCase.geometry.tunnel.centerXM;
      analysisCase.geometry.tunnel.centerYM = input.geometry?.tunnelCenterYM ?? analysisCase.geometry.tunnel.centerYM;
      analysisCase.geometry.tunnel.volumeLossPercent = checkedVolumeLossPercent;
      analysisCase.geometry.tunnel.troughWidthParameterK = checkedTroughWidthParameterK;
    }
    const troughWidthM = checkedAxisDepthM * checkedTroughWidthParameterK;
    analysisCase.geometry.domain.lengthM = input.geometry?.domainLengthM ?? Math.max(checkedLengthM * 1.4, analysisCase.geometry.domain.lengthM);
    analysisCase.geometry.domain.widthM = input.geometry?.domainWidthM ?? Math.max(troughWidthM * 7, checkedDiameterM * 8, analysisCase.geometry.domain.widthM);
    analysisCase.geometry.domain.depthM = input.geometry?.domainDepthM ?? Math.max(checkedAxisDepthM + checkedDiameterM * 2, analysisCase.geometry.domain.depthM);
    if (finitePositive(input.material?.elasticModulusKpa)) analysisCase.materials[0].elasticModulusKpa = input.material.elasticModulusKpa;
    if (typeof input.material?.poissonRatio === 'number') analysisCase.materials[0].poissonRatio = input.material.poissonRatio;
    if (finitePositive(input.material?.unitWeightKnM3)) analysisCase.materials[0].unitWeightKnM3 = input.material.unitWeightKnM3;
    for (const assumption of analysisCase.assumptions) {
      if (assumption.id === 'volume-loss-assumption') assumption.value = checkedVolumeLossPercent;
      if (assumption.id === 'trough-width-factor') assumption.value = checkedTroughWidthParameterK;
    }
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

  if (capability.objective === 'excavation-deformation') {
    const missing: string[] = [];
    const useDemoDefaults = input.useDemoDefaults === true;
    const lengthM = input.geometry?.excavationLengthM ?? (useDemoDefaults ? 18 : undefined);
    const widthM = input.geometry?.excavationWidthM ?? (useDemoDefaults ? 12 : undefined);
    const finalDepthM = input.geometry?.excavationFinalDepthM ?? (useDemoDefaults ? 8 : undefined);
    const checkedLengthM = requirePositive(lengthM, 'excavation length', missing);
    const checkedWidthM = requirePositive(widthM, 'excavation width', missing);
    const checkedFinalDepthM = requirePositive(finalDepthM, 'final excavation depth', missing);

    if (!checkedLengthM || !checkedWidthM || !checkedFinalDepthM) {
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

    const analysisCase = buildExcavationDemoAnalysisCase();
    analysisCase.caseId = 'excavation-deformation-draft';
    analysisCase.title = 'Experimental 3D FEM staged excavation deformation draft';
    analysisCase.createdBy = 'geotechcli-fem-routing';
    analysisCase.evidenceRefs = input.evidenceRefs ?? [];
    analysisCase.materials.forEach((material) => {
      material.evidenceRefs = input.evidenceRefs ?? [];
    });
    if (analysisCase.geometry.excavation) {
      analysisCase.geometry.excavation.lengthM = checkedLengthM;
      analysisCase.geometry.excavation.widthM = checkedWidthM;
      analysisCase.geometry.excavation.finalDepthM = checkedFinalDepthM;
      analysisCase.geometry.excavation.wallToeDepthM = input.geometry?.wallToeDepthM ?? Math.max(checkedFinalDepthM * 1.55, analysisCase.geometry.excavation.wallToeDepthM);
      analysisCase.geometry.excavation.wallType = input.excavation?.wallType ?? analysisCase.geometry.excavation.wallType;
      if (Array.isArray(input.excavation?.stageDepthsM) && input.excavation.stageDepthsM.length > 0) {
        const supportLevels = input.excavation.supportLevelsM ?? [];
        analysisCase.geometry.excavation.stages = input.excavation.stageDepthsM.map((depthM, index) => ({
          id: `stage-${index + 1}`,
          label: `Stage ${index + 1} - excavate to ${depthM.toFixed(1)} m`,
          depthM,
          supportLevelM: supportLevels[index],
        }));
      } else {
        analysisCase.geometry.excavation.stages = analysisCase.geometry.excavation.stages.map((stage, index, stages) => ({
          ...stage,
          depthM: index === stages.length - 1
            ? checkedFinalDepthM
            : Math.min(checkedFinalDepthM, roundStageDepth(checkedFinalDepthM * ((index + 1) / stages.length))),
        }));
      }
    }
    analysisCase.geometry.domain.lengthM = input.geometry?.domainLengthM ?? Math.max(checkedLengthM * 2.8, analysisCase.geometry.domain.lengthM);
    analysisCase.geometry.domain.widthM = input.geometry?.domainWidthM ?? Math.max(checkedWidthM * 2.8, analysisCase.geometry.domain.widthM);
    analysisCase.geometry.domain.depthM = input.geometry?.domainDepthM ?? Math.max(checkedFinalDepthM * 2.75, analysisCase.geometry.domain.depthM);
    if (finitePositive(input.load?.pressureKpa)) analysisCase.loads[0].pressureKpa = input.load.pressureKpa;
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
  const raft = analysisCase.geometry.raft;
  if (!raft) {
    throw new Error('Built-in raft draft is missing raft geometry.');
  }
  raft.lengthM = checkedRaftLengthM;
  raft.widthM = checkedRaftWidthM;
  raft.thicknessM = input.geometry?.raftThicknessM ?? raft.thicknessM;
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

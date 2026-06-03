import {
  buildExcavationDemoAnalysisCase,
  buildRaftDemoAnalysisCase,
  buildSeepageBiotPlaneStrainDemoAnalysisCase,
  buildStagedSettlementConsolidationDemoAnalysisCase,
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
  | 'pile-group-elastic-interaction'
  | 'slope-embankment-deformation'
  | 'retaining-wall-excavation-support'
  | 'seepage-groundwater-coupling'
  | 'staged-settlement-consolidation';

export type FemCapabilityStatus = 'implemented-demo' | 'contract-draft' | 'planned';

export interface FemCapability {
  objective: FemRouteObjective;
  label: string;
  status: FemCapabilityStatus;
  executionMode: 'human-reviewed-preview' | 'contract-only';
  agentRunAllowed: false;
  analysisType: string;
  deterministicBackend: string | null;
  description: string;
  requiredEvidence: string[];
  requiredUserInputs: string[];
  visualizationFields: string[];
  reviewGates: string[];
  limitations: string[];
  /**
   * Safest next user command for this route. For implemented routes this points
   * to draft creation, not solver/demo execution.
   */
  command?: string;
  demoCommand?: string;
  draftCommandTemplate?: string;
  runCommandTemplate?: string;
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
    consolidationLayerThicknessM?: number;
    consolidationSurfaceAreaM2?: number;
  };
  biot?: {
    widthM?: number;
    heightM?: number;
    thicknessM?: number;
    initialPorePressureKpa?: number;
    timeStepsSeconds?: number[];
    topPorePressureKpa?: number;
    bottomPorePressureKpa?: number;
    leftPorePressureKpa?: number;
    rightPorePressureKpa?: number;
  };
  excavation?: {
    stageDepthsM?: number[];
    supportLevelsM?: number[];
    wallType?: 'diaphragm_wall' | 'secant_pile_wall' | 'soldier_pile_lagging' | 'unsupported_screening';
  };
  consolidation?: {
    stageLoadsKpa?: number[];
    stageDurationsYears?: number[];
    drainage?: 'single' | 'double';
  };
  load?: {
    pressureKpa?: number;
  };
  material?: {
    elasticModulusKpa?: number;
    poissonRatio?: number;
    unitWeightKnM3?: number;
    constrainedModulusKpa?: number;
    frictionAngleDeg?: number;
    cohesionKpa?: number;
    hardeningModulusKpa?: number;
    coefficientOfConsolidationM2PerYear?: number;
    hydraulicConductivityMPerS?: number;
    hydraulicConductivityXMPerS?: number;
    hydraulicConductivityYMPerS?: number;
    biotCoefficient?: number;
    specificStorage1PerM?: number;
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
  recommendedAction: 'run-reviewed-case' | 'collect-inputs' | 'contract-only';
  missingUserInputs: string[];
  assumptions: FemAssumption[];
  reviewGates: string[];
  evidenceRefs: FemEvidenceRef[];
  analysisCase?: FemAnalysisCase;
  validation?: FemValidationSummary;
  recommendedCommand?: string;
  contractReadiness?: FemContractReadiness;
}

export interface FemContractReadiness {
  schemaVersion: 'fem-contract-readiness.v1';
  routeState: 'planned-contract-only';
  nonRunnableReason: string;
  requiredEvidence: string[];
  requiredUserInputs: string[];
  reviewGates: string[];
  blockedUntil: string[];
  allowedAgentActions: Array<'list-capability' | 'draft-input-contract' | 'validate-user-inputs' | 'summarize-readiness'>;
  disallowedAgentActions: Array<'run-solver' | 'create-analysis-case' | 'render-webgl' | 'invent-results'>;
}

const CAPABILITIES: FemCapability[] = [
  {
    objective: 'foundation-settlement',
    label: 'Foundation / raft settlement preview',
    status: 'implemented-demo',
    executionMode: 'human-reviewed-preview',
    agentRunAllowed: false,
    analysisType: 'static_3d_small_strain',
    deterministicBackend: 'builtin-elastic3d-demo',
    description: 'Experimental deterministic 3D elastic settlement preview for a uniformly loaded raft.',
    requiredEvidence: ['GroundModel strata', 'elastic modulus or SPT/lab correlation basis', 'unit weight', 'groundwater assumption'],
    requiredUserInputs: ['raft length', 'raft width', 'service pressure', 'foundation level / embedment'],
    visualizationFields: ['vertical displacement', 'settlement basin', 'mesh wireframe', 'load patch'],
    reviewGates: ['experimental-only', 'linear-elastic-only', 'groundwater-not-coupled', 'not-design-calculation'],
    limitations: ['No plasticity, consolidation, construction staging, or pore pressure coupling.'],
    command: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
    demoCommand: 'geotech fem demo raft --experimental',
    draftCommandTemplate: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
    runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
  },
  {
    objective: 'excavation-deformation',
    label: 'Staged excavation deformation preview',
    status: 'implemented-demo',
    executionMode: 'human-reviewed-preview',
    agentRunAllowed: false,
    analysisType: 'static_3d_staged_elastic',
    deterministicBackend: 'builtin-staged-excavation-demo',
    description: 'Experimental deterministic staged excavation deformation preview for settlement trough, wall deflection proxy, and support reaction review against staged screening metadata.',
    requiredEvidence: ['stratigraphy', 'groundwater condition', 'wall geometry', 'support levels', 'excavation stage depths', 'elastic stiffness basis', 'support reaction screening check'],
    requiredUserInputs: ['excavation length', 'excavation width', 'final depth', 'stage depths', 'wall/support assumptions'],
    visualizationFields: ['surface settlement', 'horizontal displacement', 'wall deflection proxy', 'stage slider', 'support overlays'],
    reviewGates: ['experimental-only', 'support-reaction-screening-only', 'unsupported-wall-design', 'groundwater-coupling-required-review', 'not-basal-heave-verification', 'not-jurisdiction-specific-structural-design', 'not-design-calculation'],
    limitations: ['No wall/strut/anchor structural design, basal heave design, seepage, consolidation, or nonlinear soil response. Support reaction metadata is screening evidence only.'],
    command: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
    demoCommand: 'geotech fem demo excavation --experimental',
    draftCommandTemplate: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
    runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
  },
  {
    objective: 'shaft-deformation',
    label: 'Shaft / pit deformation preview',
    status: 'planned',
    executionMode: 'contract-only',
    agentRunAllowed: false,
    analysisType: 'static_3d_staged_elastic',
    deterministicBackend: null,
    description: 'Planned circular or polygonal shaft deformation preview using the staged excavation contract.',
    requiredEvidence: ['shaft geometry', 'stratigraphy', 'groundwater condition', 'support assumptions'],
    requiredUserInputs: ['shaft diameter/shape', 'final depth', 'support sequence', 'groundwater handling'],
    visualizationFields: ['radial ground movement', 'surface settlement', 'support reaction proxy'],
    reviewGates: ['planned-only', 'not-design-calculation'],
    limitations: ['No production solver or code acceptance check is available yet.'],
    command: 'geotech fem draft shaft-deformation --input <json>',
    draftCommandTemplate: 'geotech fem draft shaft-deformation --input <json>',
  },
  {
    objective: 'tunnel-volume-loss-settlement',
    label: 'Tunnel volume-loss settlement preview',
    status: 'implemented-demo',
    executionMode: 'human-reviewed-preview',
    agentRunAllowed: false,
    analysisType: 'empirical_3d_settlement_surface',
    deterministicBackend: 'builtin-tunnel-volume-loss-demo',
    description: 'Experimental deterministic 3D empirical settlement surface from prescribed tunnel volume loss.',
    requiredEvidence: ['tunnel geometry', 'cover depth', 'ground class', 'volume-loss assumption'],
    requiredUserInputs: ['diameter', 'axis depth', 'alignment', 'volume loss', 'trough width parameter'],
    visualizationFields: ['settlement trough', 'building influence corridor', 'alignment overlay'],
    reviewGates: ['experimental-only', 'volume-loss-assumption-review', 'not-fem-solver', 'not-design-calculation'],
    limitations: ['Empirical preview only; not a tunnel lining or ground loss design model.'],
    command: 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>',
    demoCommand: 'geotech fem demo tunnel --experimental',
    draftCommandTemplate: 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>',
    runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
  },
  {
    objective: 'pile-group-elastic-interaction',
    label: 'Pile group elastic interaction preview',
    status: 'planned',
    executionMode: 'contract-only',
    agentRunAllowed: false,
    analysisType: 'static_3d_soil_structure_screening',
    deterministicBackend: null,
    description: 'Planned pile group displacement and interaction preview after pile/soil spring contracts are stable.',
    requiredEvidence: ['pile layout', 'pile geometry', 'stratigraphy', 'stiffness/capacity basis'],
    requiredUserInputs: ['pile diameter', 'pile length', 'pile spacing', 'load case', 'pile head condition'],
    visualizationFields: ['pile head settlement', 'interaction contours', 'load share proxy'],
    reviewGates: ['planned-only', 'pile-soil-interface-review', 'not-design-calculation'],
    limitations: ['No pile group solver or code acceptance check is available yet.'],
    command: 'geotech fem draft pile-group-elastic-interaction --input <json>',
    draftCommandTemplate: 'geotech fem draft pile-group-elastic-interaction --input <json>',
  },
  {
    objective: 'slope-embankment-deformation',
    label: 'Slope / embankment deformation preview',
    status: 'planned',
    executionMode: 'contract-only',
    agentRunAllowed: false,
    analysisType: 'static_2d_3d_slope_serviceability_screening',
    deterministicBackend: null,
    description: 'Planned slope or embankment deformation contract for serviceability and staged fill review.',
    requiredEvidence: ['slope/embankment geometry', 'stratigraphy', 'strength or stiffness basis', 'groundwater condition', 'loading or construction stage evidence'],
    requiredUserInputs: ['slope height', 'slope angle / embankment geometry', 'construction or excavation stages', 'surcharge/seismic assumptions', 'drainage and groundwater handling'],
    visualizationFields: ['slope displacement contours', 'embankment settlement bowl', 'stage influence zones', 'reviewed geometry section'],
    reviewGates: ['planned-only', 'slope-stability-precheck-required', 'not-limit-equilibrium-check', 'not-design-calculation'],
    limitations: ['No slope deformation FEM backend, stability verification, or acceptance check is available yet.'],
    command: 'geotech fem draft slope-embankment-deformation --input <json>',
    draftCommandTemplate: 'geotech fem draft slope-embankment-deformation --input <json>',
  },
  {
    objective: 'retaining-wall-excavation-support',
    label: 'Retaining wall / excavation support preview',
    status: 'planned',
    executionMode: 'contract-only',
    agentRunAllowed: false,
    analysisType: 'static_2d_3d_wall_support_screening',
    deterministicBackend: null,
    description: 'Planned retaining wall and excavation-support contract for staged wall movement and support-reaction review.',
    requiredEvidence: ['retaining wall geometry', 'excavation stages', 'support or anchor assumptions', 'stratigraphy', 'groundwater/dewatering condition', 'strength and stiffness basis'],
    requiredUserInputs: ['wall type', 'excavation depth', 'toe embedment', 'prop/anchor levels', 'surcharge/load cases', 'groundwater and dewatering assumptions'],
    visualizationFields: ['wall deflection envelope', 'support reaction proxy', 'ground settlement trough', 'stage sequence panel'],
    reviewGates: ['planned-only', 'wall-design-not-implemented', 'basal-heave-not-verified', 'seepage-not-solved', 'not-design-calculation'],
    limitations: ['No retaining wall design, basal heave, anchor design, or seepage solver is available yet.'],
    command: 'geotech fem draft retaining-wall-excavation-support --input <json>',
    draftCommandTemplate: 'geotech fem draft retaining-wall-excavation-support --input <json>',
  },
  {
    objective: 'seepage-groundwater-coupling',
    label: 'Biot u-p seepage / pore-pressure coupling preview',
    status: 'implemented-demo',
    executionMode: 'human-reviewed-preview',
    agentRunAllowed: false,
    analysisType: 'time_dependent_2d_biot_consolidation',
    deterministicBackend: 'builtin-biot-up-plane-strain-v0',
    description: 'Experimental deterministic plane-strain Biot u-p preview for reviewed excess pore-pressure dissipation and hydro-mechanical coupling evidence.',
    requiredEvidence: ['groundwater observations', 'permeability or hydrogeology basis', 'stratigraphy', 'hydraulic boundary conditions', 'drainage/dewatering assumptions'],
    requiredUserInputs: ['Biot column geometry', 'initial excess pore pressure', 'time-step schedule', 'drained pore-pressure boundary', 'hydraulic conductivity', 'specific storage', 'Biot coefficient'],
    visualizationFields: ['excess pore pressure scalar field', 'coupled displacement field', 'pressure residual audit', 'time-step metadata'],
    reviewGates: ['experimental-only', 'biot-u-p-preview-only', 'hydraulic-boundary-review-required', 'not-production-sparse-solver', 'not-design-calculation'],
    limitations: ['Linear-elastic saturated plane-strain Biot u-p preview only; no unsaturated flow, uplift/piping, dewatering design, nonlinear plasticity, advanced staging, support design, or production sparse solver.'],
    command: 'geotech fem draft seepage-groundwater-coupling --input <json> --case-output <analysis_case.json>',
    demoCommand: 'geotech fem demo biot --experimental',
    draftCommandTemplate: 'geotech fem draft seepage-groundwater-coupling --input <json> --case-output <analysis_case.json>',
    runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed --backend biot-up',
  },
  {
    objective: 'staged-settlement-consolidation',
    label: 'Staged settlement / consolidation preview',
    status: 'implemented-demo',
    executionMode: 'human-reviewed-preview',
    agentRunAllowed: false,
    analysisType: 'time_dependent_1d_consolidation',
    deterministicBackend: 'builtin-staged-consolidation-1d',
    description: 'Experimental deterministic 1D staged consolidation preview using Terzaghi time stepping and Mohr-Coulomb material-point strength gates.',
    requiredEvidence: ['compressibility/consolidation parameters', 'stratigraphy', 'groundwater or drainage condition', 'load/stage evidence', 'settlement monitoring if available'],
    requiredUserInputs: ['load or fill stages', 'stage durations', 'foundation footprint', 'drainage path assumptions', 'target settlement or monitoring triggers'],
    visualizationFields: ['settlement vs time', 'degree of consolidation envelope', 'stage load history', 'mobilized strength review gate'],
    reviewGates: ['experimental-only', '1d-consolidation-only', 'mohr-coulomb-material-point-only', 'time-rate-review-required', 'not-design-calculation'],
    limitations: ['No 2D/3D coupled Biot FEM, seepage field, embankment geometry, creep, secondary compression, or monitoring calibration solver is available yet.'],
    command: 'geotech fem draft staged-settlement-consolidation --input <json> --case-output <analysis_case.json>',
    demoCommand: 'geotech fem demo consolidation --experimental',
    draftCommandTemplate: 'geotech fem draft staged-settlement-consolidation --input <json> --case-output <analysis_case.json>',
    runCommandTemplate: 'geotech fem run <analysis_case.json> --experimental --reviewed',
  },
];

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requirePositive(value: unknown, label: string, missing: string[]): number | undefined {
  if (finitePositive(value)) return value;
  missing.push(label);
  return undefined;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requireNonNegative(value: unknown, label: string, missing: string[]): number | undefined {
  if (finiteNonNegative(value)) return value;
  missing.push(label);
  return undefined;
}

function parseOptionalFiniteArray(
  value: unknown,
  label: string,
  missing: string[],
  options: {
    positive?: boolean;
    nonNegative?: boolean;
  } = {},
): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    missing.push(label);
    return undefined;
  }
  const parsed: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      missing.push(label);
      return undefined;
    }
    if (options.positive && item <= 0) {
      missing.push(label);
      return undefined;
    }
    if (options.nonNegative && item < 0) {
      missing.push(label);
      return undefined;
    }
    parsed.push(item);
  }
  return parsed;
}

function roundStageDepth(value: number): number {
  return Math.round(value * 10) / 10;
}

function draftCommandFor(capability: FemCapability): string | undefined {
  return capability.draftCommandTemplate ?? capability.command;
}

function runCommandFor(capability: FemCapability): string | undefined {
  return capability.runCommandTemplate;
}

function actionForValidation(validation: FemValidationSummary): 'run-reviewed-case' | 'collect-inputs' {
  return validation.status === 'blocked' ? 'collect-inputs' : 'run-reviewed-case';
}

function commandForValidation(capability: FemCapability, validation: FemValidationSummary): string | undefined {
  return validation.status === 'blocked' ? draftCommandFor(capability) : runCommandFor(capability);
}

function contractReadinessFor(capability: FemCapability): FemContractReadiness {
  return {
    schemaVersion: 'fem-contract-readiness.v1',
    routeState: 'planned-contract-only',
    nonRunnableReason: `${capability.label} is registered as a planning contract only. No deterministic backend, analysis-case writer, or WebGL result renderer is available for this route yet.`,
    requiredEvidence: capability.requiredEvidence,
    requiredUserInputs: capability.requiredUserInputs,
    reviewGates: [...new Set([
      ...capability.reviewGates,
      'agent-run-disabled',
      'solver-backend-not-implemented',
      'human-review-required',
    ])],
    blockedUntil: [
      'deterministic-analysis-case-schema-accepted',
      'solver-or-preview-backend-implemented',
      'result-manifest-validator-implemented',
      'webgl-renderer-smoke-added',
      'acceptance-fixture-approved',
    ],
    allowedAgentActions: [
      'list-capability',
      'draft-input-contract',
      'validate-user-inputs',
      'summarize-readiness',
    ],
    disallowedAgentActions: [
      'run-solver',
      'create-analysis-case',
      'render-webgl',
      'invent-results',
    ],
  };
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
        executionMode: 'contract-only',
        agentRunAllowed: false,
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
      contractReadiness: contractReadinessFor({
        objective: input.objective,
        label: 'Unknown FEM route',
        status: 'planned',
        executionMode: 'contract-only',
        agentRunAllowed: false,
        analysisType: 'unknown',
        deterministicBackend: null,
        description: 'The requested FEM route is not registered in geotechCLI.',
        requiredEvidence: [],
        requiredUserInputs: ['supported FEM objective'],
        visualizationFields: [],
        reviewGates: ['unknown-fem-route'],
        limitations: ['No FEM contract exists for this route.'],
      }),
    };
  }

  if (
    capability.objective !== 'foundation-settlement' &&
    capability.objective !== 'excavation-deformation' &&
    capability.objective !== 'tunnel-volume-loss-settlement' &&
    capability.objective !== 'staged-settlement-consolidation' &&
    capability.objective !== 'seepage-groundwater-coupling'
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
      reviewGates: contractReadinessFor(capability).reviewGates,
      evidenceRefs: input.evidenceRefs ?? [],
      recommendedCommand: draftCommandFor(capability),
      contractReadiness: contractReadinessFor(capability),
    };
  }

  if (capability.objective === 'seepage-groundwater-coupling') {
    const missing: string[] = [];
    const useDemoDefaults = input.useDemoDefaults === true;
    const widthM = input.biot?.widthM ?? input.geometry?.domainLengthM ?? (useDemoDefaults ? 1 : undefined);
    const heightM = input.biot?.heightM ?? input.geometry?.domainDepthM ?? (useDemoDefaults ? 1 : undefined);
    const thicknessM = input.biot?.thicknessM ?? input.geometry?.domainWidthM ?? (useDemoDefaults ? 1 : undefined);
    const initialPorePressureKpa = input.biot?.initialPorePressureKpa ?? (useDemoDefaults ? 100 : undefined);
    const timeStepsSeconds = input.biot?.timeStepsSeconds ?? (useDemoDefaults ? Array.from({ length: 20 }, (_, index) => Math.round(19.7 * ((index + 1) / 20) * 1_000_000) / 1_000_000) : undefined);
    const topPorePressureKpa = input.biot?.topPorePressureKpa ?? (useDemoDefaults ? 0 : undefined);
    const checkedWidthM = requirePositive(widthM, 'Biot column width', missing);
    const checkedHeightM = requirePositive(heightM, 'Biot column height', missing);
    const checkedThicknessM = requirePositive(thicknessM, 'Biot column thickness', missing);
    const checkedInitialPorePressureKpa = requireNonNegative(initialPorePressureKpa, 'initial excess pore pressure', missing);
    const checkedTopPorePressureKpa = requireNonNegative(topPorePressureKpa, 'top drained pore pressure', missing);
    if (!timeStepsSeconds) missing.push('valid Biot time steps');
    const checkedTimeStepsSeconds = parseOptionalFiniteArray(timeStepsSeconds, 'valid Biot time steps', missing, { positive: true });
    const hydraulicConductivityMPerS = input.material?.hydraulicConductivityMPerS ?? (useDemoDefaults ? 1e-6 : undefined);
    const specificStorage1PerM = input.material?.specificStorage1PerM ?? (useDemoDefaults ? 1e-4 : undefined);
    const biotCoefficient = input.material?.biotCoefficient ?? (useDemoDefaults ? 0.8 : undefined);
    const checkedHydraulicConductivityMPerS = requirePositive(hydraulicConductivityMPerS, 'hydraulic conductivity', missing);
    const checkedSpecificStorage1PerM = requirePositive(specificStorage1PerM, 'specific storage', missing);
    if (!finiteNumber(biotCoefficient) || biotCoefficient < 0 || biotCoefficient > 1) {
      missing.push('Biot coefficient between 0 and 1');
    }

    if (
      !checkedWidthM ||
      !checkedHeightM ||
      !checkedThicknessM ||
      checkedInitialPorePressureKpa == null ||
      checkedTopPorePressureKpa == null ||
      !checkedTimeStepsSeconds ||
      !checkedHydraulicConductivityMPerS ||
      !checkedSpecificStorage1PerM ||
      !finiteNumber(biotCoefficient) ||
      biotCoefficient < 0 ||
      biotCoefficient > 1
    ) {
      return {
        schemaVersion: 'fem-analysis-case-draft.v1',
        objective: capability.objective,
        capability,
        implemented: true,
        canAutoProceed: false,
        recommendedAction: 'collect-inputs',
        missingUserInputs: [...new Set(missing)],
        assumptions: [],
        reviewGates: ['missing-user-inputs', ...capability.reviewGates],
        evidenceRefs: input.evidenceRefs ?? [],
        recommendedCommand: draftCommandFor(capability),
      };
    }

    const analysisCase = buildSeepageBiotPlaneStrainDemoAnalysisCase();
    analysisCase.caseId = 'seepage-groundwater-coupling-draft';
    analysisCase.title = 'Experimental plane-strain Biot u-p seepage draft';
    analysisCase.createdBy = 'geotechcli-fem-routing';
    analysisCase.evidenceRefs = input.evidenceRefs ?? [];
    analysisCase.geometry.domain.lengthM = checkedWidthM;
    analysisCase.geometry.domain.widthM = checkedThicknessM;
    analysisCase.geometry.domain.depthM = checkedHeightM;
    if (analysisCase.geometry.biot) {
      analysisCase.geometry.biot.widthM = checkedWidthM;
      analysisCase.geometry.biot.heightM = checkedHeightM;
      analysisCase.geometry.biot.thicknessM = checkedThicknessM;
      analysisCase.geometry.biot.initialPorePressureKpa = checkedInitialPorePressureKpa;
      analysisCase.geometry.biot.timeStepsSeconds = checkedTimeStepsSeconds;
      analysisCase.geometry.biot.porePressureBoundaries = [
        { id: 'top-drained', boundary: 'top', porePressureKpa: checkedTopPorePressureKpa },
        ...(finiteNonNegative(input.biot?.bottomPorePressureKpa) ? [{ id: 'bottom-pressure', boundary: 'bottom' as const, porePressureKpa: input.biot.bottomPorePressureKpa }] : []),
        ...(finiteNonNegative(input.biot?.leftPorePressureKpa) ? [{ id: 'left-pressure', boundary: 'left' as const, porePressureKpa: input.biot.leftPorePressureKpa }] : []),
        ...(finiteNonNegative(input.biot?.rightPorePressureKpa) ? [{ id: 'right-pressure', boundary: 'right' as const, porePressureKpa: input.biot.rightPorePressureKpa }] : []),
      ];
    }
    const material = analysisCase.materials[0];
    material.evidenceRefs = input.evidenceRefs ?? [];
    if (finitePositive(input.material?.elasticModulusKpa)) material.elasticModulusKpa = input.material.elasticModulusKpa;
    if (typeof input.material?.poissonRatio === 'number') material.poissonRatio = input.material.poissonRatio;
    if (finitePositive(input.material?.unitWeightKnM3)) material.unitWeightKnM3 = input.material.unitWeightKnM3;
    material.hydraulicConductivityMPerS = checkedHydraulicConductivityMPerS;
    material.hydraulicConductivityXMPerS = input.material?.hydraulicConductivityXMPerS ?? checkedHydraulicConductivityMPerS;
    material.hydraulicConductivityYMPerS = input.material?.hydraulicConductivityYMPerS ?? checkedHydraulicConductivityMPerS;
    material.specificStorage1PerM = checkedSpecificStorage1PerM;
    material.biotCoefficient = biotCoefficient;
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
      recommendedAction: actionForValidation(validation),
      missingUserInputs: validation.status === 'blocked' ? validation.findings
        .filter((finding) => finding.severity === 'blocker')
        .map((finding) => finding.code) : [],
      assumptions: analysisCase.assumptions,
      reviewGates: [...new Set(reviewGates)],
      evidenceRefs: analysisCase.evidenceRefs,
      analysisCase,
      validation,
      recommendedCommand: commandForValidation(capability, validation),
    };
  }

  if (capability.objective === 'staged-settlement-consolidation') {
    const missing: string[] = [];
    const useDemoDefaults = input.useDemoDefaults === true;
    const layerThicknessM = input.geometry?.consolidationLayerThicknessM ?? (useDemoDefaults ? 10 : undefined);
    const surfaceAreaM2 = input.geometry?.consolidationSurfaceAreaM2 ?? (useDemoDefaults ? 200 : undefined);
    const stageLoadsInput = input.consolidation?.stageLoadsKpa ?? (useDemoDefaults ? [45, 35, 20] : undefined);
    const stageDurationsInput = input.consolidation?.stageDurationsYears ?? (useDemoDefaults ? [0.5, 1, 2] : undefined);
    const drainage = input.consolidation?.drainage ?? (useDemoDefaults ? 'double' : undefined);
    const checkedLayerThicknessM = requirePositive(layerThicknessM, 'consolidation layer thickness', missing);
    const checkedSurfaceAreaM2 = requirePositive(surfaceAreaM2, 'consolidation tributary surface area', missing);
    if (!stageLoadsInput) missing.push('stage loads');
    if (!stageDurationsInput) missing.push('stage durations');
    const stageLoadsKpa = parseOptionalFiniteArray(stageLoadsInput, 'valid stage loads', missing, { positive: true });
    const stageDurationsYears = parseOptionalFiniteArray(stageDurationsInput, 'valid stage durations', missing, { positive: true });
    if (drainage !== 'single' && drainage !== 'double') missing.push('drainage condition');
    if (stageLoadsKpa && stageDurationsYears && stageLoadsKpa.length !== stageDurationsYears.length) {
      missing.push('matching stage load and duration counts');
    }

    if (
      !checkedLayerThicknessM ||
      !checkedSurfaceAreaM2 ||
      !stageLoadsKpa ||
      !stageDurationsYears ||
      stageLoadsKpa.length !== stageDurationsYears.length ||
      (drainage !== 'single' && drainage !== 'double')
    ) {
      return {
        schemaVersion: 'fem-analysis-case-draft.v1',
        objective: capability.objective,
        capability,
        implemented: true,
        canAutoProceed: false,
        recommendedAction: 'collect-inputs',
        missingUserInputs: [...new Set(missing)],
        assumptions: [],
        reviewGates: ['missing-user-inputs', ...capability.reviewGates],
        evidenceRefs: input.evidenceRefs ?? [],
        recommendedCommand: draftCommandFor(capability),
      };
    }

    const analysisCase = buildStagedSettlementConsolidationDemoAnalysisCase();
    analysisCase.caseId = 'staged-settlement-consolidation-draft';
    analysisCase.title = 'Experimental 1D staged settlement consolidation draft';
    analysisCase.createdBy = 'geotechcli-fem-routing';
    analysisCase.evidenceRefs = input.evidenceRefs ?? [];
    analysisCase.materials.forEach((material) => {
      material.evidenceRefs = input.evidenceRefs ?? [];
    });
    if (analysisCase.geometry.consolidation) {
      analysisCase.geometry.consolidation.layerThicknessM = checkedLayerThicknessM;
      analysisCase.geometry.consolidation.surfaceAreaM2 = checkedSurfaceAreaM2;
      analysisCase.geometry.consolidation.drainage = drainage;
      analysisCase.geometry.consolidation.stages = stageLoadsKpa.map((loadKpa, index) => ({
        id: `stage-${index + 1}`,
        label: `Stage ${index + 1} - ${loadKpa.toFixed(1)} kPa for ${stageDurationsYears[index].toFixed(2)} years`,
        loadKpa,
        durationYears: stageDurationsYears[index],
      }));
    }
    analysisCase.geometry.domain.lengthM = input.geometry?.domainLengthM ?? Math.max(24, Math.sqrt(checkedSurfaceAreaM2) * 1.8);
    analysisCase.geometry.domain.widthM = input.geometry?.domainWidthM ?? Math.max(12, Math.sqrt(checkedSurfaceAreaM2) * 0.9);
    analysisCase.geometry.domain.depthM = input.geometry?.domainDepthM ?? Math.max(checkedLayerThicknessM * 1.2, analysisCase.geometry.domain.depthM);
    analysisCase.loads = stageLoadsKpa.map((pressureKpa, index) => ({
      id: `stage-${index + 1}-load`,
      type: 'uniform_pressure',
      target: 'ground_surface',
      pressureKpa,
      evidenceRefs: input.evidenceRefs ?? [],
      assumptions: [
        {
          id: `stage-${index + 1}-load-assumption`,
          parameter: 'staged surface pressure',
          value: pressureKpa,
          unit: 'kPa',
          basis: 'User-provided staged consolidation load for experimental preview.',
          confidence: 'review',
          reviewRequired: true,
        },
      ],
    }));
    const material = analysisCase.materials[0];
    if (finitePositive(input.material?.elasticModulusKpa)) material.elasticModulusKpa = input.material.elasticModulusKpa;
    if (typeof input.material?.poissonRatio === 'number') material.poissonRatio = input.material.poissonRatio;
    if (finitePositive(input.material?.unitWeightKnM3)) material.unitWeightKnM3 = input.material.unitWeightKnM3;
    if (finitePositive(input.material?.constrainedModulusKpa)) material.constrainedModulusKpa = input.material.constrainedModulusKpa;
    if (typeof input.material?.frictionAngleDeg === 'number') material.frictionAngleDeg = input.material.frictionAngleDeg;
    if (typeof input.material?.cohesionKpa === 'number' && Number.isFinite(input.material.cohesionKpa) && input.material.cohesionKpa >= 0) {
      material.cohesionKpa = input.material.cohesionKpa;
    }
    if (
      typeof input.material?.hardeningModulusKpa === 'number' &&
      Number.isFinite(input.material.hardeningModulusKpa) &&
      input.material.hardeningModulusKpa >= 0
    ) {
      material.hardeningModulusKpa = input.material.hardeningModulusKpa;
    }
    if (finitePositive(input.material?.coefficientOfConsolidationM2PerYear)) {
      material.coefficientOfConsolidationM2PerYear = input.material.coefficientOfConsolidationM2PerYear;
    }
    if (finitePositive(input.material?.hydraulicConductivityMPerS)) material.hydraulicConductivityMPerS = input.material.hydraulicConductivityMPerS;
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
      recommendedAction: actionForValidation(validation),
      missingUserInputs: validation.status === 'blocked' ? validation.findings
        .filter((finding) => finding.severity === 'blocker')
        .map((finding) => finding.code) : [],
      assumptions: analysisCase.assumptions,
      reviewGates: [...new Set(reviewGates)],
      evidenceRefs: analysisCase.evidenceRefs,
      analysisCase,
      validation,
      recommendedCommand: commandForValidation(capability, validation),
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
        recommendedCommand: draftCommandFor(capability),
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
      recommendedAction: actionForValidation(validation),
      missingUserInputs: validation.status === 'blocked' ? validation.findings
        .filter((finding) => finding.severity === 'blocker')
        .map((finding) => finding.code) : [],
      assumptions: analysisCase.assumptions,
      reviewGates: [...new Set(reviewGates)],
      evidenceRefs: analysisCase.evidenceRefs,
      analysisCase,
      validation,
      recommendedCommand: commandForValidation(capability, validation),
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
    const stageDepthsM = parseOptionalFiniteArray(
      input.excavation?.stageDepthsM,
      'valid excavation stage depths',
      missing,
      { positive: true },
    );
    const supportLevelsM = parseOptionalFiniteArray(
      input.excavation?.supportLevelsM,
      'valid excavation support levels',
      missing,
      { nonNegative: true },
    );

    if (
      !checkedLengthM ||
      !checkedWidthM ||
      !checkedFinalDepthM ||
      (input.excavation?.stageDepthsM != null && !stageDepthsM) ||
      (input.excavation?.supportLevelsM != null && !supportLevelsM)
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
        recommendedCommand: draftCommandFor(capability),
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
      if (stageDepthsM && stageDepthsM.length > 0) {
        const supportLevels = supportLevelsM ?? [];
        analysisCase.geometry.excavation.stages = stageDepthsM.map((depthM, index) => ({
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
    if (typeof input.material?.frictionAngleDeg === 'number') analysisCase.materials[0].frictionAngleDeg = input.material.frictionAngleDeg;
    if (typeof input.material?.cohesionKpa === 'number' && Number.isFinite(input.material.cohesionKpa) && input.material.cohesionKpa >= 0) {
      analysisCase.materials[0].cohesionKpa = input.material.cohesionKpa;
    }
    if (
      typeof input.material?.hardeningModulusKpa === 'number' &&
      Number.isFinite(input.material.hardeningModulusKpa) &&
      input.material.hardeningModulusKpa >= 0
    ) {
      analysisCase.materials[0].hardeningModulusKpa = input.material.hardeningModulusKpa;
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
      recommendedAction: actionForValidation(validation),
      missingUserInputs: validation.status === 'blocked' ? validation.findings
        .filter((finding) => finding.severity === 'blocker')
        .map((finding) => finding.code) : [],
      assumptions: analysisCase.assumptions,
      reviewGates: [...new Set(reviewGates)],
      evidenceRefs: analysisCase.evidenceRefs,
      analysisCase,
      validation,
      recommendedCommand: commandForValidation(capability, validation),
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
      recommendedCommand: draftCommandFor(capability),
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
    recommendedAction: actionForValidation(validation),
    missingUserInputs: validation.status === 'blocked' ? validation.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => finding.code) : [],
    assumptions: analysisCase.assumptions,
    reviewGates: [...new Set(reviewGates)],
    evidenceRefs: analysisCase.evidenceRefs,
    analysisCase,
    validation,
    recommendedCommand: commandForValidation(capability, validation),
  };
}

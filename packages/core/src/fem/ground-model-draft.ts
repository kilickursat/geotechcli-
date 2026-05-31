import type { EvidenceRef } from '../evidence/index.js';
import type { GroundModel } from '../ground-model/index.js';
import { verifyGroundModel, type GroundModelCalculationReadiness } from '../verifier/index.js';
import type { FemEvidenceRef } from './types.js';
import {
  prepareFemAnalysisCaseDraft,
  type FemAnalysisCaseDraft,
  type FemRouteObjective,
  type PrepareFemAnalysisCaseDraftInput,
} from './routing.js';

type JsonRecord = Record<string, unknown>;

export interface FemGroundModelDraftBridge {
  schemaVersion: 'fem-ground-model-draft-bridge.v1';
  objective: FemRouteObjective;
  readiness: {
    workflow: GroundModelCalculationReadiness['workflow'];
    status: GroundModelCalculationReadiness['status'];
    score: number;
    missingUserInputs: string[];
    assumptions: string[];
    evidenceIds: string[];
  };
  input: PrepareFemAnalysisCaseDraftInput;
  summary: string;
}

export interface FemGroundModelExecutionBoundary {
  schemaVersion: 'fem-ground-model-execution-boundary.v1';
  executionMode: FemAnalysisCaseDraft['capability']['executionMode'];
  agentRunAllowed: false;
  agentWebglRenderAllowed: false;
  agentResultManifestAllowed: false;
  humanReviewRequired: true;
  caseOutputAvailable: boolean;
  draftCommand: string;
  humanRunCommand?: string;
  blockedReasons: string[];
}

export interface FemGroundModelDraftCandidate {
  schemaVersion: 'fem-ground-model-draft-candidate.v1';
  objective: FemRouteObjective;
  workflow: GroundModelCalculationReadiness['workflow'];
  status: GroundModelCalculationReadiness['status'];
  score: number;
  command: string;
  canAutoProceed: false;
  missingUserInputs: string[];
  reviewGates: string[];
  evidenceIds: string[];
  bridge: FemGroundModelDraftBridge;
  draft: FemAnalysisCaseDraft;
  executionBoundary: FemGroundModelExecutionBoundary;
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toFiniteNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return values.length > 0 ? values : undefined;
}

function asGroundwaterCondition(value: unknown): PrepareFemAnalysisCaseDraftInput['groundwater'] extends infer G
  ? G extends { condition?: infer C } ? C | undefined : undefined
  : undefined {
  return value === 'not_modelled' || value === 'below_domain' || value === 'specified'
    ? value
    : undefined;
}

function asWallType(value: unknown): PrepareFemAnalysisCaseDraftInput['excavation'] extends infer E
  ? E extends { wallType?: infer W } ? W | undefined : undefined
  : undefined {
  return value === 'diaphragm_wall'
    || value === 'secant_pile_wall'
    || value === 'soldier_pile_lagging'
    || value === 'unsupported_screening'
    ? value
    : undefined;
}

function objectiveForWorkflow(workflow: GroundModelCalculationReadiness['workflow']): FemRouteObjective | null {
  if (workflow === 'fem-foundation-settlement') return 'foundation-settlement';
  if (workflow === 'fem-excavation-deformation') return 'excavation-deformation';
  if (workflow === 'fem-tunnel-volume-loss-settlement') return 'tunnel-volume-loss-settlement';
  if (workflow === 'fem-shaft-deformation') return 'shaft-deformation';
  if (workflow === 'fem-pile-group-elastic-interaction') return 'pile-group-elastic-interaction';
  if (workflow === 'fem-slope-embankment-deformation') return 'slope-embankment-deformation';
  if (workflow === 'fem-retaining-wall-excavation-support') return 'retaining-wall-excavation-support';
  if (workflow === 'fem-seepage-groundwater-coupling') return 'seepage-groundwater-coupling';
  if (workflow === 'fem-staged-settlement-consolidation') return 'staged-settlement-consolidation';
  return null;
}

function mapGroundModelEvidenceRef(evidence: EvidenceRef | undefined, id: string): FemEvidenceRef {
  if (!evidence) {
    return {
      id,
      source: 'GroundModel',
      note: 'Evidence id retained from GroundModel readiness; source location unavailable in this manifest.',
    };
  }

  return {
    id: evidence.id,
    source: evidence.sourcePath || evidence.location.filePath || 'GroundModel',
    page: evidence.location.pageNumber,
    note: [
      evidence.method,
      evidence.location.sheetName ? `sheet ${evidence.location.sheetName}` : '',
      evidence.location.cellRef ? `cell ${evidence.location.cellRef}` : '',
      evidence.unit ? `unit ${evidence.unit}` : '',
    ].filter(Boolean).join('; ') || undefined,
  };
}

export function mapGroundModelEvidenceRefs(
  groundModel: GroundModel,
  evidenceIds: string[],
): FemEvidenceRef[] {
  const evidenceById = new Map(groundModel.evidence.map((item) => [item.id, item]));
  return [...new Set(evidenceIds)]
    .slice(0, 12)
    .map((id) => mapGroundModelEvidenceRef(evidenceById.get(id), id));
}

export function stripPlaceholderFemValues(input: PrepareFemAnalysisCaseDraftInput): PrepareFemAnalysisCaseDraftInput {
  return {
    ...input,
    geometry: input.geometry ? {
      raftLengthM: toFiniteNumber(input.geometry.raftLengthM),
      raftWidthM: toFiniteNumber(input.geometry.raftWidthM),
      raftThicknessM: toFiniteNumber(input.geometry.raftThicknessM),
      domainLengthM: toFiniteNumber(input.geometry.domainLengthM),
      domainWidthM: toFiniteNumber(input.geometry.domainWidthM),
      domainDepthM: toFiniteNumber(input.geometry.domainDepthM),
      excavationLengthM: toFiniteNumber(input.geometry.excavationLengthM),
      excavationWidthM: toFiniteNumber(input.geometry.excavationWidthM),
      excavationFinalDepthM: toFiniteNumber(input.geometry.excavationFinalDepthM),
      wallToeDepthM: toFiniteNumber(input.geometry.wallToeDepthM),
      tunnelDiameterM: toFiniteNumber(input.geometry.tunnelDiameterM),
      tunnelAxisDepthM: toFiniteNumber(input.geometry.tunnelAxisDepthM),
      tunnelLengthM: toFiniteNumber(input.geometry.tunnelLengthM),
      tunnelCenterXM: toFiniteNumber(input.geometry.tunnelCenterXM),
      tunnelCenterYM: toFiniteNumber(input.geometry.tunnelCenterYM),
      tunnelVolumeLossPercent: toFiniteNumber(input.geometry.tunnelVolumeLossPercent),
      troughWidthParameterK: toFiniteNumber(input.geometry.troughWidthParameterK),
    } : undefined,
    excavation: input.excavation ? {
      stageDepthsM: toFiniteNumberArray(input.excavation.stageDepthsM),
      supportLevelsM: toFiniteNumberArray(input.excavation.supportLevelsM),
      wallType: asWallType(input.excavation.wallType),
    } : undefined,
    load: input.load ? {
      pressureKpa: toFiniteNumber(input.load.pressureKpa),
    } : undefined,
    material: input.material ? {
      elasticModulusKpa: toFiniteNumber(input.material.elasticModulusKpa),
      poissonRatio: toFiniteNumber(input.material.poissonRatio),
      unitWeightKnM3: toFiniteNumber(input.material.unitWeightKnM3),
    } : undefined,
    groundwater: input.groundwater ? {
      condition: asGroundwaterCondition(input.groundwater.condition),
      depthM: toFiniteNumber(input.groundwater.depthM),
      note: typeof input.groundwater.note === 'string' ? input.groundwater.note : undefined,
    } : undefined,
  };
}

function normalizeReadinessInput(
  objective: FemRouteObjective,
  value: unknown,
): PrepareFemAnalysisCaseDraftInput {
  const source = isRecord(value) ? value : {};
  const geometry = isRecord(source.geometry) ? source.geometry : {};
  const excavation = isRecord(source.excavation) ? source.excavation : {};
  const load = isRecord(source.load) ? source.load : {};
  const material = isRecord(source.material) ? source.material : {};
  const groundwater = isRecord(source.groundwater) ? source.groundwater : {};

  return stripPlaceholderFemValues({
    objective,
    useDemoDefaults: source.useDemoDefaults === true,
    geometry: {
      raftLengthM: geometry.raftLengthM as number,
      raftWidthM: geometry.raftWidthM as number,
      raftThicknessM: geometry.raftThicknessM as number,
      domainLengthM: geometry.domainLengthM as number,
      domainWidthM: geometry.domainWidthM as number,
      domainDepthM: geometry.domainDepthM as number,
      excavationLengthM: geometry.excavationLengthM as number,
      excavationWidthM: geometry.excavationWidthM as number,
      excavationFinalDepthM: geometry.excavationFinalDepthM as number,
      wallToeDepthM: geometry.wallToeDepthM as number,
      tunnelDiameterM: geometry.tunnelDiameterM as number,
      tunnelAxisDepthM: geometry.tunnelAxisDepthM as number,
      tunnelLengthM: geometry.tunnelLengthM as number,
      tunnelCenterXM: geometry.tunnelCenterXM as number,
      tunnelCenterYM: geometry.tunnelCenterYM as number,
      tunnelVolumeLossPercent: geometry.tunnelVolumeLossPercent as number,
      troughWidthParameterK: geometry.troughWidthParameterK as number,
    },
    excavation: {
      stageDepthsM: excavation.stageDepthsM as number[],
      supportLevelsM: excavation.supportLevelsM as number[],
      wallType: excavation.wallType as any,
    },
    load: {
      pressureKpa: load.pressureKpa as number,
    },
    material: {
      elasticModulusKpa: material.elasticModulusKpa as number,
      poissonRatio: material.poissonRatio as number,
      unitWeightKnM3: material.unitWeightKnM3 as number,
    },
    groundwater: {
      condition: groundwater.condition as any,
      depthM: groundwater.depthM as number,
      note: groundwater.note as string,
    },
  });
}

export function buildFemDraftInputFromReadiness(
  workflow: GroundModelCalculationReadiness,
  groundModel: GroundModel,
): FemGroundModelDraftBridge {
  const objective = objectiveForWorkflow(workflow.workflow);
  if (!objective) {
    throw new Error(`GroundModel workflow is not an FEM draft route: ${workflow.workflow}`);
  }
  if (!workflow.inputDraft) {
    throw new Error(`GroundModel workflow ${workflow.workflow} does not include an inputDraft. Run analyzeWorkspace with includeCalculationInputDrafts=true.`);
  }

  const evidenceIds = workflow.inputDraft.evidenceIds.length > 0
    ? workflow.inputDraft.evidenceIds
    : workflow.evidenceIds;
  const evidenceRefs = mapGroundModelEvidenceRefs(groundModel, evidenceIds);
  const input = normalizeReadinessInput(objective, workflow.inputDraft.input);
  input.objective = objective;
  input.useDemoDefaults = false;
  input.evidenceRefs = evidenceRefs;

  const summary = [
    `FEM readiness bridge: ${workflow.workflow} (${workflow.status}, ${workflow.score}/100)`,
    `missing user inputs: ${workflow.inputDraft.missingUserInputs.join(', ') || 'none'}`,
    `prefilled evidence refs: ${evidenceRefs.map((item) => item.id).join(', ') || 'none'}`,
    'workspace evidence may prefill material, groundwater, and traceability only; geometry, loads, and staging still require explicit user review.',
  ].join('\n');

  return {
    schemaVersion: 'fem-ground-model-draft-bridge.v1',
    objective,
    readiness: {
      workflow: workflow.workflow,
      status: workflow.status,
      score: workflow.score,
      missingUserInputs: workflow.inputDraft.missingUserInputs,
      assumptions: workflow.inputDraft.assumptions,
      evidenceIds,
    },
    input,
    summary,
  };
}

function buildExecutionBoundary(
  command: string,
  draft: FemAnalysisCaseDraft,
): FemGroundModelExecutionBoundary {
  const caseOutputAvailable = draft.analysisCase != null && draft.validation?.status !== 'blocked';
  const humanRunCommand = draft.recommendedAction === 'run-reviewed-case'
    ? draft.recommendedCommand
    : undefined;
  const blockedReasons = [
    ...draft.missingUserInputs,
    ...(draft.contractReadiness?.blockedUntil ?? []),
    ...draft.reviewGates.filter((gate) =>
      gate === 'missing-user-inputs'
      || gate === 'planned-only'
      || gate === 'solver-backend-not-implemented'
      || gate === 'agent-run-disabled'
      || gate === 'human-review-required'
    ),
  ];

  return {
    schemaVersion: 'fem-ground-model-execution-boundary.v1',
    executionMode: draft.capability.executionMode,
    agentRunAllowed: false,
    agentWebglRenderAllowed: false,
    agentResultManifestAllowed: false,
    humanReviewRequired: true,
    caseOutputAvailable,
    draftCommand: command,
    ...(humanRunCommand ? { humanRunCommand } : {}),
    blockedReasons: [...new Set(blockedReasons)],
  };
}

export function buildFemDraftCandidatesFromGroundModel(
  groundModel: GroundModel,
): FemGroundModelDraftCandidate[] {
  const verification = verifyGroundModel(groundModel, { includeCalculationInputDrafts: true });
  return verification.calculationReadiness.workflows
    .filter((workflow) =>
      workflow.workflow === 'fem-foundation-settlement'
      || workflow.workflow === 'fem-excavation-deformation'
      || workflow.workflow === 'fem-tunnel-volume-loss-settlement'
      || workflow.workflow === 'fem-shaft-deformation'
      || workflow.workflow === 'fem-pile-group-elastic-interaction'
      || workflow.workflow === 'fem-slope-embankment-deformation'
      || workflow.workflow === 'fem-retaining-wall-excavation-support'
      || workflow.workflow === 'fem-seepage-groundwater-coupling'
      || workflow.workflow === 'fem-staged-settlement-consolidation'
    )
    .map((workflow) => buildFemDraftCandidateFromReadiness(workflow, groundModel));
}

export function buildFemDraftCandidateFromReadiness(
  workflow: GroundModelCalculationReadiness,
  groundModel: GroundModel,
): FemGroundModelDraftCandidate {
  const bridge = buildFemDraftInputFromReadiness(workflow, groundModel);
  const draft = prepareFemAnalysisCaseDraft(bridge.input);
  const command = workflow.inputDraft?.command ?? workflow.commandTemplate;
  return {
    schemaVersion: 'fem-ground-model-draft-candidate.v1',
    objective: bridge.objective,
    workflow: workflow.workflow,
    status: workflow.status,
    score: workflow.score,
    command,
    canAutoProceed: false,
    missingUserInputs: draft.missingUserInputs.length > 0
      ? draft.missingUserInputs
      : bridge.readiness.missingUserInputs,
    reviewGates: draft.reviewGates,
    evidenceIds: bridge.readiness.evidenceIds,
    bridge,
    draft,
    executionBoundary: buildExecutionBoundary(command, draft),
  };
}

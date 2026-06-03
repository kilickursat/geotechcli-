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
  approvalRecordSchema?: 'fem-reviewer-approval.v1';
  approvalRecordRequiredForProductionAcceptance?: true;
  strictApprovalRunCommand?: string;
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

export interface FemGroundModelDraftCandidateValidation {
  schemaVersion: 'fem-ground-model-draft-candidate-validation.v1';
  status: 'accepted' | 'blocked';
  blockerCodes: string[];
  warnings: string[];
}

export interface FemWorkspaceToRunAcceptance {
  schemaVersion: 'fem-workspace-to-run-acceptance.v1';
  status: 'accepted' | 'blocked';
  objective: FemRouteObjective;
  workflow: GroundModelCalculationReadiness['workflow'];
  caseOutputAvailable: boolean;
  humanRunCommand?: string;
  approvalRecordSchema?: 'fem-reviewer-approval.v1';
  approvalRecordRequiredForProductionAcceptance?: true;
  strictApprovalRunCommand?: string;
  blockerCodes: string[];
  reviewCodes: string[];
  evidenceIds: string[];
}

const CONTRACT_ONLY_BLOCKED_UNTIL = [
  'deterministic-analysis-case-schema-accepted',
  'solver-or-preview-backend-implemented',
  'result-manifest-validator-implemented',
  'webgl-renderer-smoke-added',
  'acceptance-fixture-approved',
] as const;

const CONTRACT_ONLY_DISALLOWED_ACTIONS = [
  'run-solver',
  'create-analysis-case',
  'render-webgl',
  'invent-results',
] as const;

const FEM_PROHIBITED_RAW_PAYLOAD_KEYS = new Set([
  'apiKey',
  'authorization',
  'headers',
  'messages',
  'model',
  'modelId',
  'prompt',
  'provider',
  'request',
  'response',
  'rawText',
  'sourceEvidence',
  'sourceEvidenceSnippet',
  'sourceEvidenceSnippets',
  'token',
  'visionModelId',
]);

const FEM_PROHIBITED_EXECUTION_RESULT_KEYS = new Set([
  'analysisResult',
  'caseOutput',
  'caseOutputPath',
  'modelCalls',
  'resultManifest',
  'renderedWebgl',
  'solverOutput',
  'webglArtifact',
  'webglHtml',
  'webglOutput',
]);

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
    source: sanitizeFemEvidenceSource(evidence.sourcePath || evidence.location.filePath),
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
      consolidationLayerThicknessM: toFiniteNumber(input.geometry.consolidationLayerThicknessM),
      consolidationSurfaceAreaM2: toFiniteNumber(input.geometry.consolidationSurfaceAreaM2),
    } : undefined,
    excavation: input.excavation ? {
      stageDepthsM: toFiniteNumberArray(input.excavation.stageDepthsM),
      supportLevelsM: toFiniteNumberArray(input.excavation.supportLevelsM),
      wallType: asWallType(input.excavation.wallType),
    } : undefined,
    consolidation: input.consolidation ? {
      stageLoadsKpa: toFiniteNumberArray(input.consolidation.stageLoadsKpa),
      stageDurationsYears: toFiniteNumberArray(input.consolidation.stageDurationsYears),
      drainage: input.consolidation.drainage === 'single' || input.consolidation.drainage === 'double'
        ? input.consolidation.drainage
        : undefined,
    } : undefined,
    load: input.load ? {
      pressureKpa: toFiniteNumber(input.load.pressureKpa),
    } : undefined,
    material: input.material ? {
      elasticModulusKpa: toFiniteNumber(input.material.elasticModulusKpa),
      poissonRatio: toFiniteNumber(input.material.poissonRatio),
      unitWeightKnM3: toFiniteNumber(input.material.unitWeightKnM3),
      constrainedModulusKpa: toFiniteNumber(input.material.constrainedModulusKpa),
      frictionAngleDeg: toFiniteNumber(input.material.frictionAngleDeg),
      cohesionKpa: toFiniteNumber(input.material.cohesionKpa),
      coefficientOfConsolidationM2PerYear: toFiniteNumber(input.material.coefficientOfConsolidationM2PerYear),
      hydraulicConductivityMPerS: toFiniteNumber(input.material.hydraulicConductivityMPerS),
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
  const consolidation = isRecord(source.consolidation) ? source.consolidation : {};
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
      consolidationLayerThicknessM: geometry.consolidationLayerThicknessM as number,
      consolidationSurfaceAreaM2: geometry.consolidationSurfaceAreaM2 as number,
    },
    excavation: {
      stageDepthsM: excavation.stageDepthsM as number[],
      supportLevelsM: excavation.supportLevelsM as number[],
      wallType: excavation.wallType as any,
    },
    consolidation: {
      stageLoadsKpa: consolidation.stageLoadsKpa as number[],
      stageDurationsYears: consolidation.stageDurationsYears as number[],
      drainage: consolidation.drainage as any,
    },
    load: {
      pressureKpa: load.pressureKpa as number,
    },
    material: {
      elasticModulusKpa: material.elasticModulusKpa as number,
      poissonRatio: material.poissonRatio as number,
      unitWeightKnM3: material.unitWeightKnM3 as number,
      constrainedModulusKpa: material.constrainedModulusKpa as number,
      frictionAngleDeg: material.frictionAngleDeg as number,
      cohesionKpa: material.cohesionKpa as number,
      coefficientOfConsolidationM2PerYear: material.coefficientOfConsolidationM2PerYear as number,
      hydraulicConductivityMPerS: material.hydraulicConductivityMPerS as number,
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
  const blockedReviewGates = draft.capability.executionMode === 'contract-only'
    ? draft.reviewGates
    : draft.reviewGates.filter((gate) =>
      gate === 'missing-user-inputs'
      || gate === 'planned-only'
      || gate === 'solver-backend-not-implemented'
      || gate === 'agent-run-disabled'
      || gate === 'human-review-required'
    );
  const blockedReasons = [
    ...draft.missingUserInputs,
    ...(draft.contractReadiness?.blockedUntil ?? []),
    ...blockedReviewGates,
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
    approvalRecordSchema: 'fem-reviewer-approval.v1',
    approvalRecordRequiredForProductionAcceptance: true,
    ...(humanRunCommand
      ? { strictApprovalRunCommand: humanRunCommand }
      : {}),
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

export function validateFemGroundModelDraftCandidate(
  candidate: FemGroundModelDraftCandidate,
): FemGroundModelDraftCandidateValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const boundary = candidate.executionBoundary;
  const draft = candidate.draft;

  if (candidate.canAutoProceed !== false || draft.canAutoProceed !== false) {
    blockers.push('fem_candidate_auto_proceed_enabled');
  }
  if (!candidate.command.startsWith('geotech fem draft ')) {
    blockers.push('fem_candidate_command_not_draft');
  }
  if (/\bfem run\b/i.test(candidate.command) || /\bfem run\b/i.test(boundary.draftCommand)) {
    blockers.push('fem_candidate_run_command_exposed');
  }
  if (boundary.agentRunAllowed !== false || draft.capability.agentRunAllowed !== false) {
    blockers.push('fem_candidate_agent_run_enabled');
  }
  if (boundary.agentWebglRenderAllowed !== false) {
    blockers.push('fem_candidate_agent_webgl_enabled');
  }
  if (boundary.agentResultManifestAllowed !== false) {
    blockers.push('fem_candidate_agent_result_manifest_enabled');
  }
  if (boundary.humanReviewRequired !== true) {
    blockers.push('fem_candidate_human_review_not_required');
  }

  if (draft.capability.executionMode === 'contract-only') {
    if (draft.recommendedAction !== 'contract-only') {
      blockers.push('fem_contract_route_not_contract_only');
    }
    if (draft.analysisCase != null || boundary.caseOutputAvailable) {
      blockers.push('fem_contract_route_case_output_available');
    }
    if (boundary.humanRunCommand != null) {
      blockers.push('fem_contract_route_human_run_command_available');
    }
    if (boundary.draftCommand.includes('--case-output')) {
      blockers.push('fem_contract_route_case_output_flag_exposed');
    }
    const contract = draft.contractReadiness;
    if (!contract) {
      blockers.push('fem_contract_route_missing_contract_readiness');
    } else {
      for (const requirement of CONTRACT_ONLY_BLOCKED_UNTIL) {
        if (!contract.blockedUntil.includes(requirement)) {
          blockers.push(`fem_contract_route_missing_blocked_until_${requirement}`);
        }
      }
      for (const action of CONTRACT_ONLY_DISALLOWED_ACTIONS) {
        if (!contract.disallowedAgentActions.includes(action)) {
          blockers.push(`fem_contract_route_missing_disallowed_action_${action}`);
        }
      }
      if (!contract.reviewGates.includes('agent-run-disabled')) {
        blockers.push('fem_contract_route_missing_agent_run_gate');
      }
      if (!contract.reviewGates.includes('solver-backend-not-implemented')) {
        blockers.push('fem_contract_route_missing_solver_backend_gate');
      }
      if (!contract.reviewGates.includes('human-review-required')) {
        blockers.push('fem_contract_route_missing_human_review_gate');
      }
    }
  } else if (draft.recommendedAction === 'run-reviewed-case') {
    if (!draft.analysisCase || !boundary.caseOutputAvailable) {
      blockers.push('fem_preview_route_missing_reviewable_case_output');
    }
    if (!boundary.humanRunCommand?.startsWith('geotech fem run ')) {
      blockers.push('fem_preview_route_missing_human_run_command');
    }
    if (draft.validation?.status === 'blocked') {
      blockers.push('fem_preview_route_validation_blocked_but_runnable');
    }
  } else if (boundary.humanRunCommand != null || boundary.caseOutputAvailable) {
    blockers.push('fem_preview_route_unreviewed_run_boundary_exposed');
  }

  for (const keyPath of collectFemRawPayloadKeys(candidate)) {
    blockers.push(`fem_candidate_raw_payload_key_${sanitizeBlockerCode(keyPath)}`);
  }

  for (const keyPath of collectFemExecutionResultKeys(candidate)) {
    blockers.push(`fem_candidate_execution_result_payload_key_${sanitizeBlockerCode(keyPath)}`);
  }

  for (const leakPath of collectFemPrivateLeaks(candidate)) {
    blockers.push(`fem_candidate_private_path_or_token_leak_${sanitizeBlockerCode(leakPath)}`);
  }

  if ((candidate.bridge.input.evidenceRefs?.length ?? 0) === 0 && candidate.evidenceIds.length > 0) {
    warnings.push('fem_candidate_evidence_ids_not_mapped_to_refs');
  }

  return {
    schemaVersion: 'fem-ground-model-draft-candidate-validation.v1',
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockerCodes: [...new Set(blockers)],
    warnings,
  };
}

export function validateFemWorkspaceToRunAcceptance(
  candidate: FemGroundModelDraftCandidate,
): FemWorkspaceToRunAcceptance {
  const blockers: string[] = [];
  const draft = candidate.draft;
  const boundary = candidate.executionBoundary;
  const evidenceIds = [...new Set([
    ...candidate.evidenceIds,
    ...(candidate.bridge.input.evidenceRefs ?? []).map((ref) => ref.id),
    ...(draft.analysisCase?.evidenceRefs ?? []).map((ref) => ref.id),
  ])];

  if (draft.capability.executionMode !== 'human-reviewed-preview') {
    blockers.push('fem_workspace_route_not_runnable_preview');
  }
  if (draft.capability.status !== 'implemented-demo') {
    blockers.push('fem_workspace_route_backend_not_implemented');
  }
  if (candidate.status !== 'ready') {
    blockers.push(`fem_workspace_ground_model_${candidate.status}`);
  }
  if (candidate.missingUserInputs.length > 0 || candidate.bridge.readiness.missingUserInputs.length > 0) {
    blockers.push('fem_workspace_user_inputs_missing');
  }
  if (!draft.analysisCase || !boundary.caseOutputAvailable) {
    blockers.push('fem_workspace_case_output_not_available');
  }
  if (draft.recommendedAction !== 'run-reviewed-case') {
    blockers.push('fem_workspace_draft_not_recommended_for_reviewed_run');
  }
  if (!boundary.humanRunCommand?.startsWith('geotech fem run ') || !boundary.humanRunCommand.includes('--experimental') || !boundary.humanRunCommand.includes('--reviewed')) {
    blockers.push('fem_workspace_reviewed_run_command_missing');
  }
  if (boundary.humanReviewRequired !== true) {
    blockers.push('fem_workspace_human_review_not_required');
  }
  if (evidenceIds.length === 0 || (candidate.bridge.input.evidenceRefs?.length ?? 0) === 0) {
    blockers.push('fem_workspace_evidence_traceability_missing');
  }
  if (draft.validation?.status === 'blocked' || (draft.validation?.blockers ?? 0) > 0) {
    blockers.push('fem_workspace_validation_blocked');
  }
  if (draft.analysisCase?.experimental !== true) {
    blockers.push('fem_workspace_experimental_gate_missing');
  }

  const reviewCodes = [
    ...draft.reviewGates,
    ...(draft.validation?.findings ?? [])
      .filter((finding) => finding.severity === 'review')
      .map((finding) => finding.code),
  ];

  return {
    schemaVersion: 'fem-workspace-to-run-acceptance.v1',
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    objective: candidate.objective,
    workflow: candidate.workflow,
    caseOutputAvailable: boundary.caseOutputAvailable,
    ...(boundary.humanRunCommand ? { humanRunCommand: boundary.humanRunCommand } : {}),
    approvalRecordSchema: boundary.approvalRecordSchema ?? 'fem-reviewer-approval.v1',
    approvalRecordRequiredForProductionAcceptance: true,
    ...(boundary.strictApprovalRunCommand
      ? { strictApprovalRunCommand: boundary.strictApprovalRunCommand }
      : boundary.humanRunCommand
        ? {
            strictApprovalRunCommand: boundary.humanRunCommand,
          }
        : {}),
    blockerCodes: [...new Set(blockers)],
    reviewCodes: [...new Set(reviewCodes)],
    evidenceIds,
  };
}

function sanitizeFemEvidenceSource(value: string | undefined): string {
  if (!value) {
    return 'GroundModel';
  }

  return isAbsoluteLocalPath(value) || hasSecretLikeValue(value)
    ? basenameLike(value) || 'GroundModel'
    : value;
}

function collectFemRawPayloadKeys(value: unknown): string[] {
  return collectFemProhibitedKeys(value, FEM_PROHIBITED_RAW_PAYLOAD_KEYS);
}

function collectFemExecutionResultKeys(value: unknown): string[] {
  return collectFemProhibitedKeys(value, FEM_PROHIBITED_EXECUTION_RESULT_KEYS);
}

function collectFemProhibitedKeys(value: unknown, prohibitedKeys: Set<string>): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (prohibitedKeys.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectFemPrivateLeaks(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (typeof entry === 'string' && (isAbsoluteLocalPath(entry) || hasSecretLikeValue(entry))) {
      paths.push(path || '<root>');
    }
  });

  return paths;
}

function walkUnknown(value: unknown, visit: (entry: unknown, path: string) => void, path = ''): void {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkUnknown(item, visit, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    walkUnknown(entry, visit, path ? `${path}.${key}` : key);
  }
}

function isAbsoluteLocalPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\/(?:home|Users|tmp|var|mnt)\//i.test(value);
}

function hasSecretLikeValue(value: string): boolean {
  return /(?:sk-(?:or-)?[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{12,}|token\s*[:=]\s*[A-Za-z0-9_-]{12,})/i.test(value);
}

function basenameLike(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? '';
}

function sanitizeBlockerCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

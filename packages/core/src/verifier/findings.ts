import type { GroundModel } from '../ground-model/index.js';
import { normalizeEvidenceConfidence } from '../evidence/index.js';
import {
  getStandardProfile,
  normalizeStandardProfileId,
  validateStandardProfileReadiness,
  type StandardProfileAssumptions,
  type StandardProfileId,
  type StandardProfileValidation,
} from '../standards/index.js';

export type GroundModelFindingSeverity = 'blocking' | 'review' | 'info';

export type GroundModelCalculationWorkflow =
  | 'bearing-capacity'
  | 'settlement'
  | 'fem-foundation-settlement'
  | 'fem-excavation-deformation'
  | 'fem-tunnel-volume-loss-settlement'
  | 'fem-shaft-deformation'
  | 'fem-pile-group-elastic-interaction'
  | 'fem-slope-embankment-deformation'
  | 'fem-retaining-wall-excavation-support'
  | 'fem-seepage-groundwater-coupling'
  | 'fem-staged-settlement-consolidation'
  | 'pile-capacity'
  | 'liquefaction'
  | 'slope-stability';

export type GroundModelCalculationReadinessStatus = 'ready' | 'ready_with_assumptions' | 'blocked';

export interface GroundModelFinding {
  severity: GroundModelFindingSeverity;
  code: string;
  message: string;
  evidenceIds: string[];
  recommendation?: string;
}

export interface GroundModelCalculationReadiness {
  workflow: GroundModelCalculationWorkflow;
  label: string;
  status: GroundModelCalculationReadinessStatus;
  score: number;
  toolName: string;
  commandTemplate: string;
  standardProfile?: StandardProfileId;
  profileAssumptions?: string[];
  inputDraft?: GroundModelCalculationInputDraft;
  present: string[];
  missing: string[];
  assumptions: string[];
  evidenceIds: string[];
  recommendation: string;
}

export interface GroundModelCalculationInputDraft {
  workflow: GroundModelCalculationWorkflow;
  toolName: string;
  command: string;
  input: Record<string, unknown>;
  missingUserInputs: string[];
  assumptions: string[];
  evidenceIds: string[];
  sourceRefs: GroundModelCalculationDraftSourceRef[];
  sourcePages: GroundModelCalculationDraftSourcePage[];
  confidence: number;
  reviewGates: GroundModelCalculationDraftReviewGate[];
  readyToRun: boolean;
}

export interface GroundModelCalculationInputDraftContract {
  schemaVersion: 'ground-model-calculation-input-draft-contract.v1';
  ok: boolean;
  failures: string[];
}

export interface GroundModelCalculationDraftSourceRef {
  evidenceId: string;
  sourcePath: string;
  method: string;
  confidence: number;
  pageNumber?: number;
  rowNumber?: number;
  sheetName?: string;
  columnName?: string;
  warnings: string[];
}

export interface GroundModelCalculationDraftSourcePage {
  sourcePath: string;
  pageNumber: number;
  evidenceIds: string[];
  confidence: number;
}

export interface GroundModelCalculationDraftReviewGate {
  code: string;
  severity: 'blocking' | 'review' | 'info';
  message: string;
  evidenceIds: string[];
  recommendation: string;
}

export interface VerifyGroundModelOptions {
  includeCalculationInputDrafts?: boolean;
  declaredStandardAssumptionCodes?: string[];
}

export interface GroundModelCalculationReadinessSummary {
  ready: number;
  readyWithAssumptions: number;
  blocked: number;
}

export interface GroundModelVerification {
  schemaVersion: 'ground-model-verifier.v1';
  generatedAt: string;
  status: 'pass' | 'review' | 'blocking';
  summary: {
    blocking: number;
    review: number;
    info: number;
  };
  findings: GroundModelFinding[];
  standardProfile?: StandardProfileId;
  standardProfileValidation: StandardProfileValidation;
  calculationReadiness: {
    schemaVersion: 'ground-model-calculation-readiness.v1';
    summary: GroundModelCalculationReadinessSummary;
    workflows: GroundModelCalculationReadiness[];
  };
}

const DESIGN_CALCULATION_DRAFT_WORKFLOWS = new Set<GroundModelCalculationWorkflow>([
  'bearing-capacity',
  'settlement',
  'pile-capacity',
  'liquefaction',
  'slope-stability',
]);

const EXECUTION_RESULT_KEYS = new Set([
  'analysisCase',
  'analysisResult',
  'calculationResult',
  'caseOutput',
  'caseOutputPath',
  'designOutput',
  'designResult',
  'factorOfSafetyResult',
  'manifestPath',
  'resultManifest',
  'solverOutput',
]);

const DRAFT_PROHIBITED_RAW_PAYLOAD_KEYS = new Set([
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

function addFinding(findings: GroundModelFinding[], finding: GroundModelFinding): void {
  findings.push(finding);
}

export function validateGroundModelCalculationInputDraftContract(
  value: unknown,
): GroundModelCalculationInputDraftContract {
  const failures: string[] = [];

  if (!isRecord(value)) {
    return {
      schemaVersion: 'ground-model-calculation-input-draft-contract.v1',
      ok: false,
      failures: ['calculation input draft contract must be an object'],
    };
  }

  const workflow = typeof value.workflow === 'string' ? value.workflow as GroundModelCalculationWorkflow : undefined;
  const isDesignCalculationDraft = workflow != null && DESIGN_CALCULATION_DRAFT_WORKFLOWS.has(workflow);

  if (!workflow) {
    failures.push('calculation input draft must include workflow');
  }
  if (!isNonEmptyString(value.toolName)) {
    failures.push('calculation input draft must include toolName');
  }
  if (!isNonEmptyString(value.command)) {
    failures.push('calculation input draft must include command');
  }
  if (!isRecord(value.input)) {
    failures.push('calculation input draft must include structured input object');
  }
  if (!Array.isArray(value.missingUserInputs)) {
    failures.push('calculation input draft must include missingUserInputs array');
  }
  if (!Array.isArray(value.assumptions)) {
    failures.push('calculation input draft must include assumptions array');
  }
  if (!Array.isArray(value.evidenceIds)) {
    failures.push('calculation input draft must include evidenceIds array');
  }
  if (!Array.isArray(value.sourceRefs)) {
    failures.push('calculation input draft must include sourceRefs array');
  }
  if (!Array.isArray(value.sourcePages)) {
    failures.push('calculation input draft must include sourcePages array');
  }
  if (!Array.isArray(value.reviewGates)) {
    failures.push('calculation input draft must include reviewGates array');
  }
  if (typeof value.readyToRun !== 'boolean') {
    failures.push('calculation input draft must include readyToRun boolean');
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    failures.push('calculation input draft confidence must be a finite 0..1 workflow-trust score');
  }

  if (isDesignCalculationDraft) {
    const command = String(value.command ?? '');
    const missingUserInputs = Array.isArray(value.missingUserInputs) ? value.missingUserInputs.filter(isNonEmptyString) : [];
    const reviewGates = Array.isArray(value.reviewGates) ? value.reviewGates.filter(isRecord) : [];
    const evidenceIds = Array.isArray(value.evidenceIds) ? value.evidenceIds.filter(isNonEmptyString) : [];
    const sourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs.filter(isRecord) : [];

    if (value.readyToRun !== false) {
      failures.push(`${workflow} draft must be opt-in and not readyToRun before explicit user inputs and review`);
    }
    if (missingUserInputs.length === 0) {
      failures.push(`${workflow} draft must expose missing user inputs`);
    }
    if (!reviewGates.some((gate) => gate.code === 'missing_user_inputs' && gate.severity === 'blocking')) {
      failures.push(`${workflow} draft must include a blocking missing_user_inputs review gate`);
    }
    if (evidenceIds.length === 0) {
      failures.push(`${workflow} draft must retain evidenceIds`);
    }
    if (sourceRefs.length === 0) {
      failures.push(`${workflow} draft must retain sourceRefs`);
    }
    if (sourceRefs.some((ref) => !isNonEmptyString(ref.evidenceId) || !isNonEmptyString(ref.sourcePath) || !isNonEmptyString(ref.method))) {
      failures.push(`${workflow} draft sourceRefs must include evidenceId, sourcePath, and method`);
    }
    if (/\bfem\s+run\b|--experimental|--case-output/i.test(command)) {
      failures.push(`${workflow} design-calculation draft must not expose FEM execution or case-output commands`);
    }
    if (!/<[^>]+>/.test(command)) {
      failures.push(`${workflow} draft command must retain placeholders until user inputs are supplied`);
    }
    if (/^\s*\{/.test(command) || /^\s*\[/.test(command)) {
      failures.push(`${workflow} draft command must not be a serialized result payload`);
    }
  }

  for (const keyPath of collectExecutionResultKeys(value)) {
    failures.push(`calculation input draft must not carry execution/result payload key at ${keyPath}`);
  }

  for (const keyPath of collectDraftRawPayloadKeys(value)) {
    failures.push(`calculation input draft must not carry raw prompt, response, model, or source-evidence payload key at ${keyPath}`);
  }

  for (const leak of collectPrivateDraftLeaks(value)) {
    failures.push(`calculation input draft must not leak private paths or tokens at ${leak}`);
  }

  return {
    schemaVersion: 'ground-model-calculation-input-draft-contract.v1',
    ok: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

export function verifyGroundModel(
  model: GroundModel,
  options: VerifyGroundModelOptions = {},
): GroundModelVerification {
  const findings: GroundModelFinding[] = [];
  const calculationReadiness = assessCalculationReadiness(model, options);
  const evidenceContext = buildEvidenceContext(model);
  const standardProfileValidation = validateStandardProfileReadiness({
    requestedProfile: model.project.requestedStandard ?? 'eurocode7',
    declaredAssumptionCodes: options.declaredStandardAssumptionCodes,
    evidence: {
      hasBoreholes: evidenceContext.hasBoreholes,
      hasStrata: evidenceContext.hasStrata,
      hasDepthCoverage: evidenceContext.hasDepthCoverage,
      hasSpt: evidenceContext.hasSpt,
      hasGroundwater: evidenceContext.hasGroundwater,
      hasUnitWeight: evidenceContext.hasUnitWeight,
      hasStrength: evidenceContext.hasStrength,
      hasCompressibility: evidenceContext.hasCompressibility,
      hasFinesOrGradation: evidenceContext.hasFinesOrGradation,
      hasCoordinates: model.boreholes.some((borehole) => Boolean(borehole.coordinates)),
    },
    workflows: calculationReadiness.workflows.map((workflow) => ({
      workflow: workflow.workflow,
      status: workflow.status,
      missing: workflow.missing,
      assumptions: workflow.assumptions,
      evidenceIds: workflow.evidenceIds,
    })),
  });

  if (model.stats.evidenceRefs === 0) {
    addFinding(findings, {
      severity: 'review',
      code: 'no_bound_evidence',
      message: 'No evidence-bound geotechnical values were extracted from the workspace.',
      evidenceIds: [],
      recommendation: 'Add CSV/XLSX/AGS inputs with borehole IDs, depths, test values, or run geotech ingest on PDFs first.',
    });
  }

  if (model.project.requestedStandard && !normalizeStandardProfileId(model.project.requestedStandard)) {
    addFinding(findings, {
      severity: 'review',
      code: 'unknown_standard_profile',
      message: `Requested standard profile "${model.project.requestedStandard}" is not one of eurocode7, aashto, is, bs, or astm.`,
      evidenceIds: [],
      recommendation: 'Use a supported standard profile so downstream factors and verifier checks are explicit.',
    });
  }

  for (const rejected of model.rejectedObservations) {
    addFinding(findings, {
      severity: rejected.kind === 'spt' ? 'review' : 'info',
      code: `rejected_${rejected.kind}_observation`,
      message: rejected.reason,
      evidenceIds: rejected.evidenceIds,
      recommendation: 'Review the source value and confirm whether it is engineering data or a standards/reference number.',
    });
  }

  if (model.boreholes.length > 0 && model.groundwater.length === 0) {
    addFinding(findings, {
      severity: 'review',
      code: 'missing_groundwater',
      message: 'Borehole or in-situ data were detected but no groundwater observation was bound to evidence.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Add groundwater depth, water table notes, or make the dry/unknown groundwater assumption explicit before design.',
    });
  }

  if (model.coordinateSystem.kind === 'local-grid') {
    addFinding(findings, {
      severity: 'info',
      code: 'crs_not_declared',
      message: 'Easting/northing coordinates were detected, but no coordinate reference system was declared.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.coordinates?.evidenceIds ?? []).slice(0, 8),
      recommendation: 'Record the CRS or treat map output as a local coordinate plan.',
    });
  }

  for (const borehole of model.boreholes) {
    const depths = borehole.sptTests.map((test) => test.depth);
    if (depths.some((depth) => depth < 0)) {
      addFinding(findings, {
        severity: 'blocking',
        code: 'negative_depth',
        message: `Borehole ${borehole.id} contains a negative depth value.`,
        evidenceIds: borehole.sptTests.filter((test) => test.depth < 0).flatMap((test) => test.evidenceIds),
        recommendation: 'Correct the source table before using this model for calculations.',
      });
    }

    const duplicateDepths = depths.filter((depth, index) => depths.indexOf(depth) !== index);
    if (duplicateDepths.length > 0) {
      addFinding(findings, {
        severity: 'info',
        code: 'duplicate_spt_depth',
        message: `Borehole ${borehole.id} has repeated SPT depths in the sampled data.`,
        evidenceIds: borehole.sptTests.filter((test) => duplicateDepths.includes(test.depth)).flatMap((test) => test.evidenceIds).slice(0, 8),
        recommendation: 'Check whether duplicate depths are repeated tests, merged tables, or OCR/table extraction artifacts.',
      });
    }
  }

  if (model.stats.sptTests > 0 && model.boreholes.every((borehole) => !borehole.coordinates)) {
    addFinding(findings, {
      severity: 'info',
      code: 'missing_borehole_coordinates',
      message: 'SPT/borehole evidence was detected but no borehole coordinates were found.',
      evidenceIds: model.boreholes.flatMap((borehole) => borehole.evidenceIds).slice(0, 8),
      recommendation: 'Add a borehole coordinate table to unlock map and local plan visualizations.',
    });
  }

  const summary = {
    blocking: findings.filter((finding) => finding.severity === 'blocking').length,
    review: findings.filter((finding) => finding.severity === 'review').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  };

  return {
    schemaVersion: 'ground-model-verifier.v1',
    generatedAt: new Date().toISOString(),
    status: summary.blocking > 0 ? 'blocking' : summary.review > 0 ? 'review' : 'pass',
    summary,
    findings,
    standardProfile: standardProfileValidation.profile?.id,
    standardProfileValidation,
    calculationReadiness,
  };
}

function assessCalculationReadiness(
  model: GroundModel,
  options: VerifyGroundModelOptions = {},
): GroundModelVerification['calculationReadiness'] {
  const context = buildEvidenceContext(model);
  const profile = getStandardProfile(model.project.requestedStandard) ?? getStandardProfile('eurocode7');
  const workflows = [
    assessBearingReadiness(model, context, profile, options),
    assessSettlementReadiness(model, context, profile, options),
    assessFemFoundationSettlementReadiness(model, context, profile, options),
    assessFemExcavationDeformationReadiness(model, context, profile, options),
    assessFemTunnelVolumeLossReadiness(model, context, profile, options),
    assessFemShaftDeformationReadiness(model, context, profile, options),
    assessFemPileGroupInteractionReadiness(model, context, profile, options),
    assessFemSlopeEmbankmentDeformationReadiness(model, context, profile, options),
    assessFemRetainingWallExcavationSupportReadiness(model, context, profile, options),
    assessFemSeepageGroundwaterCouplingReadiness(model, context, profile, options),
    assessFemStagedSettlementConsolidationReadiness(model, context, profile, options),
    assessPileReadiness(model, context, profile, options),
    assessLiquefactionReadiness(model, context, profile, options),
    assessSlopeReadiness(model, context, profile, options),
  ];
  return {
    schemaVersion: 'ground-model-calculation-readiness.v1',
    summary: {
      ready: workflows.filter((workflow) => workflow.status === 'ready').length,
      readyWithAssumptions: workflows.filter((workflow) => workflow.status === 'ready_with_assumptions').length,
      blocked: workflows.filter((workflow) => workflow.status === 'blocked').length,
    },
    workflows,
  };
}

function assessFemFoundationSettlementReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-foundation-settlement',
    label: 'Experimental FEM foundation settlement draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, '3D ground profile / strata model'),
      ...missingWhen(!context.hasSettlementBasis, 'elastic modulus, compressibility, lab index, or SPT correlation evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasCompressibility, 'compressibility or modulus parameters'),
      ...presentWhen(!context.hasCompressibility && context.hasLabIndex, 'lab index parameters for correlations'),
      ...presentWhen(!context.hasCompressibility && !context.hasLabIndex && context.hasSpt, 'SPT profile for stiffness correlations'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasSettlementBasis
      ? 'Prepare an experimental FEM analysis-case draft only after the user declares raft geometry, service pressure, mesh intent, and groundwater handling. Do not run production FEM from inferred values.'
      : 'Add strata plus stiffness/compressibility, lab index, or SPT evidence before preparing an FEM settlement case.',
  }, model, context, profile, options);
}

function assessFemExcavationDeformationReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-excavation-deformation',
    label: 'Experimental FEM staged excavation deformation draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, '3D ground profile / excavation strata model'),
      ...missingWhen(!context.hasDepthCoverage, 'layer depth coverage for excavation influence zone'),
      ...missingWhen(!context.hasStrengthOrSpt, 'shear strength, SPT, or stiffness evidence for excavation review'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for deformation correlations'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasDepthCoverage && context.hasStrengthOrSpt
      ? 'Prepare an experimental staged-excavation FEM draft only after the user declares excavation geometry, construction stages, support levels, surcharge, and groundwater handling. Do not run production excavation design from inferred values.'
      : 'Add excavation-relevant strata depth coverage plus strength, SPT, or stiffness evidence before preparing an FEM staged-excavation case.',
  }, model, context, profile, options);
}

function assessFemTunnelVolumeLossReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-tunnel-volume-loss-settlement',
    label: 'Experimental tunnel volume-loss settlement draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, 'tunnel influence strata model'),
      ...missingWhen(!context.hasDepthCoverage, 'cover-depth and layer depth coverage'),
      ...missingWhen(!context.hasSettlementBasis, 'stiffness, compressibility, lab index, or SPT correlation evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasDepthCoverage && context.hasSettlementBasis
      ? 'Prepare an experimental tunnel volume-loss settlement draft only after the user declares tunnel diameter, cover depth, alignment length, volume-loss assumption, and trough-width parameter. Do not treat it as a tunnel lining, face-stability, or production FEM solver.'
      : 'Add tunnel-influence strata depth coverage plus stiffness/compressibility, lab index, or SPT evidence before preparing a tunnel settlement draft.',
  }, model, context, profile, options);
}

function assessFemShaftDeformationReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-shaft-deformation',
    label: 'Planned shaft deformation contract draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft shaft-deformation --input <json>',
    coreMissing: [
      'implemented shaft deformation preview backend',
      ...missingWhen(!context.hasStrata, 'shaft influence strata model'),
      ...missingWhen(!context.hasDepthCoverage, 'shaft depth coverage'),
      ...missingWhen(!context.hasStrengthOrSpt, 'strength, stiffness, or SPT evidence for shaft deformation review'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for deformation correlations'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: 'Shaft deformation is a planned contract-only FEM route. Use this readiness record to collect shaft geometry, support sequence, and evidence, but do not create a runnable analysis case or WebGL result yet.',
  }, model, context, profile, options);
}

function assessFemPileGroupInteractionReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-pile-group-elastic-interaction',
    label: 'Planned pile-group elastic interaction contract draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft pile-group-elastic-interaction --input <json>',
    coreMissing: [
      'implemented pile-group FEM preview backend',
      ...missingWhen(!context.hasBoreholes && !context.hasStrata, 'borehole/strata profile'),
      ...missingWhen(!context.hasDepthCoverage, 'pile influence depth coverage'),
      ...missingWhen(!context.hasStrengthOrSpt, 'strength, stiffness, or SPT evidence for pile-soil interaction review'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasGroundwater, 'groundwater condition'),
    ],
    present: [
      ...presentWhen(context.hasBoreholes, 'boreholes'),
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for pile correlations'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.boreholeEvidenceIds,
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: 'Pile-group FEM interaction is a planned contract-only route. Use deterministic pile-capacity tools for current design checks and collect pile layout, head condition, stiffness, and load cases before any future FEM preview.',
  }, model, context, profile, options);
}

function assessFemSlopeEmbankmentDeformationReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-slope-embankment-deformation',
    label: 'Planned slope / embankment deformation contract draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft slope-embankment-deformation --input <json>',
    coreMissing: [
      'implemented slope/embankment deformation preview backend',
      ...missingWhen(!context.hasStrata, 'slope or embankment strata model'),
      ...missingWhen(!context.hasDepthCoverage, 'slope/embankment influence depth coverage'),
      ...missingWhen(!context.hasStrengthOrSpt, 'strength, stiffness, or SPT evidence for slope deformation review'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater or drainage condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for deformation correlations'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: 'Slope/embankment FEM deformation is a planned contract-only route. Use deterministic slope-stability and settlement checks first, collect staged geometry and drainage assumptions, and do not create a runnable FEM case or WebGL result yet.',
  }, model, context, profile, options);
}

function assessFemRetainingWallExcavationSupportReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-retaining-wall-excavation-support',
    label: 'Planned retaining wall / excavation support contract draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft retaining-wall-excavation-support --input <json>',
    coreMissing: [
      'implemented retaining-wall/excavation-support preview backend',
      ...missingWhen(!context.hasStrata, 'retaining wall excavation strata model'),
      ...missingWhen(!context.hasDepthCoverage, 'wall toe and excavation influence depth coverage'),
      ...missingWhen(!context.hasStrengthOrSpt, 'strength, stiffness, or SPT evidence for wall movement review'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater/dewatering condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for wall deformation correlations'),
      ...presentWhen(context.hasSettlementBasis, 'stiffness/compressibility basis'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: 'Retaining wall/excavation support FEM is a planned contract-only route. Use deterministic earth-pressure, excavation, and groundwater checks first, collect wall/support geometry, and do not create a runnable FEM case or WebGL result yet.',
  }, model, context, profile, options);
}

function assessFemSeepageGroundwaterCouplingReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-seepage-groundwater-coupling',
    label: 'Planned seepage / groundwater coupling contract draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft seepage-groundwater-coupling --input <json>',
    coreMissing: [
      'implemented seepage/groundwater coupling preview backend',
      ...missingWhen(!context.hasStrata, 'hydrostratigraphy / seepage strata model'),
      ...missingWhen(!context.hasGroundwater, 'groundwater observations or piezometric evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasFinesOrGradation && !context.hasLabIndex, 'permeability, gradation, or hydrogeology basis'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
      ...presentWhen(context.hasFinesOrGradation, 'gradation/fines evidence for seepage review'),
      ...presentWhen(context.hasLabIndex, 'lab index parameters for permeability screening'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.groundwaterEvidenceIds,
      context.finesEvidenceIds,
      context.labIndexEvidenceIds,
      context.unitWeightEvidenceIds,
    ),
    recommendation: 'Seepage/groundwater-coupled FEM is a planned contract-only route. Collect hydraulic boundary conditions, permeability basis, and dewatering assumptions before any future coupled preview; do not create a runnable FEM case or WebGL result yet.',
  }, model, context, profile, options);
}

function assessFemStagedSettlementConsolidationReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'fem-staged-settlement-consolidation',
    label: 'Experimental staged settlement / consolidation draft',
    toolName: 'prepare_fem_analysis_case',
    commandTemplate: 'geotech fem draft staged-settlement-consolidation --input <json> --case-output <analysis_case.json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, 'settlement/consolidation strata model'),
      ...missingWhen(!context.hasSettlementBasis, 'compressibility, consolidation, lab index, or SPT correlation evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater/drainage condition'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata profile'),
      ...presentWhen(context.hasCompressibility, 'compressibility or consolidation parameters'),
      ...presentWhen(!context.hasCompressibility && context.hasLabIndex, 'lab index parameters for settlement correlations'),
      ...presentWhen(!context.hasCompressibility && !context.hasLabIndex && context.hasSpt, 'SPT profile for stiffness correlations'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater condition'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasSettlementBasis
      ? 'Prepare an experimental 1D staged consolidation draft only after the user declares layer thickness, tributary area, stage loads, durations, and drainage assumptions. Do not treat it as a production 2D/3D coupled FEM solver.'
      : 'Add settlement/consolidation strata coverage plus compressibility, lab index, or SPT evidence before preparing a staged consolidation FEM draft.',
  }, model, context, profile, options);
}

function assessBearingReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'bearing-capacity',
    label: 'Shallow foundation bearing capacity',
    toolName: 'calculate_bearing_capacity',
    commandTemplate: 'geotech bearing --depth <m> --width <m> --phi <deg> --cohesion <kPa> --unit-weight <kN/m3>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, 'stratigraphy / bearing stratum'),
      ...missingWhen(!context.hasStrengthOrSpt, 'shear strength or SPT-derived strength evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater depth'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'stratigraphy'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for correlation'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater observation'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasStrengthOrSpt
      ? 'Route to bearing capacity after explicitly selecting design geometry, load case, and any missing groundwater/unit-weight assumptions.'
      : 'Add bearing stratum, shear strength, or SPT evidence before running bearing capacity.',
  }, model, context, profile, options);
}

function assessSettlementReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'settlement',
    label: 'Settlement analysis',
    toolName: context.hasCompressibility ? 'calculate_schmertmann_settlement' : 'calculate_consolidation',
    commandTemplate: 'geotech settlement immediate --stress <kPa> --width <m> --layers <json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, 'compressible strata profile'),
      ...missingWhen(!context.hasSettlementBasis, 'compressibility, modulus, lab index, or SPT correlation evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight / effective stress basis'),
      ...missingWhen(!context.hasGroundwater, 'groundwater depth'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'strata thickness evidence'),
      ...presentWhen(context.hasCompressibility, 'compressibility or modulus parameters'),
      ...presentWhen(!context.hasCompressibility && context.hasLabIndex, 'lab index parameters for correlations'),
      ...presentWhen(!context.hasCompressibility && !context.hasLabIndex && context.hasSpt, 'SPT profile for correlations'),
      ...presentWhen(context.hasGroundwater, 'groundwater observation'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.compressibilityEvidenceIds,
      context.labIndexEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasSettlementBasis
      ? 'Route to settlement after selecting the settlement method and declaring stress, foundation dimensions, and groundwater assumptions.'
      : 'Add layer thickness plus compressibility/modulus, lab index, or SPT evidence before settlement analysis.',
  }, model, context, profile, options);
}

function assessPileReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'pile-capacity',
    label: 'Axial pile capacity',
    toolName: 'calculate_pile_capacity',
    commandTemplate: 'geotech pile --diameter <m> --length <m> --layers <json>',
    coreMissing: [
      ...missingWhen(!context.hasBoreholes && !context.hasStrata, 'borehole/strata profile'),
      ...missingWhen(!context.hasDepthCoverage, 'layer depth or termination depth'),
      ...missingWhen(!context.hasStrengthOrSpt, 'shear strength or SPT-derived shaft/base resistance evidence'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasGroundwater, 'groundwater depth'),
    ],
    present: [
      ...presentWhen(context.hasBoreholes, 'boreholes'),
      ...presentWhen(context.hasDepthCoverage, 'depth coverage'),
      ...presentWhen(context.hasStrength, 'direct strength parameters'),
      ...presentWhen(!context.hasStrength && context.hasSpt, 'SPT profile for pile correlations'),
      ...presentWhen(context.hasGroundwater, 'groundwater observation'),
    ],
    evidenceIds: collectEvidenceIds(
      context.boreholeEvidenceIds,
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.sptEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: (context.hasBoreholes || context.hasStrata) && context.hasDepthCoverage && context.hasStrengthOrSpt
      ? 'Route to pile capacity after choosing pile geometry and confirming groundwater assumptions.'
      : 'Add borehole depth coverage plus strength or SPT evidence before pile capacity analysis.',
  }, model, context, profile, options);
}

function assessLiquefactionReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'liquefaction',
    label: 'SPT-based liquefaction triggering',
    toolName: 'calculate_liquefaction',
    commandTemplate: 'geotech liquefaction --pga <g> --magnitude <Mw> --spt-profile <csv>',
    coreMissing: [
      ...missingWhen(!context.hasSpt, 'SPT N-values by depth'),
      ...missingWhen(!context.hasGroundwater, 'groundwater depth'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight / overburden stress basis'),
      ...missingWhen(!context.hasFinesOrGradation, 'fines content or gradation for corrections'),
    ],
    present: [
      ...presentWhen(context.hasSpt, 'SPT N-values'),
      ...presentWhen(context.hasGroundwater, 'groundwater observation'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasFinesOrGradation, 'fines/gradation evidence'),
    ],
    evidenceIds: collectEvidenceIds(
      context.sptEvidenceIds,
      context.groundwaterEvidenceIds,
      context.unitWeightEvidenceIds,
      context.finesEvidenceIds,
    ),
    recommendation: context.hasSpt && context.hasGroundwater
      ? 'Route to liquefaction once seismic demand, unit-weight assumptions, and fines corrections are declared.'
      : 'Add SPT N-values and groundwater evidence before liquefaction triggering analysis.',
  }, model, context, profile, options);
}

function assessSlopeReadiness(
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  return buildWorkflowReadiness({
    workflow: 'slope-stability',
    label: 'Slope stability',
    toolName: 'calculate_slope_stability',
    commandTemplate: 'geotech slope --height <m> --angle <deg> --layers <json>',
    coreMissing: [
      ...missingWhen(!context.hasStrata, 'stratigraphy / slope soil layers'),
      ...missingWhen(!context.hasStrength, 'cohesion/friction angle or undrained strength'),
    ],
    assumptionMissing: [
      ...missingWhen(!context.hasUnitWeight, 'unit weight'),
      ...missingWhen(!context.hasGroundwater, 'groundwater depth'),
    ],
    present: [
      ...presentWhen(context.hasStrata, 'stratigraphy'),
      ...presentWhen(context.hasStrength, 'direct shear-strength parameters'),
      ...presentWhen(context.hasUnitWeight, 'unit weight'),
      ...presentWhen(context.hasGroundwater, 'groundwater observation'),
    ],
    evidenceIds: collectEvidenceIds(
      context.strataEvidenceIds,
      context.strengthEvidenceIds,
      context.unitWeightEvidenceIds,
      context.groundwaterEvidenceIds,
    ),
    recommendation: context.hasStrata && context.hasStrength
      ? 'Route to slope stability after selecting geometry, surcharge, groundwater, and seismic assumptions.'
      : 'Add layer geometry plus direct shear-strength evidence before slope stability analysis.',
  }, model, context, profile, options);
}

interface WorkflowReadinessInput {
  workflow: GroundModelCalculationWorkflow;
  label: string;
  toolName: string;
  commandTemplate: string;
  coreMissing: string[];
  assumptionMissing: string[];
  present: string[];
  evidenceIds: string[];
  recommendation: string;
}

function buildWorkflowReadiness(
  input: WorkflowReadinessInput,
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  options: VerifyGroundModelOptions,
): GroundModelCalculationReadiness {
  const status: GroundModelCalculationReadinessStatus = input.coreMissing.length > 0
    ? 'blocked'
    : input.assumptionMissing.length > 0
      ? 'ready_with_assumptions'
      : 'ready';
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - input.coreMissing.length * 35 - input.assumptionMissing.length * 8,
    ),
  );
  const profileAssumptions = profile
    ? [
        `${profile.label}: ${profile.basis}`,
        ...profile.notes,
      ]
    : [];
  const inputDraft = options.includeCalculationInputDrafts
    ? buildCalculationInputDraft(input, model, context, profile, status)
    : undefined;

  return {
    workflow: input.workflow,
    label: input.label,
    status,
    score,
    toolName: input.toolName,
    commandTemplate: input.commandTemplate,
    standardProfile: profile?.id,
    profileAssumptions,
    inputDraft,
    present: [...new Set(input.present)],
    missing: [...new Set([...input.coreMissing, ...input.assumptionMissing])],
    assumptions: [...new Set(input.assumptionMissing)],
    evidenceIds: [...new Set(input.evidenceIds)].slice(0, 12),
    recommendation: input.recommendation,
  };
}

function buildCalculationInputDraft(
  workflow: WorkflowReadinessInput,
  model: GroundModel,
  context: EvidenceContext,
  profile: StandardProfileAssumptions | null,
  status: GroundModelCalculationReadinessStatus,
): GroundModelCalculationInputDraft {
  const evidenceIds = [...new Set(workflow.evidenceIds)].slice(0, 12);
  const profileNotes = profile
    ? [
        `${profile.label}: ${profile.designFormat} draft profile`,
        ...profile.notes,
      ]
    : [];
  const assumptions = [...new Set([...profileNotes, ...workflow.assumptionMissing.map((item) => `Assume or verify ${item}.`)])];
  const unitWeight = findNumericParameter(model, /unit\s*weight|unitweight|bulk\s*density|density|gamma/i) ?? 18;
  const cohesion = findNumericParameter(model, /cohesion|\bc\b/i) ?? 0;
  const frictionAngle = findNumericParameter(model, /friction|phi/i) ?? 30;
  const groundwaterDepth = model.groundwater[0]?.depth;
  const layers = buildLayerDrafts(model, unitWeight, cohesion, frictionAngle);
  const defaultMethod = profile?.bearingMethod ?? 'meyerhof';
  const defaultFs = profile?.defaultFactorOfSafety ?? 3.0;
  const missingUserInputs: string[] = [];
  let command = workflow.commandTemplate;
  let draftInput: Record<string, unknown> = {};

  switch (workflow.workflow) {
    case 'bearing-capacity':
      missingUserInputs.push('foundation width', 'embedment depth');
      draftInput = {
        unitWeight,
        cohesion,
        frictionAngle,
        method: defaultMethod,
        factorOfSafety: defaultFs,
        ...(groundwaterDepth != null ? { waterTableDepth: groundwaterDepth } : {}),
      };
      command = `geotech bearing --depth <m> --width <m> --phi ${frictionAngle} --cohesion ${cohesion} --unit-weight ${unitWeight} --method ${defaultMethod}`;
      break;
    case 'settlement': {
      missingUserInputs.push('applied stress', 'foundation width');
      const settlementLayers = layers.map((layer) => ({
        thickness: layer.thickness,
        elasticModulus: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model) ?? 10_000,
      }));
      draftInput = {
        layers: settlementLayers,
        embedmentDepth: 0,
        unitWeight,
        timeFactor: 1,
      };
      command = `geotech settlement immediate --stress <kPa> --width <m> --layers '${JSON.stringify(settlementLayers)}'`;
      break;
    }
    case 'fem-foundation-settlement': {
      missingUserInputs.push('raft length', 'raft width', 'service pressure', 'foundation level / embedment');
      draftInput = {
        objective: 'foundation-settlement',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; FEM coupling still requires review.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; explicit review required.' },
      };
      command = 'geotech fem draft foundation-settlement --input <json> --case-output <analysis_case.json>';
      break;
    }
    case 'fem-excavation-deformation': {
      missingUserInputs.push(
        'excavation length',
        'excavation width',
        'final excavation depth',
        'support levels / construction sequence',
      );
      draftInput = {
        objective: 'excavation-deformation',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        geometry: {
          excavationLengthM: '<m>',
          excavationWidthM: '<m>',
          excavationFinalDepthM: '<m>',
          wallToeDepthM: '<m>',
        },
        excavation: {
          stageDepthsM: ['<stage depths m>'],
          supportLevelsM: ['<support level depths m>'],
          wallType: 'diaphragm_wall',
        },
        load: {
          pressureKpa: '<surcharge kPa>',
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; excavation seepage and dewatering coupling still require review.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; explicit excavation groundwater review required.' },
      };
      command = 'geotech fem draft excavation-deformation --input <json> --case-output <analysis_case.json>';
      break;
    }
    case 'fem-tunnel-volume-loss-settlement': {
      missingUserInputs.push(
        'tunnel diameter',
        'tunnel axis depth',
        'tunnel alignment length',
        'volume-loss assumption',
        'trough-width parameter',
      );
      draftInput = {
        objective: 'tunnel-volume-loss-settlement',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        geometry: {
          tunnelDiameterM: '<m>',
          tunnelAxisDepthM: '<m bgl>',
          tunnelLengthM: '<m>',
          tunnelVolumeLossPercent: '<percent>',
          troughWidthParameterK: '<K>',
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; tunnel seepage and pore-pressure coupling still require review.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; explicit tunnel groundwater review required.' },
      };
      command = 'geotech fem draft tunnel-volume-loss-settlement --input <json> --case-output <analysis_case.json>';
      break;
    }
    case 'fem-shaft-deformation': {
      missingUserInputs.push('shaft diameter/shape', 'final depth', 'support sequence', 'groundwater handling');
      draftInput = {
        objective: 'shaft-deformation',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; shaft route remains contract-only.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; shaft route remains contract-only.' },
      };
      command = 'geotech fem draft shaft-deformation --input <json>';
      break;
    }
    case 'fem-pile-group-elastic-interaction': {
      missingUserInputs.push('pile diameter', 'pile length', 'pile spacing', 'load case', 'pile head condition');
      draftInput = {
        objective: 'pile-group-elastic-interaction',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; pile-group FEM route remains contract-only.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; pile-group FEM route remains contract-only.' },
      };
      command = 'geotech fem draft pile-group-elastic-interaction --input <json>';
      break;
    }
    case 'fem-slope-embankment-deformation': {
      missingUserInputs.push(
        'slope height',
        'slope angle / embankment geometry',
        'construction or excavation stages',
        'surcharge/seismic assumptions',
        'drainage and groundwater handling',
      );
      draftInput = {
        objective: 'slope-embankment-deformation',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; slope/embankment route remains contract-only.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; slope/embankment route remains contract-only.' },
      };
      command = 'geotech fem draft slope-embankment-deformation --input <json>';
      break;
    }
    case 'fem-retaining-wall-excavation-support': {
      missingUserInputs.push(
        'wall type',
        'excavation depth',
        'toe embedment',
        'prop/anchor levels',
        'surcharge/load cases',
        'groundwater and dewatering assumptions',
      );
      draftInput = {
        objective: 'retaining-wall-excavation-support',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; retaining-wall route remains contract-only.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; retaining-wall route remains contract-only.' },
      };
      command = 'geotech fem draft retaining-wall-excavation-support --input <json>';
      break;
    }
    case 'fem-seepage-groundwater-coupling': {
      missingUserInputs.push(
        'upstream/downstream heads',
        'piezometric surfaces',
        'permeability values',
        'drainage or pump assumptions',
        'coupling mode and review limits',
      );
      draftInput = {
        objective: 'seepage-groundwater-coupling',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model),
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; seepage route remains contract-only.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; seepage route remains contract-only.' },
      };
      command = 'geotech fem draft seepage-groundwater-coupling --input <json>';
      break;
    }
    case 'fem-staged-settlement-consolidation': {
      missingUserInputs.push(
        'consolidation layer thickness',
        'load or fill stages',
        'stage durations',
        'foundation footprint / tributary surface area',
        'drainage path assumptions',
        'target settlement or monitoring triggers',
      );
      const elasticModulus = findNumericParameter(model, /elastic|modulus|\bes\b/i) ?? estimateElasticModulusFromSpt(model);
      const cv = findNumericParameter(model, /\bcv\b|coefficient(?:\s+of)?\s+consolidation|consolidation coefficient/i);
      const cohesion = findNumericParameter(model, /cohesion|\bc\b/i);
      const frictionAngle = findNumericParameter(model, /friction|phi|angle/i);
      draftInput = {
        objective: 'staged-settlement-consolidation',
        useDemoDefaults: false,
        material: {
          elasticModulusKpa: elasticModulus,
          constrainedModulusKpa: elasticModulus,
          coefficientOfConsolidationM2PerYear: cv,
          frictionAngleDeg: frictionAngle,
          cohesionKpa: cohesion,
          unitWeightKnM3: unitWeight,
          poissonRatio: 0.3,
        },
        groundwater: groundwaterDepth != null
          ? { condition: 'specified', depthM: groundwaterDepth, note: 'Groundwater depth from GroundModel evidence; staged consolidation drainage still requires review.' }
          : { condition: 'not_modelled', note: 'Groundwater not present in GroundModel; staged consolidation drainage still requires review.' },
      };
      command = 'geotech fem draft staged-settlement-consolidation --input <json> --case-output <analysis_case.json>';
      break;
    }
    case 'pile-capacity':
      missingUserInputs.push('pile diameter', 'pile length');
      draftInput = {
        pileType: 'driven',
        pileShape: 'circular',
        layers,
        waterTableDepth: groundwaterDepth ?? 999,
        factorOfSafety: profile?.id === 'aashto' ? 2.5 : defaultFs,
        method: profile?.pileMethod ?? 'auto',
      };
      command = `geotech pile --diameter <m> --length <m> --layers '${JSON.stringify(layers)}'`;
      break;
    case 'liquefaction': {
      missingUserInputs.push('PGA', 'earthquake magnitude');
      const sptLayers = buildSptLayerDrafts(model, unitWeight, groundwaterDepth);
      draftInput = {
        layers: sptLayers,
        earthquakeMagnitude: '<Mw>',
        pga: '<g>',
      };
      command = 'geotech liquefaction --pga <g> --magnitude <Mw> --spt-profile <csv>';
      break;
    }
    case 'slope-stability': {
      missingUserInputs.push('slope height', 'slope angle');
      const soilLayers = layers.map((layer) => ({
        thickness: layer.thickness,
        unitWeight: layer.unit_weight,
        cohesion: layer.undrained_shear_strength ?? cohesion,
        frictionAngle: layer.friction_angle ?? frictionAngle,
      }));
      draftInput = {
        soilLayers,
        waterTableDepth: groundwaterDepth ?? 999,
        surcharge: 0,
        seismicCoefficient: 0,
        method: profile?.slopeMethod ?? 'bishop',
      };
      command = `geotech slope --height <m> --angle <deg> --layers '${JSON.stringify(soilLayers)}'`;
      break;
    }
  }
  const sourceRefs = buildDraftSourceRefs(model, evidenceIds);
  const sourcePages = buildDraftSourcePages(sourceRefs);
  const reviewGates = buildDraftReviewGates(status, workflow, missingUserInputs, evidenceIds, sourceRefs);
  const confidence = calculateDraftConfidence(status, sourceRefs, evidenceIds, missingUserInputs);

  const readyToRun = status === 'ready'
    && missingUserInputs.length === 0
    && reviewGates.every((gate) => gate.severity === 'info');

  return {
    workflow: workflow.workflow,
    toolName: workflow.toolName,
    command,
    input: draftInput,
    missingUserInputs,
    assumptions,
    evidenceIds,
    sourceRefs,
    sourcePages,
    confidence,
    reviewGates,
    readyToRun,
  };
}

function buildDraftSourceRefs(
  model: GroundModel,
  evidenceIds: string[],
): GroundModelCalculationDraftSourceRef[] {
  const evidenceById = new Map(model.evidence.map((evidence) => [evidence.id, evidence]));
  return evidenceIds.flatMap((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      return [];
    }

    return [{
      evidenceId,
      sourcePath: evidence.sourcePath,
      method: evidence.method,
      confidence: normalizeEvidenceConfidence(evidence.confidence),
      pageNumber: evidence.location.pageNumber,
      rowNumber: evidence.location.rowNumber,
      sheetName: evidence.location.sheetName,
      columnName: evidence.location.columnName,
      warnings: [...evidence.warnings],
    }];
  });
}

function buildDraftSourcePages(
  sourceRefs: GroundModelCalculationDraftSourceRef[],
): GroundModelCalculationDraftSourcePage[] {
  const pages = new Map<string, GroundModelCalculationDraftSourcePage>();
  for (const ref of sourceRefs) {
    if (ref.pageNumber == null) {
      continue;
    }

    const key = `${ref.sourcePath}#${ref.pageNumber}`;
    const existing = pages.get(key);
    if (existing) {
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ref.evidenceId])];
      existing.confidence = normalizeEvidenceConfidence(Math.min(existing.confidence, ref.confidence));
      continue;
    }

    pages.set(key, {
      sourcePath: ref.sourcePath,
      pageNumber: ref.pageNumber,
      evidenceIds: [ref.evidenceId],
      confidence: ref.confidence,
    });
  }

  return [...pages.values()].sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath) || left.pageNumber - right.pageNumber
  ));
}

function buildDraftReviewGates(
  status: GroundModelCalculationReadinessStatus,
  workflow: WorkflowReadinessInput,
  missingUserInputs: string[],
  evidenceIds: string[],
  sourceRefs: GroundModelCalculationDraftSourceRef[],
): GroundModelCalculationDraftReviewGate[] {
  const gates: GroundModelCalculationDraftReviewGate[] = [];

  if (status === 'blocked') {
    gates.push({
      code: 'workflow_blocked',
      severity: 'blocking',
      message: `${workflow.label} is blocked by missing core evidence.`,
      evidenceIds,
      recommendation: workflow.coreMissing.length > 0
        ? `Resolve missing evidence: ${workflow.coreMissing.join(', ')}.`
        : 'Resolve deterministic readiness blockers before using this draft.',
    });
  }

  if (missingUserInputs.length > 0) {
    gates.push({
      code: 'missing_user_inputs',
      severity: 'blocking',
      message: `${workflow.label} requires explicit user inputs before execution.`,
      evidenceIds,
      recommendation: `Provide: ${missingUserInputs.join(', ')}.`,
    });
  }

  if (workflow.assumptionMissing.length > 0) {
    gates.push({
      code: 'assumption_review_required',
      severity: 'review',
      message: `${workflow.label} depends on assumptions that are not evidence-bound.`,
      evidenceIds,
      recommendation: `Verify or declare: ${workflow.assumptionMissing.join(', ')}.`,
    });
  }

  if (evidenceIds.length === 0) {
    gates.push({
      code: 'no_traceable_evidence',
      severity: 'review',
      message: `${workflow.label} draft has no bound evidence identifiers.`,
      evidenceIds: [],
      recommendation: 'Bind source-page, table-row, or manual evidence before treating the draft as engineering-ready.',
    });
  } else if (sourceRefs.length < evidenceIds.length) {
    const resolved = new Set(sourceRefs.map((ref) => ref.evidenceId));
    gates.push({
      code: 'unresolved_evidence_refs',
      severity: 'review',
      message: `${workflow.label} draft references evidence IDs that could not be resolved to source locations.`,
      evidenceIds: evidenceIds.filter((evidenceId) => !resolved.has(evidenceId)),
      recommendation: 'Refresh the GroundModel evidence table or re-run workspace analysis so draft inputs carry source locations.',
    });
  }

  return gates;
}

function calculateDraftConfidence(
  status: GroundModelCalculationReadinessStatus,
  sourceRefs: GroundModelCalculationDraftSourceRef[],
  evidenceIds: string[],
  missingUserInputs: string[],
): number {
  const sourceConfidence = sourceRefs.length > 0
    ? sourceRefs.reduce((sum, ref) => sum + ref.confidence, 0) / sourceRefs.length
    : evidenceIds.length > 0
      ? 0.3
      : 0.2;
  const statusFactor = status === 'blocked' ? 0.45 : status === 'ready_with_assumptions' ? 0.8 : 1;
  const missingInputFactor = missingUserInputs.length > 0
    ? Math.max(0.4, 1 - missingUserInputs.length * 0.08)
    : 1;
  return normalizeEvidenceConfidence(sourceConfidence * statusFactor * missingInputFactor);
}

function findNumericParameter(model: GroundModel, pattern: RegExp): number | undefined {
  const parameter = model.parameters.find((item) => pattern.test(item.name) && typeof item.value === 'number');
  return typeof parameter?.value === 'number' && Number.isFinite(parameter.value) ? parameter.value : undefined;
}

function estimateElasticModulusFromSpt(model: GroundModel): number | undefined {
  const nValues = model.boreholes.flatMap((borehole) => borehole.sptTests.map((test) => test.nValue));
  if (nValues.length === 0) {
    return undefined;
  }

  const averageN = nValues.reduce((sum, value) => sum + value, 0) / nValues.length;
  return Math.round(Math.max(5_000, averageN * 750));
}

function buildLayerDrafts(
  model: GroundModel,
  unitWeight: number,
  cohesion: number,
  frictionAngle: number,
): Array<{
  thickness: number;
  soilType: 'clay' | 'sand' | 'silt' | 'gravel' | 'rock';
  undrained_shear_strength?: number;
  friction_angle?: number;
  unit_weight: number;
  spt_n?: number;
}> {
  const sptByBorehole = new Map(
    model.boreholes.map((borehole) => [
      borehole.id,
      borehole.sptTests.length > 0
        ? borehole.sptTests.reduce((sum, test) => sum + test.nValue, 0) / borehole.sptTests.length
        : undefined,
    ]),
  );
  const strata = model.strata.length > 0
    ? model.strata
    : [{ description: 'inferred representative soil layer', topDepth: 0, bottomDepth: 1, evidenceIds: [], confidence: 0, warnings: [] }];

  return strata.slice(0, 8).map((stratum) => {
    const soilType = inferSoilType(stratum.description);
    const top = stratum.topDepth ?? 0;
    const bottom = stratum.bottomDepth ?? Math.max(top + 1, 1);
    const thickness = Math.max(0.25, Math.round((bottom - top) * 100) / 100);
    const spt = stratum.boreholeId ? sptByBorehole.get(stratum.boreholeId) : undefined;

    return {
      thickness,
      soilType,
      ...(soilType === 'clay' || soilType === 'silt' ? { undrained_shear_strength: cohesion } : { friction_angle: frictionAngle }),
      unit_weight: unitWeight,
      ...(spt != null ? { spt_n: Math.round(spt * 10) / 10 } : {}),
    };
  });
}

function buildSptLayerDrafts(
  model: GroundModel,
  unitWeight: number,
  groundwaterDepth: number | undefined,
): Array<{
  depth: number;
  sptN: number;
  finesContent: number;
  unitWeight: number;
  waterTableDepth: number;
}> {
  return model.boreholes
    .flatMap((borehole) => borehole.sptTests)
    .slice(0, 40)
    .map((test) => ({
      depth: test.depth,
      sptN: test.nValue,
      finesContent: 15,
      unitWeight,
      waterTableDepth: groundwaterDepth ?? 999,
    }));
}

function inferSoilType(description: string): 'clay' | 'sand' | 'silt' | 'gravel' | 'rock' {
  const text = description.toLowerCase();
  if (/\b(rock|mudstone|siltstone|sandstone|limestone|bedrock)\b/.test(text)) return 'rock';
  if (/\bgravel\b/.test(text)) return 'gravel';
  if (/\bsand\b/.test(text)) return 'sand';
  if (/\bsilt\b/.test(text)) return 'silt';
  return 'clay';
}

interface EvidenceContext {
  hasBoreholes: boolean;
  hasStrata: boolean;
  hasDepthCoverage: boolean;
  hasSpt: boolean;
  hasGroundwater: boolean;
  hasUnitWeight: boolean;
  hasStrength: boolean;
  hasStrengthOrSpt: boolean;
  hasCompressibility: boolean;
  hasLabIndex: boolean;
  hasSettlementBasis: boolean;
  hasFinesOrGradation: boolean;
  boreholeEvidenceIds: string[];
  strataEvidenceIds: string[];
  sptEvidenceIds: string[];
  groundwaterEvidenceIds: string[];
  unitWeightEvidenceIds: string[];
  strengthEvidenceIds: string[];
  compressibilityEvidenceIds: string[];
  labIndexEvidenceIds: string[];
  finesEvidenceIds: string[];
}

function buildEvidenceContext(model: GroundModel): EvidenceContext {
  const parameters = model.parameters;
  const unitWeightParameters = parameters.filter((parameter) => /unit\s*weight|unitweight|bulk\s*density|density|gamma|γ/i.test(parameter.name));
  const strengthParameters = parameters.filter((parameter) => /friction|phi|φ|cohesion|undrained|shear|strength|\bsu\b|\bcu\b/i.test(parameter.name));
  const compressibilityParameters = parameters.filter((parameter) => /elastic|modulus|\bes\b|compress|consolidat|oedometer|\bcc\b|\bcv\b|\bmv\b/i.test(parameter.name));
  const labIndexParameters = parameters.filter((parameter) => /water\s*content|watercontent|liquid\s*limit|liquidlimit|plastic\s*limit|plasticlimit|plasticity\s*index|plasticityindex/i.test(parameter.name));
  const finesParameters = parameters.filter((parameter) => /fines|gradation|percent\s*passing|percentpassing|passing/i.test(parameter.name));
  const strataWithDepth = model.strata.filter((stratum) => stratum.topDepth != null || stratum.bottomDepth != null);
  const boreholeEvidenceIds = model.boreholes.flatMap((borehole) => borehole.evidenceIds);
  const strataEvidenceIds = model.strata.flatMap((stratum) => stratum.evidenceIds);
  const sptEvidenceIds = model.boreholes.flatMap((borehole) => borehole.sptTests.flatMap((test) => test.evidenceIds));
  const groundwaterEvidenceIds = model.groundwater.flatMap((observation) => observation.evidenceIds);
  const unitWeightEvidenceIds = unitWeightParameters.flatMap((parameter) => parameter.evidenceIds);
  const strengthEvidenceIds = strengthParameters.flatMap((parameter) => parameter.evidenceIds);
  const compressibilityEvidenceIds = compressibilityParameters.flatMap((parameter) => parameter.evidenceIds);
  const labIndexEvidenceIds = labIndexParameters.flatMap((parameter) => parameter.evidenceIds);
  const finesEvidenceIds = finesParameters.flatMap((parameter) => parameter.evidenceIds);
  const hasSpt = model.stats.sptTests > 0;
  const hasStrength = strengthParameters.length > 0;
  const hasCompressibility = compressibilityParameters.length > 0;
  const hasLabIndex = labIndexParameters.length > 0;

  return {
    hasBoreholes: model.boreholes.length > 0,
    hasStrata: model.strata.length > 0,
    hasDepthCoverage: strataWithDepth.length > 0 || model.boreholes.some((borehole) => borehole.sptTests.length > 0),
    hasSpt,
    hasGroundwater: model.groundwater.length > 0,
    hasUnitWeight: unitWeightParameters.length > 0,
    hasStrength,
    hasStrengthOrSpt: hasStrength || hasSpt,
    hasCompressibility,
    hasLabIndex,
    hasSettlementBasis: hasCompressibility || hasLabIndex || hasSpt,
    hasFinesOrGradation: finesParameters.length > 0,
    boreholeEvidenceIds,
    strataEvidenceIds,
    sptEvidenceIds,
    groundwaterEvidenceIds,
    unitWeightEvidenceIds,
    strengthEvidenceIds,
    compressibilityEvidenceIds,
    labIndexEvidenceIds,
    finesEvidenceIds,
  };
}

function missingWhen(condition: boolean, label: string): string[] {
  return condition ? [label] : [];
}

function presentWhen(condition: boolean, label: string): string[] {
  return condition ? [label] : [];
}

function collectEvidenceIds(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectExecutionResultKeys(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (EXECUTION_RESULT_KEYS.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectDraftRawPayloadKeys(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (DRAFT_PROHIBITED_RAW_PAYLOAD_KEYS.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectPrivateDraftLeaks(value: unknown): string[] {
  const paths: string[] = [];
  const leakPattern = /(?:[A-Za-z]:[\\/](?:Users|home|tmp|var|mnt)[\\/]|\/(?:home|Users|tmp|var|mnt)\/|sk-(?:or-)?[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{12,})/i;

  walkUnknown(value, (entry, path) => {
    if (typeof entry === 'string' && leakPattern.test(entry)) {
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

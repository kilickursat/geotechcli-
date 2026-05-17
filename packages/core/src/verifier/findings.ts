import type { GroundModel } from '../ground-model/index.js';
import {
  getStandardProfile,
  normalizeStandardProfileId,
  type StandardProfileAssumptions,
  type StandardProfileId,
} from '../standards/index.js';

export type GroundModelFindingSeverity = 'blocking' | 'review' | 'info';

export type GroundModelCalculationWorkflow =
  | 'bearing-capacity'
  | 'settlement'
  | 'fem-foundation-settlement'
  | 'fem-excavation-deformation'
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
  readyToRun: boolean;
}

export interface VerifyGroundModelOptions {
  includeCalculationInputDrafts?: boolean;
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
  calculationReadiness: {
    schemaVersion: 'ground-model-calculation-readiness.v1';
    summary: GroundModelCalculationReadinessSummary;
    workflows: GroundModelCalculationReadiness[];
  };
}

function addFinding(findings: GroundModelFinding[], finding: GroundModelFinding): void {
  findings.push(finding);
}

export function verifyGroundModel(
  model: GroundModel,
  options: VerifyGroundModelOptions = {},
): GroundModelVerification {
  const findings: GroundModelFinding[] = [];
  const calculationReadiness = assessCalculationReadiness(model, options);

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

  return {
    workflow: workflow.workflow,
    toolName: workflow.toolName,
    command,
    input: draftInput,
    missingUserInputs,
    assumptions,
    evidenceIds,
    readyToRun: status !== 'blocked' && missingUserInputs.length === 0,
  };
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

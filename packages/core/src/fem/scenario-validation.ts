import type {
  FemObjective,
  FemResultEnvelope,
  FemResultManifest,
  FemValidationSummary,
} from './types.js';
import { validateFemResultManifest } from './validation.js';

export type FemScenarioMetric = keyof FemResultEnvelope;

export interface FemScenarioRangeExpectation {
  metric: FemScenarioMetric;
  min?: number;
  max?: number;
  equals?: number;
  tolerance?: number;
  required?: boolean;
}

export interface FemScenarioExpectation {
  schemaVersion: 'fem-scenario-expectation.v1';
  scenarioId: string;
  objective: FemObjective;
  backendId: FemResultManifest['backend']['id'];
  validationStatus?: FemValidationSummary['status'];
  envelope: FemScenarioRangeExpectation[];
  requiredResultFields?: string[];
  requiredReviewCodes?: string[];
}

export interface FemScenarioValidation {
  schemaVersion: 'fem-scenario-validation.v1';
  scenarioId: string;
  status: 'accepted' | 'blocked';
  blockerCodes: string[];
  warnings: string[];
}

export interface FemScenarioRun {
  scenarioId: string;
  manifest: FemResultManifest;
  expectation: FemScenarioExpectation;
}

export interface FemScenarioTrendExpectation {
  id: string;
  fromScenarioId: string;
  toScenarioId: string;
  metric: FemScenarioMetric;
  relation: 'increase' | 'decrease' | 'approximately-equal';
  minRatio?: number;
  minDelta?: number;
  tolerance?: number;
}

export interface FemScenarioSuiteValidation {
  schemaVersion: 'fem-scenario-suite-validation.v1';
  status: 'accepted' | 'blocked';
  scenarioCount: number;
  blockerCodes: string[];
  warnings: string[];
  scenarios: FemScenarioValidation[];
}

function metricValue(manifest: FemResultManifest, metric: FemScenarioMetric): number | undefined {
  const value = manifest.envelope[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pushRangeBlockers(
  blockers: string[],
  manifest: FemResultManifest,
  scenarioId: string,
  expectation: FemScenarioRangeExpectation,
): void {
  const value = metricValue(manifest, expectation.metric);
  const required = expectation.required !== false;
  const prefix = `${scenarioId}.${String(expectation.metric)}`;
  if (value == null) {
    if (required) blockers.push(`${prefix}.missing`);
    return;
  }
  if (expectation.min != null && value < expectation.min) {
    blockers.push(`${prefix}.below-min`);
  }
  if (expectation.max != null && value > expectation.max) {
    blockers.push(`${prefix}.above-max`);
  }
  if (expectation.equals != null) {
    const tolerance = expectation.tolerance ?? 1e-6;
    if (Math.abs(value - expectation.equals) > tolerance) {
      blockers.push(`${prefix}.not-equal`);
    }
  }
}

export function validateFemScenarioResult(
  manifest: FemResultManifest,
  expectation: FemScenarioExpectation,
): FemScenarioValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const resultValidation = validateFemResultManifest(manifest);
  const scenarioId = expectation.scenarioId;

  if (resultValidation.status === 'blocked') {
    blockers.push(...resultValidation.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => `${scenarioId}.result.${finding.code}`));
  }
  if (manifest.analysisCase.objective !== expectation.objective) {
    blockers.push(`${scenarioId}.objective-mismatch`);
  }
  if (manifest.backend.id !== expectation.backendId) {
    blockers.push(`${scenarioId}.backend-mismatch`);
  }
  if (expectation.validationStatus && resultValidation.status !== expectation.validationStatus) {
    blockers.push(`${scenarioId}.validation-status-mismatch`);
  }

  for (const rangeExpectation of expectation.envelope) {
    pushRangeBlockers(blockers, manifest, scenarioId, rangeExpectation);
  }

  const fieldIds = new Set((manifest.resultFields ?? []).map((field) => field.id));
  for (const fieldId of expectation.requiredResultFields ?? []) {
    if (!fieldIds.has(fieldId)) {
      blockers.push(`${scenarioId}.result-field.${fieldId}.missing`);
    }
  }

  const findingCodes = new Set(resultValidation.findings.map((finding) => finding.code));
  for (const code of expectation.requiredReviewCodes ?? []) {
    if (!findingCodes.has(code)) {
      blockers.push(`${scenarioId}.review-code.${code}.missing`);
    }
  }
  if (resultValidation.status === 'ready') {
    warnings.push(`${scenarioId}.no-review-gates`);
  }

  return {
    schemaVersion: 'fem-scenario-validation.v1',
    scenarioId,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockerCodes: [...new Set(blockers)],
    warnings,
  };
}

function pushTrendBlockers(
  blockers: string[],
  runsById: Map<string, FemScenarioRun>,
  trend: FemScenarioTrendExpectation,
): void {
  const from = runsById.get(trend.fromScenarioId);
  const to = runsById.get(trend.toScenarioId);
  if (!from || !to) {
    blockers.push(`${trend.id}.scenario-missing`);
    return;
  }
  const fromValue = metricValue(from.manifest, trend.metric);
  const toValue = metricValue(to.manifest, trend.metric);
  if (fromValue == null || toValue == null) {
    blockers.push(`${trend.id}.metric-missing`);
    return;
  }

  const tolerance = trend.tolerance ?? 1e-6;
  const delta = toValue - fromValue;
  if (trend.relation === 'increase') {
    if (delta <= (trend.minDelta ?? 0)) {
      blockers.push(`${trend.id}.not-increased`);
    }
    if (trend.minRatio != null && (fromValue <= 0 || toValue / fromValue < trend.minRatio)) {
      blockers.push(`${trend.id}.ratio-too-small`);
    }
  } else if (trend.relation === 'decrease') {
    if (-delta <= (trend.minDelta ?? 0)) {
      blockers.push(`${trend.id}.not-decreased`);
    }
    if (trend.minRatio != null && (toValue <= 0 || fromValue / toValue < trend.minRatio)) {
      blockers.push(`${trend.id}.ratio-too-small`);
    }
  } else if (Math.abs(delta) > tolerance) {
    blockers.push(`${trend.id}.not-approximately-equal`);
  }
}

export function validateFemScenarioSuite(
  runs: FemScenarioRun[],
  trends: FemScenarioTrendExpectation[] = [],
): FemScenarioSuiteValidation {
  const scenarioValidations = runs.map((run) => validateFemScenarioResult(run.manifest, run.expectation));
  const blockers = scenarioValidations.flatMap((validation) => validation.blockerCodes);
  const warnings = scenarioValidations.flatMap((validation) => validation.warnings);
  const runsById = new Map(runs.map((run) => [run.scenarioId, run]));

  for (const trend of trends) {
    pushTrendBlockers(blockers, runsById, trend);
  }

  return {
    schemaVersion: 'fem-scenario-suite-validation.v1',
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    scenarioCount: runs.length,
    blockerCodes: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    scenarios: scenarioValidations,
  };
}

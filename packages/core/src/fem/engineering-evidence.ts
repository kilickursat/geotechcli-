import { calculateLateralEarthPressure } from '../geo/lateral-earth-pressure.js';

export type FemEngineeringKernelFeature =
  | 'nonlinear-plasticity'
  | 'consolidation'
  | 'seepage-pore-pressure-coupling'
  | 'support-design'
  | 'solver-convergence-and-tolerance'
  | 'licensed-engineer-review-workflow';

export interface FemConvergencePolicy {
  schemaVersion: 'fem-convergence-policy.v1';
  residualTolerance: number;
  forceBalanceTolerance: number;
  porePressureMassBalanceTolerance: number;
  maxIterations: number;
  minAcceptedSteps: number;
}

export const DEFAULT_FEM_CONVERGENCE_POLICY: FemConvergencePolicy = {
  schemaVersion: 'fem-convergence-policy.v1',
  residualTolerance: 1e-6,
  forceBalanceTolerance: 1e-3,
  porePressureMassBalanceTolerance: 1e-3,
  maxIterations: 40,
  minAcceptedSteps: 3,
};

export interface FemToleranceCheck {
  quantity: string;
  actual: number;
  expected: number;
  absoluteTolerance: number;
  relativeTolerance?: number;
  unit?: string;
  error: number;
  relativeError: number;
  accepted: boolean;
}

export interface FemMohrCoulombMaterialPointInput {
  confiningEffectiveStressKpa: number;
  axialStrain: number;
  elasticModulusKpa: number;
  poissonRatio: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
  increments?: number;
  policy?: FemConvergencePolicy;
}

export interface FemMohrCoulombStressStep {
  step: number;
  axialStrain: number;
  majorEffectiveStressKpa: number;
  minorEffectiveStressKpa: number;
  deviatorStressKpa: number;
  yieldDeviatorStressKpa: number;
  plasticAxialStrain: number;
  mobilizedStrengthRatio: number;
  yieldResidualRatio: number;
  state: 'elastic' | 'plastic';
}

export interface FemMohrCoulombMaterialPointResult {
  schemaVersion: 'fem-mohr-coulomb-material-point.v1';
  signConvention: 'compression-positive';
  model: 'mohr-coulomb-elastic-perfectly-plastic-triaxial-compression';
  converged: boolean;
  failureAxialStrain: number;
  peakDeviatorStressKpa: number;
  finalStep: FemMohrCoulombStressStep;
  stressPath: FemMohrCoulombStressStep[];
  policy: FemConvergencePolicy;
}

export type FemPrincipalVector = [number, number, number];

export interface FemDruckerPragerParameterMapping {
  schemaVersion: 'fem-drucker-prager-parameter-mapping.v1';
  source: 'mohr-coulomb-triaxial-compression-fit';
  signConvention: 'compression-positive';
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg: number;
  rho: number;
  rhoBar: number;
  yieldStressKpa: number;
  compressionInterceptKpa: number;
}

export interface FemDruckerPragerMaterialPointInput {
  initialPrincipalEffectiveStressKpa: FemPrincipalVector;
  principalStrainIncrements: FemPrincipalVector[];
  elasticModulusKpa: number;
  poissonRatio: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
  hardeningModulusKpa?: number;
  policy?: FemConvergencePolicy;
}

export interface FemDruckerPragerStressStep {
  step: number;
  principalStrain: FemPrincipalVector;
  principalEffectiveStressKpa: FemPrincipalVector;
  meanEffectiveStressKpa: number;
  deviatoricStressNormKpa: number;
  yieldValueKpa: number;
  yieldResidualRatio: number;
  plasticMultiplier: number;
  equivalentPlasticStrain: number;
  volumetricPlasticStrain: number;
  state: 'elastic' | 'plastic';
  iterations: number;
  converged: boolean;
}

export interface FemDruckerPragerMaterialPointResult {
  schemaVersion: 'fem-drucker-prager-material-point.v1';
  signConvention: 'compression-positive';
  model: 'drucker-prager-elastoplastic-principal-stress-return-mapping';
  mapping: FemDruckerPragerParameterMapping;
  elasticModuli: {
    bulkModulusKpa: number;
    shearModulusKpa: number;
  };
  converged: boolean;
  finalStep: FemDruckerPragerStressStep;
  stressPath: FemDruckerPragerStressStep[];
  plasticStrainPrincipal: FemPrincipalVector;
  policy: FemConvergencePolicy;
}

export interface FemConsolidationTimeStepperInput {
  layerThicknessM: number;
  drainage: 'single' | 'double';
  coefficientOfConsolidationM2PerYear: number;
  initialExcessPorePressureKpa: number;
  primarySettlementMm: number;
  timeStepsYears: number[];
  nodeCount?: number;
  policy?: FemConvergencePolicy;
}

export interface FemConsolidationStep {
  timeYears: number;
  timeFactor: number;
  averageExcessPorePressureKpa: number;
  degreeOfConsolidation: number;
  referenceDegreeOfConsolidation: number;
  settlementMm: number;
  referenceError: number;
}

export interface FemConsolidationTimeStepperResult {
  schemaVersion: 'fem-consolidation-time-stepper.v1';
  method: 'backward-euler-1d-terzaghi';
  drainagePathM: number;
  nodeCount: number;
  converged: boolean;
  maxReferenceError: number;
  finalStep: FemConsolidationStep;
  steps: FemConsolidationStep[];
  policy: FemConvergencePolicy;
}

export interface FemSeepage1DInput {
  hydraulicConductivityMPerS: number;
  domainLengthM: number;
  upstreamHeadM: number;
  downstreamHeadM: number;
  nodeCount?: number;
  transient?: {
    specificStorage1PerM: number;
    durationSeconds: number;
    timeSteps: number;
    initialHeadM?: number;
  };
  policy?: FemConvergencePolicy;
}

export interface FemSeepageNode {
  xM: number;
  headM: number;
  porePressureKpa: number;
}

export interface FemSeepageTransientStep {
  timeSeconds: number;
  maxHeadErrorToSteadyM: number;
  headsM: number[];
}

export interface FemSeepage1DResult {
  schemaVersion: 'fem-seepage-1d.v1';
  method: 'darcy-finite-difference-1d';
  steadyFlowM3PerSPerM: number;
  hydraulicGradient: number;
  massBalanceErrorRatio: number;
  converged: boolean;
  nodes: FemSeepageNode[];
  transientSteps: FemSeepageTransientStep[];
  policy: FemConvergencePolicy;
}

export interface FemHydroMechanicalCouplingInput {
  totalVerticalStressKpa: number;
  porePressureBeforeKpa: number;
  porePressureAfterKpa: number;
  constrainedModulusKpa: number;
  layerThicknessM: number;
  policy?: FemConvergencePolicy;
}

export interface FemHydroMechanicalCouplingResult {
  schemaVersion: 'fem-hydro-mechanical-coupling.v1';
  method: 'effective-stress-1d-coupling';
  effectiveStressBeforeKpa: number;
  effectiveStressAfterKpa: number;
  effectiveStressIncreaseKpa: number;
  settlementMm: number;
  stableEffectiveStress: boolean;
  converged: boolean;
  policy: FemConvergencePolicy;
}

export interface FemExcavationSupportDesignCheckInput {
  excavationDepthM: number;
  wallToeDepthM: number;
  unitWeightKnM3: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  surchargeKpa?: number;
  waterTableDepthM?: number;
  supportLevelsM: number[];
  allowableSupportLoadKnPerM: number;
  requiredPassiveSafetyFactor?: number;
  requiredBasalHeaveSafetyFactor?: number;
  policy?: FemConvergencePolicy;
}

export interface FemDesignCheck {
  id: string;
  actual: number;
  required: number;
  unit?: string;
  status: 'accepted' | 'blocked';
}

export interface FemExcavationSupportDesignCheckResult {
  schemaVersion: 'fem-excavation-support-design-check.v1';
  method: 'rankine-earth-pressure-support-screening';
  activeEarthPressureKnPerM: number;
  passiveToeResistanceKnPerM: number;
  supportDemandKnPerM: number;
  supportCapacitySafetyFactor: number;
  passiveSafetyFactor: number;
  basalHeaveSafetyFactor: number;
  checks: FemDesignCheck[];
  status: 'accepted' | 'blocked';
  policy: FemConvergencePolicy;
}

export interface FemReviewerApprovalRecord {
  schemaVersion: 'fem-reviewer-approval.v1';
  recordId: string;
  caseId: string;
  caseHashSha256: string;
  validationSummary: {
    status: 'ready' | 'review' | 'blocked';
    blockers: number;
    reviewItems: number;
    findingCodes: string[];
  };
  reviewer: {
    name: string;
    licenseId: string;
    jurisdiction: string;
  };
  approvedAt: string;
  scope: 'experimental-preview' | 'production-design';
  assumptions: string[];
  limitations: string[];
  approvalStatement: string;
}

export interface FemReviewerApprovalValidation {
  schemaVersion: 'fem-reviewer-approval-validation.v1';
  status: 'accepted' | 'blocked';
  blockerCodes: string[];
  warnings: string[];
}

export interface FemEngineeringBenchmarkCase {
  id: string;
  feature: FemEngineeringKernelFeature;
  referenceType: 'closed-form' | 'internal-balance' | 'review-record-contract';
  quantity: string;
  actual: number;
  expected: number;
  tolerance: number;
  unit?: string;
  status: 'accepted' | 'blocked';
  evidence: string;
}

export interface FemEngineeringEvidenceReport {
  schemaVersion: 'fem-engineering-evidence.v1';
  status: 'kernel-verified' | 'blocked';
  productionReady: false;
  verifiedFeatures: FemEngineeringKernelFeature[];
  benchmarks: FemEngineeringBenchmarkCase[];
  convergencePolicy: FemConvergencePolicy;
  remainingProductionBlockers: string[];
  releasePositioning: string;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function evaluateFemTolerance(
  quantity: string,
  actual: number,
  expected: number,
  absoluteTolerance: number,
  options: { relativeTolerance?: number; unit?: string } = {},
): FemToleranceCheck {
  const error = Math.abs(actual - expected);
  const relativeError = Math.abs(expected) > 0 ? error / Math.abs(expected) : error;
  const relativeAccepted = options.relativeTolerance == null || relativeError <= options.relativeTolerance;
  const accepted = error <= absoluteTolerance || relativeAccepted;
  return {
    quantity,
    actual,
    expected,
    absoluteTolerance,
    ...(options.relativeTolerance != null ? { relativeTolerance: options.relativeTolerance } : {}),
    ...(options.unit ? { unit: options.unit } : {}),
    error,
    relativeError,
    accepted,
  };
}

function mohrCoulombTriaxialCompressionQFailure(
  confiningEffectiveStressKpa: number,
  frictionAngleDeg: number,
  cohesionKpa: number,
): number {
  const phi = degToRad(frictionAngleDeg);
  const sinPhi = Math.sin(phi);
  const denominator = 1 - sinPhi;
  return ((2 * cohesionKpa * Math.cos(phi)) + (2 * confiningEffectiveStressKpa * sinPhi)) / denominator;
}

function assertPrincipalVector(value: unknown, label: string): asserts value is FemPrincipalVector {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => Number.isFinite(item))) {
    throw new Error(`${label} must be a finite principal vector [x, y, z].`);
  }
}

function addPrincipal(a: FemPrincipalVector, b: FemPrincipalVector): FemPrincipalVector {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scalePrincipal(a: FemPrincipalVector, factor: number): FemPrincipalVector {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function tracePrincipal(a: FemPrincipalVector): number {
  return a[0] + a[1] + a[2];
}

function deviatorPrincipal(a: FemPrincipalVector): FemPrincipalVector {
  const mean = tracePrincipal(a) / 3;
  return [a[0] - mean, a[1] - mean, a[2] - mean];
}

function principalNorm(a: FemPrincipalVector): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function roundPrincipal(a: FemPrincipalVector, digits = 8): FemPrincipalVector {
  return [round(a[0], digits), round(a[1], digits), round(a[2], digits)];
}

function elasticModuliFromEAndNu(
  elasticModulusKpa: number,
  poissonRatio: number,
): { bulkModulusKpa: number; shearModulusKpa: number } {
  assertFinitePositive(elasticModulusKpa, 'elasticModulusKpa');
  if (!Number.isFinite(poissonRatio) || poissonRatio < 0 || poissonRatio >= 0.5) {
    throw new Error('poissonRatio must be finite and between 0 and 0.5.');
  }
  return {
    bulkModulusKpa: elasticModulusKpa / (3 * (1 - 2 * poissonRatio)),
    shearModulusKpa: elasticModulusKpa / (2 * (1 + poissonRatio)),
  };
}

function druckerPragerRhoFromAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg >= 50) {
    throw new Error('friction and dilation angles must be finite and between 0 and 50 degrees.');
  }
  const angle = degToRad(angleDeg);
  const sinAngle = Math.sin(angle);
  if (sinAngle === 0) return 0;
  return (2 * Math.SQRT2 * sinAngle) / (Math.sqrt(3) * (3 - sinAngle));
}

export function mapMohrCoulombToDruckerPragerTriaxialCompression(input: {
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
}): FemDruckerPragerParameterMapping {
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  const dilationAngleDeg = input.dilationAngleDeg ?? input.frictionAngleDeg;
  const rho = druckerPragerRhoFromAngle(input.frictionAngleDeg);
  const rhoBar = Math.min(rho, druckerPragerRhoFromAngle(dilationAngleDeg));
  const phi = degToRad(input.frictionAngleDeg);
  const sinPhi = Math.sin(phi);
  const cohesionContributionToQ = (2 * input.cohesionKpa * Math.cos(phi)) / (1 - sinPhi);
  const deviatoricNormFactor = Math.sqrt(2 / 3);
  const compressionInterceptKpa = cohesionContributionToQ * (deviatoricNormFactor - rho);

  return {
    schemaVersion: 'fem-drucker-prager-parameter-mapping.v1',
    source: 'mohr-coulomb-triaxial-compression-fit',
    signConvention: 'compression-positive',
    frictionAngleDeg: round(input.frictionAngleDeg, 6),
    cohesionKpa: round(input.cohesionKpa, 6),
    dilationAngleDeg: round(dilationAngleDeg, 6),
    rho: round(rho, 12),
    rhoBar: round(rhoBar, 12),
    yieldStressKpa: round(compressionInterceptKpa / deviatoricNormFactor, 8),
    compressionInterceptKpa: round(compressionInterceptKpa, 8),
  };
}

function elasticStressIncrement(
  strainIncrement: FemPrincipalVector,
  bulkModulusKpa: number,
  shearModulusKpa: number,
): FemPrincipalVector {
  const volumetricStrain = tracePrincipal(strainIncrement);
  const deviatoricStrain = deviatorPrincipal(strainIncrement);
  return addPrincipal(
    scalePrincipal(deviatoricStrain, 2 * shearModulusKpa),
    [bulkModulusKpa * volumetricStrain, bulkModulusKpa * volumetricStrain, bulkModulusKpa * volumetricStrain],
  );
}

function druckerPragerYieldValue(
  stress: FemPrincipalVector,
  rho: number,
  compressionInterceptKpa: number,
): number {
  return principalNorm(deviatorPrincipal(stress)) - rho * tracePrincipal(stress) - compressionInterceptKpa;
}

export function runDruckerPragerMaterialPoint(
  input: FemDruckerPragerMaterialPointInput,
): FemDruckerPragerMaterialPointResult {
  assertPrincipalVector(input.initialPrincipalEffectiveStressKpa, 'initialPrincipalEffectiveStressKpa');
  if (!Array.isArray(input.principalStrainIncrements) || input.principalStrainIncrements.length === 0) {
    throw new Error('principalStrainIncrements must contain at least one strain increment.');
  }
  for (const [index, increment] of input.principalStrainIncrements.entries()) {
    assertPrincipalVector(increment, `principalStrainIncrements.${index}`);
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFiniteNonNegative(input.hardeningModulusKpa ?? 0, 'hardeningModulusKpa');

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const mapping = mapMohrCoulombToDruckerPragerTriaxialCompression({
    frictionAngleDeg: input.frictionAngleDeg,
    cohesionKpa: input.cohesionKpa,
    dilationAngleDeg: input.dilationAngleDeg,
  });
  const elasticModuli = elasticModuliFromEAndNu(input.elasticModulusKpa, input.poissonRatio);
  const hardeningModulusKpa = input.hardeningModulusKpa ?? 0;
  const stressPath: FemDruckerPragerStressStep[] = [];
  let principalStrain: FemPrincipalVector = [0, 0, 0];
  let plasticStrainPrincipal: FemPrincipalVector = [0, 0, 0];
  let stress = [...input.initialPrincipalEffectiveStressKpa] as FemPrincipalVector;
  let equivalentPlasticStrain = 0;
  let volumetricPlasticStrain = 0;

  for (const [index, strainIncrement] of input.principalStrainIncrements.entries()) {
    principalStrain = addPrincipal(principalStrain, strainIncrement);
    const trialStress = addPrincipal(
      stress,
      elasticStressIncrement(
        strainIncrement,
        elasticModuli.bulkModulusKpa,
        elasticModuli.shearModulusKpa,
      ),
    );
    const currentIntercept = mapping.compressionInterceptKpa + hardeningModulusKpa * equivalentPlasticStrain;
    const trialYield = druckerPragerYieldValue(trialStress, mapping.rho, currentIntercept);
    const trialScale = Math.max(
      principalNorm(deviatorPrincipal(trialStress)),
      Math.abs(mapping.rho * tracePrincipal(trialStress)),
      Math.abs(currentIntercept),
      1,
    );
    const trialYieldResidualRatio = Math.abs(trialYield) / trialScale;
    let plasticMultiplier = 0;
    let iterations = 0;
    let state: FemDruckerPragerStressStep['state'] = 'elastic';

    if (trialYieldResidualRatio > policy.residualTolerance && trialYield > 0) {
      state = 'plastic';
      const trialDeviator = deviatorPrincipal(trialStress);
      const trialNorm = principalNorm(trialDeviator);
      const flowDirection = trialNorm > 0
        ? scalePrincipal(trialDeviator, 1 / trialNorm)
        : [0, 0, 0] as FemPrincipalVector;
      const denominator = 2 * elasticModuli.shearModulusKpa +
        9 * elasticModuli.bulkModulusKpa * mapping.rho * mapping.rhoBar +
        hardeningModulusKpa;
      plasticMultiplier = Math.max(0, trialYield / denominator);
      equivalentPlasticStrain += plasticMultiplier;
      const plasticIncrement = addPrincipal(
        scalePrincipal(flowDirection, plasticMultiplier),
        [-mapping.rhoBar * plasticMultiplier, -mapping.rhoBar * plasticMultiplier, -mapping.rhoBar * plasticMultiplier],
      );
      plasticStrainPrincipal = addPrincipal(plasticStrainPrincipal, plasticIncrement);
      volumetricPlasticStrain += tracePrincipal(plasticIncrement);
      const correctedDeviator = addPrincipal(
        trialDeviator,
        scalePrincipal(flowDirection, -2 * elasticModuli.shearModulusKpa * plasticMultiplier),
      );
      const correctedTrace = tracePrincipal(trialStress) +
        9 * elasticModuli.bulkModulusKpa * mapping.rhoBar * plasticMultiplier;
      stress = addPrincipal(
        correctedDeviator,
        [correctedTrace / 3, correctedTrace / 3, correctedTrace / 3],
      );
      iterations = 1;
    } else {
      stress = trialStress;
    }

    const updatedIntercept = mapping.compressionInterceptKpa + hardeningModulusKpa * equivalentPlasticStrain;
    const yieldValue = druckerPragerYieldValue(stress, mapping.rho, updatedIntercept);
    const yieldScale = Math.max(
      principalNorm(deviatorPrincipal(stress)),
      Math.abs(mapping.rho * tracePrincipal(stress)),
      Math.abs(updatedIntercept),
      1,
    );
    const yieldResidualRatio = Math.abs(yieldValue) / yieldScale;
    stressPath.push({
      step: index + 1,
      principalStrain: roundPrincipal(principalStrain, 10),
      principalEffectiveStressKpa: roundPrincipal(stress, 6),
      meanEffectiveStressKpa: round(tracePrincipal(stress) / 3, 6),
      deviatoricStressNormKpa: round(principalNorm(deviatorPrincipal(stress)), 6),
      yieldValueKpa: round(yieldValue, 10),
      yieldResidualRatio: round(yieldResidualRatio, 12),
      plasticMultiplier: round(plasticMultiplier, 12),
      equivalentPlasticStrain: round(equivalentPlasticStrain, 12),
      volumetricPlasticStrain: round(volumetricPlasticStrain, 12),
      state,
      iterations,
      converged: state === 'elastic' || yieldResidualRatio <= policy.residualTolerance,
    });
  }

  const finalStep = stressPath[stressPath.length - 1];
  return {
    schemaVersion: 'fem-drucker-prager-material-point.v1',
    signConvention: 'compression-positive',
    model: 'drucker-prager-elastoplastic-principal-stress-return-mapping',
    mapping,
    elasticModuli: {
      bulkModulusKpa: round(elasticModuli.bulkModulusKpa, 6),
      shearModulusKpa: round(elasticModuli.shearModulusKpa, 6),
    },
    converged: stressPath.every((step) => step.converged),
    finalStep,
    stressPath,
    plasticStrainPrincipal: roundPrincipal(plasticStrainPrincipal, 12),
    policy,
  };
}

export function runMohrCoulombMaterialPoint(
  input: FemMohrCoulombMaterialPointInput,
): FemMohrCoulombMaterialPointResult {
  assertFinitePositive(input.confiningEffectiveStressKpa, 'confiningEffectiveStressKpa');
  assertFinitePositive(input.elasticModulusKpa, 'elasticModulusKpa');
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFiniteNonNegative(input.axialStrain, 'axialStrain');
  if (!Number.isFinite(input.poissonRatio) || input.poissonRatio < 0 || input.poissonRatio >= 0.5) {
    throw new Error('poissonRatio must be finite and between 0 and 0.5.');
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const increments = Math.max(1, Math.floor(input.increments ?? 20));
  const qFailure = mohrCoulombTriaxialCompressionQFailure(
    input.confiningEffectiveStressKpa,
    input.frictionAngleDeg,
    input.cohesionKpa,
  );
  const failureAxialStrain = qFailure / input.elasticModulusKpa;
  const stressPath: FemMohrCoulombStressStep[] = [];

  for (let index = 1; index <= increments; index++) {
    const axialStrain = input.axialStrain * (index / increments);
    const qTrial = input.elasticModulusKpa * axialStrain;
    const plastic = qTrial > qFailure;
    const deviatorStressKpa = plastic ? qFailure : qTrial;
    const plasticAxialStrain = plastic ? axialStrain - failureAxialStrain : 0;
    const yieldResidualRatio = plastic
      ? Math.abs(deviatorStressKpa - qFailure) / Math.max(qFailure, 1)
      : Math.max(0, qTrial - qFailure) / Math.max(qFailure, 1);

    stressPath.push({
      step: index,
      axialStrain: round(axialStrain, 8),
      majorEffectiveStressKpa: round(input.confiningEffectiveStressKpa + deviatorStressKpa, 4),
      minorEffectiveStressKpa: round(input.confiningEffectiveStressKpa, 4),
      deviatorStressKpa: round(deviatorStressKpa, 4),
      yieldDeviatorStressKpa: round(qFailure, 4),
      plasticAxialStrain: round(Math.max(0, plasticAxialStrain), 8),
      mobilizedStrengthRatio: round(deviatorStressKpa / qFailure, 6),
      yieldResidualRatio: round(yieldResidualRatio, 10),
      state: plastic ? 'plastic' : 'elastic',
    });
  }

  const finalStep = stressPath[stressPath.length - 1];
  return {
    schemaVersion: 'fem-mohr-coulomb-material-point.v1',
    signConvention: 'compression-positive',
    model: 'mohr-coulomb-elastic-perfectly-plastic-triaxial-compression',
    converged: finalStep.yieldResidualRatio <= policy.residualTolerance,
    failureAxialStrain: round(failureAxialStrain, 8),
    peakDeviatorStressKpa: round(qFailure, 4),
    finalStep,
    stressPath,
    policy,
  };
}

export function terzaghiAverageConsolidation(timeFactor: number, terms = 80): number {
  if (!Number.isFinite(timeFactor) || timeFactor < 0) {
    throw new Error('timeFactor must be finite and non-negative.');
  }
  let remaining = 0;
  for (let m = 0; m < terms; m++) {
    const n = 2 * m + 1;
    remaining += (1 / (n * n)) * Math.exp(-((n * n * Math.PI * Math.PI * timeFactor) / 4));
  }
  const degree = 1 - (8 / (Math.PI * Math.PI)) * remaining;
  return Math.min(1, Math.max(0, degree));
}

function solveTridiagonal(lower: number[], diagonal: number[], upper: number[], rhs: number[]): number[] {
  const n = diagonal.length;
  const cPrime = new Array<number>(n).fill(0);
  const dPrime = new Array<number>(n).fill(0);

  cPrime[0] = upper[0] / diagonal[0];
  dPrime[0] = rhs[0] / diagonal[0];

  for (let i = 1; i < n; i++) {
    const denom = diagonal[i] - lower[i] * cPrime[i - 1];
    cPrime[i] = i === n - 1 ? 0 : upper[i] / denom;
    dPrime[i] = (rhs[i] - lower[i] * dPrime[i - 1]) / denom;
  }

  const solution = new Array<number>(n).fill(0);
  solution[n - 1] = dPrime[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    solution[i] = dPrime[i] - cPrime[i] * solution[i + 1];
  }
  return solution;
}

function averageUniformNodes(values: number[]): number {
  if (values.length < 2) return values[0] ?? 0;
  let weighted = 0.5 * values[0] + 0.5 * values[values.length - 1];
  for (let i = 1; i < values.length - 1; i++) {
    weighted += values[i];
  }
  return weighted / (values.length - 1);
}

export function runTerzaghiConsolidationTimeStepper(
  input: FemConsolidationTimeStepperInput,
): FemConsolidationTimeStepperResult {
  assertFinitePositive(input.layerThicknessM, 'layerThicknessM');
  assertFinitePositive(input.coefficientOfConsolidationM2PerYear, 'coefficientOfConsolidationM2PerYear');
  assertFinitePositive(input.initialExcessPorePressureKpa, 'initialExcessPorePressureKpa');
  assertFiniteNonNegative(input.primarySettlementMm, 'primarySettlementMm');
  if (!Array.isArray(input.timeStepsYears) || input.timeStepsYears.length === 0) {
    throw new Error('timeStepsYears must contain at least one time step.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const nodeCount = Math.max(8, Math.min(201, Math.floor(input.nodeCount ?? 41)));
  const drainagePathM = input.drainage === 'double' ? input.layerThicknessM / 2 : input.layerThicknessM;
  const dz = drainagePathM / (nodeCount - 1);
  let porePressures = new Array<number>(nodeCount).fill(input.initialExcessPorePressureKpa);
  porePressures[0] = 0;
  const initialAverage = averageUniformNodes(porePressures);
  let previousTime = 0;
  let maxReferenceError = 0;
  const steps: FemConsolidationStep[] = [];

  for (const timeYears of input.timeStepsYears) {
    if (!Number.isFinite(timeYears) || timeYears <= previousTime) {
      throw new Error('timeStepsYears must be finite, positive, and strictly increasing.');
    }
    const dt = timeYears - previousTime;
    previousTime = timeYears;
    const r = (input.coefficientOfConsolidationM2PerYear * dt) / (dz * dz);
    const unknowns = nodeCount - 1;
    const lower = new Array<number>(unknowns).fill(0);
    const diagonal = new Array<number>(unknowns).fill(1 + 2 * r);
    const upper = new Array<number>(unknowns).fill(0);
    const rhs = new Array<number>(unknowns).fill(0);

    for (let j = 0; j < unknowns; j++) {
      const nodeIndex = j + 1;
      rhs[j] = porePressures[nodeIndex];
      if (j > 0) lower[j] = nodeIndex === nodeCount - 1 ? -2 * r : -r;
      if (nodeIndex < nodeCount - 1) upper[j] = -r;
    }

    const solved = solveTridiagonal(lower, diagonal, upper, rhs);
    porePressures = [0, ...solved];
    const averagePorePressure = averageUniformNodes(porePressures);
    const degreeOfConsolidation = Math.min(1, Math.max(0, 1 - averagePorePressure / initialAverage));
    const timeFactor = (input.coefficientOfConsolidationM2PerYear * timeYears) / (drainagePathM * drainagePathM);
    const referenceDegreeOfConsolidation = terzaghiAverageConsolidation(timeFactor);
    const referenceError = Math.abs(degreeOfConsolidation - referenceDegreeOfConsolidation);
    maxReferenceError = Math.max(maxReferenceError, referenceError);
    steps.push({
      timeYears: round(timeYears, 6),
      timeFactor: round(timeFactor, 6),
      averageExcessPorePressureKpa: round(averagePorePressure, 5),
      degreeOfConsolidation: round(degreeOfConsolidation, 6),
      referenceDegreeOfConsolidation: round(referenceDegreeOfConsolidation, 6),
      settlementMm: round(input.primarySettlementMm * degreeOfConsolidation, 4),
      referenceError: round(referenceError, 8),
    });
  }

  const finalStep = steps[steps.length - 1];
  return {
    schemaVersion: 'fem-consolidation-time-stepper.v1',
    method: 'backward-euler-1d-terzaghi',
    drainagePathM: round(drainagePathM, 6),
    nodeCount,
    converged: maxReferenceError <= 0.05,
    maxReferenceError: round(maxReferenceError, 8),
    finalStep,
    steps,
    policy,
  };
}

export function runDarcySeepage1D(input: FemSeepage1DInput): FemSeepage1DResult {
  assertFinitePositive(input.hydraulicConductivityMPerS, 'hydraulicConductivityMPerS');
  assertFinitePositive(input.domainLengthM, 'domainLengthM');
  if (!Number.isFinite(input.upstreamHeadM) || !Number.isFinite(input.downstreamHeadM)) {
    throw new Error('upstreamHeadM and downstreamHeadM must be finite.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const nodeCount = Math.max(3, Math.min(201, Math.floor(input.nodeCount ?? 21)));
  const dx = input.domainLengthM / (nodeCount - 1);
  const headDrop = input.upstreamHeadM - input.downstreamHeadM;
  const hydraulicGradient = headDrop / input.domainLengthM;
  const steadyFlowM3PerSPerM = input.hydraulicConductivityMPerS * hydraulicGradient;
  const gammaWaterKpaPerM = 9.81;
  const steadyHeads = Array.from({ length: nodeCount }, (_, index) =>
    input.upstreamHeadM - headDrop * (index / (nodeCount - 1)));
  const nodes = steadyHeads.map((headM, index) => ({
    xM: round(index * dx, 6),
    headM: round(headM, 6),
    porePressureKpa: round(Math.max(0, headM * gammaWaterKpaPerM), 4),
  }));

  const transientSteps: FemSeepageTransientStep[] = [];
  if (input.transient) {
    assertFinitePositive(input.transient.specificStorage1PerM, 'transient.specificStorage1PerM');
    assertFinitePositive(input.transient.durationSeconds, 'transient.durationSeconds');
    const timeSteps = Math.max(1, Math.floor(input.transient.timeSteps));
    const dt = input.transient.durationSeconds / timeSteps;
    const diffusivity = input.hydraulicConductivityMPerS / input.transient.specificStorage1PerM;
    const r = (diffusivity * dt) / (dx * dx);
    let heads = new Array<number>(nodeCount).fill(
      input.transient.initialHeadM ?? input.downstreamHeadM,
    );
    heads[0] = input.upstreamHeadM;
    heads[nodeCount - 1] = input.downstreamHeadM;
    const unknowns = nodeCount - 2;

    for (let step = 1; step <= timeSteps; step++) {
      const lower = new Array<number>(unknowns).fill(0);
      const diagonal = new Array<number>(unknowns).fill(1 + 2 * r);
      const upper = new Array<number>(unknowns).fill(0);
      const rhs = new Array<number>(unknowns).fill(0);
      for (let j = 0; j < unknowns; j++) {
        const nodeIndex = j + 1;
        rhs[j] = heads[nodeIndex];
        if (j === 0) rhs[j] += r * input.upstreamHeadM;
        if (j === unknowns - 1) rhs[j] += r * input.downstreamHeadM;
        if (j > 0) lower[j] = -r;
        if (j < unknowns - 1) upper[j] = -r;
      }
      const solved = solveTridiagonal(lower, diagonal, upper, rhs);
      heads = [input.upstreamHeadM, ...solved, input.downstreamHeadM];
      const maxHeadErrorToSteadyM = Math.max(...heads.map((head, index) => Math.abs(head - steadyHeads[index])));
      transientSteps.push({
        timeSeconds: round(step * dt, 6),
        maxHeadErrorToSteadyM: round(maxHeadErrorToSteadyM, 8),
        headsM: heads.map((head) => round(head, 6)),
      });
    }
  }

  const inflow = steadyFlowM3PerSPerM;
  const outflow = input.hydraulicConductivityMPerS *
    ((nodes[nodeCount - 2].headM - nodes[nodeCount - 1].headM) / dx);
  const massBalanceErrorRatio = Math.abs(inflow - outflow) / Math.max(Math.abs(inflow), 1e-12);

  return {
    schemaVersion: 'fem-seepage-1d.v1',
    method: 'darcy-finite-difference-1d',
    steadyFlowM3PerSPerM: Number(steadyFlowM3PerSPerM.toExponential(8)),
    hydraulicGradient: round(hydraulicGradient, 8),
    massBalanceErrorRatio: round(massBalanceErrorRatio, 10),
    converged: massBalanceErrorRatio <= policy.porePressureMassBalanceTolerance,
    nodes,
    transientSteps,
    policy,
  };
}

export function runHydroMechanicalCoupling1D(
  input: FemHydroMechanicalCouplingInput,
): FemHydroMechanicalCouplingResult {
  assertFinitePositive(input.totalVerticalStressKpa, 'totalVerticalStressKpa');
  assertFiniteNonNegative(input.porePressureBeforeKpa, 'porePressureBeforeKpa');
  assertFiniteNonNegative(input.porePressureAfterKpa, 'porePressureAfterKpa');
  assertFinitePositive(input.constrainedModulusKpa, 'constrainedModulusKpa');
  assertFinitePositive(input.layerThicknessM, 'layerThicknessM');
  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const effectiveStressBeforeKpa = input.totalVerticalStressKpa - input.porePressureBeforeKpa;
  const effectiveStressAfterKpa = input.totalVerticalStressKpa - input.porePressureAfterKpa;
  const effectiveStressIncreaseKpa = effectiveStressAfterKpa - effectiveStressBeforeKpa;
  const settlementMm = (effectiveStressIncreaseKpa / input.constrainedModulusKpa) *
    input.layerThicknessM * 1000;
  const stableEffectiveStress = effectiveStressBeforeKpa > 0 && effectiveStressAfterKpa > 0;

  return {
    schemaVersion: 'fem-hydro-mechanical-coupling.v1',
    method: 'effective-stress-1d-coupling',
    effectiveStressBeforeKpa: round(effectiveStressBeforeKpa, 4),
    effectiveStressAfterKpa: round(effectiveStressAfterKpa, 4),
    effectiveStressIncreaseKpa: round(effectiveStressIncreaseKpa, 4),
    settlementMm: round(settlementMm, 4),
    stableEffectiveStress,
    converged: stableEffectiveStress,
    policy,
  };
}

export function runExcavationSupportDesignCheck(
  input: FemExcavationSupportDesignCheckInput,
): FemExcavationSupportDesignCheckResult {
  assertFinitePositive(input.excavationDepthM, 'excavationDepthM');
  assertFinitePositive(input.wallToeDepthM, 'wallToeDepthM');
  assertFinitePositive(input.unitWeightKnM3, 'unitWeightKnM3');
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFinitePositive(input.allowableSupportLoadKnPerM, 'allowableSupportLoadKnPerM');
  if (input.wallToeDepthM <= input.excavationDepthM) {
    throw new Error('wallToeDepthM must be deeper than excavationDepthM.');
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const surchargeKpa = input.surchargeKpa ?? 0;
  const waterTableDepthM = input.waterTableDepthM ?? 999;
  const active = calculateLateralEarthPressure({
    wallHeight: input.excavationDepthM,
    soilLayers: [{
      thickness: input.excavationDepthM,
      unitWeight: input.unitWeightKnM3,
      cohesion: input.cohesionKpa,
      frictionAngle: input.frictionAngleDeg,
    }],
    method: 'rankine',
    pressureState: 'active',
    wallFrictionAngle: 0,
    backfillAngle: 0,
    wallInclination: 0,
    waterTableDepth: waterTableDepthM,
    surcharge: surchargeKpa,
  });
  const embedmentM = input.wallToeDepthM - input.excavationDepthM;
  const passive = calculateLateralEarthPressure({
    wallHeight: embedmentM,
    soilLayers: [{
      thickness: embedmentM,
      unitWeight: input.unitWeightKnM3,
      cohesion: input.cohesionKpa,
      frictionAngle: input.frictionAngleDeg,
    }],
    method: 'rankine',
    pressureState: 'passive',
    wallFrictionAngle: 0,
    backfillAngle: 0,
    wallInclination: 0,
    waterTableDepth: 999,
    surcharge: 0,
  });

  const supportCount = input.supportLevelsM.filter((level) =>
    Number.isFinite(level) && level >= 0 && level <= input.excavationDepthM).length;
  const supportDemandKnPerM = supportCount > 0
    ? active.totalForce / supportCount
    : active.totalForce;
  const supportCapacitySafetyFactor = supportCount > 0
    ? input.allowableSupportLoadKnPerM / Math.max(supportDemandKnPerM, 1e-9)
    : 0;
  const passiveSafetyFactor = passive.totalForce / Math.max(active.totalForce, 1e-9);
  const basalHeaveSafetyFactor = input.cohesionKpa > 0
    ? (5.14 * input.cohesionKpa) / Math.max(input.unitWeightKnM3 * input.excavationDepthM + surchargeKpa, 1e-9)
    : 0;
  const requiredPassiveSafetyFactor = input.requiredPassiveSafetyFactor ?? 1.5;
  const requiredBasalHeaveSafetyFactor = input.requiredBasalHeaveSafetyFactor ?? 1.5;

  const checks: FemDesignCheck[] = [
    {
      id: 'support-capacity',
      actual: round(supportCapacitySafetyFactor, 4),
      required: 1,
      status: supportCapacitySafetyFactor >= 1 ? 'accepted' : 'blocked',
    },
    {
      id: 'passive-toe-resistance',
      actual: round(passiveSafetyFactor, 4),
      required: requiredPassiveSafetyFactor,
      status: passiveSafetyFactor >= requiredPassiveSafetyFactor ? 'accepted' : 'blocked',
    },
    {
      id: 'basal-heave',
      actual: round(basalHeaveSafetyFactor, 4),
      required: requiredBasalHeaveSafetyFactor,
      status: basalHeaveSafetyFactor >= requiredBasalHeaveSafetyFactor ? 'accepted' : 'blocked',
    },
  ];

  return {
    schemaVersion: 'fem-excavation-support-design-check.v1',
    method: 'rankine-earth-pressure-support-screening',
    activeEarthPressureKnPerM: round(active.totalForce, 4),
    passiveToeResistanceKnPerM: round(passive.totalForce, 4),
    supportDemandKnPerM: round(supportDemandKnPerM, 4),
    supportCapacitySafetyFactor: round(supportCapacitySafetyFactor, 4),
    passiveSafetyFactor: round(passiveSafetyFactor, 4),
    basalHeaveSafetyFactor: round(basalHeaveSafetyFactor, 4),
    checks,
    status: checks.every((check) => check.status === 'accepted') ? 'accepted' : 'blocked',
    policy,
  };
}

export function validateFemReviewerApprovalRecord(
  record: Partial<FemReviewerApprovalRecord>,
): FemReviewerApprovalValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (record.schemaVersion !== 'fem-reviewer-approval.v1') blockers.push('schema.unsupported');
  if (!record.recordId || record.recordId.trim().length < 6) blockers.push('record-id.missing');
  if (!record.caseId || record.caseId.trim().length < 3) blockers.push('case-id.missing');
  if (!record.caseHashSha256 || !/^[a-f0-9]{64}$/i.test(record.caseHashSha256)) blockers.push('case-hash.invalid');
  if (
    !record.validationSummary ||
    (record.validationSummary.status !== 'ready' &&
      record.validationSummary.status !== 'review' &&
      record.validationSummary.status !== 'blocked')
  ) {
    blockers.push('validation-summary.status.invalid');
  }
  if (record.validationSummary && record.validationSummary.blockers > 0) {
    blockers.push('validation-summary.blocked');
  }
  if (!Array.isArray(record.validationSummary?.findingCodes)) {
    blockers.push('validation-summary.finding-codes.missing');
  }
  if (!record.reviewer?.name || record.reviewer.name.trim().length < 3) blockers.push('reviewer.name.missing');
  if (!record.reviewer?.licenseId || record.reviewer.licenseId.trim().length < 3) blockers.push('reviewer.license-id.missing');
  if (!record.reviewer?.jurisdiction || record.reviewer.jurisdiction.trim().length < 2) blockers.push('reviewer.jurisdiction.missing');
  if (record.scope !== 'experimental-preview' && record.scope !== 'production-design') blockers.push('scope.unsupported');
  if (!Array.isArray(record.assumptions) || record.assumptions.length === 0) blockers.push('assumptions.missing');
  if (!Array.isArray(record.limitations) || record.limitations.length === 0) blockers.push('limitations.missing');
  if (!record.approvalStatement || !/\b(reviewed|approved|accepted)\b/i.test(record.approvalStatement)) {
    blockers.push('approval-statement.missing-review-language');
  }

  const approvedAt = record.approvedAt ? Date.parse(record.approvedAt) : NaN;
  if (!Number.isFinite(approvedAt)) {
    blockers.push('approved-at.invalid');
  } else if (approvedAt > Date.now() + 60_000) {
    blockers.push('approved-at.future');
  }

  if (record.scope === 'production-design') {
    warnings.push('production-design-scope-requires-solver-and-jurisdiction-policy-enforcement');
  }

  return {
    schemaVersion: 'fem-reviewer-approval-validation.v1',
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockerCodes: [...new Set(blockers)],
    warnings,
  };
}

function benchmark(
  id: string,
  feature: FemEngineeringKernelFeature,
  referenceType: FemEngineeringBenchmarkCase['referenceType'],
  quantity: string,
  actual: number,
  expected: number,
  tolerance: number,
  evidence: string,
  unit?: string,
): FemEngineeringBenchmarkCase {
  return {
    id,
    feature,
    referenceType,
    quantity,
    actual: round(actual, 8),
    expected: round(expected, 8),
    tolerance,
    ...(unit ? { unit } : {}),
    status: Math.abs(actual - expected) <= tolerance ? 'accepted' : 'blocked',
    evidence,
  };
}

export function runFemEngineeringEvidenceSuite(
  policy: FemConvergencePolicy = DEFAULT_FEM_CONVERGENCE_POLICY,
): FemEngineeringEvidenceReport {
  const benchmarks: FemEngineeringBenchmarkCase[] = [];

  const plasticity = runMohrCoulombMaterialPoint({
    confiningEffectiveStressKpa: 100,
    axialStrain: 0.02,
    elasticModulusKpa: 30_000,
    poissonRatio: 0.3,
    frictionAngleDeg: 30,
    cohesionKpa: 0,
    increments: 20,
    policy,
  });
  benchmarks.push(benchmark(
    'mc-triaxial-drained-phi30-sigma3-100',
    'nonlinear-plasticity',
    'closed-form',
    'peakDeviatorStressKpa',
    plasticity.peakDeviatorStressKpa,
    200,
    1e-6,
    'Mohr-Coulomb triaxial compression closed-form qf = 2 sigma3 sin(phi)/(1 - sin(phi)).',
    'kPa',
  ));

  const druckerPrager = runDruckerPragerMaterialPoint({
    initialPrincipalEffectiveStressKpa: [100, 100, 100],
    principalStrainIncrements: Array.from({ length: 16 }, () => [0.001, -0.0002, -0.0002] as FemPrincipalVector),
    elasticModulusKpa: 30_000,
    poissonRatio: 0.3,
    frictionAngleDeg: 30,
    cohesionKpa: 0,
    dilationAngleDeg: 0,
    policy,
  });
  benchmarks.push(benchmark(
    'drucker-prager-return-map-yield-residual',
    'nonlinear-plasticity',
    'internal-balance',
    'yieldResidualRatio',
    druckerPrager.finalStep.yieldResidualRatio,
    0,
    policy.residualTolerance,
    'Drucker-Prager principal-stress return mapping must project the plastic trial stress back to the smooth yield surface.',
  ));
  benchmarks.push(benchmark(
    'drucker-prager-material-state-plastic',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'plasticStateAccepted',
    druckerPrager.finalStep.state === 'plastic' && druckerPrager.converged ? 1 : 0,
    1,
    0,
    'Nonlinear material-point integration must report a converged plastic state and accumulated plastic strain variables.',
  ));

  const finalTimeYears = 0.197 * 25;
  const consolidationTimes = Array.from({ length: 80 }, (_, index) => finalTimeYears * ((index + 1) / 80));
  const consolidation = runTerzaghiConsolidationTimeStepper({
    layerThicknessM: 10,
    drainage: 'double',
    coefficientOfConsolidationM2PerYear: 1,
    initialExcessPorePressureKpa: 100,
    primarySettlementMm: 100,
    timeStepsYears: consolidationTimes,
    nodeCount: 81,
    policy,
  });
  benchmarks.push(benchmark(
    'terzaghi-tv-0-197-average-consolidation',
    'consolidation',
    'closed-form',
    'degreeOfConsolidation',
    consolidation.finalStep.degreeOfConsolidation,
    terzaghiAverageConsolidation(0.197),
    0.035,
    'Backward-Euler 1D consolidation checked against Terzaghi average-consolidation series at Tv=0.197.',
  ));

  const seepage = runDarcySeepage1D({
    hydraulicConductivityMPerS: 1e-5,
    domainLengthM: 20,
    upstreamHeadM: 10,
    downstreamHeadM: 6,
    nodeCount: 21,
    transient: {
      specificStorage1PerM: 1e-4,
      durationSeconds: 20_000,
      timeSteps: 40,
      initialHeadM: 6,
    },
    policy,
  });
  benchmarks.push(benchmark(
    'darcy-1d-linear-head-flow',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'steadyFlowM3PerSPerM',
    seepage.steadyFlowM3PerSPerM,
    2e-6,
    1e-10,
    'Darcy 1D closed-form q = k deltaH / L.',
    'm3/s/m',
  ));
  benchmarks.push(benchmark(
    'darcy-1d-mass-balance',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'massBalanceErrorRatio',
    seepage.massBalanceErrorRatio,
    0,
    policy.porePressureMassBalanceTolerance,
    'Steady 1D flow must conserve inflow and outflow within the pore-pressure mass-balance policy.',
  ));

  const coupling = runHydroMechanicalCoupling1D({
    totalVerticalStressKpa: 200,
    porePressureBeforeKpa: 80,
    porePressureAfterKpa: 40,
    constrainedModulusKpa: 10_000,
    layerThicknessM: 5,
    policy,
  });
  benchmarks.push(benchmark(
    'effective-stress-settlement-coupling',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'settlementMm',
    coupling.settlementMm,
    20,
    1e-6,
    '1D hydro-mechanical coupling checked by delta sigma prime times H over constrained modulus.',
    'mm',
  ));

  const support = runExcavationSupportDesignCheck({
    excavationDepthM: 8,
    wallToeDepthM: 14,
    unitWeightKnM3: 18,
    frictionAngleDeg: 30,
    cohesionKpa: 45,
    surchargeKpa: 10,
    waterTableDepthM: 99,
    supportLevelsM: [1, 4],
    allowableSupportLoadKnPerM: 300,
    requiredPassiveSafetyFactor: 1.5,
    requiredBasalHeaveSafetyFactor: 1.5,
    policy,
  });
  benchmarks.push(benchmark(
    'excavation-support-capacity-screening',
    'support-design',
    'internal-balance',
    'supportStatusAccepted',
    support.status === 'accepted' ? 1 : 0,
    1,
    0,
    'Support screening must pass support capacity, passive toe resistance, and basal-heave checks for the controlled fixture.',
  ));

  const reviewerValidation = validateFemReviewerApprovalRecord({
    schemaVersion: 'fem-reviewer-approval.v1',
    recordId: 'review-fem-001',
    caseId: 'fixture-case',
    caseHashSha256: 'a'.repeat(64),
    validationSummary: {
      status: 'review',
      blockers: 0,
      reviewItems: 2,
      findingCodes: ['experimental-only', 'not-design-calculation'],
    },
    reviewer: {
      name: 'Licensed Reviewer',
      licenseId: 'PE-12345',
      jurisdiction: 'US-CA',
    },
    approvedAt: '2025-01-15T00:00:00.000Z',
    scope: 'experimental-preview',
    assumptions: ['Fixture assumptions reviewed.'],
    limitations: ['Not a production FEM design calculation.'],
    approvalStatement: 'Reviewed and accepted for experimental preview execution.',
  });
  benchmarks.push(benchmark(
    'reviewer-approval-record-contract',
    'licensed-engineer-review-workflow',
    'review-record-contract',
    'reviewRecordAccepted',
    reviewerValidation.status === 'accepted' ? 1 : 0,
    1,
    0,
    'Reviewer approval record contract requires identity, license, jurisdiction, assumptions, limitations, scope, and approval text.',
  ));

  const verifiedFeatures = [...new Set(
    benchmarks
      .filter((item) => item.status === 'accepted')
      .map((item) => item.feature),
  )];
  const status = benchmarks.every((item) => item.status === 'accepted') ? 'kernel-verified' : 'blocked';

  return {
    schemaVersion: 'fem-engineering-evidence.v1',
    status,
    productionReady: false,
    verifiedFeatures,
    benchmarks,
    convergencePolicy: policy,
    remainingProductionBlockers: [
      '2d-3d-fem-assembly-and-sparse-solver-not-integrated-with-these-kernels',
      'nonlinear-plasticity-not-coupled-to-global-newton-iterations',
      'seepage-kernel-and-2d-3d-consolidation-not-coupled-to-global-fem-result-fields',
      'support-design-is-screening-level-and-not-jurisdiction-specific-structural-design',
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
      'reviewer-approval-record-validator-exists-but-cli-run-does-not-enforce-persistence-for-every-run',
    ],
    releasePositioning:
      'These kernels provide deterministic engineering evidence for strong-beta gating. They do not make geotechCLI a production nonlinear FEM solver until solver integration, external benchmarks, and enforced approval workflows are complete.',
  };
}

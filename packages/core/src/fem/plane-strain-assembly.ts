import { DEFAULT_FEM_CONVERGENCE_POLICY, type FemConvergencePolicy } from './engineering-evidence.js';
import {
  buildCsrFromTriplets,
  solveCsrConjugateGradient,
  type FemSparseCsrMatrix,
  type FemSparseTriplet,
} from './sparse-linear-algebra.js';

export interface FemPlaneStrainNode {
  id: string;
  xM: number;
  yM: number;
}

export interface FemPlaneStrainQuad4Element {
  id: string;
  nodeIds: [string, string, string, string];
  materialId: string;
  thicknessM?: number;
}

export interface FemPlaneStrainMaterial {
  id: string;
  elasticModulusKpa: number;
  poissonRatio: number;
  unitWeightKnM3?: number;
  hydraulicConductivityXMPerS?: number;
  hydraulicConductivityYMPerS?: number;
  biotCoefficient?: number;
  specificStorage1PerM?: number;
  frictionAngleDeg?: number;
  cohesionKpa?: number;
  dilationAngleDeg?: number;
  hardeningModulusKpa?: number;
}

export interface FemPlaneStrainBoundaryCondition {
  nodeId: string;
  dof: 'ux' | 'uy';
  valueM?: number;
}

export interface FemPlaneStrainNodalLoad {
  nodeId: string;
  fxKn?: number;
  fyKn?: number;
}

export interface FemPlaneStrainModel {
  schemaVersion: 'fem-plane-strain-model.v1';
  nodes: FemPlaneStrainNode[];
  elements: FemPlaneStrainQuad4Element[];
  materials: FemPlaneStrainMaterial[];
  boundaryConditions: FemPlaneStrainBoundaryCondition[];
  nodalLoads?: FemPlaneStrainNodalLoad[];
  defaultThicknessM?: number;
  policy?: FemConvergencePolicy;
}

export interface FemPlaneStrainGaussPointResult {
  elementId: string;
  gaussPoint: number;
  xi: number;
  eta: number;
  detJ: number;
  strain: [number, number, number];
  stressKpa: [number, number, number];
}

export interface FemPlaneStrainAssemblyResult {
  schemaVersion: 'fem-plane-strain-assembly-result.v1';
  method: 'quad4-plane-strain-linear-elastic-global-assembly';
  nodes: Array<FemPlaneStrainNode & { uxM: number; uyM: number; rxnXKn: number; rxnYKn: number }>;
  elements: Array<{
    id: string;
    areaM2: number;
    thicknessM: number;
    gaussPoints: FemPlaneStrainGaussPointResult[];
  }>;
  dofCount: number;
  freeDofCount: number;
  constrainedDofCount: number;
  maxFreeResidualKn: number;
  residualNormRatio: number;
  reactionBalanceRatio: number;
  strainEnergyKnM: number;
  converged: boolean;
  policy: FemConvergencePolicy;
}

export interface FemPlaneStrainDruckerPragerGaussPointResult extends FemPlaneStrainGaussPointResult {
  outOfPlaneStressKpa: number;
  compressionPositivePrincipalStressKpa: [number, number, number];
  yieldValueKpa: number;
  yieldResidualRatio: number;
  plasticMultiplier: number;
  equivalentPlasticStrain: number;
  state: 'elastic' | 'plastic';
}

export type FemPlaneStrainDruckerPragerTerminationReason =
  | 'converged'
  | 'max_iterations'
  | 'linear_solver_nonconverged'
  | 'force_residual_exceeded'
  | 'yield_residual_exceeded';

export type FemPlaneStrainLinearSolverKind = 'dense-gaussian' | 'sparse-csr-cg';

export interface FemPlaneStrainLinearSolverAudit {
  schemaVersion: 'fem-plane-strain-linear-solver-audit.v1';
  solver: FemPlaneStrainLinearSolverKind;
  matrixDofCount: number;
  nonzeroCount: number;
  iterations: number;
  tolerance: number;
  maxIterations: number;
  initialResidualNorm: number;
  finalResidualNorm: number;
  residualNormRatio: number;
  correctionNormM: number;
  correctionNormRatio: number;
  converged: boolean;
  failureReason?: string;
}

export interface FemPlaneStrainDruckerPragerSolverOptions {
  loadStepFractions?: readonly number[];
  linearSolver?: FemPlaneStrainLinearSolverKind;
  linearSolverTolerance?: number;
  linearSolverMaxIterations?: number;
}

export interface FemPlaneStrainDruckerPragerResidualHistoryEntry {
  iteration: number;
  maxFreeResidualKn: number;
  residualNormRatio: number;
  forceBalanceTolerance: number;
  reactionBalanceRatio: number;
  maxYieldResidualRatio: number;
  yieldResidualTolerance: number;
  converged: boolean;
}

export interface FemPlaneStrainDruckerPragerFailure {
  step: number;
  loadFactor: number;
  terminationReason: FemPlaneStrainDruckerPragerTerminationReason;
  residualNormRatio: number;
  maxYieldResidualRatio: number;
  message: string;
}

export interface FemPlaneStrainDruckerPragerStepResult {
  step: number;
  loadFactor: number;
  iterations: number;
  maxFreeResidualKn: number;
  residualNormRatio: number;
  reactionBalanceRatio: number;
  maxYieldResidualRatio: number;
  maxEquivalentPlasticStrain: number;
  plasticGaussPointCount: number;
  linearSolver: FemPlaneStrainLinearSolverKind;
  linearIterations: number;
  linearResidualNormRatio: number;
  correctionNormRatio: number;
  linearSolverAudits: FemPlaneStrainLinearSolverAudit[];
  converged: boolean;
  terminationReason: FemPlaneStrainDruckerPragerTerminationReason;
  failureReason?: string;
  residualHistory: FemPlaneStrainDruckerPragerResidualHistoryEntry[];
}

export interface FemPlaneStrainDruckerPragerResult {
  schemaVersion: 'fem-plane-strain-drucker-prager-result.v1';
  method: 'quad4-plane-strain-drucker-prager-modified-newton';
  nodes: Array<FemPlaneStrainNode & { uxM: number; uyM: number; rxnXKn: number; rxnYKn: number }>;
  elements: Array<{
    id: string;
    areaM2: number;
    thicknessM: number;
    gaussPoints: FemPlaneStrainDruckerPragerGaussPointResult[];
  }>;
  dofCount: number;
  freeDofCount: number;
  constrainedDofCount: number;
  linearSolver: FemPlaneStrainLinearSolverKind;
  nonlinearAlgorithm: 'modified-newton';
  globalTangent: 'elastic';
  materialIntegration: 'total-strain-drucker-prager-projection';
  loadSteps: FemPlaneStrainDruckerPragerStepResult[];
  maxFreeResidualKn: number;
  residualNormRatio: number;
  reactionBalanceRatio: number;
  maxYieldResidualRatio: number;
  maxEquivalentPlasticStrain: number;
  plasticGaussPointCount: number;
  converged: boolean;
  status: 'converged' | 'nonconverged';
  failure?: FemPlaneStrainDruckerPragerFailure;
  policy: FemConvergencePolicy;
  limitations: string[];
}

export interface FemPlaneStrainHydraulicHeadBoundaryCondition {
  nodeId: string;
  headM: number;
}

export interface FemPlaneStrainNodalFlux {
  nodeId: string;
  flowM3PerSPerM?: number;
}

export interface FemPlaneStrainSeepageModel {
  schemaVersion: 'fem-plane-strain-seepage-model.v1';
  nodes: FemPlaneStrainNode[];
  elements: FemPlaneStrainQuad4Element[];
  materials: FemPlaneStrainMaterial[];
  headBoundaryConditions: FemPlaneStrainHydraulicHeadBoundaryCondition[];
  nodalFluxes?: FemPlaneStrainNodalFlux[];
  defaultThicknessM?: number;
  gammaWaterKpaPerM?: number;
  policy?: FemConvergencePolicy;
}

export interface FemPlaneStrainSeepageNodeResult extends FemPlaneStrainNode {
  headM: number;
  porePressureKpa: number;
  hydraulicResidualM3PerS: number;
}

export interface FemPlaneStrainSeepageGaussPointResult {
  elementId: string;
  gaussPoint: number;
  xi: number;
  eta: number;
  detJ: number;
  headM: number;
  elevationM: number;
  porePressureKpa: number;
  hydraulicGradient: [number, number];
  darcyFluxMPerS: [number, number];
  biotCoefficient: number;
  effectiveStressReductionKpa: number;
}

export interface FemPlaneStrainSeepageResult {
  schemaVersion: 'fem-plane-strain-seepage-result.v1';
  method: 'quad4-plane-strain-steady-darcy-seepage';
  nodes: FemPlaneStrainSeepageNodeResult[];
  elements: Array<{
    id: string;
    areaM2: number;
    thicknessM: number;
    gaussPoints: FemPlaneStrainSeepageGaussPointResult[];
  }>;
  headDofCount: number;
  freeHeadDofCount: number;
  constrainedHeadDofCount: number;
  maxFreeMassResidualM3PerS: number;
  totalPositiveBoundaryFluxM3PerS: number;
  totalNegativeBoundaryFluxM3PerS: number;
  netNodalFluxM3PerS: number;
  massBalanceErrorRatio: number;
  maxPorePressureKpa: number;
  maxEffectiveStressReductionKpa: number;
  converged: boolean;
  policy: FemConvergencePolicy;
  limitations: string[];
}

export interface FemPlaneStrainPorePressureBoundaryCondition {
  nodeId: string;
  porePressureKpa: number;
}

export interface FemPlaneStrainPorePressureNodalFlux {
  nodeId: string;
  flowM3PerS?: number;
}

export interface FemPlaneStrainBiotConsolidationModel {
  schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1';
  nodes: FemPlaneStrainNode[];
  elements: FemPlaneStrainQuad4Element[];
  materials: FemPlaneStrainMaterial[];
  boundaryConditions: FemPlaneStrainBoundaryCondition[];
  porePressureBoundaryConditions: FemPlaneStrainPorePressureBoundaryCondition[];
  timeStepsSeconds: number[];
  nodalLoads?: FemPlaneStrainNodalLoad[];
  nodalFluxes?: FemPlaneStrainPorePressureNodalFlux[];
  initialPorePressureKpa?: number;
  defaultThicknessM?: number;
  gammaWaterKpaPerM?: number;
  policy?: FemConvergencePolicy;
}

export interface FemPlaneStrainBiotGaussPointResult {
  elementId: string;
  gaussPoint: number;
  xi: number;
  eta: number;
  detJ: number;
  strain: [number, number, number];
  effectiveStressKpa: [number, number, number];
  totalStressKpa: [number, number, number];
  porePressureKpa: number;
  biotCoefficient: number;
  biotStressReductionKpa: number;
  hydraulicGradientKpaPerM: [number, number];
  darcyFluxMPerS: [number, number];
}

export interface FemPlaneStrainBiotStepResult {
  step: number;
  timeSeconds: number;
  deltaTimeSeconds: number;
  maxFreeResidualKn: number;
  residualNormRatio: number;
  maxFreePorePressureResidualM3PerS: number;
  freePorePressureResidualL1M3PerS: number;
  massBalanceErrorRatio: number;
  pressureAudit: FemPlaneStrainBiotPressureAudit;
  pressureDiagnostics: FemPlaneStrainBiotPressureDiagnostics;
  minPorePressureKpa: number;
  maxPorePressureKpa: number;
  maxVerticalSettlementM: number;
  converged: boolean;
}

export interface FemPlaneStrainBiotNumericalContract {
  pressureKind: 'excess-pore-pressure';
  pressureUnit: 'kPa';
  pressureSignConvention: 'positive-compression-pore-pressure-only';
  unsupportedNegativePressurePolicy: 'reject-negative-free-pressure-solve';
  stressConvention: 'tension-positive-plane-strain-output';
  totalStressRelation: 'sigma_total_xx_yy = sigma_effective_xx_yy - alpha_B * p; shear unchanged';
  darcyFluxRelation: 'q = -k/gamma_water * grad(p)';
  storageConvention: 'specificStorage1PerM is head-based; pressure storage uses Ss / gamma_water';
  transientStepPolicy: 'fixed backward-Euler grid requires minAcceptedSteps and bounded step-growth ratio';
  maxTimeStepGrowthRatio: number;
  gammaWaterKpaPerM: number;
}

export interface FemPlaneStrainBiotPressureAudit {
  freePorePressureResidualL1M3PerS: number;
  prescribedPorePressureResidualL1M3PerS: number;
  netPrescribedPressureBoundaryFlowM3PerS: number;
  appliedNodalFluxSumM3PerS: number;
  storageRateSumM3PerS: number;
  couplingRateSumM3PerS: number;
  darcyFlowRateSumM3PerS: number;
}

export interface FemPlaneStrainBiotPressureDiagnostics {
  averagePorePressureKpa: number;
  averageFreePorePressureKpa: number;
  porePressureDissipationRatio: number;
  maxPorePressureChangeKpa: number;
  maxPorePressureChangeRateKpaPerS: number;
  pressureOvershootKpa: number;
}

export interface FemPlaneStrainBiotConsolidationResult {
  schemaVersion: 'fem-plane-strain-biot-consolidation-result.v1';
  method: 'quad4-plane-strain-biot-u-p-backward-euler-evidence';
  numericalContract: FemPlaneStrainBiotNumericalContract;
  nodes: Array<FemPlaneStrainNode & {
    uxM: number;
    uyM: number;
    porePressureKpa: number;
    rxnXKn: number;
    rxnYKn: number;
    porePressureResidualM3PerS: number;
  }>;
  elements: Array<{
    id: string;
    areaM2: number;
    thicknessM: number;
    gaussPoints: FemPlaneStrainBiotGaussPointResult[];
  }>;
  timeSteps: FemPlaneStrainBiotStepResult[];
  displacementDofCount: number;
  freeDisplacementDofCount: number;
  constrainedDisplacementDofCount: number;
  porePressureDofCount: number;
  freePorePressureDofCount: number;
  constrainedPorePressureDofCount: number;
  coupledUnknownCount: number;
  maxBiotCouplingKpa: number;
  maxFreeResidualKn: number;
  residualNormRatio: number;
  maxFreePorePressureResidualM3PerS: number;
  freePorePressureResidualL1M3PerS: number;
  pressureAudit: FemPlaneStrainBiotPressureAudit;
  pressureDiagnostics: FemPlaneStrainBiotPressureDiagnostics;
  massBalanceErrorRatio: number;
  minPorePressureKpa: number;
  maxPorePressureKpa: number;
  converged: boolean;
  productionReady: false;
  policy: FemConvergencePolicy;
  limitations: string[];
}

const GAUSS_POINTS: Array<[number, number, number]> = [
  [-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1],
  [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1],
  [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1],
  [-1 / Math.sqrt(3), 1 / Math.sqrt(3), 1],
];
const MAX_DENSE_DOF_COUNT = 800;
const MAX_SPARSE_EXPERIMENTAL_DOF_COUNT = 5_000;
const MAX_BIOT_TIME_STEP_GROWTH_RATIO = 8;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number.`);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
}

function normalizeBiotPorePressure(value: number, label: string): number {
  assertFinite(value, label);
  if (value < -1e-9) {
    throw new Error(`${label} solved negative pore pressure ${value} kPa, which is unsupported by this saturated excess-pressure Biot evidence kernel.`);
  }
  return value < 0 ? 0 : value;
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a finite positive integer.`);
  }
  return value;
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
}

function assertNonEmptyId(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} id must be a non-empty string.`);
  }
}

function assertUniqueIds<T extends { id: string }>(items: T[], label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    assertNonEmptyId(item.id, label);
    if (seen.has(item.id)) throw new Error(`Duplicate ${label} id: ${item.id}.`);
    seen.add(item.id);
  }
}

function validateConvergencePolicy(policy: FemConvergencePolicy): void {
  if (policy.schemaVersion !== 'fem-convergence-policy.v1') {
    throw new Error('policy.schemaVersion must be fem-convergence-policy.v1.');
  }
  assertFinitePositive(policy.residualTolerance, 'policy.residualTolerance');
  assertFinitePositive(policy.forceBalanceTolerance, 'policy.forceBalanceTolerance');
  assertFinitePositive(policy.porePressureMassBalanceTolerance, 'policy.porePressureMassBalanceTolerance');
  assertPositiveInteger(policy.maxIterations, 'policy.maxIterations');
  assertPositiveInteger(policy.minAcceptedSteps, 'policy.minAcceptedSteps');
  if (policy.minAcceptedSteps > policy.maxIterations) {
    throw new Error('policy.minAcceptedSteps must be less than or equal to policy.maxIterations.');
  }
}

function validateBiotTransientStepPolicy(timeStepsSeconds: number[], policy: FemConvergencePolicy): void {
  if (timeStepsSeconds.length < policy.minAcceptedSteps) {
    throw new Error(`timeStepsSeconds must include at least ${policy.minAcceptedSteps} accepted transient steps for the Biot consolidation preview.`);
  }

  let previousTimeSeconds = 0;
  let previousDeltaTimeSeconds: number | undefined;
  for (const [index, timeSeconds] of timeStepsSeconds.entries()) {
    assertFinitePositive(timeSeconds, `timeStepsSeconds.${index}`);
    if (timeSeconds <= previousTimeSeconds) {
      throw new Error(`timeStepsSeconds.${index} must be strictly increasing.`);
    }
    const deltaTimeSeconds = timeSeconds - previousTimeSeconds;
    if (
      previousDeltaTimeSeconds != null &&
      deltaTimeSeconds / previousDeltaTimeSeconds > MAX_BIOT_TIME_STEP_GROWTH_RATIO
    ) {
      throw new Error(
        `timeStepsSeconds.${index} step growth ratio must not exceed ${MAX_BIOT_TIME_STEP_GROWTH_RATIO} for the Biot consolidation preview.`,
      );
    }
    previousTimeSeconds = timeSeconds;
    previousDeltaTimeSeconds = deltaTimeSeconds;
  }
}

function round(value: number, digits = 10): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dofIndex(nodeIndex: number, dof: 'ux' | 'uy'): number {
  return nodeIndex * 2 + (dof === 'ux' ? 0 : 1);
}

function planeStrainD(material: FemPlaneStrainMaterial): number[][] {
  assertFinitePositive(material.elasticModulusKpa, `material ${material.id} elasticModulusKpa`);
  if (!Number.isFinite(material.poissonRatio) || material.poissonRatio < 0 || material.poissonRatio >= 0.5) {
    throw new Error(`material ${material.id} poissonRatio must be finite and between 0 and 0.5.`);
  }
  const e = material.elasticModulusKpa;
  const nu = material.poissonRatio;
  const factor = e / ((1 + nu) * (1 - 2 * nu));
  return [
    [factor * (1 - nu), factor * nu, 0],
    [factor * nu, factor * (1 - nu), 0],
    [0, 0, factor * (1 - 2 * nu) / 2],
  ];
}

function planeStrainSigmaZ(material: FemPlaneStrainMaterial, strain: [number, number, number]): number {
  const e = material.elasticModulusKpa;
  const nu = material.poissonRatio;
  const factor = e / ((1 + nu) * (1 - 2 * nu));
  return factor * nu * (strain[0] + strain[1]);
}

function elasticModuli(material: FemPlaneStrainMaterial): { bulkModulusKpa: number; shearModulusKpa: number } {
  return {
    bulkModulusKpa: material.elasticModulusKpa / (3 * (1 - 2 * material.poissonRatio)),
    shearModulusKpa: material.elasticModulusKpa / (2 * (1 + material.poissonRatio)),
  };
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
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

function druckerPragerParameters(material: FemPlaneStrainMaterial): {
  rho: number;
  rhoBar: number;
  compressionInterceptKpa: number;
} {
  const frictionAngleDeg = material.frictionAngleDeg ?? 30;
  const cohesionKpa = material.cohesionKpa ?? 0;
  const dilationAngleDeg = material.dilationAngleDeg ?? frictionAngleDeg;
  if (!Number.isFinite(frictionAngleDeg) || frictionAngleDeg <= 0 || frictionAngleDeg >= 50) {
    throw new Error(`material ${material.id} frictionAngleDeg must be finite and between 0 and 50 degrees.`);
  }
  assertFiniteNonNegative(cohesionKpa, `material ${material.id} cohesionKpa`);
  assertFiniteNonNegative(material.hardeningModulusKpa ?? 0, `material ${material.id} hardeningModulusKpa`);
  const rho = druckerPragerRhoFromAngle(frictionAngleDeg);
  const rhoBar = Math.min(rho, druckerPragerRhoFromAngle(dilationAngleDeg));
  const phi = degToRad(frictionAngleDeg);
  const sinPhi = Math.sin(phi);
  const cohesionContributionToQ = (2 * cohesionKpa * Math.cos(phi)) / (1 - sinPhi);
  const deviatoricNormFactor = Math.sqrt(2 / 3);
  return {
    rho,
    rhoBar,
    compressionInterceptKpa: cohesionContributionToQ * (deviatoricNormFactor - rho),
  };
}

function principalCompressionFromPlaneStress(stress: [number, number, number], sigmaZKpa: number): {
  values: [number, number, number];
  angleRad: number;
} {
  const a = -stress[0];
  const c = -stress[1];
  const b = -stress[2];
  const mean = (a + c) / 2;
  const radius = Math.hypot((a - c) / 2, b);
  const angleRad = 0.5 * Math.atan2(2 * b, a - c);
  return {
    values: [mean + radius, mean - radius, -sigmaZKpa],
    angleRad,
  };
}

function planeStressFromPrincipalCompression(values: [number, number, number], angleRad: number): {
  stress: [number, number, number];
  sigmaZKpa: number;
} {
  const [p1, p2, p3] = values;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const compressionX = p1 * c * c + p2 * s * s;
  const compressionY = p1 * s * s + p2 * c * c;
  const compressionXY = (p1 - p2) * s * c;
  return {
    stress: [-compressionX, -compressionY, -compressionXY],
    sigmaZKpa: -p3,
  };
}

function deviatoricNorm(values: [number, number, number]): number {
  const mean = (values[0] + values[1] + values[2]) / 3;
  return Math.hypot(values[0] - mean, values[1] - mean, values[2] - mean);
}

function projectDruckerPragerStress(input: {
  material: FemPlaneStrainMaterial;
  policy: FemConvergencePolicy;
  strain: [number, number, number];
  stress: [number, number, number];
  sigmaZKpa: number;
}): Omit<FemPlaneStrainDruckerPragerGaussPointResult, 'elementId' | 'gaussPoint' | 'xi' | 'eta' | 'detJ'> {
  const { material, strain } = input;
  const params = druckerPragerParameters(material);
  const principal = principalCompressionFromPlaneStress(input.stress, input.sigmaZKpa);
  const principalStress = principal.values;
  const trace = principalStress[0] + principalStress[1] + principalStress[2];
  const mean = trace / 3;
  const q = deviatoricNorm(principalStress);
  const intercept = params.compressionInterceptKpa;
  const yieldValue = q - params.rho * trace - intercept;
  const yieldScale = Math.max(q, Math.abs(params.rho * trace), Math.abs(intercept), 1);
  if (yieldValue <= 0 || Math.abs(yieldValue) / yieldScale <= input.policy.residualTolerance) {
    return {
      strain,
      stressKpa: input.stress,
      outOfPlaneStressKpa: input.sigmaZKpa,
      compressionPositivePrincipalStressKpa: principalStress,
      yieldValueKpa: yieldValue,
      yieldResidualRatio: Math.max(0, yieldValue) / yieldScale,
      plasticMultiplier: 0,
      equivalentPlasticStrain: 0,
      state: 'elastic',
    };
  }

  const targetQ = Math.max(0, params.rho * trace + intercept);
  const scale = q > 0 ? targetQ / q : 0;
  const correctedPrincipal = principalStress.map((value) => mean + (value - mean) * scale) as [number, number, number];
  const corrected = planeStressFromPrincipalCompression(correctedPrincipal, principal.angleRad);
  const correctedQ = deviatoricNorm(correctedPrincipal);
  const correctedYieldValue = correctedQ - params.rho * trace - intercept;
  const correctedScale = Math.max(correctedQ, Math.abs(params.rho * trace), Math.abs(intercept), 1);
  const moduli = elasticModuli(material);
  const denominator = 2 * moduli.shearModulusKpa +
    9 * moduli.bulkModulusKpa * params.rho * params.rhoBar +
    (material.hardeningModulusKpa ?? 0);
  const plasticMultiplier = Math.max(0, yieldValue / Math.max(denominator, 1e-12));

  return {
    strain,
    stressKpa: corrected.stress,
    outOfPlaneStressKpa: corrected.sigmaZKpa,
    compressionPositivePrincipalStressKpa: correctedPrincipal,
    yieldValueKpa: correctedYieldValue,
    yieldResidualRatio: Math.abs(correctedYieldValue) / correctedScale,
    plasticMultiplier,
    equivalentPlasticStrain: plasticMultiplier,
    state: 'plastic',
  };
}

function shapeDerivativesNatural(xi: number, eta: number): Array<[number, number]> {
  return [
    [-(1 - eta) / 4, -(1 - xi) / 4],
    [(1 - eta) / 4, -(1 + xi) / 4],
    [(1 + eta) / 4, (1 + xi) / 4],
    [-(1 + eta) / 4, (1 - xi) / 4],
  ];
}

function shapeFunctions(xi: number, eta: number): [number, number, number, number] {
  return [
    ((1 - xi) * (1 - eta)) / 4,
    ((1 + xi) * (1 - eta)) / 4,
    ((1 + xi) * (1 + eta)) / 4,
    ((1 - xi) * (1 + eta)) / 4,
  ];
}

function solveDenseLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let pivotRow = pivot;
    let pivotAbs = Math.abs(a[pivot][pivot]);
    for (let row = pivot + 1; row < n; row += 1) {
      const candidate = Math.abs(a[row][pivot]);
      if (candidate > pivotAbs) {
        pivotRow = row;
        pivotAbs = candidate;
      }
    }
    if (pivotAbs <= 1e-14) throw new Error('Plane-strain global stiffness matrix is singular after boundary conditions.');
    if (pivotRow !== pivot) {
      const tmp = a[pivot];
      a[pivot] = a[pivotRow];
      a[pivotRow] = tmp;
    }
    const divisor = a[pivot][pivot];
    for (let col = pivot; col <= n; col += 1) a[pivot][col] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      if (factor === 0) continue;
      for (let col = pivot; col <= n; col += 1) {
        a[row][col] -= factor * a[pivot][col];
      }
    }
  }
  return a.map((row) => row[n]);
}

function matVec(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function elementMatrices(input: {
  nodes: FemPlaneStrainNode[];
  material: FemPlaneStrainMaterial;
  thicknessM: number;
}): {
  stiffness: number[][];
  areaM2: number;
  gauss: Array<{ xi: number; eta: number; detJ: number; b: number[][] }>;
} {
  const { nodes, material, thicknessM } = input;
  const d = planeStrainD(material);
  const k = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const gauss: Array<{ xi: number; eta: number; detJ: number; b: number[][] }> = [];
  let areaM2 = 0;

  for (const [xi, eta, weight] of GAUSS_POINTS) {
    const derivatives = shapeDerivativesNatural(xi, eta);
    let j11 = 0;
    let j12 = 0;
    let j21 = 0;
    let j22 = 0;
    for (let i = 0; i < 4; i += 1) {
      j11 += derivatives[i][0] * nodes[i].xM;
      j12 += derivatives[i][0] * nodes[i].yM;
      j21 += derivatives[i][1] * nodes[i].xM;
      j22 += derivatives[i][1] * nodes[i].yM;
    }
    const detJ = j11 * j22 - j12 * j21;
    if (!Number.isFinite(detJ) || detJ <= 0) {
      throw new Error('Plane-strain quad4 element has non-positive Jacobian; check node order and geometry.');
    }
    const invJ = [
      [j22 / detJ, -j12 / detJ],
      [-j21 / detJ, j11 / detJ],
    ];
    const b = Array.from({ length: 3 }, () => new Array<number>(8).fill(0));
    for (let i = 0; i < 4; i += 1) {
      const dNdx = invJ[0][0] * derivatives[i][0] + invJ[0][1] * derivatives[i][1];
      const dNdy = invJ[1][0] * derivatives[i][0] + invJ[1][1] * derivatives[i][1];
      b[0][2 * i] = dNdx;
      b[1][2 * i + 1] = dNdy;
      b[2][2 * i] = dNdy;
      b[2][2 * i + 1] = dNdx;
    }
    const dB = d.map((row) => b[0].map((_, col) => row.reduce((sum, value, r) => sum + value * b[r][col], 0)));
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const value = b.reduce((sum, bRow, r) => sum + bRow[row] * dB[r][col], 0);
        k[row][col] += value * detJ * weight * thicknessM;
      }
    }
    areaM2 += detJ * weight;
    gauss.push({ xi, eta, detJ, b });
  }

  return { stiffness: k, areaM2, gauss };
}

function validateHydraulicMaterial(material: FemPlaneStrainMaterial): {
  kxMPerS: number;
  kyMPerS: number;
  biotCoefficient: number;
} {
  const kxMPerS = material.hydraulicConductivityXMPerS;
  if (kxMPerS == null) {
    throw new Error(`material ${material.id} hydraulicConductivityXMPerS is required for plane-strain seepage.`);
  }
  assertFinitePositive(kxMPerS, `material ${material.id} hydraulicConductivityXMPerS`);
  const kyMPerS = material.hydraulicConductivityYMPerS ?? kxMPerS;
  assertFinitePositive(kyMPerS, `material ${material.id} hydraulicConductivityYMPerS`);
  const biotCoefficient = material.biotCoefficient ?? 1;
  if (!Number.isFinite(biotCoefficient) || biotCoefficient < 0 || biotCoefficient > 1) {
    throw new Error(`material ${material.id} biotCoefficient must be finite and between 0 and 1.`);
  }
  return { kxMPerS, kyMPerS, biotCoefficient };
}

function hydraulicElementMatrices(input: {
  nodes: FemPlaneStrainNode[];
  material: FemPlaneStrainMaterial;
  thicknessM: number;
}): {
  conductivity: number[][];
  areaM2: number;
  gauss: Array<{
    xi: number;
    eta: number;
    detJ: number;
    shape: [number, number, number, number];
    dNdx: number[];
    dNdy: number[];
    kxMPerS: number;
    kyMPerS: number;
    biotCoefficient: number;
  }>;
} {
  const { nodes, material, thicknessM } = input;
  const { kxMPerS, kyMPerS, biotCoefficient } = validateHydraulicMaterial(material);
  const conductivity = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  const gauss: Array<{
    xi: number;
    eta: number;
    detJ: number;
    shape: [number, number, number, number];
    dNdx: number[];
    dNdy: number[];
    kxMPerS: number;
    kyMPerS: number;
    biotCoefficient: number;
  }> = [];
  let areaM2 = 0;

  for (const [xi, eta, weight] of GAUSS_POINTS) {
    const derivatives = shapeDerivativesNatural(xi, eta);
    let j11 = 0;
    let j12 = 0;
    let j21 = 0;
    let j22 = 0;
    for (let i = 0; i < 4; i += 1) {
      j11 += derivatives[i][0] * nodes[i].xM;
      j12 += derivatives[i][0] * nodes[i].yM;
      j21 += derivatives[i][1] * nodes[i].xM;
      j22 += derivatives[i][1] * nodes[i].yM;
    }
    const detJ = j11 * j22 - j12 * j21;
    if (!Number.isFinite(detJ) || detJ <= 0) {
      throw new Error('Plane-strain seepage quad4 element has non-positive Jacobian; check node order and geometry.');
    }
    const invJ = [
      [j22 / detJ, -j12 / detJ],
      [-j21 / detJ, j11 / detJ],
    ];
    const dNdx: number[] = [];
    const dNdy: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      dNdx.push(invJ[0][0] * derivatives[i][0] + invJ[0][1] * derivatives[i][1]);
      dNdy.push(invJ[1][0] * derivatives[i][0] + invJ[1][1] * derivatives[i][1]);
    }
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        conductivity[row][col] += (
          dNdx[row] * kxMPerS * dNdx[col] +
          dNdy[row] * kyMPerS * dNdy[col]
        ) * detJ * weight * thicknessM;
      }
    }
    areaM2 += detJ * weight;
    gauss.push({
      xi,
      eta,
      detJ,
      shape: shapeFunctions(xi, eta),
      dNdx,
      dNdy,
      kxMPerS,
      kyMPerS,
      biotCoefficient,
    });
  }

  return { conductivity, areaM2, gauss };
}

function validateBiotMaterial(material: FemPlaneStrainMaterial): {
  kxMPerS: number;
  kyMPerS: number;
  biotCoefficient: number;
  specificStorage1PerM: number;
} {
  const hydraulic = validateHydraulicMaterial(material);
  const specificStorage1PerM = material.specificStorage1PerM;
  if (specificStorage1PerM == null) {
    throw new Error(`material ${material.id} specificStorage1PerM is required for plane-strain Biot consolidation.`);
  }
  assertFinitePositive(specificStorage1PerM, `material ${material.id} specificStorage1PerM`);
  return { ...hydraulic, specificStorage1PerM };
}

export function buildPlaneStrainRectangularMesh(input: {
  widthM: number;
  heightM: number;
  divisionsX: number;
  divisionsY: number;
  materialId?: string;
}): { nodes: FemPlaneStrainNode[]; elements: FemPlaneStrainQuad4Element[] } {
  assertFinitePositive(input.widthM, 'widthM');
  assertFinitePositive(input.heightM, 'heightM');
  const divisionsX = assertPositiveInteger(input.divisionsX, 'divisionsX');
  const divisionsY = assertPositiveInteger(input.divisionsY, 'divisionsY');
  const materialId = input.materialId ?? 'soil';
  const nodes: FemPlaneStrainNode[] = [];
  const elements: FemPlaneStrainQuad4Element[] = [];
  const nodeId = (ix: number, iy: number) => `n-${ix}-${iy}`;

  for (let iy = 0; iy <= divisionsY; iy += 1) {
    for (let ix = 0; ix <= divisionsX; ix += 1) {
      nodes.push({
        id: nodeId(ix, iy),
        xM: (input.widthM * ix) / divisionsX,
        yM: (input.heightM * iy) / divisionsY,
      });
    }
  }
  for (let iy = 0; iy < divisionsY; iy += 1) {
    for (let ix = 0; ix < divisionsX; ix += 1) {
      elements.push({
        id: `e-${ix}-${iy}`,
        materialId,
        nodeIds: [
          nodeId(ix, iy),
          nodeId(ix + 1, iy),
          nodeId(ix + 1, iy + 1),
          nodeId(ix, iy + 1),
        ],
      });
    }
  }
  return { nodes, elements };
}

export function runPlaneStrainSteadySeepage(model: FemPlaneStrainSeepageModel): FemPlaneStrainSeepageResult {
  if (model.schemaVersion !== 'fem-plane-strain-seepage-model.v1') {
    throw new Error('Only fem-plane-strain-seepage-model.v1 is supported.');
  }
  assertArray(model.nodes, 'nodes');
  assertArray(model.elements, 'elements');
  assertArray(model.materials, 'materials');
  assertArray(model.headBoundaryConditions, 'headBoundaryConditions');
  if (model.nodes.length < 4) throw new Error('Plane-strain seepage model requires at least four nodes.');
  if (model.elements.length < 1) throw new Error('Plane-strain seepage model requires at least one element.');
  if (model.materials.length < 1) throw new Error('Plane-strain seepage model requires at least one material.');
  if (model.defaultThicknessM != null) assertFinitePositive(model.defaultThicknessM, 'defaultThicknessM');
  if (model.nodalFluxes != null) assertArray(model.nodalFluxes, 'nodalFluxes');
  const gammaWaterKpaPerM = model.gammaWaterKpaPerM ?? 9.81;
  assertFinitePositive(gammaWaterKpaPerM, 'gammaWaterKpaPerM');
  assertUniqueIds(model.nodes, 'node');
  assertUniqueIds(model.materials, 'material');
  assertUniqueIds(model.elements, 'element');

  const policy = model.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  validateConvergencePolicy(policy);
  const nodeIndexById = new Map(model.nodes.map((node, index) => [node.id, index]));
  const materialById = new Map(model.materials.map((material) => [material.id, material]));
  const headDofCount = model.nodes.length;
  if (headDofCount > MAX_DENSE_DOF_COUNT) {
    throw new Error(`Plane-strain seepage dense assembly is capped at ${MAX_DENSE_DOF_COUNT} head DOFs for benchmark-scale evidence runs.`);
  }
  for (const node of model.nodes) {
    assertFinite(node.xM, `node ${node.id} xM`);
    assertFinite(node.yM, `node ${node.id} yM`);
  }
  for (const material of model.materials) {
    validateHydraulicMaterial(material);
  }

  const conductivity = Array.from({ length: headDofCount }, () => new Array<number>(headDofCount).fill(0));
  const loads = new Array<number>(headDofCount).fill(0);
  for (const flux of model.nodalFluxes ?? []) {
    const nodeIndex = nodeIndexById.get(flux.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown nodal seepage flux node: ${flux.nodeId}.`);
    const flowM3PerSPerM = flux.flowM3PerSPerM ?? 0;
    assertFinite(flowM3PerSPerM, `nodal seepage flux ${flux.nodeId}.flowM3PerSPerM`);
    loads[nodeIndex] += flowM3PerSPerM;
  }

  const elementGaussCache: Array<{
    element: FemPlaneStrainQuad4Element;
    globalNodes: number[];
    areaM2: number;
    thicknessM: number;
    gauss: ReturnType<typeof hydraulicElementMatrices>['gauss'];
  }> = [];

  for (const element of model.elements) {
    if (!Array.isArray(element.nodeIds) || element.nodeIds.length !== 4) {
      throw new Error(`Plane-strain seepage element ${element.id} must reference exactly four nodes.`);
    }
    if (new Set(element.nodeIds).size !== 4) {
      throw new Error(`Plane-strain seepage element ${element.id} has duplicate node references.`);
    }
    assertNonEmptyId(element.materialId, `element ${element.id} material`);
    const nodeIndices = element.nodeIds.map((id) => {
      const index = nodeIndexById.get(id);
      if (index == null) throw new Error(`Unknown seepage element node: ${id}.`);
      return index;
    });
    const material = materialById.get(element.materialId);
    if (!material) throw new Error(`Unknown seepage element material: ${element.materialId}.`);
    const thicknessM = element.thicknessM ?? model.defaultThicknessM ?? 1;
    assertFinitePositive(thicknessM, `element ${element.id} thicknessM`);
    const nodes = nodeIndices.map((index) => model.nodes[index]);
    const elementData = hydraulicElementMatrices({ nodes, material, thicknessM });
    for (let localRow = 0; localRow < 4; localRow += 1) {
      for (let localCol = 0; localCol < 4; localCol += 1) {
        conductivity[nodeIndices[localRow]][nodeIndices[localCol]] += elementData.conductivity[localRow][localCol];
      }
    }
    elementGaussCache.push({
      element,
      globalNodes: nodeIndices,
      areaM2: elementData.areaM2,
      thicknessM,
      gauss: elementData.gauss,
    });
  }

  const prescribed = new Map<number, number>();
  for (const bc of model.headBoundaryConditions) {
    const nodeIndex = nodeIndexById.get(bc.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown hydraulic head boundary node: ${bc.nodeId}.`);
    assertFinite(bc.headM, `head boundary ${bc.nodeId}.headM`);
    const existing = prescribed.get(nodeIndex);
    if (existing != null && Math.abs(existing - bc.headM) > 1e-12) {
      throw new Error(`Conflicting hydraulic head boundary condition for ${bc.nodeId}.`);
    }
    prescribed.set(nodeIndex, bc.headM);
  }
  if (prescribed.size < 2) {
    throw new Error('Plane-strain seepage model requires at least two hydraulic head boundary conditions.');
  }

  const freeDofs = Array.from({ length: headDofCount }, (_, index) => index).filter((index) => !prescribed.has(index));
  const heads = new Array<number>(headDofCount).fill(0);
  for (const [index, value] of prescribed) heads[index] = value;
  if (freeDofs.length > 0) {
    const reducedK = freeDofs.map((row) => freeDofs.map((col) => conductivity[row][col]));
    const reducedF = freeDofs.map((row) => loads[row] - [...prescribed.entries()]
      .reduce((sum, [col, value]) => sum + conductivity[row][col] * value, 0));
    const solved = solveDenseLinearSystem(reducedK, reducedF);
    for (const [index, dof] of freeDofs.entries()) heads[dof] = solved[index];
  }

  const internal = matVec(conductivity, heads);
  const residual = internal.map((value, index) => value - loads[index]);
  const maxFreeMassResidualM3PerS = freeDofs.length > 0
    ? Math.max(...freeDofs.map((index) => Math.abs(residual[index])))
    : 0;
  const boundaryResiduals = Array.from(prescribed.keys()).map((index) => residual[index]);
  const totalPositiveBoundaryFluxM3PerS = boundaryResiduals
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const totalNegativeBoundaryFluxM3PerS = -boundaryResiduals
    .filter((value) => value < 0)
    .reduce((sum, value) => sum + value, 0);
  const boundaryFluxSum = boundaryResiduals.reduce((sum, value) => sum + value, 0);
  const netNodalFluxM3PerS = loads.reduce((sum, value) => sum + value, 0);
  const massScale = Math.max(
    totalPositiveBoundaryFluxM3PerS,
    totalNegativeBoundaryFluxM3PerS,
    Math.abs(netNodalFluxM3PerS),
    1e-12,
  );
  const massBalanceErrorRatio = Math.abs(boundaryFluxSum + netNodalFluxM3PerS) / massScale;
  let maxPorePressureKpa = 0;
  let maxEffectiveStressReductionKpa = 0;

  const elementOutputs = elementGaussCache.map((entry) => {
    const gaussPoints: FemPlaneStrainSeepageGaussPointResult[] = entry.gauss.map((point, index) => {
      const localHeads = entry.globalNodes.map((nodeIndex) => heads[nodeIndex]);
      const localNodes = entry.globalNodes.map((nodeIndex) => model.nodes[nodeIndex]);
      const headM = point.shape.reduce((sum, shape, node) => sum + shape * localHeads[node], 0);
      const elevationM = point.shape.reduce((sum, shape, node) => sum + shape * localNodes[node].yM, 0);
      const gradientX = point.dNdx.reduce((sum, dNdx, node) => sum + dNdx * localHeads[node], 0);
      const gradientY = point.dNdy.reduce((sum, dNdy, node) => sum + dNdy * localHeads[node], 0);
      const porePressureKpa = Math.max(0, (headM - elevationM) * gammaWaterKpaPerM);
      const effectiveStressReductionKpa = point.biotCoefficient * porePressureKpa;
      maxPorePressureKpa = Math.max(maxPorePressureKpa, porePressureKpa);
      maxEffectiveStressReductionKpa = Math.max(maxEffectiveStressReductionKpa, effectiveStressReductionKpa);
      return {
        elementId: entry.element.id,
        gaussPoint: index + 1,
        xi: round(point.xi, 10),
        eta: round(point.eta, 10),
        detJ: round(point.detJ, 10),
        headM: round(headM, 10),
        elevationM: round(elevationM, 10),
        porePressureKpa: round(porePressureKpa, 8),
        hydraulicGradient: [round(gradientX, 12), round(gradientY, 12)],
        darcyFluxMPerS: [
          Number((-point.kxMPerS * gradientX).toExponential(12)),
          Number((-point.kyMPerS * gradientY).toExponential(12)),
        ],
        biotCoefficient: round(point.biotCoefficient, 8),
        effectiveStressReductionKpa: round(effectiveStressReductionKpa, 8),
      };
    });
    return {
      id: entry.element.id,
      areaM2: round(entry.areaM2, 10),
      thicknessM: round(entry.thicknessM, 10),
      gaussPoints,
    };
  });

  const nodes = model.nodes.map((node, index) => {
    const porePressureKpa = Math.max(0, (heads[index] - node.yM) * gammaWaterKpaPerM);
    maxPorePressureKpa = Math.max(maxPorePressureKpa, porePressureKpa);
    return {
      ...node,
      headM: round(heads[index], 10),
      porePressureKpa: round(porePressureKpa, 8),
      hydraulicResidualM3PerS: Number(residual[index].toExponential(12)),
    };
  });

  return {
    schemaVersion: 'fem-plane-strain-seepage-result.v1',
    method: 'quad4-plane-strain-steady-darcy-seepage',
    nodes,
    elements: elementOutputs,
    headDofCount,
    freeHeadDofCount: freeDofs.length,
    constrainedHeadDofCount: prescribed.size,
    maxFreeMassResidualM3PerS: Number(maxFreeMassResidualM3PerS.toExponential(12)),
    totalPositiveBoundaryFluxM3PerS: Number(totalPositiveBoundaryFluxM3PerS.toExponential(12)),
    totalNegativeBoundaryFluxM3PerS: Number(totalNegativeBoundaryFluxM3PerS.toExponential(12)),
    netNodalFluxM3PerS: Number(netNodalFluxM3PerS.toExponential(12)),
    massBalanceErrorRatio: round(massBalanceErrorRatio, 12),
    maxPorePressureKpa: round(maxPorePressureKpa, 8),
    maxEffectiveStressReductionKpa: round(maxEffectiveStressReductionKpa, 8),
    converged: maxFreeMassResidualM3PerS <= policy.porePressureMassBalanceTolerance &&
      massBalanceErrorRatio <= policy.porePressureMassBalanceTolerance,
    policy,
    limitations: [
      'Benchmark-scale steady saturated Darcy seepage evidence kernel only.',
      'Solves hydraulic head on the Quad4 mesh and reports pore-pressure/effective-stress reduction metadata, but it does not add pore-pressure DOFs to the mechanical stiffness matrix.',
      'No transient 2D/3D Biot consolidation, unsaturated flow, uplift/piping design acceptance, production sparse solver, or route-backed result manifest is provided.',
    ],
  };
}

export function runPlaneStrainBiotConsolidation(
  model: FemPlaneStrainBiotConsolidationModel,
): FemPlaneStrainBiotConsolidationResult {
  if (model.schemaVersion !== 'fem-plane-strain-biot-consolidation-model.v1') {
    throw new Error('Only fem-plane-strain-biot-consolidation-model.v1 is supported.');
  }
  assertArray(model.nodes, 'nodes');
  assertArray(model.elements, 'elements');
  assertArray(model.materials, 'materials');
  assertArray(model.boundaryConditions, 'boundaryConditions');
  assertArray(model.porePressureBoundaryConditions, 'porePressureBoundaryConditions');
  assertArray(model.timeStepsSeconds, 'timeStepsSeconds');
  if (model.nodes.length < 4) throw new Error('Plane-strain Biot consolidation model requires at least four nodes.');
  if (model.elements.length < 1) throw new Error('Plane-strain Biot consolidation model requires at least one element.');
  if (model.materials.length < 1) throw new Error('Plane-strain Biot consolidation model requires at least one material.');
  if (model.timeStepsSeconds.length < 1) {
    throw new Error('Plane-strain Biot consolidation model requires at least one time step.');
  }
  if (model.defaultThicknessM != null) assertFinitePositive(model.defaultThicknessM, 'defaultThicknessM');
  if (model.nodalLoads != null) assertArray(model.nodalLoads, 'nodalLoads');
  if (model.nodalFluxes != null) assertArray(model.nodalFluxes, 'nodalFluxes');
  const gammaWaterKpaPerM = model.gammaWaterKpaPerM ?? 9.81;
  assertFinitePositive(gammaWaterKpaPerM, 'gammaWaterKpaPerM');
  const initialPorePressureKpa = model.initialPorePressureKpa ?? 0;
  assertFiniteNonNegative(initialPorePressureKpa, 'initialPorePressureKpa');
  assertUniqueIds(model.nodes, 'node');
  assertUniqueIds(model.materials, 'material');
  assertUniqueIds(model.elements, 'element');

  const policy = model.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  validateConvergencePolicy(policy);
  validateBiotTransientStepPolicy(model.timeStepsSeconds, policy);
  const nodeIndexById = new Map(model.nodes.map((node, index) => [node.id, index]));
  const materialById = new Map(model.materials.map((material) => [material.id, material]));
  const displacementDofCount = model.nodes.length * 2;
  const porePressureDofCount = model.nodes.length;
  if (displacementDofCount + porePressureDofCount > MAX_DENSE_DOF_COUNT) {
    throw new Error(`Plane-strain Biot consolidation dense assembly is capped at ${MAX_DENSE_DOF_COUNT} coupled DOFs for benchmark-scale evidence runs.`);
  }

  for (const node of model.nodes) {
    assertFinite(node.xM, `node ${node.id} xM`);
    assertFinite(node.yM, `node ${node.id} yM`);
  }
  for (const material of model.materials) {
    planeStrainD(material);
    validateBiotMaterial(material);
    if (material.unitWeightKnM3 != null) {
      assertFiniteNonNegative(material.unitWeightKnM3, `material ${material.id} unitWeightKnM3`);
    }
  }

  const stiffness = Array.from({ length: displacementDofCount }, () => new Array<number>(displacementDofCount).fill(0));
  const coupling = Array.from({ length: displacementDofCount }, () => new Array<number>(porePressureDofCount).fill(0));
  const pressureConductivity = Array.from({ length: porePressureDofCount }, () => new Array<number>(porePressureDofCount).fill(0));
  const pressureStorage = Array.from({ length: porePressureDofCount }, () => new Array<number>(porePressureDofCount).fill(0));
  const loads = new Array<number>(displacementDofCount).fill(0);
  const fluxes = new Array<number>(porePressureDofCount).fill(0);

  for (const load of model.nodalLoads ?? []) {
    const nodeIndex = nodeIndexById.get(load.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown nodal load node: ${load.nodeId}.`);
    const fxKn = load.fxKn ?? 0;
    const fyKn = load.fyKn ?? 0;
    assertFinite(fxKn, `nodal load ${load.nodeId}.fxKn`);
    assertFinite(fyKn, `nodal load ${load.nodeId}.fyKn`);
    loads[dofIndex(nodeIndex, 'ux')] += fxKn;
    loads[dofIndex(nodeIndex, 'uy')] += fyKn;
  }
  for (const flux of model.nodalFluxes ?? []) {
    const nodeIndex = nodeIndexById.get(flux.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown Biot nodal flux node: ${flux.nodeId}.`);
    const flowM3PerS = flux.flowM3PerS ?? 0;
    assertFinite(flowM3PerS, `nodal flux ${flux.nodeId}.flowM3PerS`);
    if (flowM3PerS < 0) {
      throw new Error(`nodal flux ${flux.nodeId}.flowM3PerS must be non-negative; extraction-driven suction is unsupported by this saturated excess-pressure Biot evidence kernel.`);
    }
    fluxes[nodeIndex] += flowM3PerS;
  }

  const elementGaussCache: Array<{
    element: FemPlaneStrainQuad4Element;
    globalDofs: number[];
    globalNodes: number[];
    mechanicalGauss: Array<{ xi: number; eta: number; detJ: number; b: number[][] }>;
    hydraulicGauss: ReturnType<typeof hydraulicElementMatrices>['gauss'];
    areaM2: number;
    thicknessM: number;
  }> = [];

  for (const element of model.elements) {
    if (!Array.isArray(element.nodeIds) || element.nodeIds.length !== 4) {
      throw new Error(`Plane-strain Biot element ${element.id} must reference exactly four nodes.`);
    }
    if (new Set(element.nodeIds).size !== 4) {
      throw new Error(`Plane-strain Biot element ${element.id} has duplicate node references.`);
    }
    assertNonEmptyId(element.materialId, `element ${element.id} material`);
    const nodeIndices = element.nodeIds.map((id) => {
      const index = nodeIndexById.get(id);
      if (index == null) throw new Error(`Unknown Biot element node: ${id}.`);
      return index;
    });
    const material = materialById.get(element.materialId);
    if (!material) throw new Error(`Unknown Biot element material: ${element.materialId}.`);
    const biotMaterial = validateBiotMaterial(material);
    const thicknessM = element.thicknessM ?? model.defaultThicknessM ?? 1;
    assertFinitePositive(thicknessM, `element ${element.id} thicknessM`);
    const nodes = nodeIndices.map((index) => model.nodes[index]);
    const mechanical = elementMatrices({ nodes, material, thicknessM });
    const hydraulic = hydraulicElementMatrices({ nodes, material, thicknessM });
    const globalDofs = nodeIndices.flatMap((index) => [dofIndex(index, 'ux'), dofIndex(index, 'uy')]);

    for (let localRow = 0; localRow < 8; localRow += 1) {
      for (let localCol = 0; localCol < 8; localCol += 1) {
        stiffness[globalDofs[localRow]][globalDofs[localCol]] += mechanical.stiffness[localRow][localCol];
      }
    }
    for (let localRow = 0; localRow < 4; localRow += 1) {
      for (let localCol = 0; localCol < 4; localCol += 1) {
        pressureConductivity[nodeIndices[localRow]][nodeIndices[localCol]] +=
          hydraulic.conductivity[localRow][localCol] / gammaWaterKpaPerM;
      }
    }
    for (const [gaussIndex, point] of mechanical.gauss.entries()) {
      const hydraulicPoint = hydraulic.gauss[gaussIndex];
      for (let localDof = 0; localDof < 8; localDof += 1) {
        const volumetricShapeDerivative = point.b[0][localDof] + point.b[1][localDof];
        for (let localPressure = 0; localPressure < 4; localPressure += 1) {
          coupling[globalDofs[localDof]][nodeIndices[localPressure]] +=
            biotMaterial.biotCoefficient *
            volumetricShapeDerivative *
            hydraulicPoint.shape[localPressure] *
            point.detJ *
            thicknessM;
        }
      }
      for (let localRow = 0; localRow < 4; localRow += 1) {
        for (let localCol = 0; localCol < 4; localCol += 1) {
          pressureStorage[nodeIndices[localRow]][nodeIndices[localCol]] +=
            (biotMaterial.specificStorage1PerM / gammaWaterKpaPerM) *
            hydraulicPoint.shape[localRow] *
            hydraulicPoint.shape[localCol] *
            point.detJ *
            thicknessM;
        }
      }
    }
    elementGaussCache.push({
      element,
      globalDofs,
      globalNodes: nodeIndices,
      mechanicalGauss: mechanical.gauss,
      hydraulicGauss: hydraulic.gauss,
      areaM2: mechanical.areaM2,
      thicknessM,
    });
  }

  const prescribedDisplacements = new Map<number, number>();
  for (const bc of model.boundaryConditions) {
    const nodeIndex = nodeIndexById.get(bc.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown boundary-condition node: ${bc.nodeId}.`);
    if (bc.dof !== 'ux' && bc.dof !== 'uy') {
      throw new Error(`Boundary condition ${bc.nodeId} dof must be ux or uy.`);
    }
    const index = dofIndex(nodeIndex, bc.dof);
    const value = bc.valueM ?? 0;
    assertFinite(value, `boundary condition ${bc.nodeId}.${bc.dof}`);
    const existing = prescribedDisplacements.get(index);
    if (existing != null && Math.abs(existing - value) > 1e-12) {
      throw new Error(`Conflicting boundary condition for ${bc.nodeId}.${bc.dof}.`);
    }
    prescribedDisplacements.set(index, value);
  }
  if (prescribedDisplacements.size === 0) {
    throw new Error('Plane-strain Biot model requires at least one displacement boundary condition.');
  }
  const constrainedNodeIds = new Set(model.boundaryConditions.map((bc) => bc.nodeId));
  const hasUxConstraint = model.boundaryConditions.some((bc) => bc.dof === 'ux');
  const hasUyConstraint = model.boundaryConditions.some((bc) => bc.dof === 'uy');
  if (prescribedDisplacements.size < 3 || constrainedNodeIds.size < 2 || !hasUxConstraint || !hasUyConstraint) {
    throw new Error('Plane-strain Biot model has insufficient displacement constraints to restrain rigid-body modes.');
  }

  const prescribedPressures = new Map<number, number>();
  for (const bc of model.porePressureBoundaryConditions) {
    const nodeIndex = nodeIndexById.get(bc.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown pore-pressure boundary node: ${bc.nodeId}.`);
    assertFiniteNonNegative(bc.porePressureKpa, `pore-pressure boundary ${bc.nodeId}.porePressureKpa`);
    const existing = prescribedPressures.get(nodeIndex);
    if (existing != null && Math.abs(existing - bc.porePressureKpa) > 1e-12) {
      throw new Error(`Conflicting pore-pressure boundary condition for ${bc.nodeId}.`);
    }
    prescribedPressures.set(nodeIndex, bc.porePressureKpa);
  }
  if (prescribedPressures.size === 0) {
    throw new Error('Plane-strain Biot consolidation model requires at least one pore-pressure boundary condition.');
  }

  const freeDisplacementDofs = Array.from({ length: displacementDofCount }, (_, index) => index)
    .filter((index) => !prescribedDisplacements.has(index));
  const freePressureDofs = Array.from({ length: porePressureDofCount }, (_, index) => index)
    .filter((index) => !prescribedPressures.has(index));
  const coupledUnknownCount = freeDisplacementDofs.length + freePressureDofs.length;
  const pressureUnknownOffset = freeDisplacementDofs.length;
  const displacement = new Array<number>(displacementDofCount).fill(0);
  const porePressure = new Array<number>(porePressureDofCount).fill(initialPorePressureKpa);
  for (const [index, value] of prescribedDisplacements) displacement[index] = value;
  for (const [index, value] of prescribedPressures) porePressure[index] = value;
  const pressureUpperBoundKpa = Math.max(initialPorePressureKpa, ...Array.from(prescribedPressures.values()));
  const averagePressure = (dofs: number[]) => dofs.length > 0
    ? dofs.reduce((sum, index) => sum + porePressure[index], 0) / dofs.length
    : 0;
  const initialAverageFreePorePressureKpa = averagePressure(freePressureDofs);
  let previousDisplacement = [...displacement];
  let previousPorePressure = [...porePressure];
  let lastMechanicalResidual = new Array<number>(displacementDofCount).fill(0);
  let lastPressureResidual = new Array<number>(porePressureDofCount).fill(0);
  let lastResidualNormRatio = 0;
  let lastMassBalanceErrorRatio = 0;
  let lastMaxFreeResidualKn = 0;
  let lastMaxFreePorePressureResidualM3PerS = 0;
  let lastFreePorePressureResidualL1M3PerS = 0;
  let lastPressureAudit: FemPlaneStrainBiotPressureAudit = {
    freePorePressureResidualL1M3PerS: 0,
    prescribedPorePressureResidualL1M3PerS: 0,
    netPrescribedPressureBoundaryFlowM3PerS: 0,
    appliedNodalFluxSumM3PerS: 0,
    storageRateSumM3PerS: 0,
    couplingRateSumM3PerS: 0,
    darcyFlowRateSumM3PerS: 0,
  };
  let lastPressureDiagnostics: FemPlaneStrainBiotPressureDiagnostics = {
    averagePorePressureKpa: round(porePressure.reduce((sum, value) => sum + value, 0) / porePressure.length, 8),
    averageFreePorePressureKpa: round(initialAverageFreePorePressureKpa, 8),
    porePressureDissipationRatio: 0,
    maxPorePressureChangeKpa: 0,
    maxPorePressureChangeRateKpaPerS: 0,
    pressureOvershootKpa: 0,
  };
  let lastMinPorePressureKpa = Math.min(...porePressure);
  let lastMaxPorePressureKpa = Math.max(...porePressure);

  const timeSteps: FemPlaneStrainBiotStepResult[] = [];
  let previousStepTime = 0;

  for (const [stepIndex, timeSeconds] of model.timeStepsSeconds.entries()) {
    const deltaTimeSeconds = timeSeconds - previousStepTime;
    previousStepTime = timeSeconds;
    for (const [index, value] of prescribedDisplacements) displacement[index] = value;
    for (const [index, value] of prescribedPressures) porePressure[index] = value;

    if (coupledUnknownCount > 0) {
      const matrix = Array.from({ length: coupledUnknownCount }, () => new Array<number>(coupledUnknownCount).fill(0));
      const rhs = new Array<number>(coupledUnknownCount).fill(0);

      for (const [rowIndex, globalDof] of freeDisplacementDofs.entries()) {
        for (const [colIndex, colDof] of freeDisplacementDofs.entries()) {
          matrix[rowIndex][colIndex] = stiffness[globalDof][colDof];
        }
        for (const [colIndex, pressureDof] of freePressureDofs.entries()) {
          matrix[rowIndex][pressureUnknownOffset + colIndex] = -coupling[globalDof][pressureDof];
        }
        rhs[rowIndex] = loads[globalDof];
        for (const [knownDof, value] of prescribedDisplacements) {
          rhs[rowIndex] -= stiffness[globalDof][knownDof] * value;
        }
        for (const [knownPressure, value] of prescribedPressures) {
          rhs[rowIndex] += coupling[globalDof][knownPressure] * value;
        }
      }

      for (const [rowPressureIndex, pressureDof] of freePressureDofs.entries()) {
        const rowIndex = pressureUnknownOffset + rowPressureIndex;
        for (const [colIndex, displacementDof] of freeDisplacementDofs.entries()) {
          matrix[rowIndex][colIndex] = coupling[displacementDof][pressureDof] / deltaTimeSeconds;
        }
        for (const [colIndex, colPressureDof] of freePressureDofs.entries()) {
          matrix[rowIndex][pressureUnknownOffset + colIndex] =
            pressureStorage[pressureDof][colPressureDof] / deltaTimeSeconds +
            pressureConductivity[pressureDof][colPressureDof];
        }
        rhs[rowIndex] = fluxes[pressureDof];
        for (let displacementDof = 0; displacementDof < displacementDofCount; displacementDof += 1) {
          rhs[rowIndex] += coupling[displacementDof][pressureDof] *
            previousDisplacement[displacementDof] /
            deltaTimeSeconds;
        }
        for (let colPressureDof = 0; colPressureDof < porePressureDofCount; colPressureDof += 1) {
          rhs[rowIndex] += pressureStorage[pressureDof][colPressureDof] *
            previousPorePressure[colPressureDof] /
            deltaTimeSeconds;
        }
        for (const [knownDof, value] of prescribedDisplacements) {
          rhs[rowIndex] -= coupling[knownDof][pressureDof] * value / deltaTimeSeconds;
        }
        for (const [knownPressure, value] of prescribedPressures) {
          rhs[rowIndex] -= (
            pressureStorage[pressureDof][knownPressure] / deltaTimeSeconds +
            pressureConductivity[pressureDof][knownPressure]
          ) * value;
        }
      }

      const solved = solveDenseLinearSystem(matrix, rhs);
      for (const [index, dof] of freeDisplacementDofs.entries()) displacement[dof] = solved[index];
      for (const [index, dof] of freePressureDofs.entries()) {
        porePressure[dof] = normalizeBiotPorePressure(
          solved[pressureUnknownOffset + index],
          `free pore-pressure DOF ${model.nodes[dof].id}`,
        );
      }
      for (const [index, value] of prescribedDisplacements) displacement[index] = value;
      for (const [index, value] of prescribedPressures) porePressure[index] = value;
    }

    const elasticInternal = matVec(stiffness, displacement);
    const couplingLoad = matVec(coupling, porePressure);
    const mechanicalInternal = elasticInternal.map((value, index) => value - couplingLoad[index]);
    const mechanicalResidual = mechanicalInternal.map((value, index) => value - loads[index]);
    const pressureResidual = new Array<number>(porePressureDofCount).fill(0);
    const pressureCouplingRate = new Array<number>(porePressureDofCount).fill(0);
    const pressureStorageRate = new Array<number>(porePressureDofCount).fill(0);
    const pressureDarcyFlow = new Array<number>(porePressureDofCount).fill(0);
    for (let row = 0; row < porePressureDofCount; row += 1) {
      for (let displacementDof = 0; displacementDof < displacementDofCount; displacementDof += 1) {
        pressureCouplingRate[row] += coupling[displacementDof][row] *
          (displacement[displacementDof] - previousDisplacement[displacementDof]) /
          deltaTimeSeconds;
      }
      for (let pressureDof = 0; pressureDof < porePressureDofCount; pressureDof += 1) {
        pressureStorageRate[row] += pressureStorage[row][pressureDof] *
          (porePressure[pressureDof] - previousPorePressure[pressureDof]) /
          deltaTimeSeconds;
        pressureDarcyFlow[row] += pressureConductivity[row][pressureDof] * porePressure[pressureDof];
      }
      pressureResidual[row] = pressureCouplingRate[row] +
        pressureStorageRate[row] +
        pressureDarcyFlow[row] -
        fluxes[row];
    }

    const maxFreeResidualKn = freeDisplacementDofs.length > 0
      ? Math.max(...freeDisplacementDofs.map((index) => Math.abs(mechanicalResidual[index])))
      : 0;
    const loadNorm = Math.max(
      Math.hypot(...loads),
      Math.hypot(...mechanicalInternal),
      Math.hypot(...couplingLoad),
      Math.hypot(...Array.from(prescribedDisplacements.keys()).map((index) => mechanicalResidual[index])),
      1,
    );
    const residualNormRatio = maxFreeResidualKn / loadNorm;
    const maxFreePorePressureResidualM3PerS = freePressureDofs.length > 0
      ? Math.max(...freePressureDofs.map((index) => Math.abs(pressureResidual[index])))
      : 0;
    const freePressureResidualSum = freePressureDofs
      .reduce((sum, index) => sum + Math.abs(pressureResidual[index]), 0);
    const prescribedPressureDofs = Array.from(prescribedPressures.keys());
    const prescribedPressureResidualL1 = prescribedPressureDofs
      .reduce((sum, index) => sum + Math.abs(pressureResidual[index]), 0);
    const pressureAudit: FemPlaneStrainBiotPressureAudit = {
      freePorePressureResidualL1M3PerS: Number(freePressureResidualSum.toExponential(12)),
      prescribedPorePressureResidualL1M3PerS: Number(prescribedPressureResidualL1.toExponential(12)),
      netPrescribedPressureBoundaryFlowM3PerS: Number(
        prescribedPressureDofs.reduce((sum, index) => sum + pressureResidual[index], 0).toExponential(12),
      ),
      appliedNodalFluxSumM3PerS: Number(fluxes.reduce((sum, value) => sum + value, 0).toExponential(12)),
      storageRateSumM3PerS: Number(pressureStorageRate.reduce((sum, value) => sum + value, 0).toExponential(12)),
      couplingRateSumM3PerS: Number(pressureCouplingRate.reduce((sum, value) => sum + value, 0).toExponential(12)),
      darcyFlowRateSumM3PerS: Number(pressureDarcyFlow.reduce((sum, value) => sum + value, 0).toExponential(12)),
    };
    const pressureScale = Math.max(
      Math.hypot(...fluxes),
      Math.hypot(...pressureResidual),
      Math.hypot(...Array.from(prescribedPressures.keys()).map((index) => pressureResidual[index])),
      1e-12,
    );
    const massBalanceErrorRatio = freePressureResidualSum / pressureScale;
    const minPorePressureKpa = Math.min(...porePressure);
    const maxPorePressureKpa = Math.max(...porePressure);
    const pressureOvershootKpa = Math.max(0, maxPorePressureKpa - pressureUpperBoundKpa);
    if (pressureOvershootKpa > 1e-6) {
      throw new Error(`Plane-strain Biot step ${stepIndex + 1} pore pressure exceeded the initial/prescribed pressure envelope by ${pressureOvershootKpa} kPa.`);
    }
    const averagePorePressureKpa = porePressure.reduce((sum, value) => sum + value, 0) / porePressure.length;
    const averageFreePorePressureKpa = averagePressure(freePressureDofs);
    const dissipationReferenceKpa = Math.max(initialAverageFreePorePressureKpa, 1e-12);
    const porePressureDissipationRatio = Math.min(
      1,
      Math.max(0, (initialAverageFreePorePressureKpa - averageFreePorePressureKpa) / dissipationReferenceKpa),
    );
    const maxPorePressureChangeKpa = Math.max(
      ...porePressure.map((value, index) => Math.abs(value - previousPorePressure[index])),
    );
    const pressureDiagnostics: FemPlaneStrainBiotPressureDiagnostics = {
      averagePorePressureKpa: round(averagePorePressureKpa, 8),
      averageFreePorePressureKpa: round(averageFreePorePressureKpa, 8),
      porePressureDissipationRatio: round(porePressureDissipationRatio, 12),
      maxPorePressureChangeKpa: round(maxPorePressureChangeKpa, 8),
      maxPorePressureChangeRateKpaPerS: Number((maxPorePressureChangeKpa / deltaTimeSeconds).toExponential(12)),
      pressureOvershootKpa: round(pressureOvershootKpa, 8),
    };
    const maxVerticalSettlementM = Math.max(0, -Math.min(...model.nodes.map((_, index) => displacement[dofIndex(index, 'uy')])));
    const converged = residualNormRatio <= policy.forceBalanceTolerance &&
      massBalanceErrorRatio <= policy.porePressureMassBalanceTolerance;

    timeSteps.push({
      step: stepIndex + 1,
      timeSeconds: round(timeSeconds, 8),
      deltaTimeSeconds: round(deltaTimeSeconds, 8),
      maxFreeResidualKn: round(maxFreeResidualKn, 12),
      residualNormRatio: round(residualNormRatio, 12),
      maxFreePorePressureResidualM3PerS: Number(maxFreePorePressureResidualM3PerS.toExponential(12)),
      freePorePressureResidualL1M3PerS: Number(freePressureResidualSum.toExponential(12)),
      massBalanceErrorRatio: round(massBalanceErrorRatio, 12),
      pressureAudit,
      pressureDiagnostics,
      minPorePressureKpa: round(minPorePressureKpa, 8),
      maxPorePressureKpa: round(maxPorePressureKpa, 8),
      maxVerticalSettlementM: round(maxVerticalSettlementM, 12),
      converged,
    });

    previousDisplacement = [...displacement];
    previousPorePressure = [...porePressure];
    lastMechanicalResidual = mechanicalResidual;
    lastPressureResidual = pressureResidual;
    lastResidualNormRatio = residualNormRatio;
    lastMassBalanceErrorRatio = massBalanceErrorRatio;
    lastMaxFreeResidualKn = maxFreeResidualKn;
    lastMaxFreePorePressureResidualM3PerS = maxFreePorePressureResidualM3PerS;
    lastFreePorePressureResidualL1M3PerS = freePressureResidualSum;
    lastPressureAudit = pressureAudit;
    lastPressureDiagnostics = pressureDiagnostics;
    lastMinPorePressureKpa = minPorePressureKpa;
    lastMaxPorePressureKpa = maxPorePressureKpa;
  }

  let maxBiotCouplingKpa = 0;
  const elementOutputs = elementGaussCache.map((entry) => {
    const material = materialById.get(entry.element.materialId)!;
    const d = planeStrainD(material);
    const elementDisplacement = entry.globalDofs.map((index) => displacement[index]);
    const localPressures = entry.globalNodes.map((index) => porePressure[index]);
    const gaussPoints: FemPlaneStrainBiotGaussPointResult[] = entry.mechanicalGauss.map((point, index) => {
      const hydraulicPoint = entry.hydraulicGauss[index];
      const strain = point.b.map((row) => row.reduce((sum, value, col) => sum + value * elementDisplacement[col], 0)) as [number, number, number];
      const effectiveStress = d.map((row) => row.reduce((sum, value, col) => sum + value * strain[col], 0)) as [number, number, number];
      const porePressureKpa = normalizeBiotPorePressure(
        hydraulicPoint.shape.reduce((sum, shape, node) => sum + shape * localPressures[node], 0),
        `element ${entry.element.id} gauss point ${index + 1} porePressureKpa`,
      );
      const biotStressReductionKpa = hydraulicPoint.biotCoefficient * porePressureKpa;
      const totalStress = [
        effectiveStress[0] - biotStressReductionKpa,
        effectiveStress[1] - biotStressReductionKpa,
        effectiveStress[2],
      ] as [number, number, number];
      const gradientX = hydraulicPoint.dNdx.reduce((sum, dNdx, node) => sum + dNdx * localPressures[node], 0);
      const gradientY = hydraulicPoint.dNdy.reduce((sum, dNdy, node) => sum + dNdy * localPressures[node], 0);
      maxBiotCouplingKpa = Math.max(maxBiotCouplingKpa, biotStressReductionKpa);
      return {
        elementId: entry.element.id,
        gaussPoint: index + 1,
        xi: round(point.xi, 10),
        eta: round(point.eta, 10),
        detJ: round(point.detJ, 10),
        strain: [round(strain[0], 12), round(strain[1], 12), round(strain[2], 12)],
        effectiveStressKpa: [
          round(effectiveStress[0], 8),
          round(effectiveStress[1], 8),
          round(effectiveStress[2], 8),
        ],
        totalStressKpa: [
          round(totalStress[0], 8),
          round(totalStress[1], 8),
          round(totalStress[2], 8),
        ],
        porePressureKpa: round(porePressureKpa, 8),
        biotCoefficient: round(hydraulicPoint.biotCoefficient, 8),
        biotStressReductionKpa: round(biotStressReductionKpa, 8),
        hydraulicGradientKpaPerM: [round(gradientX, 8), round(gradientY, 8)],
        darcyFluxMPerS: [
          Number((-(hydraulicPoint.kxMPerS / gammaWaterKpaPerM) * gradientX).toExponential(12)),
          Number((-(hydraulicPoint.kyMPerS / gammaWaterKpaPerM) * gradientY).toExponential(12)),
        ],
      };
    });
    return {
      id: entry.element.id,
      areaM2: round(entry.areaM2, 10),
      thicknessM: round(entry.thicknessM, 10),
      gaussPoints,
    };
  });

  return {
    schemaVersion: 'fem-plane-strain-biot-consolidation-result.v1',
    method: 'quad4-plane-strain-biot-u-p-backward-euler-evidence',
    numericalContract: {
      pressureKind: 'excess-pore-pressure',
      pressureUnit: 'kPa',
      pressureSignConvention: 'positive-compression-pore-pressure-only',
      unsupportedNegativePressurePolicy: 'reject-negative-free-pressure-solve',
      stressConvention: 'tension-positive-plane-strain-output',
      totalStressRelation: 'sigma_total_xx_yy = sigma_effective_xx_yy - alpha_B * p; shear unchanged',
      darcyFluxRelation: 'q = -k/gamma_water * grad(p)',
      storageConvention: 'specificStorage1PerM is head-based; pressure storage uses Ss / gamma_water',
      transientStepPolicy: 'fixed backward-Euler grid requires minAcceptedSteps and bounded step-growth ratio',
      maxTimeStepGrowthRatio: MAX_BIOT_TIME_STEP_GROWTH_RATIO,
      gammaWaterKpaPerM: round(gammaWaterKpaPerM, 8),
    },
    nodes: model.nodes.map((node, index) => ({
      ...node,
      uxM: round(displacement[dofIndex(index, 'ux')], 12),
      uyM: round(displacement[dofIndex(index, 'uy')], 12),
      porePressureKpa: round(porePressure[index], 8),
      rxnXKn: round(lastMechanicalResidual[dofIndex(index, 'ux')], 8),
      rxnYKn: round(lastMechanicalResidual[dofIndex(index, 'uy')], 8),
      porePressureResidualM3PerS: Number(lastPressureResidual[index].toExponential(12)),
    })),
    elements: elementOutputs,
    timeSteps,
    displacementDofCount,
    freeDisplacementDofCount: freeDisplacementDofs.length,
    constrainedDisplacementDofCount: prescribedDisplacements.size,
    porePressureDofCount,
    freePorePressureDofCount: freePressureDofs.length,
    constrainedPorePressureDofCount: prescribedPressures.size,
    coupledUnknownCount,
    maxBiotCouplingKpa: round(maxBiotCouplingKpa, 8),
    maxFreeResidualKn: round(lastMaxFreeResidualKn, 12),
    residualNormRatio: round(lastResidualNormRatio, 12),
    maxFreePorePressureResidualM3PerS: Number(lastMaxFreePorePressureResidualM3PerS.toExponential(12)),
    freePorePressureResidualL1M3PerS: Number(lastFreePorePressureResidualL1M3PerS.toExponential(12)),
    pressureAudit: lastPressureAudit,
    pressureDiagnostics: lastPressureDiagnostics,
    massBalanceErrorRatio: round(lastMassBalanceErrorRatio, 12),
    minPorePressureKpa: round(lastMinPorePressureKpa, 8),
    maxPorePressureKpa: round(lastMaxPorePressureKpa, 8),
    converged: timeSteps.every((step) => step.converged),
    productionReady: false,
    policy,
    limitations: [
      'Benchmark-scale saturated linear-elastic Quad4 Biot u-p evidence kernel only.',
      'Uses dense backward-Euler displacement/pore-pressure coupling with a coupled DOF cap; route-backed previews may wrap it in a manifest, but it is not a production sparse solver.',
      'Pore pressure is treated as excess pressure in kPa for deterministic evidence; groundwater elevation routing, unsaturated flow, uplift/piping design, nonlinear plasticity coupling, staged activation, and cross-solver validation are not provided.',
    ],
  };
}

export function runPlaneStrainQuad4Assembly(model: FemPlaneStrainModel): FemPlaneStrainAssemblyResult {
  if (model.schemaVersion !== 'fem-plane-strain-model.v1') {
    throw new Error('Only fem-plane-strain-model.v1 is supported.');
  }
  assertArray(model.nodes, 'nodes');
  assertArray(model.elements, 'elements');
  assertArray(model.materials, 'materials');
  assertArray(model.boundaryConditions, 'boundaryConditions');
  if (model.nodes.length < 4) throw new Error('Plane-strain model requires at least four nodes.');
  if (model.elements.length < 1) throw new Error('Plane-strain model requires at least one element.');
  if (model.materials.length < 1) throw new Error('Plane-strain model requires at least one material.');
  if (model.defaultThicknessM != null) assertFinitePositive(model.defaultThicknessM, 'defaultThicknessM');
  if (model.nodalLoads != null) assertArray(model.nodalLoads, 'nodalLoads');
  assertUniqueIds(model.nodes, 'node');
  assertUniqueIds(model.materials, 'material');
  assertUniqueIds(model.elements, 'element');
  const policy = model.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  validateConvergencePolicy(policy);
  const nodeIndexById = new Map(model.nodes.map((node, index) => [node.id, index]));
  const materialById = new Map(model.materials.map((material) => [material.id, material]));
  const dofCount = model.nodes.length * 2;
  if (dofCount > MAX_DENSE_DOF_COUNT) {
    throw new Error(`Plane-strain dense assembly is capped at ${MAX_DENSE_DOF_COUNT} DOFs for benchmark-scale evidence runs.`);
  }
  const stiffness = Array.from({ length: dofCount }, () => new Array<number>(dofCount).fill(0));
  const loads = new Array<number>(dofCount).fill(0);
  const elementResults: FemPlaneStrainAssemblyResult['elements'] = [];

  for (const node of model.nodes) {
    assertFinite(node.xM, `node ${node.id} xM`);
    assertFinite(node.yM, `node ${node.id} yM`);
  }
  for (const material of model.materials) {
    planeStrainD(material);
    if (material.unitWeightKnM3 != null) {
      assertFiniteNonNegative(material.unitWeightKnM3, `material ${material.id} unitWeightKnM3`);
    }
  }
  for (const load of model.nodalLoads ?? []) {
    const nodeIndex = nodeIndexById.get(load.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown nodal load node: ${load.nodeId}.`);
    const fxKn = load.fxKn ?? 0;
    const fyKn = load.fyKn ?? 0;
    assertFinite(fxKn, `nodal load ${load.nodeId}.fxKn`);
    assertFinite(fyKn, `nodal load ${load.nodeId}.fyKn`);
    loads[dofIndex(nodeIndex, 'ux')] += fxKn;
    loads[dofIndex(nodeIndex, 'uy')] += fyKn;
  }

  const elementGaussCache: Array<{
    element: FemPlaneStrainQuad4Element;
    globalDofs: number[];
    gauss: Array<{ xi: number; eta: number; detJ: number; b: number[][] }>;
    areaM2: number;
    thicknessM: number;
  }> = [];

  for (const element of model.elements) {
    if (!Array.isArray(element.nodeIds) || element.nodeIds.length !== 4) {
      throw new Error(`Plane-strain element ${element.id} must reference exactly four nodes.`);
    }
    if (new Set(element.nodeIds).size !== 4) {
      throw new Error(`Plane-strain element ${element.id} has duplicate node references.`);
    }
    assertNonEmptyId(element.materialId, `element ${element.id} material`);
    const nodeIndices = element.nodeIds.map((id) => {
      const index = nodeIndexById.get(id);
      if (index == null) throw new Error(`Unknown element node: ${id}.`);
      return index;
    });
    const material = materialById.get(element.materialId);
    if (!material) throw new Error(`Unknown element material: ${element.materialId}.`);
    const thicknessM = element.thicknessM ?? model.defaultThicknessM ?? 1;
    assertFinitePositive(thicknessM, `element ${element.id} thicknessM`);
    const nodes = nodeIndices.map((index) => model.nodes[index]);
    const elementData = elementMatrices({ nodes, material, thicknessM });
    const globalDofs = nodeIndices.flatMap((index) => [dofIndex(index, 'ux'), dofIndex(index, 'uy')]);
    for (let localRow = 0; localRow < 8; localRow += 1) {
      for (let localCol = 0; localCol < 8; localCol += 1) {
        stiffness[globalDofs[localRow]][globalDofs[localCol]] += elementData.stiffness[localRow][localCol];
      }
    }
    elementGaussCache.push({
      element,
      globalDofs,
      gauss: elementData.gauss,
      areaM2: elementData.areaM2,
      thicknessM,
    });
  }

  const prescribed = new Map<number, number>();
  for (const bc of model.boundaryConditions) {
    const nodeIndex = nodeIndexById.get(bc.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown boundary-condition node: ${bc.nodeId}.`);
    if (bc.dof !== 'ux' && bc.dof !== 'uy') {
      throw new Error(`Boundary condition ${bc.nodeId} dof must be ux or uy.`);
    }
    const index = dofIndex(nodeIndex, bc.dof);
    const value = bc.valueM ?? 0;
    assertFinite(value, `boundary condition ${bc.nodeId}.${bc.dof}`);
    const existing = prescribed.get(index);
    if (existing != null && Math.abs(existing - value) > 1e-12) {
      throw new Error(`Conflicting boundary condition for ${bc.nodeId}.${bc.dof}.`);
    }
    prescribed.set(index, value);
  }
  if (prescribed.size === 0) throw new Error('Plane-strain model requires at least one displacement boundary condition.');
  const constrainedNodeIds = new Set(model.boundaryConditions.map((bc) => bc.nodeId));
  const hasUxConstraint = model.boundaryConditions.some((bc) => bc.dof === 'ux');
  const hasUyConstraint = model.boundaryConditions.some((bc) => bc.dof === 'uy');
  if (prescribed.size < 3 || constrainedNodeIds.size < 2 || !hasUxConstraint || !hasUyConstraint) {
    throw new Error('Plane-strain model has insufficient displacement constraints to restrain rigid-body modes.');
  }

  const freeDofs = Array.from({ length: dofCount }, (_, index) => index).filter((index) => !prescribed.has(index));
  const displacement = new Array<number>(dofCount).fill(0);
  for (const [index, value] of prescribed) displacement[index] = value;

  if (freeDofs.length > 0) {
    const reducedK = freeDofs.map((row) => freeDofs.map((col) => stiffness[row][col]));
    const reducedF = freeDofs.map((row) => loads[row] - [...prescribed.entries()]
      .reduce((sum, [col, value]) => sum + stiffness[row][col] * value, 0));
    const solved = solveDenseLinearSystem(reducedK, reducedF);
    for (const [index, dof] of freeDofs.entries()) displacement[dof] = solved[index];
  }

  const internal = matVec(stiffness, displacement);
  const residual = internal.map((value, index) => value - loads[index]);
  const maxFreeResidualKn = freeDofs.length > 0
    ? Math.max(...freeDofs.map((index) => Math.abs(residual[index])))
    : 0;
  const loadNorm = Math.max(
    Math.hypot(...loads),
    Math.hypot(...internal),
    Math.hypot(...Array.from(prescribed.keys()).map((index) => residual[index])),
    1,
  );
  const residualNormRatio = maxFreeResidualKn / loadNorm;
  const externalLoadSumX = loads.filter((_, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0);
  const externalLoadSumY = loads.filter((_, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0);
  const reactionSumX = Array.from(prescribed.keys())
    .filter((index) => index % 2 === 0)
    .reduce((sum, index) => sum + residual[index], 0);
  const reactionSumY = Array.from(prescribed.keys())
    .filter((index) => index % 2 === 1)
    .reduce((sum, index) => sum + residual[index], 0);
  const balanceError = Math.hypot(reactionSumX + externalLoadSumX, reactionSumY + externalLoadSumY);
  const balanceScale = Math.max(
    Math.hypot(reactionSumX, reactionSumY),
    Math.hypot(externalLoadSumX, externalLoadSumY),
    1,
  );
  const reactionBalanceRatio = 1 - balanceError / balanceScale;

  const elementOutputs = elementGaussCache.map((entry) => {
    const material = materialById.get(entry.element.materialId)!;
    const d = planeStrainD(material);
    const elementDisplacement = entry.globalDofs.map((index) => displacement[index]);
    const gaussPoints: FemPlaneStrainGaussPointResult[] = entry.gauss.map((point, index) => {
      const strain = point.b.map((row) => row.reduce((sum, value, col) => sum + value * elementDisplacement[col], 0)) as [number, number, number];
      const stress = d.map((row) => row.reduce((sum, value, col) => sum + value * strain[col], 0)) as [number, number, number];
      return {
        elementId: entry.element.id,
        gaussPoint: index + 1,
        xi: round(point.xi, 10),
        eta: round(point.eta, 10),
        detJ: round(point.detJ, 10),
        strain: [round(strain[0], 12), round(strain[1], 12), round(strain[2], 12)],
        stressKpa: [round(stress[0], 8), round(stress[1], 8), round(stress[2], 8)],
      };
    });
    return {
      id: entry.element.id,
      areaM2: round(entry.areaM2, 10),
      thicknessM: round(entry.thicknessM, 10),
      gaussPoints,
    };
  });

  return {
    schemaVersion: 'fem-plane-strain-assembly-result.v1',
    method: 'quad4-plane-strain-linear-elastic-global-assembly',
    nodes: model.nodes.map((node, index) => ({
      ...node,
      uxM: round(displacement[dofIndex(index, 'ux')], 12),
      uyM: round(displacement[dofIndex(index, 'uy')], 12),
      rxnXKn: round(residual[dofIndex(index, 'ux')], 8),
      rxnYKn: round(residual[dofIndex(index, 'uy')], 8),
    })),
    elements: elementOutputs,
    dofCount,
    freeDofCount: freeDofs.length,
    constrainedDofCount: prescribed.size,
    maxFreeResidualKn: round(maxFreeResidualKn, 12),
    residualNormRatio: round(residualNormRatio, 12),
    reactionBalanceRatio: round(reactionBalanceRatio, 12),
    strainEnergyKnM: round(0.5 * dot(displacement, internal), 12),
    converged: residualNormRatio <= policy.forceBalanceTolerance,
    policy,
  };
}

interface PlaneStrainAssemblySystem {
  policy: FemConvergencePolicy;
  materialById: Map<string, FemPlaneStrainMaterial>;
  stiffness?: number[][];
  stiffnessTriplets: FemSparseTriplet[];
  loads: number[];
  prescribed: Map<number, number>;
  freeDofs: number[];
  dofCount: number;
  elementGaussCache: Array<{
    element: FemPlaneStrainQuad4Element;
    globalDofs: number[];
    gauss: Array<{ xi: number; eta: number; detJ: number; b: number[][] }>;
    areaM2: number;
    thicknessM: number;
  }>;
}

function assemblePlaneStrainSystem(
  model: FemPlaneStrainModel,
  options: { storage?: 'dense-and-triplets' | 'triplets-only' } = {},
): PlaneStrainAssemblySystem {
  if (model.schemaVersion !== 'fem-plane-strain-model.v1') {
    throw new Error('Only fem-plane-strain-model.v1 is supported.');
  }
  assertArray(model.nodes, 'nodes');
  assertArray(model.elements, 'elements');
  assertArray(model.materials, 'materials');
  assertArray(model.boundaryConditions, 'boundaryConditions');
  if (model.nodes.length < 4) throw new Error('Plane-strain model requires at least four nodes.');
  if (model.elements.length < 1) throw new Error('Plane-strain model requires at least one element.');
  if (model.materials.length < 1) throw new Error('Plane-strain model requires at least one material.');
  if (model.defaultThicknessM != null) assertFinitePositive(model.defaultThicknessM, 'defaultThicknessM');
  if (model.nodalLoads != null) assertArray(model.nodalLoads, 'nodalLoads');
  assertUniqueIds(model.nodes, 'node');
  assertUniqueIds(model.materials, 'material');
  assertUniqueIds(model.elements, 'element');

  const policy = model.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  validateConvergencePolicy(policy);
  const nodeIndexById = new Map(model.nodes.map((node, index) => [node.id, index]));
  const materialById = new Map(model.materials.map((material) => [material.id, material]));
  const dofCount = model.nodes.length * 2;
  const storage = options.storage ?? 'dense-and-triplets';
  if (storage === 'dense-and-triplets' && dofCount > MAX_DENSE_DOF_COUNT) {
    throw new Error(`Plane-strain dense assembly is capped at ${MAX_DENSE_DOF_COUNT} DOFs for benchmark-scale evidence runs.`);
  }
  if (storage === 'triplets-only' && dofCount > MAX_SPARSE_EXPERIMENTAL_DOF_COUNT) {
    throw new Error(`Plane-strain sparse experimental assembly is capped at ${MAX_SPARSE_EXPERIMENTAL_DOF_COUNT} DOFs until production solver benchmarks are approved.`);
  }

  const stiffness = storage === 'dense-and-triplets'
    ? Array.from({ length: dofCount }, () => new Array<number>(dofCount).fill(0))
    : undefined;
  const stiffnessTriplets: FemSparseTriplet[] = [];
  const loads = new Array<number>(dofCount).fill(0);

  for (const node of model.nodes) {
    assertFinite(node.xM, `node ${node.id} xM`);
    assertFinite(node.yM, `node ${node.id} yM`);
  }
  for (const material of model.materials) {
    planeStrainD(material);
    druckerPragerParameters(material);
    if (material.unitWeightKnM3 != null) {
      assertFiniteNonNegative(material.unitWeightKnM3, `material ${material.id} unitWeightKnM3`);
    }
  }
  for (const load of model.nodalLoads ?? []) {
    const nodeIndex = nodeIndexById.get(load.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown nodal load node: ${load.nodeId}.`);
    const fxKn = load.fxKn ?? 0;
    const fyKn = load.fyKn ?? 0;
    assertFinite(fxKn, `nodal load ${load.nodeId}.fxKn`);
    assertFinite(fyKn, `nodal load ${load.nodeId}.fyKn`);
    loads[dofIndex(nodeIndex, 'ux')] += fxKn;
    loads[dofIndex(nodeIndex, 'uy')] += fyKn;
  }

  const elementGaussCache: PlaneStrainAssemblySystem['elementGaussCache'] = [];
  for (const element of model.elements) {
    if (!Array.isArray(element.nodeIds) || element.nodeIds.length !== 4) {
      throw new Error(`Plane-strain element ${element.id} must reference exactly four nodes.`);
    }
    if (new Set(element.nodeIds).size !== 4) {
      throw new Error(`Plane-strain element ${element.id} has duplicate node references.`);
    }
    assertNonEmptyId(element.materialId, `element ${element.id} material`);
    const nodeIndices = element.nodeIds.map((id) => {
      const index = nodeIndexById.get(id);
      if (index == null) throw new Error(`Unknown element node: ${id}.`);
      return index;
    });
    const material = materialById.get(element.materialId);
    if (!material) throw new Error(`Unknown element material: ${element.materialId}.`);
    const thicknessM = element.thicknessM ?? model.defaultThicknessM ?? 1;
    assertFinitePositive(thicknessM, `element ${element.id} thicknessM`);
    const nodes = nodeIndices.map((index) => model.nodes[index]);
    const elementData = elementMatrices({ nodes, material, thicknessM });
    const globalDofs = nodeIndices.flatMap((index) => [dofIndex(index, 'ux'), dofIndex(index, 'uy')]);
    for (let localRow = 0; localRow < 8; localRow += 1) {
      for (let localCol = 0; localCol < 8; localCol += 1) {
        const row = globalDofs[localRow];
        const col = globalDofs[localCol];
        const value = elementData.stiffness[localRow][localCol];
        stiffnessTriplets.push({ row, col, value });
        if (stiffness) stiffness[row][col] += value;
      }
    }
    elementGaussCache.push({
      element,
      globalDofs,
      gauss: elementData.gauss,
      areaM2: elementData.areaM2,
      thicknessM,
    });
  }

  const prescribed = new Map<number, number>();
  for (const bc of model.boundaryConditions) {
    const nodeIndex = nodeIndexById.get(bc.nodeId);
    if (nodeIndex == null) throw new Error(`Unknown boundary-condition node: ${bc.nodeId}.`);
    if (bc.dof !== 'ux' && bc.dof !== 'uy') {
      throw new Error(`Boundary condition ${bc.nodeId} dof must be ux or uy.`);
    }
    const index = dofIndex(nodeIndex, bc.dof);
    const value = bc.valueM ?? 0;
    assertFinite(value, `boundary condition ${bc.nodeId}.${bc.dof}`);
    const existing = prescribed.get(index);
    if (existing != null && Math.abs(existing - value) > 1e-12) {
      throw new Error(`Conflicting boundary condition for ${bc.nodeId}.${bc.dof}.`);
    }
    prescribed.set(index, value);
  }
  if (prescribed.size === 0) throw new Error('Plane-strain model requires at least one displacement boundary condition.');
  const constrainedNodeIds = new Set(model.boundaryConditions.map((bc) => bc.nodeId));
  const hasUxConstraint = model.boundaryConditions.some((bc) => bc.dof === 'ux');
  const hasUyConstraint = model.boundaryConditions.some((bc) => bc.dof === 'uy');
  if (prescribed.size < 3 || constrainedNodeIds.size < 2 || !hasUxConstraint || !hasUyConstraint) {
    throw new Error('Plane-strain model has insufficient displacement constraints to restrain rigid-body modes.');
  }

  const freeDofs = Array.from({ length: dofCount }, (_, index) => index).filter((index) => !prescribed.has(index));
  return {
    policy,
    materialById,
    stiffness,
    stiffnessTriplets,
    loads,
    prescribed,
    freeDofs,
    dofCount,
    elementGaussCache,
  };
}

function evaluatePlaneStrainDruckerPragerState(input: {
  system: PlaneStrainAssemblySystem;
  displacement: number[];
  loadFactor: number;
}): {
  internal: number[];
  residual: number[];
  maxFreeResidualKn: number;
  residualNormRatio: number;
  reactionBalanceRatio: number;
  maxYieldResidualRatio: number;
  maxEquivalentPlasticStrain: number;
  plasticGaussPointCount: number;
  elements: FemPlaneStrainDruckerPragerResult['elements'];
} {
  const { system, displacement, loadFactor } = input;
  const internal = new Array<number>(system.dofCount).fill(0);
  let maxYieldResidualRatio = 0;
  let maxEquivalentPlasticStrain = 0;
  let plasticGaussPointCount = 0;

  const elements = system.elementGaussCache.map((entry) => {
    const material = system.materialById.get(entry.element.materialId)!;
    const d = planeStrainD(material);
    const elementDisplacement = entry.globalDofs.map((index) => displacement[index]);
    const gaussPoints: FemPlaneStrainDruckerPragerGaussPointResult[] = entry.gauss.map((point, index) => {
      const strain = point.b.map((row) => row.reduce((sum, value, col) => sum + value * elementDisplacement[col], 0)) as [number, number, number];
      const elasticStress = d.map((row) => row.reduce((sum, value, col) => sum + value * strain[col], 0)) as [number, number, number];
      const projected = projectDruckerPragerStress({
        material,
        policy: system.policy,
        strain,
        stress: elasticStress,
        sigmaZKpa: planeStrainSigmaZ(material, strain),
      });
      maxYieldResidualRatio = Math.max(maxYieldResidualRatio, projected.yieldResidualRatio);
      maxEquivalentPlasticStrain = Math.max(maxEquivalentPlasticStrain, projected.equivalentPlasticStrain);
      if (projected.state === 'plastic') plasticGaussPointCount += 1;

      for (let localDof = 0; localDof < 8; localDof += 1) {
        const force = point.b.reduce(
          (sum, bRow, component) => sum + bRow[localDof] * projected.stressKpa[component],
          0,
        ) * point.detJ * entry.thicknessM;
        internal[entry.globalDofs[localDof]] += force;
      }

      return {
        elementId: entry.element.id,
        gaussPoint: index + 1,
        xi: round(point.xi, 10),
        eta: round(point.eta, 10),
        detJ: round(point.detJ, 10),
        strain: [
          round(projected.strain[0], 12),
          round(projected.strain[1], 12),
          round(projected.strain[2], 12),
        ] as [number, number, number],
        stressKpa: [
          round(projected.stressKpa[0], 8),
          round(projected.stressKpa[1], 8),
          round(projected.stressKpa[2], 8),
        ] as [number, number, number],
        outOfPlaneStressKpa: round(projected.outOfPlaneStressKpa, 8),
        compressionPositivePrincipalStressKpa: [
          round(projected.compressionPositivePrincipalStressKpa[0], 8),
          round(projected.compressionPositivePrincipalStressKpa[1], 8),
          round(projected.compressionPositivePrincipalStressKpa[2], 8),
        ] as [number, number, number],
        yieldValueKpa: round(projected.yieldValueKpa, 10),
        yieldResidualRatio: round(projected.yieldResidualRatio, 12),
        plasticMultiplier: round(projected.plasticMultiplier, 12),
        equivalentPlasticStrain: round(projected.equivalentPlasticStrain, 12),
        state: projected.state,
      };
    });
    return {
      id: entry.element.id,
      areaM2: round(entry.areaM2, 10),
      thicknessM: round(entry.thicknessM, 10),
      gaussPoints,
    };
  });

  const loadsAtStep = system.loads.map((load) => load * loadFactor);
  const residual = internal.map((value, index) => value - loadsAtStep[index]);
  const maxFreeResidualKn = system.freeDofs.length > 0
    ? Math.max(...system.freeDofs.map((index) => Math.abs(residual[index])))
    : 0;
  const loadNorm = Math.max(
    Math.hypot(...loadsAtStep),
    Math.hypot(...internal),
    Math.hypot(...Array.from(system.prescribed.keys()).map((index) => residual[index])),
    1,
  );
  const residualNormRatio = maxFreeResidualKn / loadNorm;
  const externalLoadSumX = loadsAtStep.filter((_, index) => index % 2 === 0).reduce((sum, value) => sum + value, 0);
  const externalLoadSumY = loadsAtStep.filter((_, index) => index % 2 === 1).reduce((sum, value) => sum + value, 0);
  const reactionSumX = Array.from(system.prescribed.keys())
    .filter((index) => index % 2 === 0)
    .reduce((sum, index) => sum + residual[index], 0);
  const reactionSumY = Array.from(system.prescribed.keys())
    .filter((index) => index % 2 === 1)
    .reduce((sum, index) => sum + residual[index], 0);
  const balanceError = Math.hypot(reactionSumX + externalLoadSumX, reactionSumY + externalLoadSumY);
  const balanceScale = Math.max(
    Math.hypot(reactionSumX, reactionSumY),
    Math.hypot(externalLoadSumX, externalLoadSumY),
    1,
  );
  const reactionBalanceRatio = 1 - balanceError / balanceScale;

  return {
    internal,
    residual,
    maxFreeResidualKn,
    residualNormRatio,
    reactionBalanceRatio,
    maxYieldResidualRatio,
    maxEquivalentPlasticStrain,
    plasticGaussPointCount,
    elements,
  };
}

function normalizeLoadStepFractions(loadStepFractions?: readonly number[]): number[] {
  const fractions = loadStepFractions && loadStepFractions.length > 0
    ? [...loadStepFractions]
    : [0.25, 0.5, 0.75, 1];
  let previous = 0;
  for (const [index, fraction] of fractions.entries()) {
    if (!Number.isFinite(fraction) || fraction <= previous || fraction > 1) {
      throw new Error(`loadStepFractions.${index} must be finite, increasing, and between 0 and 1.`);
    }
    previous = fraction;
  }
  if (fractions[fractions.length - 1] !== 1) {
    throw new Error('loadStepFractions must end at 1.');
  }
  return fractions;
}

function isDruckerPragerStepConverged(
  evaluation: ReturnType<typeof evaluatePlaneStrainDruckerPragerState>,
  policy: FemConvergencePolicy,
): boolean {
  return evaluation.residualNormRatio <= policy.forceBalanceTolerance &&
    evaluation.maxYieldResidualRatio <= policy.residualTolerance;
}

function druckerPragerResidualHistoryEntry(
  iteration: number,
  evaluation: ReturnType<typeof evaluatePlaneStrainDruckerPragerState>,
  policy: FemConvergencePolicy,
): FemPlaneStrainDruckerPragerResidualHistoryEntry {
  return {
    iteration,
    maxFreeResidualKn: round(evaluation.maxFreeResidualKn, 12),
    residualNormRatio: round(evaluation.residualNormRatio, 12),
    forceBalanceTolerance: policy.forceBalanceTolerance,
    reactionBalanceRatio: round(evaluation.reactionBalanceRatio, 12),
    maxYieldResidualRatio: round(evaluation.maxYieldResidualRatio, 12),
    yieldResidualTolerance: policy.residualTolerance,
    converged: isDruckerPragerStepConverged(evaluation, policy),
  };
}

function druckerPragerTerminationReason(
  evaluation: ReturnType<typeof evaluatePlaneStrainDruckerPragerState>,
  policy: FemConvergencePolicy,
  converged: boolean,
  iterations: number,
  linearSolverFailure?: FemPlaneStrainLinearSolverAudit,
): FemPlaneStrainDruckerPragerTerminationReason {
  if (converged) return 'converged';
  if (linearSolverFailure) return 'linear_solver_nonconverged';
  if (iterations >= policy.maxIterations) return 'max_iterations';
  if (evaluation.residualNormRatio > policy.forceBalanceTolerance) return 'force_residual_exceeded';
  return 'yield_residual_exceeded';
}

function normalizeLinearSolverKind(solver?: FemPlaneStrainLinearSolverKind): FemPlaneStrainLinearSolverKind {
  const resolved = solver ?? 'dense-gaussian';
  if (resolved !== 'dense-gaussian' && resolved !== 'sparse-csr-cg') {
    throw new Error('linearSolver must be dense-gaussian or sparse-csr-cg.');
  }
  return resolved;
}

function denseNonzeroCount(matrix: number[][]): number {
  return matrix.reduce(
    (count, row) => count + row.filter((value) => Math.abs(value) > 0).length,
    0,
  );
}

function buildReducedCsr(input: {
  freeDofs: readonly number[];
  triplets: readonly FemSparseTriplet[];
}): FemSparseCsrMatrix {
  const freeIndexByDof = new Map(input.freeDofs.map((dof, index) => [dof, index]));
  const reducedTriplets = input.triplets.flatMap((entry) => {
    const row = freeIndexByDof.get(entry.row);
    const col = freeIndexByDof.get(entry.col);
    return row != null && col != null ? [{ row, col, value: entry.value }] : [];
  });
  return buildCsrFromTriplets({
    rowCount: input.freeDofs.length,
    colCount: input.freeDofs.length,
    triplets: reducedTriplets,
    dropTolerance: 0,
  });
}

function solveDenseDruckerPragerCorrection(input: {
  reducedK: number[][];
  rhs: readonly number[];
  currentFreeDisplacement: readonly number[];
  tolerance: number;
  maxIterations: number;
}): { correction: number[]; audit: FemPlaneStrainLinearSolverAudit } {
  const correction = solveDenseLinearSystem(input.reducedK, [...input.rhs]);
  const solvedRhs = matVec(input.reducedK, correction);
  const residual = solvedRhs.map((value, index) => value - input.rhs[index]);
  const rhsNorm = Math.max(vectorNorm(input.rhs), 1);
  const finalResidualNorm = vectorNorm(residual);
  const correctionNorm = vectorNorm(correction);
  return {
    correction,
    audit: {
      schemaVersion: 'fem-plane-strain-linear-solver-audit.v1',
      solver: 'dense-gaussian',
      matrixDofCount: input.rhs.length,
      nonzeroCount: denseNonzeroCount(input.reducedK),
      iterations: input.rhs.length,
      tolerance: input.tolerance,
      maxIterations: input.maxIterations,
      initialResidualNorm: vectorNorm(input.rhs),
      finalResidualNorm,
      residualNormRatio: finalResidualNorm / rhsNorm,
      correctionNormM: correctionNorm,
      correctionNormRatio: correctionNorm / Math.max(vectorNorm(input.currentFreeDisplacement), 1e-12),
      converged: true,
    },
  };
}

function solveSparseDruckerPragerCorrection(input: {
  reducedK: FemSparseCsrMatrix;
  rhs: readonly number[];
  currentFreeDisplacement: readonly number[];
  tolerance: number;
  maxIterations: number;
}): { correction: number[]; audit: FemPlaneStrainLinearSolverAudit } {
  const solved = solveCsrConjugateGradient(input.reducedK, input.rhs, {
    tolerance: input.tolerance,
    maxIterations: input.maxIterations,
    preconditioner: 'jacobi',
  });
  const correctionNorm = vectorNorm(solved.solution);
  return {
    correction: solved.solution,
    audit: {
      schemaVersion: 'fem-plane-strain-linear-solver-audit.v1',
      solver: 'sparse-csr-cg',
      matrixDofCount: input.rhs.length,
      nonzeroCount: input.reducedK.nonzeroCount,
      iterations: solved.iterations,
      tolerance: solved.tolerance,
      maxIterations: solved.maxIterations,
      initialResidualNorm: solved.initialResidualNorm,
      finalResidualNorm: solved.finalResidualNorm,
      residualNormRatio: solved.residualNormRatio,
      correctionNormM: correctionNorm,
      correctionNormRatio: correctionNorm / Math.max(vectorNorm(input.currentFreeDisplacement), 1e-12),
      converged: solved.converged,
      ...(solved.failureReason ? { failureReason: solved.failureReason } : {}),
    },
  };
}

export function runPlaneStrainDruckerPragerLoadSteps(
  model: FemPlaneStrainModel,
  options: FemPlaneStrainDruckerPragerSolverOptions = {},
): FemPlaneStrainDruckerPragerResult {
  const linearSolver = normalizeLinearSolverKind(options.linearSolver);
  const system = assemblePlaneStrainSystem(model, {
    storage: linearSolver === 'sparse-csr-cg' ? 'triplets-only' : 'dense-and-triplets',
  });
  const loadStepFractions = normalizeLoadStepFractions(options.loadStepFractions);
  const linearSolverTolerance = options.linearSolverTolerance ?? Math.min(1e-10, system.policy.forceBalanceTolerance / 10);
  if (!Number.isFinite(linearSolverTolerance) || linearSolverTolerance <= 0) {
    throw new Error('linearSolverTolerance must be a finite positive number.');
  }
  const linearSolverMaxIterations = options.linearSolverMaxIterations ?? Math.max(100, system.freeDofs.length * 10);
  assertPositiveInteger(linearSolverMaxIterations, 'linearSolverMaxIterations');
  const reducedDenseK = linearSolver === 'dense-gaussian'
    ? system.freeDofs.map((row) => system.freeDofs.map((col) => system.stiffness![row][col]))
    : undefined;
  const reducedSparseK = linearSolver === 'sparse-csr-cg' && system.freeDofs.length > 0
    ? buildReducedCsr({
      freeDofs: system.freeDofs,
      triplets: system.stiffnessTriplets,
    })
    : undefined;
  const displacement = new Array<number>(system.dofCount).fill(0);
  let finalEvaluation: ReturnType<typeof evaluatePlaneStrainDruckerPragerState> | undefined;
  const loadSteps: FemPlaneStrainDruckerPragerStepResult[] = [];

  for (const [stepIndex, loadFactor] of loadStepFractions.entries()) {
    for (const [index, value] of system.prescribed) displacement[index] = value * loadFactor;
    let evaluation = evaluatePlaneStrainDruckerPragerState({ system, displacement, loadFactor });
    let iterations = 0;
    let converged = isDruckerPragerStepConverged(evaluation, system.policy);
    const residualHistory: FemPlaneStrainDruckerPragerResidualHistoryEntry[] = [
      druckerPragerResidualHistoryEntry(iterations, evaluation, system.policy),
    ];
    const linearSolverAudits: FemPlaneStrainLinearSolverAudit[] = [];
    let linearSolverFailure: FemPlaneStrainLinearSolverAudit | undefined;

    while (!converged && iterations < system.policy.maxIterations) {
      iterations += 1;
      if (system.freeDofs.length === 0) break;
      const correctionRhs = system.freeDofs.map((index) => -evaluation.residual[index]);
      const currentFreeDisplacement = system.freeDofs.map((index) => displacement[index]);
      const solved = linearSolver === 'sparse-csr-cg'
        ? solveSparseDruckerPragerCorrection({
          reducedK: reducedSparseK!,
          rhs: correctionRhs,
          currentFreeDisplacement,
          tolerance: linearSolverTolerance,
          maxIterations: linearSolverMaxIterations,
        })
        : solveDenseDruckerPragerCorrection({
          reducedK: reducedDenseK!,
          rhs: correctionRhs,
          currentFreeDisplacement,
          tolerance: linearSolverTolerance,
          maxIterations: linearSolverMaxIterations,
        });
      linearSolverAudits.push(solved.audit);
      if (!solved.audit.converged) {
        linearSolverFailure = solved.audit;
        break;
      }
      const correction = solved.correction;
      for (const [correctionIndex, dof] of system.freeDofs.entries()) {
        displacement[dof] += correction[correctionIndex];
      }
      for (const [index, value] of system.prescribed) displacement[index] = value * loadFactor;
      evaluation = evaluatePlaneStrainDruckerPragerState({ system, displacement, loadFactor });
      converged = isDruckerPragerStepConverged(evaluation, system.policy);
      residualHistory.push(druckerPragerResidualHistoryEntry(iterations, evaluation, system.policy));
    }

    finalEvaluation = evaluation;
    const terminationReason = druckerPragerTerminationReason(
      evaluation,
      system.policy,
      converged,
      iterations,
      linearSolverFailure,
    );
    const lastLinearAudit = linearSolverAudits.at(-1);
    loadSteps.push({
      step: stepIndex + 1,
      loadFactor: round(loadFactor, 8),
      iterations,
      maxFreeResidualKn: round(evaluation.maxFreeResidualKn, 12),
      residualNormRatio: round(evaluation.residualNormRatio, 12),
      reactionBalanceRatio: round(evaluation.reactionBalanceRatio, 12),
      maxYieldResidualRatio: round(evaluation.maxYieldResidualRatio, 12),
      maxEquivalentPlasticStrain: round(evaluation.maxEquivalentPlasticStrain, 12),
      plasticGaussPointCount: evaluation.plasticGaussPointCount,
      linearSolver,
      linearIterations: linearSolverAudits.reduce((sum, audit) => sum + audit.iterations, 0),
      linearResidualNormRatio: round(lastLinearAudit?.residualNormRatio ?? 0, 12),
      correctionNormRatio: round(lastLinearAudit?.correctionNormRatio ?? 0, 12),
      linearSolverAudits,
      converged,
      terminationReason,
      ...(linearSolverFailure?.failureReason ? { failureReason: linearSolverFailure.failureReason } : {}),
      residualHistory,
    });
  }

  if (!finalEvaluation) {
    throw new Error('Plane-strain nonlinear load-step solver requires at least one load step.');
  }
  const failedStep = loadSteps.find((step) => !step.converged);
  const status = failedStep ? 'nonconverged' : 'converged';

  return {
    schemaVersion: 'fem-plane-strain-drucker-prager-result.v1',
    method: 'quad4-plane-strain-drucker-prager-modified-newton',
    nodes: model.nodes.map((node, index) => ({
      ...node,
      uxM: round(displacement[dofIndex(index, 'ux')], 12),
      uyM: round(displacement[dofIndex(index, 'uy')], 12),
      rxnXKn: round(finalEvaluation.residual[dofIndex(index, 'ux')], 8),
      rxnYKn: round(finalEvaluation.residual[dofIndex(index, 'uy')], 8),
    })),
    elements: finalEvaluation.elements,
    dofCount: system.dofCount,
    freeDofCount: system.freeDofs.length,
    constrainedDofCount: system.prescribed.size,
    linearSolver,
    nonlinearAlgorithm: 'modified-newton',
    globalTangent: 'elastic',
    materialIntegration: 'total-strain-drucker-prager-projection',
    loadSteps,
    maxFreeResidualKn: round(finalEvaluation.maxFreeResidualKn, 12),
    residualNormRatio: round(finalEvaluation.residualNormRatio, 12),
    reactionBalanceRatio: round(finalEvaluation.reactionBalanceRatio, 12),
    maxYieldResidualRatio: round(finalEvaluation.maxYieldResidualRatio, 12),
    maxEquivalentPlasticStrain: round(finalEvaluation.maxEquivalentPlasticStrain, 12),
    plasticGaussPointCount: finalEvaluation.plasticGaussPointCount,
    converged: status === 'converged',
    status,
    ...(failedStep ? {
      failure: {
        step: failedStep.step,
        loadFactor: failedStep.loadFactor,
        terminationReason: failedStep.terminationReason,
        residualNormRatio: failedStep.residualNormRatio,
        maxYieldResidualRatio: failedStep.maxYieldResidualRatio,
        message: `Plane-strain Drucker-Prager load step ${failedStep.step} did not satisfy the configured convergence policy.`,
      },
    } : {}),
    policy: system.policy,
    limitations: [
      'Benchmark-scale modified-Newton plane-strain plasticity evidence kernel only.',
      ...(failedStep ? ['Nonconverged load-step result is reported fail-closed and must not be treated as an accepted engineering solve.'] : []),
      linearSolver === 'sparse-csr-cg'
        ? 'Uses an experimental CSR Conjugate Gradient linear solve audit, elastic global tangent, and Gauss-point Drucker-Prager stress projection; no production consistent tangent, hardening calibration, staged activation, pore-pressure DOF, or route-backed result manifest is provided.'
        : 'Uses elastic global tangent with Gauss-point Drucker-Prager stress projection; no production consistent tangent, production sparse solver, hardening calibration, staged activation, pore-pressure DOF, or route-backed result manifest is provided.',
      'Use for deterministic evidence and regression tests only until independent published/commercial benchmark comparison and licensed production approval gates are complete.',
    ],
  };
}

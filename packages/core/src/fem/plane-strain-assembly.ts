import { DEFAULT_FEM_CONVERGENCE_POLICY, type FemConvergencePolicy } from './engineering-evidence.js';

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
  converged: boolean;
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
  loadSteps: FemPlaneStrainDruckerPragerStepResult[];
  maxFreeResidualKn: number;
  residualNormRatio: number;
  reactionBalanceRatio: number;
  maxYieldResidualRatio: number;
  maxEquivalentPlasticStrain: number;
  plasticGaussPointCount: number;
  converged: boolean;
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

const GAUSS_POINTS: Array<[number, number, number]> = [
  [-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1],
  [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1],
  [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1],
  [-1 / Math.sqrt(3), 1 / Math.sqrt(3), 1],
];
const MAX_DENSE_DOF_COUNT = 800;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number.`);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
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
  stiffness: number[][];
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

function assemblePlaneStrainSystem(model: FemPlaneStrainModel): PlaneStrainAssemblySystem {
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
  return {
    policy,
    materialById,
    stiffness,
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

export function runPlaneStrainDruckerPragerLoadSteps(
  model: FemPlaneStrainModel,
  options: { loadStepFractions?: readonly number[] } = {},
): FemPlaneStrainDruckerPragerResult {
  const system = assemblePlaneStrainSystem(model);
  const loadStepFractions = normalizeLoadStepFractions(options.loadStepFractions);
  const reducedK = system.freeDofs.map((row) => system.freeDofs.map((col) => system.stiffness[row][col]));
  const displacement = new Array<number>(system.dofCount).fill(0);
  let finalEvaluation: ReturnType<typeof evaluatePlaneStrainDruckerPragerState> | undefined;
  const loadSteps: FemPlaneStrainDruckerPragerStepResult[] = [];

  for (const [stepIndex, loadFactor] of loadStepFractions.entries()) {
    for (const [index, value] of system.prescribed) displacement[index] = value * loadFactor;
    let evaluation = evaluatePlaneStrainDruckerPragerState({ system, displacement, loadFactor });
    let iterations = 0;
    let converged = evaluation.residualNormRatio <= system.policy.forceBalanceTolerance &&
      evaluation.maxYieldResidualRatio <= system.policy.residualTolerance;

    while (!converged && iterations < system.policy.maxIterations) {
      iterations += 1;
      if (system.freeDofs.length === 0) break;
      const correctionRhs = system.freeDofs.map((index) => -evaluation.residual[index]);
      const correction = solveDenseLinearSystem(reducedK, correctionRhs);
      for (const [correctionIndex, dof] of system.freeDofs.entries()) {
        displacement[dof] += correction[correctionIndex];
      }
      for (const [index, value] of system.prescribed) displacement[index] = value * loadFactor;
      evaluation = evaluatePlaneStrainDruckerPragerState({ system, displacement, loadFactor });
      converged = evaluation.residualNormRatio <= system.policy.forceBalanceTolerance &&
        evaluation.maxYieldResidualRatio <= system.policy.residualTolerance;
    }

    finalEvaluation = evaluation;
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
      converged,
    });
  }

  if (!finalEvaluation) {
    throw new Error('Plane-strain nonlinear load-step solver requires at least one load step.');
  }

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
    loadSteps,
    maxFreeResidualKn: round(finalEvaluation.maxFreeResidualKn, 12),
    residualNormRatio: round(finalEvaluation.residualNormRatio, 12),
    reactionBalanceRatio: round(finalEvaluation.reactionBalanceRatio, 12),
    maxYieldResidualRatio: round(finalEvaluation.maxYieldResidualRatio, 12),
    maxEquivalentPlasticStrain: round(finalEvaluation.maxEquivalentPlasticStrain, 12),
    plasticGaussPointCount: finalEvaluation.plasticGaussPointCount,
    converged: loadSteps.every((step) => step.converged),
    policy: system.policy,
    limitations: [
      'Benchmark-scale modified-Newton plane-strain plasticity evidence kernel only.',
      'Uses elastic global tangent with Gauss-point Drucker-Prager stress projection; no production consistent tangent, sparse solver, hardening calibration, staged activation, pore-pressure DOF, or route-backed result manifest is provided.',
      'Use for deterministic evidence and regression tests only until independent published/commercial benchmark comparison and licensed production approval gates are complete.',
    ],
  };
}

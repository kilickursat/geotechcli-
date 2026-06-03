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

function shapeDerivativesNatural(xi: number, eta: number): Array<[number, number]> {
  return [
    [-(1 - eta) / 4, -(1 - xi) / 4],
    [(1 - eta) / 4, -(1 + xi) / 4],
    [(1 + eta) / 4, (1 + xi) / 4],
    [-(1 + eta) / 4, (1 - xi) / 4],
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

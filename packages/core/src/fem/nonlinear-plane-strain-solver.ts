import { DEFAULT_FEM_CONVERGENCE_POLICY, type FemConvergencePolicy } from './engineering-evidence.js';
import {
  buildPlaneStrainRectangularMesh,
  runPlaneStrainDruckerPragerLoadSteps,
  type FemPlaneStrainDruckerPragerResult,
  type FemPlaneStrainModel,
} from './plane-strain-assembly.js';
import type {
  FemAnalysisCase,
  FemAssumption,
  FemResultManifest,
  FemSolverLoadStepConvergence,
  FemSolverResidualHistoryEntry,
} from './types.js';
import { validateFemAnalysisCase } from './validation.js';

const BACKEND_ID = 'builtin-plane-strain-dp-adaptive-v0';
const ANALYSIS_TYPE = 'static_2d_plane_strain_drucker_prager';

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstFinitePositive(values: Array<number | undefined>, fallback: number): number {
  for (const value of values) {
    if (Number.isFinite(value) && value! > 0) return value!;
  }
  return fallback;
}

function settlementColor(t: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [48, 86, 164],
    [46, 160, 196],
    [72, 187, 120],
    [232, 198, 75],
    [220, 95, 55],
    [162, 40, 70],
  ];
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(left + 1, stops.length - 1);
  const local = scaled - left;
  return [0, 1, 2].map((index) => {
    const value = stops[left][index] + (stops[right][index] - stops[left][index]) * local;
    return round(value / 255, 4);
  }) as [number, number, number];
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildPlaneStrainDpVisualization(
  caseFile: FemAnalysisCase,
  result: FemPlaneStrainDruckerPragerResult,
): FemResultManifest['visualization'] {
  const widthM = caseFile.geometry.domain.lengthM;
  const excavation = caseFile.geometry.excavation!;
  const nodeIndexById = new Map(result.nodes.map((node, index) => [node.id, index]));
  const maxSettlementM = Math.max(...result.nodes.map((node) => Math.max(0, -node.uyM)), 1e-12);
  const base: number[] = [];
  const disp: number[] = [];
  const color: number[] = [];
  const tri: number[] = [];
  const edge: number[] = [];
  const seenEdges = new Set<string>();

  for (const node of result.nodes) {
    const settlementM = Math.max(0, -node.uyM);
    const [r, g, b] = settlementColor(settlementM / maxSettlementM);
    base.push(round(node.xM - widthM / 2, 6), 0, round(-node.yM, 6));
    disp.push(round(node.uxM, 9), 0, round(-node.uyM, 9));
    color.push(r, g, b);
  }

  const elementNodeIds = result.elements.map((element) => {
    const source = element.id;
    const match = /^e-(\d+)-(\d+)$/.exec(source);
    if (!match) return undefined;
    const ix = Number(match[1]);
    const iy = Number(match[2]);
    return [
      `n-${ix}-${iy}`,
      `n-${ix + 1}-${iy}`,
      `n-${ix + 1}-${iy + 1}`,
      `n-${ix}-${iy + 1}`,
    ] as const;
  });

  for (const nodeIds of elementNodeIds) {
    if (!nodeIds) continue;
    const indexes = nodeIds.map((nodeId) => nodeIndexById.get(nodeId));
    if (indexes.some((index) => index == null)) continue;
    const [a, b, c, d] = indexes as [number, number, number, number];
    tri.push(a, b, c, a, c, d);
    for (const [left, right] of [[a, b], [b, c], [c, d], [d, a]] as const) {
      const key = edgeKey(left, right);
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edge.push(left, right);
      }
    }
  }

  const halfExcavationLength = excavation.lengthM / 2;
  const z = -excavation.finalDepthM;
  return {
    base,
    disp,
    color,
    tri,
    edge,
    outlineBase: [
      round(-halfExcavationLength, 6), 0, 0,
      round(halfExcavationLength, 6), 0, 0,
      round(halfExcavationLength, 6), 0, round(z, 6),
      round(-halfExcavationLength, 6), 0, round(z, 6),
    ],
    outlineDisp: new Array(12).fill(0),
    outlineIdx: [0, 1, 1, 2, 2, 3, 3, 0],
  };
}

function buildSolverConvergenceReport(
  result: FemPlaneStrainDruckerPragerResult,
): FemResultManifest['solverConvergence'] {
  const loadSteps: FemSolverLoadStepConvergence[] = result.loadSteps.map((step) => ({
    step: step.step,
    loadFactor: step.loadFactor,
    requestedLoadFactor: step.requestedLoadFactor,
    cutbackDepth: step.cutbackDepth,
    adaptiveCutback: step.adaptiveCutback,
    iterations: step.iterations,
    residualRatio: step.residualNormRatio,
    forceBalanceTolerance: result.policy.forceBalanceTolerance,
    yieldResidualRatio: step.maxYieldResidualRatio,
    residualTolerance: result.policy.residualTolerance,
    converged: step.converged,
    terminationReason: step.terminationReason,
    residualHistory: step.residualHistory.map((history): FemSolverResidualHistoryEntry => ({
      iteration: history.iteration,
      residualRatio: history.residualNormRatio,
      forceBalanceTolerance: history.forceBalanceTolerance,
      yieldResidualRatio: history.maxYieldResidualRatio,
      residualTolerance: history.yieldResidualTolerance,
      maxFreeResidualKn: history.maxFreeResidualKn,
      reactionBalanceRatio: history.reactionBalanceRatio,
      maxYieldResidualRatio: history.maxYieldResidualRatio,
      yieldResidualTolerance: history.yieldResidualTolerance,
      converged: history.converged,
    })),
  }));
  const failedStep = loadSteps.find((step) => !step.converged);
  return {
    schemaVersion: 'fem-solver-convergence-report.v1',
    status: failedStep ? 'nonconverged' : 'converged',
    policy: result.policy,
    loadSteps,
    ...(failedStep ? {
      failure: {
        step: failedStep.step,
        terminationReason: failedStep.terminationReason,
        residualRatio: failedStep.residualRatio,
        ...(failedStep.yieldResidualRatio != null ? { yieldResidualRatio: failedStep.yieldResidualRatio } : {}),
        message: `Plane-strain Drucker-Prager load step ${failedStep.step} did not satisfy the configured convergence policy.`,
      },
    } : {}),
  };
}

function buildBoundaryConditions(
  mesh: ReturnType<typeof buildPlaneStrainRectangularMesh>,
  widthM: number,
  heightM: number,
): FemPlaneStrainModel['boundaryConditions'] {
  const eps = Math.max(widthM, heightM) * 1e-10;
  return mesh.nodes.flatMap((node) => {
    const conditions: FemPlaneStrainModel['boundaryConditions'] = [];
    if (Math.abs(node.yM) <= eps) {
      conditions.push({ nodeId: node.id, dof: 'ux', valueM: 0 }, { nodeId: node.id, dof: 'uy', valueM: 0 });
    } else if (Math.abs(node.xM) <= eps || Math.abs(node.xM - widthM) <= eps) {
      conditions.push({ nodeId: node.id, dof: 'ux', valueM: 0 });
    }
    return conditions;
  });
}

function buildTopLoad(
  mesh: ReturnType<typeof buildPlaneStrainRectangularMesh>,
  heightM: number,
  totalLoadKn: number,
): FemPlaneStrainModel['nodalLoads'] {
  const eps = Math.max(heightM, 1) * 1e-10;
  const topNodes = mesh.nodes.filter((node) => Math.abs(node.yM - heightM) <= eps);
  const loadPerNodeKn = -totalLoadKn / Math.max(topNodes.length, 1);
  return topNodes.map((node) => ({ nodeId: node.id, fyKn: loadPerNodeKn }));
}

export function buildPlaneStrainDruckerPragerAdaptiveExcavationDemoAnalysisCase(
  caseFile: FemAnalysisCase,
): FemAnalysisCase {
  const material = caseFile.materials[0];
  const assumptions: FemAssumption[] = [
    ...caseFile.assumptions,
    {
      id: 'plane-strain-dp-preview-route',
      parameter: 'nonlinear solver route',
      value: 'quad4 plane-strain Drucker-Prager adaptive load stepping',
      basis: 'Deterministic strong-beta preview route for reviewed nonlinear FEM evidence, not production design acceptance.',
      confidence: 'review',
      reviewRequired: true,
    },
  ];
  return {
    ...caseFile,
    caseId: `${caseFile.caseId}-plane-strain-dp`,
    title: `${caseFile.title} - plane-strain Drucker-Prager preview`,
    analysisType: ANALYSIS_TYPE,
    materials: [{
      ...material,
      id: material.id,
      name: `${material.name} with reviewed Mohr-Coulomb strength`,
      model: 'mohr_coulomb',
      frictionAngleDeg: firstFinitePositive([material.frictionAngleDeg], 10),
      cohesionKpa: Math.max(0, material.cohesionKpa ?? 2),
      assumptions,
    }],
    mesh: {
      elementType: 'quad4_plane_strain',
      divisionsX: Math.max(2, Math.min(12, caseFile.mesh.divisionsX)),
      divisionsY: Math.max(2, Math.min(8, caseFile.mesh.divisionsZ || caseFile.mesh.divisionsY)),
      divisionsZ: 1,
    },
    assumptions,
    limitations: [
      'Experimental plane-strain Drucker-Prager adaptive FEM preview only; not a production design calculation.',
      'Requires explicit human review of geometry, loads, strength parameters, assumptions, and limitations before running.',
      'No retaining-wall member design, basal heave, seepage, consolidation, construction sequence activation, or independent commercial benchmark approval is provided.',
      ...caseFile.limitations,
    ],
  };
}

export function runBuiltinPlaneStrainDruckerPragerAdaptivePreview(
  caseFile: FemAnalysisCase,
  options: { policy?: FemConvergencePolicy } = {},
): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  if (validation.status === 'blocked') {
    throw new Error(`Cannot run plane-strain Drucker-Prager adaptive preview: ${validation.findings.map((item) => item.message).join('; ')}`);
  }
  if (caseFile.objective !== 'excavation_deformation' || caseFile.analysisType !== ANALYSIS_TYPE) {
    throw new Error('The plane-strain Drucker-Prager adaptive preview requires an excavation_deformation case with static_2d_plane_strain_drucker_prager analysisType.');
  }
  if (caseFile.mesh.elementType !== 'quad4_plane_strain') {
    throw new Error('The plane-strain Drucker-Prager adaptive preview requires a quad4_plane_strain mesh.');
  }
  const excavation = caseFile.geometry.excavation;
  const material = caseFile.materials[0];
  if (!excavation || !material) {
    throw new Error('The plane-strain Drucker-Prager adaptive preview requires excavation geometry and one Mohr-Coulomb material.');
  }

  const widthM = caseFile.geometry.domain.lengthM;
  const heightM = caseFile.geometry.domain.depthM;
  const thicknessM = caseFile.geometry.domain.widthM;
  const mesh = buildPlaneStrainRectangularMesh({
    widthM,
    heightM,
    divisionsX: caseFile.mesh.divisionsX,
    divisionsY: caseFile.mesh.divisionsY,
    materialId: material.id,
  });
  const totalExcavatedWeightKn = excavation.lengthM * excavation.widthM * excavation.finalDepthM * material.unitWeightKnM3;
  const policy = options.policy ?? {
    ...DEFAULT_FEM_CONVERGENCE_POLICY,
    maxIterations: 8,
  };
  const result = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: mesh.nodes,
    elements: mesh.elements,
    materials: [{
      id: material.id,
      elasticModulusKpa: material.elasticModulusKpa,
      poissonRatio: material.poissonRatio,
      unitWeightKnM3: material.unitWeightKnM3,
      frictionAngleDeg: material.frictionAngleDeg,
      cohesionKpa: material.cohesionKpa,
      hardeningModulusKpa: material.hardeningModulusKpa,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: buildBoundaryConditions(mesh, widthM, heightM),
    nodalLoads: buildTopLoad(mesh, heightM, totalExcavatedWeightKn),
    defaultThicknessM: thicknessM,
    policy,
  }, {
    loadStepFractions: [1],
    adaptiveLoadStepping: {
      enabled: true,
      strategy: 'cutback-bisection',
      minLoadFactorIncrement: 1 / 64,
      maxCutbacks: 24,
    },
  });
  const visualization = buildPlaneStrainDpVisualization(caseFile, result);
  const maxSettlementMm = round(Math.max(...result.nodes.map((node) => Math.max(0, -node.uyM))) * 1000, 6);
  const maxHorizontalDisplacementMm = round(Math.max(...result.nodes.map((node) => Math.abs(node.uxM))) * 1000, 6);
  const maxHardeningStressKpa = Math.max(
    0,
    ...result.elements.flatMap((element) => element.gaussPoints.map((point) => point.hardeningStressKpa)),
  );
  const solverIterations = result.loadSteps.reduce((total, step) => total + step.iterations, 0);
  const rejectedAttemptCount = result.adaptiveLoadStepping.attempts.filter((attempt) => !attempt.accepted).length;
  const adaptiveLoadStepping = {
    ...result.adaptiveLoadStepping,
    attempts: result.adaptiveLoadStepping.attempts.map((attempt) => ({ ...attempt })),
    blockerCodes: [...result.adaptiveLoadStepping.blockerCodes],
  };
  const envelope: FemResultManifest['envelope'] = {
    maxSettlementMm,
    minSettlementMm: 0,
    totalLoadKn: round(totalExcavatedWeightKn, 6),
    reactionKn: round(totalExcavatedWeightKn, 6),
    reactionBalanceRatio: round(result.reactionBalanceRatio, 8),
    maxSurfaceSettlementMm: maxSettlementMm,
    maxHorizontalDisplacementMm,
    maxWallDeflectionMm: maxHorizontalDisplacementMm,
    maxBasalHeaveMm: maxSettlementMm,
    totalExcavatedWeightKn: round(totalExcavatedWeightKn, 6),
    supportReactionKn: 0,
    boundaryReactionKn: round(totalExcavatedWeightKn, 6),
    stageCount: excavation.stages.length,
    solverLoadSteps: result.loadSteps.length,
    solverIterations,
    maxSolverResidualRatio: round(result.residualNormRatio, 12),
    maxYieldResidualRatio: round(result.maxYieldResidualRatio, 12),
    nonlinearPlasticStrain: round(result.maxEquivalentPlasticStrain, 12),
    planeStrainDofCount: result.dofCount,
    planeStrainFreeDofCount: result.freeDofCount,
    planeStrainConstrainedDofCount: result.constrainedDofCount,
    plasticGaussPointCount: result.plasticGaussPointCount,
    maxEquivalentPlasticStrain: round(result.maxEquivalentPlasticStrain, 12),
    maxEquivalentPlasticStrainIncrement: round(result.maxEquivalentPlasticStrainIncrement, 12),
    ...(material.hardeningModulusKpa != null && material.hardeningModulusKpa > 0 ? {
      maxHardeningStressKpa: round(maxHardeningStressKpa, 8),
    } : {}),
    adaptiveAttemptCount: result.adaptiveLoadStepping.attemptedStepCount,
    adaptiveAcceptedStepCount: result.adaptiveLoadStepping.acceptedStepCount,
    adaptiveRejectedAttemptCount: rejectedAttemptCount,
    adaptiveCutbackCount: result.adaptiveLoadStepping.cutbackCount,
    adaptiveMaxCutbackDepth: result.adaptiveLoadStepping.maxCutbackDepth,
  };

  return {
    schemaVersion: 'fem-result-manifest.v0',
    caseId: caseFile.caseId,
    title: `${caseFile.title} - adaptive Drucker-Prager result`,
    generatedAt: new Date().toISOString(),
    backend: {
      id: BACKEND_ID,
      label: 'Built-in experimental plane-strain Drucker-Prager adaptive preview',
      deterministic: true,
      version: '0.1.0',
      productionReady: false,
    },
    analysisCase: caseFile,
    validation,
    mesh: {
      nodes: mesh.nodes.length,
      elements: mesh.elements.length,
      elementType: 'quad4_plane_strain',
      divisions: [caseFile.mesh.divisionsX, caseFile.mesh.divisionsY, caseFile.mesh.divisionsZ],
      visualizationNodes: visualization.base.length / 3,
      visualizationTriangles: visualization.tri.length / 3,
      visualizationEdges: visualization.edge.length / 2,
    },
    envelope,
    adaptiveLoadStepping,
    solverConvergence: buildSolverConvergenceReport(result),
    visualization,
    assumptions: [
      ...caseFile.assumptions,
      {
        id: 'dp-adaptive-convergence-policy',
        parameter: 'adaptive nonlinear convergence policy',
        value: `force ${policy.forceBalanceTolerance}, yield ${policy.residualTolerance}, max iterations ${policy.maxIterations}`,
        basis: 'Manifest records every accepted load step plus rejected cutback attempts with rollback state signatures.',
        confidence: 'measured',
        reviewRequired: true,
      },
      ...(material.hardeningModulusKpa != null && material.hardeningModulusKpa > 0 ? [{
        id: 'dp-isotropic-hardening-route',
        parameter: 'Drucker-Prager hardening modulus',
        value: material.hardeningModulusKpa,
        unit: 'kPa',
        basis: 'Route-backed adaptive Drucker-Prager preview forwarded the reviewed hardening modulus into Gauss-point return mapping and reports the resulting hardening stress envelope; calibration and independent benchmark approval are still required.',
        confidence: 'review' as const,
        reviewRequired: true,
      }] : []),
    ],
    limitations: [
      'Experimental route-backed plane-strain Drucker-Prager preview only; not a production nonlinear FEM design solver.',
      'Uses modified Newton with elastic global tangent and committed Gauss-point return mapping; no approved consistent tangent, hardening calibration, staged activation, pore-pressure DOF, seepage, consolidation, or support member design is provided.',
      'Adaptive cutback-bisection attempts are audited for rollback, but arc-length control and production convergence governance are not implemented.',
      'Independent published/commercial benchmark comparison and licensed approval gates are still required before production design use.',
      ...result.limitations,
      ...caseFile.limitations,
    ],
  };
}

export const runBuiltinPlaneStrainDruckerPragerAdaptiveSolver =
  runBuiltinPlaneStrainDruckerPragerAdaptivePreview;
export const runBuiltinPlaneStrainDpAdaptivePreview =
  runBuiltinPlaneStrainDruckerPragerAdaptivePreview;
export const runBuiltinPlaneStrainDpAdaptiveSolver =
  runBuiltinPlaneStrainDruckerPragerAdaptivePreview;

import {
  runDruckerPragerMaterialPoint,
  runTerzaghiConsolidationTimeStepper,
  type FemConvergencePolicy,
  type FemDruckerPragerMaterialPointResult,
  type FemPrincipalVector,
} from './engineering-evidence.js';
import { runBuiltinStagedSettlementConsolidationDemo } from './demo.js';
import type { FemAnalysisCase, FemResultDataset, FemResultManifest } from './types.js';
import { validateFemAnalysisCase } from './validation.js';

interface ColumnStageSolution {
  stageIndex: number;
  stageId: string;
  cumulativeLoadKpa: number;
  cumulativeTimeYears: number;
  axialStrain: number;
  settlementMm: number;
  plasticSettlementMm: number;
  degreeOfConsolidation: number;
  averageExcessPorePressureKpa: number;
  mobilizedStrengthRatio: number;
  solverIterations: number;
  residualRatio: number;
  yieldResidualRatio: number;
  materialPoint: FemDruckerPragerMaterialPointResult;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nonNegativeFinite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? value! : fallback;
}

function buildUniformAxialStrainIncrements(
  axialStrain: number,
  increments: number,
): FemPrincipalVector[] {
  const step = axialStrain / increments;
  return Array.from({ length: increments }, () => [step, 0, 0] as FemPrincipalVector);
}

function mobilizedStrengthRatio(materialPoint: FemDruckerPragerMaterialPointResult): number {
  const step = materialPoint.finalStep;
  const denominator = Math.max(
    materialPoint.mapping.rho * step.principalEffectiveStressKpa.reduce((total, value) => total + value, 0) +
      materialPoint.mapping.compressionInterceptKpa,
    1e-9,
  );
  return Math.min(1, Math.max(0, step.deviatoricStressNormKpa / denominator));
}

function updateEnvelopeDatasets(
  datasets: FemResultDataset[] | undefined,
  updates: Record<string, number | undefined>,
): FemResultDataset[] | undefined {
  if (!datasets) return undefined;
  return datasets.map((dataset) => {
    const value = updates[dataset.fieldId];
    if (dataset.source !== 'envelope' || value == null) return dataset;
    return {
      ...dataset,
      values: [round(value, 6)],
    };
  });
}

function buildMaterialPoint(
  caseFile: FemAnalysisCase,
  axialStrain: number,
  incrementCount: number,
  initialPrincipalEffectiveStressKpa: FemPrincipalVector,
  policy?: FemConvergencePolicy,
): FemDruckerPragerMaterialPointResult {
  const material = caseFile.materials[0];
  const poissonRatio = material.poissonRatio;
  const columnElasticModulusKpa = material.constrainedModulusKpa
    ? material.constrainedModulusKpa * ((1 + poissonRatio) * (1 - 2 * poissonRatio)) / (1 - poissonRatio)
    : material.elasticModulusKpa;
  return runDruckerPragerMaterialPoint({
    initialPrincipalEffectiveStressKpa,
    principalStrainIncrements: buildUniformAxialStrainIncrements(axialStrain, incrementCount),
    elasticModulusKpa: columnElasticModulusKpa,
    poissonRatio,
    frictionAngleDeg: material.frictionAngleDeg ?? 30,
    cohesionKpa: material.cohesionKpa ?? 0,
    dilationAngleDeg: 0,
    policy,
  });
}

function solveLoadControlledColumnStage(input: {
  caseFile: FemAnalysisCase;
  targetLoadKpa: number;
  initialPrincipalEffectiveStressKpa: FemPrincipalVector;
  incrementCount: number;
  policy?: FemConvergencePolicy;
}): {
  axialStrain: number;
  materialPoint: FemDruckerPragerMaterialPointResult;
  residualRatio: number;
  iterations: number;
} {
  const { caseFile, targetLoadKpa, initialPrincipalEffectiveStressKpa, incrementCount, policy } = input;
  if (targetLoadKpa <= 0) {
    const materialPoint = buildMaterialPoint(caseFile, 0, incrementCount, initialPrincipalEffectiveStressKpa, policy);
    return { axialStrain: 0, materialPoint, residualRatio: 0, iterations: 0 };
  }

  const material = caseFile.materials[0];
  const modulus = Math.max(material.constrainedModulusKpa ?? material.elasticModulusKpa, 1);
  const targetVerticalStressKpa = initialPrincipalEffectiveStressKpa[0] + targetLoadKpa;
  const maxIterations = policy?.maxIterations ?? 40;
  let lower = 0;
  let upper = Math.max(targetLoadKpa / modulus, 1e-5);
  let upperPoint = buildMaterialPoint(caseFile, upper, incrementCount, initialPrincipalEffectiveStressKpa, policy);

  for (let guard = 0; guard < 16 && upperPoint.finalStep.principalEffectiveStressKpa[0] < targetVerticalStressKpa; guard += 1) {
    upper *= 2;
    upperPoint = buildMaterialPoint(caseFile, upper, incrementCount, initialPrincipalEffectiveStressKpa, policy);
  }

  let bestPoint = upperPoint;
  let bestStrain = upper;
  let bestResidual = Math.abs(upperPoint.finalStep.principalEffectiveStressKpa[0] - targetVerticalStressKpa) /
    Math.max(targetLoadKpa, 1e-9);
  let iterations = 0;

  for (iterations = 1; iterations <= maxIterations; iterations += 1) {
    const mid = (lower + upper) / 2;
    const point = buildMaterialPoint(caseFile, mid, incrementCount, initialPrincipalEffectiveStressKpa, policy);
    const verticalStress = point.finalStep.principalEffectiveStressKpa[0];
    const residual = Math.abs(verticalStress - targetVerticalStressKpa) / Math.max(targetLoadKpa, 1e-9);
    if (residual < bestResidual) {
      bestResidual = residual;
      bestPoint = point;
      bestStrain = mid;
    }
    if (residual <= (policy?.forceBalanceTolerance ?? 1e-3)) break;
    if (verticalStress < targetVerticalStressKpa) {
      lower = mid;
    } else {
      upper = mid;
    }
  }

  return {
    axialStrain: bestStrain,
    materialPoint: bestPoint,
    residualRatio: bestResidual,
    iterations,
  };
}

export function runBuiltinNonlinearConsolidationColumnSolver(
  caseFile: FemAnalysisCase,
  options: { policy?: FemConvergencePolicy } = {},
): FemResultManifest {
  const validation = validateFemAnalysisCase(caseFile);
  if (validation.status === 'blocked') {
    throw new Error(`Cannot run nonlinear consolidation column solver: ${validation.findings.map((item) => item.message).join('; ')}`);
  }
  if (caseFile.objective !== 'staged_settlement_consolidation') {
    throw new Error('The nonlinear consolidation column solver only supports staged_settlement_consolidation cases.');
  }
  const consolidation = caseFile.geometry.consolidation;
  const material = caseFile.materials[0];
  if (!consolidation || !material) {
    throw new Error('The nonlinear consolidation column solver requires consolidation geometry and at least one material.');
  }

  const policy = options.policy;
  const phi = material.frictionAngleDeg ?? 30;
  const k0 = Math.max(0.2, Math.min(1.2, 1 - Math.sin((phi * Math.PI) / 180)));
  const initialVerticalEffectiveStressKpa = Math.max(1, material.unitWeightKnM3 * consolidation.layerThicknessM * 0.5);
  const initialPrincipalEffectiveStressKpa: FemPrincipalVector = [
    initialVerticalEffectiveStressKpa,
    initialVerticalEffectiveStressKpa * k0,
    initialVerticalEffectiveStressKpa * k0,
  ];
  const incrementCount = Math.max(4, Math.min(80, caseFile.mesh.divisionsZ * 4));
  const stageSolutions: ColumnStageSolution[] = [];
  let cumulativeLoadKpa = 0;
  let cumulativeTimeYears = 0;
  let cumulativeSettlementMm = 0;
  let previousDrainedStrain = 0;
  let maxSolverResidualRatio = 0;
  let maxYieldResidualRatio = 0;
  let solverIterations = 0;

  for (const [stageIndex, stage] of consolidation.stages.entries()) {
    cumulativeLoadKpa += stage.loadKpa;
    cumulativeTimeYears += stage.durationYears;
    const loadSolution = solveLoadControlledColumnStage({
      caseFile,
      targetLoadKpa: cumulativeLoadKpa,
      initialPrincipalEffectiveStressKpa,
      incrementCount,
      policy,
    });
    const drainedSettlementIncrementMm = Math.max(
      0,
      (loadSolution.axialStrain - previousDrainedStrain) * consolidation.layerThicknessM * 1000,
    );
    previousDrainedStrain = Math.max(previousDrainedStrain, loadSolution.axialStrain);
    const localTimes = Array.from({ length: 8 }, (_, index) => stage.durationYears * ((index + 1) / 8));
    const consolidationStep = runTerzaghiConsolidationTimeStepper({
      layerThicknessM: consolidation.layerThicknessM,
      drainage: consolidation.drainage,
      coefficientOfConsolidationM2PerYear: material.coefficientOfConsolidationM2PerYear ?? 1,
      initialExcessPorePressureKpa: Math.max(stage.loadKpa, 1e-6),
      primarySettlementMm: drainedSettlementIncrementMm,
      timeStepsYears: localTimes,
      nodeCount: Math.max(21, Math.min(101, caseFile.mesh.divisionsZ * 8 + 1)),
      policy,
    });
    cumulativeSettlementMm += consolidationStep.finalStep.settlementMm;
    const plasticSettlementMm = Math.max(
      0,
      loadSolution.materialPoint.plasticStrainPrincipal[0] * consolidation.layerThicknessM * 1000,
    );
    const yieldResidualRatio = loadSolution.materialPoint.finalStep.state === 'plastic'
      ? loadSolution.materialPoint.finalStep.yieldResidualRatio
      : 0;
    maxSolverResidualRatio = Math.max(maxSolverResidualRatio, loadSolution.residualRatio);
    maxYieldResidualRatio = Math.max(maxYieldResidualRatio, yieldResidualRatio);
    solverIterations += loadSolution.iterations;

    stageSolutions.push({
      stageIndex,
      stageId: stage.id,
      cumulativeLoadKpa: round(cumulativeLoadKpa, 6),
      cumulativeTimeYears: round(cumulativeTimeYears, 6),
      axialStrain: round(loadSolution.axialStrain, 10),
      settlementMm: round(cumulativeSettlementMm, 6),
      plasticSettlementMm: round(plasticSettlementMm, 6),
      degreeOfConsolidation: consolidationStep.finalStep.degreeOfConsolidation,
      averageExcessPorePressureKpa: consolidationStep.finalStep.averageExcessPorePressureKpa,
      mobilizedStrengthRatio: round(mobilizedStrengthRatio(loadSolution.materialPoint), 8),
      solverIterations: loadSolution.iterations,
      residualRatio: round(loadSolution.residualRatio, 12),
      yieldResidualRatio: round(yieldResidualRatio, 12),
      materialPoint: loadSolution.materialPoint,
    });
  }

  const finalStage = stageSolutions[stageSolutions.length - 1];
  const totalLoadKn = consolidation.stages.reduce(
    (total, stage) => total + stage.loadKpa * consolidation.surfaceAreaM2,
    0,
  );
  const finalSettlementMm = nonNegativeFinite(finalStage?.settlementMm, 0);
  const plasticSettlementMm = Math.max(...stageSolutions.map((stage) => stage.plasticSettlementMm), 0);
  const maxMobilizedStrengthRatio = Math.max(...stageSolutions.map((stage) => stage.mobilizedStrengthRatio), 0);
  const maxExcessPorePressureKpa = Math.max(...stageSolutions.map((stage) => stage.averageExcessPorePressureKpa), 0);
  const baseManifest = runBuiltinStagedSettlementConsolidationDemo(caseFile);
  const envelope = {
    ...baseManifest.envelope,
    maxSettlementMm: round(finalSettlementMm, 3),
    minSettlementMm: 0,
    totalLoadKn: round(totalLoadKn, 4),
    reactionKn: round(totalLoadKn, 4),
    reactionBalanceRatio: 1,
    finalSettlementMm: round(finalSettlementMm, 3),
    plasticSettlementMm: round(plasticSettlementMm, 3),
    finalDegreeOfConsolidation: finalStage?.degreeOfConsolidation ?? 0,
    maxExcessPorePressureKpa: round(maxExcessPorePressureKpa, 4),
    maxMobilizedStrengthRatio: round(maxMobilizedStrengthRatio, 6),
    solverLoadSteps: consolidation.stages.length,
    solverIterations,
    maxSolverResidualRatio: round(maxSolverResidualRatio, 12),
    maxYieldResidualRatio: round(maxYieldResidualRatio, 12),
    nonlinearPlasticStrain: round(finalStage?.materialPoint.finalStep.equivalentPlasticStrain ?? 0, 12),
  };

  return {
    ...baseManifest,
    title: `${baseManifest.title} - nonlinear column solver`,
    backend: {
      id: 'builtin-nonlinear-column-v0',
      label: 'Built-in nonlinear 1D consolidation column solver',
      deterministic: true,
      version: '0.1.0',
    },
    envelope,
    datasets: updateEnvelopeDatasets(baseManifest.datasets, {
      final_settlement: envelope.finalSettlementMm,
      plastic_settlement: envelope.plasticSettlementMm,
      final_degree_of_consolidation: envelope.finalDegreeOfConsolidation,
      max_excess_pore_pressure: envelope.maxExcessPorePressureKpa,
      max_mobilized_strength_ratio: envelope.maxMobilizedStrengthRatio,
      reaction_balance_ratio: envelope.reactionBalanceRatio,
      total_load: envelope.totalLoadKn,
    }),
    limitations: [
      'Nonlinear 1D column solver preview only; not a production 2D/3D geotechnical FEM design model.',
      'Solves vertical load-controlled column equilibrium with Drucker-Prager/Mohr-Coulomb-compatible material-point return mapping.',
      'Uses Terzaghi 1D consolidation for time-rate settlement; no global pore-pressure DOF or Biot matrix coupling is assembled.',
      'Independent published/commercial solver benchmarks and reviewer approval enforcement are still required before production design use.',
      ...baseManifest.limitations,
    ],
  };
}

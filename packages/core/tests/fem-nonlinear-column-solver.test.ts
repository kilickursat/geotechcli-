import { describe, expect, it } from 'vitest';

import {
  buildStagedSettlementConsolidationDemoAnalysisCase,
  DEFAULT_FEM_CONVERGENCE_POLICY,
  runBuiltinNonlinearConsolidationColumnSolver,
  validateFemResultManifest,
  type FemAnalysisCase,
} from '../src/fem/index.js';

function buildColumnCase(overrides: {
  stageLoadsKpa?: number[];
  stageDurationsYears?: number[];
  constrainedModulusKpa?: number;
  elasticModulusKpa?: number;
  frictionAngleDeg?: number;
  cohesionKpa?: number;
  hardeningModulusKpa?: number;
  cv?: number;
} = {}): FemAnalysisCase {
  const caseFile = buildStagedSettlementConsolidationDemoAnalysisCase();
  const consolidation = caseFile.geometry.consolidation!;
  const loads = overrides.stageLoadsKpa ?? consolidation.stages.map((stage) => stage.loadKpa);
  const durations = overrides.stageDurationsYears ?? consolidation.stages.map((stage) => stage.durationYears);
  return {
    ...caseFile,
    geometry: {
      ...caseFile.geometry,
      consolidation: {
        ...consolidation,
        stages: loads.map((loadKpa, index) => ({
          id: `stage-${index + 1}`,
          label: `Stage ${index + 1}`,
          loadKpa,
          durationYears: durations[index] ?? durations.at(-1) ?? 1,
        })),
      },
    },
    materials: [
      {
        ...caseFile.materials[0],
        elasticModulusKpa: overrides.elasticModulusKpa ?? caseFile.materials[0].elasticModulusKpa,
        constrainedModulusKpa: overrides.constrainedModulusKpa ?? caseFile.materials[0].constrainedModulusKpa,
        frictionAngleDeg: overrides.frictionAngleDeg ?? caseFile.materials[0].frictionAngleDeg,
        cohesionKpa: overrides.cohesionKpa ?? caseFile.materials[0].cohesionKpa,
        hardeningModulusKpa: overrides.hardeningModulusKpa ?? caseFile.materials[0].hardeningModulusKpa,
        coefficientOfConsolidationM2PerYear: overrides.cv ?? caseFile.materials[0].coefficientOfConsolidationM2PerYear,
      },
    ],
    loads: loads.map((pressureKpa, index) => ({
      ...caseFile.loads[Math.min(index, caseFile.loads.length - 1)],
      id: `stage-load-${index + 1}`,
      target: 'ground_surface',
      pressureKpa,
    })),
  };
}

describe('FEM nonlinear consolidation column solver', () => {
  it('produces a valid reviewed manifest with nonlinear solver residual metadata', () => {
    const manifest = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase());
    const validation = validateFemResultManifest(manifest);

    expect(manifest.backend.id).toBe('builtin-nonlinear-column-v0');
    expect(manifest.envelope.solverLoadSteps).toBe(3);
    expect(manifest.envelope.solverIterations).toBeGreaterThan(0);
    expect(manifest.envelope.maxSolverResidualRatio).toBeLessThanOrEqual(1e-3);
    expect(manifest.envelope.maxYieldResidualRatio).toBeLessThanOrEqual(1e-6);
    expect(manifest.envelope.finalSettlementMm).toBeGreaterThan(0);
    expect(manifest.solverConvergence?.schemaVersion).toBe('fem-solver-convergence-report.v1');
    expect(manifest.solverConvergence?.status).toBe('converged');
    expect(manifest.solverConvergence?.policy).toEqual(DEFAULT_FEM_CONVERGENCE_POLICY);
    expect(manifest.solverConvergence?.loadSteps).toHaveLength(3);
    for (const step of manifest.solverConvergence?.loadSteps ?? []) {
      expect(step.converged).toBe(true);
      expect(step.terminationReason).toBe('converged');
      expect(step.residualRatio).toBeLessThanOrEqual(step.forceBalanceTolerance);
      expect(step.yieldResidualRatio).toBeLessThanOrEqual(step.residualTolerance!);
      expect(step.residualHistory.length).toBeGreaterThan(0);
      expect(step.residualHistory.at(-1)?.converged).toBe(true);
    }
    expect(manifest.datasets?.find((dataset) => dataset.fieldId === 'final_settlement')?.values[0])
      .toBe(manifest.envelope.finalSettlementMm);
    expect(validation.status).toBe('review');
    expect(validation.blockers).toBe(0);
  });

  it('keeps low-load/high-strength response close to the elastic constrained-modulus settlement', () => {
    const manifest = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [10],
      stageDurationsYears: [50],
      constrainedModulusKpa: 10_000,
      elasticModulusKpa: 10_000,
      frictionAngleDeg: 35,
      cohesionKpa: 500,
      cv: 10,
    }));
    const consolidation = manifest.analysisCase.geometry.consolidation!;
    const loadKpa = consolidation.stages[0].loadKpa;
    const expectedDrainedSettlementMm =
      (loadKpa / manifest.analysisCase.materials[0].constrainedModulusKpa!) *
      consolidation.layerThicknessM *
      1000;

    expect(manifest.envelope.nonlinearPlasticStrain).toBe(0);
    expect(manifest.envelope.finalDegreeOfConsolidation).toBeGreaterThan(0.99);
    expect(manifest.envelope.finalSettlementMm).toBeCloseTo(expectedDrainedSettlementMm, 1);
  });

  it('reports plastic strain and monotonic settlement growth under staged loading', () => {
    const singleStage = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [50],
      stageDurationsYears: [1],
      constrainedModulusKpa: 8_000,
      elasticModulusKpa: 20_000,
      frictionAngleDeg: 16,
      cohesionKpa: 0,
    }));
    const staged = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [50, 75, 100],
      stageDurationsYears: [1, 1, 1],
      constrainedModulusKpa: 8_000,
      elasticModulusKpa: 20_000,
      frictionAngleDeg: 16,
      cohesionKpa: 0,
    }));

    expect(staged.envelope.finalSettlementMm).toBeGreaterThan(singleStage.envelope.finalSettlementMm!);
    expect(staged.envelope.nonlinearPlasticStrain).toBeGreaterThan(0);
    expect(staged.envelope.plasticSettlementMm).toBeGreaterThan(0);
    expect(staged.envelope.maxMobilizedStrengthRatio).toBeCloseTo(1, 6);
  });

  it('uses reviewed isotropic hardening in nonlinear column equilibrium', () => {
    const perfectPlastic = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [50, 75, 100],
      stageDurationsYears: [1, 1, 1],
      constrainedModulusKpa: 8_000,
      elasticModulusKpa: 20_000,
      frictionAngleDeg: 16,
      cohesionKpa: 0,
    }));
    const hardening = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [50, 75, 100],
      stageDurationsYears: [1, 1, 1],
      constrainedModulusKpa: 8_000,
      elasticModulusKpa: 20_000,
      frictionAngleDeg: 16,
      cohesionKpa: 0,
      hardeningModulusKpa: 5_000,
    }));

    expect(hardening.solverConvergence?.status).toBe('converged');
    expect(hardening.envelope.nonlinearPlasticStrain).toBeGreaterThan(0);
    expect(hardening.envelope.nonlinearPlasticStrain)
      .toBeLessThan(perfectPlastic.envelope.nonlinearPlasticStrain!);
    expect(hardening.envelope.plasticSettlementMm)
      .toBeLessThan(perfectPlastic.envelope.plasticSettlementMm!);
    expect(hardening.envelope.finalSettlementMm)
      .toBeLessThan(perfectPlastic.envelope.finalSettlementMm!);
  });

  it('fails closed with residual history when the nonlinear load solve does not converge', () => {
    const manifest = runBuiltinNonlinearConsolidationColumnSolver(buildColumnCase({
      stageLoadsKpa: [120, 180, 240],
      stageDurationsYears: [0.1, 0.1, 0.1],
      constrainedModulusKpa: 2_500,
      elasticModulusKpa: 18_000,
      frictionAngleDeg: 12,
      cohesionKpa: 0,
      cv: 0.1,
    }), {
      policy: {
        ...DEFAULT_FEM_CONVERGENCE_POLICY,
        forceBalanceTolerance: 1e-12,
        maxIterations: 1,
        minAcceptedSteps: 1,
      },
    });
    const validation = validateFemResultManifest(manifest);
    const failedStep = manifest.solverConvergence?.loadSteps.find((step) => !step.converged);

    expect(manifest.solverConvergence?.status).toBe('nonconverged');
    expect(manifest.solverConvergence?.failure?.step).toBe(failedStep?.step);
    expect(failedStep?.terminationReason).not.toBe('converged');
    expect(failedStep?.residualHistory).toHaveLength((failedStep?.iterations ?? 0) + 1);
    expect(failedStep?.residualHistory.at(-1)?.converged).toBe(false);
    expect(manifest.limitations.join(' ')).toMatch(/fail-closed/i);
    expect(validation.status).toBe('blocked');
    expect(validation.findings.map((finding) => finding.code)).toContain('result.solver-convergence.nonconverged');
  });
});

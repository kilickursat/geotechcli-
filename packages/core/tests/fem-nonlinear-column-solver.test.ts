import { describe, expect, it } from 'vitest';

import {
  buildStagedSettlementConsolidationDemoAnalysisCase,
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
});

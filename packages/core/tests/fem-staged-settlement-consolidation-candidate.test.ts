import { describe, expect, it } from 'vitest';

import * as fem from '../src/fem/index.js';
import {
  assessFemProductionReadiness,
  buildStagedSettlementConsolidationDemoAnalysisCase,
  listFemCapabilities,
  prepareFemAnalysisCaseDraft,
  runBuiltinStagedSettlementConsolidationDemo,
  runMohrCoulombMaterialPoint,
  runTerzaghiConsolidationTimeStepper,
  terzaghiAverageConsolidation,
  validateFemAnalysisCase,
  validateFemResultManifest,
} from '../src/fem/index.js';

const EXPECTED_STAGED_SETTLEMENT_EXPORTS = [
  'buildStagedSettlementConsolidationDemoAnalysisCase',
  'runBuiltinStagedSettlementConsolidationDemo',
] as const;

function expectStrictlyIncreasing(values: number[]): void {
  for (let index = 1; index < values.length; index++) {
    expect(values[index], `index ${index}`).toBeGreaterThan(values[index - 1]);
  }
}

function expectStrictlyDecreasing(values: number[]): void {
  for (let index = 1; index < values.length; index++) {
    expect(values[index], `index ${index}`).toBeLessThan(values[index - 1]);
  }
}

describe('staged settlement consolidation production-candidate deterministic slice', () => {
  it('keeps Terzaghi consolidation settlement monotonic and close to analytical reference behavior', () => {
    const finalTimeFactor = 1;
    const layerThicknessM = 12;
    const coefficientOfConsolidationM2PerYear = 0.8;
    const drainagePathM = layerThicknessM / 2;
    const timeStepsYears = Array.from(
      { length: 100 },
      (_, index) => ((index + 1) / 100) * finalTimeFactor *
        ((drainagePathM * drainagePathM) / coefficientOfConsolidationM2PerYear),
    );

    const result = runTerzaghiConsolidationTimeStepper({
      layerThicknessM,
      drainage: 'double',
      coefficientOfConsolidationM2PerYear,
      initialExcessPorePressureKpa: 90,
      primarySettlementMm: 180,
      timeStepsYears,
      nodeCount: 101,
    });

    const sampledSteps = [
      result.steps.find((step) => step.timeFactor >= 0.05),
      result.steps.find((step) => step.timeFactor >= 0.197),
      result.steps.find((step) => step.timeFactor >= 0.5),
      result.finalStep,
    ].filter((step): step is typeof result.finalStep => step != null);
    const sampledDegrees = sampledSteps.map((step) => step.degreeOfConsolidation);
    const sampledPressures = sampledSteps.map((step) => step.averageExcessPorePressureKpa);
    const sampledSettlements = sampledSteps.map((step) => step.settlementMm);

    expect(result.schemaVersion).toBe('fem-consolidation-time-stepper.v1');
    expect(result.drainagePathM).toBe(6);
    expect(result.converged).toBe(true);
    expectStrictlyIncreasing(sampledDegrees);
    expectStrictlyIncreasing(sampledSettlements);
    expectStrictlyDecreasing(sampledPressures);

    for (const step of sampledSteps) {
      const reference = terzaghiAverageConsolidation(step.timeFactor);
      expect(Math.abs(step.degreeOfConsolidation - reference), `Tv ${step.timeFactor}`)
        .toBeLessThanOrEqual(0.035);
      expect(Math.abs(step.settlementMm - (180 * step.degreeOfConsolidation)))
        .toBeLessThanOrEqual(0.0001);
    }

    expect(result.finalStep.degreeOfConsolidation).toBeGreaterThan(0.9);
    expect(result.finalStep.degreeOfConsolidation).toBeLessThan(1);
    expect(result.finalStep.settlementMm).toBeLessThanOrEqual(180);
  });

  it('captures consolidation trends for faster drainage or higher cv without claiming production FEM', () => {
    const commonInput = {
      layerThicknessM: 8,
      initialExcessPorePressureKpa: 75,
      primarySettlementMm: 120,
      timeStepsYears: [0.5, 1, 1.5, 2],
      nodeCount: 81,
    };
    const singleDrainage = runTerzaghiConsolidationTimeStepper({
      ...commonInput,
      drainage: 'single',
      coefficientOfConsolidationM2PerYear: 0.6,
    });
    const doubleDrainage = runTerzaghiConsolidationTimeStepper({
      ...commonInput,
      drainage: 'double',
      coefficientOfConsolidationM2PerYear: 0.6,
    });
    const fasterCv = runTerzaghiConsolidationTimeStepper({
      ...commonInput,
      drainage: 'single',
      coefficientOfConsolidationM2PerYear: 1.2,
    });

    expect(singleDrainage.converged).toBe(true);
    expect(doubleDrainage.converged).toBe(true);
    expect(fasterCv.converged).toBe(true);
    expect(doubleDrainage.finalStep.degreeOfConsolidation)
      .toBeGreaterThan(singleDrainage.finalStep.degreeOfConsolidation);
    expect(fasterCv.finalStep.degreeOfConsolidation)
      .toBeGreaterThan(singleDrainage.finalStep.degreeOfConsolidation);
    expect(doubleDrainage.finalStep.settlementMm)
      .toBeGreaterThan(singleDrainage.finalStep.settlementMm);
    expect(fasterCv.finalStep.settlementMm)
      .toBeGreaterThan(singleDrainage.finalStep.settlementMm);
  });

  it('captures Mohr-Coulomb elastic-to-plastic threshold behavior for staged loading acceptance gates', () => {
    const commonInput = {
      confiningEffectiveStressKpa: 100,
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      frictionAngleDeg: 30,
      cohesionKpa: 0,
      increments: 12,
    } as const;
    const expectedFailureStrain = 200 / commonInput.elasticModulusKpa;
    const belowYield = runMohrCoulombMaterialPoint({
      ...commonInput,
      axialStrain: expectedFailureStrain * 0.9,
    });
    const atYield = runMohrCoulombMaterialPoint({
      ...commonInput,
      axialStrain: expectedFailureStrain,
    });
    const beyondYield = runMohrCoulombMaterialPoint({
      ...commonInput,
      axialStrain: expectedFailureStrain * 1.35,
    });

    expect(belowYield.schemaVersion).toBe('fem-mohr-coulomb-material-point.v1');
    expect(belowYield.peakDeviatorStressKpa).toBeCloseTo(200, 6);
    expect(belowYield.finalStep.state).toBe('elastic');
    expect(belowYield.finalStep.deviatorStressKpa).toBeCloseTo(180, 4);
    expect(belowYield.finalStep.plasticAxialStrain).toBe(0);
    expect(belowYield.finalStep.mobilizedStrengthRatio).toBeCloseTo(0.9, 6);

    expect(['elastic', 'plastic']).toContain(atYield.finalStep.state);
    expect(atYield.finalStep.deviatorStressKpa).toBeCloseTo(200, 4);
    expect(atYield.finalStep.mobilizedStrengthRatio).toBeCloseTo(1, 6);
    expect(atYield.finalStep.plasticAxialStrain).toBe(0);

    expect(beyondYield.finalStep.state).toBe('plastic');
    expect(beyondYield.finalStep.deviatorStressKpa).toBeCloseTo(200, 4);
    expect(beyondYield.finalStep.plasticAxialStrain).toBeGreaterThan(0);
    expect(beyondYield.finalStep.mobilizedStrengthRatio).toBeCloseTo(1, 6);
    expect(beyondYield.finalStep.yieldResidualRatio).toBeLessThanOrEqual(
      beyondYield.policy.residualTolerance,
    );
  });

  it('wires the staged settlement route as a review-gated preview while production readiness remains blocked', () => {
    const femExports = fem as Record<string, unknown>;
    const availableStagedExports = EXPECTED_STAGED_SETTLEMENT_EXPORTS.filter(
      (name) => typeof femExports[name] === 'function',
    );
    const route = listFemCapabilities('staged-settlement-consolidation')[0];
    const draft = prepareFemAnalysisCaseDraft({
      objective: 'staged-settlement-consolidation',
      useDemoDefaults: true,
    });
    const readiness = assessFemProductionReadiness({
      objective: 'staged-settlement-consolidation',
      requestedFeatures: [
        'consolidation',
        'nonlinear-plasticity',
        'advanced-staged-construction',
        'independent-benchmark-validation',
      ],
    });

    expect(availableStagedExports).toEqual([...EXPECTED_STAGED_SETTLEMENT_EXPORTS]);
    expect(route).toMatchObject({
      status: 'implemented-demo',
      executionMode: 'human-reviewed-preview',
      deterministicBackend: 'builtin-staged-consolidation-1d',
      agentRunAllowed: false,
    });
    expect(route.reviewGates).toEqual(expect.arrayContaining([
      'experimental-only',
      '1d-consolidation-only',
      'mohr-coulomb-material-point-only',
      'time-rate-review-required',
      'not-design-calculation',
    ]));
    expect(route.limitations.join(' ')).toMatch(/No 2D\/3D coupled Biot FEM/i);
    expect(route.draftCommandTemplate).toBe('geotech fem draft staged-settlement-consolidation --input <json> --case-output <analysis_case.json>');
    expect(route.runCommandTemplate).toBe('geotech fem run <analysis_case.json> --experimental --reviewed');

    expect(draft).toMatchObject({
      implemented: true,
      canAutoProceed: false,
      recommendedAction: 'run-reviewed-case',
      recommendedCommand: 'geotech fem run <analysis_case.json> --experimental --reviewed',
    });
    expect(draft.analysisCase?.objective).toBe('staged_settlement_consolidation');
    expect(draft.analysisCase?.geometry.consolidation?.drainage).toBe('double');
    expect(draft.analysisCase?.materials[0]?.model).toBe('mohr_coulomb');
    expect(draft.validation?.status).toBe('review');
    expect(draft.reviewGates).toEqual(expect.arrayContaining([
      '1d-consolidation-only',
      'mohr-coulomb-material-point-only',
      'consolidation.1d-preview',
    ]));

    const analysisCase = buildStagedSettlementConsolidationDemoAnalysisCase();
    const caseValidation = validateFemAnalysisCase(analysisCase);
    const manifest = runBuiltinStagedSettlementConsolidationDemo(analysisCase);
    const manifestValidation = validateFemResultManifest(manifest);

    expect(caseValidation.status).toBe('review');
    expect(caseValidation.blockers).toBe(0);
    expect(manifest.backend.id).toBe('builtin-staged-consolidation-1d');
    expect(manifest.envelope.finalSettlementMm).toBeGreaterThan(0);
    expect(manifest.envelope.finalDegreeOfConsolidation).toBeGreaterThan(0);
    expect(manifest.envelope.finalDegreeOfConsolidation).toBeLessThanOrEqual(1);
    expect(manifest.envelope.maxExcessPorePressureKpa).toBe(45);
    expect(manifest.envelope.maxMobilizedStrengthRatio).toBeLessThanOrEqual(1);
    expect(manifest.envelope.stageCount).toBe(3);
    expect(manifest.resultFields?.map((field) => field.id)).toEqual([
      'vertical_settlement',
      'final_settlement',
      'plastic_settlement',
      'final_degree_of_consolidation',
      'max_excess_pore_pressure',
      'max_mobilized_strength_ratio',
      'stage_count',
      'total_load',
      'reaction',
    ]);
    expect(manifest.steps?.map((step) => step.id)).toEqual(['stage-1', 'stage-2', 'stage-3']);
    expect(manifest.datasets?.filter((dataset) => dataset.source === 'visualization.frame')).toHaveLength(3);
    expect(manifestValidation.status).toBe('review');
    expect(manifestValidation.blockers).toBe(0);

    expect(readiness).toMatchObject({
      schemaVersion: 'fem-production-readiness.v1',
      productionReady: false,
      status: 'blocked',
      objective: 'staged-settlement-consolidation',
      currentMode: 'experimental-preview',
    });
    expect(readiness.supportedPreviewRoutes).toEqual([
      expect.objectContaining({
        objective: 'staged-settlement-consolidation',
        deterministicBackend: 'builtin-staged-consolidation-1d',
      }),
    ]);
    expect(readiness.blockedFeatures.map((feature) => feature.feature)).toEqual([
      'consolidation',
      'nonlinear-plasticity',
      'advanced-staged-construction',
      'independent-benchmark-validation',
    ]);
    expect(readiness.blockedFeatures.find((feature) => feature.feature === 'consolidation')?.currentCoverage)
      .toMatch(/1D Terzaghi.*human-reviewed staged-settlement\/consolidation preview/i);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      '2d-3d-coupled-consolidation-fem-backend-implemented',
      'nonlinear-constitutive-kernel-coupled-to-global-fem-solver',
      'stage-activation-backend-implemented',
      'published-benchmark-corpus-approved',
    ]));
    expect(readiness.safeUserActions.join(' ')).toContain('geotech fem run <analysis_case.json> --experimental --reviewed');
    expect(readiness.releasePositioning).toContain('not a full production-grade nonlinear geotechnical FEM solver yet');
  });
});

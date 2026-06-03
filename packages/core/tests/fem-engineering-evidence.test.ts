import { describe, expect, it } from 'vitest';

import {
  runDarcySeepage1D,
  runExcavationSupportDesignCheck,
  runFemEngineeringEvidenceSuite,
  runHydroMechanicalCoupling1D,
  runMohrCoulombMaterialPoint,
  runTerzaghiConsolidationTimeStepper,
  terzaghiAverageConsolidation,
  validateFemReviewerApprovalRecord,
} from '../src/fem/index.js';

describe('FEM engineering evidence kernels', () => {
  it('verifies Mohr-Coulomb material-point plasticity against closed-form triaxial strength', () => {
    const result = runMohrCoulombMaterialPoint({
      confiningEffectiveStressKpa: 100,
      axialStrain: 0.02,
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      frictionAngleDeg: 30,
      cohesionKpa: 0,
      increments: 10,
    });

    expect(result.schemaVersion).toBe('fem-mohr-coulomb-material-point.v1');
    expect(result.peakDeviatorStressKpa).toBeCloseTo(200, 6);
    expect(result.finalStep.state).toBe('plastic');
    expect(result.finalStep.deviatorStressKpa).toBeCloseTo(200, 4);
    expect(result.finalStep.plasticAxialStrain).toBeGreaterThan(0);
    expect(result.converged).toBe(true);
  });

  it('steps 1D Terzaghi consolidation against the analytical average-consolidation series', () => {
    const finalTimeYears = 0.197 * 25;
    const result = runTerzaghiConsolidationTimeStepper({
      layerThicknessM: 10,
      drainage: 'double',
      coefficientOfConsolidationM2PerYear: 1,
      initialExcessPorePressureKpa: 100,
      primarySettlementMm: 100,
      timeStepsYears: Array.from({ length: 80 }, (_, index) => finalTimeYears * ((index + 1) / 80)),
      nodeCount: 81,
    });

    const reference = terzaghiAverageConsolidation(0.197);

    expect(result.schemaVersion).toBe('fem-consolidation-time-stepper.v1');
    expect(result.drainagePathM).toBe(5);
    expect(result.finalStep.timeFactor).toBeCloseTo(0.197, 6);
    expect(result.finalStep.degreeOfConsolidation).toBeCloseTo(reference, 1);
    expect(result.finalStep.settlementMm).toBeGreaterThan(40);
    expect(result.finalStep.settlementMm).toBeLessThan(60);
    expect(result.converged).toBe(true);
  });

  it('solves 1D steady/transient seepage and preserves Darcy mass balance', () => {
    const result = runDarcySeepage1D({
      hydraulicConductivityMPerS: 1e-5,
      domainLengthM: 20,
      upstreamHeadM: 10,
      downstreamHeadM: 6,
      nodeCount: 21,
      transient: {
        specificStorage1PerM: 1e-4,
        durationSeconds: 20_000,
        timeSteps: 20,
        initialHeadM: 6,
      },
    });

    expect(result.schemaVersion).toBe('fem-seepage-1d.v1');
    expect(result.steadyFlowM3PerSPerM).toBeCloseTo(2e-6, 12);
    expect(result.hydraulicGradient).toBeCloseTo(0.2, 8);
    expect(result.massBalanceErrorRatio).toBeLessThanOrEqual(1e-3);
    expect(result.transientSteps).toHaveLength(20);
    expect(result.transientSteps.at(-1)?.maxHeadErrorToSteadyM)
      .toBeLessThan(result.transientSteps[0].maxHeadErrorToSteadyM);
    expect(result.converged).toBe(true);
  });

  it('couples pore-pressure dissipation into effective-stress settlement', () => {
    const result = runHydroMechanicalCoupling1D({
      totalVerticalStressKpa: 200,
      porePressureBeforeKpa: 80,
      porePressureAfterKpa: 40,
      constrainedModulusKpa: 10_000,
      layerThicknessM: 5,
    });

    expect(result.schemaVersion).toBe('fem-hydro-mechanical-coupling.v1');
    expect(result.effectiveStressBeforeKpa).toBe(120);
    expect(result.effectiveStressAfterKpa).toBe(160);
    expect(result.effectiveStressIncreaseKpa).toBe(40);
    expect(result.settlementMm).toBe(20);
    expect(result.converged).toBe(true);
  });

  it('checks excavation support capacity, passive toe resistance, and basal heave', () => {
    const accepted = runExcavationSupportDesignCheck({
      excavationDepthM: 8,
      wallToeDepthM: 14,
      unitWeightKnM3: 18,
      frictionAngleDeg: 30,
      cohesionKpa: 45,
      surchargeKpa: 10,
      supportLevelsM: [1, 4],
      allowableSupportLoadKnPerM: 300,
      requiredPassiveSafetyFactor: 1.5,
      requiredBasalHeaveSafetyFactor: 1.5,
    });

    const blocked = runExcavationSupportDesignCheck({
      excavationDepthM: 8,
      wallToeDepthM: 9,
      unitWeightKnM3: 18,
      frictionAngleDeg: 30,
      cohesionKpa: 5,
      surchargeKpa: 20,
      supportLevelsM: [2],
      allowableSupportLoadKnPerM: 25,
      requiredPassiveSafetyFactor: 1.5,
      requiredBasalHeaveSafetyFactor: 1.5,
    });

    expect(accepted.schemaVersion).toBe('fem-excavation-support-design-check.v1');
    expect(accepted.status).toBe('accepted');
    expect(accepted.checks.map((check) => check.id)).toEqual([
      'support-capacity',
      'passive-toe-resistance',
      'basal-heave',
    ]);
    expect(blocked.status).toBe('blocked');
    expect(blocked.checks.some((check) => check.status === 'blocked')).toBe(true);
  });

  it('validates persisted reviewer identity, license, case hash, assumptions, and approval record contract', () => {
    const accepted = validateFemReviewerApprovalRecord({
      schemaVersion: 'fem-reviewer-approval.v1',
      recordId: 'fem-approval-001',
      caseId: 'raft-settlement-demo',
      caseHashSha256: 'b'.repeat(64),
      validationSummary: {
        status: 'review',
        blockers: 0,
        reviewItems: 3,
        findingCodes: ['experimental-only', 'linear-elastic-only'],
      },
      reviewer: {
        name: 'Jane Engineer',
        licenseId: 'PE-98765',
        jurisdiction: 'US-NY',
      },
      approvedAt: '2026-06-01T00:00:00.000Z',
      scope: 'experimental-preview',
      assumptions: ['Geometry and load inputs reviewed.'],
      limitations: ['Not a production design calculation.'],
      approvalStatement: 'Reviewed and accepted for experimental preview execution.',
    });

    const blocked = validateFemReviewerApprovalRecord({
      schemaVersion: 'fem-reviewer-approval.v1',
      recordId: 'bad',
      caseId: 'raft',
      caseHashSha256: 'not-a-hash',
      validationSummary: {
        status: 'blocked',
        blockers: 1,
        reviewItems: 0,
        findingCodes: ['mesh.invalid'],
      },
      reviewer: {
        name: '',
        licenseId: '',
        jurisdiction: '',
      },
      approvedAt: 'not-a-date',
      scope: 'experimental-preview',
      assumptions: [],
      limitations: [],
      approvalStatement: 'looks fine',
    });

    expect(accepted.status).toBe('accepted');
    expect(blocked.status).toBe('blocked');
    expect(blocked.blockerCodes).toEqual(expect.arrayContaining([
      'case-hash.invalid',
      'validation-summary.blocked',
      'reviewer.name.missing',
      'approved-at.invalid',
      'assumptions.missing',
      'limitations.missing',
    ]));
  });

  it('runs the full evidence suite without changing the public production gate', () => {
    const report = runFemEngineeringEvidenceSuite();

    expect(report.schemaVersion).toBe('fem-engineering-evidence.v1');
    expect(report.status).toBe('kernel-verified');
    expect(report.productionReady).toBe(false);
    expect(report.benchmarks.every((item) => item.status === 'accepted')).toBe(true);
    expect(report.verifiedFeatures).toEqual(expect.arrayContaining([
      'nonlinear-plasticity',
      'consolidation',
      'seepage-pore-pressure-coupling',
      'support-design',
      'solver-convergence-and-tolerance',
      'licensed-engineer-review-workflow',
    ]));
    expect(report.remainingProductionBlockers).toContain('published-commercial-cross-solver-benchmark-corpus-not-approved');
  });
});

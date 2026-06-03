import { describe, expect, it } from 'vitest';

import {
  buildFemExternalBenchmarkAcceptanceContract,
  evaluateFemTolerance,
  mapMohrCoulombToDruckerPragerTriaxialCompression,
  runDarcySeepage1D,
  runDruckerPragerMaterialPoint,
  runExcavationSupportDesignCheck,
  runFemEngineeringEvidenceSuite,
  runHydroMechanicalCoupling1D,
  runMohrCoulombMaterialPoint,
  runTerzaghiConsolidationTimeStepper,
  terzaghiAverageConsolidation,
  validateFemReviewerApprovalRecord,
} from '../src/fem/index.js';

describe('FEM engineering evidence kernels', () => {
  function localCandidateSolver(runId = 'case-1') {
    return {
      name: 'geotechCLI local fixture',
      version: 'test-fixture',
      solverType: 'geotechcli-kernel' as const,
      analysisProcedure: 'deterministic local benchmark fixture',
      elementType: 'quad4 fixture',
      runId,
    };
  }

  function commercialReferenceSolver(runId = 'commercial-fixture-1') {
    return {
      name: 'Reference FEM Solver',
      version: '2024.1',
      vendor: 'Reference Vendor',
      solverType: 'commercial-solver' as const,
      analysisProcedure: 'plane-strain consolidation',
      elementType: 'quad4 u-p',
      runId,
    };
  }

  function seriesSummary(hashDigit = 'e') {
    return {
      xQuantity: 'time',
      xUnit: 'years',
      yQuantity: 'settlement',
      yUnit: 'mm',
      pointCount: 4,
      actual: { min: 0, max: 49.7, final: 49.7, mean: 25.1 },
      expected: { min: 0, max: 50, final: 50, mean: 25.2 },
      maxAbsoluteError: 0.3,
      maxRelativeError: 0.006,
      rmsError: 0.2,
      seriesHashSha256: hashDigit.repeat(64),
    };
  }

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

  it('maps Mohr-Coulomb friction to Drucker-Prager parameters for triaxial compression', () => {
    const mapping = mapMohrCoulombToDruckerPragerTriaxialCompression({
      frictionAngleDeg: 30,
      cohesionKpa: 0,
      dilationAngleDeg: 0,
    });
    const deviatoricNormFactor = Math.sqrt(2 / 3);
    const predictedQAtSigma3Equals100 =
      (3 * mapping.rho * 100 + mapping.compressionInterceptKpa) /
      (deviatoricNormFactor - mapping.rho);

    expect(mapping.schemaVersion).toBe('fem-drucker-prager-parameter-mapping.v1');
    expect(mapping.signConvention).toBe('compression-positive');
    expect(mapping.rho).toBeCloseTo(0.326598632, 9);
    expect(mapping.rhoBar).toBe(0);
    expect(predictedQAtSigma3Equals100).toBeCloseTo(200, 6);
  });

  it('runs Drucker-Prager elastic and plastic principal-stress return mapping with explicit state variables', () => {
    const elastic = runDruckerPragerMaterialPoint({
      initialPrincipalEffectiveStressKpa: [100, 100, 100],
      principalStrainIncrements: [[0.0001, 0, 0]],
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      frictionAngleDeg: 30,
      cohesionKpa: 0,
      dilationAngleDeg: 0,
    });
    const plastic = runDruckerPragerMaterialPoint({
      initialPrincipalEffectiveStressKpa: [100, 100, 100],
      principalStrainIncrements: Array.from({ length: 16 }, () => [0.001, -0.0002, -0.0002] as [number, number, number]),
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      frictionAngleDeg: 30,
      cohesionKpa: 0,
      dilationAngleDeg: 0,
    });

    expect(elastic.schemaVersion).toBe('fem-drucker-prager-material-point.v1');
    expect(elastic.finalStep.state).toBe('elastic');
    expect(elastic.finalStep.plasticMultiplier).toBe(0);
    expect(elastic.plasticStrainPrincipal).toEqual([0, 0, 0]);
    expect(elastic.converged).toBe(true);

    expect(plastic.finalStep.state).toBe('plastic');
    expect(plastic.finalStep.yieldResidualRatio).toBeLessThanOrEqual(
      plastic.policy.residualTolerance,
    );
    expect(plastic.finalStep.equivalentPlasticStrain).toBeGreaterThan(0);
    expect(plastic.plasticStrainPrincipal[0]).toBeGreaterThan(0);
    expect(plastic.finalStep.principalEffectiveStressKpa[0])
      .toBeGreaterThan(plastic.finalStep.principalEffectiveStressKpa[1]);
    expect(plastic.converged).toBe(true);
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
      stageDepthsM: [3, 6, 8],
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
      stageDepthsM: [1, 4, 8],
      supportLevelsM: [2],
      allowableSupportLoadKnPerM: 25,
      requiredPassiveSafetyFactor: 1.5,
      requiredBasalHeaveSafetyFactor: 1.5,
    });

    expect(accepted.schemaVersion).toBe('fem-excavation-support-design-check.v1');
    expect(accepted.designScope).toBe('screening-only-not-structural-design');
    expect(accepted.status).toBe('accepted');
    expect(accepted.checks.map((check) => check.id)).toEqual([
      'support-capacity',
      'passive-toe-resistance',
      'basal-heave',
      'staged-support-reaction-sequence',
    ]);
    expect(accepted.stageChecks).toHaveLength(3);
    expect(accepted.stageChecks.every((check) => check.status === 'accepted')).toBe(true);
    expect(accepted.stageChecks.at(-1)).toMatchObject({
      stageDepthM: 8,
      installedSupportLevelsM: [1, 4],
      status: 'accepted',
    });
    expect(accepted.acceptanceBlockers).toEqual([]);
    expect(accepted.productionBlockers).toContain(
      'jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented',
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.checks.some((check) => check.status === 'blocked')).toBe(true);
    expect(blocked.stageChecks[0]?.blockerCodes).toContain('support-level-missing');
    expect(blocked.acceptanceBlockers).toContain('stage-1-support-reaction.support-level-missing');
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

    const productionDesign = validateFemReviewerApprovalRecord({
      schemaVersion: 'fem-reviewer-approval.v1',
      recordId: 'fem-approval-production',
      caseId: 'raft-settlement-demo',
      caseHashSha256: 'c'.repeat(64),
      validationSummary: {
        status: 'review',
        blockers: 0,
        reviewItems: 3,
        findingCodes: ['experimental-only', 'not-design-calculation'],
      },
      reviewer: {
        name: 'Jane Engineer',
        licenseId: 'PE-98765',
        jurisdiction: 'US-NY',
      },
      approvedAt: '2026-06-01T00:00:00.000Z',
      scope: 'production-design',
      assumptions: ['Geometry and load inputs reviewed.'],
      limitations: ['Not a production design calculation.'],
      approvalStatement: 'Reviewed and approved for production design.',
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
    expect(productionDesign.status).toBe('blocked');
    expect(productionDesign.blockerCodes).toContain('scope.production-design-blocked');
  });

  it('registers source-backed benchmark references and blocks missing commercial comparison results', () => {
    const report = runFemEngineeringEvidenceSuite();

    expect(report.externalBenchmarkAcceptance).toMatchObject({
      schemaVersion: 'fem-external-benchmark-acceptance.v2',
      status: 'blocked',
      productionReadinessBlocked: true,
      requiredSourceTypes: ['published-source', 'commercial-solver'],
    });
    expect(report.externalBenchmarkAcceptance.references.map((reference) => reference.id)).toEqual(expect.arrayContaining([
      'terzaghi-1943-theoretical-soil-mechanics',
      'biot-1941-three-dimensional-consolidation',
      'opensees-drucker-prager-material',
      'opengeosys-hydro-mechanics-benchmarks',
      'opengeosys-richards-flow-benchmarks',
    ]));
    expect(report.externalBenchmarkAcceptance.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'published-source',
        publishedSource: expect.objectContaining({
          doi: '10.1002/9780470172766',
        }),
      }),
      expect.objectContaining({
        sourceType: 'open-source-solver',
        referenceSolver: expect.objectContaining({
          name: 'OpenSees',
          analysisProcedure: expect.stringContaining('Drucker-Prager'),
        }),
      }),
      expect.objectContaining({
        sourceType: 'open-source-solver',
        referenceSolver: expect.objectContaining({
          name: 'OpenGeoSys',
        }),
      }),
    ]));
    expect(report.externalBenchmarkAcceptance.comparisonResults).toEqual([]);
    expect(report.externalBenchmarkAcceptance.coverageSummary).toMatchObject({
      schemaVersion: 'fem-external-benchmark-coverage.v1',
      acceptedComparisonCount: 0,
      acceptedPublishedComparisonCount: 0,
      acceptedCommercialComparisonCount: 0,
      acceptedOpenSourceComparisonCount: 0,
      fullyCoveredRequiredQuantityIds: [],
      partiallyCoveredRequiredQuantityIds: [],
      missingRequiredSourceTypes: ['published-source', 'commercial-solver'],
    });
    expect(report.externalBenchmarkAcceptance.acceptanceStatement).toContain('External benchmark acceptance is incomplete');
    expect(report.externalBenchmarkAcceptance.requiredQuantities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'consolidation-settlement-time-curve',
        feature: 'consolidation',
        quantity: 'settlement-time curve and degree of consolidation',
        tolerance: 0.02,
        toleranceType: 'absolute-or-relative',
        requiredReferenceSourceTypes: ['published-source', 'commercial-solver'],
      }),
      expect.objectContaining({
        id: 'biot-pore-pressure-dissipation',
        feature: 'coupled-biot-plane-strain',
        quantity: 'excess pore-pressure dissipation curve',
        tolerance: 0.05,
        toleranceType: 'relative',
      }),
    ]));
    expect(report.externalBenchmarkAcceptance.blockerCodes).toEqual(expect.arrayContaining([
      'external-benchmark-commercial-solver-citation-missing',
      'external-benchmark-comparison-results-missing',
      'external-benchmark.required-quantities.nonlinear-plane-strain-displacement-envelope.reference-source-types-missing',
      'external-benchmark.required-quantities.nonlinear-plane-strain-displacement-envelope.accepted-comparison-missing.published-source',
      'external-benchmark.required-quantities.nonlinear-plane-strain-displacement-envelope.accepted-comparison-missing.commercial-solver',
    ]));
    expect(report.remainingProductionBlockers).toEqual(expect.arrayContaining([
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
      'external-benchmark-commercial-solver-citation-missing',
      'external-benchmark-comparison-results-missing',
    ]));
  });

  it('records source citations and required quantity tolerances for complete external metadata', () => {
    const contract = buildFemExternalBenchmarkAcceptanceContract({
      references: [
        {
          id: 'published-benchmark-1',
          sourceType: 'published-source',
          label: 'Published plane-strain consolidation benchmark',
          citation: 'Example Author (2024), plane-strain consolidation benchmark, Section 3.',
          publishedSource: {
            title: 'Plane-Strain Consolidation Benchmark',
            authors: ['Example Author'],
            year: 2024,
            publication: 'Example Geotechnical Benchmarks',
            section: 'Section 3',
          },
        },
        {
          id: 'commercial-solver-1',
          sourceType: 'commercial-solver',
          label: 'Commercial solver comparison archive',
          citation: 'Reference solver archive SHA256 abc123 for plane-strain consolidation fixture.',
          referenceSolver: {
            name: 'Reference FEM Solver',
            version: '2024.1',
            vendor: 'Reference Vendor',
            analysisProcedure: 'plane-strain consolidation',
            elementType: 'quad4 u-p',
          },
        },
      ],
      requiredQuantities: [
        {
          id: 'settlement-time',
          feature: 'consolidation',
          quantity: 'settlement-time curve',
          unit: 'mm',
          tolerance: 0.02,
          toleranceType: 'relative',
          requiredReferenceSourceTypes: ['published-source', 'commercial-solver'],
        },
      ],
      comparisonResults: [
        {
          id: 'published-settlement-time-curve',
          quantityRequirementId: 'settlement-time',
          referenceId: 'published-benchmark-1',
          caseId: 'plane-strain-consolidation-fixture',
          comparisonKind: 'series-summary',
          metricName: 'settlementAtFinalTime',
          quantity: 'settlement-time curve',
          unit: 'mm',
          actual: 49.7,
          expected: 50,
          tolerance: 0.02,
          toleranceType: 'relative',
          accepted: true,
          candidateSolver: localCandidateSolver('plane-strain-consolidation-fixture'),
          evidenceHashSha256: 'a'.repeat(64),
          resultHashSha256: 'b'.repeat(64),
          seriesSummary: seriesSummary('c'),
        },
        {
          id: 'commercial-settlement-time-curve',
          quantityRequirementId: 'settlement-time',
          referenceId: 'commercial-solver-1',
          caseId: 'plane-strain-consolidation-fixture',
          comparisonKind: 'scalar',
          metricName: 'settlementAtFinalTime',
          quantity: 'settlement-time curve',
          unit: 'mm',
          actual: 50.4,
          expected: 50,
          tolerance: 0.02,
          toleranceType: 'relative',
          accepted: true,
          candidateSolver: localCandidateSolver('plane-strain-consolidation-fixture'),
          referenceSolver: commercialReferenceSolver('commercial-plane-strain-consolidation-fixture'),
          evidenceHashSha256: 'd'.repeat(64),
          resultHashSha256: 'e'.repeat(64),
        },
      ],
    });

    expect(contract.status).toBe('accepted-comparisons-ready');
    expect(contract.productionReadinessBlocked).toBe(false);
    expect(contract.references).toEqual([
      expect.objectContaining({
        sourceType: 'published-source',
        citation: expect.stringContaining('Example Author'),
        publishedSource: expect.objectContaining({
          title: 'Plane-Strain Consolidation Benchmark',
          authors: ['Example Author'],
          year: 2024,
        }),
      }),
      expect.objectContaining({
        sourceType: 'commercial-solver',
        referenceSolver: expect.objectContaining({
          name: 'Reference FEM Solver',
          version: '2024.1',
          analysisProcedure: 'plane-strain consolidation',
        }),
      }),
    ]);
    expect(contract.comparisonResults).toHaveLength(2);
    expect(contract.comparisonResults.every((result) => result.accepted)).toBe(true);
    expect(contract.comparisonResults[0]).toMatchObject({
      comparisonKind: 'series-summary',
      metricName: 'settlementAtFinalTime',
      resultHashSha256: 'b'.repeat(64),
      seriesSummary: expect.objectContaining({
        seriesHashSha256: 'c'.repeat(64),
      }),
    });
    expect(contract.coverageSummary).toMatchObject({
      acceptedComparisonCount: 2,
      acceptedPublishedComparisonCount: 1,
      acceptedCommercialComparisonCount: 1,
      fullyCoveredRequiredQuantityIds: ['settlement-time'],
      missingRequiredSourceTypes: [],
    });
    expect(contract.requiredQuantities).toEqual([
      expect.objectContaining({
        quantity: 'settlement-time curve',
        tolerance: 0.02,
        toleranceType: 'relative',
        requiredReferenceSourceTypes: ['published-source', 'commercial-solver'],
      }),
    ]);
    expect(contract.acceptanceStatement).toContain('does not approve production design');
  });

  it('does not accept absolute-only tolerances through an implicit relative pass', () => {
    const check = evaluateFemTolerance('absolute-only displacement', 12, 10, 0.5, {
      unit: 'mm',
    });

    expect(check.error).toBe(2);
    expect(check.relativeTolerance).toBeUndefined();
    expect(check.accepted).toBe(false);
  });

  it('blocks external comparison results that use looser tolerances than the requirement', () => {
    const contract = buildFemExternalBenchmarkAcceptanceContract({
      references: [
        {
          id: 'published-benchmark-1',
          sourceType: 'published-source',
          label: 'Published benchmark',
          citation: 'Example Author (2024), benchmark.',
          publishedSource: {
            title: 'Benchmark',
            authors: ['Example Author'],
            year: 2024,
            publication: 'Example Journal',
          },
        },
        {
          id: 'commercial-solver-1',
          sourceType: 'commercial-solver',
          label: 'Commercial solver archive',
          citation: 'Commercial solver result archive.',
          referenceSolver: {
            name: 'Reference FEM Solver',
            version: '2024.1',
          },
        },
      ],
      requiredQuantities: [
        {
          id: 'settlement-time',
          feature: 'consolidation',
          quantity: 'settlement-time curve',
          unit: 'mm',
          tolerance: 0.02,
          toleranceType: 'relative',
          requiredReferenceSourceTypes: ['published-source', 'commercial-solver'],
        },
      ],
      comparisonResults: [
        {
          id: 'published-too-loose',
          quantityRequirementId: 'settlement-time',
          referenceId: 'published-benchmark-1',
          caseId: 'case-1',
          comparisonKind: 'scalar',
          metricName: 'settlementAtFinalTime',
          quantity: 'settlement-time curve',
          unit: 'mm',
          actual: 54,
          expected: 50,
          tolerance: 0.10,
          toleranceType: 'relative',
          accepted: true,
          candidateSolver: localCandidateSolver('case-1'),
          evidenceHashSha256: 'c'.repeat(64),
          resultHashSha256: 'd'.repeat(64),
        },
        {
          id: 'commercial-accepted',
          quantityRequirementId: 'settlement-time',
          referenceId: 'commercial-solver-1',
          caseId: 'case-1',
          comparisonKind: 'scalar',
          metricName: 'settlementAtFinalTime',
          quantity: 'settlement-time curve',
          unit: 'mm',
          actual: 50.1,
          expected: 50,
          tolerance: 0.02,
          toleranceType: 'relative',
          accepted: true,
          candidateSolver: localCandidateSolver('case-1'),
          referenceSolver: commercialReferenceSolver('commercial-case-1'),
          evidenceHashSha256: 'e'.repeat(64),
          resultHashSha256: 'f'.repeat(64),
        },
      ],
    });

    expect(contract.status).toBe('blocked');
    expect(contract.blockerCodes).toEqual(expect.arrayContaining([
      'external-benchmark.comparison-results.published-too-loose.tolerance-too-loose',
      'external-benchmark.comparison-results.published-too-loose.not-accepted',
      'external-benchmark.required-quantities.settlement-time.accepted-comparison-missing.published-source',
    ]));
  });

  it('blocks external comparison results without metric names, solver metadata, hashes, or valid series summaries', () => {
    const contract = buildFemExternalBenchmarkAcceptanceContract({
      references: [
        {
          id: 'commercial-solver-1',
          sourceType: 'commercial-solver',
          label: 'Commercial solver archive',
          citation: 'Commercial solver result archive.',
          referenceSolver: {
            name: 'Reference FEM Solver',
            version: '2024.1',
          },
        },
      ],
      requiredQuantities: [
        {
          id: 'settlement-time',
          feature: 'consolidation',
          quantity: 'settlement-time curve',
          unit: 'mm',
          tolerance: 0.02,
          toleranceType: 'relative',
          requiredReferenceSourceTypes: ['commercial-solver'],
        },
      ],
      comparisonResults: [
        {
          id: 'bad-series-metadata',
          quantityRequirementId: 'settlement-time',
          referenceId: 'commercial-solver-1',
          caseId: 'case-1',
          comparisonKind: 'series-summary',
          metricName: '',
          quantity: 'settlement-time curve',
          unit: 'mm',
          actual: 50,
          expected: 50,
          tolerance: 0.02,
          toleranceType: 'relative',
          accepted: true,
          candidateSolver: {} as any,
          evidenceHashSha256: 'not-a-hash',
          resultHashSha256: 'also-not-a-hash',
          seriesSummary: {
            ...seriesSummary('a'),
            seriesHashSha256: 'bad-series-hash',
          },
        },
      ],
    });

    expect(contract.status).toBe('blocked');
    expect(contract.coverageSummary.acceptedComparisonCount).toBe(0);
    expect(contract.blockerCodes).toEqual(expect.arrayContaining([
      'external-benchmark.comparison-results.bad-series-metadata.metric-name-missing',
      'external-benchmark.comparison-results.bad-series-metadata.evidence-hash-missing',
      'external-benchmark.comparison-results.bad-series-metadata.result-hash-missing',
      'external-benchmark.comparison-results.bad-series-metadata.candidate-solver-metadata-missing',
      'external-benchmark.comparison-results.bad-series-metadata.reference-solver-metadata-missing',
      'external-benchmark.comparison-results.bad-series-metadata.series-summary-invalid',
      'external-benchmark.required-quantities.settlement-time.accepted-comparison-missing.commercial-solver',
    ]));
  });

  it('records Gauss-point plasticity and path-state evidence without clearing production blockers', () => {
    const report = runFemEngineeringEvidenceSuite();
    const benchmarks = new Map(report.benchmarks.map((item) => [item.id, item]));

    expect(benchmarks.get('quad4-plane-strain-dp-affine-plastic-patch')).toMatchObject({
      feature: 'coupled-nonlinear-plane-strain',
      referenceType: 'internal-balance',
      quantity: 'maxYieldResidualRatio',
      expected: 0,
      tolerance: report.convergencePolicy.residualTolerance,
      status: 'accepted',
      evidence: expect.stringContaining('all Quad4 Gauss points'),
    });
    expect(benchmarks.get('quad4-plane-strain-dp-stage-state-carryover')).toMatchObject({
      feature: 'coupled-nonlinear-plane-strain',
      referenceType: 'internal-balance',
      quantity: 'plasticStrainMonotonic',
      actual: 1,
      expected: 1,
      tolerance: 0,
      status: 'accepted',
      evidence: expect.stringContaining('monotonic plastic-strain evidence'),
    });
    expect(benchmarks.get('quad4-plane-strain-dp-adaptive-cutback-rollback-recovery')).toMatchObject({
      feature: 'solver-convergence-and-tolerance',
      referenceType: 'internal-balance',
      quantity: 'adaptiveCutbackRollbackAccepted',
      actual: 1,
      expected: 1,
      tolerance: 0,
      status: 'accepted',
      evidence: expect.stringContaining('rejected attempts leave committed Gauss-point state unchanged'),
    });
    expect(report.productionReady).toBe(false);
    expect(report.remainingProductionBlockers).toEqual(expect.arrayContaining([
      'production-sparse-fem-solver-and-2d-3d-result-route-not-integrated-with-these-kernels',
      'nonlinear-plane-strain-plasticity-is-benchmark-scale-without-consistent-tangent-hardening-calibration-or-cross-solver-validation',
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
    ]));
  });

  it('records Biot transient acceptance audits for prescribed-gradient and drained dissipation modes', () => {
    const report = runFemEngineeringEvidenceSuite();
    const benchmarks = new Map(report.benchmarks.map((item) => [item.id, item]));

    expect(benchmarks.get('quad4-plane-strain-biot-u-p-transient-acceptance-policy')).toMatchObject({
      feature: 'solver-convergence-and-tolerance',
      referenceType: 'internal-balance',
      quantity: 'transientAcceptance',
      actual: 1,
      expected: 1,
      tolerance: 0,
      status: 'accepted',
      evidence: expect.stringContaining('prescribed-gradient relaxation'),
    });
    expect(benchmarks.get('quad4-plane-strain-biot-u-p-drained-dissipation-acceptance')).toMatchObject({
      feature: 'solver-convergence-and-tolerance',
      referenceType: 'internal-balance',
      quantity: 'drainedDissipationAccepted',
      actual: 1,
      expected: 1,
      tolerance: 0,
      status: 'accepted',
      evidence: expect.stringContaining('drained-dissipation transient acceptance gate'),
    });
  });

  it('records support member yield, buckling, flexure, and reviewer-metadata evidence', () => {
    const report = runFemEngineeringEvidenceSuite();
    const benchmarks = new Map(report.benchmarks.map((item) => [item.id, item]));

    expect(benchmarks.get('support-member-yield-buckling-interaction')).toMatchObject({
      feature: 'support-design',
      referenceType: 'internal-balance',
      quantity: 'supportMemberAccepted',
      actual: 1,
      expected: 1,
      tolerance: 0,
      status: 'accepted',
      evidence: expect.stringContaining('Euler buckling'),
    });
  });

  it('runs the full evidence suite without changing the public production gate', () => {
    const report = runFemEngineeringEvidenceSuite();

    expect(report.schemaVersion).toBe('fem-engineering-evidence.v1');
    expect(report.status).toBe('kernel-verified');
    expect(report.productionReady).toBe(false);
    expect(report.benchmarks.every((item) => item.status === 'accepted')).toBe(true);
    expect(report.benchmarks.map((item) => item.id)).toEqual(expect.arrayContaining([
      'drucker-prager-return-map-yield-residual',
      'drucker-prager-material-state-plastic',
      'quad4-plane-strain-affine-patch-exx',
      'quad4-plane-strain-affine-patch-eyy',
      'quad4-plane-strain-global-equilibrium',
      'quad4-plane-strain-loaded-reaction-balance',
      'quad4-plane-strain-loaded-free-residual',
      'quad4-plane-strain-dp-elastic-regression',
      'quad4-plane-strain-dp-affine-plastic-patch',
      'quad4-plane-strain-dp-global-newton-residual',
      'quad4-plane-strain-dp-stage-state-carryover',
      'quad4-plane-strain-dp-collapse-detection',
      'quad4-plane-strain-dp-adaptive-cutback-rollback-recovery',
      'quad4-plane-strain-seepage-linear-head-flow',
      'quad4-plane-strain-seepage-boundary-mass-balance',
      'quad4-plane-strain-seepage-effective-stress-reduction',
      'quad4-plane-strain-biot-u-p-dof-coupling',
      'quad4-plane-strain-biot-u-p-effective-stress-coupling',
      'quad4-plane-strain-biot-u-p-free-residual',
      'quad4-plane-strain-biot-u-p-mass-residual',
      'quad4-plane-strain-biot-u-p-transient-acceptance-policy',
      'quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract',
      'quad4-plane-strain-biot-u-p-alpha-zero-decoupling',
      'quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation',
      'quad4-plane-strain-biot-u-p-drained-dissipation-acceptance',
      'excavation-support-staged-reaction-sequence',
      'support-member-yield-buckling-interaction',
    ]));
    expect(report.verifiedFeatures).toEqual(expect.arrayContaining([
      'global-plane-strain-assembly',
      'coupled-nonlinear-plane-strain',
      'coupled-biot-plane-strain',
      'nonlinear-plasticity',
      'consolidation',
      'seepage-pore-pressure-coupling',
      'support-design',
      'solver-convergence-and-tolerance',
      'licensed-engineer-review-workflow',
    ]));
    expect(report.remainingProductionBlockers).toContain('published-commercial-cross-solver-benchmark-corpus-not-approved');
    expect(report.remainingProductionBlockers).toContain(
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
    );
  });
});

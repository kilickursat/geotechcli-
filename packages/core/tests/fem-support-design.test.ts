import { describe, expect, it } from 'vitest';

import {
  runFemSupportMemberDesignCheck,
  validateFemSupportMemberDesignCheckInput,
  type FemSupportMemberDesignCheckInput,
} from '../src/fem/index.js';

type SupportInputOverrides =
  Partial<Omit<FemSupportMemberDesignCheckInput, 'units' | 'member' | 'demand' | 'factors' | 'review'>> & {
    units?: Partial<FemSupportMemberDesignCheckInput['units']>;
    member?: Partial<FemSupportMemberDesignCheckInput['member']>;
    demand?: Partial<Omit<FemSupportMemberDesignCheckInput['demand'], 'source'>> & {
      source?: Partial<FemSupportMemberDesignCheckInput['demand']['source']>;
    };
    factors?: Partial<NonNullable<FemSupportMemberDesignCheckInput['factors']>>;
    review?: Partial<Omit<FemSupportMemberDesignCheckInput['review'], 'reviewer'>> & {
      reviewer?: Partial<FemSupportMemberDesignCheckInput['review']['reviewer']>;
    };
  };

function buildSupportInput(
  overrides: SupportInputOverrides = {},
): FemSupportMemberDesignCheckInput {
  const base: FemSupportMemberDesignCheckInput = {
    schemaVersion: 'fem-support-member-design-input.v1',
    units: {
      length: 'm',
      force: 'kN',
      stress: 'MPa',
      area: 'm2',
      moment: 'kN-m',
      momentOfInertia: 'm4',
      sectionModulus: 'm3',
      utilization: 'ratio',
    },
    member: {
      id: 'strut-l1-bay-03',
      kind: 'strut',
      label: 'Level 1 excavation strut, bay 03',
      sectionLabel: 'Reviewed pipe strut section',
      unbracedLengthM: 4,
      effectiveLengthFactor: 1,
      areaM2: 0.015,
      weakAxisMomentOfInertiaM4: 1.2e-4,
      sectionModulusM3: 0.0012,
      yieldStrengthMpa: 250,
      elasticModulusMpa: 200_000,
    },
    demand: {
      axialCompressionDemandKn: 900,
      bendingMomentDemandKnM: 40,
      source: {
        source: 'fem-result-envelope',
        caseId: 'excavation-case-017',
        stageId: 'stage-2',
        loadCombination: 'temporary-support-envelope',
        description: 'Reviewed FEM support reaction envelope at level 1.',
        resultHashSha256: 'a'.repeat(64),
      },
    },
    factors: {
      demandFactor: 1.2,
      resistanceFactorCompression: 0.9,
      resistanceFactorFlexure: 0.9,
      maximumSlendernessRatio: 160,
    },
    review: {
      schemaVersion: 'fem-support-design-review-metadata.v1',
      reviewer: {
        name: 'Jane Engineer',
        licenseId: 'PE-98765',
        jurisdiction: 'US-NY',
      },
      reviewedAt: '2026-06-04T00:00:00.000Z',
      assumptions: [
        {
          id: 'assume-effective-length',
          parameter: 'effective length factor',
          value: 1,
          unit: 'ratio',
          basis: 'Pinned end restraint assumed by reviewer for temporary strut layout.',
          confidence: 'review',
          reviewRequired: true,
        },
        {
          id: 'assume-demand-envelope',
          parameter: 'support reaction demand',
          value: 'stage-2 envelope',
          basis: 'Demand supplied by separately reviewed FEM result envelope.',
          confidence: 'review',
          reviewRequired: true,
        },
      ],
      limitations: ['Connection design and local buckling checks are outside this slice.'],
    },
  };

  return {
    ...base,
    ...overrides,
    units: { ...base.units, ...overrides.units },
    member: { ...base.member, ...overrides.member },
    demand: {
      ...base.demand,
      ...overrides.demand,
      source: { ...base.demand.source, ...overrides.demand?.source },
    },
    factors: { ...base.factors, ...overrides.factors },
    review: {
      ...base.review,
      ...overrides.review,
      reviewer: { ...base.review.reviewer, ...overrides.review?.reviewer },
      assumptions: overrides.review?.assumptions ?? base.review.assumptions,
      limitations: overrides.review?.limitations ?? base.review.limitations,
    },
  };
}

describe('FEM support member design check', () => {
  it('accepts a reviewed strut when demand stays below yield, buckling, flexure, and slenderness limits', () => {
    const result = runFemSupportMemberDesignCheck(buildSupportInput());

    expect(result.schemaVersion).toBe('fem-support-member-design-check.v1');
    expect(result.designScope).toBe('support-member-limit-state-check-only');
    expect(result.productionClaim).toBe(false);
    expect(result.status).toBe('accepted');
    expect(result.acceptanceBlockers).toEqual([]);
    expect(result.demand.factoredAxialCompressionDemandKn).toBe(1080);
    expect(result.capacities.nominalYieldCompressionCapacityKn).toBe(3750);
    expect(result.capacities.designCompressionCapacityKn).toBe(3375);
    expect(result.capacities.designFlexuralCapacityKnM).toBe(270);
    expect(result.limitStates.every((limitState) => limitState.status === 'accepted')).toBe(true);
    expect(result.controllingLimitState.id).toBe('combined-axial-flexure');
    expect(result.controllingLimitState.utilization).toBeCloseTo(0.497778, 6);
    expect(result.convergence).toMatchObject({
      schemaVersion: 'fem-support-member-convergence.v1',
      method: 'closed-form-limit-state-evaluation',
      deterministic: true,
      status: 'converged',
      iterations: 1,
      residualRatio: 0,
    });
  });

  it('blocks an overloaded brace without treating the deterministic check as a convergence failure', () => {
    const result = runFemSupportMemberDesignCheck(buildSupportInput({
      member: {
        kind: 'brace',
        id: 'brace-l2-bay-07',
      },
      demand: {
        axialCompressionDemandKn: 3200,
        bendingMomentDemandKnM: 150,
      },
    }));

    expect(result.status).toBe('blocked');
    expect(result.convergence.status).toBe('converged');
    expect(result.acceptanceBlockers).toEqual(expect.arrayContaining([
      'support-member.axial-yield',
      'support-member.combined-axial-flexure',
    ]));
    expect(result.limitStates.find((limitState) => limitState.id === 'combined-axial-flexure'))
      .toMatchObject({
        status: 'blocked',
        unit: 'ratio',
      });
    expect(result.controllingLimitState.status).toBe('blocked');
    expect(result.controllingLimitState.utilization).toBeGreaterThan(1);
  });

  it('fails closed for invalid physical input before computing capacities', () => {
    const invalid = buildSupportInput({
      member: {
        areaM2: -0.01,
      },
    });
    const validation = validateFemSupportMemberDesignCheckInput(invalid);

    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toContain('member.areaM2.invalid');
    expect(() => runFemSupportMemberDesignCheck(invalid))
      .toThrow(/member\.areaM2\.invalid/);
  });

  it('fails closed for malformed reviewer metadata, assumptions, limitations, demand source, and factors', () => {
    const invalid = buildSupportInput();
    invalid.demand.source.resultHashSha256 = 'not-a-sha256-hash';
    invalid.factors!.demandFactor = 0;
    invalid.factors!.resistanceFactorCompression = 1.2;
    invalid.review.reviewer.licenseId = '';
    invalid.review.reviewedAt = 'not-a-date';
    invalid.review.assumptions = [
      {
        id: 'bad-assumption',
        parameter: 'support reaction demand',
        value: '',
        basis: 'Reviewer supplied demand basis.',
        confidence: 'review',
        reviewRequired: 'yes' as never,
      },
    ];
    invalid.review.limitations = ['', 42 as never];

    const validation = validateFemSupportMemberDesignCheckInput(invalid);

    expect(validation.status).toBe('blocked');
    expect(validation.blockerCodes).toEqual(expect.arrayContaining([
      'demand.source.resultHashSha256.invalid',
      'factors.demandFactor.invalid',
      'factors.resistanceFactorCompression.exceeds-one',
      'review.reviewer.licenseId.missing',
      'review.reviewedAt.invalid',
      'review.assumptions.0.value.missing',
      'review.assumptions.0.reviewRequired.invalid',
      'review.limitations.0.invalid',
      'review.limitations.1.invalid',
    ]));
    expect(() => runFemSupportMemberDesignCheck(invalid))
      .toThrow(/review\.reviewedAt\.invalid/);
  });

  it('preserves explicit units, demand source, reviewer identity, assumptions, and limitations', () => {
    const input = buildSupportInput();
    const result = runFemSupportMemberDesignCheck(input);

    expect(result.units).toEqual(input.units);
    expect(result.demand.source).toMatchObject({
      source: 'fem-result-envelope',
      caseId: 'excavation-case-017',
      stageId: 'stage-2',
      loadCombination: 'temporary-support-envelope',
    });
    expect(result.review.reviewer).toEqual({
      name: 'Jane Engineer',
      licenseId: 'PE-98765',
      jurisdiction: 'US-NY',
    });
    expect(result.review.assumptions.map((assumption) => assumption.id)).toEqual([
      'assume-effective-length',
      'assume-demand-envelope',
    ]);
    expect(result.review.assumptions).not.toBe(input.review.assumptions);
    expect(result.limitations.join(' ')).toMatch(/does not run or approve a full nonlinear FEM model/i);
    expect(result.limitations).toContain('Connection design and local buckling checks are outside this slice.');
  });
});

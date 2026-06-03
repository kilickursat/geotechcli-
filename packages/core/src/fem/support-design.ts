import type { FemConvergencePolicy } from './engineering-evidence.js';
import type { FemAssumption } from './types.js';

export type FemSupportMemberKind = 'strut' | 'brace';
export type FemSupportDesignStatus = 'accepted' | 'blocked';

export interface FemSupportDesignUnits {
  length: 'm';
  force: 'kN';
  stress: 'MPa';
  area: 'm2';
  moment: 'kN-m';
  momentOfInertia: 'm4';
  sectionModulus: 'm3';
  utilization: 'ratio';
}

export interface FemSupportDemandSource {
  source: 'fem-result-envelope' | 'support-reaction-screening' | 'reviewed-hand-calculation';
  loadCombination: string;
  description: string;
  caseId?: string;
  stageId?: string;
  resultHashSha256?: string;
}

export interface FemSupportMemberDemand {
  axialCompressionDemandKn: number;
  bendingMomentDemandKnM?: number;
  source: FemSupportDemandSource;
}

export interface FemSupportMemberProperties {
  id: string;
  kind: FemSupportMemberKind;
  label?: string;
  sectionLabel?: string;
  unbracedLengthM: number;
  effectiveLengthFactor: number;
  areaM2: number;
  weakAxisMomentOfInertiaM4: number;
  sectionModulusM3?: number;
  yieldStrengthMpa: number;
  elasticModulusMpa: number;
}

export interface FemSupportDesignFactors {
  demandFactor?: number;
  resistanceFactorCompression?: number;
  resistanceFactorFlexure?: number;
  maximumSlendernessRatio?: number;
}

export interface FemSupportDesignReviewer {
  name: string;
  licenseId: string;
  jurisdiction: string;
}

export interface FemSupportDesignReviewMetadata {
  schemaVersion: 'fem-support-design-review-metadata.v1';
  reviewer: FemSupportDesignReviewer;
  reviewedAt: string;
  assumptions: FemAssumption[];
  limitations: string[];
}

export interface FemSupportMemberDesignCheckInput {
  schemaVersion: 'fem-support-member-design-input.v1';
  units: FemSupportDesignUnits;
  member: FemSupportMemberProperties;
  demand: FemSupportMemberDemand;
  factors?: FemSupportDesignFactors;
  review: FemSupportDesignReviewMetadata;
  policy?: FemConvergencePolicy;
}

export interface FemSupportMemberDesignInputValidation {
  schemaVersion: 'fem-support-member-design-input-validation.v1';
  status: FemSupportDesignStatus;
  blockerCodes: string[];
  warnings: string[];
}

export interface FemSupportMemberLimitState {
  id: 'axial-yield' | 'euler-buckling' | 'flexural-yield' | 'combined-axial-flexure' | 'slenderness';
  demand: number;
  capacity: number;
  unit: 'kN' | 'kN-m' | 'ratio';
  utilization: number;
  status: FemSupportDesignStatus;
}

export interface FemSupportMemberConvergenceMetadata {
  schemaVersion: 'fem-support-member-convergence.v1';
  method: 'closed-form-limit-state-evaluation';
  deterministic: true;
  status: 'converged';
  iterations: 1;
  residualRatio: 0;
  tolerance: number;
}

export interface FemSupportMemberDesignCheckResult {
  schemaVersion: 'fem-support-member-design-check.v1';
  designScope: 'support-member-limit-state-check-only';
  productionClaim: false;
  method: 'closed-form-yield-buckling-slenderness-interaction';
  status: FemSupportDesignStatus;
  units: FemSupportDesignUnits;
  member: FemSupportMemberProperties & {
    effectiveLengthM: number;
    radiusOfGyrationM: number;
    slendernessRatio: number;
  };
  demand: FemSupportMemberDemand & {
    factoredAxialCompressionDemandKn: number;
    factoredBendingMomentDemandKnM: number;
  };
  factors: Required<FemSupportDesignFactors>;
  capacities: {
    nominalYieldCompressionCapacityKn: number;
    nominalEulerBucklingCapacityKn: number;
    designCompressionCapacityKn: number;
    designFlexuralCapacityKnM?: number;
  };
  limitStates: FemSupportMemberLimitState[];
  controllingLimitState: FemSupportMemberLimitState;
  acceptanceBlockers: string[];
  convergence: FemSupportMemberConvergenceMetadata;
  review: FemSupportDesignReviewMetadata;
  limitations: string[];
  policy: FemConvergencePolicy;
}

const DEFAULT_SUPPORT_DESIGN_UNITS: FemSupportDesignUnits = {
  length: 'm',
  force: 'kN',
  stress: 'MPa',
  area: 'm2',
  moment: 'kN-m',
  momentOfInertia: 'm4',
  sectionModulus: 'm3',
  utilization: 'ratio',
};

const DEFAULT_SUPPORT_DESIGN_FACTORS: Required<FemSupportDesignFactors> = {
  demandFactor: 1,
  resistanceFactorCompression: 0.9,
  resistanceFactorFlexure: 0.9,
  maximumSlendernessRatio: 200,
};

const DEFAULT_SUPPORT_DESIGN_CONVERGENCE_POLICY: FemConvergencePolicy = {
  schemaVersion: 'fem-convergence-policy.v1',
  residualTolerance: 1e-6,
  forceBalanceTolerance: 1e-3,
  porePressureMassBalanceTolerance: 1e-3,
  maxIterations: 40,
  minAcceptedSteps: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function validatePolicy(policy: unknown, blockers: string[]): void {
  if (policy == null) return;
  if (!isRecord(policy)) {
    blockers.push('policy.invalid');
    return;
  }
  if (policy.schemaVersion !== 'fem-convergence-policy.v1') {
    blockers.push('policy.schema-version.unsupported');
  }
  for (const field of [
    'residualTolerance',
    'forceBalanceTolerance',
    'porePressureMassBalanceTolerance',
  ] as const) {
    if (!isFinitePositive(policy[field])) {
      blockers.push(`policy.${field}.invalid`);
    }
  }
  if (!Number.isInteger(policy.maxIterations) || (policy.maxIterations as number) <= 0) {
    blockers.push('policy.maxIterations.invalid');
  }
  if (!Number.isInteger(policy.minAcceptedSteps) || (policy.minAcceptedSteps as number) <= 0) {
    blockers.push('policy.minAcceptedSteps.invalid');
  }
  if (
    Number.isInteger(policy.maxIterations) &&
    Number.isInteger(policy.minAcceptedSteps) &&
    (policy.minAcceptedSteps as number) > (policy.maxIterations as number)
  ) {
    blockers.push('policy.minAcceptedSteps.exceeds-maxIterations');
  }
}

function validateUnits(units: unknown, blockers: string[]): void {
  if (!isRecord(units)) {
    blockers.push('units.missing');
    return;
  }
  for (const [key, expected] of Object.entries(DEFAULT_SUPPORT_DESIGN_UNITS)) {
    if (units[key] !== expected) {
      blockers.push(`units.${key}.unsupported`);
    }
  }
}

function validateAssumptions(assumptions: unknown, blockers: string[]): void {
  if (!Array.isArray(assumptions) || assumptions.length === 0) {
    blockers.push('review.assumptions.missing');
    return;
  }
  assumptions.forEach((assumption, index) => {
    if (!isRecord(assumption)) {
      blockers.push(`review.assumptions.${index}.invalid`);
      return;
    }
    for (const field of ['id', 'parameter', 'basis'] as const) {
      if (!isNonEmptyString(assumption[field])) {
        blockers.push(`review.assumptions.${index}.${field}.missing`);
      }
    }
    if (assumption.value == null || (typeof assumption.value === 'string' && !assumption.value.trim())) {
      blockers.push(`review.assumptions.${index}.value.missing`);
    }
    if (
      assumption.confidence !== 'measured' &&
      assumption.confidence !== 'inferred' &&
      assumption.confidence !== 'review'
    ) {
      blockers.push(`review.assumptions.${index}.confidence.invalid`);
    }
    if (typeof assumption.reviewRequired !== 'boolean') {
      blockers.push(`review.assumptions.${index}.reviewRequired.invalid`);
    }
  });
}

export function validateFemSupportMemberDesignCheckInput(
  input: unknown,
): FemSupportMemberDesignInputValidation {
  const blockerCodes: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      schemaVersion: 'fem-support-member-design-input-validation.v1',
      status: 'blocked',
      blockerCodes: ['input.invalid'],
      warnings,
    };
  }

  if (input.schemaVersion !== 'fem-support-member-design-input.v1') {
    blockerCodes.push('schema-version.unsupported');
  }
  validateUnits(input.units, blockerCodes);
  validatePolicy(input.policy, blockerCodes);

  const member = input.member;
  if (!isRecord(member)) {
    blockerCodes.push('member.missing');
  } else {
    if (!isNonEmptyString(member.id)) blockerCodes.push('member.id.missing');
    if (member.kind !== 'strut' && member.kind !== 'brace') blockerCodes.push('member.kind.unsupported');
    for (const field of [
      'unbracedLengthM',
      'effectiveLengthFactor',
      'areaM2',
      'weakAxisMomentOfInertiaM4',
      'yieldStrengthMpa',
      'elasticModulusMpa',
    ] as const) {
      if (!isFinitePositive(member[field])) blockerCodes.push(`member.${field}.invalid`);
    }
    if (member.sectionModulusM3 != null && !isFinitePositive(member.sectionModulusM3)) {
      blockerCodes.push('member.sectionModulusM3.invalid');
    }
  }

  const demand = input.demand;
  if (!isRecord(demand)) {
    blockerCodes.push('demand.missing');
  } else {
    if (!isFinitePositive(demand.axialCompressionDemandKn)) {
      blockerCodes.push('demand.axialCompressionDemandKn.invalid');
    }
    if (demand.bendingMomentDemandKnM != null && !isFiniteNonNegative(demand.bendingMomentDemandKnM)) {
      blockerCodes.push('demand.bendingMomentDemandKnM.invalid');
    }
    const source = demand.source;
    if (!isRecord(source)) {
      blockerCodes.push('demand.source.missing');
    } else {
      if (
        source.source !== 'fem-result-envelope' &&
        source.source !== 'support-reaction-screening' &&
        source.source !== 'reviewed-hand-calculation'
      ) {
        blockerCodes.push('demand.source.source.unsupported');
      }
      if (!isNonEmptyString(source.loadCombination)) blockerCodes.push('demand.source.loadCombination.missing');
      if (!isNonEmptyString(source.description)) blockerCodes.push('demand.source.description.missing');
      if (source.resultHashSha256 != null && !/^[a-f0-9]{64}$/i.test(String(source.resultHashSha256))) {
        blockerCodes.push('demand.source.resultHashSha256.invalid');
      }
    }
  }

  const bendingDemand = isRecord(demand) && typeof demand.bendingMomentDemandKnM === 'number'
    ? demand.bendingMomentDemandKnM
    : 0;
  if (bendingDemand > 0 && (!isRecord(member) || !isFinitePositive(member.sectionModulusM3))) {
    blockerCodes.push('member.sectionModulusM3.required-for-bending');
  }

  const factors = input.factors;
  if (factors != null) {
    if (!isRecord(factors)) {
      blockerCodes.push('factors.invalid');
    } else {
      for (const field of [
        'demandFactor',
        'resistanceFactorCompression',
        'resistanceFactorFlexure',
        'maximumSlendernessRatio',
      ] as const) {
        if (factors[field] != null && !isFinitePositive(factors[field])) {
          blockerCodes.push(`factors.${field}.invalid`);
        }
      }
      for (const field of ['resistanceFactorCompression', 'resistanceFactorFlexure'] as const) {
        if (typeof factors[field] === 'number' && factors[field] > 1) {
          blockerCodes.push(`factors.${field}.exceeds-one`);
        }
      }
    }
  }

  const review = input.review;
  if (!isRecord(review)) {
    blockerCodes.push('review.missing');
  } else {
    if (review.schemaVersion !== 'fem-support-design-review-metadata.v1') {
      blockerCodes.push('review.schema-version.unsupported');
    }
    const reviewer = review.reviewer;
    if (!isRecord(reviewer)) {
      blockerCodes.push('review.reviewer.missing');
    } else {
      if (!isNonEmptyString(reviewer.name)) blockerCodes.push('review.reviewer.name.missing');
      if (!isNonEmptyString(reviewer.licenseId)) blockerCodes.push('review.reviewer.licenseId.missing');
      if (!isNonEmptyString(reviewer.jurisdiction)) blockerCodes.push('review.reviewer.jurisdiction.missing');
    }
    if (!isNonEmptyString(review.reviewedAt) || Number.isNaN(Date.parse(review.reviewedAt))) {
      blockerCodes.push('review.reviewedAt.invalid');
    }
    validateAssumptions(review.assumptions, blockerCodes);
    if (!Array.isArray(review.limitations) || review.limitations.length === 0) {
      blockerCodes.push('review.limitations.missing');
    } else {
      review.limitations.forEach((limitation, index) => {
        if (!isNonEmptyString(limitation)) {
          blockerCodes.push(`review.limitations.${index}.invalid`);
        }
      });
    }
  }

  const uniqueBlockers = [...new Set(blockerCodes)];
  return {
    schemaVersion: 'fem-support-member-design-input-validation.v1',
    status: uniqueBlockers.length === 0 ? 'accepted' : 'blocked',
    blockerCodes: uniqueBlockers,
    warnings,
  };
}

function copyAssumption(assumption: FemAssumption): FemAssumption {
  return { ...assumption };
}

function copyReviewMetadata(review: FemSupportDesignReviewMetadata): FemSupportDesignReviewMetadata {
  return {
    ...review,
    reviewer: { ...review.reviewer },
    assumptions: review.assumptions.map(copyAssumption),
    limitations: [...review.limitations],
  };
}

function buildLimitState(
  id: FemSupportMemberLimitState['id'],
  demand: number,
  capacity: number,
  unit: FemSupportMemberLimitState['unit'],
): FemSupportMemberLimitState {
  const utilization = demand / Math.max(capacity, 1e-12);
  return {
    id,
    demand: round(demand, unit === 'ratio' ? 6 : 4),
    capacity: round(capacity, unit === 'ratio' ? 6 : 4),
    unit,
    utilization: round(utilization, 6),
    status: utilization <= 1 ? 'accepted' : 'blocked',
  };
}

export function runFemSupportMemberDesignCheck(
  input: FemSupportMemberDesignCheckInput,
): FemSupportMemberDesignCheckResult {
  const inputValidation = validateFemSupportMemberDesignCheckInput(input);
  if (inputValidation.status === 'blocked') {
    throw new Error(
      `Invalid FEM support member design check input: ${inputValidation.blockerCodes.join(', ')}`,
    );
  }

  const policy = input.policy ?? DEFAULT_SUPPORT_DESIGN_CONVERGENCE_POLICY;
  const factors = {
    ...DEFAULT_SUPPORT_DESIGN_FACTORS,
    ...input.factors,
  };
  const effectiveLengthM = input.member.unbracedLengthM * input.member.effectiveLengthFactor;
  const radiusOfGyrationM = Math.sqrt(
    input.member.weakAxisMomentOfInertiaM4 / input.member.areaM2,
  );
  const slendernessRatio = effectiveLengthM / radiusOfGyrationM;
  const stressScaleKnPerM2 = 1000;
  const nominalYieldCompressionCapacityKn =
    input.member.yieldStrengthMpa * stressScaleKnPerM2 * input.member.areaM2;
  const nominalEulerBucklingCapacityKn =
    (Math.PI ** 2) *
    input.member.elasticModulusMpa *
    stressScaleKnPerM2 *
    input.member.weakAxisMomentOfInertiaM4 /
    (effectiveLengthM ** 2);
  const designYieldCompressionCapacityKn =
    factors.resistanceFactorCompression * nominalYieldCompressionCapacityKn;
  const designEulerBucklingCapacityKn =
    factors.resistanceFactorCompression * nominalEulerBucklingCapacityKn;
  const designCompressionCapacityKn = Math.min(
    designYieldCompressionCapacityKn,
    designEulerBucklingCapacityKn,
  );
  const factoredAxialCompressionDemandKn =
    input.demand.axialCompressionDemandKn * factors.demandFactor;
  const factoredBendingMomentDemandKnM =
    (input.demand.bendingMomentDemandKnM ?? 0) * factors.demandFactor;
  const designFlexuralCapacityKnM = input.member.sectionModulusM3 != null
    ? factors.resistanceFactorFlexure *
      input.member.yieldStrengthMpa *
      stressScaleKnPerM2 *
      input.member.sectionModulusM3
    : undefined;

  const limitStates: FemSupportMemberLimitState[] = [
    buildLimitState(
      'axial-yield',
      factoredAxialCompressionDemandKn,
      designYieldCompressionCapacityKn,
      'kN',
    ),
    buildLimitState(
      'euler-buckling',
      factoredAxialCompressionDemandKn,
      designEulerBucklingCapacityKn,
      'kN',
    ),
    buildLimitState('slenderness', slendernessRatio, factors.maximumSlendernessRatio, 'ratio'),
  ];

  if (factoredBendingMomentDemandKnM > 0 && designFlexuralCapacityKnM != null) {
    limitStates.push(buildLimitState(
      'flexural-yield',
      factoredBendingMomentDemandKnM,
      designFlexuralCapacityKnM,
      'kN-m',
    ));
  }

  const combinedInteraction =
    (factoredAxialCompressionDemandKn / Math.max(designCompressionCapacityKn, 1e-12)) +
    (
      factoredBendingMomentDemandKnM > 0 && designFlexuralCapacityKnM != null
        ? factoredBendingMomentDemandKnM / Math.max(designFlexuralCapacityKnM, 1e-12)
        : 0
    );
  limitStates.push(buildLimitState('combined-axial-flexure', combinedInteraction, 1, 'ratio'));

  const controllingLimitState = limitStates.reduce((controlling, current) =>
    current.utilization > controlling.utilization ? current : controlling);
  const acceptanceBlockers = limitStates
    .filter((limitState) => limitState.status === 'blocked')
    .map((limitState) => `support-member.${limitState.id}`);
  const status = acceptanceBlockers.length === 0 ? 'accepted' : 'blocked';
  const limitations = [
    'Closed-form member check only; this does not run or approve a full nonlinear FEM model.',
    'Demand must come from a separately reviewed FEM result envelope, screening calculation, or hand calculation.',
    'Connections, local buckling, corrosion allowance, seismic detailing, construction tolerance, and jurisdiction-specific code clauses require separate review.',
    ...input.review.limitations,
  ];

  return {
    schemaVersion: 'fem-support-member-design-check.v1',
    designScope: 'support-member-limit-state-check-only',
    productionClaim: false,
    method: 'closed-form-yield-buckling-slenderness-interaction',
    status,
    units: { ...input.units },
    member: {
      ...input.member,
      effectiveLengthM: round(effectiveLengthM, 6),
      radiusOfGyrationM: round(radiusOfGyrationM, 6),
      slendernessRatio: round(slendernessRatio, 6),
    },
    demand: {
      ...input.demand,
      source: { ...input.demand.source },
      factoredAxialCompressionDemandKn: round(factoredAxialCompressionDemandKn, 4),
      factoredBendingMomentDemandKnM: round(factoredBendingMomentDemandKnM, 4),
    },
    factors: {
      demandFactor: round(factors.demandFactor, 6),
      resistanceFactorCompression: round(factors.resistanceFactorCompression, 6),
      resistanceFactorFlexure: round(factors.resistanceFactorFlexure, 6),
      maximumSlendernessRatio: round(factors.maximumSlendernessRatio, 6),
    },
    capacities: {
      nominalYieldCompressionCapacityKn: round(nominalYieldCompressionCapacityKn, 4),
      nominalEulerBucklingCapacityKn: round(nominalEulerBucklingCapacityKn, 4),
      designCompressionCapacityKn: round(designCompressionCapacityKn, 4),
      ...(designFlexuralCapacityKnM != null
        ? { designFlexuralCapacityKnM: round(designFlexuralCapacityKnM, 4) }
        : {}),
    },
    limitStates,
    controllingLimitState,
    acceptanceBlockers,
    convergence: {
      schemaVersion: 'fem-support-member-convergence.v1',
      method: 'closed-form-limit-state-evaluation',
      deterministic: true,
      status: 'converged',
      iterations: 1,
      residualRatio: 0,
      tolerance: policy.forceBalanceTolerance,
    },
    review: copyReviewMetadata(input.review),
    limitations,
    policy,
  };
}

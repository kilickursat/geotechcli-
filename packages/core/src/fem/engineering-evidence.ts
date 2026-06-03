import { createHash } from 'node:crypto';

import { calculateLateralEarthPressure } from '../geo/lateral-earth-pressure.js';
import {
  buildPlaneStrainRectangularMesh,
  runPlaneStrainBiotConsolidation,
  runPlaneStrainDruckerPragerBiotPressureReplay,
  runPlaneStrainDruckerPragerLoadSteps,
  runPlaneStrainQuad4Assembly,
  runPlaneStrainSteadySeepage,
} from './plane-strain-assembly.js';
import { runFemSupportMemberDesignCheck } from './support-design.js';

export type FemEngineeringKernelFeature =
  | 'global-plane-strain-assembly'
  | 'coupled-nonlinear-plane-strain'
  | 'coupled-biot-plane-strain'
  | 'nonlinear-plasticity'
  | 'consolidation'
  | 'seepage-pore-pressure-coupling'
  | 'support-design'
  | 'solver-convergence-and-tolerance'
  | 'licensed-engineer-review-workflow';

export interface FemConvergencePolicy {
  schemaVersion: 'fem-convergence-policy.v1';
  residualTolerance: number;
  forceBalanceTolerance: number;
  porePressureMassBalanceTolerance: number;
  maxIterations: number;
  minAcceptedSteps: number;
}

export const DEFAULT_FEM_CONVERGENCE_POLICY: FemConvergencePolicy = {
  schemaVersion: 'fem-convergence-policy.v1',
  residualTolerance: 1e-6,
  forceBalanceTolerance: 1e-3,
  porePressureMassBalanceTolerance: 1e-3,
  maxIterations: 40,
  minAcceptedSteps: 3,
};

export interface FemToleranceCheck {
  quantity: string;
  actual: number;
  expected: number;
  absoluteTolerance: number;
  relativeTolerance?: number;
  unit?: string;
  error: number;
  relativeError: number;
  accepted: boolean;
}

export interface FemMohrCoulombMaterialPointInput {
  confiningEffectiveStressKpa: number;
  axialStrain: number;
  elasticModulusKpa: number;
  poissonRatio: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
  increments?: number;
  policy?: FemConvergencePolicy;
}

export interface FemMohrCoulombStressStep {
  step: number;
  axialStrain: number;
  majorEffectiveStressKpa: number;
  minorEffectiveStressKpa: number;
  deviatorStressKpa: number;
  yieldDeviatorStressKpa: number;
  plasticAxialStrain: number;
  mobilizedStrengthRatio: number;
  yieldResidualRatio: number;
  state: 'elastic' | 'plastic';
}

export interface FemMohrCoulombMaterialPointResult {
  schemaVersion: 'fem-mohr-coulomb-material-point.v1';
  signConvention: 'compression-positive';
  model: 'mohr-coulomb-elastic-perfectly-plastic-triaxial-compression';
  converged: boolean;
  failureAxialStrain: number;
  peakDeviatorStressKpa: number;
  finalStep: FemMohrCoulombStressStep;
  stressPath: FemMohrCoulombStressStep[];
  policy: FemConvergencePolicy;
}

export type FemPrincipalVector = [number, number, number];

export interface FemDruckerPragerParameterMapping {
  schemaVersion: 'fem-drucker-prager-parameter-mapping.v1';
  source: 'mohr-coulomb-triaxial-compression-fit';
  signConvention: 'compression-positive';
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg: number;
  rho: number;
  rhoBar: number;
  yieldStressKpa: number;
  compressionInterceptKpa: number;
}

export interface FemDruckerPragerMaterialPointInput {
  initialPrincipalEffectiveStressKpa: FemPrincipalVector;
  principalStrainIncrements: FemPrincipalVector[];
  elasticModulusKpa: number;
  poissonRatio: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
  hardeningModulusKpa?: number;
  policy?: FemConvergencePolicy;
}

export interface FemDruckerPragerStressStep {
  step: number;
  principalStrain: FemPrincipalVector;
  principalEffectiveStressKpa: FemPrincipalVector;
  meanEffectiveStressKpa: number;
  deviatoricStressNormKpa: number;
  compressionInterceptKpa: number;
  hardeningStressKpa: number;
  yieldValueKpa: number;
  yieldResidualRatio: number;
  plasticMultiplier: number;
  equivalentPlasticStrain: number;
  volumetricPlasticStrain: number;
  state: 'elastic' | 'plastic';
  iterations: number;
  converged: boolean;
}

export interface FemDruckerPragerMaterialPointResult {
  schemaVersion: 'fem-drucker-prager-material-point.v1';
  signConvention: 'compression-positive';
  model: 'drucker-prager-elastoplastic-principal-stress-return-mapping';
  mapping: FemDruckerPragerParameterMapping;
  elasticModuli: {
    bulkModulusKpa: number;
    shearModulusKpa: number;
  };
  converged: boolean;
  finalStep: FemDruckerPragerStressStep;
  stressPath: FemDruckerPragerStressStep[];
  plasticStrainPrincipal: FemPrincipalVector;
  policy: FemConvergencePolicy;
}

export interface FemConsolidationTimeStepperInput {
  layerThicknessM: number;
  drainage: 'single' | 'double';
  coefficientOfConsolidationM2PerYear: number;
  initialExcessPorePressureKpa: number;
  primarySettlementMm: number;
  timeStepsYears: number[];
  nodeCount?: number;
  policy?: FemConvergencePolicy;
}

export interface FemConsolidationStep {
  timeYears: number;
  timeFactor: number;
  averageExcessPorePressureKpa: number;
  degreeOfConsolidation: number;
  referenceDegreeOfConsolidation: number;
  settlementMm: number;
  referenceError: number;
}

export interface FemConsolidationTimeStepperResult {
  schemaVersion: 'fem-consolidation-time-stepper.v1';
  method: 'backward-euler-1d-terzaghi';
  drainagePathM: number;
  nodeCount: number;
  converged: boolean;
  maxReferenceError: number;
  finalStep: FemConsolidationStep;
  steps: FemConsolidationStep[];
  policy: FemConvergencePolicy;
}

export interface FemSeepage1DInput {
  hydraulicConductivityMPerS: number;
  domainLengthM: number;
  upstreamHeadM: number;
  downstreamHeadM: number;
  nodeCount?: number;
  transient?: {
    specificStorage1PerM: number;
    durationSeconds: number;
    timeSteps: number;
    initialHeadM?: number;
  };
  policy?: FemConvergencePolicy;
}

export interface FemSeepageNode {
  xM: number;
  headM: number;
  porePressureKpa: number;
}

export interface FemSeepageTransientStep {
  timeSeconds: number;
  maxHeadErrorToSteadyM: number;
  headsM: number[];
}

export interface FemSeepage1DResult {
  schemaVersion: 'fem-seepage-1d.v1';
  method: 'darcy-finite-difference-1d';
  steadyFlowM3PerSPerM: number;
  hydraulicGradient: number;
  massBalanceErrorRatio: number;
  converged: boolean;
  nodes: FemSeepageNode[];
  transientSteps: FemSeepageTransientStep[];
  policy: FemConvergencePolicy;
}

export interface FemHydroMechanicalCouplingInput {
  totalVerticalStressKpa: number;
  porePressureBeforeKpa: number;
  porePressureAfterKpa: number;
  constrainedModulusKpa: number;
  layerThicknessM: number;
  policy?: FemConvergencePolicy;
}

export interface FemHydroMechanicalCouplingResult {
  schemaVersion: 'fem-hydro-mechanical-coupling.v1';
  method: 'effective-stress-1d-coupling';
  effectiveStressBeforeKpa: number;
  effectiveStressAfterKpa: number;
  effectiveStressIncreaseKpa: number;
  settlementMm: number;
  stableEffectiveStress: boolean;
  converged: boolean;
  policy: FemConvergencePolicy;
}

export interface FemExcavationSupportDesignCheckInput {
  excavationDepthM: number;
  wallToeDepthM: number;
  unitWeightKnM3: number;
  frictionAngleDeg: number;
  cohesionKpa: number;
  surchargeKpa?: number;
  waterTableDepthM?: number;
  stageDepthsM?: number[];
  supportLevelsM: number[];
  allowableSupportLoadKnPerM: number;
  requiredPassiveSafetyFactor?: number;
  requiredBasalHeaveSafetyFactor?: number;
  policy?: FemConvergencePolicy;
}

export interface FemDesignCheck {
  id: string;
  actual: number;
  required: number;
  unit?: string;
  status: 'accepted' | 'blocked';
}

export interface FemExcavationSupportStageCheck {
  id: string;
  stageDepthM: number;
  installedSupportLevelsM: number[];
  activeEarthPressureKnPerM: number;
  supportReactionDemandKnPerM: number;
  supportCapacitySafetyFactor: number;
  blockerCodes: string[];
  status: 'accepted' | 'blocked';
}

export interface FemExcavationSupportDesignCheckResult {
  schemaVersion: 'fem-excavation-support-design-check.v1';
  method: 'rankine-earth-pressure-support-screening';
  designScope: 'screening-only-not-structural-design';
  activeEarthPressureKnPerM: number;
  passiveToeResistanceKnPerM: number;
  supportDemandKnPerM: number;
  supportCapacitySafetyFactor: number;
  passiveSafetyFactor: number;
  basalHeaveSafetyFactor: number;
  stageChecks: FemExcavationSupportStageCheck[];
  checks: FemDesignCheck[];
  acceptanceBlockers: string[];
  productionBlockers: string[];
  status: 'accepted' | 'blocked';
  policy: FemConvergencePolicy;
}

export interface FemReviewerApprovalRecord {
  schemaVersion: 'fem-reviewer-approval.v1';
  recordId: string;
  caseId: string;
  caseHashSha256: string;
  validationSummary: {
    status: 'ready' | 'review' | 'blocked';
    blockers: number;
    reviewItems: number;
    findingCodes: string[];
  };
  reviewer: {
    name: string;
    licenseId: string;
    jurisdiction: string;
  };
  approvedAt: string;
  scope: 'experimental-preview' | 'production-design';
  assumptions: string[];
  limitations: string[];
  approvalStatement: string;
}

export interface FemReviewerApprovalValidation {
  schemaVersion: 'fem-reviewer-approval-validation.v1';
  status: 'accepted' | 'blocked';
  blockerCodes: string[];
  warnings: string[];
}

export type FemExternalBenchmarkSourceType =
  | 'published-source'
  | 'commercial-solver'
  | 'open-source-solver';

export type FemExternalBenchmarkToleranceType = 'absolute' | 'relative' | 'absolute-or-relative';
export type FemExternalBenchmarkComparisonKind = 'scalar' | 'series-summary';

export interface FemExternalBenchmarkPublishedCitation {
  title: string;
  authors: string[];
  year: number;
  publication?: string;
  doi?: string;
  url?: string;
  section?: string;
}

export interface FemExternalBenchmarkReferenceSolverCitation {
  name: string;
  version: string;
  vendor?: string;
  analysisProcedure?: string;
  elementType?: string;
  url?: string;
  retrievedAt?: string;
}

export interface FemExternalBenchmarkReference {
  id: string;
  sourceType: FemExternalBenchmarkSourceType;
  label: string;
  citation: string;
  publishedSource?: FemExternalBenchmarkPublishedCitation;
  referenceSolver?: FemExternalBenchmarkReferenceSolverCitation;
}

export interface FemExternalBenchmarkSolverRunMetadata {
  name: string;
  version: string;
  vendor?: string;
  solverType: 'geotechcli-kernel' | 'published-reference' | 'commercial-solver' | 'open-source-solver' | 'deterministic-fixture';
  analysisProcedure?: string;
  elementType?: string;
  runId?: string;
}

export interface FemExternalBenchmarkSeriesStatistics {
  min: number;
  max: number;
  final: number;
  mean?: number;
}

export interface FemExternalBenchmarkSeriesSummary {
  xQuantity: string;
  xUnit: string;
  yQuantity: string;
  yUnit: string;
  pointCount: number;
  actual: FemExternalBenchmarkSeriesStatistics;
  expected: FemExternalBenchmarkSeriesStatistics;
  maxAbsoluteError: number;
  maxRelativeError: number;
  rmsError?: number;
  seriesHashSha256: string;
  notes?: string[];
}

export interface FemExternalBenchmarkQuantityRequirement {
  id: string;
  feature: FemEngineeringKernelFeature;
  quantity: string;
  unit: string;
  tolerance: number;
  toleranceType: FemExternalBenchmarkToleranceType;
  requiredReferenceSourceTypes: FemExternalBenchmarkSourceType[];
}

export interface FemExternalBenchmarkComparisonResult {
  id: string;
  quantityRequirementId: string;
  referenceId: string;
  caseId: string;
  comparisonKind?: FemExternalBenchmarkComparisonKind;
  metricName?: string;
  quantity: string;
  unit: string;
  actual: number;
  expected: number;
  tolerance: number;
  toleranceType: FemExternalBenchmarkToleranceType;
  accepted: boolean;
  candidateSolver?: FemExternalBenchmarkSolverRunMetadata;
  referenceSolver?: FemExternalBenchmarkSolverRunMetadata;
  evidenceHashSha256?: string;
  resultHashSha256?: string;
  seriesSummary?: FemExternalBenchmarkSeriesSummary;
  notes?: string[];
}

export interface FemExternalBenchmarkCoverageSummary {
  schemaVersion: 'fem-external-benchmark-coverage.v1';
  acceptedComparisonCount: number;
  acceptedPublishedComparisonCount: number;
  acceptedCommercialComparisonCount: number;
  acceptedOpenSourceComparisonCount: number;
  requiredQuantityCount: number;
  partiallyCoveredRequiredQuantityIds: string[];
  fullyCoveredRequiredQuantityIds: string[];
  missingRequiredSourceTypes: FemExternalBenchmarkSourceType[];
}

export interface FemExternalBenchmarkAcceptanceContract {
  schemaVersion: 'fem-external-benchmark-acceptance.v2';
  status: 'accepted-comparisons-ready' | 'blocked';
  productionReadinessBlocked: boolean;
  requiredSourceTypes: FemExternalBenchmarkSourceType[];
  references: FemExternalBenchmarkReference[];
  requiredQuantities: FemExternalBenchmarkQuantityRequirement[];
  comparisonResults: FemExternalBenchmarkComparisonResult[];
  coverageSummary: FemExternalBenchmarkCoverageSummary;
  blockerCodes: string[];
  acceptanceStatement: string;
}

export interface FemEngineeringBenchmarkCase {
  id: string;
  feature: FemEngineeringKernelFeature;
  referenceType: 'closed-form' | 'internal-balance' | 'review-record-contract';
  quantity: string;
  actual: number;
  expected: number;
  tolerance: number;
  unit?: string;
  status: 'accepted' | 'blocked';
  evidence: string;
}

export interface FemEngineeringEvidenceReport {
  schemaVersion: 'fem-engineering-evidence.v1';
  status: 'kernel-verified' | 'blocked';
  productionReady: false;
  verifiedFeatures: FemEngineeringKernelFeature[];
  benchmarks: FemEngineeringBenchmarkCase[];
  externalBenchmarkAcceptance: FemExternalBenchmarkAcceptanceContract;
  convergencePolicy: FemConvergencePolicy;
  remainingProductionBlockers: string[];
  releasePositioning: string;
}

const REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES: FemExternalBenchmarkSourceType[] = [
  'published-source',
  'commercial-solver',
];

const DEFAULT_EXTERNAL_BENCHMARK_REQUIRED_QUANTITIES: FemExternalBenchmarkQuantityRequirement[] = [
  {
    id: 'nonlinear-plane-strain-displacement-envelope',
    feature: 'coupled-nonlinear-plane-strain',
    quantity: 'nodal displacement envelope',
    unit: 'mm',
    tolerance: 0.05,
    toleranceType: 'relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
  {
    id: 'global-reaction-force-balance',
    feature: 'solver-convergence-and-tolerance',
    quantity: 'reaction force and applied load balance',
    unit: 'kN',
    tolerance: 0.02,
    toleranceType: 'relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
  {
    id: 'consolidation-settlement-time-curve',
    feature: 'consolidation',
    quantity: 'settlement-time curve and degree of consolidation',
    unit: 'mm, ratio',
    tolerance: 0.02,
    toleranceType: 'absolute-or-relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
  {
    id: 'biot-pore-pressure-dissipation',
    feature: 'coupled-biot-plane-strain',
    quantity: 'excess pore-pressure dissipation curve',
    unit: 'kPa',
    tolerance: 0.05,
    toleranceType: 'relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
  {
    id: 'seepage-head-flux-gradient',
    feature: 'seepage-pore-pressure-coupling',
    quantity: 'hydraulic head, flux, and gradient checks',
    unit: 'm, m3/s, ratio',
    tolerance: 0.03,
    toleranceType: 'relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
  {
    id: 'support-reaction-and-stability-factors',
    feature: 'support-design',
    quantity: 'support reaction and stability safety-factor checks',
    unit: 'kN, ratio',
    tolerance: 0.05,
    toleranceType: 'relative',
    requiredReferenceSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES,
  },
];

const DEFAULT_EXTERNAL_BENCHMARK_REFERENCES: FemExternalBenchmarkReference[] = [
  {
    id: 'terzaghi-1943-theoretical-soil-mechanics',
    sourceType: 'published-source',
    label: 'Terzaghi 1D consolidation and effective-stress source reference',
    citation: 'Terzaghi, K. (1943). Theoretical Soil Mechanics. John Wiley & Sons. doi:10.1002/9780470172766.',
    publishedSource: {
      title: 'Theoretical Soil Mechanics',
      authors: ['Karl Terzaghi'],
      year: 1943,
      publication: 'John Wiley & Sons',
      doi: '10.1002/9780470172766',
      url: 'https://doi.org/10.1002/9780470172766',
    },
  },
  {
    id: 'biot-1941-three-dimensional-consolidation',
    sourceType: 'published-source',
    label: 'Biot three-dimensional consolidation theory source reference',
    citation: 'Biot, M. A. (1941). General Theory of Three-Dimensional Consolidation. Journal of Applied Physics, 12(2), 155-164. doi:10.1063/1.1712886.',
    publishedSource: {
      title: 'General Theory of Three-Dimensional Consolidation',
      authors: ['Maurice A. Biot'],
      year: 1941,
      publication: 'Journal of Applied Physics',
      doi: '10.1063/1.1712886',
      url: 'https://doi.org/10.1063/1.1712886',
    },
  },
  {
    id: 'opensees-drucker-prager-material',
    sourceType: 'open-source-solver',
    label: 'OpenSees Drucker-Prager material and triaxial example reference',
    citation: 'OpenSees Documentation, Drucker Prager Material, nDMaterial DruckerPrager plane-strain/3D formulation and confined triaxial compression example.',
    referenceSolver: {
      name: 'OpenSees',
      version: 'documentation-current',
      vendor: 'OpenSees project',
      analysisProcedure: 'Drucker-Prager material point and confined triaxial compression example',
      elementType: 'nDMaterial DruckerPrager',
      url: 'https://opensees.github.io/OpenSeesDocumentation/user/manual/material/ndMaterials/DruckerPrager.html',
      retrievedAt: '2026-06-04',
    },
  },
  {
    id: 'opengeosys-consolidation-staggered-benchmark',
    sourceType: 'open-source-solver',
    label: 'OpenGeoSys staggered hydro-mechanics consolidation benchmark',
    citation: 'OpenGeoSys Documentation, Consolidation benchmark with the staggered scheme, hydro-mechanics benchmark with analytical pressure/displacement solution, 1000 Pa top load, t = 10 s, and dt = 0.5 s comparison.',
    referenceSolver: {
      name: 'OpenGeoSys',
      version: 'stable documentation',
      vendor: 'OpenGeoSys project',
      analysisProcedure: 'HYDRO_MECHANICS staggered fixed-stress consolidation benchmark',
      elementType: '2D hydro-mechanics finite elements',
      url: 'https://www.opengeosys.org/docs/benchmarks/hydro-mechanics/consolidationbenchmark/',
      retrievedAt: '2026-06-04',
    },
  },
  {
    id: 'opengeosys-hydro-mechanics-benchmarks',
    sourceType: 'open-source-solver',
    label: 'OpenGeoSys hydro-mechanics benchmark suite reference',
    citation: 'OpenGeoSys stable documentation, Hydro Mechanics benchmark suite including consolidation, Mandel-Cryer, injection/production, and HM drainage excavation examples.',
    referenceSolver: {
      name: 'OpenGeoSys',
      version: 'stable documentation',
      vendor: 'OpenGeoSys project',
      analysisProcedure: 'hydro-mechanics benchmark suite',
      elementType: 'HM and LIE/HM finite elements',
      url: 'https://www.opengeosys.org/docs/benchmarks/hydro-mechanics/',
      retrievedAt: '2026-06-04',
    },
  },
  {
    id: 'opengeosys-richards-flow-benchmarks',
    sourceType: 'open-source-solver',
    label: 'OpenGeoSys Richards flow benchmark reference',
    citation: 'OpenGeoSys documentation, Richards Flow benchmark suite for saturated/unsaturated transient flow verification.',
    referenceSolver: {
      name: 'OpenGeoSys',
      version: '6.x documentation',
      vendor: 'OpenGeoSys project',
      analysisProcedure: 'Richards flow benchmark',
      elementType: 'Richards flow finite elements',
      url: 'https://www.opengeosys.org/docs/benchmarks/richards-flow/',
      retrievedAt: '2026-06-04',
    },
  },
];

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function canonicalFemBenchmarkJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot hash non-finite FEM benchmark value.');
    return JSON.stringify(round(value, 12));
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalFemBenchmarkJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, itemValue]) => itemValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, itemValue]) => `${JSON.stringify(key)}:${canonicalFemBenchmarkJson(itemValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function hashFemBenchmarkPayload(value: unknown): string {
  return createHash('sha256').update(canonicalFemBenchmarkJson(value)).digest('hex');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateNonEmptyStringArray(
  blockers: string[],
  value: unknown,
  field: string,
  options: { requireOne?: boolean } = {},
): void {
  if (!Array.isArray(value) || (options.requireOne === true && value.length === 0)) {
    blockers.push(`${field}.missing`);
    return;
  }
  if (value.length === 0) return;

  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isNonEmptyString(item)) {
      blockers.push(`${field}.${index}.missing`);
      continue;
    }
    const normalized = item.trim().toLowerCase();
    if (seen.has(normalized)) {
      blockers.push(`${field}.${index}.duplicate`);
    }
    seen.add(normalized);
  }
}

function hasPublishedCitation(citation: FemExternalBenchmarkPublishedCitation | undefined): boolean {
  return citation != null &&
    isNonEmptyString(citation.title) &&
    Array.isArray(citation.authors) &&
    citation.authors.some((author) => isNonEmptyString(author)) &&
    Number.isInteger(citation.year) &&
    citation.year >= 1900 &&
    (
      isNonEmptyString(citation.publication) ||
      isNonEmptyString(citation.doi) ||
      isNonEmptyString(citation.url)
    );
}

function hasReferenceSolverCitation(
  citation: FemExternalBenchmarkReferenceSolverCitation | undefined,
): boolean {
  return citation != null &&
    isNonEmptyString(citation.name) &&
    isNonEmptyString(citation.version);
}

function hasValidSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function hasSolverRunMetadata(value: unknown): value is FemExternalBenchmarkSolverRunMetadata {
  if (value == null || typeof value !== 'object') return false;
  const metadata = value as Partial<FemExternalBenchmarkSolverRunMetadata>;
  return isNonEmptyString(metadata.name) &&
    isNonEmptyString(metadata.version) &&
    (
      metadata.solverType === 'geotechcli-kernel' ||
      metadata.solverType === 'published-reference' ||
      metadata.solverType === 'commercial-solver' ||
      metadata.solverType === 'open-source-solver' ||
      metadata.solverType === 'deterministic-fixture'
    );
}

function hasFiniteSeriesStatistics(value: unknown): value is FemExternalBenchmarkSeriesStatistics {
  if (value == null || typeof value !== 'object') return false;
  const statistics = value as Partial<FemExternalBenchmarkSeriesStatistics>;
  return Number.isFinite(statistics.min) &&
    Number.isFinite(statistics.max) &&
    Number.isFinite(statistics.final) &&
    (statistics.mean == null || Number.isFinite(statistics.mean));
}

function hasValidSeriesSummary(value: unknown): value is FemExternalBenchmarkSeriesSummary {
  if (value == null || typeof value !== 'object') return false;
  const summary = value as Partial<FemExternalBenchmarkSeriesSummary>;
  const pointCount = summary.pointCount;
  const maxAbsoluteError = summary.maxAbsoluteError;
  const maxRelativeError = summary.maxRelativeError;
  const rmsError = summary.rmsError;
  return isNonEmptyString(summary.xQuantity) &&
    isNonEmptyString(summary.xUnit) &&
    isNonEmptyString(summary.yQuantity) &&
    isNonEmptyString(summary.yUnit) &&
    typeof pointCount === 'number' &&
    Number.isInteger(pointCount) &&
    pointCount > 0 &&
    hasFiniteSeriesStatistics(summary.actual) &&
    hasFiniteSeriesStatistics(summary.expected) &&
    typeof maxAbsoluteError === 'number' &&
    Number.isFinite(maxAbsoluteError) &&
    maxAbsoluteError >= 0 &&
    typeof maxRelativeError === 'number' &&
    Number.isFinite(maxRelativeError) &&
    maxRelativeError >= 0 &&
    (rmsError == null || (Number.isFinite(rmsError) && rmsError >= 0)) &&
    hasValidSha256(summary.seriesHashSha256);
}

function seriesSummarySatisfiesRequirementTolerance(
  summary: FemExternalBenchmarkSeriesSummary,
  requirement: FemExternalBenchmarkQuantityRequirement,
): boolean {
  if (requirement.toleranceType === 'absolute') {
    return summary.maxAbsoluteError <= requirement.tolerance;
  }
  if (requirement.toleranceType === 'relative') {
    return summary.maxRelativeError <= requirement.tolerance;
  }
  return summary.maxAbsoluteError <= requirement.tolerance ||
    summary.maxRelativeError <= requirement.tolerance;
}

function copyExternalBenchmarkReference(
  reference: FemExternalBenchmarkReference,
): FemExternalBenchmarkReference {
  return {
    ...reference,
    ...(reference.publishedSource
      ? {
          publishedSource: {
            ...reference.publishedSource,
            authors: [...reference.publishedSource.authors],
          },
        }
      : {}),
    ...(reference.referenceSolver
      ? {
          referenceSolver: { ...reference.referenceSolver },
        }
      : {}),
  };
}

function copyExternalBenchmarkQuantityRequirement(
  requirement: FemExternalBenchmarkQuantityRequirement,
): FemExternalBenchmarkQuantityRequirement {
  return {
    ...requirement,
    requiredReferenceSourceTypes: [...new Set(requirement.requiredReferenceSourceTypes)],
  };
}

function copyExternalBenchmarkComparisonResult(
  result: FemExternalBenchmarkComparisonResult,
): FemExternalBenchmarkComparisonResult {
  return {
    ...result,
    candidateSolver: result.candidateSolver != null
      ? { ...result.candidateSolver }
      : result.candidateSolver,
    ...(result.referenceSolver ? { referenceSolver: { ...result.referenceSolver } } : {}),
    ...(result.seriesSummary
      ? {
          seriesSummary: {
            ...result.seriesSummary,
            actual: result.seriesSummary.actual != null
              ? { ...result.seriesSummary.actual }
              : result.seriesSummary.actual,
            expected: result.seriesSummary.expected != null
              ? { ...result.seriesSummary.expected }
              : result.seriesSummary.expected,
            ...(result.seriesSummary.notes ? { notes: [...result.seriesSummary.notes] } : {}),
          },
        }
      : {}),
    ...(result.notes ? { notes: [...result.notes] } : {}),
  };
}

export function buildFemExternalBenchmarkAcceptanceContract(options: {
  references?: readonly FemExternalBenchmarkReference[];
  requiredQuantities?: readonly FemExternalBenchmarkQuantityRequirement[];
  comparisonResults?: readonly FemExternalBenchmarkComparisonResult[];
} = {}): FemExternalBenchmarkAcceptanceContract {
  const references = (options.references ?? DEFAULT_EXTERNAL_BENCHMARK_REFERENCES)
    .map(copyExternalBenchmarkReference);
  const requiredQuantities = (options.requiredQuantities ?? DEFAULT_EXTERNAL_BENCHMARK_REQUIRED_QUANTITIES)
    .map(copyExternalBenchmarkQuantityRequirement);
  const comparisonResults = (options.comparisonResults ?? [])
    .map(copyExternalBenchmarkComparisonResult);
  const blockerCodes: string[] = [];
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const quantityById = new Map(requiredQuantities.map((requirement) => [requirement.id, requirement]));

  function referenceRequiresSolverRunMetadata(reference: FemExternalBenchmarkReference | undefined): boolean {
    return reference?.sourceType === 'commercial-solver' || reference?.sourceType === 'open-source-solver';
  }

  function comparisonIsAcceptedForRequirement(
    result: FemExternalBenchmarkComparisonResult,
    requirement: FemExternalBenchmarkQuantityRequirement,
    reference: FemExternalBenchmarkReference | undefined,
    sourceType?: FemExternalBenchmarkSourceType,
  ): boolean {
    if (!reference) return false;
    if (sourceType && reference.sourceType !== sourceType) return false;
    if (result.quantityRequirementId !== requirement.id || !result.accepted) return false;
    if (result.comparisonKind !== 'scalar' && result.comparisonKind !== 'series-summary') return false;
    if (result.comparisonKind === 'series-summary' && !hasValidSeriesSummary(result.seriesSummary)) return false;
    if (
      result.comparisonKind === 'series-summary' &&
      result.seriesSummary &&
      !seriesSummarySatisfiesRequirementTolerance(result.seriesSummary, requirement)
    ) {
      return false;
    }
    if (!isNonEmptyString(result.metricName)) return false;
    if (!hasSolverRunMetadata(result.candidateSolver)) return false;
    if (referenceRequiresSolverRunMetadata(reference) && !hasSolverRunMetadata(result.referenceSolver)) return false;
    if (result.referenceSolver != null && !hasSolverRunMetadata(result.referenceSolver)) return false;
    if (!Number.isFinite(result.actual) || !Number.isFinite(result.expected)) return false;
    if (!hasValidSha256(result.evidenceHashSha256) || !hasValidSha256(result.resultHashSha256)) return false;
    if (result.quantity !== requirement.quantity || result.unit !== requirement.unit) return false;
    if (result.toleranceType !== requirement.toleranceType || result.tolerance > requirement.tolerance) {
      return false;
    }
    const tolerance = evaluateFemTolerance(
      requirement.quantity,
      result.actual,
      result.expected,
      requirement.toleranceType === 'relative' ? 0 : requirement.tolerance,
      requirement.toleranceType === 'absolute'
        ? { unit: requirement.unit }
        : { relativeTolerance: requirement.tolerance, unit: requirement.unit },
    );
    return tolerance.accepted;
  }

  if (references.length === 0) {
    blockerCodes.push('external-benchmark-reference-corpus-missing');
  }

  for (const [index, reference] of references.entries()) {
    const referenceCode = isNonEmptyString(reference.id)
      ? reference.id
      : String(index);
    if (!isNonEmptyString(reference.id)) {
      blockerCodes.push(`external-benchmark.references.${index}.id-missing`);
    }
    if (!REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES.includes(reference.sourceType) &&
      reference.sourceType !== 'open-source-solver') {
      blockerCodes.push(`external-benchmark.references.${referenceCode}.source-type-invalid`);
    }
    if (!isNonEmptyString(reference.label)) {
      blockerCodes.push(`external-benchmark.references.${referenceCode}.label-missing`);
    }
    if (!isNonEmptyString(reference.citation)) {
      blockerCodes.push(`external-benchmark.references.${referenceCode}.citation-missing`);
    }
    if (reference.sourceType === 'published-source' && !hasPublishedCitation(reference.publishedSource)) {
      blockerCodes.push(`external-benchmark.references.${referenceCode}.published-source-citation-missing`);
    }
    if (
      (reference.sourceType === 'commercial-solver' || reference.sourceType === 'open-source-solver') &&
      !hasReferenceSolverCitation(reference.referenceSolver)
    ) {
      blockerCodes.push(`external-benchmark.references.${referenceCode}.reference-solver-citation-missing`);
    }
  }

  const hasPublishedReference = references.some((reference) =>
    reference.sourceType === 'published-source' &&
    isNonEmptyString(reference.citation) &&
    hasPublishedCitation(reference.publishedSource));
  const hasCommercialReference = references.some((reference) =>
    reference.sourceType === 'commercial-solver' &&
    isNonEmptyString(reference.citation) &&
    hasReferenceSolverCitation(reference.referenceSolver));
  const hasReferenceSolver = references.some((reference) =>
    (reference.sourceType === 'commercial-solver' || reference.sourceType === 'open-source-solver') &&
    isNonEmptyString(reference.citation) &&
    hasReferenceSolverCitation(reference.referenceSolver));

  if (!hasPublishedReference) {
    blockerCodes.push('external-benchmark-published-source-citation-missing');
  }
  if (!hasReferenceSolver) {
    blockerCodes.push('external-benchmark-reference-solver-citation-missing');
  }
  if (!hasCommercialReference) {
    blockerCodes.push('external-benchmark-commercial-solver-citation-missing');
  }
  if (requiredQuantities.length === 0) {
    blockerCodes.push('external-benchmark-required-quantities-missing');
  }
  if (comparisonResults.length === 0) {
    blockerCodes.push('external-benchmark-comparison-results-missing');
  }

  for (const [index, requirement] of requiredQuantities.entries()) {
    const quantityCode = isNonEmptyString(requirement.id)
      ? requirement.id
      : String(index);
    if (!isNonEmptyString(requirement.id)) {
      blockerCodes.push(`external-benchmark.required-quantities.${index}.id-missing`);
    }
    if (!isNonEmptyString(requirement.quantity)) {
      blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.quantity-missing`);
    }
    if (!isNonEmptyString(requirement.unit)) {
      blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.unit-missing`);
    }
    if (!Number.isFinite(requirement.tolerance) || requirement.tolerance < 0) {
      blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.tolerance-invalid`);
    }
    if (
      requirement.toleranceType !== 'absolute' &&
      requirement.toleranceType !== 'relative' &&
      requirement.toleranceType !== 'absolute-or-relative'
    ) {
      blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.tolerance-type-invalid`);
    }
    if (!Array.isArray(requirement.requiredReferenceSourceTypes) ||
      requirement.requiredReferenceSourceTypes.length === 0) {
      blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.source-types-missing`);
    } else if (references.length > 0) {
      const missingSourceTypes = requirement.requiredReferenceSourceTypes.filter((sourceType) =>
        !references.some((reference) => reference.sourceType === sourceType));
      if (missingSourceTypes.length > 0) {
        blockerCodes.push(`external-benchmark.required-quantities.${quantityCode}.reference-source-types-missing`);
      }
    }
  }

  for (const [index, result] of comparisonResults.entries()) {
    const resultCode = isNonEmptyString(result.id) ? result.id : String(index);
    if (!isNonEmptyString(result.id)) {
      blockerCodes.push(`external-benchmark.comparison-results.${index}.id-missing`);
    }
    if (!isNonEmptyString(result.quantityRequirementId) || !quantityById.has(result.quantityRequirementId)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.quantity-requirement-missing`);
    }
    if (!isNonEmptyString(result.referenceId) || !referenceById.has(result.referenceId)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.reference-missing`);
    }
    if (!isNonEmptyString(result.caseId)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.case-id-missing`);
    }
    if (result.comparisonKind !== 'scalar' && result.comparisonKind !== 'series-summary') {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.comparison-kind-invalid`);
    }
    if (!isNonEmptyString(result.metricName)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.metric-name-missing`);
    }
    if (!isNonEmptyString(result.quantity)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.quantity-missing`);
    }
    if (!isNonEmptyString(result.unit)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.unit-missing`);
    }
    if (!Number.isFinite(result.actual) || !Number.isFinite(result.expected)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.value-invalid`);
    }
    if (!Number.isFinite(result.tolerance) || result.tolerance < 0) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.tolerance-invalid`);
    }
    if (
      result.toleranceType !== 'absolute' &&
      result.toleranceType !== 'relative' &&
      result.toleranceType !== 'absolute-or-relative'
    ) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.tolerance-type-invalid`);
    }
    if (!hasValidSha256(result.evidenceHashSha256)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.evidence-hash-missing`);
    }
    if (!hasValidSha256(result.resultHashSha256)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.result-hash-missing`);
    }
    if (!hasSolverRunMetadata(result.candidateSolver)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.candidate-solver-metadata-missing`);
    }
    const reference = referenceById.get(result.referenceId);
    if (referenceRequiresSolverRunMetadata(reference) && !hasSolverRunMetadata(result.referenceSolver)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.reference-solver-metadata-missing`);
    } else if (result.referenceSolver != null && !hasSolverRunMetadata(result.referenceSolver)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.reference-solver-metadata-invalid`);
    }
    if (result.comparisonKind === 'series-summary' && !hasValidSeriesSummary(result.seriesSummary)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.series-summary-invalid`);
    } else if (result.seriesSummary != null && !hasValidSeriesSummary(result.seriesSummary)) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.series-summary-invalid`);
    }
    const requirement = quantityById.get(result.quantityRequirementId);
    if (
      requirement &&
      result.comparisonKind === 'series-summary' &&
      hasValidSeriesSummary(result.seriesSummary) &&
      !seriesSummarySatisfiesRequirementTolerance(result.seriesSummary, requirement)
    ) {
      blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.series-tolerance-exceeded`);
    }
    if (requirement) {
      if (result.quantity !== requirement.quantity) {
        blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.quantity-mismatch`);
      }
      if (result.unit !== requirement.unit) {
        blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.unit-mismatch`);
      }
      if (result.toleranceType !== requirement.toleranceType) {
        blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.tolerance-type-mismatch`);
      }
      if (result.tolerance > requirement.tolerance) {
        blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.tolerance-too-loose`);
      }
    }
    if (
      Number.isFinite(result.actual) &&
      Number.isFinite(result.expected) &&
      Number.isFinite(result.tolerance) &&
      result.tolerance >= 0
    ) {
      const acceptanceTolerance = requirement?.tolerance ?? result.tolerance;
      const acceptanceToleranceType = requirement?.toleranceType ?? result.toleranceType;
      const acceptanceUnit = requirement?.unit ?? result.unit;
      const tolerance = evaluateFemTolerance(
        requirement?.quantity ?? result.quantity,
        result.actual,
        result.expected,
        acceptanceToleranceType === 'relative' ? 0 : acceptanceTolerance,
        acceptanceToleranceType === 'absolute'
          ? { unit: acceptanceUnit }
          : { relativeTolerance: acceptanceTolerance, unit: acceptanceUnit },
      );
      if (!result.accepted || !tolerance.accepted) {
        blockerCodes.push(`external-benchmark.comparison-results.${resultCode}.not-accepted`);
      }
    }
  }

  const acceptedComparisons = comparisonResults
    .map((result) => ({
      result,
      requirement: quantityById.get(result.quantityRequirementId),
      reference: referenceById.get(result.referenceId),
    }))
    .filter((item): item is {
      result: FemExternalBenchmarkComparisonResult;
      requirement: FemExternalBenchmarkQuantityRequirement;
      reference: FemExternalBenchmarkReference;
    } => item.requirement != null &&
      item.reference != null &&
      comparisonIsAcceptedForRequirement(item.result, item.requirement, item.reference));
  const partiallyCoveredRequiredQuantityIds: string[] = [];
  const fullyCoveredRequiredQuantityIds: string[] = [];

  for (const requirement of requiredQuantities) {
    if (!isNonEmptyString(requirement.id)) continue;
    const acceptedSourceTypesForRequirement = new Set(
      acceptedComparisons
        .filter((item) => item.requirement.id === requirement.id)
        .map((item) => item.reference.sourceType),
    );
    if (acceptedSourceTypesForRequirement.size > 0) {
      partiallyCoveredRequiredQuantityIds.push(requirement.id);
    }
    if (
      requirement.requiredReferenceSourceTypes.length > 0 &&
      requirement.requiredReferenceSourceTypes.every((sourceType) =>
        acceptedSourceTypesForRequirement.has(sourceType))
    ) {
      fullyCoveredRequiredQuantityIds.push(requirement.id);
    }
    for (const sourceType of requirement.requiredReferenceSourceTypes) {
      const hasAcceptedComparison = acceptedComparisons.some((item) =>
        item.requirement.id === requirement.id &&
        item.reference.sourceType === sourceType);
      if (!hasAcceptedComparison) {
        blockerCodes.push(
          `external-benchmark.required-quantities.${requirement.id}.accepted-comparison-missing.${sourceType}`,
        );
      }
    }
  }

  const acceptedSourceTypes = new Set(acceptedComparisons.map((item) => item.reference.sourceType));
  const coverageSummary: FemExternalBenchmarkCoverageSummary = {
    schemaVersion: 'fem-external-benchmark-coverage.v1',
    acceptedComparisonCount: acceptedComparisons.length,
    acceptedPublishedComparisonCount: acceptedComparisons
      .filter((item) => item.reference.sourceType === 'published-source').length,
    acceptedCommercialComparisonCount: acceptedComparisons
      .filter((item) => item.reference.sourceType === 'commercial-solver').length,
    acceptedOpenSourceComparisonCount: acceptedComparisons
      .filter((item) => item.reference.sourceType === 'open-source-solver').length,
    requiredQuantityCount: requiredQuantities.length,
    partiallyCoveredRequiredQuantityIds,
    fullyCoveredRequiredQuantityIds,
    missingRequiredSourceTypes: REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES
      .filter((sourceType) => !acceptedSourceTypes.has(sourceType)),
  };

  if (coverageSummary.fullyCoveredRequiredQuantityIds.length < requiredQuantities.length) {
    blockerCodes.push('external-benchmark-comparison-results-missing');
  }

  const uniqueBlockerCodes = [...new Set(blockerCodes)];
  const productionReadinessBlocked = uniqueBlockerCodes.length > 0;
  const hasPartialAcceptedEvidence = coverageSummary.acceptedComparisonCount > 0;

  return {
    schemaVersion: 'fem-external-benchmark-acceptance.v2',
    status: productionReadinessBlocked ? 'blocked' : 'accepted-comparisons-ready',
    productionReadinessBlocked,
    requiredSourceTypes: [...REQUIRED_EXTERNAL_BENCHMARK_SOURCE_TYPES],
    references,
    requiredQuantities,
    comparisonResults,
    coverageSummary,
    blockerCodes: uniqueBlockerCodes,
    acceptanceStatement: productionReadinessBlocked
      ? hasPartialAcceptedEvidence
        ? `Partial external benchmark evidence is present (${coverageSummary.acceptedComparisonCount} accepted comparison summaries), but production readiness remains blocked until published and commercial solver references and accepted comparison results cover every required FEM quantity.`
        : 'External benchmark acceptance is incomplete; production readiness remains blocked until source citations, commercial solver references, and accepted comparison results cover every required FEM quantity.'
      : 'External benchmark references and comparison results cover the required FEM quantities; this still does not approve production design without solver-route and reviewer-workflow acceptance.',
  };
}

function femSeriesStatistics(values: readonly number[]): FemExternalBenchmarkSeriesStatistics {
  if (values.length === 0) throw new Error('FEM benchmark series must include at least one value.');
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: round(Math.min(...values), 10),
    max: round(Math.max(...values), 10),
    final: round(values[values.length - 1], 10),
    mean: round(sum / values.length, 10),
  };
}

function buildFemExternalBenchmarkSeriesSummary(input: {
  xQuantity: string;
  xUnit: string;
  yQuantity: string;
  yUnit: string;
  points: ReadonlyArray<{ x: number; actual: number; expected: number }>;
  notes?: string[];
}): FemExternalBenchmarkSeriesSummary {
  if (input.points.length === 0) {
    throw new Error('FEM external benchmark comparison series must include at least one point.');
  }
  const points = input.points.map((point) => ({
    x: round(point.x, 10),
    actual: round(point.actual, 10),
    expected: round(point.expected, 10),
  }));
  const actual = points.map((point) => point.actual);
  const expected = points.map((point) => point.expected);
  const errors = points.map((point) => Math.abs(point.actual - point.expected));
  const relativeErrors = points.map((point) =>
    Math.abs(point.actual - point.expected) / Math.max(Math.abs(point.expected), 1e-12));
  const rmsError = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);

  return {
    xQuantity: input.xQuantity,
    xUnit: input.xUnit,
    yQuantity: input.yQuantity,
    yUnit: input.yUnit,
    pointCount: points.length,
    actual: femSeriesStatistics(actual),
    expected: femSeriesStatistics(expected),
    maxAbsoluteError: round(Math.max(...errors), 10),
    maxRelativeError: round(Math.max(...relativeErrors), 10),
    rmsError: round(rmsError, 10),
    seriesHashSha256: hashFemBenchmarkPayload({
      schemaVersion: 'fem-external-benchmark-series.v1',
      xQuantity: input.xQuantity,
      xUnit: input.xUnit,
      yQuantity: input.yQuantity,
      yUnit: input.yUnit,
      points,
    }),
    ...(input.notes ? { notes: [...input.notes] } : {}),
  };
}

function externalBenchmarkFinalAccepted(input: {
  actual: number;
  expected: number;
  tolerance: number;
  toleranceType: FemExternalBenchmarkToleranceType;
  unit: string;
  quantity: string;
}): boolean {
  return evaluateFemTolerance(
    input.quantity,
    input.actual,
    input.expected,
    input.toleranceType === 'relative' ? 0 : input.tolerance,
    input.toleranceType === 'absolute'
      ? { unit: input.unit }
      : { relativeTolerance: input.tolerance, unit: input.unit },
  ).accepted;
}

function buildDefaultExternalBenchmarkComparisonResults(input: {
  consolidation: FemConsolidationTimeStepperResult;
  biotTerzaghi: ReturnType<typeof runPlaneStrainBiotConsolidation>;
  biotTerzaghiInitialPressureKpa: number;
  biotTerzaghiHydraulicConductivityMPerS: number;
  biotTerzaghiSpecificStorage1PerM: number;
  openGeoSysConsolidation: ReturnType<typeof runPlaneStrainBiotConsolidation>;
  openGeoSysConsolidationDimensionlessTime: number;
  openGeoSysConsolidationLoadKpa: number;
}): FemExternalBenchmarkComparisonResult[] {
  const consolidationRequirement = DEFAULT_EXTERNAL_BENCHMARK_REQUIRED_QUANTITIES
    .find((requirement) => requirement.id === 'consolidation-settlement-time-curve');
  const biotRequirement = DEFAULT_EXTERNAL_BENCHMARK_REQUIRED_QUANTITIES
    .find((requirement) => requirement.id === 'biot-pore-pressure-dissipation');
  if (!consolidationRequirement || !biotRequirement) {
    throw new Error('Default FEM external benchmark quantity requirements are missing.');
  }

  const consolidationPoints = input.consolidation.steps.map((step) => ({
    x: step.timeFactor,
    actual: step.degreeOfConsolidation,
    expected: step.referenceDegreeOfConsolidation,
  }));
  const consolidationSeries = buildFemExternalBenchmarkSeriesSummary({
    xQuantity: 'time factor',
    xUnit: 'Tv',
    yQuantity: 'average degree of consolidation',
    yUnit: 'ratio',
    points: consolidationPoints,
    notes: [
      'Backward-Euler drainage-column series compared with the Terzaghi average-consolidation Fourier-series reference.',
    ],
  });
  const consolidationActual = input.consolidation.finalStep.degreeOfConsolidation;
  const consolidationExpected = input.consolidation.finalStep.referenceDegreeOfConsolidation;
  const consolidationEvidencePayload = {
    schemaVersion: 'fem-external-benchmark-evidence.v1',
    caseId: 'terzaghi-1d-backward-euler-tv-0-197',
    sourceId: 'terzaghi-1943-theoretical-soil-mechanics',
    method: input.consolidation.method,
    drainagePathM: input.consolidation.drainagePathM,
    nodeCount: input.consolidation.nodeCount,
    finalTimeFactor: input.consolidation.finalStep.timeFactor,
    seriesHashSha256: consolidationSeries.seriesHashSha256,
  };
  const consolidationResultPayload = {
    actual: consolidationActual,
    expected: consolidationExpected,
    maxAbsoluteError: consolidationSeries.maxAbsoluteError,
    maxRelativeError: consolidationSeries.maxRelativeError,
    resultSeriesHashSha256: consolidationSeries.seriesHashSha256,
  };
  const consolidationAccepted = externalBenchmarkFinalAccepted({
    actual: consolidationActual,
    expected: consolidationExpected,
    tolerance: consolidationRequirement.tolerance,
    toleranceType: consolidationRequirement.toleranceType,
    unit: consolidationRequirement.unit,
    quantity: consolidationRequirement.quantity,
  }) && seriesSummarySatisfiesRequirementTolerance(consolidationSeries, consolidationRequirement);

  const biotCvPerSecond =
    input.biotTerzaghiHydraulicConductivityMPerS / input.biotTerzaghiSpecificStorage1PerM;
  const biotPoints = input.biotTerzaghi.timeSteps.map((step) => {
    const timeFactor = step.timeSeconds * biotCvPerSecond;
    return {
      x: timeFactor,
      actual: step.pressureDiagnostics.averagePorePressureKpa,
      expected: input.biotTerzaghiInitialPressureKpa * (1 - terzaghiAverageConsolidation(timeFactor)),
    };
  });
  const biotSeries = buildFemExternalBenchmarkSeriesSummary({
    xQuantity: 'time factor',
    xUnit: 'Tv',
    yQuantity: 'average excess pore pressure',
    yUnit: 'kPa',
    points: biotPoints,
    notes: [
      'Alpha-zero Quad4 Biot u-p pressure-diffusion series compared with the Terzaghi drained-column analytical curve.',
    ],
  });
  const biotActual = input.biotTerzaghi.pressureDiagnostics.averagePorePressureKpa;
  const biotExpected = biotPoints[biotPoints.length - 1].expected;
  const biotEvidencePayload = {
    schemaVersion: 'fem-external-benchmark-evidence.v1',
    caseId: 'quad4-biot-alpha-zero-terzaghi-top-drained-tv-0-197',
    sourceId: 'biot-1941-three-dimensional-consolidation',
    method: input.biotTerzaghi.method,
    pressureKind: input.biotTerzaghi.numericalContract.pressureKind,
    pressureUnit: input.biotTerzaghi.numericalContract.pressureUnit,
    timeStepCount: input.biotTerzaghi.timeSteps.length,
    transientAcceptance: input.biotTerzaghi.transientAcceptance,
    finalTimeFactor: round(biotPoints[biotPoints.length - 1].x, 10),
    seriesHashSha256: biotSeries.seriesHashSha256,
  };
  const biotResultPayload = {
    actual: biotActual,
    expected: biotExpected,
    maxAbsoluteError: biotSeries.maxAbsoluteError,
    maxRelativeError: biotSeries.maxRelativeError,
    resultSeriesHashSha256: biotSeries.seriesHashSha256,
  };
  const biotAccepted = externalBenchmarkFinalAccepted({
    actual: biotActual,
    expected: biotExpected,
    tolerance: biotRequirement.tolerance,
    toleranceType: biotRequirement.toleranceType,
    unit: biotRequirement.unit,
    quantity: biotRequirement.quantity,
  }) && seriesSummarySatisfiesRequirementTolerance(biotSeries, biotRequirement);

  const ogsPressureByY = new Map<number, number[]>();
  for (const node of input.openGeoSysConsolidation.nodes) {
    const key = round(node.yM, 10);
    const values = ogsPressureByY.get(key) ?? [];
    values.push(node.porePressureKpa);
    ogsPressureByY.set(key, values);
  }
  const ogsPoints = [...ogsPressureByY.entries()]
    .map(([yM, pressures]) => {
      const depthRatioFromTop = 1 - yM;
      const actual = pressures.reduce((sum, value) => sum + value, 0) / pressures.length;
      const expected = input.openGeoSysConsolidationLoadKpa *
        openGeoSysConsolidationPressureRatio(depthRatioFromTop, input.openGeoSysConsolidationDimensionlessTime);
      return {
        x: depthRatioFromTop,
        actual,
        expected,
      };
    })
    .sort((left, right) => right.x - left.x);
  const ogsSeries = buildFemExternalBenchmarkSeriesSummary({
    xQuantity: 'dimensionless depth from drained top',
    xUnit: 'x/H',
    yQuantity: 'load-generated excess pore pressure',
    yUnit: 'kPa',
    points: ogsPoints,
    notes: [
      'Benchmark-scale Quad4 Biot u-p load-generated pressure profile at t = 10 s compared with the OpenGeoSys staggered consolidation analytical p_D profile.',
      'OpenGeoSys source parameters are E = 3e4 Pa, nu = 0.2, k = 1e-10 m2, viscosity = 1e-3 Pa s, sigma0 = 1000 Pa, dt = 0.5 s.',
    ],
  });
  const ogsActual = ogsSeries.actual.mean ?? ogsSeries.actual.final;
  const ogsExpected = ogsSeries.expected.mean ?? ogsSeries.expected.final;
  const ogsEvidencePayload = {
    schemaVersion: 'fem-external-benchmark-evidence.v1',
    caseId: 'opengeosys-staggered-consolidation-pressure-profile-t10',
    sourceId: 'opengeosys-consolidation-staggered-benchmark',
    method: input.openGeoSysConsolidation.method,
    pressureEnvelopeMode: input.openGeoSysConsolidation.numericalContract.pressureEnvelopeMode,
    pressureOvershootPolicy: input.openGeoSysConsolidation.numericalContract.pressureOvershootPolicy,
    timeStepCount: input.openGeoSysConsolidation.timeSteps.length,
    finalTimeSeconds: input.openGeoSysConsolidation.timeSteps.at(-1)?.timeSeconds,
    dimensionlessTime: input.openGeoSysConsolidationDimensionlessTime,
    transientAcceptance: input.openGeoSysConsolidation.transientAcceptance,
    seriesHashSha256: ogsSeries.seriesHashSha256,
  };
  const ogsResultPayload = {
    actual: ogsActual,
    expected: ogsExpected,
    maxAbsoluteError: ogsSeries.maxAbsoluteError,
    maxRelativeError: ogsSeries.maxRelativeError,
    resultSeriesHashSha256: ogsSeries.seriesHashSha256,
  };
  const ogsAccepted = input.openGeoSysConsolidation.transientAcceptance.accepted &&
    externalBenchmarkFinalAccepted({
      actual: ogsActual,
      expected: ogsExpected,
      tolerance: biotRequirement.tolerance,
      toleranceType: biotRequirement.toleranceType,
      unit: biotRequirement.unit,
      quantity: biotRequirement.quantity,
    }) &&
    seriesSummarySatisfiesRequirementTolerance(ogsSeries, biotRequirement);

  return [
    {
      id: 'published-terzaghi-1d-consolidation-tv-0-197',
      quantityRequirementId: consolidationRequirement.id,
      referenceId: 'terzaghi-1943-theoretical-soil-mechanics',
      caseId: 'terzaghi-1d-backward-euler-tv-0-197',
      comparisonKind: 'series-summary',
      metricName: 'averageDegreeOfConsolidationTimeCurve',
      quantity: consolidationRequirement.quantity,
      unit: consolidationRequirement.unit,
      actual: round(consolidationActual, 10),
      expected: round(consolidationExpected, 10),
      tolerance: consolidationRequirement.tolerance,
      toleranceType: consolidationRequirement.toleranceType,
      accepted: consolidationAccepted,
      candidateSolver: {
        name: 'geotechCLI FEM evidence suite',
        version: 'strong-beta',
        solverType: 'geotechcli-kernel',
        analysisProcedure: 'backward-Euler 1D Terzaghi consolidation time stepper',
        elementType: '1D drainage-column finite-difference grid',
        runId: 'terzaghi-1d-backward-euler-tv-0-197',
      },
      evidenceHashSha256: hashFemBenchmarkPayload(consolidationEvidencePayload),
      resultHashSha256: hashFemBenchmarkPayload(consolidationResultPayload),
      seriesSummary: consolidationSeries,
      notes: [
        'Generated published-source comparison record only; commercial solver comparison remains missing.',
      ],
    },
    {
      id: 'published-biot-alpha-zero-terzaghi-pressure-dissipation-tv-0-197',
      quantityRequirementId: biotRequirement.id,
      referenceId: 'biot-1941-three-dimensional-consolidation',
      caseId: 'quad4-biot-alpha-zero-terzaghi-top-drained-tv-0-197',
      comparisonKind: 'series-summary',
      metricName: 'averageExcessPorePressureDissipationTimeCurve',
      quantity: biotRequirement.quantity,
      unit: biotRequirement.unit,
      actual: round(biotActual, 10),
      expected: round(biotExpected, 10),
      tolerance: biotRequirement.tolerance,
      toleranceType: biotRequirement.toleranceType,
      accepted: biotAccepted,
      candidateSolver: {
        name: 'geotechCLI FEM evidence suite',
        version: 'strong-beta',
        solverType: 'geotechcli-kernel',
        analysisProcedure: 'linear-elastic Quad4 Biot u-p backward-Euler pressure diffusion',
        elementType: 'Quad4 plane-strain u-p evidence mesh',
        runId: 'quad4-biot-alpha-zero-terzaghi-top-drained-tv-0-197',
      },
      evidenceHashSha256: hashFemBenchmarkPayload(biotEvidencePayload),
      resultHashSha256: hashFemBenchmarkPayload(biotResultPayload),
      seriesSummary: biotSeries,
      notes: [
        'Generated published-source comparison record for an alpha-zero Biot pressure-diffusion specialization; commercial solver comparison remains missing.',
      ],
    },
    {
      id: 'opengeosys-consolidation-staggered-biot-pressure-profile-t10',
      quantityRequirementId: biotRequirement.id,
      referenceId: 'opengeosys-consolidation-staggered-benchmark',
      caseId: 'opengeosys-staggered-consolidation-pressure-profile-t10',
      comparisonKind: 'series-summary',
      metricName: 'loadGeneratedExcessPorePressureProfileAtT10s',
      quantity: biotRequirement.quantity,
      unit: biotRequirement.unit,
      actual: round(ogsActual, 10),
      expected: round(ogsExpected, 10),
      tolerance: biotRequirement.tolerance,
      toleranceType: biotRequirement.toleranceType,
      accepted: ogsAccepted,
      candidateSolver: {
        name: 'geotechCLI FEM evidence suite',
        version: 'strong-beta',
        solverType: 'geotechcli-kernel',
        analysisProcedure: 'linear-elastic Quad4 Biot u-p load-generated consolidation pressure profile',
        elementType: 'Quad4 plane-strain u-p evidence mesh',
        runId: 'opengeosys-staggered-consolidation-pressure-profile-t10',
      },
      referenceSolver: {
        name: 'OpenGeoSys',
        version: 'stable documentation',
        vendor: 'OpenGeoSys project',
        solverType: 'open-source-solver',
        analysisProcedure: 'HYDRO_MECHANICS staggered fixed-stress consolidation benchmark',
        elementType: '2D hydro-mechanics finite elements',
        runId: 'HydroMechanics/StaggeredScheme/ConsolidationBenchmark/consolidation_benchmark.prj',
      },
      evidenceHashSha256: hashFemBenchmarkPayload(ogsEvidencePayload),
      resultHashSha256: hashFemBenchmarkPayload(ogsResultPayload),
      seriesSummary: ogsSeries,
      notes: [
        'Generated open-source solver comparison record against the OpenGeoSys staggered consolidation benchmark analytical pressure profile.',
        'This adds open-source cross-solver evidence but does not satisfy the required commercial-solver production benchmark gate.',
      ],
    },
  ];
}

export function evaluateFemTolerance(
  quantity: string,
  actual: number,
  expected: number,
  absoluteTolerance: number,
  options: { relativeTolerance?: number; unit?: string } = {},
): FemToleranceCheck {
  const error = Math.abs(actual - expected);
  const relativeError = Math.abs(expected) > 0 ? error / Math.abs(expected) : error;
  const relativeAccepted = options.relativeTolerance != null && relativeError <= options.relativeTolerance;
  const accepted = error <= absoluteTolerance || relativeAccepted;
  return {
    quantity,
    actual,
    expected,
    absoluteTolerance,
    ...(options.relativeTolerance != null ? { relativeTolerance: options.relativeTolerance } : {}),
    ...(options.unit ? { unit: options.unit } : {}),
    error,
    relativeError,
    accepted,
  };
}

function mohrCoulombTriaxialCompressionQFailure(
  confiningEffectiveStressKpa: number,
  frictionAngleDeg: number,
  cohesionKpa: number,
): number {
  const phi = degToRad(frictionAngleDeg);
  const sinPhi = Math.sin(phi);
  const denominator = 1 - sinPhi;
  return ((2 * cohesionKpa * Math.cos(phi)) + (2 * confiningEffectiveStressKpa * sinPhi)) / denominator;
}

function assertPrincipalVector(value: unknown, label: string): asserts value is FemPrincipalVector {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => Number.isFinite(item))) {
    throw new Error(`${label} must be a finite principal vector [x, y, z].`);
  }
}

function addPrincipal(a: FemPrincipalVector, b: FemPrincipalVector): FemPrincipalVector {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scalePrincipal(a: FemPrincipalVector, factor: number): FemPrincipalVector {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function tracePrincipal(a: FemPrincipalVector): number {
  return a[0] + a[1] + a[2];
}

function deviatorPrincipal(a: FemPrincipalVector): FemPrincipalVector {
  const mean = tracePrincipal(a) / 3;
  return [a[0] - mean, a[1] - mean, a[2] - mean];
}

function principalNorm(a: FemPrincipalVector): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function roundPrincipal(a: FemPrincipalVector, digits = 8): FemPrincipalVector {
  return [round(a[0], digits), round(a[1], digits), round(a[2], digits)];
}

function elasticModuliFromEAndNu(
  elasticModulusKpa: number,
  poissonRatio: number,
): { bulkModulusKpa: number; shearModulusKpa: number } {
  assertFinitePositive(elasticModulusKpa, 'elasticModulusKpa');
  if (!Number.isFinite(poissonRatio) || poissonRatio < 0 || poissonRatio >= 0.5) {
    throw new Error('poissonRatio must be finite and between 0 and 0.5.');
  }
  return {
    bulkModulusKpa: elasticModulusKpa / (3 * (1 - 2 * poissonRatio)),
    shearModulusKpa: elasticModulusKpa / (2 * (1 + poissonRatio)),
  };
}

function druckerPragerRhoFromAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg >= 50) {
    throw new Error('friction and dilation angles must be finite and between 0 and 50 degrees.');
  }
  const angle = degToRad(angleDeg);
  const sinAngle = Math.sin(angle);
  if (sinAngle === 0) return 0;
  return (2 * Math.SQRT2 * sinAngle) / (Math.sqrt(3) * (3 - sinAngle));
}

export function mapMohrCoulombToDruckerPragerTriaxialCompression(input: {
  frictionAngleDeg: number;
  cohesionKpa: number;
  dilationAngleDeg?: number;
}): FemDruckerPragerParameterMapping {
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  const dilationAngleDeg = input.dilationAngleDeg ?? input.frictionAngleDeg;
  const rho = druckerPragerRhoFromAngle(input.frictionAngleDeg);
  const rhoBar = Math.min(rho, druckerPragerRhoFromAngle(dilationAngleDeg));
  const phi = degToRad(input.frictionAngleDeg);
  const sinPhi = Math.sin(phi);
  const cohesionContributionToQ = (2 * input.cohesionKpa * Math.cos(phi)) / (1 - sinPhi);
  const deviatoricNormFactor = Math.sqrt(2 / 3);
  const compressionInterceptKpa = cohesionContributionToQ * (deviatoricNormFactor - rho);

  return {
    schemaVersion: 'fem-drucker-prager-parameter-mapping.v1',
    source: 'mohr-coulomb-triaxial-compression-fit',
    signConvention: 'compression-positive',
    frictionAngleDeg: round(input.frictionAngleDeg, 6),
    cohesionKpa: round(input.cohesionKpa, 6),
    dilationAngleDeg: round(dilationAngleDeg, 6),
    rho: round(rho, 12),
    rhoBar: round(rhoBar, 12),
    yieldStressKpa: round(compressionInterceptKpa / deviatoricNormFactor, 8),
    compressionInterceptKpa: round(compressionInterceptKpa, 8),
  };
}

function elasticStressIncrement(
  strainIncrement: FemPrincipalVector,
  bulkModulusKpa: number,
  shearModulusKpa: number,
): FemPrincipalVector {
  const volumetricStrain = tracePrincipal(strainIncrement);
  const deviatoricStrain = deviatorPrincipal(strainIncrement);
  return addPrincipal(
    scalePrincipal(deviatoricStrain, 2 * shearModulusKpa),
    [bulkModulusKpa * volumetricStrain, bulkModulusKpa * volumetricStrain, bulkModulusKpa * volumetricStrain],
  );
}

function druckerPragerYieldValue(
  stress: FemPrincipalVector,
  rho: number,
  compressionInterceptKpa: number,
): number {
  return principalNorm(deviatorPrincipal(stress)) - rho * tracePrincipal(stress) - compressionInterceptKpa;
}

export function runDruckerPragerMaterialPoint(
  input: FemDruckerPragerMaterialPointInput,
): FemDruckerPragerMaterialPointResult {
  assertPrincipalVector(input.initialPrincipalEffectiveStressKpa, 'initialPrincipalEffectiveStressKpa');
  if (!Array.isArray(input.principalStrainIncrements) || input.principalStrainIncrements.length === 0) {
    throw new Error('principalStrainIncrements must contain at least one strain increment.');
  }
  for (const [index, increment] of input.principalStrainIncrements.entries()) {
    assertPrincipalVector(increment, `principalStrainIncrements.${index}`);
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFiniteNonNegative(input.hardeningModulusKpa ?? 0, 'hardeningModulusKpa');

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const mapping = mapMohrCoulombToDruckerPragerTriaxialCompression({
    frictionAngleDeg: input.frictionAngleDeg,
    cohesionKpa: input.cohesionKpa,
    dilationAngleDeg: input.dilationAngleDeg,
  });
  const elasticModuli = elasticModuliFromEAndNu(input.elasticModulusKpa, input.poissonRatio);
  const hardeningModulusKpa = input.hardeningModulusKpa ?? 0;
  const stressPath: FemDruckerPragerStressStep[] = [];
  let principalStrain: FemPrincipalVector = [0, 0, 0];
  let plasticStrainPrincipal: FemPrincipalVector = [0, 0, 0];
  let stress = [...input.initialPrincipalEffectiveStressKpa] as FemPrincipalVector;
  let equivalentPlasticStrain = 0;
  let volumetricPlasticStrain = 0;

  for (const [index, strainIncrement] of input.principalStrainIncrements.entries()) {
    principalStrain = addPrincipal(principalStrain, strainIncrement);
    const trialStress = addPrincipal(
      stress,
      elasticStressIncrement(
        strainIncrement,
        elasticModuli.bulkModulusKpa,
        elasticModuli.shearModulusKpa,
      ),
    );
    const currentIntercept = mapping.compressionInterceptKpa + hardeningModulusKpa * equivalentPlasticStrain;
    const trialYield = druckerPragerYieldValue(trialStress, mapping.rho, currentIntercept);
    const trialScale = Math.max(
      principalNorm(deviatorPrincipal(trialStress)),
      Math.abs(mapping.rho * tracePrincipal(trialStress)),
      Math.abs(currentIntercept),
      1,
    );
    const trialYieldResidualRatio = Math.abs(trialYield) / trialScale;
    let plasticMultiplier = 0;
    let iterations = 0;
    let state: FemDruckerPragerStressStep['state'] = 'elastic';

    if (trialYieldResidualRatio > policy.residualTolerance && trialYield > 0) {
      state = 'plastic';
      const trialDeviator = deviatorPrincipal(trialStress);
      const trialNorm = principalNorm(trialDeviator);
      const flowDirection = trialNorm > 0
        ? scalePrincipal(trialDeviator, 1 / trialNorm)
        : [0, 0, 0] as FemPrincipalVector;
      const denominator = 2 * elasticModuli.shearModulusKpa +
        9 * elasticModuli.bulkModulusKpa * mapping.rho * mapping.rhoBar +
        hardeningModulusKpa;
      plasticMultiplier = Math.max(0, trialYield / denominator);
      equivalentPlasticStrain += plasticMultiplier;
      const plasticIncrement = addPrincipal(
        scalePrincipal(flowDirection, plasticMultiplier),
        [-mapping.rhoBar * plasticMultiplier, -mapping.rhoBar * plasticMultiplier, -mapping.rhoBar * plasticMultiplier],
      );
      plasticStrainPrincipal = addPrincipal(plasticStrainPrincipal, plasticIncrement);
      volumetricPlasticStrain += tracePrincipal(plasticIncrement);
      const correctedDeviator = addPrincipal(
        trialDeviator,
        scalePrincipal(flowDirection, -2 * elasticModuli.shearModulusKpa * plasticMultiplier),
      );
      const correctedTrace = tracePrincipal(trialStress) +
        9 * elasticModuli.bulkModulusKpa * mapping.rhoBar * plasticMultiplier;
      stress = addPrincipal(
        correctedDeviator,
        [correctedTrace / 3, correctedTrace / 3, correctedTrace / 3],
      );
      iterations = 1;
    } else {
      stress = trialStress;
    }

    const updatedIntercept = mapping.compressionInterceptKpa + hardeningModulusKpa * equivalentPlasticStrain;
    const yieldValue = druckerPragerYieldValue(stress, mapping.rho, updatedIntercept);
    const yieldScale = Math.max(
      principalNorm(deviatorPrincipal(stress)),
      Math.abs(mapping.rho * tracePrincipal(stress)),
      Math.abs(updatedIntercept),
      1,
    );
    const yieldResidualRatio = Math.abs(yieldValue) / yieldScale;
    stressPath.push({
      step: index + 1,
      principalStrain: roundPrincipal(principalStrain, 10),
      principalEffectiveStressKpa: roundPrincipal(stress, 6),
      meanEffectiveStressKpa: round(tracePrincipal(stress) / 3, 6),
      deviatoricStressNormKpa: round(principalNorm(deviatorPrincipal(stress)), 6),
      compressionInterceptKpa: round(updatedIntercept, 8),
      hardeningStressKpa: round(updatedIntercept - mapping.compressionInterceptKpa, 8),
      yieldValueKpa: round(yieldValue, 10),
      yieldResidualRatio: round(yieldResidualRatio, 12),
      plasticMultiplier: round(plasticMultiplier, 12),
      equivalentPlasticStrain: round(equivalentPlasticStrain, 12),
      volumetricPlasticStrain: round(volumetricPlasticStrain, 12),
      state,
      iterations,
      converged: state === 'elastic' || yieldResidualRatio <= policy.residualTolerance,
    });
  }

  const finalStep = stressPath[stressPath.length - 1];
  return {
    schemaVersion: 'fem-drucker-prager-material-point.v1',
    signConvention: 'compression-positive',
    model: 'drucker-prager-elastoplastic-principal-stress-return-mapping',
    mapping,
    elasticModuli: {
      bulkModulusKpa: round(elasticModuli.bulkModulusKpa, 6),
      shearModulusKpa: round(elasticModuli.shearModulusKpa, 6),
    },
    converged: stressPath.every((step) => step.converged),
    finalStep,
    stressPath,
    plasticStrainPrincipal: roundPrincipal(plasticStrainPrincipal, 12),
    policy,
  };
}

export function runMohrCoulombMaterialPoint(
  input: FemMohrCoulombMaterialPointInput,
): FemMohrCoulombMaterialPointResult {
  assertFinitePositive(input.confiningEffectiveStressKpa, 'confiningEffectiveStressKpa');
  assertFinitePositive(input.elasticModulusKpa, 'elasticModulusKpa');
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFiniteNonNegative(input.axialStrain, 'axialStrain');
  if (!Number.isFinite(input.poissonRatio) || input.poissonRatio < 0 || input.poissonRatio >= 0.5) {
    throw new Error('poissonRatio must be finite and between 0 and 0.5.');
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const increments = Math.max(1, Math.floor(input.increments ?? 20));
  const qFailure = mohrCoulombTriaxialCompressionQFailure(
    input.confiningEffectiveStressKpa,
    input.frictionAngleDeg,
    input.cohesionKpa,
  );
  const failureAxialStrain = qFailure / input.elasticModulusKpa;
  const stressPath: FemMohrCoulombStressStep[] = [];

  for (let index = 1; index <= increments; index++) {
    const axialStrain = input.axialStrain * (index / increments);
    const qTrial = input.elasticModulusKpa * axialStrain;
    const plastic = qTrial > qFailure;
    const deviatorStressKpa = plastic ? qFailure : qTrial;
    const plasticAxialStrain = plastic ? axialStrain - failureAxialStrain : 0;
    const yieldResidualRatio = plastic
      ? Math.abs(deviatorStressKpa - qFailure) / Math.max(qFailure, 1)
      : Math.max(0, qTrial - qFailure) / Math.max(qFailure, 1);

    stressPath.push({
      step: index,
      axialStrain: round(axialStrain, 8),
      majorEffectiveStressKpa: round(input.confiningEffectiveStressKpa + deviatorStressKpa, 4),
      minorEffectiveStressKpa: round(input.confiningEffectiveStressKpa, 4),
      deviatorStressKpa: round(deviatorStressKpa, 4),
      yieldDeviatorStressKpa: round(qFailure, 4),
      plasticAxialStrain: round(Math.max(0, plasticAxialStrain), 8),
      mobilizedStrengthRatio: round(deviatorStressKpa / qFailure, 6),
      yieldResidualRatio: round(yieldResidualRatio, 10),
      state: plastic ? 'plastic' : 'elastic',
    });
  }

  const finalStep = stressPath[stressPath.length - 1];
  return {
    schemaVersion: 'fem-mohr-coulomb-material-point.v1',
    signConvention: 'compression-positive',
    model: 'mohr-coulomb-elastic-perfectly-plastic-triaxial-compression',
    converged: finalStep.yieldResidualRatio <= policy.residualTolerance,
    failureAxialStrain: round(failureAxialStrain, 8),
    peakDeviatorStressKpa: round(qFailure, 4),
    finalStep,
    stressPath,
    policy,
  };
}

export function terzaghiAverageConsolidation(timeFactor: number, terms = 80): number {
  if (!Number.isFinite(timeFactor) || timeFactor < 0) {
    throw new Error('timeFactor must be finite and non-negative.');
  }
  let remaining = 0;
  for (let m = 0; m < terms; m++) {
    const n = 2 * m + 1;
    remaining += (1 / (n * n)) * Math.exp(-((n * n * Math.PI * Math.PI * timeFactor) / 4));
  }
  const degree = 1 - (8 / (Math.PI * Math.PI)) * remaining;
  return Math.min(1, Math.max(0, degree));
}

function openGeoSysConsolidationPressureRatio(depthRatioFromTop: number, dimensionlessTime: number, terms = 120): number {
  if (!Number.isFinite(depthRatioFromTop) || depthRatioFromTop < -1e-12 || depthRatioFromTop > 1 + 1e-12) {
    throw new Error('depthRatioFromTop must be finite and within [0, 1].');
  }
  if (!Number.isFinite(dimensionlessTime) || dimensionlessTime < 0) {
    throw new Error('dimensionlessTime must be finite and non-negative.');
  }
  const xD = Math.min(1, Math.max(0, depthRatioFromTop));
  let pressureRatio = 0;
  for (let n = 0; n < terms; n++) {
    const m = 0.5 * Math.PI * (2 * n + 1);
    pressureRatio += (2 / m) * Math.sin(m * xD) * Math.exp(-(m * m * dimensionlessTime));
  }
  return Math.max(0, pressureRatio);
}

function solveTridiagonal(lower: number[], diagonal: number[], upper: number[], rhs: number[]): number[] {
  const n = diagonal.length;
  const cPrime = new Array<number>(n).fill(0);
  const dPrime = new Array<number>(n).fill(0);

  cPrime[0] = upper[0] / diagonal[0];
  dPrime[0] = rhs[0] / diagonal[0];

  for (let i = 1; i < n; i++) {
    const denom = diagonal[i] - lower[i] * cPrime[i - 1];
    cPrime[i] = i === n - 1 ? 0 : upper[i] / denom;
    dPrime[i] = (rhs[i] - lower[i] * dPrime[i - 1]) / denom;
  }

  const solution = new Array<number>(n).fill(0);
  solution[n - 1] = dPrime[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    solution[i] = dPrime[i] - cPrime[i] * solution[i + 1];
  }
  return solution;
}

function averageUniformNodes(values: number[]): number {
  if (values.length < 2) return values[0] ?? 0;
  let weighted = 0.5 * values[0] + 0.5 * values[values.length - 1];
  for (let i = 1; i < values.length - 1; i++) {
    weighted += values[i];
  }
  return weighted / (values.length - 1);
}

export function runTerzaghiConsolidationTimeStepper(
  input: FemConsolidationTimeStepperInput,
): FemConsolidationTimeStepperResult {
  assertFinitePositive(input.layerThicknessM, 'layerThicknessM');
  assertFinitePositive(input.coefficientOfConsolidationM2PerYear, 'coefficientOfConsolidationM2PerYear');
  assertFinitePositive(input.initialExcessPorePressureKpa, 'initialExcessPorePressureKpa');
  assertFiniteNonNegative(input.primarySettlementMm, 'primarySettlementMm');
  if (!Array.isArray(input.timeStepsYears) || input.timeStepsYears.length === 0) {
    throw new Error('timeStepsYears must contain at least one time step.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const nodeCount = Math.max(8, Math.min(201, Math.floor(input.nodeCount ?? 41)));
  const drainagePathM = input.drainage === 'double' ? input.layerThicknessM / 2 : input.layerThicknessM;
  const dz = drainagePathM / (nodeCount - 1);
  let porePressures = new Array<number>(nodeCount).fill(input.initialExcessPorePressureKpa);
  porePressures[0] = 0;
  const initialAverage = averageUniformNodes(porePressures);
  let previousTime = 0;
  let maxReferenceError = 0;
  const steps: FemConsolidationStep[] = [];

  for (const timeYears of input.timeStepsYears) {
    if (!Number.isFinite(timeYears) || timeYears <= previousTime) {
      throw new Error('timeStepsYears must be finite, positive, and strictly increasing.');
    }
    const dt = timeYears - previousTime;
    previousTime = timeYears;
    const r = (input.coefficientOfConsolidationM2PerYear * dt) / (dz * dz);
    const unknowns = nodeCount - 1;
    const lower = new Array<number>(unknowns).fill(0);
    const diagonal = new Array<number>(unknowns).fill(1 + 2 * r);
    const upper = new Array<number>(unknowns).fill(0);
    const rhs = new Array<number>(unknowns).fill(0);

    for (let j = 0; j < unknowns; j++) {
      const nodeIndex = j + 1;
      rhs[j] = porePressures[nodeIndex];
      if (j > 0) lower[j] = nodeIndex === nodeCount - 1 ? -2 * r : -r;
      if (nodeIndex < nodeCount - 1) upper[j] = -r;
    }

    const solved = solveTridiagonal(lower, diagonal, upper, rhs);
    porePressures = [0, ...solved];
    const averagePorePressure = averageUniformNodes(porePressures);
    const degreeOfConsolidation = Math.min(1, Math.max(0, 1 - averagePorePressure / initialAverage));
    const timeFactor = (input.coefficientOfConsolidationM2PerYear * timeYears) / (drainagePathM * drainagePathM);
    const referenceDegreeOfConsolidation = terzaghiAverageConsolidation(timeFactor);
    const referenceError = Math.abs(degreeOfConsolidation - referenceDegreeOfConsolidation);
    maxReferenceError = Math.max(maxReferenceError, referenceError);
    steps.push({
      timeYears: round(timeYears, 6),
      timeFactor: round(timeFactor, 6),
      averageExcessPorePressureKpa: round(averagePorePressure, 5),
      degreeOfConsolidation: round(degreeOfConsolidation, 6),
      referenceDegreeOfConsolidation: round(referenceDegreeOfConsolidation, 6),
      settlementMm: round(input.primarySettlementMm * degreeOfConsolidation, 4),
      referenceError: round(referenceError, 8),
    });
  }

  const finalStep = steps[steps.length - 1];
  return {
    schemaVersion: 'fem-consolidation-time-stepper.v1',
    method: 'backward-euler-1d-terzaghi',
    drainagePathM: round(drainagePathM, 6),
    nodeCount,
    converged: maxReferenceError <= 0.05,
    maxReferenceError: round(maxReferenceError, 8),
    finalStep,
    steps,
    policy,
  };
}

export function runDarcySeepage1D(input: FemSeepage1DInput): FemSeepage1DResult {
  assertFinitePositive(input.hydraulicConductivityMPerS, 'hydraulicConductivityMPerS');
  assertFinitePositive(input.domainLengthM, 'domainLengthM');
  if (!Number.isFinite(input.upstreamHeadM) || !Number.isFinite(input.downstreamHeadM)) {
    throw new Error('upstreamHeadM and downstreamHeadM must be finite.');
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const nodeCount = Math.max(3, Math.min(201, Math.floor(input.nodeCount ?? 21)));
  const dx = input.domainLengthM / (nodeCount - 1);
  const headDrop = input.upstreamHeadM - input.downstreamHeadM;
  const hydraulicGradient = headDrop / input.domainLengthM;
  const steadyFlowM3PerSPerM = input.hydraulicConductivityMPerS * hydraulicGradient;
  const gammaWaterKpaPerM = 9.81;
  const steadyHeads = Array.from({ length: nodeCount }, (_, index) =>
    input.upstreamHeadM - headDrop * (index / (nodeCount - 1)));
  const nodes = steadyHeads.map((headM, index) => ({
    xM: round(index * dx, 6),
    headM: round(headM, 6),
    porePressureKpa: round(Math.max(0, headM * gammaWaterKpaPerM), 4),
  }));

  const transientSteps: FemSeepageTransientStep[] = [];
  if (input.transient) {
    assertFinitePositive(input.transient.specificStorage1PerM, 'transient.specificStorage1PerM');
    assertFinitePositive(input.transient.durationSeconds, 'transient.durationSeconds');
    const timeSteps = Math.max(1, Math.floor(input.transient.timeSteps));
    const dt = input.transient.durationSeconds / timeSteps;
    const diffusivity = input.hydraulicConductivityMPerS / input.transient.specificStorage1PerM;
    const r = (diffusivity * dt) / (dx * dx);
    let heads = new Array<number>(nodeCount).fill(
      input.transient.initialHeadM ?? input.downstreamHeadM,
    );
    heads[0] = input.upstreamHeadM;
    heads[nodeCount - 1] = input.downstreamHeadM;
    const unknowns = nodeCount - 2;

    for (let step = 1; step <= timeSteps; step++) {
      const lower = new Array<number>(unknowns).fill(0);
      const diagonal = new Array<number>(unknowns).fill(1 + 2 * r);
      const upper = new Array<number>(unknowns).fill(0);
      const rhs = new Array<number>(unknowns).fill(0);
      for (let j = 0; j < unknowns; j++) {
        const nodeIndex = j + 1;
        rhs[j] = heads[nodeIndex];
        if (j === 0) rhs[j] += r * input.upstreamHeadM;
        if (j === unknowns - 1) rhs[j] += r * input.downstreamHeadM;
        if (j > 0) lower[j] = -r;
        if (j < unknowns - 1) upper[j] = -r;
      }
      const solved = solveTridiagonal(lower, diagonal, upper, rhs);
      heads = [input.upstreamHeadM, ...solved, input.downstreamHeadM];
      const maxHeadErrorToSteadyM = Math.max(...heads.map((head, index) => Math.abs(head - steadyHeads[index])));
      transientSteps.push({
        timeSeconds: round(step * dt, 6),
        maxHeadErrorToSteadyM: round(maxHeadErrorToSteadyM, 8),
        headsM: heads.map((head) => round(head, 6)),
      });
    }
  }

  const inflow = steadyFlowM3PerSPerM;
  const outflow = input.hydraulicConductivityMPerS *
    ((nodes[nodeCount - 2].headM - nodes[nodeCount - 1].headM) / dx);
  const massBalanceErrorRatio = Math.abs(inflow - outflow) / Math.max(Math.abs(inflow), 1e-12);

  return {
    schemaVersion: 'fem-seepage-1d.v1',
    method: 'darcy-finite-difference-1d',
    steadyFlowM3PerSPerM: Number(steadyFlowM3PerSPerM.toExponential(8)),
    hydraulicGradient: round(hydraulicGradient, 8),
    massBalanceErrorRatio: round(massBalanceErrorRatio, 10),
    converged: massBalanceErrorRatio <= policy.porePressureMassBalanceTolerance,
    nodes,
    transientSteps,
    policy,
  };
}

export function runHydroMechanicalCoupling1D(
  input: FemHydroMechanicalCouplingInput,
): FemHydroMechanicalCouplingResult {
  assertFinitePositive(input.totalVerticalStressKpa, 'totalVerticalStressKpa');
  assertFiniteNonNegative(input.porePressureBeforeKpa, 'porePressureBeforeKpa');
  assertFiniteNonNegative(input.porePressureAfterKpa, 'porePressureAfterKpa');
  assertFinitePositive(input.constrainedModulusKpa, 'constrainedModulusKpa');
  assertFinitePositive(input.layerThicknessM, 'layerThicknessM');
  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const effectiveStressBeforeKpa = input.totalVerticalStressKpa - input.porePressureBeforeKpa;
  const effectiveStressAfterKpa = input.totalVerticalStressKpa - input.porePressureAfterKpa;
  const effectiveStressIncreaseKpa = effectiveStressAfterKpa - effectiveStressBeforeKpa;
  const settlementMm = (effectiveStressIncreaseKpa / input.constrainedModulusKpa) *
    input.layerThicknessM * 1000;
  const stableEffectiveStress = effectiveStressBeforeKpa > 0 && effectiveStressAfterKpa > 0;

  return {
    schemaVersion: 'fem-hydro-mechanical-coupling.v1',
    method: 'effective-stress-1d-coupling',
    effectiveStressBeforeKpa: round(effectiveStressBeforeKpa, 4),
    effectiveStressAfterKpa: round(effectiveStressAfterKpa, 4),
    effectiveStressIncreaseKpa: round(effectiveStressIncreaseKpa, 4),
    settlementMm: round(settlementMm, 4),
    stableEffectiveStress,
    converged: stableEffectiveStress,
    policy,
  };
}

export function runExcavationSupportDesignCheck(
  input: FemExcavationSupportDesignCheckInput,
): FemExcavationSupportDesignCheckResult {
  assertFinitePositive(input.excavationDepthM, 'excavationDepthM');
  assertFinitePositive(input.wallToeDepthM, 'wallToeDepthM');
  assertFinitePositive(input.unitWeightKnM3, 'unitWeightKnM3');
  assertFiniteNonNegative(input.cohesionKpa, 'cohesionKpa');
  assertFinitePositive(input.allowableSupportLoadKnPerM, 'allowableSupportLoadKnPerM');
  if (input.wallToeDepthM <= input.excavationDepthM) {
    throw new Error('wallToeDepthM must be deeper than excavationDepthM.');
  }
  if (!Number.isFinite(input.frictionAngleDeg) || input.frictionAngleDeg <= 0 || input.frictionAngleDeg >= 50) {
    throw new Error('frictionAngleDeg must be finite and between 0 and 50 degrees.');
  }
  if (!Array.isArray(input.supportLevelsM)) {
    throw new Error('supportLevelsM must be an array of finite support depths.');
  }
  for (const [index, level] of input.supportLevelsM.entries()) {
    if (!Number.isFinite(level) || level < 0 || level > input.excavationDepthM) {
      throw new Error(`supportLevelsM.${index} must be finite and between 0 and excavationDepthM.`);
    }
  }
  const stageDepthsM = input.stageDepthsM ?? [input.excavationDepthM];
  if (!Array.isArray(stageDepthsM) || stageDepthsM.length === 0) {
    throw new Error('stageDepthsM must contain at least one staged excavation depth when provided.');
  }
  let previousStageDepthM = 0;
  for (const [index, stageDepthM] of stageDepthsM.entries()) {
    if (!Number.isFinite(stageDepthM) || stageDepthM <= previousStageDepthM || stageDepthM > input.excavationDepthM) {
      throw new Error(`stageDepthsM.${index} must be finite, increasing, and no deeper than excavationDepthM.`);
    }
    previousStageDepthM = stageDepthM;
  }

  const policy = input.policy ?? DEFAULT_FEM_CONVERGENCE_POLICY;
  const surchargeKpa = input.surchargeKpa ?? 0;
  const waterTableDepthM = input.waterTableDepthM ?? 999;
  const activeForceForDepth = (depthM: number): number => calculateLateralEarthPressure({
    wallHeight: depthM,
    soilLayers: [{
      thickness: depthM,
      unitWeight: input.unitWeightKnM3,
      cohesion: input.cohesionKpa,
      frictionAngle: input.frictionAngleDeg,
    }],
    method: 'rankine',
    pressureState: 'active',
    wallFrictionAngle: 0,
    backfillAngle: 0,
    wallInclination: 0,
    waterTableDepth: waterTableDepthM,
    surcharge: surchargeKpa,
  }).totalForce;
  const activeTotalForce = activeForceForDepth(input.excavationDepthM);
  const embedmentM = input.wallToeDepthM - input.excavationDepthM;
  const passive = calculateLateralEarthPressure({
    wallHeight: embedmentM,
    soilLayers: [{
      thickness: embedmentM,
      unitWeight: input.unitWeightKnM3,
      cohesion: input.cohesionKpa,
      frictionAngle: input.frictionAngleDeg,
    }],
    method: 'rankine',
    pressureState: 'passive',
    wallFrictionAngle: 0,
    backfillAngle: 0,
    wallInclination: 0,
    waterTableDepth: 999,
    surcharge: 0,
  });

  const supportLevelsM = [...new Set(input.supportLevelsM)].sort((a, b) => a - b);
  const supportCount = supportLevelsM.length;
  const supportDemandKnPerM = supportCount > 0
    ? activeTotalForce / supportCount
    : activeTotalForce;
  const supportCapacitySafetyFactor = supportCount > 0
    ? input.allowableSupportLoadKnPerM / Math.max(supportDemandKnPerM, 1e-9)
    : 0;
  const passiveSafetyFactor = passive.totalForce / Math.max(activeTotalForce, 1e-9);
  const basalHeaveSafetyFactor = input.cohesionKpa > 0
    ? (5.14 * input.cohesionKpa) / Math.max(input.unitWeightKnM3 * input.excavationDepthM + surchargeKpa, 1e-9)
    : 0;
  const requiredPassiveSafetyFactor = input.requiredPassiveSafetyFactor ?? 1.5;
  const requiredBasalHeaveSafetyFactor = input.requiredBasalHeaveSafetyFactor ?? 1.5;
  const stagedSequenceCoversFinalDepth = Math.abs(stageDepthsM[stageDepthsM.length - 1] - input.excavationDepthM) <= 1e-9;

  const stageChecks: FemExcavationSupportStageCheck[] = stageDepthsM.map((stageDepthM, index) => {
    const installedSupportLevelsM = supportLevelsM.filter((level) => level <= stageDepthM);
    const activeEarthPressureKnPerM = activeForceForDepth(stageDepthM);
    const supportReactionDemandKnPerM = installedSupportLevelsM.length > 0
      ? activeEarthPressureKnPerM / installedSupportLevelsM.length
      : activeEarthPressureKnPerM;
    const stageSupportCapacitySafetyFactor = installedSupportLevelsM.length > 0
      ? input.allowableSupportLoadKnPerM / Math.max(supportReactionDemandKnPerM, 1e-9)
      : 0;
    const blockerCodes: string[] = [];
    if (installedSupportLevelsM.length === 0) blockerCodes.push('support-level-missing');
    if (stageSupportCapacitySafetyFactor < 1) blockerCodes.push('support-reaction-demand-exceeds-allowable');
    if (index === stageDepthsM.length - 1 && !stagedSequenceCoversFinalDepth) {
      blockerCodes.push('final-stage-depth-mismatch');
    }

    return {
      id: `stage-${index + 1}-support-reaction`,
      stageDepthM: round(stageDepthM, 4),
      installedSupportLevelsM: installedSupportLevelsM.map((level) => round(level, 4)),
      activeEarthPressureKnPerM: round(activeEarthPressureKnPerM, 4),
      supportReactionDemandKnPerM: round(supportReactionDemandKnPerM, 4),
      supportCapacitySafetyFactor: round(stageSupportCapacitySafetyFactor, 4),
      blockerCodes,
      status: blockerCodes.length === 0 ? 'accepted' : 'blocked',
    };
  });

  const checks: FemDesignCheck[] = [
    {
      id: 'support-capacity',
      actual: round(supportCapacitySafetyFactor, 4),
      required: 1,
      status: supportCapacitySafetyFactor >= 1 ? 'accepted' : 'blocked',
    },
    {
      id: 'passive-toe-resistance',
      actual: round(passiveSafetyFactor, 4),
      required: requiredPassiveSafetyFactor,
      status: passiveSafetyFactor >= requiredPassiveSafetyFactor ? 'accepted' : 'blocked',
    },
    {
      id: 'basal-heave',
      actual: round(basalHeaveSafetyFactor, 4),
      required: requiredBasalHeaveSafetyFactor,
      status: basalHeaveSafetyFactor >= requiredBasalHeaveSafetyFactor ? 'accepted' : 'blocked',
    },
    {
      id: 'staged-support-reaction-sequence',
      actual: stageChecks.every((check) => check.status === 'accepted') && stagedSequenceCoversFinalDepth ? 1 : 0,
      required: 1,
      status: stageChecks.every((check) => check.status === 'accepted') && stagedSequenceCoversFinalDepth
        ? 'accepted'
        : 'blocked',
    },
  ];
  const acceptanceBlockers = [
    ...checks
      .filter((check) => check.status === 'blocked')
      .map((check) => `support-design.${check.id}`),
    ...stageChecks.flatMap((check) =>
      check.blockerCodes.map((code) => `${check.id}.${code}`)),
  ];

  return {
    schemaVersion: 'fem-excavation-support-design-check.v1',
    method: 'rankine-earth-pressure-support-screening',
    designScope: 'screening-only-not-structural-design',
    activeEarthPressureKnPerM: round(activeTotalForce, 4),
    passiveToeResistanceKnPerM: round(passive.totalForce, 4),
    supportDemandKnPerM: round(supportDemandKnPerM, 4),
    supportCapacitySafetyFactor: round(supportCapacitySafetyFactor, 4),
    passiveSafetyFactor: round(passiveSafetyFactor, 4),
    basalHeaveSafetyFactor: round(basalHeaveSafetyFactor, 4),
    stageChecks,
    checks,
    acceptanceBlockers: [...new Set(acceptanceBlockers)],
    productionBlockers: [
      'jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented',
      'screening-support-reaction-check-is-not-a-design-code-acceptance',
    ],
    status: checks.every((check) => check.status === 'accepted') ? 'accepted' : 'blocked',
    policy,
  };
}

export function validateFemReviewerApprovalRecord(
  record: Partial<FemReviewerApprovalRecord>,
): FemReviewerApprovalValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (record.schemaVersion !== 'fem-reviewer-approval.v1') blockers.push('schema.unsupported');
  if (!record.recordId || record.recordId.trim().length < 6) blockers.push('record-id.missing');
  if (!record.caseId || record.caseId.trim().length < 3) blockers.push('case-id.missing');
  if (!record.caseHashSha256 || !/^[a-f0-9]{64}$/i.test(record.caseHashSha256)) blockers.push('case-hash.invalid');
  const validationSummary = record.validationSummary;
  if (
    !validationSummary ||
    (validationSummary.status !== 'ready' &&
      validationSummary.status !== 'review' &&
      validationSummary.status !== 'blocked')
  ) {
    blockers.push('validation-summary.status.invalid');
  }
  if (validationSummary) {
    if (!isNonNegativeInteger(validationSummary.blockers)) {
      blockers.push('validation-summary.blockers.invalid');
    } else if (validationSummary.blockers > 0 || validationSummary.status === 'blocked') {
      blockers.push('validation-summary.blocked');
    }
    if (!isNonNegativeInteger(validationSummary.reviewItems)) {
      blockers.push('validation-summary.review-items.invalid');
    } else if (validationSummary.status === 'ready' && validationSummary.reviewItems > 0) {
      blockers.push('validation-summary.ready-with-review-items');
    } else if (validationSummary.status === 'review' && validationSummary.reviewItems === 0) {
      blockers.push('validation-summary.review-items.missing');
    }
    validateNonEmptyStringArray(blockers, validationSummary.findingCodes, 'validation-summary.finding-codes');
  }
  if (!record.reviewer?.name || record.reviewer.name.trim().length < 3) blockers.push('reviewer.name.missing');
  if (!record.reviewer?.licenseId || record.reviewer.licenseId.trim().length < 3) blockers.push('reviewer.license-id.missing');
  if (!record.reviewer?.jurisdiction || record.reviewer.jurisdiction.trim().length < 2) blockers.push('reviewer.jurisdiction.missing');
  if (record.scope !== 'experimental-preview' && record.scope !== 'production-design') {
    blockers.push('scope.unsupported');
  } else if (record.scope === 'production-design') {
    blockers.push('scope.production-design-blocked');
  }
  validateNonEmptyStringArray(blockers, record.assumptions, 'assumptions', { requireOne: true });
  validateNonEmptyStringArray(blockers, record.limitations, 'limitations', { requireOne: true });
  if (!record.approvalStatement || !/\b(reviewed|approved|accepted)\b/i.test(record.approvalStatement)) {
    blockers.push('approval-statement.missing-review-language');
  } else if (
    record.scope === 'experimental-preview' &&
    /\bproduction(?:\s|-)?(?:design|ready|use|calculation)\b/i.test(record.approvalStatement)
  ) {
    blockers.push('approval-statement.production-scope-overclaim');
  }

  const approvedAt = record.approvedAt ? Date.parse(record.approvedAt) : NaN;
  if (!Number.isFinite(approvedAt)) {
    blockers.push('approved-at.invalid');
  } else if (approvedAt > Date.now() + 60_000) {
    blockers.push('approved-at.future');
  }

  return {
    schemaVersion: 'fem-reviewer-approval-validation.v1',
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    blockerCodes: [...new Set(blockers)],
    warnings,
  };
}

function benchmark(
  id: string,
  feature: FemEngineeringKernelFeature,
  referenceType: FemEngineeringBenchmarkCase['referenceType'],
  quantity: string,
  actual: number,
  expected: number,
  tolerance: number,
  evidence: string,
  unit?: string,
): FemEngineeringBenchmarkCase {
  return {
    id,
    feature,
    referenceType,
    quantity,
    actual: round(actual, 8),
    expected: round(expected, 8),
    tolerance,
    ...(unit ? { unit } : {}),
    status: Math.abs(actual - expected) <= tolerance ? 'accepted' : 'blocked',
    evidence,
  };
}

export function runFemEngineeringEvidenceSuite(
  policy: FemConvergencePolicy = DEFAULT_FEM_CONVERGENCE_POLICY,
): FemEngineeringEvidenceReport {
  const benchmarks: FemEngineeringBenchmarkCase[] = [];

  const plasticity = runMohrCoulombMaterialPoint({
    confiningEffectiveStressKpa: 100,
    axialStrain: 0.02,
    elasticModulusKpa: 30_000,
    poissonRatio: 0.3,
    frictionAngleDeg: 30,
    cohesionKpa: 0,
    increments: 20,
    policy,
  });
  benchmarks.push(benchmark(
    'mc-triaxial-drained-phi30-sigma3-100',
    'nonlinear-plasticity',
    'closed-form',
    'peakDeviatorStressKpa',
    plasticity.peakDeviatorStressKpa,
    200,
    1e-6,
    'Mohr-Coulomb triaxial compression closed-form qf = 2 sigma3 sin(phi)/(1 - sin(phi)).',
    'kPa',
  ));

  const druckerPrager = runDruckerPragerMaterialPoint({
    initialPrincipalEffectiveStressKpa: [100, 100, 100],
    principalStrainIncrements: Array.from({ length: 16 }, () => [0.001, -0.0002, -0.0002] as FemPrincipalVector),
    elasticModulusKpa: 30_000,
    poissonRatio: 0.3,
    frictionAngleDeg: 30,
    cohesionKpa: 0,
    dilationAngleDeg: 0,
    policy,
  });
  benchmarks.push(benchmark(
    'drucker-prager-return-map-yield-residual',
    'nonlinear-plasticity',
    'internal-balance',
    'yieldResidualRatio',
    druckerPrager.finalStep.yieldResidualRatio,
    0,
    policy.residualTolerance,
    'Drucker-Prager principal-stress return mapping must project the plastic trial stress back to the smooth yield surface.',
  ));
  benchmarks.push(benchmark(
    'drucker-prager-material-state-plastic',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'plasticStateAccepted',
    druckerPrager.finalStep.state === 'plastic' && druckerPrager.converged ? 1 : 0,
    1,
    0,
    'Nonlinear material-point integration must report a converged plastic state and accumulated plastic strain variables.',
  ));

  const patchMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 1,
    materialId: 'soil',
  });
  const patchExx = 0.001;
  const patchEyy = -0.0002;
  const planeStrainPatch = runPlaneStrainQuad4Assembly({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: patchMesh.nodes,
    elements: patchMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
    }],
    boundaryConditions: patchMesh.nodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const, valueM: patchExx * node.xM },
      { nodeId: node.id, dof: 'uy' as const, valueM: patchEyy * node.yM },
    ]),
    policy,
  });
  const maxExxError = Math.max(...planeStrainPatch.elements.flatMap((element) =>
    element.gaussPoints.map((point) => Math.abs(point.strain[0] - patchExx)),
  ));
  const maxEyyError = Math.max(...planeStrainPatch.elements.flatMap((element) =>
    element.gaussPoints.map((point) => Math.abs(point.strain[1] - patchEyy)),
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-affine-patch-exx',
    'global-plane-strain-assembly',
    'closed-form',
    'maxExxPatchError',
    maxExxError,
    0,
    1e-12,
    'Quad4 plane-strain assembly must reproduce a prescribed affine displacement field at every Gauss point.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-affine-patch-eyy',
    'global-plane-strain-assembly',
    'closed-form',
    'maxEyyPatchError',
    maxEyyError,
    0,
    1e-12,
    'Quad4 plane-strain assembly must reproduce constant vertical strain for the affine patch fixture.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-global-equilibrium',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'reactionBalanceRatio',
    planeStrainPatch.reactionBalanceRatio,
    1,
    policy.forceBalanceTolerance,
    'Global plane-strain assembly must preserve total force equilibrium for the affine patch fixture.',
  ));
  const loadedMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 2,
    divisionsY: 1,
    materialId: 'soil',
  });
  const loadedTopNodes = loadedMesh.nodes.filter((node) => node.yM === 1);
  const loadedBottomNodes = loadedMesh.nodes.filter((node) => node.yM === 0);
  const loadedPlaneStrain = runPlaneStrainQuad4Assembly({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: loadedMesh.nodes,
    elements: loadedMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
    }],
    boundaryConditions: loadedBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: loadedTopNodes.map((node) => ({ nodeId: node.id, fyKn: -10 })),
    policy,
  });
  const loadedReactionY = loadedPlaneStrain.nodes.reduce((sum, node) => sum + node.rxnYKn, 0);
  benchmarks.push(benchmark(
    'quad4-plane-strain-loaded-reaction-balance',
    'global-plane-strain-assembly',
    'internal-balance',
    'verticalReactionSumKn',
    loadedReactionY,
    10 * loadedTopNodes.length,
    1e-6,
    'Externally loaded Quad4 plane-strain mesh must balance applied vertical nodal loads with support reactions.',
    'kN',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-loaded-free-residual',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'residualNormRatio',
    loadedPlaneStrain.residualNormRatio,
    0,
    policy.forceBalanceTolerance,
    'Externally loaded Quad4 plane-strain solve must satisfy free-DOF residual tolerance.',
  ));

  const dpElasticMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 2,
    divisionsY: 1,
    materialId: 'soil',
  });
  const dpElasticTopNodes = dpElasticMesh.nodes.filter((node) => node.yM === 1);
  const dpElasticBottomNodes = dpElasticMesh.nodes.filter((node) => node.yM === 0);
  const dpElasticModel = {
    schemaVersion: 'fem-plane-strain-model.v1' as const,
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 35,
      cohesionKpa: 10_000,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -5 })),
    policy,
  };
  const dpLinearReference = runPlaneStrainQuad4Assembly(dpElasticModel);
  const dpElastic = runPlaneStrainDruckerPragerLoadSteps(dpElasticModel);
  const maxDpElasticDisplacementDifference = Math.max(...dpLinearReference.nodes.map((node) => {
    const nonlinearNode = dpElastic.nodes.find((item) => item.id === node.id)!;
    return Math.hypot(nonlinearNode.uxM - node.uxM, nonlinearNode.uyM - node.uyM);
  }));
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-elastic-regression',
    'coupled-nonlinear-plane-strain',
    'internal-balance',
    'maxDisplacementDifferenceM',
    maxDpElasticDisplacementDifference,
    0,
    1e-9,
    'Drucker-Prager plane-strain load-step kernel must match the linear Quad4 solve when strength is not mobilized.',
    'm',
  ));

  const shearMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 1,
    materialId: 'soil',
  });
  const gammaXy = 0.02;
  const dpShearPatch = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: shearMesh.nodes,
    elements: shearMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      frictionAngleDeg: 30,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: shearMesh.nodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const, valueM: gammaXy * node.yM },
      { nodeId: node.id, dof: 'uy' as const, valueM: 0 },
    ]),
    policy,
  });
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-affine-plastic-patch',
    'coupled-nonlinear-plane-strain',
    'internal-balance',
    'maxYieldResidualRatio',
    dpShearPatch.maxYieldResidualRatio,
    0,
    policy.residualTolerance,
    'Prescribed shear patch must drive all Quad4 Gauss points to Drucker-Prager yield with residual inside policy tolerance.',
  ));

  const dpLoaded = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy,
  }, {
    loadStepFractions: [0.25, 0.5, 0.75, 1],
  });
  const plasticStrainMonotonic = dpLoaded.loadSteps.every((step, index, steps) =>
    index === 0 || step.maxEquivalentPlasticStrain >= steps[index - 1].maxEquivalentPlasticStrain,
  );
  const dpLoadedHardening = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
      hardeningModulusKpa: 5_000,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy,
  }, {
    loadStepFractions: [0.25, 0.5, 0.75, 1],
  });
  const maxHardeningStressKpa = Math.max(
    ...dpLoadedHardening.elements.flatMap((element) =>
      element.gaussPoints.map((point) => point.hardeningStressKpa)),
  );
  const perfectPlasticSettlementM = Math.max(...dpLoaded.nodes.map((node) => Math.max(0, -node.uyM)));
  const hardeningSettlementM = Math.max(...dpLoadedHardening.nodes.map((node) => Math.max(0, -node.uyM)));
  const dpUnloadReload = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy,
  }, {
    loadHistoryFactors: [0.5, 1, 0.1, 1],
  });
  const plasticStrainCarryover = dpUnloadReload.converged &&
    dpUnloadReload.loadSteps[1].maxEquivalentPlasticStrain > 0 &&
    dpUnloadReload.loadSteps[2].maxEquivalentPlasticStrain >= dpUnloadReload.loadSteps[1].maxEquivalentPlasticStrain &&
    dpUnloadReload.elements
      .flatMap((element) => element.gaussPoints)
      .some((point) => point.previousEquivalentPlasticStrain > 0);
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-global-newton-residual',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'residualNormRatio',
    dpLoaded.residualNormRatio,
    0,
    policy.forceBalanceTolerance,
    'Load-controlled mechanical nonlinear plane-strain kernel must satisfy global free-DOF residual tolerance.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-stage-state-carryover',
    'coupled-nonlinear-plane-strain',
    'internal-balance',
    'plasticStrainMonotonic',
    dpLoaded.plasticGaussPointCount > 0 && plasticStrainMonotonic && plasticStrainCarryover ? 1 : 0,
    1,
    0,
    'Staged nonlinear plane-strain load steps must retain monotonic plastic-strain evidence and committed plastic-state carryover through unload/reload histories.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-isotropic-hardening-response',
    'coupled-nonlinear-plane-strain',
    'internal-balance',
    'hardeningResponseAccepted',
    dpLoadedHardening.converged &&
      maxHardeningStressKpa > 0 &&
      dpLoadedHardening.maxEquivalentPlasticStrain < dpLoaded.maxEquivalentPlasticStrain &&
      hardeningSettlementM < perfectPlasticSettlementM
      ? 1
      : 0,
    1,
    0,
    'Plane-strain Drucker-Prager evidence must carry isotropic hardening state at Gauss points and show lower plastic strain/settlement than the perfect-plastic fixture.',
  ));

  const dpCollapse = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 1,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy,
  }, {
    loadStepFractions: [0.25, 0.5, 0.75, 1],
  });
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-collapse-detection',
    'coupled-nonlinear-plane-strain',
    'internal-balance',
    'collapseDetected',
    dpCollapse.converged ? 0 : 1,
    1,
    0,
    'Low-strength/high-load plane-strain fixture must report nonconvergence instead of a clean accepted nonlinear solve.',
  ));

  const adaptiveCutbackPolicy: FemConvergencePolicy = {
    ...policy,
    maxIterations: Math.min(policy.maxIterations, 8),
    minAcceptedSteps: 1,
  };
  const dpAdaptiveDirect = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy: adaptiveCutbackPolicy,
  }, {
    loadStepFractions: [1],
  });
  const dpAdaptiveRecovered = runPlaneStrainDruckerPragerLoadSteps({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: dpElasticMesh.nodes,
    elements: dpElasticMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      frictionAngleDeg: 32,
      cohesionKpa: 5,
      dilationAngleDeg: 0,
    }],
    boundaryConditions: dpElasticBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    nodalLoads: dpElasticTopNodes.map((node) => ({ nodeId: node.id, fyKn: -30 })),
    policy: adaptiveCutbackPolicy,
  }, {
    loadStepFractions: [1],
    adaptiveLoadStepping: {
      minLoadFactorIncrement: 1 / 64,
      maxCutbacks: 20,
    },
  });
  const adaptiveRollbackAccepted = dpAdaptiveRecovered.converged &&
    !dpAdaptiveDirect.converged &&
    dpAdaptiveRecovered.adaptiveLoadStepping.cutbackCount > 0 &&
    dpAdaptiveRecovered.adaptiveLoadStepping.attempts.some((attempt) =>
      !attempt.accepted &&
      attempt.rollbackApplied &&
      attempt.committedStateSignatureAfter === attempt.committedStateSignatureBefore) &&
    dpAdaptiveRecovered.adaptiveLoadStepping.acceptedLoadFactors.at(-1) === 1;
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-adaptive-cutback-rollback-recovery',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'adaptiveCutbackRollbackAccepted',
    adaptiveRollbackAccepted ? 1 : 0,
    1,
    0,
    'Adaptive cutback-bisection load stepping must recover a nonlinear Drucker-Prager plane-strain solve that fails as one full increment, while rejected attempts leave committed Gauss-point state unchanged.',
  ));

  const finalTimeYears = 0.197 * 25;
  const consolidationTimes = Array.from({ length: 80 }, (_, index) => finalTimeYears * ((index + 1) / 80));
  const consolidation = runTerzaghiConsolidationTimeStepper({
    layerThicknessM: 10,
    drainage: 'double',
    coefficientOfConsolidationM2PerYear: 1,
    initialExcessPorePressureKpa: 100,
    primarySettlementMm: 100,
    timeStepsYears: consolidationTimes,
    nodeCount: 81,
    policy,
  });
  benchmarks.push(benchmark(
    'terzaghi-tv-0-197-average-consolidation',
    'consolidation',
    'closed-form',
    'degreeOfConsolidation',
    consolidation.finalStep.degreeOfConsolidation,
    terzaghiAverageConsolidation(0.197),
    0.035,
    'Backward-Euler 1D consolidation checked against Terzaghi average-consolidation series at Tv=0.197.',
  ));

  const seepage = runDarcySeepage1D({
    hydraulicConductivityMPerS: 1e-5,
    domainLengthM: 20,
    upstreamHeadM: 10,
    downstreamHeadM: 6,
    nodeCount: 21,
    transient: {
      specificStorage1PerM: 1e-4,
      durationSeconds: 20_000,
      timeSteps: 40,
      initialHeadM: 6,
    },
    policy,
  });
  benchmarks.push(benchmark(
    'darcy-1d-linear-head-flow',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'steadyFlowM3PerSPerM',
    seepage.steadyFlowM3PerSPerM,
    2e-6,
    1e-10,
    'Darcy 1D closed-form q = k deltaH / L.',
    'm3/s/m',
  ));
  benchmarks.push(benchmark(
    'darcy-1d-mass-balance',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'massBalanceErrorRatio',
    seepage.massBalanceErrorRatio,
    0,
    policy.porePressureMassBalanceTolerance,
    'Steady 1D flow must conserve inflow and outflow within the pore-pressure mass-balance policy.',
  ));

  const seepage2dMesh = buildPlaneStrainRectangularMesh({
    widthM: 20,
    heightM: 5,
    divisionsX: 2,
    divisionsY: 1,
    materialId: 'soil',
  });
  const seepage2d = runPlaneStrainSteadySeepage({
    schemaVersion: 'fem-plane-strain-seepage-model.v1',
    nodes: seepage2dMesh.nodes,
    elements: seepage2dMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      hydraulicConductivityXMPerS: 1e-5,
      hydraulicConductivityYMPerS: 5e-6,
      biotCoefficient: 0.8,
    }],
    headBoundaryConditions: [
      ...seepage2dMesh.nodes
        .filter((node) => node.xM === 0)
        .map((node) => ({ nodeId: node.id, headM: 10 })),
      ...seepage2dMesh.nodes
        .filter((node) => node.xM === 20)
        .map((node) => ({ nodeId: node.id, headM: 6 })),
    ],
    policy,
  });
  const seepage2dExpectedFlow = 1e-5 * ((10 - 6) / 20) * 5;
  const seepage2dFirstGauss = seepage2d.elements[0].gaussPoints[0];
  benchmarks.push(benchmark(
    'quad4-plane-strain-seepage-linear-head-flow',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'darcyFluxX',
    seepage2dFirstGauss.darcyFluxMPerS[0],
    2e-6,
    1e-12,
    'Quad4 plane-strain steady seepage must reproduce constant Darcy flux for a linear hydraulic-head patch.',
    'm/s',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-seepage-boundary-mass-balance',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'positiveBoundaryFlux',
    seepage2d.totalPositiveBoundaryFluxM3PerS,
    seepage2dExpectedFlow,
    1e-12,
    'Quad4 plane-strain seepage boundary flux must match closed-form Darcy flow and preserve mass balance.',
    'm3/s',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-seepage-effective-stress-reduction',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'effectiveStressReduction',
    seepage2dFirstGauss.effectiveStressReductionKpa,
    seepage2dFirstGauss.porePressureKpa * 0.8,
    1e-8,
    'Pore-pressure field must be converted to effective-stress reduction metadata using the Biot coefficient.',
    'kPa',
  ));

  const biotMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 2,
    divisionsY: 2,
    materialId: 'soil',
  });
  const biotBottomNodes = biotMesh.nodes.filter((node) => node.yM === 0);
  const biotTopNodes = biotMesh.nodes.filter((node) => node.yM === 1);
  const biot = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: biotMesh.nodes,
    elements: biotMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 25_000,
      poissonRatio: 0.28,
      hydraulicConductivityXMPerS: 1e-6,
      hydraulicConductivityYMPerS: 1e-6,
      biotCoefficient: 0.8,
      specificStorage1PerM: 1e-4,
    }],
    boundaryConditions: biotBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    porePressureBoundaryConditions: [
      ...biotBottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 100 })),
      ...biotTopNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
    ],
    nodalLoads: biotTopNodes.map((node) => ({ nodeId: node.id, fyKn: -10 })),
    initialPorePressureKpa: 100,
    timeStepsSeconds: [3_600, 7_200, 14_400],
    policy,
  });
  const biotFirstGauss = biot.elements[0].gaussPoints[0];
  const biotStressSignError = Math.abs(
    (biotFirstGauss.effectiveStressKpa[1] - biotFirstGauss.totalStressKpa[1]) -
    biotFirstGauss.biotStressReductionKpa,
  );
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-dof-coupling',
    'coupled-biot-plane-strain',
    'internal-balance',
    'hasCoupledDisplacementAndPorePressureDofs',
    biot.displacementDofCount > 0 &&
      biot.porePressureDofCount > 0 &&
      biot.freeDisplacementDofCount > 0 &&
      biot.freePorePressureDofCount > 0 &&
      biot.coupledUnknownCount > biot.freeDisplacementDofCount
      ? 1
      : 0,
    1,
    0,
    'Quad4 Biot evidence kernel must assemble coupled displacement and pore-pressure unknowns in the same backward-Euler solve.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-effective-stress-coupling',
    'seepage-pore-pressure-coupling',
    'internal-balance',
    'effectiveMinusTotalStressError',
    biotStressSignError,
    0,
    1e-7,
    'Biot u-p evidence kernel must apply positive pore pressure as total-stress reduction in the tension-positive plane-strain convention.',
    'kPa',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-free-residual',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'residualNormRatio',
    biot.residualNormRatio,
    0,
    policy.forceBalanceTolerance,
    'Biot u-p evidence kernel must satisfy the coupled mechanical free-DOF residual policy.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-mass-residual',
    'coupled-biot-plane-strain',
    'internal-balance',
    'massBalanceErrorRatio',
    biot.massBalanceErrorRatio,
    0,
    policy.porePressureMassBalanceTolerance,
    'Biot u-p evidence kernel must satisfy the free pore-pressure residual policy for the backward-Euler pressure equation.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-transient-acceptance-policy',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'transientAcceptance',
    biot.transientAcceptance.accepted &&
      biot.transientAcceptance.acceptedStepCount >= policy.minAcceptedSteps &&
      biot.transientAcceptance.dissipationCheckMode === 'prescribed-gradient-relaxation' &&
      biot.transientAcceptance.maxResidualNormRatio <= policy.forceBalanceTolerance &&
      biot.transientAcceptance.maxMassBalanceErrorRatio <= policy.porePressureMassBalanceTolerance &&
      biot.transientAcceptance.maxPressureOvershootKpa === 0
      ? 1
      : 0,
    1,
    0,
    'Biot u-p evidence kernel must report an aggregate transient acceptance audit for residual, mass-balance, pressure-envelope, and prescribed-gradient relaxation checks.',
  ));

  const biotLoadGeneratedMesh = buildPlaneStrainRectangularMesh({
    widthM: 1,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 8,
    materialId: 'soil',
  });
  const biotLoadGeneratedBottomNodes = biotLoadGeneratedMesh.nodes.filter((node) => node.yM === 0);
  const biotLoadGeneratedTopNodes = biotLoadGeneratedMesh.nodes.filter((node) => node.yM === 1);
  const biotLoadGeneratedLeftNodes = biotLoadGeneratedMesh.nodes.filter((node) => node.xM === 0);
  const biotLoadGenerated = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: biotLoadGeneratedMesh.nodes,
    elements: biotLoadGeneratedMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30,
      poissonRatio: 0.2,
      hydraulicConductivityXMPerS: 9.81e-7,
      hydraulicConductivityYMPerS: 9.81e-7,
      biotCoefficient: 1,
      specificStorage1PerM: 1e-9,
    }],
    boundaryConditions: [
      ...biotLoadGeneratedBottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      ...biotLoadGeneratedLeftNodes.map((node) => ({ nodeId: node.id, dof: 'ux' as const })),
    ],
    porePressureBoundaryConditions: biotLoadGeneratedTopNodes.map((node) => ({
      nodeId: node.id,
      porePressureKpa: 0,
    })),
    nodalLoads: biotLoadGeneratedTopNodes.map((node) => ({ nodeId: node.id, fyKn: -0.5 })),
    initialPorePressureKpa: 0,
    pressureEnvelopeMode: 'load-generated-positive-pressure',
    timeStepsSeconds: [0.5, 1, 2, 4, 8, 10],
    policy,
  });
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-load-generated-pressure-acceptance',
    'coupled-biot-plane-strain',
    'internal-balance',
    'loadGeneratedPressureAccepted',
    biotLoadGenerated.transientAcceptance.accepted &&
      biotLoadGenerated.transientAcceptance.dissipationCheckMode === 'load-generated-consolidation' &&
      biotLoadGenerated.transientAcceptance.pressureEnvelopeMode === 'load-generated-positive-pressure' &&
      biotLoadGenerated.transientAcceptance.maxPressureOvershootKpa > 0 &&
      biotLoadGenerated.maxPorePressureKpa > 0 &&
      biotLoadGenerated.massBalanceErrorRatio <= policy.porePressureMassBalanceTolerance
      ? 1
      : 0,
    1,
    0,
    'Mechanically loaded Biot consolidation must require explicit load-generated pressure mode and audit positive excess pore-pressure generation without weakening the default envelope guard.',
  ));

  const openGeoSysConsolidationMesh = buildPlaneStrainRectangularMesh({
    widthM: 1,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 16,
    materialId: 'soil',
  });
  const openGeoSysConsolidationBottomNodes = openGeoSysConsolidationMesh.nodes.filter((node) => node.yM === 0);
  const openGeoSysConsolidationTopNodes = openGeoSysConsolidationMesh.nodes.filter((node) => node.yM === 1);
  const openGeoSysConsolidationLeftNodes = openGeoSysConsolidationMesh.nodes.filter((node) => node.xM === 0);
  const openGeoSysConsolidationRightNodes = openGeoSysConsolidationMesh.nodes.filter((node) => node.xM === 1);
  const openGeoSysConsolidationYoungModulusKpa = 30;
  const openGeoSysConsolidationPoissonRatio = 0.2;
  const openGeoSysConsolidationHydraulicConductivityMPerS = 9.81e-4;
  const openGeoSysConsolidationLoadKpa = 1;
  const openGeoSysConsolidationFinalTimeSeconds = 10;
  const openGeoSysConsolidationLambdaPlus2MuKpa =
    openGeoSysConsolidationYoungModulusKpa *
    (1 - openGeoSysConsolidationPoissonRatio) /
    ((1 + openGeoSysConsolidationPoissonRatio) * (1 - 2 * openGeoSysConsolidationPoissonRatio));
  const openGeoSysConsolidationDimensionlessTime =
    openGeoSysConsolidationLambdaPlus2MuKpa *
    (openGeoSysConsolidationHydraulicConductivityMPerS / 9.81) *
    openGeoSysConsolidationFinalTimeSeconds;
  const openGeoSysConsolidation = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: openGeoSysConsolidationMesh.nodes,
    elements: openGeoSysConsolidationMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: openGeoSysConsolidationYoungModulusKpa,
      poissonRatio: openGeoSysConsolidationPoissonRatio,
      hydraulicConductivityXMPerS: openGeoSysConsolidationHydraulicConductivityMPerS,
      hydraulicConductivityYMPerS: openGeoSysConsolidationHydraulicConductivityMPerS,
      biotCoefficient: 1,
      specificStorage1PerM: 1e-9,
    }],
    boundaryConditions: [
      ...openGeoSysConsolidationBottomNodes.map((node) => ({ nodeId: node.id, dof: 'uy' as const })),
      ...openGeoSysConsolidationLeftNodes.map((node) => ({ nodeId: node.id, dof: 'ux' as const })),
      ...openGeoSysConsolidationRightNodes.map((node) => ({ nodeId: node.id, dof: 'ux' as const })),
    ],
    porePressureBoundaryConditions: openGeoSysConsolidationTopNodes.map((node) => ({
      nodeId: node.id,
      porePressureKpa: 0,
    })),
    nodalLoads: openGeoSysConsolidationTopNodes.map((node) => ({
      nodeId: node.id,
      fyKn: -openGeoSysConsolidationLoadKpa / openGeoSysConsolidationTopNodes.length,
    })),
    initialPorePressureKpa: 0,
    pressureEnvelopeMode: 'load-generated-positive-pressure',
    timeStepsSeconds: Array.from({ length: 20 }, (_, index) => (index + 1) * 0.5),
    policy,
  });

  const biotPatchMesh = buildPlaneStrainRectangularMesh({
    widthM: 2,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 1,
    materialId: 'soil',
  });
  const biotPatchBottomNodes = biotPatchMesh.nodes.filter((node) => node.yM === 0);
  const biotPatchTopNodes = biotPatchMesh.nodes.filter((node) => node.yM === 1);
  const biotPressurePatch = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: biotPatchMesh.nodes,
    elements: biotPatchMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      hydraulicConductivityXMPerS: 1e-6,
      hydraulicConductivityYMPerS: 1e-6,
      biotCoefficient: 0.75,
      specificStorage1PerM: 1e-4,
    }],
    boundaryConditions: biotPatchBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    porePressureBoundaryConditions: [
      ...biotPatchBottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 100 })),
      ...biotPatchTopNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
    ],
    initialPorePressureKpa: 100,
    timeStepsSeconds: [1_000, 2_000, 3_000],
    policy,
  });
  const biotPatchGauss = biotPressurePatch.elements[0].gaussPoints[0];
  const biotPatchFluxError = Math.max(
    Math.abs(biotPatchGauss.hydraulicGradientKpaPerM[0]),
    Math.abs(biotPatchGauss.hydraulicGradientKpaPerM[1] + 100),
    Math.abs(biotPatchGauss.darcyFluxMPerS[0]),
    Math.abs(biotPatchGauss.darcyFluxMPerS[1] - (1e-6 / 9.81) * 100),
  );
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-pressure-gradient-flux-contract',
    'coupled-biot-plane-strain',
    'closed-form',
    'pressureGradientFluxError',
    biotPatchFluxError,
    0,
    1e-10,
    'Biot u-p evidence kernel must report q = -k/gamma_water * grad(p) for a prescribed linear excess-pore-pressure patch.',
  ));

  const biotAlphaZeroMaterials = [{
    id: 'soil',
    elasticModulusKpa: 25_000,
    poissonRatio: 0.28,
    hydraulicConductivityXMPerS: 1e-6,
    hydraulicConductivityYMPerS: 1e-6,
    biotCoefficient: 0,
    specificStorage1PerM: 1e-4,
  }];
  const biotAlphaZeroBoundaryConditions = biotBottomNodes.flatMap((node) => [
    { nodeId: node.id, dof: 'ux' as const },
    { nodeId: node.id, dof: 'uy' as const },
  ]);
  const biotAlphaZeroLoads = biotTopNodes.map((node) => ({ nodeId: node.id, fyKn: -10 }));
  const drainedAlphaZero = runPlaneStrainQuad4Assembly({
    schemaVersion: 'fem-plane-strain-model.v1',
    nodes: biotMesh.nodes,
    elements: biotMesh.elements,
    materials: biotAlphaZeroMaterials,
    boundaryConditions: biotAlphaZeroBoundaryConditions,
    nodalLoads: biotAlphaZeroLoads,
    policy,
  });
  const biotAlphaZero = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: biotMesh.nodes,
    elements: biotMesh.elements,
    materials: biotAlphaZeroMaterials,
    boundaryConditions: biotAlphaZeroBoundaryConditions,
    porePressureBoundaryConditions: [
      ...biotBottomNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 100 })),
      ...biotTopNodes.map((node) => ({ nodeId: node.id, porePressureKpa: 0 })),
    ],
    nodalLoads: biotAlphaZeroLoads,
    initialPorePressureKpa: 100,
    timeStepsSeconds: [3_600, 7_200, 14_400],
    policy,
  });
  const alphaZeroDisplacementError = Math.max(
    ...drainedAlphaZero.nodes.map((drainedNode) => {
      const biotNode = biotAlphaZero.nodes.find((node) => node.id === drainedNode.id)!;
      return Math.max(
        Math.abs(drainedNode.uxM - biotNode.uxM),
        Math.abs(drainedNode.uyM - biotNode.uyM),
      );
    }),
  );
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-alpha-zero-decoupling',
    'coupled-biot-plane-strain',
    'closed-form',
    'alphaZeroDisplacementError',
    alphaZeroDisplacementError,
    0,
    1e-10,
    'Biot u-p evidence kernel must reduce to the drained elastic displacement solution when alpha_B is zero.',
    'm',
  ));

  const biotTerzaghiInitialPressureKpa = 100;
  const biotTerzaghiTimeFactor = 0.197;
  const biotTerzaghiHydraulicConductivityMPerS = 1e-6;
  const biotTerzaghiSpecificStorage1PerM = 1e-4;
  const biotTerzaghiFinalTimeSeconds = biotTerzaghiTimeFactor /
    (biotTerzaghiHydraulicConductivityMPerS / biotTerzaghiSpecificStorage1PerM);
  const biotTerzaghiMesh = buildPlaneStrainRectangularMesh({
    widthM: 1,
    heightM: 1,
    divisionsX: 1,
    divisionsY: 16,
    materialId: 'soil',
  });
  const biotTerzaghiTopNodes = biotTerzaghiMesh.nodes.filter((node) => node.yM === 1);
  const biotTerzaghiBottomNodes = biotTerzaghiMesh.nodes.filter((node) => node.yM === 0);
  const biotTerzaghi = runPlaneStrainBiotConsolidation({
    schemaVersion: 'fem-plane-strain-biot-consolidation-model.v1',
    nodes: biotTerzaghiMesh.nodes,
    elements: biotTerzaghiMesh.elements,
    materials: [{
      id: 'soil',
      elasticModulusKpa: 30_000,
      poissonRatio: 0.3,
      hydraulicConductivityXMPerS: biotTerzaghiHydraulicConductivityMPerS,
      hydraulicConductivityYMPerS: biotTerzaghiHydraulicConductivityMPerS,
      biotCoefficient: 0,
      specificStorage1PerM: biotTerzaghiSpecificStorage1PerM,
    }],
    boundaryConditions: biotTerzaghiBottomNodes.flatMap((node) => [
      { nodeId: node.id, dof: 'ux' as const },
      { nodeId: node.id, dof: 'uy' as const },
    ]),
    porePressureBoundaryConditions: biotTerzaghiTopNodes.map((node) => ({
      nodeId: node.id,
      porePressureKpa: 0,
    })),
    initialPorePressureKpa: biotTerzaghiInitialPressureKpa,
    timeStepsSeconds: Array.from(
      { length: 80 },
      (_, index) => biotTerzaghiFinalTimeSeconds * ((index + 1) / 80),
    ),
    policy,
  });
  const biotTerzaghiVolumeM3 = biotTerzaghi.elements.reduce(
    (sum, element) => sum + element.areaM2 * element.thicknessM,
    0,
  );
  const biotTerzaghiAveragePressureKpa = biotTerzaghi.elements.reduce((sum, element) => {
    const pointWeight = (element.areaM2 * element.thicknessM) / element.gaussPoints.length;
    return sum + element.gaussPoints.reduce(
      (pointSum, point) => pointSum + point.porePressureKpa * pointWeight,
      0,
    );
  }, 0) / biotTerzaghiVolumeM3;
  const biotTerzaghiDegreeOfConsolidation =
    1 - (biotTerzaghiAveragePressureKpa / biotTerzaghiInitialPressureKpa);
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-terzaghi-pressure-dissipation',
    'consolidation',
    'closed-form',
    'degreeOfConsolidation',
    biotTerzaghiDegreeOfConsolidation,
    terzaghiAverageConsolidation(biotTerzaghiTimeFactor),
    0.005,
    'Alpha-zero Quad4 Biot pressure diffusion must match Terzaghi average consolidation at Tv = 0.197 for a top-drained column.',
  ));
  benchmarks.push(benchmark(
    'quad4-plane-strain-biot-u-p-drained-dissipation-acceptance',
    'solver-convergence-and-tolerance',
    'internal-balance',
    'drainedDissipationAccepted',
    biotTerzaghi.transientAcceptance.accepted &&
      biotTerzaghi.transientAcceptance.dissipationCheckMode === 'drained-dissipation' &&
      biotTerzaghi.transientAcceptance.monotonicAverageFreePressureDissipationRequired &&
      biotTerzaghi.transientAcceptance.monotonicAverageFreePressureDissipation &&
      biotTerzaghi.transientAcceptance.monotonicMaxPressureEnvelope
      ? 1
      : 0,
    1,
    0,
    'Top-drained alpha-zero Biot Terzaghi fixture must pass the stricter drained-dissipation transient acceptance gate.',
  ));

  const biotPressureReplay = runPlaneStrainDruckerPragerBiotPressureReplay({
    mechanicalModel: {
      schemaVersion: 'fem-plane-strain-model.v1',
      nodes: biotTerzaghiMesh.nodes,
      elements: biotTerzaghiMesh.elements,
      materials: [{
        id: 'soil',
        elasticModulusKpa: 30_000,
        poissonRatio: 0.3,
        frictionAngleDeg: 35,
        cohesionKpa: 10_000,
        dilationAngleDeg: 0,
        biotCoefficient: 0.8,
      }],
      boundaryConditions: biotTerzaghiBottomNodes.flatMap((node) => [
        { nodeId: node.id, dof: 'ux' as const },
        { nodeId: node.id, dof: 'uy' as const },
      ]),
      policy,
    },
    biotResult: biotTerzaghi,
    solverOptions: { loadStepFractions: [1] },
  });
  benchmarks.push(benchmark(
    'quad4-plane-strain-dp-sequential-biot-pressure-replay-audit',
    'seepage-pore-pressure-coupling',
    'internal-balance',
    'sequentialPressureReplayAccepted',
    biotPressureReplay.converged &&
      biotPressureReplay.pressureReplayAudit.mode === 'sequential-one-way-biot-pressure-replay' &&
      biotPressureReplay.pressureReplayAudit.sourceTransientAccepted &&
      biotPressureReplay.hydroMechanicalCoupling?.porePressureDofCount === 0 &&
      biotPressureReplay.hydroMechanicalCoupling.maxAbsAppliedEffectiveStressReductionKpa > 0
      ? 1
      : 0,
    1,
    0,
    'Sequential pressure replay must feed an accepted linear Biot u-p pressure frame into the Drucker-Prager effective-stress residual while auditing that no pore-pressure DOFs or monolithic Biot-plastic tangent are assembled.',
  ));

  const coupling = runHydroMechanicalCoupling1D({
    totalVerticalStressKpa: 200,
    porePressureBeforeKpa: 80,
    porePressureAfterKpa: 40,
    constrainedModulusKpa: 10_000,
    layerThicknessM: 5,
    policy,
  });
  benchmarks.push(benchmark(
    'effective-stress-settlement-coupling',
    'seepage-pore-pressure-coupling',
    'closed-form',
    'settlementMm',
    coupling.settlementMm,
    20,
    1e-6,
    '1D hydro-mechanical coupling checked by delta sigma prime times H over constrained modulus.',
    'mm',
  ));

  const support = runExcavationSupportDesignCheck({
    excavationDepthM: 8,
    wallToeDepthM: 14,
    unitWeightKnM3: 18,
    frictionAngleDeg: 30,
    cohesionKpa: 45,
    surchargeKpa: 10,
    waterTableDepthM: 99,
    stageDepthsM: [3, 6, 8],
    supportLevelsM: [1, 4],
    allowableSupportLoadKnPerM: 300,
    requiredPassiveSafetyFactor: 1.5,
    requiredBasalHeaveSafetyFactor: 1.5,
    policy,
  });
  benchmarks.push(benchmark(
    'excavation-support-capacity-screening',
    'support-design',
    'internal-balance',
    'supportStatusAccepted',
    support.status === 'accepted' ? 1 : 0,
    1,
    0,
    'Support screening must pass support capacity, passive toe resistance, and basal-heave checks for the controlled fixture.',
  ));
  benchmarks.push(benchmark(
    'excavation-support-staged-reaction-sequence',
    'support-design',
    'internal-balance',
    'stageSupportChecksAccepted',
    support.stageChecks.every((check) => check.status === 'accepted') &&
      support.acceptanceBlockers.length === 0 &&
      support.productionBlockers.includes('jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented')
      ? 1
      : 0,
    1,
    0,
    'Support screening must tie support reaction demand to staged excavation depths while preserving jurisdiction-specific structural design as a production blocker.',
  ));
  const supportMember = runFemSupportMemberDesignCheck({
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
      id: 'support-strut-fixture',
      kind: 'strut',
      label: 'Benchmark excavation strut fixture',
      sectionLabel: 'Reviewed circular hollow strut proxy',
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
        source: 'support-reaction-screening',
        loadCombination: 'temporary-support-envelope',
        description: 'Fixture support reaction demand from deterministic excavation screening envelope.',
        caseId: 'support-fixture',
        stageId: 'stage-2',
        resultHashSha256: 'd'.repeat(64),
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
        name: 'Licensed Reviewer',
        licenseId: 'PE-12345',
        jurisdiction: 'US-CA',
      },
      reviewedAt: '2026-06-04T00:00:00.000Z',
      assumptions: [
        {
          id: 'support-effective-length',
          parameter: 'effective length factor',
          value: 1,
          unit: 'ratio',
          basis: 'Pinned temporary works end-restraint assumption for deterministic benchmark fixture.',
          confidence: 'review',
          reviewRequired: true,
        },
        {
          id: 'support-demand-source',
          parameter: 'support demand source',
          value: 'support-reaction-screening',
          basis: 'Demand is supplied explicitly from a reviewed support reaction screening envelope.',
          confidence: 'review',
          reviewRequired: true,
        },
      ],
      limitations: ['Connection, local buckling, and jurisdiction-specific code checks remain outside this benchmark fixture.'],
    },
    policy,
  });
  benchmarks.push(benchmark(
    'support-member-yield-buckling-interaction',
    'support-design',
    'internal-balance',
    'supportMemberAccepted',
    supportMember.status === 'accepted' &&
      supportMember.productionClaim === false &&
      supportMember.limitStates.every((limitState) => limitState.status === 'accepted') &&
      supportMember.controllingLimitState.id === 'combined-axial-flexure' &&
      supportMember.review.reviewer.licenseId.length > 0
      ? 1
      : 0,
    1,
    0,
    'Support member fixture must pass deterministic axial yield, Euler buckling, flexural yield, slenderness, and combined utilization checks with reviewer metadata.',
  ));

  const reviewerValidation = validateFemReviewerApprovalRecord({
    schemaVersion: 'fem-reviewer-approval.v1',
    recordId: 'review-fem-001',
    caseId: 'fixture-case',
    caseHashSha256: 'a'.repeat(64),
    validationSummary: {
      status: 'review',
      blockers: 0,
      reviewItems: 2,
      findingCodes: ['experimental-only', 'not-design-calculation'],
    },
    reviewer: {
      name: 'Licensed Reviewer',
      licenseId: 'PE-12345',
      jurisdiction: 'US-CA',
    },
    approvedAt: '2025-01-15T00:00:00.000Z',
    scope: 'experimental-preview',
    assumptions: ['Fixture assumptions reviewed.'],
    limitations: ['Not a production FEM design calculation.'],
    approvalStatement: 'Reviewed and accepted for experimental preview execution.',
  });
  benchmarks.push(benchmark(
    'reviewer-approval-record-contract',
    'licensed-engineer-review-workflow',
    'review-record-contract',
    'reviewRecordAccepted',
    reviewerValidation.status === 'accepted' ? 1 : 0,
    1,
    0,
    'Reviewer approval record contract requires identity, license, jurisdiction, assumptions, limitations, scope, and approval text.',
  ));

  const verifiedFeatures = [...new Set(
    benchmarks
      .filter((item) => item.status === 'accepted')
      .map((item) => item.feature),
  )];
  const status = benchmarks.every((item) => item.status === 'accepted') ? 'kernel-verified' : 'blocked';
  const externalBenchmarkAcceptance = buildFemExternalBenchmarkAcceptanceContract({
    comparisonResults: buildDefaultExternalBenchmarkComparisonResults({
      consolidation,
      biotTerzaghi,
      biotTerzaghiInitialPressureKpa,
      biotTerzaghiHydraulicConductivityMPerS,
      biotTerzaghiSpecificStorage1PerM,
      openGeoSysConsolidation,
      openGeoSysConsolidationDimensionlessTime,
      openGeoSysConsolidationLoadKpa,
    }),
  });

  return {
    schemaVersion: 'fem-engineering-evidence.v1',
    status,
    productionReady: false,
    verifiedFeatures,
    benchmarks,
    externalBenchmarkAcceptance,
    convergencePolicy: policy,
    remainingProductionBlockers: [
      'production-sparse-fem-solver-and-2d-3d-result-route-not-integrated-with-these-kernels',
      'nonlinear-plane-strain-plasticity-is-benchmark-scale-without-consistent-tangent-hardening-calibration-or-cross-solver-validation',
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
      'support-design-is-screening-level-and-not-jurisdiction-specific-structural-design',
      'published-commercial-cross-solver-benchmark-corpus-not-approved',
      ...externalBenchmarkAcceptance.blockerCodes,
      'production-design-approval-scope-fails-closed-until-production-acceptance',
    ],
    releasePositioning:
      'These kernels provide deterministic engineering evidence for strong-beta gating. They do not make geotechCLI a production nonlinear FEM solver until solver integration, external benchmarks, and enforced approval workflows are complete.',
  };
}

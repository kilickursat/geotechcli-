import { listFemCapabilities, type FemRouteObjective } from './routing.js';
import {
  runFemEngineeringEvidenceSuite,
  type FemEngineeringEvidenceReport,
} from './engineering-evidence.js';

export type FemProductionFeature =
  | 'nonlinear-plasticity'
  | 'consolidation'
  | 'seepage-pore-pressure-coupling'
  | 'advanced-staged-construction'
  | 'support-design'
  | 'real-project-workspace-to-run-acceptance'
  | 'independent-benchmark-validation'
  | 'licensed-engineer-review-workflow';

export interface FemProductionFeatureRequirement {
  feature: FemProductionFeature;
  status: 'missing' | 'preview-only' | 'kernel-verified' | 'accepted';
  currentCoverage: string;
  requiredForAcceptance: string[];
  blockedUntil: string[];
}

export interface FemProductionReadinessReport {
  schemaVersion: 'fem-production-readiness.v1';
  productionReady: false;
  status: 'blocked';
  objective?: FemRouteObjective;
  requestedFeatures: FemProductionFeature[];
  currentMode: 'experimental-preview' | 'contract-only' | 'mixed';
  supportedPreviewRoutes: Array<{
    objective: FemRouteObjective;
    deterministicBackend: string | null;
    executionMode: string;
    draftCommandTemplate?: string;
    demoCommand?: string;
    runCommandTemplate?: string;
  }>;
  blockedFeatures: FemProductionFeatureRequirement[];
  engineeringEvidence: FemEngineeringEvidenceReport;
  blockers: string[];
  safeUserActions: string[];
  releasePositioning: string;
}

const ALL_PRODUCTION_FEATURES: FemProductionFeature[] = [
  'nonlinear-plasticity',
  'consolidation',
  'seepage-pore-pressure-coupling',
  'advanced-staged-construction',
  'support-design',
  'real-project-workspace-to-run-acceptance',
  'independent-benchmark-validation',
  'licensed-engineer-review-workflow',
];

const FEATURE_REQUIREMENTS: Record<FemProductionFeature, Omit<FemProductionFeatureRequirement, 'feature'>> = {
  'nonlinear-plasticity': {
    status: 'kernel-verified',
    currentCoverage: 'Deterministic nonlinear material-point coverage now includes a Mohr-Coulomb triaxial strength cap plus a Drucker-Prager/Mohr-Coulomb-compatible principal-stress return-mapping kernel with yield residual and plastic strain state checks. A benchmark-scale mechanical-only Quad4 plane-strain Drucker-Prager evidence kernel now couples committed Gauss-point return mapping and plastic state carryover to global residual/reaction checks, and it can use audited adaptive cutback-bisection load stepping with rollback evidence for rejected increments. It is still not a production sparse solver route and has no Biot pore-pressure DOF, consistent tangent approval, staged activation, or project result manifest.',
    requiredForAcceptance: [
      'constitutive models accepted for geotechnical use, such as Mohr-Coulomb/Hardening Soil or equivalent',
      'stress-path, yield, plastic strain, and convergence validation fixtures',
      'independent benchmark comparison against published or commercial-solver reference cases',
    ],
    blockedUntil: [
      'production-nonlinear-global-fem-solver-route-and-consistent-tangent-not-approved',
      'plasticity-benchmark-suite-approved-against-published-or-commercial-references',
      'solver-convergence-audit-passed',
    ],
  },
  consolidation: {
    status: 'kernel-verified',
    currentCoverage: 'A deterministic 1D Terzaghi backward-Euler consolidation kernel is benchmarked against analytical average consolidation and exposed through a human-reviewed staged-settlement/consolidation preview route. A nonlinear 1D column backend solves staged vertical equilibrium with Drucker-Prager material-point return mapping. A benchmark-scale 2D Quad4 Biot u-p backward-Euler evidence kernel now assembles displacement and pore-pressure DOFs with explicit pressure/stress/flux convention metadata, aggregate transient acceptance audits, and an alpha-zero Terzaghi pressure-dissipation check, and a reviewed experimental seepage/groundwater route can emit a result manifest. It is still not a production sparse solver or nonlinear staged-construction backend.',
    requiredForAcceptance: [
      'time-stepping consolidation backend with drainage boundary controls',
      'Cv, mv/Cc, drainage path, stage duration, and monitoring calibration schema',
      'settlement-time benchmark fixtures and tolerance envelopes',
    ],
    blockedUntil: [
      '2d-3d-coupled-consolidation-fem-backend-implemented',
      'drainage-boundary-validation-approved-against-project-conditions',
      'settlement-time-benchmark-suite-approved-against-published-or-commercial-references',
    ],
  },
  'seepage-pore-pressure-coupling': {
    status: 'kernel-verified',
    currentCoverage: 'Deterministic 1D Darcy seepage and effective-stress coupling kernels are benchmarked against closed-form flow and settlement checks. Benchmark-scale Quad4 evidence kernels now solve steady seepage head/flux/effective-stress metadata and a linear-elastic Biot u-p backward-Euler fixture with displacement and pore-pressure DOFs, pressure-gradient Darcy flux checks, aggregate transient acceptance audits, alpha-zero decoupling, Terzaghi pressure-dissipation evidence, and explicit excess-pore-pressure sign/unit metadata. A sequential one-way replay wrapper can feed an accepted final Biot pressure frame into the benchmark-scale Drucker-Prager effective-stress residual with an audit that no pore-pressure DOFs or monolithic Biot-plastic tangent are assembled. A human-reviewed experimental seepage/groundwater route now writes Biot u-p result manifests with pressure-audit metadata; production sparse solving, nonlinear plasticity coupling, dewatering/uplift design checks, and independent cross-solver validation are still not approved.',
    requiredForAcceptance: [
      'steady/transient seepage solver with hydraulic boundary conditions',
      'pore-pressure coupling into effective stress/deformation calculations',
      'uplift, gradient, and dewatering acceptance checks',
    ],
    blockedUntil: [
      'biot-u-p-route-backed-preview-is-not-production-sparse-solver',
      'seepage-route-needs-independent-benchmark-and-design-check-acceptance',
      'hydro-mechanical-coupling-accepted-for-2d-3d-fem',
      'pore-pressure-benchmark-suite-approved-against-published-or-commercial-references',
    ],
  },
  'advanced-staged-construction': {
    status: 'preview-only',
    currentCoverage: 'Excavation and staged-consolidation previews include deterministic stage visualization and load histories; staged consolidation can also run a nonlinear 1D column backend. The benchmark-scale plane-strain Drucker-Prager kernel now supports committed material-state carryover through load histories, but production construction sequencing, activation/deactivation, and 2D/3D staged path-dependence remain unavailable.',
    requiredForAcceptance: [
      'construction-stage activation/deactivation model with support installation/removal',
      'stage-specific boundary, load, groundwater, and material state transitions',
      'path-dependent validation fixtures for excavation and embankment cases',
    ],
    blockedUntil: [
      'stage-activation-backend-implemented',
      'support-installation-sequence-validator-approved',
      'path-dependent-stage-benchmark-suite-approved',
    ],
  },
  'support-design': {
    status: 'kernel-verified',
    currentCoverage: 'A deterministic Rankine support-screening kernel checks support capacity, passive toe resistance, basal heave, and staged support reaction demand for controlled excavation-stage fixtures. A closed-form support member check now evaluates explicit strut/brace axial, flexural, Euler buckling, slenderness, combined utilization, demand provenance, and reviewer metadata. The excavation preview route exposes support reaction metadata for review, but this remains screening/member evidence only and is not a jurisdiction-specific wall/strut/anchor structural design engine.',
    requiredForAcceptance: [
      'wall/strut/anchor structural design checks with explicit standards assumptions',
      'basal heave, kick-out, surcharge, and toe embedment verification',
      'support reaction benchmark and safety-factor audit fixtures',
    ],
    blockedUntil: [
      'support-design-engine-coupled-to-staged-excavation-route',
      'jurisdiction-specific-wall-strut-anchor-structural-design-not-implemented',
      'basal-heave-and-toe-checks-approved-for-project-standards',
      'support-design-benchmark-suite-approved-against-published-or-commercial-references',
    ],
  },
  'real-project-workspace-to-run-acceptance': {
    status: 'preview-only',
    currentCoverage: 'Workspace evidence can prefill material, groundwater, and traceability, but geometry, loads, staging, and approval remain explicit review gates.',
    requiredForAcceptance: [
      'evidence-bound workspace candidate with no missing user inputs',
      'reviewed analysis case with validation blockers equal to zero',
      'human-reviewed run command using --experimental --reviewed until a production solver exists',
    ],
    blockedUntil: [
      'workspace-to-run-acceptance-validator-enforced',
      'case-output-evidence-traceability-approved',
      'human-review-record-persisted',
    ],
  },
  'independent-benchmark-validation': {
    status: 'preview-only',
    currentCoverage: 'Current fixtures verify deterministic preview envelopes, monotonic trends, material-point closed forms, Quad4 linear patch/global-equilibrium fixtures, benchmark-scale mechanical-only Drucker-Prager plane-strain evidence cases including adaptive cutback rollback recovery, Quad4 steady-seepage mass-balance/effective-stress metadata, benchmark-scale Quad4 Biot u-p coupled residual, transient acceptance, pressure-gradient flux, alpha-zero decoupling, Terzaghi pressure-dissipation fixtures, and sequential one-way Biot-pressure replay into the Drucker-Prager effective-stress residual. The external benchmark gate now registers source references for Terzaghi consolidation, Biot consolidation theory, OpenSees Drucker-Prager material behavior, and OpenGeoSys hydro-mechanics/Richards-flow benchmark classes plus generated published-source comparison records for Terzaghi consolidation and alpha-zero Biot pressure dissipation, but production equivalence still lacks commercial solver comparisons and accepted published/commercial coverage for every required quantity.',
    requiredForAcceptance: [
      'published analytical and numerical benchmark corpus by route',
      'tolerance envelopes for displacement, pore pressure, reaction, and settlement-time curves',
      'cross-solver comparison records and regression thresholds',
    ],
    blockedUntil: [
      'published-benchmark-corpus-approved',
      'cross-solver-comparison-suite-approved',
      'production-tolerance-policy-approved',
    ],
  },
  'licensed-engineer-review-workflow': {
    status: 'kernel-verified',
    currentCoverage: 'A reviewer approval-record contract validates identity, license, jurisdiction, case hash, validation summary, assumptions, limitations, experimental-preview scope, and approval text. Production-design approval scope fails closed in strong beta. CLI preview runs still accept --reviewed without enforcing persisted approval metadata on every run.',
    requiredForAcceptance: [
      'reviewer identity and approval metadata captured for production runs',
      'assumption, limitation, and change-control audit trail',
      'jurisdiction/standard-specific sign-off workflow',
    ],
    blockedUntil: [
      'production-design-approval-scope-fails-closed-until-production-acceptance',
      'reviewer-approval-record-enforced-by-cli-run',
      'assumption-change-control-audit-approved',
      'jurisdiction-signoff-workflow-approved',
    ],
  },
};

export function assessFemProductionReadiness(options: {
  objective?: FemRouteObjective;
  requestedFeatures?: readonly FemProductionFeature[];
} = {}): FemProductionReadinessReport {
  const requestedFeatures = options.requestedFeatures && options.requestedFeatures.length > 0
    ? [...new Set(options.requestedFeatures)]
    : ALL_PRODUCTION_FEATURES;
  const capabilities = listFemCapabilities(options.objective);
  const supportedPreviewRoutes = capabilities
    .filter((capability) => capability.executionMode === 'human-reviewed-preview')
    .map((capability) => ({
      objective: capability.objective,
      deterministicBackend: capability.deterministicBackend,
      executionMode: capability.executionMode,
      ...(capability.draftCommandTemplate ? { draftCommandTemplate: capability.draftCommandTemplate } : {}),
      ...(capability.demoCommand ? { demoCommand: capability.demoCommand } : {}),
      ...(capability.runCommandTemplate ? { runCommandTemplate: capability.runCommandTemplate } : {}),
    }));
  const hasPreview = capabilities.some((capability) => capability.executionMode === 'human-reviewed-preview');
  const hasContractOnly = capabilities.some((capability) => capability.executionMode === 'contract-only');
  const currentMode = hasPreview && hasContractOnly
    ? 'mixed'
    : hasPreview
      ? 'experimental-preview'
      : 'contract-only';
  const blockedFeatures = requestedFeatures.map((feature) => ({
    feature,
    ...FEATURE_REQUIREMENTS[feature],
  }));
  const engineeringEvidence = runFemEngineeringEvidenceSuite();
  const externalBenchmarkBlockers = engineeringEvidence.externalBenchmarkAcceptance.productionReadinessBlocked
    ? engineeringEvidence.externalBenchmarkAcceptance.blockerCodes
    : [];

  return {
    schemaVersion: 'fem-production-readiness.v1',
    productionReady: false,
    status: 'blocked',
    ...(options.objective ? { objective: options.objective } : {}),
    requestedFeatures,
    currentMode,
    supportedPreviewRoutes,
    blockedFeatures,
    engineeringEvidence,
    blockers: [...new Set([
      ...blockedFeatures.flatMap((feature) => feature.blockedUntil),
      ...engineeringEvidence.remainingProductionBlockers,
      ...externalBenchmarkBlockers,
    ])],
    safeUserActions: [
      'Use implemented routes only as experimental, human-reviewed previews.',
      'Use FEM engineering evidence kernels for deterministic acceptance-gate checks only; they are not standalone production FEM result manifests.',
      ...supportedPreviewRoutes.flatMap((route) => [
        ...(route.draftCommandTemplate ? [`Draft command template: ${route.draftCommandTemplate}`] : []),
        ...(route.demoCommand ? [`Built-in demo command: ${route.demoCommand}`] : []),
        ...(route.runCommandTemplate ? [`Reviewed run command template: ${route.runCommandTemplate}`] : []),
      ]),
      'Keep full nonlinear/plasticity, consolidation, seepage, support design, and production acceptance requests in blocked planning state until preview routes are independently benchmarked and approved for design use.',
    ],
    releasePositioning:
      'geotechCLI strong-beta must describe FEM as deterministic experimental previews plus verified engineering evidence kernels and contract-only planning for advanced routes; it is not a full production-grade nonlinear geotechnical FEM solver yet.',
  };
}

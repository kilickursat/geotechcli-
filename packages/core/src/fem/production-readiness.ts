import { listFemCapabilities, type FemRouteObjective } from './routing.js';

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
  status: 'missing' | 'preview-only' | 'accepted';
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
    status: 'missing',
    currentCoverage: 'Current FEM preview materials are linear elastic only.',
    requiredForAcceptance: [
      'constitutive models accepted for geotechnical use, such as Mohr-Coulomb/Hardening Soil or equivalent',
      'stress-path, yield, plastic strain, and convergence validation fixtures',
      'independent benchmark comparison against published or commercial-solver reference cases',
    ],
    blockedUntil: [
      'nonlinear-constitutive-backend-implemented',
      'plasticity-benchmark-suite-approved',
      'solver-convergence-audit-passed',
    ],
  },
  consolidation: {
    status: 'missing',
    currentCoverage: 'Current previews do not solve time-dependent consolidation, drainage, or creep.',
    requiredForAcceptance: [
      'time-stepping consolidation backend with drainage boundary controls',
      'Cv, mv/Cc, drainage path, stage duration, and monitoring calibration schema',
      'settlement-time benchmark fixtures and tolerance envelopes',
    ],
    blockedUntil: [
      'consolidation-time-stepping-backend-implemented',
      'drainage-boundary-validation-approved',
      'settlement-time-benchmark-suite-approved',
    ],
  },
  'seepage-pore-pressure-coupling': {
    status: 'missing',
    currentCoverage: 'Current previews record groundwater assumptions but do not solve pore pressure, seepage, uplift, or coupling.',
    requiredForAcceptance: [
      'steady/transient seepage solver with hydraulic boundary conditions',
      'pore-pressure coupling into effective stress/deformation calculations',
      'uplift, gradient, and dewatering acceptance checks',
    ],
    blockedUntil: [
      'seepage-solver-implemented',
      'hydro-mechanical-coupling-accepted',
      'pore-pressure-benchmark-suite-approved',
    ],
  },
  'advanced-staged-construction': {
    status: 'preview-only',
    currentCoverage: 'Excavation preview includes deterministic stage visualization and proxies, but not production construction sequencing or nonlinear path-dependence.',
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
    status: 'missing',
    currentCoverage: 'Current excavation preview reports support reaction proxies only; it does not design struts, anchors, walls, or basal-heave resistance.',
    requiredForAcceptance: [
      'wall/strut/anchor structural design checks with explicit standards assumptions',
      'basal heave, kick-out, surcharge, and toe embedment verification',
      'support reaction benchmark and safety-factor audit fixtures',
    ],
    blockedUntil: [
      'support-design-engine-implemented',
      'basal-heave-and-toe-checks-approved',
      'support-design-benchmark-suite-approved',
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
    currentCoverage: 'Current fixtures verify deterministic preview envelopes and monotonic trends, not full production benchmark equivalence.',
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
    status: 'preview-only',
    currentCoverage: 'Current CLI requires --reviewed, but does not persist a named reviewer, license, design responsibility, or approval record.',
    requiredForAcceptance: [
      'reviewer identity and approval metadata captured for production runs',
      'assumption, limitation, and change-control audit trail',
      'jurisdiction/standard-specific sign-off workflow',
    ],
    blockedUntil: [
      'reviewer-approval-record-implemented',
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

  return {
    schemaVersion: 'fem-production-readiness.v1',
    productionReady: false,
    status: 'blocked',
    ...(options.objective ? { objective: options.objective } : {}),
    requestedFeatures,
    currentMode,
    supportedPreviewRoutes,
    blockedFeatures,
    blockers: [...new Set(blockedFeatures.flatMap((feature) => feature.blockedUntil))],
    safeUserActions: [
      'Use implemented routes only as experimental, human-reviewed previews.',
      ...supportedPreviewRoutes.flatMap((route) => [
        ...(route.draftCommandTemplate ? [`Draft command template: ${route.draftCommandTemplate}`] : []),
        ...(route.demoCommand ? [`Built-in demo command: ${route.demoCommand}`] : []),
        ...(route.runCommandTemplate ? [`Reviewed run command template: ${route.runCommandTemplate}`] : []),
      ]),
      'Keep nonlinear/plasticity, consolidation, seepage, support design, and production acceptance requests in blocked planning state until the required solver and benchmark gates are implemented.',
    ],
    releasePositioning:
      'geotechCLI strong-beta must describe FEM as deterministic experimental previews plus contract-only planning for advanced routes; it is not a full production-grade nonlinear geotechnical FEM solver yet.',
  };
}

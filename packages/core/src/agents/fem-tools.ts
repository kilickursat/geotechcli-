import {
  assessFemProductionReadiness,
  listFemCapabilities,
  prepareFemAnalysisCaseDraft,
  validateFemAnalysisCase,
  type FemAnalysisCaseDraft,
  type FemProductionFeature,
  type FemValidationSummary,
  type FemRouteObjective,
} from '../fem/index.js';
import { toolRegistry } from './tools.js';

function normalizeObjective(value: unknown): FemRouteObjective | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  switch (normalized) {
    case 'foundation-settlement':
    case 'raft-settlement':
    case 'settlement':
      return 'foundation-settlement';
    case 'excavation-deformation':
    case 'excavation':
    case 'retaining-excavation':
      return 'excavation-deformation';
    case 'shaft-deformation':
    case 'shaft':
    case 'pit-deformation':
      return 'shaft-deformation';
    case 'tunnel-volume-loss-settlement':
    case 'tunnel-settlement':
    case 'volume-loss-settlement':
      return 'tunnel-volume-loss-settlement';
    case 'pile-group-elastic-interaction':
    case 'pile-group':
    case 'pile-interaction':
      return 'pile-group-elastic-interaction';
    case 'slope-embankment-deformation':
    case 'slope-embankment':
    case 'embankment-deformation':
    case 'slope-deformation':
    case 'embankment':
      return 'slope-embankment-deformation';
    case 'retaining-wall-excavation-support':
    case 'retaining-wall':
    case 'excavation-support':
    case 'wall-support':
      return 'retaining-wall-excavation-support';
    case 'seepage-groundwater-coupling':
    case 'seepage':
    case 'groundwater-coupling':
    case 'groundwater-sensitive':
      return 'seepage-groundwater-coupling';
    case 'staged-settlement-consolidation':
    case 'staged-settlement':
    case 'consolidation':
    case 'settlement-consolidation':
      return 'staged-settlement-consolidation';
    default:
      return undefined;
  }
}

function summarizeFemDraftForAgent(draft: FemAnalysisCaseDraft): string {
  return [
    `FEM objective: ${draft.objective}`,
    `implemented: ${draft.implemented ? 'yes' : 'no'}`,
    `execution mode: ${draft.capability.executionMode}`,
    `agent run allowed: ${draft.capability.agentRunAllowed ? 'yes' : 'no'}`,
    `recommended action: ${draft.recommendedAction}`,
    `canAutoProceed: ${draft.canAutoProceed ? 'yes' : 'no'}`,
    `missing inputs: ${draft.missingUserInputs.join(', ') || 'none'}`,
    `review gates: ${draft.reviewGates.join(', ') || 'none'}`,
    draft.analysisCase ? `analysisCase.caseId: ${draft.analysisCase.caseId}` : 'analysisCase: not prepared',
    draft.validation ? `validation: ${draft.validation.status} (${draft.validation.blockers} blockers, ${draft.validation.reviewItems} review)` : 'validation: not run',
    draft.recommendedCommand ? `recommended command: ${draft.recommendedCommand}` : '',
  ].filter(Boolean).join('\n');
}

function summarizeFemValidationForAgent(validation: FemValidationSummary): string {
  return [
    `FEM validation: ${validation.status}`,
    `blockers: ${validation.blockers}`,
    `review items: ${validation.reviewItems}`,
    `finding codes: ${validation.findings.map((finding) => finding.code).join(', ') || 'none'}`,
  ].join('\n');
}

function normalizeProductionFeature(value: unknown): FemProductionFeature | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  switch (normalized) {
    case 'nonlinear':
    case 'nonlinear-plasticity':
    case 'plasticity':
      return 'nonlinear-plasticity';
    case 'consolidation':
    case 'time-dependent-settlement':
      return 'consolidation';
    case 'seepage':
    case 'pore-pressure':
    case 'pore-pressure-coupling':
    case 'seepage-pore-pressure-coupling':
    case 'groundwater-coupling':
    case 'biot':
    case 'biot-coupling':
    case 'biot-u-p':
    case 'biot-u-p-coupling':
    case 'u-p-coupling':
    case 'up-coupling':
      return 'seepage-pore-pressure-coupling';
    case 'advanced-staging':
    case 'advanced-staged-construction':
    case 'staged-construction':
      return 'advanced-staged-construction';
    case 'support':
    case 'support-design':
    case 'wall-design':
    case 'anchor-design':
      return 'support-design';
    case 'workspace':
    case 'workspace-to-run':
    case 'real-project-workspace-to-run-acceptance':
      return 'real-project-workspace-to-run-acceptance';
    case 'benchmark':
    case 'independent-benchmark-validation':
      return 'independent-benchmark-validation';
    case 'review':
    case 'licensed-engineer-review':
    case 'licensed-engineer-review-workflow':
      return 'licensed-engineer-review-workflow';
    default:
      return undefined;
  }
}

toolRegistry.register(
  {
    name: 'list_fem_capabilities',
    description:
      'List experimental FEM analysis routes known to geotechCLI. Use this before asking an LLM to plan FEM work. It reports which routes are implemented demos, contract drafts, or planned, with required evidence, user inputs, visualization fields, review gates, and limitations.',
    parameters: {
      type: 'object',
      properties: {
        objective: {
          type: 'string',
          enum: [
            'foundation-settlement',
            'excavation-deformation',
            'shaft-deformation',
            'tunnel-volume-loss-settlement',
            'pile-group-elastic-interaction',
            'slope-embankment-deformation',
            'retaining-wall-excavation-support',
            'seepage-groundwater-coupling',
            'staged-settlement-consolidation',
          ],
          description: 'Optional FEM objective filter.',
        },
      },
    },
  },
  (args) => {
    const objective = normalizeObjective(args.objective);
    const capabilities = listFemCapabilities(objective);
    return {
      success: true,
      data: {
        schemaVersion: 'fem-capability-list.v1',
        capabilities,
        operatingRule: 'LLMs may plan and review FEM routes, but FEM math must come from geotechCLI deterministic contracts, validators, and approved solvers. Agent tool calls cannot run FEM; only a human-reviewed CLI run with --experimental --reviewed can execute implemented preview routes.',
      },
      summary: `FEM capabilities: ${capabilities.map((item) => `${item.objective} (${item.status})`).join(', ') || 'none'}.`,
    };
  },
);

toolRegistry.register(
  {
    name: 'assess_fem_production_readiness',
    description:
      'Assess whether geotechCLI FEM is ready for production-grade engineering use. Use for nonlinear/plasticity, consolidation, seepage/pore-pressure coupling, support design, advanced staging, real project workspace-to-run, benchmark, or production-readiness requests. This reports deterministic blockers and safe actions; it never runs FEM.',
    parameters: {
      type: 'object',
      properties: {
        objective: {
          type: 'string',
          enum: [
            'foundation-settlement',
            'excavation-deformation',
            'shaft-deformation',
            'tunnel-volume-loss-settlement',
            'pile-group-elastic-interaction',
            'slope-embankment-deformation',
            'retaining-wall-excavation-support',
            'seepage-groundwater-coupling',
            'staged-settlement-consolidation',
          ],
          description: 'Optional FEM objective to scope the production readiness report.',
        },
        requestedFeatures: {
          type: 'array',
          description: 'Optional production features to assess, such as nonlinear-plasticity, consolidation, seepage-pore-pressure-coupling, support-design, real-project-workspace-to-run-acceptance.',
          items: { type: 'string' },
        },
      },
    },
  },
  (args) => {
    const objective = normalizeObjective(args.objective);
    const requestedFeatures = Array.isArray(args.requestedFeatures)
      ? args.requestedFeatures
        .map((feature) => normalizeProductionFeature(feature))
        .filter((feature): feature is FemProductionFeature => feature != null)
      : undefined;
    const report = assessFemProductionReadiness({
      ...(objective ? { objective } : {}),
      ...(requestedFeatures && requestedFeatures.length > 0 ? { requestedFeatures } : {}),
    });

    return {
      success: true,
      data: {
        ...report,
        agentEvidenceSummary: [
          `FEM production readiness: ${report.status}`,
          `productionReady: ${report.productionReady ? 'yes' : 'no'}`,
          `current mode: ${report.currentMode}`,
          `engineering evidence: ${report.engineeringEvidence.status}`,
          `verified kernels: ${report.engineeringEvidence.verifiedFeatures.join(', ') || 'none'}`,
          `accepted benchmarks: ${report.engineeringEvidence.benchmarks
            .filter((benchmark) => benchmark.status === 'accepted')
            .map((benchmark) => benchmark.id)
            .join(', ') || 'none'}`,
          `external benchmark gate: ${report.engineeringEvidence.externalBenchmarkAcceptance.status}`,
          `external benchmark references: ${report.engineeringEvidence.externalBenchmarkAcceptance.references.length}`,
          `external benchmark comparison results: ${report.engineeringEvidence.externalBenchmarkAcceptance.comparisonResults.length}`,
          `external benchmark blockers: ${report.engineeringEvidence.externalBenchmarkAcceptance.blockerCodes.join(', ') || 'none'}`,
          `production blockers: ${report.blockers.join(', ') || 'none'}`,
          `blocked features: ${report.blockedFeatures.map((feature) => feature.feature).join(', ')}`,
          `release positioning: ${report.releasePositioning}`,
          `safe actions: ${report.safeUserActions.join(' | ')}`,
        ].join('\n'),
      },
      summary: `FEM production readiness blocked: ${report.blockedFeatures.map((feature) => feature.feature).join(', ')}.`,
    };
  },
);

toolRegistry.register(
  {
    name: 'prepare_fem_analysis_case',
    description:
      'Prepare an experimental FEM analysis-case draft from explicit user inputs. This routes and validates the case but never runs production FEM and never auto-approves design use. Use for agentic planning before any FEM preview/run.',
    parameters: {
      type: 'object',
      required: ['objective'],
      properties: {
        objective: {
          type: 'string',
          enum: [
            'foundation-settlement',
            'excavation-deformation',
            'shaft-deformation',
            'tunnel-volume-loss-settlement',
            'pile-group-elastic-interaction',
            'slope-embankment-deformation',
            'retaining-wall-excavation-support',
            'seepage-groundwater-coupling',
            'staged-settlement-consolidation',
          ],
          description: 'FEM objective to route.',
        },
        useDemoDefaults: {
          type: 'boolean',
          description: 'Use built-in demo defaults for implemented foundation-settlement, excavation-deformation, and tunnel-volume-loss-settlement previews. Keep false for user/project evidence routing.',
          default: false,
        },
        geometry: {
          type: 'object',
          description: 'Explicit geometry inputs. For foundation-settlement: raftLengthM, raftWidthM, raftThicknessM, domainLengthM, domainWidthM, domainDepthM. For excavation-deformation: excavationLengthM, excavationWidthM, excavationFinalDepthM, wallToeDepthM, plus optional domain dimensions. For tunnel-volume-loss-settlement: tunnelDiameterM, tunnelAxisDepthM, tunnelLengthM, tunnelVolumeLossPercent, troughWidthParameterK, optional tunnelCenterXM/tunnelCenterYM, plus optional domain dimensions.',
          additionalProperties: false,
          properties: {
            raftLengthM: { type: 'number' },
            raftWidthM: { type: 'number' },
            raftThicknessM: { type: 'number' },
            domainLengthM: { type: 'number' },
            domainWidthM: { type: 'number' },
            domainDepthM: { type: 'number' },
            excavationLengthM: { type: 'number' },
            excavationWidthM: { type: 'number' },
            excavationFinalDepthM: { type: 'number' },
            wallToeDepthM: { type: 'number' },
            tunnelDiameterM: { type: 'number' },
            tunnelAxisDepthM: { type: 'number' },
            tunnelLengthM: { type: 'number' },
            tunnelCenterXM: { type: 'number' },
            tunnelCenterYM: { type: 'number' },
            tunnelVolumeLossPercent: { type: 'number' },
            troughWidthParameterK: { type: 'number' },
          },
        },
        load: {
          type: 'object',
          description: 'Explicit load inputs. For foundation-settlement: raft pressureKpa. For excavation-deformation: surcharge pressureKpa.',
          additionalProperties: false,
          properties: {
            pressureKpa: { type: 'number' },
          },
        },
        excavation: {
          type: 'object',
          description: 'Excavation staging inputs: stageDepthsM, supportLevelsM, wallType.',
          additionalProperties: false,
          properties: {
            stageDepthsM: {
              type: 'array',
              items: { type: 'number' },
            },
            supportLevelsM: {
              type: 'array',
              items: { type: 'number' },
            },
            wallType: {
              type: 'string',
              enum: ['diaphragm_wall', 'secant_pile_wall', 'soldier_pile_lagging', 'unsupported_screening'],
            },
          },
        },
        material: {
          type: 'object',
          description: 'Explicit material inputs: elasticModulusKpa, poissonRatio, unitWeightKnM3.',
          additionalProperties: false,
          properties: {
            elasticModulusKpa: { type: 'number' },
            poissonRatio: { type: 'number' },
            unitWeightKnM3: { type: 'number' },
          },
        },
        groundwater: {
          type: 'object',
          description: 'Groundwater assumption: condition, depthM, note.',
          additionalProperties: false,
          properties: {
            condition: {
              type: 'string',
              enum: ['not_modelled', 'below_domain', 'specified'],
            },
            depthM: { type: 'number' },
            note: { type: 'string' },
          },
        },
        evidenceRefs: {
          type: 'array',
          description: 'Optional evidence references from DocumentEvidencePacket or GroundModel.',
          items: { type: 'object' },
        },
      },
    },
  },
  (args) => {
    const objective = normalizeObjective(args.objective);
    if (!objective) {
      return {
        success: false,
        data: null,
        summary: 'FEM route could not be prepared because the objective is unsupported.',
        error: `Unsupported FEM objective: ${String(args.objective ?? '')}`,
      };
    }

    const draft = prepareFemAnalysisCaseDraft({
      objective,
      useDemoDefaults: args.useDemoDefaults === true,
      geometry: args.geometry as any,
      excavation: args.excavation as any,
      load: args.load as any,
      material: args.material as any,
      groundwater: args.groundwater as any,
      evidenceRefs: Array.isArray(args.evidenceRefs) ? args.evidenceRefs as any : [],
    });

    return {
      success: true,
      data: {
        ...draft,
        agentEvidenceSummary: summarizeFemDraftForAgent(draft),
      },
      summary: `FEM route ${draft.objective}: ${draft.implemented ? 'draft prepared' : 'contract only'}; missing inputs: ${draft.missingUserInputs.join(', ') || 'none'}; auto-proceed: no.`,
    };
  },
);

toolRegistry.register(
  {
    name: 'validate_fem_analysis_case',
    description:
      'Validate an experimental FEM analysis case. Use this in review before any FEM artifact is accepted. It checks schema, experimental gate, geometry, material/load sanity, assumptions, groundwater, mesh, and review gates.',
    parameters: {
      type: 'object',
      required: ['caseFile'],
      properties: {
        caseFile: {
          type: 'object',
          description: 'FEM analysis case object to validate.',
        },
      },
    },
  },
  (args) => {
    const validation = validateFemAnalysisCase(args.caseFile as any);
    return {
      success: true,
      data: {
        ...validation,
        agentEvidenceSummary: summarizeFemValidationForAgent(validation),
      },
      summary: `FEM validation ${validation.status}: ${validation.blockers} blocker(s), ${validation.reviewItems} review item(s).`,
    };
  },
);

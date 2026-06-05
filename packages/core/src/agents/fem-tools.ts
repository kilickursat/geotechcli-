import {
  assessFemProductionReadiness,
  listFemCapabilities,
  prepareFemAnalysisCaseDraft,
  runFemSupportMemberDesignCheck,
  validateFemAnalysisCase,
  validateFemSupportMemberDesignCheckInput,
  type FemAnalysisCaseDraft,
  type FemProductionFeature,
  type FemSupportMemberDesignCheckInput,
  type FemValidationSummary,
  type FemRouteObjective,
} from '../fem/index.js';
import { toolRegistry } from './tools.js';

const DEFAULT_FEM_SUPPORT_DESIGN_UNITS: FemSupportMemberDesignCheckInput['units'] = {
  length: 'm',
  force: 'kN',
  stress: 'MPa',
  area: 'm2',
  moment: 'kN-m',
  momentOfInertia: 'm4',
  sectionModulus: 'm3',
  utilization: 'ratio',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

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
    case 'excavation-plane-strain-dp-adaptive':
    case 'excavation-dp-adaptive':
    case 'plane-strain-dp-adaptive':
    case 'drucker-prager-excavation':
      return 'excavation-plane-strain-dp-adaptive';
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

function buildFemSupportMemberDesignToolInput(args: Record<string, unknown>): FemSupportMemberDesignCheckInput {
  const units = isRecord(args.units)
    ? { ...DEFAULT_FEM_SUPPORT_DESIGN_UNITS, ...args.units }
    : DEFAULT_FEM_SUPPORT_DESIGN_UNITS;

  return {
    schemaVersion: 'fem-support-member-design-input.v1',
    units,
    member: args.member as FemSupportMemberDesignCheckInput['member'],
    demand: args.demand as FemSupportMemberDesignCheckInput['demand'],
    ...(isRecord(args.factors)
      ? { factors: args.factors as FemSupportMemberDesignCheckInput['factors'] }
      : {}),
    review: args.review as FemSupportMemberDesignCheckInput['review'],
    ...(isRecord(args.policy)
      ? { policy: args.policy as unknown as FemSupportMemberDesignCheckInput['policy'] }
      : {}),
  };
}

function summarizeFemSupportMemberDesignForAgent(
  result: ReturnType<typeof runFemSupportMemberDesignCheck>,
): string {
  return [
    `FEM support member design check: ${result.status}`,
    `productionClaim: ${result.productionClaim ? 'yes' : 'no'}`,
    `design scope: ${result.designScope}`,
    `member: ${result.member.id} (${result.member.kind})`,
    `demand source: ${result.demand.source.source}`,
    `load combination: ${result.demand.source.loadCombination}`,
    `factored axial demand kN: ${result.demand.factoredAxialCompressionDemandKn}`,
    `factored bending demand kN-m: ${result.demand.factoredBendingMomentDemandKnM}`,
    `design compression capacity kN: ${result.capacities.designCompressionCapacityKn}`,
    result.capacities.designFlexuralCapacityKnM != null
      ? `design flexural capacity kN-m: ${result.capacities.designFlexuralCapacityKnM}`
      : '',
    `controlling limit state: ${result.controllingLimitState.id}`,
    `controlling utilization: ${result.controllingLimitState.utilization}`,
    `acceptance blockers: ${result.acceptanceBlockers.join(', ') || 'none'}`,
    `reviewer: ${result.review.reviewer.name} (${result.review.reviewer.licenseId}, ${result.review.reviewer.jurisdiction})`,
    `limitations: ${result.limitations.join(' | ')}`,
  ].filter(Boolean).join('\n');
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
            'excavation-plane-strain-dp-adaptive',
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
        operatingRule: 'LLMs may plan and review FEM routes, but FEM math must come from geotechCLI deterministic contracts, validators, and approved solvers. Agent tool calls cannot run FEM; only a human-reviewed CLI run with --experimental --reviewed plus persisted fem-reviewer-approval.v1 metadata can execute implemented preview routes.',
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
            'excavation-plane-strain-dp-adaptive',
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
          `external benchmark accepted comparisons: ${report.engineeringEvidence.externalBenchmarkAcceptance.comparisonResults
            .filter((comparison) => comparison.accepted)
            .map((comparison) => comparison.id)
            .join(', ') || 'none'}`,
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
            'excavation-plane-strain-dp-adaptive',
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
          description: 'Use built-in demo defaults for implemented foundation-settlement, excavation-deformation, excavation-plane-strain-dp-adaptive, tunnel-volume-loss-settlement, seepage-groundwater-coupling, and staged-settlement-consolidation previews. Keep false for user/project evidence routing.',
          default: false,
        },
        geometry: {
          type: 'object',
          description: 'Explicit geometry inputs. For foundation-settlement: raftLengthM, raftWidthM, raftThicknessM, domainLengthM, domainWidthM, domainDepthM. For excavation-deformation and excavation-plane-strain-dp-adaptive: excavationLengthM, excavationWidthM, excavationFinalDepthM, wallToeDepthM, plus optional domain dimensions. For tunnel-volume-loss-settlement: tunnelDiameterM, tunnelAxisDepthM, tunnelLengthM, tunnelVolumeLossPercent, troughWidthParameterK, optional tunnelCenterXM/tunnelCenterYM, plus optional domain dimensions.',
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
          description: 'Explicit load inputs. For foundation-settlement: raft pressureKpa. For excavation-deformation and excavation-plane-strain-dp-adaptive: surcharge pressureKpa.',
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
          description: 'Explicit material inputs: elasticModulusKpa, poissonRatio, unitWeightKnM3, and optional frictionAngleDeg, cohesionKpa, hardeningModulusKpa for nonlinear Drucker-Prager drafts.',
          additionalProperties: false,
          properties: {
            elasticModulusKpa: { type: 'number' },
            poissonRatio: { type: 'number' },
            unitWeightKnM3: { type: 'number' },
            frictionAngleDeg: { type: 'number' },
            cohesionKpa: { type: 'number' },
            hardeningModulusKpa: { type: 'number' },
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

toolRegistry.register(
  {
    name: 'check_fem_support_member_design',
    description:
      'Run a deterministic closed-form FEM support member design check for a reviewed strut/brace demand. This checks axial yield, Euler buckling, slenderness, optional flexure, and combined utilization from explicit member/demand/reviewer metadata. It is a support-member limit-state check only; it never runs FEM and never creates a production approval.',
    parameters: {
      type: 'object',
      required: ['member', 'demand', 'review'],
      additionalProperties: false,
      properties: {
        units: {
          type: 'object',
          description: 'Optional canonical units. Omit to use m, kN, MPa, m2, kN-m, m4, m3, ratio.',
          additionalProperties: false,
          properties: {
            length: { type: 'string', enum: ['m'] },
            force: { type: 'string', enum: ['kN'] },
            stress: { type: 'string', enum: ['MPa'] },
            area: { type: 'string', enum: ['m2'] },
            moment: { type: 'string', enum: ['kN-m'] },
            momentOfInertia: { type: 'string', enum: ['m4'] },
            sectionModulus: { type: 'string', enum: ['m3'] },
            utilization: { type: 'string', enum: ['ratio'] },
          },
        },
        member: {
          type: 'object',
          description: 'Support member properties: id, kind, unbracedLengthM, effectiveLengthFactor, areaM2, weakAxisMomentOfInertiaM4, optional sectionModulusM3, yieldStrengthMpa, elasticModulusMpa.',
          required: [
            'id',
            'kind',
            'unbracedLengthM',
            'effectiveLengthFactor',
            'areaM2',
            'weakAxisMomentOfInertiaM4',
            'yieldStrengthMpa',
            'elasticModulusMpa',
          ],
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            kind: { type: 'string', enum: ['strut', 'brace'] },
            label: { type: 'string' },
            sectionLabel: { type: 'string' },
            unbracedLengthM: { type: 'number' },
            effectiveLengthFactor: { type: 'number' },
            areaM2: { type: 'number' },
            weakAxisMomentOfInertiaM4: { type: 'number' },
            sectionModulusM3: { type: 'number' },
            yieldStrengthMpa: { type: 'number' },
            elasticModulusMpa: { type: 'number' },
          },
        },
        demand: {
          type: 'object',
          description: 'Reviewed support demand and provenance.',
          required: ['axialCompressionDemandKn', 'source'],
          additionalProperties: false,
          properties: {
            axialCompressionDemandKn: { type: 'number' },
            bendingMomentDemandKnM: { type: 'number' },
            source: {
              type: 'object',
              required: ['source', 'loadCombination', 'description'],
              additionalProperties: false,
              properties: {
                source: {
                  type: 'string',
                  enum: ['fem-result-envelope', 'support-reaction-screening', 'reviewed-hand-calculation'],
                },
                loadCombination: { type: 'string' },
                description: { type: 'string' },
                caseId: { type: 'string' },
                stageId: { type: 'string' },
                resultHashSha256: { type: 'string' },
              },
            },
          },
        },
        factors: {
          type: 'object',
          description: 'Optional demand/resistance/slenderness factors. Defaults are demandFactor 1.0, compression/flexure resistance factors 0.9, maximum slenderness 200.',
          additionalProperties: false,
          properties: {
            demandFactor: { type: 'number' },
            resistanceFactorCompression: { type: 'number' },
            resistanceFactorFlexure: { type: 'number' },
            maximumSlendernessRatio: { type: 'number' },
          },
        },
        review: {
          type: 'object',
          description: 'Required reviewer identity, assumptions, and limitations for audit trail.',
          required: ['reviewer', 'reviewedAt', 'assumptions', 'limitations'],
          additionalProperties: false,
          properties: {
            schemaVersion: { type: 'string', enum: ['fem-support-design-review-metadata.v1'] },
            reviewer: {
              type: 'object',
              required: ['name', 'licenseId', 'jurisdiction'],
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                licenseId: { type: 'string' },
                jurisdiction: { type: 'string' },
              },
            },
            reviewedAt: { type: 'string' },
            assumptions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'parameter', 'value', 'basis', 'confidence', 'reviewRequired'],
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  parameter: { type: 'string' },
                  value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                  unit: { type: 'string' },
                  basis: { type: 'string' },
                  confidence: { type: 'string', enum: ['measured', 'inferred', 'review'] },
                  reviewRequired: { type: 'boolean' },
                },
              },
            },
            limitations: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        policy: {
          type: 'object',
          description: 'Optional FEM convergence policy metadata; used for tolerance reporting only.',
        },
      },
    },
  },
  (args) => {
    const input = buildFemSupportMemberDesignToolInput(args);
    if (isRecord(input.review) && input.review.schemaVersion == null) {
      input.review = {
        ...input.review,
        schemaVersion: 'fem-support-design-review-metadata.v1',
      };
    }
    const inputValidation = validateFemSupportMemberDesignCheckInput(input);
    if (inputValidation.status === 'blocked') {
      return {
        success: false,
        data: {
          inputValidation,
        },
        summary: `FEM support member design check blocked: ${inputValidation.blockerCodes.join(', ') || 'invalid input'}.`,
        error: `Invalid FEM support member design check input: ${inputValidation.blockerCodes.join(', ')}`,
      };
    }

    const result = runFemSupportMemberDesignCheck(input);
    return {
      success: true,
      data: {
        ...result,
        inputValidation,
        agentEvidenceSummary: summarizeFemSupportMemberDesignForAgent(result),
      },
      summary: `FEM support member design check ${result.status}: controlling ${result.controllingLimitState.id} utilization ${result.controllingLimitState.utilization}; production approval: no.`,
    };
  },
);

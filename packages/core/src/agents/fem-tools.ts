import {
  listFemCapabilities,
  prepareFemAnalysisCaseDraft,
  validateFemAnalysisCase,
  type FemRouteObjective,
} from '../fem/index.js';
import { toolRegistry } from './tools.js';

function normalizeObjective(value: unknown): FemRouteObjective | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
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
        operatingRule: 'LLMs may plan and review FEM routes, but FEM math must come from geotechCLI deterministic contracts, validators, and approved solvers.',
      },
      summary: `FEM capabilities: ${capabilities.map((item) => `${item.objective} (${item.status})`).join(', ') || 'none'}.`,
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
          ],
          description: 'FEM objective to route.',
        },
        useDemoDefaults: {
          type: 'boolean',
          description: 'Use built-in demo defaults for implemented foundation-settlement and excavation-deformation previews. Keep false for user/project evidence routing.',
          default: false,
        },
        geometry: {
          type: 'object',
          description: 'Explicit geometry inputs. For foundation-settlement: raftLengthM, raftWidthM, raftThicknessM, domainLengthM, domainWidthM, domainDepthM. For excavation-deformation: excavationLengthM, excavationWidthM, excavationFinalDepthM, wallToeDepthM, plus optional domain dimensions.',
        },
        load: {
          type: 'object',
          description: 'Explicit load inputs. For foundation-settlement: raft pressureKpa. For excavation-deformation: surcharge pressureKpa.',
        },
        excavation: {
          type: 'object',
          description: 'Excavation staging inputs: stageDepthsM, supportLevelsM, wallType.',
        },
        material: {
          type: 'object',
          description: 'Explicit material inputs: elasticModulusKpa, poissonRatio, unitWeightKnM3.',
        },
        groundwater: {
          type: 'object',
          description: 'Groundwater assumption: condition, depthM, note.',
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
      data: draft,
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
      success: validation.blockers === 0,
      data: validation,
      summary: `FEM validation ${validation.status}: ${validation.blockers} blocker(s), ${validation.reviewItems} review item(s).`,
      error: validation.blockers > 0 ? 'FEM analysis case has blocking validation findings.' : undefined,
    };
  },
);

import { resolve } from 'node:path';

import { analyzeWorkspace } from '../workspace/index.js';
import {
  buildGroundModelAgentView,
  type GroundModelAgentSection,
} from '../ground-model/index.js';
import { toolRegistry, type ToolResult } from './tools.js';

const GROUND_MODEL_SECTIONS: readonly GroundModelAgentSection[] = [
  'summary',
  'boreholes',
  'strata',
  'parameters',
  'groundwater',
  'spt',
  'coordinates',
  'all',
];

function readWorkspaceArg(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '.';
}

function readSectionArg(value: unknown): GroundModelAgentSection {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((GROUND_MODEL_SECTIONS as readonly string[]).includes(trimmed)) {
      return trimmed as GroundModelAgentSection;
    }
  }
  return 'summary';
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

toolRegistry.register(
  {
    name: 'query_ground_model',
    description:
      'Return the read-only deterministic GroundModel detail (strata, parameters, groundwater, SPT, coordinates, and per-borehole records) with evidence IDs that `geotech analyze` builds for a workspace folder; prefer this over re-parsing raw files.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Project folder to scan (default ".")' },
        section: {
          type: 'string',
          enum: [...GROUND_MODEL_SECTIONS],
          description: 'Section of the GroundModel to return',
          default: 'summary',
        },
        boreholeId: { type: 'string', description: 'Optional borehole id filter' },
        limit: { type: 'number', description: 'Optional cap on rows per collection' },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const workspace = readWorkspaceArg(args.workspace);
    const section = readSectionArg(args.section);
    const boreholeId = readOptionalString(args.boreholeId);
    const limit = readOptionalNumber(args.limit);

    const manifest = await analyzeWorkspace(workspace);
    const view = buildGroundModelAgentView(manifest.groundModel, { section, boreholeId, limit });

    const summary = view.available
      ? `GroundModel: ${view.counts.boreholes} borehole(s), ${view.counts.strata} strata, ${view.counts.parameters} parameter(s) (section: ${section}).`
      : 'No evidence-bound GroundModel found in this workspace.';

    return {
      success: true,
      data: {
        source: 'workspace-scan',
        workspace: resolve(workspace),
        ...view,
      },
      summary,
    };
  },
);

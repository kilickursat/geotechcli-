import { toolRegistry, type ToolResult } from './tools.js';
import { parseAGS } from '../ingest/ags.js';
import { parseCPT } from '../ingest/cpt.js';
import { queryStandards, listStandards } from '../standards/index.js';
import {
  createProject, loadProject, listProjects,
  addSimulationResult,
  saveNamedDataset, saveDerivedParameter,
  addAssumption, addArtifact,
} from '../storage/index.js';
import { validateReadPath } from './sandbox.js';
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// AGS Borehole Data Parser
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'parse_ags',
    description:
      'Parse an AGS 4.0 borehole data file (the standard electronic transfer format for geotechnical data). Extracts boreholes, geology layers, SPT results, and sample information. Use this when the user has .ags files from site investigation.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to the .ags file' },
      },
    },
  },
  (args): ToolResult => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    try {
      const ags = parseAGS(filePath);
      return {
        success: true,
        data: {
          boreholes: ags.boreholes,
          geology: ags.geology,
          sptResults: ags.sptResults,
          samples: ags.samples,
          projectInfo: ags.projectInfo,
          groupCount: ags.groups.size,
        },
        summary: `AGS parsed: ${ags.boreholes.length} boreholes, ${ags.geology.length} geology layers, ${ags.sptResults.length} SPT results, ${ags.groups.size} data groups`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: `AGS parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
);

// ---------------------------------------------------------------------------
// CPT Data Parser with Robertson Classification
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'parse_cpt',
    description:
      'Parse a CPT (Cone Penetration Test) data file and apply Robertson SBTn classification. Returns corrected tip resistance (qt), soil behavior type index (Ic), and layer boundaries. CSV format expected with columns: depth, qc, fs, u2.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to CPT CSV data file' },
        waterTableDepth: { type: 'number', description: 'Depth to water table in meters', default: 1.0 },
        id: { type: 'string', description: 'CPT sounding ID' },
      },
    },
  },
  (args): ToolResult => {
    const pathCheck = validateReadPath(String(args.path));
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    try {
      const cpt = parseCPT(filePath, {
        id: args.id as string,
        waterTableDepth: args.waterTableDepth as number,
      });
      return {
        success: true,
        data: cpt,
        summary: `CPT ${cpt.id}: ${cpt.readings.length} readings to ${cpt.summary.maxDepth}m, avg qc=${cpt.summary.avgQc} MPa, dominant: ${cpt.summary.dominantSoilType}, ${cpt.summary.layerBoundaries.length} layer transitions`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: `CPT parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
);

// ---------------------------------------------------------------------------
// Standards Database Query (RAG-like)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'query_standards',
    description:
      'Search the geotechnical standards database for relevant provisions. Covers: Eurocode 7, ASTM (D2487, D1586, D5778, D4318), Bieniawski RMR, Barton Q-system, Boulanger & Idriss liquefaction, ITA TBM selection, Terzaghi settlement. Use this to cite standards, check design requirements, or verify calculation methods.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "bearing capacity eurocode", "liquefaction triggering", "RMR support recommendations")' },
        maxResults: { type: 'number', description: 'Maximum results to return', default: 3 },
      },
    },
  },
  (args): ToolResult => {
    const result = queryStandards(String(args.query), (args.maxResults as number) ?? 3);

    if (result.matches.length === 0) {
      return { success: true, data: result, summary: `No standards found matching "${args.query}". Try broader terms.` };
    }

    const summaryParts = result.matches.map((m) => `${m.standard} §${m.section}: ${m.title}`);
    return {
      success: true,
      data: result,
      summary: `Found ${result.matches.length} standard provisions: ${summaryParts.join(' | ')}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Project Management
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'project_create',
    description: 'Create a new geotechCLI project to store soil profiles, simulation results, and notes persistently across sessions.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Project name' },
        location: { type: 'string', description: 'Project location' },
        description: { type: 'string', description: 'Brief description' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const project = createProject(String(args.name), {
        location: args.location as string,
        description: args.description as string,
      });
      return { success: true, data: project.meta, summary: `Project "${project.meta.name}" created (id: ${project.meta.id})` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_load',
    description: 'Load an existing project and retrieve its soil profiles, simulation history, and notes.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project ID' },
      },
    },
  },
  (args): ToolResult => {
    try {
      const project = loadProject(String(args.id));
      return {
        success: true,
        data: project,
        summary: `Project "${project.meta.name}" loaded: ${project.soilProfiles.length} soil profiles, ${project.simulationResults.length} simulation results, ${project.assumptions.length} assumptions, ${Object.keys(project.namedDatasets).length} datasets`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_list',
    description: 'List all geotechCLI projects stored on this machine.',
    parameters: { type: 'object', properties: {} },
  },
  (): ToolResult => {
    const projects = listProjects();
    if (projects.length === 0) {
      return { success: true, data: [], summary: 'No projects found. Use project_create to start one.' };
    }
    return {
      success: true,
      data: projects,
      summary: `${projects.length} projects: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}`,
    };
  },
);

toolRegistry.register(
  {
    name: 'project_save_dataset',
    description: 'Save a structured named dataset into project memory so future agent runs can reuse it. Use for interpreted borehole logs, parameter tables, tabular summaries, or normalized intermediate data.',
    parameters: {
      type: 'object',
      required: ['projectId', 'name', 'kind', 'data'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Dataset name or key' },
        kind: { type: 'string', description: 'Dataset kind, e.g. borehole-log, cpt-summary, assumptions-table' },
        data: { type: 'object', description: 'Structured dataset content' },
        source: { type: 'string', description: 'Where the dataset came from' },
      },
    },
  },
  (args): ToolResult => {
    try {
      saveNamedDataset(String(args.projectId), {
        name: String(args.name),
        kind: String(args.kind),
        data: args.data ?? null,
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Dataset "${args.name}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_save_parameter',
    description: 'Persist a derived parameter or key design assumption into project memory for reuse across sessions.',
    parameters: {
      type: 'object',
      required: ['projectId', 'name', 'value'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Parameter name' },
        value: { description: 'Parameter value' },
        source: { type: 'string', description: 'Source or rationale for the parameter' },
      },
    },
  },
  (args): ToolResult => {
    try {
      saveDerivedParameter(String(args.projectId), {
        name: String(args.name),
        value: args.value ?? null,
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Parameter "${args.name}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_add_assumption',
    description: 'Record an engineering assumption in project memory, including its basis when known.',
    parameters: {
      type: 'object',
      required: ['projectId', 'text'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        text: { type: 'string', description: 'Assumption text' },
        source: { type: 'string', description: 'Basis, source, or standard used' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addAssumption(String(args.projectId), {
        text: String(args.text),
        source: args.source as string | undefined,
      });
      return { success: true, data: null, summary: `Assumption recorded in project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_add_artifact',
    description: 'Save a report, note, or generated artifact reference into project memory for later review.',
    parameters: {
      type: 'object',
      required: ['projectId', 'kind', 'title'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        kind: { type: 'string', description: 'Artifact kind, e.g. report, memo, output-file' },
        title: { type: 'string', description: 'Human-readable artifact title' },
        content: { type: 'string', description: 'Inline artifact content if stored directly' },
        path: { type: 'string', description: 'Filesystem path if artifact was written to disk' },
        mimeType: { type: 'string', description: 'Artifact MIME type' },
        metadata: { type: 'object', description: 'Additional artifact metadata' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addArtifact(String(args.projectId), {
        kind: String(args.kind),
        title: String(args.title),
        content: args.content as string | undefined,
        path: args.path as string | undefined,
        mimeType: args.mimeType as string | undefined,
        metadata: (args.metadata as Record<string, unknown> | undefined) ?? undefined,
      });
      return { success: true, data: null, summary: `Artifact "${args.title}" saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

toolRegistry.register(
  {
    name: 'project_save_result',
    description: 'Save a calculation result to the current project for future reference. The agent should call this after completing analyses to build a persistent project history.',
    parameters: {
      type: 'object',
      required: ['projectId', 'tool', 'summary'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        tool: { type: 'string', description: 'Tool name that produced the result' },
        args: { type: 'object', description: 'Arguments used' },
        result: { type: 'object', description: 'Calculation result data' },
        summary: { type: 'string', description: 'One-line summary of the result' },
      },
    },
  },
  (args): ToolResult => {
    try {
      addSimulationResult(String(args.projectId), {
        tool: String(args.tool),
        args: (args.args as Record<string, unknown>) ?? {},
        result: args.result ?? null,
        summary: String(args.summary),
      });
      return { success: true, data: null, summary: `Result saved to project ${args.projectId}` };
    } catch (err) {
      return { success: false, data: null, summary: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
);

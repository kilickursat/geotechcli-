import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Persistent Project Storage
// JSON-file database at ~/.geotechcli/projects/
// Each project = one directory with structured JSON files.
// No native dependencies (no SQLite binary to compile across platforms).
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  id: string;
  name: string;
  location?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SoilProfile {
  boreholeId: string;
  layers: Array<{
    depthFrom: number;
    depthTo: number;
    description: string;
    uscs?: string;
    sptN?: number;
    unitWeight?: number;
    cohesion?: number;
    frictionAngle?: number;
  }>;
  waterTableDepth?: number;
}

export interface SimulationResult {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  summary: string;
  timestamp: string;
}

export interface ProjectAssumption {
  id: string;
  text: string;
  source?: string;
  createdAt: string;
}

export interface ProjectArtifact {
  id: string;
  kind: string;
  title: string;
  content?: string;
  path?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectDataset {
  name: string;
  kind: string;
  data: unknown;
  source?: string;
  updatedAt: string;
}

export interface DerivedParameter {
  name: string;
  value: unknown;
  source?: string;
  updatedAt: string;
}

export interface ProjectAgentSession {
  id: string;
  mode: 'single' | 'swarm' | 'chat';
  query: string;
  answer?: string;
  summary: string;
  stepCount: number;
  tokens: number;
  latencyMs: number;
  context: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ActiveAnalysisContext {
  currentTask?: string;
  lastAgentMode?: ProjectAgentSession['mode'];
  lastAnswer?: string;
  context: Record<string, unknown>;
  relatedDatasets: string[];
  lastUpdatedAt: string;
}

export interface ProjectData {
  meta: ProjectMeta;
  soilProfiles: SoilProfile[];
  simulationResults: SimulationResult[];
  notes: string[];
  preferences: Record<string, unknown>;
  assumptions: ProjectAssumption[];
  artifacts: ProjectArtifact[];
  agentSessions: ProjectAgentSession[];
  namedDatasets: Record<string, ProjectDataset>;
  derivedParameters: Record<string, DerivedParameter>;
  activeAnalysisContext: ActiveAnalysisContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyActiveAnalysisContext(timestamp = nowIso()): ActiveAnalysisContext {
  return {
    context: {},
    relatedDatasets: [],
    lastUpdatedAt: timestamp,
  };
}

function normalizeSimulationResult(value: unknown, index: number): SimulationResult | null {
  if (!isRecord(value)) return null;

  return {
    id: asOptionalString(value.id) ?? `sim-${index + 1}`,
    tool: asOptionalString(value.tool) ?? 'unknown-tool',
    args: isRecord(value.args) ? value.args : {},
    result: value.result ?? null,
    summary: asOptionalString(value.summary) ?? 'Saved result',
    timestamp: asOptionalString(value.timestamp) ?? nowIso(),
  };
}

function normalizeSoilProfile(value: unknown): SoilProfile | null {
  if (!isRecord(value)) return null;
  const layers = Array.isArray(value.layers)
    ? value.layers
      .filter(isRecord)
      .map((layer) => ({
        depthFrom: asNumber(layer.depthFrom) ?? 0,
        depthTo: asNumber(layer.depthTo) ?? 0,
        description: asOptionalString(layer.description) ?? 'Unknown layer',
        uscs: asOptionalString(layer.uscs),
        sptN: asNumber(layer.sptN),
        unitWeight: asNumber(layer.unitWeight),
        cohesion: asNumber(layer.cohesion),
        frictionAngle: asNumber(layer.frictionAngle),
      }))
    : [];

  const boreholeId = asOptionalString(value.boreholeId);
  if (!boreholeId) return null;

  return {
    boreholeId,
    layers,
    waterTableDepth: asNumber(value.waterTableDepth),
  };
}

function normalizeAssumption(value: unknown, index: number): ProjectAssumption | null {
  if (typeof value === 'string') {
    return {
      id: `assumption-${index + 1}`,
      text: value,
      createdAt: nowIso(),
    };
  }
  if (!isRecord(value)) return null;

  const text = asOptionalString(value.text);
  if (!text) return null;

  return {
    id: asOptionalString(value.id) ?? `assumption-${index + 1}`,
    text,
    source: asOptionalString(value.source),
    createdAt: asOptionalString(value.createdAt) ?? nowIso(),
  };
}

function normalizeArtifact(value: unknown, index: number): ProjectArtifact | null {
  if (!isRecord(value)) return null;

  const kind = asOptionalString(value.kind);
  const title = asOptionalString(value.title);
  if (!kind || !title) return null;

  return {
    id: asOptionalString(value.id) ?? `artifact-${index + 1}`,
    kind,
    title,
    content: asOptionalString(value.content),
    path: asOptionalString(value.path),
    mimeType: asOptionalString(value.mimeType),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    createdAt: asOptionalString(value.createdAt) ?? nowIso(),
  };
}

function normalizeAgentSession(value: unknown, index: number): ProjectAgentSession | null {
  if (!isRecord(value)) return null;

  const mode = asOptionalString(value.mode);
  const query = asOptionalString(value.query);
  if (!mode || !query || !['single', 'swarm', 'chat'].includes(mode)) return null;

  return {
    id: asOptionalString(value.id) ?? `agent-session-${index + 1}`,
    mode: mode as ProjectAgentSession['mode'],
    query,
    answer: asOptionalString(value.answer),
    summary: asOptionalString(value.summary) ?? 'Agent session',
    stepCount: asNumber(value.stepCount) ?? 0,
    tokens: asNumber(value.tokens) ?? 0,
    latencyMs: asNumber(value.latencyMs) ?? 0,
    context: isRecord(value.context) ? value.context : {},
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    createdAt: asOptionalString(value.createdAt) ?? nowIso(),
  };
}

function normalizeDatasets(value: unknown): Record<string, ProjectDataset> {
  if (!isRecord(value)) return {};

  const datasets: Record<string, ProjectDataset> = {};

  for (const [name, dataset] of Object.entries(value)) {
    if (!isRecord(dataset)) continue;

    const resolvedName = asOptionalString(dataset.name) ?? name;
    const kind = asOptionalString(dataset.kind);
    if (!resolvedName || !kind) continue;

    datasets[resolvedName] = {
      name: resolvedName,
      kind,
      data: dataset.data ?? null,
      source: asOptionalString(dataset.source),
      updatedAt: asOptionalString(dataset.updatedAt) ?? nowIso(),
    };
  }

  return datasets;
}

function normalizeDerivedParameters(value: unknown): Record<string, DerivedParameter> {
  if (!isRecord(value)) return {};

  const parameters: Record<string, DerivedParameter> = {};

  for (const [name, parameter] of Object.entries(value)) {
    if (!isRecord(parameter)) continue;

    const resolvedName = asOptionalString(parameter.name) ?? name;
    if (!resolvedName) continue;

    parameters[resolvedName] = {
      name: resolvedName,
      value: parameter.value ?? null,
      source: asOptionalString(parameter.source),
      updatedAt: asOptionalString(parameter.updatedAt) ?? nowIso(),
    };
  }

  return parameters;
}

function normalizeActiveAnalysisContext(value: unknown): ActiveAnalysisContext {
  if (!isRecord(value)) return emptyActiveAnalysisContext();

  return {
    currentTask: asOptionalString(value.currentTask),
    lastAgentMode: ['single', 'swarm', 'chat'].includes(String(value.lastAgentMode))
      ? (value.lastAgentMode as ProjectAgentSession['mode'])
      : undefined,
    lastAnswer: asOptionalString(value.lastAnswer),
    context: isRecord(value.context) ? value.context : {},
    relatedDatasets: Array.isArray(value.relatedDatasets)
      ? value.relatedDatasets
        .map((item) => asOptionalString(item))
        .filter((item): item is string => Boolean(item))
      : [],
    lastUpdatedAt: asOptionalString(value.lastUpdatedAt) ?? nowIso(),
  };
}

function normalizeProjectData(raw: unknown): ProjectData {
  const source = isRecord(raw) ? raw : {};
  const metaSource = isRecord(source.meta) ? source.meta : {};
  const projectId = asOptionalString(metaSource.id) ?? 'unknown-project';
  const createdAt = asOptionalString(metaSource.createdAt) ?? nowIso();

  return {
    meta: {
      id: projectId,
      name: asOptionalString(metaSource.name) ?? projectId,
      location: asOptionalString(metaSource.location),
      description: asOptionalString(metaSource.description),
      createdAt,
      updatedAt: asOptionalString(metaSource.updatedAt) ?? createdAt,
    },
    soilProfiles: Array.isArray(source.soilProfiles)
      ? source.soilProfiles
        .map((profile) => normalizeSoilProfile(profile))
        .filter((profile): profile is SoilProfile => profile !== null)
      : [],
    simulationResults: Array.isArray(source.simulationResults)
      ? source.simulationResults
        .map((result, index) => normalizeSimulationResult(result, index))
        .filter((result): result is SimulationResult => result !== null)
      : [],
    notes: Array.isArray(source.notes)
      ? source.notes
        .map((note) => asOptionalString(note))
        .filter((note): note is string => Boolean(note))
      : [],
    preferences: isRecord(source.preferences) ? source.preferences : {},
    assumptions: Array.isArray(source.assumptions)
      ? source.assumptions
        .map((assumption, index) => normalizeAssumption(assumption, index))
        .filter((assumption): assumption is ProjectAssumption => assumption !== null)
      : [],
    artifacts: Array.isArray(source.artifacts)
      ? source.artifacts
        .map((artifact, index) => normalizeArtifact(artifact, index))
        .filter((artifact): artifact is ProjectArtifact => artifact !== null)
      : [],
    agentSessions: Array.isArray(source.agentSessions)
      ? source.agentSessions
        .map((session, index) => normalizeAgentSession(session, index))
        .filter((session): session is ProjectAgentSession => session !== null)
      : [],
    namedDatasets: normalizeDatasets(source.namedDatasets),
    derivedParameters: normalizeDerivedParameters(source.derivedParameters),
    activeAnalysisContext: normalizeActiveAnalysisContext(source.activeAnalysisContext),
  };
}

function withProject(projectId: string, updater: (project: ProjectData) => void): void {
  const project = loadProject(projectId);
  updater(project);
  saveProject(project);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getProjectsDir(): string {
  const dir = join(process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli'), 'projects');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getProjectDir(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(getProjectsDir(), safe);
}

function getProjectFilePath(projectId: string): string {
  return join(getProjectDir(projectId), 'project.json');
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export function createProject(
  name: string,
  options?: { location?: string; description?: string },
): ProjectData {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dir = getProjectDir(id);

  if (existsSync(dir)) {
    throw new Error(`Project "${id}" already exists. Use loadProject() to open it.`);
  }

  mkdirSync(dir, { recursive: true });

  const timestamp = nowIso();
  const project: ProjectData = {
    meta: {
      id,
      name,
      location: options?.location,
      description: options?.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    soilProfiles: [],
    simulationResults: [],
    notes: [],
    preferences: {},
    assumptions: [],
    artifacts: [],
    agentSessions: [],
    namedDatasets: {},
    derivedParameters: {},
    activeAnalysisContext: emptyActiveAnalysisContext(timestamp),
  };

  saveProject(project);
  return project;
}

export function loadProject(projectId: string): ProjectData {
  const filePath = getProjectFilePath(projectId);

  if (!existsSync(filePath)) {
    throw new Error(
      `Project "${projectId}" not found. Available: ${listProjects().map((p) => p.id).join(', ') || 'none'}`,
    );
  }

  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  return normalizeProjectData(raw);
}

export function saveProject(project: ProjectData): void {
  const dir = getProjectDir(project.meta.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const normalized = normalizeProjectData(project);
  normalized.meta.updatedAt = nowIso();
  normalized.activeAnalysisContext.lastUpdatedAt =
    normalized.activeAnalysisContext.lastUpdatedAt ?? normalized.meta.updatedAt;

  writeFileSync(
    getProjectFilePath(normalized.meta.id),
    JSON.stringify(normalized, null, 2),
    'utf-8',
  );
}

export function listProjects(): ProjectMeta[] {
  const dir = getProjectsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        const data = normalizeProjectData(
          JSON.parse(readFileSync(join(dir, entry.name, 'project.json'), 'utf-8')),
        );
        return data.meta;
      } catch {
        return null;
      }
    })
    .filter((meta): meta is ProjectMeta => meta !== null);
}

export function deleteProject(projectId: string): void {
  const dir = getProjectDir(projectId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Data Operations
// ---------------------------------------------------------------------------

export function addSoilProfile(projectId: string, profile: SoilProfile): void {
  withProject(projectId, (project) => {
    const idx = project.soilProfiles.findIndex((existing) => existing.boreholeId === profile.boreholeId);
    if (idx >= 0) {
      project.soilProfiles[idx] = profile;
    } else {
      project.soilProfiles.push(profile);
    }

    project.namedDatasets[profile.boreholeId] = {
      name: profile.boreholeId,
      kind: 'soil-profile',
      data: profile,
      source: 'addSoilProfile',
      updatedAt: nowIso(),
    };
  });
}

export function addSimulationResult(
  projectId: string,
  result: Omit<SimulationResult, 'id' | 'timestamp'>,
): void {
  withProject(projectId, (project) => {
    project.simulationResults.push({
      ...result,
      id: createId('sim'),
      timestamp: nowIso(),
    });

    if (project.simulationResults.length > 100) {
      project.simulationResults = project.simulationResults.slice(-100);
    }
  });
}

export function addNote(projectId: string, note: string): void {
  withProject(projectId, (project) => {
    project.notes.push(`[${nowIso()}] ${note}`);
  });
}

export function saveNamedDataset(
  projectId: string,
  dataset: Omit<ProjectDataset, 'updatedAt'>,
): void {
  withProject(projectId, (project) => {
    project.namedDatasets[dataset.name] = {
      ...dataset,
      updatedAt: nowIso(),
    };
  });
}

export function saveDerivedParameter(
  projectId: string,
  parameter: Omit<DerivedParameter, 'updatedAt'>,
): void {
  withProject(projectId, (project) => {
    project.derivedParameters[parameter.name] = {
      ...parameter,
      updatedAt: nowIso(),
    };
  });
}

export function addAssumption(
  projectId: string,
  assumption: Omit<ProjectAssumption, 'id' | 'createdAt'>,
): void {
  withProject(projectId, (project) => {
    project.assumptions.push({
      ...assumption,
      id: createId('assumption'),
      createdAt: nowIso(),
    });

    if (project.assumptions.length > 100) {
      project.assumptions = project.assumptions.slice(-100);
    }
  });
}

export function addArtifact(
  projectId: string,
  artifact: Omit<ProjectArtifact, 'id' | 'createdAt'>,
): void {
  withProject(projectId, (project) => {
    project.artifacts.push({
      ...artifact,
      id: createId('artifact'),
      createdAt: nowIso(),
    });

    if (project.artifacts.length > 100) {
      project.artifacts = project.artifacts.slice(-100);
    }
  });
}

export function addAgentSession(
  projectId: string,
  session: Omit<ProjectAgentSession, 'id' | 'createdAt'>,
): void {
  withProject(projectId, (project) => {
    project.agentSessions.push({
      ...session,
      id: createId('agent-session'),
      createdAt: nowIso(),
    });

    if (project.agentSessions.length > 100) {
      project.agentSessions = project.agentSessions.slice(-100);
    }
  });
}

export function setActiveAnalysisContext(
  projectId: string,
  context: Partial<Omit<ActiveAnalysisContext, 'lastUpdatedAt'>>,
): void {
  withProject(projectId, (project) => {
    project.activeAnalysisContext = {
      ...project.activeAnalysisContext,
      ...context,
      context: isRecord(context.context)
        ? context.context
        : project.activeAnalysisContext.context,
      relatedDatasets: Array.isArray(context.relatedDatasets)
        ? context.relatedDatasets
        : project.activeAnalysisContext.relatedDatasets,
      lastUpdatedAt: nowIso(),
    };
  });
}

export function setProjectPreference(projectId: string, key: string, value: unknown): void {
  withProject(projectId, (project) => {
    project.preferences[key] = value;
  });
}

export function getSimulationHistory(projectId: string, tool?: string): SimulationResult[] {
  const project = loadProject(projectId);
  if (tool) {
    return project.simulationResults.filter((result) => result.tool === tool);
  }
  return project.simulationResults;
}

export function getProjectAgentContext(projectId: string): Record<string, unknown> {
  const project = loadProject(projectId);

  return {
    projectMeta: project.meta,
    soilProfiles: project.soilProfiles,
    assumptions: project.assumptions.map((assumption) => ({
      text: assumption.text,
      source: assumption.source,
    })),
    recentSimulationResults: project.simulationResults.slice(-10),
    namedDatasets: Object.fromEntries(
      Object.entries(project.namedDatasets).map(([name, dataset]) => [name, dataset.data]),
    ),
    derivedParameters: Object.fromEntries(
      Object.entries(project.derivedParameters).map(([name, parameter]) => [name, parameter.value]),
    ),
    activeAnalysisContext: project.activeAnalysisContext,
    recentNotes: project.notes.slice(-10),
    recentArtifacts: project.artifacts.slice(-10).map((artifact) => ({
      kind: artifact.kind,
      title: artifact.title,
      path: artifact.path,
    })),
  };
}

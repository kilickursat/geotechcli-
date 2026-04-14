import { randomUUID } from 'node:crypto';

import {
  loadProject,
  saveNamedDataset,
  type ProjectAgentSession,
} from '../storage/index.js';
import {
  AGENT_STAGES,
  SCENARIO_ARTIFACT_TYPES,
  type AcceptanceStatusPayload,
  type AnalysisPlanPayload,
  type AssumptionsPayload,
  type ArtifactSource,
  type FinalReportPayload,
  type GroundModelPayload,
  type IssuesAndCorrectionsPayload,
  type ReviewChecklistPayload,
  type ResultMetric,
  type ResultsPayload,
  type ScenarioArtifact,
  type ScenarioArtifactPayloadMap,
  type ScenarioArtifactType,
  type ScenarioCaseFile,
} from './contracts.js';

const CASE_FILE_KIND = 'scenario-case-file';
const ARTIFACT_KIND = 'scenario-artifact';

export interface SwarmSessionLike {
  steps: Array<{
    agent: (typeof AGENT_STAGES)[number];
    type: string;
    content: string;
    timestamp: number;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
  }>;
  context: Record<string, unknown>;
  totalTokens: number;
  totalLatencyMs: number;
  reviewPassed: boolean;
  corrections: string[];
}

export interface BuildSwarmSessionProjectRecordOptions {
  summary?: string;
  answer?: string;
  metadata?: Record<string, unknown>;
  mode?: ProjectAgentSession['mode'];
}

export interface PersistSwarmCaseFileResult {
  scenarioId: string;
  caseFileId: string;
  artifactRefs: Partial<Record<ScenarioArtifactType, string>>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isScenarioArtifactType(value: unknown): value is ScenarioArtifactType {
  return typeof value === 'string' && (SCENARIO_ARTIFACT_TYPES as readonly string[]).includes(value);
}

function isAgentStage(value: unknown): value is (typeof AGENT_STAGES)[number] {
  return typeof value === 'string' && (AGENT_STAGES as readonly string[]).includes(value);
}

function toScenarioId(task: string): string {
  const normalized = task
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'baseline';
}

function titleFromTask(task: string): string {
  const trimmed = task.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/^calculate_/, '').replace(/_/g, ' ');
}

function firstSentence(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]?.trim();
  return sentence || fallback;
}

function extractConfidenceFromSteps(session: SwarmSessionLike): number {
  for (const step of [...session.steps].reverse()) {
    const match = step.content.match(/confidence:\s*(\d{1,3})%/i);
    if (match) {
      const confidence = Number.parseInt(match[1], 10);
      if (Number.isFinite(confidence)) {
        return Math.max(0, Math.min(100, confidence));
      }
    }
  }

  if (!session.reviewPassed) return 45;
  if (session.corrections.length > 0) return 70;
  return 85;
}

function extractAnswer(session: SwarmSessionLike): string | undefined {
  return [...session.steps]
    .reverse()
    .find((step) => step.type === 'answer')
    ?.content
    ?.trim();
}

function toMetricRows(value: unknown): ResultMetric[] {
  if (!isRecord(value)) {
    if (value === null || value === undefined) {
      return [];
    }

    return [
      {
        name: 'value',
        value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? value
          : JSON.stringify(value),
      },
    ];
  }

  return Object.entries(value)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null)
    .map(([name, item]) => ({
      name,
      value: item as string | number | boolean | null,
    }));
}

function buildGroundModelPayload(session: SwarmSessionLike): GroundModelPayload | null {
  const interpretation = isRecord(session.context.interpretation) ? session.context.interpretation : null;
  if (!interpretation) return null;

  const derivedParameters = Object.fromEntries(
    Object.entries(interpretation).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value) || value === null,
    ),
  ) as Record<string, string | number | boolean | null>;

  const groundwaterDepth = asNumber(
    interpretation.waterTableDepth ??
    interpretation.groundwaterDepth ??
    interpretation.gwlDepth ??
    interpretation.groundWaterDepth,
  );

  return {
    summary: 'Ground model snapshot captured from the interpretation stage.',
    units: 'SI',
    strata: [],
    groundwater: {
      detected: groundwaterDepth !== undefined,
      ...(groundwaterDepth !== undefined ? { depthM: groundwaterDepth } : {}),
    },
    derivedParameters,
    missingInputs: [],
    blockedInputs: [],
  };
}

function buildAssumptionsPayload(projectId: string): AssumptionsPayload | null {
  const project = loadProject(projectId);
  if (project.assumptions.length === 0) return null;

  return {
    summary: 'Active project assumptions captured in project memory.',
    assumptions: project.assumptions.map((assumption, index) => ({
      assumptionId: assumption.id || `assumption-${index + 1}`,
      category: 'other',
      statement: assumption.text,
      basis: assumption.source,
      impact: 'medium',
      evidenceRefs: [],
    })),
    criticalAssumptions: project.assumptions.slice(0, 5).map((assumption) => assumption.text),
  };
}

function buildAnalysisPlanPayload(task: string, session: SwarmSessionLike): AnalysisPlanPayload | null {
  const simulationCalls = session.steps.filter(
    (step) => step.agent === 'simulation' && step.type === 'tool_call' && typeof step.toolName === 'string',
  );
  if (simulationCalls.length === 0) return null;

  return {
    summary: 'Analysis plan reconstructed from simulation-stage tool calls.',
    scenarioObjective: task,
    analyses: simulationCalls.map((step, index) => ({
      analysisId: `analysis-${index + 1}`,
      method: humanizeToolName(step.toolName ?? `analysis-${index + 1}`),
      purpose: `Run ${humanizeToolName(step.toolName ?? `analysis-${index + 1}`)} for the active scenario.`,
      toolName: step.toolName ?? `analysis-${index + 1}`,
      requiredInputs: isRecord(step.toolArgs) ? Object.keys(step.toolArgs) : [],
      outputArtifactTypes: ['results'],
    })),
    acceptanceCriteria: session.reviewPassed
      ? ['Reviewer approval achieved or acceptable with notes.']
      : ['Reviewer issues must be resolved before final approval.'],
  };
}

function buildResultsPayload(scenarioId: string, session: SwarmSessionLike): ResultsPayload | null {
  const simulation = isRecord(session.context.simulation) ? session.context.simulation : null;
  if (!simulation) return null;

  const records = Object.entries(simulation).map(([toolName, value], index) => ({
    resultId: `result-${index + 1}`,
    label: humanizeToolName(toolName),
    method: humanizeToolName(toolName),
    toolName,
    metrics: toMetricRows(value),
    interpretation: isRecord(value) && typeof value.summary === 'string'
      ? value.summary
      : `Stored output from ${toolName}.`,
    evidenceRefs: [],
    warnings: isRecord(value) && Array.isArray(value.warnings)
      ? value.warnings.filter((item): item is string => typeof item === 'string')
      : [],
  }));

  return {
    summary: `Stored ${records.length} simulation result${records.length === 1 ? '' : 's'} from the swarm session.`,
    scenarioLabel: scenarioId,
    analysesRun: Object.keys(simulation),
    records,
  };
}

function buildReviewChecklistPayload(session: SwarmSessionLike): ReviewChecklistPayload {
  const reviewerSteps = session.steps.filter(
    (step) => step.agent === 'reviewer' && (step.type === 'review' || step.type === 'correction'),
  );

  return {
    summary: 'Reviewer-stage summary reconstructed from swarm output.',
    items: reviewerSteps.length > 0
      ? reviewerSteps.map((step, index) => ({
          itemId: `review-${index + 1}`,
          category: 'traceability',
          question: step.type === 'review' ? 'Did the reviewer approve the submitted results?' : 'Did the reviewer request corrections?',
          status: step.type === 'review' ? 'pass' : 'warning',
          detail: step.content,
        }))
      : [
          {
            itemId: 'review-1',
            category: 'traceability',
            question: 'Was reviewer output captured?',
            status: session.reviewPassed ? 'pass' : 'warning',
            detail: session.reviewPassed
              ? 'Reviewer approved the session without explicit checklist items.'
              : 'Reviewer output was limited; corrections remain recorded in session metadata.',
          },
        ],
  };
}

function buildAcceptanceStatusPayload(session: SwarmSessionLike): AcceptanceStatusPayload {
  const confidence = extractConfidenceFromSteps(session);
  const verdict = session.reviewPassed
    ? (session.corrections.length > 0 ? 'CONDITIONAL' : 'APPROVED')
    : 'REJECTED';

  return {
    summary: session.reviewPassed
      ? (session.corrections.length > 0
        ? 'Reviewer completed the session with follow-up notes.'
        : 'Reviewer approved the session results.')
      : 'Reviewer identified unresolved issues that still require correction.',
    verdict,
    confidence,
    reasons: session.corrections.length > 0
      ? [...session.corrections]
      : [session.reviewPassed ? 'Reviewer approval recorded.' : 'Outstanding reviewer issues remain.'],
  };
}

function buildIssuesPayload(session: SwarmSessionLike): IssuesAndCorrectionsPayload | null {
  if (session.corrections.length === 0) return null;

  return {
    summary: 'Reviewer corrections captured from the swarm session.',
    issues: session.corrections.map((correction, index) => ({
      issueId: `issue-${index + 1}`,
      severity: session.reviewPassed ? 'minor' : 'major',
      issue: correction,
      correction,
      affectedArtifacts: ['results'],
    })),
  };
}

function buildFinalReportPayload(projectId: string, answer: string): FinalReportPayload {
  const project = loadProject(projectId);

  return {
    summary: firstSentence(answer, 'Final report generated from the swarm session.'),
    markdown: answer,
    recommendation: firstSentence(answer, 'Review the final markdown report for the recommendation.'),
    assumptionTable: project.assumptions.map((assumption) => ({
      assumption: assumption.text,
      impact: 'medium',
      basis: assumption.source,
    })),
    evidenceTable: [],
  };
}

function caseFileDatasetName(scenarioId: string): string {
  return `scenario-case-file:${scenarioId}`;
}

function artifactDatasetName(scenarioId: string, artifactType: ScenarioArtifactType, version: number): string {
  return `scenario-artifact:${scenarioId}:${artifactType}:v${version}`;
}

function parseArtifactDatasetName(
  datasetName: string,
  scenarioId: string,
): { artifactType: ScenarioArtifactType; version: number } | null {
  const prefix = `scenario-artifact:${scenarioId}:`;
  if (!datasetName.startsWith(prefix)) return null;

  const remainder = datasetName.slice(prefix.length);
  const versionMarker = remainder.lastIndexOf(':v');
  if (versionMarker <= 0) return null;

  const artifactType = remainder.slice(0, versionMarker);
  const version = Number.parseInt(remainder.slice(versionMarker + 2), 10);
  if (!isScenarioArtifactType(artifactType) || !Number.isFinite(version) || version <= 0) {
    return null;
  }

  return { artifactType, version };
}

function normalizeCaseFile(value: unknown): ScenarioCaseFile | null {
  if (!isRecord(value)) return null;

  const caseFileId = asString(value.caseFileId);
  const projectId = asString(value.projectId);
  const scenarioId = asString(value.scenarioId);
  const title = asString(value.title);
  const createdAt = asString(value.createdAt);
  const updatedAt = asString(value.updatedAt);

  if (!caseFileId || !projectId || !scenarioId || !title || !createdAt || !updatedAt) {
    return null;
  }

  const artifactRefs: Partial<Record<ScenarioArtifactType, string>> = {};
  if (isRecord(value.artifactRefs)) {
    for (const [key, ref] of Object.entries(value.artifactRefs)) {
      if (isScenarioArtifactType(key) && typeof ref === 'string' && ref.trim()) {
        artifactRefs[key] = ref.trim();
      }
    }
  }

  const latestVersions: Partial<Record<ScenarioArtifactType, number>> = {};
  if (isRecord(value.latestVersions)) {
    for (const [key, version] of Object.entries(value.latestVersions)) {
      if (isScenarioArtifactType(key)) {
        const parsed = asNumber(version);
        if (parsed != null) {
          latestVersions[key] = Math.floor(parsed);
        }
      }
    }
  }

  const evidenceDatasetRefs = Array.isArray(value.evidenceDatasetRefs)
    ? value.evidenceDatasetRefs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const evidenceIndex: Record<string, string> = {};
  if (isRecord(value.evidenceIndex)) {
    for (const [key, datasetName] of Object.entries(value.evidenceIndex)) {
      if (typeof datasetName === 'string' && datasetName.trim()) {
        evidenceIndex[key] = datasetName.trim();
      }
    }
  }

  return {
    caseFileId,
    projectId,
    scenarioId,
    title,
    createdAt,
    updatedAt,
    artifactRefs,
    latestVersions,
    evidenceDatasetRefs,
    evidenceIndex,
    finalRecommendationRef: asString(value.finalRecommendationRef),
    acceptanceStatusRef: asString(value.acceptanceStatusRef),
  };
}

function normalizeArtifact<T extends ScenarioArtifactType>(
  value: unknown,
  fallbackType?: T,
): ScenarioArtifact<T> | null {
  if (!isRecord(value)) return null;

  const artifactType = asString(value.artifactType);
  const version = asNumber(value.version);
  const projectId = asString(value.projectId);
  const scenarioId = asString(value.scenarioId);
  const artifactId = asString(value.artifactId);
  const title = asString(value.title);
  const provenance = isRecord(value.provenance) ? value.provenance : undefined;
  const provenanceSource = provenance && isRecord(provenance.source) ? provenance.source : undefined;
  const createdAt = asString(provenance?.createdAt);

  const resolvedArtifactType = (fallbackType ?? artifactType) as ScenarioArtifactType | undefined;
  if (
    !resolvedArtifactType ||
    !isScenarioArtifactType(resolvedArtifactType) ||
    !projectId ||
    !scenarioId ||
    !artifactId ||
    !title ||
    !createdAt ||
    version == null ||
    version <= 0
  ) {
    return null;
  }

  return {
    artifactId,
    projectId,
    scenarioId,
    artifactType: resolvedArtifactType,
    version: Math.floor(version),
    title,
    confidence: asNumber(value.confidence),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
    assumptionsUsed: Array.isArray(value.assumptionsUsed)
      ? value.assumptionsUsed.filter((item): item is string => typeof item === 'string')
      : [],
    evidenceRefs: Array.isArray(value.evidenceRefs)
      ? value.evidenceRefs.filter(
          (item): item is ScenarioArtifact['evidenceRefs'][number] =>
            isRecord(item) &&
            typeof item.evidenceId === 'string' &&
            typeof item.class === 'string' &&
            typeof item.label === 'string' &&
            typeof item.source === 'string',
        )
      : [],
    provenance: {
      createdAt,
      derivedFrom: Array.isArray(provenance?.derivedFrom)
        ? provenance.derivedFrom.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      source: provenanceSource
        ? {
            agent: isAgentStage(provenanceSource.agent) ? provenanceSource.agent : 'orchestrator',
            toolName: asString(provenanceSource.toolName),
            stepId: asString(provenanceSource.stepId),
            model: asString(provenanceSource.model),
          }
        : { agent: 'orchestrator' },
    },
    payload: value.payload as ScenarioArtifactPayloadMap[T],
  };
}

function saveCaseFile(caseFile: ScenarioCaseFile, source: string): void {
  saveNamedDataset(caseFile.projectId, {
    name: caseFileDatasetName(caseFile.scenarioId),
    kind: CASE_FILE_KIND,
    data: caseFile,
    source,
  });
}

export function saveScenarioCaseFile(
  projectId: string,
  scenarioId: string,
  caseFile: ScenarioCaseFile,
  source = 'case-file',
): ScenarioCaseFile {
  const normalized: ScenarioCaseFile = {
    ...caseFile,
    projectId,
    scenarioId,
    updatedAt: nowIso(),
    evidenceDatasetRefs: [...(caseFile.evidenceDatasetRefs ?? [])],
    evidenceIndex: { ...(caseFile.evidenceIndex ?? {}) },
  };

  saveCaseFile(normalized, source);
  return normalized;
}

export function loadScenarioCaseFile(
  projectId: string,
  scenarioId: string,
): ScenarioCaseFile | null {
  const project = loadProject(projectId);
  const dataset = project.namedDatasets[caseFileDatasetName(scenarioId)];
  return normalizeCaseFile(dataset?.data);
}

export function ensureScenarioCaseFile(
  projectId: string,
  scenarioId: string,
  title = scenarioId,
): ScenarioCaseFile {
  const existing = loadScenarioCaseFile(projectId, scenarioId);
  if (existing) return existing;

  const timestamp = nowIso();
  const caseFile: ScenarioCaseFile = {
    caseFileId: randomUUID(),
    projectId,
    scenarioId,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    artifactRefs: {},
    latestVersions: {},
    evidenceDatasetRefs: [],
    evidenceIndex: {},
  };

  saveCaseFile(caseFile, 'case-file');
  return caseFile;
}

export interface PersistScenarioArtifactOptions<T extends ScenarioArtifactType> {
  projectId: string;
  scenarioId: string;
  artifactType: T;
  payload: ScenarioArtifactPayloadMap[T];
  source: ArtifactSource;
  confidence?: number;
  warnings?: string[];
  assumptionsUsed?: string[];
  evidenceRefs?: ScenarioArtifact['evidenceRefs'];
  derivedFrom?: string[];
  title?: string;
}

export function persistScenarioArtifact<T extends ScenarioArtifactType>(
  options: PersistScenarioArtifactOptions<T>,
): ScenarioArtifact<T> {
  const caseFile = ensureScenarioCaseFile(options.projectId, options.scenarioId);
  const version = (caseFile.latestVersions[options.artifactType] ?? 0) + 1;
  const createdAt = nowIso();
  const artifact: ScenarioArtifact<T> = {
    artifactId: randomUUID(),
    projectId: options.projectId,
    scenarioId: options.scenarioId,
    artifactType: options.artifactType,
    version,
    title: options.title ?? `${options.artifactType} v${version}`,
    confidence: options.confidence,
    warnings: [...(options.warnings ?? [])],
    assumptionsUsed: [...(options.assumptionsUsed ?? [])],
    evidenceRefs: [...(options.evidenceRefs ?? [])],
    provenance: {
      createdAt,
      derivedFrom: [...(options.derivedFrom ?? [])],
      source: options.source,
    },
    payload: options.payload,
  };

  const datasetName = artifactDatasetName(options.scenarioId, options.artifactType, version);
  saveNamedDataset(options.projectId, {
    name: datasetName,
    kind: ARTIFACT_KIND,
    data: artifact,
    source: options.source.agent,
  });

  saveCaseFile(
    {
      ...caseFile,
      updatedAt: createdAt,
      artifactRefs: {
        ...caseFile.artifactRefs,
        [options.artifactType]: datasetName,
      },
      latestVersions: {
        ...caseFile.latestVersions,
        [options.artifactType]: version,
      },
      ...(options.artifactType === 'final-report' ? { finalRecommendationRef: datasetName } : {}),
      ...(options.artifactType === 'acceptance-status' ? { acceptanceStatusRef: datasetName } : {}),
    },
    options.source.agent,
  );

  return artifact;
}

export function listScenarioArtifacts(
  projectId: string,
  scenarioId: string,
  artifactType?: ScenarioArtifactType,
): ScenarioArtifact[] {
  const project = loadProject(projectId);
  const prefix = `scenario-artifact:${scenarioId}:`;

  return Object.entries(project.namedDatasets)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, dataset]) => {
      const parsed = parseArtifactDatasetName(name, scenarioId);
      if (!parsed) return null;
      if (artifactType && parsed.artifactType !== artifactType) return null;
      return normalizeArtifact(dataset.data, parsed.artifactType);
    })
    .filter((artifact): artifact is ScenarioArtifact => Boolean(artifact))
    .sort((a, b) => {
      const typeRank = SCENARIO_ARTIFACT_TYPES.indexOf(a.artifactType) - SCENARIO_ARTIFACT_TYPES.indexOf(b.artifactType);
      if (typeRank !== 0) return typeRank;
      if (a.version !== b.version) return a.version - b.version;
      return a.artifactId.localeCompare(b.artifactId);
    });
}

export function loadLatestScenarioArtifact<T extends ScenarioArtifactType>(
  projectId: string,
  scenarioId: string,
  artifactType: T,
): ScenarioArtifact<T> | null {
  const caseFile = loadScenarioCaseFile(projectId, scenarioId);
  const datasetName = caseFile?.artifactRefs[artifactType];
  if (datasetName) {
    const project = loadProject(projectId);
    const artifact = normalizeArtifact(project.namedDatasets[datasetName]?.data, artifactType);
    if (artifact) return artifact;
  }

  const artifacts = listScenarioArtifacts(projectId, scenarioId, artifactType);
  return (artifacts.length > 0 ? artifacts[artifacts.length - 1] : null) as ScenarioArtifact<T> | null;
}

export function loadLatestScenarioArtifacts(
  projectId: string,
  scenarioId: string,
): Partial<Record<ScenarioArtifactType, ScenarioArtifact>> {
  const result: Partial<Record<ScenarioArtifactType, ScenarioArtifact>> = {};

  for (const artifactType of SCENARIO_ARTIFACT_TYPES) {
    const latest = loadLatestScenarioArtifact(projectId, scenarioId, artifactType);
    if (latest) {
      result[artifactType] = latest;
    }
  }

  return result;
}

export function buildSwarmSessionProjectRecord(
  query: string,
  session: SwarmSessionLike,
  options: BuildSwarmSessionProjectRecordOptions = {},
): Omit<ProjectAgentSession, 'id' | 'createdAt'> {
  const stepCount = session.steps.length;
  const stepAgents = Array.from(new Set(session.steps.map((step) => step.agent)));
  const stepTypes = Array.from(new Set(session.steps.map((step) => step.type)));

  return {
    mode: options.mode ?? 'swarm',
    query,
    answer: options.answer,
    summary: options.summary ?? 'Swarm session',
    stepCount,
    tokens: session.totalTokens,
    latencyMs: session.totalLatencyMs,
    context: {
      ...session.context,
      swarmSession: {
        stepCount,
        reviewPassed: session.reviewPassed,
        corrections: [...session.corrections],
        totalTokens: session.totalTokens,
        totalLatencyMs: session.totalLatencyMs,
        agents: stepAgents,
        stepTypes,
        firstStepAt: session.steps[0]?.timestamp,
        lastStepAt: stepCount > 0 ? session.steps[stepCount - 1].timestamp : undefined,
      },
    },
    metadata: {
      ...(options.metadata ?? {}),
      reviewPassed: session.reviewPassed,
      corrections: [...session.corrections],
      stepCount,
      stepAgents,
    },
  };
}

export function persistSwarmCaseFile(
  projectId: string,
  query: string,
  session: SwarmSessionLike,
): PersistSwarmCaseFileResult {
  const scenarioId = asString(session.context.scenarioId) ?? toScenarioId(query);
  const caseFile = ensureScenarioCaseFile(projectId, scenarioId, titleFromTask(query));
  const artifactRefs: Partial<Record<ScenarioArtifactType, string>> = {};

  const groundModel = buildGroundModelPayload(session);
  if (groundModel) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'ground-model',
      payload: groundModel,
      source: { agent: 'interpretation' },
      title: 'Ground model snapshot',
    });
    artifactRefs['ground-model'] = artifact.artifactId;
  }

  const assumptions = buildAssumptionsPayload(projectId);
  if (assumptions) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'assumptions',
      payload: assumptions,
      source: { agent: 'interpretation' },
      title: 'Project assumptions snapshot',
    });
    artifactRefs.assumptions = artifact.artifactId;
  }

  const analysisPlan = buildAnalysisPlanPayload(query, session);
  if (analysisPlan) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'analysis-plan',
      payload: analysisPlan,
      source: { agent: 'simulation' },
      title: 'Swarm analysis plan',
    });
    artifactRefs['analysis-plan'] = artifact.artifactId;
  }

  const results = buildResultsPayload(scenarioId, session);
  if (results) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'results',
      payload: results,
      source: { agent: 'simulation' },
      title: 'Swarm simulation results',
    });
    artifactRefs.results = artifact.artifactId;
  }

  const checklist = buildReviewChecklistPayload(session);
  const checklistArtifact = persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'review-checklist',
    payload: checklist,
    source: { agent: 'reviewer' },
    title: 'Reviewer checklist snapshot',
  });
  artifactRefs['review-checklist'] = checklistArtifact.artifactId;

  const acceptance = persistScenarioArtifact({
    projectId,
    scenarioId,
    artifactType: 'acceptance-status',
    payload: buildAcceptanceStatusPayload(session),
    source: { agent: 'reviewer' },
    title: 'Reviewer acceptance status',
  });
  artifactRefs['acceptance-status'] = acceptance.artifactId;

  const issues = buildIssuesPayload(session);
  if (issues) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'issues-and-corrections',
      payload: issues,
      source: { agent: 'reviewer' },
      title: 'Reviewer issues and corrections',
    });
    artifactRefs['issues-and-corrections'] = artifact.artifactId;
  }

  const answer = extractAnswer(session);
  if (answer) {
    const artifact = persistScenarioArtifact({
      projectId,
      scenarioId,
      artifactType: 'final-report',
      payload: buildFinalReportPayload(projectId, answer),
      source: { agent: 'orchestrator' },
      title: 'Swarm final report',
    });
    artifactRefs['final-report'] = artifact.artifactId;
  }

  const latest = loadScenarioCaseFile(projectId, scenarioId);
  return {
    scenarioId,
    caseFileId: latest?.caseFileId ?? caseFile.caseFileId,
    artifactRefs,
  };
}

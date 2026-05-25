import type { LLMConfig } from '../llm/types.js';
import { buildProviderOperatingContract, type ProviderOperatingContract } from '../agents/provider-operating-contract.js';
import type { ProjectManifest } from './manifest.js';
import type { ProjectWorkflowTask } from './project-workflow-executor.js';

export type ProjectWorkflowRouteExecutionMode = 'deterministic-sequence' | 'needs-selection';
export type ProjectWorkflowRouteSelectionSource = 'explicit' | 'deterministic' | 'model' | 'merged' | 'none';

export interface ProjectWorkflowRouteRejectedTask {
  value: string;
  reason: string;
}

export interface ProjectWorkflowRouterSelection {
  tasks: ProjectWorkflowTask[];
  rejectedTasks: ProjectWorkflowRouteRejectedTask[];
  rationale: string[];
  requiresCustomQuestion?: boolean;
}

export interface ProjectWorkflowRouteModelCall {
  type: 'model_call';
  purpose: 'project-workflow-router';
  status: 'pass' | 'review' | 'failed';
  provider?: LLMConfig['provider'];
  model?: string;
  latencyMs?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  promptChars?: number;
  outputChars?: number;
  error?: string;
}

export interface ProjectWorkflowRoutePlan {
  schemaVersion: 'geotech.project-workflow-route-plan.v1';
  routeId: string;
  runId: string;
  generatedAt: string;
  prompt: string;
  executionMode: ProjectWorkflowRouteExecutionMode;
  tasks: ProjectWorkflowTask[];
  confidence: number;
  selectionSource: ProjectWorkflowRouteSelectionSource;
  rationale: string[];
  rejectedTasks: ProjectWorkflowRouteRejectedTask[];
  providerContract: {
    providerNeutral: true;
    purpose: 'project-workflow-routing';
    llmRole: 'planner-reviewer-only';
    deterministicExecutionRequired: true;
    allowedTasks: ProjectWorkflowTask[];
    disallowedActions: string[];
    providerProfile?: ProviderOperatingContract['profile'];
    contextStrategy?: ProviderOperatingContract['contextStrategy'];
    reviewGates?: string[];
  };
  evidenceSummary?: {
    supportedFiles: number;
    branches: string[];
    hasGroundModel: boolean;
    hasVerifier: boolean;
  };
  trace: {
    steps: Array<{
      type: 'router' | 'review_gate';
      status: 'pass' | 'review' | 'blocked';
      detail: string;
    }>;
  };
  modelCalls: ProjectWorkflowRouteModelCall[];
}

export interface RouteProjectWorkflowRequestOptions {
  prompt: string;
  manifest?: ProjectManifest;
  requestedTasks?: Array<ProjectWorkflowTask | string>;
  llmSelection?: unknown;
  modelCalls?: ProjectWorkflowRouteModelCall[];
  providerConfig?: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>;
  runId?: string;
  now?: string;
}

export interface BuildProjectWorkflowRouterPromptOptions {
  prompt: string;
  manifest?: ProjectManifest;
  providerConfig?: Pick<LLMConfig, 'provider' | 'modelId' | 'visionModelId'>;
  compact?: boolean;
}

export const PROJECT_WORKFLOW_ROUTER_TASKS: ProjectWorkflowTask[] = [
  'data-quality',
  'ground-model',
  'calculation-readiness',
  'risk-analysis',
  'anomaly-detection',
  'recommendations',
  'visualization',
];

export const PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE = 0.6;

const DISALLOWED_ROUTER_ACTIONS = [
  'invent calculation results',
  'modify source files outside .geotech outputs',
  'run FEM or design math without deterministic validators',
  'treat LLM confidence as engineering verification',
  'claim PDF/image inspection without normalized evidence',
];

export function normalizeProjectWorkflowRouteTask(value: unknown): ProjectWorkflowTask | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  switch (normalized) {
    case 'data':
    case 'data-quality':
    case 'inventory':
    case 'quality':
    case 'quality-report':
      return 'data-quality';
    case 'ground':
    case 'ground-model':
    case 'ground-model-interpretation':
    case 'interpretation':
    case 'stratigraphy':
      return 'ground-model';
    case 'calculation':
    case 'calculations':
    case 'calculation-readiness':
    case 'calculation-routing':
    case 'calc-readiness':
    case 'design-readiness':
    case 'bearing':
    case 'bearing-capacity':
    case 'settlement':
    case 'pile':
    case 'pile-capacity':
    case 'liquefaction':
    case 'slope':
    case 'slope-stability':
    case 'fem-readiness':
    case 'fem-foundation':
    case 'fem-foundation-settlement':
    case 'fem-excavation':
    case 'fem-excavation-deformation':
      return 'calculation-readiness';
    case 'risk':
    case 'risks':
    case 'risk-analysis':
    case 'hazard':
    case 'hazards':
      return 'risk-analysis';
    case 'anomaly':
    case 'anomalies':
    case 'anomaly-detection':
    case 'conflict':
    case 'conflict-detection':
    case 'outlier':
    case 'outliers':
      return 'anomaly-detection';
    case 'recommendation':
    case 'recommendations':
    case 'next-actions':
    case 'foundation-recommendations':
      return 'recommendations';
    case 'viz':
    case 'visualize':
    case 'visualization':
    case 'visualizations':
    case 'map':
    case 'plots':
    case 'charts':
      return 'visualization';
    default:
      return undefined;
  }
}

export function parseProjectWorkflowRouterSelection(raw: unknown): ProjectWorkflowRouterSelection {
  const payload = coerceRouterPayload(raw);
  const proposed = Array.isArray(payload?.tasks)
    ? payload.tasks
    : payload?.task != null
      ? [payload.task]
      : [];
  const tasks: ProjectWorkflowTask[] = [];
  const rejectedTasks: ProjectWorkflowRouteRejectedTask[] = [];

  for (const value of proposed) {
    const normalized = normalizeProjectWorkflowRouteTask(value);
    if (normalized) {
      if (!tasks.includes(normalized)) tasks.push(normalized);
    } else {
      rejectedTasks.push({
        value: String(value),
        reason: `Not an allowed deterministic project workflow task. Allowed tasks: ${PROJECT_WORKFLOW_ROUTER_TASKS.join(', ')}.`,
      });
    }
  }

  const rationale = Array.isArray(payload?.rationale)
    ? payload.rationale.map((item: unknown) => String(item)).filter(Boolean).slice(0, 8)
    : typeof payload?.rationale === 'string'
      ? [payload.rationale]
      : [];

  const requiresCustomQuestion = payload?.requiresCustomQuestion === true
    || payload?.requires_custom_question === true
    || payload?.customQuestion === true
    || payload?.needsAgent === true;

  return { tasks, rejectedTasks, rationale, requiresCustomQuestion };
}

export function inferProjectWorkflowRouteTasks(prompt: string): ProjectWorkflowRouterSelection {
  const lower = prompt.toLowerCase();
  const tasks: ProjectWorkflowTask[] = [];
  const rationale: string[] = [];
  const add = (task: ProjectWorkflowTask, pattern: RegExp, reason: string) => {
    if (pattern.test(lower) && !tasks.includes(task)) {
      tasks.push(task);
      rationale.push(reason);
    }
  };

  add('data-quality', /\b(?:data quality|inventory|missing data|quality report|duplicate|file audit|data audit)\b/, 'Matched data inventory, quality, missing-data, or duplicate-source language.');
  add('ground-model', /\b(?:ground model|interpret|strata|stratigraphy|lithology|hydrogeology|borehole model)\b/, 'Matched ground-model, interpretation, strata, lithology, or borehole-model language.');
  add('calculation-readiness', /\b(?:calculation readiness|calculation route|calculation routing|design readiness|design route|bearing(?: capacity| calculation| readiness)?|settlement(?: calculation| readiness)?|pile(?: capacity| calculation| readiness)?|liquefaction(?: calculation| readiness)?|slope(?: stability| calculation| readiness)?|fem(?: draft| readiness| foundation settlement| excavation deformation)?|ready for calculation|ready for design)\b/, 'Matched calculation-readiness, design-readiness, bearing, settlement, pile, liquefaction, slope, or FEM-draft routing language.');
  add('risk-analysis', /\b(?:risk|risks|hazard|hazards|limitation|limitations|uncertainty|mitigation|concern|failure mode)\b/, 'Matched risk, hazard, limitation, uncertainty, or mitigation language.');
  add('anomaly-detection', /\b(?:anomal\w*|conflict|outlier|inconsistent|inconsistency|mismatch|contradiction)\b/, 'Matched anomaly, conflict, outlier, inconsistency, or contradiction language.');
  add('recommendations', /\b(?:recommend|recommendation|foundation option|advice|next action|what should)\b/, 'Matched recommendation, foundation-option, advice, or next-action language.');
  add('visualization', /\b(?:visual\w*|map|plot|chart|section|profile|strip log|dashboard)\b/, 'Matched visualization, map, plot, chart, profile, or strip-log language.');

  return {
    tasks,
    rejectedTasks: [],
    rationale,
    requiresCustomQuestion: tasks.length === 0,
  };
}

export function routeProjectWorkflowRequest(options: RouteProjectWorkflowRequestOptions): ProjectWorkflowRoutePlan {
  const generatedAt = options.now ?? new Date().toISOString();
  const runId = options.runId ?? `run_${generatedAt.replace(/\D/g, '').slice(0, 17)}`;
  const routeId = `route_${runId.replace(/^run_/, '')}`;
  const providerContract = options.providerConfig
    ? buildProviderOperatingContract(options.providerConfig, { task: 'project-workflow-router', compact: true })
    : undefined;
  const explicitSelection = options.requestedTasks?.length
    ? parseProjectWorkflowRouterSelection({ tasks: options.requestedTasks, rationale: ['Explicit workflow task selection supplied by CLI/user input.'] })
    : undefined;
  const modelSelection = options.llmSelection != null
    ? parseProjectWorkflowRouterSelection(options.llmSelection)
    : undefined;
  const inferredSelection = !explicitSelection && (!modelSelection || modelSelection.tasks.length === 0)
    ? inferProjectWorkflowRouteTasks(options.prompt)
    : undefined;
  const selection = explicitSelection
    ?? (modelSelection && modelSelection.tasks.length > 0 ? modelSelection : undefined)
    ?? mergeSelections(inferredSelection, modelSelection)
    ?? { tasks: [], rejectedTasks: [], rationale: [] };
  const selectionSource = deriveSelectionSource({
    explicit: explicitSelection,
    model: modelSelection,
    inferred: inferredSelection,
    selection,
  });
  const confidence = deriveRouteConfidence(selection, Boolean(explicitSelection), Boolean(modelSelection), options.manifest);
  const executionMode: ProjectWorkflowRouteExecutionMode = selection.tasks.length > 0
    && !selection.requiresCustomQuestion
    && confidence >= PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE
    ? 'deterministic-sequence'
    : 'needs-selection';
  const modelCalls = options.modelCalls ?? [];

  return {
    schemaVersion: 'geotech.project-workflow-route-plan.v1',
    routeId,
    runId,
    generatedAt,
    prompt: options.prompt,
    executionMode,
    tasks: selection.tasks,
    confidence,
    selectionSource,
    rationale: selection.rationale.length > 0
      ? selection.rationale
      : executionMode === 'needs-selection'
        ? ['No deterministic project workflow intent was confidently identified; route requires custom question handling or user selection.']
        : ['Validated deterministic workflow route.'],
    rejectedTasks: selection.rejectedTasks,
    providerContract: {
      providerNeutral: true,
      purpose: 'project-workflow-routing',
      llmRole: 'planner-reviewer-only',
      deterministicExecutionRequired: true,
      allowedTasks: PROJECT_WORKFLOW_ROUTER_TASKS,
      disallowedActions: DISALLOWED_ROUTER_ACTIONS,
      providerProfile: providerContract?.profile,
      contextStrategy: providerContract?.contextStrategy,
      reviewGates: providerContract?.reviewGates,
    },
    evidenceSummary: options.manifest
      ? {
          supportedFiles: options.manifest.summary.supportedFiles,
          branches: options.manifest.summary.branches,
          hasGroundModel: Boolean(options.manifest.groundModel),
          hasVerifier: Boolean(options.manifest.verifier),
        }
      : undefined,
    trace: {
      steps: [
        {
          type: 'router',
          status: executionMode === 'deterministic-sequence' ? 'pass' : 'review',
          detail: executionMode === 'deterministic-sequence'
            ? `Routed to deterministic workflow task(s): ${selection.tasks.join(', ')} from ${selectionSource} selection.`
            : selection.requiresCustomQuestion
              ? 'Router selection requires custom question handling; keep the request in the workspace-backed LLM path.'
              : selection.tasks.length > 0
              ? `Route confidence ${confidence.toFixed(2)} is below the ${PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE.toFixed(2)} execution gate; keep the request in custom LLM review or ask the user to choose a task.`
              : 'No deterministic workflow route selected; keep the request in custom LLM review or ask the user to choose a task.',
        },
        {
          type: 'review_gate',
          status: 'review',
          detail: 'The LLM may select and review workflow routes only. Deterministic GeotechCLI executors own calculations, FEM cases, validation, and persisted artifacts.',
        },
      ],
    },
    modelCalls,
  };
}

export function buildProjectWorkflowRouterPrompt(options: BuildProjectWorkflowRouterPromptOptions): string {
  const providerPrompt = options.providerConfig
    ? buildProviderOperatingContract(options.providerConfig, { task: 'project-workflow-router', compact: options.compact === true }).prompt
    : 'Provider operating contract: provider-neutral planner; route only, do not calculate.';
  const manifestSummary = options.manifest
    ? [
        `supportedFiles=${options.manifest.summary.supportedFiles}`,
        `branches=${options.manifest.summary.branches.join(',') || 'none'}`,
        `hasGroundModel=${Boolean(options.manifest.groundModel)}`,
        `hasVerifier=${Boolean(options.manifest.verifier)}`,
      ].join('; ')
    : 'manifest=not-attached';

  return [
    providerPrompt,
    '',
    '## PROJECT WORKFLOW ROUTER CONTRACT',
    'You are only selecting deterministic GeotechCLI project workflows. You are not doing engineering math, FEM simulation, OCR, PDF reading, or source-file edits.',
    `Allowed tasks: ${PROJECT_WORKFLOW_ROUTER_TASKS.join(', ')}.`,
    `Disallowed actions: ${DISALLOWED_ROUTER_ACTIONS.join('; ')}.`,
    `Workspace evidence summary: ${manifestSummary}.`,
    '',
    'Return strict JSON only:',
    '{"tasks":["risk-analysis"],"rationale":["why these deterministic workflow tasks match"],"confidence":0.74,"requiresCustomQuestion":false}',
    '',
    'User request:',
    options.prompt.trim() || '(no prompt; ask user to select a workflow)',
  ].join('\n');
}

function coerceRouterPayload(raw: unknown): any {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function deriveRouteConfidence(
  selection: ProjectWorkflowRouterSelection,
  explicit: boolean,
  modelSuggested: boolean,
  manifest?: ProjectManifest,
): number {
  if (selection.tasks.length === 0) return 0.2;
  let confidence = explicit ? 0.95 : modelSuggested ? 0.82 : 0.72;
  if (selection.tasks.length > 1) confidence -= 0.04;
  if (selection.rejectedTasks.length > 0) confidence -= 0.15;
  if (manifest && manifest.summary.supportedFiles === 0) confidence -= 0.2;
  if (modelSuggested && manifest && manifest.summary.supportedFiles === 0) {
    confidence = Math.min(confidence, PROJECT_WORKFLOW_ROUTE_MIN_CONFIDENCE - 0.05);
  }
  return Math.max(0.1, Math.min(0.99, Number(confidence.toFixed(2))));
}

function deriveSelectionSource(input: {
  explicit?: ProjectWorkflowRouterSelection;
  model?: ProjectWorkflowRouterSelection;
  inferred?: ProjectWorkflowRouterSelection;
  selection: ProjectWorkflowRouterSelection;
}): ProjectWorkflowRouteSelectionSource {
  if (input.explicit) return 'explicit';
  if (input.model && input.model.tasks.length > 0) return 'model';
  if (input.inferred && input.inferred.tasks.length > 0 && input.model) return 'merged';
  if (input.inferred && input.inferred.tasks.length > 0) return 'deterministic';
  if (input.model) return 'model';
  return 'none';
}

function mergeSelections(
  primary: ProjectWorkflowRouterSelection | undefined,
  secondary: ProjectWorkflowRouterSelection | undefined,
): ProjectWorkflowRouterSelection | undefined {
  if (!primary && !secondary) return undefined;
  return {
    tasks: primary?.tasks ?? [],
    rejectedTasks: [...(primary?.rejectedTasks ?? []), ...(secondary?.rejectedTasks ?? [])],
    rationale: [...(primary?.rationale ?? []), ...(secondary?.rationale ?? [])],
    requiresCustomQuestion: primary?.requiresCustomQuestion === true || secondary?.requiresCustomQuestion === true,
  };
}

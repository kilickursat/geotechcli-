// Agent task evaluation benchmark contract.
//
// Deterministic scoreboard for the agentic harness: scenarios drive the REAL runAgent /
// runSwarm / runProjectWorkflow loops with scripted model turns (zero network), and this
// module owns the scenario schema, session scoring, report/trend contracts, path safety,
// and renderers. It stays structurally decoupled from brain.ts/swarm.ts (no runtime
// imports) so unit tests can feed synthetic sessions without registering tools.

export type AgentTaskScenarioKind = 'task' | 'guardrail';
export type AgentTaskAgentPath = 'agent' | 'swarm' | 'workflow';
export type AgentTaskOutcome = 'completed' | 'unresolved' | 'blocked';
export type AgentTaskFixtureFileKind = 'spt-csv' | 'lab-csv' | 'monitoring-csv' | 'ags';

export interface AgentTaskScenarioWorkspaceFile {
  path: string;
  kind: AgentTaskFixtureFileKind;
}

export interface AgentTaskNumericBinding {
  /** Tool whose deterministic result provides the value. */
  tool: string;
  /** Dot path into the tool result data, e.g. "ultimateBearingCapacity". */
  resultPath: string;
}

export interface AgentTaskScenarioExpectations {
  outcome: AgentTaskOutcome;
  requiredTools: string[];
  forbiddenTools: string[];
  /** Tools that must have been attempted AND rejected/failed by the runtime (fail-closed proof). */
  requiredFailedTools?: string[];
  finalMustInclude?: string[];
  finalMustNotInclude?: string[];
  numericBindings?: AgentTaskNumericBinding[];
  /** Scripted model turns the scenario may consume (agent loop caps at 8; swarm review cycles may need more, up to 24). */
  maxModelTurns: number;
}

export interface AgentTaskScenario {
  id: string;
  title: string;
  kind: AgentTaskScenarioKind;
  agentPath: AgentTaskAgentPath;
  workspace: { files: AgentTaskScenarioWorkspaceFile[] };
  prompt: string;
  /** Raw model responses (fenced ```tool / ```handoff / ```review blocks) in call order. */
  scriptedTurns: string[];
  /** Repeat the final scripted turn instead of failing when the loop asks for more turns. */
  repeatLastTurn?: boolean;
  /** For agentPath 'workflow': the deterministic project workflow task to execute. */
  workflowTask?: string;
  /** Options forwarded to runAgent (subset that scenarios may set). */
  agentRunOptions?: { requiredToolsBeforeFinal?: string[] };
  expectations: AgentTaskScenarioExpectations;
}

export interface AgentTaskScenarioRegistry {
  kind: 'agent-task-scenario-registry';
  schemaVersion: 1;
  scenarios: AgentTaskScenario[];
}

export interface AgentTaskScenarioRegistryValidation {
  ok: boolean;
  failures: string[];
  scenarios: AgentTaskScenario[];
}

// ---------------------------------------------------------------------------
// Session shapes (structural, compatible with AgentSession / SwarmSession)
// ---------------------------------------------------------------------------

export interface AgentTaskSessionStepLike {
  type: string;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: { success?: boolean; data?: unknown; error?: string };
  agent?: string;
}

export interface AgentTaskSessionLike {
  steps: AgentTaskSessionStepLike[];
  totalTokens?: number;
  totalLatencyMs?: number;
  /** Present on swarm sessions; false marks an unresolved/rejected review. */
  reviewPassed?: boolean;
}

export interface AgentTaskRuntimeStats {
  scriptedTurnsUsed: number;
  unscriptedCallCount: number;
  networkAttempts: number;
}

export interface AgentTaskNumericBindingResult {
  tool: string;
  resultPath: string;
  value: number | string | null;
  foundInFinal: boolean;
}

export interface AgentTaskScenarioObservation {
  scenarioId: string;
  outcome: AgentTaskOutcome;
  finalAnswer: string;
  attemptedTools: string[];
  executedTools: string[];
  failedOrBlockedTools: string[];
  numericBindings: AgentTaskNumericBindingResult[];
  scriptedTurnsUsed: number;
  unscriptedCallCount: number;
  networkAttempts: number;
  totalTokens: number | null;
  totalLatencyMs: number | null;
}

export interface AgentTaskScenarioResult {
  scenarioId: string;
  title: string;
  kind: AgentTaskScenarioKind;
  agentPath: AgentTaskAgentPath;
  ok: boolean;
  outcome: { expected: AgentTaskOutcome; observed: AgentTaskOutcome };
  regressions: string[];
  warnings: string[];
  executedTools: string[];
  failedOrBlockedTools: string[];
  numericBindings: AgentTaskNumericBindingResult[];
  scriptedTurnsUsed: number;
  unscriptedCallCount: number;
  networkAttempts: number;
  totalTokens: number | null;
  totalLatencyMs: number | null;
}

export interface AgentTaskBenchmarkReportContractValidation {
  ok: boolean;
  scenarioIds: string[];
  failures: string[];
  warnings: string[];
}

export interface AgentTaskBenchmarkReport {
  kind: 'geotech-agent-task-benchmark';
  schemaVersion: 1;
  generatedAt: string;
  results: AgentTaskScenarioResult[];
  summary: {
    scenarioCount: number;
    passedScenarios: number;
    failedScenarios: number;
    taskScenarios: number;
    guardrailScenarios: number;
    agentPaths: AgentTaskAgentPath[];
    totalUnscriptedCalls: number;
    totalNetworkAttempts: number;
    passed: boolean;
  };
  contractValidation?: AgentTaskBenchmarkReportContractValidation;
}

export interface AgentTaskBenchmarkReportContractOptions {
  requiredScenarioIds?: string[];
}

export interface AgentTaskBenchmarkArtifactSafety {
  ok: boolean;
  leaks: string[];
}

export interface AgentTaskBenchmarkHistoryEntry {
  kind: 'geotech-agent-task-benchmark-history-entry';
  schemaVersion: 1;
  generatedAt: string;
  summary: {
    scenarioCount: number;
    passedScenarios: number;
    failedScenarios: number;
    guardrailScenarios: number;
    passed: boolean;
    totalTokens: number | null;
    pathLeakCount: number;
  };
}

export interface AgentTaskBenchmarkTrendReport {
  kind: 'geotech-agent-task-benchmark-trend';
  schemaVersion: 1;
  generatedAt: string;
  current: AgentTaskBenchmarkHistoryEntry;
  previous: AgentTaskBenchmarkHistoryEntry | null;
  delta: {
    scenarioCount: number;
    passedScenarios: number;
    failedScenarios: number;
    guardrailScenarios: number;
    totalTokens: number | null;
    pathLeakCount: number;
  } | null;
  historyCount: number;
  note: string;
}

export interface AgentTaskBenchmarkTrend {
  history: AgentTaskBenchmarkHistoryEntry[];
  report: AgentTaskBenchmarkTrendReport;
}

export interface AgentTaskBenchmarkTrendContractValidation {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Scenario registry validation
// ---------------------------------------------------------------------------

const AGENT_TASK_SCENARIO_KINDS = new Set<AgentTaskScenarioKind>(['task', 'guardrail']);
const AGENT_TASK_AGENT_PATHS = new Set<AgentTaskAgentPath>(['agent', 'swarm', 'workflow']);
const AGENT_TASK_OUTCOMES = new Set<AgentTaskOutcome>(['completed', 'unresolved', 'blocked']);
const AGENT_TASK_FIXTURE_KINDS = new Set<AgentTaskFixtureFileKind>([
  'spt-csv',
  'lab-csv',
  'monitoring-csv',
  'ags',
]);
// runAgent caps at 8 iterations; swarm sessions (multi-role + review cycles) may consume more calls.
const AGENT_TASK_MAX_MODEL_TURNS = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeAgentTaskFailureToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
}

export function validateAgentTaskScenarioRegistry(value: unknown): AgentTaskScenarioRegistryValidation {
  const failures: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, failures: ['registry_not_an_object'], scenarios: [] };
  }
  if (value.kind !== 'agent-task-scenario-registry') {
    failures.push('wrong_registry_kind');
  }
  if (value.schemaVersion !== 1) {
    failures.push('wrong_registry_schema_version');
  }
  const scenariosRaw = Array.isArray(value.scenarios) ? value.scenarios : null;
  if (!scenariosRaw || scenariosRaw.length === 0) {
    failures.push('registry_has_no_scenarios');
    return { ok: false, failures, scenarios: [] };
  }

  const scenarios: AgentTaskScenario[] = [];
  const seenIds = new Set<string>();
  for (const [index, raw] of scenariosRaw.entries()) {
    const label = isRecord(raw) && typeof raw.id === 'string' ? raw.id : `index_${index}`;
    if (!isRecord(raw)) {
      failures.push(`scenario_not_an_object_${label}`);
      continue;
    }
    if (typeof raw.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id)) {
      failures.push(`scenario_id_invalid_${sanitizeAgentTaskFailureToken(label)}`);
      continue;
    }
    if (seenIds.has(raw.id)) {
      failures.push(`scenario_id_duplicate_${sanitizeAgentTaskFailureToken(raw.id)}`);
      continue;
    }
    seenIds.add(raw.id);

    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      failures.push(`scenario_title_missing_${raw.id}`);
    }
    if (!AGENT_TASK_SCENARIO_KINDS.has(raw.kind as AgentTaskScenarioKind)) {
      failures.push(`scenario_kind_invalid_${raw.id}`);
    }
    if (!AGENT_TASK_AGENT_PATHS.has(raw.agentPath as AgentTaskAgentPath)) {
      failures.push(`scenario_agent_path_invalid_${raw.id}`);
    }
    if (typeof raw.prompt !== 'string' || !raw.prompt.trim()) {
      failures.push(`scenario_prompt_missing_${raw.id}`);
    }
    if (!isStringArray(raw.scriptedTurns)) {
      failures.push(`scenario_scripted_turns_invalid_${raw.id}`);
    } else if (raw.agentPath === 'workflow' && raw.scriptedTurns.length > 0) {
      failures.push(`workflow_scenario_must_have_no_scripted_turns_${raw.id}`);
    } else if (raw.agentPath !== 'workflow' && raw.scriptedTurns.length === 0) {
      failures.push(`scenario_scripted_turns_empty_${raw.id}`);
    }
    if (raw.agentPath === 'workflow' && (typeof raw.workflowTask !== 'string' || !raw.workflowTask.trim())) {
      failures.push(`workflow_scenario_missing_workflow_task_${raw.id}`);
    }

    const workspace = isRecord(raw.workspace) ? raw.workspace : null;
    const files = workspace && Array.isArray(workspace.files) ? workspace.files : null;
    if (!files) {
      failures.push(`scenario_workspace_files_missing_${raw.id}`);
    } else {
      for (const file of files) {
        if (!isRecord(file) || typeof file.path !== 'string') {
          failures.push(`workspace_file_invalid_${raw.id}`);
          continue;
        }
        if (/^(?:[A-Za-z]:|[\\/])/.test(file.path) || file.path.includes('..')) {
          failures.push(`workspace_file_path_not_relative_${raw.id}`);
        }
        if (!AGENT_TASK_FIXTURE_KINDS.has(file.kind as AgentTaskFixtureFileKind)) {
          failures.push(`workspace_file_kind_invalid_${raw.id}`);
        }
      }
    }

    const expectations = isRecord(raw.expectations) ? raw.expectations : null;
    if (!expectations) {
      failures.push(`scenario_expectations_missing_${raw.id}`);
      continue;
    }
    if (!AGENT_TASK_OUTCOMES.has(expectations.outcome as AgentTaskOutcome)) {
      failures.push(`expected_outcome_invalid_${raw.id}`);
    }
    if (!isStringArray(expectations.requiredTools) || !isStringArray(expectations.forbiddenTools)) {
      failures.push(`expected_tool_lists_invalid_${raw.id}`);
    }
    if (expectations.requiredFailedTools !== undefined && !isStringArray(expectations.requiredFailedTools)) {
      failures.push(`required_failed_tools_invalid_${raw.id}`);
    }
    if (
      !Number.isInteger(expectations.maxModelTurns) ||
      (expectations.maxModelTurns as number) < 0 ||
      (expectations.maxModelTurns as number) > AGENT_TASK_MAX_MODEL_TURNS
    ) {
      failures.push(`max_model_turns_invalid_${raw.id}`);
    }
    if (raw.kind === 'guardrail') {
      const failClosedSignal =
        (isStringArray(expectations.requiredFailedTools) && expectations.requiredFailedTools.length > 0) ||
        (isStringArray(expectations.finalMustNotInclude) && expectations.finalMustNotInclude.length > 0) ||
        expectations.outcome !== 'completed';
      if (!failClosedSignal) {
        failures.push(`guardrail_scenario_missing_fail_closed_expectation_${raw.id}`);
      }
    }

    scenarios.push(raw as unknown as AgentTaskScenario);
  }

  return { ok: failures.length === 0, failures, scenarios };
}

// ---------------------------------------------------------------------------
// Session observation and scoring
// ---------------------------------------------------------------------------

const BLOCKED_ANSWER_PREFIX = 'Cannot complete this scoped agent task';
const BLOCKED_ERROR_PREFIX = 'Final answer blocked until required scoped tool';

function lastAnswerStep(session: AgentTaskSessionLike): AgentTaskSessionStepLike | null {
  for (let index = session.steps.length - 1; index >= 0; index--) {
    if (session.steps[index]?.type === 'answer') return session.steps[index] ?? null;
  }
  return null;
}

export function deriveAgentTaskOutcome(session: AgentTaskSessionLike): AgentTaskOutcome {
  if (session.reviewPassed === false) return 'unresolved';
  const answer = lastAnswerStep(session);
  const requiredToolsBlocked = session.steps.some(
    (step) => step.type === 'error' && step.content.startsWith(BLOCKED_ERROR_PREFIX),
  );
  if (answer?.content.startsWith(BLOCKED_ANSWER_PREFIX)) return 'blocked';
  if (!answer) return requiredToolsBlocked ? 'blocked' : 'unresolved';
  return 'completed';
}

function digResultPath(data: unknown, resultPath: string): unknown {
  let current: unknown = data;
  for (const segment of resultPath.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function numericValueAppearsInText(value: number, text: string): boolean {
  const candidates = new Set<string>([String(value)]);
  for (const digits of [0, 1, 2, 3]) {
    candidates.add(value.toFixed(digits));
  }
  return [...candidates].some((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(text);
  });
}

export function resolveAgentTaskNumericBindings(
  scenario: AgentTaskScenario,
  session: AgentTaskSessionLike,
): AgentTaskNumericBindingResult[] {
  const bindings = scenario.expectations.numericBindings ?? [];
  if (bindings.length === 0) return [];
  const finalAnswer = lastAnswerStep(session)?.content ?? '';

  return bindings.map((binding) => {
    let value: number | string | null = null;
    for (let index = session.steps.length - 1; index >= 0; index--) {
      const step = session.steps[index];
      if (step?.type !== 'tool_result' || step.toolName !== binding.tool) continue;
      const raw = digResultPath(step.toolResult?.data, binding.resultPath);
      if (typeof raw === 'number' && Number.isFinite(raw)) value = raw;
      else if (typeof raw === 'string' && raw.trim()) value = raw.trim();
      break;
    }
    const foundInFinal =
      typeof value === 'number'
        ? numericValueAppearsInText(value, finalAnswer)
        : typeof value === 'string'
          ? finalAnswer.includes(value)
          : false;
    return { tool: binding.tool, resultPath: binding.resultPath, value, foundInFinal };
  });
}

export function buildAgentTaskScenarioObservation(
  scenario: AgentTaskScenario,
  session: AgentTaskSessionLike,
  runtime: AgentTaskRuntimeStats,
): AgentTaskScenarioObservation {
  const attemptedTools: string[] = [];
  const executedTools: string[] = [];
  const failedOrBlockedTools: string[] = [];
  for (const step of session.steps) {
    if (!step.toolName) continue;
    if (step.type === 'tool_call') attemptedTools.push(step.toolName);
    if (step.type === 'tool_result' && step.toolResult?.success !== false) executedTools.push(step.toolName);
    if (step.type === 'error') failedOrBlockedTools.push(step.toolName);
  }

  return {
    scenarioId: scenario.id,
    outcome: deriveAgentTaskOutcome(session),
    finalAnswer: lastAnswerStep(session)?.content ?? '',
    attemptedTools: [...new Set(attemptedTools)],
    executedTools: [...new Set(executedTools)],
    failedOrBlockedTools: [...new Set(failedOrBlockedTools)],
    numericBindings: resolveAgentTaskNumericBindings(scenario, session),
    scriptedTurnsUsed: runtime.scriptedTurnsUsed,
    unscriptedCallCount: runtime.unscriptedCallCount,
    networkAttempts: runtime.networkAttempts,
    totalTokens: typeof session.totalTokens === 'number' ? session.totalTokens : null,
    totalLatencyMs: typeof session.totalLatencyMs === 'number' ? session.totalLatencyMs : null,
  };
}

export function scoreAgentTaskScenario(
  scenario: AgentTaskScenario,
  observation: AgentTaskScenarioObservation,
): AgentTaskScenarioResult {
  const expectations = scenario.expectations;
  const regressions: string[] = [];
  const warnings: string[] = [];

  if (observation.outcome !== expectations.outcome) {
    regressions.push(`outcome_mismatch_expected_${expectations.outcome}_observed_${observation.outcome}`);
  }

  const executed = new Set(observation.executedTools);
  const failedOrBlocked = new Set(observation.failedOrBlockedTools);
  for (const tool of expectations.requiredTools) {
    if (!executed.has(tool)) {
      regressions.push(`required_tool_not_executed_${sanitizeAgentTaskFailureToken(tool)}`);
    }
  }
  for (const tool of expectations.forbiddenTools) {
    if (executed.has(tool)) {
      regressions.push(`forbidden_tool_executed_${sanitizeAgentTaskFailureToken(tool)}`);
    }
  }
  for (const tool of expectations.requiredFailedTools ?? []) {
    if (!failedOrBlocked.has(tool)) {
      regressions.push(`required_failed_tool_did_not_fail_${sanitizeAgentTaskFailureToken(tool)}`);
    }
    if (executed.has(tool)) {
      regressions.push(`required_failed_tool_executed_${sanitizeAgentTaskFailureToken(tool)}`);
    }
  }

  for (const token of expectations.finalMustInclude ?? []) {
    if (!observation.finalAnswer.toLowerCase().includes(token.toLowerCase())) {
      regressions.push(`final_missing_required_text_${sanitizeAgentTaskFailureToken(token)}`);
    }
  }
  for (const token of expectations.finalMustNotInclude ?? []) {
    if (observation.finalAnswer.toLowerCase().includes(token.toLowerCase())) {
      regressions.push(`final_contains_prohibited_text_${sanitizeAgentTaskFailureToken(token)}`);
    }
  }

  for (const binding of observation.numericBindings) {
    if (binding.value === null) {
      regressions.push(`numeric_binding_value_missing_${sanitizeAgentTaskFailureToken(binding.tool)}`);
    } else if (!binding.foundInFinal) {
      regressions.push(`numeric_binding_not_in_final_${sanitizeAgentTaskFailureToken(binding.tool)}`);
    }
  }

  if (observation.scriptedTurnsUsed > expectations.maxModelTurns) {
    regressions.push('scripted_turns_exceeded_max');
  }
  if (observation.unscriptedCallCount > 0) {
    regressions.push('unscripted_model_call');
  }
  if (observation.networkAttempts > 0) {
    regressions.push('network_attempt_detected');
  }
  if (scenario.agentPath !== 'workflow' && observation.scriptedTurnsUsed === 0) {
    regressions.push('scripted_turns_not_consumed');
  }

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    kind: scenario.kind,
    agentPath: scenario.agentPath,
    ok: regressions.length === 0,
    outcome: { expected: expectations.outcome, observed: observation.outcome },
    regressions,
    warnings,
    executedTools: observation.executedTools,
    failedOrBlockedTools: observation.failedOrBlockedTools,
    numericBindings: observation.numericBindings,
    scriptedTurnsUsed: observation.scriptedTurnsUsed,
    unscriptedCallCount: observation.unscriptedCallCount,
    networkAttempts: observation.networkAttempts,
    totalTokens: observation.totalTokens,
    totalLatencyMs: observation.totalLatencyMs,
  };
}

// ---------------------------------------------------------------------------
// Report contract
// ---------------------------------------------------------------------------

export function buildAgentTaskBenchmarkReport(
  results: AgentTaskScenarioResult[],
  generatedAt: string | Date = new Date(),
): AgentTaskBenchmarkReport {
  const generated = generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt;
  return {
    kind: 'geotech-agent-task-benchmark',
    schemaVersion: 1,
    generatedAt: generated,
    results,
    summary: {
      scenarioCount: results.length,
      passedScenarios: results.filter((result) => result.ok).length,
      failedScenarios: results.filter((result) => !result.ok).length,
      taskScenarios: results.filter((result) => result.kind === 'task').length,
      guardrailScenarios: results.filter((result) => result.kind === 'guardrail').length,
      agentPaths: [...new Set(results.map((result) => result.agentPath))].sort(),
      totalUnscriptedCalls: results.reduce((sum, result) => sum + result.unscriptedCallCount, 0),
      totalNetworkAttempts: results.reduce((sum, result) => sum + result.networkAttempts, 0),
      passed: results.length > 0 && results.every((result) => result.ok),
    },
  };
}

export function validateAgentTaskBenchmarkReportContract(
  report: AgentTaskBenchmarkReport,
  options: AgentTaskBenchmarkReportContractOptions = {},
): AgentTaskBenchmarkReportContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const results = Array.isArray(report.results) ? report.results : [];
  const scenarioIds = results.map((result) => result.scenarioId);

  if (report.kind !== 'geotech-agent-task-benchmark') {
    failures.push('wrong_report_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_report_schema_version');
  }
  if (!report.generatedAt) {
    failures.push('report_missing_generated_at');
  }
  if (results.length === 0) {
    warnings.push('report_has_no_results');
  }

  if (new Set(scenarioIds).size !== scenarioIds.length) {
    failures.push('duplicate_scenario_ids');
  }

  const summary = report.summary;
  if (!summary) {
    failures.push('summary_missing');
  } else {
    if (summary.scenarioCount !== results.length) failures.push('summary_scenario_count_mismatch');
    const passed = results.filter((result) => result.ok).length;
    if (summary.passedScenarios !== passed) failures.push('summary_passed_count_mismatch');
    if (summary.failedScenarios !== results.length - passed) failures.push('summary_failed_count_mismatch');
    if (summary.taskScenarios !== results.filter((result) => result.kind === 'task').length) {
      failures.push('summary_task_count_mismatch');
    }
    if (summary.guardrailScenarios !== results.filter((result) => result.kind === 'guardrail').length) {
      failures.push('summary_guardrail_count_mismatch');
    }
    if (summary.passed !== (results.length > 0 && results.every((result) => result.ok))) {
      failures.push('summary_passed_flag_mismatch');
    }
  }

  for (const result of results) {
    const label = sanitizeAgentTaskFailureToken(result.scenarioId ?? 'unknown');
    if (result.ok !== (Array.isArray(result.regressions) && result.regressions.length === 0)) {
      failures.push(`result_ok_flag_mismatch_${label}`);
    }
    if (
      !AGENT_TASK_OUTCOMES.has(result.outcome?.expected as AgentTaskOutcome) ||
      !AGENT_TASK_OUTCOMES.has(result.outcome?.observed as AgentTaskOutcome)
    ) {
      failures.push(`result_outcome_invalid_${label}`);
    }
    if (result.ok && result.outcome.expected !== result.outcome.observed) {
      failures.push(`passed_result_outcome_mismatch_${label}`);
    }
  }

  const observedIds = new Set(scenarioIds);
  for (const requiredId of options.requiredScenarioIds ?? []) {
    if (!observedIds.has(requiredId)) {
      failures.push(`missing_required_scenario_${sanitizeAgentTaskFailureToken(requiredId)}`);
    }
  }

  for (const leak of collectAgentTaskSensitivePointers(report)) {
    failures.push(`sensitive_value_leak_${sanitizeAgentTaskFailureToken(leak)}`);
  }

  return {
    ok: failures.length === 0,
    scenarioIds,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

export function attachAgentTaskBenchmarkReportContractValidation(
  report: AgentTaskBenchmarkReport,
  options: AgentTaskBenchmarkReportContractOptions = {},
): AgentTaskBenchmarkReport {
  const { contractValidation: _previous, ...reportWithoutValidation } = report;
  return {
    ...reportWithoutValidation,
    contractValidation: validateAgentTaskBenchmarkReportContract(
      reportWithoutValidation as AgentTaskBenchmarkReport,
      options,
    ),
  };
}

// ---------------------------------------------------------------------------
// Path / secret safety
// ---------------------------------------------------------------------------

const SENSITIVE_STRING_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'windows_absolute_path', pattern: /[A-Za-z]:[\\/](?:Users|home|Documents|AppData|Temp)[\\/]/i },
  { id: 'posix_home_path', pattern: /(?:^|[\s"'(=])(?:\/home\/|\/Users\/|\/tmp\/)/ },
  { id: 'openai_style_token', pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/ },
  { id: 'github_token', pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9._-]{16,}/ },
  { id: 'jwt_like_token', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
];

function collectAgentTaskSensitivePointers(value: unknown, pointer = '$', found: string[] = []): string[] {
  if (typeof value === 'string') {
    for (const { id, pattern } of SENSITIVE_STRING_PATTERNS) {
      if (pattern.test(value)) {
        found.push(`${pointer}:${id}`);
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAgentTaskSensitivePointers(item, `${pointer}[${index}]`, found));
    return found;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectAgentTaskSensitivePointers(item, `${pointer}.${key}`, found);
    }
  }
  return found;
}

export function inspectAgentTaskBenchmarkPathSafety(value: unknown): AgentTaskBenchmarkArtifactSafety {
  const leaks = [...new Set(collectAgentTaskSensitivePointers(value))];
  return { ok: leaks.length === 0, leaks };
}

// ---------------------------------------------------------------------------
// History and trend
// ---------------------------------------------------------------------------

function buildAgentTaskBenchmarkHistoryEntry(report: AgentTaskBenchmarkReport): AgentTaskBenchmarkHistoryEntry {
  const safety = inspectAgentTaskBenchmarkPathSafety(report);
  const tokenCounts = report.results
    .map((result) => result.totalTokens)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    kind: 'geotech-agent-task-benchmark-history-entry',
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    summary: {
      scenarioCount: report.summary.scenarioCount,
      passedScenarios: report.summary.passedScenarios,
      failedScenarios: report.summary.failedScenarios,
      guardrailScenarios: report.summary.guardrailScenarios,
      passed: report.summary.passed,
      totalTokens: tokenCounts.length > 0 ? tokenCounts.reduce((sum, value) => sum + value, 0) : null,
      pathLeakCount: safety.leaks.length,
    },
  };
}

function nullableDelta(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous;
}

export function buildAgentTaskBenchmarkTrend(
  report: AgentTaskBenchmarkReport,
  previousHistory: AgentTaskBenchmarkHistoryEntry[] = [],
): AgentTaskBenchmarkTrend {
  const current = buildAgentTaskBenchmarkHistoryEntry(report);
  const previous = previousHistory.at(-1) ?? null;
  const history = [...previousHistory, current].slice(-50);
  return {
    history,
    report: {
      kind: 'geotech-agent-task-benchmark-trend',
      schemaVersion: 1,
      generatedAt: current.generatedAt,
      current,
      previous,
      delta: previous
        ? {
            scenarioCount: current.summary.scenarioCount - previous.summary.scenarioCount,
            passedScenarios: current.summary.passedScenarios - previous.summary.passedScenarios,
            failedScenarios: current.summary.failedScenarios - previous.summary.failedScenarios,
            guardrailScenarios: current.summary.guardrailScenarios - previous.summary.guardrailScenarios,
            totalTokens: nullableDelta(current.summary.totalTokens, previous.summary.totalTokens),
            pathLeakCount: current.summary.pathLeakCount - previous.summary.pathLeakCount,
          }
        : null,
      historyCount: history.length,
      note: 'Local agent-task benchmark trend stores scenario pass/fail summaries only. Raw prompts, scripted model turns, tool payloads, private paths, and tokens are intentionally excluded.',
    },
  };
}

function validateAgentTaskBenchmarkHistoryEntry(
  entry: AgentTaskBenchmarkHistoryEntry | null | undefined,
  failures: string[],
  prefix: string,
): void {
  if (!entry || typeof entry !== 'object') {
    failures.push(`${prefix}_history_entry_missing`);
    return;
  }
  if (entry.kind !== 'geotech-agent-task-benchmark-history-entry') {
    failures.push(`${prefix}_history_wrong_kind`);
  }
  if (entry.schemaVersion !== 1) {
    failures.push(`${prefix}_history_wrong_schema_version`);
  }
  if (!entry.generatedAt) {
    failures.push(`${prefix}_history_missing_generated_at`);
  }
  const summary = entry.summary;
  if (!summary || typeof summary !== 'object') {
    failures.push(`${prefix}_history_summary_missing`);
    return;
  }
  for (const key of ['scenarioCount', 'passedScenarios', 'failedScenarios', 'guardrailScenarios', 'pathLeakCount'] as const) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  if (summary.scenarioCount !== summary.passedScenarios + summary.failedScenarios) {
    failures.push(`${prefix}_history_scenario_count_mismatch`);
  }
  if (summary.passed !== (summary.scenarioCount > 0 && summary.failedScenarios === 0)) {
    failures.push(`${prefix}_history_passed_flag_mismatch`);
  }
  if (summary.pathLeakCount !== 0) {
    failures.push(`${prefix}_history_path_leaks_present`);
  }
}

export function validateAgentTaskBenchmarkTrendContract(
  report: AgentTaskBenchmarkTrendReport,
): AgentTaskBenchmarkTrendContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (report.kind !== 'geotech-agent-task-benchmark-trend') {
    failures.push('wrong_trend_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_trend_schema_version');
  }
  if (!report.generatedAt) {
    failures.push('trend_missing_generated_at');
  }
  if (!Number.isInteger(report.historyCount) || report.historyCount < 1) {
    failures.push('trend_history_count_invalid');
  }
  if (!/raw prompts|scripted model turns|private paths|tokens/i.test(report.note ?? '')) {
    warnings.push('trend_note_should_state_excluded_sensitive_inputs');
  }

  validateAgentTaskBenchmarkHistoryEntry(report.current, failures, 'current');
  if (report.previous !== null) {
    validateAgentTaskBenchmarkHistoryEntry(report.previous, failures, 'previous');
  }
  if (report.previous && report.delta == null) {
    failures.push('trend_delta_required_when_previous_exists');
  }

  const serialized = JSON.stringify(report);
  if (/"scriptedTurns"|"finalAnswer"|"prompt"|"toolArgs"/.test(serialized)) {
    failures.push('trend_contains_raw_prompt_turn_or_tool_payload');
  }
  for (const pointer of inspectAgentTaskBenchmarkPathSafety(report).leaks) {
    failures.push(`trend_sensitive_value_leak_${sanitizeAgentTaskFailureToken(pointer)}`);
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------------------
// Renderers (summary SVG + trend HTML), path-safe by construction
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderAgentTaskBenchmarkSummarySvg(report: AgentTaskBenchmarkReport): string {
  const rowHeight = 22;
  const width = 640;
  const headerHeight = 46;
  const height = headerHeight + report.results.length * rowHeight + 16;
  const rows = report.results
    .map((result, index) => {
      const y = headerHeight + index * rowHeight;
      const color = result.ok ? '#00b37e' : '#e5484d';
      const status = result.ok ? 'PASS' : 'FAIL';
      const label = `${result.scenarioId} [${result.kind}/${result.agentPath}]`;
      return [
        `<rect x="12" y="${y}" width="52" height="16" rx="3" fill="${color}"/>`,
        `<text x="38" y="${y + 12}" font-size="10" fill="#ffffff" text-anchor="middle" font-family="monospace">${status}</text>`,
        `<text x="74" y="${y + 12}" font-size="11" fill="#e6e6e6" font-family="monospace">${escapeXml(label)}</text>`,
      ].join('');
    })
    .join('');
  const title = `geotech agent-task benchmark - ${report.summary.passedScenarios}/${report.summary.scenarioCount} passed`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#101418"/>`,
    `<text x="12" y="20" font-size="13" fill="#ffffff" font-family="monospace">${escapeXml(title)}</text>`,
    `<text x="12" y="36" font-size="10" fill="#9aa4af" font-family="monospace">${escapeXml(report.generatedAt)} | guardrails: ${report.summary.guardrailScenarios} | unscripted calls: ${report.summary.totalUnscriptedCalls} | network attempts: ${report.summary.totalNetworkAttempts}</text>`,
    rows,
    '</svg>',
  ].join('\n');
}

export function renderAgentTaskBenchmarkTrendHtml(trend: AgentTaskBenchmarkTrend): string {
  const rows = trend.history
    .map((entry) => {
      const summary = entry.summary;
      return `<tr><td>${escapeXml(entry.generatedAt)}</td><td>${summary.passedScenarios}/${summary.scenarioCount}</td><td>${summary.guardrailScenarios}</td><td>${summary.passed ? 'PASS' : 'FAIL'}</td><td>${summary.totalTokens ?? '-'}</td><td>${summary.pathLeakCount}</td></tr>`;
    })
    .join('\n');
  const delta = trend.report.delta;
  const deltaText = delta
    ? `Δ passed ${delta.passedScenarios >= 0 ? '+' : ''}${delta.passedScenarios}, Δ failed ${delta.failedScenarios >= 0 ? '+' : ''}${delta.failedScenarios}, Δ scenarios ${delta.scenarioCount >= 0 ? '+' : ''}${delta.scenarioCount}`
    : 'No previous entry to compare.';
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8"/>',
    '<title>geotech agent-task benchmark trend</title>',
    '<style>body{font-family:ui-monospace,monospace;background:#101418;color:#e6e6e6;padding:24px}table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #2a323c;padding:6px 10px;font-size:12px;text-align:left}th{background:#1a212a}.note{color:#9aa4af;font-size:12px;margin-top:12px}</style>',
    '</head><body>',
    '<h1 style="font-size:16px">geotech agent-task benchmark trend</h1>',
    `<p>${escapeXml(deltaText)}</p>`,
    '<table><thead><tr><th>generatedAt</th><th>passed/total</th><th>guardrails</th><th>status</th><th>tokens</th><th>path leaks</th></tr></thead>',
    `<tbody>${rows}</tbody></table>`,
    `<p class="note">${escapeXml(trend.report.note)}</p>`,
    '</body></html>',
  ].join('\n');
}

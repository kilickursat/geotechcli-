#!/usr/bin/env node

// Deterministic agent-task benchmark harness.
//
// Drives the REAL runAgent / runSwarm / project-workflow loops from the built core with
// SCRIPTED model turns (a ProviderAdapter registered over 'openai-compatible') so the
// agent harness — tool dispatch, guardrails, fail-closed FEM/artifact guards, review
// gates, evidence plumbing — is scored end-to-end with zero network and zero model cost.
//
//   --out <dir>   output directory (default __benchmark-agent-tasks)

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(readOption('--out', process.env.GEOTECHCLI_AGENT_TASK_BENCHMARK_OUTPUT_DIR || '__benchmark-agent-tasks'));
const workspacesRoot = join(outputDir, 'workspaces');
const coreIndexEntry = join(repoRoot, 'packages', 'core', 'dist', 'index.js');
const registryPath = join(repoRoot, 'packages', 'core', 'tests', 'fixtures', 'agent-task-scenarios.fixtures.json');
const comparisonOutput = join(outputDir, 'comparison.json');
const summarySvgOutput = join(outputDir, 'summary.svg');
const historyOutput = join(outputDir, 'agent-tasks-history.json');
const trendOutput = join(outputDir, 'agent-tasks-trend.json');
const trendHtmlOutput = join(outputDir, 'agent-tasks-trend.html');

function readOption(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`);
}

if (!isInside(repoRoot, outputDir) && !process.env.GEOTECHCLI_AGENT_TASK_BENCHMARK_OUTPUT_DIR) {
  console.error(`Refusing to write agent-task benchmark output outside the repo: ${outputDir}`);
  process.exit(1);
}

if (!existsSync(coreIndexEntry)) {
  console.error(`Core build was not found: ${coreIndexEntry}`);
  console.error('Run npm run build before npm run benchmark:agent-tasks.');
  process.exit(1);
}

const core = await import(pathToFileURL(coreIndexEntry).href);
const {
  registry,
  runAgent,
  runSwarm,
  analyzeWorkspace,
  runProjectWorkflow,
  inferProjectWorkflowRouteTasks,
  validateAgentTaskScenarioRegistry,
  buildAgentTaskScenarioObservation,
  scoreAgentTaskScenario,
  buildAgentTaskBenchmarkReport,
  attachAgentTaskBenchmarkReportContractValidation,
  inspectAgentTaskBenchmarkPathSafety,
  buildAgentTaskBenchmarkTrend,
  validateAgentTaskBenchmarkTrendContract,
  renderAgentTaskBenchmarkSummarySvg,
  renderAgentTaskBenchmarkTrendHtml,
} = core;

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

const registryValidation = validateAgentTaskScenarioRegistry(JSON.parse(readFileSync(registryPath, 'utf-8')));
if (!registryValidation.ok) {
  console.error('Agent-task scenario registry is invalid:');
  for (const failure of registryValidation.failures) console.error(`  - ${failure}`);
  process.exit(1);
}
const scenarios = registryValidation.scenarios;

// ---------------------------------------------------------------------------
// Scripted provider adapter + network guard (zero unscripted calls, zero fetch)
// ---------------------------------------------------------------------------

const scriptedState = {
  turns: [],
  repeatLastTurn: false,
  used: 0,
  unscripted: 0,
  networkAttempts: 0,
  toolValues: new Map(), // toolName -> last successful tool result data
};

function substitutePlaceholders(text, workspaceRel) {
  return text
    .replaceAll('{{WORKSPACE}}', workspaceRel)
    .replace(/\{\{TOOL:([a-z0-9_.]+)\}\}/gi, (match, expression) => {
      const [toolName, ...pathSegments] = expression.split('.');
      let value = scriptedState.toolValues.get(toolName);
      for (const segment of pathSegments) {
        if (value == null || typeof value !== 'object') return match;
        value = value[segment];
      }
      return typeof value === 'number' || typeof value === 'string' ? String(value) : match;
    });
}

let activeWorkspaceRel = '';

registry.register({
  name: 'openai-compatible',
  defaultModel: 'scripted-agent-benchmark',
  defaultVisionModel: 'scripted-agent-benchmark',
  capabilities: { text: true, vision: false, jsonMode: false, nativePdf: false },
  async complete() {
    let turn;
    if (scriptedState.used < scriptedState.turns.length) {
      turn = scriptedState.turns[scriptedState.used];
    } else if (scriptedState.repeatLastTurn && scriptedState.turns.length > 0) {
      turn = scriptedState.turns[scriptedState.turns.length - 1];
    } else {
      scriptedState.unscripted += 1;
      throw new Error('Unscripted model call: the scenario turn queue is exhausted.');
    }
    scriptedState.used += 1;
    return {
      text: substitutePlaceholders(turn, activeWorkspaceRel),
      usage: { promptTokens: 0, completionTokens: 1, totalTokens: 1 },
      latencyMs: 0,
      model: 'scripted-agent-benchmark',
    };
  },
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  scriptedState.networkAttempts += 1;
  throw new Error(`Network access is disabled in the agent-task benchmark (attempted: ${String(args[0]).slice(0, 80)})`);
};

const scriptedConfig = {
  provider: 'openai-compatible',
  apiKey: 'scripted-benchmark-key',
  baseUrl: 'http://scripted.invalid/v1',
  modelId: 'scripted-agent-benchmark',
  visionModelId: 'scripted-agent-benchmark',
  skillsEnabled: false,
};

// ---------------------------------------------------------------------------
// Synthetic fixture workspaces
// ---------------------------------------------------------------------------

const FIXTURE_WRITERS = {
  'spt-csv': (filePath) => writeFileSync(filePath, [
    'borehole_id,description,depth_m,sptN',
    'BH-01,"silty sand, dense",1.5,12',
    'BH-01,"silty sand, dense",3.0,18',
    '',
  ].join('\n'), 'utf-8'),
  ags: (filePath) => writeFileSync(filePath, [
    '"GROUP","LOCA"',
    '"HEADING","LOCA_ID","LOCA_NATE","LOCA_NATN"',
    '"DATA","BH-01","500000","3200000"',
    '',
  ].join('\n'), 'utf-8'),
  'monitoring-csv': (filePath) => writeFileSync(filePath, [
    'timestamp,instrument,settlement_mm',
    '2026-01-01,SM-1,1.2',
    '2026-01-02,SM-1,8.4',
    '2026-01-04,SM-1,31.0',
    '',
  ].join('\n'), 'utf-8'),
  'lab-csv': (filePath) => writeFileSync(filePath, [
    'borehole_id,depth_m,liquid_limit,plastic_limit',
    'BH-01,2.0,42,20',
    '',
  ].join('\n'), 'utf-8'),
};

function prepareScenarioWorkspace(scenario) {
  const workspaceAbs = join(workspacesRoot, scenario.id);
  if (!isInside(outputDir, workspaceAbs)) {
    throw new Error(`Scenario workspace escapes the output directory: ${scenario.id}`);
  }
  rmSync(workspaceAbs, { recursive: true, force: true });
  mkdirSync(workspaceAbs, { recursive: true });
  for (const file of scenario.workspace.files) {
    const target = join(workspaceAbs, file.path);
    if (!isInside(workspaceAbs, target)) {
      throw new Error(`Scenario fixture path escapes its workspace: ${scenario.id} -> ${file.path}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    const writer = FIXTURE_WRITERS[file.kind];
    if (!writer) throw new Error(`No fixture writer for kind: ${file.kind}`);
    writer(target);
  }
  return workspaceAbs;
}

function toPosixRelative(fromDir, target) {
  return relative(fromDir, target).split(sep).join('/');
}

// ---------------------------------------------------------------------------
// Scenario runners
// ---------------------------------------------------------------------------

function resetScriptedState(scenario) {
  scriptedState.turns = scenario.scriptedTurns;
  scriptedState.repeatLastTurn = Boolean(scenario.repeatLastTurn);
  scriptedState.used = 0;
  scriptedState.unscripted = 0;
  scriptedState.networkAttempts = 0;
  scriptedState.toolValues = new Map();
}

function captureToolValues(step) {
  if (step?.type === 'tool_result' && step.toolName && step.toolResult?.success !== false) {
    scriptedState.toolValues.set(step.toolName, step.toolResult?.data);
  }
}

async function runAgentScenario(scenario) {
  const runOptions = {
    disableDeterministicPreflight: true,
    ...(scenario.agentRunOptions ?? {}),
  };
  return runAgent(scenario.prompt, scriptedConfig, captureToolValues, {}, runOptions);
}

async function runSwarmScenario(scenario) {
  const session = await runSwarm(scenario.prompt, scriptedConfig, () => {}, {});
  return {
    steps: session.steps,
    totalTokens: session.totalTokens,
    totalLatencyMs: session.totalLatencyMs,
    reviewPassed: session.reviewPassed,
  };
}

async function runWorkflowScenario(scenario, workspaceAbs) {
  const expectedTasks = scenario.workflowTask.split(',').map((task) => task.trim()).filter(Boolean);
  const selection = inferProjectWorkflowRouteTasks(scenario.prompt);
  const routedTasks = Array.isArray(selection?.tasks) ? selection.tasks : [];
  const tasksCsv = routedTasks.join(',');
  const routingMatches =
    expectedTasks.length === routedTasks.length && expectedTasks.every((task) => routedTasks.includes(task));

  const steps = [
    { type: 'tool_call', content: 'Routing prompted workflow request', toolName: 'project_workflow_router' },
    {
      type: routingMatches ? 'tool_result' : 'error',
      content: routingMatches ? 'Deterministic router selected the expected workflow tasks.' : `Router selected unexpected tasks: ${tasksCsv}`,
      toolName: 'project_workflow_router',
      toolResult: { success: routingMatches, data: { tasksCsv } },
    },
  ];

  const manifest = await analyzeWorkspace(workspaceAbs);
  const summaries = [];
  let modelCallCount = 0;
  for (const task of expectedTasks) {
    const run = runProjectWorkflow({ manifest, task });
    modelCallCount += Array.isArray(run.modelCalls) ? run.modelCalls.length : 0;
    summaries.push(...(run.summary ?? []));
    steps.push({ type: 'tool_call', content: `Running deterministic workflow: ${task}`, toolName: 'workspace.project_workflow_executor' });
    steps.push({
      type: 'tool_result',
      content: `Workflow ${task} finished with status ${run.status}`,
      toolName: 'workspace.project_workflow_executor',
      toolResult: { success: true, data: { task, status: run.status } },
    });
  }

  steps.push({
    type: 'answer',
    content: [...summaries, `Routed tasks: ${tasksCsv}`, `Model calls: ${modelCallCount}`].join('\n'),
  });

  return { steps, totalTokens: 0, totalLatencyMs: 0 };
}

// ---------------------------------------------------------------------------
// Run all scenarios
// ---------------------------------------------------------------------------

mkdirSync(workspacesRoot, { recursive: true });
const results = [];

for (const scenario of scenarios) {
  const workspaceAbs = prepareScenarioWorkspace(scenario);
  activeWorkspaceRel = toPosixRelative(process.cwd(), workspaceAbs);
  resetScriptedState(scenario);

  let session = { steps: [] };
  let executionError = null;
  try {
    if (scenario.agentPath === 'agent') session = await runAgentScenario(scenario);
    else if (scenario.agentPath === 'swarm') session = await runSwarmScenario(scenario);
    else if (scenario.agentPath === 'workflow') session = await runWorkflowScenario(scenario, workspaceAbs);
    else throw new Error(`Unknown agentPath: ${scenario.agentPath}`);
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
  }

  const observation = buildAgentTaskScenarioObservation(scenario, session, {
    scriptedTurnsUsed: scriptedState.used,
    unscriptedCallCount: scriptedState.unscripted,
    networkAttempts: scriptedState.networkAttempts,
  });
  const result = scoreAgentTaskScenario(scenario, observation);
  if (executionError) {
    result.regressions.push(`scenario_execution_error_${executionError.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)}`);
    result.ok = false;
  }
  results.push(result);

  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`${status}  ${scenario.id} [${scenario.kind}/${scenario.agentPath}] turns=${scriptedState.used}`);
  for (const regression of result.regressions) console.log(`      - ${regression}`);
}

globalThis.fetch = originalFetch;

// ---------------------------------------------------------------------------
// Report, contract validation, history/trend, artifacts
// ---------------------------------------------------------------------------

const report = attachAgentTaskBenchmarkReportContractValidation(
  buildAgentTaskBenchmarkReport(results),
  { requiredScenarioIds: scenarios.map((scenario) => scenario.id) },
);

const previousHistory = existsSync(historyOutput)
  ? JSON.parse(readFileSync(historyOutput, 'utf-8'))
  : [];
const trend = buildAgentTaskBenchmarkTrend(report, Array.isArray(previousHistory) ? previousHistory : []);
const trendValidation = validateAgentTaskBenchmarkTrendContract(trend.report);

const failures = [];
if (!report.summary.passed) failures.push('one or more scenarios failed');
if (!report.contractValidation?.ok) {
  failures.push(`report contract validation failed: ${report.contractValidation?.failures.join(', ')}`);
}
if (!trendValidation.ok) {
  failures.push(`trend contract validation failed: ${trendValidation.failures.join(', ')}`);
}
for (const artifact of [report, trend.report, trend.history]) {
  const safety = inspectAgentTaskBenchmarkPathSafety(artifact);
  if (!safety.ok) failures.push(`artifact path/secret leak: ${safety.leaks.join(', ')}`);
}

writeFileSync(comparisonOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
writeFileSync(summarySvgOutput, renderAgentTaskBenchmarkSummarySvg(report), 'utf-8');
writeFileSync(historyOutput, `${JSON.stringify(trend.history, null, 2)}\n`, 'utf-8');
writeFileSync(trendOutput, `${JSON.stringify(trend.report, null, 2)}\n`, 'utf-8');
writeFileSync(trendHtmlOutput, renderAgentTaskBenchmarkTrendHtml(trend), 'utf-8');

console.log('');
console.log(`Agent-task benchmark: ${report.summary.passedScenarios}/${report.summary.scenarioCount} scenarios passed (guardrails: ${report.summary.guardrailScenarios}, unscripted calls: ${report.summary.totalUnscriptedCalls}, network attempts: ${report.summary.totalNetworkAttempts}).`);
console.log(`Artifacts: ${toPosixRelative(process.cwd(), comparisonOutput)}, ${toPosixRelative(process.cwd(), trendOutput)}, ${toPosixRelative(process.cwd(), trendHtmlOutput)}`);

if (failures.length > 0) {
  console.error('');
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

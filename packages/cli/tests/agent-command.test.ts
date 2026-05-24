import { Command } from 'commander';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  analyzeWorkspace: vi.fn(),
  buildProjectWorkflowRouterPrompt: vi.fn(),
  buildLLMConfig: vi.fn(),
  generateText: vi.fn(),
  resolveWorkspaceRoot: vi.fn(),
  routeProjectWorkflowRequest: vi.fn(),
  runProjectWorkflow: vi.fn(),
  buildProjectWorkflowReport: vi.fn(),
  runAgent: vi.fn(),
  runSwarm: vi.fn(),
}));

vi.mock('@geotechcli/core', () => ({
  GLOBAL_FLAG_DEFINITIONS: [
    { key: 'json', option: '--json', description: 'Output raw JSON' },
    { key: 'plot', option: '--plot', description: 'Open an interactive engineering plot viewer' },
    { key: 'saveHtml', option: '--save-html <file>', description: 'Write HTML output' },
    { key: 'noOpen', option: '--no-open', description: 'Do not open browser output' },
    { key: 'verbose', option: '--verbose', description: 'Show verbose output' },
    { key: 'quiet', option: '--quiet', description: 'Suppress output' },
    { key: 'dryRun', option: '--dry-run', description: 'Show what would be calculated' },
    { key: 'output', option: '--output <file>', description: 'Save output' },
    { key: 'noColor', option: '--no-color', description: 'Disable colored output' },
  ],
  DEFAULT_LLM_VISION_MODEL: 'glm-5v-turbo',
  buildLLMConfig: coreMocks.buildLLMConfig,
  buildProjectWorkflowRouterPrompt: coreMocks.buildProjectWorkflowRouterPrompt,
  generateText: coreMocks.generateText,
  resolveWorkspaceRoot: coreMocks.resolveWorkspaceRoot,
  routeProjectWorkflowRequest: coreMocks.routeProjectWorkflowRequest,
  runProjectWorkflow: coreMocks.runProjectWorkflow,
  buildProjectWorkflowReport: coreMocks.buildProjectWorkflowReport,
  runAgent: coreMocks.runAgent,
  runSwarm: coreMocks.runSwarm,
  analyzeWorkspace: coreMocks.analyzeWorkspace,
  AgentConversation: vi.fn(),
  addAgentSession: vi.fn(),
  addArtifact: vi.fn(),
  addNote: vi.fn(),
  analyzeCoreBox: vi.fn(),
  buildSwarmSessionProjectRecord: vi.fn(),
  classifyRMRFromImage: vi.fn(),
  classifySoilFromDescription: vi.fn(),
  generateReport: vi.fn(),
  generateReportFromCaseFile: vi.fn(),
  getProjectAgentContext: vi.fn(),
  ingestBoreholeLogDocument: vi.fn(),
  inspectPdfDocument: vi.fn(),
  interpretSensorImage: vi.fn(),
  loadProject: vi.fn(),
  persistCaseFileEvidence: vi.fn(),
  persistSwarmCaseFile: vi.fn(),
  queryGBRDocument: vi.fn(),
  renderReportAsDocx: vi.fn(),
  renderReportAsPdf: vi.fn(),
  saveDerivedParameter: vi.fn(),
  saveNamedDataset: vi.fn(),
  setActiveAnalysisContext: vi.fn(),
}));

import { registerAgentCommand } from '../src/commands/ai.js';

function makeAgentSession(answer = 'done') {
  return {
    steps: [{ type: 'answer', content: answer, timestamp: Date.now() }],
    context: {},
    totalTokens: 1,
    totalLatencyMs: 1,
  };
}

function makeSwarmSession(answer = 'done') {
  return {
    steps: [{ agent: 'orchestrator', type: 'answer', content: answer, timestamp: Date.now() }],
    context: {},
    totalTokens: 1,
    totalLatencyMs: 1,
    reviewPassed: true,
    corrections: [],
    plan: {
      roles: [],
      skillCatalog: { executableApproved: 0 },
    },
  };
}

function makeProjectWorkflowRun(task = 'risk-analysis') {
  return {
    schemaVersion: 'geotech.project-workflow-run.v1',
    runId: 'run_test',
    task,
    generatedAt: new Date().toISOString(),
    status: 'review',
    providerContract: {
      providerNeutral: true,
      purpose: 'deterministic-project-workflow',
      llmRole: 'none',
    },
    workspace: {
      rootPath: 'C:/project',
      totalFiles: 1,
      supportedFiles: 1,
      branches: ['reports'],
    },
    summary: ['deterministic project workflow summary'],
    findings: [],
    actions: [],
    charts: [],
    artifacts: [],
    trace: { steps: [] },
    toolCalls: [{ type: 'tool_call', tool: 'workspace.project_workflow_executor', status: 'review', summary: 'done' }],
    modelCalls: [],
  };
}

function makeProjectWorkflowReport(task = 'risk-analysis') {
  return {
    title: `Project Workflow Report: ${task}`,
    sections: [{ title: 'Executive Summary', content: 'deterministic project workflow summary' }],
    fullMarkdown: `# Project Workflow Report: ${task}\n\ndeterministic project workflow summary`,
    latencyMs: 1,
  };
}

function makeProjectWorkflowRoutePlan(options: {
  runId?: string;
  prompt?: string;
  tasks?: string[];
  executionMode?: 'deterministic-sequence' | 'needs-selection';
  confidence?: number;
  selectionSource?: 'explicit' | 'deterministic' | 'model' | 'merged' | 'none';
  rejectedTasks?: Array<{ value: string; reason: string }>;
  modelCalls?: unknown[];
} = {}) {
  const tasks = options.tasks ?? [];
  return {
    schemaVersion: 'geotech.project-workflow-route-plan.v1',
    routeId: `route_${options.runId ?? 'run_test'}`,
    runId: options.runId ?? 'run_test',
    generatedAt: new Date().toISOString(),
    prompt: options.prompt ?? '',
    executionMode: options.executionMode ?? (tasks.length > 0 ? 'deterministic-sequence' : 'needs-selection'),
    tasks,
    confidence: options.confidence ?? (tasks.length > 0 ? 0.82 : 0.2),
    selectionSource: options.selectionSource ?? (tasks.length > 0 ? 'deterministic' : 'none'),
    rationale: tasks.length > 0 ? ['matched deterministic workflow route'] : ['requires custom question handling'],
    rejectedTasks: options.rejectedTasks ?? [],
    providerContract: {
      providerNeutral: true,
      purpose: 'project-workflow-routing',
      llmRole: 'planner-reviewer-only',
      deterministicExecutionRequired: true,
      allowedTasks: ['data-quality', 'ground-model', 'risk-analysis', 'anomaly-detection', 'recommendations', 'visualization'],
      disallowedActions: ['invent calculation results'],
    },
    trace: {
      steps: [],
    },
    modelCalls: options.modelCalls ?? [],
  };
}

function findAncestorContaining(startPath: string, relativeMarker: string): string | undefined {
  let current = resolve(startPath);
  for (;;) {
    if (existsSync(join(current, relativeMarker))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function makeWorkspaceRoot(options: { workspacePath?: string } = {}) {
  if (options.workspacePath?.trim()) {
    return {
      path: resolve(options.workspacePath),
      detectedBy: 'explicit_workspace_arg',
      trustLevel: 'explicit',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }
  const cwd = process.cwd();
  const geotechRoot = findAncestorContaining(cwd, join('.geotech', 'project.json'));
  if (geotechRoot) {
    return {
      path: geotechRoot,
      detectedBy: 'geotech_project_file',
      trustLevel: 'inferred',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }
  const gitRoot = findAncestorContaining(cwd, '.git');
  return {
    path: gitRoot ?? resolve(cwd),
    detectedBy: gitRoot ? 'git_root' : 'cwd',
    trustLevel: 'inferred',
    readScope: 'root_only',
    writeScope: 'geotech_output_only',
  };
}

function makeWorkspaceManifest() {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: new Date().toISOString(),
    rootPath: 'C:/project',
    files: [
      {
        path: 'reports/gi-report.pdf',
        absolutePath: 'C:/project/reports/gi-report.pdf',
        name: 'gi-report.pdf',
        extension: '.pdf',
        sizeBytes: 1024,
        modifiedAt: new Date().toISOString(),
        classification: {
          kind: 'pdf',
          datasetType: 'geotechnical-report',
          branches: ['reports'],
          confidence: 0.9,
          signals: ['report'],
          warnings: [],
        },
      },
    ],
    warnings: [],
    summary: {
      totalFiles: 1,
      supportedFiles: 1,
      tabularFiles: 0,
      pdfFiles: 1,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: { pdf: 1 },
      datasetTypes: { 'geotechnical-report': 1 },
      branches: ['reports'],
      recommendations: ['PDF reports detected. Use geotech ingest for structured extraction.'],
    },
  };
}

describe('agent command skill opt-in', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      modelId: 'glm-5.1',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.buildProjectWorkflowRouterPrompt.mockReturnValue('PROJECT WORKFLOW ROUTER CONTRACT');
    coreMocks.generateText.mockResolvedValue({
      text: '{"tasks":["risk-analysis"],"rationale":["model proposed risk workflow"]}',
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      model: 'glm-5.1',
      provider: 'hosted-beta',
      latencyMs: 25,
    });
    coreMocks.runAgent.mockResolvedValue(makeAgentSession());
    coreMocks.runSwarm.mockResolvedValue(makeSwarmSession());
    coreMocks.analyzeWorkspace.mockResolvedValue(makeWorkspaceManifest());
    coreMocks.resolveWorkspaceRoot.mockImplementation(makeWorkspaceRoot);
    coreMocks.runProjectWorkflow.mockImplementation(({ task }) => makeProjectWorkflowRun(task));
    coreMocks.buildProjectWorkflowReport.mockImplementation((run) => makeProjectWorkflowReport(run.task));
    coreMocks.routeProjectWorkflowRequest.mockImplementation(({ prompt, runId }) => {
      const lower = String(prompt ?? '').toLowerCase();
      if (lower.includes('anomal') || lower.includes('visual')) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: ['anomaly-detection', 'visualization'],
        });
      }
      if (lower.includes('risk')) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: ['risk-analysis'],
        });
      }
      return makeProjectWorkflowRoutePlan({
        runId,
        prompt,
        tasks: [],
        executionMode: 'needs-selection',
      });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('keeps agent skill tools disabled unless --skills is passed', async () => {
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'review', 'foundation', '--no-workspace', '--json'], { from: 'user' });

    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      'review foundation',
      expect.objectContaining({ skillsEnabled: false }),
      expect.any(Function),
      undefined,
    );
  });

  it('enables agent skill tools when --skills is passed', async () => {
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'review', 'foundation', '--no-workspace', '--skills', '--json'], { from: 'user' });

    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      'review foundation',
      expect.objectContaining({ skillsEnabled: true }),
      expect.any(Function),
      undefined,
    );
  });

  it('passes skill opt-in and workspace drafts into swarm sessions', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-swarm-'));
    tempDirs.push(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      'review',
      'foundation',
      '--workspace',
      workspace,
      '--swarm',
      '--skills',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
    });
    expect(coreMocks.runSwarm).toHaveBeenCalledWith(
      expect.stringContaining('review foundation'),
      expect.objectContaining({ skillsEnabled: true }),
      expect.any(Function),
      expect.objectContaining({ workspace: expect.any(Object) }),
    );
  });

  it('runs project-aware plan-only discovery without calling the LLM', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-project-'));
    tempDirs.push(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', '--workspace', workspace, '--plan-only', '--json'], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
    });
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
    expect(existsSync(join(workspace, '.geotech', 'manifest.json'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'evidence', 'file_index.jsonl'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'evidence', 'evidence_index.jsonl'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'context', 'readiness.json'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'context', 'memory.json'))).toBe(true);
    const runId = readdirSync(join(workspace, '.geotech', 'runs'))[0];
    const plan = JSON.parse(readFileSync(join(workspace, '.geotech', 'runs', runId, 'plan.json'), 'utf-8'));
    expect(plan.executionMode).toBe('discovery-only');
    expect(existsSync(join(workspace, '.geotech', 'runs', runId, 'run_manifest.json'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'runs', runId, 'intent.json'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'runs', runId, 'tool_calls.jsonl'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'runs', runId, 'model_calls.jsonl'))).toBe(true);
  });

  it('runs explicit project-aware task mode through the deterministic workflow executor', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-task-'));
    tempDirs.push(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      '--workspace',
      workspace,
      '--task',
      'risk-analysis',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
    });
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.any(Object),
      task: 'risk-analysis',
      runId: expect.any(String),
    }));
    expect(coreMocks.buildProjectWorkflowReport).toHaveBeenCalled();
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
    const geotechPlanDirs = join(workspace, '.geotech', 'runs');
    expect(existsSync(geotechPlanDirs)).toBe(true);
    const runId = readdirSync(geotechPlanDirs)[0];
    const plan = JSON.parse(readFileSync(join(geotechPlanDirs, runId, 'plan.json'), 'utf-8'));
    expect(plan.executionMode).toBe('deterministic-workflow');
    expect(existsSync(join(geotechPlanDirs, runId, 'workflow_result.json'))).toBe(true);
    expect(existsSync(join(geotechPlanDirs, runId, 'workflow_report.md'))).toBe(true);
    expect(readFileSync(join(geotechPlanDirs, runId, 'model_calls.jsonl'), 'utf-8')).toBe('');
  });

  it.each([
    'data-quality',
    'ground-model',
    'risk-analysis',
    'anomaly-detection',
    'recommendations',
    'visualization',
  ])('keeps explicit %s project task provider-neutral', async (projectTask) => {
    const workspace = mkdtempSync(join(tmpdir(), `geotech-agent-${projectTask}-`));
    tempDirs.push(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      '--workspace',
      workspace,
      '--task',
      projectTask,
      '--json',
    ], { from: 'user' });

    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: projectTask }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
  });

  it('routes prompted project workflow requests through deterministic execution before LLM analysis', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-auto-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'find', 'anomalies', 'and', 'create', 'visualizations', '--json'], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
    });
    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'find anomalies and create visualizations',
      manifest: expect.any(Object),
      runId: expect.any(String),
    }));
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'anomaly-detection' }));
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'visualization' }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'plan.json')));
    expect(runId).toBeTruthy();
    const selectedRunId = runId ?? '';
    const intent = JSON.parse(readFileSync(join(workspace, '.geotech', 'runs', selectedRunId, 'intent.json'), 'utf-8'));
    expect(intent.type).toBe('combined');
    expect(intent.tasks).toEqual(expect.arrayContaining(['anomaly-detection', 'visualization']));
    expect(existsSync(join(workspace, '.geotech', 'runs', selectedRunId, 'workflow_route.json'))).toBe(true);
    expect(existsSync(join(workspace, '.geotech', 'runs', selectedRunId, 'workflow_route_report.md'))).toBe(true);
    expect(readFileSync(join(workspace, '.geotech', 'runs', selectedRunId, 'model_calls.jsonl'), 'utf-8')).toBe('');
  });

  it('falls back to the workspace-backed LLM agent for custom project questions', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-custom-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'summarize', 'the', 'client', 'email', '--json'], { from: 'user' });

    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalled();
    expect(coreMocks.runProjectWorkflow).not.toHaveBeenCalled();
    expect(coreMocks.buildLLMConfig).toHaveBeenCalled();
    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      expect.stringContaining('Project-aware task context:'),
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({ workspace: expect.any(Object) }),
    );
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'plan.json')));
    expect(runId).toBeTruthy();
    expect(existsSync(join(runRoot, runId ?? '', 'workflow_route.json'))).toBe(true);
  });

  it('falls back to the workspace-backed LLM agent for low-confidence project routes', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-low-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    coreMocks.routeProjectWorkflowRequest.mockImplementationOnce(({ prompt, runId }) => makeProjectWorkflowRoutePlan({
      runId,
      prompt,
      tasks: ['visualization'],
      executionMode: 'needs-selection',
      confidence: 0.52,
    }));
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'create', 'visualizations', '--json'], { from: 'user' });

    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalled();
    expect(coreMocks.runProjectWorkflow).not.toHaveBeenCalled();
    expect(coreMocks.buildLLMConfig).toHaveBeenCalled();
    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      expect.stringContaining('Workflow router:'),
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({ workspace: expect.any(Object) }),
    );
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'plan.json')));
    expect(runId).toBeTruthy();
    const route = JSON.parse(readFileSync(join(runRoot, runId ?? '', 'workflow_route.json'), 'utf-8'));
    expect(route.executionMode).toBe('needs-selection');
    expect(route.confidence).toBe(0.52);
  });

  it('uses an opt-in LLM route proposal for ambiguous project prompts and records the model call', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-model-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    coreMocks.routeProjectWorkflowRequest.mockImplementation(({ prompt, runId, llmSelection, modelCalls }) => {
      if (llmSelection) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: ['risk-analysis'],
          selectionSource: 'model',
          modelCalls,
        });
      }
      return makeProjectWorkflowRoutePlan({
        runId,
        prompt,
        tasks: [],
        executionMode: 'needs-selection',
      });
    });
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'decide', 'the', 'best', 'project', 'workflow', '--route-with-model', '--json'], { from: 'user' });

    expect(coreMocks.buildProjectWorkflowRouterPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'decide the best project workflow',
      manifest: expect.any(Object),
      providerConfig: expect.objectContaining({ provider: 'hosted-beta', modelId: 'glm-5.1' }),
      compact: true,
    }));
    expect(coreMocks.generateText).toHaveBeenCalledWith(
      'PROJECT WORKFLOW ROUTER CONTRACT',
      expect.objectContaining({ provider: 'hosted-beta', skillsEnabled: false }),
      expect.objectContaining({ jsonMode: true, temperature: 0, thinkingMode: 'disabled' }),
    );
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'risk-analysis' }));
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'plan.json')));
    expect(runId).toBeTruthy();
    const route = JSON.parse(readFileSync(join(runRoot, runId ?? '', 'workflow_route.json'), 'utf-8'));
    expect(route.selectionSource).toBe('model');
    const modelRows = readFileSync(join(runRoot, runId ?? '', 'model_calls.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(modelRows).toHaveLength(1);
    expect(modelRows[0]).toEqual(expect.objectContaining({
      purpose: 'project-workflow-router',
      status: 'pass',
      model: 'glm-5.1',
    }));
  });

  it('falls back to the workspace-backed LLM agent when the opt-in route proposal is rejected', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-bad-model-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    coreMocks.generateText.mockResolvedValueOnce({
      text: '{"tasks":["invent-fem-result"],"rationale":["bad proposal"]}',
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      model: 'glm-5.1',
      provider: 'hosted-beta',
      latencyMs: 25,
    });
    coreMocks.routeProjectWorkflowRequest.mockImplementation(({ prompt, runId, llmSelection, modelCalls }) => {
      if (llmSelection) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: [],
          executionMode: 'needs-selection',
          selectionSource: 'model',
          rejectedTasks: [{ value: 'invent-fem-result', reason: 'Not an allowed deterministic project workflow task.' }],
          modelCalls,
        });
      }
      return makeProjectWorkflowRoutePlan({
        runId,
        prompt,
        tasks: [],
        executionMode: 'needs-selection',
      });
    });
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'decide', 'the', 'best', 'project', 'workflow', '--route-with-model', '--json'], { from: 'user' });

    expect(coreMocks.generateText).toHaveBeenCalled();
    expect(coreMocks.runProjectWorkflow).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).toHaveBeenCalled();
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'plan.json')));
    expect(runId).toBeTruthy();
    const route = JSON.parse(readFileSync(join(runRoot, runId ?? '', 'workflow_route.json'), 'utf-8'));
    expect(route.selectionSource).toBe('model');
    expect(route.rejectedTasks).toEqual([expect.objectContaining({ value: 'invent-fem-result' })]);
    const modelRows = readFileSync(join(runRoot, runId ?? '', 'model_calls.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(modelRows).toEqual([
      expect.objectContaining({ purpose: 'project-workflow-router', status: 'pass' }),
      expect.objectContaining({ purpose: 'workspace-backed-agent-task', status: 'planned' }),
    ]);
  });

  it('treats dot argument as project discovery and detects an existing .geotech project root', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-root-'));
    const child = join(workspace, 'nested');
    mkdirSync(join(workspace, '.geotech'), { recursive: true });
    mkdirSync(child, { recursive: true });
    writeFileSync(join(workspace, '.geotech', 'project.json'), '{}', 'utf-8');
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(child);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', '.', '--json'], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
    });
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    const runId = readdirSync(join(workspace, '.geotech', 'runs'))[0];
    const plan = JSON.parse(readFileSync(join(workspace, '.geotech', 'runs', runId, 'plan.json'), 'utf-8'));
    expect(plan.workspace.detectedBy).toBe('geotech_project_file');
    expect(plan.intent.type).toBe('discovery');
  });

  it('passes project-aware scan limits into workspace analysis', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-limits-'));
    tempDirs.push(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      '--workspace',
      workspace,
      '--plan-only',
      '--max-files',
      '25',
      '--max-depth',
      '2',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith(workspace, {
      includeCalculationInputDrafts: true,
      maxFiles: 25,
      maxDepth: 2,
    });
  });
});

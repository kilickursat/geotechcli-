import { Command } from 'commander';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
  analyzeSignalFile: vi.fn(),
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
  analyzeSignalFile: coreMocks.analyzeSignalFile,
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

function makeProjectWorkflowRun(task = 'risk-analysis', runId = 'run_test') {
  return {
    schemaVersion: 'geotech.project-workflow-run.v1',
    runId,
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
      allowedTasks: ['data-quality', 'ground-model', 'calculation-readiness', 'risk-analysis', 'anomaly-detection', 'recommendations', 'signal-analysis', 'visualization'],
      disallowedActions: ['invent calculation results'],
    },
    trace: {
      steps: [],
    },
    modelCalls: options.modelCalls ?? [],
  };
}

function isWithinOrSamePath(candidate: string, parent: string): boolean {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function findNearestWorkspaceMarker(startPath: string): { path: string; detectedBy: 'geotech_project_file' | 'git_root' } | undefined {
  let current = resolve(startPath);
  const tempRoot = resolve(tmpdir());
  const stopAt = isWithinOrSamePath(current, tempRoot) ? tempRoot : undefined;
  for (;;) {
    if (existsSync(join(current, '.geotech', 'project.json'))) return { path: current, detectedBy: 'geotech_project_file' };
    if (existsSync(join(current, '.git'))) return { path: current, detectedBy: 'git_root' };
    if (stopAt && current === stopAt) return undefined;
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
  const nearestMarker = findNearestWorkspaceMarker(cwd);
  if (nearestMarker) {
    return {
      path: nearestMarker.path,
      detectedBy: nearestMarker.detectedBy,
      trustLevel: 'inferred',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }
  return {
    path: resolve(cwd),
    detectedBy: 'cwd',
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

function makeSignalWorkspaceManifest(workspace: string, signalPath: string) {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: new Date().toISOString(),
    rootPath: workspace,
    files: [
      {
        path: 'monitoring/settlement.csv',
        absolutePath: signalPath,
        name: 'settlement.csv',
        extension: '.csv',
        sizeBytes: 128,
        modifiedAt: new Date().toISOString(),
        classification: {
          kind: 'csv',
          datasetType: 'monitoring-time-series',
          branches: ['monitoring'],
          confidence: 0.88,
          signals: ['settlement', 'time-series'],
          warnings: [],
        },
        schemas: [
          {
            sheetName: undefined,
            datasetType: 'monitoring-time-series',
            confidence: 0.9,
            rowCount: 3,
            columns: [
              { name: 'date', normalizedName: 'date', roles: ['timestamp'], confidence: 0.95, sampleValues: ['2026-01-01'] },
              { name: 'settlement_mm', normalizedName: 'settlementmm', roles: ['settlement', 'value'], confidence: 0.95, sampleValues: ['1.2'] },
              { name: 'instrument', normalizedName: 'instrument', roles: ['instrument_id'], confidence: 0.9, sampleValues: ['SM-1'] },
            ],
            warnings: [],
          },
        ],
      },
    ],
    warnings: [],
    summary: {
      totalFiles: 1,
      supportedFiles: 1,
      tabularFiles: 1,
      pdfFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: { csv: 1 },
      datasetTypes: { 'monitoring-time-series': 1 },
      branches: ['monitoring'],
      recommendations: ['Monitoring data detected. Use geotech signal analyze for deterministic trend review.'],
    },
  };
}

function makeSignalAnalyzeResult(signalPath: string) {
  return {
    schemaVersion: 'signal-analysis.v0',
    source: {
      path: signalPath,
      format: 'csv',
      rowsAnalyzed: 2,
      rowsRejected: 0,
    },
    signalType: 'settlement',
    columns: {
      timestamp: 'date',
      value: 'settlement_mm',
      instrumentId: 'instrument',
    },
    trendSummary: [{
      seriesId: 'SM-1',
      label: 'SM-1',
      count: 2,
      firstValue: 1.2,
      lastValue: 1.7,
      min: 1.2,
      max: 1.7,
      mean: 1.45,
      delta: 0.5,
      slope: 0.5,
      slopeUnit: 'per-day',
      direction: 'increasing',
    }],
    thresholdFlags: [],
    missingIntervals: [],
    rateOfChange: [{ seriesId: 'SM-1', unit: 'per-day', min: 0.5, max: 0.5, mean: 0.5, latest: 0.5 }],
    series: [{ id: 'SM-1', label: 'SM-1', x: ['2026-01-01', '2026-01-02'], y: [1.2, 1.7], points: [] }],
    warnings: [],
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
    coreMocks.runProjectWorkflow.mockImplementation(({ task, runId }) => makeProjectWorkflowRun(task, runId));
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
      if (lower.includes('bearing') || lower.includes('pile') || lower.includes('calculation') || lower.includes('design route')) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: ['calculation-readiness'],
        });
      }
      if (lower.includes('piezometer') || lower.includes('monitoring') || lower.includes('time-series') || lower.includes('vibration')) {
        return makeProjectWorkflowRoutePlan({
          runId,
          prompt,
          tasks: ['signal-analysis'],
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

  it('persists deterministic signal analysis artifacts for explicit signal project tasks', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-signal-task-'));
    tempDirs.push(workspace);
    const signalPath = join(workspace, 'monitoring', 'settlement.csv');
    mkdirSync(dirname(signalPath), { recursive: true });
    writeFileSync(signalPath, 'date,instrument,settlement_mm\n2026-01-01,SM-1,1.2\n2026-01-02,SM-1,1.7\n', 'utf-8');
    coreMocks.analyzeWorkspace.mockResolvedValueOnce(makeSignalWorkspaceManifest(workspace, signalPath));
    coreMocks.analyzeSignalFile.mockResolvedValueOnce(makeSignalAnalyzeResult(signalPath));
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      '--workspace',
      workspace,
      '--task',
      'signal-analysis',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeSignalFile).toHaveBeenCalledWith(signalPath, expect.objectContaining({
      type: 'settlement',
      maxRows: 5000,
    }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();

    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'workflow_result.json')));
    expect(runId).toBeTruthy();
    const runDir = join(runRoot, runId ?? '');
    const signalDir = join(runDir, 'signals');
    expect(existsSync(join(signalDir, 'index.json'))).toBe(true);
    const analysisFiles = readdirSync(signalDir).filter((entry) => entry.endsWith('.analysis.json'));
    expect(analysisFiles).toHaveLength(1);
    const index = JSON.parse(readFileSync(join(signalDir, 'index.json'), 'utf-8'));
    expect(index.sources[0]).toMatchObject({
      source: 'monitoring/settlement.csv',
      status: 'pass',
      signalType: 'settlement',
      rowsAnalyzed: 2,
    });
    const result = JSON.parse(readFileSync(join(runDir, 'workflow_result.json'), 'utf-8'));
    expect(result.artifacts.some((artifact: { path: string }) => artifact.path.includes('signals'))).toBe(true);
    expect(result.summary.join(' ')).toContain('Signal analyses persisted: 1/1');
    expect(readFileSync(join(runDir, 'tool_calls.jsonl'), 'utf-8')).toContain('signal.analyze_file');
    expect(readFileSync(join(runDir, 'model_calls.jsonl'), 'utf-8')).toBe('');
  });

  it.each([
    'data-quality',
    'ground-model',
    'calculation-readiness',
    'risk-analysis',
    'anomaly-detection',
    'recommendations',
    'signal-analysis',
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

  it('normalizes explicit FEM route task aliases to calculation readiness', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-fem-alias-'));
    tempDirs.push(workspace);

    const aliases = [
      'fem-tunnel-volume-loss-settlement',
      'fem-shaft-deformation',
      'fem-pile-group-elastic-interaction',
      'fem-slope-embankment-deformation',
      'fem-retaining-wall-excavation-support',
      'fem-seepage-groundwater-coupling',
      'fem-staged-settlement-consolidation',
    ];

    for (const alias of aliases) {
      const program = new Command();
      registerAgentCommand(program);

      await program.parseAsync([
        'agent',
        '--workspace',
        workspace,
        '--task',
        alias,
        '--json',
      ], { from: 'user' });
    }

    const tasks = coreMocks.runProjectWorkflow.mock.calls.map((call) => call[0]?.task);
    expect(tasks.slice(-aliases.length)).toEqual(aliases.map(() => 'calculation-readiness'));
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

  it('routes prompted calculation-readiness requests through deterministic execution before LLM analysis', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-calc-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'can', 'we', 'run', 'a', 'bearing', 'calculation', '--json'], { from: 'user' });

    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'can we run a bearing calculation',
      manifest: expect.any(Object),
      runId: expect.any(String),
    }));
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'calculation-readiness' }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
  });

  it('routes prompted monitoring requests through deterministic signal-analysis before LLM analysis', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-signal-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'analyze', 'piezometer', 'monitoring', 'time-series', '--json'], { from: 'user' });

    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'analyze piezometer monitoring time-series',
      manifest: expect.any(Object),
      runId: expect.any(String),
    }));
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'signal-analysis' }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();
    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'workflow_route.json')));
    expect(runId).toBeTruthy();
    const route = JSON.parse(readFileSync(join(runRoot, runId ?? '', 'workflow_route.json'), 'utf-8'));
    expect(route.tasks).toEqual(['signal-analysis']);
  });

  it('persists signal analysis artifacts for routed monitoring project prompts', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-signal-route-artifacts-'));
    tempDirs.push(workspace);
    const signalPath = join(workspace, 'monitoring', 'settlement.csv');
    mkdirSync(dirname(signalPath), { recursive: true });
    writeFileSync(signalPath, 'date,instrument,settlement_mm\n2026-01-01,SM-1,1.2\n2026-01-02,SM-1,1.7\n', 'utf-8');
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    coreMocks.analyzeWorkspace.mockResolvedValueOnce(makeSignalWorkspaceManifest(workspace, signalPath));
    coreMocks.analyzeSignalFile.mockResolvedValueOnce(makeSignalAnalyzeResult(signalPath));
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'analyze', 'settlement', 'monitoring', 'time-series', '--json'], { from: 'user' });

    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'analyze settlement monitoring time-series',
      manifest: expect.any(Object),
      runId: expect.any(String),
    }));
    expect(coreMocks.runProjectWorkflow).toHaveBeenCalledWith(expect.objectContaining({ task: 'signal-analysis' }));
    expect(coreMocks.analyzeSignalFile).toHaveBeenCalledWith(signalPath, expect.objectContaining({
      type: 'settlement',
      maxRows: 5000,
    }));
    expect(coreMocks.buildLLMConfig).not.toHaveBeenCalled();
    expect(coreMocks.runAgent).not.toHaveBeenCalled();
    expect(coreMocks.runSwarm).not.toHaveBeenCalled();

    const runRoot = join(workspace, '.geotech', 'runs');
    const runId = readdirSync(runRoot).find((entry) => existsSync(join(runRoot, entry, 'workflow_route.json')));
    expect(runId).toBeTruthy();
    const signalDir = join(runRoot, runId ?? '', 'signals');
    expect(existsSync(join(signalDir, 'index.json'))).toBe(true);
    expect(readdirSync(signalDir).filter((entry) => entry.endsWith('.analysis.json'))).toHaveLength(1);
    expect(readFileSync(join(runRoot, runId ?? '', 'model_calls.jsonl'), 'utf-8')).toBe('');
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

  it('falls back to the workspace-backed LLM agent when the opt-in route proposal fails', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-agent-failed-model-route-'));
    tempDirs.push(workspace);
    vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    coreMocks.generateText.mockRejectedValueOnce(new Error('router unavailable'));
    coreMocks.routeProjectWorkflowRequest.mockImplementation(({ prompt, runId, modelCalls }) => makeProjectWorkflowRoutePlan({
      runId,
      prompt,
      tasks: [],
      executionMode: 'needs-selection',
      modelCalls,
    }));
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['agent', 'decide', 'the', 'best', 'project', 'workflow', '--route-with-model', '--json'], { from: 'user' });

    expect(coreMocks.generateText).toHaveBeenCalledWith(
      'PROJECT WORKFLOW ROUTER CONTRACT',
      expect.objectContaining({ provider: 'hosted-beta', skillsEnabled: false }),
      expect.objectContaining({ jsonMode: true, temperature: 0, thinkingMode: 'disabled' }),
    );
    expect(coreMocks.routeProjectWorkflowRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      llmSelection: undefined,
      modelCalls: [expect.objectContaining({
        purpose: 'project-workflow-router',
        status: 'failed',
        error: 'router unavailable',
      })],
    }));
    expect(coreMocks.runProjectWorkflow).not.toHaveBeenCalled();
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
    expect(route.modelCalls).toEqual([
      expect.objectContaining({
        purpose: 'project-workflow-router',
        status: 'failed',
        error: 'router unavailable',
      }),
    ]);
    const modelRows = readFileSync(join(runRoot, runId ?? '', 'model_calls.jsonl'), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(modelRows).toEqual([
      expect.objectContaining({ purpose: 'project-workflow-router', status: 'failed', error: 'router unavailable' }),
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

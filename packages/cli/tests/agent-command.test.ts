import { Command } from 'commander';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  analyzeWorkspace: vi.fn(),
  buildLLMConfig: vi.fn(),
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

function makeWorkspaceManifest() {
  return {
    schemaVersion: 'workspace-manifest.v1',
    generatedAt: new Date().toISOString(),
    rootPath: 'C:/project',
    files: [],
    warnings: [],
    summary: {
      totalFiles: 0,
      supportedFiles: 0,
      tabularFiles: 0,
      pdfFiles: 0,
      imageFiles: 0,
      skippedFiles: 0,
      kinds: {},
      datasetTypes: {},
      branches: [],
      recommendations: [],
    },
  };
}

describe('agent command skill opt-in', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.runAgent.mockResolvedValue(makeAgentSession());
    coreMocks.runSwarm.mockResolvedValue(makeSwarmSession());
    coreMocks.analyzeWorkspace.mockResolvedValue(makeWorkspaceManifest());
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

    await program.parseAsync(['agent', 'review', 'foundation', '--json'], { from: 'user' });

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

    await program.parseAsync(['agent', 'review', 'foundation', '--skills', '--json'], { from: 'user' });

    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      'review foundation',
      expect.objectContaining({ skillsEnabled: true }),
      expect.any(Function),
      undefined,
    );
  });

  it('passes skill opt-in and workspace drafts into swarm sessions', async () => {
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync([
      'agent',
      'review',
      'foundation',
      '--workspace',
      '.',
      '--swarm',
      '--skills',
      '--json',
    ], { from: 'user' });

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith('.', {
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
    expect(existsSync(join(workspace, '.geotech', 'context', 'readiness.json'))).toBe(true);
    const runId = readdirSync(join(workspace, '.geotech', 'runs'))[0];
    const plan = JSON.parse(readFileSync(join(workspace, '.geotech', 'runs', runId, 'plan.json'), 'utf-8'));
    expect(plan.executionMode).toBe('discovery-only');
  });

  it('uses project-aware task mode as a workspace-backed agent prompt', async () => {
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
    expect(coreMocks.runAgent).toHaveBeenCalledWith(
      expect.stringContaining('Selected task: risk-analysis'),
      expect.objectContaining({ skillsEnabled: false }),
      expect.any(Function),
      expect.objectContaining({ workspace: expect.any(Object) }),
    );
    const geotechPlanDirs = join(workspace, '.geotech', 'runs');
    expect(existsSync(geotechPlanDirs)).toBe(true);
  });
});

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readlineMocks = vi.hoisted(() => {
  const handlers = new Map<string, (line?: string) => unknown>();
  const rl = {
    prompt: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, callback: (line?: string) => unknown) => {
      handlers.set(event, callback);
      return rl;
    }),
  };

  return {
    createInterface: vi.fn(() => rl),
    handlers,
    rl,
  };
});

const coreMocks = vi.hoisted(() => {
  const conversationAsk = vi.fn();
  const conversationReplaceContext = vi.fn();
  const conversationGetContext = vi.fn(() => ({}));
  const AgentConversation = vi.fn().mockImplementation(function AgentConversation() {
    return {
      ask: conversationAsk,
      clearContext: vi.fn(),
      getContext: conversationGetContext,
      replaceContext: conversationReplaceContext,
    };
  });
  return {
    buildLLMConfig: vi.fn(),
    conversationAsk,
    conversationReplaceContext,
    conversationGetContext,
    AgentConversation,
    analyzeWorkspace: vi.fn(),
    resolveWorkspaceRoot: vi.fn(),
    buildGroundModelAgentView: vi.fn(),
    formatGroundModelAgentDigest: vi.fn(),
  };
});

vi.mock('node:readline', () => ({
  createInterface: readlineMocks.createInterface,
}));

vi.mock('@geotechcli/core', () => ({
  GLOBAL_FLAG_DEFINITIONS: [],
  DEFAULT_LLM_VISION_MODEL: 'glm-5v-turbo',
  buildLLMConfig: coreMocks.buildLLMConfig,
  AgentConversation: coreMocks.AgentConversation,
  addAgentSession: vi.fn(),
  addArtifact: vi.fn(),
  addNote: vi.fn(),
  analyzeCoreBox: vi.fn(),
  analyzeWorkspace: coreMocks.analyzeWorkspace,
  resolveWorkspaceRoot: coreMocks.resolveWorkspaceRoot,
  buildGroundModelAgentView: coreMocks.buildGroundModelAgentView,
  formatGroundModelAgentDigest: coreMocks.formatGroundModelAgentDigest,
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
  runAgent: vi.fn(),
  runSwarm: vi.fn(),
  saveDerivedParameter: vi.fn(),
  saveNamedDataset: vi.fn(),
  setActiveAnalysisContext: vi.fn(),
}));

import { registerChatCommand } from '../src/commands/ai.js';

function makeSession(answer = 'done') {
  return {
    steps: [{ type: 'answer', content: answer, timestamp: Date.now() }],
    context: {},
    totalTokens: 1,
    totalLatencyMs: 1,
  };
}

function makeChatWorkspaceManifest() {
  return {
    rootPath: 'C:/project',
    files: [
      {
        path: 'data/bh.csv',
        classification: { datasetType: 'borehole-log', kind: 'csv', confidence: 0.9 },
      },
    ],
    warnings: [],
    summary: {
      totalFiles: 1,
      supportedFiles: 1,
      tabularFiles: 1,
      pdfFiles: 0,
      branches: ['boreholes'],
      recommendations: ['Run geotech analyze for an evidence-bound ground model.'],
    },
    groundModel: {
      stats: {
        boreholes: 3,
        sptTests: 12,
        labTests: 4,
        parameters: 8,
        evidenceRefs: 20,
        rejectedObservations: 1,
      },
      coordinateSystem: 'local',
    },
  };
}

describe('chat command skill opt-in', () => {
  beforeEach(() => {
    readlineMocks.handlers.clear();
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.conversationAsk.mockResolvedValue(makeSession());
    coreMocks.resolveWorkspaceRoot.mockReturnValue({ path: 'C:/project' });
    coreMocks.analyzeWorkspace.mockResolvedValue(undefined);
    coreMocks.conversationGetContext.mockReturnValue({});
    coreMocks.buildGroundModelAgentView.mockReturnValue({
      available: true,
      section: 'summary',
      counts: { boreholes: 3 },
      boreholes: [],
      warnings: [],
      truncated: false,
    });
    coreMocks.formatGroundModelAgentDigest.mockReturnValue('Ground-model digest text');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('keeps chat skill tools disabled unless --skills is passed', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat'], { from: 'user' });
    await readlineMocks.handlers.get('line')?.('review foundation');

    expect(coreMocks.conversationAsk).toHaveBeenCalledWith(
      'review foundation',
      expect.objectContaining({ skillsEnabled: false }),
      expect.any(Function),
    );
  });

  it('enables chat skill tools when --skills is passed', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat', '--skills'], { from: 'user' });
    await readlineMocks.handlers.get('line')?.('review foundation');

    expect(coreMocks.conversationAsk).toHaveBeenCalledWith(
      'review foundation',
      expect.objectContaining({ skillsEnabled: true }),
      expect.any(Function),
    );
  });
});

describe('chat command workspace auto-context (Gap B)', () => {
  beforeEach(() => {
    readlineMocks.handlers.clear();
    coreMocks.buildLLMConfig.mockReturnValue({
      provider: 'hosted-beta',
      apiKey: '',
      timeout: 60000,
      skillsEnabled: true,
    });
    coreMocks.conversationAsk.mockResolvedValue(makeSession());
    coreMocks.resolveWorkspaceRoot.mockReturnValue({ path: 'C:/project' });
    coreMocks.analyzeWorkspace.mockResolvedValue(makeChatWorkspaceManifest());
    coreMocks.conversationGetContext.mockReturnValue({});
    coreMocks.buildGroundModelAgentView.mockReturnValue({
      available: true,
      section: 'summary',
      counts: { boreholes: 3 },
      boreholes: [],
      warnings: [],
      truncated: false,
    });
    coreMocks.formatGroundModelAgentDigest.mockReturnValue('Ground-model digest text');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('auto-scans the current project folder and seeds the session context by default', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat'], { from: 'user' });

    expect(coreMocks.resolveWorkspaceRoot).toHaveBeenCalledWith({ workspacePath: undefined });
    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith('C:/project', {
      includeCalculationInputDrafts: false,
    });
    expect(coreMocks.AgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          workspaceSummary: expect.any(String),
          workspace: expect.objectContaining({
            rootPath: 'C:/project',
            groundModel: expect.objectContaining({ stats: expect.any(Object) }),
          }),
        }),
      }),
    );
  });

  it('skips workspace scanning and starts cold with --no-workspace', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat', '--no-workspace'], { from: 'user' });

    expect(coreMocks.resolveWorkspaceRoot).not.toHaveBeenCalled();
    expect(coreMocks.analyzeWorkspace).not.toHaveBeenCalled();
    expect(coreMocks.AgentConversation).toHaveBeenCalledWith({ context: undefined });
  });

  it('scans an explicit --workspace dir and forwards the skills flag into the scan', async () => {
    coreMocks.resolveWorkspaceRoot.mockReturnValue({ path: 'C:/explicit' });
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat', '--workspace', 'C:/explicit', '--skills'], { from: 'user' });

    expect(coreMocks.resolveWorkspaceRoot).toHaveBeenCalledWith({ workspacePath: 'C:/explicit' });
    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledWith('C:/explicit', {
      includeCalculationInputDrafts: true,
    });
  });

  it('re-scans the workspace and refreshes the session context on /rescan', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat'], { from: 'user' });
    coreMocks.analyzeWorkspace.mockClear();

    await readlineMocks.handlers.get('line')?.('/rescan');

    expect(coreMocks.analyzeWorkspace).toHaveBeenCalledTimes(1);
    expect(coreMocks.conversationReplaceContext).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceSummary: expect.any(String) }),
    );
    expect(coreMocks.conversationAsk).not.toHaveBeenCalled();
  });

  it('forces the agent path past the deterministic preflight with --force-agent', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat', '--force-agent', '--no-workspace'], { from: 'user' });

    expect(coreMocks.AgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({ runOptions: { disableDeterministicPreflight: true } }),
    );
  });

  it('does not set run options without --force-agent', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat', '--no-workspace'], { from: 'user' });

    expect(coreMocks.AgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({ runOptions: undefined }),
    );
  });

  it('does not auto-scan again when answering a normal prompt', async () => {
    const program = new Command();
    registerChatCommand(program);

    await program.parseAsync(['chat'], { from: 'user' });
    coreMocks.analyzeWorkspace.mockClear();

    await readlineMocks.handlers.get('line')?.('summarize the ground model');

    expect(coreMocks.analyzeWorkspace).not.toHaveBeenCalled();
    expect(coreMocks.conversationAsk).toHaveBeenCalledWith(
      'summarize the ground model',
      expect.any(Object),
      expect.any(Function),
    );
  });
});

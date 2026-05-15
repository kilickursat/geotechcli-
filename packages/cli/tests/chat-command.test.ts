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

const coreMocks = vi.hoisted(() => ({
  buildLLMConfig: vi.fn(),
  conversationAsk: vi.fn(),
}));

vi.mock('node:readline', () => ({
  createInterface: readlineMocks.createInterface,
}));

vi.mock('@geotechcli/core', () => ({
  GLOBAL_FLAG_DEFINITIONS: [],
  DEFAULT_LLM_VISION_MODEL: 'glm-5v-turbo',
  buildLLMConfig: coreMocks.buildLLMConfig,
  AgentConversation: vi.fn().mockImplementation(function AgentConversation() {
    return {
      ask: coreMocks.conversationAsk,
      clearContext: vi.fn(),
      getContext: vi.fn(() => ({})),
    };
  }),
  addAgentSession: vi.fn(),
  addArtifact: vi.fn(),
  addNote: vi.fn(),
  analyzeCoreBox: vi.fn(),
  analyzeWorkspace: vi.fn(),
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

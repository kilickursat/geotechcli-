import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const coreMocks = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  loadConfig: vi.fn(),
  registry: {
    get: vi.fn(),
  },
  setConfigValue: vi.fn(),
}));

vi.mock('@geotechcli/core', () => ({
  getConfigValue: coreMocks.getConfigValue,
  loadConfig: coreMocks.loadConfig,
  registry: coreMocks.registry,
  setConfigValue: coreMocks.setConfigValue,
}));

vi.mock('@geotechcli/core/meta', () => ({
  DEFAULT_LLM_MODEL: 'Qwen/Qwen3.5-9B',
}));

import { registerConfigCommand } from '../src/commands/config.js';

describe('config command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('prints effective hosted-beta model defaults for empty model overrides', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const modelProgram = new Command();
    const visionProgram = new Command();

    coreMocks.getConfigValue.mockReturnValue('');
    coreMocks.loadConfig.mockReturnValue({
      llm: {
        provider: 'hosted-beta',
      },
    });
    coreMocks.registry.get.mockReturnValue({
      defaultModel: 'Qwen/Qwen3.5-9B',
      defaultVisionModel: 'Qwen/Qwen3.5-9B',
    });

    registerConfigCommand(modelProgram);
    registerConfigCommand(visionProgram);

    await modelProgram.parseAsync(['config', 'get', 'llm.model'], { from: 'user' });
    await visionProgram.parseAsync(['config', 'get', 'llm.vision_model'], { from: 'user' });

    expect(logSpy).toHaveBeenNthCalledWith(1, 'Qwen/Qwen3.5-9B');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'Qwen/Qwen3.5-9B');
  });
});

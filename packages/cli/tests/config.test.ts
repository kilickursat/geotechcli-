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
  DEFAULT_LLM_MODEL: 'glm-5.1',
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
      defaultModel: 'glm-5.1',
      defaultVisionModel: 'glm-5v-turbo',
    });

    registerConfigCommand(modelProgram);
    registerConfigCommand(visionProgram);

    await modelProgram.parseAsync(['config', 'get', 'llm.model'], { from: 'user' });
    await visionProgram.parseAsync(['config', 'get', 'llm.vision_model'], { from: 'user' });

    expect(logSpy).toHaveBeenNthCalledWith(1, 'glm-5.1');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'glm-5v-turbo');
  });
});

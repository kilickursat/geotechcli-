import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildLLMConfig, loadConfig, saveConfig } from '../src/config/index.js';

describe('hosted-beta config defaults', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;
  let previousProxyUrl: string | undefined;
  let previousHostedBetaAuthKey: string | undefined;
  let previousSkillsFlag: string | undefined;
  let previousZhipuApiKey: string | undefined;
  let previousZhipuBaseUrl: string | undefined;
  let previousOpenAICompatibleModel: string | undefined;
  let previousOpenAICompatibleModelId: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    previousProxyUrl = process.env.GEOTECHCLI_PROXY_URL;
    previousHostedBetaAuthKey = process.env.GEOTECHCLI_AUTH_API_KEY;
    previousSkillsFlag = process.env.GEOTECHCLI_ENABLE_SKILLS;
    previousZhipuApiKey = process.env.ZHIPU_API_KEY;
    previousZhipuBaseUrl = process.env.ZHIPU_API_BASE_URL;
    previousOpenAICompatibleModel = process.env.OPENAI_COMPATIBLE_MODEL;
    previousOpenAICompatibleModelId = process.env.OPENAI_COMPATIBLE_MODEL_ID;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-config-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
    delete process.env.GEOTECHCLI_PROXY_URL;
    delete process.env.GEOTECHCLI_ENABLE_SKILLS;
    delete process.env.ZHIPU_API_KEY;
    delete process.env.ZHIPU_API_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
    delete process.env.OPENAI_COMPATIBLE_MODEL_ID;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    if (previousProxyUrl === undefined) {
      delete process.env.GEOTECHCLI_PROXY_URL;
    } else {
      process.env.GEOTECHCLI_PROXY_URL = previousProxyUrl;
    }

    if (previousHostedBetaAuthKey === undefined) {
      delete process.env.GEOTECHCLI_AUTH_API_KEY;
    } else {
      process.env.GEOTECHCLI_AUTH_API_KEY = previousHostedBetaAuthKey;
    }

    if (previousSkillsFlag === undefined) {
      delete process.env.GEOTECHCLI_ENABLE_SKILLS;
    } else {
      process.env.GEOTECHCLI_ENABLE_SKILLS = previousSkillsFlag;
    }

    if (previousZhipuApiKey === undefined) {
      delete process.env.ZHIPU_API_KEY;
    } else {
      process.env.ZHIPU_API_KEY = previousZhipuApiKey;
    }

    if (previousZhipuBaseUrl === undefined) {
      delete process.env.ZHIPU_API_BASE_URL;
    } else {
      process.env.ZHIPU_API_BASE_URL = previousZhipuBaseUrl;
    }

    if (previousOpenAICompatibleModel === undefined) {
      delete process.env.OPENAI_COMPATIBLE_MODEL;
    } else {
      process.env.OPENAI_COMPATIBLE_MODEL = previousOpenAICompatibleModel;
    }

    if (previousOpenAICompatibleModelId === undefined) {
      delete process.env.OPENAI_COMPATIBLE_MODEL_ID;
    } else {
      process.env.OPENAI_COMPATIBLE_MODEL_ID = previousOpenAICompatibleModelId;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('creates hosted-beta as the default provider for new configs', () => {
    const config = loadConfig();
    const llmConfig = buildLLMConfig();

    expect(config.llm.provider).toBe('hosted-beta');
    expect(config.skills.enabled).toBe(false);
    expect(config.skills.trusted_only).toBe(true);
    expect(llmConfig.provider).toBe('hosted-beta');
    expect(llmConfig.apiKey).toBe('');
    expect(llmConfig.baseUrl).toBe('https://beta.geotechcli.com/api/proxy');
    expect(llmConfig.skillsEnabled).toBe(false);
  });

  it('uses GEOTECHCLI_PROXY_URL when hosted-beta is active', () => {
    process.env.GEOTECHCLI_PROXY_URL = 'https://beta.geotechcli.com/api/proxy';

    saveConfig({
      llm: {
        provider: 'hosted-beta',
        api_key: '',
        model: '',
        vision_model: '',
        base_url: '',
        timeout: 60000,
      },
      auth: {
        api_key: '',
        tier: 'free',
      },
      cli: {
        color: true,
        verbose: false,
      },
    });

    const llmConfig = buildLLMConfig();
    expect(llmConfig.provider).toBe('hosted-beta');
    expect(llmConfig.baseUrl).toBe('https://beta.geotechcli.com/api/proxy');
  });

  it('uses auth.api_key for hosted-beta developer requests', () => {
    saveConfig({
      llm: {
        provider: 'hosted-beta',
        api_key: '',
        model: '',
        vision_model: '',
        base_url: '',
        timeout: 60000,
      },
      auth: {
        api_key: 'gtdev_local_key',
        tier: 'pro',
      },
      cli: {
        color: true,
        verbose: false,
      },
    });

    const llmConfig = buildLLMConfig();
    expect(llmConfig.provider).toBe('hosted-beta');
    expect(llmConfig.apiKey).toBe('gtdev_local_key');
  });

  it('keeps agent skill tools disabled in LLM config even when the environment requests skills', () => {
    process.env.GEOTECHCLI_ENABLE_SKILLS = '1';

    const llmConfig = buildLLMConfig();

    expect(llmConfig.skillsEnabled).toBe(false);
  });

  it('keeps agent skill tools disabled in LLM config even when persisted config enables skills', () => {
    saveConfig({
      llm: {
        provider: 'hosted-beta',
        api_key: '',
        model: '',
        vision_model: '',
        base_url: '',
        timeout: 60000,
      },
      auth: {
        api_key: '',
        tier: 'free',
      },
      cli: {
        color: true,
        verbose: false,
      },
      skills: {
        enabled: true,
        directory: '',
        python_path: 'python',
        trusted_only: true,
      },
    });

    const llmConfig = buildLLMConfig();

    expect(llmConfig.skillsEnabled).toBe(false);
  });

  it('uses ZHIPU_API_KEY and ZHIPU_API_BASE_URL for direct Z.ai provider overrides', () => {
    process.env.ZHIPU_API_KEY = 'zhipu-env-key';
    process.env.ZHIPU_API_BASE_URL = 'https://api.z.ai/api/paas/v4';

    saveConfig({
      llm: {
        provider: 'zhipu',
        api_key: '',
        model: 'glm-5.1',
        vision_model: 'glm-5v-turbo',
        base_url: '',
        timeout: 60000,
      },
      auth: {
        api_key: '',
        tier: 'free',
      },
      cli: {
        color: true,
        verbose: false,
      },
    });

    const llmConfig = buildLLMConfig();
    expect(llmConfig.provider).toBe('zhipu');
    expect(llmConfig.apiKey).toBe('zhipu-env-key');
    expect(llmConfig.baseUrl).toBe('https://api.z.ai/api/paas/v4');
    expect(llmConfig.modelId).toBe('glm-5.1');
    expect(llmConfig.visionModelId).toBe('glm-5v-turbo');
  });

  it('uses OPENAI_COMPATIBLE_MODEL as the documented model env and keeps MODEL_ID as a fallback alias', () => {
    process.env.OPENAI_COMPATIBLE_MODEL = 'openrouter/free-model';
    process.env.OPENAI_COMPATIBLE_MODEL_ID = 'legacy/model-id';

    saveConfig({
      llm: {
        provider: 'openai-compatible',
        api_key: '',
        model: 'config-model',
        vision_model: '',
        base_url: 'https://openrouter.ai/api/v1',
        timeout: 60000,
      },
      auth: {
        api_key: '',
        tier: 'free',
      },
      cli: {
        color: true,
        verbose: false,
      },
    });

    expect(buildLLMConfig().modelId).toBe('openrouter/free-model');

    delete process.env.OPENAI_COMPATIBLE_MODEL;
    expect(buildLLMConfig().modelId).toBe('legacy/model-id');
  });
});

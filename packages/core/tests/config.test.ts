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
  let previousOpenRouterApiKey: string | undefined;
  let previousOpenRouterBaseUrl: string | undefined;
  let previousOpenRouterModel: string | undefined;
  let previousHfToken: string | undefined;
  let previousHuggingFaceApiKey: string | undefined;
  let previousHuggingFaceToken: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    previousProxyUrl = process.env.GEOTECHCLI_PROXY_URL;
    previousHostedBetaAuthKey = process.env.GEOTECHCLI_AUTH_API_KEY;
    previousSkillsFlag = process.env.GEOTECHCLI_ENABLE_SKILLS;
    previousZhipuApiKey = process.env.ZHIPU_API_KEY;
    previousZhipuBaseUrl = process.env.ZHIPU_API_BASE_URL;
    previousOpenAICompatibleModel = process.env.OPENAI_COMPATIBLE_MODEL;
    previousOpenAICompatibleModelId = process.env.OPENAI_COMPATIBLE_MODEL_ID;
    previousOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    previousOpenRouterBaseUrl = process.env.OPENROUTER_BASE_URL;
    previousOpenRouterModel = process.env.OPENROUTER_MODEL;
    previousHfToken = process.env.HF_TOKEN;
    previousHuggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
    previousHuggingFaceToken = process.env.HUGGINGFACE_TOKEN;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-config-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
    delete process.env.GEOTECHCLI_PROXY_URL;
    delete process.env.GEOTECHCLI_ENABLE_SKILLS;
    delete process.env.ZHIPU_API_KEY;
    delete process.env.ZHIPU_API_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
    delete process.env.OPENAI_COMPATIBLE_MODEL_ID;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.HF_TOKEN;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.HUGGINGFACE_TOKEN;
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

    if (previousOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousOpenRouterApiKey;
    }

    if (previousOpenRouterBaseUrl === undefined) {
      delete process.env.OPENROUTER_BASE_URL;
    } else {
      process.env.OPENROUTER_BASE_URL = previousOpenRouterBaseUrl;
    }

    if (previousOpenRouterModel === undefined) {
      delete process.env.OPENROUTER_MODEL;
    } else {
      process.env.OPENROUTER_MODEL = previousOpenRouterModel;
    }

    if (previousHfToken === undefined) {
      delete process.env.HF_TOKEN;
    } else {
      process.env.HF_TOKEN = previousHfToken;
    }

    if (previousHuggingFaceApiKey === undefined) {
      delete process.env.HUGGINGFACE_API_KEY;
    } else {
      process.env.HUGGINGFACE_API_KEY = previousHuggingFaceApiKey;
    }

    if (previousHuggingFaceToken === undefined) {
      delete process.env.HUGGINGFACE_TOKEN;
    } else {
      process.env.HUGGINGFACE_TOKEN = previousHuggingFaceToken;
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
        model: 'glm-5.2',
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
    expect(llmConfig.modelId).toBe('glm-5.2');
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

  it('accepts OpenRouter env aliases for the openai-compatible runtime provider', () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-env-key';
    process.env.OPENROUTER_MODEL = 'google/gemma-free';

    saveConfig({
      llm: {
        provider: 'openai-compatible',
        api_key: 'config-key',
        model: 'config-model',
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
    expect(llmConfig.provider).toBe('openai-compatible');
    expect(llmConfig.apiKey).toBe('openrouter-env-key');
    expect(llmConfig.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(llmConfig.modelId).toBe('google/gemma-free');
  });

  it('accepts HUGGINGFACE_API_KEY as a runtime BYOK alias', () => {
    process.env.HUGGINGFACE_API_KEY = 'hf-env-key';

    saveConfig({
      llm: {
        provider: 'huggingface',
        api_key: '',
        model: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
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
    expect(llmConfig.provider).toBe('huggingface');
    expect(llmConfig.apiKey).toBe('hf-env-key');
  });
});

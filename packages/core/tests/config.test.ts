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

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    previousProxyUrl = process.env.GEOTECHCLI_PROXY_URL;
    previousHostedBetaAuthKey = process.env.GEOTECHCLI_AUTH_API_KEY;
    previousSkillsFlag = process.env.GEOTECHCLI_ENABLE_SKILLS;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-config-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
    delete process.env.GEOTECHCLI_PROXY_URL;
    delete process.env.GEOTECHCLI_ENABLE_SKILLS;
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

  it('lets the environment explicitly enable skills for a session', () => {
    process.env.GEOTECHCLI_ENABLE_SKILLS = '1';

    const llmConfig = buildLLMConfig();

    expect(llmConfig.skillsEnabled).toBe(true);
  });
});

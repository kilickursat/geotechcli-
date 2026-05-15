import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { DEFAULT_LLM_PROVIDER } from '../meta/index.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const LLMProviderSchema = z.enum([
  'hosted-beta',
  'zhipu',
  'openai',
  'anthropic',
  'openai-compatible',
  'huggingface',
]);

const ConfigSchema = z.object({
  llm: z
    .object({
      provider: LLMProviderSchema.default(DEFAULT_LLM_PROVIDER),
      api_key: z.string().default(''),
      model: z.string().default(''),
      vision_model: z.string().default(''),
      base_url: z.string().default(''),
      timeout: z.number().default(60000),
    })
    .default({}),
  auth: z
    .object({
      api_key: z.string().default(''),
      tier: z.enum(['free', 'lite_pro', 'pro', 'annual']).default('free'),
    })
    .default({}),
  cli: z
    .object({
      color: z.boolean().default(true),
      verbose: z.boolean().default(false),
    })
    .default({}),
  skills: z
    .object({
      enabled: z.boolean().default(false),
      directory: z.string().default(''),
      python_path: z.string().default('python'),
      trusted_only: z.boolean().default(true),
    })
    .default({}),
});

export type GeotechConfig = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getConfigDir(): string {
  const dir =
    process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    if (platform() !== 'win32') {
      try { chmodSync(dir, 0o700); } catch { /* best effort */ }
    }
  }
  return dir;
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export function loadConfig(): GeotechConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    const defaults = ConfigSchema.parse({});
    saveConfig(defaults);
    return defaults;
  }

  // SECURITY: Auto-repair permissions if config file is too open
  if (platform() !== 'win32') {
    try {
      const st = statSync(configPath);
      const mode = st.mode & 0o777;
      if (mode & 0o077) {
        chmodSync(configPath, 0o600);
        console.error(
          `WARNING geotechCLI: Repaired config permissions (was ${mode.toString(8)}, now 600). Config contains API keys.`,
        );
      }
    } catch { /* best effort */ }
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch {
    const defaults = ConfigSchema.parse({});
    saveConfig(defaults);
    return defaults;
  }
}

export function saveConfig(config: GeotechConfig | Partial<GeotechConfig>): void {
  const configPath = getConfigPath();
  const validated = ConfigSchema.parse(config);
  writeFileSync(configPath, JSON.stringify(validated, null, 2), 'utf-8');
  if (platform() !== 'win32') {
    try { chmodSync(configPath, 0o600); } catch { /* best effort */ }
  }
}

/**
 * Set a nested config value using dot notation.
 * Example: setConfigValue('llm.provider', 'openai')
 */
export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const parts = key.split('.');

  // Navigate to parent, then set leaf
  let current: Record<string, unknown> = config as unknown as Record<
    string,
    unknown
  >;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      typeof current[part] !== 'object' ||
      current[part] === null
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const leaf = parts[parts.length - 1];

  // Type coercion for known boolean/number fields
  if (value === 'true') {
    current[leaf] = true;
  } else if (value === 'false') {
    current[leaf] = false;
  } else if (!isNaN(Number(value)) && value.trim() !== '') {
    current[leaf] = Number(value);
  } else {
    current[leaf] = value;
  }

  // Re-validate entire config
  const validated = ConfigSchema.parse(config);
  saveConfig(validated);
}

/**
 * Get a nested config value using dot notation.
 */
export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const parts = key.split('.');

  let current: unknown = config;
  for (const part of parts) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !(part in current)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Build an LLMConfig from the stored config + environment variables.
 * Environment variables take precedence over config file values when present.
 * API keys are NEVER logged or exposed.
 */
export function buildLLMConfig(): import('../llm/types.js').LLMConfig & { timeout: number; skillsEnabled: boolean } {
  const config = loadConfig();

  const provider = config.llm.provider;

  function preferEnv(...values: Array<string | undefined>): string {
    for (const value of values) {
      if (value && value.trim().length > 0) {
        return value;
      }
    }
    return '';
  }

  // Resolve API key: env var > config file
  let apiKey = config.llm.api_key;
  switch (provider) {
    case 'hosted-beta':
      apiKey = preferEnv(process.env.GEOTECHCLI_AUTH_API_KEY, config.auth.api_key);
      break;
    case 'zhipu':
      apiKey = preferEnv(process.env.ZHIPU_API_KEY, process.env.ZAI_API_KEY, config.llm.api_key);
      break;
    case 'openai':
      apiKey = preferEnv(process.env.OPENAI_API_KEY, config.llm.api_key);
      break;
    case 'anthropic':
      apiKey = preferEnv(process.env.ANTHROPIC_API_KEY, config.llm.api_key);
      break;
    case 'openai-compatible':
      apiKey = preferEnv(
        process.env.OPENAI_COMPATIBLE_API_KEY,
        process.env.OPENAI_API_KEY,
        config.llm.api_key,
      );
      break;
    case 'huggingface':
      apiKey = preferEnv(
        process.env.HF_TOKEN,
        process.env.HUGGINGFACE_TOKEN,
        config.llm.api_key,
      );
      break;
  }

  // Resolve base URL for openai-compatible or hosted-beta
  let baseUrl = config.llm.base_url || undefined;
  if (provider === 'hosted-beta') {
    baseUrl =
      preferEnv(process.env.GEOTECHCLI_PROXY_URL, config.llm.base_url) ||
      'https://beta.geotechcli.com/api/proxy';
  } else if (provider === 'zhipu') {
    baseUrl = preferEnv(process.env.ZHIPU_API_BASE_URL, process.env.ZAI_API_BASE_URL, config.llm.base_url) || undefined;
  } else if (provider === 'openai-compatible') {
    baseUrl = preferEnv(
      process.env.OPENAI_COMPATIBLE_BASE_URL,
      config.llm.base_url,
    ) || undefined;
  }

  // Resolve model overrides
  let modelId = config.llm.model || undefined;
  if (provider === 'openai-compatible') {
    modelId = preferEnv(process.env.OPENAI_COMPATIBLE_MODEL_ID, config.llm.model) || undefined;
  }

  return {
    provider,
    apiKey,
    baseUrl,
    modelId,
    visionModelId: config.llm.vision_model || undefined,
    timeout: config.llm.timeout,
    // Agent/chat skill tools are intentionally enabled per session by the CLI
    // `--skills` flag. Keep persisted skill runtime settings out of LLMConfig.
    skillsEnabled: false,
  };
}

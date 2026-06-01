#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = resolve(root, 'packages/core/dist/index.js');

if (!existsSync(distEntry)) {
  console.error('BYOK smoke requires built core output. Run `npm run --workspace=@geotechcli/core build` first.');
  process.exit(1);
}

const {
  buildByokBenchmarkPrompt,
  buildByokBenchmarkReport,
  buildByokProviderBenchmarkProfile,
  generateText,
  validateByokBenchmarkResponse,
} = await import('../packages/core/dist/index.js');

const parsedArgs = parseArgs(process.argv.slice(2));
const strict = parsedArgs.strict;
const requestedProviders = new Set(
  parsedArgs.providers,
);

const candidates = [
  {
    name: 'hosted-beta',
    profileId: 'hosted-beta',
    env: ['GEOTECHCLI_BYOK_HOSTED_BETA'],
    requiresTruthy: true,
    config: () => ({
      provider: 'hosted-beta',
      apiKey: envValue('GEOTECHCLI_HOSTED_BETA_TOKEN'),
      baseUrl: envValue('GEOTECHCLI_PROXY_URL') || undefined,
      modelId: process.env.GEOTECHCLI_BYOK_HOSTED_BETA_MODEL || 'glm-5.1',
      visionModelId: process.env.GEOTECHCLI_BYOK_HOSTED_BETA_VISION_MODEL || 'glm-5v-turbo',
      timeout: timeoutMs(120_000),
    }),
  },
  {
    name: 'zhipu',
    profileId: 'direct-zai',
    env: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
    config: () => ({
      provider: 'zhipu',
      apiKey: envValue('ZHIPU_API_KEY', 'ZAI_API_KEY'),
      baseUrl: envValue('ZHIPU_API_BASE_URL', 'ZAI_API_BASE_URL') || undefined,
      modelId: process.env.GEOTECHCLI_BYOK_ZHIPU_MODEL || 'glm-5.1',
      timeout: timeoutMs(),
    }),
  },
  {
    name: 'openai',
    profileId: 'premium-byok',
    env: ['OPENAI_API_KEY'],
    config: () => ({
      provider: 'openai',
      apiKey: envValue('OPENAI_API_KEY'),
      modelId: process.env.GEOTECHCLI_BYOK_OPENAI_MODEL || 'gpt-4o-mini',
      timeout: timeoutMs(),
    }),
  },
  {
    name: 'anthropic',
    profileId: 'premium-byok',
    env: ['ANTHROPIC_API_KEY'],
    config: () => ({
      provider: 'anthropic',
      apiKey: envValue('ANTHROPIC_API_KEY'),
      modelId: process.env.GEOTECHCLI_BYOK_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      timeout: timeoutMs(),
    }),
  },
  {
    name: 'huggingface',
    profileId: 'local-hf-compatible',
    env: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
    config: () => ({
      provider: 'huggingface',
      apiKey: envValue('HF_TOKEN', 'HUGGINGFACE_API_KEY'),
      modelId: process.env.GEOTECHCLI_BYOK_HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct:fastest',
      timeout: timeoutMs(90_000),
    }),
  },
  {
    name: 'openai-compatible',
    profileId: 'openai-compatible',
    env: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODEL'],
    requiresAll: true,
    config: () => ({
      provider: 'openai-compatible',
      apiKey: envValue('OPENAI_COMPATIBLE_API_KEY'),
      baseUrl: envValue('OPENAI_COMPATIBLE_BASE_URL'),
      modelId: envValue('OPENAI_COMPATIBLE_MODEL'),
      timeout: timeoutMs(),
    }),
  },
  {
    name: 'openrouter',
    profileId: 'openrouter-free',
    env: ['OPENROUTER_API_KEY'],
    config: () => ({
      provider: 'openai-compatible',
      apiKey: envValue('OPENROUTER_API_KEY'),
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      modelId: process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
      timeout: timeoutMs(90_000),
    }),
  },
];

const selected = candidates.filter((candidate) =>
  requestedProviders.size === 0 || requestedProviders.has(candidate.name),
);
const configured = selected.filter((candidate) =>
  candidate.requiresTruthy
    ? candidate.env.some((name) => /^(?:1|true|yes|on)$/i.test(String(process.env[name] ?? '').trim()))
    : candidate.requiresAll
    ? candidate.env.every((name) => Boolean(process.env[name]))
    : candidate.env.some((name) => Boolean(process.env[name])),
);

if (configured.length === 0) {
  const providerHint = requestedProviders.size > 0 ? ` for ${[...requestedProviders].join(', ')}` : '';
  if (parsedArgs.out || parsedArgs.json) {
    const skippedReport = buildByokBenchmarkReport([]);
    if (parsedArgs.out) {
      const outputPath = resolve(parsedArgs.out);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(skippedReport, null, 2)}\n`);
      console.log(`BYOK benchmark report: ${parsedArgs.out}`);
    }
    if (parsedArgs.json) {
      console.log(JSON.stringify(skippedReport, null, 2));
    }
  }
  console.log(`BYOK smoke skipped: no matching provider environment keys configured${providerHint}.`);
  console.log('Supported envs: GEOTECHCLI_BYOK_HOSTED_BETA=1, OPENROUTER_API_KEY, ZHIPU_API_KEY/ZAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, HF_TOKEN/HUGGINGFACE_API_KEY, or OPENAI_COMPATIBLE_API_KEY + OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_MODEL.');
  process.exit(strict ? 1 : 0);
}

const runs = [];
for (const candidate of configured) {
  const started = Date.now();
  const config = candidate.config();
  const profile = buildByokProviderBenchmarkProfile(candidate.profileId, config);
  const prompt = buildByokBenchmarkPrompt(profile);
  try {
    const response = await generateText(prompt, config, {
      temperature: 0,
      maxTokens: 180,
      jsonMode: profile.jsonModeAllowed,
    });
    const validation = validateByokBenchmarkResponse(String(response.text ?? ''), profile.evidenceContract);
    runs.push({
      profile,
      ok: validation.ok,
      model: response.model,
      latencyMs: response.latencyMs,
      totalTokens: response.usage.totalTokens,
      response: validation,
    });
  } catch (error) {
    runs.push({
      profile,
      ok: false,
      model: config.modelId ?? null,
      latencyMs: Date.now() - started,
      totalTokens: null,
      response: {
        ok: false,
        parsedJson: false,
        citedEvidenceIds: [],
        failures: ['provider_error'],
        warnings: [],
      },
      error: error instanceof Error ? redactSecretLikeText(error.message) : String(error),
    });
  }
}

const report = buildByokBenchmarkReport(runs);
if (parsedArgs.out) {
  const outputPath = resolve(parsedArgs.out);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
if (parsedArgs.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (parsedArgs.out) {
  console.log(`BYOK benchmark report: ${parsedArgs.out}`);
}

for (const run of runs) {
  if (run.ok) {
    console.log(`PASS ${run.profile.id}: provider=${run.profile.provider} model=${run.model ?? 'unknown'} latency=${run.latencyMs}ms tokens=${run.totalTokens ?? 0}`);
  } else {
    const details = run.error ?? (run.response.failures.join(', ') || 'response did not satisfy evidence contract');
    console.error(`FAIL ${run.profile.id}: provider=${run.profile.provider} ${details}`);
  }
}

if (!report.summary.passed) {
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    strict: truthy(process.env.npm_config_strict),
    json: truthy(process.env.npm_config_json),
    out: process.env.npm_config_out || '',
    providers: splitCsv(process.env.npm_config_provider || ''),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') {
      parsed.strict = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        console.error('--out requires a file path.');
        process.exit(1);
      }
      parsed.out = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      parsed.out = arg.slice('--out='.length);
      continue;
    }
    if (arg === '--provider') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        console.error('--provider requires a provider name or comma-separated list.');
        process.exit(1);
      }
      parsed.providers.push(...splitCsv(value));
      index += 1;
      continue;
    }
    if (arg.startsWith('--provider=')) {
      parsed.providers.push(...splitCsv(arg.slice('--provider='.length)));
      continue;
    }
    if (!arg.startsWith('--') && (!parsed.out || parsed.out === 'true')) {
      parsed.out = arg;
      continue;
    }
    console.error(`Unknown BYOK smoke option: ${arg}`);
    process.exit(1);
  }
  return {
    ...parsed,
    providers: [...new Set(parsed.providers)],
  };
}

function splitCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function truthy(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function timeoutMs(fallback = 45_000) {
  const value = Number(process.env.GEOTECHCLI_BYOK_SMOKE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function redactSecretLikeText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***')
    .replace(/sk-or-v1-[A-Za-z0-9_-]{8,}/g, 'sk-or-v1-***')
    .replace(/hf_[A-Za-z0-9_-]{8,}/g, 'hf_***')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '***');
}

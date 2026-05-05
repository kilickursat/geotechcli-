#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = resolve(root, 'packages/core/dist/index.js');

if (!existsSync(distEntry)) {
  console.error('BYOK smoke requires built core output. Run `npm run --workspace=@geotechcli/core build` first.');
  process.exit(1);
}

const { generateText } = await import('../packages/core/dist/index.js');

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const requestedProviders = new Set(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--provider='))
    .flatMap((arg) => arg.slice('--provider='.length).split(',').map((value) => value.trim()).filter(Boolean)),
);

const candidates = [
  {
    name: 'zhipu',
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
  candidate.requiresAll
    ? candidate.env.every((name) => Boolean(process.env[name]))
    : candidate.env.some((name) => Boolean(process.env[name])),
);

if (configured.length === 0) {
  const providerHint = requestedProviders.size > 0 ? ` for ${[...requestedProviders].join(', ')}` : '';
  console.log(`BYOK smoke skipped: no matching provider environment keys configured${providerHint}.`);
  console.log('Supported envs: OPENROUTER_API_KEY, ZHIPU_API_KEY/ZAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, HF_TOKEN/HUGGINGFACE_API_KEY, or OPENAI_COMPATIBLE_API_KEY + OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_MODEL.');
  process.exit(strict ? 1 : 0);
}

const prompt = [
  'Return ONLY compact JSON with keys ok and note.',
  'Set ok to true and note to a short geotechnical phrase containing "source evidence".',
].join(' ');

const results = [];
for (const candidate of configured) {
  const started = Date.now();
  try {
    const response = await generateText(prompt, candidate.config(), {
      temperature: 0,
      maxTokens: 80,
      jsonMode: candidate.name !== 'openrouter',
    });
    const text = String(response.text ?? '').trim();
    const ok = /"ok"\s*:\s*true|source evidence/i.test(text);
    results.push({
      provider: candidate.name,
      ok,
      model: response.model,
      latencyMs: response.latencyMs,
      totalTokens: response.usage.totalTokens,
      textPreview: text.slice(0, 160),
    });
  } catch (error) {
    results.push({
      provider: candidate.name,
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? redactSecretLikeText(error.message) : String(error),
    });
  }
}

for (const result of results) {
  if (result.ok) {
    console.log(`PASS ${result.provider}: model=${result.model ?? 'unknown'} latency=${result.latencyMs}ms tokens=${result.totalTokens ?? 0}`);
  } else {
    console.error(`FAIL ${result.provider}: ${result.error ?? result.textPreview ?? 'response did not satisfy smoke contract'}`);
  }
}

if (results.some((result) => !result.ok)) {
  process.exit(1);
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

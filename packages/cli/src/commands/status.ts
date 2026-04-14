import { Command } from 'commander';
import {
  loadConfig,
  buildLLMConfig,
  generateText,
  GEOTECHCLI_VERSION,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core';
import { heading, keyValue, warn, renderJSON } from '../ui/terminal.js';
import ora from 'ora';
import chalk from 'chalk';

async function probeHostedBetaHealth(baseUrl: string | undefined) {
  if (!baseUrl) {
    return { connectivity: 'error', latencyMs: 0, detail: 'Hosted beta proxy URL is not configured.' };
  }

  const startedAt = Date.now();
  const response = await fetch(baseUrl, {
    method: 'GET',
    headers: {
      'x-geotech-client-version': GEOTECHCLI_VERSION,
    },
    signal: AbortSignal.timeout(5_000),
  });
  const latencyMs = Date.now() - startedAt;

  const payload = await response.json().catch(() => null) as
    | { issue?: string; status?: string }
    | null;

  return {
    connectivity: response.ok ? 'online' : 'degraded',
    latencyMs,
    detail: payload?.issue ?? (typeof payload?.status === 'string' ? payload.status : undefined),
  };
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check system status, hosted beta health, LLM connectivity, and auth tier')
    .option('--json', 'Output raw JSON')
    .option('--live', 'Run a live LLM completion probe instead of a config/health check')
    .action(async (opts) => {
      const config = loadConfig();
      const llmConfig = buildLLMConfig();
      const usesHostedBeta = llmConfig.provider === 'hosted-beta';

      const status = {
        version: GEOTECHCLI_VERSION,
        provider: config.llm.provider,
        model: config.llm.model || DEFAULT_LLM_MODEL,
        visionModel: config.llm.vision_model || DEFAULT_LLM_VISION_MODEL,
        tier: config.auth.tier,
        apiKeySet: Boolean(llmConfig.apiKey),
        requiresUserApiKey: !usesHostedBeta,
        connectivity: 'unknown' as string,
        latencyMs: 0,
        probe: opts.live ? 'live_completion' : usesHostedBeta ? 'hosted_beta_health' : 'config_only',
        detail: '' as string | undefined,
      };

      if (!opts.json) {
        heading('geotechCLI Status');
        keyValue('Version', status.version);
        keyValue('LLM provider', config.llm.provider);
        keyValue('Model', status.model);
        keyValue('Vision model', status.visionModel);
        keyValue('Tier', config.auth.tier);
        keyValue(
          'API key',
          usesHostedBeta
            ? chalk.gray('not required for hosted beta')
            : status.apiKeySet
              ? chalk.green('set')
              : chalk.yellow('not set'),
        );
      }

      if (usesHostedBeta && !opts.live) {
        const spinner = opts.json ? null : ora({ text: 'Checking hosted beta health...', indent: 2 }).start();

        try {
          const health = await probeHostedBetaHealth(llmConfig.baseUrl);
          status.connectivity = health.connectivity;
          status.latencyMs = health.latencyMs;
          status.detail = health.detail;

          if (spinner) {
            if (health.connectivity === 'online') {
              spinner.succeed(`Hosted beta ready - ${health.latencyMs}ms health check`);
            } else {
              spinner.fail(`Hosted beta degraded${health.detail ? `: ${health.detail}` : ''}`);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          status.connectivity = 'error';
          status.detail = message;

          if (spinner) {
            spinner.fail(`Hosted beta health check failed: ${message.slice(0, 120)}`);
          }
        }
      } else if (opts.live && (usesHostedBeta || llmConfig.apiKey)) {
        const spinner = opts.json ? null : ora({ text: 'Testing live LLM connectivity...', indent: 2 }).start();

        try {
          const response = await generateText(
            'Reply with exactly: OK',
            llmConfig,
            { maxTokens: 10, temperature: 0 },
          );

          status.connectivity = 'online';
          status.latencyMs = response.latencyMs;

          if (spinner) {
            spinner.succeed(`LLM online - ${response.latencyMs}ms latency (${response.model})`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          status.connectivity = /rate limit/i.test(message) ? 'rate_limited' : 'error';
          status.detail = message;

          if (spinner) {
            spinner.fail(`LLM unreachable: ${message.slice(0, 120)}`);
          }
        }
      } else if (llmConfig.apiKey) {
        status.connectivity = 'configured';

        if (!opts.json) {
          warn('Provider is configured. Use --live to run an actual completion probe.');
        }
      } else {
        status.connectivity = 'no_api_key';

        if (!opts.json) {
          warn('No provider API key configured. Switch to hosted beta or set your own provider key.');
          warn('Hosted beta default: geotech config set llm.provider hosted-beta');
          warn('Deterministic calculations work without an API key.');
        }
      }

      if (opts.json) {
        renderJSON(status);
      } else {
        console.log('');
      }
    });
}

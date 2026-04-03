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

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check system status, LLM connectivity, and auth tier')
    .option('--json', 'Output raw JSON')
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
      };

      if (opts.json && !usesHostedBeta && !llmConfig.apiKey) {
        status.connectivity = 'no_api_key';
        renderJSON(status);
        return;
      }

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

      if (usesHostedBeta || llmConfig.apiKey) {
        const spinner = opts.json ? null : ora({ text: 'Testing LLM connectivity...', indent: 2 }).start();

        try {
          const response = await generateText(
            'Reply with exactly: OK',
            llmConfig,
            { maxTokens: 10, temperature: 0 },
          );

          status.connectivity = 'online';
          status.latencyMs = response.latencyMs;

          if (spinner) {
            spinner.succeed(`LLM online — ${response.latencyMs}ms latency (${response.model})`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          status.connectivity = /rate limit/i.test(message) ? 'rate_limited' : 'error';

          if (spinner) {
            spinner.fail(`LLM unreachable: ${message.slice(0, 120)}`);
          }
        }
      } else {
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

import { Command } from 'commander';
import {
  loadConfig,
  buildLLMConfig,
  generateText,
  GEOTECHCLI_VERSION,
} from '@geotechcli/core';
import { heading, keyValue, success, error, warn, renderJSON } from '../ui/terminal.js';
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

      const status = {
        version: GEOTECHCLI_VERSION,
        provider: config.llm.provider,
        model: config.llm.model || '(default)',
        tier: config.auth.tier,
        apiKeySet: Boolean(llmConfig.apiKey),
        connectivity: 'unknown' as string,
        latencyMs: 0,
      };

      if (opts.json && !llmConfig.apiKey) {
        status.connectivity = 'no_api_key';
        renderJSON(status);
        return;
      }

      if (!opts.json) {
        heading('geotechCLI Status');
        keyValue('Version', status.version);
        keyValue('LLM provider', config.llm.provider);
        keyValue('Model', status.model);
        keyValue('Tier', config.auth.tier);
        keyValue('API key', status.apiKeySet ? chalk.green('set') : chalk.yellow('not set'));
      }

      if (llmConfig.apiKey) {
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
          status.connectivity = 'error';

          if (spinner) {
            spinner.fail(`LLM unreachable: ${err instanceof Error ? err.message.slice(0, 80) : 'Unknown error'}`);
          }
        }
      } else {
        if (!opts.json) {
          warn('No API key configured. Run: geotech config set llm.api_key <your-key>');
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

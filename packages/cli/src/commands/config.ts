import { Command } from 'commander';
import { loadConfig, setConfigValue, getConfigValue, registry } from '@geotechcli/core';
import { DEFAULT_LLM_MODEL } from '@geotechcli/core/meta';
import { heading, keyValue, success, error, dim, renderJSON } from '../ui/terminal.js';
import chalk from 'chalk';

function getEffectiveModelValue(key: string, value: unknown): unknown {
  if (key !== 'llm.model' && key !== 'llm.vision_model') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  const cfg = loadConfig();
  const adapter = registry.get(cfg.llm.provider);
  return key === 'llm.vision_model'
    ? adapter.defaultVisionModel
    : adapter.defaultModel;
}

export function registerConfigCommand(program: Command): void {
  const config = new Command('config')
    .description('View and manage geotechCLI configuration');

  config
    .command('view')
    .description('Show current configuration')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const cfg = loadConfig();

      if (opts.json) {
        renderJSON(cfg);
        return;
      }

      heading('geotechCLI Configuration');

      console.log('');
      console.log(chalk.gray('  [LLM]'));
      keyValue('  Provider', cfg.llm.provider);
      keyValue(
        '  API key',
        cfg.llm.provider === 'hosted-beta'
          ? chalk.gray('not required for hosted beta')
          : cfg.llm.api_key
            ? '****' + cfg.llm.api_key.slice(-4)
            : chalk.yellow('not set'),
      );
      keyValue('  Model override', cfg.llm.model || chalk.gray('(provider default)'));
      keyValue('  Vision model', cfg.llm.vision_model || chalk.gray('(provider default)'));
      keyValue('  Base URL', cfg.llm.base_url || chalk.gray('(provider default)'));
      keyValue('  Timeout', `${cfg.llm.timeout}ms`);

      console.log('');
      console.log(chalk.gray('  [Auth]'));
      keyValue('  API key', cfg.auth.api_key ? '****' + cfg.auth.api_key.slice(-4) : chalk.yellow('not set'));
      keyValue('  Tier', cfg.auth.tier);

      console.log('');
      console.log(chalk.gray('  [CLI]'));
      keyValue('  Color', String(cfg.cli.color));
      keyValue('  Verbose', String(cfg.cli.verbose));

      console.log('');
      console.log(chalk.gray('  [Skills]'));
      keyValue('  Enabled', String(cfg.skills.enabled));
      keyValue('  Directory', cfg.skills.directory || chalk.gray('(provider default)'));
      keyValue('  Python path', cfg.skills.python_path || 'python');
      keyValue('  Trusted only', String(cfg.skills.trusted_only));

      console.log('');
      dim('Config location: ~/.geotechcli/config.json');
      dim('Set values with: geotech config set <key> <value>');
      console.log('');
    });

  config
    .command('set <key> <value>')
    .description('Set a config value (dot notation: llm.provider, llm.api_key, etc.)')
    .action((key: string, value: string) => {
      // Security: validate known sensitive keys
      const sensitiveKeys = ['llm.api_key', 'auth.api_key'];
      if (sensitiveKeys.includes(key) && value.length < 8) {
        error('API key seems too short. Double-check the value.');
        return;
      }

      try {
        setConfigValue(key, value);

        // Never echo API keys back
        const displayValue = key.includes('api_key') || key.includes('secret')
          ? '****' + value.slice(-4)
          : value;

        success(`${key} = ${displayValue}`);
      } catch (err) {
        error(`Failed to set config: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  config
    .command('get <key>')
    .description('Get a single config value')
    .action((key: string) => {
      const rawValue = getConfigValue(key);

      if (rawValue === undefined) {
        error(`Key "${key}" not found in config.`);
        return;
      }

      const value = getEffectiveModelValue(key, rawValue);

      // Redact sensitive values
      if (key.includes('api_key') || key.includes('secret')) {
        const str = String(value);
        console.log(str ? '****' + str.slice(-4) : '(not set)');
      } else {
        console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
      }
    });

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      setConfigValue('llm.provider', 'hosted-beta');
      setConfigValue('llm.api_key', '');
      setConfigValue('llm.model', '');
      setConfigValue('llm.vision_model', '');
      setConfigValue('llm.base_url', '');
      setConfigValue('skills.enabled', 'false');
      setConfigValue('skills.directory', '');
      setConfigValue('skills.python_path', 'python');
      setConfigValue('skills.trusted_only', 'true');
      success(`Configuration reset to defaults (hosted beta ${DEFAULT_LLM_MODEL}).`);
    });

  program.addCommand(config);
}

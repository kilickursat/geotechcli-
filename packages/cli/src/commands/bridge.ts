import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import ora from 'ora';
import {
  detectSoftware,
  generatePLAXISScript,
  generateFLACScript,
  generateRocscienceScript,
  type SoftwareType,
} from '@geotechcli/core';
import { heading, keyValue, success, error, warn, renderJSON } from '../ui/terminal.js';
import chalk from 'chalk';

export function registerBridgeCommand(program: Command): void {
  const bridge = new Command('bridge')
    .description('Connect to local geotechnical software (PLAXIS, FLAC, Rocscience)');

  bridge
    .command('detect')
    .description('Detect running instances of PLAXIS, FLAC, or Rocscience')
    .option('--software <type>', 'Specific software: plaxis|flac|rocscience')
    .option('--host <addr>', 'Host address', 'localhost')
    .option('--json', 'Output JSON')
    .action(async (opts) => {
      const targets: SoftwareType[] = opts.software
        ? [opts.software]
        : ['plaxis', 'flac', 'rocscience'];

      const results = [];

      for (const sw of targets) {
        const spinner = opts.json
          ? null
          : ora({ text: `Checking ${sw.toUpperCase()}...`, indent: 2 }).start();

        const status = await detectSoftware(sw, opts.host);
        results.push(status);

        if (spinner) {
          if (status.detected) {
            spinner.succeed(`${sw.toUpperCase()} detected at ${status.host}:${status.port}`);
          } else {
            spinner.fail(`${sw.toUpperCase()} not found (${status.error})`);
          }
        }
      }

      if (opts.json) {
        renderJSON(results);
      } else {
        console.log('');
        warn('To connect, ensure the software scripting server is running.');
        console.log('');
      }
    });

  bridge
    .command('generate')
    .description('Generate automation script for target software')
    .requiredOption('--software <type>', 'Target: plaxis|flac|rocscience')
    .option('--output <file>', 'Output script filename')
    .option('--model-type <type>', 'PLAXIS model: 2d|3d', '2d')
    .option('--analysis <type>', 'Rocscience analysis: slope|tunnel|foundation', 'slope')
    .action((opts) => {
      let script;

      switch (opts.software) {
        case 'plaxis':
          script = generatePLAXISScript({ modelType: opts.modelType });
          break;
        case 'flac':
          script = generateFLACScript({});
          break;
        case 'rocscience':
          script = generateRocscienceScript({ analysisType: opts.analysis });
          break;
        default:
          error(`Unknown software: ${opts.software}. Use plaxis, flac, or rocscience.`);
          return;
      }

      const ext = script.language === 'python' ? 'py' : script.language === 'fish' ? 'fis' : 'txt';
      const filename = opts.output ?? `geotechcli_${opts.software}.${ext}`;

      writeFileSync(filename, script.script);

      heading(`Generated ${opts.software.toUpperCase()} Script`);
      keyValue('Software', opts.software.toUpperCase());
      keyValue('Language', script.language);
      keyValue('Description', script.description);
      success(`Script saved to ${filename}`);

      console.log('');
      console.log(chalk.gray('  Preview (first 10 lines):'));
      const lines = script.script.split('\n').slice(0, 10);
      for (const line of lines) {
        console.log(chalk.gray(`    ${line}`));
      }
      console.log(chalk.gray('    ...'));
      console.log('');
    });

  program.addCommand(bridge);
}

import { Command } from 'commander';
import chalk from 'chalk';
import {
  calculateDupuitSeepage,
  calculateFlowNetSeepage,
  type SeepageResult,
} from '@geotechcli/core';
import {
  banner,
  keyValue,
  renderJSON,
  renderTable,
  success,
  warn,
  renderSteps,
  heading,
} from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

function riskColor(risk: string): string {
  if (risk === 'SEVERE') return chalk.red.bold(risk);
  if (risk === 'HIGH') return chalk.red(risk);
  if (risk === 'MODERATE') return chalk.yellow(risk);
  return chalk.green(risk);
}

export function registerSeepageCommand(program: Command): void {
  const cmd = new Command('seepage')
    .description('Seepage flow analysis with piping and heave safety checks')
    .option('--method <m>', 'Analysis method: dupuit | flownet (default: dupuit)', 'dupuit')
    // Common options
    .requiredOption('--conductivity <m/s>', 'Hydraulic conductivity k in m/s')
    .option('--h1 <m>', 'Upstream head h₁ in meters (dupuit method)')
    .option('--h2 <m>', 'Downstream head h₂ in meters (dupuit method)', '0')
    .option('--length <m>', 'Seepage path length L in meters (dupuit method)')
    // Flow net options
    .option('--head <m>', 'Total head loss H in meters (flownet method)')
    .option('--nf <n>', 'Number of flow channels Nf (flownet method)')
    .option('--nd <n>', 'Number of equipotential drops Nd (flownet method)')
    .option('--critical-path <m>', 'Critical flow path length for exit gradient (flownet, default 1.0)')
    // Soil properties
    .option('--gs <Gs>', 'Specific gravity of solids Gs (default: 2.65)', '2.65')
    .option('--void-ratio <e>', 'Void ratio e₀ (default: 0.7)', '0.7')
    .addHelpText('after', `
  Methods:
    dupuit     Dupuit-Forchheimer unconfined seepage between two boundaries
    flownet    Flow net approximation: Q = k × H × (Nf/Nd)

  Examples:
    geotech seepage --conductivity 1e-4 --h1 10 --h2 2 --length 20 --verbose
    geotech seepage --method flownet --conductivity 5e-5 --head 8 --nf 4 --nd 6
    geotech seepage --conductivity 1e-4 --h1 8 --h2 0 --length 15 --gs 2.7 --void-ratio 0.65 --json
`)
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);
      const method = opts.method as 'dupuit' | 'flownet';
      const k = parseFloat(opts.conductivity);
      const Gs = parseFloat(opts.gs);
      const e = parseFloat(opts.voidRatio);

      try {
        let result: SeepageResult;

        if (method === 'flownet') {
          if (!opts.head || !opts.nf || !opts.nd) {
            console.error(chalk.red('  ✗ Flownet method requires --head, --nf, and --nd'));
            process.exit(1);
          }
          result = calculateFlowNetSeepage({
            hydraulicConductivity: k,
            totalHead: parseFloat(opts.head),
            flowChannels: parseInt(opts.nf, 10),
            equipotentialDrops: parseInt(opts.nd, 10),
            specificGravity: Gs,
            voidRatio: e,
            criticalFlowPath: opts.criticalPath ? parseFloat(opts.criticalPath) : undefined,
          });
        } else {
          // Dupuit default
          if (!opts.h1 || !opts.length) {
            console.error(chalk.red('  ✗ Dupuit method requires --h1 and --length'));
            process.exit(1);
          }
          result = calculateDupuitSeepage({
            hydraulicConductivity: k,
            upstreamHead: parseFloat(opts.h1),
            downstreamHead: parseFloat(opts.h2),
            seepageLength: parseFloat(opts.length),
            specificGravity: Gs,
            voidRatio: e,
          });
        }

        if (flags.json) {
          renderJSON(result);
          return;
        }

        if (!flags.quiet) banner();
        heading(`Seepage Analysis — ${method === 'flownet' ? 'Flow Net Method' : 'Dupuit-Forchheimer'}`);

        keyValue('Seepage flow Q', `${result.seepageFlow.toExponential(3)} m³/s per m width`);
        keyValue('Exit gradient', result.exitGradient.toFixed(4));
        keyValue('Critical gradient', result.criticalGradient.toFixed(4));
        keyValue('Piping FS', result.pipingFOS >= 999 ? '∞' : result.pipingFOS.toFixed(2));
        console.log('');
        console.log(chalk.gray('  Heave/Piping Risk:  ') + riskColor(result.heaveRisk));
        console.log(chalk.gray(`  ${result.heaveRiskDescription}`));

        renderSteps(result.steps, flags.verbose);

        // Risk summary table
        if (!flags.quiet) {
          console.log('');
          renderTable(
            ['Parameter', 'Value', 'Limit', 'Status'],
            [
              ['i_exit', result.exitGradient.toFixed(4), `< ${result.criticalGradient.toFixed(3)}`, result.exitGradient < result.criticalGradient ? '✓ OK' : '✗ EXCEEDS'],
              ['FS (piping)', result.pipingFOS >= 999 ? '∞' : result.pipingFOS.toFixed(2), '≥ 3.0 (typical)', result.pipingFOS >= 3 ? '✓ OK' : result.pipingFOS >= 1.5 ? '⚠ MARGINAL' : '✗ FAIL'],
            ],
          );
        }

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }

        if (!flags.quiet) {
          console.log('');
          warn('Piping FS ≥ 3.0 is typically required for dams and embankments. For retaining walls, FS ≥ 2.0 is often acceptable.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (flags.json) {
          console.log(JSON.stringify({ error: msg }, null, 2));
        } else {
          console.error(chalk.red(`\n  ✗ ${msg}\n`));
        }
        process.exit(1);
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

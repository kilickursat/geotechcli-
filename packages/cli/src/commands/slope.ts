import { Command } from 'commander';
import chalk from 'chalk';
import { calculateSlopeStability } from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderSteps, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { readFileSync, writeFileSync } from 'node:fs';

export function registerSlopeCommand(program: Command): void {
  const cmd = new Command('slope')
    .description('Slope stability — Bishop Simplified method')
    .requiredOption('--height <m>', 'Slope height (m)', parseFloat)
    .requiredOption('--angle <deg>', 'Slope angle from horizontal (degrees)', parseFloat)
    .option('--cohesion <kPa>', 'Soil cohesion c\' (kPa)', parseFloat, 10)
    .option('--phi <deg>', 'Friction angle φ\' (degrees)', parseFloat, 25)
    .option('--gamma <kN/m3>', 'Unit weight (kN/m³)', parseFloat, 18)
    .option('--gwt <m>', 'Water table depth from crest (m)', parseFloat, 999)
    .option('--kh <n>', 'Horizontal seismic coefficient', parseFloat, 0)
    .option('--surcharge <kPa>', 'Surcharge at crest (kPa)', parseFloat, 0)
    .option('--slices <n>', 'Number of slices', parseInt, 10)
    .option('--layers <file>', 'JSON file with soil layers')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      let soilLayers: any[];
      if (opts.layers) {
        soilLayers = JSON.parse(readFileSync(opts.layers, 'utf-8'));
      } else {
        soilLayers = [{
          thickness: opts.height * 2,
          unitWeight: opts.gamma,
          cohesion: opts.cohesion,
          frictionAngle: opts.phi,
        }];
      }

      try {
        if (flags.dryRun) {
          console.log(`  [dry-run] Would calculate slope stability (Bishop Simplified):`);
          console.log(`    H=${opts.height}m, angle=${opts.angle}°, ${soilLayers.length} layer(s), kh=${opts.kh}`);
          return;
        }

        const result = calculateSlopeStability({
          slopeHeight: opts.height,
          slopeAngle: opts.angle,
          soilLayers,
          waterTableDepth: opts.gwt,
          surcharge: opts.surcharge,
          seismicCoefficient: opts.kh,
          numberOfSlices: opts.slices,
        });

        if (flags.json) { renderJSON(result); return; }

        if (flags.quiet) {
          console.log(`${result.factorOfSafety}`);
          return;
        }

        heading('Slope Stability Analysis (Bishop Simplified)');
        keyValue('Slope', `H=${opts.height}m, angle=${opts.angle}°`);
        keyValue('Factor of Safety', `${result.factorOfSafety}`);

        const color = result.stabilityClass === 'STABLE' ? chalk.green
          : result.stabilityClass === 'MARGINAL' ? chalk.yellow
          : chalk.red;
        keyValue('Classification', color(result.stabilityClass));
        keyValue('Critical circle', `R=${result.criticalCircle.radius}m at (${result.criticalCircle.centerX}, ${result.criticalCircle.centerY})`);

        renderSteps(result.steps, flags.verbose);
        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
        console.log('');
      } catch (err) {
        console.log(chalk.red(`  ✗ ${err instanceof Error ? err.message : String(err)}`));
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

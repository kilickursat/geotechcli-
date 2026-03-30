import { Command } from 'commander';
import chalk from 'chalk';
import { calculateLateralEarthPressure } from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderTable, renderSteps, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

export function registerRetainingCommand(program: Command): void {
  const cmd = new Command('retaining')
    .description('Lateral earth pressure — Rankine / Coulomb methods')
    .requiredOption('--height <m>', 'Wall height (m)', parseFloat)
    .requiredOption('--phi <deg>', 'Soil friction angle (degrees)', parseFloat)
    .option('--cohesion <kPa>', 'Soil cohesion (kPa)', parseFloat, 0)
    .option('--gamma <kN/m3>', 'Soil unit weight (kN/m³)', parseFloat, 18)
    .option('--method <m>', 'Method: rankine, coulomb', 'rankine')
    .option('--state <s>', 'Pressure state: active, passive, at_rest', 'active')
    .option('--delta <deg>', 'Wall friction angle δ (degrees) — Coulomb', parseFloat, 0)
    .option('--beta <deg>', 'Backfill slope angle (degrees)', parseFloat, 0)
    .option('--gwt <m>', 'Water table depth (m)', parseFloat, 999)
    .option('--surcharge <kPa>', 'Surcharge on backfill (kPa)', parseFloat, 0)
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      try {
        if (flags.dryRun) {
          console.log(`  [dry-run] Would calculate ${opts.method} ${opts.state} earth pressure:`);
          console.log(`    H=${opts.height}m, φ=${opts.phi}°, c=${opts.cohesion}kPa, δ=${opts.delta}°`);
          return;
        }

        const result = calculateLateralEarthPressure({
          wallHeight: opts.height,
          soilLayers: [{ thickness: opts.height * 2, unitWeight: opts.gamma, cohesion: opts.cohesion, frictionAngle: opts.phi }],
          method: opts.method,
          pressureState: opts.state,
          wallFrictionAngle: opts.delta,
          backfillAngle: opts.beta,
          waterTableDepth: opts.gwt,
          surcharge: opts.surcharge,
        });

        if (flags.json) { renderJSON(result); return; }

        if (flags.quiet) {
          console.log(`${result.coefficient}`);
          return;
        }

        heading(`Lateral Earth Pressure (${result.method} — ${result.pressureState})`);
        keyValue('Coefficient K', `${result.coefficient}`);
        keyValue('Total force', `${result.totalForce} kN/m`);
        keyValue('Point of application', `${result.pointOfApplication} m from base`);
        keyValue('Overturning moment', `${result.overturningMoment} kN·m/m`);

        if (flags.verbose) {
          renderTable(
            ['Depth (m)', 'σ_h (kPa)', 'u (kPa)', 'Total (kPa)'],
            result.pressureDistribution
              .filter((_, i) => i % 2 === 0)
              .map((p) => [p.depth, p.pressure, p.waterPressure, p.totalPressure]),
          );
        }

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

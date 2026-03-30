import { Command } from 'commander';
import { calculateBearingCapacity } from '@geotechcli/core';
import { heading, keyValue, renderSteps, renderJSON, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

export function registerBearingCommand(program: Command): void {
  const cmd = new Command('bearing')
    .description('Calculate bearing capacity (Terzaghi, Meyerhof, Hansen, Vesic)')
    .requiredOption('--depth <m>', 'Embedment depth Df (m)', parseFloat)
    .requiredOption('--phi <deg>', 'Friction angle φ (degrees)', parseFloat)
    .option('--cohesion <kPa>', 'Cohesion c (kPa)', parseFloat, 0)
    .option('--width <m>', 'Foundation width B (m)', parseFloat, 2.0)
    .option('--length <m>', 'Foundation length L (m)', parseFloat)
    .option('--unit-weight <kN/m3>', 'Soil unit weight γ (kN/m³)', parseFloat, 18)
    .option('--method <name>', 'Method: terzaghi|meyerhof|hansen|vesic', 'meyerhof')
    .option('--fs <number>', 'Factor of safety', parseFloat, 3.0)
    .option('--shape <type>', 'Shape: strip|square|circular|rectangular', 'strip')
    .action((opts) => {
      const flags = getGlobalFlags(opts);

      // --dry-run: show what would be calculated without executing
      if (flags.dryRun) {
        console.log(`  [dry-run] Would calculate ${opts.method} bearing capacity:`);
        console.log(`    B=${opts.width}m, D=${opts.depth}m, φ=${opts.phi}°, c=${opts.cohesion}kPa, γ=${opts.unitWeight}kN/m³`);
        console.log(`    Shape: ${opts.shape}, FS=${opts.fs}`);
        return;
      }

      const result = calculateBearingCapacity({
        width: opts.width,
        length: opts.length,
        depth: opts.depth,
        unitWeight: opts.unitWeight,
        cohesion: opts.cohesion,
        frictionAngle: opts.phi,
        method: opts.method,
        factorOfSafety: opts.fs,
        shape: opts.shape,
      });

      if (flags.json) {
        renderJSON(result);
        return;
      }

      // --quiet: single-line output for scripting
      if (flags.quiet) {
        console.log(`${result.qAllowable}`);
        return;
      }

      heading(`Bearing Capacity — ${result.method.charAt(0).toUpperCase() + result.method.slice(1)}`);

      keyValue('Ultimate bearing capacity', `${result.qUltimate} kPa`);
      keyValue('Allowable bearing capacity', `${result.qAllowable} kPa`);
      keyValue('Factor of safety', `${result.factorOfSafety}`);
      keyValue('Nc', `${result.bearingCapacityFactors.Nc}`);
      keyValue('Nq', `${result.bearingCapacityFactors.Nq}`);
      keyValue('Nγ', `${result.bearingCapacityFactors.Ngamma}`);

      renderSteps(result.steps, flags.verbose);

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(result, null, 2));
        success(`Results saved to ${flags.output}`);
      }

      console.log('');
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

import { Command } from 'commander';
import chalk from 'chalk';
import { calculatePileCapacity } from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderTable, renderSteps, renderXYPlot, success } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { readFileSync, writeFileSync } from 'node:fs';

export function registerPileCommand(program: Command): void {
  const cmd = new Command('pile')
    .description('Pile capacity analysis — α-method, β-method, SPT-based (Meyerhof 1976)')
    .requiredOption('--diameter <m>', 'Pile diameter (m)', parseFloat)
    .requiredOption('--length <m>', 'Embedded pile length (m)', parseFloat)
    .option('--type <type>', 'Pile type: driven, bored, cfa', 'driven')
    .option('--shape <shape>', 'Pile shape: circular, square, h-section', 'circular')
    .option('--method <method>', 'Method: alpha, beta, spt-meyerhof, auto', 'auto')
    .option('--fs <n>', 'Factor of safety', parseFloat, 2.5)
    .option('--gwt <m>', 'Water table depth (m)', parseFloat, 999)
    .option('--layers <file>', 'JSON file with soil layers')
    .option('--su <kPa>', 'Undrained shear strength for single-layer analysis', parseFloat)
    .option('--phi <deg>', 'Friction angle for single-layer analysis', parseFloat)
    .option('--gamma <kN/m3>', 'Unit weight', parseFloat, 18)
    .option('--spt <N>', 'SPT N-value for single-layer analysis', parseFloat)
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      let layers: any[];
      if (opts.layers) {
        layers = JSON.parse(readFileSync(opts.layers, 'utf-8'));
      } else {
        const soilType = opts.su ? 'clay' : opts.phi ? 'sand' : opts.spt ? 'sand' : 'clay';
        layers = [{
          thickness: opts.length,
          soilType,
          undrained_shear_strength: opts.su,
          friction_angle: opts.phi,
          unit_weight: opts.gamma,
          spt_n: opts.spt,
        }];
      }

      try {
        // --dry-run
        if (flags.dryRun) {
          console.log(`  [dry-run] Would calculate pile capacity (${opts.method}):`);
          console.log(`    D=${opts.diameter}m, L=${opts.length}m, type=${opts.type}, ${layers.length} layer(s)`);
          return;
        }

        const result = calculatePileCapacity({
          pileDiameter: opts.diameter,
          pileLength: opts.length,
          pileType: opts.type,
          pileShape: opts.shape,
          layers,
          waterTableDepth: opts.gwt,
          factorOfSafety: opts.fs,
          method: opts.method,
        });

        if (flags.json) { renderJSON(result); return; }

        if (flags.quiet) {
          console.log(`${result.allowableCapacity}`);
          return;
        }

        heading('Pile Capacity Analysis');
        keyValue('Method', result.method);
        keyValue('Pile', `${result.pileType} ${opts.shape}, D=${result.pileDiameter}m, L=${result.pileLength}m`);
        keyValue('Shaft resistance Qs', `${result.shaftResistance} kN`);
        keyValue('Base resistance Qb', `${result.baseResistance} kN`);
        keyValue('Ultimate capacity Qu', `${result.ultimateCapacity} kN`);
        keyValue('Allowable capacity Qa', `${result.allowableCapacity} kN (FS=${result.factorOfSafety})`);

        if (result.shaftFrictionPerLayer.length > 1) {
          renderTable(
            ['Depth (m)', 'Thick (m)', 'Soil', 'fs (kPa)', 'Qs (kN)'],
            result.shaftFrictionPerLayer.map((l) => [l.depth.toFixed(1), l.thickness.toFixed(1), l.soilType, l.unitShaftFriction, l.shaftResistance]),
          );
        }

        if (flags.plot && result.shaftFrictionPerLayer.length > 0) {
          let cumulative = 0;
          const orderedLayers = [...result.shaftFrictionPerLayer].sort((left, right) => left.depth - right.depth);
          renderXYPlot([
            {
              label: 'Unit shaft friction',
              points: orderedLayers.map((layer) => ({ x: layer.depth, y: layer.unitShaftFriction })),
              style: 'line',
              symbol: '*',
            },
            {
              label: 'Shaft resistance',
              points: orderedLayers.map((layer) => ({ x: layer.depth, y: layer.shaftResistance })),
              style: 'line',
              symbol: 'o',
            },
            {
              label: 'Cumulative shaft resistance',
              points: orderedLayers.map((layer) => {
                cumulative += layer.shaftResistance;
                return { x: layer.depth, y: cumulative };
              }),
              style: 'line',
              symbol: '+',
            },
          ], {
            height: 14,
            title: 'Pile shaft resistance profile',
            xLabel: 'Depth (m)',
            yLabel: 'Value',
          });
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

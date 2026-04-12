import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  calculateConsolidation,
  calculateSchmertmann,
  calculatePeckSettlement,
  type ConsolidationInput,
  type SchmertmannInput,
  type PeckSettlementInput,
} from '@geotechcli/core';
import {
  banner,
  keyValue,
  renderJSON,
  renderTable,
  renderChart,
  success,
  warn,
  renderSteps,
  heading,
} from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { writeFileSync } from 'node:fs';

function handleError(err: unknown, flags: { json: boolean; verbose: boolean }) {
  const msg = err instanceof Error ? err.message : String(err);
  if (flags.json) {
    console.log(JSON.stringify({ error: msg }, null, 2));
  } else {
    console.error(chalk.red(`\n  ✗ ${msg}\n`));
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// geotech settlement consolidation — Terzaghi 1D consolidation
// ---------------------------------------------------------------------------

function registerConsolidation(parent: Command): void {
  const cmd = new Command('consolidation')
    .description('Terzaghi 1D consolidation settlement (primary + time curve)')
    .requiredOption('--cc <number>', 'Compression index Cc')
    .requiredOption('--e0 <number>', 'Initial void ratio e₀')
    .requiredOption('--thickness <m>', 'Clay layer thickness H in meters')
    .requiredOption('--delta-sigma <kPa>', 'Stress increase Δσ in kPa')
    .requiredOption('--sigma0 <kPa>', 'Initial effective stress σ₀ in kPa')
    .option('--cr <number>', 'Recompression index Cr (default: Cc/5)')
    .option('--sigmap <kPa>', 'Preconsolidation pressure σ_p in kPa')
    .option('--drainage <type>', 'Drainage: single | double (default: double)', 'double')
    .option('--cv <m2/yr>', 'Coefficient of consolidation Cv (m²/year) — enables time curve')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      const input: ConsolidationInput = {
        compressionIndex: parseFloat(opts.cc),
        voidRatio: parseFloat(opts.e0),
        layerThickness: parseFloat(opts.thickness),
        stressIncrease: parseFloat(opts.deltaSigma),
        initialEffectiveStress: parseFloat(opts.sigma0),
        recompressionIndex: opts.cr ? parseFloat(opts.cr) : undefined,
        preconsolidationPressure: opts.sigmap ? parseFloat(opts.sigmap) : undefined,
        drainagePath: (opts.drainage === 'single' ? 'single' : 'double') as 'single' | 'double',
        coefficientOfConsolidation: opts.cv ? parseFloat(opts.cv) : undefined,
      };

      try {
        const result = calculateConsolidation(input);

        if (flags.json) {
          renderJSON(result);
          return;
        }

        if (!flags.quiet) banner();
        heading('Terzaghi 1D Consolidation Settlement');

        keyValue('Primary settlement', `${result.primarySettlement} mm`);
        keyValue('Soil condition', result.isOverconsolidated ? 'Overconsolidated (OC)' : 'Normally consolidated (NC)');

        renderSteps(result.steps, flags.verbose);

        if (result.timeSettlement && result.timeSettlement.length > 0) {
          console.log('');
          renderTable(
            ['Tv', 'U (%)', 'Time (yr)', 'Settlement (mm)'],
            result.timeSettlement.map(r => [
              r.timeFactor.toFixed(3),
              (r.consolidation * 100).toFixed(0),
              r.timeYears.toFixed(2),
              r.settlement.toFixed(1),
            ]),
          );

          if (flags.plot) {
            renderChart(
              result.timeSettlement.map(r => r.settlement),
              { label: 'Settlement over time (mm)', height: 10 },
            );
          }
        }

        if (flags.output) {
          const data = JSON.stringify(result, null, 2);
          writeFileSync(flags.output, data);
          success(`Results saved to ${flags.output}`);
        }
      } catch (err) {
        handleError(err, flags);
      }
    });

  addGlobalFlags(cmd);
  parent.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// geotech settlement immediate — Schmertmann elastic/creep settlement
// ---------------------------------------------------------------------------

function registerImmediate(parent: Command): void {
  const cmd = new Command('immediate')
    .description('Schmertmann immediate + creep settlement for shallow foundations')
    .requiredOption('--stress <kPa>', 'Net applied stress q in kPa')
    .requiredOption('--width <m>', 'Foundation width B in meters')
    .requiredOption('--layers <json>', 'Soil layers as JSON: \'[{"thickness":1,"Es":5000},...]\' ')
    .option('--depth <m>', 'Embedment depth D (default: 0)', '0')
    .option('--unit-weight <kN/m3>', 'Unit weight γ in kN/m³ (default: 18)', '18')
    .option('--time <years>', 'Time for creep factor (default: 1)', '1')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      let layers: Array<{ thickness: number; elasticModulus: number }>;
      try {
        const raw = JSON.parse(opts.layers) as Array<{ thickness?: number; Es?: number; elasticModulus?: number }>;
        layers = raw.map(l => ({
          thickness: l.thickness ?? 1,
          elasticModulus: l.elasticModulus ?? l.Es ?? 5000,
        }));
      } catch {
        console.error(chalk.red("  ✗ Invalid --layers JSON. Example: '[{\"thickness\":1,\"Es\":5000}]'"));
        process.exit(1);
      }

      const input: SchmertmannInput = {
        appliedStress: parseFloat(opts.stress),
        foundationWidth: parseFloat(opts.width),
        layers,
        embedmentDepth: parseFloat(opts.depth),
        unitWeight: parseFloat(opts.unitWeight),
        timeFactor: parseFloat(opts.time),
      };

      try {
        const result = calculateSchmertmann(input);

        if (flags.json) {
          renderJSON(result);
          return;
        }

        if (!flags.quiet) banner();
        heading('Schmertmann Immediate + Creep Settlement');

        keyValue('Immediate settlement', `${result.immediateSettlement} mm`);
        keyValue('Creep settlement', `${result.creepSettlement} mm`);
        keyValue('Total settlement', `${result.totalSettlement} mm`);

        renderSteps(result.steps, flags.verbose);

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
      } catch (err) {
        handleError(err, flags);
      }
    });

  addGlobalFlags(cmd);
  parent.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// geotech settlement tunnel — Peck surface settlement trough
// ---------------------------------------------------------------------------

function registerTunnelSettlement(parent: Command): void {
  const cmd = new Command('tunnel')
    .description('Peck Gaussian settlement trough above tunnel excavation')
    .requiredOption('--diameter <m>', 'Tunnel diameter D in meters')
    .requiredOption('--depth <m>', 'Depth to tunnel axis Z₀ in meters')
    .option('--volume-loss <%>', 'Volume loss Vl in % (default: 1.0)', '1.0')
    .option('--trough-k <K>', 'Trough width parameter K (default: 0.5)', '0.5')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      const input: PeckSettlementInput = {
        tunnelDiameter: parseFloat(opts.diameter),
        tunnelDepth: parseFloat(opts.depth),
        volumeLoss: parseFloat(opts.volumeLoss),
        troughWidthParam: parseFloat(opts.troughK),
      };

      try {
        const result = calculatePeckSettlement(input);

        if (flags.json) {
          renderJSON(result);
          return;
        }

        if (!flags.quiet) banner();
        heading('Peck Tunnel Surface Settlement Trough');

        keyValue('Maximum settlement', `${result.maxSettlement} mm`);
        keyValue('Inflection point (i)', `${result.inflectionPoint} m`);
        keyValue('Trough width (2.5i)', `${result.troughWidth} m`);

        renderSteps(result.steps, flags.verbose);

        if (flags.plot && result.profile.length > 0) {
          const vals = result.profile.map(p => p.settlement);
          renderChart(vals, { label: `Settlement trough (max = ${result.maxSettlement} mm)`, height: 10 });
        }

        if (!flags.quiet) {
          console.log('');
          warn('Peck trough assumes symmetrical ground conditions. Actual settlements depend on construction method, soil type, and monitoring data.');
        }

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
      } catch (err) {
        handleError(err, flags);
      }
    });

  addGlobalFlags(cmd);
  parent.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Root: geotech settlement
// ---------------------------------------------------------------------------

export function registerSettlementCommands(program: Command): void {
  const cmd = new Command('settlement')
    .description('Settlement analysis: consolidation, immediate (Schmertmann), and tunnel trough (Peck)')
    .addHelpText('after', `
  Subcommands:
    consolidation    Terzaghi 1D primary consolidation + time curve
    immediate        Schmertmann elastic + creep settlement
    tunnel           Peck Gaussian surface settlement trough

  Examples:
    geotech settlement consolidation --cc 0.35 --e0 1.2 --thickness 5 --delta-sigma 80 --sigma0 100 --verbose
    geotech settlement immediate --stress 150 --width 2.5 --layers '[{"thickness":2,"Es":8000}]'
    geotech settlement tunnel --diameter 6 --depth 15 --volume-loss 1.5 --plot
`);

  registerConsolidation(cmd);
  registerImmediate(cmd);
  registerTunnelSettlement(cmd);

  program.addCommand(cmd);
}

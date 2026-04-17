import { Command } from 'commander';
import { calculateLiquefaction } from '@geotechcli/core';
import {
  heading,
  keyValue,
  renderTable,
  renderSteps,
  renderJSON,
  renderXYPlot,
  warn,
  success,
  error,
} from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import { renderInteractiveVisualization, shouldUseBrowserPlots } from '../ui/plot-viewer.js';
import { readFileSync, writeFileSync } from 'node:fs';
import type { VisualizationSource } from '../util/viz.js';

function buildLiquefactionPlotSource(
  result: ReturnType<typeof calculateLiquefaction>,
  source: 'user' | 'demo',
): VisualizationSource {
  const depthRows = [...result.layers].sort((left, right) => left.depth - right.depth);
  const maxDepth = Math.max(...depthRows.map((layer) => layer.depth));
  const maxResistance = Math.max(
    ...depthRows.map((layer) => Math.max(layer.CSR, layer.CRR, layer.factorOfSafety, layer.N160cs)),
  );

  return {
    sourceType: 'preset',
    sourceName: source === 'demo' ? 'liquefaction-demo' : 'liquefaction-profile',
    charts: [
      {
        id: 'liquefaction-safety-vs-depth',
        title: 'Liquefaction factor of safety vs depth',
        xLabel: 'Factor of safety',
        yLabel: 'Depth (m)',
        kind: 'xy',
        invertY: true,
        xDomain: [0, Math.max(2, Math.ceil(maxResistance + 0.25))],
        yDomain: [0, Math.max(maxDepth + 1, 1)],
        xySeries: [
          {
            label: 'Factor of safety',
            points: depthRows.map((layer) => ({ x: layer.factorOfSafety, y: layer.depth })),
            style: 'line',
            symbol: '*',
          },
        ],
        note: `FS below 1.0 indicates likely triggering. Estimated settlement = ${result.estimatedSettlement} mm.`,
      },
      {
        id: 'liquefaction-cyclic-ratios-vs-depth',
        title: 'CSR and CRR vs depth',
        xLabel: 'Cyclic stress / resistance ratio',
        yLabel: 'Depth (m)',
        kind: 'xy',
        invertY: true,
        xDomain: [0, Math.max(0.5, Math.ceil(maxResistance * 10) / 10)],
        yDomain: [0, Math.max(maxDepth + 1, 1)],
        xySeries: [
          {
            label: 'CSR',
            points: depthRows.map((layer) => ({ x: layer.CSR, y: layer.depth })),
            style: 'line',
            symbol: 'o',
          },
          {
            label: 'CRR',
            points: depthRows.map((layer) => ({ x: layer.CRR, y: layer.depth })),
            style: 'line',
            symbol: '+',
          },
        ],
        note: 'Compare cyclic demand (CSR) against cyclic resistance (CRR) at each depth.',
      },
      {
        id: 'liquefaction-corrected-spt-vs-depth',
        title: 'Corrected SPT resistance vs depth',
        xLabel: 'Corrected blow count',
        yLabel: 'Depth (m)',
        kind: 'xy',
        invertY: true,
        xDomain: [0, Math.max(10, Math.ceil(maxResistance + 5))],
        yDomain: [0, Math.max(maxDepth + 1, 1)],
        xySeries: [
          {
            label: 'N160',
            points: depthRows.map((layer) => ({ x: layer.N160, y: layer.depth })),
            style: 'line',
            symbol: '*',
          },
          {
            label: '(N1)60cs',
            points: depthRows.map((layer) => ({ x: layer.N160cs, y: layer.depth })),
            style: 'line',
            symbol: 'o',
          },
        ],
        note: 'Corrected penetration resistance profile used in the triggering calculation.',
      },
    ],
  };
}

export function registerLiquefactionCommand(program: Command): void {
  const cmd = new Command('liquefaction')
    .description('Seismic liquefaction triggering analysis')
    .requiredOption('--pga <g>', 'Peak ground acceleration amax (g)', parseFloat)
    .requiredOption('--magnitude <Mw>', 'Earthquake moment magnitude', parseFloat)
    .option('--method <n>', 'Method: boulanger-idriss-2014|nceer', 'boulanger-idriss-2014')
    .option('--spt-profile <file>', 'CSV file with columns: depth,sptN,finesContent,unitWeight,waterTableDepth')
    .option('--depth <m>', 'Single layer depth (m)', parseFloat)
    .option('--spt <N>', 'Single layer SPT N-value', parseFloat)
    .option('--fines <percent>', 'Single layer fines content (%)', parseFloat, 5)
    .option('--demo', 'Use the built-in demo SPT profile')
    .action((opts) => {
      const flags = getGlobalFlags(opts);
      let source: 'user' | 'demo' = 'user';

      let layers: Array<{
        depth: number;
        sptN: number;
        finesContent: number;
        unitWeight: number;
        waterTableDepth: number;
      }>;

      if (opts.sptProfile) {
        const csv = readFileSync(opts.sptProfile, 'utf-8');
        const lines = csv.trim().split('\n');
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('depth');

        layers = (hasHeader ? lines.slice(1) : lines).map((line) => {
          const cols = line.split(',').map((c) => parseFloat(c.trim()));
          return {
            depth: cols[0],
            sptN: cols[1],
            finesContent: cols[2] ?? 5,
            unitWeight: cols[3] ?? 18,
            waterTableDepth: cols[4] ?? 1,
          };
        }).filter((layer) => !isNaN(layer.depth) && !isNaN(layer.sptN));
      } else if (opts.depth && opts.spt !== undefined) {
        layers = [{
          depth: opts.depth,
          sptN: opts.spt,
          finesContent: opts.fines,
          unitWeight: 18,
          waterTableDepth: 1,
        }];
      } else if (opts.demo) {
        source = 'demo';
        layers = [
          { depth: 2.0, sptN: 8, finesContent: 15, unitWeight: 17, waterTableDepth: 1.5 },
          { depth: 4.5, sptN: 12, finesContent: 10, unitWeight: 18, waterTableDepth: 1.5 },
          { depth: 7.0, sptN: 6, finesContent: 25, unitWeight: 17.5, waterTableDepth: 1.5 },
          { depth: 10.0, sptN: 22, finesContent: 5, unitWeight: 19, waterTableDepth: 1.5 },
        ];
        if (!flags.json) {
          warn('Using demo data because --demo was provided. Use --spt-profile <file> for real analysis.');
        }
      } else {
        error('No SPT profile provided. Use --spt-profile <file>, provide --depth/--spt, or pass --demo.');
        process.exitCode = 1;
        return;
      }

      if (flags.dryRun) {
        console.log(`  [dry-run] Would calculate liquefaction (${opts.method}):`);
        console.log(`    Mw=${opts.magnitude}, PGA=${opts.pga}g, ${layers.length} layer(s)`);
        return;
      }

      const result = calculateLiquefaction({
        layers,
        earthquakeMagnitude: opts.magnitude,
        pga: opts.pga,
        method: opts.method,
      });
      const outputResult = source === 'demo' ? { ...result, source } : result;

      if (flags.json) {
        renderJSON(outputResult);
        return;
      }

      if (flags.quiet) {
        const severe = result.layers.filter((layer) => layer.potential === 'SEVERE' || layer.potential === 'HIGH').length;
        console.log(`${severe}/${result.layers.length}`);
        return;
      }

      heading(`Liquefaction Analysis - ${result.method === 'boulanger-idriss-2014' ? 'Boulanger & Idriss (2014)' : 'NCEER Simplified'}`);

      keyValue('Earthquake magnitude (Mw)', opts.magnitude);
      keyValue('Peak ground acceleration', `${opts.pga}g`);

      renderTable(
        ['Depth (m)', 'N160', '(N1)60cs', 'CSR', 'CRR', 'FS', 'Potential'],
        result.layers.map((layer) => [
          layer.depth, layer.N160, layer.N160cs, layer.CSR, layer.CRR, layer.factorOfSafety, layer.potential,
        ]),
      );

      keyValue('Estimated settlement', `${result.estimatedSettlement} mm`);

      if (flags.plot && result.layers.length > 0) {
        const depthRows = [...result.layers].sort((left, right) => left.depth - right.depth);
        const wantsBrowserPlot = Boolean(flags.saveHtml) || shouldUseBrowserPlots();
        if (wantsBrowserPlot) {
          try {
            const plot = renderInteractiveVisualization(
              buildLiquefactionPlotSource(result, source),
              {
                sourceLabel: source === 'demo' ? 'demo liquefaction profile' : 'liquefaction profile',
                outputPath: flags.saveHtml,
                open: flags.openInteractivePlot,
                focusChartId: 'liquefaction-safety-vs-depth',
                headline: 'Liquefaction Plot Viewer',
              },
            );
            success(
              plot.opened
                ? `Interactive plot viewer opened in your browser: ${plot.htmlPath}`
                : `Interactive plot viewer saved to ${plot.htmlPath}`,
            );
          } catch {
            renderXYPlot([
              {
                label: 'Factor of safety',
                points: depthRows.map((layer) => ({ x: layer.factorOfSafety, y: layer.depth })),
                style: 'line',
                symbol: '*',
              },
              {
                label: 'CSR',
                points: depthRows.map((layer) => ({ x: layer.CSR, y: layer.depth })),
                style: 'line',
                symbol: 'o',
              },
              {
                label: 'CRR',
                points: depthRows.map((layer) => ({ x: layer.CRR, y: layer.depth })),
                style: 'line',
                symbol: '+',
              },
            ], {
              height: 14,
              title: 'Liquefaction depth profile',
              xLabel: 'Value',
              yLabel: 'Depth (m)',
              invertY: true,
            });
          }
        } else {
          renderXYPlot([
            {
              label: 'Factor of safety',
              points: depthRows.map((layer) => ({ x: layer.factorOfSafety, y: layer.depth })),
              style: 'line',
              symbol: '*',
            },
            {
              label: 'CSR',
              points: depthRows.map((layer) => ({ x: layer.CSR, y: layer.depth })),
              style: 'line',
              symbol: 'o',
            },
            {
              label: 'CRR',
              points: depthRows.map((layer) => ({ x: layer.CRR, y: layer.depth })),
              style: 'line',
              symbol: '+',
            },
          ], {
            height: 14,
            title: 'Liquefaction depth profile',
            xLabel: 'Value',
            yLabel: 'Depth (m)',
            invertY: true,
          });
        }
      }

      renderSteps(result.steps, flags.verbose);

      if (flags.output) {
        writeFileSync(flags.output, JSON.stringify(outputResult, null, 2));
        success(`Results saved to ${flags.output}`);
      }

      console.log('');
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

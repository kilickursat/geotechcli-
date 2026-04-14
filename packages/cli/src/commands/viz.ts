import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  banner,
  heading,
  renderChart,
  renderMultiChart,
  renderXYPlot,
  warn,
} from '../ui/terminal.js';
import {
  buildAtterbergChart,
  buildMohrCircleChart,
  loadVisualizationSource,
  type ChartSpec,
  type VisualizationSource,
} from '../util/viz.js';

function summarizeDomain(values: number[]): string {
  if (values.length === 0) {
    return 'No samples';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${min.toFixed(2)} to ${max.toFixed(2)} (${values.length} samples)`;
}

function renderVisualization(chart: ChartSpec, height: number): void {
  heading(chart.title);

  if (chart.kind === 'xy') {
    console.log(chalk.gray(`  X-axis: ${chart.xLabel}${chart.xScale === 'log10' ? ' (log scale)' : ''}`));
    console.log(chalk.gray(`  Y-axis: ${chart.yLabel}`));
    if (chart.note) {
      console.log(chalk.gray(`  ${chart.note}`));
    }
    renderXYPlot(chart.xySeries ?? [], {
      height,
      title: chart.title,
      xLabel: chart.xLabel,
      yLabel: chart.yLabel,
      xScale: chart.xScale,
      xDomain: chart.xDomain,
      yDomain: chart.yDomain,
      invertY: chart.invertY,
    });
    return;
  }

  const xValues = chart.xValues ?? [];
  const series = chart.series ?? [];
  const labels = chart.labels ?? [];

  console.log(chalk.gray(`  X-axis: ${chart.xLabel} | Domain: ${summarizeDomain(xValues)}`));
  console.log(chalk.gray(`  Y-axis: ${chart.yLabel}`));
  if (chart.note) {
    console.log(chalk.gray(`  ${chart.note}`));
  }

  if (series.length > 1) {
    renderMultiChart(series, labels, {
      height,
      title: `${chart.title} (${chart.xLabel})`,
    });
  } else if (series[0]) {
    renderChart(series[0], {
      height,
      label: `${labels[0] ?? chart.yLabel} (${chart.xLabel})`,
    });
  }
}

function printChartCatalog(charts: ChartSpec[]): void {
  console.log('');
  console.log(chalk.cyan('  Available charts:'));
  charts.forEach((chart, index) => {
    console.log(chalk.gray(`    ${String(index + 1).padStart(2, ' ')}. `) + chalk.white(chart.id) + chalk.gray(`  - ${chart.title}`));
  });
  console.log('');
}

async function browseChartsInteractively(charts: ChartSpec[], height: number): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    while (true) {
      printChartCatalog(charts);
      const answer = (await rl.question('  Select chart number, "a" for all, or "q" to quit: ')).trim().toLowerCase();

      if (answer === 'q') {
        console.log('');
        break;
      }

      if (answer === 'a') {
        for (const chart of charts) {
          renderVisualization(chart, height);
        }
        continue;
      }

      const selectedIndex = Number(answer);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > charts.length) {
        warn(`Invalid selection "${answer}".`);
        continue;
      }

      renderVisualization(charts[selectedIndex - 1], height);
    }
  } finally {
    rl.close();
  }
}

function loadPresetSource(preset: string, opts: Record<string, unknown>): VisualizationSource {
  switch (preset) {
    case 'mohr':
    case 'mohr-circle':
      return {
        sourceType: 'preset',
        sourceName: 'mohr-circle',
        charts: [
          buildMohrCircleChart({
            sigma1: Number(opts.sigma1),
            sigma3: Number(opts.sigma3),
            cohesion: opts.cohesion !== undefined ? Number(opts.cohesion) : undefined,
            frictionAngle: opts.phi !== undefined ? Number(opts.phi) : undefined,
          }),
        ],
      };
    case 'atterberg':
    case 'plasticity':
      return {
        sourceType: 'preset',
        sourceName: 'atterberg',
        charts: [
          buildAtterbergChart({
            liquidLimit: Number(opts.ll),
            plasticityIndex: opts.pi !== undefined ? Number(opts.pi) : undefined,
            plasticLimit: opts.pl !== undefined ? Number(opts.pl) : undefined,
          }),
        ],
      };
    default:
      throw new Error(`Unsupported preset "${preset}". Use mohr-circle or atterberg.`);
  }
}

export function registerVizCommand(program: Command): void {
  const cmd = new Command('viz')
    .description('Interactive terminal visualization for saved data, engineering presets, and geotechnical chart templates')
    .argument('[file]', 'Visualization source file (.json, .csv, .xlsx)')
    .option('--chart <id>', 'Render a specific chart id directly')
    .option('--list', 'List available charts without rendering')
    .option('--all', 'Render all detected charts')
    .option('--sheet <name>', 'Workbook sheet name for .xlsx inputs')
    .option('--x <column>', 'Override the X-axis column for tabular inputs')
    .option('--y <columns>', 'Comma-separated Y columns for tabular inputs')
    .option('--height <rows>', 'Chart height in terminal rows', (value) => parseInt(value, 10), 12)
    .option('--template <name>', 'File template: compaction | gradation | cpt')
    .option('--preset <name>', 'Preset chart: mohr-circle | atterberg')
    .option('--sigma1 <kPa>', 'Major principal stress for Mohr circle preset', (value) => parseFloat(value))
    .option('--sigma3 <kPa>', 'Minor principal stress for Mohr circle preset', (value) => parseFloat(value))
    .option('--cohesion <kPa>', 'Cohesion intercept for Mohr-Coulomb envelope', (value) => parseFloat(value))
    .option('--phi <deg>', 'Friction angle for Mohr-Coulomb envelope', (value) => parseFloat(value))
    .option('--ll <percent>', 'Liquid limit for Atterberg plasticity chart', (value) => parseFloat(value))
    .option('--pl <percent>', 'Plastic limit for Atterberg plasticity chart', (value) => parseFloat(value))
    .option('--pi <percent>', 'Plasticity index for Atterberg plasticity chart', (value) => parseFloat(value))
    .addHelpText('after', `
  Examples:
    geotech viz samples/visualization/geotech-viz-showcase.csv
    geotech viz samples/visualization/geotech-viz-showcase.xlsx --sheet settlement_profile
    geotech viz samples/visualization/geotech-viz-compaction.csv --template compaction
    geotech viz samples/visualization/geotech-viz-gradation.csv --template gradation
    geotech viz output/liquefaction.json --list
    geotech viz --preset mohr-circle --sigma1 250 --sigma3 90 --cohesion 15 --phi 28
    geotech viz --preset atterberg --ll 55 --pl 25
`)
    .action(async (filePath, opts) => {
      if (opts.preset && filePath) {
        throw new Error('Use either a <file> input or --preset, not both at the same time.');
      }
      if (!opts.preset && !filePath) {
        throw new Error('Provide a visualization file or use --preset for a built-in engineering chart.');
      }

      const yColumns = typeof opts.y === 'string'
        ? opts.y.split(',').map((value: string) => value.trim()).filter((value: string) => value.length > 0)
        : undefined;

      const source = opts.preset
        ? loadPresetSource(String(opts.preset).toLowerCase(), opts as Record<string, unknown>)
        : await loadVisualizationSource(filePath as string, {
          sheetName: opts.sheet,
          xColumn: opts.x,
          yColumns,
          template: opts.template,
        });

      if (source.charts.length === 0) {
        if (opts.template) {
          throw new Error(`No chartable data found in ${filePath} for template "${opts.template}".`);
        }
        throw new Error(`No chartable data found in ${filePath}. Save JSON output from a supported command, or provide numeric CSV/XLSX columns.`);
      }

      banner();
      console.log(chalk.gray(`  Source: ${opts.preset ? `preset:${opts.preset}` : filePath} (${source.sourceType.toUpperCase()})`));
      console.log(chalk.gray(`  Charts detected: ${source.charts.length}`));

      if (opts.list) {
        printChartCatalog(source.charts);
        return;
      }

      if (typeof opts.chart === 'string') {
        const match = source.charts.find((chart) => chart.id === opts.chart);
        if (!match) {
          throw new Error(`Chart "${opts.chart}" not found. Run "geotech viz ${filePath ?? `--preset ${opts.preset}`} --list" to inspect available chart ids.`);
        }
        renderVisualization(match, opts.height);
        return;
      }

      if (opts.all || source.charts.length === 1 || !input.isTTY) {
        if (!input.isTTY && source.charts.length > 1 && !opts.all) {
          warn('Interactive mode is unavailable in this shell. Rendering the first chart only.');
          renderVisualization(source.charts[0], opts.height);
          return;
        }

        for (const chart of source.charts) {
          renderVisualization(chart, opts.height);
        }
        return;
      }

      await browseChartsInteractively(source.charts, opts.height);
    });

  program.addCommand(cmd);
}

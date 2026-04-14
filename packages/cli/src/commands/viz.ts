import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { banner, heading, renderChart, renderMultiChart, warn } from '../ui/terminal.js';
import { loadVisualizationSource, type ChartSpec } from '../util/viz.js';

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
  console.log(chalk.gray(`  X-axis: ${chart.xLabel} | Domain: ${summarizeDomain(chart.xValues)}`));
  console.log(chalk.gray(`  Y-axis: ${chart.yLabel}`));
  if (chart.note) {
    console.log(chalk.gray(`  ${chart.note}`));
  }

  if (chart.series.length > 1) {
    renderMultiChart(chart.series, chart.labels, {
      height,
      title: `${chart.title} (${chart.xLabel})`,
    });
  } else {
    renderChart(chart.series[0], {
      height,
      label: `${chart.labels[0]} (${chart.xLabel})`,
    });
  }
}

function printChartCatalog(charts: ChartSpec[]): void {
  console.log('');
  console.log(chalk.cyan('  Available charts:'));
  charts.forEach((chart, index) => {
    console.log(chalk.gray(`    ${String(index + 1).padStart(2, ' ')}. `) + chalk.white(chart.id) + chalk.gray(`  —  ${chart.title}`));
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

export function registerVizCommand(program: Command): void {
  const cmd = new Command('viz')
    .description('Interactive terminal visualization for saved JSON, CSV, and Excel analysis data')
    .argument('<file>', 'Visualization source file (.json, .csv, .xlsx)')
    .option('--chart <id>', 'Render a specific chart id directly')
    .option('--list', 'List available charts without rendering')
    .option('--all', 'Render all detected charts')
    .option('--sheet <name>', 'Workbook sheet name for .xlsx inputs')
    .option('--x <column>', 'Override the X-axis column for tabular inputs')
    .option('--y <columns>', 'Comma-separated Y columns for tabular inputs')
    .option('--height <rows>', 'Chart height in terminal rows', (value) => parseInt(value, 10), 12)
    .addHelpText('after', `
  Examples:
    geotech viz samples/visualization/geotech-viz-showcase.csv
    geotech viz samples/visualization/geotech-viz-showcase.xlsx --sheet settlement_profile
    geotech viz output/liquefaction.json --list
    geotech viz output/liquefaction.json --chart output-liquefaction-fs-by-depth
`)
    .action(async (filePath, opts) => {
      const yColumns = typeof opts.y === 'string'
        ? opts.y.split(',').map((value: string) => value.trim()).filter((value: string) => value.length > 0)
        : undefined;

      const source = await loadVisualizationSource(filePath, {
        sheetName: opts.sheet,
        xColumn: opts.x,
        yColumns,
      });

      if (source.charts.length === 0) {
        throw new Error(`No chartable data found in ${filePath}. Save JSON output from a supported command, or provide numeric CSV/XLSX columns.`);
      }

      banner();
      console.log(chalk.gray(`  Source: ${filePath} (${source.sourceType.toUpperCase()})`));
      console.log(chalk.gray(`  Charts detected: ${source.charts.length}`));

      if (opts.list) {
        printChartCatalog(source.charts);
        return;
      }

      if (typeof opts.chart === 'string') {
        const match = source.charts.find((chart) => chart.id === opts.chart);
        if (!match) {
          throw new Error(`Chart "${opts.chart}" not found. Run "geotech viz ${filePath} --list" to inspect available chart ids.`);
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

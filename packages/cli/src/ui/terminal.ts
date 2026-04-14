import chalk from 'chalk';
import * as asciichart from 'asciichart';
import { GEOTECHCLI_VERSION } from '@geotechcli/core';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function pad(value: string, width: number): string {
  const visible = stripAnsi(value).length;
  return `${value}${' '.repeat(Math.max(0, width - visible))}`;
}

export function banner(): void {
  console.log('');
  console.log(chalk.bold.cyan('  ██████╗ ███████╗ ██████╗ ████████╗███████╗ ██████╗██╗  ██╗ ██████╗██╗     ██╗'));
  console.log(chalk.bold.cyan(' ██╔════╝ ██╔════╝██╔═══██╗╚══██╔══╝██╔════╝██╔════╝██║  ██║██╔════╝██║     ██║'));
  console.log(chalk.bold.white(' ██║  ███╗█████╗  ██║   ██║   ██║   █████╗  ██║     ███████║██║     ██║     ██║'));
  console.log(chalk.bold.white(' ██║   ██║██╔══╝  ██║   ██║   ██║   ██╔══╝  ██║     ██╔══██║██║     ██║     ██║'));
  console.log(chalk.bold.cyan(' ╚██████╔╝███████╗╚██████╔╝   ██║   ███████╗╚██████╗██║  ██║╚██████╗███████╗██║'));
  console.log(chalk.bold.cyan('  ╚═════╝ ╚══════╝ ╚═════╝    ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝'));
  console.log(chalk.gray(`  v${GEOTECHCLI_VERSION} | AI-native geotechnical engineering | https://beta.geotechcli.com`));
  console.log('');
}

export function heading(text: string): void {
  console.log('');
  console.log(chalk.bold.white(`  ${text}`));
  console.log(chalk.gray(`  ${'-'.repeat(Math.min(text.length + 4, 60))}`));
}

export function success(text: string): void {
  console.log(chalk.green(`  OK    ${text}`));
}

export function warn(text: string): void {
  console.log(chalk.yellow(`  WARN  ${text}`));
}

export function error(text: string): void {
  console.log(chalk.red(`  ERR   ${text}`));
}

export function info(text: string): void {
  console.log(chalk.blue(`  INFO  ${text}`));
}

export function dim(text: string): void {
  console.log(chalk.gray(`  ${text}`));
}

export function keyValue(key: string, value: string | number): void {
  console.log(
    chalk.gray('  ') +
    chalk.white.bold(pad(key, 28)) +
    chalk.cyan(String(value)),
  );
}

export function renderTable(headers: string[], rows: (string | number)[][]): void {
  const stringRows = rows.map((row) => row.map((cell) => String(cell)));
  const allRows = [headers, ...stringRows];
  const colWidths = headers.map((_, columnIndex) =>
    Math.max(...allRows.map((row) => stripAnsi(row[columnIndex] ?? '').length)) + 2,
  );

  const makeBorder = (left: string, mid: string, right: string) =>
    chalk.gray(
      `  ${left}${colWidths.map((width) => '-'.repeat(width + 2)).join(mid)}${right}`,
    );

  const formatCell = (value: string, columnIndex: number, isHeader = false): string => {
    const display = isHeader ? chalk.cyan.bold(value) : value;
    return ` ${pad(display, colWidths[columnIndex])} `;
  };

  const formatRow = (cells: string[], isHeader = false) =>
    chalk.gray('  |') +
    cells.map((cell, index) => formatCell(cell, index, isHeader)).join(chalk.gray('|')) +
    chalk.gray('|');

  console.log('');
  console.log(makeBorder('+', '+', '+'));
  console.log(formatRow(headers, true));
  console.log(makeBorder('+', '+', '+'));
  for (const row of stringRows) {
    console.log(formatRow(row));
  }
  console.log(makeBorder('+', '+', '+'));
}

export function renderChart(
  data: number[],
  options?: { height?: number; label?: string },
): void {
  const height = options?.height ?? 12;

  console.log('');
  if (options?.label) {
    console.log(chalk.gray(`  ${options.label}`));
  }

  const chart = asciichart.plot(data, {
    height,
    padding: '    ',
    format: (x: number) => x.toFixed(1).padStart(8),
  });

  console.log(chart);
  console.log('');
}

export function renderMultiChart(
  series: number[][],
  labels: string[],
  options?: { height?: number; title?: string },
): void {
  const height = options?.height ?? 12;
  const colors = [
    asciichart.cyan,
    asciichart.yellow,
    asciichart.red,
    asciichart.green,
    asciichart.blue,
  ];

  console.log('');
  if (options?.title) {
    console.log(chalk.gray(`  ${options.title}`));
  }

  const chart = asciichart.plot(series, {
    height,
    padding: '    ',
    colors: colors.slice(0, series.length),
    format: (x: number) => x.toFixed(1).padStart(8),
  });

  console.log(chart);
  const legend = labels.map((label, index) => `${index + 1}:${label}`).join('  ');
  console.log(`    ${legend}`);
  console.log('');
}

export function renderSteps(steps: string[], verbose: boolean): void {
  if (!verbose) return;

  console.log('');
  console.log(chalk.gray('  Calculation steps:'));
  for (const step of steps) {
    console.log(chalk.gray(`    ${step}`));
  }
}

export function renderJSON(data: unknown): void {
  const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
    if (/api.?key|token|secret|password/i.test(key)) {
      if (typeof value === 'boolean' || typeof value === 'number' || value == null) {
        return value;
      }
      return '***REDACTED***';
    }
    return value;
  }));
  console.log(JSON.stringify(sanitized, null, 2));
}

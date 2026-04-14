import chalk from 'chalk';
import * as asciichart from 'asciichart';
import { GEOTECHCLI_VERSION } from '@geotechcli/core';

export interface XYPoint {
  x: number;
  y: number;
}

export interface XYSeriesSpec {
  label: string;
  points: XYPoint[];
  style?: 'line' | 'scatter';
  symbol?: string;
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function expandDomain(min: number, max: number): [number, number] {
  if (min === max) {
    const delta = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    return [min - delta, max + delta];
  }
  return [min, max];
}

function interpolateLine(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  symbol: string,
  grid: string[][],
): void {
  const steps = Math.max(Math.abs(endCol - startCol), Math.abs(endRow - startRow));
  if (steps === 0) {
    grid[startRow][startCol] = symbol;
    return;
  }

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const col = Math.round(startCol + (endCol - startCol) * t);
    const row = Math.round(startRow + (endRow - startRow) * t);
    grid[row][col] = symbol;
  }
}

export function renderXYPlot(
  series: XYSeriesSpec[],
  options?: {
    height?: number;
    width?: number;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    xScale?: 'linear' | 'log10';
    xDomain?: [number, number];
    yDomain?: [number, number];
    invertY?: boolean;
  },
): void {
  const height = Math.max(8, options?.height ?? 14);
  const width = Math.max(28, options?.width ?? 60);
  const xScale = options?.xScale ?? 'linear';
  const symbols = ['*', 'o', 'x', '+', '#'];

  const transformedSeries = series
    .map((entry, index) => {
      const points = entry.points
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .filter((point) => xScale === 'linear' || point.x > 0)
        .map((point) => ({
          x: xScale === 'log10' ? Math.log10(point.x) : point.x,
          y: point.y,
          rawX: point.x,
          rawY: point.y,
        }));

      return {
        ...entry,
        symbol: entry.symbol ?? symbols[index % symbols.length],
        points,
      };
    })
    .filter((entry) => entry.points.length > 0);

  if (transformedSeries.length === 0) {
    warn('No plottable XY data found for this chart.');
    return;
  }

  const allX = transformedSeries.flatMap((entry) => entry.points.map((point) => point.x));
  const allY = transformedSeries.flatMap((entry) => entry.points.map((point) => point.y));
  const rawX = transformedSeries.flatMap((entry) => entry.points.map((point) => point.rawX));
  const transformedDomain = options?.xDomain && xScale === 'log10'
    ? [Math.log10(options.xDomain[0]), Math.log10(options.xDomain[1])] as [number, number]
    : options?.xDomain;

  const [xMin, xMax] = expandDomain(
    transformedDomain?.[0] ?? Math.min(...allX),
    transformedDomain?.[1] ?? Math.max(...allX),
  );
  const [yMin, yMax] = expandDomain(
    options?.yDomain?.[0] ?? Math.min(...allY),
    options?.yDomain?.[1] ?? Math.max(...allY),
  );

  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));

  const xToColumn = (value: number) =>
    clamp(Math.round(((value - xMin) / (xMax - xMin)) * (width - 1)), 0, width - 1);
  const yToRow = (value: number) => {
    const normalized = (value - yMin) / (yMax - yMin);
    const row = options?.invertY
      ? Math.round(normalized * (height - 1))
      : Math.round((1 - normalized) * (height - 1));
    return clamp(row, 0, height - 1);
  };

  if (xScale === 'linear' && xMin <= 0 && xMax >= 0) {
    const axisCol = xToColumn(0);
    for (let row = 0; row < height; row += 1) {
      grid[row][axisCol] = '|';
    }
  }

  if (yMin <= 0 && yMax >= 0) {
    const axisRow = yToRow(0);
    for (let col = 0; col < width; col += 1) {
      grid[axisRow][col] = '-';
    }
  }

  if (xScale === 'linear' && xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
    grid[yToRow(0)][xToColumn(0)] = '+';
  }

  for (const entry of transformedSeries) {
    const symbol = entry.symbol ?? '*';
    for (let index = 0; index < entry.points.length; index += 1) {
      const point = entry.points[index];
      const col = xToColumn(point.x);
      const row = yToRow(point.y);
      grid[row][col] = symbol;

      if (entry.style !== 'scatter' && index > 0) {
        const previous = entry.points[index - 1];
        interpolateLine(
          xToColumn(previous.x),
          yToRow(previous.y),
          col,
          row,
          symbol,
          grid,
        );
      }
    }
  }

  console.log('');
  if (options?.title) {
    console.log(chalk.gray(`  ${options.title}`));
  }
  console.log(grid.map((row) => `    ${row.join('')}`).join('\n'));
  console.log(chalk.gray(`    x: ${Math.min(...rawX).toFixed(2)} to ${Math.max(...rawX).toFixed(2)}${xScale === 'log10' ? ' (log scale)' : ''}${options?.xLabel ? ` | ${options.xLabel}` : ''}`));
  console.log(chalk.gray(`    y: ${yMin.toFixed(2)} to ${yMax.toFixed(2)}${options?.yLabel ? ` | ${options.yLabel}` : ''}`));
  console.log(`    ${transformedSeries.map((entry) => `${entry.symbol}=${entry.label}`).join('  ')}`);
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

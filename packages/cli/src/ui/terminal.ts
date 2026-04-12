import chalk from 'chalk';
import * as asciichart from 'asciichart';
import { GEOTECHCLI_VERSION } from '@geotechcli/core';

// ---------------------------------------------------------------------------
// Branded output
// ---------------------------------------------------------------------------

export function banner(): void {
  const c = chalk.bold.cyan;
  const w = chalk.bold.white;
  const g = chalk.gray;

  console.log('');
  console.log(c('  ██████╗ ███████╗ ██████╗ ████████╗███████╗ ██████╗██╗  ██╗ ██████╗██╗     ██╗'));
  console.log(c(' ██╔════╝ ██╔════╝██╔═══██╗╚══██╔══╝██╔════╝██╔════╝██║  ██║██╔════╝██║     ██║'));
  console.log(w(' ██║  ███╗█████╗  ██║   ██║   ██║   █████╗  ██║     ███████║██║     ██║     ██║'));
  console.log(w(' ██║   ██║██╔══╝  ██║   ██║   ██║   ██╔══╝  ██║     ██╔══██║██║     ██║     ██║'));
  console.log(c(' ╚██████╔╝███████╗╚██████╔╝   ██║   ███████╗╚██████╗██║  ██║╚██████╗███████╗██║'));
  console.log(c('  ╚═════╝ ╚══════╝ ╚═════╝    ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝'));
  console.log('');
  console.log(
    g('  v') + chalk.cyan(GEOTECHCLI_VERSION) +
    g('  ·  AI-native geotechnical engineering  ·  ') +
    chalk.dim('https://beta.geotechcli.com'),
  );
  console.log('');
}


export function heading(text: string): void {
  console.log('');
  console.log(chalk.bold.white(`  ${text}`));
  console.log(chalk.gray('  ' + '─'.repeat(Math.min(text.length + 4, 60))));
}

export function success(text: string): void {
  console.log(chalk.green('  ✓ ') + text);
}

export function warn(text: string): void {
  console.log(chalk.yellow('  ⚠ ') + text);
}

export function error(text: string): void {
  console.log(chalk.red('  ✗ ') + text);
}

export function info(text: string): void {
  console.log(chalk.blue('  ℹ ') + text);
}

export function dim(text: string): void {
  console.log(chalk.gray(`  ${text}`));
}

export function keyValue(key: string, value: string | number): void {
  console.log(
    chalk.gray('  ') +
    chalk.white.bold(key.padEnd(28)) +
    chalk.cyan(String(value)),
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function renderTable(
  headers: string[],
  rows: (string | number)[][],
): void {
  // Calculate column widths (strip ANSI for measurement)
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  const allRows = [headers, ...rows.map((r) => r.map(String))];
  const colWidths = headers.map((_, ci) =>
    Math.max(...allRows.map((r) => stripAnsi(String(r[ci] ?? '')).length)) + 2,
  );

  const pad = (s: string, w: number) => {
    const visible = stripAnsi(s).length;
    return ' ' + s + ' '.repeat(Math.max(0, w - visible - 1));
  };

  const colorCell = (s: string): string => {
    if (s === 'SEVERE' || s === 'HIGH') return chalk.red.bold(s);
    if (s === 'MODERATE') return chalk.yellow(s);
    if (s === 'LOW') return chalk.green(s);
    return s;
  };

  const topBorder = chalk.gray('  ┌' + colWidths.map((w) => '─'.repeat(w)).join('┬') + '┐');
  const midBorder = chalk.gray('  ├' + colWidths.map((w) => '─'.repeat(w)).join('┼') + '┤');
  const botBorder = chalk.gray('  └' + colWidths.map((w) => '─'.repeat(w)).join('┴') + '┘');

  const formatRow = (cells: string[], isHeader = false) => {
    const formatted = cells.map((c, i) => {
      const display = isHeader ? chalk.cyan.bold(c) : colorCell(c);
      return pad(display, colWidths[i]);
    });
    return chalk.gray('  │') + formatted.join(chalk.gray('│')) + chalk.gray('│');
  };

  console.log('');
  console.log(topBorder);
  console.log(formatRow(headers, true));
  console.log(midBorder);
  for (const row of rows) {
    console.log(formatRow(row.map(String)));
  }
  console.log(botBorder);
}

// ---------------------------------------------------------------------------
// Charts (ASCII line chart for --plot)
// ---------------------------------------------------------------------------

export function renderChart(
  data: number[],
  options?: { height?: number; label?: string; colors?: readonly string[] },
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

  // Legend
  const legend = labels
    .map((l, i) => chalk.hex(i === 0 ? '#00ffff' : i === 1 ? '#ffff00' : i === 2 ? '#ff0000' : '#00ff00')(`■ ${l}`))
    .join('  ');
  console.log(`    ${legend}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Steps (verbose output)
// ---------------------------------------------------------------------------

export function renderSteps(steps: string[], verbose: boolean): void {
  if (!verbose) return;

  console.log('');
  console.log(chalk.gray('  Calculation steps:'));
  for (const step of steps) {
    console.log(chalk.gray(`    ${step}`));
  }
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

export function renderJSON(data: unknown): void {
  // Security: strip any apiKey/api_key/token fields before output
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

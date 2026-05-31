import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeSignalFile,
  SIGNAL_THRESHOLD_PROFILE_IDS,
  type SignalAnalysisType,
  type SignalAnalyzeResult,
  type SignalThresholdProfileOption,
} from '@geotechcli/core';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import type { VisualizationSource } from '../util/viz.js';
import { renderInteractiveVisualization, shouldUseBrowserPlots } from '../ui/plot-viewer.js';
import { heading, keyValue, renderJSON, renderTable, success, warn } from '../ui/terminal.js';

const SIGNAL_TYPES: SignalAnalysisType[] = ['settlement', 'piezometer', 'inclinometer', 'vibration', 'load-test', 'unknown'];
const SIGNAL_THRESHOLD_PROFILE_OPTIONS: SignalThresholdProfileOption[] = ['auto', ...SIGNAL_THRESHOLD_PROFILE_IDS];

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Expected a positive number, got "${value}".`);
  return parsed;
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Expected a non-negative number, got "${value}".`);
  return parsed;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer, got "${value}".`);
  return parsed;
}

function parseSignalType(value: string): SignalAnalysisType {
  const normalized = value.toLowerCase() as SignalAnalysisType;
  if (!SIGNAL_TYPES.includes(normalized)) {
    throw new Error(`Unsupported signal type "${value}". Use ${SIGNAL_TYPES.join(', ')}.`);
  }
  return normalized;
}

function parseFormat(value: string): 'json' | 'text' {
  const normalized = value.toLowerCase();
  if (normalized === 'json' || normalized === 'text') return normalized;
  throw new Error(`Unsupported format "${value}". Use json or text.`);
}

function parseThresholdProfile(value: string): SignalThresholdProfileOption {
  const normalized = value.toLowerCase() as SignalThresholdProfileOption;
  if (!SIGNAL_THRESHOLD_PROFILE_OPTIONS.includes(normalized)) {
    throw new Error(`Unsupported threshold profile "${value}". Use ${SIGNAL_THRESHOLD_PROFILE_OPTIONS.join(', ')}.`);
  }
  return normalized;
}

function renderTextResult(result: SignalAnalyzeResult): void {
  heading('Signal Analysis');
  keyValue('Source', result.source.path);
  keyValue('Format', result.source.sheetName ? `${result.source.format}#${result.source.sheetName}` : result.source.format);
  keyValue('Signal type', result.signalType);
  if (result.thresholdProfile) {
    keyValue('Threshold profile', `${result.thresholdProfile.id} (${result.thresholdProfile.label})`);
    keyValue('Threshold basis', result.thresholdProfile.basis);
  }
  keyValue('Rows analyzed', result.source.rowsAnalyzed);
  keyValue('Rows rejected', result.source.rowsRejected);
  keyValue('Value column', result.columns.value);
  if (result.columns.timestamp) keyValue('Timestamp column', result.columns.timestamp);
  if (result.columns.depth) keyValue('Depth column', result.columns.depth);

  renderTable(
    ['Series', 'Count', 'Trend', 'Delta', 'Slope', 'Min', 'Max'],
    result.trendSummary.map((trend) => [
      trend.label,
      trend.count,
      trend.direction,
      trend.delta ?? '-',
      trend.slope == null ? '-' : `${trend.slope} ${trend.slopeUnit}`,
      trend.min ?? '-',
      trend.max ?? '-',
    ]),
  );

  if (result.thresholdFlags.length > 0) {
    renderTable(
      ['Series', 'Flag', 'At', 'Value', 'Threshold'],
      result.thresholdFlags.slice(0, 12).map((flag) => [
        flag.seriesId,
        flag.kind,
        flag.timestamp ?? flag.depth ?? flag.index,
        flag.value,
        `${flag.threshold}${flag.profileId ? ` (${flag.profileId})` : ''}`,
      ]),
    );
    if (result.thresholdFlags.length > 12) warn(`${result.thresholdFlags.length - 12} additional threshold flags omitted. Use --json for full output.`);
  }

  if (result.missingIntervals.length > 0) {
    renderTable(
      ['Series', 'From', 'To', 'Gap hours', 'Missing'],
      result.missingIntervals.slice(0, 12).map((gap) => [
        gap.seriesId,
        gap.from,
        gap.to,
        gap.gapHours,
        gap.missingIntervals,
      ]),
    );
    if (result.missingIntervals.length > 12) warn(`${result.missingIntervals.length - 12} additional missing intervals omitted. Use --json for full output.`);
  }

  result.warnings.forEach((message) => warn(message));
}

function signalX(point: SignalAnalyzeResult['series'][number]['points'][number], index: number, originMs: number | null): number {
  if (originMs != null && point.timestamp) {
    return (Date.parse(point.timestamp) - originMs) / 86_400_000;
  }
  if (point.depth != null) {
    return point.depth;
  }
  return index;
}

function buildSignalVisualizationSource(result: SignalAnalyzeResult): VisualizationSource {
  const timestampValues = result.series.flatMap((series) =>
    series.points.map((point) => (point.timestamp ? Date.parse(point.timestamp) : Number.NaN))
      .filter((value) => Number.isFinite(value)),
  );
  const originMs = timestampValues.length > 0 ? Math.min(...timestampValues) : null;
  const usesDepthAxis = originMs == null && result.series.some((series) => series.points.some((point) => point.depth != null));
  const xLabel = originMs != null
    ? 'Days since first reading'
    : usesDepthAxis
      ? result.columns.depth ?? 'Depth/elevation'
      : 'Sample index';
  const valueLabel = result.columns.value;
  const sourceType = result.source.format === 'xlsx' ? 'xlsx' : 'csv';

  const valueChart = usesDepthAxis && originMs == null
    ? {
        id: 'signal-depth-profile',
        title: `${result.signalType} value profile`,
        kind: 'xy' as const,
        xLabel: valueLabel,
        yLabel: result.columns.depth ?? 'Depth/elevation',
        invertY: true,
        note: 'Depth/elevation profile from deterministic signal analysis.',
        xySeries: result.series.map((series) => ({
          label: series.label,
          style: 'line' as const,
          points: series.points
            .map((point, index) => ({
              x: point.value,
              y: point.depth ?? index,
              label: point.timestamp ?? String(point.depth ?? index),
              meta: {
                instrumentId: point.instrumentId ?? series.id,
                location: point.location ?? null,
              },
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
        })),
      }
    : {
        id: 'signal-values',
        title: `${result.signalType} signal values`,
        kind: 'xy' as const,
        xLabel,
        yLabel: valueLabel,
        note: 'Deterministic monitoring signal values. Threshold flags are shown only when thresholds were supplied.',
        xySeries: result.series.map((series) => ({
          label: series.label,
          style: 'line' as const,
          points: series.points.map((point, index) => ({
            x: signalX(point, index, originMs),
            y: point.value,
            label: point.timestamp ?? String(point.depth ?? index),
            meta: {
              instrumentId: point.instrumentId ?? series.id,
              location: point.location ?? null,
            },
          })),
        })),
      };

  return {
    sourceType,
    sourceName: result.source.path,
    charts: [valueChart],
  };
}

function maybeRenderSignalPlot(result: SignalAnalyzeResult, flags: ReturnType<typeof getGlobalFlags>): void {
  const wantsBrowserPlot = Boolean(flags.saveHtml) || (flags.plot && shouldUseBrowserPlots());
  if (!wantsBrowserPlot) {
    return;
  }

  const plot = renderInteractiveVisualization(buildSignalVisualizationSource(result), {
    headline: 'Signal Analysis',
    sourceLabel: result.source.path,
    outputPath: flags.saveHtml,
    open: flags.openInteractivePlot,
  });

  success(
    plot.opened
      ? `Interactive signal plot opened in your browser: ${plot.htmlPath}`
      : `Interactive signal plot saved to ${plot.htmlPath}`,
  );
}

export function registerSignalCommand(program: Command): void {
  const signal = new Command('signal')
    .description('Deterministic monitoring signal analysis');

  const analyze = new Command('analyze')
    .description('Analyze CSV/TSV/XLSX monitoring readings without LLMs')
    .argument('<file>', 'Signal file (.csv, .tsv, or .xlsx)')
    .option('--type <type>', 'Signal type: settlement | piezometer | inclinometer | vibration | load-test | unknown', parseSignalType)
    .option('--timestamp <column>', 'Timestamp/date column override')
    .option('--depth <column>', 'Depth/elevation column override')
    .option('--value <column>', 'Reading/value column override')
    .option('--instrument <column>', 'Instrument ID column override')
    .option('--location <column>', 'Location/station column override')
    .option('--sheet <name>', 'Workbook sheet name for .xlsx inputs')
    .option('--format <format>', 'Output format: json | text', parseFormat, 'json')
    .option('--max-rows <n>', 'Maximum rows to analyze', parsePositiveInteger)
    .option('--threshold <number>', 'Absolute value threshold for flags', parseNonNegativeNumber)
    .option('--rate-threshold <number>', 'Absolute rate-of-change threshold for flags', parseNonNegativeNumber)
    .option('--threshold-profile <profile>', `Apply a generic review threshold profile: ${SIGNAL_THRESHOLD_PROFILE_OPTIONS.join(' | ')}`, parseThresholdProfile)
    .option('--expected-interval-hours <hours>', 'Expected timestamp spacing for missing interval detection', parsePositiveNumber)
    .addHelpText('after', `
  Examples:
    geotech signal analyze monitoring.csv --json
    geotech signal analyze settlement.csv --type settlement --expected-interval-hours 24
    geotech signal analyze readings.xlsx --sheet Daily --timestamp date --value settlement_mm
    geotech signal analyze piezometer.tsv --type piezometer --threshold 50 --rate-threshold 5
    geotech signal analyze monitoring.csv --type settlement --threshold-profile settlement-review-mm
`);

  addGlobalFlags(analyze);

  analyze.action(async (filePath: string, opts: Record<string, unknown>) => {
    const flags = getGlobalFlags(opts);
    const result = await analyzeSignalFile(resolve(filePath), {
      type: opts.type as SignalAnalysisType | undefined,
      sourcePath: filePath,
      timestampColumn: opts.timestamp as string | undefined,
      depthColumn: opts.depth as string | undefined,
      valueColumn: opts.value as string | undefined,
      instrumentIdColumn: opts.instrument as string | undefined,
      locationColumn: opts.location as string | undefined,
      sheetName: opts.sheet as string | undefined,
      maxRows: opts.maxRows as number | undefined,
      threshold: opts.threshold as number | undefined,
      rateThreshold: opts.rateThreshold as number | undefined,
      thresholdProfile: opts.thresholdProfile as SignalThresholdProfileOption | undefined,
      expectedIntervalHours: opts.expectedIntervalHours as number | undefined,
    });

    if (flags.output) {
      writeFileSync(resolve(flags.output), JSON.stringify(result, null, 2), 'utf-8');
      if (!flags.quiet) success(`Signal analysis saved to ${resolve(flags.output)}`);
    }

    if (!flags.quiet) {
      maybeRenderSignalPlot(result, flags);
    }

    const format = flags.json ? 'json' : (opts.format as 'json' | 'text');
    if (flags.quiet) {
      return;
    }

    if (format === 'json') {
      if (!flags.output) renderJSON(result);
      return;
    }

    renderTextResult(result);
  });

  signal.addCommand(analyze);
  program.addCommand(signal);
}

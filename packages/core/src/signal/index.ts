import { extname, basename } from 'node:path';
import { parseDelimitedFile, parseXlsxFile, type TabularCell, type TabularRow } from '../tabular/index.js';

export type SignalAnalysisType = 'settlement' | 'piezometer' | 'inclinometer' | 'vibration' | 'load-test' | 'unknown';
export type SignalThresholdProfileId =
  | 'settlement-review-mm'
  | 'piezometer-review-kpa'
  | 'inclinometer-review-mm'
  | 'vibration-ppv-review-mm-s'
  | 'load-test-review-kn';
export type SignalThresholdProfileOption = SignalThresholdProfileId | 'auto';

export interface SignalAnalyzeOptions {
  type?: SignalAnalysisType;
  sourcePath?: string;
  timestampColumn?: string;
  depthColumn?: string;
  valueColumn?: string;
  instrumentIdColumn?: string;
  locationColumn?: string;
  sheetName?: string;
  maxRows?: number;
  threshold?: number;
  rateThreshold?: number;
  expectedIntervalHours?: number;
  thresholdProfile?: SignalThresholdProfileOption;
}

export interface SignalThresholdProfile {
  id: SignalThresholdProfileId;
  signalType: Exclude<SignalAnalysisType, 'unknown'>;
  label: string;
  valueUnit: string;
  rateUnit: string;
  basis: string;
  valueThreshold?: number;
  rateThreshold?: number;
  expectedIntervalHours?: number;
  reviewGates: string[];
}

export interface SignalAppliedThresholdProfile extends SignalThresholdProfile {
  source: 'explicit-profile' | 'auto-profile';
  explicitOverrides: {
    threshold: boolean;
    rateThreshold: boolean;
    expectedIntervalHours: boolean;
  };
}

export interface SignalPoint {
  timestamp?: string;
  depth?: number;
  value: number;
  instrumentId?: string;
  location?: string;
}

export interface SignalChartSeries {
  id: string;
  label: string;
  x: Array<string | number>;
  y: number[];
  points: SignalPoint[];
}

export interface SignalThresholdFlag {
  seriesId: string;
  kind: 'value-threshold' | 'rate-threshold';
  severity: 'info' | 'warning';
  message: string;
  index: number;
  timestamp?: string;
  depth?: number;
  value: number;
  threshold: number;
  source: 'user' | 'threshold-profile';
  profileId?: SignalThresholdProfileId;
}

export interface SignalMissingInterval {
  seriesId: string;
  from: string;
  to: string;
  gapHours: number;
  expectedIntervalHours: number;
  missingIntervals: number;
}

export interface SignalRateMetrics {
  seriesId: string;
  unit: 'per-day' | 'per-meter' | 'per-sample';
  min: number | null;
  max: number | null;
  mean: number | null;
  latest: number | null;
}

export interface SignalTrendSummary {
  seriesId: string;
  label: string;
  count: number;
  firstValue: number | null;
  lastValue: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  delta: number | null;
  slope: number | null;
  slopeUnit: 'per-day' | 'per-meter' | 'per-sample';
  direction: 'increasing' | 'decreasing' | 'stable' | 'insufficient-data';
}

export interface SignalAnalyzeResult {
  schemaVersion: 'signal-analysis.v0';
  source: {
    path: string;
    format: 'csv' | 'xlsx';
    sheetName?: string;
    rowsAnalyzed: number;
    rowsRejected: number;
  };
  signalType: SignalAnalysisType;
  thresholdProfile?: SignalAppliedThresholdProfile;
  columns: {
    timestamp?: string;
    depth?: string;
    value: string;
    instrumentId?: string;
    location?: string;
  };
  trendSummary: SignalTrendSummary[];
  thresholdFlags: SignalThresholdFlag[];
  missingIntervals: SignalMissingInterval[];
  rateOfChange: SignalRateMetrics[];
  series: SignalChartSeries[];
  warnings: string[];
}

export interface SignalAnalysisResultContract {
  schemaVersion: 'signal-analysis-result-contract.v1';
  ok: boolean;
  failures: string[];
}

export const SIGNAL_ANALYSIS_BENCHMARK_REQUIRED_TYPES = [
  'settlement',
  'piezometer',
  'inclinometer',
  'vibration',
  'load-test',
] as const;

export type SignalAnalysisBenchmarkRequiredType = typeof SIGNAL_ANALYSIS_BENCHMARK_REQUIRED_TYPES[number];

export interface SignalAnalysisBenchmarkPathSafety {
  checked: boolean;
  leaks: string[];
}

export interface SignalAnalysisBenchmarkComparison {
  kind: 'signal-analysis-local-benchmark-comparison';
  schemaVersion: 1;
  generatedAt: string;
  outputDir: string;
  fixtureWorkspace: string;
  runDir: string;
  artifacts: Record<string, string>;
  workflow: {
    task: string;
    status?: string;
    llmRole?: string;
    modelCallsBytes: number;
    toolCallCount: number;
  };
  signalArtifacts: {
    sources: number;
    analyzedSources: number;
    blockedSources: number;
    reviewSources: number;
    rowsAnalyzed: number;
    series: number;
    thresholdFlags: number;
    missingIntervals: number;
    sourceTypes: Record<string, number>;
  };
  directSignal: {
    rowsAnalyzed: number;
    thresholdProfile: string | null;
    thresholdFlags: number;
    rateThresholdFlags: number;
    missingIntervals: number;
    series: number;
  };
  directSignalPlot: {
    htmlBytes: number;
    chartCount: number;
    pointCount: number;
    chartIds: string[];
    seriesLabels: string[];
    pathSafety: SignalAnalysisBenchmarkPathSafety;
  };
  pathSafety: SignalAnalysisBenchmarkPathSafety;
  passed: boolean;
  regressions: string[];
  contractValidation?: SignalAnalysisBenchmarkContractValidation;
}

export interface SignalAnalysisBenchmarkHistoryEntry {
  kind: 'signal-analysis-benchmark-history-entry';
  schemaVersion: 1;
  generatedAt: string;
  passed: boolean;
  thresholdProfile: string | null;
  summary: {
    sources: number;
    analyzedSources: number;
    blockedSources: number;
    rowsAnalyzed: number;
    series: number;
    directThresholdFlags: number;
    directRateThresholdFlags: number;
    directMissingIntervals: number;
    directPlotHtmlBytes?: number;
    directPlotChartCount?: number;
    modelCallsBytes: number;
    pathLeakCount: number;
    sourceTypes: Record<string, number>;
  };
}

export interface SignalAnalysisBenchmarkTrendReport {
  kind: 'signal-analysis-benchmark-trend';
  schemaVersion: 1;
  generatedAt: string;
  current: SignalAnalysisBenchmarkHistoryEntry;
  previous: SignalAnalysisBenchmarkHistoryEntry | null;
  delta: Record<string, unknown> | null;
  historyCount: number;
  note: string;
}

export interface SignalAnalysisBenchmarkContractOptions {
  requiredTypes?: readonly SignalAnalysisBenchmarkRequiredType[];
  minSources?: number;
  minRowsAnalyzed?: number;
  minDirectRowsAnalyzed?: number;
  minDirectThresholdFlags?: number;
  minDirectRateThresholdFlags?: number;
  minDirectMissingIntervals?: number;
  minDirectPlotHtmlBytes?: number;
  minDirectPlotChartCount?: number;
  requireZeroModelCalls?: boolean;
}

export interface SignalAnalysisBenchmarkContractValidation {
  schemaVersion: 'signal-analysis-benchmark-contract.v1';
  ok: boolean;
  failures: string[];
  warnings: string[];
}

interface PreparedTable {
  rows: TabularRow[];
  warnings: string[];
  format: 'csv' | 'xlsx';
  sheetName?: string;
}

const DEFAULT_MAX_ROWS = 5000;
const EPSILON = 1e-9;

const EXCEL_SERIAL_MIN = 20_000;
const EXCEL_SERIAL_MAX = 80_000;
const EXCEL_SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);

const SIGNAL_ANALYSIS_TYPES: SignalAnalysisType[] = [
  'settlement',
  'piezometer',
  'inclinometer',
  'vibration',
  'load-test',
  'unknown',
];

const SIGNAL_OUTPUT_PROHIBITED_KEYS = new Set([
  'apiKey',
  'llm',
  'model',
  'modelCall',
  'modelCalls',
  'prompt',
  'rawPrompt',
  'solver',
  'token',
]);

export const SIGNAL_THRESHOLD_PROFILES: readonly SignalThresholdProfile[] = [
  {
    id: 'settlement-review-mm',
    signalType: 'settlement',
    label: 'Settlement monitoring review thresholds',
    valueUnit: 'mm',
    rateUnit: 'mm/day',
    basis: 'Generic internal R&D review trigger for settlement monitoring. Replace with project trigger levels before engineering acceptance.',
    valueThreshold: 25,
    rateThreshold: 5,
    expectedIntervalHours: 24,
    reviewGates: ['project-trigger-levels-required', 'instrument-zero-baseline-required', 'unit-confirmation-required'],
  },
  {
    id: 'piezometer-review-kpa',
    signalType: 'piezometer',
    label: 'Piezometer pore-pressure review thresholds',
    valueUnit: 'kPa',
    rateUnit: 'kPa/day',
    basis: 'Generic internal R&D review trigger for pore pressure or groundwater level series. Replace with project trigger levels before engineering acceptance.',
    valueThreshold: 50,
    rateThreshold: 10,
    expectedIntervalHours: 24,
    reviewGates: ['project-trigger-levels-required', 'datum-and-unit-confirmation-required', 'seasonal-baseline-review-required'],
  },
  {
    id: 'inclinometer-review-mm',
    signalType: 'inclinometer',
    label: 'Inclinometer displacement review thresholds',
    valueUnit: 'mm',
    rateUnit: 'mm per inferred x-axis unit',
    basis: 'Generic internal R&D review trigger for inclinometer displacement profiles. Replace with project trigger levels before engineering acceptance.',
    valueThreshold: 15,
    rateThreshold: 2,
    reviewGates: ['project-trigger-levels-required', 'axis-or-depth-confirmation-required', 'casing-baseline-required'],
  },
  {
    id: 'vibration-ppv-review-mm-s',
    signalType: 'vibration',
    label: 'Vibration PPV review thresholds',
    valueUnit: 'mm/s',
    rateUnit: 'per-sample',
    basis: 'Generic internal R&D review trigger for vibration PPV records. Replace with applicable project, asset, and regulatory limits before engineering acceptance.',
    valueThreshold: 5,
    reviewGates: ['project-trigger-levels-required', 'frequency-content-review-required', 'asset-sensitivity-review-required'],
  },
  {
    id: 'load-test-review-kn',
    signalType: 'load-test',
    label: 'Load-test progression review thresholds',
    valueUnit: 'kN',
    rateUnit: 'kN per inferred x-axis unit',
    basis: 'Generic internal R&D review trigger for load-test progression. Replace with test-method hold, creep, and acceptance criteria before engineering acceptance.',
    rateThreshold: 250,
    reviewGates: ['test-method-required', 'hold-period-criteria-required', 'unit-confirmation-required'],
  },
] as const;

export const SIGNAL_THRESHOLD_PROFILE_IDS = SIGNAL_THRESHOLD_PROFILES.map((profile) => profile.id);

export function validateSignalAnalysisBenchmarkComparison(
  report: unknown,
  options: SignalAnalysisBenchmarkContractOptions = {},
): SignalAnalysisBenchmarkContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const requiredTypes = [...(options.requiredTypes ?? SIGNAL_ANALYSIS_BENCHMARK_REQUIRED_TYPES)];
  const minSources = options.minSources ?? requiredTypes.length;
  const minRowsAnalyzed = options.minRowsAnalyzed ?? 15;
  const minDirectRowsAnalyzed = options.minDirectRowsAnalyzed ?? 3;
  const minDirectThresholdFlags = options.minDirectThresholdFlags ?? 1;
  const minDirectRateThresholdFlags = options.minDirectRateThresholdFlags ?? 1;
  const minDirectMissingIntervals = options.minDirectMissingIntervals ?? 1;
  const minDirectPlotHtmlBytes = options.minDirectPlotHtmlBytes ?? 1_000;
  const minDirectPlotChartCount = options.minDirectPlotChartCount ?? 1;
  const requireZeroModelCalls = options.requireZeroModelCalls ?? true;

  if (!isRecord(report)) {
    return {
      schemaVersion: 'signal-analysis-benchmark-contract.v1',
      ok: false,
      failures: ['benchmark_comparison_must_be_object'],
      warnings,
    };
  }

  if (report.kind !== 'signal-analysis-local-benchmark-comparison') {
    failures.push('wrong_benchmark_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_benchmark_schema_version');
  }
  if (!isNonEmptyString(report.generatedAt)) {
    failures.push('missing_generated_at');
  }
  if (report.passed !== true) {
    failures.push('benchmark_not_passed');
  }
  if (!Array.isArray(report.regressions)) {
    failures.push('regressions_must_be_array');
  } else if (report.regressions.length > 0) {
    failures.push('benchmark_regressions_present');
  }

  validateSignalBenchmarkArtifacts(report.artifacts, failures);
  validateSignalBenchmarkWorkflow(report.workflow, failures, requireZeroModelCalls);
  validateSignalBenchmarkSignalArtifacts(report.signalArtifacts, failures, {
    requiredTypes,
    minSources,
    minRowsAnalyzed,
  });
  validateSignalBenchmarkDirectSignal(report.directSignal, failures, {
    minDirectRowsAnalyzed,
    minDirectThresholdFlags,
    minDirectRateThresholdFlags,
    minDirectMissingIntervals,
  });
  validateSignalBenchmarkDirectSignalPlot(report.directSignalPlot, failures, {
    minDirectPlotHtmlBytes,
    minDirectPlotChartCount,
  });
  validateSignalBenchmarkPathSafety(report, report.pathSafety, failures, 'comparison');

  return buildSignalBenchmarkContractValidation(failures, warnings);
}

export function validateSignalAnalysisBenchmarkTrend(
  report: unknown,
  options: SignalAnalysisBenchmarkContractOptions = {},
): SignalAnalysisBenchmarkContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const requiredTypes = [...(options.requiredTypes ?? SIGNAL_ANALYSIS_BENCHMARK_REQUIRED_TYPES)];
  const minSources = options.minSources ?? requiredTypes.length;
  const minRowsAnalyzed = options.minRowsAnalyzed ?? 15;
  const minDirectThresholdFlags = options.minDirectThresholdFlags ?? 1;
  const minDirectRateThresholdFlags = options.minDirectRateThresholdFlags ?? 1;
  const minDirectMissingIntervals = options.minDirectMissingIntervals ?? 1;
  const minDirectPlotHtmlBytes = options.minDirectPlotHtmlBytes ?? 1_000;
  const minDirectPlotChartCount = options.minDirectPlotChartCount ?? 1;
  const requireZeroModelCalls = options.requireZeroModelCalls ?? true;

  if (!isRecord(report)) {
    return {
      schemaVersion: 'signal-analysis-benchmark-contract.v1',
      ok: false,
      failures: ['benchmark_trend_must_be_object'],
      warnings,
    };
  }

  if (report.kind !== 'signal-analysis-benchmark-trend') {
    failures.push('wrong_trend_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_trend_schema_version');
  }
  if (!isNonEmptyString(report.generatedAt)) {
    failures.push('trend_missing_generated_at');
  }
  if (!isNonNegativeInteger(report.historyCount) || report.historyCount < 1) {
    failures.push('trend_history_count_invalid');
  }
  if (!isNonEmptyString(report.note) || !/private paths|raw monitoring files/i.test(report.note)) {
    warnings.push('trend_note_should_state_raw_files_and_private_paths_are_excluded');
  }

  validateSignalBenchmarkHistoryEntry(report.current, failures, 'current', {
    requiredTypes,
    minSources,
    minRowsAnalyzed,
    minDirectThresholdFlags,
    minDirectRateThresholdFlags,
    minDirectMissingIntervals,
    minDirectPlotHtmlBytes,
    minDirectPlotChartCount,
    requireZeroModelCalls,
    requirePassed: true,
  });
  if (report.previous !== null) {
    validateSignalBenchmarkHistoryEntry(report.previous, failures, 'previous', {
      requiredTypes,
      minSources,
      minRowsAnalyzed,
      minDirectThresholdFlags,
      minDirectRateThresholdFlags,
      minDirectMissingIntervals,
      minDirectPlotHtmlBytes,
      minDirectPlotChartCount,
      requireZeroModelCalls: false,
      requirePassed: false,
    });
  }
  if (report.previous && !isRecord(report.delta)) {
    failures.push('trend_delta_required_when_previous_exists');
  }
  validateSignalBenchmarkPathSafety(report, null, failures, 'trend');

  return buildSignalBenchmarkContractValidation(failures, warnings);
}

export function inspectSignalAnalysisBenchmarkPathSafety(value: unknown): SignalAnalysisBenchmarkPathSafety {
  return {
    checked: true,
    leaks: [...new Set(collectSignalBenchmarkPathLeaks(value))],
  };
}

export function validateSignalAnalysisResultContract(value: unknown): SignalAnalysisResultContract {
  const failures: string[] = [];

  if (!isRecord(value)) {
    return {
      schemaVersion: 'signal-analysis-result-contract.v1',
      ok: false,
      failures: ['signal analysis result contract must be an object'],
    };
  }

  if (value.schemaVersion !== 'signal-analysis.v0') {
    failures.push('signal analysis result schemaVersion must be signal-analysis.v0');
  }
  if (!SIGNAL_ANALYSIS_TYPES.includes(value.signalType as SignalAnalysisType)) {
    failures.push('signal analysis result must include a supported signalType');
  }

  const source = isRecord(value.source) ? value.source : null;
  if (!source) {
    failures.push('signal analysis result must include source metadata');
  } else {
    if (!isNonEmptyString(source.path)) {
      failures.push('signal source path must be a non-empty sanitized label');
    } else if (hasPrivateOrSecretText(source.path) || /[\\/]/.test(source.path)) {
      failures.push('signal source path must not include local directories, separators, or token-shaped values');
    }
    if (source.format !== 'csv' && source.format !== 'xlsx') {
      failures.push('signal source format must be csv or xlsx');
    }
    if (!isNonNegativeInteger(source.rowsAnalyzed)) {
      failures.push('signal source rowsAnalyzed must be a nonnegative integer');
    }
    if (!isNonNegativeInteger(source.rowsRejected)) {
      failures.push('signal source rowsRejected must be a nonnegative integer');
    }
  }

  const columns = isRecord(value.columns) ? value.columns : null;
  if (!columns || !isNonEmptyString(columns.value)) {
    failures.push('signal analysis result must include a value column');
  }
  if (columns && !isNonEmptyString(columns.timestamp) && !isNonEmptyString(columns.depth)) {
    failures.push('signal analysis result must include a timestamp or depth column');
  }

  if (!Array.isArray(value.trendSummary) || value.trendSummary.length === 0) {
    failures.push('signal analysis result must include trendSummary entries');
  }
  if (!Array.isArray(value.rateOfChange) || value.rateOfChange.length === 0) {
    failures.push('signal analysis result must include rateOfChange entries');
  }
  if (!Array.isArray(value.series) || value.series.length === 0) {
    failures.push('signal analysis result must include chart-ready series');
  }
  if (!Array.isArray(value.thresholdFlags)) {
    failures.push('signal analysis result must include thresholdFlags array');
  }
  if (!Array.isArray(value.missingIntervals)) {
    failures.push('signal analysis result must include missingIntervals array');
  }
  if (!Array.isArray(value.warnings)) {
    failures.push('signal analysis result must include warnings array');
  }

  for (const [index, trend] of (Array.isArray(value.trendSummary) ? value.trendSummary : []).entries()) {
    if (!isRecord(trend)) {
      failures.push(`signal trendSummary[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(trend.seriesId)) {
      failures.push(`signal trendSummary[${index}] must include seriesId`);
    }
    if (!isNonNegativeInteger(trend.count)) {
      failures.push(`signal trendSummary[${index}] must include count`);
    }
    if (!['increasing', 'decreasing', 'stable', 'insufficient-data'].includes(String(trend.direction))) {
      failures.push(`signal trendSummary[${index}] has invalid direction`);
    }
    if (!['per-day', 'per-meter', 'per-sample'].includes(String(trend.slopeUnit))) {
      failures.push(`signal trendSummary[${index}] has invalid slopeUnit`);
    }
  }

  for (const [index, rate] of (Array.isArray(value.rateOfChange) ? value.rateOfChange : []).entries()) {
    if (!isRecord(rate)) {
      failures.push(`signal rateOfChange[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(rate.seriesId)) {
      failures.push(`signal rateOfChange[${index}] must include seriesId`);
    }
    if (!['per-day', 'per-meter', 'per-sample'].includes(String(rate.unit))) {
      failures.push(`signal rateOfChange[${index}] has invalid unit`);
    }
  }

  const profile = isRecord(value.thresholdProfile) ? value.thresholdProfile : null;
  if (profile) {
    if (!SIGNAL_THRESHOLD_PROFILE_IDS.includes(profile.id as SignalThresholdProfileId)) {
      failures.push('signal threshold profile id must be supported');
    }
    if (profile.signalType !== value.signalType) {
      failures.push('signal threshold profile type must match result signalType');
    }
    if (profile.source !== 'explicit-profile' && profile.source !== 'auto-profile') {
      failures.push('signal threshold profile source must be explicit-profile or auto-profile');
    }
    if (!Array.isArray(profile.reviewGates) || profile.reviewGates.length === 0) {
      failures.push('signal threshold profile must include review gates');
    }
    if (!isRecord(profile.explicitOverrides)) {
      failures.push('signal threshold profile must expose explicit override flags');
    }
    if (!isNonEmptyString(profile.basis) || !/project-specific|generic|review/i.test(profile.basis)) {
      failures.push('signal threshold profile basis must clearly mark generic review usage');
    }
  }

  for (const [index, flag] of (Array.isArray(value.thresholdFlags) ? value.thresholdFlags : []).entries()) {
    if (!isRecord(flag)) {
      failures.push(`signal thresholdFlags[${index}] must be an object`);
      continue;
    }
    if (!['value-threshold', 'rate-threshold'].includes(String(flag.kind))) {
      failures.push(`signal thresholdFlags[${index}] has invalid kind`);
    }
    if (flag.source === 'threshold-profile' && !SIGNAL_THRESHOLD_PROFILE_IDS.includes(flag.profileId as SignalThresholdProfileId)) {
      failures.push(`signal thresholdFlags[${index}] profile flag must include supported profileId`);
    }
  }

  for (const [index, interval] of (Array.isArray(value.missingIntervals) ? value.missingIntervals : []).entries()) {
    if (!isRecord(interval)) {
      failures.push(`signal missingIntervals[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(interval.seriesId)) {
      failures.push(`signal missingIntervals[${index}] must include seriesId`);
    }
    if (typeof interval.gapHours !== 'number' || interval.gapHours <= 0) {
      failures.push(`signal missingIntervals[${index}] must include positive gapHours`);
    }
    if (!isNonNegativeInteger(interval.missingIntervals) || interval.missingIntervals < 1) {
      failures.push(`signal missingIntervals[${index}] must include at least one missing interval`);
    }
  }

  for (const keyPath of collectSignalOutputProhibitedKeys(value)) {
    failures.push(`signal output must remain deterministic; prohibited model/secret key found at ${keyPath}`);
  }

  for (const leak of collectSignalOutputPrivateLeaks(value)) {
    failures.push(`signal output must not leak private paths or tokens at ${leak}`);
  }

  return {
    schemaVersion: 'signal-analysis-result-contract.v1',
    ok: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function columnNames(rows: TabularRow[]): string[] {
  const names = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => names.add(key)));
  return [...names];
}

function findColumn(columns: string[], explicit: string | undefined, patterns: RegExp[]): string | undefined {
  if (explicit) {
    const match = columns.find((column) => column === explicit || normalizeHeader(column) === normalizeHeader(explicit));
    if (!match) throw new Error(`Column "${explicit}" was not found.`);
    return match;
  }
  return columns.find((column) => patterns.some((pattern) => pattern.test(normalizeHeader(column))));
}

function inferSignalType(sourceName: string, columns: string[], option?: SignalAnalysisType): SignalAnalysisType {
  if (option && option !== 'unknown') return option;
  const text = [sourceName, ...columns].map(normalizeHeader).join(' ');
  if (/settlement|settle|subsidence|heave/.test(text)) return 'settlement';
  if (/piezometer|porepressure|pwp|waterlevel|groundwater/.test(text)) return 'piezometer';
  if (/inclinometer|inclino|deflection|lateralmovement/.test(text)) return 'inclinometer';
  if (/vibration|ppv|velocity|acceler/.test(text)) return 'vibration';
  if (/loadtest|load|plate|piletest/.test(text)) return 'load-test';
  return 'unknown';
}

function signalThresholdProfileById(id: SignalThresholdProfileId): SignalThresholdProfile {
  const profile = SIGNAL_THRESHOLD_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new Error(`Unknown signal threshold profile "${id}".`);
  }
  return profile;
}

function resolveThresholdProfile(
  signalType: SignalAnalysisType,
  requested: SignalThresholdProfileOption | undefined,
  options: SignalAnalyzeOptions,
): { profile?: SignalAppliedThresholdProfile; warnings: string[] } {
  if (!requested) return { warnings: [] };

  if (requested === 'auto') {
    if (signalType === 'unknown') {
      return {
        warnings: ['No signal threshold profile was applied because the signal type is unknown. Confirm --type or pass an explicit --threshold-profile.'],
      };
    }
    const profile = SIGNAL_THRESHOLD_PROFILES.find((candidate) => candidate.signalType === signalType)!;
    return {
      profile: {
        ...profile,
        source: 'auto-profile',
        explicitOverrides: {
          threshold: options.threshold != null,
          rateThreshold: options.rateThreshold != null,
          expectedIntervalHours: options.expectedIntervalHours != null,
        },
      },
      warnings: [`Applied ${profile.id} generic review thresholds. Replace with project-specific trigger levels before engineering acceptance.`],
    };
  }

  const profile = signalThresholdProfileById(requested);
  if (signalType !== 'unknown' && profile.signalType !== signalType) {
    throw new Error(`Signal threshold profile "${requested}" is for ${profile.signalType}, but this input was classified as ${signalType}. Confirm --type or choose a matching profile.`);
  }
  return {
    profile: {
      ...profile,
      source: 'explicit-profile',
      explicitOverrides: {
        threshold: options.threshold != null,
        rateThreshold: options.rateThreshold != null,
        expectedIntervalHours: options.expectedIntervalHours != null,
      },
    },
    warnings: [`Applied ${profile.id} generic review thresholds. Replace with project-specific trigger levels before engineering acceptance.`],
  };
}

function asNumber(value: TabularCell): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: TabularCell): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function timestampFromExcelSerial(value: number): string | undefined {
  if (!Number.isFinite(value) || value < EXCEL_SERIAL_MIN || value > EXCEL_SERIAL_MAX) return undefined;
  const date = new Date(EXCEL_SERIAL_EPOCH_MS + value * 86_400_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toTimestamp(value: TabularCell): string | undefined {
  if (typeof value === 'number') return timestampFromExcelSerial(value);
  const raw = asString(value);
  if (!raw) return undefined;
  const numeric = Number(raw.replace(/,/g, ''));
  if (
    Number.isFinite(numeric)
    && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw.replace(/,/g, ''))
  ) {
    const serial = timestampFromExcelSerial(numeric);
    if (serial) return serial;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function sanitizeSignalSourcePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  const lastSegment = basename(normalized);
  const safe = lastSegment.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'signal-input';
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function min(values: number[]): number | null {
  return values.length > 0 ? round(Math.min(...values)) : null;
}

function max(values: number[]): number | null {
  return values.length > 0 ? round(Math.max(...values)) : null;
}

function sortPoints(points: SignalPoint[]): SignalPoint[] {
  return [...points].sort((left, right) => {
    if (left.timestamp && right.timestamp) return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    if (left.depth != null && right.depth != null) return left.depth - right.depth;
    return 0;
  });
}

function xValue(point: SignalPoint, index: number): string | number {
  if (point.timestamp) return point.timestamp;
  if (point.depth != null) return point.depth;
  return index;
}

function slopeUnit(points: SignalPoint[]): 'per-day' | 'per-meter' | 'per-sample' {
  if (points.every((point) => point.timestamp)) return 'per-day';
  if (points.every((point) => point.depth != null)) return 'per-meter';
  return 'per-sample';
}

function deltaX(left: SignalPoint, right: SignalPoint, unit: 'per-day' | 'per-meter' | 'per-sample'): number {
  if (unit === 'per-day' && left.timestamp && right.timestamp) {
    return (new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()) / 86_400_000;
  }
  if (unit === 'per-meter' && left.depth != null && right.depth != null) return right.depth - left.depth;
  return 1;
}

function linearSlope(points: SignalPoint[], unit: 'per-day' | 'per-meter' | 'per-sample'): number | null {
  if (points.length < 2) return null;
  const origin = points[0];
  const xs = points.map((point, index) => {
    if (unit === 'per-day' && origin.timestamp && point.timestamp) {
      return (new Date(point.timestamp).getTime() - new Date(origin.timestamp).getTime()) / 86_400_000;
    }
    if (unit === 'per-meter' && origin.depth != null && point.depth != null) return point.depth - origin.depth;
    return index;
  });
  const ys = points.map((point) => point.value);
  const meanX = mean(xs) ?? 0;
  const meanY = mean(ys) ?? 0;
  const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (Math.abs(denominator) < EPSILON) return null;
  return round(numerator / denominator);
}

function directionFromSlope(slope: number | null): SignalTrendSummary['direction'] {
  if (slope == null) return 'insufficient-data';
  if (Math.abs(slope) < 1e-6) return 'stable';
  return slope > 0 ? 'increasing' : 'decreasing';
}

async function loadTable(filePath: string, options: SignalAnalyzeOptions): Promise<PreparedTable> {
  const extension = extname(filePath).toLowerCase();
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);

  if (extension === '.csv' || extension === '.tsv') {
    const parsed = await parseDelimitedFile(filePath, { maxRows });
    return { rows: parsed.rows, warnings: parsed.warnings, format: 'csv' };
  }

  if (extension === '.xlsx') {
    const workbook = await parseXlsxFile(filePath, { maxRows });
    const sheet = options.sheetName
      ? workbook.sheets.find((candidate) => candidate.name === options.sheetName)
      : workbook.sheets[0];
    if (!sheet) {
      throw new Error(options.sheetName ? `Workbook sheet "${options.sheetName}" was not found.` : 'Workbook has no readable sheets.');
    }
    return {
      rows: sheet.rows,
      warnings: [...workbook.warnings, ...sheet.warnings],
      format: 'xlsx',
      sheetName: sheet.name,
    };
  }

  throw new Error(`Unsupported signal input "${extension}". Use CSV, TSV, or XLSX.`);
}

function buildPoints(rows: TabularRow[], columns: SignalAnalyzeResult['columns']): { points: SignalPoint[]; rejected: number; warnings: string[] } {
  const points: SignalPoint[] = [];
  const warnings: string[] = [];
  let rejected = 0;

  rows.forEach((row) => {
    const value = asNumber(row[columns.value]);
    if (value == null) {
      rejected += 1;
      return;
    }

    const timestamp = columns.timestamp ? toTimestamp(row[columns.timestamp]) : undefined;
    const depth = columns.depth ? asNumber(row[columns.depth]) : undefined;
    if (columns.timestamp && !timestamp) {
      rejected += 1;
      warnings.push(`Rejected row with invalid timestamp in column "${columns.timestamp}".`);
      return;
    }
    points.push({
      timestamp,
      depth,
      value,
      instrumentId: columns.instrumentId ? asString(row[columns.instrumentId]) : undefined,
      location: columns.location ? asString(row[columns.location]) : undefined,
    });
  });

  return { points, rejected, warnings: [...new Set(warnings)].slice(0, 5) };
}

function groupSeries(points: SignalPoint[]): SignalChartSeries[] {
  const groups = new Map<string, SignalPoint[]>();
  points.forEach((point) => {
    const key = point.instrumentId ?? point.location ?? 'series';
    groups.set(key, [...(groups.get(key) ?? []), point]);
  });

  return [...groups.entries()].map(([key, group]) => {
    const ordered = sortPoints(group);
    return {
      id: key,
      label: key === 'series' ? 'Signal' : key,
      x: ordered.map((point, index) => xValue(point, index)),
      y: ordered.map((point) => point.value),
      points: ordered,
    };
  });
}

function summarizeSeries(series: SignalChartSeries): SignalTrendSummary {
  const values = series.points.map((point) => point.value);
  const unit = slopeUnit(series.points);
  const slope = linearSlope(series.points, unit);
  const firstValue = values[0] ?? null;
  const lastValue = values.at(-1) ?? null;
  return {
    seriesId: series.id,
    label: series.label,
    count: series.points.length,
    firstValue: firstValue == null ? null : round(firstValue),
    lastValue: lastValue == null ? null : round(lastValue),
    min: min(values),
    max: max(values),
    mean: mean(values),
    delta: firstValue == null || lastValue == null ? null : round(lastValue - firstValue),
    slope,
    slopeUnit: unit,
    direction: directionFromSlope(slope),
  };
}

function ratesForSeries(series: SignalChartSeries): SignalRateMetrics {
  const unit = slopeUnit(series.points);
  const rates: number[] = [];
  for (let index = 1; index < series.points.length; index += 1) {
    const previous = series.points[index - 1];
    const current = series.points[index];
    const dx = deltaX(previous, current, unit);
    if (Math.abs(dx) > EPSILON) rates.push((current.value - previous.value) / dx);
  }
  return {
    seriesId: series.id,
    unit,
    min: min(rates),
    max: max(rates),
    mean: mean(rates),
    latest: rates.length > 0 ? round(rates[rates.length - 1]) : null,
  };
}

function thresholdFlagsForSeries(
  series: SignalChartSeries,
  valueThreshold: number | undefined,
  rateThreshold: number | undefined,
  source: 'user' | 'threshold-profile',
  profileId?: SignalThresholdProfileId,
): SignalThresholdFlag[] {
  const flags: SignalThresholdFlag[] = [];
  if (valueThreshold != null) {
    series.points.forEach((point, index) => {
      if (Math.abs(point.value) > valueThreshold) {
        flags.push({
          seriesId: series.id,
          kind: 'value-threshold',
          severity: 'warning',
          message: `Value ${round(point.value)} exceeds threshold ${valueThreshold}.`,
          index,
          timestamp: point.timestamp,
          depth: point.depth,
          value: round(point.value),
          threshold: valueThreshold,
          source,
          profileId,
        });
      }
    });
  }

  if (rateThreshold != null) {
    const unit = slopeUnit(series.points);
    for (let index = 1; index < series.points.length; index += 1) {
      const previous = series.points[index - 1];
      const current = series.points[index];
      const dx = deltaX(previous, current, unit);
      if (Math.abs(dx) <= EPSILON) continue;
      const rate = (current.value - previous.value) / dx;
      if (Math.abs(rate) > rateThreshold) {
        flags.push({
          seriesId: series.id,
          kind: 'rate-threshold',
          severity: 'warning',
          message: `Rate ${round(rate)} ${unit} exceeds threshold ${rateThreshold}.`,
          index,
          timestamp: current.timestamp,
          depth: current.depth,
          value: round(rate),
          threshold: rateThreshold,
          source,
          profileId,
        });
      }
    }
  }

  return flags;
}

function detectMissingIntervals(series: SignalChartSeries, expectedIntervalHours?: number): SignalMissingInterval[] {
  if (expectedIntervalHours == null || expectedIntervalHours <= 0) return [];
  const result: SignalMissingInterval[] = [];
  const expectedMs = expectedIntervalHours * 3_600_000;
  for (let index = 1; index < series.points.length; index += 1) {
    const previous = series.points[index - 1];
    const current = series.points[index];
    if (!previous.timestamp || !current.timestamp) continue;
    const gapMs = new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime();
    if (gapMs > expectedMs * 1.5) {
      result.push({
        seriesId: series.id,
        from: previous.timestamp,
        to: current.timestamp,
        gapHours: round(gapMs / 3_600_000),
        expectedIntervalHours,
        missingIntervals: Math.max(1, Math.round(gapMs / expectedMs) - 1),
      });
    }
  }
  return result;
}

export async function analyzeSignalFile(filePath: string, options: SignalAnalyzeOptions = {}): Promise<SignalAnalyzeResult> {
  const table = await loadTable(filePath, options);
  const columns = columnNames(table.rows);
  if (columns.length === 0) throw new Error('Signal input has no readable columns.');

  const timestamp = findColumn(columns, options.timestampColumn, [/^time$/, /^timestamp$/, /^datetime$/, /^date$/, /readingdate/, /observedat/]);
  const depth = findColumn(columns, options.depthColumn, [/^depthm?$/, /depth/, /elevation/]);
  const value = findColumn(columns, options.valueColumn, [/^value$/, /reading/, /settlement/, /porepressure/, /waterlevel/, /displacement/, /deflection/, /ppv/, /vibration/, /velocity/, /acceleration/, /load/, /force/]);
  const instrumentId = findColumn(columns, options.instrumentIdColumn, [/instrument/, /sensor/, /gauge/, /id$/]);
  const location = findColumn(columns, options.locationColumn, [/location/, /^loc$/, /station/, /chainage/]);

  if (!value) {
    throw new Error('Could not infer a signal value column. Provide --value <column>.');
  }
  if (!timestamp && !depth) {
    throw new Error('Could not infer a timestamp or depth column. Provide --timestamp or --depth.');
  }

  const inferredSignalType = inferSignalType(basename(filePath), columns, options.type);
  const profileResult = resolveThresholdProfile(inferredSignalType, options.thresholdProfile, options);
  const signalType = inferredSignalType === 'unknown' && profileResult.profile
    ? profileResult.profile.signalType
    : inferredSignalType;
  const selectedColumns = { timestamp, depth, value, instrumentId, location };
  const built = buildPoints(table.rows, selectedColumns);
  if (built.points.length === 0) {
    throw new Error('Signal input has no analyzable rows after rejecting invalid values or timestamps.');
  }
  const series = groupSeries(built.points);
  const valueThreshold = options.threshold ?? profileResult.profile?.valueThreshold;
  const rateThreshold = options.rateThreshold ?? profileResult.profile?.rateThreshold;
  const expectedIntervalHours = options.expectedIntervalHours ?? profileResult.profile?.expectedIntervalHours;
  const thresholdSource = profileResult.profile ? 'threshold-profile' : 'user';

  return {
    schemaVersion: 'signal-analysis.v0',
    source: {
      path: sanitizeSignalSourcePath(options.sourcePath ?? filePath),
      format: table.format,
      sheetName: table.sheetName,
      rowsAnalyzed: built.points.length,
      rowsRejected: built.rejected,
    },
    signalType,
    thresholdProfile: profileResult.profile,
    columns: selectedColumns,
    trendSummary: series.map(summarizeSeries),
    thresholdFlags: series.flatMap((item) => thresholdFlagsForSeries(
      item,
      valueThreshold,
      rateThreshold,
      thresholdSource,
      profileResult.profile?.id,
    )),
    missingIntervals: series.flatMap((item) => detectMissingIntervals(item, expectedIntervalHours)),
    rateOfChange: series.map(ratesForSeries),
    series,
    warnings: [...table.warnings, ...built.warnings, ...profileResult.warnings],
  };
}

function validateSignalBenchmarkArtifacts(artifacts: unknown, failures: string[]): void {
  if (!isRecord(artifacts)) {
    failures.push('artifacts_missing');
    return;
  }

  for (const key of ['comparison', 'summarySvg', 'directSignal', 'directSignalPlotHtml', 'history', 'trend', 'trendHtml', 'signalIndex']) {
    if (!isNonEmptyString(artifacts[key])) {
      failures.push(`artifact_${key}_missing`);
    }
  }
}

function validateSignalBenchmarkWorkflow(
  workflow: unknown,
  failures: string[],
  requireZeroModelCalls: boolean,
): void {
  if (!isRecord(workflow)) {
    failures.push('workflow_missing');
    return;
  }

  if (workflow.task !== 'signal-analysis') {
    failures.push('workflow_task_not_signal_analysis');
  }
  if (!isNonEmptyString(workflow.status)) {
    failures.push('workflow_status_missing');
  }
  if (workflow.llmRole !== 'none') {
    failures.push('workflow_llm_role_not_none');
  }
  if (!isNonNegativeInteger(workflow.modelCallsBytes)) {
    failures.push('workflow_model_calls_bytes_invalid');
  } else if (requireZeroModelCalls && workflow.modelCallsBytes !== 0) {
    failures.push('workflow_model_calls_not_empty');
  }
  if (!isNonNegativeInteger(workflow.toolCallCount) || workflow.toolCallCount < 1) {
    failures.push('workflow_tool_calls_missing');
  }
}

function validateSignalBenchmarkSignalArtifacts(
  signalArtifacts: unknown,
  failures: string[],
  options: {
    requiredTypes: readonly SignalAnalysisBenchmarkRequiredType[];
    minSources: number;
    minRowsAnalyzed: number;
  },
): void {
  if (!isRecord(signalArtifacts)) {
    failures.push('signal_artifacts_missing');
    return;
  }

  if (!isNonNegativeInteger(signalArtifacts.sources) || signalArtifacts.sources < options.minSources) {
    failures.push('signal_sources_below_minimum');
  }
  if (!isNonNegativeInteger(signalArtifacts.analyzedSources)) {
    failures.push('signal_analyzed_sources_invalid');
  } else if (isNonNegativeInteger(signalArtifacts.sources) && signalArtifacts.analyzedSources !== signalArtifacts.sources) {
    failures.push('signal_analyzed_sources_mismatch');
  }
  if (signalArtifacts.blockedSources !== 0) {
    failures.push('signal_blocked_sources_present');
  }
  if (!isNonNegativeInteger(signalArtifacts.rowsAnalyzed) || signalArtifacts.rowsAnalyzed < options.minRowsAnalyzed) {
    failures.push('signal_rows_analyzed_below_minimum');
  }
  if (!isNonNegativeInteger(signalArtifacts.series) || signalArtifacts.series < options.minSources) {
    failures.push('signal_series_below_minimum');
  }
  if (!isNonNegativeInteger(signalArtifacts.thresholdFlags)) {
    failures.push('signal_threshold_flags_invalid');
  }
  if (!isNonNegativeInteger(signalArtifacts.missingIntervals)) {
    failures.push('signal_missing_intervals_invalid');
  }

  const sourceTypes = isRecord(signalArtifacts.sourceTypes) ? signalArtifacts.sourceTypes : null;
  if (!sourceTypes) {
    failures.push('signal_source_types_missing');
    return;
  }
  for (const type of options.requiredTypes) {
    if (!isNonNegativeInteger(sourceTypes[type]) || sourceTypes[type] < 1) {
      failures.push(`signal_source_type_${type}_missing`);
    }
  }
  if (isNonNegativeInteger(sourceTypes.unknown) && sourceTypes.unknown > 0) {
    failures.push('signal_source_type_unknown_present');
  }
}

function validateSignalBenchmarkDirectSignal(
  directSignal: unknown,
  failures: string[],
  options: {
    minDirectRowsAnalyzed: number;
    minDirectThresholdFlags: number;
    minDirectRateThresholdFlags: number;
    minDirectMissingIntervals: number;
  },
): void {
  if (!isRecord(directSignal)) {
    failures.push('direct_signal_missing');
    return;
  }

  if (!isNonNegativeInteger(directSignal.rowsAnalyzed) || directSignal.rowsAnalyzed < options.minDirectRowsAnalyzed) {
    failures.push('direct_signal_rows_below_minimum');
  }
  if (directSignal.thresholdProfile !== 'settlement-review-mm') {
    failures.push('direct_signal_threshold_profile_not_settlement_review');
  }
  if (!isNonNegativeInteger(directSignal.thresholdFlags) || directSignal.thresholdFlags < options.minDirectThresholdFlags) {
    failures.push('direct_signal_threshold_flags_below_minimum');
  }
  if (!isNonNegativeInteger(directSignal.rateThresholdFlags) || directSignal.rateThresholdFlags < options.minDirectRateThresholdFlags) {
    failures.push('direct_signal_rate_threshold_flags_below_minimum');
  }
  if (!isNonNegativeInteger(directSignal.missingIntervals) || directSignal.missingIntervals < options.minDirectMissingIntervals) {
    failures.push('direct_signal_missing_intervals_below_minimum');
  }
  if (!isNonNegativeInteger(directSignal.series) || directSignal.series < 1) {
    failures.push('direct_signal_series_missing');
  }
}

function validateSignalBenchmarkDirectSignalPlot(
  directSignalPlot: unknown,
  failures: string[],
  options: {
    minDirectPlotHtmlBytes: number;
    minDirectPlotChartCount: number;
  },
): void {
  if (!isRecord(directSignalPlot)) {
    failures.push('direct_signal_plot_missing');
    return;
  }

  if (!isNonNegativeInteger(directSignalPlot.htmlBytes) || directSignalPlot.htmlBytes < options.minDirectPlotHtmlBytes) {
    failures.push('direct_signal_plot_html_bytes_below_minimum');
  }
  if (!isNonNegativeInteger(directSignalPlot.chartCount) || directSignalPlot.chartCount < options.minDirectPlotChartCount) {
    failures.push('direct_signal_plot_chart_count_below_minimum');
  }
  if (!isNonNegativeInteger(directSignalPlot.pointCount) || directSignalPlot.pointCount < 1) {
    failures.push('direct_signal_plot_points_missing');
  }
  if (!Array.isArray(directSignalPlot.chartIds) || !directSignalPlot.chartIds.some((id) => id === 'signal-values' || id === 'signal-depth-profile')) {
    failures.push('direct_signal_plot_signal_chart_missing');
  }
  if (!Array.isArray(directSignalPlot.seriesLabels) || directSignalPlot.seriesLabels.length === 0) {
    failures.push('direct_signal_plot_series_labels_missing');
  }

  const pathSafety = isRecord(directSignalPlot.pathSafety) ? directSignalPlot.pathSafety : null;
  if (!pathSafety) {
    failures.push('direct_signal_plot_path_safety_missing');
    return;
  }
  if (pathSafety.checked !== true) {
    failures.push('direct_signal_plot_path_safety_not_checked');
  }
  if (!Array.isArray(pathSafety.leaks)) {
    failures.push('direct_signal_plot_path_safety_leaks_missing');
  } else if (pathSafety.leaks.length > 0) {
    failures.push('direct_signal_plot_path_safety_leaks_present');
  }
}

function validateSignalBenchmarkHistoryEntry(
  entry: unknown,
  failures: string[],
  prefix: string,
  options: {
    requiredTypes: readonly SignalAnalysisBenchmarkRequiredType[];
    minSources: number;
    minRowsAnalyzed: number;
    minDirectThresholdFlags: number;
    minDirectRateThresholdFlags: number;
    minDirectMissingIntervals: number;
    minDirectPlotHtmlBytes: number;
    minDirectPlotChartCount: number;
    requireZeroModelCalls: boolean;
    requirePassed: boolean;
  },
): void {
  if (!isRecord(entry)) {
    failures.push(`${prefix}_history_entry_missing`);
    return;
  }
  if (entry.kind !== 'signal-analysis-benchmark-history-entry') {
    failures.push(`${prefix}_history_wrong_kind`);
  }
  if (entry.schemaVersion !== 1) {
    failures.push(`${prefix}_history_wrong_schema_version`);
  }
  if (!isNonEmptyString(entry.generatedAt)) {
    failures.push(`${prefix}_history_missing_generated_at`);
  }
  if (options.requirePassed && entry.passed !== true) {
    failures.push(`${prefix}_history_not_passed`);
  }

  const summary = isRecord(entry.summary) ? entry.summary : null;
  if (!summary) {
    failures.push(`${prefix}_history_summary_missing`);
    return;
  }

  for (const key of [
    'sources',
    'analyzedSources',
    'blockedSources',
    'rowsAnalyzed',
    'series',
    'directThresholdFlags',
    'directRateThresholdFlags',
    'directMissingIntervals',
    'modelCallsBytes',
    'pathLeakCount',
  ]) {
    if (!isNonNegativeInteger(summary[key])) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }

  if (!options.requirePassed) {
    return;
  }

  if ((summary.sources as number) < options.minSources) {
    failures.push(`${prefix}_history_sources_below_minimum`);
  }
  if (summary.analyzedSources !== summary.sources) {
    failures.push(`${prefix}_history_analyzed_sources_mismatch`);
  }
  if (summary.blockedSources !== 0) {
    failures.push(`${prefix}_history_blocked_sources_present`);
  }
  if ((summary.rowsAnalyzed as number) < options.minRowsAnalyzed) {
    failures.push(`${prefix}_history_rows_below_minimum`);
  }
  if ((summary.series as number) < options.minSources) {
    failures.push(`${prefix}_history_series_below_minimum`);
  }
  if ((summary.directThresholdFlags as number) < options.minDirectThresholdFlags) {
    failures.push(`${prefix}_history_direct_threshold_flags_below_minimum`);
  }
  if ((summary.directRateThresholdFlags as number) < options.minDirectRateThresholdFlags) {
    failures.push(`${prefix}_history_direct_rate_threshold_flags_below_minimum`);
  }
  if ((summary.directMissingIntervals as number) < options.minDirectMissingIntervals) {
    failures.push(`${prefix}_history_direct_missing_intervals_below_minimum`);
  }
  if (!isNonNegativeInteger(summary.directPlotHtmlBytes) || summary.directPlotHtmlBytes < options.minDirectPlotHtmlBytes) {
    failures.push(`${prefix}_history_direct_plot_html_bytes_below_minimum`);
  }
  if (!isNonNegativeInteger(summary.directPlotChartCount) || summary.directPlotChartCount < options.minDirectPlotChartCount) {
    failures.push(`${prefix}_history_direct_plot_chart_count_below_minimum`);
  }
  if (options.requireZeroModelCalls && summary.modelCallsBytes !== 0) {
    failures.push(`${prefix}_history_model_calls_not_empty`);
  }
  if (summary.pathLeakCount !== 0) {
    failures.push(`${prefix}_history_path_leaks_present`);
  }

  const sourceTypes = isRecord(summary.sourceTypes) ? summary.sourceTypes : null;
  if (!sourceTypes) {
    failures.push(`${prefix}_history_source_types_missing`);
    return;
  }
  for (const type of options.requiredTypes) {
    if (!isNonNegativeInteger(sourceTypes[type]) || sourceTypes[type] < 1) {
      failures.push(`${prefix}_history_source_type_${type}_missing`);
    }
  }
}

function validateSignalBenchmarkPathSafety(
  value: unknown,
  declaredPathSafety: unknown,
  failures: string[],
  prefix: string,
): void {
  const inspected = inspectSignalAnalysisBenchmarkPathSafety(value);
  if (inspected.leaks.length > 0) {
    failures.push(...inspected.leaks.map((leak) =>
      `${prefix}_sensitive_value_leak_${sanitizeSignalBenchmarkFailureToken(leak)}`,
    ));
  }

  if (declaredPathSafety === null) {
    return;
  }
  if (!isRecord(declaredPathSafety)) {
    failures.push(`${prefix}_path_safety_missing`);
    return;
  }
  if (declaredPathSafety.checked !== true) {
    failures.push(`${prefix}_path_safety_not_checked`);
  }
  if (!Array.isArray(declaredPathSafety.leaks)) {
    failures.push(`${prefix}_path_safety_leaks_missing`);
  } else if (declaredPathSafety.leaks.length > 0) {
    failures.push(`${prefix}_path_safety_leaks_present`);
  }
}

function buildSignalBenchmarkContractValidation(
  failures: string[],
  warnings: string[],
): SignalAnalysisBenchmarkContractValidation {
  return {
    schemaVersion: 'signal-analysis-benchmark-contract.v1',
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

function collectSignalBenchmarkPathLeaks(value: unknown, location = 'report'): string[] {
  if (typeof value === 'string') {
    const leaks: string[] = [];
    if (looksLikeSignalBenchmarkAbsolutePath(value)) {
      leaks.push(`${location}:absolute-path`);
    }
    if (looksLikeSignalBenchmarkSecret(value)) {
      leaks.push(`${location}:secret-like-value`);
    }
    return leaks;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSignalBenchmarkPathLeaks(item, `${location}_${index}`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectSignalBenchmarkPathLeaks(child, `${location}_${sanitizeSignalBenchmarkFailureToken(key)}`),
  );
}

function looksLikeSignalBenchmarkAbsolutePath(value: string): boolean {
  return /\b[A-Za-z]:[\\/][^\s"',}<\]]+/.test(value)
    || /(^|[\s"'([{])\/(?:Users|home|tmp|var|private|mnt|Volumes|etc)\/[^\s"',}<\]]+/i.test(value);
}

function looksLikeSignalBenchmarkSecret(value: string): boolean {
  return /(sk-or-v1-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,}|hf_[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{16,}|(?:api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9._-]{8,})/i.test(value);
}

function sanitizeSignalBenchmarkFailureToken(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'value';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasPrivateOrSecretText(value: string): boolean {
  return /(?:[A-Za-z]:[\\/](?:Users|home|tmp|var|mnt)[\\/]|\/(?:home|Users|tmp|var|mnt)\/|sk-(?:or-)?[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{12,})/i.test(value);
}

function collectSignalOutputProhibitedKeys(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (SIGNAL_OUTPUT_PROHIBITED_KEYS.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectSignalOutputPrivateLeaks(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (typeof entry === 'string' && hasPrivateOrSecretText(entry)) {
      paths.push(path || '<root>');
    }
  });

  return paths;
}

function walkUnknown(value: unknown, visit: (entry: unknown, path: string) => void, path = ''): void {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkUnknown(item, visit, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    walkUnknown(entry, visit, path ? `${path}.${key}` : key);
  }
}

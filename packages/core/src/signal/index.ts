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
      path: options.sourcePath ?? filePath,
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

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import {
  analyzeSignalFile,
  SIGNAL_THRESHOLD_PROFILE_IDS,
  type SignalAnalyzeOptions,
  type SignalAnalysisType,
  type SignalThresholdProfileOption,
} from '../signal/index.js';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateReadPath } from './sandbox.js';

const SIGNAL_TYPES: SignalAnalysisType[] = [
  'settlement',
  'piezometer',
  'inclinometer',
  'vibration',
  'load-test',
  'unknown',
];
const SIGNAL_THRESHOLD_PROFILE_OPTIONS: SignalThresholdProfileOption[] = ['auto', ...SIGNAL_THRESHOLD_PROFILE_IDS];

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalSignalType(value: unknown): SignalAnalysisType | undefined {
  if (typeof value !== 'string') return undefined;
  return SIGNAL_TYPES.includes(value as SignalAnalysisType) ? value as SignalAnalysisType : undefined;
}

function optionalThresholdProfile(value: unknown): SignalThresholdProfileOption | undefined {
  if (typeof value !== 'string') return undefined;
  return SIGNAL_THRESHOLD_PROFILE_OPTIONS.includes(value as SignalThresholdProfileOption)
    ? value as SignalThresholdProfileOption
    : undefined;
}

function buildSignalAnalyzeOptions(args: Record<string, unknown>): SignalAnalyzeOptions {
  return {
    type: optionalSignalType(args.type),
    timestampColumn: optionalString(args.timestampColumn),
    depthColumn: optionalString(args.depthColumn),
    valueColumn: optionalString(args.valueColumn),
    instrumentIdColumn: optionalString(args.instrumentIdColumn),
    locationColumn: optionalString(args.locationColumn),
    sheetName: optionalString(args.sheetName),
    maxRows: optionalNumber(args.maxRows),
    threshold: optionalNumber(args.threshold),
    rateThreshold: optionalNumber(args.rateThreshold),
    thresholdProfile: optionalThresholdProfile(args.thresholdProfile),
    expectedIntervalHours: optionalNumber(args.expectedIntervalHours),
  };
}

toolRegistry.register(
  {
    name: 'analyze_signal_file',
    description:
      'Deterministically analyze geotechnical monitoring and time-series data from CSV, TSV, or XLSX files. Supports settlement, piezometer, inclinometer, vibration, and load-test data. Returns trend summaries, threshold flags, missing intervals, rate metrics, and chart-ready series without LLM-generated calculations.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to a CSV, TSV, or XLSX monitoring data file' },
        type: {
          type: 'string',
          enum: SIGNAL_TYPES,
          description: 'Optional signal type override: settlement, piezometer, inclinometer, vibration, load-test, or unknown',
        },
        timestampColumn: { type: 'string', description: 'Optional timestamp/date column name' },
        depthColumn: { type: 'string', description: 'Optional depth/elevation column name' },
        valueColumn: { type: 'string', description: 'Optional measured value column name' },
        instrumentIdColumn: { type: 'string', description: 'Optional instrument/sensor ID column name' },
        locationColumn: { type: 'string', description: 'Optional location/station/chainage column name' },
        sheetName: { type: 'string', description: 'Optional XLSX worksheet name' },
        maxRows: { type: 'number', description: 'Maximum rows to analyze', default: 5000 },
        threshold: { type: 'number', description: 'Optional absolute value threshold for warning flags' },
        rateThreshold: { type: 'number', description: 'Optional absolute rate-of-change threshold for warning flags' },
        thresholdProfile: {
          type: 'string',
          enum: SIGNAL_THRESHOLD_PROFILE_OPTIONS,
          description: 'Optional generic review threshold profile. Use auto only when the instrument type is confirmed or inferred.',
        },
        expectedIntervalHours: { type: 'number', description: 'Optional expected timestamp interval for missing-data gap detection' },
      },
    },
  },
  async (args): Promise<ToolResult> => {
    const pathValue = optionalString(args.path);
    if (!pathValue) {
      return { success: false, data: null, summary: '', error: 'A signal file path is required.' };
    }

    const pathCheck = validateReadPath(pathValue);
    if (!pathCheck.safe) {
      return { success: false, data: null, summary: '', error: pathCheck.error! };
    }

    const filePath = pathCheck.resolved;
    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    const result = await analyzeSignalFile(filePath, {
      ...buildSignalAnalyzeOptions(args),
      sourcePath: basename(filePath),
    });
    const seriesCount = result.series.length;
    const flags = result.thresholdFlags.length;
    const gaps = result.missingIntervals.length;
    return {
      success: true,
      data: result,
      summary:
        `Signal analysis (${result.signalType}) for ${basename(filePath)}: ${result.source.rowsAnalyzed} rows, `
        + `${seriesCount} series, ${flags} threshold flag${flags === 1 ? '' : 's'}, `
        + `${gaps} missing interval${gaps === 1 ? '' : 's'}.`,
    };
  },
);

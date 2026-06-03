import { describe, expect, it } from 'vitest';
import {
  inspectSignalAnalysisBenchmarkPathSafety,
  validateSignalAnalysisBenchmarkComparison,
  validateSignalAnalysisBenchmarkTrend,
  type SignalAnalysisBenchmarkComparison,
  type SignalAnalysisBenchmarkTrendReport,
} from '../src/index.js';

function buildComparison(): SignalAnalysisBenchmarkComparison {
  return {
    kind: 'signal-analysis-local-benchmark-comparison',
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00.000Z',
    outputDir: '__benchmark-signal-analysis',
    fixtureWorkspace: '__benchmark-signal-analysis/fixture-workspace',
    runDir: '__benchmark-signal-analysis/fixture-workspace/.geotech/runs/run_20260601000000000',
    artifacts: {
      comparison: '__benchmark-signal-analysis/comparison.json',
      summarySvg: '__benchmark-signal-analysis/summary.svg',
      directSignal: '__benchmark-signal-analysis/direct-settlement-signal.json',
      directSignalPlotHtml: '__benchmark-signal-analysis/direct-settlement-signal.html',
      history: '__benchmark-signal-analysis/signal-history.json',
      trend: '__benchmark-signal-analysis/signal-trend.json',
      trendHtml: '__benchmark-signal-analysis/signal-trend.html',
      signalIndex: '__benchmark-signal-analysis/fixture-workspace/.geotech/runs/run_20260601000000000/signals/index.json',
    },
    workflow: {
      task: 'signal-analysis',
      status: 'review',
      llmRole: 'none',
      modelCallsBytes: 0,
      toolCallCount: 13,
    },
    signalArtifacts: {
      sources: 5,
      analyzedSources: 5,
      blockedSources: 0,
      reviewSources: 0,
      rowsAnalyzed: 15,
      series: 5,
      thresholdFlags: 0,
      missingIntervals: 0,
      sourceTypes: {
        settlement: 1,
        piezometer: 1,
        inclinometer: 1,
        vibration: 1,
        'load-test': 1,
      },
    },
    directSignal: {
      rowsAnalyzed: 3,
      thresholdProfile: 'settlement-review-mm',
      thresholdFlags: 3,
      rateThresholdFlags: 2,
      missingIntervals: 1,
      series: 1,
    },
    directSignalPlot: {
      htmlBytes: 50_000,
      chartCount: 1,
      pointCount: 3,
      chartIds: ['signal-values'],
      seriesLabels: ['SM-1'],
      pathSafety: {
        checked: true,
        leaks: [],
      },
    },
    pathSafety: {
      checked: true,
      leaks: [],
    },
    passed: true,
    regressions: [],
  };
}

function buildTrend(): SignalAnalysisBenchmarkTrendReport {
  const summary = {
    sources: 5,
    analyzedSources: 5,
    blockedSources: 0,
    rowsAnalyzed: 15,
    series: 5,
    directThresholdFlags: 3,
    directRateThresholdFlags: 2,
    directMissingIntervals: 1,
    directPlotHtmlBytes: 50_000,
    directPlotChartCount: 1,
    modelCallsBytes: 0,
    pathLeakCount: 0,
    sourceTypes: {
      settlement: 1,
      piezometer: 1,
      inclinometer: 1,
      vibration: 1,
      'load-test': 1,
    },
  };
  return {
    kind: 'signal-analysis-benchmark-trend',
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00.000Z',
    current: {
      kind: 'signal-analysis-benchmark-history-entry',
      schemaVersion: 1,
      generatedAt: '2026-06-01T00:00:00.000Z',
      passed: true,
      thresholdProfile: 'settlement-review-mm',
      summary,
    },
    previous: null,
    delta: null,
    historyCount: 1,
    note: 'Local signal trend output stores benchmark summaries only. Private paths and raw monitoring files are intentionally excluded.',
  };
}

describe('signal analysis benchmark contract', () => {
  it('accepts the deterministic synthetic benchmark comparison and trend shapes', () => {
    const comparison = buildComparison();
    const trend = buildTrend();

    expect(validateSignalAnalysisBenchmarkComparison(comparison)).toMatchObject({
      ok: true,
      failures: [],
    });
    expect(validateSignalAnalysisBenchmarkTrend(trend)).toMatchObject({
      ok: true,
      failures: [],
    });
  });

  it('fails closed when benchmark coverage, model-call, direct-threshold, or path-safety gates regress', () => {
    const comparison = buildComparison();
    comparison.workflow.modelCallsBytes = 128;
    comparison.directSignal.rateThresholdFlags = 0;
    comparison.directSignalPlot.chartCount = 0;
    comparison.outputDir = 'C:\\Users\\Databil\\private-signal-benchmark';
    delete comparison.signalArtifacts.sourceTypes.vibration;

    const validation = validateSignalAnalysisBenchmarkComparison(comparison);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toEqual(expect.arrayContaining([
      'workflow_model_calls_not_empty',
      'direct_signal_rate_threshold_flags_below_minimum',
      'direct_signal_plot_chart_count_below_minimum',
      'signal_source_type_vibration_missing',
      expect.stringMatching(/comparison_sensitive_value_leak/i),
    ]));
    expect(inspectSignalAnalysisBenchmarkPathSafety(comparison).leaks).toEqual(
      expect.arrayContaining([expect.stringMatching(/absolute-path/)]),
    );
  });

  it('requires current trend history to preserve zero-model-call and no-path-leak summaries', () => {
    const trend = buildTrend();
    trend.current.summary.modelCallsBytes = 1;
    trend.current.summary.pathLeakCount = 1;
    trend.current.summary.directPlotChartCount = 0;
    trend.current.summary.sourceTypes['load-test'] = 0;

    const validation = validateSignalAnalysisBenchmarkTrend(trend);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toEqual(expect.arrayContaining([
      'current_history_model_calls_not_empty',
      'current_history_path_leaks_present',
      'current_history_direct_plot_chart_count_below_minimum',
      'current_history_source_type_load-test_missing',
    ]));
  });
});

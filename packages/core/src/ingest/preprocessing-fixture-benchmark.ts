export const PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_MODES = [
  'none',
  'ocr-optimized',
  'region-v2',
] as const;

export const PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_CATEGORIES = [
  'borehole-log',
  'cpt-table',
  'lab-table',
  'mixed-scanned-report',
  'mixed-digital-scanned-pdf',
  'malformed-scanned-pdf',
] as const;

const DEFAULT_COMPARISON_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ocr-optimized', 'none'],
  ['region-v2', 'none'],
  ['region-v2', 'ocr-optimized'],
];

export interface PreprocessingFixtureBenchmarkPreprocessingSummary {
  policy: string;
  operations: string[];
  qualityScore: number;
  deskewAngleDeg: number;
  deskewApplied: boolean;
  regionCount: number;
  cropAssetCount: number;
  regionV2CropCount: number;
  averageRegionQuality: number;
  normalizedAssetHashes: string[];
}

export interface PreprocessingFixtureBenchmarkRun {
  fixtureId: string;
  category: string;
  fileName: string;
  fileHash?: string;
  page: number;
  mode: string | null;
  latencyMs?: number | null;
  passed: boolean;
  failures: string[];
  preprocessing: PreprocessingFixtureBenchmarkPreprocessingSummary | null;
}

export interface PreprocessingFixtureBenchmarkFixture {
  id: string;
  category: string;
  fileName: string;
  page: number;
}

export interface PreprocessingFixtureBenchmarkComparison {
  fixtureId: string;
  category: string;
  page: number;
  currentMode: string;
  baselineMode: string;
  qualityDelta: number;
  regionCountDelta: number;
  cropAssetDelta: number;
  regionV2CropDelta: number;
  regionQualityDelta: number;
  latencyDeltaMs: number | null;
}

export type PreprocessingFixtureBenchmarkLeakKind = 'absolute-path' | 'secret-like-value';

export interface PreprocessingFixtureBenchmarkPathSafetyLeak {
  location: string;
  kind: PreprocessingFixtureBenchmarkLeakKind;
  redactedValue: '<absolute-path>' | '<secret-like-value>';
}

export interface PreprocessingFixtureBenchmarkPathSafety {
  passed: boolean;
  leakCount: number;
  leaks: PreprocessingFixtureBenchmarkPathSafetyLeak[];
}

export interface PreprocessingFixtureBenchmarkSummary {
  fixtureCount: number;
  categoryCount: number;
  runCount: number;
  passedRuns: number;
  failedRuns: number;
  passed: boolean;
  modes: string[];
  comparisonCount: number;
  averageLatencyMs: number;
  regionV2AverageCropCount: number;
  regionV2AverageRegionQuality: number;
  pathLeakDetected: boolean;
}

export interface PreprocessingFixtureBenchmarkReport {
  kind: 'geotech-preprocessing-fixture-benchmark';
  schemaVersion: 1;
  generatedAt: string;
  modes: string[];
  summary: PreprocessingFixtureBenchmarkSummary;
  fixtures: PreprocessingFixtureBenchmarkFixture[];
  runs: PreprocessingFixtureBenchmarkRun[];
  comparisons: PreprocessingFixtureBenchmarkComparison[];
  pathSafety: PreprocessingFixtureBenchmarkPathSafety;
  contractValidation?: PreprocessingFixtureBenchmarkContractValidation;
}

export interface PreprocessingFixtureBenchmarkContractOptions {
  requiredModes?: string[];
  requiredCategories?: string[];
  requiredComparisonPairs?: ReadonlyArray<readonly [string, string]>;
  minRegionV2AverageRegionQuality?: number;
  minRegionV2CropCount?: number;
}

export interface PreprocessingFixtureBenchmarkContractValidation {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

export interface PreprocessingFixtureBenchmarkTrendContractValidation {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

export interface PreprocessingFixtureBenchmarkHistoryEntry {
  kind: 'geotech-preprocessing-fixture-history-entry';
  schemaVersion: 1;
  generatedAt: string;
  modes: string[];
  summary: {
    fixtureCount: number;
    categoryCount: number;
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    passed: boolean;
    averageLatencyMs: number;
    regionV2AverageCropCount: number;
    regionV2AverageRegionQuality: number;
    pathLeakCount: number;
  };
  runs: Array<{
    key: string;
    fixtureId: string;
    category: string;
    mode: string | null;
    passed: boolean;
    latencyMs: number | null;
    qualityScore: number;
    regionCount: number;
    cropAssetCount: number;
    regionV2CropCount: number;
    averageRegionQuality: number;
  }>;
}

export interface PreprocessingFixtureBenchmarkTrendReport {
  kind: 'geotech-preprocessing-fixture-trend';
  schemaVersion: 1;
  generatedAt: string;
  current: PreprocessingFixtureBenchmarkHistoryEntry;
  previous: PreprocessingFixtureBenchmarkHistoryEntry | null;
  delta: {
    fixtureCount: number;
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    averageLatencyMs: number;
    regionV2AverageCropCount: number;
    regionV2AverageRegionQuality: number;
    pathLeakCount: number;
  } | null;
  runDeltas: Array<{
    key: string;
    fixtureId: string;
    category: string;
    mode: string | null;
    status: 'new' | 'changed' | 'unchanged';
    passed: boolean;
    previousPassed: boolean | null;
    latencyDeltaMs: number | null;
    qualityDelta: number | null;
    regionCountDelta: number | null;
    cropAssetDelta: number | null;
    regionV2CropDelta: number | null;
    regionQualityDelta: number | null;
  }>;
  historyCount: number;
  note: string;
}

export function buildPreprocessingFixtureBenchmarkComparisons(
  runs: PreprocessingFixtureBenchmarkRun[],
  comparisonPairs: ReadonlyArray<readonly [string, string]> = DEFAULT_COMPARISON_PAIRS,
): PreprocessingFixtureBenchmarkComparison[] {
  const byFixture = new Map<string, PreprocessingFixtureBenchmarkRun[]>();
  for (const run of runs) {
    if (!run.mode) {
      continue;
    }
    const key = `${run.fixtureId}:${run.page}`;
    const list = byFixture.get(key) ?? [];
    list.push(run);
    byFixture.set(key, list);
  }

  const comparisons: PreprocessingFixtureBenchmarkComparison[] = [];
  for (const list of byFixture.values()) {
    for (const [currentMode, baselineMode] of comparisonPairs) {
      const current = list.find((run) => run.mode === currentMode);
      const baseline = list.find((run) => run.mode === baselineMode);
      if (!current || !baseline) {
        continue;
      }
      comparisons.push({
        fixtureId: current.fixtureId,
        category: current.category,
        page: current.page,
        currentMode,
        baselineMode,
        qualityDelta: round((current.preprocessing?.qualityScore ?? 0) - (baseline.preprocessing?.qualityScore ?? 0)),
        regionCountDelta: (current.preprocessing?.regionCount ?? 0) - (baseline.preprocessing?.regionCount ?? 0),
        cropAssetDelta: (current.preprocessing?.cropAssetCount ?? 0) - (baseline.preprocessing?.cropAssetCount ?? 0),
        regionV2CropDelta: (current.preprocessing?.regionV2CropCount ?? 0) - (baseline.preprocessing?.regionV2CropCount ?? 0),
        regionQualityDelta: round(
          (current.preprocessing?.averageRegionQuality ?? 0)
          - (baseline.preprocessing?.averageRegionQuality ?? 0),
        ),
        latencyDeltaMs: finiteOrNull(current.latencyMs) != null && finiteOrNull(baseline.latencyMs) != null
          ? Number(current.latencyMs) - Number(baseline.latencyMs)
          : null,
      });
    }
  }

  return comparisons.sort((left, right) =>
    `${left.fixtureId}:${left.currentMode}:${left.baselineMode}`
      .localeCompare(`${right.fixtureId}:${right.currentMode}:${right.baselineMode}`),
  );
}

export function buildPreprocessingFixtureBenchmarkSummary(
  runs: PreprocessingFixtureBenchmarkRun[],
  fixtures: PreprocessingFixtureBenchmarkFixture[],
  modes: string[],
  comparisons: PreprocessingFixtureBenchmarkComparison[] = [],
): PreprocessingFixtureBenchmarkSummary {
  const regionRuns = runs.filter((run) => run.mode === 'region-v2');
  const passedRuns = runs.filter((run) => run.passed).length;
  const runCount = runs.length;
  return {
    fixtureCount: fixtures.length,
    categoryCount: new Set(fixtures.map((fixture) => fixture.category)).size,
    runCount,
    passedRuns,
    failedRuns: runCount - passedRuns,
    passed: runCount > 0 && passedRuns === runCount,
    modes: [...modes],
    comparisonCount: comparisons.length,
    averageLatencyMs: round(average(runs.map((run) => finiteOrNull(run.latencyMs)).filter((value): value is number => value != null))),
    regionV2AverageCropCount: round(average(regionRuns.map((run) => run.preprocessing?.regionV2CropCount ?? 0))),
    regionV2AverageRegionQuality: round(average(regionRuns.map((run) => run.preprocessing?.averageRegionQuality ?? 0))),
    pathLeakDetected: false,
  };
}

export function validatePreprocessingFixtureBenchmarkReport(
  report: PreprocessingFixtureBenchmarkReport,
  options: PreprocessingFixtureBenchmarkContractOptions = {},
): PreprocessingFixtureBenchmarkContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const requiredModes = options.requiredModes ?? [...PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_MODES];
  const requiredCategories = options.requiredCategories ?? [...PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_CATEGORIES];
  const requiredComparisonPairs = options.requiredComparisonPairs ?? DEFAULT_COMPARISON_PAIRS;
  const minRegionQuality = options.minRegionV2AverageRegionQuality ?? 0.4;
  const minRegionCrops = options.minRegionV2CropCount ?? 1;

  if (report.kind !== 'geotech-preprocessing-fixture-benchmark') {
    failures.push('wrong_report_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_schema_version');
  }

  const fixtures = Array.isArray(report.fixtures) ? report.fixtures : [];
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const comparisons = Array.isArray(report.comparisons) ? report.comparisons : [];
  const modes = Array.isArray(report.modes) ? report.modes : [];
  const fixtureKeys = new Set(fixtures.map((fixture) => `${fixture.id}:${fixture.page}`));

  for (const mode of requiredModes) {
    if (!modes.includes(mode)) {
      failures.push(`missing_mode_${mode}`);
    }
  }

  const categories = new Set(fixtures.map((fixture) => fixture.category));
  for (const category of requiredCategories) {
    if (!categories.has(category)) {
      failures.push(`missing_category_${category}`);
    }
  }

  const passedRuns = runs.filter((run) => run.passed).length;
  if (report.summary.fixtureCount !== fixtures.length) {
    failures.push('summary_fixture_count_mismatch');
  }
  if (report.summary.categoryCount !== categories.size) {
    failures.push('summary_category_count_mismatch');
  }
  if (report.summary.runCount !== runs.length) {
    failures.push('summary_run_count_mismatch');
  }
  if (report.summary.passedRuns !== passedRuns) {
    failures.push('summary_passed_runs_mismatch');
  }
  if (report.summary.failedRuns !== runs.length - passedRuns) {
    failures.push('summary_failed_runs_mismatch');
  }
  if (report.summary.comparisonCount !== comparisons.length) {
    failures.push('summary_comparison_count_mismatch');
  }
  if (report.summary.passed && passedRuns !== runs.length) {
    failures.push('summary_passed_with_failed_runs');
  }

  const runByFixtureMode = new Map<string, PreprocessingFixtureBenchmarkRun>();
  for (const run of runs) {
    if (!fixtureKeys.has(`${run.fixtureId}:${run.page}`)) {
      failures.push(`run_without_fixture_${sanitizeFailureToken(run.fixtureId)}`);
    }
    if (!run.mode) {
      failures.push(`run_missing_mode_${sanitizeFailureToken(run.fixtureId)}`);
      continue;
    }
    runByFixtureMode.set(`${run.fixtureId}:${run.page}:${run.mode}`, run);
    if (run.mode === 'region-v2') {
      if ((run.preprocessing?.regionV2CropCount ?? 0) < minRegionCrops) {
        failures.push(`region_v2_crop_count_below_floor_${sanitizeFailureToken(run.fixtureId)}`);
      }
      if ((run.preprocessing?.cropAssetCount ?? 0) < minRegionCrops) {
        failures.push(`region_v2_asset_count_below_floor_${sanitizeFailureToken(run.fixtureId)}`);
      }
      if ((run.preprocessing?.averageRegionQuality ?? 0) < minRegionQuality) {
        failures.push(`region_v2_quality_below_floor_${sanitizeFailureToken(run.fixtureId)}`);
      }
      if (!run.preprocessing?.operations.includes('normalize-region-crop-assets')) {
        failures.push(`region_v2_missing_normalized_asset_operation_${sanitizeFailureToken(run.fixtureId)}`);
      }
      if (!run.preprocessing?.operations.includes('score-preprocessing-regions')) {
        failures.push(`region_v2_missing_region_scoring_operation_${sanitizeFailureToken(run.fixtureId)}`);
      }
    }
  }

  for (const fixture of fixtures) {
    for (const mode of requiredModes) {
      if (!runByFixtureMode.has(`${fixture.id}:${fixture.page}:${mode}`)) {
        failures.push(`missing_run_${sanitizeFailureToken(fixture.id)}_${sanitizeFailureToken(mode)}`);
      }
    }
    for (const [currentMode, baselineMode] of requiredComparisonPairs) {
      if (
        runByFixtureMode.has(`${fixture.id}:${fixture.page}:${currentMode}`)
        && runByFixtureMode.has(`${fixture.id}:${fixture.page}:${baselineMode}`)
        && !comparisons.some((comparison) =>
          comparison.fixtureId === fixture.id
          && comparison.page === fixture.page
          && comparison.currentMode === currentMode
          && comparison.baselineMode === baselineMode,
        )
      ) {
        failures.push(
          `missing_comparison_${sanitizeFailureToken(fixture.id)}_${sanitizeFailureToken(currentMode)}_vs_${sanitizeFailureToken(baselineMode)}`,
        );
      }
    }
  }

  const inspectedPathSafety = inspectPreprocessingFixtureBenchmarkPathSafety(report);
  if (!inspectedPathSafety.passed) {
    failures.push(...inspectedPathSafety.leaks.map((leak) =>
      `sensitive_value_leak_${sanitizeFailureToken(leak.location)}_${leak.kind}`,
    ));
  }
  if (!report.pathSafety?.passed) {
    failures.push('path_safety_failed');
  }
  if ((report.pathSafety?.leakCount ?? 0) !== (report.pathSafety?.leaks?.length ?? 0)) {
    failures.push('path_safety_count_mismatch');
  }
  if (report.summary.pathLeakDetected !== !Boolean(report.pathSafety?.passed)) {
    failures.push('summary_path_leak_flag_mismatch');
  }
  if (runs.length === 0) {
    warnings.push('report_has_no_runs');
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    warnings,
  };
}

export function inspectPreprocessingFixtureBenchmarkPathSafety(
  value: unknown,
): PreprocessingFixtureBenchmarkPathSafety {
  const leaks = deduplicatePathSafetyLeaks(collectPathSafetyLeaks(value));
  return {
    passed: leaks.length === 0,
    leakCount: leaks.length,
    leaks,
  };
}

export function redactPreprocessingFixtureBenchmarkArtifact<T>(value: T): T {
  return redactPreprocessingFixtureValue(value, new WeakMap()) as T;
}

export function buildPreprocessingFixtureBenchmarkTrend(
  report: PreprocessingFixtureBenchmarkReport,
  previousHistory: PreprocessingFixtureBenchmarkHistoryEntry[] = [],
  previousReport?: PreprocessingFixtureBenchmarkReport | null,
): { history: PreprocessingFixtureBenchmarkHistoryEntry[]; report: PreprocessingFixtureBenchmarkTrendReport } {
  const current = buildPreprocessingHistoryEntry(report);
  const previous = previousHistory.at(-1)
    ?? (previousReport ? buildPreprocessingHistoryEntry(previousReport) : null);
  const history = [...previousHistory, current].slice(-50);
  return {
    history,
    report: {
      kind: 'geotech-preprocessing-fixture-trend',
      schemaVersion: 1,
      generatedAt: current.generatedAt,
      current,
      previous,
      delta: previous ? buildPreprocessingTrendDelta(current, previous) : null,
      runDeltas: previous ? buildPreprocessingRunDeltas(current.runs, previous.runs) : [],
      historyCount: history.length,
      note: 'Local preprocessing trend output stores benchmark summaries only. Fixture bytes, private paths, and provider secrets are intentionally excluded.',
    },
  };
}

export function validatePreprocessingFixtureBenchmarkTrendContract(
  report: PreprocessingFixtureBenchmarkTrendReport,
  options: PreprocessingFixtureBenchmarkContractOptions = {},
): PreprocessingFixtureBenchmarkTrendContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];
  const requiredModes = options.requiredModes ?? [...PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_MODES];
  const requiredCategories = options.requiredCategories ?? [...PREPROCESSING_FIXTURE_BENCHMARK_REQUIRED_CATEGORIES];

  if (report.kind !== 'geotech-preprocessing-fixture-trend') {
    failures.push('wrong_trend_kind');
  }
  if (report.schemaVersion !== 1) {
    failures.push('wrong_trend_schema_version');
  }
  if (!report.generatedAt) {
    failures.push('trend_missing_generated_at');
  }
  if (!Number.isInteger(report.historyCount) || report.historyCount < 1) {
    failures.push('trend_history_count_invalid');
  }
  if (!/fixture bytes|private paths|provider secrets/i.test(report.note ?? '')) {
    warnings.push('trend_note_should_state_excluded_sensitive_inputs');
  }

  validatePreprocessingHistoryEntry(report.current, failures, 'current', {
    requiredModes,
    requiredCategories,
  });
  if (report.previous !== null) {
    validatePreprocessingHistoryEntry(report.previous, failures, 'previous');
  }
  if (report.previous && report.delta == null) {
    failures.push('trend_delta_required_when_previous_exists');
  }
  if (!report.previous && report.delta != null) {
    failures.push('trend_delta_must_be_null_without_previous');
  }
  const runDeltas = Array.isArray(report.runDeltas) ? report.runDeltas : [];
  const currentRuns = Array.isArray(report.current?.runs) ? report.current.runs : [];
  if (!Array.isArray(report.runDeltas)) {
    failures.push('trend_run_deltas_invalid');
  }
  if (report.previous && runDeltas.length !== currentRuns.length) {
    failures.push('trend_run_delta_count_mismatch');
  }
  if (!report.previous && runDeltas.length !== 0) {
    failures.push('trend_run_deltas_must_be_empty_without_previous');
  }

  if (report.delta) {
    for (const key of [
      'fixtureCount',
      'runCount',
      'passedRuns',
      'failedRuns',
      'averageLatencyMs',
      'regionV2AverageCropCount',
      'regionV2AverageRegionQuality',
      'pathLeakCount',
    ] as const) {
      if (!Number.isFinite(report.delta[key])) {
        failures.push(`trend_delta_${key}_invalid`);
      }
    }
  }
  for (const runDelta of runDeltas) {
    const label = sanitizeFailureToken(runDelta?.key ?? 'missing');
    if (!['new', 'changed', 'unchanged'].includes(runDelta?.status ?? '')) {
      failures.push(`trend_run_delta_${label}_status_invalid`);
    }
    if (runDelta.key !== preprocessingHistoryRunKey(runDelta)) {
      failures.push(`trend_run_delta_${label}_key_mismatch`);
    }
    for (const key of [
      'latencyDeltaMs',
      'qualityDelta',
      'regionCountDelta',
      'cropAssetDelta',
      'regionV2CropDelta',
      'regionQualityDelta',
    ] as const) {
      const value = runDelta[key];
      if (value != null && !Number.isFinite(value)) {
        failures.push(`trend_run_delta_${label}_${key}_invalid`);
      }
    }
  }

  const serialized = JSON.stringify(report);
  if (/"(?:fixtures|fileName|fileHash|normalizedAssetHashes|preprocessing|operations|sourcePath|fixturePath|assetPath|rawBytes|pageBytes|prompt|response|modelId|visionModelId)"\s*:/.test(serialized)) {
    failures.push('trend_contains_raw_fixture_preprocessing_prompt_response_or_model_payload');
  }
  if (/\.fixture\.pdf|[a-f0-9]{64}/i.test(serialized)) {
    failures.push('trend_contains_fixture_file_or_asset_hash');
  }
  const pathSafety = inspectPreprocessingFixtureBenchmarkPathSafety(report);
  if (!pathSafety.passed) {
    failures.push(...pathSafety.leaks.map((leak) =>
      `trend_sensitive_value_leak_${sanitizeFailureToken(leak.location)}_${leak.kind}`,
    ));
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

function validatePreprocessingHistoryEntry(
  entry: PreprocessingFixtureBenchmarkHistoryEntry | null | undefined,
  failures: string[],
  prefix: string,
  options: {
    requiredModes?: string[];
    requiredCategories?: string[];
  } = {},
): void {
  if (!entry || typeof entry !== 'object') {
    failures.push(`${prefix}_history_entry_missing`);
    return;
  }
  if (entry.kind !== 'geotech-preprocessing-fixture-history-entry') {
    failures.push(`${prefix}_history_wrong_kind`);
  }
  if (entry.schemaVersion !== 1) {
    failures.push(`${prefix}_history_wrong_schema_version`);
  }
  if (!entry.generatedAt) {
    failures.push(`${prefix}_history_missing_generated_at`);
  }
  if (!Array.isArray(entry.modes)) {
    failures.push(`${prefix}_history_modes_invalid`);
  } else {
    for (const mode of options.requiredModes ?? []) {
      if (!entry.modes.includes(mode)) {
        failures.push(`${prefix}_history_missing_mode_${sanitizeFailureToken(mode)}`);
      }
    }
  }

  const summary = entry.summary;
  const runs = Array.isArray(entry.runs) ? entry.runs : [];
  if (!summary || typeof summary !== 'object') {
    failures.push(`${prefix}_history_summary_missing`);
    return;
  }
  for (const key of [
    'fixtureCount',
    'categoryCount',
    'runCount',
    'passedRuns',
    'failedRuns',
    'pathLeakCount',
  ] as const) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  for (const key of ['averageLatencyMs', 'regionV2AverageCropCount', 'regionV2AverageRegionQuality'] as const) {
    if (!Number.isFinite(summary[key]) || summary[key] < 0) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  if (summary.runCount !== runs.length) {
    failures.push(`${prefix}_history_run_count_mismatch`);
  }
  if (summary.passedRuns !== runs.filter((run) => run.passed).length) {
    failures.push(`${prefix}_history_passed_runs_mismatch`);
  }
  if (summary.failedRuns !== runs.filter((run) => !run.passed).length) {
    failures.push(`${prefix}_history_failed_runs_mismatch`);
  }
  if (summary.runCount !== summary.passedRuns + summary.failedRuns) {
    failures.push(`${prefix}_history_summary_run_count_mismatch`);
  }
  if (summary.passed && (summary.runCount === 0 || summary.failedRuns > 0 || summary.pathLeakCount > 0)) {
    failures.push(`${prefix}_history_passed_flag_invalid`);
  }
  if (summary.pathLeakCount !== 0) {
    failures.push(`${prefix}_history_path_leaks_present`);
  }

  const categories = new Set(runs.map((run) => run.category));
  for (const category of options.requiredCategories ?? []) {
    if (!categories.has(category)) {
      failures.push(`${prefix}_history_missing_category_${sanitizeFailureToken(category)}`);
    }
  }

  for (const [index, run] of runs.entries()) {
    const label = sanitizeFailureToken(run?.key ?? `run_${index}`);
    if (run.key !== preprocessingHistoryRunKey(run)) {
      failures.push(`${prefix}_history_run_${label}_key_mismatch`);
    }
    for (const key of ['fixtureId', 'category'] as const) {
      if (typeof run[key] !== 'string' || !run[key].trim()) {
        failures.push(`${prefix}_history_run_${label}_${key}_missing`);
      }
    }
    if (run.mode != null && (typeof run.mode !== 'string' || !run.mode.trim())) {
      failures.push(`${prefix}_history_run_${label}_mode_invalid`);
    }
    if (run.latencyMs != null && (!Number.isFinite(run.latencyMs) || run.latencyMs < 0)) {
      failures.push(`${prefix}_history_run_${label}_latency_invalid`);
    }
    for (const key of [
      'qualityScore',
      'regionCount',
      'cropAssetCount',
      'regionV2CropCount',
      'averageRegionQuality',
    ] as const) {
      if (!Number.isFinite(run[key]) || run[key] < 0) {
        failures.push(`${prefix}_history_run_${label}_${key}_invalid`);
      }
    }
  }
}

function buildPreprocessingHistoryEntry(
  report: PreprocessingFixtureBenchmarkReport,
): PreprocessingFixtureBenchmarkHistoryEntry {
  return {
    kind: 'geotech-preprocessing-fixture-history-entry',
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    modes: [...report.modes],
    summary: {
      fixtureCount: report.summary.fixtureCount,
      categoryCount: report.summary.categoryCount,
      runCount: report.summary.runCount,
      passedRuns: report.summary.passedRuns,
      failedRuns: report.summary.failedRuns,
      passed: report.summary.passed,
      averageLatencyMs: report.summary.averageLatencyMs,
      regionV2AverageCropCount: report.summary.regionV2AverageCropCount,
      regionV2AverageRegionQuality: report.summary.regionV2AverageRegionQuality,
      pathLeakCount: report.pathSafety?.leakCount ?? (report.summary.pathLeakDetected ? 1 : 0),
    },
    runs: report.runs.map((run) => ({
      key: preprocessingRunKey(run),
      fixtureId: run.fixtureId,
      category: run.category,
      mode: run.mode,
      passed: run.passed,
      latencyMs: finiteOrNull(run.latencyMs),
      qualityScore: run.preprocessing?.qualityScore ?? 0,
      regionCount: run.preprocessing?.regionCount ?? 0,
      cropAssetCount: run.preprocessing?.cropAssetCount ?? 0,
      regionV2CropCount: run.preprocessing?.regionV2CropCount ?? 0,
      averageRegionQuality: run.preprocessing?.averageRegionQuality ?? 0,
    })),
  };
}

function buildPreprocessingTrendDelta(
  current: PreprocessingFixtureBenchmarkHistoryEntry,
  previous: PreprocessingFixtureBenchmarkHistoryEntry,
): NonNullable<PreprocessingFixtureBenchmarkTrendReport['delta']> {
  return {
    fixtureCount: current.summary.fixtureCount - previous.summary.fixtureCount,
    runCount: current.summary.runCount - previous.summary.runCount,
    passedRuns: current.summary.passedRuns - previous.summary.passedRuns,
    failedRuns: current.summary.failedRuns - previous.summary.failedRuns,
    averageLatencyMs: round(current.summary.averageLatencyMs - previous.summary.averageLatencyMs),
    regionV2AverageCropCount: round(
      current.summary.regionV2AverageCropCount - previous.summary.regionV2AverageCropCount,
    ),
    regionV2AverageRegionQuality: round(
      current.summary.regionV2AverageRegionQuality - previous.summary.regionV2AverageRegionQuality,
    ),
    pathLeakCount: current.summary.pathLeakCount - previous.summary.pathLeakCount,
  };
}

function buildPreprocessingRunDeltas(
  currentRuns: PreprocessingFixtureBenchmarkHistoryEntry['runs'],
  previousRuns: PreprocessingFixtureBenchmarkHistoryEntry['runs'],
): PreprocessingFixtureBenchmarkTrendReport['runDeltas'] {
  const previousByKey = new Map(previousRuns.map((run) => [run.key, run]));
  return currentRuns.map((current) => {
    const previous = previousByKey.get(current.key);
    const status: 'new' | 'changed' | 'unchanged' = previous
      ? (current.passed === previous.passed ? 'unchanged' : 'changed')
      : 'new';
    return {
      key: current.key,
      fixtureId: current.fixtureId,
      category: current.category,
      mode: current.mode,
      status,
      passed: current.passed,
      previousPassed: previous?.passed ?? null,
      latencyDeltaMs: previous && current.latencyMs != null && previous.latencyMs != null
        ? current.latencyMs - previous.latencyMs
        : null,
      qualityDelta: previous ? round(current.qualityScore - previous.qualityScore) : null,
      regionCountDelta: previous ? current.regionCount - previous.regionCount : null,
      cropAssetDelta: previous ? current.cropAssetCount - previous.cropAssetCount : null,
      regionV2CropDelta: previous ? current.regionV2CropCount - previous.regionV2CropCount : null,
      regionQualityDelta: previous ? round(current.averageRegionQuality - previous.averageRegionQuality) : null,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
}

function preprocessingRunKey(run: Pick<PreprocessingFixtureBenchmarkRun, 'fixtureId' | 'mode'>): string {
  return `${run.fixtureId}::${run.mode ?? 'missing'}`;
}

function preprocessingHistoryRunKey(run: Pick<PreprocessingFixtureBenchmarkHistoryEntry['runs'][number], 'fixtureId' | 'mode'>): string {
  return `${run.fixtureId}::${run.mode ?? 'missing'}`;
}

function collectPathSafetyLeaks(
  value: unknown,
  location = 'report',
): PreprocessingFixtureBenchmarkPathSafetyLeak[] {
  if (typeof value === 'string') {
    if (looksLikeAbsoluteLocalPath(value)) {
      return [{ location, kind: 'absolute-path', redactedValue: '<absolute-path>' }];
    }
    if (looksLikeSecretValue(value)) {
      return [{ location, kind: 'secret-like-value', redactedValue: '<secret-like-value>' }];
    }
    return [];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPathSafetyLeaks(item, `${location}_${index}`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectPathSafetyLeaks(child, `${location}_${sanitizeLocationKey(key)}`),
  );
}

function redactPreprocessingFixtureValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') {
    if (looksLikeAbsoluteLocalPath(value)) {
      return '<absolute-path>';
    }
    if (looksLikeSecretValue(value)) {
      return '<secret-like-value>';
    }
    return value;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const cached = seen.get(value);
  if (cached) {
    return cached;
  }
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(redactPreprocessingFixtureValue(item, seen));
    }
    return clone;
  }
  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value)) {
    clone[key] = redactPreprocessingFixtureValue(child, seen);
  }
  return clone;
}

function deduplicatePathSafetyLeaks(
  leaks: PreprocessingFixtureBenchmarkPathSafetyLeak[],
): PreprocessingFixtureBenchmarkPathSafetyLeak[] {
  const seen = new Set<string>();
  const unique: PreprocessingFixtureBenchmarkPathSafetyLeak[] = [];
  for (const leak of leaks) {
    const key = `${leak.kind}:${leak.location}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(leak);
  }
  return unique;
}

function looksLikeAbsoluteLocalPath(value: string): boolean {
  if (!value || /^(?:https?|s3|gs|file):\/\//i.test(value)) {
    return false;
  }
  return /^[a-zA-Z]:[\\/][^"'<>|]+/.test(value)
    || /^\\\\[^\\/\s]+[\\/][^\\/\s]+/.test(value)
    || /^\/(?:Users|home|private|tmp|var|mnt|Volumes|workspace|runner|project|repo)\//.test(value);
}

function looksLikeSecretValue(value: string): boolean {
  if (!value || /^GEOTECHCLI_|^OPENROUTER_|^OPENAI_|^ZHIPU_|^ANTHROPIC_|^HF_/i.test(value)) {
    return false;
  }
  return /\bsk-(?:or-v1|proj|ant|live|test)?-[A-Za-z0-9_-]{16,}\b/.test(value)
    || /\bgh[pousr]_[A-Za-z0-9_]{24,}\b/.test(value)
    || /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/i.test(value);
}

function sanitizeLocationKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$-]/g, '_');
}

function sanitizeFailureToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

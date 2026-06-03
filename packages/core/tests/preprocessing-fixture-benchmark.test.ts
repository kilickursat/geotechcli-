import { describe, expect, it } from 'vitest';

import {
  buildPreprocessingFixtureBenchmarkComparisons,
  buildPreprocessingFixtureBenchmarkSummary,
  buildPreprocessingFixtureBenchmarkTrend,
  inspectPreprocessingFixtureBenchmarkPathSafety,
  redactPreprocessingFixtureBenchmarkArtifact,
  validatePreprocessingFixtureBenchmarkReport,
  validatePreprocessingFixtureBenchmarkTrendContract,
  type PreprocessingFixtureBenchmarkFixture,
  type PreprocessingFixtureBenchmarkReport,
  type PreprocessingFixtureBenchmarkRun,
} from '../src/index.js';

const fixtures: PreprocessingFixtureBenchmarkFixture[] = [
  { id: 'borehole-table', category: 'borehole-log', fileName: 'region-v2-scanned-borehole-table.fixture.pdf', page: 1 },
  { id: 'cpt-table', category: 'cpt-table', fileName: 'preprocess-v2-cpt-table.fixture.pdf', page: 1 },
  { id: 'lab-table', category: 'lab-table', fileName: 'preprocess-v2-lab-table.fixture.pdf', page: 1 },
  { id: 'mixed-scanned', category: 'mixed-scanned-report', fileName: 'preprocess-v2-mixed-scanned-report.fixture.pdf', page: 1 },
  { id: 'mixed-digital-scanned', category: 'mixed-digital-scanned-pdf', fileName: 'preprocess-v2-mixed-digital-scanned.fixture.pdf', page: 2 },
  { id: 'malformed-scanned', category: 'malformed-scanned-pdf', fileName: 'preprocess-v2-malformed-scanned.fixture.pdf', page: 1 },
];

const modes = ['none', 'ocr-optimized', 'region-v2'];

describe('preprocessing fixture benchmark contract', () => {
  it('requires all fixture categories, preprocessing modes, mode comparisons, and path-safe trend output', () => {
    const report = buildValidReport();
    const validation = validatePreprocessingFixtureBenchmarkReport(report);
    const trend = buildPreprocessingFixtureBenchmarkTrend(report);
    const trendValidation = validatePreprocessingFixtureBenchmarkTrendContract(trend.report);
    const trendSerialized = JSON.stringify(trend.report);

    expect(validation).toMatchObject({
      ok: true,
      failures: [],
    });
    expect(trendValidation).toMatchObject({
      ok: true,
      failures: [],
    });
    expect(report.summary).toMatchObject({
      fixtureCount: 6,
      categoryCount: 6,
      runCount: 18,
      passedRuns: 18,
      failedRuns: 0,
      comparisonCount: 18,
      passed: true,
      pathLeakDetected: false,
    });
    expect(report.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fixtureId: 'cpt-table',
        currentMode: 'region-v2',
        baselineMode: 'ocr-optimized',
      }),
      expect.objectContaining({
        fixtureId: 'malformed-scanned',
        currentMode: 'region-v2',
        baselineMode: 'none',
      }),
    ]));
    expect(trend.report.kind).toBe('geotech-preprocessing-fixture-trend');
    expect(trend.report.historyCount).toBe(1);
    expect(trendSerialized).not.toContain('.fixture.pdf');
    expect(trendSerialized).not.toMatch(/[a-f0-9]{64}/);
    expect(inspectPreprocessingFixtureBenchmarkPathSafety(trend.report).passed).toBe(true);
  });

  it('fails closed and redacts when benchmark artifacts lose comparisons or leak paths/secrets', () => {
    const report = buildValidReport();
    report.fixtures[0]!.fileName = 'C:\\Users\\Databil\\private-fixtures\\site-report.pdf';
    report.runs[0]!.failures = ['provider token sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890 leaked'];
    report.runs.find((run) => run.fixtureId === 'cpt-table' && run.mode === 'region-v2')!.preprocessing!.regionV2CropCount = 0;
    report.comparisons = report.comparisons.filter((comparison) =>
      !(comparison.fixtureId === 'cpt-table'
        && comparison.currentMode === 'region-v2'
        && comparison.baselineMode === 'ocr-optimized'),
    );
    report.summary.comparisonCount = report.comparisons.length;
    report.pathSafety = inspectPreprocessingFixtureBenchmarkPathSafety(report);
    report.summary.pathLeakDetected = !report.pathSafety.passed;
    report.summary.passed = false;

    const validation = validatePreprocessingFixtureBenchmarkReport(report);
    const redacted = redactPreprocessingFixtureBenchmarkArtifact(report);
    const serialized = JSON.stringify(redacted);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toEqual(expect.arrayContaining([
      'region_v2_crop_count_below_floor_cpt-table',
      'missing_comparison_cpt-table_region-v2_vs_ocr-optimized',
      'path_safety_failed',
    ]));
    expect(validation.failures.some((failure) =>
      failure.startsWith('sensitive_value_leak_report_fixtures_0_fileName_absolute-path'),
    )).toBe(true);
    expect(validation.failures.some((failure) =>
      failure.startsWith('sensitive_value_leak_report_runs_0_failures_0_secret-like-value'),
    )).toBe(true);
    expect(serialized).not.toContain('C:\\Users\\Databil');
    expect(serialized).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    expect(serialized).toContain('<absolute-path>');
    expect(serialized).toContain('<secret-like-value>');
  });

  it('fails closed when preprocessing trend artifacts carry raw fixture fields, hashes, or paths', () => {
    const report = buildValidReport();
    const trend = buildPreprocessingFixtureBenchmarkTrend(report);
    const unsafe = JSON.parse(JSON.stringify(trend.report)) as typeof trend.report & {
      current: typeof trend.report.current & {
        runs: Array<typeof trend.report.current.runs[number] & {
          fileName?: string;
          fileHash?: string;
          assetPath?: string;
        }>;
      };
    };
    unsafe.current.runs[0]!.fileName = 'region-v2-scanned-borehole-table.fixture.pdf';
    unsafe.current.runs[0]!.fileHash = 'a'.repeat(64);
    unsafe.current.runs[0]!.assetPath = 'C:\\Users\\Databil\\private-fixtures\\crop.png';
    unsafe.current.summary.pathLeakCount = 1;

    const validation = validatePreprocessingFixtureBenchmarkTrendContract(unsafe);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toEqual(expect.arrayContaining([
      'trend_contains_raw_fixture_preprocessing_prompt_response_or_model_payload',
      'trend_contains_fixture_file_or_asset_hash',
      'current_history_path_leaks_present',
    ]));
    expect(validation.failures.some((failure) =>
      failure.startsWith('trend_sensitive_value_leak_report_current_runs_0_assetPath_absolute-path'),
    )).toBe(true);
  });
});

function buildValidReport(): PreprocessingFixtureBenchmarkReport {
  const reportFixtures = fixtures.map((fixture) => ({ ...fixture }));
  const runs = reportFixtures.flatMap((fixture) => modes.map((mode) => buildRun(fixture, mode)));
  const comparisons = buildPreprocessingFixtureBenchmarkComparisons(runs);
  const summary = buildPreprocessingFixtureBenchmarkSummary(runs, reportFixtures, modes, comparisons);
  const report: PreprocessingFixtureBenchmarkReport = {
    kind: 'geotech-preprocessing-fixture-benchmark',
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00.000Z',
    modes,
    summary,
    fixtures: reportFixtures,
    runs,
    comparisons,
    pathSafety: {
      passed: true,
      leakCount: 0,
      leaks: [],
    },
  };
  report.pathSafety = inspectPreprocessingFixtureBenchmarkPathSafety(report);
  return report;
}

function buildRun(
  fixture: PreprocessingFixtureBenchmarkFixture,
  mode: string,
): PreprocessingFixtureBenchmarkRun {
  const isRegionV2 = mode === 'region-v2';
  const isOcr = mode === 'ocr-optimized';
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    fileName: fixture.fileName,
    fileHash: 'a'.repeat(64),
    page: fixture.page,
    mode,
    latencyMs: isRegionV2 ? 300 : isOcr ? 200 : 100,
    passed: true,
    failures: [],
    preprocessing: {
      policy: mode,
      operations: isRegionV2
        ? ['detect-region-v2-table-panel', 'normalize-region-crop-assets', 'score-preprocessing-regions']
        : isOcr
          ? ['score-preprocessing-regions']
          : [],
      qualityScore: isRegionV2 ? 0.82 : isOcr ? 0.61 : 0,
      deskewAngleDeg: isRegionV2 ? 0.5 : 0,
      deskewApplied: isRegionV2,
      regionCount: isRegionV2 ? 2 : isOcr ? 1 : 0,
      cropAssetCount: isRegionV2 ? 2 : 0,
      regionV2CropCount: isRegionV2 ? 2 : 0,
      averageRegionQuality: isRegionV2 ? 0.8 : 0,
      normalizedAssetHashes: isRegionV2 ? ['b'.repeat(64), 'c'.repeat(64)] : [],
    },
  };
}

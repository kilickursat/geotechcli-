import type { GeotechDocumentBenchmark } from './geotech-document-benchmark.js';

export type GeotechBenchmarkCorpusFixtureCategory =
  | 'borehole-log'
  | 'full-geotechnical-report'
  | 'cpt-table'
  | 'lab-table'
  | 'monitoring-signal'
  | 'sensor-chart'
  | 'pile-load-test'
  | 'mixed-scanned-digital'
  | 'mixed-scanned-pdf'
  | 'malformed-scanned-pdf';

export interface GeotechBenchmarkCorpusFixtureExpectations {
  minSuccessfulPageRate?: number;
  maxFailedPages?: number;
  minCacheHitRate?: number;
  minTraceabilityRate?: number;
  minGroundModelReadinessScore?: number;
  minAverageQualityScore?: number;
  maxEstimatedHostedCalls?: number;
  maxParametersWithoutSourcePage?: number;
  requireFemExecutionBoundarySafe?: boolean;
  expectedBoreholeIds?: string[];
  requiredPreprocessingModes?: string[];
  requiredProviderProfiles?: string[];
  preprocessingModeExpectations?: Record<string, GeotechBenchmarkCorpusPreprocessingModeExpectation>;
  knownLimitations?: string[];
}

export interface GeotechBenchmarkCorpusPreprocessingModeExpectation {
  minSuccessfulPageRate?: number;
  maxFailedPages?: number;
  minCacheHitRate?: number;
  minTraceabilityRate?: number;
  minAverageQualityScore?: number;
  minAverageRegionQualityScore?: number;
  minPreprocessingRegions?: number;
  minPersistedRegionAssets?: number;
  maxEstimatedHostedCalls?: number;
  sameOrBetterTraceabilityThan?: string[];
}

export interface GeotechBenchmarkCorpusFixture {
  id: string;
  category: GeotechBenchmarkCorpusFixtureCategory;
  sourceType: 'synthetic' | 'local-private' | 'public-sample' | 'cached-benchmark';
  source?: string;
  description: string;
  expectations: GeotechBenchmarkCorpusFixtureExpectations;
}

export interface GeotechBenchmarkCorpusRunInput {
  fixture: GeotechBenchmarkCorpusFixture;
  benchmark: GeotechDocumentBenchmark;
  providerProfile?: string;
  preprocessingMode?: string;
}

export interface GeotechBenchmarkCorpusReportOptions {
  generatedAt?: string | Date;
  label?: string;
}

export interface GeotechBenchmarkCorpusRun {
  fixtureId: string;
  category: GeotechBenchmarkCorpusFixtureCategory;
  sourceType: GeotechBenchmarkCorpusFixture['sourceType'];
  providerProfile: string;
  preprocessingMode: string;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  successfulPageRate: number;
  documentConfidence: number;
  parseStatus: string;
  cacheHitRate: number;
  estimatedHostedCalls: number;
  directTraceabilityRate: number;
  parametersWithoutSourcePage: number;
  groundModelReadinessScore: number;
  groundModelReadinessStatus: string;
  preprocessingQualityScore: number;
  preprocessingRegionQualityScore: number;
  pagesDeskewed: number;
  preprocessingRegions: number;
  persistedRegionAssets: number;
  latencyMs: number | null;
  boreholeIds: string[];
  reviewGates: string[];
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export interface GeotechBenchmarkCorpusPreprocessingComparison {
  fixtureId: string;
  providerProfile: string;
  baselineMode: string;
  currentMode: string;
  traceabilityDelta: number;
  readinessDelta: number;
  qualityDelta: number;
  regionQualityDelta: number;
  hostedCallDelta: number;
  pagesDeskewedDelta: number;
  persistedRegionAssetsDelta: number;
}

export interface GeotechBenchmarkCorpusReport {
  kind: 'geotech-benchmark-corpus-report';
  schemaVersion: 1;
  generatedAt: string;
  label?: string;
  summary: {
    fixtureCount: number;
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    passed: boolean;
    categories: Record<string, number>;
    providerProfiles: string[];
    preprocessingModes: string[];
    averageConfidence: number;
    averageTraceabilityRate: number;
    averageGroundModelReadinessScore: number;
    averagePreprocessingQualityScore: number;
    totalEstimatedHostedCalls: number;
  };
  fixtures: GeotechBenchmarkCorpusFixture[];
  runs: GeotechBenchmarkCorpusRun[];
  preprocessingComparisons: GeotechBenchmarkCorpusPreprocessingComparison[];
  failures: string[];
  warnings: string[];
}

export function buildGeotechBenchmarkCorpusReport(
  inputs: GeotechBenchmarkCorpusRunInput[],
  options: GeotechBenchmarkCorpusReportOptions = {},
): GeotechBenchmarkCorpusReport {
  const fixtures = normalizeFixtures(inputs.map((input) => input.fixture));
  const runs = inputs.map((input) => buildCorpusRun(input));
  const fixtureFailures = validateFixtureCoverage(fixtures, runs);
  const failures = [
    ...runs.flatMap((run) => run.failures.map((failure) => `${run.fixtureId}/${run.providerProfile}/${run.preprocessingMode}: ${failure}`)),
    ...fixtureFailures,
  ];
  const warnings = [
    ...fixtures.flatMap((fixture) =>
      (fixture.expectations.knownLimitations ?? []).map((warning) => `${fixture.id}: ${warning}`),
    ),
    ...runs.flatMap((run) => run.warnings.map((warning) => `${run.fixtureId}/${run.providerProfile}/${run.preprocessingMode}: ${warning}`)),
  ];

  return {
    kind: 'geotech-benchmark-corpus-report',
    schemaVersion: 1,
    generatedAt: normalizeGeneratedAt(options.generatedAt),
    ...(options.label ? { label: options.label } : {}),
    summary: summarizeCorpus(fixtures, runs, failures),
    fixtures,
    runs,
    preprocessingComparisons: buildPreprocessingComparisons(runs),
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

export function renderGeotechBenchmarkCorpusSvg(report: GeotechBenchmarkCorpusReport): string {
  const width = 980;
  const rowHeight = 34;
  const headerHeight = 128;
  const height = headerHeight + Math.max(1, report.runs.length) * rowHeight + 86;
  const rows = report.runs.slice(0, 18).map((run, index) => {
    const y = headerHeight + index * rowHeight;
    const trace = Math.round(run.directTraceabilityRate * 100);
    const quality = Math.round(run.preprocessingQualityScore * 100);
    const statusColor = run.passed ? '#0f766e' : '#b91c1c';
    return [
      `<rect x="24" y="${y}" width="932" height="${rowHeight - 6}" rx="6" fill="${index % 2 === 0 ? '#f8fafc' : '#eef6f8'}" stroke="#dbe5ea"/>`,
      `<text x="42" y="${y + 20}" font-size="12" font-weight="700" fill="#0f172a">${escapeSvg(run.fixtureId)}</text>`,
      `<text x="270" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.category)}</text>`,
      `<text x="430" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.providerProfile)}</text>`,
      `<text x="585" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.preprocessingMode)}</text>`,
      `<text x="720" y="${y + 20}" font-size="12" fill="#0f172a">trace ${trace}% / quality ${quality}%</text>`,
      `<text x="910" y="${y + 20}" text-anchor="end" font-size="12" font-weight="700" fill="${statusColor}">${run.passed ? 'pass' : 'fail'}</text>`,
    ].join('');
  }).join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GeotechCLI geotechnical benchmark corpus summary">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<rect x="0" y="0" width="980" height="112" fill="#0f172a"/>',
    `<text x="32" y="42" font-size="24" font-weight="800" fill="#f8fafc">GeotechCLI Benchmark Corpus</text>`,
    `<text x="32" y="72" font-size="13" fill="#cbd5e1">${escapeSvg(report.label ?? 'internal R&D evidence benchmark')}</text>`,
    `<text x="948" y="42" text-anchor="end" font-size="24" font-weight="800" fill="${report.summary.passed ? '#5eead4' : '#fca5a5'}">${report.summary.passed ? 'PASS' : 'FAIL'}</text>`,
    `<text x="948" y="72" text-anchor="end" font-size="13" fill="#cbd5e1">${report.summary.passedRuns}/${report.summary.runCount} runs passed</text>`,
    `<text x="32" y="108" font-size="12" fill="#64748b">Fixtures ${report.summary.fixtureCount} | providers ${report.summary.providerProfiles.join(', ') || 'none'} | preprocessing ${report.summary.preprocessingModes.join(', ') || 'none'}</text>`,
    rows,
    `<text x="32" y="${height - 44}" font-size="12" fill="#475569">Average traceability ${Math.round(report.summary.averageTraceabilityRate * 100)}%, GroundModel readiness ${report.summary.averageGroundModelReadinessScore}/100, preprocessing quality ${Math.round(report.summary.averagePreprocessingQualityScore * 100)}%.</text>`,
    `<text x="32" y="${height - 22}" font-size="11" fill="#64748b">Generated ${escapeSvg(report.generatedAt)}. Internal strong-beta benchmark; not a production certification.</text>`,
    '</svg>',
  ].join('\n');
}

export function renderGeotechBenchmarkCorpusHtml(report: GeotechBenchmarkCorpusReport): string {
  const rows = report.runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.fixtureId)}</td>
      <td>${escapeHtml(run.category)}</td>
      <td>${escapeHtml(run.providerProfile)}</td>
      <td>${escapeHtml(run.preprocessingMode)}</td>
      <td>${Math.round(run.directTraceabilityRate * 100)}%</td>
      <td>${run.groundModelReadinessScore}</td>
      <td>${Math.round(run.preprocessingQualityScore * 100)}%</td>
      <td>${escapeHtml(formatReviewGates(run.reviewGates))}</td>
      <td>${Math.round(run.successfulPageRate * 100)}%</td>
      <td>${run.estimatedHostedCalls}</td>
      <td class="${run.passed ? 'pass' : 'fail'}">${run.passed ? 'pass' : 'fail'}</td>
    </tr>`).join('');
  const comparisons = report.preprocessingComparisons.map((comparison) => `
    <tr>
      <td>${escapeHtml(comparison.fixtureId)}</td>
      <td>${escapeHtml(comparison.providerProfile)}</td>
      <td>${escapeHtml(comparison.baselineMode)} to ${escapeHtml(comparison.currentMode)}</td>
      <td>${signedPercent(comparison.qualityDelta)}</td>
      <td>${signedPercent(comparison.regionQualityDelta)}</td>
      <td>${signedPercent(comparison.traceabilityDelta)}</td>
      <td>${comparison.pagesDeskewedDelta}</td>
      <td>${comparison.persistedRegionAssetsDelta}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeotechCLI Benchmark Corpus</title>
<style>
body{margin:0;font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a}
main{max-width:1120px;margin:0 auto;padding:32px 20px 56px}
h1{margin:0 0 8px;font-size:30px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:22px 0}
.metric{background:white;border:1px solid #dbe5ea;border-radius:8px;padding:14px}
.metric strong{display:block;font-size:24px}
table{width:100%;border-collapse:collapse;background:white;border:1px solid #dbe5ea;border-radius:8px;overflow:hidden;margin:16px 0 30px}
th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:13px}
th{background:#0f172a;color:#f8fafc}
.pass{color:#0f766e;font-weight:700}.fail{color:#b91c1c;font-weight:700}
.note{color:#475569;font-size:13px}
</style>
</head>
<body>
<main>
<h1>GeotechCLI Benchmark Corpus</h1>
<p class="note">${escapeHtml(report.label ?? 'Internal R&D evidence benchmark')} generated ${escapeHtml(report.generatedAt)}. Review-gated strong-beta evidence, not production certification.</p>
<section class="summary">
  <div class="metric"><span>Status</span><strong class="${report.summary.passed ? 'pass' : 'fail'}">${report.summary.passed ? 'PASS' : 'FAIL'}</strong></div>
  <div class="metric"><span>Runs</span><strong>${report.summary.passedRuns}/${report.summary.runCount}</strong></div>
  <div class="metric"><span>Traceability</span><strong>${Math.round(report.summary.averageTraceabilityRate * 100)}%</strong></div>
  <div class="metric"><span>Preprocessing Quality</span><strong>${Math.round(report.summary.averagePreprocessingQualityScore * 100)}%</strong></div>
</section>
<h2>Runs</h2>
<table><thead><tr><th>Fixture</th><th>Category</th><th>Provider</th><th>Preprocessing</th><th>Trace</th><th>GM score</th><th>Quality</th><th>Review gates</th><th>Pages</th><th>Calls</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Preprocessing Comparisons</h2>
<table><thead><tr><th>Fixture</th><th>Provider</th><th>Modes</th><th>Quality delta</th><th>Region quality delta</th><th>Trace delta</th><th>Deskew delta</th><th>Crop Asset delta</th></tr></thead><tbody>${comparisons || '<tr><td colspan="8">No paired preprocessing-mode comparisons available.</td></tr>'}</tbody></table>
${report.failures.length ? `<h2>Failures</h2><ul>${report.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('')}</ul>` : ''}
${report.warnings.length ? `<h2>Warnings</h2><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</main>
</body>
</html>
`;
}

function buildCorpusRun(input: GeotechBenchmarkCorpusRunInput): GeotechBenchmarkCorpusRun {
  const benchmark = input.benchmark;
  const providerProfile = input.providerProfile
    ?? benchmark.provider?.profile
    ?? benchmark.provider?.provider
    ?? 'unknown';
  const preprocessingMode = input.preprocessingMode
    ?? benchmark.preprocessing?.modes?.[0]
    ?? 'unknown';
  const estimatedHostedCalls = totalHostedCalls(benchmark);
  const latencyMs = benchmark.latency?.totalKnownLatencyMs ?? benchmark.job?.durationMs ?? null;
  const run: Omit<GeotechBenchmarkCorpusRun, 'passed' | 'failures' | 'warnings'> = {
    fixtureId: input.fixture.id,
    category: input.fixture.category,
    sourceType: input.fixture.sourceType,
    providerProfile,
    preprocessingMode,
    totalPages: finiteNumber(benchmark.source?.totalPages),
    successfulPages: finiteNumber(benchmark.source?.successfulPages),
    failedPages: finiteNumber(benchmark.source?.failedPages),
    successfulPageRate: successfulPageRate(benchmark),
    documentConfidence: finiteNumber(benchmark.document?.confidence),
    parseStatus: benchmark.document?.parseStatus ?? 'unknown',
    cacheHitRate: finiteNumber(benchmark.evidenceCache?.hitRate),
    estimatedHostedCalls,
    directTraceabilityRate: finiteNumber(benchmark.traceability?.directParameterTraceabilityRate),
    parametersWithoutSourcePage: finiteNumber(benchmark.traceability?.parametersWithoutSourcePage),
    groundModelReadinessScore: finiteNumber(benchmark.groundModelReadiness?.score),
    groundModelReadinessStatus: benchmark.groundModelReadiness?.status ?? 'unknown',
    preprocessingQualityScore: finiteNumber(benchmark.preprocessing?.averageQualityScore),
    preprocessingRegionQualityScore: finiteNumber(benchmark.preprocessing?.averageRegionQualityScore),
    pagesDeskewed: finiteNumber(benchmark.preprocessing?.pagesDeskewed),
    preprocessingRegions: finiteNumber(benchmark.preprocessing?.preprocessingRegions),
    persistedRegionAssets: finiteNumber(benchmark.preprocessing?.persistedRegionAssets),
    latencyMs,
    boreholeIds: Array.isArray(benchmark.groundModelReadiness?.boreholeIds)
      ? benchmark.groundModelReadiness.boreholeIds
      : [],
    reviewGates: collectReviewGates(benchmark),
  };
  const failures = [
    ...validateRunExpectations(input.fixture, run),
    ...(input.fixture.expectations.requireFemExecutionBoundarySafe
      ? validateFemExecutionBoundary(benchmark)
      : []),
  ];
  const warnings = buildRunWarnings(input.fixture, run);
  return {
    ...run,
    passed: failures.length === 0,
    failures,
    warnings,
  };
}

function validateRunExpectations(
  fixture: GeotechBenchmarkCorpusFixture,
  run: Omit<GeotechBenchmarkCorpusRun, 'passed' | 'failures' | 'warnings'>,
): string[] {
  const expected = fixture.expectations;
  const modeExpected = expected.preprocessingModeExpectations?.[run.preprocessingMode];
  return [
    expected.minSuccessfulPageRate != null && run.successfulPageRate < expected.minSuccessfulPageRate
      ? `successful page rate ${formatRatio(run.successfulPageRate)} below ${formatRatio(expected.minSuccessfulPageRate)}`
      : null,
    expected.maxFailedPages != null && run.failedPages > expected.maxFailedPages
      ? `failed pages ${run.failedPages} above ${expected.maxFailedPages}`
      : null,
    expected.minCacheHitRate != null && run.cacheHitRate < expected.minCacheHitRate
      ? `cache hit rate ${formatRatio(run.cacheHitRate)} below ${formatRatio(expected.minCacheHitRate)}`
      : null,
    expected.minTraceabilityRate != null && run.directTraceabilityRate < expected.minTraceabilityRate
      ? `traceability ${formatRatio(run.directTraceabilityRate)} below ${formatRatio(expected.minTraceabilityRate)}`
      : null,
    expected.minGroundModelReadinessScore != null && run.groundModelReadinessScore < expected.minGroundModelReadinessScore
      ? `GroundModel readiness ${run.groundModelReadinessScore} below ${expected.minGroundModelReadinessScore}`
      : null,
    expected.minAverageQualityScore != null && run.preprocessingQualityScore < expected.minAverageQualityScore
      ? `preprocessing quality ${formatRatio(run.preprocessingQualityScore)} below ${formatRatio(expected.minAverageQualityScore)}`
      : null,
    expected.maxEstimatedHostedCalls != null && run.estimatedHostedCalls > expected.maxEstimatedHostedCalls
      ? `estimated hosted calls ${run.estimatedHostedCalls} above ${expected.maxEstimatedHostedCalls}`
      : null,
    expected.maxParametersWithoutSourcePage != null && run.parametersWithoutSourcePage > expected.maxParametersWithoutSourcePage
      ? `parameters without source page ${run.parametersWithoutSourcePage} above ${expected.maxParametersWithoutSourcePage}`
      : null,
    ...(expected.expectedBoreholeIds ?? []).flatMap((id) =>
      run.boreholeIds.includes(id) ? [] : [`expected borehole ${id} missing`],
    ),
    ...validatePreprocessingModeExpectations(run.preprocessingMode, run, modeExpected),
  ].filter((value): value is string => value != null);
}

function validatePreprocessingModeExpectations(
  mode: string,
  run: Omit<GeotechBenchmarkCorpusRun, 'passed' | 'failures' | 'warnings'>,
  expected: GeotechBenchmarkCorpusPreprocessingModeExpectation | undefined,
): string[] {
  if (!expected) {
    return [];
  }
  return [
    expected.minSuccessfulPageRate != null && run.successfulPageRate < expected.minSuccessfulPageRate
      ? `${mode} successful page rate ${formatRatio(run.successfulPageRate)} below ${formatRatio(expected.minSuccessfulPageRate)}`
      : null,
    expected.maxFailedPages != null && run.failedPages > expected.maxFailedPages
      ? `${mode} failed pages ${run.failedPages} above ${expected.maxFailedPages}`
      : null,
    expected.minCacheHitRate != null && run.cacheHitRate < expected.minCacheHitRate
      ? `${mode} cache hit rate ${formatRatio(run.cacheHitRate)} below ${formatRatio(expected.minCacheHitRate)}`
      : null,
    expected.minTraceabilityRate != null && run.directTraceabilityRate < expected.minTraceabilityRate
      ? `${mode} traceability ${formatRatio(run.directTraceabilityRate)} below ${formatRatio(expected.minTraceabilityRate)}`
      : null,
    expected.minAverageQualityScore != null && run.preprocessingQualityScore < expected.minAverageQualityScore
      ? `${mode} preprocessing quality ${formatRatio(run.preprocessingQualityScore)} below ${formatRatio(expected.minAverageQualityScore)}`
      : null,
    expected.minAverageRegionQualityScore != null && run.preprocessingRegionQualityScore < expected.minAverageRegionQualityScore
      ? `${mode} region quality ${formatRatio(run.preprocessingRegionQualityScore)} below ${formatRatio(expected.minAverageRegionQualityScore)}`
      : null,
    expected.minPreprocessingRegions != null && run.preprocessingRegions < expected.minPreprocessingRegions
      ? `${mode} preprocessing regions ${run.preprocessingRegions} below ${expected.minPreprocessingRegions}`
      : null,
    expected.minPersistedRegionAssets != null && run.persistedRegionAssets < expected.minPersistedRegionAssets
      ? `${mode} persisted region assets ${run.persistedRegionAssets} below ${expected.minPersistedRegionAssets}`
      : null,
    expected.maxEstimatedHostedCalls != null && run.estimatedHostedCalls > expected.maxEstimatedHostedCalls
      ? `${mode} estimated hosted calls ${run.estimatedHostedCalls} above ${expected.maxEstimatedHostedCalls}`
      : null,
  ].filter((value): value is string => value != null);
}

function validateFixtureCoverage(
  fixtures: GeotechBenchmarkCorpusFixture[],
  runs: GeotechBenchmarkCorpusRun[],
): string[] {
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const fixtureRuns = runs.filter((run) => run.fixtureId === fixture.id);
    for (const mode of fixture.expectations.requiredPreprocessingModes ?? []) {
      if (!fixtureRuns.some((run) => run.preprocessingMode === mode)) {
        failures.push(`${fixture.id}: missing preprocessing mode ${mode}`);
      }
    }
    for (const profile of fixture.expectations.requiredProviderProfiles ?? []) {
      if (!fixtureRuns.some((run) => run.providerProfile === profile)) {
        failures.push(`${fixture.id}: missing provider profile ${profile}`);
      }
    }
    const modeExpectations = fixture.expectations.preprocessingModeExpectations ?? {};
    const providerProfiles = uniqueSorted(fixtureRuns.map((run) => run.providerProfile));
    for (const [mode, expectation] of Object.entries(modeExpectations)) {
      for (const providerProfile of providerProfiles) {
        const providerRuns = fixtureRuns.filter((run) => run.providerProfile === providerProfile);
        const current = providerRuns.find((run) => run.preprocessingMode === mode);
        for (const baselineMode of expectation.sameOrBetterTraceabilityThan ?? []) {
          const baseline = providerRuns.find((run) => run.preprocessingMode === baselineMode);
          if (!current) {
            failures.push(`${fixture.id}/${providerProfile}: missing ${mode} run for traceability regression check`);
            continue;
          }
          if (!baseline) {
            failures.push(`${fixture.id}/${providerProfile}: missing ${baselineMode} baseline for ${mode} traceability regression check`);
            continue;
          }
          if (current.directTraceabilityRate < baseline.directTraceabilityRate) {
            failures.push(
              `${fixture.id}/${providerProfile}: ${mode} traceability ${formatRatio(current.directTraceabilityRate)} regressed below ${baselineMode} ${formatRatio(baseline.directTraceabilityRate)}`,
            );
          }
        }
      }
    }
  }
  return failures;
}

function validateFemExecutionBoundary(benchmark: GeotechDocumentBenchmark): string[] {
  const fem = benchmark.femDraftReadiness;
  if (!fem) {
    return ['FEM draft readiness block missing from benchmark output'];
  }
  const agentRunAllowedRoutes = fem.agentRunAllowedRoutes ?? [];
  const agentWebglAllowedRoutes = fem.agentWebglAllowedRoutes ?? [];
  const agentResultManifestAllowedRoutes = fem.agentResultManifestAllowedRoutes ?? [];
  const caseOutputAvailableRoutes = fem.caseOutputAvailableRoutes ?? [];
  const humanRunCommandAvailableRoutes = fem.humanRunCommandAvailableRoutes ?? [];
  const staleRunCommandRoutes = fem.staleRunCommandRoutes ?? [];
  const failures = [
    fem.canAutoProceed
      ? 'FEM draft readiness became auto-proceedable'
      : null,
    agentRunAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent-run routes: ${routeList(agentRunAllowedRoutes)}`
      : null,
    agentWebglAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent WebGL routes: ${routeList(agentWebglAllowedRoutes)}`
      : null,
    agentResultManifestAllowedRoutes.length > 0
      ? `FEM benchmark exposed agent result-manifest routes: ${routeList(agentResultManifestAllowedRoutes)}`
      : null,
    caseOutputAvailableRoutes.length > 0
      ? `FEM benchmark exposed unreviewed case-output routes: ${routeList(caseOutputAvailableRoutes)}`
      : null,
    humanRunCommandAvailableRoutes.length > 0
      ? `FEM benchmark exposed unreviewed human-run routes: ${routeList(humanRunCommandAvailableRoutes)}`
      : null,
    staleRunCommandRoutes.length > 0
      ? `FEM benchmark recommended stale run commands: ${routeList(staleRunCommandRoutes)}`
      : null,
  ];

  for (const route of fem.routes ?? []) {
    const boundary = route.executionBoundary;
    if (!boundary) {
      failures.push(`FEM route ${route.objective} has no execution boundary`);
      continue;
    }
    failures.push(
      route.agentRunAllowed || boundary.agentRunAllowed
        ? `FEM route ${route.objective} exposed agent solver execution`
        : null,
      boundary.agentWebglRenderAllowed
        ? `FEM route ${route.objective} exposed agent WebGL rendering`
        : null,
      boundary.agentResultManifestAllowed
        ? `FEM route ${route.objective} exposed agent result-manifest creation`
        : null,
      boundary.caseOutputAvailable
        ? `FEM route ${route.objective} exposed unreviewed case output`
        : null,
      boundary.humanRunCommandAvailable
        ? `FEM route ${route.objective} exposed an unreviewed human run command`
        : null,
      !boundary.humanReviewRequired
        ? `FEM route ${route.objective} no longer requires human review`
        : null,
      /\bfem run\b/i.test(route.recommendedCommand ?? '')
        ? `FEM route ${route.objective} recommended a run command instead of a draft command`
        : null,
    );
  }

  return [...new Set(failures.filter((value): value is string => value != null))];
}

function buildRunWarnings(
  fixture: GeotechBenchmarkCorpusFixture,
  run: Omit<GeotechBenchmarkCorpusRun, 'passed' | 'failures' | 'warnings'>,
): string[] {
  return [
    run.preprocessingMode === 'unknown' ? 'preprocessing mode unavailable' : null,
    run.providerProfile === 'unknown' ? 'provider profile unavailable' : null,
    run.sourceType === 'synthetic' ? 'synthetic benchmark fixture; use for guardrail logic, not production accuracy claims' : null,
    fixture.sourceType === 'local-private' ? 'local private fixture; do not commit source report bytes' : null,
  ].filter((value): value is string => value != null);
}

function collectReviewGates(benchmark: GeotechDocumentBenchmark): string[] {
  return uniqueSorted([
    ...(Array.isArray(benchmark.document?.confidenceBreakdown?.reviewGates)
      ? benchmark.document.confidenceBreakdown.reviewGates
      : []),
    ...(Array.isArray(benchmark.provider?.reviewGates)
      ? benchmark.provider.reviewGates
      : []),
  ]);
}

function buildPreprocessingComparisons(
  runs: GeotechBenchmarkCorpusRun[],
): GeotechBenchmarkCorpusPreprocessingComparison[] {
  const grouped = new Map<string, GeotechBenchmarkCorpusRun[]>();
  for (const run of runs) {
    const key = `${run.fixtureId}::${run.providerProfile}`;
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
  }
  const comparisons: GeotechBenchmarkCorpusPreprocessingComparison[] = [];
  for (const group of grouped.values()) {
    const baseline = group.find((run) => run.preprocessingMode === 'none') ?? group[0];
    if (!baseline) {
      continue;
    }
    const candidates = group
      .filter((run) => run.preprocessingMode !== baseline.preprocessingMode)
      .sort((left, right) => preprocessingModeRank(left.preprocessingMode) - preprocessingModeRank(right.preprocessingMode));
    for (const current of candidates) {
      comparisons.push({
        fixtureId: current.fixtureId,
        providerProfile: current.providerProfile,
        baselineMode: baseline.preprocessingMode,
        currentMode: current.preprocessingMode,
        traceabilityDelta: roundRatio(current.directTraceabilityRate - baseline.directTraceabilityRate),
        readinessDelta: current.groundModelReadinessScore - baseline.groundModelReadinessScore,
        qualityDelta: roundRatio(current.preprocessingQualityScore - baseline.preprocessingQualityScore),
        regionQualityDelta: roundRatio(current.preprocessingRegionQualityScore - baseline.preprocessingRegionQualityScore),
        hostedCallDelta: current.estimatedHostedCalls - baseline.estimatedHostedCalls,
        pagesDeskewedDelta: current.pagesDeskewed - baseline.pagesDeskewed,
        persistedRegionAssetsDelta: current.persistedRegionAssets - baseline.persistedRegionAssets,
      });
    }
  }
  return comparisons.sort((left, right) =>
    left.fixtureId.localeCompare(right.fixtureId)
    || left.providerProfile.localeCompare(right.providerProfile)
    || preprocessingModeRank(left.currentMode) - preprocessingModeRank(right.currentMode),
  );
}

function preprocessingModeRank(mode: string): number {
  if (mode === 'none') return 0;
  if (mode === 'ocr-optimized') return 1;
  if (mode === 'region-v2') return 2;
  return 10;
}

function summarizeCorpus(
  fixtures: GeotechBenchmarkCorpusFixture[],
  runs: GeotechBenchmarkCorpusRun[],
  failures: string[],
): GeotechBenchmarkCorpusReport['summary'] {
  return {
    fixtureCount: fixtures.length,
    runCount: runs.length,
    passedRuns: runs.filter((run) => run.passed).length,
    failedRuns: runs.filter((run) => !run.passed).length,
    passed: failures.length === 0,
    categories: countBy(fixtures.map((fixture) => fixture.category)),
    providerProfiles: uniqueSorted(runs.map((run) => run.providerProfile)),
    preprocessingModes: uniqueSorted(runs.map((run) => run.preprocessingMode)),
    averageConfidence: average(runs.map((run) => run.documentConfidence)),
    averageTraceabilityRate: average(runs.map((run) => run.directTraceabilityRate)),
    averageGroundModelReadinessScore: Math.round(average(runs.map((run) => run.groundModelReadinessScore))),
    averagePreprocessingQualityScore: average(runs.map((run) => run.preprocessingQualityScore)),
    totalEstimatedHostedCalls: runs.reduce((sum, run) => sum + run.estimatedHostedCalls, 0),
  };
}

function normalizeFixtures(fixtures: GeotechBenchmarkCorpusFixture[]): GeotechBenchmarkCorpusFixture[] {
  const lookup = new Map<string, GeotechBenchmarkCorpusFixture>();
  for (const fixture of fixtures) {
    lookup.set(fixture.id, {
      ...fixture,
      expectations: {
        ...fixture.expectations,
        knownLimitations: [...new Set(fixture.expectations.knownLimitations ?? [])],
      },
    });
  }
  return [...lookup.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function totalHostedCalls(benchmark: GeotechDocumentBenchmark): number {
  return finiteNumber(benchmark.hostedCallEstimate?.pageExtraction)
    + finiteNumber(benchmark.hostedCallEstimate?.layoutOcr)
    + finiteNumber(benchmark.hostedCallEstimate?.vision);
}

function successfulPageRate(benchmark: GeotechDocumentBenchmark): number {
  const totalPages = finiteNumber(benchmark.source?.totalPages);
  const successfulPages = finiteNumber(benchmark.source?.successfulPages);
  return totalPages > 0 ? roundRatio(successfulPages / totalPages) : 0;
}

function routeList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : 'none';
}

function formatReviewGates(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length > 0 ? roundRatio(finite.reduce((sum, value) => sum + value, 0) / finite.length) : 0;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeGeneratedAt(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' && value.trim() ? value.trim() : new Date().toISOString();
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value * 100)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeSvg(value: string): string {
  return escapeHtml(value).replaceAll("'", '&apos;');
}

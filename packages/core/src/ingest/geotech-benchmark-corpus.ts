import {
  collectFemDraftReadinessGuardrailFailures,
  type GeotechDocumentBenchmark,
} from './geotech-document-benchmark.js';

export type GeotechBenchmarkCorpusFixtureCategory =
  | 'borehole-log'
  | 'full-geotechnical-report'
  | 'cpt-table'
  | 'lab-table'
  | 'monitoring-signal'
  | 'sensor-chart'
  | 'pile-load-test'
  | 'mixed-scanned-digital'
  | 'mixed-digital-scanned-pdf'
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

export type GeotechBenchmarkCorpusEvidenceInput =
  | 'image-or-layout-evidence'
  | 'preprocessed-page-evidence'
  | 'native-pdf'
  | 'unknown';

export interface GeotechBenchmarkCorpusProviderProfileSummary {
  id: string;
  provider: string;
  modelId: string | null;
  visionModelId: string | null;
  evidenceInput: GeotechBenchmarkCorpusEvidenceInput;
  imageInputsAllowed: boolean;
  nativePdfAllowed: boolean;
  layoutOcrAllowed: boolean;
  requiresPreprocessedEvidence: boolean;
  likelyFreeRoute: boolean;
  contextStrategy: string;
  reviewGates: string[];
}

export interface GeotechBenchmarkCorpusConfidenceSummary {
  overall: number;
  extractionConfidence: number;
  engineeringCompleteness: number;
  traceabilityScore: number;
  corroborationScore: number;
  readinessScore: number;
  pageEvidenceConfidence: number;
  methodCoverage: {
    nativeTextPages: number;
    layoutOcrPages: number;
    visualReasoningPages: number;
    directVisualPages: number;
  };
  missingCriticalData: string[];
  reviewGates: string[];
}

export type GeotechBenchmarkCorpusPathSafetyLeakKind =
  | 'absolute-path'
  | 'secret-like-value';

export interface GeotechBenchmarkCorpusPathSafetyLeak {
  kind: GeotechBenchmarkCorpusPathSafetyLeakKind;
  source: 'fixture' | 'benchmark';
  location: string;
  redactedValue: '<absolute-path>' | '<secret-like-value>';
}

export interface GeotechBenchmarkCorpusPathSafety {
  passed: boolean;
  checkedStringFields: number;
  leakCount: number;
  leaks: GeotechBenchmarkCorpusPathSafetyLeak[];
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
  providerBenchmarkProfile: GeotechBenchmarkCorpusProviderProfileSummary;
  preprocessingMode: string;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  successfulPageRate: number;
  documentConfidence: number;
  confidenceBreakdown: GeotechBenchmarkCorpusConfidenceSummary;
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
    averageConfidenceBreakdown: Omit<
      GeotechBenchmarkCorpusConfidenceSummary,
      'methodCoverage' | 'missingCriticalData' | 'reviewGates'
    >;
    averageTraceabilityRate: number;
    averageGroundModelReadinessScore: number;
    averagePreprocessingQualityScore: number;
    totalEstimatedHostedCalls: number;
  };
  fixtures: GeotechBenchmarkCorpusFixture[];
  runs: GeotechBenchmarkCorpusRun[];
  preprocessingComparisons: GeotechBenchmarkCorpusPreprocessingComparison[];
  pathSafety: GeotechBenchmarkCorpusPathSafety;
  failures: string[];
  warnings: string[];
}

export interface GeotechBenchmarkCorpusArtifactSafetyLeak {
  kind: GeotechBenchmarkCorpusPathSafetyLeakKind;
  location: string;
  redactedValue: '<absolute-path>' | '<secret-like-value>';
}

export interface GeotechBenchmarkCorpusArtifactSafety {
  ok: boolean;
  leakCount: number;
  leaks: GeotechBenchmarkCorpusArtifactSafetyLeak[];
}

export interface GeotechBenchmarkCorpusHistoryConfidenceSummary {
  overall: number;
  extractionConfidence: number;
  engineeringCompleteness: number;
  traceabilityScore: number;
  corroborationScore: number;
  readinessScore: number;
  pageEvidenceConfidence: number;
}

export interface GeotechBenchmarkCorpusHistoryEntry {
  kind: 'geotech-benchmark-corpus-history-entry';
  schemaVersion: 1;
  generatedAt: string;
  mode: string;
  skippedFixtureCount: number;
  providerProfiles: string[];
  preprocessingModes: string[];
  summary: {
    fixtureCount: number;
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    passed: boolean;
    averageConfidence: number;
    averageConfidenceBreakdown: GeotechBenchmarkCorpusHistoryConfidenceSummary;
    averageTraceabilityRate: number;
    averageGroundModelReadinessScore: number;
    averagePreprocessingQualityScore: number;
    totalEstimatedHostedCalls: number;
    pathLeakCount: number;
  };
  runs: Array<{
    key: string;
    fixtureId: string;
    category: GeotechBenchmarkCorpusFixtureCategory;
    providerProfile: string;
    preprocessingMode: string;
    passed: boolean;
    successfulPageRate: number;
    cacheHitRate: number;
    estimatedHostedCalls: number;
    directTraceabilityRate: number;
    confidenceBreakdown: GeotechBenchmarkCorpusHistoryConfidenceSummary;
    groundModelReadinessScore: number;
    preprocessingQualityScore: number;
    preprocessingRegionQualityScore: number;
    reviewGates: string[];
    latencyMs: number | null;
  }>;
}

export interface GeotechBenchmarkCorpusTrendReport {
  kind: 'geotech-benchmark-corpus-trend';
  schemaVersion: 1;
  generatedAt: string;
  current: GeotechBenchmarkCorpusHistoryEntry;
  previous: GeotechBenchmarkCorpusHistoryEntry | null;
  delta: {
    fixtureCount: number;
    runCount: number;
    passedRuns: number;
    failedRuns: number;
    averageConfidence: number;
    averageExtractionConfidence: number;
    averageCorroborationScore: number;
    averageTraceabilityRate: number;
    averageGroundModelReadinessScore: number;
    averagePreprocessingQualityScore: number;
    totalEstimatedHostedCalls: number;
    pathLeakCount: number;
  } | null;
  runDeltas: Array<{
    key: string;
    fixtureId: string;
    providerProfile: string;
    preprocessingMode: string;
    status: 'new' | 'changed' | 'unchanged';
    passed: boolean;
    previousPassed: boolean | null;
    cacheHitRateDelta: number | null;
    hostedCallDelta: number | null;
    traceabilityDelta: number | null;
    extractionConfidenceDelta: number | null;
    corroborationScoreDelta: number | null;
    groundModelReadinessDelta: number | null;
    qualityDelta: number | null;
    reviewGateDelta: number | null;
    latencyDeltaMs: number | null;
  }>;
  historyCount: number;
  note: string;
}

export interface GeotechBenchmarkCorpusTrend {
  history: GeotechBenchmarkCorpusHistoryEntry[];
  report: GeotechBenchmarkCorpusTrendReport;
}

export interface GeotechBenchmarkCorpusTrendOptions {
  mode?: string;
  providerProfiles?: string[];
  preprocessingModes?: string[];
  skippedFixtureCount?: number;
  previousHistory?: GeotechBenchmarkCorpusHistoryEntry[];
  previousReport?: GeotechBenchmarkCorpusReport | null;
}

export interface GeotechBenchmarkCorpusTrendContractValidation {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

export function buildGeotechBenchmarkCorpusReport(
  inputs: GeotechBenchmarkCorpusRunInput[],
  options: GeotechBenchmarkCorpusReportOptions = {},
): GeotechBenchmarkCorpusReport {
  const fixtures = redactGeotechBenchmarkCorpusArtifact(normalizeFixtures(inputs.map((input) => input.fixture)));
  const runs = inputs.map((input) => buildCorpusRun(input));
  const pathSafety = inspectCorpusPathSafety(inputs);
  const pathSafetyFailures = pathSafety.leaks.map((leak) =>
    `${leak.source} ${leak.location} contains ${leak.kind}; value redacted from corpus output`,
  );
  const fixtureFailures = validateFixtureCoverage(fixtures, runs);
  const failures = [
    ...runs.flatMap((run) => run.failures.map((failure) => `${run.fixtureId}/${run.providerProfile}/${run.preprocessingMode}: ${failure}`)),
    ...pathSafetyFailures,
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
    pathSafety,
    failures: [...new Set(failures)],
    warnings: [...new Set(warnings)],
  };
}

export function redactGeotechBenchmarkCorpusArtifact<T>(value: T): T {
  return redactCorpusArtifactValue(value, new WeakMap()) as T;
}

export function inspectGeotechBenchmarkCorpusArtifactSafety(
  value: unknown,
): GeotechBenchmarkCorpusArtifactSafety {
  const scan = scanObjectForPathSafetyLeaks(value, 'artifact');
  const leaks = deduplicateArtifactSafetyLeaks(scan.leaks);
  return {
    ok: leaks.length === 0,
    leakCount: leaks.length,
    leaks,
  };
}

export function buildGeotechBenchmarkCorpusTrend(
  report: GeotechBenchmarkCorpusReport,
  options: GeotechBenchmarkCorpusTrendOptions = {},
): GeotechBenchmarkCorpusTrend {
  const previousHistory = options.previousHistory ?? [];
  const current = buildGeotechBenchmarkCorpusHistoryEntry(report, {
    mode: options.mode ?? 'local-corpus-benchmark',
    providerProfiles: options.providerProfiles ?? report.summary.providerProfiles,
    preprocessingModes: options.preprocessingModes ?? report.summary.preprocessingModes,
    skippedFixtureCount: options.skippedFixtureCount ?? 0,
  });
  const previous = previousHistory.at(-1)
    ?? (options.previousReport
      ? buildGeotechBenchmarkCorpusHistoryEntry(options.previousReport, {
          mode: 'previous-local-report',
          providerProfiles: options.previousReport.summary.providerProfiles,
          preprocessingModes: options.previousReport.summary.preprocessingModes,
          skippedFixtureCount: 0,
        })
      : null);
  const history = [...previousHistory, current].slice(-50);
  return {
    history,
    report: {
      kind: 'geotech-benchmark-corpus-trend',
      schemaVersion: 1,
      generatedAt: current.generatedAt,
      current,
      previous,
      delta: previous ? buildGeotechBenchmarkCorpusTrendDelta(current, previous) : null,
      runDeltas: previous ? buildGeotechBenchmarkCorpusRunDeltas(current.runs, previous.runs) : [],
      historyCount: history.length,
      note: 'Local corpus trend output stores benchmark summaries only. Raw benchmark JSON, fixture bytes, report text, model IDs, private paths, and provider tokens are intentionally excluded.',
    },
  };
}

export function validateGeotechBenchmarkCorpusTrendContract(
  report: GeotechBenchmarkCorpusTrendReport,
): GeotechBenchmarkCorpusTrendContractValidation {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (report.kind !== 'geotech-benchmark-corpus-trend') {
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
  if (!/raw benchmark JSON|fixture bytes|model IDs|provider tokens/i.test(report.note ?? '')) {
    warnings.push('trend_note_should_state_excluded_raw_and_sensitive_inputs');
  }

  validateGeotechBenchmarkCorpusHistoryEntry(report.current, failures, 'current');
  if (report.previous !== null) {
    validateGeotechBenchmarkCorpusHistoryEntry(report.previous, failures, 'previous');
  }
  if (report.previous && report.delta == null) {
    failures.push('trend_delta_required_when_previous_exists');
  }
  if (!report.previous && report.delta != null) {
    failures.push('trend_delta_must_be_null_without_previous');
  }
  if (report.previous && report.runDeltas.length !== report.current.runs.length) {
    failures.push('trend_run_delta_count_mismatch');
  }
  if (!report.previous && report.runDeltas.length !== 0) {
    failures.push('trend_run_deltas_must_be_empty_without_previous');
  }

  const serialized = JSON.stringify(report);
  if (/"(?:fixtures|benchmark|benchmarks|source|sourceEvidence|snippet|response|prompt|modelId|visionModelId|filePath|sourcePath|pages|rawText|pageText|ocrText|layoutText|modelCalls)"\s*:/.test(serialized)) {
    failures.push('trend_contains_raw_benchmark_source_prompt_response_or_model_payload');
  }
  for (const leak of inspectGeotechBenchmarkCorpusArtifactSafety(report).leaks) {
    failures.push(`trend_sensitive_value_leak_${sanitizeFailureToken(leak.location)}_${leak.kind}`);
  }

  return {
    ok: failures.length === 0,
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
    const statusColor = run.passed ? '#0f766e' : '#b91c1c';
    return [
      `<rect x="24" y="${y}" width="932" height="${rowHeight - 6}" rx="6" fill="${index % 2 === 0 ? '#f8fafc' : '#eef6f8'}" stroke="#dbe5ea"/>`,
      `<text x="42" y="${y + 20}" font-size="12" font-weight="700" fill="#0f172a">${escapeSvg(run.fixtureId)}</text>`,
      `<text x="270" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.category)}</text>`,
      `<text x="430" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.providerProfile)}</text>`,
      `<text x="585" y="${y + 20}" font-size="12" fill="#475569">${escapeSvg(run.preprocessingMode)}</text>`,
      `<text x="720" y="${y + 20}" font-size="12" fill="#0f172a">${escapeSvg(shortEvidenceInput(run.providerBenchmarkProfile.evidenceInput))} | trace ${trace}%</text>`,
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
      <td>${escapeHtml(run.providerBenchmarkProfile.evidenceInput)}</td>
      <td>${escapeHtml(run.preprocessingMode)}</td>
      <td>${run.confidenceBreakdown.extractionConfidence}/${run.confidenceBreakdown.traceabilityScore}/${run.confidenceBreakdown.corroborationScore}</td>
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
  <div class="metric"><span>Trust Components</span><strong>${report.summary.averageConfidenceBreakdown.extractionConfidence}/${report.summary.averageConfidenceBreakdown.traceabilityScore}/${report.summary.averageConfidenceBreakdown.corroborationScore}</strong></div>
  <div class="metric"><span>Preprocessing Quality</span><strong>${Math.round(report.summary.averagePreprocessingQualityScore * 100)}%</strong></div>
  <div class="metric"><span>Path Safety</span><strong class="${report.pathSafety.passed ? 'pass' : 'fail'}">${report.pathSafety.passed ? 'PASS' : 'FAIL'}</strong></div>
</section>
<h2>Runs</h2>
<table><thead><tr><th>Fixture</th><th>Category</th><th>Provider</th><th>Evidence input</th><th>Preprocessing</th><th>Trust E/T/C</th><th>Trace</th><th>GM score</th><th>Quality</th><th>Review gates</th><th>Pages</th><th>Calls</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Preprocessing Comparisons</h2>
<table><thead><tr><th>Fixture</th><th>Provider</th><th>Modes</th><th>Quality delta</th><th>Region quality delta</th><th>Trace delta</th><th>Deskew delta</th><th>Crop Asset delta</th></tr></thead><tbody>${comparisons || '<tr><td colspan="8">No paired preprocessing-mode comparisons available.</td></tr>'}</tbody></table>
${report.failures.length ? `<h2>Failures</h2><ul>${report.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('')}</ul>` : ''}
${report.warnings.length ? `<h2>Warnings</h2><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</main>
</body>
</html>
`;
}

export function renderGeotechBenchmarkCorpusTrendHtml(trend: GeotechBenchmarkCorpusTrendReport): string {
  const delta = trend.delta;
  const runRows = trend.runDeltas.map((run) => `
    <tr>
      <td>${escapeHtml(run.fixtureId)}</td>
      <td>${escapeHtml(run.providerProfile)}</td>
      <td>${escapeHtml(run.preprocessingMode)}</td>
      <td class="${run.passed ? 'pass' : 'fail'}">${run.passed ? 'pass' : 'fail'}</td>
      <td>${formatDelta(run.traceabilityDelta, true)}</td>
      <td>${formatDelta(run.qualityDelta, true)}</td>
      <td>${formatDelta(run.reviewGateDelta, false)}</td>
      <td>${formatDelta(run.hostedCallDelta, false)}</td>
      <td>${formatDelta(run.latencyDeltaMs, false)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeotechCLI Corpus Trend</title>
<style>
body{margin:0;font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a}
main{max-width:1040px;margin:0 auto;padding:32px 20px 56px}
h1{margin:0 0 8px;font-size:28px}
.note{color:#475569;font-size:13px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:22px 0}
.metric{background:white;border:1px solid #dbe5ea;border-radius:8px;padding:14px}.metric strong{display:block;font-size:24px}
table{width:100%;border-collapse:collapse;background:white;border:1px solid #dbe5ea;border-radius:8px;overflow:hidden;margin-top:16px}
th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:13px}
th{background:#0f172a;color:#f8fafc}.pass{color:#0f766e;font-weight:700}.fail{color:#b91c1c;font-weight:700}
</style>
</head>
<body>
<main>
<h1>GeotechCLI Corpus Trend</h1>
<p class="note">${escapeHtml(trend.note)} Generated ${escapeHtml(trend.generatedAt)}.</p>
<section class="summary">
  <div class="metric"><span>History Entries</span><strong>${trend.historyCount}</strong></div>
  <div class="metric"><span>Run Delta</span><strong>${delta ? signed(delta.runCount) : 'new'}</strong></div>
  <div class="metric"><span>Extraction Trust Delta</span><strong>${delta ? signed(delta.averageExtractionConfidence) : 'new'}</strong></div>
  <div class="metric"><span>Corroboration Delta</span><strong>${delta ? signed(delta.averageCorroborationScore) : 'new'}</strong></div>
  <div class="metric"><span>Traceability Delta</span><strong>${delta ? signedPercent(delta.averageTraceabilityRate) : 'new'}</strong></div>
  <div class="metric"><span>Quality Delta</span><strong>${delta ? signedPercent(delta.averagePreprocessingQualityScore) : 'new'}</strong></div>
</section>
<h2>Run Deltas</h2>
<table><thead><tr><th>Fixture</th><th>Provider</th><th>Preprocessing</th><th>Status</th><th>Trace</th><th>Quality</th><th>Review gates</th><th>Hosted calls</th><th>Latency ms</th></tr></thead><tbody>${runRows || '<tr><td colspan="9">No previous local run is available yet.</td></tr>'}</tbody></table>
</main>
</body>
</html>
`;
}

function buildGeotechBenchmarkCorpusHistoryEntry(
  report: GeotechBenchmarkCorpusReport,
  context: {
    mode: string;
    providerProfiles: string[];
    preprocessingModes: string[];
    skippedFixtureCount: number;
  },
): GeotechBenchmarkCorpusHistoryEntry {
  return {
    kind: 'geotech-benchmark-corpus-history-entry',
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    mode: context.mode,
    skippedFixtureCount: context.skippedFixtureCount,
    providerProfiles: [...context.providerProfiles],
    preprocessingModes: [...context.preprocessingModes],
    summary: {
      fixtureCount: finiteNumber(report.summary.fixtureCount),
      runCount: finiteNumber(report.summary.runCount),
      passedRuns: finiteNumber(report.summary.passedRuns),
      failedRuns: finiteNumber(report.summary.failedRuns),
      passed: Boolean(report.summary.passed),
      averageConfidence: finiteNumber(report.summary.averageConfidence),
      averageConfidenceBreakdown: summarizeHistoryConfidenceBreakdown(report.summary.averageConfidenceBreakdown),
      averageTraceabilityRate: finiteNumber(report.summary.averageTraceabilityRate),
      averageGroundModelReadinessScore: finiteNumber(report.summary.averageGroundModelReadinessScore),
      averagePreprocessingQualityScore: finiteNumber(report.summary.averagePreprocessingQualityScore),
      totalEstimatedHostedCalls: finiteNumber(report.summary.totalEstimatedHostedCalls),
      pathLeakCount: report.pathSafety?.leakCount ?? inspectGeotechBenchmarkCorpusArtifactSafety(report).leakCount,
    },
    runs: report.runs.map((run) => ({
      key: corpusRunKey(run),
      fixtureId: run.fixtureId,
      category: run.category,
      providerProfile: run.providerProfile,
      preprocessingMode: run.preprocessingMode,
      passed: run.passed,
      successfulPageRate: finiteNumber(run.successfulPageRate),
      cacheHitRate: finiteNumber(run.cacheHitRate),
      estimatedHostedCalls: finiteNumber(run.estimatedHostedCalls),
      directTraceabilityRate: finiteNumber(run.directTraceabilityRate),
      confidenceBreakdown: summarizeHistoryConfidenceBreakdown(run.confidenceBreakdown),
      groundModelReadinessScore: finiteNumber(run.groundModelReadinessScore),
      preprocessingQualityScore: finiteNumber(run.preprocessingQualityScore),
      preprocessingRegionQualityScore: finiteNumber(run.preprocessingRegionQualityScore),
      reviewGates: Array.isArray(run.reviewGates) ? [...run.reviewGates] : [],
      latencyMs: typeof run.latencyMs === 'number' && Number.isFinite(run.latencyMs) ? run.latencyMs : null,
    })),
  };
}

function validateGeotechBenchmarkCorpusHistoryEntry(
  entry: GeotechBenchmarkCorpusHistoryEntry | null | undefined,
  failures: string[],
  prefix: string,
): void {
  if (!entry || typeof entry !== 'object') {
    failures.push(`${prefix}_history_entry_missing`);
    return;
  }
  if (entry.kind !== 'geotech-benchmark-corpus-history-entry') {
    failures.push(`${prefix}_history_wrong_kind`);
  }
  if (entry.schemaVersion !== 1) {
    failures.push(`${prefix}_history_wrong_schema_version`);
  }
  if (!entry.generatedAt) {
    failures.push(`${prefix}_history_missing_generated_at`);
  }
  if (!entry.mode) {
    failures.push(`${prefix}_history_mode_missing`);
  }
  if (!Number.isInteger(entry.skippedFixtureCount) || entry.skippedFixtureCount < 0) {
    failures.push(`${prefix}_history_skipped_fixture_count_invalid`);
  }
  if (!Array.isArray(entry.providerProfiles)) {
    failures.push(`${prefix}_history_provider_profiles_invalid`);
  }
  if (!Array.isArray(entry.preprocessingModes)) {
    failures.push(`${prefix}_history_preprocessing_modes_invalid`);
  }

  const summary = entry.summary;
  const runs = Array.isArray(entry.runs) ? entry.runs : [];
  if (!summary || typeof summary !== 'object') {
    failures.push(`${prefix}_history_summary_missing`);
    return;
  }
  for (const key of [
    'fixtureCount',
    'runCount',
    'passedRuns',
    'failedRuns',
    'totalEstimatedHostedCalls',
    'pathLeakCount',
  ] as const) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  for (const key of [
    'averageConfidence',
    'averageTraceabilityRate',
    'averageGroundModelReadinessScore',
    'averagePreprocessingQualityScore',
  ] as const) {
    if (!Number.isFinite(summary[key])) {
      failures.push(`${prefix}_history_${key}_invalid`);
    }
  }
  validateHistoryConfidenceBreakdown(summary.averageConfidenceBreakdown, failures, `${prefix}_summary`);
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
  if (summary.passed !== (summary.runCount > 0 && summary.failedRuns === 0 && summary.pathLeakCount === 0)) {
    failures.push(`${prefix}_history_passed_flag_mismatch`);
  }
  if (summary.pathLeakCount !== 0) {
    failures.push(`${prefix}_history_path_leaks_present`);
  }

  const observedProviders = new Set(runs.map((run) => run.providerProfile));
  const observedModes = new Set(runs.map((run) => run.preprocessingMode));
  for (const provider of observedProviders) {
    if (!entry.providerProfiles.includes(provider)) {
      failures.push(`${prefix}_history_provider_profile_missing_${sanitizeFailureToken(provider)}`);
    }
  }
  for (const mode of observedModes) {
    if (!entry.preprocessingModes.includes(mode)) {
      failures.push(`${prefix}_history_preprocessing_mode_missing_${sanitizeFailureToken(mode)}`);
    }
  }

  for (const [index, run] of runs.entries()) {
    const label = `${prefix}_run_${sanitizeFailureToken(run.key || String(index))}`;
    if (run.key !== corpusRunKey(run)) {
      failures.push(`${label}_key_mismatch`);
    }
    for (const key of ['fixtureId', 'category', 'providerProfile', 'preprocessingMode'] as const) {
      if (typeof run[key] !== 'string' || !run[key].trim()) {
        failures.push(`${label}_${key}_missing`);
      }
    }
    for (const key of [
      'successfulPageRate',
      'cacheHitRate',
      'directTraceabilityRate',
      'preprocessingQualityScore',
      'preprocessingRegionQualityScore',
    ] as const) {
      if (!Number.isFinite(run[key]) || run[key] < 0 || run[key] > 1) {
        failures.push(`${label}_${key}_invalid`);
      }
    }
    if (!Number.isInteger(run.estimatedHostedCalls) || run.estimatedHostedCalls < 0) {
      failures.push(`${label}_estimatedHostedCalls_invalid`);
    }
    if (!Number.isFinite(run.groundModelReadinessScore) || run.groundModelReadinessScore < 0) {
      failures.push(`${label}_groundModelReadinessScore_invalid`);
    }
    validateHistoryConfidenceBreakdown(run.confidenceBreakdown, failures, `${label}_confidence`);
    if (!Array.isArray(run.reviewGates)) {
      failures.push(`${label}_reviewGates_invalid`);
    }
    if (run.latencyMs != null && (!Number.isFinite(run.latencyMs) || run.latencyMs < 0)) {
      failures.push(`${label}_latencyMs_invalid`);
    }
  }
}

function buildGeotechBenchmarkCorpusTrendDelta(
  current: GeotechBenchmarkCorpusHistoryEntry,
  previous: GeotechBenchmarkCorpusHistoryEntry,
): NonNullable<GeotechBenchmarkCorpusTrendReport['delta']> {
  return {
    fixtureCount: current.summary.fixtureCount - previous.summary.fixtureCount,
    runCount: current.summary.runCount - previous.summary.runCount,
    passedRuns: current.summary.passedRuns - previous.summary.passedRuns,
    failedRuns: current.summary.failedRuns - previous.summary.failedRuns,
    averageConfidence: roundRatio(current.summary.averageConfidence - previous.summary.averageConfidence),
    averageExtractionConfidence: roundRatio(
      current.summary.averageConfidenceBreakdown.extractionConfidence
      - previous.summary.averageConfidenceBreakdown.extractionConfidence,
    ),
    averageCorroborationScore: roundRatio(
      current.summary.averageConfidenceBreakdown.corroborationScore
      - previous.summary.averageConfidenceBreakdown.corroborationScore,
    ),
    averageTraceabilityRate: roundRatio(
      current.summary.averageTraceabilityRate - previous.summary.averageTraceabilityRate,
    ),
    averageGroundModelReadinessScore: current.summary.averageGroundModelReadinessScore
      - previous.summary.averageGroundModelReadinessScore,
    averagePreprocessingQualityScore: roundRatio(
      current.summary.averagePreprocessingQualityScore - previous.summary.averagePreprocessingQualityScore,
    ),
    totalEstimatedHostedCalls: current.summary.totalEstimatedHostedCalls - previous.summary.totalEstimatedHostedCalls,
    pathLeakCount: current.summary.pathLeakCount - previous.summary.pathLeakCount,
  };
}

function buildGeotechBenchmarkCorpusRunDeltas(
  currentRuns: GeotechBenchmarkCorpusHistoryEntry['runs'],
  previousRuns: GeotechBenchmarkCorpusHistoryEntry['runs'],
): GeotechBenchmarkCorpusTrendReport['runDeltas'] {
  const previousByKey = new Map(previousRuns.map((run) => [run.key, run]));
  return currentRuns.map((current) => {
    const previous = previousByKey.get(current.key);
    const status: 'new' | 'changed' | 'unchanged' = previous
      ? (current.passed === previous.passed ? 'unchanged' : 'changed')
      : 'new';
    return {
      key: current.key,
      fixtureId: current.fixtureId,
      providerProfile: current.providerProfile,
      preprocessingMode: current.preprocessingMode,
      status,
      passed: current.passed,
      previousPassed: previous?.passed ?? null,
      cacheHitRateDelta: previous ? roundRatio(current.cacheHitRate - previous.cacheHitRate) : null,
      hostedCallDelta: previous ? current.estimatedHostedCalls - previous.estimatedHostedCalls : null,
      traceabilityDelta: previous ? roundRatio(current.directTraceabilityRate - previous.directTraceabilityRate) : null,
      extractionConfidenceDelta: previous
        ? roundRatio(
          current.confidenceBreakdown.extractionConfidence
          - previous.confidenceBreakdown.extractionConfidence,
        )
        : null,
      corroborationScoreDelta: previous
        ? roundRatio(
          current.confidenceBreakdown.corroborationScore
          - previous.confidenceBreakdown.corroborationScore,
        )
        : null,
      groundModelReadinessDelta: previous
        ? current.groundModelReadinessScore - previous.groundModelReadinessScore
        : null,
      qualityDelta: previous ? roundRatio(current.preprocessingQualityScore - previous.preprocessingQualityScore) : null,
      reviewGateDelta: previous ? current.reviewGates.length - previous.reviewGates.length : null,
      latencyDeltaMs: previous && current.latencyMs != null && previous.latencyMs != null
        ? current.latencyMs - previous.latencyMs
        : null,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
}

function summarizeHistoryConfidenceBreakdown(
  value: Partial<GeotechBenchmarkCorpusHistoryConfidenceSummary> | undefined,
): GeotechBenchmarkCorpusHistoryConfidenceSummary {
  return {
    overall: finiteNumber(value?.overall),
    extractionConfidence: finiteNumber(value?.extractionConfidence),
    engineeringCompleteness: finiteNumber(value?.engineeringCompleteness),
    traceabilityScore: finiteNumber(value?.traceabilityScore),
    corroborationScore: finiteNumber(value?.corroborationScore),
    readinessScore: finiteNumber(value?.readinessScore),
    pageEvidenceConfidence: finiteNumber(value?.pageEvidenceConfidence),
  };
}

function validateHistoryConfidenceBreakdown(
  value: GeotechBenchmarkCorpusHistoryConfidenceSummary | undefined,
  failures: string[],
  prefix: string,
): void {
  if (!value || typeof value !== 'object') {
    failures.push(`${prefix}_confidence_breakdown_missing`);
    return;
  }
  for (const key of [
    'overall',
    'extractionConfidence',
    'engineeringCompleteness',
    'traceabilityScore',
    'corroborationScore',
    'readinessScore',
    'pageEvidenceConfidence',
  ] as const) {
    if (!Number.isFinite(value[key]) || value[key] < 0) {
      failures.push(`${prefix}_${key}_invalid`);
    }
  }
}

function corpusRunKey(run: Pick<
  GeotechBenchmarkCorpusHistoryEntry['runs'][number],
  'fixtureId' | 'providerProfile' | 'preprocessingMode'
>): string {
  return `${run.fixtureId}::${run.providerProfile}::${run.preprocessingMode}`;
}

function buildCorpusRun(input: GeotechBenchmarkCorpusRunInput): GeotechBenchmarkCorpusRun {
  const benchmark = input.benchmark;
  const providerProfile = input.providerProfile
    ?? benchmark.provider?.profile
    ?? benchmark.provider?.provider
    ?? 'unknown';
  const providerBenchmarkProfile = summarizeProviderBenchmarkProfile(providerProfile, benchmark);
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
    providerBenchmarkProfile,
    preprocessingMode,
    totalPages: finiteNumber(benchmark.source?.totalPages),
    successfulPages: finiteNumber(benchmark.source?.successfulPages),
    failedPages: finiteNumber(benchmark.source?.failedPages),
    successfulPageRate: successfulPageRate(benchmark),
    documentConfidence: finiteNumber(benchmark.document?.confidence),
    confidenceBreakdown: summarizeConfidenceBreakdown(benchmark),
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
    ...validateProviderEvidenceContract(run),
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

function validateProviderEvidenceContract(
  run: Omit<GeotechBenchmarkCorpusRun, 'passed' | 'failures' | 'warnings'>,
): string[] {
  const provider = run.providerBenchmarkProfile;
  const gates = new Set(provider.reviewGates);
  const profileRequiresTextEvidence = [
    'openai-compatible-byok',
    'openrouter-free',
    'local-hf-compatible',
    'open-byok-text-evidence',
  ].includes(provider.id);
  const providerNameRequiresTextEvidence = provider.provider === 'huggingface'
    || provider.provider === 'local-hf-compatible';
  const textEvidenceOnly = profileRequiresTextEvidence || providerNameRequiresTextEvidence;
  const failures = [
    provider.requiresPreprocessedEvidence
      && !provider.imageInputsAllowed
      && !provider.nativePdfAllowed
      && provider.evidenceInput !== 'preprocessed-page-evidence'
      ? `provider profile ${provider.id} must consume preprocessed page evidence, got ${provider.evidenceInput}`
      : null,
    textEvidenceOnly && !provider.requiresPreprocessedEvidence
      ? `provider profile ${provider.id} must require preprocessed page evidence`
      : null,
    textEvidenceOnly && provider.imageInputsAllowed
      ? `provider profile ${provider.id} must not accept direct image tasks`
      : null,
    textEvidenceOnly && provider.nativePdfAllowed
      ? `provider profile ${provider.id} must not accept native PDF tasks`
      : null,
    textEvidenceOnly && provider.evidenceInput !== 'preprocessed-page-evidence'
      ? `provider profile ${provider.id} must route through OCR/page evidence, got ${provider.evidenceInput}`
      : null,
    provider.likelyFreeRoute && !gates.has('free-route-capacity-and-feature-variance')
      ? `provider profile ${provider.id} free route missing capacity/feature review gate`
      : null,
    textEvidenceOnly && !hasTextEvidenceGate(provider.reviewGates)
      ? `provider profile ${provider.id} missing text-evidence review gate`
      : null,
  ];

  return failures.filter((value): value is string => value != null);
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

function summarizeProviderBenchmarkProfile(
  providerProfile: string,
  benchmark: GeotechDocumentBenchmark,
): GeotechBenchmarkCorpusProviderProfileSummary {
  const provider = benchmark.provider;
  const capabilities = provider?.capabilities;
  const policy = provider?.preprocessingPolicy;
  const imageInputsAllowed = Boolean(policy?.allowImageInputs);
  const nativePdfAllowed = Boolean(policy?.preferNativePdf && capabilities?.nativePdfDocuments);
  const layoutOcrAllowed = Boolean(policy?.allowLayoutOcr);
  return {
    id: providerProfile || provider?.profile || 'unknown',
    provider: provider?.provider ?? 'unknown',
    modelId: provider?.modelId ?? null,
    visionModelId: provider?.visionModelId ?? null,
    evidenceInput: inferProviderEvidenceInput({
      imageInputsAllowed,
      nativePdfAllowed,
      layoutOcrAllowed,
      requiresPreprocessedEvidence: Boolean(policy?.requirePreprocessedEvidence),
    }),
    imageInputsAllowed,
    nativePdfAllowed,
    layoutOcrAllowed,
    requiresPreprocessedEvidence: Boolean(policy?.requirePreprocessedEvidence),
    likelyFreeRoute: Boolean(provider?.likelyFreeRoute),
    contextStrategy: provider?.contextStrategy ?? policy?.maxContextStrategy ?? 'unknown',
    reviewGates: uniqueSorted(provider?.reviewGates ?? []),
  };
}

function summarizeConfidenceBreakdown(
  benchmark: GeotechDocumentBenchmark,
): GeotechBenchmarkCorpusConfidenceSummary {
  const breakdown = benchmark.document?.confidenceBreakdown;
  return {
    overall: finiteNumber(breakdown?.overall ?? benchmark.document?.confidence),
    extractionConfidence: finiteNumber(breakdown?.extractionConfidence ?? benchmark.document?.confidence),
    engineeringCompleteness: finiteNumber(breakdown?.engineeringCompleteness),
    traceabilityScore: finiteNumber(
      breakdown?.traceabilityScore
      ?? (benchmark.traceability?.directParameterTraceabilityRate != null
        ? benchmark.traceability.directParameterTraceabilityRate * 100
        : 0),
    ),
    corroborationScore: finiteNumber(breakdown?.corroborationScore),
    readinessScore: finiteNumber(
      breakdown?.readinessScore
      ?? benchmark.groundModelReadiness?.score,
    ),
    pageEvidenceConfidence: finiteNumber(
      breakdown?.pageEvidenceConfidence
      ?? benchmark.pageOutcomes?.averageConfidence,
    ),
    methodCoverage: {
      nativeTextPages: finiteNumber(breakdown?.methodCoverage?.nativeTextPages),
      layoutOcrPages: finiteNumber(breakdown?.methodCoverage?.layoutOcrPages),
      visualReasoningPages: finiteNumber(breakdown?.methodCoverage?.visualReasoningPages),
      directVisualPages: finiteNumber(breakdown?.methodCoverage?.directVisualPages),
    },
    missingCriticalData: uniqueSorted(breakdown?.missingCriticalData ?? []),
    reviewGates: uniqueSorted(breakdown?.reviewGates ?? []),
  };
}

function inferProviderEvidenceInput(options: {
  imageInputsAllowed: boolean;
  nativePdfAllowed: boolean;
  layoutOcrAllowed: boolean;
  requiresPreprocessedEvidence: boolean;
}): GeotechBenchmarkCorpusEvidenceInput {
  if (options.nativePdfAllowed) {
    return 'native-pdf';
  }
  if (options.imageInputsAllowed || options.layoutOcrAllowed) {
    return 'image-or-layout-evidence';
  }
  if (options.requiresPreprocessedEvidence) {
    return 'preprocessed-page-evidence';
  }
  return 'unknown';
}

function hasTextEvidenceGate(reviewGates: string[]): boolean {
  return reviewGates.some((gate) =>
    /(?:text-only|ocr-page|preprocessed-page|preprocessed.*evidence)/i.test(gate),
  );
}

function validateFemExecutionBoundary(benchmark: GeotechDocumentBenchmark): string[] {
  const fem = benchmark.femDraftReadiness;
  if (!fem) {
    return ['FEM draft readiness block missing from benchmark output'];
  }
  return collectFemDraftReadinessGuardrailFailures(fem).map((failure) =>
    failure.endsWith('.') ? failure.slice(0, -1) : failure,
  );
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

function inspectCorpusPathSafety(inputs: GeotechBenchmarkCorpusRunInput[]): GeotechBenchmarkCorpusPathSafety {
  const leaks: GeotechBenchmarkCorpusPathSafetyLeak[] = [];
  let checkedStringFields = 0;

  for (const [index, input] of inputs.entries()) {
    const fixtureScan = scanObjectForPathSafetyLeaks(input.fixture, `inputs[${index}].fixture`);
    const benchmarkScan = scanObjectForPathSafetyLeaks(input.benchmark, `inputs[${index}].benchmark`);
    checkedStringFields += fixtureScan.checkedStringFields + benchmarkScan.checkedStringFields;
    leaks.push(
      ...fixtureScan.leaks.map((leak) => ({ ...leak, source: 'fixture' as const })),
      ...benchmarkScan.leaks.map((leak) => ({ ...leak, source: 'benchmark' as const })),
    );
  }

  const uniqueLeaks = deduplicatePathSafetyLeaks(leaks).slice(0, 50);
  return {
    passed: uniqueLeaks.length === 0,
    checkedStringFields,
    leakCount: uniqueLeaks.length,
    leaks: uniqueLeaks,
  };
}

function redactCorpusArtifactValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (looksLikeAbsoluteLocalPath(trimmed)) {
      return '<absolute-path>';
    }
    if (looksLikeSecretValue(trimmed)) {
      return '<secret-like-value>';
    }
    return value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(redactCorpusArtifactValue(item, seen));
    }
    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = redactCorpusArtifactValue(child, seen);
  }
  return clone;
}

function scanObjectForPathSafetyLeaks(value: unknown, rootLocation: string): {
  checkedStringFields: number;
  leaks: Omit<GeotechBenchmarkCorpusPathSafetyLeak, 'source'>[];
} {
  const leaks: Omit<GeotechBenchmarkCorpusPathSafetyLeak, 'source'>[] = [];
  let checkedStringFields = 0;
  const seen = new WeakSet<object>();

  function visit(current: unknown, location: string): void {
    if (typeof current === 'string') {
      checkedStringFields += 1;
      const trimmed = current.trim();
      if (looksLikeAbsoluteLocalPath(trimmed)) {
        leaks.push({
          kind: 'absolute-path',
          location,
          redactedValue: '<absolute-path>',
        });
      }
      if (looksLikeSecretValue(trimmed)) {
        leaks.push({
          kind: 'secret-like-value',
          location,
          redactedValue: '<secret-like-value>',
        });
      }
      return;
    }

    if (!current || typeof current !== 'object') {
      return;
    }
    if (seen.has(current)) {
      return;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      visit(child, `${location}.${sanitizeLocationKey(key)}`);
    }
  }

  visit(value, rootLocation);
  return { checkedStringFields, leaks };
}

function deduplicatePathSafetyLeaks(
  leaks: GeotechBenchmarkCorpusPathSafetyLeak[],
): GeotechBenchmarkCorpusPathSafetyLeak[] {
  const seen = new Set<string>();
  const unique: GeotechBenchmarkCorpusPathSafetyLeak[] = [];
  for (const leak of leaks) {
    const key = `${leak.kind}:${leak.source}:${leak.location}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(leak);
  }
  return unique;
}

function deduplicateArtifactSafetyLeaks(
  leaks: GeotechBenchmarkCorpusArtifactSafetyLeak[],
): GeotechBenchmarkCorpusArtifactSafetyLeak[] {
  const seen = new Set<string>();
  const unique: GeotechBenchmarkCorpusArtifactSafetyLeak[] = [];
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

function sanitizeLocationKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$-]/g, '_');
}

function sanitizeFailureToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 72);
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
    averageConfidenceBreakdown: {
      overall: Math.round(average(runs.map((run) => run.confidenceBreakdown.overall))),
      extractionConfidence: Math.round(average(runs.map((run) => run.confidenceBreakdown.extractionConfidence))),
      engineeringCompleteness: Math.round(average(runs.map((run) => run.confidenceBreakdown.engineeringCompleteness))),
      traceabilityScore: Math.round(average(runs.map((run) => run.confidenceBreakdown.traceabilityScore))),
      corroborationScore: Math.round(average(runs.map((run) => run.confidenceBreakdown.corroborationScore))),
      readinessScore: Math.round(average(runs.map((run) => run.confidenceBreakdown.readinessScore))),
      pageEvidenceConfidence: Math.round(average(runs.map((run) => run.confidenceBreakdown.pageEvidenceConfidence))),
    },
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

function formatReviewGates(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function shortEvidenceInput(value: GeotechBenchmarkCorpusEvidenceInput): string {
  if (value === 'preprocessed-page-evidence') return 'preprocessed';
  if (value === 'image-or-layout-evidence') return 'image/layout';
  if (value === 'native-pdf') return 'native PDF';
  return 'unknown';
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

function formatDelta(value: number | null, asPercent: boolean): string {
  if (value == null) {
    return 'new';
  }
  return asPercent ? signedPercent(value) : signed(value);
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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

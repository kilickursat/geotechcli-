#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreIndexEntry = join(repoRoot, 'packages', 'core', 'dist', 'index.js');
const corePreprocessEntry = join(repoRoot, 'packages', 'core', 'dist', 'vision', 'preprocess.js');
const fixtureDir = join(repoRoot, 'packages', 'core', 'tests', 'fixtures', 'geotech-corpus');
const outputDir = resolve(readOutputDir(process.env.GEOTECHCLI_PREPROCESSING_BENCHMARK_OUTPUT_DIR || '__benchmark-preprocessing-fixtures'));
const modes = readListOption('--modes', 'none,ocr-optimized,region-v2');

const fixtures = [
  { id: 'borehole-table', category: 'borehole-log', fileName: 'region-v2-scanned-borehole-table.fixture.pdf', page: 1, minRegionV2Crops: 2 },
  { id: 'cpt-table', category: 'cpt-table', fileName: 'preprocess-v2-cpt-table.fixture.pdf', page: 1, minRegionV2Crops: 1 },
  { id: 'lab-table', category: 'lab-table', fileName: 'preprocess-v2-lab-table.fixture.pdf', page: 1, minRegionV2Crops: 1 },
  { id: 'mixed-scanned', category: 'mixed-scanned-report', fileName: 'preprocess-v2-mixed-scanned-report.fixture.pdf', page: 1, minRegionV2Crops: 2 },
  { id: 'mixed-digital-scanned', category: 'mixed-digital-scanned-pdf', fileName: 'preprocess-v2-mixed-digital-scanned.fixture.pdf', page: 2, minRegionV2Crops: 2 },
  { id: 'malformed-scanned', category: 'malformed-scanned-pdf', fileName: 'preprocess-v2-malformed-scanned.fixture.pdf', page: 1, minRegionV2Crops: 1 },
];

if (!existsSync(corePreprocessEntry) || !existsSync(coreIndexEntry)) {
  console.error(`Core build was not found: ${existsSync(corePreprocessEntry) ? coreIndexEntry : corePreprocessEntry}`);
  console.error('Run npm run build before npm run benchmark:preprocessing.');
  process.exit(1);
}

const { renderPdfPageToImageBuffer } = await import(pathToFileURL(corePreprocessEntry).href);
const {
  buildPreprocessingFixtureBenchmarkComparisons,
  buildPreprocessingFixtureBenchmarkSummary,
  buildPreprocessingFixtureBenchmarkTrend,
  inspectPreprocessingFixtureBenchmarkPathSafety,
  redactPreprocessingFixtureBenchmarkArtifact,
  validatePreprocessingFixtureBenchmarkReport,
  validatePreprocessingFixtureBenchmarkTrendContract,
} = await import(pathToFileURL(coreIndexEntry).href);

mkdirSync(outputDir, { recursive: true });

const runs = [];
for (const fixture of fixtures) {
  const fixturePath = join(fixtureDir, fixture.fileName);
  if (!existsSync(fixturePath)) {
    runs.push({
      fixtureId: fixture.id,
      category: fixture.category,
      fileName: fixture.fileName,
      page: fixture.page,
      mode: null,
      passed: false,
      failures: [`fixture missing: ${fixture.fileName}`],
    });
    continue;
  }
  const input = readFileSync(fixturePath);
  const fileHash = sha256(input);
  for (const mode of modes) {
    const started = performance.now();
    const result = await renderPdfPageToImageBuffer(input, fixture.page, {
      scale: 2,
      preprocessPolicy: mode,
    });
    const latencyMs = Math.round(performance.now() - started);
    const preprocessing = result?.preprocessing;
    const regionCrops = preprocessing?.regions.filter((region) =>
      region.id.startsWith('region-v2-') && region.asset?.normalized === true,
    ) ?? [];
    const averageRegionQuality = regionCrops.length > 0
      ? round(regionCrops.reduce((sum, region) => sum + (region.quality?.score ?? 0), 0) / regionCrops.length)
      : 0;
    const persistedAssetCount = regionCrops.filter((region) => region.asset?.sha256).length;
    const failures = [];
    if (!result) {
      failures.push('page render failed');
    }
    if (mode === 'region-v2') {
      if (regionCrops.length < fixture.minRegionV2Crops) {
        failures.push(`region-v2 crops ${regionCrops.length} below ${fixture.minRegionV2Crops}`);
      }
      if (persistedAssetCount < fixture.minRegionV2Crops) {
        failures.push(`normalized crop assets ${persistedAssetCount} below ${fixture.minRegionV2Crops}`);
      }
      if (averageRegionQuality < 0.4) {
        failures.push(`average region quality ${averageRegionQuality} below 0.4`);
      }
    }
    runs.push({
      fixtureId: fixture.id,
      category: fixture.category,
      fileName: basename(fixture.fileName),
      fileHash,
      page: fixture.page,
      mode,
      latencyMs,
      passed: failures.length === 0,
      failures,
      preprocessing: preprocessing
        ? {
          policy: preprocessing.policy,
          operations: preprocessing.operations,
          qualityScore: round(preprocessing.quality?.score ?? 0),
          deskewAngleDeg: round(preprocessing.quality?.deskew.angleDeg ?? 0),
          deskewApplied: Boolean(preprocessing.quality?.deskew.applied),
          regionCount: preprocessing.quality?.regionCount ?? preprocessing.regions.length,
          cropAssetCount: preprocessing.quality?.cropAssetCount ?? 0,
          regionV2CropCount: regionCrops.length,
          averageRegionQuality,
          normalizedAssetHashes: regionCrops.map((region) => region.asset?.sha256).filter(Boolean),
        }
        : null,
    });
  }
}

const comparisons = buildPreprocessingFixtureBenchmarkComparisons(runs);
const reportPath = join(outputDir, 'preprocessing-fixture-benchmark.json');
const historyPath = join(outputDir, 'preprocessing-fixture-history.json');
const trendPath = join(outputDir, 'preprocessing-fixture-trend.json');
const trendHtmlPath = join(outputDir, 'preprocessing-fixture-trend.html');
const previousReport = existsSync(reportPath) ? safeReadJson(reportPath) : null;
const previousHistory = readPreprocessingHistory(historyPath);
const summary = buildPreprocessingFixtureBenchmarkSummary(
  runs,
  fixtures.map(({ id, category, fileName, page }) => ({ id, category, fileName: basename(fileName), page })),
  modes,
  comparisons,
);
let report = {
  kind: 'geotech-preprocessing-fixture-benchmark',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  modes,
  summary,
  fixtures: fixtures.map(({ id, category, fileName, page }) => ({ id, category, fileName, page })),
  runs,
  comparisons,
  pathSafety: {
    passed: true,
    leakCount: 0,
    leaks: [],
  },
};
report.pathSafety = inspectPreprocessingFixtureBenchmarkPathSafety(report);
report.summary.pathLeakDetected = !report.pathSafety.passed;
report.summary.passed = report.summary.passed && report.pathSafety.passed;
report = redactPreprocessingFixtureBenchmarkArtifact(report);
report.contractValidation = validatePreprocessingFixtureBenchmarkReport(report);
report.summary.passed = report.summary.passed && report.contractValidation.ok;
const trend = buildPreprocessingFixtureBenchmarkTrend(report, previousHistory, previousReport);
const trendValidation = validatePreprocessingFixtureBenchmarkTrendContract(trend.report);
if (!trendValidation.ok) {
  report.summary.passed = false;
  report.contractValidation = {
    ...report.contractValidation,
    ok: false,
    failures: [
      ...report.contractValidation.failures,
      ...trendValidation.failures,
    ],
    warnings: [
      ...report.contractValidation.warnings,
      ...trendValidation.warnings,
    ],
  };
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
writeFileSync(join(outputDir, 'preprocessing-fixture-summary.html'), renderHtml(report), 'utf-8');
writeFileSync(join(outputDir, 'preprocessing-fixture-summary.svg'), renderSvg(report), 'utf-8');
if (trendValidation.ok) {
  writeFileSync(historyPath, `${JSON.stringify(trend.history, null, 2)}\n`, 'utf-8');
  writeFileSync(trendPath, `${JSON.stringify(trend.report, null, 2)}\n`, 'utf-8');
  writeFileSync(trendHtmlPath, renderTrendHtml(trend.report), 'utf-8');
} else {
  console.error(`Preprocessing fixture trend failed contract: ${trendValidation.failures.join(', ')}`);
}

console.log(`Preprocessing fixture benchmark: ${report.summary.passed ? 'PASS' : 'FAIL'}`);
console.log(`Output: ${outputDir}`);
console.log(`Runs: ${report.summary.passedRuns}/${report.summary.runCount} passed`);
console.log(`Region-v2 average crops: ${report.summary.regionV2AverageCropCount}`);
console.log(`Region-v2 average region quality: ${report.summary.regionV2AverageRegionQuality}`);
console.log(`Mode comparisons: ${report.summary.comparisonCount}`);
console.log(`Path leak detected: ${report.summary.pathLeakDetected ? 'yes' : 'no'}`);
console.log(`Trend: ${trendPath}`);
console.log(`Trend HTML: ${trendHtmlPath}`);

if (!report.summary.passed) {
  process.exit(1);
}

function renderHtml(report) {
  const rows = report.runs.map((run) => `
    <tr>
      <td>${escapeHtml(run.fixtureId)}</td>
      <td>${escapeHtml(run.mode ?? 'missing')}</td>
      <td>${run.passed ? 'PASS' : 'FAIL'}</td>
      <td>${run.latencyMs ?? '-'}</td>
      <td>${run.preprocessing?.qualityScore ?? '-'}</td>
      <td>${run.preprocessing?.regionV2CropCount ?? '-'}</td>
      <td>${run.preprocessing?.averageRegionQuality ?? '-'}</td>
      <td>${escapeHtml(run.failures.join('; ') || '-')}</td>
    </tr>`).join('');
  const comparisonRows = report.comparisons.map((comparison) => `
    <tr>
      <td>${escapeHtml(comparison.fixtureId)}</td>
      <td>${escapeHtml(comparison.currentMode)} vs ${escapeHtml(comparison.baselineMode)}</td>
      <td>${comparison.qualityDelta}</td>
      <td>${comparison.regionCountDelta}</td>
      <td>${comparison.cropAssetDelta}</td>
      <td>${comparison.regionV2CropDelta}</td>
      <td>${comparison.regionQualityDelta}</td>
      <td>${comparison.latencyDeltaMs}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>GeotechCLI Preprocessing Fixture Benchmark</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;background:#f8fafc;color:#0f172a}
table{border-collapse:collapse;width:100%;margin:16px 0;background:white}
th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}
th{background:#e2e8f0}
.pass{color:#047857}.fail{color:#b91c1c}
</style>
<h1>GeotechCLI Preprocessing Fixture Benchmark</h1>
<p class="${report.summary.passed ? 'pass' : 'fail'}">Status: ${report.summary.passed ? 'PASS' : 'FAIL'}</p>
<p>Fixtures: ${report.summary.fixtureCount}; categories: ${report.summary.categoryCount}; runs: ${report.summary.passedRuns}/${report.summary.runCount}; comparisons: ${report.summary.comparisonCount}; region-v2 average crops: ${report.summary.regionV2AverageCropCount}; region quality: ${report.summary.regionV2AverageRegionQuality}; path leak: ${report.summary.pathLeakDetected ? 'yes' : 'no'}</p>
<h2>Runs</h2>
<table><thead><tr><th>Fixture</th><th>Mode</th><th>Status</th><th>Latency ms</th><th>Quality</th><th>Region-v2 crops</th><th>Region quality</th><th>Failures</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Mode Comparisons</h2>
<table><thead><tr><th>Fixture</th><th>Pair</th><th>Quality delta</th><th>Region count delta</th><th>Crop asset delta</th><th>Region-v2 crop delta</th><th>Region quality delta</th><th>Latency delta ms</th></tr></thead><tbody>${comparisonRows}</tbody></table>
</html>`;
}

function renderSvg(report) {
  const width = 980;
  const height = 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="32" y="48" font-family="Arial" font-size="24" font-weight="700" fill="#0f172a">GeotechCLI Preprocessing Fixture Benchmark</text>
  <text x="32" y="86" font-family="Arial" font-size="18" fill="${report.summary.passed ? '#047857' : '#b91c1c'}">Status: ${report.summary.passed ? 'PASS' : 'FAIL'}</text>
  <text x="32" y="122" font-family="Arial" font-size="15" fill="#334155">Runs: ${report.summary.passedRuns}/${report.summary.runCount} | Fixtures: ${report.summary.fixtureCount} | Avg latency: ${report.summary.averageLatencyMs} ms</text>
  <text x="32" y="152" font-family="Arial" font-size="15" fill="#334155">Mode comparisons: ${report.summary.comparisonCount} | Region-v2 average crops: ${report.summary.regionV2AverageCropCount} | Avg region quality: ${report.summary.regionV2AverageRegionQuality}</text>
  <text x="32" y="182" font-family="Arial" font-size="15" fill="#334155">Path leak detected: ${report.summary.pathLeakDetected ? 'yes' : 'no'}</text>
</svg>`;
}

function renderTrendHtml(trend) {
  const delta = trend.delta;
  const runRows = trend.runDeltas.map((run) => `
    <tr>
      <td>${escapeHtml(run.fixtureId)}</td>
      <td>${escapeHtml(run.mode ?? 'missing')}</td>
      <td>${escapeHtml(run.status)}</td>
      <td class="${run.passed ? 'pass' : 'fail'}">${run.passed ? 'PASS' : 'FAIL'}</td>
      <td>${formatDelta(run.qualityDelta)}</td>
      <td>${formatDelta(run.regionV2CropDelta)}</td>
      <td>${formatDelta(run.regionQualityDelta)}</td>
      <td>${formatDelta(run.latencyDeltaMs)}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>GeotechCLI Preprocessing Fixture Trend</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;background:#f8fafc;color:#0f172a}
table{border-collapse:collapse;width:100%;margin:16px 0;background:white}
th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}
th{background:#e2e8f0}.pass{color:#047857}.fail{color:#b91c1c}.note{color:#475569}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}.metric{background:white;border:1px solid #cbd5e1;padding:12px}.metric strong{display:block;font-size:22px}
</style>
<h1>GeotechCLI Preprocessing Fixture Trend</h1>
<p class="note">${escapeHtml(trend.note)} Generated ${escapeHtml(trend.generatedAt)}.</p>
<section class="metrics">
  <div class="metric"><span>History entries</span><strong>${trend.historyCount}</strong></div>
  <div class="metric"><span>Run delta</span><strong>${delta ? signed(delta.runCount) : 'new'}</strong></div>
  <div class="metric"><span>Pass delta</span><strong>${delta ? signed(delta.passedRuns) : 'new'}</strong></div>
  <div class="metric"><span>Region crop delta</span><strong>${delta ? signed(delta.regionV2AverageCropCount) : 'new'}</strong></div>
  <div class="metric"><span>Region quality delta</span><strong>${delta ? signed(delta.regionV2AverageRegionQuality) : 'new'}</strong></div>
  <div class="metric"><span>Path leak delta</span><strong>${delta ? signed(delta.pathLeakCount) : 'new'}</strong></div>
</section>
<table><thead><tr><th>Fixture</th><th>Mode</th><th>Status</th><th>Pass</th><th>Quality delta</th><th>Region-v2 crop delta</th><th>Region quality delta</th><th>Latency delta ms</th></tr></thead><tbody>${runRows}</tbody></table>
</html>`;
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readOutputDir(fallback) {
  const explicit = readOption('--out', null);
  if (explicit) return explicit;
  const positional = process.argv.slice(2).find((value) => value && !value.startsWith('-'));
  return positional ?? fallback;
}

function readListOption(name, fallback) {
  return readOption(name, fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readPreprocessingHistory(filePath) {
  const parsed = existsSync(filePath) ? safeReadJson(filePath) : null;
  return Array.isArray(parsed)
    ? parsed.filter((item) => item?.kind === 'geotech-preprocessing-fixture-history-entry')
    : [];
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function signed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatDelta(value) {
  return value == null ? 'new' : signed(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

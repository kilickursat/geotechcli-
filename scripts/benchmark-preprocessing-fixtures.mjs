#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

if (!existsSync(corePreprocessEntry)) {
  console.error(`Core preprocessing build was not found: ${corePreprocessEntry}`);
  console.error('Run npm run build before npm run benchmark:preprocessing.');
  process.exit(1);
}

const { renderPdfPageToImageBuffer } = await import(pathToFileURL(corePreprocessEntry).href);

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

const comparisons = buildComparisons(runs);
const report = {
  kind: 'geotech-preprocessing-fixture-benchmark',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  modes,
  summary: summarize(runs),
  fixtures: fixtures.map(({ id, category, fileName, page }) => ({ id, category, fileName, page })),
  runs,
  comparisons,
};
const serialized = JSON.stringify(report, null, 2);
const leakPatterns = [repoRoot, process.env.USERPROFILE, process.env.HOME].filter(Boolean);
const leaked = leakPatterns.some((pattern) => serialized.includes(pattern));
report.summary.pathLeakDetected = leaked;
report.summary.passed = report.summary.passed && !leaked;

writeFileSync(join(outputDir, 'preprocessing-fixture-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
writeFileSync(join(outputDir, 'preprocessing-fixture-summary.html'), renderHtml(report), 'utf-8');
writeFileSync(join(outputDir, 'preprocessing-fixture-summary.svg'), renderSvg(report), 'utf-8');

console.log(`Preprocessing fixture benchmark: ${report.summary.passed ? 'PASS' : 'FAIL'}`);
console.log(`Output: ${outputDir}`);
console.log(`Runs: ${report.summary.passedRuns}/${report.summary.runCount} passed`);
console.log(`Region-v2 average crops: ${report.summary.regionV2AverageCropCount}`);
console.log(`Region-v2 average region quality: ${report.summary.regionV2AverageRegionQuality}`);
console.log(`Path leak detected: ${report.summary.pathLeakDetected ? 'yes' : 'no'}`);

if (!report.summary.passed) {
  process.exit(1);
}

function buildComparisons(allRuns) {
  const byFixture = new Map();
  for (const run of allRuns) {
    if (!run.mode) continue;
    const key = `${run.fixtureId}:${run.page}`;
    const list = byFixture.get(key) ?? [];
    list.push(run);
    byFixture.set(key, list);
  }
  const comparisons = [];
  for (const list of byFixture.values()) {
    const baseline = list.find((run) => run.mode === 'none');
    const region = list.find((run) => run.mode === 'region-v2');
    if (!baseline || !region) continue;
    comparisons.push({
      fixtureId: region.fixtureId,
      page: region.page,
      currentMode: 'region-v2',
      baselineMode: 'none',
      qualityDelta: round((region.preprocessing?.qualityScore ?? 0) - (baseline.preprocessing?.qualityScore ?? 0)),
      regionCountDelta: (region.preprocessing?.regionCount ?? 0) - (baseline.preprocessing?.regionCount ?? 0),
      cropAssetDelta: (region.preprocessing?.cropAssetCount ?? 0) - (baseline.preprocessing?.cropAssetCount ?? 0),
      regionQualityDelta: round((region.preprocessing?.averageRegionQuality ?? 0) - (baseline.preprocessing?.averageRegionQuality ?? 0)),
      latencyDeltaMs: region.latencyMs - baseline.latencyMs,
    });
  }
  return comparisons;
}

function summarize(allRuns) {
  const regionRuns = allRuns.filter((run) => run.mode === 'region-v2');
  const passedRuns = allRuns.filter((run) => run.passed).length;
  const runCount = allRuns.length;
  return {
    fixtureCount: fixtures.length,
    runCount,
    passedRuns,
    failedRuns: runCount - passedRuns,
    passed: runCount > 0 && passedRuns === runCount,
    modes,
    averageLatencyMs: round(avg(allRuns.map((run) => run.latencyMs).filter(Number.isFinite))),
    regionV2AverageCropCount: round(avg(regionRuns.map((run) => run.preprocessing?.regionV2CropCount ?? 0))),
    regionV2AverageRegionQuality: round(avg(regionRuns.map((run) => run.preprocessing?.averageRegionQuality ?? 0))),
    pathLeakDetected: false,
  };
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
      <td>${comparison.qualityDelta}</td>
      <td>${comparison.regionCountDelta}</td>
      <td>${comparison.cropAssetDelta}</td>
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
<p>Fixtures: ${report.summary.fixtureCount}; runs: ${report.summary.passedRuns}/${report.summary.runCount}; region-v2 average crops: ${report.summary.regionV2AverageCropCount}; region quality: ${report.summary.regionV2AverageRegionQuality}; path leak: ${report.summary.pathLeakDetected ? 'yes' : 'no'}</p>
<h2>Runs</h2>
<table><thead><tr><th>Fixture</th><th>Mode</th><th>Status</th><th>Latency ms</th><th>Quality</th><th>Region-v2 crops</th><th>Region quality</th><th>Failures</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Region-v2 versus none</h2>
<table><thead><tr><th>Fixture</th><th>Quality delta</th><th>Region count delta</th><th>Crop asset delta</th><th>Region quality delta</th><th>Latency delta ms</th></tr></thead><tbody>${comparisonRows}</tbody></table>
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
  <text x="32" y="152" font-family="Arial" font-size="15" fill="#334155">Region-v2 average crops: ${report.summary.regionV2AverageCropCount} | Avg region quality: ${report.summary.regionV2AverageRegionQuality}</text>
  <text x="32" y="182" font-family="Arial" font-size="15" fill="#334155">Path leak detected: ${report.summary.pathLeakDetected ? 'yes' : 'no'}</text>
</svg>`;
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function avg(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

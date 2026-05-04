#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPdf = process.platform === 'win32'
  ? join(process.env.USERPROFILE ?? 'C:\\Users\\Databil', 'GeotechnicalInvestigationReport (1).pdf')
  : '';
const pdfPath = resolve(process.env.GEOTECHCLI_BENCHMARK_PDF || defaultPdf || 'GeotechnicalInvestigationReport (1).pdf');
const outputDir = resolve(process.env.GEOTECHCLI_BENCHMARK_OUTPUT_DIR || '__benchmark-geotech-report');
const configDir = resolve(process.env.GEOTECHCLI_CONFIG_DIR || join(outputDir, 'config'));
const cliEntry = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const required = process.env.GEOTECHCLI_BENCHMARK_REQUIRED === '1';

if (!existsSync(pdfPath)) {
  const message = [
    `Benchmark PDF was not found: ${pdfPath}`,
    'Set GEOTECHCLI_BENCHMARK_PDF to a local geotechnical report PDF to run this benchmark.',
  ].join('\n');
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}

if (!existsSync(cliEntry)) {
  console.error(`CLI build was not found: ${cliEntry}`);
  console.error('Run npm run build before npm run benchmark:geotech-report.');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(configDir, { recursive: true });

const firstOutput = join(outputDir, 'first.benchmark.json');
const secondOutput = join(outputDir, 'second.benchmark.json');
const comparisonOutput = join(outputDir, 'comparison.json');

const baseEnv = {
  ...process.env,
  GEOTECHCLI_CONFIG_DIR: configDir,
};

runBenchmark('first run', firstOutput, baseEnv);
runBenchmark('cached rerun', secondOutput, baseEnv);

const first = readJson(firstOutput);
const second = readJson(secondOutput);
const comparison = compareBenchmarks(first, second);
writeFileSync(comparisonOutput, `${JSON.stringify(comparison, null, 2)}\n`);

renderSummary(first, second, comparison, comparisonOutput);

if (!comparison.passed) {
  process.exit(1);
}

function runBenchmark(label, outputPath, env) {
  console.log(`\nRunning ${label}...`);
  const result = spawnSync(process.execPath, [
    cliEntry,
    'ingest',
    pdfPath,
    '--type',
    'geotech-document',
    '--format',
    'benchmark',
    '--output',
    outputPath,
  ], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function compareBenchmarks(first, second) {
  const firstCalls = totalHostedCalls(first);
  const secondCalls = totalHostedCalls(second);
  const cacheHitRateDelta = Number((second.evidenceCache.hitRate - first.evidenceCache.hitRate).toFixed(3));
  const hostedCallDelta = secondCalls - firstCalls;
  const traceabilityDelta = Number(
    (second.traceability.directParameterTraceabilityRate - first.traceability.directParameterTraceabilityRate).toFixed(3),
  );
  const readinessDelta = second.groundModelReadiness.score - first.groundModelReadiness.score;
  const regressions = [
    second.evidenceCache.hitRate < 0.95
      ? `Cached rerun hit rate ${formatPercent(second.evidenceCache.hitRate)} is below 95%.`
      : null,
    secondCalls > 0
      ? `Cached rerun still estimates ${secondCalls} hosted calls.`
      : null,
    second.traceability.directParameterTraceabilityRate < 0.95
      ? `Direct parameter source-page traceability ${formatPercent(second.traceability.directParameterTraceabilityRate)} is below 95%.`
      : null,
    second.traceability.parametersWithoutSourcePage > 1
      ? `${second.traceability.parametersWithoutSourcePage} parameters have no direct source page.`
      : null,
    second.groundModelReadiness.score < 55
      ? `GroundModel readiness score ${second.groundModelReadiness.score}/100 is below the current acceptance floor.`
      : null,
    second.source.successfulPages < second.source.totalPages
      ? `Only ${second.source.successfulPages}/${second.source.totalPages} pages were processed.`
      : null,
  ].filter(Boolean);

  return {
    kind: 'geotech-document-local-benchmark-comparison',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: second.source,
    outputDir,
    configDir,
    delta: {
      cacheHitRate: cacheHitRateDelta,
      estimatedHostedCalls: hostedCallDelta,
      directParameterTraceabilityRate: traceabilityDelta,
      groundModelReadinessScore: readinessDelta,
    },
    firstRun: summarizeRun(first),
    cachedRerun: summarizeRun(second),
    passed: regressions.length === 0,
    regressions,
  };
}

function summarizeRun(benchmark) {
  return {
    confidence: benchmark.document.confidence,
    parseStatus: benchmark.document.parseStatus,
    cacheHitRate: benchmark.evidenceCache.hitRate,
    estimatedHostedCalls: totalHostedCalls(benchmark),
    parametersWithSourcePage: benchmark.traceability.parametersWithSourcePage,
    parametersWithoutSourcePage: benchmark.traceability.parametersWithoutSourcePage,
    directParameterTraceabilityRate: benchmark.traceability.directParameterTraceabilityRate,
    groundModelReadinessScore: benchmark.groundModelReadiness.score,
    groundModelReadinessStatus: benchmark.groundModelReadiness.status,
    gates: benchmark.groundModelReadiness.gates,
  };
}

function totalHostedCalls(benchmark) {
  return benchmark.hostedCallEstimate.pageExtraction
    + benchmark.hostedCallEstimate.layoutOcr
    + benchmark.hostedCallEstimate.vision;
}

function renderSummary(first, second, comparison, comparisonOutputPath) {
  console.log('\nGeotechnical report benchmark');
  console.log(`PDF: ${pdfPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Config/cache: ${configDir}`);
  console.log(`First run cache hit rate: ${formatPercent(first.evidenceCache.hitRate)}`);
  console.log(`Cached rerun cache hit rate: ${formatPercent(second.evidenceCache.hitRate)}`);
  console.log(`First run estimated hosted calls: ${totalHostedCalls(first)}`);
  console.log(`Cached rerun estimated hosted calls: ${totalHostedCalls(second)}`);
  console.log(`Cached rerun direct source-page traceability: ${formatPercent(second.traceability.directParameterTraceabilityRate)}`);
  console.log(`Cached rerun GroundModel readiness: ${second.groundModelReadiness.status} (${second.groundModelReadiness.score}/100)`);
  console.log(`Comparison: ${comparisonOutputPath}`);
  if (comparison.passed) {
    console.log('Acceptance: passed');
  } else {
    console.error('Acceptance: failed');
    for (const regression of comparison.regressions) {
      console.error(`- ${regression}`);
    }
  }
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

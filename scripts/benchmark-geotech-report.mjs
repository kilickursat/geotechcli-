#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPdf = process.platform === 'win32'
  ? join(process.env.USERPROFILE ?? 'C:\\Users\\Databil', 'GeotechnicalInvestigationReport (1).pdf')
  : '';
const pdfPath = resolve(process.env.GEOTECHCLI_BENCHMARK_PDF || defaultPdf || 'GeotechnicalInvestigationReport (1).pdf');
const outputDir = resolve(process.env.GEOTECHCLI_BENCHMARK_OUTPUT_DIR || '__benchmark-geotech-report');
const configDir = resolve(process.env.GEOTECHCLI_CONFIG_DIR || join(outputDir, 'config'));
const cliEntry = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const coreBenchmarkEntry = join(repoRoot, 'packages', 'core', 'dist', 'ingest', 'geotech-document-benchmark.js');
const required = process.env.GEOTECHCLI_BENCHMARK_REQUIRED === '1';

if (!existsSync(coreBenchmarkEntry)) {
  console.error(`Core benchmark build was not found: ${coreBenchmarkEntry}`);
  console.error('Run npm run build before npm run benchmark:geotech-report.');
  process.exit(1);
}

const { compareGeotechDocumentBenchmarks } = await import(pathToFileURL(coreBenchmarkEntry).href);

if (isMainModule()) {
  await main(process.argv.slice(2));
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const firstOutput = resolve(args.first ?? join(outputDir, 'first.benchmark.json'));
  const secondOutput = resolve(args.second ?? join(outputDir, 'second.benchmark.json'));
  const comparisonOutput = resolve(args.output ?? args.comparison ?? join(outputDir, 'comparison.json'));
  const firstPreprocessingMode = args.firstPreprocessingMode ?? args.preprocessingMode;
  const secondPreprocessingMode = args.secondPreprocessingMode ?? args.preprocessingMode;

  if (args.compareOnly) {
    if (!args.first || !args.second) {
      console.error('Compare-only mode requires --first <benchmark.json> and --second <benchmark.json>.');
      process.exit(1);
    }
    mkdirSync(dirname(comparisonOutput), { recursive: true });
    const first = readJson(firstOutput);
    const second = readJson(secondOutput);
    const comparison = compareBenchmarks(first, second);
    writeFileSync(comparisonOutput, `${JSON.stringify(comparison, null, 2)}\n`);
    renderSummary(first, second, comparison, comparisonOutput);
    if (!comparison.passed) {
      process.exit(1);
    }
    return;
  }

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
    return;
  }

  if (!existsSync(cliEntry)) {
    console.error(`CLI build was not found: ${cliEntry}`);
    console.error('Run npm run build before npm run benchmark:geotech-report.');
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  const baseEnv = {
    ...process.env,
    GEOTECHCLI_CONFIG_DIR: configDir,
  };

  runBenchmark('first run', firstOutput, {
    ...baseEnv,
    ...(firstPreprocessingMode ? { GEOTECHCLI_PREPROCESSING_MODE: firstPreprocessingMode } : {}),
  });
  runBenchmark('cached rerun', secondOutput, {
    ...baseEnv,
    ...(secondPreprocessingMode ? { GEOTECHCLI_PREPROCESSING_MODE: secondPreprocessingMode } : {}),
  });

  const first = readJson(firstOutput);
  const second = readJson(secondOutput);
  const comparison = compareBenchmarks(first, second);
  writeFileSync(comparisonOutput, `${JSON.stringify(comparison, null, 2)}\n`);

  renderSummary(first, second, comparison, comparisonOutput);

  if (!comparison.passed) {
    process.exit(1);
  }
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

function isMainModule() {
  return process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function parseArgs(argv) {
  const parsed = {
    compareOnly: false,
    first: undefined,
    second: undefined,
    output: undefined,
    comparison: undefined,
    preprocessingMode: undefined,
    firstPreprocessingMode: undefined,
    secondPreprocessingMode: undefined,
  };

  if (argv.length >= 2 && !String(argv[0] ?? '').startsWith('--')) {
    return {
      ...parsed,
      compareOnly: true,
      first: argv[0],
      second: argv[1],
      output: argv[2],
    };
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--compare-only') {
      parsed.compareOnly = true;
      continue;
    }
    if (
      arg === '--first'
      || arg === '--second'
      || arg === '--output'
      || arg === '--comparison'
      || arg === '--preprocessing-mode'
      || arg === '--first-preprocessing-mode'
      || arg === '--second-preprocessing-mode'
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        console.error(`${arg} requires a value.`);
        process.exit(1);
      }
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      parsed[key] = value;
      index += 1;
      continue;
    }
    console.error(`Unknown benchmark option: ${arg}`);
    process.exit(1);
  }

  return parsed;
}

export function compareBenchmarks(first, second) {
  const generatedAt = new Date().toISOString();
  const coreComparison = compareGeotechDocumentBenchmarks(second, first, { generatedAt });
  const firstCalls = totalHostedCalls(first);
  const secondCalls = totalHostedCalls(second);
  const cacheHitRateDelta = Number((second.evidenceCache.hitRate - first.evidenceCache.hitRate).toFixed(3));
  const hostedCallDelta = secondCalls - firstCalls;
  const traceabilityDelta = Number(
    (second.traceability.directParameterTraceabilityRate - first.traceability.directParameterTraceabilityRate).toFixed(3),
  );
  const readinessDelta = second.groundModelReadiness.score - first.groundModelReadiness.score;
  const firstModes = preprocessingModes(first);
  const secondModes = preprocessingModes(second);
  const comparisonMode = firstModes.join(',') === secondModes.join(',')
    ? 'cached-rerun'
    : 'preprocessing-mode';
  const regressions = [
    comparisonMode === 'cached-rerun' && second.evidenceCache.hitRate < 0.95
      ? `Cached rerun hit rate ${formatPercent(second.evidenceCache.hitRate)} is below 95%.`
      : null,
    comparisonMode === 'cached-rerun' && secondCalls > 0
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
    ...coreComparison.regressions,
  ].filter(Boolean);
  const uniqueRegressions = [...new Set(regressions)];

  return {
    kind: 'geotech-document-local-benchmark-comparison',
    schemaVersion: 2,
    generatedAt,
    source: second.source,
    outputDir,
    configDir,
    comparisonMode,
    delta: {
      cacheHitRate: cacheHitRateDelta,
      estimatedHostedCalls: hostedCallDelta,
      directParameterTraceabilityRate: traceabilityDelta,
      groundModelReadinessScore: readinessDelta,
      preprocessing: {
        firstModes,
        secondModes,
        averageQualityScore: Number(((second.preprocessing?.averageQualityScore ?? 0) - (first.preprocessing?.averageQualityScore ?? 0)).toFixed(3)),
        averageRegionQualityScore: Number(((second.preprocessing?.averageRegionQualityScore ?? 0) - (first.preprocessing?.averageRegionQualityScore ?? 0)).toFixed(3)),
        pagesDeskewed: (second.preprocessing?.pagesDeskewed ?? 0) - (first.preprocessing?.pagesDeskewed ?? 0),
        persistedRegionAssets: (second.preprocessing?.persistedRegionAssets ?? 0) - (first.preprocessing?.persistedRegionAssets ?? 0),
      },
    },
    firstRun: summarizeRun(first),
    cachedRerun: summarizeRun(second),
    coreComparison: {
      kind: coreComparison.kind,
      schemaVersion: coreComparison.schemaVersion,
      baselineLabel: coreComparison.baselineLabel,
      currentLabel: coreComparison.currentLabel,
      delta: coreComparison.delta,
      passed: coreComparison.passed,
      regressions: coreComparison.regressions,
    },
    passed: uniqueRegressions.length === 0,
    regressions: uniqueRegressions,
  };
}

function summarizeRun(benchmark) {
  return {
    reviewConfidence: benchmark.document.confidence,
    confidenceBreakdown: benchmark.document.confidenceBreakdown
      ? {
          extractionConfidence: benchmark.document.confidenceBreakdown.extractionConfidence,
          pageEvidenceConfidence: benchmark.document.confidenceBreakdown.pageEvidenceConfidence,
          traceabilityScore: benchmark.document.confidenceBreakdown.traceabilityScore,
          corroborationScore: benchmark.document.confidenceBreakdown.corroborationScore,
          engineeringCompleteness: benchmark.document.confidenceBreakdown.engineeringCompleteness,
          readinessScore: benchmark.document.confidenceBreakdown.readinessScore,
          missingCriticalData: benchmark.document.confidenceBreakdown.missingCriticalData,
          reviewGates: benchmark.document.confidenceBreakdown.reviewGates,
        }
      : null,
    parseStatus: benchmark.document.parseStatus,
    cacheHitRate: benchmark.evidenceCache.hitRate,
    estimatedHostedCalls: totalHostedCalls(benchmark),
    parametersWithSourcePage: benchmark.traceability.parametersWithSourcePage,
    parametersWithoutSourcePage: benchmark.traceability.parametersWithoutSourcePage,
    directParameterTraceabilityRate: benchmark.traceability.directParameterTraceabilityRate,
    groundModelReadinessScore: benchmark.groundModelReadiness.score,
    groundModelReadinessStatus: benchmark.groundModelReadiness.status,
    gates: benchmark.groundModelReadiness.gates,
    preprocessing: benchmark.preprocessing
      ? {
          versions: benchmark.preprocessing.versions,
          modes: benchmark.preprocessing.modes ?? [],
          pagesWithRegions: benchmark.preprocessing.pagesWithRegions,
          totalRegions: benchmark.preprocessing.totalRegions,
          preprocessingRegions: benchmark.preprocessing.preprocessingRegions,
          persistedRegionAssets: benchmark.preprocessing.persistedRegionAssets,
          pagesDeskewed: benchmark.preprocessing.pagesDeskewed ?? 0,
          averageDeskewAngleDeg: benchmark.preprocessing.averageDeskewAngleDeg ?? 0,
          averageQualityScore: benchmark.preprocessing.averageQualityScore ?? 0,
          averageRegionQualityScore: benchmark.preprocessing.averageRegionQualityScore ?? 0,
          lowQualityRegions: benchmark.preprocessing.lowQualityRegions ?? 0,
          qualityWarningCounts: benchmark.preprocessing.qualityWarningCounts ?? {},
        }
      : null,
    femDraftReadiness: benchmark.femDraftReadiness
      ? {
          candidateRoutes: benchmark.femDraftReadiness.candidateRoutes,
          implementedPreviewRoutes: benchmark.femDraftReadiness.implementedPreviewRoutes,
          contractOnlyRoutes: benchmark.femDraftReadiness.contractOnlyRoutes,
          canAutoProceed: benchmark.femDraftReadiness.canAutoProceed,
          agentRunAllowedRoutes: benchmark.femDraftReadiness.agentRunAllowedRoutes,
          agentWebglAllowedRoutes: benchmark.femDraftReadiness.agentWebglAllowedRoutes,
          agentResultManifestAllowedRoutes: benchmark.femDraftReadiness.agentResultManifestAllowedRoutes,
          caseOutputAvailableRoutes: benchmark.femDraftReadiness.caseOutputAvailableRoutes,
          humanRunCommandAvailableRoutes: benchmark.femDraftReadiness.humanRunCommandAvailableRoutes,
          staleRunCommandRoutes: benchmark.femDraftReadiness.staleRunCommandRoutes,
        }
      : null,
  };
}

function preprocessingModes(benchmark) {
  const modes = benchmark.preprocessing?.modes;
  if (Array.isArray(modes) && modes.length > 0) {
    return [...new Set(modes)].sort();
  }
  return ['unknown'];
}

function totalHostedCalls(benchmark) {
  return benchmark.hostedCallEstimate.pageExtraction
    + benchmark.hostedCallEstimate.layoutOcr
    + benchmark.hostedCallEstimate.vision;
}

function renderSummary(first, second, comparison, comparisonOutputPath) {
  console.log('\nGeotechnical report benchmark');
  console.log(`PDF: ${second.source?.fileName ?? pdfPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Config/cache: ${configDir}`);
  console.log(`First run cache hit rate: ${formatPercent(first.evidenceCache.hitRate)}`);
  console.log(`Cached rerun cache hit rate: ${formatPercent(second.evidenceCache.hitRate)}`);
  console.log(`First run estimated hosted calls: ${totalHostedCalls(first)}`);
  console.log(`Cached rerun estimated hosted calls: ${totalHostedCalls(second)}`);
  if (second.preprocessing) {
    console.log(
      `Cached rerun preprocessing: modes ${(second.preprocessing.modes ?? []).join(', ') || 'unknown'}, quality ${formatPercent(second.preprocessing.averageQualityScore ?? 0)}, region quality ${formatPercent(second.preprocessing.averageRegionQualityScore ?? 0)}, deskewed pages ${second.preprocessing.pagesDeskewed ?? 0}`,
    );
  }
  if (second.document.confidenceBreakdown) {
    console.log(
      `Cached rerun Trust breakdown: extraction ${second.document.confidenceBreakdown.extractionConfidence}%, page evidence ${second.document.confidenceBreakdown.pageEvidenceConfidence}%, traceability ${second.document.confidenceBreakdown.traceabilityScore}%, readiness ${second.document.confidenceBreakdown.readinessScore}%`,
    );
  }
  console.log(`Cached rerun direct source-page traceability: ${formatPercent(second.traceability.directParameterTraceabilityRate)}`);
  console.log(`Cached rerun GroundModel readiness: ${second.groundModelReadiness.status} (${second.groundModelReadiness.score}/100)`);
  if (second.femDraftReadiness) {
    const implementedRoutes = second.femDraftReadiness.implementedPreviewRoutes ?? [];
    const contractOnlyRoutes = second.femDraftReadiness.contractOnlyRoutes ?? [];
    console.log(
      `Cached rerun FEM draft readiness: ${implementedRoutes.length}/${second.femDraftReadiness.candidateRoutes} implemented, ${contractOnlyRoutes.length} contract-only, agent-run routes ${routeList(second.femDraftReadiness.agentRunAllowedRoutes)}, agent-WebGL routes ${routeList(second.femDraftReadiness.agentWebglAllowedRoutes)}`,
    );
  }
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

function routeList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'none';
}

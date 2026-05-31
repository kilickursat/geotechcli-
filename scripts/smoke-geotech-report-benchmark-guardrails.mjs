#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBenchmarks } from './benchmark-geotech-report.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(
  repoRoot,
  'packages',
  'core',
  'tests',
  'fixtures',
  'geotechnical-investigation-benchmark.v1.json',
);
const outDir = resolve(process.env.GEOTECHCLI_BENCHMARK_GUARDRAIL_OUT || '__benchmark-geotech-report-guardrail-smoke');

if (!existsSync(fixturePath)) {
  throw new Error(`Benchmark fixture not found: ${fixturePath}`);
}

mkdirSync(outDir, { recursive: true });

const fixture = readJson(fixturePath);
const safeFirst = clone(fixture);
const safeSecond = clone(fixture);
safeFirst.label = 'guardrail-safe-baseline';
safeSecond.label = 'guardrail-safe-current';

const safeFirstPath = join(outDir, 'safe.first.benchmark.json');
const safeSecondPath = join(outDir, 'safe.second.benchmark.json');
const safeComparisonPath = join(outDir, 'safe.comparison.json');
writeJson(safeFirstPath, safeFirst);
writeJson(safeSecondPath, safeSecond);

const safeComparison = runCompare(safeFirstPath, safeSecondPath, safeComparisonPath);
assert(safeComparison.schemaVersion === 2, 'Safe comparison did not use local benchmark comparison schema v2.');
assert(safeComparison.passed === true, 'Safe comparison did not pass.');
assert(safeComparison.coreComparison?.passed === true, 'Safe comparison did not embed a passing core comparison.');
assert(
  safeComparison.cachedRerun?.femDraftReadiness?.agentRunAllowedRoutes?.length === 0,
  'Safe comparison exposed agent-run FEM routes.',
);

const unsafeFirst = clone(fixture);
const unsafeSecond = clone(fixture);
unsafeFirst.label = 'guardrail-unsafe-baseline';
unsafeSecond.label = 'guardrail-unsafe-current';
injectUnsafeFemBoundary(unsafeSecond);

const unsafeFirstPath = join(outDir, 'unsafe.first.benchmark.json');
const unsafeSecondPath = join(outDir, 'unsafe.second.benchmark.json');
const unsafeComparisonPath = join(outDir, 'unsafe.comparison.json');
writeJson(unsafeFirstPath, unsafeFirst);
writeJson(unsafeSecondPath, unsafeSecond);

const unsafeComparison = runCompare(unsafeFirstPath, unsafeSecondPath, unsafeComparisonPath);
assert(unsafeComparison.passed === false, 'Unsafe benchmark comparison unexpectedly passed.');
const regressions = unsafeComparison.regressions ?? [];
assert(unsafeComparison.passed === false, 'Unsafe comparison did not mark passed=false.');
assert(
  regressions.some((message) => /agent-run routes/i.test(message) || /agent solver execution/i.test(message)),
  'Unsafe comparison did not report agent solver execution exposure.',
);
assert(
  regressions.some((message) => /agent WebGL/i.test(message) || /WebGL rendering/i.test(message)),
  'Unsafe comparison did not report agent WebGL exposure.',
);
assert(
  regressions.some((message) => /result-manifest/i.test(message)),
  'Unsafe comparison did not report result-manifest exposure.',
);
assert(
  regressions.some((message) => /unreviewed case-output/i.test(message) || /unreviewed case output/i.test(message)),
  'Unsafe comparison did not report unreviewed case output exposure.',
);
assert(
  regressions.some((message) => /unreviewed human-run/i.test(message) || /unreviewed human run command/i.test(message)),
  'Unsafe comparison did not report unreviewed human run command exposure.',
);
assert(
  regressions.some((message) => /stale run commands/i.test(message) || /run command instead of a draft command/i.test(message)),
  'Unsafe comparison did not report stale FEM run command exposure.',
);

console.log(JSON.stringify({
  ok: true,
  outDir,
  safe: {
    passed: safeComparison.passed,
    schemaVersion: safeComparison.schemaVersion,
  },
  unsafe: {
    wouldExitWith: unsafeComparison.passed ? 0 : 1,
    passed: unsafeComparison.passed,
    regressionCount: regressions.length,
    regressions,
  },
}, null, 2));

function runCompare(firstPath, secondPath, comparisonPath) {
  const comparison = compareBenchmarks(readJson(firstPath), readJson(secondPath));
  writeJson(comparisonPath, comparison);
  return comparison;
}

function injectUnsafeFemBoundary(benchmark) {
  const fem = benchmark.femDraftReadiness;
  assert(fem, 'Fixture has no femDraftReadiness block.');
  const objective = 'foundation-settlement';
  fem.canAutoProceed = true;
  fem.agentRunAllowedRoutes = [objective];
  fem.agentWebglAllowedRoutes = [objective];
  fem.agentResultManifestAllowedRoutes = [objective];
  fem.caseOutputAvailableRoutes = [objective];
  fem.humanRunCommandAvailableRoutes = [objective];
  fem.staleRunCommandRoutes = [objective];
  const route = fem.routes.find((candidate) => candidate.objective === objective);
  assert(route, `Fixture has no ${objective} FEM route.`);
  route.agentRunAllowed = true;
  route.recommendedCommand = 'geotech fem run analysis_case.json --experimental';
  route.executionBoundary.agentRunAllowed = true;
  route.executionBoundary.agentWebglRenderAllowed = true;
  route.executionBoundary.agentResultManifestAllowed = true;
  route.executionBoundary.caseOutputAvailable = true;
  route.executionBoundary.humanRunCommandAvailable = true;
  route.executionBoundary.humanReviewRequired = false;
  route.executionBoundary.humanRunCommand = 'geotech fem run analysis_case.json --experimental';
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

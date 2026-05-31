#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(readOption('--out', process.env.GEOTECHCLI_SIGNAL_BENCHMARK_OUTPUT_DIR || '__benchmark-signal-analysis'));
const fixtureWorkspace = resolve(readOption('--workspace', process.env.GEOTECHCLI_SIGNAL_BENCHMARK_WORKSPACE || join(outputDir, 'fixture-workspace')));
const cliEntry = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const comparisonOutput = join(outputDir, 'comparison.json');
const summarySvgOutput = join(outputDir, 'summary.svg');
const directSignalOutput = join(outputDir, 'direct-settlement-signal.json');

if (!isInside(outputDir, fixtureWorkspace)) {
  console.error(`Refusing to prepare a signal benchmark fixture outside the output directory: ${fixtureWorkspace}`);
  process.exit(1);
}

if (!existsSync(cliEntry)) {
  console.error(`CLI build was not found: ${cliEntry}`);
  console.error('Run npm run build before npm run benchmark:signal-analysis.');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
prepareSyntheticSignalWorkspace(fixtureWorkspace);

const result = spawnSync(process.execPath, [
  cliEntry,
  'agent',
  '--task',
  'signal-analysis',
  '--workspace',
  fixtureWorkspace,
  '--json',
], {
  cwd: repoRoot,
  env: process.env,
  encoding: 'utf-8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(`Signal analysis benchmark CLI run failed with status ${result.status ?? 'unknown'}.`);
  if (result.error) console.error(result.error.message);
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const directResult = spawnSync(process.execPath, [
  cliEntry,
  'signal',
  'analyze',
  safePath(join(fixtureWorkspace, 'monitoring', 'settlement.csv')),
  '--type',
  'settlement',
  '--threshold-profile',
  'auto',
  '--output',
  safePath(directSignalOutput),
  '--json',
], {
  cwd: repoRoot,
  env: process.env,
  encoding: 'utf-8',
  windowsHide: true,
});

if (directResult.status !== 0) {
  console.error(`Direct signal benchmark CLI run failed with status ${directResult.status ?? 'unknown'}.`);
  if (directResult.error) console.error(directResult.error.message);
  if (directResult.stdout) console.error(directResult.stdout);
  if (directResult.stderr) console.error(directResult.stderr);
  process.exit(directResult.status ?? 1);
}

const runDir = findWorkflowRunDir(join(fixtureWorkspace, '.geotech', 'runs'));
const workflow = readJson(join(runDir, 'workflow_result.json'));
const signalIndexPath = join(runDir, 'signals', 'index.json');
const signalIndex = existsSync(signalIndexPath) ? readJson(signalIndexPath) : null;
const modelCalls = existsSync(join(runDir, 'model_calls.jsonl'))
  ? readFileSync(join(runDir, 'model_calls.jsonl'), 'utf-8')
  : '';
const toolCalls = existsSync(join(runDir, 'tool_calls.jsonl'))
  ? readFileSync(join(runDir, 'tool_calls.jsonl'), 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  : [];
const analysisArtifacts = existsSync(join(runDir, 'signals'))
  ? readdirSync(join(runDir, 'signals'))
    .filter((entry) => entry.endsWith('.analysis.json'))
    .map((entry) => readJson(join(runDir, 'signals', entry)))
  : [];
const directSignal = redactSignalOutputPaths(readJson(directSignalOutput));
writeFileSync(directSignalOutput, `${JSON.stringify(directSignal, null, 2)}\n`, 'utf-8');

const comparison = summarizeBenchmark({
  runDir,
  workflow,
  signalIndex,
  modelCalls,
  toolCalls,
  analysisArtifacts,
  directSignal,
});
writeFileSync(comparisonOutput, `${JSON.stringify(comparison, null, 2)}\n`, 'utf-8');
writeFileSync(summarySvgOutput, renderSummarySvg(comparison), 'utf-8');
renderSummary(comparison);

if (!comparison.passed) {
  process.exit(1);
}

function prepareSyntheticSignalWorkspace(workspace) {
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(join(workspace, 'monitoring'), { recursive: true });
  writeFileSync(
    join(workspace, 'monitoring', 'settlement.csv'),
    [
      'timestamp,instrument,settlement_mm',
      '2026-01-01,SM-1,1.2',
      '2026-01-02,SM-1,8.4',
      '2026-01-04,SM-1,31.0',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(workspace, 'monitoring', 'piezometer.csv'),
    [
      'date,instrument,pore_pressure_kpa',
      '2026-01-01,PZ-1,48.1',
      '2026-01-02,PZ-1,49.4',
      '2026-01-03,PZ-1,50.2',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(workspace, 'monitoring', 'inclinometer.csv'),
    [
      'depth_m,instrument,deflection_mm',
      '0,INC-1,0.0',
      '5,INC-1,2.5',
      '10,INC-1,4.8',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(workspace, 'monitoring', 'vibration.csv'),
    [
      'timestamp,instrument,ppv_mm_s',
      '2026-01-01T00:00:00Z,VIB-1,1.1',
      '2026-01-01T00:05:00Z,VIB-1,5.4',
      '2026-01-01T00:10:00Z,VIB-1,3.2',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(workspace, 'monitoring', 'pile-load-test.csv'),
    [
      'timestamp,instrument,load_kn',
      '2026-01-01T00:00:00Z,PLT-1,0',
      '2026-01-01T01:00:00Z,PLT-1,200',
      '2026-01-01T02:00:00Z,PLT-1,520',
      '',
    ].join('\n'),
    'utf-8',
  );
}

function findWorkflowRunDir(runsRoot) {
  const runs = readdirSync(runsRoot)
    .map((entry) => join(runsRoot, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .filter((entry) => existsSync(join(entry, 'workflow_result.json')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (runs.length === 0) {
    throw new Error(`No project-agent workflow_result.json was written under ${runsRoot}`);
  }
  return runs[0];
}

function summarizeBenchmark(input) {
  const sources = input.signalIndex?.sources ?? [];
  const blockedSources = sources.filter((source) => source.status === 'blocked');
  const reviewSources = sources.filter((source) => source.status === 'review');
  const rowsAnalyzed = sources.reduce((sum, source) => sum + Number(source.rowsAnalyzed ?? 0), 0);
  const series = input.analysisArtifacts.reduce((sum, artifact) => sum + artifact.series.length, 0);
  const thresholdFlags = input.analysisArtifacts.reduce((sum, artifact) => sum + artifact.thresholdFlags.length, 0);
  const missingIntervals = input.analysisArtifacts.reduce((sum, artifact) => sum + artifact.missingIntervals.length, 0);
  const directThresholdFlags = input.directSignal.thresholdFlags.length;
  const directMissingIntervals = input.directSignal.missingIntervals.length;
  const directRateFlags = input.directSignal.thresholdFlags.filter((flag) => flag.kind === 'rate-threshold').length;
  const directProfileId = input.directSignal.thresholdProfile?.id;
  const sourceTypes = countBy(sources.map((source) => source.signalType ?? 'unknown'));
  const regressions = [
    input.workflow.task !== 'signal-analysis'
      ? `Workflow task was ${input.workflow.task}, expected signal-analysis.`
      : null,
    input.modelCalls.length > 0
      ? 'Signal benchmark produced model calls; deterministic signal workflow should keep model_calls.jsonl empty.'
      : null,
    sources.length < 5
      ? `Only ${sources.length} signal source(s) were indexed; expected at least 5 synthetic monitoring sources.`
      : null,
    input.analysisArtifacts.length !== sources.length
      ? `Analysis artifact count ${input.analysisArtifacts.length} does not match indexed source count ${sources.length}.`
      : null,
    blockedSources.length > 0
      ? `${blockedSources.length} signal source(s) were blocked.`
      : null,
    rowsAnalyzed < 15
      ? `Only ${rowsAnalyzed} rows were analyzed; expected at least 15 synthetic monitoring readings.`
      : null,
    !['settlement', 'piezometer', 'inclinometer', 'vibration', 'load-test'].every((type) => sourceTypes[type] >= 1)
      ? `Synthetic signal fixture did not cover every required instrument profile: ${JSON.stringify(sourceTypes)}.`
      : null,
    !input.toolCalls.some((call) => call.tool === 'signal.analyze_file')
      ? 'tool_calls.jsonl did not record signal.analyze_file.'
      : null,
    !input.workflow.artifacts.some((artifact) => String(artifact.path).includes('/signals/') || String(artifact.path).includes('\\signals\\'))
      ? 'workflow_result.json does not reference persisted signal artifacts.'
      : null,
    input.directSignal.schemaVersion !== 'signal-analysis.v0'
      ? `Direct signal output schema was ${input.directSignal.schemaVersion}, expected signal-analysis.v0.`
      : null,
    input.directSignal.signalType !== 'settlement'
      ? `Direct signal type was ${input.directSignal.signalType}, expected settlement.`
      : null,
    directProfileId !== 'settlement-review-mm'
      ? `Direct signal threshold profile was ${directProfileId ?? 'none'}, expected settlement-review-mm.`
      : null,
    input.directSignal.source.rowsAnalyzed !== 3
      ? `Direct signal run analyzed ${input.directSignal.source.rowsAnalyzed} rows, expected 3.`
      : null,
    directThresholdFlags < 1
      ? 'Direct signal run did not emit any threshold flags with explicit threshold inputs.'
      : null,
    directRateFlags < 1
      ? 'Direct signal run did not emit a rate-threshold flag with explicit rate threshold input.'
      : null,
    directMissingIntervals < 1
      ? 'Direct signal run did not emit missing intervals from the threshold profile interval assumption.'
      : null,
  ].filter(Boolean);

  const comparison = {
    kind: 'signal-analysis-local-benchmark-comparison',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    outputDir: safePath(outputDir),
    fixtureWorkspace: safePath(fixtureWorkspace),
    runDir: safePath(input.runDir),
    artifacts: {
      comparison: safePath(comparisonOutput),
      summarySvg: safePath(summarySvgOutput),
      directSignal: safePath(directSignalOutput),
      signalIndex: signalIndexPathRelative(input.runDir),
    },
    workflow: {
      task: input.workflow.task,
      status: input.workflow.status,
      llmRole: input.workflow.providerContract?.llmRole,
      modelCallsBytes: input.modelCalls.length,
      toolCallCount: input.toolCalls.length,
    },
    signalArtifacts: {
      sources: sources.length,
      analyzedSources: input.analysisArtifacts.length,
      blockedSources: blockedSources.length,
      reviewSources: reviewSources.length,
      rowsAnalyzed,
      series,
      thresholdFlags,
      missingIntervals,
      sourceTypes,
    },
    directSignal: {
      rowsAnalyzed: input.directSignal.source.rowsAnalyzed,
      thresholdProfile: directProfileId ?? null,
      thresholdFlags: directThresholdFlags,
      rateThresholdFlags: directRateFlags,
      missingIntervals: directMissingIntervals,
      series: input.directSignal.series.length,
    },
    pathSafety: {
      checked: true,
      leaks: [],
    },
    passed: false,
    regressions,
  };
  const pathLeaks = detectPathLeaks(JSON.stringify(comparison));
  comparison.pathSafety.leaks = pathLeaks;
  if (pathLeaks.length > 0) {
    comparison.regressions.push(`Benchmark comparison contains local path leak(s): ${pathLeaks.slice(0, 3).join(', ')}.`);
  }
  comparison.passed = comparison.regressions.length === 0;
  return comparison;
}

function signalIndexPathRelative(runDir) {
  return safePath(join(runDir, 'signals', 'index.json'));
}

function safePath(filePath) {
  const resolved = resolve(filePath);
  const rel = relative(repoRoot, resolved);
  if (rel === '' || (rel && !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\'))) {
    return normalizePath(rel || '.');
  }
  return `[external]/${normalizePath(relative(dirname(resolved), resolved)) || 'artifact'}`;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function redactSignalOutputPaths(signal) {
  return {
    ...signal,
    source: {
      ...signal.source,
      path: safePath(signal.source?.path ?? 'signal-input'),
    },
  };
}

function detectPathLeaks(serialized) {
  const leaks = new Set();
  const normalizedRoot = normalizePath(repoRoot);
  if (serialized.includes(normalizedRoot)) leaks.add(normalizedRoot);
  for (const match of serialized.matchAll(/[A-Za-z]:\\\\[^",]+|[A-Za-z]:\/[^",]+/g)) {
    leaks.add(match[0]);
  }
  for (const match of serialized.matchAll(/\/(?:home|Users|tmp|var)\/[^",]+/g)) {
    leaks.add(match[0]);
  }
  return [...leaks];
}

function renderSummary(comparison) {
  console.log('\nSignal analysis benchmark');
  console.log(`Workspace: ${fixtureWorkspace}`);
  console.log(`Run: ${comparison.runDir}`);
  console.log(`Signal sources: ${comparison.signalArtifacts.sources}`);
  console.log(`Analysis artifacts: ${comparison.signalArtifacts.analyzedSources}`);
  console.log(`Rows analyzed: ${comparison.signalArtifacts.rowsAnalyzed}`);
  console.log(`Direct threshold flags: ${comparison.directSignal.thresholdFlags}`);
  console.log(`Direct missing intervals: ${comparison.directSignal.missingIntervals}`);
  console.log(`Model calls bytes: ${comparison.workflow.modelCallsBytes}`);
  console.log(`Comparison: ${comparisonOutput}`);
  console.log(`Summary SVG: ${summarySvgOutput}`);
  if (comparison.passed) {
    console.log('Acceptance: passed');
  } else {
    console.error('Acceptance: failed');
    for (const regression of comparison.regressions) {
      console.error(`- ${regression}`);
    }
  }
}

function renderSummarySvg(comparison) {
  const statusColor = comparison.passed ? '#16875d' : '#b42318';
  const cards = [
    ['sources', comparison.signalArtifacts.sources],
    ['artifacts', comparison.signalArtifacts.analyzedSources],
    ['rows', comparison.signalArtifacts.rowsAnalyzed],
    ['flags', comparison.directSignal.thresholdFlags],
    ['gaps', comparison.directSignal.missingIntervals],
    ['model bytes', comparison.workflow.modelCallsBytes],
  ];
  const cardMarkup = cards.map(([label, value], index) => {
    const x = 32 + (index % 3) * 220;
    const y = index < 3 ? 118 : 190;
    return [
      `<rect x="${x}" y="${y}" width="190" height="58" rx="10" fill="#ffffff" stroke="#d8e0ea"/>`,
      `<text x="${x + 18}" y="${y + 31}" font-size="22" font-weight="700" fill="#101828">${escapeXml(String(value))}</text>`,
      `<text x="${x + 84}" y="${y + 31}" font-size="13" fill="#667085">${escapeXml(label)}</text>`,
    ].join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260" viewBox="0 0 720 260" role="img" aria-label="GeotechCLI signal analysis benchmark summary">
  <rect width="720" height="260" fill="#f6f8fb"/>
  <text x="32" y="48" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#101828">Signal Analysis Benchmark</text>
  <text x="32" y="76" font-family="Arial, sans-serif" font-size="14" fill="#667085">Deterministic project-agent monitoring workflow; no LLM/model calls expected.</text>
  <rect x="32" y="92" width="120" height="28" rx="14" fill="${statusColor}"/>
  <text x="92" y="111" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${comparison.passed ? 'PASSED' : 'FAILED'}</text>
  <g font-family="Arial, sans-serif">
${cardMarkup}
  </g>
  <text x="32" y="248" font-family="Arial, sans-serif" font-size="12" fill="#667085">Types: ${escapeXml(JSON.stringify(comparison.signalArtifacts.sourceTypes))}</text>
</svg>
`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel && !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\'));
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

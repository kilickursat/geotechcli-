import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { out: '__fem-draft-run-smoke' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const value = argv[index + 1];
    if (item === '--out') {
      args.out = value;
      index += 1;
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCli(args) {
  const cliPath = resolve('packages/cli/dist/index.js');
  assert(existsSync(cliPath), `Built CLI not found at ${cliPath}. Run npm run build first.`);
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function runCliExpectFailure(args) {
  const cliPath = resolve('packages/cli/dist/index.js');
  assert(existsSync(cliPath), `Built CLI not found at ${cliPath}. Run npm run build first.`);
  try {
    await execFileAsync(process.execPath, [cliPath, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  }
  throw new Error(`Expected CLI command to fail: ${args.join(' ')}`);
}

function assertMetricRange(name, envelope, expectation) {
  for (const [metric, bounds] of Object.entries(expectation ?? {})) {
    const value = envelope?.[metric];
    assert(Number.isFinite(value), `${name}: envelope metric ${metric} is missing or non-finite`);
    if (bounds.min != null) {
      assert(value >= bounds.min, `${name}: ${metric} ${value} below expected minimum ${bounds.min}`);
    }
    if (bounds.max != null) {
      assert(value <= bounds.max, `${name}: ${metric} ${value} above expected maximum ${bounds.max}`);
    }
    if (bounds.equals != null) {
      const tolerance = bounds.tolerance ?? 1e-6;
      assert(Math.abs(value - bounds.equals) <= tolerance, `${name}: ${metric} ${value} does not match ${bounds.equals} +/- ${tolerance}`);
    }
  }
}

function assertTrend(results, { id, from, to, metric, relation, minRatio = 1, minDelta = 0 }) {
  const fromResult = results.find((item) => item.name === from);
  const toResult = results.find((item) => item.name === to);
  assert(fromResult, `${id}: missing source scenario ${from}`);
  assert(toResult, `${id}: missing target scenario ${to}`);
  const fromValue = fromResult.envelope?.[metric];
  const toValue = toResult.envelope?.[metric];
  assert(Number.isFinite(fromValue), `${id}: source metric ${metric} is non-finite`);
  assert(Number.isFinite(toValue), `${id}: target metric ${metric} is non-finite`);
  if (relation === 'increase') {
    assert(toValue - fromValue > minDelta, `${id}: expected ${metric} to increase (${fromValue} -> ${toValue})`);
    assert(toValue / fromValue >= minRatio, `${id}: expected ${metric} ratio >= ${minRatio} (${fromValue} -> ${toValue})`);
  } else if (relation === 'decrease') {
    assert(fromValue - toValue > minDelta, `${id}: expected ${metric} to decrease (${fromValue} -> ${toValue})`);
    assert(fromValue / toValue >= minRatio, `${id}: expected ${metric} ratio >= ${minRatio} (${fromValue} -> ${toValue})`);
  }
}

function assertReferenceChecks(name, objective, envelope, draftArgs) {
  if (objective === 'foundation_settlement') {
    assert(Math.abs(envelope.reactionKn - envelope.totalLoadKn) <= 1e-6, `${name}: raft reaction must balance applied load`);
    assert(envelope.reactionBalanceRatio === 1, `${name}: raft reaction balance ratio must be 1`);
  }

  if (objective === 'excavation_deformation') {
    const support = envelope.supportReactionKn;
    const boundary = envelope.boundaryReactionKn;
    const total = envelope.totalExcavatedWeightKn;
    assert(Number.isFinite(support) && Number.isFinite(boundary) && Number.isFinite(total), `${name}: excavation reaction partition is incomplete`);
    assert(Math.abs((support + boundary) - total) <= 0.01, `${name}: support + boundary reactions must balance excavated weight`);
    assert(envelope.maxWallDeflectionMm <= envelope.maxHorizontalDisplacementMm + 1e-6, `${name}: wall deflection proxy should not exceed horizontal movement envelope`);
  }

  if (objective === 'tunnel_volume_loss_settlement') {
    const diameter = Number(draftArgs[draftArgs.indexOf('--tunnel-diameter') + 1]);
    const length = Number(draftArgs[draftArgs.indexOf('--tunnel-length') + 1]);
    const volumeLossPercent = Number(draftArgs[draftArgs.indexOf('--volume-loss') + 1]);
    const expectedVolume = Math.PI * (diameter / 2) ** 2 * (volumeLossPercent / 100) * length;
    assert(
      Math.abs(envelope.settlementVolumeM3 - expectedVolume) <= 0.01,
      `${name}: tunnel settlement volume ${envelope.settlementVolumeM3} does not conserve prescribed volume loss ${expectedVolume}`,
    );
    assert(
      Math.abs(envelope.settlementVolumePerM - (expectedVolume / length)) <= 0.001,
      `${name}: tunnel settlement volume per metre does not match total settlement volume`,
    );
  }

  if (objective === 'staged_settlement_consolidation') {
    const surfaceArea = Number(draftArgs[draftArgs.indexOf('--surface-area') + 1]);
    const stageLoads = draftArgs[draftArgs.indexOf('--stage-loads') + 1].split(',').map(Number);
    const stageDurations = draftArgs[draftArgs.indexOf('--stage-durations') + 1].split(',').map(Number);
    const expectedLoad = stageLoads.reduce((total, load) => total + load * surfaceArea, 0);
    const expectedDuration = stageDurations.reduce((total, duration) => total + duration, 0);
    assert(
      Math.abs(envelope.totalLoadKn - expectedLoad) <= 0.01,
      `${name}: staged consolidation total load ${envelope.totalLoadKn} does not match staged pressure load ${expectedLoad}`,
    );
    assert(envelope.stageCount === stageLoads.length, `${name}: staged consolidation stage count mismatch`);
    assert(envelope.finalDegreeOfConsolidation > 0 && envelope.finalDegreeOfConsolidation <= 1, `${name}: degree of consolidation must stay within 0-1`);
    assert(envelope.maxMobilizedStrengthRatio >= 0 && envelope.maxMobilizedStrengthRatio <= 1, `${name}: mobilized strength ratio must stay within 0-1`);
    assert(Math.abs(envelope.consolidationDurationYears - expectedDuration) <= 0.001, `${name}: consolidation duration mismatch`);
  }

  if (objective === 'seepage_groundwater_coupling') {
    const initialPorePressure = Number(draftArgs[draftArgs.indexOf('--initial-pore-pressure') + 1]);
    assert(Math.abs(envelope.totalLoadKn) <= 1e-9, `${name}: Biot preview must not report mechanical pressure load`);
    assert(Math.abs(envelope.reactionKn) <= 1e-9, `${name}: Biot preview must not report mechanical reaction load`);
    assert(envelope.maxPorePressureKpa <= initialPorePressure + 1e-6, `${name}: pore pressure exceeded initial/boundary envelope`);
    assert(envelope.porePressureMassBalanceErrorRatio <= 1e-6, `${name}: pore-pressure mass-balance residual exceeds tolerance`);
  }
}

async function draftAndRun({ name, objective, draftArgs, runArgs = [], expectedObjective, expectedBackend, expectedEnvelope, expectedFields = [], outDir, checkReviewGate = false }) {
  const casePath = resolve(outDir, `${name}.analysis_case.json`);
  const htmlPath = resolve(outDir, `${name}.run.html`);
  const manifestPath = resolve(outDir, `${name}.run.manifest.json`);

  const draftOutput = await runCli([
    'fem',
    'draft',
    objective,
    ...draftArgs,
    '--case-output',
    casePath,
    '--json',
  ]);
  const draft = JSON.parse(draftOutput);
  assert(draft.kind === 'geotech-fem-draft-result', `${name}: draft envelope kind mismatch`);
  assert(draft.draft?.canAutoProceed === false, `${name}: FEM draft must remain review-gated`);
  assert(draft.casePath === casePath, `${name}: draft case path mismatch`);
  assert(draft.draft?.analysisCase?.objective === expectedObjective, `${name}: draft objective mismatch`);

  if (checkReviewGate) {
    const failure = await runCliExpectFailure([
      'fem',
      'run',
      casePath,
      '--experimental',
      '--json',
    ]);
    assert(failure.includes('--reviewed'), `${name}: FEM run without --reviewed did not fail with the review gate`);
  }

  const runOutput = await runCli([
    'fem',
    'run',
    casePath,
    '--experimental',
    '--reviewed',
    ...runArgs,
    '--save-html',
    htmlPath,
    '--output',
    manifestPath,
    '--no-open',
    '--json',
  ]);
  const run = JSON.parse(runOutput);
  assert(run.kind === 'geotech-fem-run-result', `${name}: run envelope kind mismatch`);
  assert(run.schemaVersion === 'fem-run-command.v0', `${name}: run schema mismatch`);
  assert(run.reviewed === true, `${name}: run envelope must record reviewed=true`);
  assert(run.casePath === casePath, `${name}: run case path mismatch`);
  assert(run.objective === expectedObjective, `${name}: run objective mismatch`);
  assert(run.manifest?.backend?.id === expectedBackend, `${name}: backend mismatch`);
  assert(run.manifest?.analysisCase?.objective === expectedObjective, `${name}: manifest objective mismatch`);
  assert(run.manifest?.validation?.status === 'review', `${name}: run should remain review-gated`);
  assert(run.manifest?.envelope && Number.isFinite(run.manifest.envelope.maxSettlementMm), `${name}: finite envelope missing`);
  assertMetricRange(name, run.manifest.envelope, expectedEnvelope);
  assertReferenceChecks(name, expectedObjective, run.manifest.envelope, draftArgs);
  if (expectedObjective === 'seepage_groundwater_coupling') {
    const acceptance = run.manifest.biotTransientAcceptance;
    assert(acceptance?.schemaVersion === 'fem-plane-strain-biot-transient-acceptance.v1', `${name}: Biot transient acceptance schema missing`);
    assert(acceptance.accepted === true, `${name}: Biot transient acceptance was not accepted`);
    assert(acceptance.acceptedStepCount === run.manifest.envelope.timeStepCount, `${name}: Biot accepted step count mismatch`);
    assert(acceptance.maxMassBalanceErrorRatio <= 1e-6, `${name}: Biot transient mass-balance acceptance exceeds tolerance`);
    assert(acceptance.monotonicMaxPressureEnvelope === true, `${name}: Biot transient max-pressure envelope is not monotonic`);
    assert(
      Math.abs(acceptance.finalPorePressureDissipationRatio - run.manifest.envelope.porePressureDissipationRatio) <= 1e-12,
      `${name}: Biot final dissipation ratio does not match the envelope`,
    );
    assert(Array.isArray(acceptance.blockerCodes) && acceptance.blockerCodes.length === 0, `${name}: Biot transient acceptance has blocker codes`);
  }
  const fieldIds = new Set((run.manifest.resultFields ?? []).map((field) => field.id));
  for (const fieldId of expectedFields) {
    assert(fieldIds.has(fieldId), `${name}: expected result field ${fieldId} missing`);
  }
  assert(run.warnings?.join(' ').includes('LLM agents can plan and validate'), `${name}: agent execution boundary warning missing`);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const html = await readFile(htmlPath, 'utf-8');
  assert(manifest.schemaVersion === 'fem-result-manifest.v0', `${name}: persisted manifest schema mismatch`);
  if (expectedObjective === 'seepage_groundwater_coupling') {
    assert(manifest.biotTransientAcceptance?.accepted === true, `${name}: persisted Biot transient acceptance missing`);
  }
  assert(html.includes('const MANIFEST = '), `${name}: WebGL HTML manifest missing`);
  return {
    name,
    casePath,
    htmlPath,
    manifestPath,
    backend: run.manifest.backend.id,
    objective: run.objective,
    maxSettlementMm: run.manifest.envelope.maxSettlementMm,
    envelope: run.manifest.envelope,
  };
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });

const help = await runCli(['fem', 'agent', '--help']);
assert(help.includes('list_fem_capabilities'), 'FEM agent help must expose planning tools');
assert(help.includes('assess_fem_production_readiness'), 'FEM agent help must expose production-readiness tool');
assert(help.includes('does not run FEM solvers'), 'FEM agent help must keep solver execution outside the agent loop');
const runHelp = await runCli(['fem', 'run', '--help']);
assert(runHelp.includes('--reviewed'), 'FEM run help must expose the human-review acknowledgement flag');
assert(runHelp.includes('--backend'), 'FEM run help must expose deterministic backend selection');

const contractOnlyRoutes = [
  'shaft-deformation',
  'pile-group-elastic-interaction',
  'slope-embankment-deformation',
  'retaining-wall-excavation-support',
];
for (const route of contractOnlyRoutes) {
  const output = await runCli(['fem', 'draft', route, '--json']);
  const draft = JSON.parse(output);
  assert(draft.draft?.recommendedAction === 'contract-only', `${route}: planned route must remain contract-only`);
  assert(draft.draft?.analysisCase == null, `${route}: planned route must not expose an analysisCase`);
  assert(draft.casePath == null, `${route}: planned route must not expose a casePath`);
  assert(!JSON.stringify(draft).includes('fem run'), `${route}: planned route must not expose a run command`);
  const failure = await runCliExpectFailure([
    'fem',
    'draft',
    route,
    '--case-output',
    resolve(outDir, `${route}.analysis_case.json`),
    '--json',
  ]);
  assert(failure.includes('Cannot write --case-output'), `${route}: planned route --case-output did not fail closed`);
}

const cases = [
  {
    name: 'raft-stiff',
    objective: 'foundation-settlement',
    expectedObjective: 'foundation_settlement',
    expectedBackend: 'builtin-elastic3d-demo',
    checkReviewGate: true,
    expectedFields: ['vertical_settlement'],
    expectedEnvelope: {
      maxSettlementMm: { min: 17, max: 19 },
      totalLoadKn: { equals: 12000, tolerance: 0.001 },
      reactionKn: { equals: 12000, tolerance: 0.001 },
      reactionBalanceRatio: { equals: 1, tolerance: 0.000001 },
    },
    draftArgs: [
      '--raft-length', '10',
      '--raft-width', '8',
      '--pressure', '150',
      '--elastic-modulus', '50000',
      '--poisson-ratio', '0.3',
      '--unit-weight', '18.5',
    ],
  },
  {
    name: 'raft-soft',
    objective: 'foundation-settlement',
    expectedObjective: 'foundation_settlement',
    expectedBackend: 'builtin-elastic3d-demo',
    expectedFields: ['vertical_settlement'],
    expectedEnvelope: {
      maxSettlementMm: { min: 48, max: 51 },
      totalLoadKn: { equals: 12000, tolerance: 0.001 },
      reactionKn: { equals: 12000, tolerance: 0.001 },
    },
    draftArgs: [
      '--raft-length', '10',
      '--raft-width', '8',
      '--pressure', '150',
      '--elastic-modulus', '18000',
      '--poisson-ratio', '0.3',
      '--unit-weight', '18.5',
    ],
  },
  {
    name: 'excavation-shallow-stiff',
    objective: 'excavation-deformation',
    expectedObjective: 'excavation_deformation',
    expectedBackend: 'builtin-staged-excavation-demo',
    expectedFields: ['surface_settlement', 'horizontal_displacement', 'wall_deflection_proxy', 'support_reaction'],
    expectedEnvelope: {
      maxSettlementMm: { min: 10, max: 11 },
      maxHorizontalDisplacementMm: { min: 8.5, max: 9.5 },
      maxWallDeflectionMm: { min: 7, max: 8 },
      totalExcavatedWeightKn: { equals: 34742.4, tolerance: 0.01 },
      stageCount: { equals: 3, tolerance: 0.000001 },
    },
    draftArgs: [
      '--excavation-length', '22',
      '--excavation-width', '14',
      '--excavation-depth', '6',
      '--wall-toe-depth', '12',
      '--stage-depths', '2,4,6',
      '--support-levels', '0,1.5,3.5',
      '--pressure', '20',
      '--elastic-modulus', '45000',
      '--poisson-ratio', '0.31',
      '--unit-weight', '18.8',
    ],
  },
  {
    name: 'excavation-deep-soft',
    objective: 'excavation-deformation',
    expectedObjective: 'excavation_deformation',
    expectedBackend: 'builtin-staged-excavation-demo',
    expectedFields: ['surface_settlement', 'horizontal_displacement', 'wall_deflection_proxy', 'support_reaction'],
    expectedEnvelope: {
      maxSettlementMm: { min: 30, max: 32 },
      maxHorizontalDisplacementMm: { min: 27, max: 28.5 },
      maxWallDeflectionMm: { min: 22, max: 24 },
      totalExcavatedWeightKn: { equals: 57904, tolerance: 0.01 },
      stageCount: { equals: 3, tolerance: 0.000001 },
    },
    draftArgs: [
      '--excavation-length', '22',
      '--excavation-width', '14',
      '--excavation-depth', '10',
      '--wall-toe-depth', '18',
      '--stage-depths', '3,6,10',
      '--support-levels', '0,2,5',
      '--pressure', '25',
      '--elastic-modulus', '25000',
      '--poisson-ratio', '0.32',
      '--unit-weight', '18.8',
    ],
  },
  {
    name: 'tunnel-baseline',
    objective: 'tunnel-volume-loss-settlement',
    expectedObjective: 'tunnel_volume_loss_settlement',
    expectedBackend: 'builtin-tunnel-volume-loss-demo',
    expectedFields: ['surface_settlement'],
    expectedEnvelope: {
      maxSettlementMm: { min: 9.5, max: 10.5 },
      volumeLossPercent: { equals: 0.8, tolerance: 0.000001 },
      troughWidthM: { equals: 9, tolerance: 0.001 },
    },
    draftArgs: [
      '--tunnel-diameter', '6',
      '--tunnel-depth', '18',
      '--tunnel-length', '60',
      '--volume-loss', '0.8',
      '--trough-width', '0.5',
      '--elastic-modulus', '52000',
      '--poisson-ratio', '0.28',
      '--unit-weight', '19',
    ],
  },
  {
    name: 'tunnel-high-volume-loss',
    objective: 'tunnel-volume-loss-settlement',
    expectedObjective: 'tunnel_volume_loss_settlement',
    expectedBackend: 'builtin-tunnel-volume-loss-demo',
    expectedFields: ['surface_settlement'],
    expectedEnvelope: {
      maxSettlementMm: { min: 24.5, max: 25.5 },
      volumeLossPercent: { equals: 2, tolerance: 0.000001 },
      troughWidthM: { equals: 9, tolerance: 0.001 },
    },
    draftArgs: [
      '--tunnel-diameter', '6',
      '--tunnel-depth', '18',
      '--tunnel-length', '60',
      '--volume-loss', '2',
      '--trough-width', '0.5',
      '--elastic-modulus', '52000',
      '--poisson-ratio', '0.28',
      '--unit-weight', '19',
    ],
  },
  {
    name: 'consolidation-baseline',
    objective: 'staged-settlement-consolidation',
    expectedObjective: 'staged_settlement_consolidation',
    expectedBackend: 'builtin-staged-consolidation-1d',
    expectedFields: ['vertical_settlement', 'final_degree_of_consolidation', 'max_excess_pore_pressure', 'max_mobilized_strength_ratio'],
    expectedEnvelope: {
      finalSettlementMm: { min: 40, max: 55 },
      plasticSettlementMm: { min: 0, max: 60 },
      finalDegreeOfConsolidation: { min: 0.2, max: 1 },
      maxExcessPorePressureKpa: { equals: 45, tolerance: 0.001 },
      stageCount: { equals: 3, tolerance: 0.000001 },
      totalLoadKn: { equals: 20000, tolerance: 0.001 },
    },
    draftArgs: [
      '--layer-thickness', '10',
      '--surface-area', '200',
      '--stage-loads', '45,35,20',
      '--stage-durations', '0.5,1,2',
      '--drainage', 'double',
      '--elastic-modulus', '30000',
      '--poisson-ratio', '0.32',
      '--unit-weight', '18.5',
      '--constrained-modulus', '8000',
      '--cv', '0.8',
      '--friction-angle', '28',
      '--cohesion', '12',
      '--hydraulic-conductivity', '1e-9',
    ],
  },
  {
    name: 'consolidation-nonlinear-column',
    objective: 'staged-settlement-consolidation',
    runArgs: ['--backend', 'nonlinear-column'],
    expectedObjective: 'staged_settlement_consolidation',
    expectedBackend: 'builtin-nonlinear-column-v0',
    expectedFields: ['vertical_settlement', 'final_degree_of_consolidation', 'max_excess_pore_pressure', 'max_mobilized_strength_ratio'],
    expectedEnvelope: {
      finalSettlementMm: { min: 20, max: 60 },
      plasticSettlementMm: { min: 0, max: 60 },
      finalDegreeOfConsolidation: { min: 0.2, max: 1 },
      maxSolverResidualRatio: { min: 0, max: 0.001 },
      maxYieldResidualRatio: { min: 0, max: 0.000001 },
      solverLoadSteps: { equals: 3, tolerance: 0.000001 },
      stageCount: { equals: 3, tolerance: 0.000001 },
      totalLoadKn: { equals: 20000, tolerance: 0.001 },
    },
    draftArgs: [
      '--layer-thickness', '10',
      '--surface-area', '200',
      '--stage-loads', '45,35,20',
      '--stage-durations', '0.5,1,2',
      '--drainage', 'double',
      '--elastic-modulus', '30000',
      '--poisson-ratio', '0.32',
      '--unit-weight', '18.5',
      '--constrained-modulus', '8000',
      '--cv', '0.8',
      '--friction-angle', '28',
      '--cohesion', '12',
      '--hydraulic-conductivity', '1e-9',
    ],
  },
  {
    name: 'biot-seepage',
    objective: 'seepage-groundwater-coupling',
    runArgs: ['--backend', 'biot-up'],
    expectedObjective: 'seepage_groundwater_coupling',
    expectedBackend: 'builtin-biot-up-plane-strain-v0',
    expectedFields: ['vertical_settlement', 'excess_pore_pressure', 'pore_pressure_mass_balance_error_ratio'],
    expectedEnvelope: {
      maxSettlementMm: { min: 0, max: 100 },
      minPorePressureKpa: { min: 0, max: 100 },
      maxPorePressureKpa: { min: 0, max: 100 },
      maxExcessPorePressureKpa: { min: 0, max: 100 },
      porePressureMassBalanceErrorRatio: { min: 0, max: 0.000001 },
      timeStepCount: { equals: 4, tolerance: 0.000001 },
      totalLoadKn: { equals: 0, tolerance: 0.000001 },
      reactionKn: { equals: 0, tolerance: 0.000001 },
    },
    draftArgs: [
      '--biot-width', '1',
      '--biot-height', '1',
      '--biot-thickness', '1',
      '--initial-pore-pressure', '100',
      '--top-pore-pressure', '0',
      '--time-steps', '1,2,4,8',
      '--elastic-modulus', '30000',
      '--poisson-ratio', '0.3',
      '--unit-weight', '18.5',
      '--hydraulic-conductivity', '0.000001',
      '--specific-storage', '0.0001',
      '--biot-alpha', '0.8',
    ],
  },
];

const results = [];
for (const item of cases) {
  results.push(await draftAndRun({ ...item, outDir }));
}

const trends = [
  {
    id: 'raft-settlement-increases-when-softer',
    from: 'raft-stiff',
    to: 'raft-soft',
    metric: 'maxSettlementMm',
    relation: 'increase',
    minRatio: 2.6,
  },
  {
    id: 'excavation-wall-movement-increases-with-depth-and-softness',
    from: 'excavation-shallow-stiff',
    to: 'excavation-deep-soft',
    metric: 'maxWallDeflectionMm',
    relation: 'increase',
    minRatio: 2.8,
  },
  {
    id: 'tunnel-settlement-increases-with-volume-loss',
    from: 'tunnel-baseline',
    to: 'tunnel-high-volume-loss',
    metric: 'maxSettlementMm',
    relation: 'increase',
    minRatio: 2.4,
  },
];
for (const trend of trends) {
  assertTrend(results, trend);
}

console.log(JSON.stringify({
  ok: true,
  outDir,
  agentBoundary: 'FEM agents plan, draft, and validate only; deterministic CLI runs require human-invoked geotech fem run --experimental --reviewed.',
  scenarioContract: 'Envelope ranges and cross-scenario trends passed for raft, excavation, tunnel, consolidation, and Biot seepage mock datasets.',
  contractOnlyRoutes,
  referenceChecks: [
    'raft reaction balance',
    'excavation reaction partition',
    'tunnel prescribed-volume conservation',
    'Biot pore-pressure mass balance',
  ],
  trends: trends.map((trend) => trend.id),
  results,
}, null, 2));

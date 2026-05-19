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

async function draftAndRun({ name, objective, draftArgs, expectedObjective, expectedBackend, outDir }) {
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

  const runOutput = await runCli([
    'fem',
    'run',
    casePath,
    '--experimental',
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
  assert(run.casePath === casePath, `${name}: run case path mismatch`);
  assert(run.objective === expectedObjective, `${name}: run objective mismatch`);
  assert(run.manifest?.backend?.id === expectedBackend, `${name}: backend mismatch`);
  assert(run.manifest?.analysisCase?.objective === expectedObjective, `${name}: manifest objective mismatch`);
  assert(run.manifest?.validation?.status === 'review', `${name}: run should remain review-gated`);
  assert(run.manifest?.envelope && Number.isFinite(run.manifest.envelope.maxSettlementMm), `${name}: finite envelope missing`);
  assert(run.warnings?.join(' ').includes('LLM agents can plan and validate'), `${name}: agent execution boundary warning missing`);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const html = await readFile(htmlPath, 'utf-8');
  assert(manifest.schemaVersion === 'fem-result-manifest.v0', `${name}: persisted manifest schema mismatch`);
  assert(html.includes('const MANIFEST = '), `${name}: WebGL HTML manifest missing`);
  return {
    name,
    casePath,
    htmlPath,
    manifestPath,
    backend: run.manifest.backend.id,
    objective: run.objective,
    maxSettlementMm: run.manifest.envelope.maxSettlementMm,
  };
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });

const help = await runCli(['fem', 'agent', '--help']);
assert(help.includes('list_fem_capabilities'), 'FEM agent help must expose planning tools');
assert(help.includes('does not run FEM solvers'), 'FEM agent help must keep solver execution outside the agent loop');

const cases = [
  {
    name: 'raft',
    objective: 'foundation-settlement',
    expectedObjective: 'foundation_settlement',
    expectedBackend: 'builtin-elastic3d-demo',
    draftArgs: [
      '--raft-length', '10',
      '--raft-width', '8',
      '--pressure', '150',
      '--elastic-modulus', '30000',
      '--poisson-ratio', '0.3',
      '--unit-weight', '18.5',
    ],
  },
  {
    name: 'excavation',
    objective: 'excavation-deformation',
    expectedObjective: 'excavation_deformation',
    expectedBackend: 'builtin-staged-excavation-demo',
    draftArgs: [
      '--excavation-length', '22',
      '--excavation-width', '14',
      '--excavation-depth', '9',
      '--wall-toe-depth', '15',
      '--stage-depths', '3,6,9',
      '--support-levels', '0,2,5',
      '--pressure', '20',
      '--elastic-modulus', '36000',
      '--poisson-ratio', '0.31',
      '--unit-weight', '18.8',
    ],
  },
  {
    name: 'tunnel',
    objective: 'tunnel-volume-loss-settlement',
    expectedObjective: 'tunnel_volume_loss_settlement',
    expectedBackend: 'builtin-tunnel-volume-loss-demo',
    draftArgs: [
      '--tunnel-diameter', '6',
      '--tunnel-depth', '18',
      '--tunnel-length', '60',
      '--volume-loss', '1.2',
      '--trough-width', '0.5',
      '--elastic-modulus', '52000',
      '--poisson-ratio', '0.28',
      '--unit-weight', '19',
    ],
  },
];

const results = [];
for (const item of cases) {
  results.push(await draftAndRun({ ...item, outDir }));
}

console.log(JSON.stringify({
  ok: true,
  outDir,
  agentBoundary: 'FEM agents plan, draft, and validate only; deterministic CLI runs require human-invoked geotech fem run --experimental.',
  results,
}, null, 2));

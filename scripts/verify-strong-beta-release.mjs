import { execFileSync } from 'node:child_process';

const [baseRef, headRef = 'HEAD'] = process.argv.slice(2);
const branchName = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_HEAD_REF ?? '';

function isZeroRef(value) {
  return !value || /^0+$/.test(value);
}

function readJsonAt(ref, path) {
  const text = execFileSync('git', ['show', `${ref}:${path}`], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (branchName !== 'strong-beta') {
  console.log(`verify-strong-beta-release: skipped for branch ${branchName || '(unknown)'}`);
  process.exit(0);
}

if (isZeroRef(baseRef)) {
  console.log('verify-strong-beta-release: skipped because the base ref is empty.');
  process.exit(0);
}

const baseMeta = readJsonAt(baseRef, 'packages/core/src/meta/metadata.json');
const headMeta = readJsonAt(headRef, 'packages/core/src/meta/metadata.json');

assert(
  baseMeta.version !== headMeta.version,
  `strong-beta pushes must carry a new release version. Base ${baseMeta.version} matches head ${headMeta.version}.`,
);

console.log(
  `verify-strong-beta-release: OK (${baseMeta.version} -> ${headMeta.version})`,
);

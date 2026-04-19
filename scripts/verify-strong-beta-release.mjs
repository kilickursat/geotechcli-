import { execFileSync } from 'node:child_process';

const [baseRef, headRef = 'HEAD'] = process.argv.slice(2);
const branchName = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_HEAD_REF ?? '';
const VERSION_PATHS = [
  'packages/core/src/meta/metadata.json',
  'packages/core/package.json',
  'packages/cli/package.json',
];

function isZeroRef(value) {
  return !value || /^0+$/.test(value);
}

function tryReadJsonAt(ref, path) {
  try {
    const text = execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('exists on disk, but not in') ||
      message.includes('invalid object name') ||
      message.includes('bad object') ||
      message.includes('unknown revision') ||
      message.includes('does not have a commit checked out')
    ) {
      return null;
    }
    throw error;
  }
}

function readVersionAt(ref) {
  for (const path of VERSION_PATHS) {
    const payload = tryReadJsonAt(ref, path);
    const version = payload?.version;
    if (typeof version === 'string' && version.trim()) {
      return {
        version: version.trim(),
        path,
      };
    }
  }

  throw new Error(
    `Unable to read a release version for ref ${ref}. Tried ${VERSION_PATHS.join(', ')}. Ensure actions/checkout fetches the base commit history.`,
  );
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

const baseVersion = readVersionAt(baseRef);
const headVersion = readVersionAt(headRef);

assert(
  baseVersion.version !== headVersion.version,
  `strong-beta pushes must carry a new release version. Base ${baseVersion.version} (${baseVersion.path}) matches head ${headVersion.version} (${headVersion.path}).`,
);

console.log(
  `verify-strong-beta-release: OK (${baseVersion.version} -> ${headVersion.version})`,
);

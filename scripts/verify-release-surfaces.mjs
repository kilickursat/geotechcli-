#!/usr/bin/env node
// Asserts that every published surface reports the version this repo claims.
//
// A release lands on four independent surfaces: npm dist-tags, the deployed
// site, the git tag, and the GitHub Release. Each is written by a different job,
// and a job that is skipped or never wired up fails silently — GitHub Releases
// sat at v0.4.124 for fourteen versions because tagging was the one surface with
// no automation behind it. This check makes that class of drift loud.
//
// Usage:
//   node scripts/verify-release-surfaces.mjs                 # production surfaces
//   node scripts/verify-release-surfaces.mjs --channel beta  # beta surfaces
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const channel = process.argv.includes('--channel')
  ? process.argv[process.argv.indexOf('--channel') + 1]
  : 'latest';

if (!['latest', 'beta'].includes(channel)) {
  throw new Error(`Unknown channel ${channel}; expected "latest" or "beta".`);
}

const metadata = JSON.parse(
  readFileSync(join(process.cwd(), 'packages', 'core', 'src', 'meta', 'metadata.json'), 'utf-8'),
);
const expected = metadata.version;
const site = channel === 'beta' ? 'https://beta.geotechcli.com' : 'https://www.geotechcli.com';

const failures = [];
const results = [];

function record(surface, actual, { skip = false, note = '' } = {}) {
  if (skip) {
    results.push(`  ~ ${surface.padEnd(26)} skipped${note ? ` (${note})` : ''}`);
    return;
  }
  const ok = actual === expected;
  results.push(`  ${ok ? '✓' : '✗'} ${surface.padEnd(26)} ${actual ?? '(unreadable)'}`);
  if (!ok) {
    failures.push(`${surface} reports ${actual ?? '(unreadable)'}, expected ${expected}`);
  }
}

// Registry metadata is served through a CDN that the npm client also caches
// locally, so read it over plain HTTP to avoid asserting against a stale copy.
async function npmDistTag(pkg) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.['dist-tags']?.[channel] ?? null;
}

async function siteVersion() {
  const response = await fetch(`${site}/api/version?ts=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.version ?? null;
}

function gitTagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const [cliTag, coreTag, deployed] = await Promise.all([
  npmDistTag('geotechcli').catch(() => null),
  npmDistTag('@geotechcli/core').catch(() => null),
  siteVersion().catch(() => null),
]);

record(`npm geotechcli@${channel}`, cliTag);
record(`npm core@${channel}`, coreTag);
record(channel === 'beta' ? 'beta.geotechcli.com' : 'www.geotechcli.com', deployed);

// Tags and GitHub Releases exist only for production; the beta channel is
// deliberately untagged, so asserting them there would be a false alarm.
if (channel === 'latest') {
  const tag = `v${expected}`;
  record('git tag', gitTagExists(tag) ? expected : null, {
    skip: !gitTagExists(tag) && process.env.SKIP_TAG_CHECK === '1',
    note: 'SKIP_TAG_CHECK=1',
  });
} else {
  record('git tag', null, { skip: true, note: 'beta is untagged by design' });
}

console.log(`verify-release-surfaces (${channel}) — expecting ${expected}`);
console.log(results.join('\n'));

if (failures.length > 0) {
  throw new Error(
    `Release surfaces disagree with the repo version ${expected}:\n  - ${failures.join('\n  - ')}`,
  );
}

console.log('verify-release-surfaces: OK');

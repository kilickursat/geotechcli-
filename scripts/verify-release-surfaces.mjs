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

// npm serves dist-tags through a CDN and Cloudflare serves the site from many
// edge locations, so both go on reporting the previous version for a short
// window after a successful deploy — long enough that a single read fails while
// nothing is actually wrong. Every other remote check in this pipeline polls,
// and so must this one.
const ATTEMPTS = Number(process.env.SURFACE_CHECK_ATTEMPTS ?? 20);
const DELAY_MS = Number(process.env.SURFACE_CHECK_DELAY_MS ?? 15000);

const failures = [];
const results = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function settle(read) {
  let actual = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    actual = await read().catch(() => null);
    if (actual === expected) return { actual, attempt };
    if (attempt < ATTEMPTS) await sleep(DELAY_MS);
  }
  return { actual, attempt: ATTEMPTS };
}

function record(surface, actual, { skip = false, note = '', attempt = 1 } = {}) {
  if (skip) {
    results.push(`  ~ ${surface.padEnd(26)} skipped${note ? ` (${note})` : ''}`);
    return;
  }
  const ok = actual === expected;
  const suffix = ok && attempt > 1 ? `  (settled after ${attempt} attempts)` : '';
  results.push(`  ${ok ? '✓' : '✗'} ${surface.padEnd(26)} ${actual ?? '(unreadable)'}${suffix}`);
  if (!ok) {
    const tried = attempt > 1 ? ` (still wrong after ${attempt} attempts)` : '';
    failures.push(`${surface} reports ${actual ?? '(unreadable)'}, expected ${expected}${tried}`);
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
  settle(() => npmDistTag('geotechcli')),
  settle(() => npmDistTag('@geotechcli/core')),
  settle(() => siteVersion()),
]);

record(`npm geotechcli@${channel}`, cliTag.actual, { attempt: cliTag.attempt });
record(`npm core@${channel}`, coreTag.actual, { attempt: coreTag.attempt });
record(channel === 'beta' ? 'beta.geotechcli.com' : 'www.geotechcli.com', deployed.actual, {
  attempt: deployed.attempt,
});

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

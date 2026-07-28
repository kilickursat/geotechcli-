#!/usr/bin/env node
// Pulls one release's CHANGELOG.md block out for use as GitHub Release notes.
//
// GitHub's generate_release_notes builds its summary from merged pull requests.
// This repo releases by pushing branches directly, so there are no PRs to
// summarise and the generated body collapses to a bare compare link. The
// changelog entry is the release note we already write by hand, so publish that.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [version, outPath] = process.argv.slice(2);

if (!version) {
  throw new Error('Usage: extract-changelog-entry.mjs <version> [outFile]');
}

const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');

// Capture everything between this version's heading and the next release
// heading (or end of file for the oldest entry).
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entry = changelog.match(
  new RegExp(`^## \\[${escaped}\\][^\\n]*\\n(.*?)(?=^## \\[|\\Z)`, 'ms'),
);

if (!entry) {
  throw new Error(`CHANGELOG.md has no entry for ${version}.`);
}

const compareBase = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)]
  .map((match) => match[1])
  .find((candidate) => candidate !== version);

const body = [
  entry[1].trim(),
  '',
  '## Install',
  '',
  '```bash',
  'npm install -g geotechcli',
  '```',
  '',
  'Published with build provenance. Full history is in [CHANGELOG.md](https://github.com/kilickursat/geotechcli-/blob/main/CHANGELOG.md).',
  compareBase
    ? `\n**Full Changelog**: https://github.com/kilickursat/geotechcli-/compare/v${compareBase}...v${version}`
    : '',
].join('\n');

if (outPath) {
  writeFileSync(outPath, `${body}\n`);
  console.log(`Wrote release notes for ${version} to ${outPath}`);
} else {
  process.stdout.write(`${body}\n`);
}

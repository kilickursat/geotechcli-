#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = new URL('../', import.meta.url);
const dryRun = process.argv.includes('--dry-run');
const registry = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';
const tagFlagIndex = process.argv.indexOf('--tag');
const publishTag = tagFlagIndex !== -1 && process.argv[tagFlagIndex + 1]
  ? process.argv[tagFlagIndex + 1]
  : process.env.NPM_PUBLISH_TAG || 'latest';
const npmCommand = 'npm';
const useShell = process.platform === 'win32';

const packages = [
  { name: '@geotechcli/core', dir: 'packages/core' },
  { name: 'geotechcli', dir: 'packages/cli' },
];

// setup-node writes this literal into the npmrc when no token is supplied, so an
// unset secret looks like a configured credential right up until the registry
// rejects it.
const AUTH_TOKEN_PLACEHOLDER = 'XXXXX-XXXXX-XXXXX-XXXXX';

function describeCredentials() {
  const token = process.env.NODE_AUTH_TOKEN;
  const hasToken = Boolean(token) && token !== AUTH_TOKEN_PLACEHOLDER;
  const hasOidc = Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );

  console.log(
    `Registry credentials: automation token ${hasToken ? 'present' : 'absent'}, ` +
      `OIDC id-token request ${hasOidc ? 'available' : 'unavailable'}`,
  );

  if (!hasToken && !hasOidc) {
    throw new Error(
      'No usable npm credentials: NODE_AUTH_TOKEN is unset (or is the setup-node placeholder) and the ' +
        'workflow has no id-token permission. Set the NPM_DIST_TAG_TOKEN secret or grant id-token: write.',
    );
  }

  return { hasToken, hasOidc };
}

function explainPublishFailure(name, { hasToken, hasOidc }) {
  console.error(`\nPublishing ${name} failed.`);
  console.error(
    'npm resolves trusted publishing (OIDC) per package, and a missing trusted publisher fails silently — ' +
      'npm then falls back to the token in the npmrc. A 404 on PUT therefore means neither path authenticated ' +
      `for ${name} specifically (npm reports 404 rather than 403 for packages you cannot write to).`,
  );
  console.error(
    `Current state: automation token ${hasToken ? 'present' : 'absent'}, ` +
      `OIDC ${hasOidc ? 'available' : 'unavailable'}. Remedies: (a) confirm the NPM_DIST_TAG_TOKEN secret ` +
      `grants read/write on ${name}, or (b) re-add the GitHub Actions trusted publisher for ${name} on npmjs.com.`,
  );
}

async function readPackageJson(packageDir) {
  const packageUrl = new URL(`${packageDir}/package.json`, root);
  return JSON.parse(await readFile(packageUrl, 'utf8'));
}

async function npmViewVersion(packageName, version) {
  try {
    const { stdout } = await execFileAsync(npmCommand, [
      'view',
      `${packageName}@${version}`,
      'version',
      '--registry',
      registry,
      '--json',
    ], { shell: useShell });
    const parsed = JSON.parse(stdout.trim() || 'null');
    return typeof parsed === 'string' ? parsed : null;
  } catch (error) {
    const stderr = error?.stderr || '';
    const stdout = error?.stdout || '';
    if (String(stderr).includes('E404') || String(stdout).includes('E404')) {
      return null;
    }
    throw error;
  }
}

async function packageExists(packageName, version) {
  return (await npmViewVersion(packageName, version)) === version;
}

async function waitForVisibility(packageName, version) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    if (await packageExists(packageName, version)) {
      console.log(`${packageName}@${version} visible on npm`);
      return;
    }
    console.log(`Waiting for ${packageName}@${version} to become visible on npm (${attempt}/20)`);
    await wait(15000);
  }
  throw new Error(`${packageName}@${version} did not become visible on npm in time`);
}

async function publishPackage({ name, dir, version, credentials }) {
  const packagePath = fileURLToPath(new URL(`${dir}/`, root));

  if (await packageExists(name, version)) {
    console.log(`${name}@${version} already published; skipping`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] validating ${name}@${version} from ${packagePath} (dist-tag: ${publishTag})`);
    await run(npmCommand, ['publish', '--dry-run', '--access', 'public', '--registry', registry, '--tag', publishTag], {
      cwd: packagePath,
    });
    return;
  }

  // npm only auto-enables provenance on the OIDC path, so a package that
  // publishes with the token would silently lose its attestation. Ask for it
  // explicitly whenever the runner can mint an id-token, which covers both paths.
  const provenanceArgs = credentials.hasOidc ? ['--provenance'] : [];

  console.log(`Publishing ${name}@${version} (dist-tag: ${publishTag})`);
  try {
    await run(
      npmCommand,
      ['publish', '--access', 'public', '--registry', registry, '--tag', publishTag, ...provenanceArgs],
      { cwd: packagePath },
    );
  } catch (error) {
    explainPublishFailure(name, credentials);
    throw error;
  }
  await waitForVisibility(name, version);
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: useShell, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

const manifests = await Promise.all(packages.map(async (pkg) => ({ ...pkg, manifest: await readPackageJson(pkg.dir) })));
const core = manifests.find((pkg) => pkg.name === '@geotechcli/core');
const cli = manifests.find((pkg) => pkg.name === 'geotechcli');

if (!core || !cli) {
  throw new Error('Expected @geotechcli/core and geotechcli package manifests');
}

if (core.manifest.version !== cli.manifest.version) {
  throw new Error(`Package version mismatch: core=${core.manifest.version}, cli=${cli.manifest.version}`);
}

if (cli.manifest.dependencies?.['@geotechcli/core'] !== core.manifest.version) {
  throw new Error(
    `CLI dependency mismatch: geotechcli depends on @geotechcli/core@${cli.manifest.dependencies?.['@geotechcli/core']}, expected ${core.manifest.version}`,
  );
}

const credentials = dryRun ? { hasToken: false, hasOidc: false } : describeCredentials();

for (const pkg of manifests) {
  await publishPackage({ name: pkg.name, dir: pkg.dir, version: pkg.manifest.version, credentials });
}

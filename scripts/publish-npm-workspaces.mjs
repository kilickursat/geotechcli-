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
const npmCommand = 'npm';
const useShell = process.platform === 'win32';

const packages = [
  { name: '@geotechcli/core', dir: 'packages/core' },
  { name: 'geotechcli', dir: 'packages/cli' },
];

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

async function publishPackage({ name, dir, version }) {
  const packagePath = fileURLToPath(new URL(`${dir}/`, root));

  if (await packageExists(name, version)) {
    console.log(`${name}@${version} already published; skipping`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] validating ${name}@${version} from ${packagePath}`);
    await run(npmCommand, ['publish', '--dry-run', '--access', 'public', '--registry', registry], {
      cwd: packagePath,
    });
    return;
  }

  console.log(`Publishing ${name}@${version}`);
  await run(npmCommand, ['publish', '--access', 'public', '--registry', registry], {
    cwd: packagePath,
  });
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

for (const pkg of manifests) {
  await publishPackage({ name: pkg.name, dir: pkg.dir, version: pkg.manifest.version });
}

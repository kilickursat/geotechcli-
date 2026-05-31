import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(repoRoot, 'packages/web');
const nextBin = resolve(repoRoot, 'node_modules/next/dist/bin/next');
const webLockFile = resolve(webRoot, 'package-lock.json');

const createdTemporaryLockfile = !existsSync(webLockFile);

if (createdTemporaryLockfile) {
  writeFileSync(
    webLockFile,
    JSON.stringify({
      name: '@geotechcli/web',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: '@geotechcli/web',
        },
      },
    }, null, 2) + '\n',
  );
}

try {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: webRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  if (createdTemporaryLockfile) {
    rmSync(webLockFile, { force: true });
  }
}

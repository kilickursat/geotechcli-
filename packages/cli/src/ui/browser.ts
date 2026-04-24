import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function openFileInBrowser(
  filePath: string,
  options: {
    disabled?: boolean;
    disabledEnvVar?: string;
  } = {},
): boolean {
  if (options.disabled) {
    return false;
  }
  if (options.disabledEnvVar && process.env[options.disabledEnvVar] === '1') {
    return false;
  }

  const target = pathToFileURL(resolve(filePath)).href;

  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', target], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    }

    if (process.platform === 'darwin') {
      const child = spawn('open', [target], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    }

    const child = spawn('xdg-open', [target], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

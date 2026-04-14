import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toolRegistry } from '../src/agents/tools.js';
import { validateReadPath, validateShellCommand, validateWritePath } from '../src/agents/sandbox.js';

import '../src/agents/bridge-tools.js';
import '../src/agents/data-tools.js';

describe('Security hardening regressions', () => {
  const previousRunCommandFlag = process.env.GEOTECHCLI_ENABLE_RUN_COMMAND;

  beforeEach(() => {
    delete process.env.GEOTECHCLI_ENABLE_RUN_COMMAND;
  });

  afterEach(() => {
    if (previousRunCommandFlag === undefined) {
      delete process.env.GEOTECHCLI_ENABLE_RUN_COMMAND;
    } else {
      process.env.GEOTECHCLI_ENABLE_RUN_COMMAND = previousRunCommandFlag;
    }
  });

  it('blocks python script execution from shell validation', () => {
    const check = validateShellCommand('python analysis.py');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('not allowed');
  });

  it('blocks read-only command paths outside the allowed workspace', () => {
    const blockedPath = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    const check = validateShellCommand(`find ${blockedPath}`);
    expect(check.safe).toBe(false);
    expect(check.error).toContain('not allowed');
  });

  it('blocks find command execution predicates', () => {
    const check = validateShellCommand('find . -exec sh -c "id" +');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('blocked find predicate');
  });

  it('blocks shell input redirection breakout', () => {
    const check = validateShellCommand('cat </etc/passwd');
    expect(check.safe).toBe(false);
    expect(check.error).toContain('blocked operator');
  });

  it('keeps run_command disabled by default in strong beta', async () => {
    const result = await toolRegistry.execute('run_command', { command: 'ls -la' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled by default');
  });

  it('blocks parse_ags paths outside the allowed workspace', async () => {
    const blockedPath = join(process.cwd(), '..', '__outside__.ags');
    const result = await toolRegistry.execute('parse_ags', { path: blockedPath });
    expect(result.success).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('blocks parse_cpt paths outside the allowed workspace', async () => {
    const blockedPath = join(process.cwd(), '..', '__outside__.csv');
    const result = await toolRegistry.execute('parse_cpt', { path: blockedPath });
    expect(result.success).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('blocks writes through a symlinked parent directory', () => {
    const insideBase = mkdtempSync(join(process.cwd(), '__sandbox-inside-'));
    const outsideBase = mkdtempSync(join(tmpdir(), 'geotechcli-outside-'));
    const junctionPath = join(insideBase, 'escape');

    try {
      symlinkSync(outsideBase, junctionPath, process.platform === 'win32' ? 'junction' : 'dir');

      const check = validateWritePath(join(junctionPath, 'blocked.txt'));
      expect(check.safe).toBe(false);
      expect(check.error).toContain('parent symlink');
    } finally {
      rmSync(insideBase, { recursive: true, force: true });
      rmSync(outsideBase, { recursive: true, force: true });
    }
  });

  it('still allows normal reads inside the current workspace', () => {
    const check = validateReadPath('./package.json');
    expect(check.safe).toBe(true);
  });
});

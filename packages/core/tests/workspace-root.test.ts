import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceRoot } from '../src/workspace/index.js';

describe('resolveWorkspaceRoot', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('prefers an explicit workspace path', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-root-explicit-'));
    tempDirs.push(workspace);

    const root = resolveWorkspaceRoot({ workspacePath: workspace, cwd: tmpdir() });

    expect(root.path).toBe(resolve(workspace));
    expect(root.detectedBy).toBe('explicit_workspace_arg');
    expect(root.trustLevel).toBe('explicit');
  });

  it('detects a parent .geotech project file before a git root', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-root-project-'));
    const child = join(workspace, 'data', 'nested');
    mkdirSync(join(workspace, '.git'), { recursive: true });
    mkdirSync(join(workspace, '.geotech'), { recursive: true });
    mkdirSync(child, { recursive: true });
    writeFileSync(join(workspace, '.geotech', 'project.json'), '{}', 'utf-8');
    tempDirs.push(workspace);

    const root = resolveWorkspaceRoot({ cwd: child });

    expect(root.path).toBe(resolve(workspace));
    expect(root.detectedBy).toBe('geotech_project_file');
    expect(root.trustLevel).toBe('inferred');
  });

  it('falls back to a parent git root before cwd', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-root-git-'));
    const child = join(workspace, 'data');
    mkdirSync(join(workspace, '.git'), { recursive: true });
    mkdirSync(child, { recursive: true });
    tempDirs.push(workspace);

    const root = resolveWorkspaceRoot({ cwd: child });

    expect(root.path).toBe(resolve(workspace));
    expect(root.detectedBy).toBe('git_root');
  });

  it('does not climb out of an unmarked OS temp workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'geotech-root-unmarked-temp-'));
    const child = join(workspace, 'data');
    mkdirSync(child, { recursive: true });
    tempDirs.push(workspace);

    const root = resolveWorkspaceRoot({ cwd: child });

    expect(root.path).toBe(resolve(child));
    expect(root.detectedBy).toBe('cwd');
  });
});

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type WorkspaceRootDetectedBy =
  | 'explicit_workspace_arg'
  | 'geotech_project_file'
  | 'git_root'
  | 'cwd';

export interface WorkspaceRoot {
  path: string;
  detectedBy: WorkspaceRootDetectedBy;
  trustLevel: 'explicit' | 'inferred';
  readScope: 'root_only';
  writeScope: 'geotech_output_only';
}

export interface ResolveWorkspaceRootOptions {
  workspacePath?: string;
  cwd?: string;
}

function findAncestorContaining(startPath: string, relativeMarker: string): string | undefined {
  let current = resolve(startPath);
  for (;;) {
    if (existsSync(join(current, relativeMarker))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveWorkspaceRoot(options: ResolveWorkspaceRootOptions = {}): WorkspaceRoot {
  if (options.workspacePath?.trim()) {
    return {
      path: resolve(options.workspacePath),
      detectedBy: 'explicit_workspace_arg',
      trustLevel: 'explicit',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const geotechRoot = findAncestorContaining(cwd, join('.geotech', 'project.json'));
  if (geotechRoot) {
    return {
      path: geotechRoot,
      detectedBy: 'geotech_project_file',
      trustLevel: 'inferred',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }

  const gitRoot = findAncestorContaining(cwd, '.git');
  if (gitRoot) {
    return {
      path: gitRoot,
      detectedBy: 'git_root',
      trustLevel: 'inferred',
      readScope: 'root_only',
      writeScope: 'geotech_output_only',
    };
  }

  return {
    path: cwd,
    detectedBy: 'cwd',
    trustLevel: 'inferred',
    readScope: 'root_only',
    writeScope: 'geotech_output_only',
  };
}

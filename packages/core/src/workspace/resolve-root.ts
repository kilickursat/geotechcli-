import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

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

function isWithinOrSamePath(candidate: string, parent: string): boolean {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function findNearestWorkspaceMarker(startPath: string): Pick<WorkspaceRoot, 'path' | 'detectedBy'> | undefined {
  let current = resolve(startPath);
  const tempRoot = resolve(tmpdir());
  const stopAt = isWithinOrSamePath(current, tempRoot) ? tempRoot : undefined;
  for (;;) {
    if (existsSync(join(current, '.geotech', 'project.json'))) {
      return {
        path: current,
        detectedBy: 'geotech_project_file',
      };
    }
    if (existsSync(join(current, '.git'))) {
      return {
        path: current,
        detectedBy: 'git_root',
      };
    }
    if (stopAt && current === stopAt) return undefined;
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
  const nearestMarker = findNearestWorkspaceMarker(cwd);
  if (nearestMarker) {
    return {
      path: nearestMarker.path,
      detectedBy: nearestMarker.detectedBy,
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

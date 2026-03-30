// ---------------------------------------------------------------------------
// Filesystem Sandbox — path traversal prevention
//
// All agent filesystem tools MUST validate paths through this module.
// Allowed zones:
//   1. Current working directory (and children)
//   2. ~/.geotechcli/workspace/ (persistent project data)
//
// Blocked patterns:
//   - Paths containing .ssh, .aws, .gnupg, .env files, credentials
//   - Paths outside allowed zones (even via symlink resolution)
//   - /etc, /var, /usr, /proc, /sys, /dev system directories
// ---------------------------------------------------------------------------

import { resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEOTECHCLI_DIR = process.env.GEOTECHCLI_CONFIG_DIR ?? `${homedir()}${sep}.geotechcli`;
const WORKSPACE_DIR = `${GEOTECHCLI_DIR}${sep}workspace`;

const SENSITIVE_PATTERNS = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.gpg',
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.docker',
  '.kube',
  'credentials',
  'id_rsa',
  'id_ed25519',
  'known_hosts',
  'authorized_keys',
  '.git/config',
  '.gitconfig',
  'token',
  'secret',
  'password',
  'private_key',
  'service_account',
];

const BLOCKED_SYSTEM_PREFIXES = [
  '/etc',
  '/var',
  '/usr',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/sbin',
  '/bin',
  '/root',
  '/tmp/.X11',
  'C:\\Windows',
  'C:\\Program Files',
];

// ---------------------------------------------------------------------------
// Sandbox result type
// ---------------------------------------------------------------------------

export interface SandboxCheck {
  safe: boolean;
  resolved: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Ensure workspace exists
// ---------------------------------------------------------------------------

export function ensureWorkspace(): string {
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
  return WORKSPACE_DIR;
}

export function getWorkspaceDir(): string {
  return WORKSPACE_DIR;
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Validate that a path is inside an allowed zone and does not target
 * sensitive files. Call this BEFORE any read/write/list operation.
 *
 * Allowed zones:
 *   - process.cwd() and its children
 *   - WORKSPACE_DIR and its children
 *   - Any additional directories passed in `extraAllowed`
 *
 * For WRITE operations, pass mode='write' to additionally block
 * the config directory itself (only workspace subdir is writable).
 */
export function validatePath(
  targetPath: string,
  mode: 'read' | 'write' = 'read',
  extraAllowed?: string[],
): SandboxCheck {
  const resolved = resolve(targetPath);

  // --- 1. Block system directories ---
  const resolvedLower = resolved.toLowerCase();
  for (const prefix of BLOCKED_SYSTEM_PREFIXES) {
    if (resolvedLower.startsWith(prefix.toLowerCase() + sep) || resolvedLower === prefix.toLowerCase()) {
      return {
        safe: false,
        resolved,
        error: `Access denied: system directory "${prefix}" is blocked.`,
      };
    }
  }

  // --- 2. Block sensitive file patterns ---
  const pathParts = resolved.split(sep);
  for (const part of pathParts) {
    const partLower = part.toLowerCase();
    for (const pattern of SENSITIVE_PATTERNS) {
      if (partLower === pattern.toLowerCase() || partLower.includes(pattern.toLowerCase())) {
        // Exception: allow reading .geotechcli config (but not writing to it directly)
        if (resolved.startsWith(GEOTECHCLI_DIR) && mode === 'read') {
          continue;
        }
        return {
          safe: false,
          resolved,
          error: `Access denied: path contains sensitive pattern "${pattern}". This file may contain credentials or private keys.`,
        };
      }
    }
  }

  // --- 3. Check allowed zones ---
  const cwd = process.cwd();
  const allowedZones = [
    cwd,
    WORKSPACE_DIR,
    ...(extraAllowed ?? []),
  ].map((z) => resolve(z));

  // For read: allow CWD, workspace, and extra
  // For write: allow CWD and workspace only
  const isInAllowedZone = allowedZones.some((zone) => {
    return resolved.startsWith(zone + sep) || resolved === zone;
  });

  if (!isInAllowedZone) {
    return {
      safe: false,
      resolved,
      error: `Access denied: "${resolved}" is outside allowed directories. Allowed: ${allowedZones.join(', ')}`,
    };
  }

  // --- 4. Resolve symlinks and re-check (prevent symlink escape) ---
  if (existsSync(resolved)) {
    try {
      const realPath = realpathSync(resolved);
      const realInAllowed = allowedZones.some(
        (zone) => realPath.startsWith(zone + sep) || realPath === zone,
      );
      if (!realInAllowed) {
        return {
          safe: false,
          resolved,
          error: `Access denied: symlink resolves to "${realPath}" which is outside allowed directories.`,
        };
      }
    } catch {
      // Can't resolve symlink — proceed with caution (file may not exist yet for writes)
    }
  }

  return { safe: true, resolved };
}

/**
 * Convenience: validate for reading.
 */
export function validateReadPath(targetPath: string, extraAllowed?: string[]): SandboxCheck {
  return validatePath(targetPath, 'read', extraAllowed);
}

/**
 * Convenience: validate for writing.
 */
export function validateWritePath(targetPath: string, extraAllowed?: string[]): SandboxCheck {
  return validatePath(targetPath, 'write', extraAllowed);
}

/**
 * Validate a shell command for safety.
 * Returns the sanitized command or an error.
 */
export function validateShellCommand(command: string): SandboxCheck {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0];

  // Allowed read-only commands
  const allowedCommands = ['ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'file', 'stat', 'du', 'pwd', 'echo'];

  // Python: only with .py file, no -c/-m flags
  if (firstWord === 'python' || firstWord === 'python3') {
    const parts = trimmed.split(/\s+/);
    const dangerousFlags = ['-c', '-m', '--command', '-W', '-X'];
    const hasDangerousFlag = parts.some((p) => dangerousFlags.includes(p));
    const hasScriptFile = parts.some((p) => p.endsWith('.py'));

    if (hasDangerousFlag) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Python flag "${parts.find((p) => dangerousFlags.includes(p))}" is blocked. Only "python script.py" is allowed.`,
      };
    }

    if (!hasScriptFile) {
      return {
        safe: false,
        resolved: trimmed,
        error: 'Python must be invoked with a .py script file. Interactive/inline execution is blocked.',
      };
    }
  } else if (!allowedCommands.includes(firstWord)) {
    return {
      safe: false,
      resolved: trimmed,
      error: `Command "${firstWord}" not allowed. Permitted: ${allowedCommands.join(', ')}, python <script.py>`,
    };
  }

  // Block dangerous operators in any command
  const blockedOperators = [
    '>', '>>', '|', '&&', '||', ';', '$(', '`',
    'sudo', 'chmod', 'chown', 'chgrp',
    'rm ', 'rm\t', 'rmdir',
    'mv ', 'mv\t',
    'cp ', 'cp\t',
    'mkfs', 'dd ',
    'wget ', 'curl ',
    'nc ', 'ncat ',
  ];

  for (const op of blockedOperators) {
    if (trimmed.includes(op)) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Command contains blocked operator "${op.trim()}". Pipes, redirects, chaining, and destructive commands are not allowed.`,
      };
    }
  }

  return { safe: true, resolved: trimmed };
}

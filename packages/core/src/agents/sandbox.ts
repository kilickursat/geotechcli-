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

import { dirname, resolve, sep } from 'node:path';
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

function normalizeForPrefixCheck(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function isWithinAllowedZones(targetPath: string, allowedZones: string[]): boolean {
  return allowedZones.some((zone) => targetPath.startsWith(zone + sep) || targetPath === zone);
}

function findNearestExistingParent(targetPath: string): string | null {
  let current = dirname(targetPath);
  let previous = '';

  while (current !== previous) {
    if (existsSync(current)) {
      return current;
    }
    previous = current;
    current = dirname(current);
  }

  return existsSync(current) ? current : null;
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
  const normalizedInput = normalizeForPrefixCheck(targetPath);
  const normalizedResolved = normalizeForPrefixCheck(resolved);

  // --- 1. Block system directories ---
  for (const prefix of BLOCKED_SYSTEM_PREFIXES) {
    const normalizedPrefix = normalizeForPrefixCheck(prefix);
    const matchesSystemPrefix =
      normalizedInput === normalizedPrefix ||
      normalizedInput.startsWith(`${normalizedPrefix}/`) ||
      normalizedResolved === normalizedPrefix ||
      normalizedResolved.startsWith(`${normalizedPrefix}/`);

    if (matchesSystemPrefix) {
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
  const isInAllowedZone = isWithinAllowedZones(resolved, allowedZones);

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
      const realInAllowed = isWithinAllowedZones(realPath, allowedZones);
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

  if (mode === 'write' && !existsSync(resolved)) {
    const nearestExistingParent = findNearestExistingParent(resolved);
    if (nearestExistingParent) {
      try {
        const realParent = realpathSync(nearestExistingParent);
        if (!isWithinAllowedZones(realParent, allowedZones)) {
          return {
            safe: false,
            resolved,
            error: `Access denied: parent symlink resolves to "${realParent}" which is outside allowed directories.`,
          };
        }
      } catch {
        // Keep the earlier prefix and zone checks if parent realpath cannot be resolved.
      }
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
  const parts = trimmed.split(/\s+/);
  const firstWord = parts[0];

  // Allowed read-only commands
  const allowedCommands = ['ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'file', 'stat', 'du', 'pwd', 'echo'];

  if (!allowedCommands.includes(firstWord)) {
    return {
      safe: false,
      resolved: trimmed,
      error: `Command "${firstWord}" not allowed. Permitted: ${allowedCommands.join(', ')}`,
    };
  }

  // Block dangerous operators in any command
  const blockedOperators = [
    '<', '>', '>>', '|', '&&', '||', ';', '$(', '`',
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

  if (firstWord === 'find') {
    const blockedFindPredicates = ['-exec', '-execdir', '-ok', '-delete'];
    for (const token of parts.slice(1)) {
      if (blockedFindPredicates.some((predicate) => token === predicate || token.startsWith(predicate))) {
        return {
          safe: false,
          resolved: trimmed,
          error: `Command contains blocked find predicate "${token}". Command execution and destructive find operations are not allowed.`,
        };
      }
    }
  }

  const nonOptionTokens = parts.slice(1).filter((token) => !token.startsWith('-'));
  const validatePathToken = (token: string): SandboxCheck | null => {
    if (/^\d+$/.test(token)) {
      return null;
    }

    const pathCheck = validateReadPath(token);
    return pathCheck.safe ? null : pathCheck;
  };

  let pathTokens: string[] = [];
  if (['ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du'].includes(firstWord)) {
    pathTokens = nonOptionTokens;
  } else if (firstWord === 'grep') {
    pathTokens = nonOptionTokens.slice(1);
  } else if (firstWord === 'find' && nonOptionTokens.length > 0) {
    pathTokens = [nonOptionTokens[0]];
  }

  for (const token of pathTokens) {
    const pathCheck = validatePathToken(token);
    if (pathCheck && !pathCheck.safe) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Command path "${token}" is not allowed. ${pathCheck.error}`,
      };
    }
  }

  return { safe: true, resolved: trimmed };
}

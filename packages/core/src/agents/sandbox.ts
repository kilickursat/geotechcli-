// ---------------------------------------------------------------------------
// Filesystem sandbox and command hardening for agent tools.
//
// All filesystem and shell tools MUST validate paths through this module.
// Allowed zones:
//   1. Current working directory (and children)
//   2. ~/.geotechcli/workspace/ (persistent project data)
//
// Blocked patterns:
//   - Paths containing credentials or private-key markers
//   - Paths outside allowed zones (including symlink escapes)
//   - System directories
//   - geotechCLI implementation internals
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANDBOX_MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const CORE_PACKAGE_ROOT = resolve(SANDBOX_MODULE_DIR, '..', '..');
const MONOREPO_ROOT_CANDIDATE = resolve(SANDBOX_MODULE_DIR, '..', '..', '..', '..');

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

interface InternalPathRule {
  path: string;
  reason: string;
}

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

function isPathEqualOrWithin(targetPath: string, parentPath: string): boolean {
  const normalizedTarget = normalizeForPrefixCheck(resolve(targetPath));
  const normalizedParent = normalizeForPrefixCheck(resolve(parentPath));
  return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}/`);
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

function isGeotechCliMonorepoRoot(targetPath: string): boolean {
  return existsSync(join(targetPath, 'packages', 'core')) && existsSync(join(targetPath, 'package.json'));
}

function addInternalPathRule(rules: InternalPathRule[], targetPath: string, reason: string): void {
  rules.push({
    path: resolve(targetPath),
    reason,
  });
}

function buildInternalPathRules(): InternalPathRule[] {
  const rules: InternalPathRule[] = [];

  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, 'src'), 'geotechCLI core source tree');
  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, 'dist'), 'geotechCLI published runtime bundle');
  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, 'tests'), 'geotechCLI core test fixtures');
  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, 'bundled-skills'), 'geotechCLI bundled skill assets');
  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, 'node_modules'), 'geotechCLI package dependencies');
  addInternalPathRule(rules, join(CORE_PACKAGE_ROOT, '.turbo'), 'geotechCLI build cache');

  if (isGeotechCliMonorepoRoot(MONOREPO_ROOT_CANDIDATE)) {
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, '.git'), 'geotechCLI git metadata');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, '.github'), 'geotechCLI repository automation');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, '.changeset'), 'geotechCLI release metadata');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'modal'), 'geotechCLI deployment internals');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'scripts'), 'geotechCLI release scripts');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'supabase'), 'geotechCLI infrastructure configuration');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'node_modules'), 'geotechCLI monorepo dependencies');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, '__agent-skill-mock'), 'geotechCLI internal skill fixtures');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'AGENTS.md'), 'geotechCLI internal repo instructions');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'CLAUDE.md'), 'geotechCLI internal repo instructions');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'STRONG_BETA_HANDOFF.md'), 'geotechCLI internal handoff notes');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'STRONG_BETA_SKILLS_CERTIFICATION.md'), 'geotechCLI internal certification notes');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'STRONG_BETA_SKILLS_POLICY.md'), 'geotechCLI internal policy notes');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'cli', 'src'), 'geotechCLI CLI source tree');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'cli', 'dist'), 'geotechCLI CLI build output');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'cli', 'tests'), 'geotechCLI CLI test fixtures');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'cli', '.turbo'), 'geotechCLI CLI build cache');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', 'app'), 'geotechCLI website source tree');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', 'components'), 'geotechCLI website source tree');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', 'lib'), 'geotechCLI website source tree');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', '.next'), 'geotechCLI website build output');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', '.open-next'), 'geotechCLI website deployment bundle');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', 'node_modules'), 'geotechCLI website dependencies');
    addInternalPathRule(rules, join(MONOREPO_ROOT_CANDIDATE, 'packages', 'web', '.turbo'), 'geotechCLI website build cache');
  }

  return rules;
}

const INTERNAL_PATH_RULES = buildInternalPathRules();

function findBlockedInternalPath(targetPath: string): InternalPathRule | undefined {
  return INTERNAL_PATH_RULES.find((rule) => isPathEqualOrWithin(targetPath, rule.path));
}

function hasBlockedInternalDescendant(targetPath: string): boolean {
  const normalizedTarget = normalizeForPrefixCheck(resolve(targetPath));
  return INTERNAL_PATH_RULES.some((rule) => {
    const normalizedRulePath = normalizeForPrefixCheck(rule.path);
    return normalizedRulePath.startsWith(`${normalizedTarget}/`);
  });
}

export function validateEnumerationPath(targetPath: string, extraAllowed?: string[]): SandboxCheck {
  const check = validateReadPath(targetPath, extraAllowed);
  if (!check.safe) {
    return check;
  }

  if (hasBlockedInternalDescendant(check.resolved)) {
    return {
      safe: false,
      resolved: check.resolved,
      error: `Access denied: "${check.resolved}" is too broad because it contains blocked geotechCLI internals. Scope the request to a safe project subdirectory instead.`,
    };
  }

  return check;
}

// ---------------------------------------------------------------------------
// Ensure workspace exists
// ---------------------------------------------------------------------------

function getGeotechCliDir(): string {
  return process.env.GEOTECHCLI_CONFIG_DIR ?? `${homedir()}${sep}.geotechcli`;
}

function getWorkspaceRootDir(): string {
  return `${getGeotechCliDir()}${sep}workspace`;
}

export function ensureWorkspace(): string {
  const workspaceDir = getWorkspaceRootDir();
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
}

export function getWorkspaceDir(): string {
  return getWorkspaceRootDir();
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export function validatePath(
  targetPath: string,
  mode: 'read' | 'write' = 'read',
  extraAllowed?: string[],
): SandboxCheck {
  const resolved = resolve(targetPath);
  const normalizedInput = normalizeForPrefixCheck(targetPath);
  const normalizedResolved = normalizeForPrefixCheck(resolved);

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

  const pathParts = resolved.split(sep);
  for (const part of pathParts) {
    const partLower = part.toLowerCase();
    for (const pattern of SENSITIVE_PATTERNS) {
      if (partLower === pattern.toLowerCase() || partLower.includes(pattern.toLowerCase())) {
        if (resolved.startsWith(getGeotechCliDir()) && mode === 'read') {
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

  const cwd = process.cwd();
  const allowedZones = [cwd, getWorkspaceRootDir(), ...(extraAllowed ?? [])].map((zone) => resolve(zone));
  const isInAllowedZone = isWithinAllowedZones(resolved, allowedZones);

  if (!isInAllowedZone) {
    return {
      safe: false,
      resolved,
      error: `Access denied: "${resolved}" is outside allowed directories. Allowed: ${allowedZones.join(', ')}`,
    };
  }

  const internalPath = findBlockedInternalPath(resolved);
  if (internalPath) {
    return {
      safe: false,
      resolved,
      error: `Access denied: "${resolved}" is part of ${internalPath.reason} and is not available through agent filesystem tools.`,
    };
  }

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

      const realInternalPath = findBlockedInternalPath(realPath);
      if (realInternalPath) {
        return {
          safe: false,
          resolved,
          error: `Access denied: symlink resolves to "${realPath}" which is part of ${realInternalPath.reason}.`,
        };
      }
    } catch {
      // The target may not be fully materialized yet for a write.
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

        const realParentInternalPath = findBlockedInternalPath(realParent);
        if (realParentInternalPath) {
          return {
            safe: false,
            resolved,
            error: `Access denied: parent symlink resolves to "${realParent}" which is part of ${realParentInternalPath.reason}.`,
          };
        }
      } catch {
        // Keep the earlier prefix and zone checks if parent realpath cannot be resolved.
      }
    }
  }

  return { safe: true, resolved };
}

export function validateReadPath(targetPath: string, extraAllowed?: string[]): SandboxCheck {
  return validatePath(targetPath, 'read', extraAllowed);
}

export function validateWritePath(targetPath: string, extraAllowed?: string[]): SandboxCheck {
  return validatePath(targetPath, 'write', extraAllowed);
}

// ---------------------------------------------------------------------------
// Shell command validation
// ---------------------------------------------------------------------------

export function validateShellCommand(command: string, options?: { cwd?: string }): SandboxCheck {
  const trimmed = command.trim();
  const commandCwd = resolve(options?.cwd ?? process.cwd());

  if (!trimmed) {
    return {
      safe: false,
      resolved: trimmed,
      error: 'Command is empty.',
    };
  }

  if (/[\r\n]/.test(trimmed)) {
    return {
      safe: false,
      resolved: trimmed,
      error: 'Command contains blocked operator "newline". Multi-line shell input is not allowed.',
    };
  }

  const parts = trimmed.split(/\s+/);
  const firstWord = parts[0];
  const remaining = parts.slice(1);
  const allowedCommands = ['ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'file', 'stat', 'du', 'pwd', 'echo'];

  if (!allowedCommands.includes(firstWord)) {
    return {
      safe: false,
      resolved: trimmed,
      error: `Command "${firstWord}" not allowed. Permitted: ${allowedCommands.join(', ')}`,
    };
  }

  const blockedOperators = [
    '<',
    '>',
    '>>',
    '|',
    '&&',
    '||',
    ';',
    '$(',
    '`',
    'sudo',
    'chmod',
    'chown',
    'chgrp',
    'rm ',
    'rm\t',
    'rmdir',
    'mv ',
    'mv\t',
    'cp ',
    'cp\t',
    'mkfs',
    'dd ',
    'wget ',
    'curl ',
    'nc ',
    'ncat ',
  ];

  for (const fragment of blockedOperators) {
    if (trimmed.includes(fragment)) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Command contains blocked operator "${fragment.trim()}". Pipes, redirects, chaining, and destructive commands are not allowed.`,
      };
    }
  }

  if (firstWord === 'find') {
    const blockedFindPredicates = ['-exec', '-execdir', '-ok', '-delete'];
    for (const token of remaining) {
      if (blockedFindPredicates.some((predicate) => token === predicate || token.startsWith(predicate))) {
        return {
          safe: false,
          resolved: trimmed,
          error: `Command contains blocked find predicate "${token}". Command execution and destructive find operations are not allowed.`,
        };
      }
    }
  }

  const blockedShellExpansions = ['"', '\'', '*', '?', '[', ']', '{', '}', '$', '%', '!', '^', '(', ')'];
  for (const fragment of blockedShellExpansions) {
    if (trimmed.includes(fragment)) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Command contains blocked shell expansion "${fragment}". Use simple literal arguments only.`,
      };
    }
  }

  const buildPathError = (token: string, check: SandboxCheck): SandboxCheck => ({
    safe: false,
    resolved: trimmed,
    error: `Command path "${token}" is not allowed. ${check.error}`,
  });

  const validateReadOnlyPathToken = (token: string): SandboxCheck | null => {
    const pathCheck = validateReadPath(resolve(commandCwd, token));
    return pathCheck.safe ? null : buildPathError(token, pathCheck);
  };

  const validateEnumeratedPathToken = (token: string): SandboxCheck | null => {
    const pathCheck = validateReadPath(resolve(commandCwd, token));
    if (!pathCheck.safe) {
      return buildPathError(token, pathCheck);
    }

    if (hasBlockedInternalDescendant(pathCheck.resolved)) {
      return {
        safe: false,
        resolved: trimmed,
        error: `Command path "${token}" is too broad because it would expose blocked geotechCLI internals. Scope the command to a safe project subdirectory instead.`,
      };
    }

    return null;
  };

  const rejectUnsupportedOptions = (
    tokens: string[],
    isAllowedOption: (token: string) => boolean,
  ): SandboxCheck | null => {
    for (const token of tokens) {
      if (token.startsWith('-') && !isAllowedOption(token)) {
        return {
          safe: false,
          resolved: trimmed,
          error: `Command option "${token}" is not allowed for ${firstWord}.`,
        };
      }
    }
    return null;
  };

  switch (firstWord) {
    case 'pwd':
      if (remaining.length > 0) {
        return {
          safe: false,
          resolved: trimmed,
          error: 'pwd does not accept arguments in run_command.',
        };
      }
      break;
    case 'echo':
      break;
    case 'ls': {
      const optionError = rejectUnsupportedOptions(remaining, (token) => /^-[al]+$/i.test(token));
      if (optionError) return optionError;
      const pathTokens = remaining.filter((token) => !token.startsWith('-'));
      if (pathTokens.length === 0) {
        const cwdEnumerationCheck = validateEnumeratedPathToken(commandCwd);
        if (cwdEnumerationCheck) return cwdEnumerationCheck;
      }
      for (const token of pathTokens) {
        const pathCheck = validateEnumeratedPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    case 'cat':
    case 'file':
    case 'stat': {
      if (remaining.length === 0) {
        return {
          safe: false,
          resolved: trimmed,
          error: `${firstWord} requires at least one explicit path.`,
        };
      }
      const optionError = rejectUnsupportedOptions(remaining, () => false);
      if (optionError) return optionError;
      for (const token of remaining) {
        const pathCheck = validateReadOnlyPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    case 'head':
    case 'tail': {
      const pathTokens: string[] = [];
      for (let i = 0; i < remaining.length; i++) {
        const token = remaining[i];
        if (token === '-n') {
          const countToken = remaining[i + 1];
          if (!countToken || !/^\d+$/.test(countToken)) {
            return {
              safe: false,
              resolved: trimmed,
              error: `${firstWord} requires a numeric value after -n.`,
            };
          }
          i += 1;
          continue;
        }
        if (/^-\d+$/.test(token)) {
          continue;
        }
        if (token.startsWith('-')) {
          return {
            safe: false,
            resolved: trimmed,
            error: `Command option "${token}" is not allowed for ${firstWord}.`,
          };
        }
        pathTokens.push(token);
      }
      if (pathTokens.length === 0) {
        return {
          safe: false,
          resolved: trimmed,
          error: `${firstWord} requires at least one explicit path.`,
        };
      }
      for (const token of pathTokens) {
        const pathCheck = validateReadOnlyPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    case 'wc': {
      if (remaining.length === 0) {
        return {
          safe: false,
          resolved: trimmed,
          error: 'wc requires at least one explicit path.',
        };
      }
      const optionError = rejectUnsupportedOptions(remaining, (token) => /^-[lwc]+$/i.test(token));
      if (optionError) return optionError;
      const pathTokens = remaining.filter((token) => !token.startsWith('-'));
      if (pathTokens.length === 0) {
        return {
          safe: false,
          resolved: trimmed,
          error: 'wc requires at least one explicit path.',
        };
      }
      for (const token of pathTokens) {
        const pathCheck = validateReadOnlyPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    case 'du': {
      const optionError = rejectUnsupportedOptions(remaining, (token) => /^-[sh]+$/i.test(token));
      if (optionError) return optionError;
      const pathTokens = remaining.filter((token) => !token.startsWith('-'));
      if (pathTokens.length === 0) {
        const cwdEnumerationCheck = validateEnumeratedPathToken(commandCwd);
        if (cwdEnumerationCheck) return cwdEnumerationCheck;
      }
      for (const token of pathTokens) {
        const pathCheck = validateEnumeratedPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    case 'find': {
      if (remaining.length === 0 || remaining[0].startsWith('-')) {
        return {
          safe: false,
          resolved: trimmed,
          error: 'find requires an explicit starting path.',
        };
      }

      const rootPathCheck = validateEnumeratedPathToken(remaining[0]);
      if (rootPathCheck) return rootPathCheck;

      for (let i = 1; i < remaining.length; i++) {
        const token = remaining[i];
        if (token === '-maxdepth') {
          const depthToken = remaining[i + 1];
          if (!depthToken || !/^\d+$/.test(depthToken)) {
            return {
              safe: false,
              resolved: trimmed,
              error: 'find requires a numeric value after -maxdepth.',
            };
          }
          i += 1;
          continue;
        }
        if (token === '-type') {
          const typeToken = remaining[i + 1];
          if (!typeToken || !['f', 'd'].includes(typeToken)) {
            return {
              safe: false,
              resolved: trimmed,
              error: 'find only allows -type f or -type d.',
            };
          }
          i += 1;
          continue;
        }
        if (token === '-name') {
          const nameToken = remaining[i + 1];
          if (!nameToken) {
            return {
              safe: false,
              resolved: trimmed,
              error: 'find requires a literal value after -name.',
            };
          }
          i += 1;
          continue;
        }
        return {
          safe: false,
          resolved: trimmed,
          error: `Command option "${token}" is not allowed for find.`,
        };
      }
      break;
    }
    case 'grep': {
      const optionTokens: string[] = [];
      const nonOptionTokens: string[] = [];
      for (const token of remaining) {
        if (token.startsWith('-') && nonOptionTokens.length === 0) {
          optionTokens.push(token);
          continue;
        }
        nonOptionTokens.push(token);
      }
      const optionError = rejectUnsupportedOptions(optionTokens, (token) => /^-[in]+$/i.test(token));
      if (optionError) return optionError;
      if (nonOptionTokens.length < 2) {
        return {
          safe: false,
          resolved: trimmed,
          error: 'grep requires a literal search term and at least one explicit path.',
        };
      }
      const [, ...pathTokens] = nonOptionTokens;
      for (const token of pathTokens) {
        const pathCheck = validateEnumeratedPathToken(token);
        if (pathCheck) return pathCheck;
      }
      break;
    }
    default:
      break;
  }

  return { safe: true, resolved: trimmed };
}

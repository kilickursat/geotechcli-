import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

import { loadConfig } from '../config/index.js';
import { ensureWorkspace } from '../agents/sandbox.js';
import { validateReadPath, validateWritePath, getWorkspaceDir } from '../agents/sandbox.js';
import { addArtifact, addNote, saveNamedDataset } from '../storage/index.js';
export {
  getStrongBetaSkillApproval,
  isStrongBetaSkillApproved,
  STRONG_BETA_SKILL_APPROVALS,
  type StrongBetaSkillApproval,
  type StrongBetaSkillApprovalStatus,
} from './approval.js';

export const AGENT_SKILL_TOOL_NAMES = ['list_skills', 'describe_skill', 'run_skill'] as const;
export type AgentSkillToolName = (typeof AGENT_SKILL_TOOL_NAMES)[number];
export type SkillRuntime = 'python-script' | 'prompt-only';
export type SkillSourceType = 'zip' | 'directory';

export interface SkillsRuntimeConfig {
  enabled: boolean;
  directory: string;
  pythonPath: string;
  trustedOnly: boolean;
}

export interface InstalledSkill {
  name: string;
  displayName: string;
  description: string;
  runtime: SkillRuntime;
  installPath: string;
  skillFile: string;
  installedAt: string;
  entryScript?: string;
  sourceType: SkillSourceType;
  sourceLabel: string;
  installHash: string;
  scriptCount: number;
  referenceCount: number;
  assetCount: number;
  hasOpenAIYaml: boolean;
  trusted: boolean;
}

export interface SkillValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface SkillValidationCandidate {
  name?: string;
  displayName?: string;
  description?: string;
  runtime?: SkillRuntime;
  rootDir: string;
  entryScript?: string;
  issues: SkillValidationIssue[];
}

interface DiscoveredSkillCandidate extends SkillValidationCandidate {
  contentHash?: string;
}

export interface SkillValidationResult {
  sourcePath: string;
  valid: boolean;
  candidates: SkillValidationCandidate[];
  issues: SkillValidationIssue[];
}

export interface SkillImportResult {
  sourcePath: string;
  imported: InstalledSkill[];
  replaced: string[];
}

export interface SkillRunOptions {
  inputDir: string;
  outputDir?: string;
  projectId?: string;
}

export interface SkillRunResult {
  skill: InstalledSkill;
  success: boolean;
  exitCode: number | null;
  runDir: string;
  outputDir: string;
  stdout: string;
  stderr: string;
  swarmHandoffPath?: string;
  engineeringReportPath?: string;
  caseFileArtifactMapPath?: string;
  swarmHandoff?: Record<string, unknown>;
  engineeringReport?: string;
  caseFileArtifactMap?: Record<string, unknown>;
  persistedToProject: boolean;
  summary: string;
}

interface SkillManifestData extends InstalledSkill {}

interface LegacySkillInputBinding {
  flag: string;
  fileName: string;
}

interface StandardSkillExecutionProfile {
  contract: 'input-dir-output-dir';
}

interface LegacySkillExecutionProfile {
  contract: 'legacy-file-inputs';
  inputBindings: LegacySkillInputBinding[];
  candidateArtifactTypes: string[];
}

type SkillExecutionProfile = StandardSkillExecutionProfile | LegacySkillExecutionProfile;

const MANIFEST_FILENAME = '.geotechcli-skill.json';
const SUPPORTED_SKILL_FILE_EXTENSIONS = new Set([
  '.py',
  '.md',
  '.json',
  '.csv',
  '.yaml',
  '.yml',
  '.txt',
]);
const DEFAULT_SKILL_EXECUTION_PROFILE: SkillExecutionProfile = {
  contract: 'input-dir-output-dir',
};
const SKILL_EXECUTION_PROFILES: Record<string, SkillExecutionProfile> = {
  'epb-conditioning-clogging': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--ground-model', fileName: 'ground_model.json' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
      { flag: '--alignment-zones', fileName: 'alignment_zones.csv' },
    ],
    candidateArtifactTypes: ['assumptions', 'results', 'issues-and-corrections'],
  },
  'epb-face-support-window': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--ground-model', fileName: 'ground_model.json' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
      { flag: '--alignment-zones', fileName: 'alignment_zones.csv' },
    ],
    candidateArtifactTypes: ['results', 'review-checklist', 'acceptance-status'],
  },
  'epb-production-and-ring-cycle': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--monitoring', fileName: 'monitoring.csv' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
    ],
    candidateArtifactTypes: ['results', 'final-report', 'review-checklist'],
  },
  'epb-soft-ground-screening': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--ground-model', fileName: 'ground_model.json' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
      { flag: '--alignment-zones', fileName: 'alignment_zones.csv' },
    ],
    candidateArtifactTypes: ['ground-model', 'analysis-plan', 'results'],
  },
  'mixed-face-transition-planning': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--ground-model', fileName: 'ground_model.json' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
      { flag: '--alignment-zones', fileName: 'alignment_zones.csv' },
    ],
    candidateArtifactTypes: ['analysis-plan', 'results', 'review-checklist', 'issues-and-corrections'],
  },
  'soft-ground-settlement-observational-control': {
    contract: 'legacy-file-inputs',
    inputBindings: [
      { flag: '--ground-model', fileName: 'ground_model.json' },
      { flag: '--machine-config', fileName: 'machine_config.json' },
      { flag: '--alignment-zones', fileName: 'alignment_zones.csv' },
      { flag: '--monitoring', fileName: 'monitoring.csv' },
    ],
    candidateArtifactTypes: ['results', 'review-checklist', 'acceptance-status', 'issues-and-corrections'],
  },
};
const DEFAULT_BUNDLED_SKILL_ARCHIVES = [
  'geotechcli-geotech-skills-wave-2.zip',
  'geotechcli-geotech-skills-wave-3.zip',
  'geotechcli-geotech-skills-wave-4.zip',
  'geotechcli-geotech-skills-wave-5.zip',
  'geotechcli-tunnel-skills-workspace.zip',
  'skill.zip',
] as const;

let bundledSkillsBootstrapAttemptedForDir: string | null = null;
let bundledSkillsBootstrapActiveForDir: string | null = null;

function getSkillsDirFallback(): string {
  return join(
    process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli'),
    'skills',
  );
}

function getCorePackageRootDir(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}

function getBundledSkillsDir(): string {
  return join(getCorePackageRootDir(), 'bundled-skills');
}

function nowIso(): string {
  return new Date().toISOString();
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function titleCaseFromName(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readTextIfExists(path: string): string | null {
  return isFile(path) ? readFileSync(path, 'utf-8') : null;
}

function parseFrontmatter(skillMarkdown: string): { name?: string; description?: string } {
  const match = skillMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1] ?? '';
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return {
    name,
    description,
  };
}

function parseOpenAIYamlDisplayName(openAIYaml: string | null): string | undefined {
  if (!openAIYaml) return undefined;
  return openAIYaml.match(/^\s*display_name:\s*"?(.+?)"?\s*$/m)?.[1]?.trim();
}

function discoverSkillRoots(rootDir: string): string[] {
  const discovered = new Set<string>();

  function walk(currentDir: string): void {
    if (isFile(join(currentDir, 'SKILL.md'))) {
      discovered.add(currentDir);
      return;
    }

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(join(currentDir, entry.name));
    }
  }

  walk(rootDir);
  return [...discovered].sort((left, right) => left.localeCompare(right));
}

function walkFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }

  walk(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

function detectEntryScript(skillRoot: string, skillName: string, skillMarkdown: string): string | undefined {
  const scriptsDir = join(skillRoot, 'scripts');
  if (!isDirectory(scriptsDir)) {
    return undefined;
  }

  const explicitMatches = [...skillMarkdown.matchAll(/scripts\/([A-Za-z0-9._-]+\.py)/g)]
    .map((match) => match[1])
    .filter((entry) => isFile(join(scriptsDir, entry)));

  if (explicitMatches.length > 0) {
    return join('scripts', explicitMatches[0]);
  }

  const scripts = readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.py'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (scripts.length === 1) {
    return join('scripts', scripts[0]);
  }

  const normalizedName = skillName.replace(/-/g, '_');
  const exactMatch = scripts.find((entry) => basename(entry, '.py') === normalizedName);
  if (exactMatch) {
    return join('scripts', exactMatch);
  }

  const nonHelperScripts = scripts.filter(
    (entry) => !/^common[_-]/.test(entry) && !/^__/.test(entry),
  );

  if (nonHelperScripts.length === 1) {
    return join('scripts', nonHelperScripts[0]);
  }

  return nonHelperScripts[0] ? join('scripts', nonHelperScripts[0]) : undefined;
}

function computeInstallHash(rootDir: string): string {
  const hash = createHash('sha256');
  for (const filePath of walkFiles(rootDir)) {
    hash.update(relative(rootDir, filePath).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function toCandidate(skillRoot: string): DiscoveredSkillCandidate {
  const issues: SkillValidationIssue[] = [];
  const skillFile = join(skillRoot, 'SKILL.md');
  const skillMarkdown = readTextIfExists(skillFile);

  if (!skillMarkdown) {
    return {
      rootDir: skillRoot,
      issues: [{ severity: 'error', message: 'Missing SKILL.md.' }],
    };
  }

  const frontmatter = parseFrontmatter(skillMarkdown);
  if (!frontmatter.name) {
    issues.push({ severity: 'error', message: 'SKILL.md frontmatter is missing "name".' });
  }
  if (!frontmatter.description) {
    issues.push({ severity: 'error', message: 'SKILL.md frontmatter is missing "description".' });
  }

  const files = walkFiles(skillRoot);
  for (const filePath of files) {
    const relativePath = relative(skillRoot, filePath).replace(/\\/g, '/');
    if (relativePath === MANIFEST_FILENAME) continue;
    const extension = extname(filePath).toLowerCase();
    if (!SUPPORTED_SKILL_FILE_EXTENSIONS.has(extension)) {
      issues.push({
        severity: 'error',
        message: `Unsupported file type in skill bundle: ${relativePath}`,
      });
    }
  }

  const openAIYaml = readTextIfExists(join(skillRoot, 'agents', 'openai.yaml'));
  const displayName = parseOpenAIYamlDisplayName(openAIYaml) ?? (frontmatter.name ? titleCaseFromName(frontmatter.name) : undefined);
  const runtime = isDirectory(join(skillRoot, 'scripts')) ? 'python-script' : 'prompt-only';
  const entryScript = frontmatter.name ? detectEntryScript(skillRoot, frontmatter.name, skillMarkdown) : undefined;

  if (runtime === 'python-script' && !entryScript) {
    issues.push({
      severity: 'error',
      message: 'Python-script skill does not have a detectable entry script in scripts/.',
    });
  }

  if (!openAIYaml) {
    issues.push({
      severity: 'warning',
      message: 'agents/openai.yaml is missing; display metadata will fall back to the skill name.',
    });
  }

  return {
    name: frontmatter.name,
    displayName,
    description: frontmatter.description,
    runtime,
    rootDir: skillRoot,
    entryScript,
    contentHash: computeInstallHash(skillRoot),
    issues,
  };
}

function isPathWithin(targetPath: string, parentPath: string): boolean {
  const resolvedTarget = resolve(targetPath);
  const resolvedParent = resolve(parentPath);
  return resolvedTarget === resolvedParent || resolvedTarget.startsWith(`${resolvedParent}\\`) || resolvedTarget.startsWith(`${resolvedParent}/`);
}

function isTrustedSkillSourcePath(sourcePath: string): boolean {
  const resolvedSource = resolve(sourcePath);
  const trustedRoots = [
    process.cwd(),
    getWorkspaceDir(),
    process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli'),
  ].map((rootPath) => resolve(rootPath));

  return trustedRoots.some((rootPath) => isPathWithin(resolvedSource, rootPath));
}

function buildInstalledSkill(
  candidate: SkillValidationCandidate,
  sourceType: SkillSourceType,
  sourceLabel: string,
  trusted: boolean,
): InstalledSkill {
  const rootDir = resolve(candidate.rootDir);
  const files = walkFiles(rootDir);
  const discoveredCandidate = candidate as DiscoveredSkillCandidate;

  return {
    name: candidate.name!,
    displayName: candidate.displayName ?? titleCaseFromName(candidate.name!),
    description: candidate.description ?? '',
    runtime: candidate.runtime ?? 'prompt-only',
    installPath: rootDir,
    skillFile: join(rootDir, 'SKILL.md'),
    installedAt: nowIso(),
    entryScript: candidate.entryScript ? join(rootDir, candidate.entryScript) : undefined,
    sourceType,
    sourceLabel,
    installHash: discoveredCandidate.contentHash ?? computeInstallHash(rootDir),
    scriptCount: files.filter((filePath) => relative(rootDir, filePath).replace(/\\/g, '/').startsWith('scripts/')).length,
    referenceCount: files.filter((filePath) => relative(rootDir, filePath).replace(/\\/g, '/').startsWith('references/')).length,
    assetCount: files.filter((filePath) => relative(rootDir, filePath).replace(/\\/g, '/').startsWith('assets/')).length,
    hasOpenAIYaml: isFile(join(rootDir, 'agents', 'openai.yaml')),
    trusted,
  };
}

function manifestPathFor(dirPath: string): string {
  return join(dirPath, MANIFEST_FILENAME);
}

function writeManifest(skillDir: string, skill: InstalledSkill): void {
  const manifest: SkillManifestData = {
    ...skill,
    installPath: skillDir,
    skillFile: join(skillDir, 'SKILL.md'),
    entryScript: skill.entryScript
      ? join(skillDir, relative(skill.installPath, skill.entryScript))
      : undefined,
  };
  writeFileSync(manifestPathFor(skillDir), JSON.stringify(manifest, null, 2), 'utf-8');
}

function loadManifest(dirPath: string): InstalledSkill | null {
  const manifestPath = manifestPathFor(dirPath);
  if (!isFile(manifestPath)) return null;

  const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<SkillManifestData>;
  if (!parsed.name || !parsed.description || !parsed.installPath || !parsed.skillFile || !parsed.runtime) {
    return null;
  }

  return {
    name: parsed.name,
    displayName: parsed.displayName ?? titleCaseFromName(parsed.name),
    description: parsed.description,
    runtime: parsed.runtime,
    installPath: parsed.installPath,
    skillFile: parsed.skillFile,
    installedAt: parsed.installedAt ?? nowIso(),
    entryScript: parsed.entryScript,
    sourceType: parsed.sourceType ?? 'directory',
    sourceLabel: parsed.sourceLabel ?? basename(dirPath),
    installHash: parsed.installHash ?? computeInstallHash(dirPath),
    scriptCount: parsed.scriptCount ?? 0,
    referenceCount: parsed.referenceCount ?? 0,
    assetCount: parsed.assetCount ?? 0,
    hasOpenAIYaml: parsed.hasOpenAIYaml ?? false,
    trusted: parsed.trusted ?? false,
  };
}

function ensureDirectory(dirPath: string): string {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function countInstalledSkillManifests(skillsDir: string): number {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name))
    .filter((dirPath) => isFile(manifestPathFor(dirPath)))
    .length;
}

function getBundledSkillArchivePaths(): string[] {
  const bundledDir = getBundledSkillsDir();
  if (!isDirectory(bundledDir)) {
    return [];
  }

  return DEFAULT_BUNDLED_SKILL_ARCHIVES
    .map((archiveName) => join(bundledDir, archiveName))
    .filter((archivePath) => isFile(archivePath));
}

function createTempDir(prefix: string): string {
  const dirPath = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function buildPythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };
}

function validateZipEntries(entries: string[]): void {
  for (const entry of entries) {
    const normalized = entry.trim().replace(/\\/g, '/');
    if (!normalized) continue;
    if (normalized.startsWith('/')) {
      throw new Error(`unsafe zip entry: ${entry}`);
    }
    if (/^[A-Za-z]:\//.test(normalized)) {
      throw new Error(`unsafe zip entry: ${entry}`);
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.some((part) => part === '..')) {
      throw new Error(`unsafe zip entry: ${entry}`);
    }
  }
}

function extractZipToTemp(sourcePath: string): string {
  const extractRoot = createTempDir('geotechcli-skill-import');
  try {
    const entries = unzipSync(readFileSync(sourcePath));
    validateZipEntries(Object.keys(entries));

    for (const [entryName, contents] of Object.entries(entries)) {
      const normalized = entryName.trim().replace(/\\/g, '/');
      if (!normalized) {
        continue;
      }

      const parts = normalized.split('/').filter(Boolean);
      if (parts.length === 0) {
        continue;
      }

      const targetPath = join(extractRoot, ...parts);
      if (normalized.endsWith('/')) {
        mkdirSync(targetPath, { recursive: true });
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, Buffer.from(contents));
    }
  } catch (error) {
    rmSync(extractRoot, { recursive: true, force: true });
    throw error instanceof Error
      ? new Error(`Failed to extract skill archive: ${error.message}`)
      : new Error('Failed to extract skill archive.');
  }

  return extractRoot;
}

function withPreparedSource<T>(sourcePath: string, callback: (preparedRoot: string, sourceType: SkillSourceType) => T): T {
  const resolvedPath = resolve(sourcePath);
  if (isDirectory(resolvedPath)) {
    return callback(resolvedPath, 'directory');
  }

  if (isFile(resolvedPath) && extname(resolvedPath).toLowerCase() === '.zip') {
    const extractedRoot = extractZipToTemp(resolvedPath);
    try {
      return callback(extractedRoot, 'zip');
    } finally {
      rmSync(extractedRoot, { recursive: true, force: true });
    }
  }

  throw new Error(`Unsupported skill source: ${sourcePath}. Expected a directory or .zip file.`);
}

function discoverPreparedSkillCandidates(preparedRoot: string): {
  candidates: DiscoveredSkillCandidate[];
  cleanupPaths: string[];
} {
  const cleanupPaths: string[] = [];
  const seenRoots = new Set<string>();
  const candidates: DiscoveredSkillCandidate[] = [];

  const addSkillRootsFrom = (rootDir: string): void => {
    for (const skillRoot of discoverSkillRoots(rootDir)) {
      const resolvedRoot = resolve(skillRoot);
      if (seenRoots.has(resolvedRoot)) continue;
      seenRoots.add(resolvedRoot);
      candidates.push(toCandidate(skillRoot));
    }
  };

  addSkillRootsFrom(preparedRoot);

  const nestedZipPaths = walkFiles(preparedRoot)
    .filter((filePath) => extname(filePath).toLowerCase() === '.zip')
    .sort((left, right) => left.localeCompare(right));

  for (const zipPath of nestedZipPaths) {
    const nestedPreparedRoot = extractZipToTemp(zipPath);
    cleanupPaths.push(nestedPreparedRoot);
    addSkillRootsFrom(nestedPreparedRoot);
  }

  return {
    candidates,
    cleanupPaths,
  };
}

function dedupeEquivalentCandidates(
  candidates: DiscoveredSkillCandidate[],
): SkillValidationCandidate[] {
  const deduped = new Map<string, DiscoveredSkillCandidate>();

  for (const candidate of candidates) {
    const key = candidate.name && candidate.contentHash
      ? `${candidate.name}::${candidate.contentHash}`
      : resolve(candidate.rootDir);

    if (!deduped.has(key)) {
      deduped.set(key, {
        ...candidate,
        issues: [...candidate.issues],
      });
    }
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const leftKey = left.name ?? left.rootDir;
      const rightKey = right.name ?? right.rootDir;
      return leftKey.localeCompare(rightKey);
    })
    .map(({ contentHash, ...candidate }) => candidate);
}

function buildValidationResult(
  sourcePath: string,
  candidates: SkillValidationCandidate[],
): SkillValidationResult {
  const issues: SkillValidationIssue[] = [];

  if (candidates.length === 0) {
    issues.push({ severity: 'error', message: 'No SKILL.md files were found in the provided source.' });
  }

  const duplicateNames = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate.name) continue;
    duplicateNames.set(candidate.name, (duplicateNames.get(candidate.name) ?? 0) + 1);
  }

  for (const candidate of candidates) {
    if (candidate.name && (duplicateNames.get(candidate.name) ?? 0) > 1) {
      candidate.issues.push({
        severity: 'error',
        message: `Duplicate skill name "${candidate.name}" detected in the same source.`,
      });
    }
    issues.push(...candidate.issues);
  }

  return {
    sourcePath: resolve(sourcePath),
    valid: issues.every((issue) => issue.severity !== 'error'),
    candidates,
    issues,
  };
}

function withPreparedSkillCandidates<T>(
  sourcePath: string,
  callback: (payload: {
    resolvedSourcePath: string;
    sourceType: SkillSourceType;
    candidates: SkillValidationCandidate[];
  }) => T,
): T {
  return withPreparedSource(sourcePath, (preparedRoot, sourceType) => {
    const { candidates, cleanupPaths } = discoverPreparedSkillCandidates(preparedRoot);
    const dedupedCandidates = dedupeEquivalentCandidates(candidates);

    try {
      return callback({
        resolvedSourcePath: resolve(sourcePath),
        sourceType,
        candidates: dedupedCandidates,
      });
    } finally {
      for (const cleanupPath of cleanupPaths) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
    }
  });
}

export function getSkillsRuntimeConfig(): SkillsRuntimeConfig {
  const config = loadConfig();
  const configuredDirectory = config.skills.directory?.trim();

  return {
    enabled: process.env.GEOTECHCLI_ENABLE_SKILLS === '1' || config.skills.enabled,
    directory: process.env.GEOTECHCLI_SKILLS_DIR?.trim() || configuredDirectory || getSkillsDirFallback(),
    pythonPath: process.env.GEOTECHCLI_SKILLS_PYTHON?.trim() || config.skills.python_path || 'python',
    trustedOnly: process.env.GEOTECHCLI_SKILLS_TRUSTED_ONLY === '0'
      ? false
      : config.skills.trusted_only,
  };
}

export function areAgentSkillToolsEnabled(): boolean {
  return getSkillsRuntimeConfig().enabled;
}

export function ensureBundledSkillsInstalled(): InstalledSkill[] {
  const skillsDir = getSkillsDirectory();
  const installedSkillCount = countInstalledSkillManifests(skillsDir);
  if (installedSkillCount > 0) {
    bundledSkillsBootstrapAttemptedForDir = skillsDir;
    return listInstalledSkills();
  }

  if (bundledSkillsBootstrapAttemptedForDir === skillsDir || bundledSkillsBootstrapActiveForDir === skillsDir) {
    return listInstalledSkills();
  }

  bundledSkillsBootstrapActiveForDir = skillsDir;
  try {
    const bundledArchives = getBundledSkillArchivePaths();
    for (const archivePath of bundledArchives) {
      importSkillsFromSource(archivePath, { force: true });
    }
    bundledSkillsBootstrapAttemptedForDir = skillsDir;
  } finally {
    if (bundledSkillsBootstrapActiveForDir === skillsDir) {
      bundledSkillsBootstrapActiveForDir = null;
    }
  }

  return listInstalledSkills();
}

export function isAgentSkillToolName(toolName: string): toolName is AgentSkillToolName {
  return (AGENT_SKILL_TOOL_NAMES as readonly string[]).includes(toolName);
}

export function getSkillsDirectory(): string {
  return ensureDirectory(resolve(getSkillsRuntimeConfig().directory));
}

export function listInstalledSkills(): InstalledSkill[] {
  const skillsDir = getSkillsDirectory();
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadManifest(join(skillsDir, entry.name)))
    .filter((skill): skill is InstalledSkill => skill !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getInstalledSkill(name: string): InstalledSkill {
  const skill = listInstalledSkills().find((entry) => entry.name === name);
  if (!skill) {
    throw new Error(`Skill "${name}" is not installed.`);
  }
  return skill;
}

export function readInstalledSkillGuide(name: string): string {
  const skill = getInstalledSkill(name);
  return readFileSync(skill.skillFile, 'utf-8');
}

export function validateSkillSource(sourcePath: string): SkillValidationResult {
  return withPreparedSkillCandidates(sourcePath, ({ resolvedSourcePath, candidates }) =>
    buildValidationResult(resolvedSourcePath, candidates),
  );
}

export function validateInstalledSkill(name: string): SkillValidationResult {
  const skill = getInstalledSkill(name);
  const candidate = toCandidate(skill.installPath);
  return {
    sourcePath: skill.installPath,
    valid: candidate.issues.every((issue) => issue.severity !== 'error'),
    candidates: [candidate],
    issues: [...candidate.issues],
  };
}

export function importSkillsFromSource(sourcePath: string, options?: { force?: boolean }): SkillImportResult {
  return withPreparedSkillCandidates(sourcePath, ({
    resolvedSourcePath,
    sourceType,
    candidates,
  }) => {
    const validation = buildValidationResult(resolvedSourcePath, candidates);
    if (!validation.valid) {
      const errors = validation.issues.filter((issue) => issue.severity === 'error');
      throw new Error(errors.map((issue) => issue.message).join(' '));
    }

    const trusted = isTrustedSkillSourcePath(sourcePath);
    if (getSkillsRuntimeConfig().trustedOnly && !trusted) {
      throw new Error(
        `Skill import blocked: "${resolvedSourcePath}" is outside trusted strong-beta skill locations.`,
      );
    }

    const sourceLabel = basename(resolvedSourcePath);
    const imported: InstalledSkill[] = [];
    const replaced: string[] = [];

    for (const candidate of candidates) {
      if (!candidate.name) continue;
      const installDir = join(getSkillsDirectory(), candidate.name);

      if (existsSync(installDir)) {
        if (!options?.force) {
          throw new Error(`Skill "${candidate.name}" is already installed. Re-run with --force to replace it.`);
        }
        rmSync(installDir, { recursive: true, force: true });
        replaced.push(candidate.name);
      }

      cpSync(candidate.rootDir, installDir, { recursive: true });
      const installedSkill = buildInstalledSkill(
        {
          ...candidate,
          rootDir: installDir,
        },
        sourceType,
        sourceLabel,
        trusted,
      );
      writeManifest(installDir, installedSkill);
      imported.push(installedSkill);
    }

    return {
      sourcePath: resolvedSourcePath,
      imported,
      replaced,
    };
  });
}

function parseJsonFile(path: string): Record<string, unknown> | undefined {
  if (!isFile(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function getSkillExecutionProfile(name: string): SkillExecutionProfile {
  return SKILL_EXECUTION_PROFILES[name] ?? DEFAULT_SKILL_EXECUTION_PROFILE;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeCriticalRisks(value: unknown): string[] {
  return asStringArray(value).filter((item) => {
    const token = item.trim().toLowerCase();
    return token !== 'none' && token !== 'no critical risks' && token !== 'no critical risk';
  });
}

function getLegacyAssessmentScope(payload: Record<string, unknown>): { count: number; noun: string } {
  if (Array.isArray(payload.zone_results)) {
    return { count: payload.zone_results.length, noun: 'zone' };
  }

  const totalRings = asFiniteNumber(payload.total_rings);
  if (totalRings != null) {
    return { count: totalRings, noun: 'ring' };
  }

  return { count: 0, noun: 'item' };
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildLegacyProjectSummary(
  skill: InstalledSkill,
  payload: Record<string, unknown>,
  overallRecommendation: string | undefined,
  assessmentCount: number,
  assessmentNoun: string,
  criticalRiskCount: number,
  missingInputCount: number,
): string {
  const targetRings = asFiniteNumber(payload.target_rings);
  const avgCycle = asFiniteNumber(payload.avg_cycle_min);
  const metRingTarget = payload.met_ring_target === true
    ? 'met'
    : payload.met_ring_target === false
      ? 'missed'
      : undefined;
  const lead = overallRecommendation
    ? `${skill.displayName} overall recommendation: ${overallRecommendation}.`
    : assessmentNoun === 'ring'
      ? `${skill.displayName} reviewed ${pluralize(assessmentCount, 'ring')}${targetRings != null ? ` against a target of ${targetRings}` : ''}${avgCycle != null ? ` with an average cycle of ${avgCycle.toFixed(1)} minutes` : ''}${metRingTarget ? ` and ${metRingTarget} the ring target` : ''}.`
      : `${skill.displayName} evaluated ${pluralize(assessmentCount, assessmentNoun)}.`;
  const risk = criticalRiskCount > 0
    ? ` Flagged ${pluralize(criticalRiskCount, 'critical risk')}.`
    : ' No critical risks were flagged.';
  const missing = missingInputCount > 0
    ? ` ${pluralize(missingInputCount, 'missing input')} still need confirmation.`
    : '';
  return `${lead}${risk}${missing}`.trim();
}

function buildLegacyRunSummary(
  overallRecommendation: string | undefined,
  criticalRiskCount: number,
  missingInputCount: number,
  assessmentCount: number,
  assessmentNoun: string,
): string {
  const parts: string[] = [];
  if (overallRecommendation) {
    parts.push(`overall recommendation ${overallRecommendation}`);
  }
  parts.push(`${pluralize(assessmentCount, assessmentNoun)} assessed`);
  if (criticalRiskCount > 0) {
    parts.push(`${pluralize(criticalRiskCount, 'critical risk')} flagged`);
  }
  if (missingInputCount > 0) {
    parts.push(`${pluralize(missingInputCount, 'missing input')} remain`);
  }
  return parts.join('; ') + '.';
}

function normalizeLegacySkillHandoff(
  skill: InstalledSkill,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const criticalRisks = normalizeCriticalRisks(payload.critical_risks);
  const missingInputs = asStringArray(payload.missing_inputs);
  const assessmentScope = getLegacyAssessmentScope(payload);
  const overallRecommendation =
    asNonEmptyString(payload.overall_recommendation) ?? asNonEmptyString(payload.recommendation);
  const projectSummary =
    asNonEmptyString(payload.project_summary) ??
    buildLegacyProjectSummary(
      skill,
      payload,
      overallRecommendation,
      assessmentScope.count,
      assessmentScope.noun,
      criticalRisks.length,
      missingInputs.length,
    );
  const summary =
    asNonEmptyString(payload.summary) ??
    buildLegacyRunSummary(
      overallRecommendation,
      criticalRisks.length,
      missingInputs.length,
      assessmentScope.count,
      assessmentScope.noun,
    );

  return {
    ...payload,
    skill: payload.skill ?? skill.name,
    project_summary: projectSummary,
    summary,
  };
}

function buildLegacyArtifactMap(
  skill: InstalledSkill,
  profile: LegacySkillExecutionProfile,
  swarmHandoff: Record<string, unknown>,
): Record<string, unknown> {
  const missingInputs = asStringArray(swarmHandoff.missing_inputs);
  const recommendedNextTools = asStringArray(swarmHandoff.recommended_next_tools);
  const criticalRisks = normalizeCriticalRisks(swarmHandoff.critical_risks);

  return {
    skill: skill.name,
    execution_contract: profile.contract,
    named_dataset_keys: [
      `skill:${skill.name}:swarm_handoff`,
      `skill:${skill.name}:artifact_map`,
    ],
    derived_parameters: [],
    assumption_records: missingInputs.map((item) => ({
      type: 'missing_input',
      detail: item,
    })),
    candidate_case_file_artifact_types: profile.candidateArtifactTypes,
    recommended_next_tools: recommendedNextTools,
    critical_risks: criticalRisks,
  };
}

function runLegacyFileInputSkill(
  skill: InstalledSkill,
  inputDir: string,
  outputDir: string,
  profile: LegacySkillExecutionProfile,
  swarmHandoffPath: string,
  engineeringReportPath: string,
  caseFileArtifactMapPath: string,
): SpawnSyncReturns<string> {
  const args = [skill.entryScript as string];

  for (const binding of profile.inputBindings) {
    const inputPath = join(inputDir, binding.fileName);
    if (!isFile(inputPath)) {
      throw new Error(
        `Skill "${skill.name}" requires ${binding.fileName} in the input directory for ${binding.flag}.`,
      );
    }
    args.push(binding.flag, inputPath);
  }

  args.push('--output-json', swarmHandoffPath, '--output-markdown', engineeringReportPath);

  const result: SpawnSyncReturns<string> = spawnSync(getSkillsRuntimeConfig().pythonPath, args, {
    cwd: skill.installPath,
    encoding: 'utf-8',
    timeout: 90_000,
    env: buildPythonEnv(),
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    const rawHandoff = parseJsonFile(swarmHandoffPath);
    if (rawHandoff) {
      const normalized = normalizeLegacySkillHandoff(skill, rawHandoff);
      writeFileSync(swarmHandoffPath, JSON.stringify(normalized, null, 2) + '\n');
      writeFileSync(
        caseFileArtifactMapPath,
        JSON.stringify(buildLegacyArtifactMap(skill, profile, normalized), null, 2) + '\n',
      );
    }
  }

  return result;
}

function buildSkillRunSummary(
  skill: InstalledSkill,
  success: boolean,
  swarmHandoff: Record<string, unknown> | undefined,
): string {
  if (!success) {
    return `${skill.name} failed to complete.`;
  }

  const summary = typeof swarmHandoff?.summary === 'string' ? swarmHandoff.summary : undefined;
  return summary ? `${skill.displayName}: ${summary}` : `${skill.displayName} completed successfully.`;
}

function persistSkillRun(projectId: string, run: SkillRunResult): void {
  if (run.swarmHandoff) {
    saveNamedDataset(projectId, {
      name: `skill:${run.skill.name}:swarm_handoff`,
      kind: 'skill-swarm-handoff',
      data: run.swarmHandoff,
      source: run.skill.name,
    });
  }

  if (run.caseFileArtifactMap) {
    saveNamedDataset(projectId, {
      name: `skill:${run.skill.name}:artifact_map`,
      kind: 'skill-artifact-map',
      data: run.caseFileArtifactMap,
      source: run.skill.name,
    });
  }

  if (run.engineeringReportPath && run.engineeringReport) {
    addArtifact(projectId, {
      kind: 'skill-report',
      title: `${run.skill.displayName} report`,
      path: run.engineeringReportPath,
      content: run.engineeringReport,
      mimeType: 'text/markdown',
      metadata: {
        skill: run.skill.name,
        runDir: run.runDir,
        outputDir: run.outputDir,
      },
    });
  }

  addNote(projectId, `Ran skill "${run.skill.name}" (${run.success ? 'success' : 'failed'}).`);
}

export function runInstalledSkill(name: string, options: SkillRunOptions): SkillRunResult {
  const skill = getInstalledSkill(name);
  if (skill.runtime !== 'python-script' || !skill.entryScript) {
    throw new Error(`Skill "${name}" is not an executable python-script skill.`);
  }
  if (getSkillsRuntimeConfig().trustedOnly && !skill.trusted) {
    throw new Error(`Skill "${name}" is blocked because it is not trusted for strong-beta execution.`);
  }

  const inputDirCheck = validateReadPath(options.inputDir, [skill.installPath, getSkillsDirectory()]);
  if (!inputDirCheck.safe) {
    throw new Error(inputDirCheck.error ?? `Input directory not allowed: ${options.inputDir}`);
  }
  const inputDir = inputDirCheck.resolved;
  if (!isDirectory(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const runDir = ensureDirectory(
    join(ensureWorkspace(), 'skills', 'runs', `${Date.now()}-${randomUUID().slice(0, 8)}-${skill.name}`),
  );
  let outputDir = join(runDir, 'output');
  if (options.outputDir) {
    const outputDirCheck = validateWritePath(options.outputDir, [getWorkspaceDir()]);
    if (!outputDirCheck.safe) {
      throw new Error(outputDirCheck.error ?? `Output directory not allowed: ${options.outputDir}`);
    }
    outputDir = outputDirCheck.resolved;
  }
  outputDir = ensureDirectory(outputDir);
  const executionProfile = getSkillExecutionProfile(skill.name);
  const swarmHandoffPath = join(outputDir, 'swarm_handoff.json');
  const engineeringReportPath = join(outputDir, 'engineering_report.md');
  const caseFileArtifactMapPath = join(outputDir, 'case_file_artifact_map.json');
  const result: SpawnSyncReturns<string> = executionProfile.contract === 'legacy-file-inputs'
    ? runLegacyFileInputSkill(
        skill,
        inputDir,
        outputDir,
        executionProfile,
        swarmHandoffPath,
        engineeringReportPath,
        caseFileArtifactMapPath,
      )
    : spawnSync(getSkillsRuntimeConfig().pythonPath, [skill.entryScript, '--input-dir', inputDir, '--output-dir', outputDir], {
        cwd: skill.installPath,
        encoding: 'utf-8',
        timeout: 90_000,
        env: buildPythonEnv(),
      });

  if (result.error) {
    throw result.error;
  }

  const run: SkillRunResult = {
    skill,
    success: result.status === 0,
    exitCode: result.status,
    runDir,
    outputDir,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    swarmHandoffPath: isFile(swarmHandoffPath) ? swarmHandoffPath : undefined,
    engineeringReportPath: isFile(engineeringReportPath) ? engineeringReportPath : undefined,
    caseFileArtifactMapPath: isFile(caseFileArtifactMapPath) ? caseFileArtifactMapPath : undefined,
    swarmHandoff: parseJsonFile(swarmHandoffPath),
    engineeringReport: readTextIfExists(engineeringReportPath) ?? undefined,
    caseFileArtifactMap: parseJsonFile(caseFileArtifactMapPath),
    persistedToProject: false,
    summary: '',
  };

  run.summary = buildSkillRunSummary(skill, run.success, run.swarmHandoff);

  if (options.projectId) {
    persistSkillRun(options.projectId, run);
    run.persistedToProject = true;
  }

  return run;
}

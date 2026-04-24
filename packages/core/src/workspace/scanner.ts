import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, resolve, relative, join } from 'node:path';
import { classifyWorkspaceFile } from './classifier.js';
import {
  DEFAULT_ANALYZE_WORKSPACE_OPTIONS,
  type AnalyzeWorkspaceOptions,
  type ProjectManifest,
  type WorkspaceFileEntry,
} from './manifest.js';
import {
  inferTabularSchema,
  parseDelimitedFile,
  parseXlsxFile,
  type TabularSchemaInference,
} from '../tabular/index.js';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.turbo',
  '.next',
  '.open-next',
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const IGNORED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

function toPosixRelative(rootPath: string, absolutePath: string): string {
  const rel = relative(rootPath, absolutePath).replace(/\\/g, '/');
  return rel || basename(absolutePath);
}

function shouldIgnoreEntry(name: string): boolean {
  if (IGNORED_FILES.has(name)) return true;
  if (name.startsWith('.') && name !== '.geotech') return true;
  return false;
}

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean).sort();
}

async function detectAgsSignature(filePath: string, maxSampleBytes: number): Promise<boolean> {
  const sample = await readFile(filePath, { encoding: 'utf-8' }).catch(() => '');
  const head = sample.slice(0, maxSampleBytes).toUpperCase();
  return /\bGROUP\b/.test(head) && /\bHEADING\b/.test(head) && /\bDATA\b/.test(head);
}

async function inferFileSchemas(
  filePath: string,
  relativePath: string,
  extension: string,
  sizeBytes: number,
  options: Required<Pick<AnalyzeWorkspaceOptions, 'maxSampleBytes' | 'maxRows'>>,
  warnings: string[],
): Promise<TabularSchemaInference[] | undefined> {
  if (sizeBytes > options.maxSampleBytes) {
    if (['.csv', '.tsv', '.xlsx'].includes(extension)) {
      warnings.push(`${relativePath}: skipped schema sampling because file is larger than ${Math.round(options.maxSampleBytes / 1024 / 1024)} MB.`);
    }
    return undefined;
  }

  try {
    if (extension === '.csv' || extension === '.tsv') {
      const parsed = await parseDelimitedFile(filePath, {
        delimiter: extension === '.tsv' ? '\t' : undefined,
        maxRows: options.maxRows,
      });
      return [
        inferTabularSchema({
          rows: parsed.rows,
          rowCount: parsed.totalRowsSampled,
          sourceName: relativePath,
          warnings: parsed.warnings,
        }),
      ];
    }

    if (extension === '.xlsx') {
      const workbook = await parseXlsxFile(filePath, { maxRows: options.maxRows });
      warnings.push(...workbook.warnings.map((warning) => `${relativePath}: ${warning}`));
      return workbook.sheets.map((sheet) => inferTabularSchema({
        rows: sheet.rows,
        rowCount: sheet.totalRowsSampled,
        sourceName: relativePath,
        sheetName: sheet.name,
        warnings: sheet.warnings,
      }));
    }
  } catch (error) {
    warnings.push(`${relativePath}: schema sampling failed (${error instanceof Error ? error.message : String(error)}).`);
  }

  return undefined;
}

async function collectFiles(
  rootPath: string,
  options: Required<Pick<AnalyzeWorkspaceOptions, 'maxDepth' | 'maxFiles'>>,
): Promise<{ files: string[]; skipped: number; warnings: string[] }> {
  const files: string[] = [];
  let skipped = 0;
  const warnings: string[] = [];

  async function scanDirectory(dirPath: string, depth: number): Promise<void> {
    if (files.length >= options.maxFiles) return;
    if (depth > options.maxDepth) {
      skipped += 1;
      return;
    }

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      warnings.push(`${toPosixRelative(rootPath, dirPath)}: cannot read directory (${error instanceof Error ? error.message : String(error)}).`);
      return;
    }

    for (const entry of entries) {
      if (files.length >= options.maxFiles) break;
      if (shouldIgnoreEntry(entry.name)) {
        skipped += 1;
        continue;
      }

      const absolutePath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          skipped += 1;
          continue;
        }
        await scanDirectory(absolutePath, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  await scanDirectory(rootPath, 0);
  if (files.length >= options.maxFiles) {
    warnings.push(`Stopped after ${options.maxFiles} files. Increase --max-files for a broader scan.`);
  }

  return { files, skipped, warnings };
}

function buildRecommendations(manifest: Omit<ProjectManifest, 'summary'>, summary: ProjectManifest['summary']): string[] {
  const recommendations: string[] = [];
  const datasetTypes = summary.datasetTypes;

  if (summary.totalFiles === 0) {
    return ['No analyzable files were found in this workspace. Add PDFs, CSV/XLSX tables, AGS, images, or JSON outputs.'];
  }

  if ((datasetTypes['coordinate-table'] ?? 0) > 0) {
    recommendations.push('Coordinate tables detected. Next: build borehole/project map once GroundModel is enabled.');
  }
  if ((datasetTypes['spt-profile'] ?? 0) > 0 || (datasetTypes['cpt-profile'] ?? 0) > 0) {
    recommendations.push('SPT/CPT profiles detected. Next: foundation screening and liquefaction workflows can consume these tables.');
  }
  if ((datasetTypes['lab-test-summary'] ?? 0) > 0) {
    recommendations.push('Lab-test tables detected. Next: bind Atterberg, gradation, and density evidence into the GroundModel.');
  }
  if ((datasetTypes['monitoring-time-series'] ?? 0) > 0 || (datasetTypes['signal-record'] ?? 0) > 0) {
    recommendations.push('Monitoring/signal data detected. Next: run signal analytics for trends, thresholds, and anomalies.');
  }
  if ((summary.kinds.pdf ?? 0) > 0) {
    recommendations.push('PDF reports/logs detected. Use geotech ingest for structured extraction; future analyze releases will add page preprocessing and caching.');
  }
  if (manifest.requestedBranch && !summary.branches.includes(manifest.requestedBranch)) {
    recommendations.push(`Requested branch "${manifest.requestedBranch}" was not strongly detected from file names or schemas.`);
  }
  if (manifest.requestedStandard) {
    recommendations.push(`Standard profile "${manifest.requestedStandard}" recorded for downstream calculation/verifier stages.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Workspace manifest is ready. Add branch-specific CSV/XLSX schemas or ingest PDFs to unlock GroundModel construction.');
  }

  return recommendations;
}

export async function analyzeWorkspace(
  workspacePath: string,
  options: AnalyzeWorkspaceOptions = {},
): Promise<ProjectManifest> {
  const rootPath = resolve(workspacePath);
  const rootStats = await stat(rootPath).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error(`Workspace directory not found: ${workspacePath}`);
  }

  const resolvedOptions = {
    maxDepth: options.maxDepth ?? DEFAULT_ANALYZE_WORKSPACE_OPTIONS.maxDepth,
    maxFiles: options.maxFiles ?? DEFAULT_ANALYZE_WORKSPACE_OPTIONS.maxFiles,
    maxSampleBytes: options.maxSampleBytes ?? DEFAULT_ANALYZE_WORKSPACE_OPTIONS.maxSampleBytes,
    maxRows: options.maxRows ?? DEFAULT_ANALYZE_WORKSPACE_OPTIONS.maxRows,
  };

  const collection = await collectFiles(rootPath, resolvedOptions);
  const warnings = [...collection.warnings];
  const files: WorkspaceFileEntry[] = [];

  for (const absolutePath of collection.files) {
    if (!existsSync(absolutePath)) continue;
    const stats = await stat(absolutePath).catch(() => null);
    if (!stats?.isFile()) continue;

    const extension = extname(absolutePath).toLowerCase();
    const relativePath = toPosixRelative(rootPath, absolutePath);
    const schemas = await inferFileSchemas(absolutePath, relativePath, extension, stats.size, resolvedOptions, warnings);
    const agsSignature = extension === '.ags'
      ? await detectAgsSignature(absolutePath, Math.min(resolvedOptions.maxSampleBytes, 120_000))
      : false;
    const classification = classifyWorkspaceFile(relativePath, { schemas, agsSignature });

    files.push({
      path: relativePath,
      absolutePath,
      name: basename(absolutePath),
      extension,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      classification,
      schemas,
    });
  }

  const kinds: Record<string, number> = {};
  const datasetTypes: Record<string, number> = {};
  const branchSet = new Set<string>();
  for (const file of files) {
    incrementCounter(kinds, file.classification.kind);
    incrementCounter(datasetTypes, file.classification.datasetType);
    file.classification.branches.forEach((branch) => branchSet.add(branch));
    warnings.push(...file.classification.warnings.map((warning) => `${file.path}: ${warning}`));
  }

  const manifestBase = {
    schemaVersion: 'workspace-manifest.v1' as const,
    generatedAt: new Date().toISOString(),
    rootPath,
    requestedBranch: options.branch,
    requestedStandard: options.standard,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    warnings: unique(warnings),
  };

  const summaryWithoutRecommendations = {
    totalFiles: files.length,
    supportedFiles: files.filter((file) => file.classification.kind !== 'unknown').length,
    tabularFiles: files.filter((file) => ['csv', 'xlsx'].includes(file.classification.kind)).length,
    pdfFiles: files.filter((file) => file.classification.kind === 'pdf').length,
    imageFiles: files.filter((file) => file.classification.kind === 'image').length,
    skippedFiles: collection.skipped,
    kinds,
    datasetTypes,
    branches: unique([...branchSet]),
    recommendations: [] as string[],
  };

  const recommendations = buildRecommendations(manifestBase, summaryWithoutRecommendations);
  return {
    ...manifestBase,
    summary: {
      ...summaryWithoutRecommendations,
      recommendations,
    },
  };
}

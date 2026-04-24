import { Command } from 'commander';
import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  analyzeWorkspace,
  renderWorkspaceManifestAsHtml,
  type AnalyzeWorkspaceOptions,
  type ProjectManifest,
  type WorkspaceFileEntry,
} from '@geotechcli/core';
import { heading, info, keyValue, renderJSON, renderTable, success, warn } from '../ui/terminal.js';
import { openFileInBrowser } from '../ui/browser.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';

type AnalyzeFormat = 'text' | 'json' | 'html';

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}".`);
  }
  return parsed;
}

function normalizeFormat(opts: Record<string, unknown>): AnalyzeFormat {
  if (opts.json) return 'json';
  const format = String(opts.format ?? 'text').toLowerCase();
  if (format === 'text' || format === 'json' || format === 'html') return format;
  throw new Error(`Unsupported analyze format "${format}". Use text, json, or html.`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function defaultHtmlPath(workspacePath: string): string {
  const outputDir = join(resolve(workspacePath), '.geotech');
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(outputDir, `workspace-dossier-${stamp}.html`);
}

function focusedFiles(manifest: ProjectManifest): WorkspaceFileEntry[] {
  const branch = manifest.requestedBranch?.toLowerCase();
  if (!branch) return manifest.files;
  const matches = manifest.files.filter((file) =>
    file.classification.branches.some((candidate) => candidate.toLowerCase() === branch),
  );
  return matches.length > 0 ? matches : manifest.files;
}

function renderTextManifest(manifest: ProjectManifest): void {
  heading('Workspace Analysis');
  keyValue('Workspace', manifest.rootPath);
  keyValue('Files discovered', manifest.summary.totalFiles);
  keyValue('Supported files', manifest.summary.supportedFiles);
  keyValue('Tabular datasets', manifest.summary.tabularFiles);
  keyValue('PDF files', manifest.summary.pdfFiles);
  keyValue('Detected branches', manifest.summary.branches.join(', ') || '-');
  if (manifest.requestedBranch) keyValue('Requested branch', manifest.requestedBranch);
  if (manifest.requestedStandard) keyValue('Standard profile', manifest.requestedStandard);
  if (manifest.groundModel) {
    keyValue('GroundModel', `${manifest.groundModel.stats.boreholes} boreholes, ${manifest.groundModel.stats.evidenceRefs} evidence refs`);
  }
  if (manifest.verifier) {
    keyValue('Verifier status', `${manifest.verifier.status} (${manifest.verifier.summary.blocking} blocking, ${manifest.verifier.summary.review} review)`);
  }

  const rows = focusedFiles(manifest)
    .slice(0, 16)
    .map((file) => [
      file.path,
      file.classification.kind,
      file.classification.datasetType,
      file.classification.branches.join(', ') || '-',
      `${Math.round(file.classification.confidence * 100)}%`,
      formatBytes(file.sizeBytes),
    ]);

  if (rows.length > 0) {
    renderTable(['File', 'Kind', 'Dataset', 'Branches', 'Confidence', 'Size'], rows);
    if (focusedFiles(manifest).length > rows.length) {
      info(`Showing ${rows.length} of ${focusedFiles(manifest).length} files. Use --json or --format html for the full manifest.`);
    }
  }

  const schemaRows = manifest.files
    .flatMap((file) => (file.schemas ?? []).map((schema) => [file, schema] as const))
    .slice(0, 10)
    .map(([file, schema]) => [
      `${file.path}${schema.sheetName ? `#${schema.sheetName}` : ''}`,
      schema.datasetType,
      schema.sampledRowCount,
      [
        ...schema.detected.depthColumns.map((column) => `depth:${column}`),
        ...schema.detected.coordinateColumns.map((column) => `coord:${column}`),
        ...schema.detected.sptColumns.map((column) => `SPT:${column}`),
        ...schema.detected.cptColumns.map((column) => `CPT:${column}`),
        ...schema.detected.labColumns.map((column) => `lab:${column}`),
        ...schema.detected.monitoringColumns.map((column) => `monitor:${column}`),
      ].slice(0, 4).join(', ') || '-',
    ]);

  if (schemaRows.length > 0) {
    renderTable(['Tabular source', 'Schema', 'Rows', 'Detected columns'], schemaRows);
  }

  if (manifest.groundModel && manifest.groundModel.boreholes.length > 0) {
    const groundRows = manifest.groundModel.boreholes.slice(0, 10).map((borehole) => [
      borehole.id,
      borehole.coordinates
        ? borehole.coordinates.latitude != null
          ? `${borehole.coordinates.latitude}, ${borehole.coordinates.longitude}`
          : `${borehole.coordinates.easting}, ${borehole.coordinates.northing}`
        : '-',
      borehole.sptTests.length,
      borehole.strata.length,
      borehole.groundwater.length,
      `${Math.round(borehole.confidence * 100)}%`,
    ]);
    renderTable(['Borehole', 'Location', 'SPT', 'Strata', 'GWL', 'Confidence'], groundRows);
  }

  if (manifest.verifier && manifest.verifier.findings.length > 0) {
    const findingRows = manifest.verifier.findings.slice(0, 8).map((finding) => [
      finding.severity,
      finding.code,
      finding.message,
      finding.evidenceIds.join(', ') || '-',
    ]);
    renderTable(['Severity', 'Code', 'Finding', 'Evidence'], findingRows);
    if (manifest.verifier.findings.length > findingRows.length) {
      warn(`${manifest.verifier.findings.length - findingRows.length} additional verifier findings. Use --json or --format html for full details.`);
    }
  }

  if (manifest.summary.recommendations.length > 0) {
    console.log('');
    console.log(chalk.cyan('  Recommended next steps:'));
    manifest.summary.recommendations.forEach((item) => {
      console.log(chalk.gray(`    - ${item}`));
    });
  }

  if (manifest.warnings.length > 0) {
    console.log('');
    manifest.warnings.slice(0, 6).forEach((message) => warn(message));
    if (manifest.warnings.length > 6) {
      warn(`${manifest.warnings.length - 6} additional warnings. Use --json for full details.`);
    }
  }
}

export function registerAnalyzeCommand(program: Command): void {
  const cmd = new Command('analyze')
    .description('Analyze a local geotechnical project folder and produce a workspace manifest')
    .argument('[workspace]', 'Workspace directory to scan', '.')
    .option('--format <format>', 'Output format: text | json | html', 'text')
    .option('--branch <branch>', 'Focus recommendations on a geotechnical branch such as foundation, monitoring, or mapping')
    .option('--standard <profile>', 'Record intended standards profile such as eurocode7, aashto, is, bs, or astm')
    .option('--max-depth <n>', 'Maximum directory depth to scan', parseIntegerOption)
    .option('--max-files <n>', 'Maximum number of files to inspect', parseIntegerOption)
    .option('--max-rows <n>', 'Maximum rows to sample from each CSV/XLSX sheet', parseIntegerOption)
    .addHelpText('after', `
  Examples:
    geotech analyze .
    geotech analyze . --json
    geotech analyze . --format html
    geotech analyze . --branch foundation
    geotech analyze . --standard eurocode7
`);

  addGlobalFlags(cmd);

  cmd.action(async (workspace: string, opts: Record<string, unknown>) => {
    const flags = getGlobalFlags(opts);
    const format = normalizeFormat(opts);
    const analyzeOptions: AnalyzeWorkspaceOptions = {
      branch: typeof opts.branch === 'string' ? opts.branch : undefined,
      standard: typeof opts.standard === 'string' ? opts.standard : undefined,
      maxDepth: typeof opts.maxDepth === 'number' ? opts.maxDepth : undefined,
      maxFiles: typeof opts.maxFiles === 'number' ? opts.maxFiles : undefined,
      maxRows: typeof opts.maxRows === 'number' ? opts.maxRows : undefined,
    };

    const manifest = await analyzeWorkspace(workspace, analyzeOptions);

    if (format === 'json') {
      if (flags.output) {
        writeFileSync(resolve(String(flags.output)), JSON.stringify(manifest, null, 2), 'utf-8');
        if (!flags.quiet) success(`Workspace manifest saved to ${resolve(String(flags.output))}`);
      } else if (!flags.quiet) {
        renderJSON(manifest);
      }
      return;
    }

    if (format === 'html') {
      const htmlPath = resolve(flags.output ?? flags.saveHtml ?? defaultHtmlPath(workspace));
      mkdirSync(dirname(htmlPath), { recursive: true });
      writeFileSync(htmlPath, renderWorkspaceManifestAsHtml(manifest), 'utf-8');
      const opened = openFileInBrowser(htmlPath, {
        disabled: flags.noOpen,
        disabledEnvVar: 'GEOTECHCLI_NO_BROWSER',
      });

      if (!flags.quiet) {
        success(opened ? `Workspace dossier opened in your browser: ${htmlPath}` : `Workspace dossier saved to ${htmlPath}`);
        info(`Files: ${manifest.summary.totalFiles}, tabular: ${manifest.summary.tabularFiles}, PDFs: ${manifest.summary.pdfFiles}, verifier: ${manifest.verifier?.status ?? 'not-run'}`);
      }
      return;
    }

    if (flags.output) {
      writeFileSync(resolve(String(flags.output)), JSON.stringify(manifest, null, 2), 'utf-8');
      if (!flags.quiet) success(`Workspace manifest saved to ${resolve(String(flags.output))}`);
    }

    if (!flags.quiet) {
      renderTextManifest(manifest);
      console.log('');
      info('Open browser dossier: geotech analyze . --format html');
    }
  });

  program.addCommand(cmd);
}

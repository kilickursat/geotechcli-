import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  buildRaftDemoAnalysisCase,
  renderFemWebglHtml,
  runBuiltinElasticRaftDemo,
  validateFemResultManifest,
  type FemResultManifest,
} from '@geotechcli/core';
import {
  banner,
  heading,
  keyValue,
  renderJSON,
  success,
  warn,
} from '../ui/terminal.js';
import { openFileInBrowser } from '../ui/browser.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';

const DEFAULT_RAFT_HTML = 'geotech-fem-raft-demo.html';

interface FemDemoJsonEnvelope {
  kind: 'geotech-fem-demo-result';
  schemaVersion: 'fem-demo-command.v0';
  experimental: true;
  demo: 'raft';
  manifest: FemResultManifest;
  htmlPath?: string;
  resultPath?: string;
  opened: boolean;
  warnings: string[];
}

function writeUtf8File(filePath: string, content: string): string {
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, 'utf-8');
  return resolved;
}

function buildWarnings(manifest: FemResultManifest): string[] {
  return [
    'Experimental demonstration only; not a design calculation.',
    ...manifest.validation.findings
      .filter((finding) => finding.severity !== 'info')
      .map((finding) => finding.message),
  ];
}

function renderPlainSummary(
  manifest: FemResultManifest,
  options: {
    htmlPath?: string;
    resultPath?: string;
    opened: boolean;
    quiet: boolean;
  },
): void {
  if (options.quiet) {
    console.log(`${manifest.envelope.maxSettlementMm.toFixed(2)} mm`);
    return;
  }

  banner();
  heading('Experimental 3D FEM Raft Demo');
  keyValue('Case', manifest.caseId);
  keyValue('Backend', manifest.backend.label);
  keyValue('Validation', manifest.validation.status);
  keyValue('Max settlement', `${manifest.envelope.maxSettlementMm.toFixed(2)} mm`);
  keyValue('Min settlement', `${manifest.envelope.minSettlementMm.toFixed(2)} mm`);
  keyValue('Total load', `${manifest.envelope.totalLoadKn.toFixed(0)} kN`);
  keyValue('Reaction balance', manifest.envelope.reactionBalanceRatio.toFixed(3));
  keyValue('Mesh', `${manifest.mesh.divisions.join(' x ')} ${manifest.mesh.elementType}`);
  keyValue('Nodes / elements', `${manifest.mesh.nodes} / ${manifest.mesh.elements}`);

  for (const finding of manifest.validation.findings.filter((item) => item.severity !== 'info')) {
    warn(finding.message);
  }
  warn('Experimental deterministic preview only; do not use as a design calculation.');

  if (options.htmlPath) {
    success(
      options.opened
        ? `FEM WebGL preview opened in your browser: ${options.htmlPath}`
        : `FEM WebGL preview saved to ${options.htmlPath}`,
    );
  }
  if (options.resultPath) {
    success(`FEM result manifest saved to ${options.resultPath}`);
  }
}

export function registerFemCommand(program: Command): void {
  const fem = new Command('fem')
    .description('Experimental deterministic 3D FEM previews and WebGL artifacts');

  const demo = new Command('demo')
    .description('Experimental FEM demonstration models');

  const raft = new Command('raft')
    .description('Experimental 3D raft settlement FEM preview')
    .option('--experimental', 'Acknowledge that this FEM preview is experimental and not a design calculation')
    .addHelpText('after', `
  Examples:
    geotech fem demo raft --experimental
    geotech fem demo raft --experimental --save-html raft-fem.html --no-open
    geotech fem demo raft --experimental --output raft-fem.manifest.json --json
`)
    .action(async (opts) => {
      const flags = getGlobalFlags(opts as Record<string, unknown>);
      if (!opts.experimental) {
        throw new Error('FEM previews are experimental. Re-run with --experimental to acknowledge the limitation.');
      }

      const manifest = runBuiltinElasticRaftDemo(buildRaftDemoAnalysisCase());
      const validation = validateFemResultManifest(manifest);
      if (validation.status === 'blocked') {
        throw new Error(`FEM result manifest failed validation: ${validation.findings.map((item) => item.message).join('; ')}`);
      }

      let htmlPath: string | undefined;
      let opened = false;
      const shouldWriteDefaultHtml = !flags.json && !flags.quiet;
      const requestedHtmlPath = flags.saveHtml ?? (shouldWriteDefaultHtml ? DEFAULT_RAFT_HTML : undefined);
      if (requestedHtmlPath) {
        htmlPath = writeUtf8File(requestedHtmlPath, renderFemWebglHtml(manifest));
        opened = flags.noOpen ? false : openFileInBrowser(htmlPath, {
          disabledEnvVar: 'GEOTECHCLI_FEM_NO_OPEN',
        });
      }

      let resultPath: string | undefined;
      if (flags.output) {
        resultPath = writeUtf8File(flags.output, JSON.stringify(manifest, null, 2));
      }

      const envelope: FemDemoJsonEnvelope = {
        kind: 'geotech-fem-demo-result',
        schemaVersion: 'fem-demo-command.v0',
        experimental: true,
        demo: 'raft',
        manifest,
        htmlPath,
        resultPath,
        opened,
        warnings: buildWarnings(manifest),
      };

      if (flags.json) {
        renderJSON(envelope);
        return;
      }

      renderPlainSummary(manifest, {
        htmlPath,
        resultPath,
        opened,
        quiet: flags.quiet,
      });
    });

  addGlobalFlags(raft);
  demo.addCommand(raft);
  fem.addCommand(demo);
  program.addCommand(fem);
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  buildExcavationDemoAnalysisCase,
  buildRaftDemoAnalysisCase,
  renderFemWebglHtml,
  runBuiltinElasticExcavationDemo,
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
const DEFAULT_EXCAVATION_HTML = 'geotech-fem-excavation-demo.html';
type FemDemoKind = 'raft' | 'excavation';

interface FemDemoJsonEnvelope {
  kind: 'geotech-fem-demo-result';
  schemaVersion: 'fem-demo-command.v0';
  experimental: true;
  demo: FemDemoKind;
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
    title: string;
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
  heading(options.title);
  keyValue('Case', manifest.caseId);
  keyValue('Backend', manifest.backend.label);
  keyValue('Validation', manifest.validation.status);
  keyValue('Max settlement', `${manifest.envelope.maxSettlementMm.toFixed(2)} mm`);
  keyValue('Min settlement', `${manifest.envelope.minSettlementMm.toFixed(2)} mm`);
  if (manifest.envelope.maxHorizontalDisplacementMm != null) {
    keyValue('Max horizontal displacement', `${manifest.envelope.maxHorizontalDisplacementMm.toFixed(2)} mm`);
  }
  if (manifest.envelope.maxWallDeflectionMm != null) {
    keyValue('Max wall deflection proxy', `${manifest.envelope.maxWallDeflectionMm.toFixed(2)} mm`);
  }
  if (manifest.envelope.stageCount != null) {
    keyValue('Stages', String(manifest.envelope.stageCount));
  }
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

async function runFemDemoCommand(
  demoKind: FemDemoKind,
  defaultHtmlPath: string,
  title: string,
  manifest: FemResultManifest,
  opts: Record<string, unknown>,
): Promise<void> {
  const flags = getGlobalFlags(opts);
  if (!opts.experimental) {
    throw new Error('FEM previews are experimental. Re-run with --experimental to acknowledge the limitation.');
  }

  const validation = validateFemResultManifest(manifest);
  if (validation.status === 'blocked') {
    throw new Error(`FEM result manifest failed validation: ${validation.findings.map((item) => item.message).join('; ')}`);
  }

  let htmlPath: string | undefined;
  let opened = false;
  const shouldWriteDefaultHtml = !flags.json && !flags.quiet;
  const requestedHtmlPath = flags.saveHtml ?? (shouldWriteDefaultHtml ? defaultHtmlPath : undefined);
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
    demo: demoKind,
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
    title,
    htmlPath,
    resultPath,
    opened,
    quiet: flags.quiet,
  });
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
      await runFemDemoCommand(
        'raft',
        DEFAULT_RAFT_HTML,
        'Experimental 3D FEM Raft Demo',
        runBuiltinElasticRaftDemo(buildRaftDemoAnalysisCase()),
        opts as Record<string, unknown>,
      );
    });

  const excavation = new Command('excavation')
    .description('Experimental staged excavation deformation FEM preview')
    .option('--experimental', 'Acknowledge that this FEM preview is experimental and not a design calculation')
    .addHelpText('after', `
  Examples:
    geotech fem demo excavation --experimental
    geotech fem demo excavation --experimental --save-html excavation-fem.html --no-open
    geotech fem demo excavation --experimental --output excavation-fem.manifest.json --json
`)
    .action(async (opts) => {
      await runFemDemoCommand(
        'excavation',
        DEFAULT_EXCAVATION_HTML,
        'Experimental 3D FEM Excavation Demo',
        runBuiltinElasticExcavationDemo(buildExcavationDemoAnalysisCase()),
        opts as Record<string, unknown>,
      );
    });

  addGlobalFlags(raft);
  addGlobalFlags(excavation);
  demo.addCommand(raft);
  demo.addCommand(excavation);
  fem.addCommand(demo);
  program.addCommand(fem);
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  buildExcavationDemoAnalysisCase,
  buildLLMConfig,
  buildRaftDemoAnalysisCase,
  renderFemWebglHtml,
  runAgent,
  runBuiltinElasticExcavationDemo,
  runBuiltinElasticRaftDemo,
  validateFemResultManifest,
  type AgentStep,
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
const FEM_AGENT_TOOLS = [
  'list_fem_capabilities',
  'prepare_fem_analysis_case',
  'validate_fem_analysis_case',
] as const;

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

interface FemAgentJsonEnvelope {
  kind: 'geotech-fem-agent-result';
  schemaVersion: 'fem-agent-command.v0';
  task: string;
  objective?: string;
  answer: string;
  allowedTools: readonly string[];
  steps: Array<{
    type: AgentStep['type'];
    content: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: { success: boolean; summary: string };
  }>;
  tokens: number;
  latencyMs: number;
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

function buildFemAgentTask(task: string, objective?: string): string {
  return [
    'FEM planning task:',
    task,
    objective ? `Preferred FEM objective hint: ${objective}` : '',
    '',
    'Use only geotechCLI FEM capability, draft, and validation tools.',
    'Do not invent FEM displacement, reaction, mesh, stage, or result-envelope values.',
    'If a deterministic preview is appropriate, recommend the matching geotech fem demo command instead of claiming you ran it.',
  ].filter(Boolean).join('\n');
}

function renderFemAgentStep(step: AgentStep, flags: { json?: boolean; quiet?: boolean; verbose?: boolean }): void {
  if (flags.json || flags.quiet || !flags.verbose) return;
  if (step.type === 'tool_call') {
    console.log(`  > ${step.toolName}(${JSON.stringify(step.toolArgs).slice(0, 100)})`);
  } else if (step.type === 'tool_result') {
    console.log(`  = ${step.content}`);
  } else if (step.type === 'error') {
    warn(step.content);
  }
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
    .description('Experimental deterministic 3D FEM previews, scoped FEM agent planning, and WebGL artifacts');

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

  const agent = new Command('agent')
    .description('Scoped FEM planning agent that can list, draft, and validate FEM cases without running solvers')
    .argument('<task...>', 'FEM planning or review task in natural language')
    .option('--objective <objective>', 'Optional FEM objective hint, such as foundation-settlement or excavation-deformation')
    .addHelpText('after', `
  Examples:
    geotech fem agent "which FEM route fits a braced excavation near an existing building?"
    geotech fem agent "draft a staged excavation FEM case" --objective excavation-deformation --json

  This command gives the LLM a narrow FEM brain. It may call only list_fem_capabilities,
  prepare_fem_analysis_case, and validate_fem_analysis_case. It does not run FEM solvers,
  write WebGL artifacts, or produce design-ready FEM results.
`)
    .action(async (taskParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const task = taskParts.join(' ');
      const objective = typeof opts.objective === 'string' && opts.objective.trim()
        ? opts.objective.trim()
        : undefined;
      const config = {
        ...buildLLMConfig(),
        skillsEnabled: false,
      };

      const scopedTask = buildFemAgentTask(task, objective);
      const session = await runAgent(
        scopedTask,
        config,
        (step) => renderFemAgentStep(step, flags),
        undefined,
        {
          allowedTools: FEM_AGENT_TOOLS,
          systemPromptSuffix:
            'FEM scoped-agent rule: use only FEM routing, drafting, and validation tools. Never claim to run a solver or produce FEM numerical results unless they came from a deterministic geotechCLI FEM manifest. Recommend `geotech fem demo ... --experimental` when execution or visualization is needed.',
        },
      );
      const answer = session.steps.find((step) => step.type === 'answer')?.content ?? '';

      if (flags.output && answer) {
        writeUtf8File(flags.output, answer);
      }

      if (flags.json) {
        const envelope: FemAgentJsonEnvelope = {
          kind: 'geotech-fem-agent-result',
          schemaVersion: 'fem-agent-command.v0',
          task,
          objective,
          answer,
          allowedTools: FEM_AGENT_TOOLS,
          steps: session.steps.map((step) => ({
            type: step.type,
            content: step.content,
            toolName: step.toolName,
            toolArgs: step.toolArgs,
            toolResult: step.toolResult ? {
              success: step.toolResult.success,
              summary: step.toolResult.summary,
            } : undefined,
          })),
          tokens: session.totalTokens,
          latencyMs: session.totalLatencyMs,
        };
        renderJSON(envelope);
        return;
      }

      if (!flags.quiet) {
        banner();
        heading('FEM Agent Plan');
        console.log(answer || 'No FEM agent answer was produced.');
        warn('FEM agent output is route/draft/validation guidance only. Numerical FEM results must come from deterministic geotechCLI FEM manifests.');
        if (flags.output && answer) {
          success(`FEM agent answer saved to ${flags.output}`);
        }
      }
    });

  addGlobalFlags(agent);
  fem.addCommand(agent);
  program.addCommand(fem);
}

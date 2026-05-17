import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import {
  buildExcavationDemoAnalysisCase,
  buildLLMConfig,
  buildRaftDemoAnalysisCase,
  prepareFemAnalysisCaseDraft,
  renderFemWebglHtml,
  runAgent,
  runBuiltinElasticExcavationDemo,
  runBuiltinElasticRaftDemo,
  validateFemResultManifest,
  type AgentStep,
  type FemAnalysisCaseDraft,
  type FemResultManifest,
  type FemRouteObjective,
  type PrepareFemAnalysisCaseDraftInput,
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

interface FemDraftJsonEnvelope {
  kind: 'geotech-fem-draft-result';
  schemaVersion: 'fem-draft-command.v0';
  objective: FemRouteObjective;
  draft: FemAnalysisCaseDraft;
  draftPath?: string;
  casePath?: string;
  warnings: string[];
}

function normalizeFemObjective(value: string): FemRouteObjective {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  switch (normalized) {
    case 'foundation-settlement':
    case 'raft-settlement':
    case 'settlement':
      return 'foundation-settlement';
    case 'excavation-deformation':
    case 'excavation':
    case 'retaining-excavation':
      return 'excavation-deformation';
    case 'shaft-deformation':
    case 'shaft':
    case 'pit-deformation':
      return 'shaft-deformation';
    case 'tunnel-volume-loss-settlement':
    case 'tunnel-settlement':
    case 'volume-loss-settlement':
      return 'tunnel-volume-loss-settlement';
    case 'pile-group-elastic-interaction':
    case 'pile-group':
    case 'pile-interaction':
      return 'pile-group-elastic-interaction';
    default:
      throw new Error(`Unsupported FEM objective: ${value}`);
  }
}

function parseNumberOption(value: unknown, label: string): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return parsed;
}

function parseNumberListOption(value: unknown, label: string): number[] | undefined {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((item, index) => parseNumberOption(item, `${label}[${index}]`) as number);
  if (typeof value !== 'string') throw new Error(`${label} must be a comma-separated number list.`);
  const parsed = value.split(',').map((item, index) => parseNumberOption(item.trim(), `${label}[${index}]`) as number);
  if (parsed.length === 0 || parsed.some((item) => !Number.isFinite(item))) {
    throw new Error(`${label} must contain at least one finite number.`);
  }
  return parsed;
}

function parseFemDraftInput(value: unknown): Partial<PrepareFemAnalysisCaseDraftInput> {
  if (value == null || value === '') return {};
  if (typeof value !== 'string') throw new Error('--input must be a JSON object string or path to a JSON file.');
  const trimmed = value.trim();
  const raw = trimmed.startsWith('{')
    ? trimmed
    : readFileSync(resolve(trimmed), 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--input must resolve to a JSON object.');
  }
  return parsed as Partial<PrepareFemAnalysisCaseDraftInput>;
}

function buildFemDraftInput(objective: FemRouteObjective, opts: Record<string, unknown>): PrepareFemAnalysisCaseDraftInput {
  const parsed = parseFemDraftInput(opts.input);
  const geometry = {
    ...(parsed.geometry ?? {}),
    raftLengthM: parseNumberOption(opts.raftLength, '--raft-length') ?? parsed.geometry?.raftLengthM,
    raftWidthM: parseNumberOption(opts.raftWidth, '--raft-width') ?? parsed.geometry?.raftWidthM,
    raftThicknessM: parseNumberOption(opts.raftThickness, '--raft-thickness') ?? parsed.geometry?.raftThicknessM,
    domainLengthM: parseNumberOption(opts.domainLength, '--domain-length') ?? parsed.geometry?.domainLengthM,
    domainWidthM: parseNumberOption(opts.domainWidth, '--domain-width') ?? parsed.geometry?.domainWidthM,
    domainDepthM: parseNumberOption(opts.domainDepth, '--domain-depth') ?? parsed.geometry?.domainDepthM,
    excavationLengthM: parseNumberOption(opts.excavationLength, '--excavation-length') ?? parsed.geometry?.excavationLengthM,
    excavationWidthM: parseNumberOption(opts.excavationWidth, '--excavation-width') ?? parsed.geometry?.excavationWidthM,
    excavationFinalDepthM: parseNumberOption(opts.excavationDepth, '--excavation-depth') ?? parsed.geometry?.excavationFinalDepthM,
    wallToeDepthM: parseNumberOption(opts.wallToeDepth, '--wall-toe-depth') ?? parsed.geometry?.wallToeDepthM,
  };
  const excavation = {
    ...(parsed.excavation ?? {}),
    stageDepthsM: parseNumberListOption(opts.stageDepths, '--stage-depths') ?? parsed.excavation?.stageDepthsM,
    supportLevelsM: parseNumberListOption(opts.supportLevels, '--support-levels') ?? parsed.excavation?.supportLevelsM,
    wallType: typeof opts.wallType === 'string' ? opts.wallType as any : parsed.excavation?.wallType,
  };
  const load = {
    ...(parsed.load ?? {}),
    pressureKpa: parseNumberOption(opts.pressure, '--pressure') ?? parsed.load?.pressureKpa,
  };
  const material = {
    ...(parsed.material ?? {}),
    elasticModulusKpa: parseNumberOption(opts.elasticModulus, '--elastic-modulus') ?? parsed.material?.elasticModulusKpa,
    poissonRatio: parseNumberOption(opts.poissonRatio, '--poisson-ratio') ?? parsed.material?.poissonRatio,
    unitWeightKnM3: parseNumberOption(opts.unitWeight, '--unit-weight') ?? parsed.material?.unitWeightKnM3,
  };
  const groundwater = {
    ...(parsed.groundwater ?? {}),
    condition: typeof opts.groundwaterCondition === 'string' ? opts.groundwaterCondition as any : parsed.groundwater?.condition,
    depthM: parseNumberOption(opts.groundwaterDepth, '--groundwater-depth') ?? parsed.groundwater?.depthM,
    note: typeof opts.groundwaterNote === 'string' ? opts.groundwaterNote : parsed.groundwater?.note,
  };

  return {
    ...parsed,
    objective,
    useDemoDefaults: opts.demoDefaults === true || parsed.useDemoDefaults === true,
    geometry,
    excavation,
    load,
    material,
    groundwater,
    evidenceRefs: Array.isArray(parsed.evidenceRefs) ? parsed.evidenceRefs : [],
  };
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

function renderFemDraftSummary(
  draft: FemAnalysisCaseDraft,
  options: {
    draftPath?: string;
    casePath?: string;
    quiet: boolean;
  },
): void {
  if (options.quiet) {
    console.log(draft.analysisCase?.caseId ?? draft.recommendedAction);
    return;
  }

  banner();
  heading('FEM Analysis-Case Draft');
  keyValue('Objective', draft.objective);
  keyValue('Route status', draft.capability.status);
  keyValue('Implemented demo', draft.implemented ? 'yes' : 'no');
  keyValue('Recommended action', draft.recommendedAction);
  keyValue('Auto proceed', draft.canAutoProceed ? 'yes' : 'no');
  if (draft.recommendedCommand) keyValue('Recommended command', draft.recommendedCommand);
  if (draft.analysisCase) {
    keyValue('Case', draft.analysisCase.caseId);
    keyValue('Validation', draft.validation?.status ?? 'not-run');
  }
  if (draft.missingUserInputs.length > 0) {
    warn(`Missing user inputs: ${draft.missingUserInputs.join(', ')}`);
  }
  for (const gate of draft.reviewGates) {
    warn(`Review gate: ${gate}`);
  }
  warn('Draft only: this command does not run an FEM solver or create WebGL results.');
  if (options.draftPath) success(`FEM draft envelope saved to ${options.draftPath}`);
  if (options.casePath) success(`FEM analysis case saved to ${options.casePath}`);
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

  const draft = new Command('draft')
    .description('Prepare a validated experimental FEM analysis-case draft without running a solver')
    .argument('<objective>', 'FEM objective, such as foundation-settlement or excavation-deformation')
    .option('--input <jsonOrFile>', 'JSON object string or path containing prepare_fem_analysis_case-style inputs')
    .option('--demo-defaults', 'Use built-in demo defaults for implemented demo routes')
    .option('--case-output <file>', 'Write the analysis_case JSON only when the draft has a validated case')
    .option('--raft-length <m>', 'Foundation-settlement raft length in metres')
    .option('--raft-width <m>', 'Foundation-settlement raft width in metres')
    .option('--raft-thickness <m>', 'Foundation-settlement raft thickness in metres')
    .option('--domain-length <m>', 'Model domain length in metres')
    .option('--domain-width <m>', 'Model domain width in metres')
    .option('--domain-depth <m>', 'Model domain depth in metres')
    .option('--excavation-length <m>', 'Excavation length in metres')
    .option('--excavation-width <m>', 'Excavation width in metres')
    .option('--excavation-depth <m>', 'Final excavation depth in metres')
    .option('--wall-toe-depth <m>', 'Retaining wall toe depth in metres')
    .option('--stage-depths <csv>', 'Comma-separated excavation stage depths in metres')
    .option('--support-levels <csv>', 'Comma-separated excavation support levels in metres')
    .option('--wall-type <type>', 'Excavation wall type: diaphragm_wall, secant_pile_wall, soldier_pile_lagging, unsupported_screening')
    .option('--pressure <kPa>', 'Raft pressure or excavation surcharge pressure in kPa')
    .option('--elastic-modulus <kPa>', 'Representative elastic modulus in kPa')
    .option('--poisson-ratio <ratio>', 'Representative Poisson ratio')
    .option('--unit-weight <kN/m3>', 'Representative unit weight in kN/m3')
    .option('--groundwater-condition <condition>', 'Groundwater condition: not_modelled, below_domain, specified')
    .option('--groundwater-depth <m>', 'Groundwater depth in metres when condition is specified')
    .option('--groundwater-note <text>', 'Groundwater review note')
    .addHelpText('after', `
  Examples:
    geotech fem draft foundation-settlement --raft-length 10 --raft-width 8 --pressure 150 --json
    geotech fem draft excavation-deformation --excavation-length 22 --excavation-width 14 --excavation-depth 9 --stage-depths 3,6,9 --support-levels 0,2,5 --json
    geotech fem draft excavation-deformation --input fem-input.json --case-output analysis_case.json

  This command prepares a review-gated FEM analysis-case draft only. It does not run a solver,
  does not create WebGL results, and never auto-approves FEM output for design use.
`)
    .action(async (objectiveArg: string, opts) => {
      const flags = getGlobalFlags(opts);
      const objective = normalizeFemObjective(objectiveArg);
      const draftInput = buildFemDraftInput(objective, opts as Record<string, unknown>);
      const femDraft = prepareFemAnalysisCaseDraft(draftInput);

      let casePath: string | undefined;
      if (typeof opts.caseOutput === 'string' && opts.caseOutput.trim()) {
        if (!femDraft.analysisCase) {
          throw new Error('Cannot write --case-output because the FEM draft is missing required inputs and has no analysisCase.');
        }
        casePath = writeUtf8File(opts.caseOutput, JSON.stringify(femDraft.analysisCase, null, 2));
      }

      const warnings = [
        'FEM draft only; no solver or WebGL artifact was executed.',
        ...femDraft.reviewGates.map((gate) => `Review gate: ${gate}`),
      ];
      let draftPath: string | undefined = typeof flags.output === 'string' && flags.output.trim()
        ? resolve(flags.output)
        : undefined;
      const envelope: FemDraftJsonEnvelope = {
        kind: 'geotech-fem-draft-result',
        schemaVersion: 'fem-draft-command.v0',
        objective,
        draft: femDraft,
        draftPath,
        casePath,
        warnings,
      };
      if (draftPath) {
        draftPath = writeUtf8File(draftPath, JSON.stringify(envelope, null, 2));
        envelope.draftPath = draftPath;
      }

      if (flags.json) {
        renderJSON(envelope);
        return;
      }

      renderFemDraftSummary(femDraft, {
        draftPath,
        casePath,
        quiet: flags.quiet,
      });
    });

  addGlobalFlags(draft);
  fem.addCommand(draft);

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

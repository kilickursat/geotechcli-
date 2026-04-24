import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import {
  buildLLMConfig,
  DEFAULT_LLM_VISION_MODEL,
  analyzeCoreBox,
  classifyRMRFromImage,
  classifySoilFromDescription,
  ingestBoreholeLogDocument,
  inspectPdfDocument,
  queryGBRDocument,
  interpretSensorImage,
  runAgent,
  runSwarm,
  AgentConversation,
  loadProject,
  getProjectAgentContext,
  addAgentSession,
  addArtifact,
  addNote,
  saveNamedDataset,
  saveDerivedParameter,
  setActiveAnalysisContext,
  generateReport,
  generateReportFromCaseFile,
  renderReportAsPdf,
  renderReportAsDocx,
  buildSwarmSessionProjectRecord,
  persistSwarmCaseFile,
  persistCaseFileEvidence,
  analyzeWorkspace,
  type ProjectManifest,
  type GeneratedReport,
  type AgentStep,
  type AgentSession,
  type SwarmStep,
  type SwarmSession,
  type BoreholeInterpretation,
  type BoreholeLayer,
} from '@geotechcli/core';
import { heading, keyValue, renderJSON, renderRichText, success, error, warn, renderTable, info } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';
import {
  estimateHostedBetaVisionBodyBytes,
  formatByteSize,
  HOSTED_BETA_REQUEST_LIMIT_BYTES,
  readVisionInput,
  readVisionPdfPageInputs,
  resolveStructuredOutputTarget,
  HOSTED_BETA_REQUEST_SAFE_BYTES,
  type VisionInput,
  type VisionPdfPageInput,
} from '../util/vision-output.js';

function summarizeWorkspaceManifestForAgent(manifest: ProjectManifest): string {
  const files = manifest.files
    .slice(0, 18)
    .map((file) => `- ${file.path}: ${file.classification.datasetType} (${file.classification.kind}, ${Math.round(file.classification.confidence * 100)}% confidence)`)
    .join('\n');
  const recommendations = manifest.summary.recommendations.map((item) => `- ${item}`).join('\n');
  const groundModel = manifest.groundModel
    ? [
        'Evidence-bound GroundModel:',
        `- Boreholes: ${manifest.groundModel.stats.boreholes}`,
        `- SPT tests: ${manifest.groundModel.stats.sptTests}`,
        `- Lab tests: ${manifest.groundModel.stats.labTests}`,
        `- Parameters: ${manifest.groundModel.stats.parameters}`,
        `- Evidence refs: ${manifest.groundModel.stats.evidenceRefs}`,
        `- Rejected observations: ${manifest.groundModel.stats.rejectedObservations}`,
      ].join('\n')
    : '';
  const verifier = manifest.verifier
    ? [
        'Calculation/verifier pre-check:',
        `- Status: ${manifest.verifier.status}`,
        `- Findings: ${manifest.verifier.summary.blocking} blocking, ${manifest.verifier.summary.review} review, ${manifest.verifier.summary.info} info`,
        ...manifest.verifier.findings.slice(0, 8).map((finding) => `- ${finding.severity}/${finding.code}: ${finding.message}`),
      ].join('\n')
    : '';

  return [
    'Local workspace manifest:',
    `Root: ${manifest.rootPath}`,
    `Files: ${manifest.summary.totalFiles} total, ${manifest.summary.supportedFiles} supported, ${manifest.summary.tabularFiles} tabular, ${manifest.summary.pdfFiles} PDFs`,
    `Detected branches: ${manifest.summary.branches.join(', ') || 'none'}`,
    groundModel,
    verifier,
    files ? `Files:\n${files}` : 'Files: none',
    recommendations ? `Recommended next steps:\n${recommendations}` : '',
    manifest.warnings.length > 0 ? `Manifest warnings:\n${manifest.warnings.slice(0, 8).map((warning) => `- ${warning}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

async function checkQuota(_callType: 'llmCalls' | 'visionCalls' | 'agentCalls'): Promise<boolean> {
  // Strong-beta hosted limits are enforced server-side by the beta proxy.
  // Keep the CLI permissive here so successful completions, retries, and
  // daily limits are handled by the hosted gateway instead of stale local state.
  return true;
}

function loadImageBase64(filePath: string): { base64: string; mimeType: string } {
  const buffer = readFileSync(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  };

  // Warn if user provides a PDF — vision works best with PNG/JPG images.
  if (ext === 'pdf') {
    console.log('');
    console.log(chalk.yellow('  ⚠ PDF input detected.'));
    console.log(chalk.gray('    Vision analysis works best with image files (PNG or JPG).'));
    console.log(chalk.gray('    For PDFs: extract a page as PNG first (e.g. with pdf2pic or a screenshot).'));
    console.log(chalk.gray('    Attempting analysis anyway — results may be incomplete.'));
    console.log('');
  }

  return {
    base64: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/png',
  };
}

function describeVisionInput(file: VisionInput, flags?: { json?: boolean; quiet?: boolean }): void {
  if (flags?.json || flags?.quiet) {
    return;
  }

  if (file.kind !== 'pdf') {
    return;
  }

  console.log('');
  console.log(chalk.yellow('  PDF input detected.'));
  console.log(chalk.gray('    Vision analysis works best with PNG or JPG images.'));
  console.log(chalk.gray('    For borehole logs, the CLI can split multi-page PDFs into page-level requests automatically.'));
  console.log(chalk.gray('    Scanned/image-only pages will use raster-image recovery when possible, and oversized pages will still be blocked before upload.'));
  console.log('');
}

function ensureHostedBetaVisionPayloadWithinLimit(
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  const estimatedBytes = estimateHostedBetaVisionBodyBytes({
    prompt: details.prompt,
    systemPrompt: details.systemPrompt,
    imageBase64: file.base64,
    mimeType: file.mimeType,
    model: details.model,
    temperature: details.temperature,
    maxTokens: details.maxTokens,
    jsonMode: false,
  });

  if (estimatedBytes <= HOSTED_BETA_REQUEST_SAFE_BYTES) {
    return;
  }

  const fileSize = formatByteSize(file.fileBytes);
  const payloadSize = formatByteSize(estimatedBytes);
  const limitSize = formatByteSize(HOSTED_BETA_REQUEST_SAFE_BYTES);
  const capSize = formatByteSize(HOSTED_BETA_REQUEST_LIMIT_BYTES);
  const baseMessage =
    file.kind === 'pdf'
      ? 'PDF vision inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.'
      : 'Image vision inputs are uploaded as a single base64 payload and are too large for the hosted beta proxy.';
  const mitigation =
    file.kind === 'pdf'
      ? 'Export one page as PNG or JPG, or split the PDF into smaller files, then retry.'
      : 'Resize or crop the image to the relevant region, then retry.';

  throw new Error(
    `${baseMessage} File: ${file.filePath} (${fileSize}). Estimated request body: ${payloadSize}. Safe limit: ${limitSize}. Hosted beta cap: ${capSize}.\n${mitigation}`,
  );
}

function maybeCheckHostedBetaVisionPayload(
  config: ReturnType<typeof buildLLMConfig>,
  file: VisionInput,
  details: {
    prompt: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
  },
): void {
  if (config.provider !== 'hosted-beta') {
    return;
  }

  ensureHostedBetaVisionPayloadWithinLimit(file, {
    ...details,
    model: config.visionModelId ?? DEFAULT_LLM_VISION_MODEL,
  });
}

function formatMaybe(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return 'Unavailable';
  return `${value}${suffix}`;
}

function startProgress(flags: { json?: boolean; quiet?: boolean }, text: string) {
  if (flags.json || flags.quiet) {
    return null;
  }

  info(text);
  return {
    succeed(message: string) {
      success(message);
    },
    fail(message: string) {
      error(message);
    },
  };
}

const SINGLE_AGENT_STATUS_ROTATION = [
  'Terzaghi is thinking through the request...',
  'Discussing the next engineering step with Terzaghi...',
  'Checking whether deterministic tools are needed...',
  'Preparing the next geotechnical action...',
];

const SWARM_STATUS_ROTATION = [
  'Mohr is coordinating Bieniawski, Terzaghi, and Hoek...',
  'Discussing site interpretation with Bieniawski...',
  'Asking Terzaghi to simulate the engineering response...',
  'Waiting for Hoek to review the engineering judgment...',
];

function summarizeStatusText(text: string, limit = 78): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function createLiveStatusController(options: {
  kind: 'single' | 'swarm';
  enabled: boolean;
  provider?: string;
}) {
  if (!options.enabled || !process.stdout.isTTY) {
    return null;
  }

  const rotation =
    options.kind === 'swarm' ? SWARM_STATUS_ROTATION : SINGLE_AGENT_STATUS_ROTATION;
  const spinner = ora({
    text: rotation[0],
    indent: 2,
    discardStdin: false,
  }).start();

  const hostedBetaWarmupHints =
    options.provider === 'hosted-beta'
      ? [
          {
            afterMs: 20_000,
            text: 'Hosted model on Modal.com GPU may still be warming up...',
          },
          {
            afterMs: 95_000,
            text: 'Still waiting on the Modal.com GPU response. geotechCLI will fall back if the timeout budget is exceeded.',
          },
        ]
      : [];

  let rotationIndex = 0;
  let holdUntil = 0;
  let lastProgressAt = Date.now();
  let warmupHintIndex = 0;
  const interval = setInterval(() => {
    if (warmupHintIndex < hostedBetaWarmupHints.length) {
      const hint = hostedBetaWarmupHints[warmupHintIndex];
      if (Date.now() - lastProgressAt >= hint.afterMs) {
        pin(hint.text, 6_000);
        warmupHintIndex += 1;
        return;
      }
    }

    if (Date.now() < holdUntil) {
      return;
    }
    rotationIndex = (rotationIndex + 1) % rotation.length;
    spinner.text = rotation[rotationIndex];
  }, 1600);

  function stopRotation() {
    clearInterval(interval);
  }

  function pin(text: string, holdMs = 2400) {
    spinner.text = text;
    holdUntil = Date.now() + holdMs;
  }

  function markProgress() {
    lastProgressAt = Date.now();
    warmupHintIndex = 0;
  }

  return {
    onAgentStep(step: AgentStep) {
      markProgress();
      switch (step.type) {
        case 'thought':
          pin(`Terzaghi: ${summarizeStatusText(step.content, 84)}`);
          break;
        case 'tool_call':
          pin(`Asking Terzaghi to run ${step.toolName ?? 'the next tool'}...`);
          break;
        case 'tool_result':
          if (step.toolResult?.success) {
            pin(`Terzaghi is reviewing ${step.toolName ?? 'tool'} results...`);
          } else {
            pin('Terzaghi hit a tool issue and is adjusting the approach...');
          }
          break;
        case 'error':
          if (/modal\.com gpu|warming up|timeout budget|timed out/i.test(step.content)) {
            pin('Hosted model on Modal.com GPU is warming up or slow. Terzaghi is switching paths...');
          } else if (/temporarily unavailable|request failed|fetch failed|retry/i.test(step.content)) {
            pin('Hosted beta hit a bump. Terzaghi is recovering...');
          } else {
            pin('Terzaghi hit an issue and is adjusting the analysis...');
          }
          break;
        case 'answer':
          break;
      }
    },
    onSwarmStep(step: SwarmStep) {
      markProgress();
      const label = SWARM_AGENT_LABELS[step.agent] ?? step.agent;
      switch (step.type) {
        case 'thought':
          pin(`${label} is thinking through the next engineering step...`);
          break;
        case 'tool_call':
          pin(`Asking ${label} to run ${step.toolName ?? 'the next tool'}...`);
          break;
        case 'tool_result':
          if (step.toolResult?.success) {
            pin(`${label} is reviewing ${step.toolName ?? 'tool'} results...`);
          } else {
            pin(`${label} hit a tool issue and is adjusting the analysis...`);
          }
          break;
        case 'handoff':
          pin(`Mohr is coordinating the next specialist handoff...`);
          break;
        case 'review':
          pin(`${label} is reviewing the engineering judgment...`);
          break;
        case 'correction':
          pin(`${label} is correcting the analysis...`);
          break;
        case 'error':
          if (/modal\.com gpu|warming up|timeout budget|timed out/i.test(step.content)) {
            pin(`Hosted model on Modal.com GPU is warming up or slow. ${label} is switching paths...`);
          } else {
            pin(`${label} hit an issue and is recovering...`);
          }
          break;
        case 'answer':
          break;
      }
    },
    succeed(message: string) {
      stopRotation();
      spinner.succeed(message);
    },
    fail(message: string) {
      stopRotation();
      spinner.fail(message);
    },
    stop() {
      stopRotation();
      spinner.stop();
    },
  };
}

const SWARM_AGENT_LABELS: Record<'orchestrator' | 'interpretation' | 'simulation' | 'reviewer', string> = {
  orchestrator: 'Mohr',
  interpretation: 'Bieniawski',
  simulation: 'Terzaghi',
  reviewer: 'Hoek',
};

function formatToolPreview(args: Record<string, unknown> | undefined, limit: number): string {
  if (!args) {
    return '';
  }

  const serialized = JSON.stringify(args);
  return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
}

function renderWarningsCompact(warnings: string[]): void {
  if (warnings.length === 0) return;

  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  const visibleWarnings = uniqueWarnings.slice(0, 5);
  console.log(chalk.yellow('  Warnings:'));
  for (const warning of visibleWarnings) {
    console.log(chalk.yellow(`    - ${warning}`));
  }
  if (uniqueWarnings.length > visibleWarnings.length) {
    console.log(chalk.yellow(`    - ${uniqueWarnings.length - visibleWarnings.length} more warning(s) omitted.`));
  }
}

function renderParseSafetyCompact(result: {
  parseStatus: string;
  confidence: number;
  warnings: string[];
  canAutoProceed: boolean;
}): void {
  keyValue('Parse status', result.parseStatus);
  keyValue('Confidence', `${result.confidence}%`);
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');
  renderWarningsCompact(result.warnings);
}

function handleCommandErrorClean(
  err: unknown,
  flags: { json?: boolean },
  code = 'command_failed',
): void {
  const message = getErrorMessage(err);
  process.exitCode = 1;

  if (flags.json) {
    renderJSON({ error: { code, message } });
    return;
  }

  if (code.includes('vision') || code.includes('corebox') || code.includes('rmr') || code.includes('sensor') || code.includes('borehole')) {
    const lowered = message.toLowerCase();
    if (
      lowered.includes('no content') ||
      lowered.includes('empty') ||
      lowered.includes('upstream') ||
      lowered.includes('hosted beta proxy') ||
      lowered.includes('too large for the hosted beta proxy') ||
      lowered.includes('safe limit')
    ) {
      error(message);
      console.log('');
      console.log(chalk.gray('  Vision troubleshooting tips:'));
      console.log(chalk.gray('    - Use PNG or JPG images (not PDF or BMP)'));
      console.log(chalk.gray('    - Ensure the image is well-lit and clearly shows the subject'));
      console.log(chalk.gray('    - Try a smaller image file (< 5 MB)'));
      console.log(chalk.gray('    - Wait a moment and retry; the AI provider may be busy'));
      console.log(chalk.gray('    - Run with --verbose to see the raw response'));
      return;
    }
  }

  error(message);
}

function renderAgentStepPlain(step: AgentStep, json: boolean, quiet = false): void {
  if (json || quiet) return;

  switch (step.type) {
    case 'thought':
      return;
    case 'tool_call':
      console.log(chalk.cyan(`  [Terzaghi] Tool: ${step.toolName}(${formatToolPreview(step.toolArgs, 120)})`));
      return;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  [Terzaghi] Result: ${step.content}`));
      } else {
        console.log(chalk.red(`  [Terzaghi] Error: ${step.content}`));
      }
      return;
    case 'answer':
      return;
    case 'error':
      console.log(chalk.red(`  [Terzaghi] Error: ${step.content}`));
      return;
  }
}

function renderSwarmStepPlain(step: SwarmStep, json: boolean, quiet = false): void {
  if (json || quiet) return;

  const label = SWARM_AGENT_LABELS[step.agent] ?? step.agent;
  const tag = `[${label}]`;

  switch (step.type) {
    case 'thought':
      return;
    case 'tool_call':
      console.log(chalk.cyan(`  ${tag} Tool: ${step.toolName}(${formatToolPreview(step.toolArgs, 100)})`));
      return;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${tag} Result: ${step.content.slice(0, 180)}`));
      } else {
        console.log(chalk.red(`  ${tag} Error: ${step.content.slice(0, 180)}`));
      }
      return;
    case 'handoff':
      console.log(chalk.magenta(`  ${tag} Handoff: ${step.content}`));
      return;
    case 'review':
      console.log(chalk.green(`  ${tag} Review: ${step.content}`));
      return;
    case 'correction':
      console.log(chalk.red(`  ${tag} Correction: ${step.content.slice(0, 200)}`));
      return;
    case 'answer':
      return;
    case 'error':
      console.log(chalk.red(`  ${tag} Error: ${step.content}`));
      return;
  }
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(
    /(?:Bearer |sk-|zhipu-|api[_-]?key[=: ]*)[^\s"'\]},]*/gi,
    '***REDACTED***',
  );
}

function getErrorMessage(err: unknown): string {
  return sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
}

function handleCommandError(
  err: unknown,
  flags: { json?: boolean },
  code = 'command_failed',
): void {
  const message = getErrorMessage(err);
  process.exitCode = 1;

  if (flags.json) {
    renderJSON({ error: { code, message } });
    return;
  }

  // Provide specific guidance for common vision errors
  if (code.includes('vision') || code.includes('corebox') || code.includes('rmr') || code.includes('sensor') || code.includes('borehole')) {
    const lowered = message.toLowerCase();
    if (
      lowered.includes('no content') ||
      lowered.includes('empty') ||
      lowered.includes('upstream') ||
      lowered.includes('hosted beta proxy') ||
      lowered.includes('too large for the hosted beta proxy') ||
      lowered.includes('safe limit')
    ) {
      error(message);
      console.log('');
      console.log(chalk.gray('  Vision troubleshooting tips:'));
      console.log(chalk.gray('    · Use PNG or JPG images (not PDF or BMP)'));
      console.log(chalk.gray('    · Ensure the image is well-lit and clearly shows the subject'));
      console.log(chalk.gray('    · Try a smaller image file (< 5 MB)'));
      console.log(chalk.gray('    · Wait a moment and retry — the AI provider may be busy'));
      console.log(chalk.gray('    · Run with --verbose to see the raw response'));
      return;
    }
  }

  error(message);
}

function renderWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  const visibleWarnings = uniqueWarnings.slice(0, 5);
  console.log(chalk.yellow('  Warnings:'));
  for (const warning of visibleWarnings) {
    console.log(chalk.yellow(`    - ${warning}`));
  }
  if (uniqueWarnings.length > visibleWarnings.length) {
    console.log(chalk.yellow(`    - ${uniqueWarnings.length - visibleWarnings.length} more warning(s) omitted.`));
  }
}

function renderParseSafety(result: {
  parseStatus: string;
  confidence: number;
  warnings: string[];
  canAutoProceed: boolean;
}): void {
  keyValue('Parse status', result.parseStatus);
  keyValue('Confidence', `${result.confidence}%`);
  keyValue('Auto proceed', result.canAutoProceed ? 'Yes' : 'No');
  renderWarnings(result.warnings);
}

function loadProjectState(projectId?: string): {
  id: string;
  name: string;
  context: Record<string, unknown>;
} | null {
  if (!projectId) return null;
  const project = loadProject(projectId);
  return {
    id: project.meta.id,
    name: project.meta.name,
    context: getProjectAgentContext(project.meta.id),
  };
}

function persistSessionToProject(
  projectId: string,
  mode: 'single' | 'swarm' | 'chat',
  query: string,
  session: AgentSession | SwarmSession,
): void {
  const answer = session.steps.find((step) => step.type === 'answer')?.content;
  const reviewMetadata = 'reviewPassed' in session
    ? {
      reviewPassed: session.reviewPassed,
      corrections: session.corrections,
    }
    : undefined;

  if (mode === 'swarm') {
    const swarmSession = session as SwarmSession;
    addAgentSession(projectId, buildSwarmSessionProjectRecord(query, swarmSession, {
      mode,
      answer,
      summary: answer?.slice(0, 240) ?? `${mode} session for: ${query.slice(0, 120)}`,
      metadata: reviewMetadata,
    }));

    const caseFileResult = persistSwarmCaseFile(projectId, query, swarmSession);
    const evidenceRecords = persistCaseFileEvidence(projectId, caseFileResult.scenarioId);
    addNote(projectId, `Updated swarm case file "${caseFileResult.scenarioId}" from the latest session.`);
    if (evidenceRecords.length > 0) {
      addNote(projectId, `Captured ${evidenceRecords.length} evidence record${evidenceRecords.length === 1 ? '' : 's'} for scenario "${caseFileResult.scenarioId}".`);
    }
  } else {
    addAgentSession(projectId, {
      mode,
      query,
      answer,
      summary: answer?.slice(0, 240) ?? `${mode} session for: ${query.slice(0, 120)}`,
      stepCount: session.steps.length,
      tokens: session.totalTokens,
      latencyMs: session.totalLatencyMs,
      context: session.context,
      metadata: reviewMetadata,
    });
  }

  saveNamedDataset(projectId, {
    name: 'latest-agent-context',
    kind: 'agent-context',
    data: session.context,
    source: mode,
  });

  saveDerivedParameter(projectId, {
    name: 'last-agent-mode',
    value: mode,
    source: 'cli',
  });

  setActiveAnalysisContext(projectId, {
    currentTask: query,
    lastAgentMode: mode,
    lastAnswer: answer,
    context: session.context,
    relatedDatasets: Object.keys(session.context),
  });

  addNote(projectId, `Persisted ${mode} agent session for "${query.slice(0, 120)}"`);

  if (answer) {
    addArtifact(projectId, {
      kind: mode === 'swarm' ? 'swarm-report' : 'agent-report',
      title: `${mode} analysis`,
      content: answer,
      mimeType: 'text/plain',
      metadata: {
        query,
        tokens: session.totalTokens,
      },
    });
  }
}

function persistOutputArtifact(
  projectId: string | undefined,
  kind: string,
  title: string,
  path: string,
  metadata?: Record<string, unknown>,
): void {
  if (!projectId) return;
  addArtifact(projectId, {
    kind,
    title,
    path,
    metadata,
  });
}

function buildAnalysisDocument(title: string, task: string, answer: string, mode: 'single' | 'swarm'): GeneratedReport {
  const content = [
    `## Task`,
    task,
    '',
    `## ${mode === 'swarm' ? 'Swarm Report' : 'Analysis'}`,
    answer,
  ].join('\n');

  return {
    title,
    sections: [
      {
        title: 'Summary',
        content,
      },
    ],
    fullMarkdown: `# ${title}\n\n${content}\n`,
    latencyMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Vision Commands
// ---------------------------------------------------------------------------

export function registerVisionCommand(program: Command): void {
  const vision = new Command('vision')
    .description('AI vision analysis for geotechnical images');

  // Core box analysis
  const coreboxCmd = new Command('corebox')
    .description('Analyze a core box image for RQD, fracture spacing, and weathering')
    .argument('<image>', 'Path to core box image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Analyzing core box image...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Analyze this geotechnical image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 900,
        });
        const result = await analyzeCoreBox(file.base64, file.mimeType, config);

        spinner?.succeed(`Analysis complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Core Box Analysis');
        renderParseSafetyCompact(result);
        keyValue('RQD', formatMaybe(result.rqd, '%'));
        keyValue('Fracture spacing', formatMaybe(result.fractureSpacing));
        keyValue('Weathering grade', formatMaybe(result.weatheringGrade));
        keyValue('Rock type', formatMaybe(result.rockType));
        keyValue('Core recovery', formatMaybe(result.coreRecovery, '%'));
        keyValue('Discontinuities', formatMaybe(result.discontinuities));

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
        console.log('');
      } catch (err) {
        spinner?.fail('Analysis failed');
        handleCommandErrorClean(err, flags, 'corebox_analysis_failed');
      }
    });
  addGlobalFlags(coreboxCmd);
  vision.addCommand(coreboxCmd);

  // Hybrid RMR from image
  const rmrImageCmd = new Command('rmr')
    .description('Hybrid RMR: vision extracts features, then deterministic RMR scoring')
    .argument('<image>', 'Path to rock face / core image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Extracting rock mass parameters from image...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Estimate rock mass parameters from this image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await classifyRMRFromImage(file.base64, file.mimeType, config);

        spinner?.succeed(`RMR classification complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Hybrid RMR Classification (Vision + Deterministic)');
        renderParseSafetyCompact(result);

        console.log('');
        console.log(chalk.gray('  Vision-extracted parameters:'));
        keyValue('  Estimated UCS', formatMaybe(result.visionExtraction.estimatedUCS, ' MPa'));
        keyValue('  Estimated RQD', formatMaybe(result.visionExtraction.estimatedRQD, '%'));
        keyValue('  Estimated spacing', formatMaybe(result.visionExtraction.estimatedSpacing, ' m'));
        keyValue('  Joint condition', formatMaybe(result.visionExtraction.jointCondition));
        keyValue('  Groundwater', formatMaybe(result.visionExtraction.groundwaterCondition));

        console.log('');
        console.log(chalk.gray('  Deterministic RMR result:'));
        if (result.rmrResult) {
          keyValue('  Total RMR', `${result.rmrResult.totalRating}/100`);
          keyValue('  Rock class', `Class ${result.rmrResult.classNumber}: ${result.rmrResult.rockClass}`);
          keyValue('  Support', result.rmrResult.supportRecommendation);
        } else {
          console.log(chalk.yellow('    Deterministic RMR scoring was skipped because the vision extraction was incomplete or low confidence.'));
        }

        console.log('');
      } catch (err) {
        spinner?.fail('RMR classification failed');
        handleCommandErrorClean(err, flags, 'rmr_classification_failed');
      }
    });
  addGlobalFlags(rmrImageCmd);
  vision.addCommand(rmrImageCmd);

  // Sensor interpretation
  const sensorCmd = new Command('sensor')
    .description('Interpret sensor data image (piezometer, inclinometer, etc.)')
    .argument('<image>', 'Path to sensor data image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Interpreting sensor data...');
      try {
        const file = readVisionInput(imagePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Interpret this sensor data image.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await interpretSensorImage(file.base64, file.mimeType, config);

        spinner?.succeed(`Interpretation complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading(`Sensor Interpretation - ${result.sensorType ?? 'Unknown'}`);
        renderParseSafetyCompact(result);
        keyValue('Sensor type', formatMaybe(result.sensorType));
        keyValue('Measurements', formatMaybe(result.measurements));
        console.log('');
        console.log(chalk.white('  Interpretation:'));
        console.log(`    ${formatMaybe(result.interpretation)}`);
        console.log('');
        console.log(chalk.white('  Evaluation:'));
        console.log(`    ${formatMaybe(result.evaluation)}`);
        console.log('');
        console.log(chalk.white('  Recommendations:'));
        console.log(`    ${formatMaybe(result.recommendations)}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Sensor interpretation failed');
        handleCommandErrorClean(err, flags, 'sensor_interpretation_failed');
      }
    });
  addGlobalFlags(sensorCmd);
  vision.addCommand(sensorCmd);

  // Borehole log extraction
  const logCmd = new Command('log')
    .description('Extract structured data from borehole log image/PDF')
    .argument('<file>', 'Path to borehole log image or PDF')
    .option('--borehole-id <id>', 'Override borehole ID')
    .action(async (filePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = startProgress(flags, 'Extracting borehole log data...');
      try {
        const file = readVisionInput(filePath);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        const requestDetails = {
          prompt: 'Extract structured borehole log data.',
          systemPrompt: 'You are analyzing a geotechnical image.',
          temperature: 0.1,
          maxTokens: 900,
        };

        let result: BoreholeInterpretation;
        if (file.kind === 'pdf') {
          const pdfInspection = inspectPdfDocument(filePath);
          const effectiveInspection = pdfInspection.totalPages > 0 ? pdfInspection : null;
          const pageInputs = await readVisionPdfPageInputs(filePath, { inspection: effectiveInspection });
          if (!flags.json && !flags.quiet && pageInputs.length > 1) {
            info(`PDF contains ${pageInputs.length} pages. Processing borehole log pages sequentially.`);
          }

          for (const pageInput of pageInputs) {
            if (!flags.json && !flags.quiet && pageInputs.length > 1) {
              info(`Processing PDF page ${pageInput.pageNumber}/${pageInput.totalPages}...`);
            }
            maybeCheckHostedBetaVisionPayload(config, pageInput, requestDetails);
          }

          const ingestResult = await ingestBoreholeLogDocument({
            config,
            source: {
              filePath,
              fileName: filePath.split(/[\\/]/).pop(),
              inputKind: 'pdf',
            },
            overrideBoreholeId: opts.boreholeId as string | undefined,
            inspection: effectiveInspection,
            pages: pageInputs,
          });

          const detectedIds = [
            ...new Set(
              ingestResult.boreholes
                .map((borehole) => borehole.boreholeId)
                .filter((value) => value && value !== 'BH-unknown'),
            ),
          ];

          if (ingestResult.boreholes.length > 1 && !opts.boreholeId) {
            throw new Error(
              `Multiple borehole groups were detected across the PDF pages (${detectedIds.join(', ') || 'unresolved IDs'}). Use geotech ingest for multi-borehole PDFs, split the PDF by borehole, or pass --borehole-id if the document is a single continued log.`,
            );
          }

          const selectedResult = ingestResult.boreholes[0];
          if (!selectedResult) {
            throw new Error('No borehole interpretation could be extracted from the supplied file.');
          }

          result = {
            ...selectedResult,
            warnings: [...new Set([...selectedResult.warnings, ...ingestResult.warnings])],
            canAutoProceed: selectedResult.canAutoProceed && !ingestResult.reviewRequired,
          };

          spinner?.succeed(
            `Extraction complete: ${result.layers.length} layers from ${ingestResult.source.successfulPages}/${ingestResult.source.totalPages} page(s) (${result.latencyMs}ms)`,
          );
        } else {
          maybeCheckHostedBetaVisionPayload(config, file, requestDetails);
          const ingestResult = await ingestBoreholeLogDocument({
            config,
            source: {
              filePath,
              fileName: filePath.split(/[\\/]/).pop(),
              inputKind: 'image',
            },
            overrideBoreholeId: opts.boreholeId as string | undefined,
            image: file,
          });
          const selectedResult = ingestResult.boreholes[0];
          if (!selectedResult) {
            throw new Error('No borehole interpretation could be extracted from the supplied file.');
          }
          result = {
            ...selectedResult,
            warnings: [...new Set([...selectedResult.warnings, ...ingestResult.warnings])],
            canAutoProceed: selectedResult.canAutoProceed && !ingestResult.reviewRequired,
          };
          spinner?.succeed(`Extraction complete: ${result.layers.length} layers (${result.latencyMs}ms)`);
        }

        if (flags.json) { renderJSON(result); return; }

        heading(`Borehole Log - ${result.boreholeId}`);
        renderParseSafetyCompact(result);
        if (result.projectName) {
          keyValue('Project', result.projectName);
        }
        keyValue('Total depth', formatMaybe(result.totalDepth, ' m'));
        keyValue('Water table', result.waterTableDepth != null ? `${result.waterTableDepth} m` : 'Not detected');
        if (result.groundElevation != null) {
          keyValue('Ground elevation', `${result.groundElevation} m`);
        }
        if (result.location) {
          const rawCoordinateText =
            typeof result.location.raw?.rawCoordinateText === 'string'
              ? result.location.raw.rawCoordinateText
              : null;
          const coordinateParts = [
            result.location.crs?.code ?? result.location.crs?.name ?? null,
            rawCoordinateText,
            result.location.wgs84
              ? `lat ${result.location.wgs84.latitude}, lon ${result.location.wgs84.longitude}`
              : null,
            result.location.projected
              ? `E ${result.location.projected.easting}, N ${result.location.projected.northing}`
              : null,
          ].filter((value): value is string => Boolean(value));

          if (coordinateParts.length > 0) {
            keyValue('Coordinates', coordinateParts.join(' | '));
          }
        }

        renderTable(
          ['From (m)', 'To (m)', 'Description', 'USCS', 'SPT-N'],
          result.layers.map((l) => [
            l.depthFrom != null ? l.depthFrom : '-',
            l.depthTo != null ? l.depthTo : '-',
            (l.description ?? 'Unavailable').slice(0, 40),
            l.uscsSymbol || '-',
            l.sptN ?? '-',
          ]),
        );

        console.log('');
        console.log(chalk.white('  Summary:'));
        console.log(`    ${formatMaybe(result.summary)}`);

        if (flags.output) {
          writeFileSync(flags.output, JSON.stringify(result, null, 2));
          success(`Results saved to ${flags.output}`);
        }
        console.log('');
      } catch (err) {
        spinner?.fail('Extraction failed');
        handleCommandErrorClean(err, flags, 'borehole_extraction_failed');
      }
    });
  addGlobalFlags(logCmd);
  vision.addCommand(logCmd);

  program.addCommand(vision);
}

// ---------------------------------------------------------------------------
// Soil Classification from Natural Language
// ---------------------------------------------------------------------------

export function registerAIClassifyCommand(program: Command): void {
  const cmd = new Command('ai-classify')
    .description('Classify soil from natural language description (AI-powered)')
    .argument('<description...>', 'Soil description in natural language')
    .action(async (descParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const description = descParts.join(' ');

      if (!(await checkQuota('llmCalls'))) return;

      const spinner = startProgress(flags, 'Classifying soil from description...');
      try {
        const config = buildLLMConfig();
        const result = await classifySoilFromDescription(description, config);

        spinner?.succeed('Classification complete');

        if (flags.json) { renderJSON(result); return; }

        heading('AI Soil Classification');
        keyValue('Input', `"${description}"`);
        renderParseSafetyCompact(result);
        keyValue('USCS symbol', formatMaybe(result.uscsSymbol));
        keyValue('USCS name', formatMaybe(result.uscsName));
        keyValue('Friction angle', formatMaybe(result.estimatedProperties.frictionAngle, ' deg'));
        keyValue('Cohesion', formatMaybe(result.estimatedProperties.cohesion, ' kPa'));
        keyValue('Unit weight', formatMaybe(result.estimatedProperties.unitWeight, ' kN/m3'));
        keyValue('Permeability', formatMaybe(result.estimatedProperties.permeability));
        console.log('');
        console.log(chalk.white('  Notes:'));
        console.log(`    ${formatMaybe(result.engineeringNotes)}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Classification failed');
        handleCommandErrorClean(err, flags, 'ai_classification_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// GBR Document Q&A
// ---------------------------------------------------------------------------

export function registerGBRCommand(program: Command): void {
  const gbr = new Command('gbr')
    .description('Geotechnical Baseline Report Q&A');

  const chatCmd = new Command('chat')
    .description('Ask questions about a GBR document')
    .requiredOption('--doc <file>', 'Path to GBR PDF or image')
    .argument('<question...>', 'Question about the GBR')
    .action(async (questionParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const question = questionParts.join(' ');

      if (!(await checkQuota('llmCalls'))) return;

      const spinner = startProgress(flags, `Querying GBR: "${question.slice(0, 50)}..."`);
      try {
        const file = readVisionInput(opts.doc);
        describeVisionInput(file, flags);
        const config = buildLLMConfig();
        maybeCheckHostedBetaVisionPayload(config, file, {
          prompt: 'Answer questions about this GBR document.',
          systemPrompt: 'You are analyzing a geotechnical document image.',
          temperature: 0.1,
          maxTokens: 700,
        });
        const result = await queryGBRDocument(question, file.base64, file.mimeType, config);

        spinner?.succeed(`Answer ready (${result.latencyMs}ms)`);

        if (flags.json) {
          renderJSON({ question, answer: result.answer, latencyMs: result.latencyMs });
          return;
        }

        heading('GBR Q&A');
        console.log(chalk.cyan(`  Q: ${question}`));
        console.log('');
        console.log(`  ${result.answer}`);
        console.log('');
      } catch (err) {
        spinner?.fail('GBR query failed');
        handleCommandErrorClean(err, flags, 'gbr_query_failed');
      }
    });

  addGlobalFlags(chatCmd);
  gbr.addCommand(chatCmd);
  program.addCommand(gbr);
}

// ---------------------------------------------------------------------------
// Agentic CLI — real tool-calling brain with ReAct loop
// ---------------------------------------------------------------------------

function renderAgentStep(step: AgentStep, json: boolean, quiet: boolean = false): void {
  if (json || quiet) return;

  const icons: Record<string, string> = {
    thought: '🤔',
    tool_call: '🔧',
    tool_result: '📊',
    answer: '✅',
    error: '❌',
  };

  const icon = icons[step.type] ?? '•';

  switch (step.type) {
    case 'thought':
      console.log(chalk.gray(`  ${icon} [Thinking] ${step.content.slice(0, 200)}`));
      break;
    case 'tool_call':
      console.log(chalk.cyan(`  ${icon} [Tool] ${step.toolName}(${JSON.stringify(step.toolArgs).slice(0, 100)})`));
      break;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${icon} [Result] ${step.content}`));
      } else {
        console.log(chalk.red(`  ${icon} [Error] ${step.content}`));
      }
      break;
    case 'answer':
      // Final answer rendered separately
      break;
    case 'error':
      console.log(chalk.red(`  ${icon} ${step.content}`));
      break;
  }
}

function withSessionSkillOptIn<T extends { skillsEnabled?: boolean }>(
  config: T,
  enabled: boolean,
): T & { skillsEnabled: boolean } {
  return {
    ...config,
    skillsEnabled: config.skillsEnabled === true || enabled,
  };
}

function renderSwarmStep(step: SwarmStep, json: boolean, quiet: boolean = false): void {
  if (json || quiet) return;

  const agentColors: Record<string, (s: string) => string> = {
    orchestrator: chalk.white,
    interpretation: chalk.blue,
    simulation: chalk.cyan,
    reviewer: chalk.yellow,
  };

  const icons: Record<string, string> = {
    thought: '🤔',
    tool_call: '🔧',
    tool_result: '📊',
    handoff: '🔀',
    review: '✅',
    correction: '🔄',
    answer: '📋',
    error: '❌',
  };

  const color = agentColors[step.agent] ?? chalk.gray;
  const icon = icons[step.type] ?? '•';
  const tag = color(`[${step.agent}]`);

  switch (step.type) {
    case 'thought':
      console.log(chalk.gray(`  ${icon} ${tag} ${step.content.slice(0, 180)}`));
      break;
    case 'tool_call':
      console.log(chalk.cyan(`  ${icon} ${tag} ${step.toolName}(${JSON.stringify(step.toolArgs).slice(0, 80)})`));
      break;
    case 'tool_result':
      if (step.toolResult?.success) {
        console.log(chalk.green(`  ${icon} ${tag} ${step.content.slice(0, 150)}`));
      } else {
        console.log(chalk.red(`  ${icon} ${tag} ${step.content.slice(0, 150)}`));
      }
      break;
    case 'handoff':
      console.log(chalk.magenta(`  ${icon} ${tag} ${step.content}`));
      break;
    case 'review':
      console.log(chalk.green(`  ${icon} ${tag} ${step.content}`));
      break;
    case 'correction':
      console.log(chalk.red(`  ${icon} ${tag} ${step.content.slice(0, 200)}`));
      break;
    case 'answer':
      break;
    case 'error':
      console.log(chalk.red(`  ${icon} ${tag} ${step.content}`));
      break;
  }
}

export function registerAgentCommand(program: Command): void {
  const cmd = new Command('agent')
    .description('Agentic AI - reasons about your problem and executes real calculations')
    .argument('<task...>', 'Engineering task in natural language')
    .option('--swarm', 'Use multi-agent swarm (Bieniawski -> Terzaghi -> Hoek)')
    .option('--skills', 'Enable installed skill tools for this session')
    .option('--project <id>', 'Load and persist context to a stored project')
    .option('--workspace <dir>', 'Scan a local workspace and attach its manifest summary to the agent task')
    .action(async (taskParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const task = taskParts.join(' ');
      let agentTask = task;
      const useSwarm = opts.swarm === true;
      const showLiveStatus = !flags.json && !flags.quiet && !flags.verbose;

      if (!(await checkQuota('agentCalls'))) return;

      let workspaceManifest: ProjectManifest | undefined;
      if (typeof opts.workspace === 'string' && opts.workspace.trim()) {
        workspaceManifest = await analyzeWorkspace(opts.workspace, {});
        agentTask = `${task}\n\n${summarizeWorkspaceManifestForAgent(workspaceManifest)}`;
      }

      if (!flags.json) {
        console.log('');
      if (useSwarm) {
        console.log(chalk.gray('  Swarm activated - Bieniawski, Terzaghi, and Hoek coordinated by Mohr'));
      } else {
        console.log(chalk.gray('  Agent activated - Terzaghi is planning and executing'));
      }
        console.log('');
      }

      let liveStatus: ReturnType<typeof createLiveStatusController> = null;
      try {
        const config = withSessionSkillOptIn(buildLLMConfig(), opts.skills === true);
        const projectState = loadProjectState(opts.project);

        if (projectState && !flags.json) {
          console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
          console.log('');
        }

        if (opts.skills === true && !flags.json) {
          console.log(chalk.gray('  Installed skill tools enabled for this session.'));
          console.log('');
        }

        if (workspaceManifest && !flags.json) {
          console.log(chalk.gray(`  Workspace manifest attached: ${workspaceManifest.summary.totalFiles} files, branches: ${workspaceManifest.summary.branches.join(', ') || 'none'}, verifier: ${workspaceManifest.verifier?.status ?? 'not-run'}`));
          console.log('');
        }

        liveStatus = createLiveStatusController({
          kind: useSwarm ? 'swarm' : 'single',
          enabled: showLiveStatus,
          provider: config.provider,
        });

        if (useSwarm) {
          // Multi-agent swarm mode
          const session = await runSwarm(agentTask, config, (step) => {
            liveStatus?.onSwarmStep(step);
            if (flags.verbose) {
              renderSwarmStepPlain(step, flags.json, flags.quiet);
            }
          }, projectState?.context);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'swarm', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
              workspace: workspaceManifest ? {
                rootPath: workspaceManifest.rootPath,
                summary: workspaceManifest.summary,
                groundModel: workspaceManifest.groundModel ? {
                  stats: workspaceManifest.groundModel.stats,
                  coordinateSystem: workspaceManifest.groundModel.coordinateSystem,
                } : undefined,
                verifier: workspaceManifest.verifier,
              } : undefined,
              mode: 'swarm',
              answer: answer?.content ?? '',
              reviewPassed: session.reviewPassed,
              corrections: session.corrections,
              steps: session.steps.map((s) => ({
                agent: s.agent,
                type: s.type,
                content: s.content,
                toolName: s.toolName,
                toolArgs: s.toolArgs,
                toolResult: s.toolResult ? { success: s.toolResult.success, summary: s.toolResult.summary } : undefined,
              })),
              context: session.context,
              tokens: session.totalTokens,
              latencyMs: session.totalLatencyMs,
            });
            return;
          }

          if (answer) {
            liveStatus?.succeed('Mohr and the specialists finished the analysis.');
            console.log('');
            heading('Swarm Report');
            renderRichText(answer.content);
            console.log('');
            const toolCalls = session.steps.filter((s) => s.type === 'tool_call').length;
            const agents = [...new Set(session.steps.map((s) => s.agent))];
            console.log(chalk.gray(`  (${agents.length} agents, ${toolCalls} tools executed, review: ${session.reviewPassed ? 'PASSED' : 'ISSUES NOTED'}, ${session.totalTokens} tokens)`));
            console.log(chalk.cyan('\n  Continue interactively with: ') + chalk.white(`geotech chat${opts.project ? ` --project ${opts.project}` : ''}${opts.skills ? ' --skills' : ''}`));
          } else {
            liveStatus?.stop();
          }

          if (flags.output && answer) {
            const outputTarget = resolveStructuredOutputTarget({
              outputPath: flags.output,
              defaultBaseName: 'swarm-report',
            });

            if (outputTarget.warning) {
              warn(outputTarget.warning);
            }

            if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
              const document = buildAnalysisDocument('Swarm Report', task, answer.content, 'swarm');
              const buffer = outputTarget.kind === 'pdf'
                ? await renderReportAsPdf(document)
                : await renderReportAsDocx(document);
              writeFileSync(outputTarget.outputPath, buffer);
            } else {
              writeFileSync(outputTarget.outputPath, answer.content);
            }

            persistOutputArtifact(projectState?.id, 'swarm-report-file', 'swarm report output', outputTarget.outputPath, { task });
            success(`Report saved to ${outputTarget.outputPath}`);
          }

        } else {
          // Single-agent ReAct mode (default)
          const session = await runAgent(agentTask, config, (step) => {
            liveStatus?.onAgentStep(step);
            if (flags.verbose) {
              renderAgentStepPlain(step, flags.json, flags.quiet);
            }
          }, projectState?.context);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'single', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
              workspace: workspaceManifest ? {
                rootPath: workspaceManifest.rootPath,
                summary: workspaceManifest.summary,
                groundModel: workspaceManifest.groundModel ? {
                  stats: workspaceManifest.groundModel.stats,
                  coordinateSystem: workspaceManifest.groundModel.coordinateSystem,
                } : undefined,
                verifier: workspaceManifest.verifier,
              } : undefined,
              mode: 'single',
              answer: answer?.content ?? '',
              steps: session.steps.map((s) => ({
                type: s.type,
                content: s.content,
                toolName: s.toolName,
                toolArgs: s.toolArgs,
                toolResult: s.toolResult ? { success: s.toolResult.success, summary: s.toolResult.summary } : undefined,
              })),
              context: session.context,
              tokens: session.totalTokens,
              latencyMs: session.totalLatencyMs,
            });
            return;
          }

          if (answer) {
            liveStatus?.succeed('Terzaghi finished the analysis.');
            console.log('');
            heading('Agent Analysis');
            renderRichText(answer.content);
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools executed, ${session.totalTokens} tokens, ${session.totalLatencyMs}ms)`));
            console.log(chalk.cyan('\n  Continue interactively with: ') + chalk.white(`geotech chat${opts.project ? ` --project ${opts.project}` : ''}${opts.skills ? ' --skills' : ''}`));
          } else {
            liveStatus?.stop();
          }

          if (flags.output && answer) {
            const outputTarget = resolveStructuredOutputTarget({
              outputPath: flags.output,
              defaultBaseName: 'agent-analysis',
            });

            if (outputTarget.warning) {
              warn(outputTarget.warning);
            }

            if (outputTarget.kind === 'pdf' || outputTarget.kind === 'docx') {
              const document = buildAnalysisDocument('Agent Analysis', task, answer.content, 'single');
              const buffer = outputTarget.kind === 'pdf'
                ? await renderReportAsPdf(document)
                : await renderReportAsDocx(document);
              writeFileSync(outputTarget.outputPath, buffer);
            } else {
              writeFileSync(outputTarget.outputPath, answer.content);
            }

            persistOutputArtifact(projectState?.id, 'agent-report-file', 'agent analysis output', outputTarget.outputPath, { task });
            success(`Report saved to ${outputTarget.outputPath}`);
          }
        }

        if (!flags.json) {
          console.log('');
        }
      } catch (err) {
        liveStatus?.fail(useSwarm ? 'Swarm analysis failed.' : 'Terzaghi could not complete the request.');
        handleCommandErrorClean(err, flags, useSwarm ? 'swarm_failed' : 'agent_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Interactive REPL Chat — conversational agentic session with memory
// ---------------------------------------------------------------------------

export function registerChatCommand(program: Command): void {
  const cmd = new Command('chat')
    .description('Interactive agentic session - type natural language, agent executes tools with memory')
    .option('--skills', 'Enable installed skill tools for this session')
    .option('--project <id>', 'Load and persist context to a stored project')
    .action(async (opts) => {
      const { createInterface } = await import('node:readline');

      console.log('');
      console.log(chalk.bold.cyan('  geotech') + chalk.bold.white('CLI') + chalk.gray(' Agent - Interactive Mode'));
      console.log(chalk.gray('  Type engineering questions. The agent will reason and execute calculations.'));
      console.log(chalk.gray('  Live status updates will appear while Terzaghi is thinking and calling tools.'));
      console.log(chalk.gray('  Commands: /context (show memory), /clear (reset), /exit (quit)'));
      console.log('');

      let config;
      try {
        config = withSessionSkillOptIn(buildLLMConfig(), opts.skills === true);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return;
      }

      if (config.provider !== 'hosted-beta' && !config.apiKey) {
        warn('No provider API key set. Run: geotech config set llm.api_key <key>');
        warn('Or switch back to hosted beta with: geotech config set llm.provider hosted-beta');
        return;
      }

      const projectState = loadProjectState(opts.project);
      if (projectState) {
        console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
        console.log('');
      }

      if (opts.skills === true) {
        console.log(chalk.gray('  Installed skill tools enabled for this session.'));
        console.log('');
      }

      const conversation = new AgentConversation({
        context: projectState?.context,
      });
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.cyan('  geotech') + chalk.white(' > '),
      });

      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();

        if (!input) {
          rl.prompt();
          return;
        }

        // REPL commands
        if (input === '/exit' || input === '/quit') {
          console.log(chalk.gray('  Goodbye.'));
          rl.close();
          return;
        }

        if (input === '/context') {
          const ctx = conversation.getContext();
          if (Object.keys(ctx).length === 0) {
            console.log(chalk.gray('  No context yet. Run some analyses first.'));
          } else {
            console.log(chalk.gray('  Session context (accumulated results):'));
            for (const [key, value] of Object.entries(ctx)) {
              const summary = typeof value === 'object' && value !== null && 'steps' in (value as any)
                ? (value as any).steps?.slice(-1)[0] ?? key
                : key;
              console.log(chalk.gray(`    • ${key}: `) + chalk.white(String(typeof summary === 'string' ? summary : key)));
            }
          }
          console.log('');
          rl.prompt();
          return;
        }

        if (input === '/clear') {
          conversation.clearContext();
          if (projectState) {
            setActiveAnalysisContext(projectState.id, {
              currentTask: 'interactive-chat',
              lastAgentMode: 'chat',
              lastAnswer: undefined,
              context: {},
              relatedDatasets: [],
            });
            saveNamedDataset(projectState.id, {
              name: 'latest-agent-context',
              kind: 'agent-context',
              data: {},
              source: 'chat-clear',
            });
          }
          console.log(chalk.gray('  Context cleared.'));
          console.log('');
          rl.prompt();
          return;
        }

        // Check quota
        if (!(await checkQuota('agentCalls'))) {
          rl.prompt();
          return;
        }

        console.log('');
        const liveStatus = createLiveStatusController({
          kind: 'single',
          enabled: true,
          provider: config.provider,
        });

        try {
          const session = await conversation.ask(input, config, (step) => {
            liveStatus?.onAgentStep(step);
          });

          if (projectState) {
            persistSessionToProject(projectState.id, 'chat', input, session);
          }

          const answer = session.steps.find((s) => s.type === 'answer');
          if (answer) {
            liveStatus?.succeed('Terzaghi is ready.');
            console.log('');
            renderRichText(answer.content);
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools, ${session.totalTokens} tokens)`));
          } else {
            liveStatus?.stop();
          }
        } catch (err) {
          liveStatus?.fail('Terzaghi could not complete the request.');
          error(err instanceof Error ? err.message : String(err));
        }

        console.log('');
        rl.prompt();
      });

      rl.on('close', () => {
        process.exit(0);
      });
    });

  program.addCommand(cmd);
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

export function registerReportCommand(program: Command): void {
  const cmd = new Command('report')
    .description('Generate AI-powered geotechnical report from analysis data')
    .option('--data <file>', 'JSON file with analysis results')
    .option('--from-case-file <scenarioId>', 'Assemble a deterministic report from a stored case file')
    .option('--project-id <id>', 'Stored project id required with --from-case-file')
    .option('--type <type>', 'Report type: borehole|site-investigation|tunnel-design|foundation|slope|custom', 'site-investigation')
    .option('--project <name>', 'Project name')
    .option('--location <loc>', 'Project location')
    .option('--format <ext>', 'Export format: md|pdf|docx', 'md')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);
      const useCaseFile = typeof opts.fromCaseFile === 'string' && opts.fromCaseFile.trim().length > 0;
      let spinner: ReturnType<typeof startProgress> = null;
      try {
        if (!useCaseFile && !opts.data) {
          throw new Error('Provide either --data <file> or --from-case-file <scenarioId>.');
        }
        if (useCaseFile && !opts.projectId) {
          throw new Error('--project-id is required when using --from-case-file.');
        }
        if (!useCaseFile && !(await checkQuota('llmCalls'))) {
          return;
        }

        spinner = startProgress(flags, useCaseFile ? 'Assembling case-file report...' : 'Generating report...');

        const report = useCaseFile
          ? await generateReportFromCaseFile({
            projectId: opts.projectId,
            scenarioId: opts.fromCaseFile,
            projectName: opts.project,
            location: opts.location,
          })
          : await (async () => {
            const data = JSON.parse(readFileSync(opts.data, 'utf-8'));
            const config = buildLLMConfig();
            return generateReport(data, {
              type: opts.type,
              projectName: opts.project,
              location: opts.location,
            }, config);
          })();

        spinner?.succeed(
          `${useCaseFile ? 'Case-file report assembled' : 'Report generated'}: ${report.sections.length} sections (${report.latencyMs}ms)`,
        );

        if (flags.json) { renderJSON(report); return; }

        const baseName = (
          opts.project
            ? opts.project.replace(/\s+/g, '_')
            : useCaseFile
              ? `${opts.projectId}_${opts.fromCaseFile}`
              : 'report'
        ).toLowerCase();
        const outputTarget = resolveStructuredOutputTarget({
          outputPath: flags.output,
          requestedFormat: opts.format,
          defaultBaseName: baseName,
        });

        if (outputTarget.warning) {
          warn(outputTarget.warning);
        }

        if (outputTarget.kind === 'pdf') {
          const buf = await renderReportAsPdf(report);
          writeFileSync(outputTarget.outputPath, buf);
        } else if (outputTarget.kind === 'docx') {
          const buf = await renderReportAsDocx(report);
          writeFileSync(outputTarget.outputPath, buf);
        } else {
          writeFileSync(outputTarget.outputPath, report.fullMarkdown);
        }

        success(`Report saved to ${outputTarget.outputPath}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Report generation failed');
        handleCommandErrorClean(err, flags, 'report_generation_failed');
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import ora from 'ora';
import chalk from 'chalk';
import {
  buildLLMConfig,
  analyzeCoreBox,
  classifyRMRFromImage,
  classifySoilFromDescription,
  interpretBoreholeLog,
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
  type AgentStep,
  type AgentSession,
  type SwarmStep,
  type SwarmSession,
} from '@geotechcli/core';
import { heading, keyValue, renderJSON, success, error, warn, renderTable } from '../ui/terminal.js';
import { addGlobalFlags, getGlobalFlags } from '../util/flags.js';

async function checkQuota(_callType: 'llmCalls' | 'visionCalls' | 'agentCalls'): Promise<boolean> {
  // Wave 1 strong-beta behavior:
  // AI calls go directly to the user's configured provider, so there is no
  // hosted quota gate at the CLI layer. Hosted anonymous GLM limits land in
  // Wave 2 once the beta proxy is enabled.
  return true;
}

function loadImageBase64(filePath: string): { base64: string; mimeType: string } {
  const buffer = readFileSync(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  };
  return {
    base64: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/png',
  };
}

function formatMaybe(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return 'Unavailable';
  return `${value}${suffix}`;
}

function renderWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  console.log(chalk.yellow('  Warnings:'));
  for (const warning of warnings) {
    console.log(chalk.yellow(`    - ${warning}`));
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

// ---------------------------------------------------------------------------
// Vision Commands
// ---------------------------------------------------------------------------

export function registerVisionCommand(program: Command): void {
  const vision = new Command('vision')
    .description('AI vision analysis for geotechnical images');

  // Core box analysis
  const coreboxCmd = new Command('corebox')
    .description('Analyze core box image → RQD, fracture spacing, weathering')
    .argument('<image>', 'Path to core box image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = flags.json ? null : ora({ text: 'Analyzing core box image...', indent: 2 }).start();
      try {
        const { base64, mimeType } = loadImageBase64(imagePath);
        const config = buildLLMConfig();
        const result = await analyzeCoreBox(base64, mimeType, config);

        spinner?.succeed(`Analysis complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Core Box Analysis');
        renderParseSafety(result);
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
        error(err instanceof Error ? err.message : String(err));
      }
    });
  addGlobalFlags(coreboxCmd);
  vision.addCommand(coreboxCmd);

  // Hybrid RMR from image
  const rmrImageCmd = new Command('rmr')
    .description('Hybrid RMR: vision extracts features → deterministic RMR scoring')
    .argument('<image>', 'Path to rock face / core image')
    .action(async (imagePath, opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('visionCalls'))) return;

      const spinner = flags.json ? null : ora({ text: 'Extracting rock mass parameters from image...', indent: 2 }).start();
      try {
        const { base64, mimeType } = loadImageBase64(imagePath);
        const config = buildLLMConfig();
        const result = await classifyRMRFromImage(base64, mimeType, config);

        spinner?.succeed(`RMR classification complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading('Hybrid RMR Classification (Vision + Deterministic)');
        renderParseSafety(result);

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
        error(err instanceof Error ? err.message : String(err));
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

      const spinner = flags.json ? null : ora({ text: 'Interpreting sensor data...', indent: 2 }).start();
      try {
        const { base64, mimeType } = loadImageBase64(imagePath);
        const config = buildLLMConfig();
        const result = await interpretSensorImage(base64, mimeType, config);

        spinner?.succeed(`Interpretation complete (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading(`Sensor Interpretation — ${result.sensorType ?? 'Unknown'}`);
        renderParseSafety(result);
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
        error(err instanceof Error ? err.message : String(err));
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

      const spinner = flags.json ? null : ora({ text: 'Extracting borehole log data...', indent: 2 }).start();
      try {
        const { base64, mimeType } = loadImageBase64(filePath);
        const config = buildLLMConfig();
        const result = await interpretBoreholeLog(base64, mimeType, config, opts.boreholeId);

        spinner?.succeed(`Extraction complete: ${result.layers.length} layers (${result.latencyMs}ms)`);

        if (flags.json) { renderJSON(result); return; }

        heading(`Borehole Log — ${result.boreholeId}`);
        renderParseSafety(result);
        keyValue('Total depth', formatMaybe(result.totalDepth, ' m'));
        keyValue('Water table', result.waterTableDepth != null ? `${result.waterTableDepth} m` : 'Not detected');

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
        error(err instanceof Error ? err.message : String(err));
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

      const spinner = flags.json ? null : ora({ text: 'Classifying soil from description...', indent: 2 }).start();
      try {
        const config = buildLLMConfig();
        const result = await classifySoilFromDescription(description, config);

        spinner?.succeed('Classification complete');

        if (flags.json) { renderJSON(result); return; }

        heading('AI Soil Classification');
        keyValue('Input', `"${description}"`);
        renderParseSafety(result);
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
        error(err instanceof Error ? err.message : String(err));
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

      const spinner = flags.json ? null : ora({ text: `Querying GBR: "${question.slice(0, 50)}..."`, indent: 2 }).start();
      try {
        const { base64, mimeType } = loadImageBase64(opts.doc);
        const config = buildLLMConfig();
        const result = await queryGBRDocument(question, base64, mimeType, config);

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
        error(err instanceof Error ? err.message : String(err));
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
    .description('Agentic AI — reasons about your problem and executes real calculations')
    .argument('<task...>', 'Engineering task in natural language')
    .option('--swarm', 'Use multi-agent swarm (Interpretation → Simulation → Reviewer)')
    .option('--project <id>', 'Load and persist context to a stored project')
    .action(async (taskParts: string[], opts) => {
      const flags = getGlobalFlags(opts);
      const task = taskParts.join(' ');
      const useSwarm = opts.swarm === true;

      if (!(await checkQuota('agentCalls'))) return;

      console.log('');
      if (useSwarm) {
        console.log(chalk.gray('  Swarm activated — Interpretation → Simulation → Reviewer'));
      } else {
        console.log(chalk.gray('  Agent activated — planning and executing...'));
      }
      console.log('');

      try {
        const config = buildLLMConfig();
        const projectState = loadProjectState(opts.project);

        if (projectState) {
          console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
          console.log('');
        }

        if (useSwarm) {
          // Multi-agent swarm mode
          const session = await runSwarm(task, config, (step) => {
            renderSwarmStep(step, flags.json, flags.quiet);
          }, projectState?.context);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'swarm', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
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
            console.log('');
            heading('Swarm Report');
            console.log(answer.content);
            console.log('');
            const toolCalls = session.steps.filter((s) => s.type === 'tool_call').length;
            const agents = [...new Set(session.steps.map((s) => s.agent))];
            console.log(chalk.gray(`  (${agents.length} agents, ${toolCalls} tools executed, review: ${session.reviewPassed ? 'PASSED' : 'ISSUES NOTED'}, ${session.totalTokens} tokens)`));
          }

          if (flags.output && answer) {
            writeFileSync(flags.output, answer.content);
            persistOutputArtifact(projectState?.id, 'swarm-report-file', 'swarm report output', flags.output, { task });
            success(`Report saved to ${flags.output}`);
          }

        } else {
          // Single-agent ReAct mode (default)
          const session = await runAgent(task, config, (step) => {
            renderAgentStep(step, flags.json, flags.quiet);
          }, projectState?.context);

          const answer = session.steps.find((s) => s.type === 'answer');
          if (projectState) {
            persistSessionToProject(projectState.id, 'single', task, session);
          }

          if (flags.json) {
            renderJSON({
              task,
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
            console.log('');
            heading('Agent Analysis');
            console.log(answer.content);
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools executed, ${session.totalTokens} tokens, ${session.totalLatencyMs}ms)`));
          }

          if (flags.output && answer) {
            writeFileSync(flags.output, answer.content);
            persistOutputArtifact(projectState?.id, 'agent-report-file', 'agent analysis output', flags.output, { task });
            success(`Report saved to ${flags.output}`);
          }
        }

        console.log('');
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
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
    .description('Interactive agentic session — type natural language, agent executes tools with memory')
    .option('--project <id>', 'Load and persist context to a stored project')
    .action(async (opts) => {
      const { createInterface } = await import('node:readline');

      console.log('');
      console.log(chalk.bold.cyan('  geotech') + chalk.bold.white('CLI') + chalk.gray(' Agent — Interactive Mode'));
      console.log(chalk.gray('  Type engineering questions. The agent will reason and execute calculations.'));
      console.log(chalk.gray('  Commands: /context (show memory), /clear (reset), /exit (quit)'));
      console.log('');

      let config;
      try {
        config = buildLLMConfig();
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return;
      }

      if (!config.apiKey) {
        warn('No API key set. Run: geotech config set llm.api_key <key>');
        warn('Or set ZHIPU_API_KEY environment variable.');
        return;
      }

      const projectState = loadProjectState(opts.project);
      if (projectState) {
        console.log(chalk.gray(`  Project context loaded: ${projectState.name} (${projectState.id})`));
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

        try {
          const session = await conversation.ask(input, config, (step) => {
            renderAgentStep(step, false, false);
          });

          if (projectState) {
            persistSessionToProject(projectState.id, 'chat', input, session);
          }

          const answer = session.steps.find((s) => s.type === 'answer');
          if (answer) {
            console.log('');
            console.log(chalk.white(answer.content));
            console.log('');
            console.log(chalk.gray(`  (${session.steps.filter((s) => s.type === 'tool_call').length} tools, ${session.totalTokens} tokens)`));
          }
        } catch (err) {
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
    .requiredOption('--data <file>', 'JSON file with analysis results')
    .option('--type <type>', 'Report type: borehole|site-investigation|tunnel-design|foundation|slope|custom', 'site-investigation')
    .option('--project <name>', 'Project name')
    .option('--location <loc>', 'Project location')
    .action(async (opts) => {
      const flags = getGlobalFlags(opts);

      if (!(await checkQuota('llmCalls'))) return;

      const spinner = flags.json ? null : ora({ text: 'Generating report...', indent: 2 }).start();
      try {
        const data = JSON.parse(readFileSync(opts.data, 'utf-8'));
        const config = buildLLMConfig();

        const report = await generateReport(data, {
          type: opts.type,
          projectName: opts.project,
          location: opts.location,
        }, config);

        spinner?.succeed(`Report generated: ${report.sections.length} sections (${report.latencyMs}ms)`);

        if (flags.json) { renderJSON(report); return; }

        const outputFile = flags.output ?? 'report.md';
        writeFileSync(outputFile, report.fullMarkdown);
        success(`Report saved to ${outputFile}`);
        console.log('');
      } catch (err) {
        spinner?.fail('Report generation failed');
        error(err instanceof Error ? err.message : String(err));
      }
    });

  addGlobalFlags(cmd);
  program.addCommand(cmd);
}

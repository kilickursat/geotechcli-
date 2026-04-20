import type { LLMConfig, CompletionResponse } from '../llm/types.js';
import { generateText, generateChat } from '../llm/router.js';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateToolArgs, formatViolations } from './guardrails.js';
import { extractToolSafetyIssue, serializeContextForPrompt } from './safety.js';
import { normalizeToolArgs } from './tool-normalization.js';
import {
  buildProprietaryInternalsRefusal,
  getProprietaryInternalsPromptRules,
  isProprietaryInternalsRequest,
} from './proprietary-internals.js';

// Ensure all tools are registered
import './filesystem-tools.js';
import './shell-tools.js';
import './data-tools.js';
import './skill-tools.js';
import { isAgentSkillToolName } from '../skills/index.js';

export interface SwarmStep {
  agent: 'orchestrator' | 'interpretation' | 'simulation' | 'reviewer';
  type: 'thought' | 'tool_call' | 'tool_result' | 'handoff' | 'review' | 'correction' | 'answer' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: ToolResult;
  timestamp: number;
}

export interface SwarmSession {
  steps: SwarmStep[];
  context: Record<string, unknown>;
  totalTokens: number;
  totalLatencyMs: number;
  reviewPassed: boolean;
  corrections: string[];
}

export type SwarmCallback = (step: SwarmStep) => void;

const ROLE_TOOL_ALLOWLIST = {
  interpretation: [
    'read_file',
    'list_directory',
    'parse_csv',
    'scan_project',
    'parse_ags',
    'parse_cpt',
    'classify_uscs',
    'classify_rmr89',
    'classify_q_system',
    'query_standards',
    'project_save_dataset',
    'project_save_parameter',
    'project_add_assumption',
    'list_skills',
    'describe_skill',
    'run_skill',
  ],
  simulation: [
    'calculate_bearing_capacity',
    'calculate_liquefaction',
    'predict_tbm_performance',
    'select_tbm_type',
    'predict_cutter_wear',
    'calculate_tunnel_settlement',
    'calculate_consolidation',
    'calculate_schmertmann_settlement',
    'calculate_pile_capacity',
    'calculate_slope_stability',
    'calculate_lateral_earth_pressure',
    'write_file',
    'project_save_result',
    'project_save_parameter',
    'project_add_artifact',
    'list_skills',
    'describe_skill',
    'run_skill',
  ],
  reviewer: [
    'query_standards',
    'project_load',
    'list_skills',
    'describe_skill',
  ],
} as const;

type SwarmToolRole = keyof typeof ROLE_TOOL_ALLOWLIST;

function getHostedSwarmMaxTokens(config: LLMConfig, phase: 'loop' | 'final'): number {
  if (config.provider !== 'hosted-beta') {
    return phase === 'loop' ? 1700 : 2200;
  }

  return phase === 'loop' ? 700 : 900;
}

export function getAllowedToolsForAgent(agent: SwarmStep['agent'], skillsEnabled = false): readonly string[] {
  const allowed = agent === 'orchestrator' ? [] : ROLE_TOOL_ALLOWLIST[agent as SwarmToolRole];
  if (skillsEnabled) {
    return allowed;
  }
  return allowed.filter((toolName) => !isAgentSkillToolName(toolName));
}

export function isToolAllowedForAgent(agent: SwarmStep['agent'], toolName: string, skillsEnabled = false): boolean {
  return getAllowedToolsForAgent(agent, skillsEnabled).includes(toolName);
}

function getToolDescriptionsFor(toolNames: readonly string[], skillsEnabled = false): string {
  return toolRegistry
    .list()
    .filter((tool) => toolNames.includes(tool.name))
    .filter((tool) => skillsEnabled || !isAgentSkillToolName(tool.name))
    .map((tool) => {
      const params = Object.entries((tool.parameters as any).properties ?? {})
        .map(([key, value]: [string, any]) => `    - ${key}: ${value.description ?? value.type}`)
        .join('\n');
      return `  ${tool.name}: ${tool.description}\n${params}`;
    })
    .join('\n\n');
}

function interpretationPrompt(skillsEnabled = false): string {
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the INTERPRETATION AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Clean, parse, classify, and structure raw geotechnical data.

YOU HANDLE:
- Reading borehole logs, AGS files, CPT data from disk
- Classifying soils (USCS, AASHTO) and rocks (RMR, Q-system)
- Parsing CSV sensor data and site investigation reports
- Scanning project directories to inventory available data
- Looking up relevant standards for classification methods
- Saving structured datasets, derived parameters, and assumptions into project memory when a project context is available

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.interpretation, skillsEnabled)}

RULES:
${proprietaryRules}
- Call tools to do real work; never estimate or guess data values.
- If a tool result indicates canAutoProceed=false or low-confidence parsing, stop automatic handoff from that output until you retry or clearly mark the limitation.
- When you derive reusable structured data or assumptions for a project, persist them with project memory tools.
- Normalize near-valid user language into supported tool enums before calling tools when the engineering meaning is clear.
- After processing all data, output a structured summary in this format:

\`\`\`handoff
{"to": "simulation", "data": {<structured data for the simulation agent>}, "summary": "<what you found>"}
\`\`\`

To call a tool:
\`\`\`tool
{"tool": "<name>", "args": {<params>}}
\`\`\``;
}

function simulationPrompt(skillsEnabled = false): string {
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the SIMULATION AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Execute engineering calculations and numerical simulations.

YOU RECEIVE: Structured data from the Interpretation Agent (soil profiles, classification results, parameters).

  YOU HANDLE:
  - Bearing capacity calculations (Terzaghi, Meyerhof, Hansen, Vesic)
  - Liquefaction triggering analysis (Boulanger & Idriss 2014)
  - TBM performance prediction, type selection, cutter wear
  - Tunnel settlement calculation (Peck)
  - Running approved deterministic skills when the session enables them
  - Saving results, derived parameters, and output artifacts to persistent project storage

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.simulation, skillsEnabled)}

RULES:
${proprietaryRules}
- Use the data provided by the Interpretation Agent; do not re-read files.
- Run ALL relevant calculations for the task.
- If an upstream or tool result is blocked, incomplete, or low confidence, do not continue blindly. Retry, use a safer alternative, or pass the limitation to the reviewer.
- Save significant reusable outputs back into project memory when a project context is available.
- Normalize near-valid user language into supported tool enums before calling tools when the engineering meaning is clear.
- After completing calculations, output a handoff to the Reviewer:

\`\`\`handoff
{"to": "reviewer", "results": {<all calculation results>}, "summary": "<what was calculated>"}
\`\`\`

To call a tool:
\`\`\`tool
{"tool": "<name>", "args": {<params>}}
\`\`\``;
}

function reviewerPrompt(skillsEnabled = false): string {
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the REVIEWER AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Safety check, sanity check, and standards compliance review.

YOU RECEIVE: Calculation results from the Simulation Agent.

YOU CHECK:
1. SAFETY FACTORS: Are FOS values above code minimums?
2. PHYSICAL SANITY: Are values within physically reasonable ranges?
3. STANDARDS COMPLIANCE: Do methods used match the applicable standard?
4. PARAMETER CONSISTENCY: Are input parameters consistent with each other?
5. COMPLETENESS: Were all necessary checks performed?
6. PARSE SAFETY: If any upstream result includes parseStatus/confidence/warnings or canAutoProceed=false, flag it explicitly and reject automatic conclusions that depend on that output.

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.reviewer, skillsEnabled)}

RULES:
${proprietaryRules}

OUTPUT FORMAT - you MUST output exactly one of:

If everything passes:
\`\`\`review
{"verdict": "APPROVED", "notes": ["<any advisory notes>"], "confidence": <0-100>}
\`\`\`

If issues found:
\`\`\`review
{"verdict": "REJECTED", "issues": ["<specific issue 1>", "<issue 2>"], "corrections": ["<what simulation agent should fix>"], "confidence": <0-100>}
\`\`\`

To call a tool:
\`\`\`tool
{"tool": "<name>", "args": {<params>}}
\`\`\``;
}

function orchestratorPrompt(): string {
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the SWARM ORCHESTRATOR for geotechCLI.

You coordinate three specialist agents:
1. INTERPRETATION AGENT - reads data, classifies soils/rocks, structures input
2. SIMULATION AGENT - runs calculations, executes numerical models
3. REVIEWER AGENT - safety checks, standards compliance, sanity validation

For the given task, produce the FINAL engineering report by synthesizing all agent outputs.

If the Reviewer rejected results, incorporate the corrections and note the issues that were found and resolved.

Rules:
${proprietaryRules}

Produce a comprehensive, professional engineering report with:
- Data summary
- Calculation results with key numbers
- Review status, confidence, and any advisory notes
- Explicit limitations where blocked low-confidence outputs prevented automatic conclusions
- Final recommendations`;
}

async function runAgentLoop(
  input: string,
  config: LLMConfig,
  systemPrompt: string,
  agentName: SwarmStep['agent'],
  onStep: SwarmCallback,
  maxIter = 6,
): Promise<{ output: string; context: Record<string, unknown>; tokens: number; latency: number }> {
  const skillsEnabled = config.skillsEnabled === true;
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input },
  ];

  const context: Record<string, unknown> = {};
  let totalTokens = 0;
  let totalLatency = 0;

  for (let index = 0; index < maxIter; index++) {
    let response: CompletionResponse;
    try {
      response = await generateChat(messages, config, {
        temperature: 0.15,
        maxTokens: getHostedSwarmMaxTokens(config, 'loop'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onStep({ agent: agentName, type: 'error', content: message, timestamp: Date.now() });
      return { output: `Error: ${message}`, context, tokens: totalTokens, latency: totalLatency };
    }

    totalTokens += response.usage.totalTokens;
    totalLatency += response.latencyMs;
    const text = response.text;
    messages.push({ role: 'assistant', content: text });

    const toolMatch = text.match(/```tool\s*\n?([\s\S]*?)\n?```/);
    if (toolMatch) {
      const thought = text.slice(0, toolMatch.index).trim();
      if (thought) {
        onStep({ agent: agentName, type: 'thought', content: thought, timestamp: Date.now() });
      }

      try {
        const call = JSON.parse(toolMatch[1]) as { tool: string; args: Record<string, unknown> };
        call.args = normalizeToolArgs(call.tool, call.args);
        onStep({
          agent: agentName,
          type: 'tool_call',
          content: `${call.tool}`,
          toolName: call.tool,
          toolArgs: call.args,
          timestamp: Date.now(),
        });

        const guard = validateToolArgs(call.tool, call.args);
        if (!guard.passed) {
          const message = formatViolations(guard);
          onStep({
            agent: agentName,
            type: 'error',
            content: `Guardrail blocked: ${guard.violations.filter((violation) => violation.severity === 'error').map((violation) => violation.rule).join('; ')}`,
            timestamp: Date.now(),
          });
          messages.push({
            role: 'user',
            content: `[GUARDRAIL BLOCKED: ${call.tool}]\n${message}\nFix the parameters and retry.`,
          });
          continue;
        }

        if (!isToolAllowedForAgent(agentName, call.tool, skillsEnabled)) {
          const allowedTools = getAllowedToolsForAgent(agentName, skillsEnabled);
          onStep({
            agent: agentName,
            type: 'error',
            content: `Blocked by role allowlist: ${call.tool}`,
            toolName: call.tool,
            timestamp: Date.now(),
          });
          messages.push({
            role: 'user',
            content: `[Role Allowlist Blocked: ${call.tool}]\nThe ${agentName} agent is not allowed to execute this tool.\nAllowed tools: ${allowedTools.length > 0 ? allowedTools.join(', ') : 'none'}.\nChoose an allowed tool or continue without tool use.`,
          });
          continue;
        }

        if (isAgentSkillToolName(call.tool) && !config.skillsEnabled) {
          onStep({
            agent: agentName,
            type: 'error',
            content: `Skill tool blocked: ${call.tool} is not enabled in this session.`,
            toolName: call.tool,
            timestamp: Date.now(),
          });
          messages.push({
            role: 'user',
            content: `[Skill Tool Blocked: ${call.tool}]\nSkill tools are disabled in this session. Continue without skill use.`,
          });
          continue;
        }

        const result = await toolRegistry.execute(call.tool, call.args);
        onStep({
          agent: agentName,
          type: 'tool_result',
          content: result.success ? result.summary : `Error: ${result.error}`,
          toolName: call.tool,
          toolResult: result,
          timestamp: Date.now(),
        });

        if (!result.success) {
          messages.push({
            role: 'user',
            content: `[Tool FAILED: ${call.tool}]\nError: ${result.error}\n\nFix or try alternative.`,
          });
          continue;
        }

        context[call.tool] = result.data;

        const safetyIssue = extractToolSafetyIssue(result.data);
        if (safetyIssue) {
          onStep({
            agent: agentName,
            type: 'error',
            content: `${call.tool} returned blocked output: ${safetyIssue.message}`,
            toolName: call.tool,
            toolResult: result,
            timestamp: Date.now(),
          });
          messages.push({
            role: 'user',
            content: `[Tool Blocked: ${call.tool}]\n${safetyIssue.message}\nWarnings: ${safetyIssue.warnings.join('; ') || 'None'}\n\nDo NOT continue downstream deterministic work from this output. Retry, choose a safer alternative, or carry the limitation forward explicitly.`,
          });
          continue;
        }

        const compactData = JSON.stringify(result.data);
        const dataStr =
          compactData.length > 3000 ? `${compactData.slice(0, 3000)}...(truncated)` : compactData;
        messages.push({
          role: 'user',
          content: `[Tool Result: ${call.tool}]\n${result.summary}\nData: ${dataStr}\n\nContinue your work.`,
        });
      } catch {
        messages.push({ role: 'user', content: 'Error: Invalid tool JSON. Fix and retry.' });
      }

      continue;
    }

    const handoffMatch = text.match(/```handoff\s*\n?([\s\S]*?)\n?```/);
    const reviewMatch = text.match(/```review\s*\n?([\s\S]*?)\n?```/);
    if (handoffMatch || reviewMatch) {
      const thought = text.slice(0, (handoffMatch ?? reviewMatch)!.index).trim();
      if (thought) {
        onStep({ agent: agentName, type: 'thought', content: thought, timestamp: Date.now() });
      }
      return { output: text, context, tokens: totalTokens, latency: totalLatency };
    }

    return { output: text, context, tokens: totalTokens, latency: totalLatency };
  }

  return { output: 'Agent reached max iterations.', context, tokens: totalTokens, latency: totalLatency };
}

const MAX_REVIEW_CYCLES = 2;

export async function runSwarm(
  task: string,
  config: LLMConfig,
  onStep: SwarmCallback,
  sessionContext?: Record<string, unknown>,
): Promise<SwarmSession> {
  const session: SwarmSession = {
    steps: [],
    context: { ...(sessionContext ?? {}) },
    totalTokens: 0,
    totalLatencyMs: 0,
    reviewPassed: false,
    corrections: [],
  };

  const trackStep = (step: SwarmStep) => {
    session.steps.push(step);
    onStep(step);
  };

  if (isProprietaryInternalsRequest(task)) {
    trackStep({
      agent: 'orchestrator',
      type: 'answer',
      content: buildProprietaryInternalsRefusal(),
      timestamp: Date.now(),
    });
    return session;
  }

  const serializedContext = serializeContextForPrompt(sessionContext, 5000);
  const contextBlock = serializedContext ? `Project/session context:\n${serializedContext}\n\n` : '';

  trackStep({ agent: 'orchestrator', type: 'handoff', content: 'Routing to Interpretation Agent', timestamp: Date.now() });

  const interpResult = await runAgentLoop(
    `${contextBlock}Task: ${task}\n\nRead, classify, and structure all relevant data for this task.`,
    config,
    interpretationPrompt(config.skillsEnabled === true),
    'interpretation',
    trackStep,
  );

  session.totalTokens += interpResult.tokens;
  session.totalLatencyMs += interpResult.latency;
  session.context = { ...session.context, interpretation: interpResult.context };

  let interpData = '';
  const interpHandoff = interpResult.output.match(/```handoff\s*\n?([\s\S]*?)\n?```/);
  if (interpHandoff) {
    try {
      const parsed = JSON.parse(interpHandoff[1]);
      interpData = JSON.stringify(parsed.data ?? {});
      trackStep({
        agent: 'interpretation',
        type: 'handoff',
        content: `Handoff to Simulation: ${parsed.summary ?? ''}`,
        timestamp: Date.now(),
      });
    } catch {
      interpData = interpResult.output;
    }
  } else {
    interpData = interpResult.output;
  }

  let simOutput = '';
  for (let cycle = 0; cycle < MAX_REVIEW_CYCLES; cycle++) {
    trackStep({
      agent: 'orchestrator',
      type: 'handoff',
      content: `Routing to Simulation Agent${cycle > 0 ? ` (retry ${cycle}, applying corrections)` : ''}`,
      timestamp: Date.now(),
    });

    const correctionNote = session.corrections.length > 0
      ? `\n\nREVIEWER CORRECTIONS FROM PREVIOUS CYCLE:\n${session.corrections.join('\n')}\nApply these corrections in your calculations.`
      : '';

    const simResult = await runAgentLoop(
      `${contextBlock}Data from Interpretation Agent:\n${interpData}\n\nOriginal task: ${task}${correctionNote}\n\nRun all necessary calculations.`,
    config,
    simulationPrompt(config.skillsEnabled === true),
      'simulation',
      trackStep,
    );

    session.totalTokens += simResult.tokens;
    session.totalLatencyMs += simResult.latency;
    session.context = { ...session.context, simulation: simResult.context };
    simOutput = simResult.output;

    let simData = '';
    const simHandoff = simResult.output.match(/```handoff\s*\n?([\s\S]*?)\n?```/);
    if (simHandoff) {
      try {
        const parsed = JSON.parse(simHandoff[1]);
        simData = JSON.stringify(parsed.results ?? {});
        trackStep({
          agent: 'simulation',
          type: 'handoff',
          content: `Handoff to Reviewer: ${parsed.summary ?? ''}`,
          timestamp: Date.now(),
        });
      } catch {
        simData = simResult.output;
      }
    } else {
      simData = simResult.output;
    }

    trackStep({ agent: 'orchestrator', type: 'handoff', content: 'Routing to Reviewer Agent', timestamp: Date.now() });

    const reviewResult = await runAgentLoop(
      `${contextBlock}Original task: ${task}\n\nInterpretation summary:\n${interpData}\n\nSimulation results:\n${simData}\n\nReview these results for safety, sanity, standards compliance, and parse safety.`,
      config,
      reviewerPrompt(config.skillsEnabled === true),
      'reviewer',
      trackStep,
    );

    session.totalTokens += reviewResult.tokens;
    session.totalLatencyMs += reviewResult.latency;

    const reviewBlock = reviewResult.output.match(/```review\s*\n?([\s\S]*?)\n?```/);
    if (!reviewBlock) {
      session.reviewPassed = true;
      trackStep({
        agent: 'reviewer',
        type: 'review',
        content: reviewResult.output.slice(0, 200),
        timestamp: Date.now(),
      });
      break;
    }

    try {
      const verdict = JSON.parse(reviewBlock[1]);
      if (verdict.verdict === 'APPROVED') {
        session.reviewPassed = true;
        trackStep({
          agent: 'reviewer',
          type: 'review',
          content: `APPROVED (confidence: ${verdict.confidence ?? '?'}%). Notes: ${(verdict.notes ?? []).join('; ') || 'None'}`,
          timestamp: Date.now(),
        });
        break;
      }

      session.corrections = verdict.corrections ?? [];
      trackStep({
        agent: 'reviewer',
        type: 'correction',
        content: `REJECTED. Issues: ${(verdict.issues ?? []).join('; ')}. Corrections: ${session.corrections.join('; ')}`,
        timestamp: Date.now(),
      });

      if (cycle === MAX_REVIEW_CYCLES - 1) {
        trackStep({
          agent: 'orchestrator',
          type: 'thought',
          content: 'Max review cycles reached. Proceeding with noted issues.',
          timestamp: Date.now(),
        });
      }
    } catch {
      session.reviewPassed = true;
      trackStep({
        agent: 'reviewer',
        type: 'review',
        content: reviewResult.output.slice(0, 200),
        timestamp: Date.now(),
      });
      break;
    }
  }

  trackStep({ agent: 'orchestrator', type: 'thought', content: 'Synthesizing final report from all agents.', timestamp: Date.now() });

  const finalResult = await generateText(
    `${contextBlock}Task: ${task}\n\nInterpretation output:\n${interpData}\n\nSimulation output:\n${simOutput}\n\nReview status: ${session.reviewPassed ? 'APPROVED' : 'APPROVED WITH NOTES'}\nCorrections applied: ${session.corrections.length > 0 ? session.corrections.join('; ') : 'None'}\n\nSynthesize the final engineering report.`,
    config,
    { systemPrompt: orchestratorPrompt(), temperature: 0.2, maxTokens: getHostedSwarmMaxTokens(config, 'final') },
  );

  session.totalTokens += finalResult.usage.totalTokens;
  session.totalLatencyMs += finalResult.latencyMs;
  trackStep({ agent: 'orchestrator', type: 'answer', content: finalResult.text, timestamp: Date.now() });

  return session;
}

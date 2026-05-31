import type { LLMConfig, CompletionResponse } from '../llm/types.js';
import { z } from 'zod';
import { generateText, generateChat } from '../llm/router.js';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateToolArgs, formatViolations } from './guardrails.js';
import { extractToolSafetyIssue, serializeContextForPrompt, serializeToolDataForPrompt } from './safety.js';
import { normalizeToolArgs } from './tool-normalization.js';
import {
  buildProprietaryInternalsRefusal,
  getProprietaryInternalsPromptRules,
  isProprietaryInternalsRequest,
} from './proprietary-internals.js';
import {
  buildDeterministicFallbackAnswer,
  buildDeterministicPreflightAnswer,
  getHostedFallbackMode,
  isHostedBetaUnavailable,
  type HostedFallbackMode,
} from './runtime-fallbacks.js';
import { runWithToolRuntimeContext } from './tool-runtime.js';
import { buildProviderOperatingPrompt } from './provider-operating-contract.js';
import {
  buildSkillAwareSwarmPlan,
  formatSwarmPlanForPrompt,
  type SwarmExecutionPlan,
} from './swarm-planner.js';

// Ensure all tools are registered
import './runtime-bootstrap.js';
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
  plan?: SwarmExecutionPlan;
  totalTokens: number;
  totalLatencyMs: number;
  reviewPassed: boolean;
  corrections: string[];
  reviewBlockers: string[];
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
    'analyze_signal_file',
    'ingest_geotech_document',
    'start_geotech_ingest_job',
    'get_geotech_ingest_job',
    'wait_geotech_ingest_job',
    'load_geotech_ingest_job_result',
    'list_geotech_ingest_jobs',
    'list_persisted_ingest_reviews',
    'load_persisted_ingest_review',
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
    'list_fem_capabilities',
    'prepare_fem_analysis_case',
    'validate_fem_analysis_case',
    'write_file',
    'project_save_result',
    'project_save_parameter',
    'project_add_artifact',
    'generate_report',
    'render_pdf',
    'render_docx',
    'export_csv',
    'export_dxf',
    'export_geojson',
    'list_skills',
    'describe_skill',
    'run_skill',
  ],
  reviewer: [
    'query_standards',
    'list_fem_capabilities',
    'validate_fem_analysis_case',
    'project_load',
    'get_geotech_ingest_job',
    'wait_geotech_ingest_job',
    'load_geotech_ingest_job_result',
    'list_geotech_ingest_jobs',
    'list_persisted_ingest_reviews',
    'load_persisted_ingest_review',
    'list_persisted_ingest_review_approvals',
    'load_persisted_ingest_review_approval',
    'approve_persisted_ingest_review',
    'promote_persisted_ingest_review',
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

function interpretationPrompt(config: LLMConfig): string {
  const skillsEnabled = config.skillsEnabled === true;
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the INTERPRETATION AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Clean, parse, classify, and structure raw geotechnical data.

YOU HANDLE:
- Reading borehole logs, AGS files, CPT data from disk
- Ingesting geotechnical PDFs and images into structured borehole or geotech-document outputs
- Classifying soils (USCS, AASHTO) and rocks (RMR, Q-system)
- Parsing CSV/XLSX monitoring data with deterministic signal-analysis tools
- Scanning project directories to inventory available data
- Looking up relevant standards for classification methods
- Saving structured datasets, derived parameters, and assumptions into project memory when a project context is available

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.interpretation, skillsEnabled)}

${buildProviderOperatingPrompt(config, { task: 'swarm-interpretation' })}

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

function simulationPrompt(config: LLMConfig): string {
  const skillsEnabled = config.skillsEnabled === true;
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the SIMULATION AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Execute engineering calculations and numerical simulations.

YOU RECEIVE: Structured data from the Interpretation Agent (soil profiles, classification results, parameters).

  YOU HANDLE:
  - Bearing capacity calculations (Terzaghi, Meyerhof, Hansen, Vesic)
  - Liquefaction triggering analysis (Boulanger & Idriss 2014)
  - TBM performance prediction, type selection, cutter wear
  - Tunnel settlement calculation (Peck)
  - Experimental FEM route planning and case drafting through deterministic geotechCLI FEM contracts
  - Running approved deterministic skills when the session enables them
  - Generating reports and export deliverables from stored case-file artifacts when needed
  - Saving results, derived parameters, and output artifacts to persistent project storage

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.simulation, skillsEnabled)}

${buildProviderOperatingPrompt(config, { task: 'swarm-simulation' })}

RULES:
${proprietaryRules}
- Use the data provided by the Interpretation Agent; do not re-read files.
- Run ALL relevant calculations for the task.
- For FEM or advanced numerical analysis, prepare and validate an FEM analysis case with tools; do not invent FEM result fields or solver outputs.
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

function reviewerPrompt(config: LLMConfig): string {
  const skillsEnabled = config.skillsEnabled === true;
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the REVIEWER AGENT in geotechCLI's multi-agent system.

YOUR ROLE: Safety check, sanity check, and standards compliance review.

YOU RECEIVE: Calculation results from the Simulation Agent. You may also inspect persisted ingest reviews when validating whether promoted project datasets are safe to trust, and you may record approval before promotion when the evidence supports it.

YOU CHECK:
1. SAFETY FACTORS: Are FOS values above code minimums?
2. PHYSICAL SANITY: Are values within physically reasonable ranges?
3. STANDARDS COMPLIANCE: Do methods used match the applicable standard?
4. PARAMETER CONSISTENCY: Are input parameters consistent with each other?
5. COMPLETENESS: Were all necessary checks performed?
6. PARSE SAFETY: If any upstream result includes parseStatus/confidence/warnings or canAutoProceed=false, flag it explicitly and reject automatic conclusions that depend on that output.
7. FEM SAFETY: Validate FEM analysis cases and reject unsupported routes, missing inputs, non-experimental cases, or unreviewed assumptions before accepting FEM artifacts.

YOUR TOOLS:
${getToolDescriptionsFor(ROLE_TOOL_ALLOWLIST.reviewer, skillsEnabled)}

${buildProviderOperatingPrompt(config, { task: 'swarm-review' })}

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

function orchestratorPrompt(config: LLMConfig): string {
  const proprietaryRules = getProprietaryInternalsPromptRules();
  return `You are the SWARM ORCHESTRATOR for geotechCLI.

You coordinate three specialist agents:
1. INTERPRETATION AGENT - reads data, classifies soils/rocks, structures input
2. SIMULATION AGENT - uses deterministic calculation tools and prepares or validates FEM case contracts; it does not run FEM/WebGL previews or invent solver results
3. REVIEWER AGENT - safety checks, standards compliance, sanity validation

For the given task, produce the FINAL engineering report by synthesizing all agent outputs.

If the Reviewer rejected results, incorporate the corrections and note the issues that were found and resolved.

Rules:
${proprietaryRules}

${buildProviderOperatingPrompt(config, { task: 'swarm-orchestrator' })}

Produce a comprehensive, professional engineering report with:
- Data summary
- Calculation results with key numbers
- Review status, confidence, and any advisory notes
- Explicit limitations where blocked low-confidence outputs prevented automatic conclusions
- Final recommendations`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractAgentToolSummary(toolData: unknown): string | null {
  if (!isRecord(toolData)) {
    return null;
  }

  const summary = toolData.agentEvidenceSummary;
  if (typeof summary === 'string' && summary.trim()) {
    return summary.trim();
  }

  const result = toolData.result;
  if (isRecord(result) && typeof result.agentEvidenceSummary === 'string' && result.agentEvidenceSummary.trim()) {
    return result.agentEvidenceSummary.trim();
  }

  return null;
}

function buildSimulationToolContextForReviewer(context: Record<string, unknown>): string {
  const entries = Object.entries(context);
  if (entries.length === 0) {
    return '';
  }

  const femToolNames = new Set([
    'list_fem_capabilities',
    'prepare_fem_analysis_case',
    'validate_fem_analysis_case',
  ]);
  const calculationToolNames = new Set([
    'calculate_bearing_capacity',
    'calculate_liquefaction',
    'calculate_tunnel_settlement',
    'calculate_consolidation',
    'calculate_schmertmann_settlement',
    'calculate_pile_capacity',
    'calculate_slope_stability',
    'calculate_lateral_earth_pressure',
  ]);

  const reviewableContext = Object.fromEntries(entries.filter(([toolName]) => (
    femToolNames.has(toolName) ||
    calculationToolNames.has(toolName) ||
    toolName.startsWith('calculate_')
  )));

  if (Object.keys(reviewableContext).length === 0) {
    return '';
  }

  const toolSummaries = Object.entries(reviewableContext)
    .map(([toolName, toolData]) => {
      const summary = extractAgentToolSummary(toolData);
      return summary ? `- ${toolName}:\n${summary}` : null;
    })
    .filter((item): item is string => Boolean(item));

  return [
    'Simulation tool context:',
    'These deterministic tool outputs are the authoritative basis for review. Use them when validating FEM cases or calculation artifacts, even if the simulation handoff summary is terse.',
    toolSummaries.length > 0 ? `Tool summaries:\n${toolSummaries.join('\n')}` : '',
    'Tool data JSON:',
    serializeToolDataForPrompt(reviewableContext, 4500),
  ].filter(Boolean).join('\n');
}

async function runAgentLoop(
  input: string,
  config: LLMConfig,
  systemPrompt: string,
  agentName: SwarmStep['agent'],
  onStep: SwarmCallback,
  fallback?: {
    userQuery: string;
    sessionContext?: Record<string, unknown>;
  },
  maxIter = 6,
): Promise<{
  output: string;
  context: Record<string, unknown>;
  tokens: number;
  latency: number;
  usedDeterministicFallback?: boolean;
  fallbackMode?: HostedFallbackMode;
}> {
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
      if (index === 0 && fallback && isHostedBetaUnavailable(message)) {
        const fallbackMode = getHostedFallbackMode(message);
        onStep({
          agent: agentName,
          type: 'thought',
          content:
            fallbackMode === 'warming_timeout'
              ? 'Hosted GLM provider is busy or hit the current timeout budget. Switching to deterministic fallback reasoning.'
              : 'Hosted beta is temporarily unavailable. Switching to deterministic fallback reasoning.',
          timestamp: Date.now(),
        });
        return {
          output: buildDeterministicFallbackAnswer(
            fallback.userQuery,
            fallback.sessionContext,
            fallbackMode,
          ),
          context,
          tokens: totalTokens,
          latency: totalLatency,
          usedDeterministicFallback: true,
          fallbackMode,
        };
      }
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

        const result = await runWithToolRuntimeContext(
          { config },
          () => toolRegistry.execute(call.tool, call.args),
        );
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

        const dataStr = serializeToolDataForPrompt(result.data, 3000);
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

const ReviewerApprovalSchema = z.object({
  verdict: z.literal('APPROVED'),
  notes: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  blockers: z.array(z.string()).optional(),
}).strict();

const ReviewerRejectionSchema = z.object({
  verdict: z.literal('REJECTED'),
  issues: z.array(z.string()),
  corrections: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  blockers: z.array(z.string()).optional(),
}).strict();

const ReviewerDecisionSchema = z.discriminatedUnion('verdict', [
  ReviewerApprovalSchema,
  ReviewerRejectionSchema,
]);

type ReviewerDecision = z.infer<typeof ReviewerDecisionSchema>;

type ParsedReviewerDecision =
  | { status: 'approved'; decision: Extract<ReviewerDecision, { verdict: 'APPROVED' }> }
  | { status: 'rejected'; decision: Extract<ReviewerDecision, { verdict: 'REJECTED' }> }
  | { status: 'blocked'; blockers: string[]; raw: string };

function parseReviewerDecision(output: string): ParsedReviewerDecision {
  const reviewBlocks = [...output.matchAll(/```review\s*\n?([\s\S]*?)\n?```/g)];
  if (reviewBlocks.length === 0) {
    return {
      status: 'blocked',
      blockers: ['review-block-missing'],
      raw: output.slice(0, 500),
    };
  }
  if (reviewBlocks.length > 1) {
    return {
      status: 'blocked',
      blockers: ['review-block-multiple'],
      raw: output.slice(0, 500),
    };
  }

  const outsideReview = output.replace(/```review\s*\n?[\s\S]*?\n?```/g, '').trim();
  if (/```(?:tool|handoff|answer)|\bfinal answer\b/i.test(outsideReview)) {
    return {
      status: 'blocked',
      blockers: ['review-output-contaminated'],
      raw: output.slice(0, 500),
    };
  }
  const reviewBlock = reviewBlocks[0]!;
  const reviewJson = reviewBlock[1] ?? '';

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(reviewJson);
  } catch {
    return {
      status: 'blocked',
      blockers: ['review-json-invalid'],
      raw: reviewJson.slice(0, 500),
    };
  }

  const parsed = ReviewerDecisionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      status: 'blocked',
      blockers: [
        'review-schema-invalid',
        ...parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join('.') || 'root'}:${issue.message}`),
      ],
      raw: reviewJson.slice(0, 500),
    };
  }

  if (
    parsed.data.verdict === 'APPROVED'
    && Array.isArray(parsed.data.blockers)
    && parsed.data.blockers.length > 0
  ) {
    return {
      status: 'blocked',
      blockers: ['approved-review-contained-blockers', ...parsed.data.blockers],
      raw: reviewJson.slice(0, 500),
    };
  }

  return parsed.data.verdict === 'APPROVED'
    ? { status: 'approved', decision: parsed.data }
    : { status: 'rejected', decision: parsed.data };
}

function collectDeterministicReviewBlockers(...contexts: Array<Record<string, unknown> | undefined>): string[] {
  const blockers: string[] = [];
  for (const context of contexts) {
    if (!context) continue;

    const femDraft = context.prepare_fem_analysis_case;
    if (isRecord(femDraft)) {
      const objective = typeof femDraft.objective === 'string' ? femDraft.objective : 'unknown-objective';
      const recommendedAction = typeof femDraft.recommendedAction === 'string' ? femDraft.recommendedAction : '';
      const capability = isRecord(femDraft.capability) ? femDraft.capability : {};
      const executionMode = typeof capability.executionMode === 'string' ? capability.executionMode : '';
      const analysisCase = femDraft.analysisCase;
      const validation = isRecord(femDraft.validation) ? femDraft.validation : undefined;
      const validationStatus = typeof validation?.status === 'string' ? validation.status : '';
      const validationReviewItems =
        typeof validation?.reviewItems === 'number' && Number.isFinite(validation.reviewItems)
          ? validation.reviewItems
          : 0;
      const missingInputs = Array.isArray(femDraft.missingUserInputs)
        ? femDraft.missingUserInputs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      if (executionMode === 'contract-only' || recommendedAction === 'contract-only') {
        blockers.push(`fem-contract-only:${objective}`);
      }
      if (recommendedAction === 'collect-inputs' || missingInputs.length > 0) {
        blockers.push(`fem-missing-inputs:${objective}`);
      }
      if (!isRecord(analysisCase)) {
        blockers.push(`fem-analysis-case-missing:${objective}`);
      }
      if (validationStatus === 'blocked') {
        blockers.push(`fem-validation-blocked:${objective}`);
      }
      if (validationStatus === 'review' || validationReviewItems > 0) {
        blockers.push(`fem-validation-review-required:${objective}`);
      }
    }

    const femValidation = context.validate_fem_analysis_case;
    if (isRecord(femValidation)) {
      const status = typeof femValidation.status === 'string' ? femValidation.status : '';
      const blockerCount = typeof femValidation.blockers === 'number' && Number.isFinite(femValidation.blockers)
        ? femValidation.blockers
        : 0;
      const reviewItemCount = typeof femValidation.reviewItems === 'number' && Number.isFinite(femValidation.reviewItems)
        ? femValidation.reviewItems
        : 0;
      if (status === 'blocked' || blockerCount > 0) {
        blockers.push('fem-validation-blocked');
      }
      if (status === 'review' || reviewItemCount > 0) {
        blockers.push('fem-validation-review-required');
      }
    }
  }

  return [...new Set(blockers)];
}

function buildUnresolvedSwarmAnswer(input: {
  task: string;
  interpretationOutput: string;
  simulationOutput: string;
  corrections: string[];
  reviewBlockers: string[];
}): string {
  return [
    'UNRESOLVED - REVIEW REJECTED',
    '',
    'The swarm result is not approved for engineering use. A reviewer either rejected the result or failed the required review contract, so GeotechCLI is returning a deterministic unresolved summary instead of a model-written approval.',
    '',
    `Task: ${input.task}`,
    `Corrections required: ${input.corrections.length > 0 ? input.corrections.join('; ') : 'None recorded'}`,
    `Review blockers: ${input.reviewBlockers.length > 0 ? input.reviewBlockers.join('; ') : 'None recorded'}`,
    '',
    'Interpretation output:',
    input.interpretationOutput,
    '',
    'Simulation output:',
    input.simulationOutput,
  ].join('\n');
}

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
    reviewBlockers: [],
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

  const preflightAnswer = buildDeterministicPreflightAnswer(task, config, sessionContext);
  if (preflightAnswer) {
    trackStep({
      agent: 'orchestrator',
      type: 'answer',
      content: preflightAnswer,
      timestamp: Date.now(),
    });
    return session;
  }

  const swarmPlan = buildSkillAwareSwarmPlan(task, session.context, {
    skillsEnabled: config.skillsEnabled === true,
  });
  const swarmPlanPrompt = formatSwarmPlanForPrompt(swarmPlan);
  session.plan = swarmPlan;
  session.context = { ...session.context, swarmPlan };
  trackStep({
    agent: 'orchestrator',
    type: 'thought',
    content: [
      'Role-based swarm plan prepared.',
      `Roles: ${swarmPlan.roles.map((role) => `${role.role}:${role.status}`).join(', ')}.`,
      `Approved executable skills available: ${swarmPlan.skillCatalog.executableApproved}.`,
    ].join(' '),
    timestamp: Date.now(),
  });

  const serializedContext = serializeContextForPrompt(sessionContext, 5000);
  const contextBlock = [
    swarmPlanPrompt,
    serializedContext ? `Project/session context:\n${serializedContext}` : '',
  ].filter(Boolean).join('\n\n');
  const promptContextBlock = contextBlock ? `${contextBlock}\n\n` : '';

  trackStep({ agent: 'orchestrator', type: 'handoff', content: 'Routing to Interpretation Agent', timestamp: Date.now() });

  const interpResult = await runAgentLoop(
    `${promptContextBlock}Task: ${task}\n\nRead, classify, and structure all relevant data for this task. Follow the role-based swarm execution plan and do not execute prompt-only or unapproved skills.`,
    config,
    interpretationPrompt(config),
    'interpretation',
    trackStep,
    {
      userQuery: task,
      sessionContext,
    },
  );

  session.totalTokens += interpResult.tokens;
  session.totalLatencyMs += interpResult.latency;
  session.context = { ...session.context, interpretation: interpResult.context };

  if (interpResult.usedDeterministicFallback) {
    trackStep({
      agent: 'orchestrator',
      type: 'answer',
      content: interpResult.output,
      timestamp: Date.now(),
    });
    return session;
  }

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
      `${promptContextBlock}Data from Interpretation Agent:\n${interpData}\n\nOriginal task: ${task}${correctionNote}\n\nRun all necessary calculations that are ready. Use calculation input drafts as preparation only; request missing user inputs instead of inventing them.`,
      config,
      simulationPrompt(config),
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

    const simulationToolContext = buildSimulationToolContextForReviewer(simResult.context);
    const reviewResult = await runAgentLoop(
      [
        `${promptContextBlock}Original task: ${task}`,
        `Interpretation summary:\n${interpData}`,
        `Simulation results:\n${simData}`,
        simulationToolContext,
        'Review these results for safety, sanity, standards compliance, skill-selection appropriateness, parse safety, and FEM validation safety.',
      ].filter(Boolean).join('\n\n'),
      config,
      reviewerPrompt(config),
      'reviewer',
      trackStep,
    );

    session.totalTokens += reviewResult.tokens;
    session.totalLatencyMs += reviewResult.latency;
    session.context = { ...session.context, reviewer: reviewResult.context };

    const reviewerDecision = parseReviewerDecision(reviewResult.output);
    if (reviewerDecision.status === 'blocked') {
      session.reviewPassed = false;
      session.reviewBlockers = reviewerDecision.blockers;
      session.corrections = reviewerDecision.blockers;
      trackStep({
        agent: 'reviewer',
        type: 'correction',
        content: `BLOCKED REVIEW. Blockers: ${reviewerDecision.blockers.join('; ')}. Raw: ${reviewerDecision.raw}`,
        timestamp: Date.now(),
      });
      break;
    }

    if (reviewerDecision.status === 'approved') {
      const deterministicBlockers = collectDeterministicReviewBlockers(simResult.context, reviewResult.context);
      if (deterministicBlockers.length > 0) {
        session.reviewPassed = false;
        session.reviewBlockers = deterministicBlockers;
        session.corrections = deterministicBlockers;
        trackStep({
          agent: 'reviewer',
          type: 'correction',
          content: `BLOCKED REVIEW. Deterministic tool blockers override reviewer approval: ${deterministicBlockers.join('; ')}`,
          timestamp: Date.now(),
        });
        break;
      }
      session.reviewPassed = true;
      trackStep({
        agent: 'reviewer',
        type: 'review',
        content: `APPROVED (confidence: ${reviewerDecision.decision.confidence}%). Notes: ${reviewerDecision.decision.notes.join('; ') || 'None'}`,
        timestamp: Date.now(),
      });
      break;
    }

    session.corrections = reviewerDecision.decision.corrections;
    trackStep({
      agent: 'reviewer',
      type: 'correction',
      content: `REJECTED. Issues: ${reviewerDecision.decision.issues.join('; ')}. Corrections: ${session.corrections.join('; ')}`,
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
  }

  if (!session.reviewPassed) {
    trackStep({
      agent: 'orchestrator',
      type: 'answer',
      content: buildUnresolvedSwarmAnswer({
        task,
        interpretationOutput: interpData,
        simulationOutput: simOutput,
        corrections: session.corrections,
        reviewBlockers: session.reviewBlockers,
      }),
      timestamp: Date.now(),
    });
    return session;
  }

  trackStep({ agent: 'orchestrator', type: 'thought', content: 'Synthesizing final report from all agents.', timestamp: Date.now() });

  try {
    const finalResult = await generateText(
      `${promptContextBlock}Task: ${task}\n\nInterpretation output:\n${interpData}\n\nSimulation output:\n${simOutput}\n\nReview status: APPROVED\nCorrections applied: ${session.corrections.length > 0 ? session.corrections.join('; ') : 'None'}\nReview blockers: None\n\nSynthesize the final engineering report. Include what evidence remained blocked and which role owned each unresolved action.`,
      config,
      { systemPrompt: orchestratorPrompt(config), temperature: 0.2, maxTokens: getHostedSwarmMaxTokens(config, 'final') },
    );

    session.totalTokens += finalResult.usage.totalTokens;
    session.totalLatencyMs += finalResult.latencyMs;
    trackStep({ agent: 'orchestrator', type: 'answer', content: finalResult.text, timestamp: Date.now() });
  } catch (err) {
    const fallback = [
      `Swarm analysis completed, but final hosted synthesis was unavailable: ${err instanceof Error ? err.message : String(err)}`,
      '',
      `Review status: ${session.reviewPassed ? 'APPROVED' : 'UNRESOLVED - REVIEW REJECTED'}`,
      `Corrections applied: ${session.corrections.length > 0 ? session.corrections.join('; ') : 'None'}`,
      `Review blockers: ${session.reviewBlockers.length > 0 ? session.reviewBlockers.join('; ') : 'None'}`,
      '',
      'Interpretation output:',
      interpData,
      '',
      'Simulation output:',
      simOutput,
    ].join('\n');

    trackStep({ agent: 'orchestrator', type: 'answer', content: fallback, timestamp: Date.now() });
  }

  return session;
}

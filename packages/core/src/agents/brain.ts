import type { LLMConfig, CompletionResponse } from '../llm/types.js';
import { generateChat } from '../llm/router.js';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateToolArgs, formatViolations } from './guardrails.js';
import { extractToolSafetyIssue, serializeContextForPrompt } from './safety.js';
import { normalizeToolArgs } from './tool-normalization.js';
import {
  buildGeotechnicalFallbackAnswer,
  buildGeotechnicalPreflightAnswer,
} from './intake.js';

// Side-effect imports: these files register tools into the shared registry
import './filesystem-tools.js';
import './bridge-tools.js';
import './data-tools.js';
import './deliverable-tools.js';
import './skill-tools.js';
import { isAgentSkillToolName } from '../skills/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentStep {
  type: 'thought' | 'tool_call' | 'tool_result' | 'answer' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: ToolResult;
  timestamp: number;
}

export interface AgentSession {
  steps: AgentStep[];
  context: Record<string, unknown>;
  totalTokens: number;
  totalLatencyMs: number;
}

export type AgentCallback = (step: AgentStep) => void;

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getHostedAgentMaxTokens(config: LLMConfig, phase: 'loop' | 'final'): number {
  if (config.provider !== 'hosted-beta') {
    return phase === 'loop' ? 1600 : 1800;
  }

  return phase === 'loop' ? 700 : 900;
}

function isHostedBetaUnavailable(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('provider is busy') ||
    normalized.includes('rate limit') ||
    normalized.includes('timed out') ||
    normalized.includes('upstream request failed') ||
    normalized.includes('retry in about') ||
    normalized.includes('hosted beta ai request failed') ||
    normalized.includes('hosted beta upstream returned no content') ||
    normalized.includes('empty completion') ||
    normalized.includes('fetch failed')
  );
}

type HostedFallbackMode = 'temporary' | 'warming_timeout';

function getHostedFallbackMode(message: string): HostedFallbackMode {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('timed out') ||
    normalized.includes('timeout budget') ||
    normalized.includes('warming up') ||
    normalized.includes('modal.com gpu')
  ) {
    return 'warming_timeout';
  }
  return 'temporary';
}

function extractNumericValue(query: string, pattern: RegExp): number | null {
  const match = query.match(pattern);
  return match ? Number(match[1]) : null;
}

function extractStoryCount(query: string): number | null {
  const match = query.match(/(\d+)\s*-\s*story|(\d+)\s*story|(\d+)\s*-\s*storey|(\d+)\s*storey/i);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3] ?? match[4];
  return value ? Number(value) : null;
}

function hasProjectContextData(sessionContext?: Record<string, unknown>): boolean {
  return Boolean(sessionContext && Object.keys(sessionContext).length > 0);
}

function hasFoundationScreeningIntent(query: string): boolean {
  return /(foundation|footing|raft|mat foundation|spread footing|pile|caisson|shallow foundation|deep foundation)/i.test(query);
}

function hasClassificationIntent(query: string): boolean {
  return /(classify|classification|soil profile|uscs)/i.test(query);
}

function hasActionableSoilData(query: string): boolean {
  return /(?:\bspt\b|\bcpt\b|\bn[- ]?value\b|\bn60\b|\bn160\b|\bqc\b|\bfs\b|\bu2\b|\bborehole\b|\bags\b|grain size|liquid limit|plastic limit|plasticity|atterberg|water table|groundwater|\bdepth\b|\blayer\b|\bstratum\b|\bcu\b|\bsu\b|\bphi\b|φ|friction angle|cohesion|unit weight|\bgamma\b|bearing capacity|settlement|\bclay\b|\bsilt\b|\bsand\b|\bgravel\b|\bpeat\b|\brock\b)/i.test(query);
}

function buildFoundationDataRequestAnswer(userQuery: string): string {
  const storyCount = extractStoryCount(userQuery);
  const buildingLabel = storyCount != null ? `${storyCount}-story` : 'proposed';

  return [
    `A defensible soil classification and foundation recommendation for a ${buildingLabel} building needs site investigation data first.`,
    '',
    'Provide at least:',
    '- Borehole or CPT profile with layer depths and descriptions',
    '- SPT N-values or CPT qc/fs/u2 values by depth',
    '- Grain size distribution and/or Atterberg limits for USCS classification',
    '- Groundwater depth',
    '- Approximate column loads or footing / raft loading',
    '',
    'Once you have that, geotechCLI can proceed with deterministic steps:',
    '- `classify_uscs` for soil classification',
    '- `calculate_bearing_capacity` for shallow foundation screening',
    '- `calculate_pile_capacity` if deep foundations are being considered',
    '',
    'If you already have borehole data, rerun the agent with the key numbers or attach an `.ags` / `.csv` file path.',
  ].join('\n');
}

function buildDeterministicPreflightAnswer(
  userQuery: string,
  config: LLMConfig,
  sessionContext?: Record<string, unknown>,
): string | null {
  return buildGeotechnicalPreflightAnswer(userQuery, config, sessionContext);
}

function buildDeterministicFallbackAnswer(
  userQuery: string,
  sessionContext?: Record<string, unknown>,
  mode: HostedFallbackMode = 'temporary',
): string {
  const normalized = userQuery.toLowerCase();
  const fallbackLead =
    mode === 'warming_timeout'
      ? 'Hosted model on Modal.com GPU is warming up or exceeded the current timeout budget, so the agent switched to deterministic fallback reasoning instead of returning no analysis.'
      : 'Hosted beta was temporarily unavailable, so the agent switched to deterministic fallback reasoning instead of returning no analysis.';

  const intakeFallback = buildGeotechnicalFallbackAnswer(userQuery, sessionContext);
  if (intakeFallback) {
    return intakeFallback;
  }

  if (/(tbm|epb|slurry|shield|tunnel boring)/.test(normalized)) {
    const rpm = extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*rpm/);
    const thrust = extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*k\s*n/);
    const diameter =
      extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*m\s*(?:diameter|tbm|tunnel)/) ??
      extractNumericValue(normalized, /(\d+(?:\.\d+)?)\s*m\b/);
    const hasSoftGround = /(clay|silt|sand|soft ground|soft soil)/.test(normalized);
    const hasRockInputs = /(ucs|rqd|cai|joint spacing|jointspacing)/.test(normalized);

    const lines = [
      fallbackLead,
      '',
      'Engineering assessment:',
    ];

    if (hasSoftGround || normalized.includes('epb')) {
      lines.push('- The ground description points to soft-ground tunnelling, so EPB remains the appropriate screening-level machine class.');
    }
    if (rpm != null) {
      lines.push(`- Provided cutterhead speed: ${rpm} rpm.`);
    }
    if (thrust != null) {
      lines.push(`- Provided thrust: ${thrust} kN.`);
    }

    lines.push('');
    lines.push('Deterministic limitation:');

    if (diameter == null) {
      lines.push('- Tunnel / TBM diameter is not provided, which is required for any defensible advance-rate estimate.');
    }
    if (hasSoftGround && !hasRockInputs) {
      lines.push('- The current built-in TBM performance engine in geotechCLI is a rock disc-cutter model requiring diameter, UCS, and RQD-type inputs. It does not yet include a validated EPB-in-clay penetration model.');
    } else if (!hasRockInputs) {
      lines.push('- The current built-in TBM performance engine needs rock-mechanics inputs such as UCS and RQD before it can calculate penetration rate.');
    }
    lines.push('- RPM and thrust alone are not sufficient for a validated penetration-rate calculation in soft ground without diameter plus material/operational parameters.');
    lines.push('');
    lines.push('Next best deterministic path in geotechCLI:');
    lines.push('- Use `geotech tunnel tbm-select --diameter <m> --ground soft_ground` for a machine-class recommendation.');
    lines.push('- Use `geotech tunnel tbm-predict --diameter <m> --ucs <MPa> --rqd <percent> ...` only for the existing rock-TBM predictor.');
    lines.push('- If you want EPB soft-ground penetration screening in-clay, that needs a new validated deterministic model to be added to the toolset.');

    return lines.join('\n');
  }

  return [
    mode === 'warming_timeout'
      ? 'Hosted model on Modal.com GPU is warming up or exceeded the current timeout budget, and this request does not currently have a direct deterministic fallback in geotechCLI.'
      : 'Hosted beta was temporarily unavailable, and this request does not currently have a direct deterministic fallback in geotechCLI.',
    'Retry shortly, or reformulate the task as one of the built-in deterministic commands so the CLI can continue without the hosted model.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildCompactSystemPrompt(skillsEnabled = false): string {
  const tools = toolRegistry
    .list()
    .filter((tool) => skillsEnabled || !isAgentSkillToolName(tool.name))
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `You are geotechCLI Agent, a geotechnical engineering assistant that must use real tools for calculations.

Available tools:
${tools}

Tool call format:
\`\`\`tool
{"tool":"<tool_name>","args":{...}}
\`\`\`

Rules:
- Use tools for calculations instead of inventing numbers.
- Keep assumptions brief and explicit when inputs are incomplete.
- Interpret tool outputs in engineering terms with units.
- If a tool result is blocked, low confidence, or canAutoProceed=false, do not continue blindly.
- When finished, provide a concise engineering answer in prose with key results, assumptions, and recommendations.
- Do not output a tool call in the final answer.`;
}

function buildSystemPrompt(config?: LLMConfig): string {
  if (config?.provider === 'hosted-beta') {
    return buildCompactSystemPrompt(config.skillsEnabled === true);
  }

  const skillsEnabled = config?.skillsEnabled === true;
  const toolDescriptions = toolRegistry
    .list()
    .filter((tool) => skillsEnabled || !isAgentSkillToolName(tool.name))
    .map((tool) => {
      const params = Object.entries(
        (tool.parameters as any).properties ?? {},
      )
        .map(([k, v]: [string, any]) => {
          const req = ((tool.parameters as any).required ?? []).includes(k) ? ' (required)' : ' (optional)';
          return `    - ${k}: ${v.description ?? v.type}${req}`;
        })
        .join('\n');
      return `  ${tool.name}: ${tool.description}\n${params}`;
    })
    .join('\n\n');

  return `You are geotechCLI Agent, an expert geotechnical engineering AI that solves problems by EXECUTING real calculations, not just describing them.

## YOUR TOOLS
You have access to the following deterministic computation engines. These produce REAL engineering results with validated formulas:

${toolDescriptions}

## HOW TO USE TOOLS
To call a tool, output EXACTLY this JSON block (no other text before or after it on that line):
\`\`\`tool
{"tool": "<tool_name>", "args": {<arguments as JSON>}}
\`\`\`

You will receive the tool's result immediately. Then you MUST reason about the result before deciding what to do next.

## WORKFLOW (ReAct Pattern)
For every request, follow this loop:

1. THINK: Analyze what the user needs. What calculations are required? What data do you have? What assumptions are needed?
2. ACT: Call the appropriate tool with the right parameters.
3. OBSERVE: Read the tool's result carefully. Extract key values.
4. REASON: Interpret the result in engineering context. Is the value acceptable? Does it trigger additional checks?
5. REPEAT or ANSWER: If more calculations are needed, go back to step 2. Otherwise, provide your final answer.

## RULES
- ALWAYS use tools for calculations. Never invent numbers or estimate what a formula would produce.
- If the user provides incomplete data, state your assumptions clearly before calling tools.
- Chain multiple tools when engineering judgment requires it.
- Reference actual standards: Terzaghi, Meyerhof, Bieniawski, Barton, Boulanger & Idriss, etc.
- Report tool results with proper units and significant figures.
- If a tool returns parseStatus/confidence metadata with canAutoProceed=false, treat it as blocked evidence. Do not continue downstream deterministic calculations from it until you retry, request better input, or explain the limitation.
- Normalize near-valid natural language inputs into the closest supported engineering enum before calling a tool. Example: "mixed face" should map to the TBM ground type "mixed".
- When the analysis is complete, provide a clear engineering recommendation with supporting numbers.

## FINAL ANSWER
When you have completed all necessary calculations and reasoning, provide your final answer as clear prose. Do NOT output a tool call in your final answer. Include:
- Summary of all calculations performed (with key numbers)
- Engineering interpretation
- Recommendations with supporting evidence
- Any limitations or assumptions made`;
}

// ---------------------------------------------------------------------------
// Context window management
// ---------------------------------------------------------------------------

const COMPRESS_THRESHOLD = 40_000;

function totalChars(messages: ConversationMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function compressMessages(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length <= 4) return messages;

  const system = messages[0];
  const userQuery = messages[1];
  const keepLast = 4;
  const tail = messages.slice(-keepLast);
  const middle = messages.slice(2, -keepLast);

  if (middle.length === 0) return messages;

  const summaryParts: string[] = [];
  for (const message of middle) {
    if (message.role === 'user' && message.content.startsWith('[Tool Result:')) {
      const lines = message.content.split('\n');
      const toolName = lines[0].replace('[Tool Result: ', '').replace(']', '');
      const summaryLine = lines[1] ?? '';
      summaryParts.push(`${toolName}: ${summaryLine}`);
      continue;
    }

    if (message.role === 'user' && message.content.startsWith('[GUARDRAIL BLOCKED:')) {
      summaryParts.push(message.content.split('\n')[0]);
      continue;
    }

    if (message.role === 'user' && message.content.startsWith('[Tool Blocked:')) {
      summaryParts.push(message.content.split('\n')[0]);
    }
  }

  return [
    system,
    userQuery,
    {
      role: 'user',
      content: `[Context summary - ${summaryParts.length} prior tool exchanges compressed]\n${summaryParts.join('\n')}\n\nContinue your analysis based on these results and the most recent exchange.`,
    },
    ...tail,
  ];
}

// ---------------------------------------------------------------------------
// Agent Brain
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 8;

export async function runAgent(
  userQuery: string,
  config: LLMConfig,
  onStep: AgentCallback,
  sessionContext?: Record<string, unknown>,
): Promise<AgentSession> {
  const session: AgentSession = {
    steps: [],
    context: { ...(sessionContext ?? {}) },
    totalTokens: 0,
    totalLatencyMs: 0,
  };

  const preflightAnswer = buildDeterministicPreflightAnswer(userQuery, config, sessionContext);
  if (preflightAnswer) {
    const answerStep: AgentStep = {
      type: 'answer',
      content: preflightAnswer,
      timestamp: Date.now(),
    };
    session.steps.push(answerStep);
    onStep(answerStep);
    return session;
  }

  const messages: ConversationMessage[] = [
    { role: 'system', content: buildSystemPrompt(config) },
  ];

  const serializedContext = serializeContextForPrompt(sessionContext);
  const userContent = serializedContext
    ? `[Prior session context]\n${serializedContext}\n\nCurrent request: ${userQuery}`
    : userQuery;
  messages.push({ role: 'user', content: userContent });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (totalChars(messages) > COMPRESS_THRESHOLD) {
      const compressed = compressMessages(messages);
      messages.length = 0;
      messages.push(...compressed);
    }

    let response: CompletionResponse;
    try {
      response = await generateChat(messages, config, {
        temperature: 0.2,
        maxTokens: getHostedAgentMaxTokens(config, 'loop'),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (iteration === 0 && isHostedBetaUnavailable(errMsg)) {
        const fallbackMode = getHostedFallbackMode(errMsg);
        const fallbackThought: AgentStep = {
          type: 'thought',
          content:
            fallbackMode === 'warming_timeout'
              ? 'Hosted model on Modal.com GPU is warming up or hit the current timeout budget. Switching to deterministic fallback reasoning.'
              : 'Hosted beta is temporarily unavailable. Switching to deterministic fallback reasoning.',
          timestamp: Date.now(),
        };
        session.steps.push(fallbackThought);
        onStep(fallbackThought);

        const fallbackAnswer: AgentStep = {
          type: 'answer',
          content: buildDeterministicFallbackAnswer(userQuery, sessionContext, fallbackMode),
          timestamp: Date.now(),
        };
        session.steps.push(fallbackAnswer);
        onStep(fallbackAnswer);
        break;
      }

      const step: AgentStep = {
        type: 'error',
        content: `LLM error: ${errMsg}`,
        timestamp: Date.now(),
      };
      session.steps.push(step);
      onStep(step);
      break;
    }

    session.totalTokens += response.usage.totalTokens;
    session.totalLatencyMs += response.latencyMs;

    const llmOutput = response.text;
    messages.push({ role: 'assistant', content: llmOutput });

    const toolCallMatch = llmOutput.match(/```tool\s*\n?([\s\S]*?)\n?```/);
    if (!toolCallMatch) {
      const answerStep: AgentStep = {
        type: 'answer',
        content: llmOutput,
        timestamp: Date.now(),
      };
      session.steps.push(answerStep);
      onStep(answerStep);
      break;
    }

    const textBeforeTool = llmOutput.slice(0, toolCallMatch.index).trim();
    if (textBeforeTool) {
      const thoughtStep: AgentStep = {
        type: 'thought',
        content: textBeforeTool,
        timestamp: Date.now(),
      };
      session.steps.push(thoughtStep);
      onStep(thoughtStep);
    }

    let toolCall: { tool: string; args: Record<string, unknown> };
    try {
      toolCall = JSON.parse(toolCallMatch[1]);
      toolCall.args = normalizeToolArgs(toolCall.tool, toolCall.args);
    } catch {
      const errStep: AgentStep = {
        type: 'error',
        content: 'Failed to parse tool call JSON. Retrying...',
        timestamp: Date.now(),
      };
      session.steps.push(errStep);
      onStep(errStep);

      messages.push({
        role: 'user',
        content: 'Invalid tool call JSON. Output the tool call as valid JSON inside ```tool blocks.',
      });
      continue;
    }

    const callStep: AgentStep = {
      type: 'tool_call',
      content: `Calling ${toolCall.tool}`,
      toolName: toolCall.tool,
      toolArgs: toolCall.args,
      timestamp: Date.now(),
    };
    session.steps.push(callStep);
    onStep(callStep);

    if (isAgentSkillToolName(toolCall.tool) && !config.skillsEnabled) {
      const blockedStep: AgentStep = {
        type: 'error',
        content: `Skill tool blocked: ${toolCall.tool} is not enabled in this session.`,
        toolName: toolCall.tool,
        timestamp: Date.now(),
      };
      session.steps.push(blockedStep);
      onStep(blockedStep);

      messages.push({
        role: 'user',
        content: `[Tool Blocked: ${toolCall.tool}]\nSkill tools are disabled in this session. Continue without skill use or explain the limitation.`,
      });
      continue;
    }

    const guardrailCheck = validateToolArgs(toolCall.tool, toolCall.args);
    if (!guardrailCheck.passed) {
      const violationText = formatViolations(guardrailCheck);
      const guardStep: AgentStep = {
        type: 'error',
        content: `Guardrail blocked ${toolCall.tool}: ${guardrailCheck.violations.filter((violation) => violation.severity === 'error').map((violation) => violation.rule).join('; ')}`,
        toolName: toolCall.tool,
        timestamp: Date.now(),
      };
      session.steps.push(guardStep);
      onStep(guardStep);

      messages.push({
        role: 'user',
        content: `[GUARDRAIL BLOCKED: ${toolCall.tool}]\n${violationText}\n\nYour tool call was BLOCKED because parameters violate physical or engineering constraints. Read the corrections above and call the tool again with fixed parameters.`,
      });
      continue;
    }

    if (guardrailCheck.violations.length > 0) {
      const warnStep: AgentStep = {
        type: 'thought',
        content: `Guardrail warnings: ${guardrailCheck.violations.map((violation) => violation.rule).join('; ')}`,
        timestamp: Date.now(),
      };
      session.steps.push(warnStep);
      onStep(warnStep);
    }

    const result = await toolRegistry.execute(toolCall.tool, toolCall.args);
    if (!result.success) {
      const errorStep: AgentStep = {
        type: 'error',
        content: `Tool failed: ${result.error}`,
        toolName: toolCall.tool,
        toolResult: result,
        timestamp: Date.now(),
      };
      session.steps.push(errorStep);
      onStep(errorStep);

      messages.push({
        role: 'user',
        content: `[Tool FAILED: ${toolCall.tool}]\nError: ${result.error}\n\nThe tool execution failed. Either:\n1. Fix the parameters and retry\n2. Try an alternative approach\n3. If unrecoverable, explain the limitation in your final answer`,
      });
      continue;
    }

    const resultStep: AgentStep = {
      type: 'tool_result',
      content: result.summary,
      toolName: toolCall.tool,
      toolResult: result,
      timestamp: Date.now(),
    };
    session.steps.push(resultStep);
    onStep(resultStep);

    session.context[toolCall.tool] = result.data;

    const safetyIssue = extractToolSafetyIssue(result.data);
    if (safetyIssue) {
      const blockedStep: AgentStep = {
        type: 'error',
        content: `${toolCall.tool} returned blocked output: ${safetyIssue.message}`,
        toolName: toolCall.tool,
        toolResult: result,
        timestamp: Date.now(),
      };
      session.steps.push(blockedStep);
      onStep(blockedStep);

      messages.push({
        role: 'user',
        content: `[Tool Blocked: ${toolCall.tool}]\n${safetyIssue.message}\nWarnings: ${safetyIssue.warnings.join('; ') || 'None'}\n\nDo NOT continue downstream deterministic calculations from this output. Retry with better inputs, ask the user for clarification, or explain the limitation in your final answer.`,
      });
      continue;
    }

    const compactData = JSON.stringify(result.data);
    const dataStr =
      compactData.length > 3000 ? `${compactData.slice(0, 3000)}...(truncated)` : compactData;

    messages.push({
      role: 'user',
      content: `[Tool Result: ${toolCall.tool}]\n${result.summary}\nData: ${dataStr}\n\nAnalyze this result. Do you need more calculations, or can you provide the final answer?`,
    });
  }

  if (session.steps.length > 0 && session.steps[session.steps.length - 1].type !== 'answer') {
    messages.push({
      role: 'user',
      content: 'You have used all available iterations. Provide your final engineering answer now based on all tool results gathered so far. Do NOT call any more tools.',
    });

    try {
      const finalResponse = await generateChat(messages, config, {
        temperature: 0.2,
        maxTokens: getHostedAgentMaxTokens(config, 'final'),
      });

      session.totalTokens += finalResponse.usage.totalTokens;
      session.totalLatencyMs += finalResponse.latencyMs;

      const finalStep: AgentStep = {
        type: 'answer',
        content: finalResponse.text,
        timestamp: Date.now(),
      };
      session.steps.push(finalStep);
      onStep(finalStep);
    } catch {
      const summaryStep: AgentStep = {
        type: 'answer',
        content:
          'Agent reached maximum iterations. Results collected:\n' +
          session.steps
            .filter((step) => step.type === 'tool_result' && step.toolResult?.success)
            .map((step) => `- ${step.content}`)
            .join('\n'),
        timestamp: Date.now(),
      };
      session.steps.push(summaryStep);
      onStep(summaryStep);
    }
  }

  return session;
}

// ---------------------------------------------------------------------------
// Convenience: run with session memory
// ---------------------------------------------------------------------------

export class AgentConversation {
  private context: Record<string, unknown> = {};
  private history: AgentSession[] = [];

  constructor(options?: { context?: Record<string, unknown>; history?: AgentSession[] }) {
    this.context = { ...(options?.context ?? {}) };
    this.history = [...(options?.history ?? [])];
  }

  async ask(
    query: string,
    config: LLMConfig,
    onStep: AgentCallback,
  ): Promise<AgentSession> {
    const session = await runAgent(query, config, onStep, this.context);
    this.context = { ...this.context, ...session.context };
    this.history.push(session);
    return session;
  }

  hydrate(options: { context?: Record<string, unknown>; history?: AgentSession[] }): void {
    this.context = { ...(options.context ?? {}) };
    this.history = [...(options.history ?? [])];
  }

  replaceContext(context: Record<string, unknown>): void {
    this.context = { ...context };
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  getHistory(): AgentSession[] {
    return [...this.history];
  }

  clearContext(): void {
    this.context = {};
  }
}

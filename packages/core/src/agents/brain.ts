import type { LLMConfig, CompletionResponse } from '../llm/types.js';
import { generateChat } from '../llm/router.js';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateToolArgs, formatViolations } from './guardrails.js';
import {
  buildBlockedFemProductionOverclaimAnswer,
  extractToolSafetyIssue,
  serializeContextForPrompt,
  serializeToolDataForPrompt,
} from './safety.js';
import { normalizeToolArgs } from './tool-normalization.js';
import { runWithToolRuntimeContext } from './tool-runtime.js';
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
} from './runtime-fallbacks.js';
import { buildProviderOperatingPrompt } from './provider-operating-contract.js';

// Side-effect imports: these files register tools into the shared registry
import './runtime-bootstrap.js';
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

export interface AgentRunOptions {
  allowedTools?: readonly string[];
  systemPromptSuffix?: string;
  disableDeterministicPreflight?: boolean;
  requiredToolsBeforeFinal?: readonly string[];
}

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

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function visibleTools(config?: LLMConfig, options: AgentRunOptions = {}) {
  const skillsEnabled = config?.skillsEnabled === true;
  const allowed = options.allowedTools ? new Set(options.allowedTools) : undefined;
  return toolRegistry
    .list()
    .filter((tool) => (skillsEnabled || !isAgentSkillToolName(tool.name)) && (!allowed || allowed.has(tool.name)));
}

function isToolAllowedByRunOptions(toolName: string, options: AgentRunOptions = {}): boolean {
  return !options.allowedTools || options.allowedTools.includes(toolName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function preparedFemCaseFromContext(session: AgentSession): Record<string, unknown> | null {
  const draft = session.context.prepare_fem_analysis_case;
  if (!isRecord(draft)) return null;

  const analysisCase = draft.analysisCase;
  return isRecord(analysisCase) ? analysisCase : null;
}

function missingRequiredToolsForFinal(session: AgentSession, options: AgentRunOptions): string[] {
  return (options.requiredToolsBeforeFinal ?? [])
    .filter((toolName) => session.context[toolName] == null);
}

function pushRequiredToolsBlockedAnswer(
  session: AgentSession,
  onStep: AgentCallback,
  missingRequiredTools: readonly string[],
): void {
  const answerStep: AgentStep = {
    type: 'answer',
    content:
      `Cannot complete this scoped agent task because required tool(s) did not run: ${missingRequiredTools.join(', ')}. ` +
      'No FEM draft, validation, or result should be treated as complete until the required deterministic tool output appears in the agent trace.',
    timestamp: Date.now(),
  };
  session.steps.push(answerStep);
  onStep(answerStep);
}

function formatRequiredToolsPromptRule(options: AgentRunOptions): string {
  const requiredTools = options.requiredToolsBeforeFinal ?? [];
  if (requiredTools.length === 0) return '';
  return `\n- Required scoped tool(s) before final answer: ${requiredTools.join(', ')}. Call these missing required tool(s) before validating, summarizing, or finalizing; do not claim they ran unless they appear in tool results.`;
}

function buildCompactSystemPrompt(config?: LLMConfig, options: AgentRunOptions = {}): string {
  const tools = visibleTools(config, options)
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');
  const proprietaryRules = getProprietaryInternalsPromptRules();
  const requiredToolsRule = formatRequiredToolsPromptRule(options);
  const suffix = options.systemPromptSuffix ? `\n${options.systemPromptSuffix}` : '';

  return `You are geotechCLI Agent, a geotechnical engineering assistant that must use real tools for calculations.

Available tools:
${tools}

Tool call format:
\`\`\`tool
{"tool":"<tool_name>","args":{...}}
\`\`\`

Rules:
${proprietaryRules}
${config ? buildProviderOperatingPrompt(config, { task: 'single-agent', compact: true }) : ''}
- Use tools for calculations instead of inventing numbers.
- Keep assumptions brief and explicit when inputs are incomplete.
- Interpret tool outputs in engineering terms with units.
- If a tool result is blocked, low confidence, or canAutoProceed=false, do not continue blindly.
- If a draft tool is required for this scoped task, call the draft tool before validation.
- When finished, provide a concise engineering answer in prose with key results, assumptions, and recommendations.
- Do not output a tool call in the final answer.${requiredToolsRule}${suffix}`;
}

function buildSystemPrompt(config?: LLMConfig, options: AgentRunOptions = {}): string {
  if (config?.provider === 'hosted-beta') {
    return buildCompactSystemPrompt(config, options);
  }

  const proprietaryRules = getProprietaryInternalsPromptRules();
  const toolDescriptions = visibleTools(config, options)
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
  const requiredToolsRule = formatRequiredToolsPromptRule(options);
  const suffix = options.systemPromptSuffix ? `\n${options.systemPromptSuffix}` : '';

  return `You are geotechCLI Agent, an expert geotechnical engineering AI that solves problems by EXECUTING real calculations, not just describing them.

## YOUR TOOLS
You have access to the following deterministic computation engines. These produce REAL engineering results with validated formulas:

${toolDescriptions}

${config ? buildProviderOperatingPrompt(config, { task: 'single-agent' }) : ''}

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
${proprietaryRules}
- ALWAYS use tools for calculations. Never invent numbers or estimate what a formula would produce.
- If the user provides incomplete data, state your assumptions clearly before calling tools.
- Chain multiple tools when engineering judgment requires it.
- Reference actual standards: Terzaghi, Meyerhof, Bieniawski, Barton, Boulanger & Idriss, etc.
- Report tool results with proper units and significant figures.
- If a tool returns parseStatus/confidence metadata with canAutoProceed=false, treat it as blocked evidence. Do not continue downstream deterministic calculations from it until you retry, request better input, or explain the limitation.
- If a draft tool is required for this scoped task, call the draft tool before validation.
- Normalize near-valid natural language inputs into the closest supported engineering enum before calling a tool. Example: "mixed face" should map to the TBM ground type "mixed".
- When the analysis is complete, provide a clear engineering recommendation with supporting numbers.
- Do not claim a required scoped tool ran unless it appears in the tool results.${requiredToolsRule}

## FINAL ANSWER
When you have completed all necessary calculations and reasoning, provide your final answer as clear prose. Do NOT output a tool call in your final answer. Include:
- Summary of all calculations performed (with key numbers)
- Engineering interpretation
- Recommendations with supporting evidence
- Any limitations or assumptions made${suffix}`;
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
  options: AgentRunOptions = {},
): Promise<AgentSession> {
  const session: AgentSession = {
    steps: [],
    context: { ...(sessionContext ?? {}) },
    totalTokens: 0,
    totalLatencyMs: 0,
  };

  if (isProprietaryInternalsRequest(userQuery)) {
    const refusalStep: AgentStep = {
      type: 'answer',
      content: buildProprietaryInternalsRefusal(),
      timestamp: Date.now(),
    };
    session.steps.push(refusalStep);
    onStep(refusalStep);
    return session;
  }

  const preflightAnswer = options.disableDeterministicPreflight
    ? null
    : buildDeterministicPreflightAnswer(userQuery, config, sessionContext);
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
    { role: 'system', content: buildSystemPrompt(config, options) },
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
              ? 'Hosted GLM provider is busy or hit the current timeout budget. Switching to deterministic fallback reasoning.'
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
      const missingRequiredTools = missingRequiredToolsForFinal(session, options);
      if (missingRequiredTools.length > 0) {
        const requiredStep: AgentStep = {
          type: 'error',
          content: `Final answer blocked until required scoped tool(s) run: ${missingRequiredTools.join(', ')}`,
          timestamp: Date.now(),
        };
        session.steps.push(requiredStep);
        onStep(requiredStep);

        if (iteration >= MAX_ITERATIONS - 1) {
          pushRequiredToolsBlockedAnswer(session, onStep, missingRequiredTools);
          break;
        }

        messages.push({
          role: 'user',
          content: `[Required Tool Missing]\nBefore finalizing this scoped agent task, call the required tool(s): ${missingRequiredTools.join(', ')}. Do not claim they ran unless they appear in the tool results.`,
        });
        continue;
      }
      const blockedFemOverclaimAnswer = buildBlockedFemProductionOverclaimAnswer(llmOutput, session.context);
      if (blockedFemOverclaimAnswer) {
        const blockedStep: AgentStep = {
          type: 'error',
          content: 'Final answer blocked because it contradicted deterministic FEM production-readiness evidence.',
          timestamp: Date.now(),
        };
        session.steps.push(blockedStep);
        onStep(blockedStep);

        const answerStep: AgentStep = {
          type: 'answer',
          content: blockedFemOverclaimAnswer,
          timestamp: Date.now(),
        };
        session.steps.push(answerStep);
        onStep(answerStep);
        break;
      }

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

    if (!isToolAllowedByRunOptions(toolCall.tool, options)) {
      const blockedStep: AgentStep = {
        type: 'error',
        content: `Tool blocked by this scoped agent: ${toolCall.tool}`,
        toolName: toolCall.tool,
        timestamp: Date.now(),
      };
      session.steps.push(blockedStep);
      onStep(blockedStep);

      messages.push({
        role: 'user',
        content: `[Tool Blocked: ${toolCall.tool}]\nThis scoped agent may only use: ${options.allowedTools?.join(', ') ?? 'the visible tool set'}. Continue with an allowed tool or explain the limitation.`,
      });
      continue;
    }

    if (toolCall.tool === 'validate_fem_analysis_case') {
      const missingRequiredTools = missingRequiredToolsForFinal(session, options)
        .filter((toolName) => toolName !== toolCall.tool);
      if (missingRequiredTools.length > 0) {
        const blockedStep: AgentStep = {
          type: 'error',
          content: `Tool blocked until required scoped tool(s) run first: ${missingRequiredTools.join(', ')}`,
          toolName: toolCall.tool,
          timestamp: Date.now(),
        };
        session.steps.push(blockedStep);
        onStep(blockedStep);

        messages.push({
          role: 'user',
          content: `[Required Tool Missing Before Validation]\nBefore calling ${toolCall.tool}, call the required tool(s): ${missingRequiredTools.join(', ')}. Do not validate or summarize a draft that does not appear in tool results.`,
        });
        continue;
      }
    }

    if (toolCall.tool === 'validate_fem_analysis_case' && !isRecord(toolCall.args.caseFile)) {
      const preparedCase = preparedFemCaseFromContext(session);
      if (preparedCase) {
        toolCall.args = {
          ...toolCall.args,
          caseFile: preparedCase,
        };
        callStep.toolArgs = toolCall.args;
      }
    }

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

    const result = await runWithToolRuntimeContext(
      { config },
      () => toolRegistry.execute(toolCall.tool, toolCall.args),
    );
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

    const dataStr = serializeToolDataForPrompt(result.data, 3000);

    messages.push({
      role: 'user',
      content: `[Tool Result: ${toolCall.tool}]\n${result.summary}\nData: ${dataStr}\n\nAnalyze this result. Do you need more calculations, or can you provide the final answer?`,
    });
  }

  if (session.steps.length > 0 && session.steps[session.steps.length - 1].type !== 'answer') {
    const missingRequiredTools = missingRequiredToolsForFinal(session, options);
    if (missingRequiredTools.length > 0) {
      pushRequiredToolsBlockedAnswer(session, onStep, missingRequiredTools);
      return session;
    }

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

      const finalContent = buildBlockedFemProductionOverclaimAnswer(finalResponse.text, session.context) ??
        finalResponse.text;
      const finalStep: AgentStep = {
        type: 'answer',
        content: finalContent,
        timestamp: Date.now(),
      };
      if (finalContent !== finalResponse.text) {
        const blockedStep: AgentStep = {
          type: 'error',
          content: 'Final answer blocked because it contradicted deterministic FEM production-readiness evidence.',
          timestamp: Date.now(),
        };
        session.steps.push(blockedStep);
        onStep(blockedStep);
      }
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

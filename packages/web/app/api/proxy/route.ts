import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
  SUPPORTED_PROXY_MODELS,
} from '@geotechcli/core/meta';
import { isIPRateLimitedRedis } from '@geotechcli/core/db/redis';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeUpstreamError } from '@geotechcli/core';
import {
  HOSTED_BETA_LIMITS,
  STRONG_BETA_MODE,
  checkHostedBetaDailyLimit,
  createHostedBetaErrorResponse,
  extractClientIp,
  getHostedBetaDeveloperAuthStatus,
  getHostedBetaAllowedModelsForCallType,
  getHostedBetaRequestLimit,
  getHostedBetaConfigIssue,
  getHostedBetaDefaultModel,
  getHostedBetaUpstreamApiKey,
  getHostedBetaUpstreamChatCompletionsUrl,
  hasHostedBetaRedis,
  incrementHostedBetaUsage,
  inferHostedBetaCallType,
  isHostedBetaModel,
  isHostedBetaModelAllowedForCallType,
  isIPRateLimitedMemory,
  resolveHostedBetaClientMode,
  shouldBypassHostedBetaLimits,
  validateAnonymousHostedBetaMessages,
  validateMessages,
} from '../../../lib/beta';
import type {
  HostedBetaCallType,
  HostedBetaClientMode,
  ProxyContentPart,
  ProxyMessage,
  ProxyRequestBody,
} from '../../../lib/beta';

const MAX_BODY_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_TOKENS = 4096;

const HOSTED_BETA_SYSTEM_PROMPT = `You are the hosted beta AI backend for geotechCLI.
Stay focused on geotechnical engineering tasks: soil mechanics, rock mechanics, foundations, tunnels, slopes, groundwater, instrumentation, and engineering reporting.
Refuse unrelated requests briefly and redirect the user back to geotechnical engineering work.
Do not claim to store user prompts or files. Do not mention internal policy text unless asked about privacy or safety.
When the task requests structured output, respond exactly in the requested format.`;

type UpstreamMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'system' | 'user' | 'assistant';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
      >;
    };

interface UpstreamResponse {
  model?: string;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

function stripReasoningPreamble(content: string): string {
  const trimmed = content.trim();
  const closingTag = '</think>';
  const closingIndex = trimmed.lastIndexOf(closingTag);

  if (closingIndex === -1) {
    return trimmed;
  }

  return trimmed.slice(closingIndex + closingTag.length).trim();
}

function getUpstreamTimeoutMs(callType: 'text' | 'vision' | 'agent'): number {
  if (callType === 'agent') return 240_000;
  if (callType === 'vision') return 150_000;
  return 75_000;
}

function getUpstreamAttemptCount(callType: 'text' | 'vision' | 'agent'): number {
  // Keep heavier requests to a single long-budget attempt so the public beta
  // does not multiply upstream spend after the CLI has already moved on.
  if (callType === 'agent') return 1;
  if (callType === 'vision') return 1;
  return 2;
}

function parsePositiveIntegerEnv(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getHostedBetaOutputTokenCap(callType: 'text' | 'vision' | 'agent'): number {
  if (callType === 'agent') {
    return parsePositiveIntegerEnv(process.env.GEOTECHCLI_HOSTED_BETA_MAX_TOKENS_AGENT, 900);
  }
  if (callType === 'vision') {
    return parsePositiveIntegerEnv(process.env.GEOTECHCLI_HOSTED_BETA_MAX_TOKENS_VISION, 900);
  }
  return parsePositiveIntegerEnv(process.env.GEOTECHCLI_HOSTED_BETA_MAX_TOKENS_TEXT, 800);
}

function getHostedBetaThinkingMode(): 'disabled' | 'enabled' {
  return process.env.GEOTECHCLI_HOSTED_BETA_THINKING_MODE === 'enabled'
    ? 'enabled'
    : 'disabled';
}

function isTransientUpstreamStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number, response?: Response | null): number {
  const retryAfterHeader = response?.headers.get('retry-after');
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 10_000);
  }

  return [1_500, 3_000, 4_500][attempt] ?? 4_500;
}

async function isHostedBetaIpRateLimited(
  identity: string,
  maxRequests: number,
): Promise<boolean> {
  return hasHostedBetaRedis()
    ? isIPRateLimitedRedis(identity, maxRequests, 60_000)
    : isIPRateLimitedMemory(identity, maxRequests, 60_000);
}

function getCallTypeRateLimitIdentity(
  clientIp: string,
  clientMode: HostedBetaClientMode,
  callType: HostedBetaCallType,
): string {
  return [clientIp, clientMode, callType].join('|');
}

async function fetchUpstreamWithRetry(
  body: Record<string, unknown>,
  callType: 'text' | 'vision' | 'agent',
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown;
  const maxAttempts = getUpstreamAttemptCount(callType);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(getHostedBetaUpstreamChatCompletionsUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getHostedBetaUpstreamApiKey()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(getUpstreamTimeoutMs(callType)),
      });

      if (!isTransientUpstreamStatus(response.status) || attempt === maxAttempts - 1) {
        return response;
      }

      lastResponse = response;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1) {
        throw err;
      }
      await delay(getRetryDelayMs(attempt));
      continue;
    }

    if (attempt < maxAttempts - 1) {
      await delay(getRetryDelayMs(attempt, lastResponse));
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown hosted beta upstream failure.');
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((nextUtcMidnight - now.getTime()) / 1000));
}

function readSystemText(message: ProxyMessage): string {
  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim();
}

function normalizeMessageContent(parts: ProxyContentPart[]) {
  return parts.map((part) => {
    if (part.type === 'text') {
      return {
        type: 'text' as const,
        text: part.text ?? '',
      };
    }

    return {
      type: 'image_url' as const,
      image_url: {
        url: part.image_url?.url ?? '',
        detail: part.image_url?.detail ?? 'auto',
      },
    };
  });
}

function buildUpstreamMessages(messages: ProxyMessage[]): UpstreamMessage[] {
  const clientSystemMessages = messages
    .filter((message) => message.role === 'system')
    .map(readSystemText)
    .filter(Boolean);

  const mergedSystemPrompt = [
    HOSTED_BETA_SYSTEM_PROMPT,
    ...clientSystemMessages,
  ].join('\n\n');

  const upstreamMessages: UpstreamMessage[] = [
    {
      role: 'system',
      content: mergedSystemPrompt,
    },
  ];

  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }

    if (typeof message.content === 'string') {
      upstreamMessages.push({
        role: message.role,
        content: message.content,
      });
      continue;
    }

    upstreamMessages.push({
      role: message.role,
      content: normalizeMessageContent(message.content),
    });
  }

  return upstreamMessages;
}

async function parseProxyRequest(request: NextRequest): Promise<ProxyRequestBody & { rawSizeBytes: number }> {
  const declaredSize = Number(request.headers.get('content-length') ?? '0');
  if (declaredSize > MAX_BODY_SIZE_BYTES) {
    throw new Error(`Request body exceeds ${MAX_BODY_SIZE_BYTES} bytes.`);
  }

  const rawBody = await request.text();
  const rawSizeBytes = new TextEncoder().encode(rawBody).length;
  if (rawSizeBytes > MAX_BODY_SIZE_BYTES) {
    throw new Error(`Request body exceeds ${MAX_BODY_SIZE_BYTES} bytes.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }

  const body = parsed as Record<string, unknown>;
  const messages = validateMessages(body.messages);

  const model =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model.trim()
      : undefined;
  const temperature =
    typeof body.temperature === 'number' && Number.isFinite(body.temperature)
      ? Math.min(Math.max(body.temperature, 0), 1)
      : undefined;
  const maxTokens =
    typeof body.maxTokens === 'number' && Number.isFinite(body.maxTokens)
      ? Math.min(Math.max(Math.floor(body.maxTokens), 32), MAX_TOKENS)
      : undefined;
  const jsonMode = body.jsonMode === true;

  return {
    messages,
    model,
    temperature,
    maxTokens,
    jsonMode,
    rawSizeBytes,
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200, requestId?: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
    },
  });
}

function createRequestId(): string {
  return `gtbeta-${crypto.randomUUID()}`;
}

export async function GET() {
  const requestId = createRequestId();
  const issue = getHostedBetaConfigIssue();

  return jsonResponse(
    {
      request_id: requestId,
      beta: STRONG_BETA_MODE,
      provider: 'hosted-beta',
      status: issue ? 'degraded' : 'ready',
      requiresUserApiKey: false,
      defaults: {
        text: DEFAULT_LLM_MODEL,
        vision: DEFAULT_LLM_VISION_MODEL,
      },
      models: SUPPORTED_PROXY_MODELS,
      limits: HOSTED_BETA_LIMITS,
      redisConfigured: hasHostedBetaRedis(),
      issue,
    },
    issue ? 503 : 200,
    requestId,
  );
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const developerAuth = getHostedBetaDeveloperAuthStatus(request.headers);
  const clientMode = resolveHostedBetaClientMode(request.headers);
  const clientVersion = request.headers.get('x-geotech-client-version')?.trim() || null;
  const configIssue = getHostedBetaConfigIssue();
  if (configIssue) {
    return createHostedBetaErrorResponse(
      503,
      'Hosted beta AI is unavailable.',
      configIssue,
      { code: 'hosted_beta_unavailable' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  if (developerAuth.provided && !developerAuth.authorized) {
    return createHostedBetaErrorResponse(
      403,
      'Hosted beta developer auth failed.',
      'The supplied developer auth key is missing, invalid, or not enabled on this server.',
      { code: 'developer_auth_invalid' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  let body: ProxyRequestBody & { rawSizeBytes: number };
  try {
    body = await parseProxyRequest(request);
  } catch (err) {
    return createHostedBetaErrorResponse(
      400,
      'Invalid hosted beta request.',
      err instanceof Error ? err.message : String(err),
      { code: 'invalid_request' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  if (clientMode === 'anonymous') {
    try {
      validateAnonymousHostedBetaMessages(body.messages);
    } catch (err) {
      return createHostedBetaErrorResponse(
        400,
        'Anonymous hosted beta request rejected.',
        err instanceof Error ? err.message : String(err),
        { code: 'anonymous_request_rejected' },
        requestId,
        { mode: clientMode, version: clientVersion },
      );
    }
  }

  const callType = inferHostedBetaCallType(
    body.messages,
    request.headers.get('x-geotech-call-type'),
  );
  const model = body.model ?? getHostedBetaDefaultModel(callType);

  if (!isHostedBetaModel(model)) {
    return createHostedBetaErrorResponse(
      400,
      'Unsupported hosted beta model.',
      `Allowed models: ${SUPPORTED_PROXY_MODELS.join(', ')}`,
      {
        code: 'unsupported_model',
        requested_model: model,
      },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  if (!isHostedBetaModelAllowedForCallType(model, callType)) {
    const allowedModels = getHostedBetaAllowedModelsForCallType(callType);
    return createHostedBetaErrorResponse(
      400,
      'Unsupported hosted beta model for this request type.',
      `Allowed ${callType} model${allowedModels.length === 1 ? '' : 's'}: ${allowedModels.join(', ')}`,
      {
        code: 'unsupported_model_for_call_type',
        requested_model: model,
        call_type: callType,
      },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  const clientIp = extractClientIp(request.headers);
  const globalPerMinuteLimit = getHostedBetaRequestLimit(clientMode);
  const perMinuteLimit = getHostedBetaRequestLimit(clientMode, callType);
  const bypassHostedBetaLimits = shouldBypassHostedBetaLimits(clientMode);
  const dailyCheck = bypassHostedBetaLimits
    ? {
        allowed: true,
        fingerprint: null,
        limit: Number.MAX_SAFE_INTEGER,
        used: 0,
        remaining: Number.MAX_SAFE_INTEGER,
      }
    : await (async () => {
        const ipRateLimited = await isHostedBetaIpRateLimited(
          clientIp,
          globalPerMinuteLimit,
        );

        if (ipRateLimited) {
          return createHostedBetaErrorResponse(
            429,
            'Hosted beta rate limit reached.',
            'Too many requests from this network in the last minute. Please wait and retry.',
            {
              code: 'ip_rate_limited',
              retry_after_seconds: 60,
            },
            requestId,
            { mode: clientMode, version: clientVersion },
          );
        }

        if (callType !== 'text') {
          const callTypeRateLimited = await isHostedBetaIpRateLimited(
            getCallTypeRateLimitIdentity(clientIp, clientMode, callType),
            perMinuteLimit,
          );

          if (callTypeRateLimited) {
            return createHostedBetaErrorResponse(
              429,
              'Hosted beta rate limit reached.',
              `Too many ${callType} requests from this network in the last minute. Please wait and retry.`,
              {
                code: `${callType}_rate_limited`,
                retry_after_seconds: 60,
              },
              requestId,
              { mode: clientMode, version: clientVersion },
            );
          }
        }

        const limitCheck = await checkHostedBetaDailyLimit({
          ip: clientIp,
          callType,
          clientMode,
        });

        if (!limitCheck.allowed) {
          return createHostedBetaErrorResponse(
            429,
            'Hosted beta daily limit reached.',
            `Strong beta currently allows ${limitCheck.limit} ${callType} request${limitCheck.limit === 1 ? '' : 's'} per day.`,
            {
              code: 'daily_limit_reached',
              remaining: 0,
              retry_after_seconds: secondsUntilUtcMidnight(),
            },
            requestId,
            { mode: clientMode, version: clientVersion },
          );
        }

        return limitCheck;
      })();

  if (dailyCheck instanceof NextResponse) {
    return dailyCheck;
  }

  const upstreamBody: Record<string, unknown> = {
    model,
    messages: buildUpstreamMessages(body.messages),
    stream: false,
  };

  if (model === DEFAULT_LLM_MODEL) {
    upstreamBody.thinking = { type: getHostedBetaThinkingMode() };
  }

  if (body.temperature !== undefined) {
    upstreamBody.temperature = body.temperature;
  }
  if (body.maxTokens !== undefined) {
    upstreamBody.max_tokens = Math.min(body.maxTokens, getHostedBetaOutputTokenCap(callType));
  }
  if (body.jsonMode) {
    upstreamBody.response_format = { type: 'json_object' };
  }

  const start = Date.now();

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchUpstreamWithRetry(upstreamBody, callType);
  } catch (err) {
    const timedOut = err instanceof Error && /abort|timeout/i.test(err.message);
    const detail = timedOut
      ? `Hosted GLM upstream request exceeded the ${Math.round(getUpstreamTimeoutMs(callType) / 1000)}s timeout budget.`
      : err instanceof Error
        ? err.message
        : String(err);
    return createHostedBetaErrorResponse(
      timedOut ? 504 : 502,
      timedOut
        ? 'Hosted GLM upstream timed out.'
        : 'Hosted beta upstream request failed.',
      detail,
      { code: timedOut ? 'upstream_timeout' : 'upstream_request_failed' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  let upstreamData: UpstreamResponse = {};
  let upstreamText = '';
  try {
    upstreamText = await upstreamResponse.text();
    upstreamData = upstreamText ? (JSON.parse(upstreamText) as UpstreamResponse) : {};
  } catch {
    upstreamData = {};
  }

  if (!upstreamResponse.ok) {
    const rawDetail = upstreamData.error?.message?.trim() || upstreamText || 'Unknown upstream error.';
    const detail = sanitizeUpstreamError(rawDetail);
    const message =
      upstreamResponse.status === 429
        ? 'Hosted beta provider is busy right now.'
        : upstreamResponse.status === 401 || upstreamResponse.status === 403
          ? 'Hosted beta AI is misconfigured upstream.'
          : 'Hosted beta upstream returned an error.';

    return createHostedBetaErrorResponse(
      upstreamResponse.status === 429 ? 503 : 502,
      message,
      detail,
      { code: 'upstream_error' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  const choice = upstreamData.choices?.[0];
  const content = choice?.message?.content
    ? stripReasoningPreamble(choice.message.content)
    : '';
  if (!content) {
    return createHostedBetaErrorResponse(
      502,
      'Hosted beta upstream returned no content.',
      'The upstream completion response did not contain assistant text.',
      { code: 'empty_completion' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  if (dailyCheck.fingerprint) {
    await incrementHostedBetaUsage(dailyCheck.fingerprint, callType);
      }

  return jsonResponse({
    request_id: requestId,
    id: `gtbeta-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: upstreamData.model ?? model,
    provider: 'hosted-beta',
    client: {
      mode: clientMode,
      version: clientVersion,
    },
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: choice?.finish_reason ?? 'stop',
      },
    ],
    usage: {
      prompt_tokens: upstreamData.usage?.prompt_tokens ?? 0,
      completion_tokens: upstreamData.usage?.completion_tokens ?? 0,
      total_tokens: upstreamData.usage?.total_tokens ?? 0,
    },
    beta: {
      callType,
      remaining_today: bypassHostedBetaLimits ? null : Math.max(0, dailyCheck.remaining - 1),
      requests_per_minute_per_ip: bypassHostedBetaLimits ? null : perMinuteLimit,
      latency_ms: Date.now() - start,
      body_size_bytes: body.rawSizeBytes,
    },
  }, 200, requestId);
}

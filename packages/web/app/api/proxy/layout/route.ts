import { isIPRateLimitedRedis } from '@geotechcli/core/db/redis';
import { sanitizeUpstreamError } from '@geotechcli/core/llm';
import { NextRequest, NextResponse } from 'next/server';
import {
  HOSTED_BETA_LIMITS,
  STRONG_BETA_MODE,
  checkHostedBetaDailyLimit,
  createHostedBetaErrorResponse,
  extractClientIp,
  getHostedBetaConfigIssue,
  getHostedBetaDeveloperAuthStatus,
  getHostedBetaRequestLimit,
  getHostedBetaUpstreamApiKey,
  getHostedBetaUpstreamLayoutParsingUrl,
  hasHostedBetaRedis,
  incrementHostedBetaUsage,
  isIPRateLimitedMemory,
  resolveHostedBetaClientMode,
  shouldBypassHostedBetaLimits,
} from '../../../../lib/beta';
import type { HostedBetaClientMode } from '../../../../lib/beta';

const MAX_LAYOUT_BODY_SIZE_BYTES = 72 * 1024 * 1024;
const MAX_LAYOUT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_LAYOUT_PDF_BYTES = 50 * 1024 * 1024;

type LayoutRequestBody = {
  file: string;
  mimeType?: string;
  model?: string;
  startPageId?: number;
  endPageId?: number;
  returnCropImages?: boolean;
  needLayoutVisualization?: boolean;
  userId?: string;
};

type LayoutResponse = {
  id?: string;
  request_id?: string;
  model?: string;
  md_results?: string;
  layout_details?: unknown[][];
  layout_visualization?: string[];
  data_info?: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

function createRequestId(): string {
  return `gtbeta-${crypto.randomUUID()}`;
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

function parsePositivePage(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeMimeType(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  return normalized;
}

function isSupportedLayoutMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf'
    || mimeType === 'image/png'
    || mimeType === 'image/jpeg';
}

function estimateBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function validateBase64Payload(value: string, mimeType: string): string {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('file must contain a valid base64 payload.');
  }

  const byteLength = estimateBase64Bytes(normalized);
  const maxBytes = mimeType === 'application/pdf' ? MAX_LAYOUT_PDF_BYTES : MAX_LAYOUT_IMAGE_BYTES;
  if (byteLength > maxBytes) {
    throw new Error(
      mimeType === 'application/pdf'
        ? 'GLM-OCR PDF input must be 50MB or smaller.'
        : 'GLM-OCR image input must be 10MB or smaller.',
    );
  }

  return normalized;
}

function normalizeLayoutFile(rawFile: unknown, rawMimeType: unknown): {
  file: string;
  mimeType: string;
  byteLength: number;
} {
  if (typeof rawFile !== 'string' || !rawFile.trim()) {
    throw new Error('file must be a non-empty base64 or data URI string.');
  }

  const trimmed = rawFile.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('Hosted GLM-OCR rejects arbitrary public URLs. Send a base64 or data URI document instead.');
  }

  const dataUriMatch = trimmed.match(/^data:([^;,]+);base64,(.+)$/is);
  if (dataUriMatch) {
    const mimeType = normalizeMimeType(dataUriMatch[1]);
    if (!isSupportedLayoutMimeType(mimeType)) {
      throw new Error('GLM-OCR supports PDF, PNG, and JPG/JPEG inputs only.');
    }
    const base64 = validateBase64Payload(dataUriMatch[2] ?? '', mimeType);
    return {
      file: `data:${mimeType};base64,${base64}`,
      mimeType,
      byteLength: estimateBase64Bytes(base64),
    };
  }

  const mimeType = normalizeMimeType(typeof rawMimeType === 'string' ? rawMimeType : undefined);
  if (!isSupportedLayoutMimeType(mimeType)) {
    throw new Error('mimeType is required for raw base64 and must be application/pdf, image/png, or image/jpeg.');
  }
  const base64 = validateBase64Payload(trimmed, mimeType);
  return {
    file: `data:${mimeType};base64,${base64}`,
    mimeType,
    byteLength: estimateBase64Bytes(base64),
  };
}

async function parseLayoutRequest(request: NextRequest): Promise<{
  body: LayoutRequestBody;
  file: string;
  mimeType: string;
  fileBytes: number;
  rawSizeBytes: number;
}> {
  const declaredSize = Number(request.headers.get('content-length') ?? '0');
  if (declaredSize > MAX_LAYOUT_BODY_SIZE_BYTES) {
    throw new Error(`Request body exceeds ${MAX_LAYOUT_BODY_SIZE_BYTES} bytes.`);
  }

  const rawBody = await request.text();
  const rawSizeBytes = new TextEncoder().encode(rawBody).length;
  if (rawSizeBytes > MAX_LAYOUT_BODY_SIZE_BYTES) {
    throw new Error(`Request body exceeds ${MAX_LAYOUT_BODY_SIZE_BYTES} bytes.`);
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

  const body = parsed as LayoutRequestBody;
  if (body.model != null && body.model !== 'glm-ocr') {
    throw new Error('Unsupported hosted layout model. Allowed model: glm-ocr.');
  }

  const normalized = normalizeLayoutFile(body.file, body.mimeType);
  const startPageId = parsePositivePage(body.startPageId, 'startPageId');
  const endPageId = parsePositivePage(body.endPageId, 'endPageId');
  if (startPageId != null && endPageId != null && endPageId < startPageId) {
    throw new Error('endPageId must be greater than or equal to startPageId.');
  }
  if (
    body.userId != null
    && (typeof body.userId !== 'string' || body.userId.length < 6 || body.userId.length > 128)
  ) {
    throw new Error('userId must be 6-128 characters when provided.');
  }

  return {
    body: {
      ...body,
      startPageId,
      endPageId,
    },
    file: normalized.file,
    mimeType: normalized.mimeType,
    fileBytes: normalized.byteLength,
    rawSizeBytes,
  };
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
): string {
  return [clientIp, clientMode, 'layout'].join('|');
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
      model: 'glm-ocr',
      endpoint: 'layout_parsing',
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
      'Hosted GLM-OCR is unavailable.',
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

  let parsedRequest: Awaited<ReturnType<typeof parseLayoutRequest>>;
  try {
    parsedRequest = await parseLayoutRequest(request);
  } catch (err) {
    return createHostedBetaErrorResponse(
      400,
      'Invalid hosted GLM-OCR request.',
      err instanceof Error ? err.message : String(err),
      { code: 'invalid_request' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  const clientIp = extractClientIp(request.headers);
  const globalPerMinuteLimit = getHostedBetaRequestLimit(clientMode);
  const perMinuteLimit = getHostedBetaRequestLimit(clientMode, 'layout');
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

        const layoutRateLimited = await isHostedBetaIpRateLimited(
          getCallTypeRateLimitIdentity(clientIp, clientMode),
          perMinuteLimit,
        );

        if (layoutRateLimited) {
          return createHostedBetaErrorResponse(
            429,
            'Hosted beta rate limit reached.',
            'Too many layout requests from this network in the last minute. Please wait and retry.',
            {
              code: 'layout_rate_limited',
              retry_after_seconds: 60,
            },
            requestId,
            { mode: clientMode, version: clientVersion },
          );
        }

        const limitCheck = await checkHostedBetaDailyLimit({
          ip: clientIp,
          callType: 'layout',
          clientMode,
        });

        if (!limitCheck.allowed) {
          return createHostedBetaErrorResponse(
            429,
            'Hosted beta daily limit reached.',
            `Strong beta currently allows ${limitCheck.limit} layout request${limitCheck.limit === 1 ? '' : 's'} per day.`,
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
    model: 'glm-ocr',
    file: parsedRequest.file,
    request_id: requestId,
  };
  if (parsedRequest.body.returnCropImages === true) {
    upstreamBody.return_crop_images = true;
  }
  if (parsedRequest.body.needLayoutVisualization === true) {
    upstreamBody.need_layout_visualization = true;
  }
  if (parsedRequest.body.startPageId != null) {
    upstreamBody.start_page_id = parsedRequest.body.startPageId;
  }
  if (parsedRequest.body.endPageId != null) {
    upstreamBody.end_page_id = parsedRequest.body.endPageId;
  }
  if (parsedRequest.body.userId) {
    upstreamBody.user_id = parsedRequest.body.userId;
  }

  const start = Date.now();
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(getHostedBetaUpstreamLayoutParsingUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getHostedBetaUpstreamApiKey()}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && /abort|timeout/i.test(err.message);
    return createHostedBetaErrorResponse(
      timedOut ? 504 : 502,
      timedOut ? 'Hosted GLM-OCR upstream timed out.' : 'Hosted GLM-OCR upstream request failed.',
      timedOut
        ? 'Hosted GLM-OCR layout parsing exceeded the 150s timeout budget.'
        : err instanceof Error ? err.message : String(err),
      { code: timedOut ? 'upstream_timeout' : 'upstream_request_failed' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  let upstreamData: LayoutResponse = {};
  let upstreamText = '';
  try {
    upstreamText = await upstreamResponse.text();
    upstreamData = upstreamText ? (JSON.parse(upstreamText) as LayoutResponse) : {};
  } catch {
    upstreamData = {};
  }

  if (!upstreamResponse.ok) {
    const rawDetail = upstreamData.error?.message?.trim() || upstreamText || 'Unknown upstream error.';
    return createHostedBetaErrorResponse(
      upstreamResponse.status === 429 ? 503 : 502,
      upstreamResponse.status === 429
        ? 'Hosted GLM-OCR provider is busy right now.'
        : 'Hosted GLM-OCR upstream returned an error.',
      sanitizeUpstreamError(rawDetail),
      { code: 'upstream_error' },
      requestId,
      { mode: clientMode, version: clientVersion },
    );
  }

  if (dailyCheck.fingerprint) {
    await incrementHostedBetaUsage(dailyCheck.fingerprint, 'layout');
  }

  return jsonResponse({
    request_id: requestId,
    upstream_request_id: upstreamData.request_id,
    id: upstreamData.id,
    model: upstreamData.model ?? 'GLM-OCR',
    provider: 'hosted-beta',
    endpoint: 'layout_parsing',
    client: {
      mode: clientMode,
      version: clientVersion,
    },
    md_results: upstreamData.md_results ?? '',
    layout_details: upstreamData.layout_details ?? [],
    layout_visualization: upstreamData.layout_visualization ?? [],
    data_info: upstreamData.data_info ?? null,
    usage: {
      prompt_tokens: upstreamData.usage?.prompt_tokens ?? 0,
      completion_tokens: upstreamData.usage?.completion_tokens ?? 0,
      total_tokens: upstreamData.usage?.total_tokens ?? 0,
    },
    beta: {
      callType: 'layout',
      remaining_today: bypassHostedBetaLimits ? null : Math.max(0, dailyCheck.remaining - 1),
      requests_per_minute_per_ip: bypassHostedBetaLimits ? null : perMinuteLimit,
      latency_ms: Date.now() - start,
      body_size_bytes: parsedRequest.rawSizeBytes,
      file_size_bytes: parsedRequest.fileBytes,
      mime_type: parsedRequest.mimeType,
    },
  }, 200, requestId);
}

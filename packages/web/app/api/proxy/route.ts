import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import {
  InMemoryUsageStore,
  checkUsageAndAbuse,
  generateFingerprint,
  detectSuspiciousActivity,
  getUserByKey,
  resolveEffectiveTier,
  RedisUsageStore,
  isIPRateLimitedRedis,
  type UsageStore,
  type UserTier,
  DEFAULT_LLM_MODEL,
  SUPPORTED_PROXY_MODELS,
} from '@geotechcli/core';

// ---------------------------------------------------------------------------
// Store initialization — Redis in production, in-memory for local dev
// ---------------------------------------------------------------------------

let usageStore: UsageStore;
let useRedisRateLimit = false;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  usageStore = new RedisUsageStore();
  useRedisRateLimit = true;
} else {
  logger.warn('UPSTASH_REDIS not configured — using in-memory store', { env: 'not-production' });
  usageStore = new InMemoryUsageStore();
}

// SECURITY: API key loaded server-side only, never exposed to client
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY ?? '';
const PROXY_SECRET = process.env.PROXY_SECRET ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const ZHIPU_BASE_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

// ---------------------------------------------------------------------------
// Security Constants
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE_BYTES = 256 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 16_000;
const MAX_TOKENS_CAP = 4096;
const ALLOWED_MODELS = SUPPORTED_PROXY_MODELS;
const ALLOWED_ROLES = ['system', 'user', 'assistant'];

// ---------------------------------------------------------------------------
// In-memory IP rate limiter fallback (when Redis not available)
// ---------------------------------------------------------------------------

const ipWindowMap = new Map<string, number[]>();
const IP_RATE_WINDOW_MS = 60_000;
const IP_RATE_MAX_REQUESTS = 15;

function isIPRateLimitedLocal(ip: string): boolean {
  const now = Date.now();
  let timestamps = ipWindowMap.get(ip) ?? [];
  timestamps = timestamps.filter((t) => now - t < IP_RATE_WINDOW_MS);

  if (timestamps.length >= IP_RATE_MAX_REQUESTS) {
    ipWindowMap.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  ipWindowMap.set(ip, timestamps);
  return false;
}

// Periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipWindowMap.entries()) {
      const active = timestamps.filter((t) => now - t < IP_RATE_WINDOW_MS);
      if (active.length === 0) ipWindowMap.delete(ip);
      else ipWindowMap.set(ip, active);
    }
  }, 5 * 60_000);
}

// ---------------------------------------------------------------------------
// Message validation & sanitization
// ---------------------------------------------------------------------------

function validateMessages(
  messages: unknown,
): { valid: boolean; sanitized: Array<{ role: string; content: unknown }>; error?: string } {
  if (!Array.isArray(messages)) {
    return { valid: false, sanitized: [], error: 'messages must be an array' };
  }
  if (messages.length === 0) {
    return { valid: false, sanitized: [], error: 'messages array is empty' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { valid: false, sanitized: [], error: `Too many messages (max ${MAX_MESSAGES})` };
  }

  const sanitized: Array<{ role: string; content: unknown }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg !== 'object' || msg === null || !('role' in msg) || !('content' in msg)) {
      return { valid: false, sanitized: [], error: `messages[${i}] must have role and content` };
    }

    const role = String((msg as Record<string, unknown>).role);
    if (!ALLOWED_ROLES.includes(role)) {
      return { valid: false, sanitized: [], error: `messages[${i}].role "${role}" not allowed` };
    }

    const content = (msg as Record<string, unknown>).content;

    if (typeof content === 'string') {
      if (content.length > MAX_MESSAGE_LENGTH) {
        return { valid: false, sanitized: [], error: `messages[${i}].content exceeds ${MAX_MESSAGE_LENGTH} chars` };
      }
      sanitized.push({ role, content });
    } else if (Array.isArray(content)) {
      const parts: unknown[] = [];
      for (const part of content) {
        if (typeof part !== 'object' || part === null) continue;
        const p = part as Record<string, unknown>;
        if (p.type === 'text' && typeof p.text === 'string') {
          if (p.text.length > MAX_MESSAGE_LENGTH) {
            return { valid: false, sanitized: [], error: `Vision text part exceeds ${MAX_MESSAGE_LENGTH} chars` };
          }
          parts.push({ type: 'text', text: p.text });
        } else if (p.type === 'image_url' && typeof p.image_url === 'object' && p.image_url !== null) {
          const imgUrl = String((p.image_url as Record<string, unknown>).url ?? '');
          if (!imgUrl.startsWith('data:image/')) {
            return { valid: false, sanitized: [], error: 'Only base64 data: image URLs allowed' };
          }
          if (imgUrl.length > 5_500_000) {
            return { valid: false, sanitized: [], error: 'Image exceeds 4MB limit' };
          }
          parts.push({ type: 'image_url', image_url: { url: imgUrl } });
        }
      }
      if (parts.length === 0) {
        return { valid: false, sanitized: [], error: `messages[${i}] has no valid content parts` };
      }
      sanitized.push({ role, content: parts });
    } else {
      return { valid: false, sanitized: [], error: `messages[${i}].content must be string or array` };
    }
  }

  return { valid: true, sanitized };
}

// ---------------------------------------------------------------------------
// POST /api/proxy — metered LLM proxy
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // --- Proxy secret check (fail-closed in production) ---
  if (IS_PRODUCTION && !PROXY_SECRET) {
    logger.error('PROXY_SECRET not configured in production');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const proxySecret = req.headers.get('x-proxy-secret');
  if (PROXY_SECRET && proxySecret !== PROXY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized proxy access' }, { status: 403 });
  }

  if (!ZHIPU_API_KEY) {
    return NextResponse.json({ error: 'Server LLM key not configured' }, { status: 500 });
  }

  // --- Identify caller ---
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';

  const userAgent = req.headers.get('user-agent') ?? '';

  // --- IP rate limit ---
  const rateLimited = useRedisRateLimit
    ? await isIPRateLimitedRedis(ip, IP_RATE_MAX_REQUESTS, IP_RATE_WINDOW_MS)
    : isIPRateLimitedLocal(ip);

  if (rateLimited) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 15 requests per minute.' },
      { status: 429, headers: { 'Retry-After': '10' } },
    );
  }

  // --- Suspicious activity check ---
  const suspicion = detectSuspiciousActivity(ip, Object.fromEntries(req.headers.entries()));
  if (suspicion.isSuspicious) {
    return NextResponse.json(
      { error: 'Request flagged for review. Contact support@geotechcli.com' },
      { status: 429 },
    );
  }

  // --- Authenticate user (Supabase lookup) ---
  const geotechKey = req.headers.get('x-geotech-key') ?? '';
  let isAuthenticated = false;
  let tier: UserTier = 'free';
  let identifier: string;

  if (geotechKey) {
    // Real Supabase user lookup
    try {
      const user = await getUserByKey(geotechKey);
      if (user) {
        isAuthenticated = true;
        tier = resolveEffectiveTier(user);
        identifier = user.id;
      } else {
        // Invalid key — treat as unregistered
        identifier = generateFingerprint(ip, userAgent);
      }
    } catch {
      // Supabase unavailable — fall back to fingerprint
      identifier = generateFingerprint(ip, userAgent);
    }
  } else {
    identifier = generateFingerprint(ip, userAgent);
  }

  // --- Body size check ---
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Request body too large (max ${MAX_BODY_SIZE_BYTES / 1024} KB)` },
      { status: 413 },
    );
  }

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    const rawText = await req.text();
    if (rawText.length > MAX_BODY_SIZE_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }
    body = JSON.parse(rawText);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- Validate messages ---
  const msgCheck = validateMessages(body.messages);
  if (!msgCheck.valid) {
    return NextResponse.json({ error: msgCheck.error }, { status: 400 });
  }

  // --- Inject controlled system prompt ---
  const systemMsg = {
    role: 'system',
    content:
      'You are a geotechnical engineering AI assistant integrated into geotechCLI. ' +
      'You have deep expertise in soil mechanics, rock mechanics, foundation engineering, ' +
      'tunnel engineering, slope stability, hydrogeology, and seismic analysis. ' +
      'You must ONLY answer questions related to geotechnical engineering topics. ' +
      'If the user asks about anything unrelated to geotechnical engineering, politely decline ' +
      'and remind them this is a geotechnical tool. Use standard geotechnical terminology ' +
      'and reference established methods where applicable.',
  };

  const userMessages = msgCheck.sanitized.filter((m) => m.role !== 'system');
  const finalMessages = [systemMsg, ...userMessages];

  // --- Determine call type ---
  const hasImages = JSON.stringify(finalMessages).includes('"image_url"');
  const callType = hasImages ? 'visionCalls' : 'llmCalls';

  // --- Check usage quota ---
  const usageCheck = await checkUsageAndAbuse(
    usageStore,
    identifier,
    callType as 'llmCalls' | 'visionCalls' | 'agentCalls',
    tier,
    isAuthenticated,
  );

  if (!usageCheck.allowed) {
    return NextResponse.json(
      {
        error: usageCheck.reason,
        upgrade: usageCheck.shouldPromptUpgrade,
        upgradeMessage: usageCheck.upgradeMessage,
        pricing: 'https://geotechcli.com/pricing',
      },
      { status: 429 },
    );
  }

  // --- Increment usage ---
  await usageStore.increment(identifier, callType as 'llmCalls' | 'visionCalls' | 'agentCalls');

  // --- Forward to Zhipu ---
  const requestedModel = String(body.model ?? DEFAULT_LLM_MODEL);
  const zhipuBody = {
    model: ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_LLM_MODEL,
    messages: finalMessages,
    temperature: Math.min(Math.max(Number(body.temperature) || 0.7, 0), 1.5),
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 2048, 1), MAX_TOKENS_CAP),
    stream: false,
  };

  try {
    const zhipuRes = await fetch(ZHIPU_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(zhipuBody),
      signal: AbortSignal.timeout(60_000),
    });

    if (!zhipuRes.ok) {
      const errText = await zhipuRes.text().catch(() => '');
      logger.error('Upstream LLM error', { status: zhipuRes.status });
      return NextResponse.json(
        { error: `LLM provider error (${zhipuRes.status})` },
        { status: 502 },
      );
    }

    const data = await zhipuRes.json();

    // Sanitize response — only forward expected fields
    const safeResponse: Record<string, unknown> = {
      id: data.id,
      model: data.model,
      choices: data.choices,
      usage: data.usage,
    };

    const response = NextResponse.json(safeResponse);

    if (usageCheck.remainingCalls !== undefined && usageCheck.remainingCalls !== Infinity) {
      response.headers.set('x-geotech-remaining', String(usageCheck.remainingCalls));
    }
    if (usageCheck.shouldPromptUpgrade) {
      response.headers.set('x-geotech-upgrade', 'true');
    }

    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('abort') || msg.includes('timeout')) {
      return NextResponse.json({ error: 'LLM request timed out' }, { status: 504 });
    }
    logger.error('Proxy request error', { note: 'content not logged' });
    return NextResponse.json({ error: 'Internal proxy error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/proxy — status check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: 'online',
    provider: 'zhipu',
    models: ALLOWED_MODELS,
    auth: 'supabase',
    metering: useRedisRateLimit ? 'redis' : 'in-memory',
    docs: 'https://geotechcli.com/docs',
  });
}

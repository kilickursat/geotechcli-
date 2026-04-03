import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
  SUPPORTED_PROXY_MODELS,
} from '@geotechcli/core';
import { NextResponse } from 'next/server';

export const STRONG_BETA_MODE = true;

export const HOSTED_BETA_LIMITS = {
  requestsPerMinutePerIp: 10,
  textPerDay: 25,
  visionPerDay: 5,
  agentPerDay: 3,
} as const;

export type HostedBetaCallType = 'text' | 'vision' | 'agent';

export interface ProxyContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface ProxyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ProxyContentPart[];
}

export interface ProxyRequestBody {
  messages: ProxyMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

const TEXT_CONTENT_LIMIT = 50_000;
const IMAGE_DATA_URI_LIMIT = 8_000_000;
const MESSAGE_LIMIT = 24;
const DAILY_TTL_SECONDS = 2 * 24 * 60 * 60;

type InMemoryStore = {
  ipBuckets: Map<string, number[]>;
  dailyUsage: Map<string, { count: number; expiresAt: number }>;
};

function getInMemoryStore(): InMemoryStore {
  const globalState = globalThis as typeof globalThis & {
    __geotechHostedBetaStore?: InMemoryStore;
  };

  if (!globalState.__geotechHostedBetaStore) {
    globalState.__geotechHostedBetaStore = {
      ipBuckets: new Map(),
      dailyUsage: new Map(),
    };
  }

  return globalState.__geotechHostedBetaStore;
}

export function betaDisabledResponse(feature: string, detail: string, status = 410) {
  return NextResponse.json(
    {
      beta: STRONG_BETA_MODE,
      status: 'coming_soon',
      feature,
      message: `${feature} is disabled in strong beta.`,
      detail,
      available_now: [
        'Deterministic geotechnical CLI commands',
        'Public docs and changelog',
        'Strong beta website and install flow',
      ],
    },
    { status },
  );
}

export function hasHostedBetaRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export function isHostedBetaProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getHostedBetaConfigIssue(): string | null {
  if (!process.env.ZHIPU_API_KEY?.trim()) {
    return 'Hosted beta AI is not configured yet. Set ZHIPU_API_KEY on the server.';
  }

  if (isHostedBetaProduction() && !hasHostedBetaRedis()) {
    return 'Hosted beta AI requires Upstash Redis in production so anonymous limits work safely.';
  }

  return null;
}

export function getHostedBetaDefaultModel(callType: HostedBetaCallType): string {
  return callType === 'vision' ? DEFAULT_LLM_VISION_MODEL : DEFAULT_LLM_MODEL;
}

export function isHostedBetaModel(model: string): boolean {
  return SUPPORTED_PROXY_MODELS.includes(model);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateContentPart(part: unknown): ProxyContentPart | null {
  if (!isObject(part) || (part.type !== 'text' && part.type !== 'image_url')) {
    return null;
  }

  if (part.type === 'text') {
    if (typeof part.text !== 'string' || part.text.length === 0 || part.text.length > TEXT_CONTENT_LIMIT) {
      return null;
    }
    return { type: 'text', text: part.text };
  }

  const imageUrl = isObject(part.image_url) ? part.image_url : null;
  const url = typeof imageUrl?.url === 'string' ? imageUrl.url : '';
  const detail =
    imageUrl?.detail === 'low' || imageUrl?.detail === 'high' ? imageUrl.detail : 'auto';

  const isAllowedDataUri =
    url.startsWith('data:image/') ||
    url.startsWith('data:application/pdf;base64,');

  if (!isAllowedDataUri || url.length === 0 || url.length > IMAGE_DATA_URI_LIMIT) {
    return null;
  }

  return {
    type: 'image_url',
    image_url: { url, detail },
  };
}

export function validateMessages(input: unknown): ProxyMessage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MESSAGE_LIMIT) {
    throw new Error(`messages must be a non-empty array with at most ${MESSAGE_LIMIT} items.`);
  }

  const messages: ProxyMessage[] = [];

  for (const rawMessage of input) {
    if (!isObject(rawMessage)) {
      throw new Error('Each message must be an object.');
    }

    const role = rawMessage.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new Error('Message role must be system, user, or assistant.');
    }

    const content = rawMessage.content;
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (!trimmed || trimmed.length > TEXT_CONTENT_LIMIT) {
        throw new Error(`Message content must be 1-${TEXT_CONTENT_LIMIT} characters.`);
      }
      messages.push({ role, content: trimmed });
      continue;
    }

    if (!Array.isArray(content) || content.length === 0 || content.length > 12) {
      throw new Error('Multipart content must be a non-empty array with at most 12 parts.');
    }

    const parts = content.map(validateContentPart);
    if (parts.some((part) => part === null)) {
      throw new Error('Multipart content contains an invalid text or image payload.');
    }

    messages.push({ role, content: parts as ProxyContentPart[] });
  }

  if (!messages.some((message) => message.role === 'user')) {
    throw new Error('At least one user message is required.');
  }

  return messages;
}

export function inferHostedBetaCallType(
  messages: ProxyMessage[],
  hint?: string | null,
): HostedBetaCallType {
  if (hint === 'text' || hint === 'vision' || hint === 'agent') {
    return hint;
  }

  const hasImage = messages.some((message) =>
    Array.isArray(message.content) &&
    message.content.some((part) => part.type === 'image_url'),
  );

  if (hasImage) {
    return 'vision';
  }

  const hasAssistantTurns = messages.some((message) => message.role === 'assistant');
  if (hasAssistantTurns || messages.length > 2) {
    return 'agent';
  }

  return 'text';
}

function getDailyLimit(callType: HostedBetaCallType): number {
  if (callType === 'vision') return HOSTED_BETA_LIMITS.visionPerDay;
  if (callType === 'agent') return HOSTED_BETA_LIMITS.agentPerDay;
  return HOSTED_BETA_LIMITS.textPerDay;
}

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim() ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? '',
  };
}

async function redisCommand<T = unknown>(args: (string | number)[]): Promise<T | null> {
  const config = getRedisConfig();
  if (!config.url || !config.token) {
    return null;
  }

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { result?: T };
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function hashIdentifier(raw: string): Promise<string> {
  const encoded = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('true-client-ip'),
    headers.get('x-real-ip'),
  ];

  for (const candidate of candidates) {
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return '0.0.0.0';
}

function getUsageKey(fingerprint: string, callType: HostedBetaCallType): string {
  const now = new Date();
  const dateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return `beta:${dateKey}:${callType}:${fingerprint}`;
}

async function getDailyUsageCount(fingerprint: string, callType: HostedBetaCallType): Promise<number> {
  const key = getUsageKey(fingerprint, callType);

  if (hasHostedBetaRedis()) {
    return Number(await redisCommand<string>(['GET', key])) || 0;
  }

  const store = getInMemoryStore();
  const entry = store.dailyUsage.get(key);
  if (!entry) return 0;

  if (entry.expiresAt <= Date.now()) {
    store.dailyUsage.delete(key);
    return 0;
  }

  return entry.count;
}

export async function incrementHostedBetaUsage(
  fingerprint: string,
  callType: HostedBetaCallType,
): Promise<number> {
  const key = getUsageKey(fingerprint, callType);

  if (hasHostedBetaRedis()) {
    const nextCount = Number(await redisCommand<number>(['INCR', key])) || 0;
    await redisCommand(['EXPIRE', key, DAILY_TTL_SECONDS]);
    return nextCount;
  }

  const store = getInMemoryStore();
  const current = await getDailyUsageCount(fingerprint, callType);
  store.dailyUsage.set(key, {
    count: current + 1,
    expiresAt: Date.now() + DAILY_TTL_SECONDS * 1000,
  });
  return current + 1;
}

export async function checkHostedBetaDailyLimit(params: {
  ip: string;
  userAgent?: string | null;
  clientVersion?: string | null;
  callType: HostedBetaCallType;
}) {
  const fingerprint = await hashIdentifier(
    [params.ip, params.userAgent ?? '', params.clientVersion ?? '', params.callType].join('|'),
  );
  const limit = getDailyLimit(params.callType);
  const current = await getDailyUsageCount(fingerprint, params.callType);

  return {
    allowed: current < limit,
    fingerprint,
    limit,
    used: current,
    remaining: Math.max(0, limit - current),
  };
}

export function isIPRateLimitedMemory(
  ip: string,
  maxRequests = HOSTED_BETA_LIMITS.requestsPerMinutePerIp,
  windowMs = 60_000,
): boolean {
  const store = getInMemoryStore();
  const now = Date.now();
  const recent = (store.ipBuckets.get(ip) ?? []).filter((timestamp) => now - timestamp < windowMs);
  const limited = recent.length >= maxRequests;
  recent.push(now);
  store.ipBuckets.set(ip, recent);
  return limited;
}

export function createHostedBetaErrorResponse(
  status: number,
  message: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      error: {
        message,
        detail,
        ...extra,
      },
      beta: STRONG_BETA_MODE,
      provider: 'hosted-beta',
      defaults: {
        text: DEFAULT_LLM_MODEL,
        vision: DEFAULT_LLM_VISION_MODEL,
      },
      limits: HOSTED_BETA_LIMITS,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

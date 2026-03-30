// ---------------------------------------------------------------------------
// Upstash Redis Usage Store — persistent metering for geotechCLI
//
// Replaces InMemoryUsageStore for production deployments.
// Uses Upstash Redis (HTTP-based) which works on Cloudflare Workers,
// Vercel Edge, and any serverless environment.
//
// Keys structure:
//   usage:{identifier}:llmCalls     — monthly LLM call count
//   usage:{identifier}:visionCalls  — monthly vision call count
//   usage:{identifier}:agentCalls   — monthly agent call count
//   usage:{identifier}:meta         — JSON: {tier, periodStart, lastCall}
//   ratelimit:{ip}                  — sliding window counter
// ---------------------------------------------------------------------------

import type { UsageRecord, UsageStore } from '../llm/middleware/metering.js';

// ---------------------------------------------------------------------------
// Upstash Redis HTTP Client (zero dependencies)
// ---------------------------------------------------------------------------

interface RedisConfig {
  url: string;
  token: string;
}

function getRedisConfig(): RedisConfig {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

  if (!url || !token) {
    throw new Error(
      'Missing Upstash Redis configuration. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  }

  return { url, token };
}

async function redisCommand<T = unknown>(args: (string | number)[]): Promise<T | null> {
  const config = getRedisConfig();

  try {
    const res = await fetch(`${config.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      console.error(`[redis] Error ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }

    const data = await res.json();
    return (data as { result: T }).result ?? null;
  } catch (err) {
    console.error(`[redis] Request failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Execute multiple Redis commands in a single HTTP request (pipeline).
 */
async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const config = getRedisConfig();

  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      console.error(`[redis] Pipeline error ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data as Array<{ result: unknown }>).map((r) => r.result);
  } catch (err) {
    console.error(`[redis] Pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Monthly period helpers
// ---------------------------------------------------------------------------

function getCurrentPeriodStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function getCurrentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// TTL: 35 days (covers the full month + a few days buffer)
const PERIOD_TTL_SECONDS = 35 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// RedisUsageStore — implements UsageStore interface
// ---------------------------------------------------------------------------

export class RedisUsageStore implements UsageStore {
  private keyPrefix(identifier: string): string {
    const period = getCurrentPeriodKey();
    return `usage:${period}:${identifier}`;
  }

  async get(identifier: string): Promise<UsageRecord | null> {
    const prefix = this.keyPrefix(identifier);

    const results = await redisPipeline([
      ['GET', `${prefix}:llmCalls`],
      ['GET', `${prefix}:visionCalls`],
      ['GET', `${prefix}:agentCalls`],
      ['GET', `${prefix}:meta`],
    ]);

    const llmCalls = Number(results[0]) || 0;
    const visionCalls = Number(results[1]) || 0;
    const agentCalls = Number(results[2]) || 0;
    const metaStr = results[3] as string | null;

    let meta: { tier: string; periodStart: number; lastCallTimestamp: number } | null = null;
    if (metaStr) {
      try {
        meta = JSON.parse(metaStr);
      } catch { /* ignore */ }
    }

    if (!meta && llmCalls === 0 && visionCalls === 0 && agentCalls === 0) {
      return null;
    }

    return {
      identifier,
      tier: (meta?.tier as UsageRecord['tier']) ?? 'free',
      llmCalls,
      visionCalls,
      agentCalls,
      periodStart: meta?.periodStart ?? getCurrentPeriodStart(),
      lastCallTimestamp: meta?.lastCallTimestamp ?? Date.now(),
    };
  }

  async set(identifier: string, record: UsageRecord): Promise<void> {
    const prefix = this.keyPrefix(identifier);
    const meta = JSON.stringify({
      tier: record.tier,
      periodStart: record.periodStart,
      lastCallTimestamp: record.lastCallTimestamp,
    });

    await redisPipeline([
      ['SET', `${prefix}:llmCalls`, record.llmCalls, 'EX', PERIOD_TTL_SECONDS],
      ['SET', `${prefix}:visionCalls`, record.visionCalls, 'EX', PERIOD_TTL_SECONDS],
      ['SET', `${prefix}:agentCalls`, record.agentCalls, 'EX', PERIOD_TTL_SECONDS],
      ['SET', `${prefix}:meta`, meta, 'EX', PERIOD_TTL_SECONDS],
    ]);
  }

  async increment(
    identifier: string,
    field: 'llmCalls' | 'visionCalls' | 'agentCalls',
  ): Promise<UsageRecord> {
    const prefix = this.keyPrefix(identifier);
    const fieldKey = `${prefix}:${field}`;
    const metaKey = `${prefix}:meta`;

    const results = await redisPipeline([
      ['INCR', fieldKey],
      ['EXPIRE', fieldKey, PERIOD_TTL_SECONDS],
      ['GET', `${prefix}:llmCalls`],
      ['GET', `${prefix}:visionCalls`],
      ['GET', `${prefix}:agentCalls`],
      ['SET', metaKey, JSON.stringify({
        tier: 'free',
        periodStart: getCurrentPeriodStart(),
        lastCallTimestamp: Date.now(),
      }), 'EX', PERIOD_TTL_SECONDS],
    ]);

    return {
      identifier,
      tier: 'free',
      llmCalls: Number(results[2]) || 0,
      visionCalls: Number(results[3]) || 0,
      agentCalls: Number(results[4]) || 0,
      periodStart: getCurrentPeriodStart(),
      lastCallTimestamp: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// IP Rate Limiter — sliding window using Redis
// ---------------------------------------------------------------------------

/**
 * Check if an IP is rate-limited using Redis sliding window.
 * Returns true if the IP should be blocked.
 */
export async function isIPRateLimitedRedis(
  ip: string,
  maxRequests = 15,
  windowMs = 60_000,
): Promise<boolean> {
  // PRIVACY: Hash IP before using as Redis key — never store raw IPs
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(ip));
  const ipHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const key = `ratelimit:${ipHash}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Sorted set: score = timestamp, member = unique request ID
  const results = await redisPipeline([
    // Remove entries outside the window
    ['ZREMRANGEBYSCORE', key, 0, windowStart],
    // Count entries in the window
    ['ZCARD', key],
    // Add current request
    ['ZADD', key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`],
    // Set TTL so the key auto-expires
    ['EXPIRE', key, Math.ceil(windowMs / 1000) + 5],
  ]);

  const count = Number(results[1]) || 0;
  return count >= maxRequests;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function redisHealthCheck(): Promise<boolean> {
  const result = await redisCommand<string>(['PING']);
  return result === 'PONG';
}

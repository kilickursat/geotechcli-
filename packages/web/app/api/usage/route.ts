import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByKey,
  resolveEffectiveTier,
  TIER_LIMITS,
  RedisUsageStore,
  InMemoryUsageStore,
  type UsageStore,
} from '@geotechcli/core';

// ---------------------------------------------------------------------------
// GET /api/usage — Return current usage stats for the authenticated user
//
// Headers: x-geotech-key (required)
// Returns: { tier, usage, limits, subscription }
// ---------------------------------------------------------------------------

let usageStore: UsageStore;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  usageStore = new RedisUsageStore();
} else {
  usageStore = new InMemoryUsageStore();
}

export async function GET(req: NextRequest) {
  const geotechKey = req.headers.get('x-geotech-key') ?? '';

  if (!geotechKey) {
    return NextResponse.json(
      { error: 'x-geotech-key header required' },
      { status: 401 },
    );
  }

  const user = await getUserByKey(geotechKey);
  if (!user) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401 },
    );
  }

  const effectiveTier = resolveEffectiveTier(user);
  const limits = TIER_LIMITS[effectiveTier];

  // Get current usage from store
  const usage = await usageStore.get(user.id);

  return NextResponse.json({
    user: {
      email: user.email,
      tier: effectiveTier,
      subscription_status: user.subscription_status,
      subscription_end_at: user.subscription_end_at,
    },
    usage: {
      llm_calls: usage?.llmCalls ?? 0,
      vision_calls: usage?.visionCalls ?? 0,
      agent_calls: usage?.agentCalls ?? 0,
      period_start: usage?.periodStart ?? null,
    },
    limits: {
      llm_calls_per_month: limits.llmCallsPerMonth === Infinity ? 'unlimited' : limits.llmCallsPerMonth,
      vision_calls_per_month: limits.visionCallsPerMonth === Infinity ? 'unlimited' : limits.visionCallsPerMonth,
      agent_calls_per_month: limits.agentCallsPerMonth === Infinity ? 'unlimited' : limits.agentCallsPerMonth,
      byol_enabled: limits.byolEnabled,
      batch_enabled: limits.batchEnabled,
      report_generation: limits.reportGeneration,
    },
  });
}

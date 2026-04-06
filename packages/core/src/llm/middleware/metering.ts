import type { UserTier, TierLimits } from '../types.js';
import { TIER_LIMITS } from '../types.js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Usage tracking store interface (backed by DB in production, in-memory for CLI)
// ---------------------------------------------------------------------------

export interface UsageRecord {
  identifier: string;
  tier: UserTier;
  llmCalls: number;
  visionCalls: number;
  agentCalls: number;
  periodStart: number;
  lastCallTimestamp: number;
}

export interface UsageStore {
  get(identifier: string): Promise<UsageRecord | null>;
  set(identifier: string, record: UsageRecord): Promise<void>;
  increment(identifier: string, field: 'llmCalls' | 'visionCalls' | 'agentCalls'): Promise<UsageRecord>;
}

// ---------------------------------------------------------------------------
// In-memory store (for CLI and tests)
// ---------------------------------------------------------------------------

export class InMemoryUsageStore implements UsageStore {
  private records = new Map<string, UsageRecord>();

  async get(identifier: string): Promise<UsageRecord | null> {
    const record = this.records.get(identifier);
    if (!record) return null;

    // Reset if period expired (monthly)
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    if (now - record.periodStart > monthMs) {
      record.llmCalls = 0;
      record.visionCalls = 0;
      record.agentCalls = 0;
      record.periodStart = now;
    }

    return record;
  }

  async set(identifier: string, record: UsageRecord): Promise<void> {
    this.records.set(identifier, record);
  }

  async increment(
    identifier: string,
    field: 'llmCalls' | 'visionCalls' | 'agentCalls',
  ): Promise<UsageRecord> {
    let record = await this.get(identifier);
    if (!record) {
      record = {
        identifier,
        tier: 'free',
        llmCalls: 0,
        visionCalls: 0,
        agentCalls: 0,
        periodStart: Date.now(),
        lastCallTimestamp: Date.now(),
      };
    }

    record[field] += 1;
    record.lastCallTimestamp = Date.now();
    this.records.set(identifier, record);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Abuse detection — fingerprinting and rate limiting
// ---------------------------------------------------------------------------

// Unregistered users: max 5 API calls total, then must register
const UNREGISTERED_MAX_CALLS = 5;

// Rate limiting: max calls per minute per identifier
const RATE_LIMIT_PER_MINUTE = 10;

export interface AbuseCheckResult {
  allowed: boolean;
  reason?: string;
  remainingCalls?: number;
  shouldPromptUpgrade: boolean;
  upgradeMessage?: string;
}

/**
 * Generate a fingerprint for unregistered users.
 * Combines IP address with user-agent for basic identification.
 * Not foolproof but raises the bar significantly.
 */
export function generateFingerprint(
  ip: string,
  userAgent?: string,
  additionalSignals?: string[],
): string {
  const raw = [
    ip,
    userAgent ?? '',
    ...(additionalSignals ?? []),
  ].join('|');

  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Check if a request should be allowed based on usage and abuse patterns.
 *
 * Logic:
 * 1. Registered users (have API key) → check tier limits
 * 2. Unregistered users → max 5 calls total, then hard block with upgrade prompt
 * 3. Rate limiting → max 10 calls/minute regardless of tier
 */
export async function checkUsageAndAbuse(
  store: UsageStore,
  identifier: string,
  callType: 'llmCalls' | 'visionCalls' | 'agentCalls',
  tier: UserTier,
  isRegistered: boolean,
): Promise<AbuseCheckResult> {
  const record = await store.get(identifier);
  const limits = TIER_LIMITS[tier];

  // --- Unregistered user check ---
  if (!isRegistered) {
    const totalCalls = record
      ? record.llmCalls + record.visionCalls + record.agentCalls
      : 0;

    if (totalCalls >= UNREGISTERED_MAX_CALLS) {
      return {
        allowed: false,
        reason: 'Free trial limit reached (5 AI calls without registration).',
        remainingCalls: 0,
        shouldPromptUpgrade: true,
        upgradeMessage: `
╔══════════════════════════════════════════════════════════╗
║  You've used your 5 free AI calls.                      ║
║                                                         ║
║  To continue using AI features:                         ║
║                                                         ║
║  → Lite Pro ($15/mo)  Unlimited GLM models              ║
║  → Pro ($49/mo)       Bring Your Own LLM                ║
║  → Annual ($399/yr)   Everything + SLA                  ║
║                                                         ║
║  Register at: https://beta.geotechcli.com/pricing            ║
║  No login is required on strong-beta                             ║
║                                                         ║
║  Deterministic calculations remain FREE forever.        ║
╚══════════════════════════════════════════════════════════╝`,
      };
    }

    const remaining = UNREGISTERED_MAX_CALLS - totalCalls - 1;
    return {
      allowed: true,
      remainingCalls: remaining,
      shouldPromptUpgrade: remaining <= 2,
      upgradeMessage: remaining <= 2
        ? `⚠ ${remaining} free AI call${remaining === 1 ? '' : 's'} remaining. See beta.geotechcli.com/pricing for current strong-beta status.`
        : undefined,
    };
  }

  // --- Registered user: check tier limits ---
  const currentCount = record ? record[callType] : 0;
  const limitForType = callType === 'llmCalls'
    ? limits.llmCallsPerMonth
    : callType === 'visionCalls'
      ? limits.visionCallsPerMonth
      : limits.agentCallsPerMonth;

  if (currentCount >= limitForType) {
    const tierName = tier === 'free' ? 'Free' : tier === 'lite_pro' ? 'Lite Pro' : tier === 'pro' ? 'Pro' : 'Annual';
    return {
      allowed: false,
      reason: `Monthly ${callType.replace('Calls', '')} limit reached for ${tierName} tier (${limitForType}/month).`,
      remainingCalls: 0,
      shouldPromptUpgrade: tier === 'free' || tier === 'lite_pro',
      upgradeMessage: tier === 'free'
        ? `Upgrade to Lite Pro ($15/mo) for 1000 analyses/month, or Pro ($49/mo) for unlimited. See beta.geotechcli.com/pricing`
        : tier === 'lite_pro'
          ? `Upgrade to Pro ($49/mo) for unlimited analyses + BYOL. Visit geotechcli.com/pricing`
          : undefined,
    };
  }

  // --- Rate limiting (burst protection) ---
  if (record) {
    const timeSinceLastCall = Date.now() - record.lastCallTimestamp;
    const totalRecentCalls = record.llmCalls + record.visionCalls + record.agentCalls;

    // Simple burst detection: if more than 10 calls in last 60 seconds
    if (timeSinceLastCall < 6000 && totalRecentCalls > RATE_LIMIT_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded. Please wait a moment before making another request.',
        shouldPromptUpgrade: false,
      };
    }
  }

  const remaining = limitForType === Infinity ? Infinity : limitForType - currentCount - 1;

  return {
    allowed: true,
    remainingCalls: remaining,
    shouldPromptUpgrade: false,
  };
}

// ---------------------------------------------------------------------------
// IP-based suspicious activity detection
// ---------------------------------------------------------------------------

export interface SuspiciousActivityCheck {
  isSuspicious: boolean;
  signals: string[];
}

const knownVPNHeaders = [
  'cf-connecting-ip',
  'x-forwarded-for',
  'true-client-ip',
];

/**
 * Check for suspicious patterns that suggest abuse:
 * - Rapid IP rotation (same fingerprint, different IPs)
 * - Known VPN/proxy indicators
 * - Abnormal request patterns
 */
export function detectSuspiciousActivity(
  ip: string,
  headers: Record<string, string | undefined>,
  recentIPs?: string[],
): SuspiciousActivityCheck {
  const signals: string[] = [];

  // Check for multiple forwarded IPs (proxy chain)
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor && forwardedFor.split(',').length > 3) {
    signals.push('Deep proxy chain detected (>3 hops)');
  }

  // Check for IP mismatch between headers
  const cfIP = headers['cf-connecting-ip'];
  const trueIP = headers['true-client-ip'];
  if (cfIP && trueIP && cfIP !== trueIP) {
    signals.push('IP mismatch between Cloudflare and True-Client-IP headers');
  }

  // Check for rapid IP changes (if history provided)
  if (recentIPs && recentIPs.length >= 3) {
    const uniqueIPs = new Set(recentIPs.slice(-5));
    if (uniqueIPs.size >= 4) {
      signals.push('Rapid IP rotation detected (4+ unique IPs in recent requests)');
    }
  }

  return {
    isSuspicious: signals.length >= 2,
    signals,
  };
}

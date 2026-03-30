// ---------------------------------------------------------------------------
// User Management — Supabase-backed, privacy-first
//
// PRIVACY GUARANTEES:
//   - We NEVER store user LLM API keys (OpenAI, Anthropic, HF tokens, etc.)
//   - We NEVER log or store the content of prompts or responses
//   - We NEVER store IP addresses or device fingerprints in the database
//   - We store ONLY: email (account recovery), geotech_key (our auth token),
//     tier, and Stripe billing IDs
//   - User's LLM keys stay on their machine (~/.geotechcli/config.json)
//     and are sent DIRECTLY to the LLM provider — never to our servers
// ---------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { dbQuery, dbInsert, dbUpdate, dbDelete } from './supabase.js';
import type { UserTier } from '../llm/types.js';

// ---------------------------------------------------------------------------
// Types — note: NO llm_provider, llm_model, llm_api_key fields
// ---------------------------------------------------------------------------

export interface GeotechUser {
  id: string;
  email: string;
  geotech_key: string;
  tier: UserTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: 'none' | 'active' | 'past_due' | 'canceled' | 'trialing';
  subscription_end_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
}

// ---------------------------------------------------------------------------
// Key generation — our auth token, NOT an LLM key
// ---------------------------------------------------------------------------

export function generateGeotechKey(): string {
  return `gtp_${randomBytes(16).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// User lookup — hot path (every proxy request)
// ---------------------------------------------------------------------------

export async function getUserByKey(geotechKey: string): Promise<GeotechUser | null> {
  if (!geotechKey || !geotechKey.startsWith('gtp_') || geotechKey.length < 20) {
    return null;
  }

  const { data, error } = await dbQuery<GeotechUser[]>({
    table: 'users',
    select: '*',
    filters: [{ column: 'geotech_key', op: 'eq', value: geotechKey }],
    limit: 1,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function getUserByEmail(email: string): Promise<GeotechUser | null> {
  const { data, error } = await dbQuery<GeotechUser[]>({
    table: 'users',
    select: '*',
    filters: [{ column: 'email', op: 'eq', value: email }],
    limit: 1,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function getUserById(userId: string): Promise<GeotechUser | null> {
  const { data, error } = await dbQuery<GeotechUser[]>({
    table: 'users',
    select: '*',
    filters: [{ column: 'id', op: 'eq', value: userId }],
    limit: 1,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function getUserByStripeCustomer(stripeCustomerId: string): Promise<GeotechUser | null> {
  const { data, error } = await dbQuery<GeotechUser[]>({
    table: 'users',
    select: '*',
    filters: [{ column: 'stripe_customer_id', op: 'eq', value: stripeCustomerId }],
    limit: 1,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}

// ---------------------------------------------------------------------------
// User creation
// ---------------------------------------------------------------------------

export async function createUser(input: CreateUserInput): Promise<{ user: GeotechUser | null; error: string | null }> {
  const geotechKey = generateGeotechKey();

  const { data, error } = await dbInsert<GeotechUser[]>('users', {
    email: input.email,
    geotech_key: geotechKey,
    tier: 'free',
    subscription_status: 'none',
  });

  if (error) {
    if (error.includes('duplicate') || error.includes('23505')) {
      return { user: null, error: 'A user with this email already exists.' };
    }
    return { user: null, error };
  }

  return { user: data && data.length > 0 ? data[0] : null, error: null };
}

// ---------------------------------------------------------------------------
// Subscription management (called from Stripe webhooks only)
// ---------------------------------------------------------------------------

export async function updateSubscription(
  userId: string,
  updates: {
    tier: UserTier;
    stripe_subscription_id?: string | null;
    stripe_price_id?: string | null;
    subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'none';
    subscription_end_at?: string | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await dbUpdate('users',
    [{ column: 'id', op: 'eq', value: userId }],
    updates,
  );
  return { error };
}

export async function linkStripeCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<{ error: string | null }> {
  const { error } = await dbUpdate('users',
    [{ column: 'id', op: 'eq', value: userId }],
    { stripe_customer_id: stripeCustomerId },
  );
  return { error };
}

export async function regenerateKey(userId: string): Promise<{ key: string | null; error: string | null }> {
  const newKey = generateGeotechKey();
  const { error } = await dbUpdate('users',
    [{ column: 'id', op: 'eq', value: userId }],
    { geotech_key: newKey },
  );
  if (error) return { key: null, error };
  return { key: newKey, error: null };
}

/**
 * Delete a user and all their data (GDPR right to erasure).
 */
export async function deleteUser(userId: string): Promise<{ error: string | null }> {
  const { error } = await dbDelete('users',
    [{ column: 'id', op: 'eq', value: userId }],
  );
  return { error: error ?? null };
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

export function resolveEffectiveTier(user: GeotechUser): UserTier {
  if (user.subscription_status === 'active' || user.subscription_status === 'trialing') {
    return user.tier;
  }
  if (user.subscription_status === 'past_due') {
    return user.tier; // Grace period
  }
  if (user.subscription_status === 'canceled' && user.subscription_end_at) {
    if (new Date(user.subscription_end_at) > new Date()) {
      return user.tier; // Canceled but not yet expired
    }
  }
  return 'free';
}

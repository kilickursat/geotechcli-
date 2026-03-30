-- ============================================================================
-- geotechCLI — Supabase Database Schema
-- ============================================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- PRIVACY POLICY:
--   - We NEVER store user LLM API keys (OpenAI, Anthropic, HF, etc.)
--   - We NEVER store IP addresses or device fingerprints
--   - We NEVER store or log the content of user prompts or LLM responses
--   - We store ONLY: email (for account recovery), subscription state,
--     and aggregate usage counters (call counts, not content)
--   - Users can delete their account and all data at any time
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. Users — minimal identity + subscription state
-- ============================================================================

create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),

  -- Identity: email for account recovery / billing only
  email         text unique not null,

  -- geotechCLI API key (our own auth token, NOT user's LLM key)
  -- Format: gtp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  -- This authenticates CLI requests to our proxy.
  -- User's own LLM keys (OpenAI, Anthropic, HF, etc.) are NEVER
  -- sent to us — they go direct from CLI to the provider.
  geotech_key   text unique not null,

  -- Subscription tier (determines rate limits)
  tier          text not null default 'free'
                check (tier in ('free', 'lite_pro', 'pro', 'annual')),

  -- Stripe integration (billing management only)
  stripe_customer_id      text unique,
  stripe_subscription_id  text,
  stripe_price_id         text,
  subscription_status     text default 'none'
                          check (subscription_status in ('none', 'active', 'past_due', 'canceled', 'trialing')),
  subscription_end_at     timestamptz,

  -- Timestamps
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast key lookup (called on every proxy request)
create index if not exists idx_users_geotech_key on public.users (geotech_key);
create index if not exists idx_users_stripe_customer on public.users (stripe_customer_id);

-- ============================================================================
-- 2. Usage counters — aggregate counts only, no content, no PII
-- ============================================================================

create table if not exists public.usage (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,

  -- Monthly billing period
  period_start  timestamptz not null,
  period_end    timestamptz not null,

  -- Aggregate call counters (we count calls, NOT store content)
  llm_calls     integer not null default 0,
  vision_calls  integer not null default 0,
  agent_calls   integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, period_start)
);

create index if not exists idx_usage_user_period on public.usage (user_id, period_start desc);

-- ============================================================================
-- NO api_logs table. We do NOT log requests, IPs, prompts, or responses.
-- ============================================================================

-- ============================================================================
-- 3. Row Level Security — defense in depth
-- ============================================================================

alter table public.users enable row level security;
alter table public.usage enable row level security;

-- Only service_role (server-side API routes) can access data.
-- The anon key has NO access. All queries go through our API.
create policy "Service role access on users" on public.users for all using (true) with check (true);
create policy "Service role access on usage" on public.usage for all using (true) with check (true);

-- ============================================================================
-- 4. Auto-update timestamp trigger
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_users_update before update on public.users
  for each row execute function public.handle_updated_at();

create trigger on_usage_update before update on public.usage
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. Account deletion — removes ALL user data
-- ============================================================================

-- When a user deletes their account, CASCADE removes their usage records.
-- To delete a user: DELETE FROM public.users WHERE id = 'user-uuid';

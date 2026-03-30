# geotechCLI — Data Privacy & Security

## What We NEVER Do

- **We NEVER store your LLM API keys.** Your OpenAI, Anthropic, Hugging Face, or other provider keys stay exclusively on your machine in `~/.geotechcli/config.json`. When you use a Pro-tier BYOL (Bring Your Own LLM) provider, your CLI sends requests **directly** to the provider — they never pass through our servers.

- **We NEVER store or log the content of your prompts or LLM responses.** The free-tier proxy forwards your messages to the LLM provider and returns the response. Nothing is saved, cached, or logged. Server error logs contain only HTTP status codes, never message content.

- **We NEVER store IP addresses.** Rate limiting uses in-memory or short-lived hashed keys that auto-expire within 60 seconds. No raw IP is ever written to a database.

- **We NEVER share, sell, or transfer any user data to third parties** (beyond Stripe for payment processing).

## What We Store

| Data | Purpose | Where |
|------|---------|-------|
| Email address | Account recovery, billing receipts | Supabase (encrypted at rest) |
| geotechCLI API key (`gtp_...`) | Authenticates your CLI to our proxy | Supabase (encrypted at rest) |
| Subscription tier | Determines your rate limits | Supabase |
| Stripe customer ID | Links your account to billing | Supabase |
| Monthly call counts | Enforces usage quotas (counts only, not content) | Upstash Redis (auto-expires monthly) |

That's it. No names, no locations, no device info, no usage patterns, no conversation history.

## Your LLM API Keys — The Full Picture

```
┌─────────────────────────────┐
│   Your Machine              │
│   ~/.geotechcli/config.json │
│   ┌───────────────────┐     │
│   │ llm.api_key: sk-…│     │    Free tier (Zhipu GLM-5):
│   │ llm.provider: …  │     │    ┌──────────────────┐
│   └───────┬───────────┘     │    │ Our Proxy Server │
│           │                 │───→│ (no keys stored) │───→ Zhipu API
│           │                 │    └──────────────────┘
│           │ Pro tier (BYOL):│
│           └─────────────────│───→ OpenAI / Anthropic / HF DIRECTLY
│                             │    (our server is never involved)
└─────────────────────────────┘
```

- **Free tier**: Your messages route through our proxy, which adds our Zhipu API key server-side. Your messages are forwarded and returned — never stored or logged.
- **Pro/Annual tier (BYOL)**: Your CLI talks directly to your chosen LLM provider. Our server is not in the path at all. Your API key goes straight from your machine to OpenAI/Anthropic/HF.

## Config File Security

Your local config file (`~/.geotechcli/config.json`) contains your LLM API key. We protect it by:

- Setting **file permissions to 0600** (owner read/write only) on Unix/macOS
- Setting **directory permissions to 0700** on the `~/.geotechcli/` directory
- **Auto-repairing** permissions if they're too open (with a warning)
- **Redacting** all key fields in `--json` CLI output

## Your Rights

- **Delete your account**: Contact support@geotechcli.com or use the API. All your data (email, key, usage counts, Stripe link) is permanently deleted via CASCADE.
- **Export your data**: Use `GET /api/usage` with your API key to see everything we store about you.
- **Regenerate your key**: If compromised, use `POST /api/auth` with `action: "regenerate"` to invalidate the old key instantly.

## Security Measures

- All database access uses Supabase Row Level Security (RLS)
- Stripe webhook signatures verified with HMAC-SHA256 + constant-time comparison
- Proxy enforces: 256KB body limit, 15 req/min rate limit, message validation
- Proxy injects a controlled system prompt — prevents LLM abuse for non-geotech queries
- Only `data:image/*` base64 URIs accepted — no external URL fetching
- API keys never appear in logs, error messages, or JSON output

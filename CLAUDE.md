# geotechCLI — Claude Code Guide

## Repo Layout

```
packages/
  cli/    — CLI entry point and commands (geotech binary)
  core/   — shared logic: config, LLM providers, metering, DB
  web/    — Next.js web app: landing, docs, proxy route, Cloudflare deploy
scripts/  — verify-release-consistency.mjs, smoke-web-routes.mjs
supabase/ — schema.sql (future use, not active in strong-beta)
```

Monorepo: npm workspaces + Turborepo. TypeScript throughout.

## Branch Strategy

| Branch | Role |
|--------|------|
| `strong-beta` | Public beta — active deploy target |
| `master` | Ongoing development |
| `main` | Future protected production |

## Common Commands

```bash
npm ci                                        # clean install
npm run build                                 # build all packages
npm run build --workspace=@geotechcli/core    # build core only
npm run verify:consistency                    # release consistency check
npm run smoke:web                             # web route smoke test
npm run build:cf --workspace=@geotechcli/web  # Cloudflare build
npm run cf:check --workspace=@geotechcli/web  # wrangler check
npm run preview --workspace=@geotechcli/web   # local Cloudflare preview
npm run deploy --workspace=@geotechcli/web    # deploy to Cloudflare
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/config/index.ts` | LLM config, defaults, hosted-beta settings |
| `packages/core/src/llm/providers/hosted-beta.ts` | Hosted Qwen beta provider (Modal) |
| `packages/core/src/llm/middleware/metering.ts` | Rate limiting middleware |
| `packages/web/app/api/proxy/route.ts` | Hosted beta proxy API route |
| `packages/web/app/api/usage/route.ts` | Usage/rate-limit endpoint |
| `packages/web/lib/beta.ts` | Beta feature flags and utilities |
| `packages/web/wrangler.jsonc` | Cloudflare Worker config |
| `packages/web/open-next.config.ts` | OpenNext Cloudflare adapter config |

## Strong-Beta Constraints

- No signup, billing, or paid entitlements — intentionally disabled
- Hosted Qwen beta is the default LLM provider (no user API key needed)
- Default text model: `Qwen/Qwen3.5-9B` | Default vision model: `Qwen/Qwen3.5-9B`
- Proxy default: `https://beta.geotechcli.com/api/proxy`
- Rate limiting: Redis-backed (Upstash) with in-memory fallback

## Required Secrets (never commit)

```
MODAL_ENDPOINT_URL
MODAL_API_TOKEN
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_APP_URL=https://beta.geotechcli.com
```

Local dev: put these in `packages/web/.env.local`.
Cloudflare: set as Worker secrets via `wrangler secret put`.

## Deployment Target

- Worker name: `geotechcli-strong-beta`
- Custom domain: `beta.geotechcli.com`
- Cloudflare zone: `geotechcli.com`

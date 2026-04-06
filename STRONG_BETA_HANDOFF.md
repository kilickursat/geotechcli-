# Strong Beta Handoff

Date: 2026-04-06
Branch: `strong-beta`
Repo: `https://github.com/kilickursat/geotechcli-.git`
Target beta host: `beta.geotechcli.com`
Production host later: `geotechcli.com`

This file is the restart point for continuing strong-beta work on another computer.
Use it on your personal PC so we can continue the Cloudflare deploy without needing out-of-sandbox execution on the company machine.

## Purpose

The `strong-beta` branch is the safe public beta branch for geotechCLI.
It is meant to be honest, usable, and deployable without pretending that the full production SaaS stack is already finished.

Intended branch roles:

- `master` = ongoing development
- `strong-beta` = public beta branch
- `main` = future protected production branch

## Strong-Beta Product Contract

What strong beta should provide now:

- working landing page, docs, changelog, and privacy messaging
- installable CLI
- deterministic geotechnical commands available immediately
- hosted GLM beta AI available without requiring end users to bring their own Z.AI key
- server-side anonymous rate limits to protect shared credit
- no signup required
- no live billing or checkout

What strong beta should not claim yet:

- real user accounts
- Supabase-backed signup
- live Stripe billing
- production entitlements or subscriptions
- full production reliability promises

## What Has Been Completed

### Wave 1 completed

- website and pricing were reshaped to behave like a truthful beta instead of a fake finished SaaS
- privacy messaging was added and strengthened across the UI and docs
- broken signup, billing, and checkout expectations were removed from the public beta surface
- CI consistency checks and smoke checks were repaired and pushed

### Wave 2 completed

- hosted beta was added as the default LLM provider for strong beta
- hosted default text model is `glm-5-turbo`
- hosted default vision model is `glm-5v-turbo`
- hosted beta proxy route exists in the web app
- anonymous rate limiting exists with Redis-backed production intent and in-memory local fallback
- no end-user Z.AI key is required for the default beta flow
- CLI JSON output was cleaned up for safer scripting and automation

### Cloudflare deployment prep completed in repo

The repo has been prepared for a Cloudflare Workers deployment path.

Completed repo changes:

- added Worker-safe core subpath exports in `packages/core/package.json`
  - `@geotechcli/core/meta`
  - `@geotechcli/core/db/redis`
- switched web imports away from the top-level `@geotechcli/core` barrel where needed
- changed hosted-beta defaults from apex host to beta host
  - proxy default is now `https://beta.geotechcli.com/api/proxy`
- updated CLI/README/beta-facing links from apex to beta host where appropriate for this branch
- added Cloudflare/OpenNext files:
  - `packages/web/wrangler.jsonc`
  - `packages/web/open-next.config.ts`
- updated `packages/web/package.json` with Cloudflare/OpenNext scripts:
  - `build:cf`
  - `preview`
  - `deploy`
  - `cf:check`
  - `cf-typegen`
- updated `packages/web/next.config.ts` for monorepo tracing with `outputFileTracingRoot`
- added Cloudflare/OpenNext ignore entries in `.gitignore`
- updated layout/footer/privacy/pricing/docs copy so the branch truthfully says hosted GLM beta is active now

### Cloudflare account/domain facts already known

- Cloudflare zone `geotechcli.com` has already been added to the account
- intended beta deployment hostname is `beta.geotechcli.com`
- no Worker deployment should be assumed complete from this company machine

## Important Files

Core and CLI beta defaults:

- `packages/core/src/config/index.ts`
- `packages/core/src/llm/providers/hosted-beta.ts`
- `packages/core/src/llm/middleware/metering.ts`
- `packages/core/tests/config.test.ts`
- `packages/cli/src/ui/terminal.ts`

Web beta and proxy behavior:

- `packages/web/lib/beta.ts`
- `packages/web/app/api/proxy/route.ts`
- `packages/web/app/api/usage/route.ts`
- `packages/web/app/layout.tsx`
- `packages/web/components/Footer.tsx`
- `packages/web/components/Pricing.tsx`
- `packages/web/app/pricing/page.tsx`
- `packages/web/app/docs/page.tsx`
- `packages/web/app/changelog/page.tsx`

Cloudflare deployment files:

- `packages/web/package.json`
- `packages/web/next.config.ts`
- `packages/web/wrangler.jsonc`
- `packages/web/open-next.config.ts`
- `packages/core/package.json`

Repo guidance/docs:

- `README.md`
- `PRIVACY.md`
- `STRONG_BETA_HANDOFF.md`

## What Was Safely Verified On The Company PC

The following commands passed fully inside the sandbox:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run verify:consistency
& 'C:\Program Files\nodejs\npm.cmd' run smoke:web
& 'C:\Program Files\nodejs\npm.cmd' run build --workspace=@geotechcli/core
```

These are green as of this handoff.

## What Was Intentionally Not Done On The Company PC

Because this is a company-managed machine, we intentionally avoided relying on out-of-sandbox execution for final deployment steps.

That means these steps are still pending:

- final `build:cf` validation on a personal machine
- final `wrangler check` validation on a personal machine
- Cloudflare Worker deployment
- Cloudflare Worker secret configuration
- custom-domain activation for `beta.geotechcli.com`
- public post-deploy smoke testing

## Why The Personal PC Is Needed

Two reasons:

- safety and company policy: we should not broaden machine access on the company PC unless clearly allowed
- deployment/runtime validation: OpenNext and Wrangler are better validated in a less restricted environment, and deployment itself involves Cloudflare credentials and outbound network activity

## Local Environment Expectations On Personal PC

### Required local secrets for hosted beta testing

Create a local env file for the web app:

- `packages/web/.env.local`

Use values like:

```env
ZHIPU_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
NEXT_PUBLIC_APP_URL=https://beta.geotechcli.com
```

Optional override for local proxy testing from the CLI:

```powershell
$env:GEOTECHCLI_PROXY_URL="http://127.0.0.1:3000/api/proxy"
```

Do not commit any secret files.

## Exact Next Steps On Personal PC

### 1. Clone and switch to strong-beta

```powershell
git clone https://github.com/kilickursat/geotechcli-.git
cd geotechcli-
git checkout strong-beta
```

### 2. Install dependencies cleanly

```powershell
npm ci
```

### 3. Re-run the safe baseline checks

```powershell
npm run verify:consistency
npm run smoke:web
npm run build --workspace=@geotechcli/core
```

### 4. Validate the Cloudflare build path

From the repo root:

```powershell
npm run build:cf --workspace=@geotechcli/web
npm run cf:check --workspace=@geotechcli/web
```

If these pass, the repo is ready for preview/deploy steps.

### 5. Preview locally if desired

```powershell
npm run preview --workspace=@geotechcli/web
```

### 6. Verify hosted beta proxy health locally

If the Next app is running locally, check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/proxy -Method GET
```

Expected shape:

- `provider: "hosted-beta"`
- `status: "ready"` or a clear degraded message
- defaults showing `glm-5-turbo` and `glm-5v-turbo`

### 7. Validate CLI against the local proxy

In a second PowerShell window:

```powershell
$env:GEOTECHCLI_PROXY_URL="http://127.0.0.1:3000/api/proxy"
$env:GEOTECHCLI_CONFIG_DIR="$PWD\.tmp-geotechcli-validation"
node .\packages\cli\dist\index.js status --json
node .\packages\cli\dist\index.js ai-classify "brown sand with some gravel" --json
node .\packages\cli\dist\index.js agent "Estimate the bearing capacity of a strip footing with width 2 m, embedment 1.5 m, unit weight 18 kN/m3, phi 30 deg, c 0 kPa. Keep assumptions brief." --json
```

### 8. Validate one vision flow

```powershell
node .\packages\cli\dist\index.js vision rmr .\path\to\image.jpg --json
```

### 9. Validate rate limits

Confirm that:

- burst requests trigger the per-minute protection
- repeated calls trigger the daily limit
- JSON mode responses remain structured when limits are hit

### 10. Configure Cloudflare for beta deploy

Once the local build and validation are good, continue with Cloudflare.

Set Worker secrets/vars for the deployed beta:

- `ZHIPU_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_APP_URL=https://beta.geotechcli.com`

Then deploy the beta Worker and attach the custom domain:

- Worker name planned in repo: `geotechcli-strong-beta`
- custom domain target: `beta.geotechcli.com`

### 11. Post-deploy smoke checks

After deployment, verify:

- home page
- docs page
- pricing page
- privacy page
- `GET /api/proxy`
- one text hosted-beta call
- one vision hosted-beta call
- rate-limit behavior

## Recommended Deployment Posture

If the personal-PC validation is clean:

- deploy `strong-beta`
- keep pricing as `Coming Soon`
- keep signup and billing disabled
- present this honestly as a strong beta
- keep apex `geotechcli.com` for later production/main rollout

If validation is not clean:

- do not force public hosted-beta deployment
- either fix the proxy/build/runtime issue first
- or fall back temporarily to a docs + deterministic-only beta posture

## Secrets And Safety Notes

- never commit real secrets
- keep `.env.local` local only
- do not put secrets into `NEXT_PUBLIC_*` variables
- use the company PC only for repo-safe work
- use the personal PC for the actual Cloudflare build/deploy flow

## Restart Instruction

When resuming on the personal PC, start by reading this file first, then run:

```powershell
git rev-parse --short HEAD
git status --short --branch
```

That confirms you are on the expected handoff point before continuing the deployment work.

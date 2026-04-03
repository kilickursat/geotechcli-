# Strong Beta Handoff

Date: 2026-04-03
Branch: `strong-beta`
Repo: `https://github.com/kilickursat/geotechcli-.git`

Use this file as the restart point for continuing `strong-beta` work on another computer or network.
To confirm the exact commit on a fresh machine, run:

```powershell
git rev-parse --short HEAD
```

## Purpose

`strong-beta` is the public beta branch for `geotechcli`.

This branch exists so the product can be deployed and tested publicly in a truthful beta form without pretending that full production billing, signup, or entitlement systems are ready.

The intended branch flow is:

- `master` = ongoing development
- `strong-beta` = deployable beta branch
- `main` = protected production branch for later full release

## Product Intent For Strong Beta

Strong beta is meant to give users a real product experience while keeping risk low.

What strong beta should provide now:

- a working website and docs
- a downloadable/installable CLI
- deterministic geotechnical commands available immediately
- hosted GLM beta AI available without users bringing their own Z.AI key
- rate limits to protect hosted credit and reduce abuse
- clear privacy messaging

What strong beta should not pretend to provide yet:

- signup or account management
- live paid plans
- active Stripe checkout
- active Supabase-backed identity
- final production-grade commercial entitlements

## Beta Contract

### Live now

- deterministic CLI commands
- beta website, docs, changelog, install flow
- hosted beta AI architecture on the branch
- default text model: `glm-5-turbo`
- default vision model: `glm-5v-turbo`
- no signup required for beta usage

### Intentionally disabled

- `/api/auth`
- `/api/checkout`
- `/api/webhook`
- `/api/usage` production-style account usage flow
- paid plan purchase flow
- user signup verification flow

### User-facing truth

- free beta is live
- pro plans are `Coming Soon`
- hosted beta limits protect the shared AI pool
- this is not full production

## What Has Been Done So Far

### Wave 1

- re-scoped the website so it behaves like a truthful beta, not a fake finished SaaS
- added stronger privacy messaging across the landing page, privacy page, docs, and README
- removed broken signup/billing promises from the public beta surface
- changed pricing posture to beta-safe messaging
- fixed build/test baseline issues and established a working local toolchain
- pushed Wave 1 baseline and CI hotfixes to GitHub on `strong-beta`

### Wave 2

- added hosted beta as the default LLM provider for strong beta
- switched default hosted models to:
  - `glm-5-turbo`
  - `glm-5v-turbo`
- added the hosted beta provider adapter in the CLI/core path
- added the hosted beta proxy route in the web app
- added anonymous rate limiting with Redis-backed production intent and memory fallback for local development
- kept hosted limits at:
  - `10` requests/minute per IP
  - `25` text requests/day
  - `5` vision requests/day
  - `3` agent requests/day
- updated docs, changelog, and UI copy to reflect hosted beta reality

### Offline-safe cleanup completed after Wave 2

- fixed CLI `--json` behavior so error paths can return structured JSON instead of human-only text
- suppressed agent preamble output in JSON mode so automation does not break on `agent --json`
- adjusted JSON sanitization so boolean status fields are preserved while string secrets are still redacted
- added a CLI test guardrail for JSON redaction behavior
- corrected the changelog wording so it matches actual hosted beta behavior

## Important Files

Core hosted beta pieces:

- [packages/core/src/meta/metadata.json](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/core/src/meta/metadata.json)
- [packages/core/src/config/index.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/core/src/config/index.ts)
- [packages/core/src/llm/providers/hosted-beta.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/core/src/llm/providers/hosted-beta.ts)
- [packages/core/src/llm/router.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/core/src/llm/router.ts)

CLI strong-beta behavior:

- [packages/cli/src/commands/ai.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/cli/src/commands/ai.ts)
- [packages/cli/src/commands/status.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/cli/src/commands/status.ts)
- [packages/cli/src/commands/config.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/cli/src/commands/config.ts)
- [packages/cli/src/ui/terminal.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/cli/src/ui/terminal.ts)
- [packages/cli/tests/terminal.test.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/cli/tests/terminal.test.ts)

Web strong-beta behavior:

- [packages/web/lib/beta.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/lib/beta.ts)
- [packages/web/app/api/proxy/route.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/app/api/proxy/route.ts)
- [packages/web/app/api/auth/route.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/app/api/auth/route.ts)
- [packages/web/app/api/checkout/route.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/app/api/checkout/route.ts)
- [packages/web/app/api/webhook/route.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/app/api/webhook/route.ts)
- [packages/web/app/api/usage/route.ts](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/packages/web/app/api/usage/route.ts)

Operational docs and CI:

- [README.md](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/README.md)
- [CHANGELOG.md](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/CHANGELOG.md)
- [.github/workflows/ci.yml](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/.github/workflows/ci.yml)
- [scripts/verify-release-consistency.mjs](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/scripts/verify-release-consistency.mjs)
- [scripts/smoke-web-routes.mjs](/Users/52500985/Downloads/geotechcli--master/geotechcli--master/__strong_beta_repo/scripts/smoke-web-routes.mjs)

## Deployment Posture

### Current posture

- this branch is meant for beta deployment, not final production
- Cloudflare deployment has not been completed yet
- Stripe is intentionally inactive
- Supabase is intentionally inactive
- the UI has been reshaped for beta honesty
- the hosted beta AI path is implemented on the branch

### Recommended public deployment posture

- deploy `strong-beta`, not `main`
- prefer a beta hostname first, such as `beta.geotechcli.com`
- keep `main` protected until hosted beta validation succeeds on an unrestricted network and deployment behaves well

### Cloudflare and domain posture

- domain: `geotechcli.com`
- registrar: Namecheap
- intended platform: Cloudflare
- current recommendation: deploy beta on a beta host first, then decide whether to move the apex later

## Privacy and Safety Positioning

The beta messaging now emphasizes that:

- users do not need signup for strong beta
- geotechCLI should not store raw project prompts/files as part of the intended hosted beta path
- the hosted beta gateway keeps minimal short-lived hashed metadata for abuse prevention and service health
- geotechCLI should not use user engineering content to train its own product

Important nuance:

- requests still go to the upstream model provider to generate responses
- privacy copy must stay honest and must not promise impossible guarantees beyond the actual system behavior

## Environment Variables

### Local web server env

For local Next.js testing, use:

- `packages/web/.env.local`

Required for hosted beta validation:

```env
ZHIPU_API_KEY=...
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Recommended for production-like anonymous limits:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Optional:

```env
ZAI_API_BASE_URL=https://api.z.ai/api/paas/v4/chat/completions
```

### CLI local override

The CLI does not read `packages/web/.env.local`.

For local CLI-to-local-proxy testing, set this in the PowerShell session or CLI config:

```powershell
$env:GEOTECHCLI_PROXY_URL="http://127.0.0.1:3000/api/proxy"
```

Optional isolation for local config:

```powershell
$env:GEOTECHCLI_CONFIG_DIR="$PWD\.tmp-geotechcli-validation"
```

### Not needed in strong beta

- `SUPABASE_*`
- `STRIPE_*`

## What Was Verified

The following checks passed on this machine:

```powershell
npm run verify:consistency
npm run smoke:web
npm run test
```

Notes:

- `npm run test` needed to be run outside the sandbox because Windows worker spawning was blocked inside the sandbox
- build, typecheck, CLI test, core test, and web build all completed successfully

## Where We Left Off

### Local hosted beta validation status

The local proxy could be started and reached locally, but real hosted beta completions could not be validated on the current company network.

Observed result:

- hosted beta upstream call failed with `fetch failed`

This should be treated as a network/environment blocker, not as proof that Wave 2 code is broken.

### What was learned from the failed validation attempt

- the web proxy can come up locally
- the repo-level checks are green
- the current company network appears to restrict the upstream call path needed for Z.AI and/or related outbound requests
- continuing to probe around those restrictions is not appropriate

## Exact Next Steps On Another Machine or Network

### 1. Prepare the machine

Install Node.js LTS and verify:

```powershell
node -v
npm -v
```

### 2. Clone and install

```powershell
git clone https://github.com/kilickursat/geotechcli-.git
cd geotechcli-
git checkout strong-beta
npm ci
```

### 3. Add local env

Create `packages/web/.env.local` with:

```env
ZHIPU_API_KEY=...
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Keep secrets local only. Do not commit them.

### 4. Re-run the baseline checks

```powershell
npm run verify:consistency
npm run smoke:web
npm run test
```

### 5. Start the local web app

```powershell
npm run dev --workspace=packages/web
```

### 6. Check proxy health directly

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/proxy -Method GET
```

Expected shape:

- `provider: "hosted-beta"`
- `status: "ready"` or a clear degraded message
- default models shown as `glm-5-turbo` and `glm-5v-turbo`

### 7. Validate CLI against the local proxy

In a second PowerShell:

```powershell
$env:GEOTECHCLI_PROXY_URL="http://127.0.0.1:3000/api/proxy"
$env:GEOTECHCLI_CONFIG_DIR="$PWD\.tmp-geotechcli-validation"
node .\packages\cli\dist\index.js status --json
node .\packages\cli\dist\index.js ai-classify "brown sand with some gravel" --json
node .\packages\cli\dist\index.js agent "Estimate the bearing capacity of a strip footing with width 2 m, embedment 1.5 m, unit weight 18 kN/m3, phi 30 deg, c 0 kPa. Keep assumptions brief." --json
```

### 8. Validate one vision path

Use a representative image on the unrestricted machine:

```powershell
node .\packages\cli\dist\index.js vision rmr .\path\to\image.jpg --json
```

### 9. Validate rate limiting behavior

Confirm:

- repeated quick requests trigger per-minute protection
- repeated daily usage triggers the daily beta limit
- responses stay structured in JSON mode

### 10. Decide deployment

If the unrestricted-network validation is clean:

- deploy `strong-beta` to Cloudflare
- set hosted beta env vars in Cloudflare
- keep pricing as `Coming Soon`
- keep signup/billing disabled

## Recommended Deployment Response

If unrestricted-network validation succeeds, the correct deployment answer is:

- deploy as a strong beta
- do not market it as full production
- do not enable billing yet
- do not enable signup yet
- expose deterministic CLI and hosted GLM beta AI
- communicate clear beta limits and privacy posture

If unrestricted-network validation fails, the correct response is:

- do not force deployment of hosted AI
- either fix the upstream/proxy issue first
- or temporarily launch a deterministic-only / documentation-first beta

## Known Risks

- hosted beta upstream path has not yet been validated successfully from an unrestricted network
- production anonymous limits depend on correct Upstash configuration
- this branch is beta-ready in structure, but still needs one clean external validation loop before public confidence is justified
- full production commercialization still depends on later Stripe and identity work

## Final Safety Notes

- never commit real secrets
- keep `.env.local` files local only
- keep `master` as development branch
- keep `main` protected
- keep `strong-beta` as the beta deployment branch until the product is genuinely ready for production

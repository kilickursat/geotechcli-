# Strong Beta Handoff

Date: 2026-05-01
Branch: `strong-beta`
Repo: `https://github.com/kilickursat/geotechcli-.git`
Current branch head: see git history for the latest `strong-beta` release commit
Current release in repo: `0.4.33` local release candidate until the approved commit/tag/push
Beta host: `https://beta.geotechcli.com`
Hosted text/agent model: `glm-5.2`
Hosted vision model: `glm-5v-turbo`
Hosted runtime: Z.ai API through the Cloudflare hosted-beta proxy

This file is a strong-beta restart note. Treat package metadata, `CHANGELOG.md`, and `packages/web/app/api/version` as the release truth when they differ from older historical notes below.

Related internal policy:

- `STRONG_BETA_SKILLS_POLICY.md` defines the protected rollout rules for skills, agent skill calls, and prompt-cache work on this branch.
- `STRONG_BETA_SKILLS_CERTIFICATION.md` records which bundled skills are currently approved, held back, or prompt-only after certification on this branch.

## Purpose

The `strong-beta` branch is the truthful public beta branch for geotechCLI.
It should feel usable and serious without pretending that the full production SaaS stack is already complete.

Intended branch roles:

- `master` = active development
- `strong-beta` = public beta branch
- `main` = later protected production branch

## Strong-Beta Product Contract

What strong beta provides now:

- public landing page, docs, changelog, and privacy pages
- installable CLI through npm
- deterministic geotechnical commands
- hosted GLM beta AI without requiring end users to bring their own API key
- hosted text and vision routed through the beta proxy
- anonymous rate limiting and daily usage controls
- no signup requirement
- no live billing or checkout

What strong beta should not claim yet:

- production-grade uptime guarantees
- real user accounts
- Supabase-backed signup
- live Stripe billing
- production entitlements or subscriptions

## Current Architecture

### CLI + Core

- `packages/cli` is the published CLI surface
- `packages/core` contains deterministic engineering logic, hosted-beta routing, agent orchestration, intake/preflight logic, and shared metadata
- default provider is `hosted-beta`
- default text model is `glm-5.2`
- default vision model is `glm-5v-turbo`

### Web + Proxy

- `packages/web` is the Next.js + OpenNext + Cloudflare beta site
- `packages/web/app/api/proxy/route.ts` is the hosted-beta proxy
- proxy forwards to Z.ai using the server-side `ZHIPU_API_KEY`
- proxy still retries transient text failures, but vision and agent requests remain single-attempt to avoid multiplying hosted-provider spend

### Legacy Modal

- `modal/serve_qwen.py` remains in the repo as a legacy fallback
- `.github/workflows/modal-deploy.yml` is disabled by default and can be run manually only with explicit input
- it is no longer the active hosted-beta runtime

## Budget Posture

Important constraint:

- shared hosted credits are now on Z.ai GLM rather than Modal GPU spend
- do not add retries or scaling patterns that silently multiply provider spend

Recent budget-safe work:

- agent proxy calls are single-attempt instead of multi-retry
- warmup and timeout messaging is now explicit instead of misleading
- agent timeout budgets were raised to better match actual Modal cold-start behavior, but without adding extra upstream attempts

## What Was Completed Across 0.4.6 to 0.4.26

### Release + pipeline alignment

- workspace packages were version-aligned and internal package pins were tightened
- release consistency checks were strengthened
- versioned release flow was cleaned up so npm/site/CLI metadata stay aligned when a real version bump is pushed

### Hosted beta + Modal reliability

- hosted beta was standardized on `Qwen/Qwen3.5-9B`
- old broken `modal-http` path was removed in favor of the vLLM OpenAI-compatible server
- Modal vLLM deploy path was corrected for current package availability and multimodal flag syntax
- Cloudflare beta site and CLI defaults were aligned to the same hosted model

### Agent behavior

- under-specified geotechnical prompts now hit a domain-driven intake/preflight layer instead of wasting a long hosted round trip
- foundation, liquefaction, tunnel/TBM, and related geotechnical prompt families now return immediate data requirements when evidence is missing
- evidence-backed requests still go through the hosted model
- generic first-turn hosted failures now fall back more cleanly
- `geotech chat` and `geotech agent` now show live waiting states instead of feeling frozen

### UX + plotting

- CLI answer rendering was upgraded from raw markdown-like output to richer terminal presentation
- interactive browser plot viewer replaced the old ASCII-first experience for supported flows
- plot layout, labels, legends, and viewer chrome were cleaned up significantly

### Historical 0.4.11 changes

- first-turn hosted fallback now explicitly says when the Modal.com GPU is warming up or the timeout budget was exceeded
- live CLI waiting states now mention Modal warmup during slow hosted responses
- hosted-beta agent timeout budgets were raised to better match real cold starts
- proxy agent calls now use a single upstream attempt, which is better for the current L4 budget
- regression coverage was added for warmup/timeout fallback wording and no-retry agent proxy behavior

## Historical Local Verification Before The 0.4.11 Push

These checks passed locally on the latest repo state:

```powershell
npm run verify:consistency
npm run --workspace=@geotechcli/core test
node .\node_modules\vitest\vitest.mjs run --pool threads packages/web/lib/beta.test.ts
npm run --workspace=geotechcli build
npm run --workspace=@geotechcli/web build
npm run smoke:web
```

Notes:

- `packages/web/lib/beta.test.ts` needed `--pool threads` in this Windows environment because default Vitest worker spawning hit an `EPERM` process-spawn issue
- repo head was pushed successfully to `origin/strong-beta`

## Current Remote State

As of the 2026-04-24 strong-beta handoff:

- local `strong-beta` head before these reliability fixes was `813985f`
- latest public remote release version is `0.4.25` until the v0.4.26 reliability fix commit is pushed
- GitHub Actions should handle npm publish and beta-site deployment from the version commit

What still needs remote verification after a versioned push:

- npm shows the next released `geotechcli` version
- beta site deployed version endpoint reflects the same next released version
- hosted-beta path on the deployed site is healthy after the pipeline completes
- Modal deploy workflow completed when the release affected the hosted Modal runtime or its serving contract
- Modal health endpoint reflects the expected hosted runtime after deploy

## Important Files

### Hosted beta + agent logic

- `packages/core/src/agents/brain.ts`
- `packages/core/src/agents/intake.ts`
- `packages/core/src/llm/providers/hosted-beta.ts`
- `packages/core/src/config/index.ts`
- `packages/core/src/meta/metadata.json`
- `modal/serve_qwen.py`

### CLI UX

- `packages/cli/src/commands/ai.ts`
- `packages/cli/src/ui/terminal.ts`
- `packages/cli/src/ui/plot-viewer.ts`
- `packages/cli/src/util/viz.ts`

### Web + proxy

- `packages/web/app/api/proxy/route.ts`
- `packages/web/lib/beta.ts`
- `packages/web/app/changelog/page.tsx`
- `packages/web/app/docs/page.tsx`
- `packages/web/app/pricing/page.tsx`
- `packages/web/wrangler.jsonc`
- `packages/web/open-next.config.ts`

### Release + docs

- `CHANGELOG.md`
- `README.md`
- `STRONG_BETA_SKILLS_POLICY.md`
- `STRONG_BETA_SKILLS_CERTIFICATION.md`
- `scripts/verify-release-consistency.mjs`
- `.github/workflows/release.yml`
- `.github/workflows/modal-deploy.yml`

## Recommended Restart Steps

When resuming work on another machine:

```powershell
git clone https://github.com/kilickursat/geotechcli-.git
cd geotechcli-
git checkout strong-beta
git rev-parse --short HEAD
git status --short --branch
npm ci
```

Then re-run the current baseline:

```powershell
npm run verify:consistency
npm run --workspace=@geotechcli/core test
node .\node_modules\vitest\vitest.mjs run --pool threads packages/web/lib/beta.test.ts
npm run --workspace=geotechcli build
npm run --workspace=@geotechcli/web build
npm run smoke:web
```

If checking the live deployed state after CI finishes:

1. Confirm npm version:

```powershell
npm view geotechcli version
```

2. Confirm beta branch head:

```powershell
git ls-remote origin refs/heads/strong-beta
```

3. Confirm beta proxy health:

```powershell
Invoke-RestMethod https://beta.geotechcli.com/api/proxy -Method GET
```

4. Confirm Modal hosted runtime health when relevant:

```powershell
Invoke-RestMethod https://kursatkilic6648--geotechcli-qwen-serve.modal.run/health
```

5. Confirm one installed CLI check after npm publish:

```powershell
geotech --version
geotech status --json
```

## Operational Notes

- Do not manually stop the deployed Modal app if you want automatic cold-start recovery; let autoscaling idle it down naturally
- If the app is only idle-scaled down, the next hosted request should start it again
- If the app is undeployed or manually stopped at the deployment level, the CLI cannot recover automatically
- Cold starts are expected to be slow; this is acceptable for now given the budget posture
- The goal of the latest fix was to make that slowness honest, less misleading, and less wasteful

## End-of-Day Summary

The repo is in a good stopping state.
`0.4.11` is committed and pushed, local verification is green, hosted-beta warmup behavior is more honest, and the current fixes were made with the Modal budget in mind.

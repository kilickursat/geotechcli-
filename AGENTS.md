# AGENTS.md

This repository is a monorepo for `geotechCLI`, a strong-beta geotechnical engineering CLI with deterministic calculations, hosted AI workflows, agentic execution, bundled skills, and a public beta website.

## Repo Map

- `packages/core`: shared engineering engines, LLM/provider routing, agent loops, swarm orchestration, tool registry, exports, skills, config, and shared metadata.
- `packages/cli`: the published CLI surface (`geotech`, `geotechcli`), terminal rendering, and user-facing command registration.
- `packages/web`: the strong-beta website, docs, changelog, pricing page, and `/api/version` release contract.
- `scripts/verify-release-consistency.mjs`: checks that versioned release surfaces stay aligned.
- `scripts/smoke-web-routes.mjs`: basic web smoke verification.

## Product Rules

- Treat `strong-beta` as the public truth. Do not advertise unfinished, disabled, or removed features.
- Direct `geotech skill ...` commands are part of the live CLI surface. Agent and chat skill use is opt-in per session with `--skills`.
- Hosted beta defaults should stay aligned across CLI, docs, website, and release metadata.
- If a feature is removed or renamed, scrub it from:
  - CLI registration
  - core exports and agent prompts
  - website docs, pricing, changelog, and README
  - tests and release notes

## Working Expectations

- Keep changes consistent across the monorepo. If the shipped product behavior changes, update the CLI, core, and web surfaces together when needed.
- When shipping a new version, keep these aligned:
  - `packages/core/package.json`
  - `packages/cli/package.json`
  - `packages/web/package.json`
  - `packages/core/src/meta/metadata.json`
  - `CHANGELOG.md`
  - `packages/web/app/changelog/page.tsx`
- Prefer targeted fixes over broad refactors unless the task clearly requires a larger change.
- Preserve the existing strong-beta behavior unless the task explicitly changes it.

## Verification

Run the smallest useful set first, then expand if the change touches release surfaces:

- `npm run verify:consistency`
- targeted `vitest` coverage for changed agent/tool/runtime paths
- `npm run build`
- `npm run smoke:web`
- `npm run --workspace=@geotechcli/web build:cf` for website or release-surface changes

For release validation, confirm downstream surfaces after push/tag:

- npm package `geotechcli`
- npm package `@geotechcli/core`
- live `https://beta.geotechcli.com/api/version`
- remote git tag and pushed branch

## Practical Notes

- The CLI is the user-facing contract. If command help changes, docs should usually change too.
- The website changelog is curated and not a raw dump of git commits.
- Agent prompts and tool allowlists are part of the shipped behavior. Keep them aligned with the actual available tools.

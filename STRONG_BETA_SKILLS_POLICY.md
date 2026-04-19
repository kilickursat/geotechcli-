# Strong Beta Skills Policy

Date: 2026-04-19
Branch: `strong-beta`
Applies from release baseline: `0.4.11`

This document is the implementation policy for skill work on the `strong-beta` branch.
It exists to protect the current healthy `0.4.11` beta while skills are introduced incrementally.

## Branch Rule

- Treat `0.4.11` behavior as the protected baseline.
- Add skills to `strong-beta` only in ways that are reversible, opt-in, and testable.
- Do not merge skill work that changes default CLI or agent behavior unless the change is explicitly approved after validation on this branch.

## Non-Negotiable Invariants

- When skills are disabled, `geotech agent`, `geotech chat`, deterministic commands, hosted-beta proxy flows, and project persistence must behave the same as `0.4.11`.
- Skills must be additive. They must not replace or silently rewrite the current deterministic toolchain.
- Skills must not increase hosted-beta retries, background warmup behavior, or hidden token usage by default.
- Skills must not bypass existing guardrails, case-file persistence, sandboxing, or error-path honesty.
- Skills must not require a user API key on `strong-beta`.
- A push is not considered a public beta release unless the intended version is aligned across GitHub, npm, the beta site on Cloudflare, and the hosted Modal deployment used by the beta proxy.

## Skill Integration Model

- Agents may call skills, but only through explicit controlled surfaces such as a dedicated skill tool or pinned CLI option.
- Do not inject all installed skill bodies into the base agent prompt.
- Do not auto-run multiple skills by default.
- In the first rollout, keep skill routing `off` by default and make skill use opt-in.
- In the first rollout, allow at most one automatically selected skill per turn when skills are enabled in auto mode.
- Treat skills as orchestration and judgment layers around the existing deterministic engines unless a specific skill is promoted into a native core tool.
- Keep skill execution observable. The session should show that a skill was selected, run, and what artifacts it produced.

## Trust And Runtime Rules

- Import only local skills from validated ZIPs or validated directories.
- Normalize all skill installs into a geotechCLI-owned local skills directory under `~/.geotechcli`.
- Reject archives with path traversal, unsupported executable types, or duplicate canonical names unless the operator explicitly forces replacement.
- Run executable skills in a fresh geotechCLI-owned workspace directory, not in the source archive location.
- Do not pass credential-bearing environment variables into skill subprocesses unless a later explicit policy says otherwise.
- Keep prompt-only skills and executable skills as separate runtime classes.

## Prompt Cache Policy

- There is no first-class prompt cache in `0.4.11`; any cache added for skills must be local, bounded, and transparent.
- Allowed cache: parsed skill manifests and normalized metadata.
- Allowed cache: skill selection results for the current task signature.
- Allowed cache: assembled skill prompt fragments keyed by skill version, provider, model, and install hash.
- Disallowed cache: provider responses.
- Disallowed cache: hosted proxy prompt replay data.
- Disallowed cache: raw uploaded project files or full file contents reused as prompt blobs.
- Disallowed cache: cross-project hidden reuse of sensitive engineering input.
- Every cache entry must be invalidated by at least skill install change, geotechCLI version change, and relevant model/provider change.
- Cache misses must fall back cleanly to the non-cached path without changing user-visible correctness.

## Rollout Order

- Phase 1: import, list, validate, and inspect skills with no agent auto-routing.
- Phase 2: direct skill execution from an explicit CLI command with project and case-file persistence.
- Phase 3: pinned agent skill usage where the user names or enables a skill explicitly.
- Phase 4: limited auto-selection for a small approved set of skills with strong tests and clear value.
- Phase 5: native promotion of the highest-value skills into `packages/core` where appropriate.

## Testing And Release Gates

- Before merging skill work, re-run the current strong-beta baseline.
- Baseline command: `npm run verify:consistency`
- Baseline command: `npm run --workspace=@geotechcli/core test`
- Baseline command: `node .\node_modules\vitest\vitest.mjs run --pool threads packages/web/lib/beta.test.ts`
- Baseline command: `npm run --workspace=geotechcli build`
- Baseline command: `npm run --workspace=@geotechcli/web build`
- Baseline command: `npm run smoke:web`
- Add focused tests for skill discovery, validation, routing, execution, persistence, and failure handling.
- Add regression coverage proving the default no-skill path is unchanged.
- Do not ship a skill feature that only works when network, hosted-beta, or external software is available unless the degraded path is explicit and tested.
- Any change that affects user-visible runtime behavior, packaged CLI behavior, hosted-beta behavior, or deployment behavior must carry a version bump before it is treated as releasable.
- A strong-beta release is only complete after these remote surfaces are updated and verified:
- GitHub `strong-beta` head contains the intended release commit.
- npm publishes the matching `geotechcli` and `@geotechcli/core` package versions where applicable.
- Cloudflare deploys the matching beta site and proxy behavior.
- Modal GitHub Actions deploy updates the hosted runtime when the change affects the Modal app or hosted-beta runtime contract.
- Post-release verification must confirm the live beta site, the published CLI, and the hosted Modal health endpoint are all serving the expected release/runtime state.

## Strong-Beta Acceptance Criteria

- A user who never enables skills sees no regression.
- A user who enables skills can see which skill ran and why.
- A failed skill run degrades honestly to the current agent or deterministic path without corrupting project state.
- Skill outputs map cleanly into project memory and case-file artifacts when a project context exists.
- Skill work does not materially worsen hosted-beta latency or budget posture for ordinary beta usage.

## Immediate Guidance For Current Work

- Start with skill infrastructure and feature flags, not broad automatic routing.
- Prefer explicit `skill import`, `skill list`, `skill show`, and `skill run` surfaces before changing `geotech agent`.
- Add agent skill calling only after the direct skill runner is stable and test-covered.
- Keep prompt cache limited to skill metadata and prompt assembly in the first implementation.
- Treat the tunnel and geotech skill bundles as candidates for controlled onboarding, not as trusted runtime behavior by default.

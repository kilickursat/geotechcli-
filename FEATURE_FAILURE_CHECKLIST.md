# Feature Failure Checklist

## Purpose

Use this checklist before merging feature work that touches `packages/core`, `packages/cli`, `packages/web`, release metadata, or hosted-beta behavior.

- [ ] Confirm the change is reflected everywhere the product contract is exposed.
- [ ] Confirm runtime wiring exists in every path that needs the feature.
- [ ] Confirm `runAgent` and `runSwarm` still behave intentionally, not just successfully.

## When To Use This Checklist

- [ ] New CLI command, subcommand, flag, alias, or output mode
- [ ] New deterministic calculator or engineering workflow
- [ ] New agent tool, skill tool, deliverable tool, or project-memory tool
- [ ] New hosted-beta, provider, model, or proxy behavior
- [ ] New report, export, artifact, case-file, or evidence flow
- [ ] Any change to shared defaults, versioning, release messaging, or website examples

## 1. Release Surface Drift

- [ ] If version, defaults, or global flags changed, update `packages/core/src/meta/metadata.json`.
- [ ] Keep `packages/core/package.json`, `packages/cli/package.json`, and `packages/web/package.json` aligned with shared metadata.
- [ ] Update `README.md` if install steps, command examples, defaults, or public behavior changed.
- [ ] Update `packages/web/app/docs/page.tsx` if command surface, examples, or global flags changed.
- [ ] Update `packages/web/app/pricing/page.tsx` if default provider/model or beta-scope messaging changed.
- [ ] Update `packages/web/app/changelog/page.tsx` for user-visible shipped changes and current release entry.
- [ ] Update `.env.example` if environment variables, proxy URLs, or deployment expectations changed.
- [ ] Check `/api/version` still matches the shipped version and defaults in `packages/web/app/api/version/route.ts`.
- [ ] If a feature was renamed, removed, or newly shipped, scrub or add it across CLI help, README, docs, pricing, changelog, and release notes together.
- [ ] Treat website copy as part of the shipped contract, not marketing-only text.

## 2. Tool Registration And Runtime Wiring

- [ ] Add the tool definition and executor to the runtime registry used by the feature path, including `packages/core/src/agents/tools.ts` or the module that performs the actual registration.
- [ ] Confirm the tool is actually registered at runtime, not only defined in source.
- [ ] If the tool is registered by side-effect import, add or update the needed import in every runtime path that must see it.
- [ ] Check `packages/core/src/agents/brain.ts` for single-agent runtime imports.
- [ ] Check `packages/core/src/agents/swarm.ts` for swarm runtime imports.
- [ ] If the tool is a deliverable or report/export helper, also check `packages/core/src/agents/deliverable-tools.ts` and confirm the intended runtimes import it.
- [ ] If the tool should be available in swarm mode, update the relevant `ROLE_TOOL_ALLOWLIST` entries in `packages/core/src/agents/swarm.ts`.
- [ ] If the tool should be hidden from some swarm roles, verify the restriction is deliberate and documented in code.
- [ ] Confirm prompts or tool descriptions expose the tool so the model can actually call it.
- [ ] If the tool changes argument shape or enums, update normalization and guardrail logic as needed.
- [ ] If the tool intersects with skills, verify skill gating, approval, and trust-policy implications.
- [ ] If the tool creates reports or exports, verify any deliverable-tool wiring separately from base tool registration.

## 3. runAgent vs runSwarm Parity

- [ ] Check whether the change belongs in `runAgent`, `runSwarm`, or both.
- [ ] If the feature changes intake logic, check `packages/core/src/agents/intake.ts` and any preflight entry points that call it.
- [ ] Verify intake or preflight behavior stays aligned where it should, especially for under-specified engineering requests.
- [ ] Verify hosted-beta fallback behavior stays aligned where it should, especially for first-turn unavailability, warmup, and timeout cases.
- [ ] Confirm tool availability differences between single-agent and swarm are intentional.
- [ ] Confirm skill availability differences between single-agent and swarm are intentional.
- [ ] If the feature writes artifacts, reports, or exports, confirm both runtimes can reach the same outputs when expected.
- [ ] Confirm swarm reviewer correction cycles still make sense with the new behavior.
- [ ] Confirm final-answer shape remains acceptable in both paths, since swarm synthesizes a final report differently from single-agent mode.
- [ ] Do not assume a fix in `packages/core/src/agents/brain.ts` automatically fixes `packages/core/src/agents/swarm.ts`.

## 4. CLI Contract Checks

- [ ] Register new commands in `packages/cli/src/index.ts` in the correct command group.
- [ ] Keep CLI behavior thin: calculation logic in `@geotechcli/core`, presentation logic in `packages/cli/src/ui` or CLI utilities.
- [ ] If the command supports machine-readable output, verify `--json`.
- [ ] If the command is long-running or verbose, verify `--quiet` and `--verbose`.
- [ ] If the command can preview or skip work, verify `--dry-run`.
- [ ] If the command writes output, verify `--output`.
- [ ] If the command supports plots, confirm browser and ASCII fallback behavior are still correct.
- [ ] Confirm error messages remain explicit and safe for users, especially for missing inputs and export failures.
- [ ] Confirm secrets are still redacted in JSON output and top-level error output.
- [ ] If changing `status`, `liquefaction`, or `export`, remember release checks assert specific behavior and wording.

## 5. Web / Hosted-Beta Contract Checks

- [ ] If hosted-beta request behavior changed, update `packages/web/app/api/proxy/route.ts` and `packages/web/lib/beta.ts` together.
- [ ] If default provider or model behavior changed, confirm CLI, web pages, proxy defaults, and `/api/version` all agree.
- [ ] If auth behavior changed, verify the strong-beta stance is still intentional in `packages/web/app/api/auth/route.ts`.
- [ ] If billing behavior changed, verify the strong-beta stance is still intentional in `packages/web/app/api/checkout/route.ts`.
- [ ] If usage-account behavior changed, verify the strong-beta stance is still intentional in `packages/web/app/api/usage/route.ts`.
- [ ] If webhook behavior changed, verify the strong-beta stance is still intentional in `packages/web/app/api/webhook/route.ts`.
- [ ] If the change affects public examples, update `packages/web/app/docs/page.tsx` and `README.md` together.
- [ ] If the feature affects release messaging, update `packages/web/app/changelog/page.tsx` and any homepage callouts that mention it.
- [ ] If editing site copy or UI text, visually sanity-check for encoding or mojibake regressions in web components.
- [ ] If deployment or proxy env expectations changed, update `.env.example` and confirm CI/release assumptions still hold.

## 6. Verification Before Merge

- [ ] Run `npm.cmd run verify:consistency`.
- [ ] Run `npm.cmd run smoke:web`.
- [ ] Run targeted tests for the touched area in `core`, `cli`, or `web`.
- [ ] Run a broader build only when the feature affects release surfaces, packaging, or deployment-sensitive behavior.
- [ ] If agent behavior changed, cover both single-agent and swarm paths where relevant.
- [ ] If tool wiring changed, verify the tool is callable in the runtime path that is supposed to expose it.
- [ ] If docs or release surfaces changed, confirm the final state is consistent across CLI, website, and metadata.

## Final Review Prompt

Before merging, ask:

- [ ] Did I ship one coherent product change, or only a local code change?
- [ ] Is every runtime path that should expose this feature actually wired for it?
- [ ] If a user tries this through CLI help, docs, website, single-agent mode, and swarm mode, will they see the same truth?

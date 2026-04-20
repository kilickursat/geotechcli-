# Changelog

## [0.4.21] - 2026-04-20

### Agent Internals Hardening

- Added a dedicated proprietary-internals refusal policy across the main agent, swarm, and exported legacy multi-agent orchestrator paths so requests for hidden prompts, internal instructions, repo layout, or protected source files are blocked before any model call is made.
- Hardened the agent filesystem and shell sandbox against geotechCLI repo-internal disclosure by blocking direct reads of protected source/build/test areas and by rejecting broad root-level enumeration when the CLI is run from its own source checkout.
- Kept normal project flexibility intact by preserving high-level product explanations, ordinary user project subdirectory scanning, and the existing opt-in command runner behavior while adding regression coverage for the new protection boundaries.

## [0.4.20] - 2026-04-20

### Internal Agent Guidance Cleanup

- Added a repo-level `AGENTS.md` guide so maintainers and coding agents can follow the current strong-beta architecture, release workflow, and verification expectations more consistently.
- Removed a stale internal swarm prompt reference to the deleted local integration surface so the shipped multi-agent guidance matches the real toolset and beta scope.
- Kept the strong-beta build green after the internal agent-guidance cleanup so the CLI, core package, and web app stay aligned on the new release.

## [0.4.19] - 2026-04-20

### Beta Surface Cleanup

- Trimmed an unfinished local integration surface from the shipped beta so the public CLI only exposes features that are currently supported end to end.
- Removed the related internal tool wiring and exports so the packaged runtime and public API surface stay aligned with the current beta scope.
- Cleaned docs, pricing copy, README content, and release notes so the website reflects the supported feature set more accurately.

## [0.4.18] - 2026-04-20

### Strong-Beta Skills Visibility Update

- Added a dedicated geotech skill section to the public docs with concrete list, show, validate, run, and agent-session examples so bundled skills are documented as a first-class strong-beta surface.
- Added a homepage bundled-skills showcase on the beta site, including a direct docs link and terminal examples for direct CLI use and the per-session --skills agent opt-in path.
- Updated the public beta capability messaging to show the bundled strong-beta skill catalog more explicitly instead of leaving skills buried inside release notes or command help.

## [0.4.17] - 2026-04-20

### Strong-Beta Bundled Skills Extraction Hotfix

- Replaced bundled skill ZIP extraction with a pure JavaScript path inside `@geotechcli/core`, so first-use skill bootstrap no longer depends on external `tar` or `python` executables just to list or inspect installed skills.
- Preserved the existing strong-beta skill catalog and agent `--skills` session opt-in behavior while removing the Windows-specific archive extraction footgun that could block fresh local skill discovery.
- Kept the archive entry path validation in place so bundled skill imports still reject unsafe ZIP paths during bootstrap and nested archive discovery.

## [0.4.16] - 2026-04-20

### Strong-Beta Agent Skill Opt-In

- Added an explicit `--skills` session flag to `geotech agent` and `geotech chat`, so users can opt a single AI session into installed skill tools without turning skill routing on globally.
- Kept direct `geotech skill ...` commands ready by default while preserving the strong-beta default that ordinary agent sessions do not automatically see or call skills unless explicitly enabled.
- Carried the session opt-in through both single-agent and swarm execution paths, including the interactive follow-up hint that now preserves `--skills` when you continue into chat.
- Added focused regression coverage proving that agent skill tools remain blocked when disabled and become callable when the session is explicitly skill-enabled.

## [0.4.15] - 2026-04-20

### Strong-Beta Bundled Skills Bootstrap

- Packaged the certified strong-beta skill archives inside `@geotechcli/core` so installed CLI users now receive the bundled catalog instead of a skill command surface with no shipped skills.
- Added first-use skill bootstrap for the CLI and agent skill tools, so a fresh `~/.geotechcli/skills` directory is automatically populated from the bundled catalog before `skill list`, `skill show`, `skill run`, or agent skill discovery.
- Kept the bootstrap bundle curated to the approved wave archives plus the prompt-only tunnel reviewer, preserving the current strong-beta approval model while making the catalog actually available on a fresh install.
- Added a `tar`-first archive extraction path with path validation, reducing the hidden dependency on `python` for bundled ZIP discovery and import while keeping the existing safe fallback path.
- Added regression coverage for packaged bundled-skill bootstrap and widened heavy skill-runtime test timeouts so the certified catalog can be imported and exercised reliably in CI.

## [0.4.14] - 2026-04-19

### Strong-Beta Deploy Smoke Contract Fix

- Added a dedicated beta version endpoint so Cloudflare deploy verification can read a stable JSON release contract instead of scraping the changelog HTML.
- Marked the version endpoint `no-store` and `force-dynamic` so the strong-beta smoke check does not get trapped behind stale cached markup after a successful deploy.
- Updated the release workflow smoke step to poll the deployed version API with clearer diagnostics while keeping the hosted proxy health check in place.
- Added local route and regression coverage so the version endpoint remains part of the beta web contract before future strong-beta releases.

## [0.4.13] - 2026-04-19

### Strong-Beta Release Guardrail Hotfix

- Fixed the strong-beta release guardrail so GitHub Actions can compare versions across older commits even when the shared metadata file did not exist at the base ref.
- Updated the release workflow checkout depth so the verify job always has enough Git history to evaluate the previous pushed commit on `strong-beta`.
- Kept the strong-beta release rule intact: public beta pushes still require a new shared version and still gate npm, Cloudflare, and Modal release surfaces behind that versioned push.

## [0.4.12] - 2026-04-19

### Strong-Beta Skills Phase 2 + Release Guardrails

- Added strong-beta skill release guardrails so public `strong-beta` pushes now require a new shared version and must verify GitHub, npm, Cloudflare, and Modal release surfaces instead of treating a repo push as the full release.
- Removed the path-filter restriction on the Modal deploy workflow so versioned beta releases always refresh the hosted Qwen runtime instead of silently skipping Modal when related files were not matched.
- Added a standardized legacy-skill compatibility layer for the EPB tunnel workspace so the remaining tunnel skills can run through the same trusted install, sandbox, artifact, and case-file pipeline as the rest of the skill catalog.
- Promoted the remaining EPB tunnel skills including face support, conditioning/clogging, production ring cycle, mixed-face transition planning, and settlement control to approved strong-beta execution after end-to-end certification against their bundled example inputs.
- Fixed skill run workspace naming so back-to-back skill executions cannot collide in the same millisecond and corrupt generated output bundles.
- Expanded skill runtime regression coverage to certify the full tunnel workspace compatibility set and keep approval status aligned with the executable contract.

## [0.4.11] - 2026-04-17

### Hosted Beta Warmup Messaging + Budget-Safe Timeout Handling

- Raised hosted-beta agent timeout budgets to better match real Modal cold-start behavior, so the CLI is less likely to give up before the Qwen server is actually ready.
- Changed first-turn fallback wording to explicitly say when the Modal.com GPU is warming up or the timeout budget was exceeded, instead of incorrectly implying the hosted stack is simply down.
- Added live terminal wait states for hosted-beta sessions so `geotech agent` and `geotech chat` can surface a clearer "Modal.com GPU may still be warming up" message while users wait.
- Limited hosted agent proxy calls to a single upstream attempt instead of multi-retrying cold starts, which reduces wasted L4 time and keeps the timeout path more honest for your current budget.
- Added regression coverage for Modal warmup/timeout fallback wording and for the no-retry agent proxy behavior.

## [0.4.10] - 2026-04-17

### CLI Presentation + Plot Studio Polish

- Added a terminal-rich text renderer for agent, swarm, and chat answers so markdown-like sections, bullets, tables, and inline code now read like a deliberate engineering brief instead of raw LLM text.
- Refined the interactive plot viewer with a lighter product-style surface, tighter legend/toolbox spacing, contained axis labels, and inside-only zoom so the old bottom slider no longer crowds the chart frame.
- Shortened chart subtitles and improved viewer typography so the plot itself keeps visual priority instead of being squeezed by surrounding chrome.
- Made generic visualization imports more conservative by skipping mixed-unit overview charts unless the selected series share a clear unit signature.
- Upgraded CPT template plotting to emit true inverted depth profiles instead of generic table graphs.
- Split pile browser plots into separate unit shaft friction, shaft resistance, and cumulative resistance views, and corrected liquefaction chart domains so factor-of-safety plots are no longer scaled by blow counts.

## [0.4.9] - 2026-04-17

### Chat Reliability + Live Status

- Treated generic hosted-beta transport failures such as `Hosted beta AI request failed.`, empty upstream content, and `fetch failed` as temporary availability issues on the first agent turn so chat no longer emits a raw LLM error and then continues down a second response path.
- Added a live terminal status controller for `geotech agent` and `geotech chat` so users now see active reasoning states such as Terzaghi thinking, calling tools, or reviewing results while waiting.
- Kept the underlying agent/tool workflow unchanged for evidence-backed requests, while making the waiting experience feel active instead of static and making first-turn hosted-beta failures resolve more cleanly.
- Broadened the tunnelling intake signals so prompts framed around UCS, water inflow, excavation face, and machine selection now hit the immediate intake screen even when the user does not explicitly say `TBM` or `tunnel`.

## [0.4.8] - 2026-04-17

### Agent Intake + Project Context

- Replaced the narrow foundation-only agent shortcut with a catalog-driven geotechnical intake layer that screens multiple analysis families including foundation selection, soil classification, liquefaction, slope stability, retaining walls, pile capacity, TBM performance, tunnel settlement, and rock mass classification.
- Under-specified engineering requests now return immediate minimum-data requirements in domain language instead of waiting on hosted beta to restate missing inputs after a long round trip.
- Tightened the project-context bypass so metadata and notes alone no longer suppress intake; only actual evidence such as soil profiles, named datasets, derived parameters, or active analysis context can bypass the screen.
- Added regression coverage for foundation and liquefaction intake, metadata-only project context, and evidence-backed project context so the fast path stays geotechnical and does not silently disable the hosted model when real data exists.

## [0.4.7] - 2026-04-17

### Agent Reliability + Responsiveness

- Added an immediate deterministic screening response for under-specified foundation / soil-profile agent prompts so geotechCLI no longer burns a long hosted-beta round trip just to ask for missing borehole data.
- Improved the hosted-beta fallback path for the same foundation-screening class of requests, so transient provider issues now return a useful engineering checklist instead of the generic "no direct deterministic fallback" message.
- Added regression coverage to ensure the fast-path skips hosted-beta entirely for missing-data foundation prompts and still returns a useful fallback if the provider is temporarily unavailable.

## [0.4.6] - 2026-04-17

### Hosted Beta + Release Alignment

- Published the current strong-beta hosted-beta fixes as a versioned release so npm, the CLI, shared metadata, and the beta website stop drifting apart.
- Switched the CLI and web workspace manifests away from wildcard `@geotechcli/core` dependencies so published packages resolve against the matching core release instead of floating to whichever core version is latest on npm.
- Added release verification checks that fail CI if internal workspace package versions drift or if wildcard internal dependencies are reintroduced.

### Qwen / Modal Reliability

- Kept hosted beta on `Qwen/Qwen3.5-9B` for both text and vision so the public proxy, CLI defaults, and Modal deployment stay aligned on one hybrid multimodal model.
- Corrected the Modal vLLM launcher and pinned the served runtime to the available `vllm==0.18.1` line so the deployment path matches Modal's package mirror and current Qwen3.5 support.
- Expanded deploy smoke checks and reduced stale hosted-beta agent prompt budgets so installed users are less likely to hit the old context-window crash path.

### Interactive Plotting + User Experience

- Kept the new interactive browser plot viewer in the packaged CLI release so `--plot`, `--save-html`, and `--no-open` ship together instead of only existing in the repo state.
- Preserved terminal fallbacks for engineers working in SSH, CI, or air-gapped environments while making the default plotting experience much closer to a real engineering chart.

## [0.4.4] - 2026-04-14

### Hosted Beta Fallbacks

- Increased upstream retry/backoff depth again for transient Z.AI overload windows so the beta proxy waits longer before surfacing a hard failure.
- Added a local heuristic fallback for `geotech ai-classify`, so plain-language soil descriptions can still return a USCS-oriented result when hosted-beta text is temporarily unavailable.
- Added deterministic fallback behavior for `geotech agent` first-turn hosted-beta failures, so recognizable engineering prompts now return a useful limitation analysis instead of ending with zero tools and no answer.
- Added regression coverage for the new hosted-beta fallback paths before cutting the patch release.

## [0.4.3] - 2026-04-14

### Hosted Beta Reliability

- Increased hosted-beta limits for signed geotechCLI traffic while keeping stricter anonymous caps in place, so installed CLI users get more daily text, vision, and agent headroom during strong beta.
- Added upstream retry/backoff for transient hosted model overload responses and longer upstream timeout budgets for text, vision, and agent calls in the beta proxy.
- Raised the hosted-beta adapter minimum timeout budget in the CLI and translated raw aborts into clearer timeout messages.

### Verification

- Added focused hosted-beta regression coverage for client-mode limits, transient upstream retry behavior, and clearer timeout handling.
- Kept core tests, CLI tests, web build, and release consistency checks green before shipping the patch release.

## [0.4.2] - 2026-04-14

### Engineering Visualization

- Expanded terminal plotting beyond settlement so engineers can now render native ASCII plots directly from `classify uscs`, `liquefaction`, and `pile` using `--plot`.
- Added preset engineering charts to `geotech viz`, including Mohr circle plotting and Atterberg plasticity chart plotting with common engineering inputs.
- Added file templates to `geotech viz` for daily geotechnical chart workflows including compaction curves, grain-size distribution curves, and CPT-style depth plots.

### Samples & Docs

- Added committed visualization sample files for compaction, gradation, and CPT demos under `samples/visualization/`.
- Updated CLI help, README, website docs, and website feature copy so the new plotting surface stays aligned across npm, GitHub, Cloudflare, and the live docs.

## [0.4.1] - 2026-04-14

### Release Alignment

- Promoted the current strong-beta branch state to `0.4.1` so npm, the website, and shared metadata all point at the same published CLI surface.
- Refreshed the public release notes so the website changelog reflects the `0.4.1` feature set instead of the earlier `0.4.0` release-prep label.

### CLI & Vision Usability

- Added `geotech settlement trough` plus the forgiving `through` alias for the Peck tunnel settlement command, so the plotting example now works directly from the installed CLI.
- Kept `geotech viz` and the committed showcase/sample data in the published package path so terminal plotting is available after a fresh global install.
- Added multi-page borehole PDF support in the vision log flow by splitting oversized PDFs into page-level extraction requests and merging the result back into one log output.

### Dependency Security

- Updated the deployed web app from vulnerable `next@15.5.14` to `next@15.5.15`.
- Updated the CLI/core Vitest toolchain to `vitest@4.1.4`, clearing the transitive Vite audit findings from the repo install.
- Brought `npm audit` back to a clean `0 vulnerabilities` result for the release workspace.

### Release Infrastructure

- Aligned GitHub Actions verification, publish, and Cloudflare deploy jobs to Node 22 so the current Vitest toolchain runs consistently in CI.
- Added the direct `esbuild` install required by the OpenNext Cloudflare bundler so `build:cf` can resolve its server bundling dependency in Linux CI.

## [0.4.0] - 2026-04-14

### Release Alignment

- Bumped shared package/version metadata to `0.4.0` across `@geotechcli/core`, `geotechcli`, `@geotechcli/web`, and the shared metadata surface used by the website and CLI status output.
- Updated generated PDF/DOCX report footers to use the shared geotechCLI version instead of stale hardcoded `0.3.0` strings.
- Refreshed the public strong-beta changelog so the website now consistently surfaces `GLM-4.7-Flash` for text and `GLM-4.6V-Flash` for vision.

### Deterministic Reliability

- Fixed the pseudo-static slope stability regression so increasing `kh` now reduces the reported factor of safety instead of accidentally appearing stabilizing.
- Tightened the regression suite around slope loading, pile toe-depth behavior, sandbox hardening, and case-file deliverable generation.
- Kept pile toe/base resistance selection tied to actual toe depth while avoiding brittle regressions that depended on ambiguous boundary-layer assumptions.

### Case-File & Deliverables

- Added additive scenario case-file persistence for swarm outputs without replacing the current working CLI flows.
- Added deterministic report assembly from stored case-file artifacts, plus conservative evidence record persistence.
- Exposed agent deliverable tools for deterministic report generation and export workflows (`generate_report`, `render_pdf`, `render_docx`, `export_csv`, `export_dxf`, `export_geojson`).

### Strong Beta Hardening

- Hardened agent sandbox boundaries, hosted-beta abuse controls, and CLI trust surfaces for production-leaning strong-beta use.
- Kept `geotech status` quota-safe by default, made demo/sample fallbacks explicit, and aligned release verification checks with the current hosted-beta defaults.

## [0.2.0] 窶・2026-03-30

### Security Fixes (P0)

- **Filesystem sandbox** 窶・All agent filesystem tools (`read_file`, `write_file`, `parse_csv`, `scan_project`, `list_directory`) now validate paths through `sandbox.ts`. Blocks access to `.ssh`, `.aws`, `.gnupg`, `/etc`, `/proc`, and other sensitive system directories. Symlink escape prevention via `realpathSync` re-check.
- **Shell command hardening** 窶・`run_command` tool now uses centralized `validateShellCommand()`. Blocks `python -c`, `python -m`, pipe operators, redirects, `curl`, `wget`, `sudo`, and all destructive commands. Only allows read-only commands and `python <script.py>`.
- **Fail-closed hosted beta config** Production proxy (`/api/proxy`) now reports unavailable unless `ZHIPU_API_KEY` is configured, and it requires Upstash Redis in production so anonymous rate limiting stays enforced safely.
- **Registration rate limiting** 窶・`/api/auth` registration endpoint limited to 5 attempts per IP per hour.

### New Calculation Modules

- **Pile capacity** (`geotech pile`) 窶・ﾎｱ-method (Tomlinson) for cohesive soils, ﾎｲ-method (Burland) for cohesionless soils, SPT-based (Meyerhof 1976) for driven piles. Supports driven/bored/CFA piles, multi-layer soils, water table, per-layer shaft friction breakdown. References: API RP 2GEO, Eurocode 7 ﾂｧ7.6.
- **Slope stability** (`geotech slope`) 窶・Bishop Simplified method with automatic critical circle search. Multi-layer soils, water table, surcharge, pseudo-static seismic loading (kh). Returns FOS, stability class (STABLE/MARGINAL/UNSTABLE/CRITICAL), and slice-by-slice results. References: Duncan & Wright (2005), Eurocode 7 ﾂｧ11.
- **Lateral earth pressure** (`geotech retaining`) 窶・Rankine and Coulomb methods for active, passive, and at-rest (Jaky K0) states. Wall friction angle (ﾎｴ), sloping backfill (ﾎｲ), wall inclination (ﾎｱ), water table, surcharge. Full pressure distribution profile. References: Eurocode 7 ﾂｧ9.

### Engineering Accuracy Fix

- **Water table correction in bearing capacity** 窶・Implemented 3-case water table correction: (1) GWT above foundation 竊・reduced ﾎｳ' in both Nq and Nﾎｳ terms, (2) GWT within influence zone (D to D+B) 竊・interpolated ﾎｳ_eff in Nﾎｳ term, (3) GWT below D+B 竊・no correction. Previously the `waterTableDepth` parameter was accepted but ignored, which could produce unconservative results for sites with shallow water tables.

### Standards Database

- Added **JGS 0121** (Japanese SPT), **JGS 4101** (Japanese pile design), **JSCE C7.11** (NATM tunnel classification), **NEXCO tunnel design**, **JSCE FOS standards**
- Added Eurocode 7 pile shaft resistance (ﾂｧ7.4), slope stability methods (ﾂｧ11.5), retaining wall design checks (ﾂｧ9.5)
- Added Schmertmann (1970/1978) and Meyerhof pile (1976) provisions
- Standards database expanded from 12 to 20+ provisions

### Agent & Guardrails

- **3 new Poka-Yoke guardrail sets** for pile capacity, slope stability, and lateral earth pressure. Validates: pile L/D ratio, zero-strength soil layers, wall friction angle vs soil friction, seismic coefficient range.
- **Swarm simulation agent** now has access to all 3 new calculation tools.
- **Tool registry** expanded from 26 to 29+ registered tools.

### CLI Improvements

- **`--quiet` flag** 窶・Suppress all non-essential output (for scripting).
- **`--dry-run` flag** 窶・Show what would be calculated without executing.
- **JSON-safe strong beta output** 窶・Hosted beta AI commands now keep `--json` responses machine-readable on error paths, and status booleans remain readable instead of being over-redacted.
- Removed v0.2 placeholder commands; `settlement` now points to agent workaround.
- Version bumped to 0.2.0 across all packages.

### Test Suite

- **~120 new tests** covering: pile capacity (4 tests), slope stability (3 tests), lateral earth pressure (6 tests), bearing capacity water table correction (2 tests), filesystem sandbox (5 tests), shell command sandbox (8 tests), new tool registration verification (4 tests).
- Total test coverage now includes all deterministic calculation modules, guardrails, sandbox, standards, and export formats.

### Documentation

- README updated with new commands, quick start examples, expanded security section.
- Global flags table updated with `--quiet` and `--dry-run`.

---

## [0.1.0] 窶・2026-03-15

Initial release. See README for full feature list.

### P1 Fixes (added in v0.2.0 final)

- **Persistent CLI usage counters** 窶・`FileUsageStore` replaces `InMemoryUsageStore` in the CLI. Usage counters now persist to `~/.geotechcli/usage.json` across process restarts, so the unregistered 5-call limit and monthly quotas are enforced across sessions. File secured to `0600` permissions.
- **Email verification flow** 窶・Registration now requires 2 steps: (1) `POST /api/auth {action:"register", email}` sends a 6-digit verification code (10-min TTL, 5 attempts max), (2) `POST /api/auth {action:"verify", email, code}` verifies and creates the account. API key is only returned after verification. Dev mode includes code in response; production requires email delivery (SendGrid/Resend integration point provided).
- **Structured logging** 窶・`logger.ts` replaces all `console.error/log/warn` in API routes. Production mode outputs JSON lines (Datadog/Cloudflare Logpush compatible); dev mode outputs human-readable. All sensitive fields (`api_key`, `token`, `secret`, `password`) auto-redacted. Proxy route: 0 console calls remaining. Webhook route: 0 console calls remaining.
- **`--quiet` and `--dry-run` flags fully wired** 窶・Both flags defined in `flags.ts` AND consumed in 6 command handlers (bearing, liquefaction, pile, slope, retaining, ai/agent/swarm). `--quiet` outputs only the key result value (for piping). `--dry-run` shows parameters without executing.

### Pre-Launch Critical Fixes

- **Webhook idempotency** 窶・Stripe webhook handler now tracks processed event IDs in memory (24-hour TTL with hourly cleanup). Duplicate events are detected by `event.id` and acknowledged without re-processing. Prevents double-activation of subscriptions or double-downgrades from retry deliveries. For multi-instance deployments, swap the `Map` for Redis `SET` + `EXPIRE`.
- **ReAct brain 竊・proper message arrays** 窶・`brain.ts` completely rewritten. Replaces string concatenation (`conversationHistory += ...`) with a proper `ChatMessage[]` array using alternating `user`/`assistant` roles. New `generateChat()` function in the LLM router accepts multi-turn message arrays directly. Context window management: when conversation exceeds ~10K tokens, older tool exchanges are automatically compressed into a summary message (keeps system prompt, user query, and last 4 messages intact). Tool result data is compacted (no pretty-print, truncated at 3K chars) to save tokens.
- **Swarm agent loop also fixed** 窶・`swarm.ts` `runAgentLoop` rewritten with the same message-array pattern. All 3 swarm agents (interpretation, simulation, reviewer) now use proper multi-turn conversations instead of string concatenation.

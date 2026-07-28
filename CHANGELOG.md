# Changelog

## [0.4.145] - 2026-07-28

### Dependency security — 13 high-severity advisories down to 1

`npm audit` reported 20 vulnerabilities (13 high) and CI ran the check with `|| true`, so nothing ever failed a build on it and the backlog grew unnoticed. Total is now 8 (1 high).

- **Next.js: 8 advisories fixed** by moving 15.5.18 → 15.5.22. These were the ones that mattered most, because Next is the runtime of the deployed Worker rather than build-only tooling: SSRF in Server Actions on custom servers, SSRF in rewrites via attacker-controlled destinations, cache confusion of response bodies, unauthenticated disclosure of internal Server Function endpoints, unbounded Server Action payloads on the Edge runtime, and DoS in both Server Actions and the image optimization API.
- **postcss** → 8.5.23, clearing an arbitrary file read, a source-map path traversal and a stringify XSS, and with it `@tailwindcss/postcss`. Next pins postcss exactly, so this is carried by the root `overrides` block that already existed for that purpose.
- **sharp** → 0.35.3, clearing inherited libvips CVEs. This one ships to npm users as a declared dependency of `@geotechcli/core`.
- **wrangler** → 4.114.0, clearing `miniflare`, `undici` and `ws`.
- **js-yaml** → 4.3.0, **tmp** → 0.2.7 (reaches the published CLI through exceljs), **form-data** → 4.0.6, **vite** → 8.1.5.
- **`brace-expansion` is deliberately left at 5.0.5.** Version 5.0.8 fixes the advisory but removes the package's default export, and `minimatch` inside the OpenNext build chain does `import expand from 'brace-expansion'` — forcing the upgrade breaks `build:cf` outright, which was confirmed by trying it. The nested copies in the 1.x and 2.x lines are already at their patched releases (1.1.16 and 2.1.2); the advisory's `<=5.0.7` range sweeps those older majors regardless.

The lockfile was regenerated to apply these cleanly, and two releases were burned learning the same lesson: **npm `overrides` only rewrite transitive resolutions.** When a workspace also declares the package directly, the override wins in the lockfile while the manifest still demands its own version, the two disagree, and `npm ci` fails at install with `Missing: <pkg>@<version> from lock file` — on the runner but not locally, because npm versions differ in how strictly they validate this. It happened first with `sharp` (which additionally leaves stale `@img/sharp-*` platform entries behind) and again with `postcss`.

Both are now declared directly where they belong — `sharp` as `^0.35.3` in `@geotechcli/core`, `postcss` as `8.5.23` in `@geotechcli/web` — and `verify:consistency` gained an assertion that fails the build when an override disagrees with a direct declaration in any workspace, so this cannot reach CI again.

Verified with the full pipeline against the regenerated tree: consistency, all builds, the OpenNext Cloudflare bundle, web typecheck, web route smoke, FEM draft-run, the agent-task benchmark, and 874 + 152 tests.

### CLI banner points at the production site

The startup banner advertised `beta.geotechcli.com`. It now shows `www.geotechcli.com`. The hosted-beta proxy endpoint is unchanged and still resolves to `beta.geotechcli.com/api/proxy`, which is where the service actually runs.

## [0.4.142] - 2026-07-28

### Deterministic engine correctness — liquefaction, bearing capacity, slope stability

Three published methods did not match the sources they cite. All three errors were **unconservative**, and the existing tests could not see them because they assert direction and ordering rather than published values — all 830 passed before and after the fix.

- **Liquefaction CRR was a mis-transcribed Boulanger & Idriss (2014) Eq. 2.24.** The published equation applies four different divisors to the four powers of (N₁)₆₀cs; the shipped code folded them onto a single variable `x = (N₁)₆₀cs / 14.1` with divisors 2.67 / 3.0 / 4.0. Resistance was overstated by 1.2× at (N₁)₆₀cs = 10, **2.8× at 20, 39× at 30**, and the curve crossed CRR = 1.0 at about (N₁)₆₀cs = 23 — beyond which any factor of safety was effectively infinite and no soil could ever be flagged as liquefiable. The published form is restored, capped at (N₁)₆₀cs = 37.5 as the reference specifies.
- **Also added from the same reference:** magnitude scaling factor per Eqs. 2.19–2.20 (MSF<sub>max</sub> = 1.09 + ((N₁)₆₀cs / 31.5)², exactly 1.0 at M 7.5), overburden correction K<sub>σ</sub> per Eqs. 2.16–2.17 capped at 1.1, the iterative C<sub>N</sub> of Eq. 2.15b, and fines correction per Eq. 2.11. Results now report σ'<sub>v0</sub>, C<sub>N</sub>, r<sub>d</sub>, MSF, K<sub>σ</sub> and post-liquefaction volumetric strain.
- **`bearing --method hansen` returned Vesić numbers.** The two methods differ in N<sub>γ</sub> — Hansen uses 1.5(N<sub>q</sub> − 1)tan φ, Vesić uses 2(N<sub>q</sub> + 1)tan φ — and in their shape factors, where Hansen's s<sub>q</sub> uses sin φ and Vesić's uses tan φ. Selecting Hansen silently produced Vesić's (larger) capacity. Each method now computes its own factors, and Meyerhof gets its own N<sub>γ</sub> = (N<sub>q</sub> − 1)tan(1.4φ).
- **`--shape square` and `--shape circular` were ignored** unless `--length` was also passed, so shape factors defaulted to a strip footing. Shape now resolves B/L directly (1 for square and circular, 0 for strip) and still honours an explicit length.
- **Slope stability read only the first soil layer**, making the layered-profile test tautological, and **`waterTableDepth` / `saturatedUnitWeight` were inert** — an inverted pore-pressure test meant u ≡ 0, so a rising water table never reduced the factor of safety. It also was not Bishop's method: it forced |α|, divided by m<sub>α</sub> twice, and sliced the full chord rather than the daylighted arc. Rewritten: slice weights integrate the actual layer stack with saturated unit weight below the phreatic surface, the arc is limited to where it daylights, and both Bishop Simplified (1955) and Ordinary/Fellenius (1936) are implemented properly — the ordinary method had never executed. Against Taylor's (1937) stability chart the result is now within 3.7% (previously ~26% low), and the frictional-only case returns 1.016 against the closed-form tan φ / tan β.
- **Pinned with 44 golden tests** (`packages/core/tests/engine-golden-values.test.ts`) that assert published table values rather than directions. **25 of the 44 fail against the previous code** — verified by reverting the sources and re-running.

**If you have run liquefaction triggering with any earlier version, re-run it.** Factors of safety were too high, and increasingly so in denser sands.

## [0.4.141] - 2026-07-28

### Surface verification waits for propagation

The surface gate added in 0.4.140 failed on its first real run, and it was wrong to fail: npm had `beta` at 0.4.140 and the deploy had succeeded, but `beta.geotechcli.com` still answered 0.4.139 for a few seconds afterwards. Cloudflare serves the site from many edge locations and npm serves dist-tags through a CDN, so both keep reporting the previous version briefly after a successful deploy — the deploy job's own smoke check already polls for exactly this reason, and the new gate read each surface once.

- `verify-release-surfaces` now polls each remote surface until it agrees or the attempts run out (20 attempts, 15s apart by default, tunable with `SURFACE_CHECK_ATTEMPTS` / `SURFACE_CHECK_DELAY_MS`), matching the retry behaviour of every other remote check in the pipeline.
- Surfaces that already agree still pass immediately, so the happy path adds no waiting.
- A surface that never catches up still fails the run, and the error now reports how many attempts it took before giving up.

## [0.4.140] - 2026-07-28

### Release surfaces stay in lockstep automatically

A release lands on four independent surfaces — npm dist-tags, the deployed site, the git tag, and the GitHub Release — each written by a different job. Three were automated; tagging never was. GitHub Releases therefore froze at **v0.4.124 on 5 June** while fourteen versions shipped to npm and to the site, and nothing reported the gap.

- **Production pushes now tag themselves.** A new `tag-release` job creates `v<version>` and publishes the GitHub Release after npm promotion and the production deploy succeed. Tagging is no longer a step someone has to remember.
- **Release notes come from the changelog.** GitHub's generated notes build from merged pull requests, and this repo releases by pushing branches directly — so the generated body collapsed to a bare compare link. Releases now publish the changelog entry for that version instead.
- **A final gate checks every surface.** `verify-release-surfaces` asserts that npm dist-tags, the deployed site and the git tag all report the version the commit claims, and fails the run when any disagrees. It runs on production after tagging and on beta after deployment, and is available locally as `npm run verify:surfaces`.
- **Silent promotion skips are now failures.** `Promote npm latest` previously warned and exited 0 when the token was missing or the version was absent from npm, so a skipped promotion looked exactly like a successful one — which is how npm `latest` could sit a version behind production while the job reported green. Both cases now fail the run with a named cause.

## [0.4.139] - 2026-07-28

### Fixed npm publishing for the CLI package

The 0.4.138 release published `@geotechcli/core` but failed on `geotechcli` with a bare `404 Not Found - PUT`, leaving the version half-released and blocking both site deployments.

- **Root cause.** npm resolves trusted publishing (OIDC) **per package**, by exchanging the GitHub id-token at `/-/npm/v1/oidc/token/exchange/package/<name>`. That exchange is deliberately non-throwing: when it fails, npm logs nothing at default verbosity and falls back to whatever `_authToken` sits in the npmrc — which is `setup-node`'s placeholder when no token is supplied. The scoped package still had a trusted publisher and published normally; the unscoped one did not, fell through to the placeholder, and the registry answered 404 (npm reports 404 rather than 403 for packages you have no write access to).
- **Supplied a real credential.** The publish job now passes the `NPM_DIST_TAG_TOKEN` automation token as `NODE_AUTH_TOKEN`, so a package that OIDC cannot cover still authenticates. Trusted publishing keeps priority where it is configured.
- **Kept provenance on both packages.** npm only auto-enables provenance on the OIDC path, so publishing through the token would have silently dropped the SLSA attestation. The publish script now requests `--provenance` explicitly whenever the runner can mint an id-token, which covers both paths.
- **Made the failure legible.** Publishing now fails fast with a named cause when neither credential is usable — including when `NODE_AUTH_TOKEN` is the `setup-node` placeholder, which previously looked like a configured credential right up until the registry rejected it — and a failed publish prints which auth path was in play and both remedies.

## [0.4.138] - 2026-07-28

### Author ORCID on the citation metadata

- Added the maintainer's ORCID (`0000-0003-4362-0704`) to `CITATION.cff`, replacing the placeholder that had been waiting for it. GitHub's *Cite this repository* button and the APA/BibTeX exports it generates now carry a persistent author identifier, so citations of geotechCLI resolve to the right researcher regardless of name formatting. The same identifier is added to the BibTeX snippet in the README.
- Fixed the citation version, which had drifted to **0.4.133** while the project shipped four releases past it — anyone citing the software was crediting the wrong release. `CITATION.cff` now reports the current version and release date.
- Added release-consistency assertions for both: the build fails if `CITATION.cff` falls behind the shared metadata version again, or if the author ORCID is missing or malformed.

## [0.4.137] - 2026-07-28

### Docs and Changelog rebuilt around Sphinx/Furo navigation patterns

> 0.4.136 was tagged for this work but never published to any channel; 0.4.137 is the released version.

Both pages had become unreadable by growth rather than by design: the docs were 17 sections on a single scroll behind a flat 3-column anchor grid, and the changelog rendered **127 releases fully expanded** on one page with no way to search, filter, or jump. Both are rebuilt using the information-architecture patterns from [Sphinx](https://www.sphinx-doc.org/) and the [Furo](https://github.com/pradyunsg/furo) theme.

- **Docs — persistent grouped sidebar.** Sections are now organised by progressive disclosure (Getting started → Deterministic engines → AI & agents → Reference) in a sticky sidebar that stays with you, instead of an anchor grid you had to scroll back to the top to reach. An `IntersectionObserver` scroll-spy highlights the section you are actually reading.
- **Docs — filter across all content.** The sidebar filter matches section titles, groups **and body text**, so searching `liquefaction` narrows both the sidebar and the page to the 5 relevant sections.
- **Docs — real code blocks.** The regex-to-HTML renderer behind `dangerouslySetInnerHTML` is replaced with a block parser rendering proper React elements: 16 code blocks now carry a language chip and a copy button, tables scroll horizontally instead of overflowing, and inline code, bold and links are tokenized rather than string-replaced.
- **Docs — Sphinx-style permalinks and Furo-style prev/next.** Every section heading exposes a `¶` permalink anchor on hover, and each section ends with previous/next cards so the docs read as a sequence rather than a wall.
- **Changelog — progressive disclosure.** The three most recent releases are expanded; the remaining 124 are collapsed to one-line headers showing version, tag, date and entry count. Expand/collapse all is one click.
- **Changelog — search and type filters.** Full-text search across every entry with match highlighting, plus Features / Fixes / Security / Breaking filter chips. Filtering auto-expands surviving releases so matches are never hidden behind a collapsed header, and a counter reports how many of the entries are showing.
- **Changelog — version index.** A sticky sidebar groups all releases by series (0.4.x, 0.3.x, …) with dates, so any version is one click away instead of a long scroll.
- Both pages get a mobile drawer for the sidebar and no longer scroll horizontally on a 390px viewport. Layout, navigation, filtering and expansion were verified in a real headless Chromium against the built site.
- **Release reliability:** added `packages/core/vitest.config.ts` raising the test and hook budget to 30s. The core suite runs 80+ files in parallel and several ingest tests do real PDF/OCR-shaped work; they finish in well under a second locally (the slowest is 778 ms) but twice exceeded vitest's 5s default on a loaded CI runner and failed a release for timing rather than for a genuine regression. The new budget is a ceiling for catching real hangs, not a target.

## [0.4.135] - 2026-07-28

### Patreon is the only sponsorship flow — GitHub Sponsors reverted

- **Removed GitHub Sponsors entirely** and restored Patreon as the single sponsorship flow across the website, README, package READMEs, `CONTRIBUTING.md`, `SUPPORTERS.md`, the issue-template contact link, `.github/FUNDING.yml`, and the homepage CTA. GitHub Sponsors pays out through Stripe Connect, which **does not support ゆうちょ銀行 (Japan Post Bank)** — the maintainer's bank. Sponsorship money could not actually be received through it, so shipping those buttons would have meant a payment flow that silently goes nowhere.
- **Withdrew the one-time contribution offer.** Patreon memberships are recurring monthly and it has no one-time option; advertising "$10 / $25 / $50 once" while only Patreon can process payments would promise something the project cannot honour. The support page and README now say plainly that sponsorship is billed monthly, can be changed or cancelled at any time, and that cancelling keeps the month already paid for. A smoke assertion fails if any one-time wording reappears while Patreon is the only flow.
- **The 0.4.134 trust fixes are all retained**: no instruction to cancel immediately after paying (still guarded by a smoke assertion), no "Excellent Support" or "Diamond Supporter" tiers, no promises of hands-on collaboration time, direct maintainer access, or sponsored-feature prioritization. Tiers remain Community Backer $10 / Project Sustainer $50 (labelled Recommended) / Organization Sponsor $100, matching the live Patreon prices exactly. The trust note, the restructured page order, and the "prefer to contribute time?" panel are unchanged.
- Smoke assertions now fail if any web surface links `github.com/sponsors`, so a dead sponsor button cannot be reintroduced by accident.

> **Note on 0.4.134:** that version was published to the npm `beta` channel and deployed to the beta site with GitHub Sponsors as the primary flow. It never reached production or the npm `latest` channel. 0.4.135 supersedes it.

## [0.4.134] - 2026-07-28

### Sponsorship rework — GitHub Sponsors as the primary flow, honest one-time contributions

- **GitHub Sponsors is now the primary sponsorship flow** (`https://github.com/sponsors/kilickursat`), exposed through `.github/FUNDING.yml` so the repo's Sponsor button offers it directly. Unlike the previous Patreon-only setup it supports **genuine one-time contributions of $10 / $25 / $50 with no automatic renewal** — nothing starts, so there is nothing to cancel afterwards.
- **Removed the instruction telling sponsors to cancel their Patreon membership immediately after paying.** That workaround existed because Patreon has no one-time option, but asking someone to cancel a payment they just made undermines trust in the project. A web smoke assertion now fails if that copy ever returns.
- **Retired the "Excellent Support" ($50) and "Diamond Supporter" ($500) tiers** along with their benefits — "hands-on collaboration time", "direct access to the maintainer" and "sponsored-feature prioritization". Those promised open-ended professional obligations that a donation should not buy, and read as gamified rather than credible to an engineering audience. Sponsorship at $500+ is now pointed at a separate organization-sponsorship conversation.
- **New monthly tiers, matching the live Patreon prices exactly** so the site never advertises an amount different from what a sponsor is charged: Community Backer $10/mo (hosting, CI and shared API costs), Project Sustainer $50/mo (testing, documentation, security and releases), Organization Sponsor $100/mo (firms, labs and universities, with optional name or logo recognition). The mid tier is labelled **Recommended** rather than "Most popular", which would be a claim about sponsor data the project does not have.
- **Added a trust note** to the support page and README: sponsorship is optional, never changes access, and does not purchase engineering approval, an SLA, roadmap control, or a guaranteed feature. Priorities remain based on safety, community value, and maintainer capacity.
- **Support page restructured** per the donation review: the sponsorship ask now leads, the free-vs-sponsor-supported feature comparison moved below it, the duplicate donation block beneath the membership cards is gone, and a "prefer to contribute time?" panel makes clear that issues, docs, test cases and pull requests are equally valuable and never require sponsoring.
- Patreon is kept throughout as a secondary flow for people who already sponsor there — existing support continues to count, with no need to move.
- Added `SUPPORTERS.md` for the opt-in recognition the tiers reference, and realigned the sponsor badge, README, `CONTRIBUTING.md`, both package READMEs, the issue-template contact link, and the homepage CTA onto the new flow.

## [0.4.133] - 2026-07-19

### geotechCLI is now open source (Apache-2.0)

- Relicensed the project from a proprietary license to **Apache-2.0** (LICENSE + NOTICE), with a `CITATION.cff` so the project can be cited from GitHub's "Cite this repository" button. Versions <= 0.4.132 on npm remain under the previous license; this and future versions publish as Apache-2.0.
- Showroom README rewrite with the project logo, npm/license/CI/sponsor badges, quick start, feature tables, architecture sketch, and a visible Support & Sponsorship section (Supporter $10 / Excellent Support $50 / Diamond Supporter $500 via Patreon, including the mandatory monthly-renewal cancellation note). Added dedicated npm READMEs for `geotechcli` and `@geotechcli/core`.
- Community files for public contribution: `CONTRIBUTING.md` (PRs target `strong-beta`; trust-boundary rules; dev setup), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private disclosure), issue templates, a refreshed PR template, and `.github/FUNDING.yml` for the GitHub Sponsor button (Patreon).
- Repo showroom cleanup: internal R&D notes moved to `docs/internal/`, loose working notes/zips/stray artifacts removed from tracking, `.gitignore` hardened against local benchmark/artifact output, and the personal Modal endpoint scrubbed to a placeholder.
- Reworked the agent's internals guard for the open-source era: the agent now freely discusses the (public) architecture and points to the GitHub repo; it only declines to echo the live session's raw prompt text (anti-injection hygiene). Website gains GitHub links (nav, footer, CTA, support page) plus the three membership tiers and an open-source panel; web smokes extended accordingly (26 UI checks).
- The deterministic trust boundary is unchanged: the LLM interprets and orchestrates; deterministic code owns every number.

## [0.4.132] - 2026-06-28

### CI secret-scan false-positive hotfix

- Replaced the agent-task benchmark path-safety test fixture token with an underscored fake shape so the CI hardcoded-secret grep no longer false-positives on it; the benchmark detector still flags it. No runtime behavior changes from 0.4.131.

## [0.4.131] - 2026-06-28

### Agent Task Evaluation Benchmark — a deterministic scoreboard for the agentic harness

- Added an agent-task evaluation benchmark (`npm run benchmark:agent-tasks` / `npm run smoke:agent-tasks`) that drives the REAL `runAgent`, `runSwarm`, and deterministic project-workflow loops end-to-end with scripted model turns — zero network, zero model cost, CI-safe — so agent-harness changes are scored against realistic geotech tasks instead of reviewed by eye.
- 9 initial scenarios cover both behavior classes: task scenarios (bearing capacity grounded in the queryable GroundModel with cited `ev-` evidence, strata Q&A without calculators, liquefaction screening that preserves the groundwater-assumption review gate, missing pile inputs surfacing a review gate instead of a guessed capacity, monitoring analysis keeping the threshold-profile review gate, prompted anomaly+visualization routing through deterministic workflows with zero model calls) and guardrail scenarios that pass only when the runtime fails closed (a fabricated bearing value without the required tool is blocked, an invented FEM result-manifest write is rejected by the deterministic artifact guard, a swarm reviewer rejection stays UNRESOLVED).
- New core contract module (`agent-task-benchmark`) owns the scenario schema, session scoring (outcome, tool correctness, numeric fidelity from deterministic tool results, evidence/review-gate text, turn budgets), report/trend contracts with `contractValidation`, path/secret-safety inspection, and SVG/HTML renderers; artifacts persist as path-safe `comparison.json`, `summary.svg`, and last-50 `agent-tasks-history/trend` files.
- `smoke:agent-tasks` now runs in CI (build job) and in the release verify gate alongside the FEM draft-run smoke.
- npm release channel: strong-beta releases now publish under the npm dist-tag `beta` (`npm i geotechcli@beta`), and merging to `main` promotes that version to `latest` via a new idempotent `promote-latest` workflow job — production npm users only receive versions that passed the beta channel.
- The deterministic trust boundary is unchanged: the benchmark scripts the model, never the tools; every number in a scored session still comes from deterministic code, and the scripted provider is registered only inside the benchmark process.

## [0.4.130] - 2026-06-21

### Agentic Surface Sharpening — chat auto-context, force-agent, wider data window, analyze signposts

- `geotech chat` no longer starts cold: at session start it auto-scans the current project folder (the same deterministic manifest `geotech agent --workspace` builds, via `resolveWorkspaceRoot` + `analyzeWorkspace`) and seeds the session with a bounded ground-model digest — representative strata values, lithology, groundwater, counts, and verifier status — so the LLM agent understands the dataset from the first message. The human-readable digest is injected first so it survives the context cap; depth is pulled on demand via the read-only `query_ground_model` tool. Added `--workspace <dir>` / `--no-workspace` flags and `/workspace` (show the scanned manifest) + `/rescan` (re-scan the folder) REPL commands. (Gap B)
- Added `--force-agent` to `geotech agent` and `geotech chat`: skips the deterministic preflight short-circuit and routes the request through the LLM agent loop (sets the existing `AgentRunOptions.disableDeterministicPreflight`). Off by default — the deterministic fast path remains the default, trust-preserving behavior. (Gap E)
- Read-only data tools (`query_ground_model`, `parse_ags`, `parse_csv`, `parse_cpt`, `read_file`, `analyze_signal_file`) now serialize up to ~8 KB of result into the agent prompt (vs the 3 KB calculator window), and the hosted final-answer token budget grows when a data tool was actually read, so the LLM can reason across the whole dataset. Loop steps stay lean for cost. The agent system prompt now states that data tools are paginated (re-call `query_ground_model` with a higher `limit` or a specific `section`/`boreholeId` to fetch more). (Gap D)
- `geotech analyze` text output now signposts the LLM-active verbs, printing copy-pasteable `geotech chat` and a contextual `geotech agent "<question>"` next step seeded from the scan; `--json` and `--format html` output are unchanged. (Gap F)
- The deterministic trust boundary is unchanged across all four changes: the LLM interprets and orchestrates; deterministic code still owns every number, and the new tool/context surfaces are read-only. The implementation plans are documented in `AGENT_SURFACE_GAP_PLANS.md`.

## [0.4.129] - 2026-06-21

### Queryable GroundModel for the Agent

- Added a read-only `query_ground_model` agent tool that returns the deterministic, evidence-bound GroundModel `geotech analyze` builds for a workspace folder — strata, parameters, groundwater, SPT, coordinates, and per-borehole detail with evidence IDs — so the LLM agent reasons over the interpreted ground model instead of re-parsing raw files. The tool is read-only: it sources the model via `analyzeWorkspace`, never recomputes a number or writes a file, and supports `section` / `boreholeId` / `limit` filters to stay within the token budget. It is available to single-agent (`chat`/`agent`) sessions and to the swarm `interpretation` and `reviewer` roles.
- Added a shared, bounded `buildGroundModelAgentView` + `formatGroundModelAgentDigest` core helper (in `@geotechcli/core/ground-model`) used by both the tool and the CLI agent context.
- Enriched the CLI agent runtime context additively: `geotech agent`/`chat` now inject a bounded GroundModel values digest (representative strata, lithology, USCS, groundwater) plus a pointer to `query_ground_model`, alongside the existing stats. The deterministic trust boundary is unchanged — the LLM interprets; deterministic code still owns every number.
- Documented the agentic-surface audit in `AGENT_SURFACE_AUDIT.md`. Deferred follow-ups: `chat` auto-scanning the cwd at session start, larger tool-result windows, and signposting the LLM verbs from `analyze` output.

## [0.4.128] - 2026-06-14

### Default Text Model GLM-5.2

- Promoted the hosted strong-beta default text/agent model from `glm-5.1` to `glm-5.2` (Z.ai's latest flagship in the same GLM-5 series, served through the same `/paas/v4/chat/completions` endpoint and hosted-beta proxy). Vision (`glm-5v-turbo`) and layout (`glm-ocr`) defaults are unchanged.
- Updated the shared metadata default and supported-proxy-model catalog so the proxy allowlist, hosted-beta thinking-mode injection, CLI status/config output, and web defaults all follow `glm-5.2`; the superseded `glm-5.1` is removed from the catalog.
- Realigned the release-consistency guard, the release smoke gate (`/api/version` expected text model), BYOK/benchmark smoke defaults, README/CLAUDE/PRIVACY/handoff docs, and the active test/fixture corpus to `glm-5.2` so no shipped or authoritative surface references the old default.

## [0.4.127] - 2026-06-14

### DIGGS / AGSi Export Adapters

- Added two deterministic, dependency-free geotechnical interchange exporters in `@geotechcli/core`: `exportBoreholeAgsi` (AGSi 1.x ground-model JSON) and `exportBoreholeDiggs` (DIGGS 2.x XML). Both reuse the shared `normalizeLithology` vocabulary and the workspace lithology colour palette, so geology codes, USCS symbols, and unit colours stay consistent with the rest of the app; raw stratum descriptions are always preserved.
- AGSi output captures `agsSchema`/`agsProject` (name + coordinate system), one observational `agsiModel` whose elements are the per-borehole stratum intervals (depth, level when ground level is known, geology unit, colour, USCS, confidence), and a deduped `agsiGeologyUnit` set. DIGGS output is well-formed, fully escaped XML with one `Borehole` sampling feature per hole (reference point + total measured depth) and per-borehole geology intervals.
- Exposed both formats on the CLI (`geotech export agsi` / `geotech export diggs`, with `--project`/`--crs` and a tolerant input mapper) and as agent tools (`export_agsi` / `export_diggs`) sourced from the stored ground-model artifact, mirroring the existing `export_dxf`/`export_geojson` surface.
- Faithful-subset scope by design: output is structurally correct and round-trippable but not full XSD/JSON-schema validated. Full schema validation, DIGGS measurement/sample/SPT coverage, AGSi 3D volume/surface geometry, and AGS4 (CSV) export are deferred to later slices.

## [0.4.126] - 2026-06-13

### Lithology Normalization

- Added a single deterministic lithology normalizer (`normalizeLithology` in `@geotechcli/core/geo`) with a shared controlled vocabulary, collapsed material class, display tone, USCS extraction, and confidence; the six previously independent ad-hoc classifiers (vision heuristic, ingest dossier material key/tone, integrated-review class, workspace dossier kind, html cross-section fallback, and USCS text extraction) now delegate to it with unchanged signatures.
- Fixed two latent classification bugs: organic/peat strata are preserved as an `organic` class in the integrated review instead of collapsing to `mixed` (F2), and the workspace dossier now recognizes peat/organic/topsoil instead of rendering them as `unknown` (F1).
- Unified the vocabulary as a superset of all prior sites, which also widens recognition deterministically: broader rock names and `moderately strong` route mudstone/limestone-type strata to rock rather than mixed (D1/D2), `boulder` is recognized as a coarse-grained descriptor (D3), and the workspace material kind adopts the canonical substring precedence (D4/D5; e.g. `backfill` -> fill). Tone matching is preserved verbatim and intentionally independent of the key.
- Persisted normalized lithology additively on `BoreholeLayer.lithology` (during borehole ingest) and `GroundModelStratum.lithology` (during ground-model build), and surfaced it in `exportBoreholeGeoJSON` layer properties. Raw descriptions are always preserved.
- DIGGS/AGSi export, tunnel longitudinal sections, and a dossier class column are deferred to later slices.

## [0.4.125] - 2026-06-13

### Geotech Ingest Borehole Continuity And Coordinate Validation

- Added deterministic page-break continuity repair for merged multi-page borehole logs: small overlaps are trimmed, duplicated boundary rows are dropped, and micro-gaps are snapped, each with a typed audit trail and advisory findings while genuine anomalies stay blocking through `validateMergedBorehole`.
- Added deterministic coordinate plausibility validation: BNG/UTM range envelopes, suspected easting/northing axis swaps, WGS84-out-of-region checks, UTM zone vs longitude consistency, mixed-CRS detection, and cross-borehole spatial outlier flagging for OCR digit errors, all review-gated without dropping or rewriting coordinates.
- Exposed continuity repair thresholds through `IngestBoreholeLogDocumentOptions.continuityRepair` with unchanged conservative defaults, and surfaced repair notes in the ingest dossier stratigraphy panel.

## [0.4.124] - 2026-06-05

### FEM DP Biot Pressure Replay Route

- Added reviewed experimental `excavation-plane-strain-dp-biot-replay` drafting and `--backend plane-strain-dp-biot-replay` execution for sequential one-way Biot pressure-frame replay into plane-strain Drucker-Prager effective-stress analysis.
- Added result-manifest `pressureReplayAudit` validation that requires accepted upstream Biot transient metadata, pressure audit evidence, zero nonlinear pore-pressure DOFs, and explicit no-monolithic-coupling limitations.
- Extended CLI, agent schema/normalization, default hosted GLM guardrails, route tests, and draft-run smoke coverage while keeping FEM production readiness blocked.

## [0.4.123] - 2026-06-04

### FEM Benchmark And DP Route Evidence

- Added an OpenGeoSys Liquid Flow `h1_1Dsteady` open-source comparison for steady Darcy seepage head, flux, and gradient evidence while keeping commercial benchmark blockers active.
- Added a route-backed `excavation-plane-strain-dp-adaptive` draft path for reviewed plane-strain Drucker-Prager excavation cases, including `--hardening-modulus` CLI parsing and approval-bearing run templates.
- Extended default hosted GLM, agent normalization, CLI, routing, and draft-run smoke coverage so the DP adaptive route drafts and runs only through human-reviewed experimental FEM approval records.

## [0.4.122] - 2026-06-04

### FEM Reviewed Run Approval Enforcement

- Made persisted `fem-reviewer-approval.v1` metadata mandatory for every reviewed experimental `geotech fem run`, using either a matching `--approval-record` or `--approval-output` with reviewer identity, license, and jurisdiction.
- Updated FEM route, GroundModel workspace acceptance, README, web docs, and agent command templates so reviewed run recommendations always include approval persistence metadata.
- Extended CLI and draft-run smoke coverage to validate persisted approval records across raft, excavation, tunnel, consolidation, nonlinear-column, and Biot u-p mock scenarios while full production FEM remains blocked.

## [0.4.121] - 2026-06-04

### FEM Agent Support-Check Tooling

- Added `check_fem_support_member_design` as a deterministic agent-callable FEM support-member limit-state tool for reviewed strut/brace axial, buckling, slenderness, flexure, and combined-utilization checks.
- Required explicit support demand provenance plus reviewer identity, license, jurisdiction, assumptions, and limitations before the tool computes capacities.
- Added default hosted GLM and swarm/registry regressions so agents can use the deterministic support check without inventing support capacity or claiming FEM production approval.

## [0.4.120] - 2026-06-04

### FEM OpenGeoSys Benchmark Evidence

- Added a generated OpenGeoSys staggered hydro-mechanics consolidation benchmark reference and open-source comparison record for the load-generated Biot u-p pressure profile at `t = 10 s`.
- Compared the benchmark-scale Quad4 Biot pressure profile against the OpenGeoSys analytical `p_D` solution with deterministic evidence/result hashes and tolerance-gated series statistics.
- Exposed accepted external comparison IDs in FEM agent evidence summaries so the default hosted GLM prompt can see the new OpenGeoSys evidence while commercial-solver blockers remain active.

## [0.4.119] - 2026-06-04

### FEM Route-Backed Hardening Evidence

- Forwarded reviewed `hardeningModulusKpa` values into the route-backed plane-strain Drucker-Prager adaptive backend instead of dropping them at run time.
- Added `maxHardeningStressKpa` result-envelope evidence and validation so hardened DP manifests fail closed when the hardening evidence is missing, negative, or inconsistent with accumulated plastic strain.
- Extended core and CLI coverage for persisted hardening evidence while keeping the backend explicitly experimental and `productionReady: false`.

## [0.4.118] - 2026-06-04

### Ingest Wait Resilience and FEM Hardening Evidence

- Hardened persisted ingest job waiting so transient partial `job.json` reads during checkpoint-heavy large-PDF runs are retried below the CLI live-progress wrapper instead of surfacing a raw `Unterminated string in JSON` parser error.
- Added bounded persisted-read failure guidance that keeps foreground and `geotech ingest wait` jobs resumable with `geotech ingest wait <jobId>` / `geotech ingest resume <jobId>` instructions if job state remains unreadable.
- Added isotropic hardening metadata to the benchmark-scale Drucker-Prager material point, nonlinear column, and plane-strain evidence paths, including draft preservation, validation, engineering-evidence benchmarks, and default hosted GLM readiness prompts while keeping full production FEM blocked.

## [0.4.117] - 2026-06-04

### Ingest Progress Sidecar and Biot Load-Generated Pressure Evidence

- Added compact persisted ingest `progress.json` snapshots so foreground large-PDF polling can render progress from a small atomic sidecar when the full `job.json` is temporarily unreadable during checkpoint-heavy runs.
- Added an explicit `load-generated-positive-pressure` Biot pressure-envelope mode for mechanically loaded consolidation evidence, preserving the default initial/prescribed pressure-envelope rejection while auditing generated positive excess pore pressure.
- Registered the new load-generated Biot pressure acceptance benchmark in FEM engineering evidence and default hosted GLM readiness prompts while keeping full production FEM blocked behind monolithic hydro-plastic coupling, sparse production solvers, commercial benchmarks, support design, and approval gates.

## [0.4.116] - 2026-06-04

### FEM Evidence Audits and BYOK Local Provider Fixes

- Added per-step dense direct linear-solve residual audits to the plane-strain Biot u-p consolidation evidence kernel, including final-step audit metadata and aggregate transient acceptance thresholds.
- Hardened persisted FEM reviewer approval validation so malformed validation summaries, duplicate or blank assumptions/limitations, duplicate finding codes, and experimental approvals that overclaim production scope fail closed.
- Fixed OpenAI-compatible BYOK support for localhost/private self-hosted endpoints by allowing no-auth local servers, normalizing trailing base URL slashes, and keeping remote endpoints fail-closed without an API key.
- Full production FEM remains blocked behind production sparse/coupled nonlinear solvers, external commercial benchmark acceptance, support-design code checks, and project approval enforcement.

## [0.4.115] - 2026-06-04

### Large PDF Ingest Finalization Hotfix

- Hardened borehole-log async ingest finalization so failed page checkpoints are recorded as review findings instead of being replayed through the final merge and risking a whole-job failure.
- Preserved successful checkpoint data on large PDFs when a later visual page returns malformed provider JSON such as an unterminated JSON response after retry.
- Added regression coverage for mixed successful/failed borehole checkpoints so reviewable partial results keep accurate successful/failed page counts.

## [0.4.114] - 2026-06-04

### FEM Benchmark Evidence, Pressure Replay, and Approval Gates

- Added deterministic generated published-source external benchmark comparison records for Terzaghi consolidation and alpha-zero Biot pressure dissipation, with canonical SHA-256 evidence/result hashes, series summaries, and curve-level tolerance enforcement while commercial-solver coverage remains blocked.
- Added a sequential one-way Biot-pressure replay wrapper that feeds an accepted final Biot u-p pressure frame into the benchmark-scale Drucker-Prager effective-stress solve with explicit no-pressure-DOF/no-monolithic-coupling audit metadata and fail-closed upstream transient checks.
- Added `geotech fem run --require-approval-record` plus workspace acceptance metadata for strict reviewer approval persistence, while keeping production-design approval scope blocked and full production FEM readiness false.

## [0.4.113] - 2026-06-04

### FEM Effective-Stress Evidence and Workspace Acceptance

- Added a kernel-only one-way prescribed pore-pressure increment path to the benchmark-scale plane-strain Drucker-Prager solver, including effective-vs-total stress reporting, Biot stress-reduction audit metadata, pressure-load residual balance, alpha-zero decoupling, and unsafe-input regression coverage.
- Added schema-backed external benchmark comparison validation for scalar and series-summary records with solver metadata, result hashes, coverage summaries, and fail-closed blocker codes while keeping default accepted external comparison results at zero until real published/commercial artifacts are supplied.
- Added JSON workspace-to-run acceptance output for `geotech fem draft --workspace ... --json`, including blocked acceptance for incomplete workspace inputs and accepted reviewed-run commands when explicit user inputs write a validated case path.
- Confirmed with deterministic FEM smoke scenarios and the default hosted GLM FEM agent path that full production FEM remains blocked behind production coupled solvers, independent published/commercial benchmarks, support-design approval, and persisted reviewer workflows.

## [0.4.112] - 2026-06-04

### Large PDF Ingest Checkpoint Replay

- Hardened async PDF ingest finalization so completed page checkpoints replay from persisted OCR/text hints instead of making fresh OCR/model calls during the final document merge.
- Compacted per-page raw model diagnostic text stored in ingest job checkpoints, reducing very large `job.json` churn on 100+ page borehole PDFs while preserving structured extraction fields, warnings, evidence sources, and review findings.
- Added regression coverage for checkpoint-only borehole finalization and raw diagnostic compaction so large ingest jobs complete to reviewable results instead of surfacing raw transient JSON parse errors.

## [0.4.111] - 2026-06-04

### FEM Adaptive DP Route and Guardrails

- Added a reviewed experimental `geotech fem run --backend plane-strain-dp-adaptive` route for explicit `static_2d_plane_strain_drucker_prager` excavation cases, backed by the Quad4 Drucker-Prager kernel, adaptive cutback-bisection rollback audit, solver residual history, and WebGL manifest output.
- Hardened FEM result validation so plane-strain Drucker-Prager manifests fail closed when adaptive metadata is missing or stale, rejected attempts do not roll back, accepted load factors do not reach full load, residuals exceed policy, or any manifest claims `productionReady: true`.
- Added deterministic route tests and mocked default hosted GLM guardrails so nonlinear/plasticity evidence is visible while full production FEM remains blocked behind coupled production solvers, independent published/commercial benchmarks, support-design approval, and licensed project acceptance.

## [0.4.110] - 2026-06-04

### FEM Biot Acceptance, Support Evidence, and Ingest Recovery

- Promoted Biot transient acceptance metadata into route-backed result manifests, validation, CLI output, draft/run smoke, and WebGL smoke coverage, including drained-dissipation and prescribed-gradient relaxation checks.
- Added a deterministic support member yield, Euler buckling, flexural yield, slenderness, and combined axial-flexure interaction check with reviewer identity, license, assumption, limitation, and demand-source validation while keeping support design outside production claims.
- Hardened long visual PDF ingest after repeated malformed provider JSON by downgrading the affected page to manual review after retry instead of failing the entire async job.
- Full production FEM remains blocked behind a production nonlinear coupled solver, advanced staged construction, independent published/commercial benchmarks, and jurisdiction-specific licensed approval.

## [0.4.109] - 2026-06-04

### FEM Committed Plasticity State

- Added committed Gauss-point Drucker-Prager state history to the benchmark-scale plane-strain nonlinear solver, including strain increments, accumulated plastic strain, plastic strain tensor components, and volumetric plastic strain in result evidence.
- Added a non-monotonic `loadHistoryFactors` path for unload/reload evidence and deterministic tests proving committed plastic strain is not reset to virgin material during load reversal.
- Strengthened FEM engineering evidence and production-readiness summaries so the new path-dependent plasticity evidence is visible while full production FEM remains blocked behind consistent tangent, stage activation, pore-pressure coupling, external benchmark, and licensed approval gates.

## [0.4.108] - 2026-06-03

### FEM Sparse Solver and Benchmark Gates

- Added audited CSR sparse linear-algebra utilities and an opt-in sparse Conjugate Gradient backend for the benchmark-scale Drucker-Prager plane-strain load-step solver, including dense-vs-sparse equivalence and oversized-mesh sparse regression coverage.
- Added structured external benchmark acceptance metadata with published/commercial source requirements, quantity tolerances, and readiness blockers when independent references are missing.
- Strengthened staged excavation support screening with per-stage reaction-demand checks and added a mocked default hosted GLM regression that blocks production FEM claims before readiness evidence and run attempts.
- Full production FEM remains blocked: the sparse path is experimental evidence infrastructure, not an approved production nonlinear/plasticity, consolidation, seepage-coupled, support-design, or licensed project-acceptance solver.

## [0.4.107] - 2026-06-03

### FEM Solver Reliability and Approval Gates

- Added explicit nonlinear FEM convergence reporting with per-load-step residual histories, termination reasons, and fail-closed nonconvergence metadata for the benchmark-scale Drucker-Prager plane-strain kernel and nonlinear consolidation-column manifest.
- Hardened the experimental Biot u-p consolidation preview with a bounded transient step policy, pore-pressure diagnostics, pressure-overshoot rejection, and manifest validation for pressure-dissipation metrics.
- Blocked `production-design` FEM approval scope in reviewer approval records and CLI runs until production solver, benchmark, support-design, and jurisdiction-specific acceptance gates are implemented.

## [0.4.106] - 2026-06-03

### FEM Biot Preview Route and Ingest Job Reads

- Added a route-backed experimental `geotech fem demo biot` / `geotech fem run --backend biot-up` path for reviewed plane-strain Biot u-p seepage/groundwater cases with pore-pressure scalar frames, pressure-audit metadata, and draft/run smoke coverage.
- Updated GroundModel, ingest dossier, benchmark, production-readiness, and mocked default GLM surfaces so seepage/groundwater coupling is shown as a human-reviewed preview route, while full production FEM remains blocked behind sparse-solver, nonlinear/plasticity, support-design, independent-benchmark, and approval gates.
- Hardened persisted ingest job reads for large foreground jobs by extending bounded transient `job.json` retry and reusing the last valid live-progress snapshot through partial checkpoint reads.

## [0.4.105] - 2026-06-03

### FEM Biot Terzaghi Evidence

- Added an alpha-zero Quad4 Biot u-p drainage-column benchmark that checks transient pore-pressure dissipation against Terzaghi average consolidation at `Tv = 0.197`.
- Registered the new pressure-dissipation benchmark in the FEM engineering-evidence and production-readiness surfaces so hosted GLM and BYOK-style agents can see the stronger consolidation evidence.
- Kept full production FEM blocked: the Biot kernel remains benchmark-scale evidence, not a route-backed production sparse solver, nonlinear staged-construction backend, support-design engine, or independently approved benchmark corpus.

## [0.4.104] - 2026-06-03

### FEM Biot Evidence Contract

- Hardened the benchmark-scale Quad4 Biot u-p evidence kernel with explicit excess-pore-pressure, stress, storage, and Darcy-flux convention metadata plus auditable pressure-equation residual components.
- Replaced silent negative free-pore-pressure clamping with a fail-fast unsupported-pressure policy and added deterministic pressure-gradient flux and alpha-zero decoupling benchmarks.
- Extended production-readiness and mocked/default GLM/BYOK agent tests so stronger Biot evidence is visible while full production FEM remains blocked until route-backed manifests, production sparse solvers, nonlinear coupling, independent benchmarks, support design, and enforced approvals are complete.

## [0.4.103] - 2026-06-03

### Ingest Foreground Progress Regression

- Added foreground `geotech ingest <pdf>` regression coverage for the reported transient partial `job.json` read so the initial command path keeps polling instead of aborting on a raw `Unterminated string in JSON` parser error.
- Confirmed the reported failure was caused by an older global `geotech` binary (`0.4.99`); the live-progress hardening shipped in `0.4.101` and is included in the current published CLI.
- Kept the fix scoped to ingest reliability and left FEM production readiness unchanged: Biot/FEM remains evidence-level until the solver benchmark and route-hardening work is completed separately.

## [0.4.102] - 2026-06-03

### FEM Biot u-p Evidence

- Added a benchmark-scale Quad4 plane-strain Biot u-p backward-Euler evidence kernel that assembles displacement and pore-pressure DOFs in one coupled solve with pressure storage, Darcy pressure-gradient flow, Biot stress reduction, residual, and mass-balance metrics.
- Exposed the new coupled Biot runner/types through core FEM exports and added deterministic tests for drained-vs-pressurized displacement response, stress sign convention, residual policies, and unsafe input rejection.
- Updated FEM production-readiness and mocked/default GLM agent summaries so the new Biot evidence is visible while full production FEM remains blocked until route-backed manifests, production sparse solvers, nonlinear plasticity coupling, independent benchmarks, support design, and enforced approvals are complete.

## [0.4.101] - 2026-06-03

### Ingest Live Progress Hardening

- Fixed foreground live progress for large resumable PDF ingest jobs so transient partial `job.json` reads are skipped and retried instead of aborting the command with a raw `Unterminated string in JSON` error.
- Added regression coverage for the reported malformed persisted-job read while preserving the completed background job result and progress summary flow.
- Kept the persisted job recovery path bounded: repeated unreadable job state still fails with resumable `geotech ingest wait` / `geotech ingest resume` guidance instead of silently hanging.

## [0.4.100] - 2026-06-03

### FEM Quad4 Seepage Evidence

- Added a benchmark-scale Quad4 plane-strain steady Darcy seepage evidence kernel that solves hydraulic head on the mesh, reports boundary mass-balance residuals, Darcy flux, Gauss-point pore pressure, and Biot effective-stress-reduction metadata.
- Extended FEM engineering evidence with 2D linear-head flow, boundary mass-balance, and effective-stress-reduction benchmarks, and exposed the new seepage kernel/types through the core FEM exports.
- Updated production-readiness and mocked default hosted GLM tests so agents can see the stronger seepage/pore-pressure evidence while full production FEM remains blocked until route-backed result manifests, Biot u-p mechanical coupling, sparse production solvers, external benchmarks, support design, and enforced approvals are complete.

## [0.4.99] - 2026-06-03

### FEM Nonlinear Plane-Strain Evidence

- Added a benchmark-scale mechanical-only Quad4 plane-strain Drucker-Prager load-step kernel that couples Gauss-point stress projection to global residual/reaction checks with explicit solver iterations, plastic Gauss-point state, yield residuals, and collapse/nonconvergence detection.
- Extended FEM engineering evidence with elastic-regression, shear plastic-patch, global residual, staged plastic-strain monotonicity, and collapse-detection benchmarks for the new nonlinear plane-strain kernel.
- Updated production-readiness and default hosted GLM tests so agents can see the verified nonlinear plane-strain evidence while full production FEM remains blocked until sparse solver routes, Biot/pore-pressure coupling, consistent tangent approval, external benchmarks, support design, and enforced approvals are complete.

## [0.4.98] - 2026-06-03

### FEM Plane-Strain Evidence Kernel

- Added a benchmark-scale linear Quad4 plane-strain global assembly kernel with affine patch, skewed geometry, loaded reaction-balance, free-residual, dense-size-cap, and fail-fast validation coverage.
- Wired the new global assembly evidence into FEM engineering evidence, production-readiness summaries, exports, and mocked default GLM planning tests so agents can see the verified kernel without treating it as a production solver route.
- Kept full production FEM blocked until nonlinear global solver coupling, pore-pressure/consolidation coupling, production sparse solver/result routes, support-design standards, persisted approvals, and independent published/commercial benchmarks are approved.

## [0.4.97] - 2026-06-03

### Ingest Provider Response Hardening

- Hardened hosted-beta, Z.ai, OpenAI-compatible, Anthropic, and Hugging Face provider adapters so truncated or malformed HTTP JSON responses are labeled as provider response failures instead of surfacing bare `JSON.parse` errors.
- Made async borehole/geotechnical ingest retry malformed provider JSON once at the page level, then record the page failure in the resumable job if the retry also fails instead of collapsing a long PDF ingest run.
- Added regression coverage for malformed hosted/GLM provider responses and async borehole job retry behavior matching the reported `Unterminated string in JSON` failure mode.

## [0.4.96] - 2026-06-03

### FEM Nonlinear Column Solver Increment

- Added a Drucker-Prager/Mohr-Coulomb-compatible nonlinear material-point return-mapping kernel with principal effective stress state, plastic strain state variables, and yield-residual verification.
- Added `runBuiltinNonlinearConsolidationColumnSolver` and `geotech fem run --backend nonlinear-column` for reviewed staged consolidation cases, producing deterministic solver load-step, iteration, force-residual, yield-residual, and plastic-strain metadata.
- Added deterministic and mocked/default GLM regression coverage for the new FEM backend while keeping production readiness blocked until global 2D/3D assembly, pore-pressure DOFs, independent benchmarks, support design, and enforced production approvals are complete.

## [0.4.95] - 2026-06-03

### FEM Staged Consolidation Preview

- Added an experimental staged settlement/consolidation FEM preview route with a deterministic 1D Terzaghi time-stepper, staged load history, settlement envelopes, pore-pressure metadata, and Mohr-Coulomb material-point review gates.
- Added `geotech fem demo consolidation`, staged consolidation draft/run support, WebGL/fallback rendering coverage, and mock scenario smoke checks while keeping full 2D/3D coupled production FEM blocked.
- Updated GroundModel, ingest dossier, benchmark, and default hosted GLM agent paths so staged consolidation is treated as a human-reviewed preview route, not a contract-only route or production solver.

## [0.4.94] - 2026-06-03

### Ingest Job Persistence Hardening

- Fixed resumable ingest jobs so large `job.json` checkpoint writes stay atomic under live CLI polling instead of falling back to in-place overwrites on Windows file-lock races.
- Added transient JSON-read retries for persisted ingest jobs so a briefly partial checkpoint read is retried before any error is surfaced.
- Added job-aware recovery messaging for corrupt persisted ingest state, including the `geotech ingest resume <jobId>` path instead of a bare JSON parser error.
- Hardened project storage writes and reads with the same atomic-write and transient-read policy for project-backed ingest reviews, case files, artifacts, notes, and active context.
- Added regression coverage for transient half-written job JSON, permanent corrupt job JSON, and corrupt project JSON.

## [0.4.93] - 2026-06-03

### FEM Engineering Evidence Kernels

- Added deterministic FEM engineering evidence kernels for Mohr-Coulomb material-point plasticity, 1D Terzaghi consolidation time stepping, 1D Darcy seepage, effective-stress hydro-mechanical coupling, excavation support screening, convergence/tolerance policy, and reviewer approval-record validation.
- Added benchmarked kernel tests for closed-form triaxial strength, consolidation degree, Darcy flow, mass balance, effective-stress settlement, support safety factors, and approval-record contracts.
- Updated FEM production-readiness reporting so verified kernels are visible to agents and users while full production FEM remains blocked until the kernels are coupled to solver routes and independently benchmarked against published or commercial references.
- Added `geotech fem run` approval-record support so users can persist reviewer identity, license, jurisdiction, assumptions, limitations, validation summary, and case hash, or reject stale approval records before a reviewed preview run.
- Kept FEM positioned as experimental preview plus engineering evidence gates, not a production nonlinear FEM solver.

## [0.4.92] - 2026-06-03

### FEM Production-Readiness Guardrails

- Added a deterministic FEM production-readiness contract and agent tool that blocks production-grade claims for nonlinear/plasticity, consolidation, seepage/pore-pressure coupling, advanced staged construction, support design, real project workspace-to-run acceptance, benchmark validation, and licensed-review workflow until explicit solver and evidence gates exist.
- Added workspace-to-run acceptance validation so report/GroundModel-derived FEM candidates can be accepted only when an implemented preview route has evidence traceability, no missing user inputs, a validated experimental `analysis_case.json`, and a human-reviewed `geotech fem run ... --experimental --reviewed` command.
- Added fixture-backed FEM scenario validation for raft settlement, staged excavation, and tunnel volume-loss mock datasets, including envelope ranges and monotonic sensitivity checks.
- Extended FEM draft/run smoke coverage with contract-only route checks, reaction/volume reference checks, and cross-scenario trend assertions for raft, excavation, and tunnel preview datasets.
- Required scoped FEM agent and swarm prompts to assess production readiness before answering production-grade, nonlinear, consolidation, seepage, support-design, benchmark, or real-project workspace-to-run requests.
- Required `geotech fem run` to include explicit `--reviewed` acknowledgement in addition to `--experimental` before running a reviewed `analysis_case.json`.
- Blocked generic agent result persistence from saving forged FEM analysis cases even when the model spoofs a deterministic FEM planning tool name.

## [0.4.91] - 2026-06-03

### Corpus Mixed Digital/Scanned Coverage

- Added a small cached mixed digital/scanned PDF benchmark fixture to the internal geotechnical corpus registry.
- Added `GEOTECHCLI_BENCHMARK_MIXED_DIGITAL_SCANNED_PDF` as the private real-fixture env path for mixed native-text plus scanned-page reports.
- Extended corpus registry coverage so the benchmark harness keeps mixed digital/scanned reports on the same provider, preprocessing, cache-reuse, traceability, GroundModel-readiness, and redaction contract as the other fixture classes.
- Added a core corpus trend contract validator and renderer for `corpus-history.json`, `corpus-trend.json`, and `corpus-trend.html`.
- Made corpus trend artifacts summary-only and fail closed if raw benchmark/source fields, model IDs, private paths, or token-shaped values appear.

### Preprocessing Benchmark Guardrails

- Added a typed contract validator for preprocessing fixture benchmark artifacts covering all six fixture categories and all `none`, `ocr-optimized`, and `region-v2` mode runs.
- Made `npm run benchmark:preprocessing` emit all mode-pair deltas, path/secret safety metadata, report/trend contract validation, and path-safe history/trend JSON plus a trend HTML dashboard.
- Added focused regression coverage so preprocessing benchmark artifacts fail when region-v2 crop assets regress, mode comparisons disappear, or private paths/token-shaped values leak.
- Added trend-artifact regression coverage so preprocessing trend JSON fails closed if raw fixture filenames, asset hashes, private paths, prompts, responses, or model payload fields appear.

### BYOK Report Guardrails

- Added a report-level BYOK benchmark contract validator for live smoke artifacts.
- Added path-safe BYOK smoke history/trend artifacts (`byok-history.json`, `byok-trend.json`, and `byok-trend.html`) that store provider summary metrics only.
- Made persisted BYOK smoke reports include `contractValidation` metadata, including skipped-provider runs.
- Made BYOK benchmark report output redact private local paths and provider-token-shaped values before persistence.
- Restored `OPENAI_COMPATIBLE_MODEL_ID` as the documented fallback alias for OpenAI-compatible BYOK smoke checks.
- Added runtime OpenRouter and Hugging Face BYOK env aliases so `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` and `HUGGINGFACE_API_KEY` work consistently outside the smoke harness.
- Added fixture-backed coverage proving hosted-beta, OpenAI-compatible, OpenRouter/free, and local/HF-compatible runs stay on one comparable preprocessed page-evidence contract.

### Signal Analysis Guardrails

- Added a fixture-backed signal-analysis result contract for settlement, piezometer, inclinometer, vibration, and load-test outputs.
- Added a core signal benchmark artifact contract for comparison and trend JSON, covering all five synthetic instrument classes, zero model calls, direct threshold-profile metrics, direct HTML plot export, and path/secret safety.
- Made `npm run benchmark:signal-analysis` persist `contractValidation` metadata and fail when benchmark comparison or trend artifacts fall outside that contract.
- Made signal acceptance fail when deterministic outputs drop trend/rate/series structures, lose threshold-profile review gates, carry model/LLM metadata, or leak private paths/token-shaped values.
- Made raw `analyzeSignalFile` source labels path-safe by default so direct signal results store basenames instead of local absolute input paths.

### Calculation Draft Guardrails

- Added a fixture-backed contract validator for GroundModel-derived bearing, settlement, pile, liquefaction, and slope calculation input drafts.
- Made draft acceptance fail if a design-calculation draft becomes auto-ready, loses missing-user-input gates, drops evidence/source references, carries FEM execution or case-output commands, raw prompts/responses/source-evidence/model payload keys, or leaks private paths/tokens.
- Fixed pile-capacity draft traceability so unit-weight evidence is retained when unit weight is used in the generated pile input draft.

### Standards Profile Guardrails

- Added a fixture-backed runtime contract check for Eurocode 7, AASHTO, IS, BS, and ASTM standards-profile validation output.
- Made the standards-profile acceptance test fail if readiness output starts exposing run commands, solver/FEM metadata, calculation/design result payloads, raw prompts/responses/source-evidence/model payload keys, private paths, token-shaped values, or source references outside the embedded standards database.
- Kept standards profiles scoped to assumptions, blockers, safety-factor context, and source references; they remain readiness checks, not automatic design-code calculations.

### FEM Boundary Guardrails

- Added GroundModel-derived planned FEM route acceptance coverage for shaft, pile-group, slope/embankment, retaining-wall/excavation-support, seepage/groundwater, and staged settlement/consolidation contract-only routes.
- Added benchmark and corpus guardrails that fail when contract-only FEM routes expose case-output creation, run command templates, agent solver/WebGL/result-manifest actions, or lose blocked-until metadata, disallowed agent actions, route-specific review gates, or boundary blocked reasons.
- Added candidate-level checks so planned FEM draft routes reject raw prompt/response/source-evidence/model payload keys, result-manifest/solver/WebGL payloads, private paths/tokens, and redact local absolute evidence source paths before exposure.
- Kept planned FEM routes explicitly experimental and non-runnable until deterministic solvers, validation fixtures, engineering benchmark cases, and renderer smoke tests exist.

## [0.4.90] - 2026-06-01

### BYOK Evidence-Contract Benchmark

- Added a provider-neutral BYOK benchmark contract that sends hosted-beta, OpenAI-compatible, OpenRouter/free, and local/HF-compatible routes the same preprocessed page-evidence prompt.
- Made BYOK response validation require compact JSON, source-evidence citations, preserved review gates, and no claims of direct image/PDF inspection.
- Extended `npm run smoke:byok` with structured JSON report output so configured providers can be compared by profile, model, latency, tokens, and evidence-contract failures.

## [0.4.89] - 2026-06-01

### Corpus Path-Safety Guardrails

- Added a machine-readable path-safety block to the internal geotechnical corpus benchmark report.
- Made corpus acceptance fail closed when fixture or benchmark inputs contain local absolute paths or secret-shaped values.
- Kept path/secret findings redacted in JSON and HTML output so private fixture paths and BYOK tokens are not echoed into persisted benchmark artifacts.

## [0.4.88] - 2026-06-01

### Provider Benchmark Hardening

- Split the internal geotechnical corpus benchmark provider matrix into hosted-beta, OpenAI-compatible BYOK, OpenRouter/free, and local/HF-compatible profiles.
- Added provider evidence-input metadata and fail-closed corpus checks so text-only/free/local profiles must consume preprocessed OCR/page evidence instead of direct image or native-PDF tasks.
- Added corpus-level confidence component summaries and trend fields so extraction, traceability, corroboration, readiness, and page-evidence trust can be reviewed separately from model self-score.

## [0.4.87] - 2026-06-01

### Trusted Publishing Release Fix

- Fixed the trusted-publishing release build by giving the web package a temporary npm lockfile during Next.js build so its SWC registry fallback selects npm instead of Yarn in the Node 24 publish job.
- Kept the web build behavior unchanged for users while making the release pipeline consistent with the already-passing CI build.

## [0.4.86] - 2026-06-01

### Signal Benchmark Trends

- Added path-safe signal benchmark history and trend artifacts so deterministic monitoring runs can be compared over time without storing raw monitoring files or private local paths.
- Added a small `signal-trend.html` dashboard alongside signal comparison JSON and SVG output, including instrument coverage and run-to-run deltas.
- Kept the signal benchmark fail-closed on path leaks while preserving zero-model-call acceptance for settlement, piezometer, inclinometer, vibration, and load-test fixtures.

## [0.4.85] - 2026-05-31

### Signal Threshold Profiles

- Added opt-in deterministic signal threshold profiles for settlement, piezometer, inclinometer, vibration PPV, and load-test monitoring data, with review gates that require project-specific trigger levels before engineering acceptance.
- Extended `geotech signal analyze` and the sandboxed `analyze_signal_file` tool with `--threshold-profile auto|<profile>` while keeping LLMs out of signal metric calculation.
- Expanded the signal benchmark fixture to cover all five instrument classes and made comparison/direct-signal benchmark artifacts path-safe so local absolute paths do not leak into persisted outputs.

## [0.4.84] - 2026-05-31

### Calculation Draft Traceability

- Extended opt-in GroundModel calculation input drafts with structured source references, grouped source pages, evidence-derived draft confidence, and explicit review gates.
- Kept bearing, settlement, pile, liquefaction, slope, and FEM draft workflows non-executing until missing user inputs, assumptions, and evidence gates are resolved.
- Fixed the broader preprocessing v2 fixture regression test timeout so full core CI has enough budget for deterministic multi-PDF region rendering.

## [0.4.83] - 2026-05-31

### Standards Profile Validation

- Added deterministic standards-profile validation for Eurocode 7, AASHTO, IS, BS, and ASTM readiness, including blocker codes, required assumptions, safety-factor context, and source-reference anchors.
- Wired standards-profile validation into GroundModel verification without auto-running design calculations, so calculation drafts remain review-gated and evidence-bound.
- Added focused regression coverage for profile assumptions, missing evidence blockers, workflow blockers, and source-reference propagation.

## [0.4.82] - 2026-05-31

### Preprocessing Benchmark Harness

- Added deterministic mixed digital/scanned and malformed scanned PDF fixtures so preprocessing v2 coverage now spans borehole logs, CPT tables, lab tables, mixed scanned reports, mixed digital/scanned PDFs, and malformed scanned PDFs.
- Added `npm run benchmark:preprocessing` to compare `none`, `ocr-optimized`, and `region-v2` without hosted model calls, writing JSON, HTML, and SVG summaries with latency, quality, crop-asset, region-count, and region-quality deltas.
- Kept preprocessing benchmark artifacts path-safe by recording fixture basenames and hashes only, then failing the benchmark when local paths or secrets leak into persisted output.

## [0.4.81] - 2026-05-31

### Preprocessing V2 Fixture Coverage

- Added deterministic scanned CPT table, lab table, and mixed scanned-report PDF fixtures to broaden `region-v2` crop-detection coverage beyond the initial borehole/table acceptance PDF.
- Added preprocessing-only regression coverage proving `region-v2` detects normalized crop assets and region quality across CPT, lab, and mixed report layouts without requiring hosted model calls.
- Updated development status to keep the broader fixture expansion visible as the next PDF/image preprocessing v2 hardening slice.

## [0.4.80] - 2026-05-31

### Region-v2 Real Evidence Acceptance Fixture

- Added a deterministic in-repo image-only borehole/table PDF fixture so `region-v2` preprocessing is tested against rendered PDF evidence, not only synthetic benchmark metadata.
- Made corpus acceptance fail when `region-v2` produces zero preprocessing regions, zero persisted crop assets, low region quality, or traceability below `none`/`ocr-optimized` for the same fixture/provider.
- Updated corpus HTML comparisons to show region quality deltas and improved real-fixture handling so committed public fixtures do not leak absolute local paths.

## [0.4.79] - 2026-05-31

### Region-Level Preprocessing V2

- Added explicit `region-v2` PDF/image preprocessing mode with fine-pass deskew metadata, higher-resolution normalized pages, smarter table and borehole/log strip crop candidates, region quality scoring, and mode-aware cache compatibility.
- Routed `region-v2` table/log crop assets into OCR before full-page vision OCR so borehole and table evidence gets a tighter first extraction target while preserving provider-neutral fallback behavior.
- Extended corpus benchmarks to compare `none`, `ocr-optimized`, and `region-v2` by default, including region quality, persisted crop assets, deskew, hosted-call, traceability, and GroundModel readiness deltas.

## [0.4.78] - 2026-05-31

### Trust-First Corpus Benchmark Foundation

- Added `npm run benchmark:geotech-corpus` as an internal R&D wrapper over the geotechnical document benchmark contract, covering fixture categories, provider profiles, preprocessing modes, traceability, cache reuse, GroundModel readiness, and FEM execution-boundary guardrails.
- Added real-fixture corpus mode for private local PDFs/images supplied through `GEOTECHCLI_BENCHMARK_*` env vars, with first-pass plus cached-rerun execution, `none` versus `ocr-optimized` preprocessing comparison, default skipping for absent private fixtures, and `--required` failure gates.
- Added local corpus history/trend JSON and HTML outputs, review-gate reporting, and private-path redaction so benchmark results remain comparable without committing report bytes or local absolute paths.

## [0.4.77] - 2026-05-25

### Integrated Ingest Borehole Map Retention

- Kept all recovered report boreholes selectable in the integrated ingest HTML evidence, strip-log, extracted-field, map, and A-A section views instead of collapsing the review to the first structured borehole.
- Promoted borehole-specific coordinate text from retained OCR/native report evidence into GroundModel map points, including compact `BORE HOLE NO ... Latitude/Longitude ...` OCR rows and projected easting/northing rows.
- Preserved engineering trust boundaries by keeping site-only coordinates out of borehole maps and falling back to a clearly labeled schematic alignment when recovered borehole coordinates are missing or partial.
- Added `geotech agent --task calculation-readiness` plus prompted calculation-readiness routing so bearing, settlement, pile, liquefaction, slope, and FEM draft workflows summarize deterministic GroundModel readiness and command templates before any optional LLM review.

## [0.4.75] - 2026-05-24

### Route Proposal Fallback Audit

- Added CLI regression coverage for failed `--route-with-model` router calls, proving the command falls back to the workspace-backed agent path while preserving a failed router row in `model_calls.jsonl`.
- Clarified project-aware agent guidance so fallback provenance describes the current planned workspace-backed handoff row instead of implying post-run provider model-call telemetry that is not yet captured.

## [0.4.74] - 2026-05-24

### Optional LLM Workflow Route Proposals

- Added `geotech agent --route-with-model` so ambiguous project prompts can ask the configured hosted/BYOK model for a strict JSON workflow route proposal while clear recognized prompts still keep the zero-model deterministic fast path.
- Added route provenance and proposal audit records: `workflow_route.json` now records `selectionSource`, rejected model tasks, and confidence-gate results, while `model_calls.jsonl` records the router proposal only when the opt-in model route path is used.
- Hardened route validation so unknown model-supplied tasks are rejected, no-evidence model proposals remain below the deterministic execution gate, and failed or rejected route proposals fall back to the existing workspace-backed LLM agent path.

## [0.4.73] - 2026-05-24

### LLM-Agnostic Project Workflow Router

- Added a provider-neutral project workflow router contract that supports deterministic CLI routing today and validates any model-supplied workflow selections without letting models own calculations or FEM math.
- Prompted project requests such as `geotech agent "find anomalies and create visualizations"` now route recognized workflow intents through confidence-gated deterministic `.geotech` workflow artifacts before falling back to the LLM-backed agent for custom questions.
- Added route artifacts, combined route reports, strict task validation, rejected-task handling, provider operating-contract coverage, and CLI regression tests proving deterministic routes keep `model_calls.jsonl` empty.

## [0.4.72] - 2026-05-24

### Deterministic Project Workflow Executor

- Added a provider-neutral project workflow executor for explicit `geotech agent --task data-quality|ground-model|risk-analysis|anomaly-detection|recommendations|visualization` runs, so selected project workflows now produce deterministic artifacts before any optional LLM review.
- Added deterministic workflow artifacts under `.geotech/runs/<runId>/`: `workflow_result.json`, `workflow_report.md`, and `workflow_trace.json`, with `model_calls.jsonl` kept empty for deterministic task runs.
- Added a core `@geotechcli/core/project-workflow` export surface and regression coverage for provider-neutral workflow results, chart specs, reports, and CLI short-circuit behavior.

## [0.4.71] - 2026-05-23

### Release Checkout Permission Hotfix

- Added explicit repository read permissions to the release verify and Cloudflare deploy jobs so `actions/checkout` has a usable token even when repository default workflow permissions are tightened.
- Clarified the `geotech agent --no-workspace` help text so it matches the current behavior: the flag disables automatic project-aware discovery for prompted and non-prompted runs.

## [0.4.70] - 2026-05-23

### Project-Aware Agent Root, Intent, And Swarm Trace Fixes

- Added provider-neutral project root detection for `geotech agent`: explicit `--workspace`, existing `.geotech/project.json`, nearest git root, then current directory.
- Made prompted `geotech agent "..."` project-aware by default unless `--no-workspace` is supplied, while `geotech agent .` now enters discovery mode like no-prompt runs.
- Added project-agent intent artifacts, run manifests, file/evidence JSONL indexes, local `memory.json`, tool-call traces, and model-call traces under `.geotech/`.
- Added `--max-files`, `--max-depth`, and `--trace` project-agent options so workspace discovery can be bounded and audited.
- Fixed swarm planning so disabled skill tools are not advertised unless `--skills` is enabled, orchestrator-only report planning does not claim unavailable deliverable tools, reviewer tool context is retained, and rejected swarm reviews remain unresolved instead of approved-with-notes.

## [0.4.69] - 2026-05-23

### Project-Aware Agent Harness

- Added the first project-aware `geotech agent` harness slice: no-prompt and `--plan-only` runs now scan the workspace deterministically, write `.geotech` project state, compute workflow readiness, and show next workflow options before any LLM call.
- Added `geotech agent --task data-quality|ground-model|risk-analysis|anomaly-detection|recommendations|visualization --workspace <dir>` so selected project workflows route through the provider-neutral workspace manifest and GroundModel/verifier context.
- Updated FEM route recommendations so completed drafts point to reviewed `geotech fem run <analysis_case.json> --experimental` execution while missing-input states continue to point to `geotech fem draft ... --case-output`.
- Fixed the OpenAI-compatible BYOK environment contract so `OPENAI_COMPATIBLE_MODEL` is the documented primary model variable and `OPENAI_COMPATIBLE_MODEL_ID` remains a backward-compatible alias.

## [0.4.68] - 2026-05-21

### npm Publish Path Hotfix

- Fixed the sequential npm publish script so each workspace publishes from its package directory instead of passing `packages/core` or `packages/cli` as an ambiguous npm package spec.
- Normalized published package repository metadata with explicit GitHub URLs and workspace directories for `@geotechcli/core` and `geotechcli`.
- Kept `0.4.67` unpublished on npm after the publish-path failure and moved the repair release to `0.4.68`.

## [0.4.67] - 2026-05-21

### Sequential npm Trusted Publishing

- Replaced concurrent Changesets publishing with a deterministic npm publish script that publishes `@geotechcli/core` first, waits for registry visibility, and only then publishes `geotechcli`.
- Restricted npm publishing to the `strong-beta` branch so tag-triggered workflows can create GitHub releases without attempting a second npm publish.
- Added package-version and dependency guardrails so the CLI cannot publish against a missing or mismatched core package version.
- Made the Cloudflare beta deploy wait for successful npm publishing so the live site cannot advance after a partial npm release.

## [0.4.66] - 2026-05-21

### npm Trusted Publishing Guard Fix

- Fixed the Trusted Publishing toolchain guard quoting so Bash does not expand JavaScript template expressions before Node evaluates the release check.
- Kept the npm publish path tokenless and OIDC-based for the second Trusted Publishing release attempt.

## [0.4.65] - 2026-05-21

### npm Trusted Publishing Hardening

- Switched the npm publish job to Trusted Publishing/OIDC by removing the long-lived `NPM_TOKEN` publish path from `changeset publish`.
- Hardened the release publish job around a Node 24/npm 11.5.1+ toolchain check so npm OIDC publishing fails early if the runner cannot satisfy Trusted Publishing requirements.
- Added GitHub repository metadata to the published core package so npm can match the OIDC trusted publisher to the repository.
- Documented the exact npm Trusted Publisher settings for both published packages before the old write token is revoked.

## [0.4.64] - 2026-05-19

### GroundModel-to-FEM Draft Candidates

- Added GroundModel-derived FEM draft candidates for report and borehole ingest output so users can see foundation-settlement and staged-excavation FEM routes from extracted evidence.
- Added a FEM draft routing table to the HTML report output with readiness, missing user inputs, review gates, evidence prefill, and the review-gated draft command.
- Kept the LLM and swarm boundary unchanged: agents can plan, draft, and validate FEM cases, but only the human-invoked `geotech fem run ... --experimental` path executes deterministic preview backends.

## [0.4.63] - 2026-05-19

### FEM Draft-to-Run Acceptance

- Added `geotech fem run <analysis_case.json> --experimental` so reviewed FEM draft cases can be executed through deterministic built-in preview backends instead of only fixed demo cases.
- Kept LLM and swarm FEM authority bounded to planning, drafting, and validation; agents can recommend a reviewed run but cannot execute solver/WebGL artifact generation as a tool.
- Added a draft-to-run smoke harness that creates raft, excavation, and tunnel analysis-case files, runs each accepted case, and verifies deterministic manifests plus HTML artifact output.
- Updated FEM docs, command examples, and release surfaces to distinguish draft, reviewed run, and built-in demo workflows while preserving the non-design safety boundary.

## [0.4.62] - 2026-05-18

### Experimental Tunnel Volume-Loss Settlement Preview

- Added `geotech fem demo tunnel --experimental` as the third deterministic 3D preview, generating an empirical Gaussian tunnel volume-loss settlement surface without hosted model calls.
- Added a tunnel volume-loss analysis-case contract, deterministic result manifest, finite visualization mesh, source metadata, and validation gates for diameter, axis depth, alignment length, volume loss, and trough-width factor.
- Extended `geotech fem draft tunnel-volume-loss-settlement` so agents and users can prepare review-gated tunnel settlement drafts from explicit inputs while preserving `canAutoProceed: false`.
- Updated the FEM WebGL/Canvas smoke harness to generate and test raft, excavation, and tunnel artifacts at desktop and mobile sizes.
- Kept the FEM safety boundary explicit: the tunnel preview is empirical and non-design; LLMs may route, draft, and review the case, but geotechCLI deterministic code owns the generated settlement surface.

## [0.4.61] - 2026-05-18

### FEM Swarm Reviewer Handoff

- Added deterministic simulation-tool context to reviewer swarm prompts so FEM drafts and validation data remain visible even when a model handoff summary is terse.
- Added compact per-tool summaries for FEM/calculation outputs before the reviewer JSON context, keeping BYOK and hosted models aligned on the same evidence contract.
- Added runtime swarm regressions proving simulation agents can prepare FEM cases, reviewer agents can validate FEM cases, and reviewer agents cannot prepare FEM cases.
- Kept FEM safety boundaries unchanged: LLMs plan and review while geotechCLI deterministic contracts own case drafting, validation, and any future solver outputs.

## [0.4.60] - 2026-05-18

### Evidence-to-FEM Draft Bridge

- Added a GroundModel-to-FEM draft adapter that converts FEM readiness drafts into provider-neutral `prepare_fem_analysis_case` inputs with retained evidence references.
- Added `geotech fem draft <objective> --workspace <dir>` so workspace evidence can prefill material, groundwater, and source traceability before users provide geometry, loads, and staging.
- Added `geotech fem agent ... --workspace <dir>` to give the scoped FEM brain FEM-only GroundModel readiness context without widening its tool allowlist.
- Kept FEM safety boundaries unchanged: no solver auto-run, no design approval, and no LLM-invented displacement, reaction, mesh, or stage values.

## [0.4.59] - 2026-05-17

### FEM Case Drafting and Agent Review Hardening

- Added `geotech fem draft <objective>` for deterministic, review-gated FEM analysis-case drafts without running a solver or creating WebGL results.
- Wired FEM GroundModel readiness command templates to the new draft workflow so workspace evidence routes into editable `analysis_case.json` inputs before experimental demos.
- Hardened FEM agent validation so blocked FEM cases return inspectable validation data for reviewer agents instead of hiding blocker findings behind tool transport failures.
- Added compact FEM draft and validation summaries for LLM/swarm handoff, keeping LLMs as planners/reviewers while deterministic geotechCLI contracts own FEM math.

## [0.4.58] - 2026-05-17

### FEM Agent Brain and Manifest Metadata

- Added optional `resultFields`, `steps`, and `datasets` metadata to FEM result manifests so future shaft, tunnel, pile-group, embankment, seepage, and slope previews can share one viewer and validation contract.
- Kept the existing `visualization.disp/color/frames` contract backward-compatible while validating malformed result metadata when present.
- Added `geotech fem agent <task...>` as a scoped LLM FEM planning surface that can only list FEM capabilities, prepare analysis-case drafts, and validate cases.
- Added `scripts/smoke-fem-webgl.mjs` and `npm run smoke:fem:webgl` for reusable desktop/mobile FEM artifact QA across raft, excavation, and future previews.

## [0.4.57] - 2026-05-17

### Experimental Excavation FEM Preview

- Added `geotech fem demo excavation --experimental` as the second deterministic 3D FEM/WebGL preview, covering staged excavation deformation screening.
- Added an excavation analysis-case contract, staged elastic demo runner, finite-result validation, and manifest fields for surface settlement, horizontal displacement, wall-deflection proxy, support reaction, and stage count.
- Extended the FEM WebGL artifact with optional field and stage controls for staged manifests while preserving the existing raft preview layout.
- Updated FEM routing so agents and swarm roles can prepare review-gated `excavation-deformation` drafts without inventing FEM result values.
- Added GroundModel readiness and non-executing input drafts for experimental staged excavation FEM so workspace analysis no longer exposes FEM as foundation-only.

## [0.4.56] - 2026-05-17

### Agentic FEM Routing Foundation

- Added provider-neutral FEM capability routing so agents can list implemented, draft, and planned FEM routes before attempting numerical work.
- Added `list_fem_capabilities`, `prepare_fem_analysis_case`, and `validate_fem_analysis_case` agent tools for deterministic FEM planning, case drafting, and review-gated validation.
- Wired FEM planning into the simulation swarm allowlist and FEM validation into the reviewer allowlist, keeping LLMs responsible for routing/review while geotechCLI owns FEM contracts and validators.
- Added an experimental `fem-foundation-settlement` GroundModel readiness workflow with non-executing input drafts for raft geometry, pressure, material stiffness, groundwater, evidence IDs, and review gates.
- Fixed swarm planner readiness extraction for `ready_with_assumptions` workflows and threaded FEM route/validation tools into DesignEngineer and RiskReviewer plans.

## [0.4.55] - 2026-05-16

### Experimental FEM WebGL Preview

- Added `geotech fem demo raft --experimental` as an opt-in deterministic 3D FEM/WebGL preview for raft settlement workflow development.
- Added a provider-neutral FEM analysis-case and result-manifest contract in core, with validation for assumptions, finite result arrays, mesh references, and reaction-balance review.
- Added a self-contained WebGL exporter for the experimental raft preview so users can inspect deformation scale, mesh wireframe, raft load patch, validation warnings, assumptions, and limitations without hosted model calls.
- Documented the FEM preview as experimental, non-design behavior in README and website docs while keeping production calculations and report workflows unchanged.
- Added regression coverage for the deterministic raft manifest, WebGL export contract, CLI experimental gate, JSON output, and artifact writing.

## [0.4.54] - 2026-05-15

### Integrated OCR Layout Review

- Replaced the legacy dark ingest dossier with the light integrated geotechnical review interface for HTML ingest output.
- Persisted compact GLM-OCR layout pages through geotechnical document ingest, borehole ingest, page audits, and page evidence cache reuse.
- Converted persisted OCR layout geometry into source-page overlays automatically, with conservative text-matched evidence linking for boreholes, extracted parameters, and image/table regions.
- Hardened source-region rendering for duplicate GLM indices, stale region links, invalid persisted pages, ratio bboxes, and GLM layout priority over older reconstructed evidence boxes.
- Narrowed hosted-beta web proxy imports to `@geotechcli/core/llm`, removing the Next.js critical dependency warning from the web production build without changing CLI PDF/vision runtime loading.
- Kept the release on stable Next.js after audit review: the high/critical npm audit gate is clean, while the remaining moderate Next/PostCSS advisory is a tracked upstream nested dependency with no stable patched Next release available yet.
- Added regression coverage for cache layout round-tripping, geotechnical document cache hits, borehole page audits, integrated layout source pages, and Playwright-verified desktop/mobile review output.

## [0.4.53] - 2026-05-15

### Agent Skill Opt-In Hardening

- Made `geotech agent` and `geotech chat` treat `--skills` as the authoritative per-session gate for installed skill tools, even when older config or environment settings request global skill enablement.
- Kept direct `geotech skill ...` commands live while preventing persisted skill runtime settings from leaking into `LLMConfig.skillsEnabled`.
- Added CLI regression coverage for agent, chat, and direct skill command behavior around skill opt-in and approved-skill execution.
- Replaced several Windows-hostile CLI glyphs in agent/vision status output with ASCII text and fixed a corrupted apostrophe in the development status notes.
- Upgraded the web workspace to the May 2026 Next.js security patch line and pinned patched PostCSS/AWS XML parser dependencies used by the website build chain.

## [0.4.52] - 2026-05-10

### Confidence v2 and Report Trust Breakdown

- Added a provider-neutral `confidenceBreakdown` contract to geotechnical document ingest results, separating review confidence into extraction quality, page evidence, source traceability, cross-method corroboration, engineering completeness, readiness, missing critical data, and retained review gates.
- Threaded the confidence breakdown into `DocumentEvidencePacket`, compact agent summaries, benchmark JSON, CLI summaries, and generated HTML reports while keeping the legacy top-level confidence score stable for compatibility.
- Renamed geotechnical report presentation from generic confidence to Review confidence and added a compact Trust breakdown section before GroundModel visuals, with raw page/model details still kept in Processing Audit.
- Tightened missing-critical-data scoring so values such as "not reported" or missing SPT/RQD/friction evidence do not count as usable engineering evidence.
- Updated the canonical cached PDF benchmark fixture from `GeotechnicalInvestigationReport (1).pdf` with Confidence v2 data: 34/34 pages processed, 100% cache hits, zero estimated hosted calls, 100% direct parameter source-page traceability, Review confidence 55%, page evidence 73%, traceability 100%, readiness 50%, and GroundModel readiness 61/100.
- Added Playwright as a development dependency and verified the generated Confidence v2 HTML report at desktop and mobile widths with no page-level horizontal overflow.

## [0.4.51] - 2026-05-09

### PDF Report GroundModel Visual Review

- Added a report-side GroundModel adapter for geotechnical PDF ingest results, preserving source-page evidence IDs, inferred strata, SPT N-values, depth-bound parameters, and groundwater observations in a provider-neutral visual model.
- Added a GroundModel Visual Review section to generated geotechnical report HTML with compact borehole strip logs, SPT N-value depth plotting, lab-parameter depth charts, and groundwater summaries.
- Kept the existing DocumentEvidencePacket schema stable while wiring the richer visual review through the report view model.
- Added regression coverage for report HTML GroundModel visual rendering from PDF evidence.

## [0.4.50] - 2026-05-09

### GroundModel Visual Pack

- Added a GroundModel Visual Review section to `geotech analyze --format html` with compact borehole strip logs, SPT N-value depth plotting, lab-parameter depth mini charts, and groundwater/monitoring summaries.
- Extended `geotech viz` GroundModel support beyond coordinate maps so analyze JSON now renders map, SPT-depth, lab-depth, and groundwater charts from the same provider-neutral `GroundModel` contract.
- Added context-aware table inference so common coordinate headers such as `id` and groundwater files with generic `depth_m` columns still bind to borehole map points and groundwater observations.
- Kept visual outputs evidence-first by carrying borehole IDs, depth, confidence, warnings, and evidence IDs into SVG titles and interactive chart metadata.
- Added regression coverage for the richer HTML visual review and multi-chart GroundModel visualization output.

## [0.4.49] - 2026-05-09

### GroundModel Map Visualization

- Added a provider-neutral `ground-model-map.v1` contract with borehole coordinate points, CRS/local-grid warnings, confidence, source evidence references, and plottable extents.
- Attached GroundModel map data during `geotech analyze` so workspace analysis carries spatial evidence alongside boreholes, standards readiness, and calculation-routing context.
- Added a GroundModel Map section to `geotech analyze --format html`, including plan-view SVG coordinates, map metrics, warnings, and traceable coordinate rows.
- Updated `geotech viz` so GroundModel JSON and analyze JSON are detected automatically and rendered as an interactive coordinate map with point labels and evidence metadata.
- Added regression coverage for GroundModel map creation, analyze HTML rendering, and map chart generation.

## [0.4.48] - 2026-05-06

### Role-Based Swarm Planner

- Added a deterministic role-based swarm execution plan for `geotech agent --swarm`, with WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer ownership.
- Threaded workspace evidence, standards profile, calculation readiness, missing inputs, and approved executable skills into the swarm prompts before specialist execution starts.
- Made `geotech agent --workspace ... --swarm` request non-executing calculation input drafts during workspace analysis so the swarm can route ready, blocked, and assumption-bound workflows without inventing missing inputs.
- Excluded prompt-only and unapproved skills from swarm execution while still surfacing them as audit warnings.
- Added JSON/session output for the generated swarm plan plus regression coverage for prompt injection, role ownership, skill selection, and workspace readiness formatting.

## [0.4.47] - 2026-05-06

### Standards Drafts and Skill Catalog Repair

- Added standards-profile assumptions for Eurocode 7, AASHTO, IS, BS, and ASTM workspace analysis so GroundModel calculation readiness carries an explicit design-profile basis.
- Added opt-in, non-executing calculation input drafts for bearing, settlement, pile, liquefaction, and slope workflows through `geotech analyze --draft-inputs`, including missing user inputs and evidence references.
- Repaired bundled skill bootstrap so partial installs no longer stop after the first few skill manifests; first use now repairs the complete approved strong-beta catalog for direct skill commands and `--skills` agent sessions.
- Removed the stale public docs example that referenced an internal bundled ZIP filename and replaced it with installed-skill validation plus user-owned input-directory examples.
- Added regression coverage for standards profile exports, calculation input drafts, workspace propagation, HTML readiness rendering, and partial skill-catalog repair.

## [0.4.46] - 2026-05-05

### Evidence-First BYOK Synthesis Contract

- Added a provider-neutral `DocumentEvidencePacket` synthesis prompt compiler so report synthesis reads the same page, observation, source-page, review-gate, and traceability contract used by agents and benchmarks.
- Routed geotechnical document synthesis through the evidence-packet compiler instead of raw extraction arrays, preserving whole-report outline order, borehole continuity, missing-data gates, direct-visual review gates, and source-page citation rules across hosted GLM and future BYOK providers.
- Advanced the document evidence packet schema to v2 with extracted risk and recommendation signals so synthesis can stay packet-first without losing engineering interpretation context.
- Added a provider-agnostic agent operating contract for single-agent, swarm, and legacy specialist prompts so BYOK models receive the same GeotechCLI evidence, tool, capability, confidence, and review-gate instructions as hosted GLM.
- Added free/open-route model adaptation rules for compact evidence, smaller steps, provider capability failures, and native-PDF/image fallbacks so free OpenRouter-style models fail clearly instead of drifting silently.
- Tightened OpenAI-compatible capability profiling so known text-only free routes are review-gated for image understanding while multimodal omni/VL/vision routes remain image-capable.
- Added `npm run smoke:byok` for local provider-key smoke tests across Z.ai, OpenAI, Anthropic, Hugging Face, and OpenAI-compatible endpoints when matching environment keys are present.
- Documented BYOK smoke environment variables and added regression coverage for packet-first synthesis prompt compilation and provider-agnostic agent prompt injection.

## [0.4.45] - 2026-05-05

### Provider-Neutral Agent Evidence Context

- Added a schema-validated `DocumentEvidencePacket` for geotechnical document ingest results, normalizing page methods, source pages, observations, content chunks, synthesis, review gates, and traceability into a provider-neutral contract for hosted GLM and future BYOK models.
- Attached evidence packets to geotechnical document ingest and async job-adjusted results so reports, benchmarks, and agents share the same evidence shape.
- Added compact agent evidence summaries for geotechnical ingest, job-result, and persisted-review tools so source pages, methods, missing values, review gates, borehole IDs, and max depth survive agent prompt truncation.
- Updated single-agent and swarm tool-result serialization to prefer compact evidence summaries before raw JSON.
- Added regression coverage for packet schema validation, benchmark evidence-contract metrics, agent ingest summaries, and prompt serialization.

## [0.4.44] - 2026-05-05

### Report Synthesis and Ground Model Visual QA

- Made geotechnical document synthesis read an ordered whole-report outline before high-signal extraction rows so report-level takeaways, risks, recommendations, and borehole evidence are less likely to be dominated by figures or appendices.
- Prevented figure, table, and borehole-log titles from replacing the report title in generated Geotechnical Intelligence Reports, including cached result rendering.
- Rebuilt borehole and ground-model HTML visuals with compact lithology-colored profiles, source-page legend rows, inferred-contact styling, and overflow-safe SVG layout.
- Curated noisy OCR material fragments out of the main material table while keeping page-level traceability in source evidence and Processing Audit.
- Verified the cached `GeotechnicalInvestigationReport (1).pdf` output with Playwright screenshot and layout assertions showing no horizontal overflow or SVG text overflow.

## [0.4.43] - 2026-05-04

### CI Raster Ingest Timeout Hotfix

- Increased the slow raster-page ingest recovery regression timeout so GitHub Actions can finish the same PDF/OCR-style path that passes locally on Windows.
- Kept the benchmark, GroundModel readiness, provider-neutral evidence, and report filename behavior from `0.4.42` unchanged.

## [0.4.42] - 2026-05-04

### Benchmark and GroundModel Readiness

- Added geotechnical report benchmark output for page evidence cache reuse, estimated hosted calls, source-page traceability, retained signal counts, and GroundModel readiness gates.
- Added `npm run benchmark:geotech-report` as a local two-pass benchmark harness for `GeotechnicalInvestigationReport (1).pdf`, with acceptance checks for cache reuse, hosted-call avoidance, traceability, and GroundModel readiness.
- Stamped retained geotechnical materials, classifications, and parameters with provider-neutral `sourcePages` so report evidence remains traceable across hosted GLM and future BYOK providers.
- Added GroundModel calculation-readiness routing for bearing capacity, settlement, pile capacity, liquefaction, and slope stability, including deterministic tool route, score, missing evidence, assumptions, and evidence IDs.
- Updated `geotech analyze` terminal and HTML report output to show calculation readiness before agents or users route evidence into deterministic workflows.
- Renamed default generated ingest and workspace HTML filenames to report wording while preserving internal compatibility APIs.

## [0.4.41] - 2026-05-04

### Ingest Report UI Polish

- Renamed the generated HTML ingest output to a Geotechnical Intelligence Report presentation, including CLI summary labels and browser report prompts.
- Reworked the report shell into a compact dark engineering dashboard with a top navigation bar, cleaner hero hierarchy, dark evidence cards, and contained table/profile sections.
- Tightened desktop and mobile layout constraints so status badges, source metadata, ground-model SVGs, borehole profiles, and engineering tables avoid overlap and horizontal clipping.
- Kept Processing Audit and model-stage details available below the engineering review surface while keeping the main report focused on decisions, evidence, confidence, and human verification.
- Verified the sample `GeotechnicalInvestigationReport (1).pdf` report regenerated with all 34 pages processed and clean desktop/mobile screenshots.

## [0.4.40] - 2026-05-03

### Evidence Cache and Report UX

- Stabilized PDF page evidence cache keys for generated per-page PDF payloads, so repeated full-report ingest reuses native PDF page evidence instead of re-extracting pages whose regenerated bytes differ.
- Added regression coverage for synchronous and persisted async PDF page cache reuse when page payload bytes change between jobs.
- Upgraded the HTML ingest report with status badges, searchable review filters, a schematic ground-model cross-section, source evidence actions, and a scroll-aware human review workflow bar.
- Verified the `GeotechnicalInvestigationReport (1).pdf` ingest rerun completed with all 34 pages as cache hits, no new cache stores, 52 materials, 34 parameters, and the review-focused report presentation intact.

## [0.4.39] - 2026-05-03

### CI Cache Isolation Hotfix

- Disabled automatic page evidence cache reuse under Vitest unless a test opts in explicitly, preventing synthetic page fixtures from reusing stale cached extraction output across tests.
- Kept production and local CLI cache defaults unchanged, so repeated real PDF ingest still reuses unchanged page evidence.
- Verified the full core test workspace locally after the cache-isolation fix.

## [0.4.38] - 2026-05-03

### Page Evidence Cache Foundation

- Added a durable page evidence cache keyed by source file hash, page hash, page number, model version, preprocessing version, and schema version.
- Reused cached geotechnical page evidence on reruns so repeated PDF ingest can skip duplicate OCR, GLM-OCR, GLM-5V, and page extraction work when the page/model/preprocessing inputs are unchanged.
- Persisted cache audit metadata through async ingest checkpoints, segmented child-job merges, final page audits, CLI summaries, and HTML report processing audit views.
- Kept cache I/O best-effort so inaccessible local cache storage never turns a valid page extraction into a failed page.
- Added regression coverage for cache key stability, corrupt cache misses, model/preprocessing/schema invalidation, sync ingest reuse, async job reuse, and report cache presentation.

## [0.4.37] - 2026-05-03

### Hosted Development Headroom and Report Profile Evidence

- Raised installed-CLI hosted beta defaults to 2,000 text, 600 vision, 600 layout, and 200 agent requests per day so image-heavy PDF development runs can complete without exhausting the public daily bucket.
- Raised anonymous hosted beta defaults moderately while keeping stricter abuse protection than installed CLI traffic.
- Hardened Geotechnical Intelligence Report borehole-profile inference to use retained inspection text and content chunks for borehole IDs, terminating depth, and conceptual layer evidence when structured parameter rows omit depth data.
- Added regression coverage for profile generation from real report-style borehole schedule and conclusion text.

## [0.4.36] - 2026-05-03

### Geotechnical Intelligence Report UX

- Redesigned HTML ingest reports as a premium Geotechnical Intelligence Report with a sticky sidebar, executive facts, review actions, engineering insight cards, and source-evidence navigation.
- Added an evidence-first trust table for extracted and missing engineering parameters, including source page, confidence, review posture, and evidence snippets.
- Added a lightweight borehole stratigraphy SVG view for retained borehole/layer evidence, with dashed boundaries for uncertain or missing intervals.
- Moved model-stage and raw page audit details into a collapsed Processing Audit section so the main report stays engineering-decision-first instead of extraction-log-first.
- Added regression coverage for the premium report layout, trust layer, source evidence, processing audit, and borehole visualization.

## [0.4.35] - 2026-05-03

### GLM-5.1 Synthesis Retry Fix

- Kept GLM thinking enabled for final report synthesis as the first attempt, then retried once without thinking when Z.ai returns an empty/no-content assistant response.
- Prevented successful visual ingest runs from showing a `GLM-5.1 synthesis failed` warning when the fallback synthesis response is valid.
- Added regression coverage for the hosted-beta synthesis fallback path so the report brief remains populated after an empty thinking-mode completion.

## [0.4.34] - 2026-05-03

### Hosted GLM-OCR Report Synthesis

- Added a hosted GLM-OCR layout parsing path with a separate `layout` quota bucket, configurable public limits, and developer key/IP bypass support.
- Wired geotechnical document ingest to prefer GLM-OCR layout text before GLM-5V visual extraction, then run a GLM-5.1 synthesis pass for report takeaways, ground model, key parameters, interpretation, and limitations.
- Raised public hosted-beta CLI defaults to 300 text, 120 vision, 80 layout, and 40 agent requests per day while preserving tighter anonymous caps.
- Routed hosted-beta image-only, graphics-only, and text-unreadable report pages directly into structured GLM visual extraction when no accepted text exists, avoiding duplicate OCR-only vision calls before interpretation.
- Marked direct visual page extraction as `vision-visual` in page audits and forced manual review before approval, so high-confidence image-only results do not silently auto-proceed without source-page verification.
- Improved the HTML ingest report with report takeaways, grouped parameter tables, stage badges, an extraction overview strip, confidence meters, cleaner engineering brief text, and shortened table/page-card fragments for human review.
- Applied a shadcn-style static report presentation pass so key engineering tables come before operational audit details, with raw page audit tables collapsed by default.
- Preserved engineering units such as `kN/m3`, `t/m2`, `kg/cm2`, and `m/s` in report presentation while still cleaning OCR-like spacing.
- Added regression coverage for synchronous ingest, persisted async jobs, direct visual extraction, and report HTML rendering.

## [0.4.33] - 2026-05-01

### Hosted GLM PDF Vision Fix

- Forced hosted-beta PDF page inputs through provider-safe raster images so `geotech vision log` no longer sends native PDF parts to the GLM vision model.
- Applied the same hosted-beta PDF raster path to CLI ingest and agent ingest tools, preserving native PDF pages only for providers that can support them.
- Raised the public CLI hosted-beta vision burst window to four requests per minute so one-page image-only PDF workflows can complete OCR and structured extraction without self-rate-limiting.
- Added regression coverage for forced raster PDF page inputs on digital-text PDFs.

## [0.4.32] - 2026-05-01

### Hosted GLM Vision Smoke Fix

- Disabled GLM thinking mode for the hosted `glm-5v-turbo` vision path so borehole-log ingest and vision commands return final assistant content instead of empty completions.
- Fixed the CLI vision retry backoff so recoverable hosted vision failures no longer let Node exit with an unsettled top-level await warning before the fallback attempt runs.
- Added regression coverage for forwarding disabled thinking mode on GLM vision proxy requests.

## [0.4.31] - 2026-05-01

### Hosted GLM Live Smoke Fix

- Disabled GLM thinking mode by default in the hosted-beta proxy so low-latency text calls return final assistant content instead of spending tiny smoke-test budgets on reasoning tokens.
- Added `GEOTECHCLI_HOSTED_BETA_THINKING_MODE=disabled` to the environment contract, with an opt-in path for future deeper reasoning tests.
- Kept the Z.ai GLM model defaults and live release smoke checks aligned with the hosted-beta no-user-key contract.

## [0.4.30] - 2026-05-01

### Hosted GLM Default Swap

- Swapped the strong-beta hosted AI defaults from Qwen on Modal to Z.ai GLM, using `glm-5.1` for text and agent reasoning and `glm-5v-turbo` for vision.
- Kept the public CLI contract on `hosted-beta`, so end users still get default AI access without bringing their own provider key.
- Retargeted the beta proxy, environment docs, release guardrails, and website copy around the server-side `ZHIPU_API_KEY` secret.
- Disabled the legacy Modal deploy workflow by default while preserving it as a manual historical fallback.
- Added guardrails for GLM proxy model defaults and provider-neutral timeout/fallback wording.

## [0.4.29] - 2026-04-24

### GroundModel Truth Layer

- Added the canonical `GroundModel` v1 data contract for local workspace analysis, including boreholes, SPT tests, strata, groundwater observations, lab tests, parameters, monitoring series, evidence references, rejected observations, and model stats.
- Added evidence-bound extraction for sampled CSV/XLSX workspace data so `geotech analyze . --json` now includes source file, sheet, row, column, confidence, raw value, normalized value, and warnings for extracted engineering facts.
- Added a deterministic GroundModel verifier that flags rejected SPT values, missing groundwater, missing borehole coordinates, undeclared local CRS, unknown standard profiles, duplicate SPT depths, and no-evidence workspaces before agent/report synthesis.
- Upgraded `geotech analyze . --format html` with GroundModel, verifier findings, and evidence-table sections while keeping terminal output compact.
- Upgraded `geotech agent ... --workspace <dir>` so the agent receives a manifest plus GroundModel/verifier summary instead of only file classification.
- Kept the release local and cost-aware: no additional hosted-beta or Modal GPU calls are introduced by the GroundModel/verifier path.

## [0.4.28] - 2026-04-24

### Workspace Analyze Foundation

- Added `geotech analyze [workspace]` as the first deterministic local project analyst surface, producing compact terminal output, JSON manifests, or a self-contained HTML workspace report.
- Added core workspace intelligence modules for file discovery, geotechnical file classification, ProjectManifest generation, and recommended next workflows without spending hosted-beta GPU time.
- Added lightweight CSV/XLSX schema inference for depth, time, coordinate, borehole/sample IDs, SPT/CPT, lab, monitoring, and signal-style columns.
- Added `geotech agent ... --workspace <dir>` so hosted-beta agent tasks can receive a compact local manifest summary without direct file guessing.
- Added docs and README coverage for `geotech analyze .`, including `--branch`, `--standard`, `--json`, and `--format html` examples while clearly marking deeper planner and calculation behavior as roadmap layers.

## [0.4.27] - 2026-04-24

### Cost-Aware Hosted-Beta PDF Reliability

- Reduced the hosted Qwen Modal default admission pressure for the L4 path by lowering concurrent inputs to 2, adding an explicit vLLM `--max-num-seqs` guard, and keeping the default max container count at 1 for credit-safe operation.
- Lowered hosted-beta proxy retry pressure by making vision and agent upstream calls single-attempt and reducing text retries, with separate per-minute rate limits for heavier vision and agent calls.
- Serialized more long mixed PDF ingest jobs on hosted beta, especially reports with image-only appendix/tail pages that previously queued too many multimodal requests behind one GPU.
- Added cheaper PDF retry behavior: deterministic partial extraction for text timeouts, skipped duplicate vision OCR on retry, and downgraded repeated slow image-only tail pages to manual review instead of spending another 180s per page.
- Added a clear browser-report command after plain persisted ingest results so users can immediately open the HTML review when they did not pass `--format html`.

## [0.4.26] - 2026-04-24

### Strong-Beta Reliability And Ingest UX Fixes

- Fixed bundled strong-beta skills in global npm installs by trusting only the first-party `@geotechcli/core/bundled-skills` archives while keeping arbitrary outside ZIP imports blocked.
- Changed long PDF ingest to live-wait by default with visible progress, elapsed time, heartbeat/status, page counts, and failures; added `geotech ingest --background` to keep the previous detached-job behavior.
- Made `geotech ingest --format html`, `wait --format html`, and `result --format html` save/open a real browser report by default, with `--no-open` preserving a save-only workflow and compact terminal summaries replacing full table dumps.
- Hardened PDF ingest jobs with page-count fallbacks, zero-page job rejection, retryable 524/upstream-timeout checkpoints, lower hosted-beta image-heavy concurrency, and completed-partial resume retry behavior.
- Improved geotechnical report extraction by preserving user-declared report intent, preventing borehole appendix pages from dominating document class, rejecting impossible SPT values from standards references, and preserving raw evidence as warnings.
- Cleaned strong-beta drift in agent docs, handoff notes, changelog encoding, swarm final synthesis fallback, and effective config display for provider-default text and vision models.

## [0.4.25] - 2026-04-23

### Hosted-Beta Long-PDF Segmentation And Merged Reports

- Added hosted-beta long-PDF segmentation for `geotech ingest --type geotech-document`, using a 60 effective-page best-result window with sequential packet execution and one merged final result.
- Added `--page-range <start:end>` to `geotech ingest` for contiguous PDF subrange review, debugging, and targeted reruns.
- Updated the HTML ingest report to surface segmented packet execution, selected page-range context, and merged packet outcomes in one review surface.
- Kept hosted-beta on the non-quantized default Qwen path while forcing segmented long-report execution onto extraction concurrency `1`.
- Hardened parent and child persisted ingest jobs so segmented report packets checkpoint independently and merge back into the parent job with original page numbering.

## [0.4.24] - 2026-04-23

### Modal Deploy And Hosted-Beta L4 Hotfixes

- Fixed the Modal deploy workflow so blank repository variables now fall back to the intended defaults instead of crashing the `serve_qwen.py` launcher during GitHub Actions deploys.
- Reduced hosted-beta L4 startup memory pressure by defaulting the vLLM compilation profile to `{"cudagraph_mode":"NONE"}`, enabling PyTorch expandable segments, and rejecting stale `--num-gpu-blocks-override` startup overrides that can force KV-cache OOM on single-GPU deployments.
- Wired the new Modal compilation override through the deploy workflow and runtime notes so the hosted-beta Qwen path can be tuned safely without introducing a permanent warm-container cost increase.

## [0.4.23] - 2026-04-23

### Geotechnical PDF Intelligence, Reports, And Hosted-Beta Release Prep

- Added the new `geotech ingest` CLI workflow for borehole-log packets and broader geotechnical report intelligence, including resumable long-PDF jobs, project-backed review storage, approval flow, and promotion tooling.
- Added first-class agent and swarm ingest-review tools plus broader long-PDF normalization, OCR/preprocess fallback, provider-capability routing, and report-aware document extraction across the core runtime.
- Added a self-contained HTML ingest report renderer so borehole packets and broader geotechnical reports can be reviewed as a polished engineering brief instead of raw JSON alone.
- Updated the strong-beta release surfaces for `0.4.23`, including package metadata, lockfile pins, README, website docs, and website changelog so the public product story matches the shipped PDF/report workflow.

## [0.4.22] - 2026-04-21

### Agent Runtime Parity And Release Surface Alignment

- Unified the live agent tool bootstrap so both `runAgent` and `runSwarm` load the same filesystem, shell, data, deliverable, and skill tool registrations instead of silently drifting when a tool was added by side-effect import only.
- Aligned `runSwarm` with the same deterministic geotechnical intake screen and first-turn hosted-beta fallback used by `runAgent`, so under-specified requests and hosted provider warmup/outage cases now fail more consistently across both execution paths.
- Updated strong-beta release surfaces together for the same versioned fix: package metadata, lockfile pins, README, website docs, website changelog, homepage bundled-skill copy, and release-consistency checks now describe the same `0.4.22` runtime behavior.
- Added a self-contained HTML ingest report renderer for `geotech ingest`, so borehole-log packets and broader geotechnical reports can be reviewed in a cleaner engineering brief instead of raw JSON alone.
- Added public strong-beta CLI examples for report ingest, resumable long-PDF jobs, and report export so the README and docs now show how to process real geotechnical report packets.
- Continued hardening the long-PDF ingest path around normalized page routing, async job orchestration, and broader geotechnical report extraction so mixed engineering PDFs are treated as a first-class workflow rather than a single-file demo.

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

## [0.2.0] - 2026-03-30

### Security Fixes (P0)

- **Filesystem sandbox** - All agent filesystem tools (`read_file`, `write_file`, `parse_csv`, `scan_project`, `list_directory`) now validate paths through `sandbox.ts`. Blocks access to `.ssh`, `.aws`, `.gnupg`, `/etc`, `/proc`, and other sensitive system directories. Symlink escape prevention via `realpathSync` re-check.
- **Shell command hardening** - `run_command` tool now uses centralized `validateShellCommand()`. Blocks `python -c`, `python -m`, pipe operators, redirects, `curl`, `wget`, `sudo`, and all destructive commands. Only allows read-only commands and `python <script.py>`.
- **Fail-closed hosted beta config** Production proxy (`/api/proxy`) now reports unavailable unless `ZHIPU_API_KEY` is configured, and it requires Upstash Redis in production so anonymous rate limiting stays enforced safely.
- **Registration rate limiting** - `/api/auth` registration endpoint limited to 5 attempts per IP per hour.

### New Calculation Modules

- **Pile capacity** (`geotech pile`) - alpha-method (Tomlinson) for cohesive soils, beta-method (Burland) for cohesionless soils, SPT-based (Meyerhof 1976) for driven piles. Supports driven/bored/CFA piles, multi-layer soils, water table, per-layer shaft friction breakdown. References: API RP 2GEO, Eurocode 7 section 7.6.
- **Slope stability** (`geotech slope`) - Bishop Simplified method with automatic critical circle search. Multi-layer soils, water table, surcharge, pseudo-static seismic loading (kh). Returns FOS, stability class (STABLE/MARGINAL/UNSTABLE/CRITICAL), and slice-by-slice results. References: Duncan & Wright (2005), Eurocode 7 section 11.
- **Lateral earth pressure** (`geotech retaining`) - Rankine and Coulomb methods for active, passive, and at-rest (Jaky K0) states. Wall friction angle (delta), sloping backfill (beta), wall inclination (alpha), water table, surcharge. Full pressure distribution profile. References: Eurocode 7 section 9.

### Engineering Accuracy Fix

- **Water table correction in bearing capacity** - Implemented 3-case water table correction: (1) GWT above foundation -> reduced gamma' in both Nq and Ngamma terms, (2) GWT within influence zone (D to D+B) -> interpolated gamma_eff in Ngamma term, (3) GWT below D+B -> no correction. Previously the `waterTableDepth` parameter was accepted but ignored, which could produce unconservative results for sites with shallow water tables.

### Standards Database

- Added **JGS 0121** (Japanese SPT), **JGS 4101** (Japanese pile design), **JSCE C7.11** (NATM tunnel classification), **NEXCO tunnel design**, **JSCE FOS standards**
- Added Eurocode 7 pile shaft resistance (section 7.4), slope stability methods (section 11.5), retaining wall design checks (section 9.5)
- Added Schmertmann (1970/1978) and Meyerhof pile (1976) provisions
- Standards database expanded from 12 to 20+ provisions

### Agent & Guardrails

- **3 new Poka-Yoke guardrail sets** for pile capacity, slope stability, and lateral earth pressure. Validates: pile L/D ratio, zero-strength soil layers, wall friction angle vs soil friction, seismic coefficient range.
- **Swarm simulation agent** now has access to all 3 new calculation tools.
- **Tool registry** expanded from 26 to 29+ registered tools.

### CLI Improvements

- **`--quiet` flag** - Suppress all non-essential output (for scripting).
- **`--dry-run` flag** - Show what would be calculated without executing.
- **JSON-safe strong beta output** - Hosted beta AI commands now keep `--json` responses machine-readable on error paths, and status booleans remain readable instead of being over-redacted.
- Removed v0.2 placeholder commands; `settlement` now points to agent workaround.
- Version bumped to 0.2.0 across all packages.

### Test Suite

- **~120 new tests** covering: pile capacity (4 tests), slope stability (3 tests), lateral earth pressure (6 tests), bearing capacity water table correction (2 tests), filesystem sandbox (5 tests), shell command sandbox (8 tests), new tool registration verification (4 tests).
- Total test coverage now includes all deterministic calculation modules, guardrails, sandbox, standards, and export formats.

### Documentation

- README updated with new commands, quick start examples, expanded security section.
- Global flags table updated with `--quiet` and `--dry-run`.

---

## [0.1.0] - 2026-03-15

Initial release. See README for full feature list.

### P1 Fixes (added in v0.2.0 final)

- **Persistent CLI usage counters** - `FileUsageStore` replaces `InMemoryUsageStore` in the CLI. Usage counters now persist to `~/.geotechcli/usage.json` across process restarts, so the unregistered 5-call limit and monthly quotas are enforced across sessions. File secured to `0600` permissions.
- **Email verification flow** - Registration now requires 2 steps: (1) `POST /api/auth {action:"register", email}` sends a 6-digit verification code (10-min TTL, 5 attempts max), (2) `POST /api/auth {action:"verify", email, code}` verifies and creates the account. API key is only returned after verification. Dev mode includes code in response; production requires email delivery (SendGrid/Resend integration point provided).
- **Structured logging** - `logger.ts` replaces all `console.error/log/warn` in API routes. Production mode outputs JSON lines (Datadog/Cloudflare Logpush compatible); dev mode outputs human-readable. All sensitive fields (`api_key`, `token`, `secret`, `password`) auto-redacted. Proxy route: 0 console calls remaining. Webhook route: 0 console calls remaining.
- **`--quiet` and `--dry-run` flags fully wired** - Both flags defined in `flags.ts` AND consumed in 6 command handlers (bearing, liquefaction, pile, slope, retaining, ai/agent/swarm). `--quiet` outputs only the key result value (for piping). `--dry-run` shows parameters without executing.

### Pre-Launch Critical Fixes

- **Webhook idempotency** - Stripe webhook handler now tracks processed event IDs in memory (24-hour TTL with hourly cleanup). Duplicate events are detected by `event.id` and acknowledged without re-processing. Prevents double-activation of subscriptions or double-downgrades from retry deliveries. For multi-instance deployments, swap the `Map` for Redis `SET` + `EXPIRE`.
- **ReAct brain: proper message arrays** - `brain.ts` completely rewritten. Replaces string concatenation (`conversationHistory += ...`) with a proper `ChatMessage[]` array using alternating `user`/`assistant` roles. New `generateChat()` function in the LLM router accepts multi-turn message arrays directly. Context window management: when conversation exceeds ~10K tokens, older tool exchanges are automatically compressed into a summary message (keeps system prompt, user query, and last 4 messages intact). Tool result data is compacted (no pretty-print, truncated at 3K chars) to save tokens.
- **Swarm agent loop also fixed** - `swarm.ts` `runAgentLoop` rewritten with the same message-array pattern. All 3 swarm agents (interpretation, simulation, reviewer) now use proper multi-turn conversations instead of string concatenation.

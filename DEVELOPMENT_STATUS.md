# geotechCLI Development Status

Last updated: 2026-05-23

## Current Work

v0.4.69 work follows the v0.4.68 npm publish path hotfix and opens the project-aware agent harness slice. The release script still publishes from each package directory so npm treats `@geotechcli/core` and `geotechcli` as local workspace publishes instead of ambiguous package specs. The LLM boundary remains explicit: hosted GLM and future BYOK models can plan, draft, validate, and review FEM cases, but they cannot run solvers, invoke WebGL generation as tools, or invent FEM outputs. The wider engineering track remains provider-neutral evidence, standards-aware GroundModel readiness, GroundModel spatial and engineering visualization, skill-enabled agents, role-based swarm planning, whole-report geotechnical synthesis, compact borehole/ground-model visual QA, the PDF/page evidence benchmark foundation, and experimental deterministic FEM/WebGL contracts so future OCR/vision, BYOK-provider, and GroundModel-to-calculation changes can be measured and routed without asking LLMs to invent calculations.

Current focus:

- Keep the public provider as `hosted-beta` so users do not bring their own key.
- Publish npm packages through Trusted Publishing/OIDC rather than long-lived write tokens once the npm package settings are configured.
- Route hosted text and agent reasoning to `glm-5.1`.
- Route hosted vision to `glm-5v-turbo`.
- Route hosted PDF/table layout extraction to `glm-ocr`.
- Retry final report synthesis without thinking when GLM-5.1 returns an empty thinking-mode response.
- Present HTML ingest results as an evidence-first Geotechnical Intelligence Report with a premium review dashboard.
- Make geotechnical report synthesis whole-report-first before high-signal page-row extraction, so takeaways, risks, recommendations, and borehole interpretation are not dominated by figures or appendices.
- Render borehole and ground-model report visuals as compact lithology/source-page views with Playwright layout QA.
- Cache compact page evidence by file hash, page hash, preprocessing settings, model version, and schema version so reruns can reuse trusted page extraction work.
- Add `geotech ingest ... --format benchmark` / `geotech ingest result <jobId> --format benchmark` for page cache, hosted-call, traceability, and GroundModel readiness measurements.
- Use OCR-optimized margin trimming and normalized raster sizing as the first measurable PDF/image preprocessing pass, then use benchmark output to compare first-run vs cached-rerun behavior.
- Stamp retained materials, classifications, and parameters with provider-neutral `sourcePages` so direct source-page traceability comes from page evidence instead of model-specific prose.
- Normalize geotechnical PDF/report outputs into a provider-neutral `DocumentEvidencePacket` so hosted GLM and future BYOK providers target the same page, observation, traceability, confidence, and review-gate contract.
- Feed compact `DocumentEvidencePacket` summaries into agent tool results so agent reasoning sees source pages, extraction methods, missing values, review gates, borehole IDs, and max depth before raw result JSON is truncated.
- Inject a provider-agnostic operating contract into single-agent, swarm, and specialist prompts so any BYOK model receives the same GeotechCLI evidence, tool, capability, confidence, and review-gate rules as hosted GLM.
- Keep BYOK capability gates honest for OpenAI-compatible/free routes so text-only models are guided through OCR/page evidence instead of being treated as native image readers.
- Keep a canonical cached-rerun fixture and `npm run benchmark:geotech-report` local harness for the `GeotechnicalInvestigationReport (1).pdf` acceptance target.
- Keep the agentic document evidence contract provider-neutral so hosted GLM is only the strong-beta default; future BYOK LLMs should plug into the same page evidence, cache, traceability, and GroundModel readiness space.
- Reconcile extracted report parameters against retained page evidence before visualization, so SPT/lab/groundwater rows are either source-bound to a borehole/depth context or kept out of engineering plots.
- Split report confidence into provider-neutral workflow trust components covering extraction quality, page evidence, source traceability, cross-method corroboration, engineering completeness, readiness, missing critical data, and review gates.
- Extend GroundModel verification with calculation-readiness routing for bearing, settlement, experimental FEM foundation/excavation drafts, pile, liquefaction, and slope workflows before any deterministic calculation is auto-run.
- Render GroundModel coordinate evidence, strip logs, SPT-depth plots, lab-depth charts, and groundwater/monitoring summaries in `geotech analyze --format html` and `geotech viz`, while keeping CRS/local-grid assumptions and evidence IDs visible.
- Attach standards-profile assumptions and opt-in non-executing calculation input drafts to GroundModel readiness so downstream calculations are prepared but still review-gated.
- Keep experimental FEM previews deterministic, validation-gated, and clearly separated from production design calculations while the GroundModel-to-FEM routing contract is developed.
- Keep the tunnel volume-loss settlement preview empirical and review-gated: it can generate a deterministic 3D settlement trough from explicit tunnel geometry, volume loss, and trough-width assumptions, but it is not a tunnel lining, face-stability, or production FEM solver.
- Allow reviewed FEM `analysis_case.json` drafts to be run only through the human-invoked `geotech fem run ... --experimental` path; do not expose solver/WebGL execution as an LLM or swarm tool.
- Surface report/GroundModel-derived FEM draft candidates as routing guidance only; candidate commands must remain `geotech fem draft ...`, never `geotech fem run ...`.
- Expose FEM to agents as deterministic capability/routing/validation tools so LLMs and swarm roles plan and review FEM work instead of inventing solver math.
- Keep `geotech fem agent` as a scoped FEM planning brain that can list, draft, and validate FEM cases but cannot run solvers or invent result manifests.
- Allow FEM draft and scoped FEM agent flows to consume GroundModel readiness as evidence prefill while still requiring explicit user geometry, load, staging, and approval.
- Preserve FEM evidence references from GroundModel readiness so future reviewers can trace material, groundwater, and assumption sources before any solver preview.
- Thread FEM and calculation tool summaries from simulation agents into reviewer prompts so RiskReviewer can validate deterministic case data even when an LLM handoff summary is terse.
- Keep the experimental FEM artifact screenshot-testable with Playwright; headless Chromium may use the deterministic Canvas fallback when WebGL exposes a zero-size drawing buffer.
- Add the first project-aware `geotech agent` harness slice: no-prompt and `--plan-only` discovery scan the workspace, write `.geotech` project state, compute workflow readiness, and ask for the next workflow before any LLM call.
- Route `geotech agent --task <task> --workspace <dir>` through the same provider-neutral workspace manifest and GroundModel/verifier context instead of letting a BYOK/default model guess from raw files.
- Keep FEM route recommendations current: draft creation uses `geotech fem draft ...`, reviewed analysis cases use `geotech fem run <analysis_case.json> --experimental`, and built-in demo commands remain examples rather than agent-recommended execution paths.
- Keep BYOK OpenAI-compatible environment variables aligned with docs and smoke checks by treating `OPENAI_COMPATIBLE_MODEL` as primary and `OPENAI_COMPATIBLE_MODEL_ID` as a backward-compatible alias.
- Keep the bundled strong-beta skill catalog repairable on first use so direct skill commands and `--skills` agent sessions can see the complete approved catalog after partial installs.
- Route optional swarm runs through a deterministic WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer plan over workspace evidence, standards readiness, calculation drafts, approved executable skills, and blocked review gates.
- Raise hosted-beta public limits enough for image-heavy PDF development runs, while keeping developer key/IP bypass unlimited.
- Use the server-side `ZHIPU_API_KEY` secret in GitHub and Cloudflare.
- Keep the legacy Modal deploy workflow present but disabled by default.

## Done So Far

### Project-Aware Agent Harness Slice

- Made `geotech agent --plan-only` and no-prompt `geotech agent` run deterministic workspace discovery first, write `.geotech/project.json`, `.geotech/manifest.json`, `.geotech/context/readiness.json`, `.geotech/context/project_summary.md`, and per-run plan/trace files, then present ready/blocked project workflows without calling an LLM.
- Added `geotech agent --task data-quality|ground-model|risk-analysis|anomaly-detection|recommendations|visualization --workspace <dir>` so selected project workflows route through the existing provider-neutral manifest/GroundModel/verifier context before the LLM reasons.
- Kept existing prompted `geotech agent "..."` behavior stable unless workspace/project-aware mode is explicitly requested, preserving strong-beta compatibility while adding the discovery-first project entry point.
- Split FEM capability recommendations so completed drafts point to reviewed `geotech fem run <analysis_case.json> --experimental` execution instead of stale built-in demo commands, while missing-input states still point to `geotech fem draft ... --case-output`.
- Fixed the OpenAI-compatible BYOK model env contract so the documented `OPENAI_COMPATIBLE_MODEL` drives config and the older `OPENAI_COMPATIBLE_MODEL_ID` remains a fallback alias.

### v0.4.68 npm Publish Path Hotfix

- Fixed the sequential npm publish script so each workspace publishes from its package directory instead of passing `packages/core` or `packages/cli` as an ambiguous npm package spec.
- Normalized published package repository metadata with explicit GitHub URLs and workspace directories for `@geotechcli/core` and `geotechcli`.
- Kept `0.4.67` unpublished on npm after the publish-path failure and moved the repair release to `0.4.68`.

### v0.4.67 Sequential npm Trusted Publishing

- Replaced concurrent Changesets publishing with a deterministic npm publish script that publishes `@geotechcli/core` first, waits for registry visibility, and only then publishes `geotechcli`.
- Restricted npm publishing to the `strong-beta` branch so tag-triggered workflows can create GitHub releases without attempting duplicate npm publishes.
- Added package-version and dependency guardrails so `geotechcli` cannot publish against a missing or mismatched `@geotechcli/core` package version.
- Made the Cloudflare beta deploy wait for successful npm publishing so the live site cannot advance after a partial npm release.

### v0.4.66 npm Trusted Publishing Guard Fix

- Fixed the Trusted Publishing toolchain guard quoting so Bash does not expand JavaScript template expressions before Node evaluates the release check.
- Kept the release publish path tokenless and OIDC-based for the second Trusted Publishing release attempt.

### v0.4.65 npm Trusted Publishing Hardening

- Removed the long-lived `NPM_TOKEN` publish path from the GitHub Actions npm publish job so `changeset publish` can use npm Trusted Publishing/OIDC.
- Moved the publish job to a Node 24 npm toolchain with an explicit npm 11.5.1+ guard, matching npm Trusted Publishing requirements.
- Added GitHub repository metadata to the published core package so npm can match the OIDC trusted publisher to the repository.
- Documented the exact npm Trusted Publisher settings for `geotechcli` and `@geotechcli/core`, including GitHub owner, repository, workflow filename, and allowed action.

### v0.4.64 GroundModel-to-FEM Draft Candidates

- Added a provider-neutral `FemGroundModelDraftCandidate` builder that turns GroundModel calculation readiness into review-gated FEM draft candidates.
- Attached FEM draft candidates to report and borehole ingest dossiers and rendered them as a FEM draft routing table with readiness, missing user inputs, review gates, evidence prefill, and draft commands.
- Added regressions proving GroundModel/report-derived candidates stay draft-only, keep `canAutoProceed: false`, never recommend `geotech fem run`, and do not expose FEM run/WebGL execution as an agent tool.

### v0.4.63 FEM Draft-to-Run Acceptance

- Added `geotech fem run <analysis_case.json> --experimental` so reviewed FEM draft cases can execute through deterministic built-in preview backends.
- Added run dispatch for foundation settlement, staged excavation deformation, and tunnel volume-loss settlement analysis cases while preserving manifest validation and WebGL export behavior.
- Kept FEM agent and swarm execution boundaries unchanged: LLMs can plan, draft, and validate FEM cases, but only a human-invoked CLI run can generate deterministic FEM results.
- Added a draft-to-run smoke harness that writes raft, excavation, and tunnel analysis-case files, runs each accepted case, and verifies deterministic result manifests plus HTML artifacts.
- Updated docs, changelog, and release surfaces to distinguish draft, reviewed run, and built-in demo workflows.

### v0.4.62 Experimental Tunnel Volume-Loss Settlement Preview

- Added `geotech fem demo tunnel --experimental` as the third opt-in deterministic 3D FEM/WebGL preview.
- Added a tunnel volume-loss analysis-case contract and deterministic empirical Gaussian settlement surface with finite manifest validation, surface settlement metadata, volume-loss metrics, trough width, and settlement-volume envelope values.
- Added `geotech fem draft tunnel-volume-loss-settlement` explicit input support for tunnel diameter, axis depth, alignment length, volume loss, trough-width factor, optional alignment center, material assumptions, groundwater notes, and evidence references.
- Updated FEM capability routing and agent tool schema descriptions so hosted GLM and future BYOK models see tunnel settlement as an implemented demo route while still receiving `not-fem-solver`, `not-design-calculation`, and manual review gates.
- Extended the FEM WebGL smoke harness so `npm run smoke:fem:webgl` generates and validates raft, excavation, and tunnel artifacts across desktop and mobile viewports.
- Verified locally with targeted FEM core/routing/CLI tests and core build before release-surface updates.

### v0.4.61 FEM Swarm Reviewer Handoff

- Added deterministic simulation-tool context to reviewer swarm prompts so FEM drafts and validation data remain visible even when a model handoff summary is terse.
- Added compact per-tool summaries for FEM and calculation outputs before reviewer JSON context, keeping hosted GLM and future BYOK models aligned on the same evidence contract.
- Added runtime swarm regressions proving simulation agents can prepare FEM cases, reviewer agents can validate FEM cases, and reviewer agents cannot prepare FEM cases.
- Kept FEM safety boundaries unchanged: LLMs plan and review while geotechCLI deterministic contracts own case drafting, validation, and any future solver outputs.
- Verified locally with targeted FEM/swarm/scoped-agent/CLI tests, full core and CLI Vitest suites using the thread pool, release consistency, monorepo build, web smoke, Cloudflare web build, and FEM WebGL smoke.

### v0.4.60 Evidence-to-FEM Draft Bridge

- Added a GroundModel-to-FEM draft adapter that converts FEM calculation-readiness drafts into provider-neutral `prepare_fem_analysis_case` inputs.
- Preserved source traceability by mapping GroundModel evidence IDs into FEM evidence references with source file, page, sheet/cell, method, and unit notes where available.
- Added `geotech fem draft <objective> --workspace <dir>` so workspace evidence can prefill material stiffness, unit weight, groundwater, and evidence references before users provide geometry, loads, and staging.
- Added `geotech fem agent ... --workspace <dir>` so the scoped FEM brain receives FEM-only GroundModel readiness context without widening its allowed tools.
- Kept FEM safety boundaries unchanged: no solver auto-run, no design approval, and no LLM-invented displacement, reaction, mesh, or stage values.
- Verified locally with targeted FEM routing/readiness/CLI tests, full core and CLI Vitest suites, release consistency, monorepo build, web smoke, Cloudflare web build, and FEM WebGL smoke.

### v0.4.59 FEM Case Drafting and Agent Review Hardening

- Added `geotech fem draft <objective>` for deterministic, review-gated FEM analysis-case drafts without running a solver or creating WebGL result artifacts.
- Added explicit foundation-settlement and excavation-deformation draft inputs plus `--case-output` so users and agents can prepare editable `analysis_case.json` files before experimental demos.
- Wired GroundModel readiness command templates for experimental FEM foundation/excavation routes to `geotech fem draft ... --case-output <analysis_case.json>` instead of jumping straight to demo previews.
- Hardened `validate_fem_analysis_case` so blocked FEM cases return inspectable validation data for reviewer agents and swarm roles instead of hiding blocker findings behind tool transport failure.
- Added compact FEM draft and validation summaries for LLM/swarm handoff, preserving the rule that LLMs plan and review while deterministic geotechCLI contracts own FEM math.
- Verified locally with targeted FEM routing/readiness/CLI tests, full core and CLI Vitest suites using the thread pool, release consistency, monorepo build, web smoke, Cloudflare web build, and FEM WebGL smoke.

### v0.4.58 FEM Agent Brain and Manifest Metadata

- Published v0.4.57 to `strong-beta` with tag `v0.4.57` before opening the FEM manifest and scoped-agent slice.
- Added optional `resultFields`, `steps`, and `datasets` metadata to FEM result manifests while keeping the existing `visualization.disp/color/frames` contract backward-compatible.
- Added validation for malformed result metadata when present, including duplicate field IDs, unknown field/step references, non-finite values, stride errors, and node-count mismatches.
- Added `geotech fem agent <task...>` as a scoped LLM FEM brain that can only call `list_fem_capabilities`, `prepare_fem_analysis_case`, and `validate_fem_analysis_case`.
- Promoted FEM browser QA into `scripts/smoke-fem-webgl.mjs` with the root `npm run smoke:fem:webgl` script for desktop/mobile raft and excavation artifact checks.
- Verified v0.4.58 locally with focused FEM manifest/scoped-agent/routing/CLI tests, full core and CLI Vitest suites using the thread pool, release consistency, monorepo build, web smoke, Cloudflare web build, and Playwright desktop/mobile FEM artifact smoke for raft and staged excavation previews.

### v0.4.57 Experimental Excavation FEM Preview

- Published v0.4.56 to `strong-beta` with tag `v0.4.56` before opening the staged excavation FEM slice.
- Added `geotech fem demo excavation --experimental` as the second opt-in deterministic 3D FEM/WebGL preview.
- Added an excavation analysis-case contract, staged elastic demo runner, finite-result validation, and manifest envelope fields for surface settlement, horizontal displacement, wall-deflection proxy, support reaction, and stage count.
- Extended the FEM artifact renderer with optional field and stage controls for staged manifests while preserving the existing raft preview controls.
- Updated FEM routing so `excavation-deformation` is an implemented demo route for agents and swarm roles, with review-gated drafts and `canAutoProceed: false`.
- Added GroundModel readiness and non-executing input drafts for `fem-excavation-deformation` so workspace analysis no longer presents FEM as foundation-only.
- Kept the FEM operating boundary unchanged: LLMs may route, prepare, and review cases, but displacement, reaction, mesh, stage, and envelope values must come from geotechCLI deterministic execution and validators.
- Verified v0.4.57 locally with focused FEM/readiness tests, full core and CLI Vitest suites, release consistency, monorepo build, Cloudflare web build, web smoke, and Playwright desktop/mobile smoke for the staged excavation artifact.

### v0.4.56 Agentic FEM Routing Foundation

- Published v0.4.55 to `strong-beta` with tag `v0.4.55` before opening the next development slice.
- Added provider-neutral FEM capability routing for implemented, draft, and planned FEM routes: foundation settlement, excavation deformation, shaft deformation, tunnel volume-loss settlement, and pile-group interaction.
- Added `list_fem_capabilities`, `prepare_fem_analysis_case`, and `validate_fem_analysis_case` agent tools so single-agent and swarm sessions can plan, draft, and review FEM cases without inventing numerical outputs.
- Wired FEM planning into the simulation swarm allowlist and FEM validation into the reviewer allowlist.
- Added an experimental `fem-foundation-settlement` GroundModel readiness workflow with non-executing input drafts and review-gated missing user inputs.
- Fixed the swarm planner `ready_with_assumptions` route extraction so readiness from the verifier is visible to role planning.
- Verified v0.4.56 with focused FEM/agent/swarm tests, full core and CLI Vitest suites, release consistency, web smoke, monorepo build, and Cloudflare web build.

### v0.4.55 Experimental FEM WebGL Preview

- Added `geotech fem demo raft --experimental` as an opt-in deterministic 3D FEM/WebGL preview for raft settlement workflow development.
- Added a provider-neutral FEM analysis-case and result-manifest contract in core with validation for assumptions, finite result arrays, mesh references, and reaction-balance review.
- Added a self-contained WebGL exporter for the experimental raft preview with deformation scaling, mesh wireframe, raft load patch, result envelope, validation warnings, assumptions, and limitations.
- Added a deterministic Canvas fallback inside the same self-contained artifact so browser automation or machines with unavailable/broken WebGL still render a meaningful FEM settlement surface instead of a blank canvas.
- Verified the generated FEM artifact with Playwright at desktop and mobile sizes; this Windows headless Chromium run used the Canvas fallback because WebGL reported a zero-size drawing buffer.
- Re-ran focused FEM tests, full core and CLI Vitest suites, release consistency, web smoke, monorepo build, and Cloudflare web build after the fallback patch.
- Documented the FEM preview as experimental non-design behavior in README and website docs, and added regression coverage for the core manifest/exporter and CLI artifact path.

### v0.4.52 Confidence v2 Foundation

- Added a provider-neutral `confidenceBreakdown` contract to geotechnical document ingest results so hosted GLM and future BYOK models are judged by the same evidence workflow, not by model self-confidence.
- Separated confidence into extraction quality, page evidence confidence, source traceability, cross-method corroboration, engineering completeness, readiness, missing critical data, and retained review gates.
- Threaded the confidence breakdown into `DocumentEvidencePacket`, compact agent summaries, benchmark JSON, and HTML report rendering without changing the legacy top-level `confidence` score.
- Renamed the main report metric to `Review confidence` and added a compact Trust breakdown section before GroundModel visuals, while keeping raw page/model details in Processing Audit.
- Verified the real `GeotechnicalInvestigationReport (1).pdf` cached benchmark with 34/34 pages processed, 100% cache hits, zero estimated hosted calls, 100% direct parameter source-page traceability, Review confidence 55%, page evidence 73%, traceability 100%, readiness 50%, and GroundModel readiness 61/100.
- Added Playwright as a development dependency and verified the generated Confidence v2 HTML report at desktop and mobile widths with no page-level horizontal overflow.
- Added regression coverage for ingest confidence breakdown generation, evidence packet/schema propagation, benchmark output, report view-model metrics, and rendered HTML ordering.

### Report Evidence Reconciliation Foundation

- Added deterministic geotechnical report evidence reconciliation before synthesis, binding depth-bound parameters such as SPT, groundwater, index/lab, and strength values to a single clear borehole ID when retained page evidence supports it.
- Quarantined naked SPT rows that have no retained borehole, depth, unit, or SPT context instead of letting numeric chart/table artifacts pollute the report parameter set.
- Stopped the report GroundModel adapter from rendering fake `UNASSIGNED` SPT boreholes and from promoting footing/bearing-pressure table values into SPT-depth plots.
- Added regression coverage for page-evidence borehole reconciliation, SPT artifact quarantine, report GroundModel SPT filtering, and footing-table false positive handling.

### v0.4.51 PDF Report GroundModel Visual Review

- Added a report-side GroundModel adapter for geotechnical PDF ingest results, preserving source-page evidence IDs, inferred strata, SPT N-values, depth-bound parameters, and groundwater observations in a provider-neutral visual model.
- Added a GroundModel Visual Review section to generated geotechnical report HTML with compact borehole strip logs, SPT N-value depth plotting, lab-parameter depth charts, and groundwater/monitoring summaries.
- Kept the existing DocumentEvidencePacket schema stable while wiring the richer visual review through the report view model.
- Added regression coverage for report HTML GroundModel visual rendering from PDF evidence.

### v0.4.50 GroundModel Visual Pack

- Added a GroundModel Visual Review section to `geotech analyze --format html` with compact borehole strip logs, SPT N-value depth plotting, lab-parameter depth mini charts, and groundwater/monitoring summaries.
- Extended `geotech viz` GroundModel support beyond coordinate maps so analyze JSON now renders map, SPT-depth, lab-depth, and groundwater charts from the same provider-neutral `GroundModel` contract.
- Added context-aware table inference so common coordinate headers such as `id` and groundwater files with generic `depth_m` columns still bind to borehole map points and groundwater observations.
- Kept visual outputs evidence-first by carrying borehole IDs, depth, confidence, warnings, and evidence IDs into SVG titles and interactive chart metadata.
- Added regression coverage for the richer HTML visual review and multi-chart GroundModel visualization output.

### v0.4.49 GroundModel Map Visualization

- Added a provider-neutral `ground-model-map.v1` contract with borehole coordinate points, CRS/local-grid warnings, confidence, source evidence references, and plottable extents.
- Attached GroundModel map data during `geotech analyze` so workspace analysis carries spatial evidence alongside boreholes, standards readiness, and calculation-routing context.
- Added a GroundModel Map section to `geotech analyze --format html`, including plan-view SVG coordinates, map metrics, warnings, and traceable coordinate rows.
- Updated `geotech viz` so GroundModel JSON and analyze JSON are detected automatically and rendered as an interactive coordinate map with point labels and evidence metadata.
- Added regression coverage for GroundModel map creation, analyze HTML rendering, and map chart generation.

### v0.4.48 Role-Based Swarm Planner

- Added a deterministic role-based swarm execution plan for `geotech agent --swarm`, with WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer ownership.
- Threaded workspace evidence, standards profile, calculation readiness, missing inputs, and approved executable skills into the swarm prompts before specialist execution starts.
- Made `geotech agent --workspace ... --swarm` request non-executing calculation input drafts during workspace analysis so the swarm can route ready, blocked, and assumption-bound workflows without inventing missing inputs.
- Excluded prompt-only and unapproved skills from swarm execution while still surfacing them as audit warnings.
- Added JSON/session output for the generated swarm plan plus regression coverage for prompt injection, role ownership, skill selection, and workspace readiness formatting.

### v0.4.47 Standards Drafts and Skill Catalog Repair

- Added standards-profile assumptions for Eurocode 7, AASHTO, IS, BS, and ASTM workspace analysis so GroundModel readiness carries an explicit design-profile basis.
- Added opt-in, non-executing calculation input drafts for bearing, settlement, pile, liquefaction, and slope workflows through `geotech analyze --draft-inputs`.
- Repaired bundled skill bootstrap so partial installs no longer stop after the first few skill manifests; first use repairs the complete approved strong-beta catalog for direct skill commands and `--skills` agent sessions.
- Removed the stale public docs example that referenced an internal bundled ZIP filename and replaced it with installed-skill validation plus user-owned input-directory examples.
- Added regression coverage for standards profile exports, calculation input drafts, workspace propagation, HTML readiness rendering, and partial skill-catalog repair.

### v0.4.46 Evidence-First BYOK Synthesis Contract

- Added a `DocumentEvidencePacket` synthesis prompt compiler so final report synthesis reads the same provider-neutral page evidence, observations, source pages, review gates, and traceability contract as agents and benchmarks.
- Routed geotechnical report synthesis through the packet compiler instead of raw extraction arrays, preserving ordered whole-report outline context, borehole continuity, missing-data gates, direct-visual review gates, and source-page citation instructions.
- Advanced the evidence packet schema to v2 with extracted risks and recommendations so future BYOK providers can synthesize from the packet without losing engineering interpretation context.
- Added a provider-agnostic agent operating contract for single-agent, swarm, and legacy specialist prompts so hosted GLM, paid BYOK, free OpenRouter routes, Hugging Face, and local OpenAI-compatible models receive the same GeotechCLI evidence/tool/review rules.
- Added free/open-route adaptation instructions for compact context, smaller steps, unsupported image/native-PDF paths, null content, and rate-limit/provider-failure reporting.
- Tightened OpenAI-compatible capability profiling so known text-only free routes receive image-understanding review gates while multimodal omni/VL/vision routes remain image-capable.
- Added `npm run smoke:byok` for optional local BYOK text-synthesis smoke checks across Z.ai, OpenAI, Anthropic, Hugging Face, and OpenAI-compatible endpoints when environment keys are configured.
- Documented BYOK smoke environment variables and added regression coverage for packet-first synthesis prompt compilation and provider operating contract injection into agents and swarm prompts.

### v0.4.45 Provider-Neutral Agent Evidence Context

- Added a schema-validated `DocumentEvidencePacket` for geotechnical document ingest results, normalizing pages, methods, observations, source pages, content chunks, synthesis, warnings, review findings, and traceability into one provider-neutral contract.
- Attached the packet to geotechnical document ingest results and async job-adjusted results so downstream report, benchmark, agent, and future BYOK provider paths can read the same evidence shape.
- Added benchmark summary fields for evidence-contract coverage, observation counts, method counts, source pages, and review gates.
- Added compact agent evidence summaries for geotechnical ingest, job-result, and persisted-review tools so source pages, extraction methods, missing values, review gates, borehole IDs, and max depth survive prompt truncation.
- Updated single-agent and swarm tool-result serialization to prefer compact evidence summaries before raw JSON.
- Added regression coverage for packet schema validation, benchmark evidence-contract metrics, agent ingest summaries, and prompt serialization.

### v0.4.44 Report Synthesis and Ground Model Visual QA

- Made geotechnical document synthesis read an ordered report outline before high-signal extraction rows so engineering takeaways are report-level first.
- Prevented figure, table, and borehole-log titles from replacing true report titles in generated Geotechnical Intelligence Reports and cached-result rendering.
- Rebuilt borehole stratigraphy and ground-model cross-section views with compact lithology-colored SVGs, source-page legend rows, inferred-contact styling, and overflow-safe layout.
- Curated noisy OCR/table fragments out of the main material-observation table while retaining source evidence and Processing Audit traceability.
- Verified the cached PDF report with core tests, full build, consistency check, Playwright screenshot, and DOM/layout assertions.

### v0.4.26 Reliability Fixes

- Fixed bundled skill trust for global npm installs without weakening arbitrary ZIP import security.
- Made long PDF ingest visibly active by default with live progress.
- Made ingest HTML outputs save/open real browser reports.
- Added retry/resume hardening for long PDF ingest and transient hosted-beta failures.
- Cleaned public docs, changelog, agent docs, and release-surface drift.

### v0.4.27 Cost-Aware Hosted-Beta Stabilization

- Lowered Modal/vLLM request pressure for the hosted Qwen L4 path.
- Reduced retry pressure for vision and agent requests.
- Serialized expensive image-heavy PDF ingest cases.
- Added cheaper partial-failure behavior for repeated text/vision timeouts.
- Preserved the user's limited Modal GPU credit by avoiding unnecessary warm/health calls.

### v0.4.28 Workspace Analyze Foundation

- Added `geotech analyze [workspace]`.
- Added deterministic local project scanning and `ProjectManifest`.
- Added file classification for PDF, CSV, XLSX, AGS, JSON, images, GIS, CAD, office, and text files.
- Added CSV/XLSX schema inference for depth, coordinates, borehole/sample IDs, SPT/CPT, lab, monitoring, and signal columns.
- Added text, JSON, and HTML workspace report outputs.
- Added `geotech agent ... --workspace <dir>` so agents receive a compact manifest summary instead of guessing directly from raw files.
- Updated README, docs, homepage examples, changelog, package metadata, npm package versions, and live site release surfaces.

### v0.4.29 GroundModel Truth Layer

- Added `EvidenceRef` and evidence-bound values.
- Added canonical `GroundModel` v1 types.
- Added local GroundModel builder from workspace manifest and sampled tabular files.
- Added deterministic verifier checks for rejected SPT values, missing groundwater, missing coordinates, undeclared local CRS, unknown standards, duplicate SPT depths, and no-evidence workspaces.
- Added tests for GroundModel construction, evidence binding, rejected SPT standards-reference values, and analyze JSON/HTML output.

### v0.4.30 Hosted GLM Default Swap

- Swapped hosted-beta defaults from Qwen on Modal to Z.ai GLM.
- Kept the no-user-key public beta contract through the existing hosted-beta proxy.
- Updated the proxy, docs, changelog, environment contract, and release guardrails for `glm-5.1` and `glm-5v-turbo`.
- Disabled legacy Modal deploy automation while preserving the workflow for manual fallback.

### v0.4.31 Hosted GLM Live Smoke Fix

- Disabled GLM thinking mode by default in the hosted-beta proxy for lower-latency final content.
- Added an environment override for future deeper-reasoning tests.
- Kept the live release smoke aligned with the no-user-key hosted-beta path.

### v0.4.32 Hosted GLM Vision Smoke Fix

- Disabled GLM thinking mode for the hosted `glm-5v-turbo` vision path.
- Fixed the CLI vision retry backoff so recoverable hosted vision failures do not exit with an unsettled top-level await warning.
- Added regression coverage for GLM vision proxy requests carrying disabled thinking mode.

### v0.4.33 Hosted GLM PDF Vision Fix

- Forced hosted-beta PDF page inputs through raster image payloads before GLM vision calls.
- Applied the raster PDF path to `geotech vision log`, CLI ingest, and agent ingest tools.
- Raised the public CLI hosted-beta vision burst window for one-page image-only PDF workflows.
- Added regression coverage for forced raster PDF inputs on digital-text PDFs.

### v0.4.34 Hosted GLM-OCR Report Synthesis

- Added hosted GLM-OCR layout parsing with a separate `layout` quota bucket, configurable public limits, and developer key/IP bypass support.
- Wired geotechnical report ingest to prefer GLM-OCR layout text, use GLM-5V only when visual reasoning is needed, and generate GLM-5.1 report synthesis for the HTML report.
- Raised hosted-beta public CLI daily limits for text, vision, layout, and agent workflows while preserving tighter anonymous caps.
- Improved the HTML report with report takeaways, grouped key parameters, stage badges, extraction overview, confidence meters, and shadcn-style collapsed audit details.
- Added regression coverage for synchronous ingest, persisted async jobs, direct visual extraction, GLM-OCR fallback, hosted layout limits, and report HTML rendering.

### v0.4.35 GLM-5.1 Synthesis Retry Fix

- Kept GLM thinking enabled for final report synthesis as the first attempt.
- Added a no-content fallback retry without thinking for hosted GLM-5.1 synthesis responses.
- Added regression coverage so valid fallback synthesis populates the report without a stale synthesis-failed warning.

### v0.4.36 Geotechnical Intelligence Report UX

- Redesigned HTML ingest reports around a premium dashboard layout with sticky navigation, executive facts, review actions, and source-evidence sections.
- Added engineering insight cards for ground conditions, design implications, missing critical data, and verification focus.
- Added an evidence-first trust table for retained and missing parameters with source page, confidence, review posture, and evidence snippets.
- Added a lightweight borehole stratigraphy SVG view for retained borehole/layer evidence, with dashed boundaries for uncertain intervals.
- Moved GLM/model-stage details and raw page audit tables into a collapsed Processing Audit section.
- Added regression coverage for the premium layout, trust layer, source evidence, processing audit, and borehole visualization.

### v0.4.37 Hosted Development Headroom and Report Profile Evidence

- Raised installed-CLI hosted-beta defaults to 2,000 text, 600 vision, 600 layout, and 200 agent requests per day.
- Raised anonymous hosted-beta defaults moderately while preserving stricter abuse protection than installed CLI traffic.
- Hardened report borehole-profile inference to use retained inspection text and content chunks for borehole IDs, terminating depth, and conceptual layer evidence.
- Added regression coverage for real report-style borehole schedule and conclusion text when structured depth parameters are missing.

### v0.4.38 Page Evidence Cache Foundation

- Added a durable page evidence cache keyed by source file hash, page hash, page number, model version, preprocessing version, and schema version.
- Reused cached geotechnical page evidence on reruns so repeated PDF ingest can skip duplicate OCR, GLM-OCR, GLM-5V, and page extraction work when inputs are unchanged.
- Persisted cache audit metadata through async ingest checkpoints, segmented child-job merges, final page audits, CLI summaries, and HTML report processing audit views.
- Kept cache I/O best-effort so inaccessible local cache storage does not fail otherwise valid page extraction.
- Added regression coverage for cache key stability, corrupt cache misses, invalidation, sync ingest reuse, async job reuse, and report cache presentation.

### v0.4.39 CI Cache Isolation Hotfix

- Disabled automatic page evidence cache reuse under Vitest unless a test opts in explicitly, preventing synthetic page fixtures from reusing stale cached extraction output across tests.
- Kept production and local CLI cache defaults unchanged, so repeated real PDF ingest still reuses unchanged page evidence.
- Verified the full core test workspace locally after the cache-isolation fix.

### v0.4.40 Evidence Cache and Report UX

- Stabilized PDF page evidence cache keys for generated per-page PDF payloads, so repeated full-report ingest reuses native PDF page evidence instead of re-extracting pages whose regenerated bytes differ.
- Added regression coverage for synchronous and persisted async PDF page cache reuse when page payload bytes change between jobs.
- Upgraded the HTML ingest report with status badges, searchable review filters, a schematic ground-model cross-section, source evidence actions, and a scroll-aware human review workflow bar.
- Verified the `GeotechnicalInvestigationReport (1).pdf` ingest rerun completed with all 34 pages as cache hits, no new cache stores, 52 materials, 34 parameters, and the review-focused presentation intact.

### v0.4.41 Ingest Report UI Polish

- Renamed the generated HTML ingest output from a report-facing presentation to a Geotechnical Intelligence Report presentation, including CLI summary labels and browser report prompts.
- Reworked the report shell into a compact dark engineering dashboard with a top navigation bar, cleaner hero hierarchy, dark evidence cards, and contained table/profile sections.
- Tightened desktop and mobile layout constraints so status badges, source metadata, ground-model SVGs, borehole profiles, and engineering tables avoid overlap and horizontal clipping.
- Kept Processing Audit and model-stage details available below the engineering review surface while keeping the main report focused on decisions, evidence, confidence, and human verification.
- Verified the sample `GeotechnicalInvestigationReport (1).pdf` report regenerated with all 34 pages processed, no visible report wording, and clean desktop/mobile screenshots.

### v0.4.42 Benchmark and GroundModel Readiness

- Added geotechnical document benchmark output for cache reuse, estimated hosted calls, source-page traceability, retained signal counts, and GroundModel readiness gates.
- Added provider-neutral `sourcePages` stamping through geotech document materials, classifications, and parameters so direct traceability survives synthesis and report rendering.
- Added the first canonical cached-rerun fixture for `GeotechnicalInvestigationReport (1).pdf`: 34/34 pages processed, 100% page-evidence cache hits, zero estimated hosted calls on rerun, 37/37 parameters with direct source pages, and GroundModel readiness 61/100.
- Added `npm run benchmark:geotech-report` as the local two-pass benchmark harness for first-run versus cached-rerun behavior against the same report PDF.
- Added GroundModel calculation-readiness output for shallow bearing, settlement, pile capacity, liquefaction, and slope stability with status, score, deterministic tool route, missing evidence, assumptions, and evidence IDs.
- Updated `geotech analyze` text and HTML reports so calculation readiness is visible before agents or users route evidence into deterministic calculations.

## Left To Do

Highest-value next work:

- Expand PDF/image preprocessing before vision beyond margin trimming with deskew, crop tables/log panels, and normalized page-region assets.
- Expand the benchmark harness from the current cached-rerun acceptance fixture into broader latency/provider profiles, region-level preprocessing comparisons, and historical trend output.
- Add provider/BYOK benchmark profiles so OpenAI-compatible, hosted-beta, and future user-selected LLMs are evaluated with the same PDF/image evidence contract instead of model-specific assumptions.
- Expand FEM draft candidates from foundation/excavation report evidence into tunnel, shaft, pile-group, and GroundModel-to-calculation acceptance fixtures before adding any production solver workflow.
- Add `geotech signal analyze` for settlement, piezometer, inclinometer, vibration, load-test, and time-series data.
- Add benchmark evaluation fixtures for boreholes, CPT, lab, reports, monitoring, sensor, pile load, and signal datasets.

## Cost And Reliability Notes

- Prefer local deterministic parsing before hosted-beta or vision calls.
- Do not use legacy Modal health checks unless manually validating the disabled fallback workflow.
- Keep hosted-beta image-heavy PDF workflows serialized and rate-limited until more GPU budget is available.
- Public docs should only advertise behavior that is implemented, tested, and aligned across CLI/core/web.

## Release Checklist Reminder

- Run `npm run verify:consistency`.
- Run targeted core and CLI tests for touched paths.
- Run full core and CLI test suites when core contracts change.
- Run `npm run build`.
- Run `npm run smoke:web`.
- Run `npm run --workspace=@geotechcli/web build:cf` for website/release-surface changes.
- Confirm package versions, changelog, docs, live API/version, npm packages, branch, and tag after push.

### v0.4.43 CI Raster Ingest Timeout Hotfix

- Increased the raster-page ingest recovery regression timeout for GitHub Actions while keeping the v0.4.42 benchmark and GroundModel readiness behavior unchanged.

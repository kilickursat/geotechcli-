# geotechCLI Development Status

Last updated: 2026-06-01

## Current Work

v0.4.87 fixes the trusted-publishing release build by giving the web package a temporary npm lockfile during Next.js build so the Node 24 publish job selects npm during SWC registry fallback instead of Yarn. v0.4.86 adds path-safe signal benchmark history and trend outputs, including `signal-history.json`, `signal-trend.json`, and `signal-trend.html`, so deterministic monitoring benchmarks can be compared over time without storing raw monitoring files or private local paths. v0.4.85 adds opt-in deterministic signal threshold profiles for settlement, piezometer, inclinometer, vibration PPV, and load-test monitoring data, with review gates that require project-specific trigger levels before engineering acceptance, plus path-safe signal benchmark artifacts across all five instrument classes. v0.4.84 extends opt-in GroundModel calculation input drafts with structured source references, grouped source pages, evidence-derived draft confidence, and explicit review gates, and fixes the broader preprocessing v2 fixture test timeout seen in full core CI. v0.4.83 adds deterministic standards-profile validation for Eurocode 7, AASHTO, IS, BS, and ASTM readiness, including blocker codes, required assumptions, safety-factor context, and source-reference anchors wired into GroundModel verification without auto-running design calculations. v0.4.82 adds a deterministic no-model preprocessing benchmark for the broader fixture set. The benchmark compares `none`, `ocr-optimized`, and `region-v2` across borehole/table, CPT table, lab table, mixed scanned report, mixed digital/scanned PDF, and malformed scanned fixtures, then writes JSON, HTML, and SVG summaries with latency, quality, crop-asset, region-count, and region-quality deltas while failing on local path or secret leaks. v0.4.81 started the broader PDF/image preprocessing v2 fixture expansion with deterministic scanned CPT table, lab table, and mixed scanned-report PDFs, plus preprocessing-only tests that prove `region-v2` crop detection, normalized crop assets, and region quality across those page shapes without hosted model calls. v0.4.80 closed the first `region-v2` proof gap by adding a deterministic in-repo image-only borehole/table PDF fixture and making `region-v2` a real corpus acceptance gate. The fixture proves rendered PDF evidence can produce preprocessing region coverage, normalized crop assets, region quality scores, and region-first OCR inputs, while the corpus validator now fails if `region-v2` returns zero regions/assets or regresses traceability below `none` and `ocr-optimized`. v0.4.79 added the underlying `region-v2` PDF/image preprocessing machinery: fine-pass deskew metadata, higher-resolution normalized pages, smarter table and borehole/log strip crop candidates, persisted normalized region assets, region quality scoring, and region-first OCR routing before full-page vision OCR. The corpus runner compares `none`, `ocr-optimized`, and `region-v2` by default across hosted-beta and BYOK text-evidence profiles so preprocessing changes are judged by evidence coverage, region quality, cache reuse, hosted-call estimates, traceability, GroundModel readiness, and review gates rather than visual impression alone. The integrated ingest report UI and GroundModel evidence path continue preserving every recovered report borehole in the evidence, strip-log, field, map, and A-A section views, while project-aware agents keep deterministic `calculation-readiness` routing for bearing, settlement, pile, liquefaction, slope, and FEM draft workflows before any LLM review. The LLM boundary remains tight: hosted GLM and future BYOK models can propose, plan, draft, validate, and review project workflows and FEM cases, while GeotechCLI deterministic contracts own calculations, FEM case data, visualization specs, confidence, and persisted artifacts.

Current focus:

- Keep the public provider as `hosted-beta` so users do not bring their own key.
- Publish npm packages through Trusted Publishing/OIDC rather than long-lived write tokens once the npm package settings are configured.
- Route hosted text and agent reasoning to `glm-5.1`.
- Route hosted vision to `glm-5v-turbo`.
- Route hosted PDF/table layout extraction to `glm-ocr`.
- Retry final report synthesis without thinking when GLM-5.1 returns an empty thinking-mode response.
- Present HTML ingest results as an evidence-first Geotechnical Intelligence Report with a premium review dashboard.
- Keep integrated ingest HTML borehole-aware: recovered BH1/BH2/BH3-style report boreholes must remain selectable in source evidence, strip-log, field, map, and A-A section views instead of collapsing to the first selected borehole.
- Promote source-bound report borehole coordinates from labelled OCR/native text into GroundModel map evidence only when the coordinate text is tied to a borehole ID, and keep schematic fallback when coordinates are missing or partial.
- Make geotechnical report synthesis whole-report-first before high-signal page-row extraction, so takeaways, risks, recommendations, and borehole interpretation are not dominated by figures or appendices.
- Render borehole and ground-model report visuals as compact lithology/source-page views with Playwright layout QA.
- Cache compact page evidence by file hash, page hash, preprocessing settings, model version, and schema version so reruns can reuse trusted page extraction work.
- Add `geotech ingest ... --format benchmark` / `geotech ingest result <jobId> --format benchmark` for page cache, hosted-call, traceability, and GroundModel readiness measurements.
- Use OCR-optimized and `region-v2` preprocessing modes for margin trimming, projection-profile/fine-pass deskew, normalized raster sizing, smarter table/log and borehole/log strip crop candidates, normalized region crop assets, and region/page quality scoring as the measurable PDF/image preprocessing pass.
- Run `region-v2` detected preprocessing region crops through OCR before full-page vision OCR, while `ocr-optimized` continues to use region crops before generic dense-page chunking, so table/log panels get tighter extraction targets without changing the provider-neutral evidence contract.
- Keep page evidence cache keys mode-aware with `GEOTECHCLI_PREPROCESSING_MODE=none|ocr-optimized|region-v2`, and compare preprocessing modes in benchmark output through quality, deskew, region, crop-asset, traceability, hosted-call, and GroundModel-readiness deltas.
- Stamp retained materials, classifications, and parameters with provider-neutral `sourcePages` so direct source-page traceability comes from page evidence instead of model-specific prose.
- Normalize geotechnical PDF/report outputs into a provider-neutral `DocumentEvidencePacket` so hosted GLM and future BYOK providers target the same page, observation, traceability, confidence, and review-gate contract.
- Feed compact `DocumentEvidencePacket` summaries into agent tool results so agent reasoning sees source pages, extraction methods, missing values, review gates, borehole IDs, and max depth before raw result JSON is truncated.
- Inject a provider-agnostic operating contract into single-agent, swarm, and specialist prompts so any BYOK model receives the same GeotechCLI evidence, tool, capability, confidence, and review-gate rules as hosted GLM.
- Keep recognized prompted project workflows on the provider-neutral deterministic router fast path, and use `--route-with-model` only when the user explicitly wants a hosted/BYOK model to propose an allowed workflow sequence for ambiguous prompts.
- Keep `geotech agent --task calculation-readiness` on the deterministic provider-neutral workflow path so agents summarize ready, assumption-bound, and blocked calculation/FEM draft routes without inventing design values.
- Keep BYOK capability gates honest for OpenAI-compatible/free routes so text-only models are guided through OCR/page evidence instead of being treated as native image readers.
- Keep a canonical cached-rerun fixture and `npm run benchmark:geotech-report` local harness for the `GeotechnicalInvestigationReport (1).pdf` acceptance target.
- Keep `npm run benchmark:geotech-corpus` as the internal R&D wrapper over the same per-document benchmark contract so fixture categories, provider profiles, preprocessing modes, traceability, cache reuse, GroundModel readiness, and FEM execution-boundary guardrails can be reviewed together.
- Keep the committed `region-v2-scanned-borehole-table-v1` image-only PDF fixture as the real acceptance gate for rendered PDF table/log crop detection; it must continue to produce nonzero preprocessing regions, persisted crop assets, and acceptable region quality.
- Keep corpus acceptance fail-closed when `region-v2` traceability regresses below `none` or `ocr-optimized` for the same fixture/provider, and keep the HTML/SVG summaries exposing region quality and crop-asset deltas.
- Start PDF/image preprocessing v2 broader-fixture coverage with deterministic CPT table, lab table, and mixed scanned-report PDF fixtures that exercise region-v2 crop detection without requiring hosted model calls.
- Keep `npm run benchmark:preprocessing` as the no-model preprocessing-mode comparison for borehole/table, CPT, lab, mixed scanned, mixed digital/scanned, and malformed scanned fixtures before promoting those fixture classes into hosted ingest benchmarks.
- Keep `npm run benchmark:geotech-corpus -- --real-fixtures` available for private local PDFs/images supplied by env vars such as `GEOTECHCLI_BENCHMARK_BOREHOLE_PDF`, `GEOTECHCLI_BENCHMARK_CPT_PDF`, `GEOTECHCLI_BENCHMARK_LAB_PDF`, `GEOTECHCLI_BENCHMARK_MIXED_SCANNED_PDF`, and `GEOTECHCLI_BENCHMARK_MALFORMED_SCANNED_PDF`; missing fixtures skip unless `--required` is set, persisted benchmark JSON redacts absolute paths, and every run writes local `corpus-history.json`, `corpus-trend.json`, and `corpus-trend.html` artifacts for comparison against prior local results.
- Keep the agentic document evidence contract provider-neutral so hosted GLM is only the strong-beta default; future BYOK LLMs should plug into the same page evidence, cache, traceability, and GroundModel readiness space.
- Reconcile extracted report parameters against retained page evidence before visualization, so SPT/lab/groundwater rows are either source-bound to a borehole/depth context or kept out of engineering plots.
- Split report confidence into provider-neutral workflow trust components covering extraction quality, page evidence, source traceability, cross-method corroboration, engineering completeness, readiness, missing critical data, and review gates.
- Extend GroundModel verification with calculation-readiness routing for bearing, settlement, experimental FEM foundation/excavation drafts, pile, liquefaction, and slope workflows before any deterministic calculation is auto-run.
- Render GroundModel coordinate evidence, strip logs, SPT-depth plots, lab-depth charts, and groundwater/monitoring summaries in `geotech analyze --format html` and `geotech viz`, while keeping CRS/local-grid assumptions and evidence IDs visible.
- Attach standards-profile assumptions, deterministic validation blockers, safety-factor context, source references, and opt-in non-executing calculation input drafts with source pages, confidence, and review gates to GroundModel readiness so downstream calculations are prepared but still review-gated.
- Keep experimental FEM previews deterministic, validation-gated, and clearly separated from production design calculations while the GroundModel-to-FEM routing contract is developed.
- Keep the tunnel volume-loss settlement preview empirical and review-gated: it can generate a deterministic 3D settlement trough from explicit tunnel geometry, volume loss, and trough-width assumptions, but it is not a tunnel lining, face-stability, or production FEM solver.
- Allow reviewed FEM `analysis_case.json` drafts to be run only through the human-invoked `geotech fem run ... --experimental` path; do not expose solver/WebGL execution as an LLM or swarm tool.
- Keep FEM capability metadata machine-readable: implemented preview routes require a human-reviewed experimental CLI run, planned routes stay contract-only, and every route explicitly reports that agent-run execution is not allowed.
- Surface report/GroundModel-derived FEM draft candidates as routing guidance only; candidate commands must remain `geotech fem draft ...`, never `geotech fem run ...`.
- Keep FEM draft recommendations fail-closed: a draft blocked by validation must not emit `run-reviewed-case` or a `geotech fem run` command.
- Keep FEM workspace and project-agent routing aliases aligned for foundation, excavation, tunnel, shaft, pile-group, slope/embankment, retaining-wall/excavation-support, seepage/groundwater, and staged settlement/consolidation readiness, while only implemented preview routes can produce reviewed `analysis_case.json` drafts.
- Expose FEM to agents as deterministic capability/routing/validation tools so LLMs and swarm roles plan and review FEM work instead of inventing solver math.
- Keep `geotech fem agent` as a scoped FEM planning brain that can list, draft, and validate FEM cases but cannot run solvers or invent result manifests.
- Keep FEM validation fail-closed for agents and swarm reviewers: blocked or review-required validation data must remain unresolved until human review, and reviewer JSON with missing blocks, multiple blocks, contradictory approval fields, malformed JSON, or contaminated output cannot approve a result.
- Block generic agent artifact/result tools from writing FEM result manifests, solver outputs, WebGL artifacts, or invented FEM analysis files; FEM artifacts must come from deterministic `geotech fem run ... --experimental` after explicit human review.
- Allow FEM draft and scoped FEM agent flows to consume GroundModel readiness as evidence prefill while still requiring explicit user geometry, load, staging, and approval.
- Preserve FEM evidence references from GroundModel readiness so future reviewers can trace material, groundwater, and assumption sources before any solver preview.
- Keep GroundModel-to-FEM draft candidates machine-readable about execution boundaries: agent solver runs, WebGL rendering, and result-manifest invention stay disabled, while human run commands appear only after reviewed case data exists.
- Add a single-workflow GroundModel-to-FEM candidate builder so acceptance fixtures can prove the positive reviewed-input path without relying on verifier-generated placeholder drafts.
- Surface FEM execution boundaries in integrated ingest report tables so users see draft-only, human-review, agent-run-disabled, and agent-WebGL-disabled status next to each GroundModel-derived FEM route.
- Thread FEM and calculation tool summaries from simulation agents into reviewer prompts so RiskReviewer can validate deterministic case data even when an LLM handoff summary is terse.
- Keep the experimental FEM artifact screenshot-testable with Playwright; the default smoke must exercise the actual WebGL renderer on desktop and mobile, while `npm run smoke:fem:webgl:fallback` deliberately disables WebGL and verifies the deterministic Canvas fallback. Use `npm run smoke:fem:renderers` when both renderer paths need to be proved together.
- Keep the FEM/WebGL viewport label responsive and contrast-backed so field, stage, renderer, and deformation-scale metadata remains readable on desktop and mobile screenshots.
- Add the first project-aware `geotech agent` harness slice: no-prompt and `--plan-only` discovery scan the workspace, write `.geotech` project state, compute workflow readiness, and ask for the next workflow before any LLM call.
- Route `geotech agent --task <task> --workspace <dir>` through the same provider-neutral workspace manifest and GroundModel/verifier context instead of letting a BYOK/default model guess from raw files.
- Execute explicit `geotech agent --task data-quality|ground-model|calculation-readiness|risk-analysis|anomaly-detection|recommendations|visualization` runs through deterministic provider-neutral project workflows before any optional LLM review.
- Execute recognized prompted workflow sequences such as anomaly detection plus visualization through deterministic child workflow outputs and a combined `workflow_route_report.md`.
- Allow ambiguous prompted project workflows to opt into `--route-with-model`, record the router proposal in `model_calls.jsonl`, validate all proposed tasks against the deterministic allowlist, and fall back safely when proposals are rejected or low confidence.
- Resolve project-agent roots through explicit `--workspace`, existing `.geotech/project.json`, nearest git root, or cwd, and make prompted agent runs project-aware by default unless `--no-workspace` is supplied.
- Write project-agent intent, run manifest, file/evidence indexes, local memory, tool-call trace, and model-call trace artifacts under `.geotech/` so BYOK/default model runs have the same auditable harness context.
- Keep swarm plans honest by suppressing disabled skill tools when `--skills` is off, retaining reviewer tool outputs in session context, and preserving rejected reviews as unresolved instead of approved-with-notes.
- Keep FEM route recommendations current: draft creation uses `geotech fem draft ...`, reviewed analysis cases use `geotech fem run <analysis_case.json> --experimental`, and built-in demo commands remain examples rather than agent-recommended execution paths.
- Keep BYOK OpenAI-compatible environment variables aligned with docs and smoke checks by treating `OPENAI_COMPATIBLE_MODEL` as primary and `OPENAI_COMPATIBLE_MODEL_ID` as a backward-compatible alias.
- Keep the bundled strong-beta skill catalog repairable on first use so direct skill commands and `--skills` agent sessions can see the complete approved catalog after partial installs.
- Route optional swarm runs through a deterministic WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer plan over workspace evidence, standards readiness, calculation drafts, approved executable skills, and blocked review gates.
- Keep provider/BYOK capability routing explicit through provider capability profiles covering text, strict JSON, image, native PDF, layout/OCR, context strategy, free-route risk, preprocessing policy, and review gates.
- Extend geotechnical document benchmark and evidence packets with preprocessing versions, region evidence coverage, page latency, provider profile, fixture metadata, and source-region traceability so confidence changes can be explained by evidence coverage rather than synthesis quality.
- Include FEM draft-route guardrails in geotechnical document benchmark output so evidence-derived readiness can prove draft-only commands, contract-only planned routes, and agent-run-disabled FEM boundaries without relying on HTML inspection.
- Extend FEM benchmark route records with explicit execution boundaries so automated benchmark comparisons can catch agent-run, agent-WebGL, result-manifest, unreviewed case-output, or unreviewed human-run exposure.
- Make geotechnical benchmark comparison fail when FEM execution boundaries regress, including stale run-command recommendations or any route exposing agent solver/WebGL/result-manifest actions.
- Updated the cached real-PDF benchmark fixture to carry FEM draft-readiness execution boundaries, so the stored acceptance artifact itself proves no agent-run, agent-WebGL, result-manifest, unreviewed case-output, or unreviewed human-run route is exposed.
- Threaded the same FEM execution-boundary regression checks into the local `npm run benchmark:geotech-report` comparison, so the developer-facing cached-rerun benchmark now fails on unsafe agent-run, agent-WebGL, result-manifest, unreviewed case-output, unreviewed human-run, or stale FEM run-command exposure.
- Added `npm run smoke:geotech-report-benchmark` as a compare-only guardrail smoke that mutates the cached benchmark fixture into an unsafe FEM state and proves the local benchmark comparator fails without rerunning full PDF ingest.
- Keep swarm reviewer behavior fail-closed: missing review blocks, malformed reviewer JSON, schema-invalid approval, approved output containing blockers, or rejected review cycles must remain unresolved and must not hand final user-facing approval text back to the model.
- Add deterministic `geotech signal analyze` V0 for monitoring/time-series CSV/TSV/XLSX inputs before any agent interpretation layer consumes settlement, piezometer, inclinometer, vibration, or load-test summaries; threshold flags stay opt-in through project-specific thresholds or generic review profiles because units, baselines, and trigger levels vary by project.
- Expose the same deterministic signal analyzer as a sandboxed interpretation/DataEngineer tool so agents and swarm runs can consume validated monitoring summaries without letting LLMs invent signal metrics.
- Route monitoring, piezometer, inclinometer, vibration, load-test, threshold, and time-series project prompts into a deterministic `signal-analysis` project workflow that prepares `geotech signal analyze` command templates and review gates before any LLM reasoning.
- Keep `--threshold-profile auto|<profile>` review-gated for settlement, piezometer, inclinometer, vibration PPV, and load-test files; generic profiles are R&D review triggers until confirmed against project-specific limits.
- Persist signal-analysis project artifacts under `.geotech/runs/<runId>/signals/` so detected monitoring sources produce deterministic JSON summaries during the project-agent workflow while `model_calls.jsonl` remains empty.
- Add a local synthetic signal-analysis smoke/benchmark harness so monitoring artifact persistence, direct threshold/missing-interval metrics, tool-call traceability, and zero-model behavior can be regression-checked without private reports or provider credentials.
- Keep signal benchmark history and trend outputs path-safe so monitoring benchmark comparisons can be reviewed over time without storing raw monitoring files, private paths, API keys, or model-specific assumptions.
- Raise hosted-beta public limits enough for image-heavy PDF development runs, while keeping developer key/IP bypass unlimited.
- Use the server-side `ZHIPU_API_KEY` secret in GitHub and Cloudflare.
- Keep the legacy Modal deploy workflow present but disabled by default.

## Done So Far

### Trust-First R&D Hardening Slice

- Added central provider capability profiles so hosted-beta, direct Z.ai, premium BYOK, OpenAI-compatible, Hugging Face/local-compatible, and free routed models receive explicit capability, preprocessing, context, and review-gate metadata from one resolver.
- Extended geotechnical ingest benchmarks with provider profile metadata, fixture labels, preprocessing coverage, region counts, page latency, job/synthesis latency, and source-category summaries.
- Extended provider-neutral `DocumentEvidencePacket` pages with preprocessing/cache hashes and layout-OCR region metadata, and included region/preprocessing details in compact synthesis evidence under a provider-neutral document evidence contract.
- Threaded image preprocessing metadata through OCR recovery, page evidence cache entries, `DocumentEvidencePacket`, async job cache audits, and benchmark output, including input/output raster dimensions, applied normalization operations, preprocessing pipeline version, and normalized full-page region coverage.
- Added deterministic preprocessing region candidates for normalized raster pages, including content bounding boxes and table/log-panel candidates detected from page line structure, and surfaced preprocessing region-label counts in geotechnical document benchmark output.
- Persisted detected preprocessing crop assets as page-evidence-cache sidecar PNGs, retaining only cache-relative paths, hashes, dimensions, and byte counts in compact cache JSON, `DocumentEvidencePacket` regions, and benchmark asset summaries.
- Wired detected preprocessing crop assets into OCR recovery before generic dense-page chunking, with regression coverage proving table/log-panel crops can recover trusted OCR text without falling through to broad vertical chunks.
- Added PDF/image preprocessing v2 hardening: projection-profile deskew, multiple table/log and borehole/log strip crop candidates, normalized crop PNG assets, page-level quality scoring, region-level quality scoring, quality warning counts, and mode-aware preprocessing cache keys.
- Added explicit `region-v2` preprocessing mode with fine-pass deskew metadata, higher-resolution normalized pages, region-v2 table and borehole/log strip crops, cache normalization, document evidence schema support, and region-first OCR routing before full-page vision OCR.
- Extended `DocumentEvidencePacket`, page evidence cache entries, async job audit normalization, and geotechnical benchmarks with preprocessing policy, deskew metadata, quality scores, normalized crop flags, and preprocessing-mode comparison deltas.
- Added regression coverage for deskewed table/log pages, multiple normalized crop candidates, quality metadata persistence, mode-aware cache invalidation, provider-neutral packet propagation, and preprocessing-mode benchmark deltas.
- Added an internal `benchmark:geotech-corpus` runner and fixture registry with small in-repo benchmark fixtures for borehole logs, CPT tables, lab tables, mixed scanned reports, malformed scanned reports, and the cached full report; it aggregates the existing per-document benchmark contract across provider profiles, preprocessing modes, traceability, cache reuse, GroundModel readiness, and FEM execution-boundary guardrails, with JSON plus HTML/SVG summary outputs.
- Added the committed `region-v2-scanned-borehole-table-v1` image-only borehole/table PDF fixture and generator so rendered PDF crop detection is tested from real fixture bytes instead of synthetic benchmark metadata alone.
- Added mode-specific corpus expectations for `region-v2`, including minimum preprocessing regions, persisted crop assets, average region quality, cached rerun hit rate, hosted-call ceilings, and same-or-better traceability versus `none` and `ocr-optimized`.
- Extended the preprocessing detector with a dense scanned-layout fallback so `region-v2` can still split useful table/log crop candidates when low-column thresholds span most of a rendered page.
- Updated corpus comparison HTML to show region quality deltas next to quality, traceability, deskew, and crop-asset deltas.
- Added a real-fixture mode to the corpus runner so local private fixture paths from env vars can run first-pass plus cached-rerun ingest for each preprocessing mode, write per-fixture first/cached/comparison artifacts, aggregate cached rerun metrics, skip absent fixtures by default, fail missing inputs under `--required`, and redact absolute source paths from generated benchmark JSON.
- Hardened swarm reviewer parsing so missing review blocks, malformed/invalid review payloads, invalid approvals, and rejected review cycles fail closed with deterministic unresolved output instead of model-written approval text.
- Expanded FEM planned route contracts beyond shaft and pile-group to include slope/embankment deformation, retaining-wall/excavation-support, seepage/groundwater coupling, and staged settlement/consolidation readiness. These routes are contract-only, draft-only, agent-run disabled, WebGL disabled, and blocked until deterministic backends, validators, result manifests, renderer smoke, and acceptance fixtures exist.
- Hardened FEM agent/swarm safety so blocked or review-required `validate_fem_analysis_case` output is treated as a blocked tool result in both single-agent and swarm paths, and deterministic FEM review blockers override model-written approval.
- Added generic FEM artifact guards to `write_file`, `project_add_artifact`, and `project_save_result` so agents cannot persist invented FEM result manifests, solver outputs, WebGL claims, or fabricated FEM artifacts through general-purpose storage tools.
- Added deterministic `geotech signal analyze <file>` for CSV/TSV/XLSX monitoring data with trend summaries, opt-in threshold flags, missing interval detection, rate-of-change metrics, Excel serial date handling, invalid timestamp rejection, chart-ready series output, and optional interactive HTML plot export.
- Added opt-in deterministic signal threshold profiles for settlement, piezometer, inclinometer, vibration PPV, and load-test monitoring data, with profile metadata, explicit override tracking, and review gates requiring project trigger levels, units, baselines, and method context before engineering acceptance.
- Exposed deterministic signal analysis to agent and swarm interpretation roles through the sandboxed `analyze_signal_file` tool, while keeping reviewer/simulation roles blocked from using it.
- Added a provider-neutral project-agent `signal-analysis` workflow so `geotech agent --task signal-analysis --workspace ...` and monitoring-related prompts route to deterministic signal command templates, source coverage charts, threshold-assumption warnings, and zero model calls.
- Added signal-analysis project artifact execution so detected monitoring, settlement, piezometer, inclinometer, vibration, and load-test files are analyzed deterministically during the project workflow and persisted under `.geotech/runs/<runId>/signals/`.
- Added `npm run smoke:signal-analysis` and `npm run benchmark:signal-analysis` to generate synthetic settlement, piezometer, inclinometer, vibration, and load-test fixtures, verify persisted signal artifact indexes and analysis JSON, assert direct threshold-profile/rate/missing-interval metrics, assert empty `model_calls.jsonl`, fail on persisted local path leaks, and write comparison JSON plus an SVG summary.
- Added path-safe signal benchmark history and trend artifacts, including `signal-history.json`, `signal-trend.json`, and `signal-trend.html`, with run-to-run deltas and instrument coverage but no raw monitoring rows or private local paths.
- Hardened the FEM/WebGL artifact overlay so result field, stage, renderer, and deformation-scale metadata wraps inside the visualization viewport with a readable backing; the Playwright smoke now asserts the label stays inside desktop/mobile bounds.
- Hardened the FEM/WebGL smoke to stop silently accepting Canvas fallback as WebGL coverage: Playwright now launches Chromium through ANGLE SwiftShader, generated artifacts preserve the WebGL drawing buffer for pixel checks/screenshots, the default smoke asserts `webgl` rendering for raft, excavation, and tunnel desktop/mobile views, `npm run smoke:fem:webgl:fallback` force-disables WebGL to prove the Canvas fallback path remains nonblank and bounded, the smoke checks the visible renderer label and fallback banner state, and `npm run smoke:fem:renderers` runs both renderer gates together.
- Extended FEM/WebGL smoke to prove interactive controls change rendered pixels in both WebGL and Canvas fallback paths, including scale controls, staged excavation field/stage changes, mesh/outline toggles, result-field option metadata, stage-slider bounds, and invalid `NaN`/`Infinity`/`undefined` UI text checks.
- Hardened FEM case/result validation before preview execution: every material, load, and boundary condition is validated instead of only the first entry; tunnel volume-loss previews reject unrelated pressure loads; groundwater depth semantics must match `specified`, `below_domain`, or `not_modelled`; excavation stages require stable IDs/labels; and result metadata now blocks duplicate step indexes plus visualization/envelope dataset mismatches.
- Hardened FEM result-manifest trust checks so stale or edited artifacts cannot pass validation with mismatched case IDs, invalid generated timestamps, unsupported/non-deterministic backend metadata, mesh node/element/division mismatches, visualization count mismatches, or malformed frame field/stage labels.
- Hardened the FEM WebGL renderer entry point itself so direct calls to `renderFemWebglHtml` fail closed on blocked result manifests instead of relying only on the CLI wrapper to prevent misleading preview artifacts.
- Hardened embedded FEM validation summaries so a hand-edited result manifest cannot replace review-gated analysis-case findings with a stale `ready` status and still pass result validation or WebGL rendering.
- Hardened FEM provenance validation so analysis cases and result manifests must carry valid case identity, creator/timestamp metadata, assumption records, evidence references, groundwater notes, and limitation text before any preview backend or WebGL artifact is accepted.
- Hardened FEM result-envelope semantics so foundation load/reaction, excavation stage/weight/reaction components, and tunnel volume-loss/trough/settlement-volume metrics must match the embedded analysis case before any WebGL artifact renders.
- Hardened FEM result dataset semantics so metadata datasets must match the rendered displacement arrays, referenced staged frames, and mapped envelope values instead of merely being finite arrays with plausible labels.
- Hardened FEM result-field semantics so node fields, envelope fields, quantities, components, units, sign conventions, and scalar envelope mappings must agree before metadata can drive WebGL controls or audit outputs.
- Hardened FEM dataset source semantics so rendered displacement datasets cannot masquerade as envelope fields and envelope datasets cannot back node-based visual fields.
- Hardened FEM result-step semantics so staged excavation steps must match embedded stage IDs, labels, depths, and ordering, while non-staged routes cannot carry staged excavation metadata.
- Hardened FEM staged frame semantics so visualization frames must reference known result steps and keep field/stage labels synchronized with result-field and result-step metadata before WebGL artifacts are accepted.
- Hardened FEM result metadata coverage so every declared result field and result step must have at least one backing dataset before WebGL controls, audit metadata, or validation panels can trust it.
- Hardened the FEM WebGL validation panel so it reports the final render-time validation status/counts and result-level review findings instead of stale embedded case-validation counters.
- Embedded the final FEM render-time validation summary into self-contained WebGL artifacts and smoke assertions so browser QA can prove the visible validation status matches the machine-readable artifact contract.
- Hardened FEM capability metadata and tests so all routes expose `executionMode` plus `agentRunAllowed: false`; planned shaft and pile-group routes remain contract-only, cannot write `analysis_case.json`, and never carry run commands.
- Added machine-readable contract-readiness metadata for planned shaft and pile-group FEM routes, including non-runnable reasons, required evidence, required user inputs, blocked-until acceptance checks, allowed planning actions, and disallowed solver/WebGL/result-invention actions.
- Hardened FEM validation before experimental preview execution by blocking non-finite geometry/material/groundwater values, invalid groundwater state, non-integer or oversized preview meshes, missing specified groundwater depth, and WebGL unsigned-short index overflow in result manifests.
- Hardened FEM draft routing so validation-blocked drafts remain `collect-inputs`, keep `canAutoProceed: false`, and recommend only `geotech fem draft ...` instead of a reviewed-run command.
- Hardened FEM result traceability metadata so new manifests must provide `resultFields`, `steps`, and `datasets` together, while all-three-absent legacy manifests remain accepted.
- Hardened FEM planning inputs so malformed excavation stage/support arrays produce structured missing-input draft responses instead of tool exceptions, and the agent tool schema now exposes typed nested geometry, load, excavation, material, and groundwater fields.
- Allowed contract-only shaft and pile-group FEM draft commands to consume GroundModel readiness evidence as material, groundwater, and traceability prefill while still refusing case-output artifacts, run commands, solver execution, and WebGL results.
- Tightened swarm and agent wording so deterministic calculation tools can run where implemented, but FEM/WebGL preview execution remains explicitly human-invoked and outside agent tool access.
- Hardened swarm review approval so deterministic FEM blockers override model-written reviewer approval: contract-only drafts, missing FEM analysis cases, missing draft inputs, and blocked FEM validation keep the swarm result unresolved.
- Aligned tunnel FEM workspace prefill and project-agent aliases so `geotech fem draft tunnel-volume-loss-settlement --workspace ...` can consume GroundModel material/groundwater/evidence prefill before explicit user tunnel geometry, while FEM tunnel/shaft/pile aliases route to calculation readiness.
- Added FEM draft readiness to geotechnical document benchmark output, including implemented-preview routes, contract-only routes, draft-command route checks, run-template visibility, agent-run-disabled routes, stale run-command detection, GroundModel readiness gates, and contract-only evidence/input/non-runnable metadata.
- Extended GroundModel calculation readiness and FEM draft candidates beyond foundation/excavation to include tunnel volume-loss settlement, planned shaft deformation, and planned pile-group elastic interaction routes. Tunnel remains an explicit-input experimental preview route, while shaft and pile-group are contract-only readiness records with no runnable analysis case or WebGL result.
- Tightened benchmark traceability so GroundModel readiness gates use direct parameter source-page attribution; audit-backed page counts remain visible but no longer inflate the main traceability rate.
- Persisted provider capability metadata on ingest review records so saved review benchmark output can retain provider profile, capability, preprocessing, and review-gate metadata without storing credentials.
- Verified this slice with focused provider/evidence/benchmark/swarm/signal tests, full core Vitest suite using the Windows-safe threads pool, CLI Vitest suite, monorepo build, and release consistency check.

### Integrated Ingest Borehole And Map Retention

- Fixed the integrated review model so GroundModel-derived boreholes are merged with missing report-profile boreholes instead of replacing the whole recovered profile when only part of the report binds to structured evidence.
- Kept the existing HTML visual design but added a borehole selector that switches source evidence, validated strip-log, field cards, and CRS guardrail panels across every recovered borehole.
- Updated map rendering to plot projected easting/northing or WGS84 latitude/longitude source coordinates, and to fall back to a clearly labeled schematic borehole alignment when source coordinates are not available.
- Added report-side coordinate promotion for OCR/native text such as `BORE HOLE NO 1 Latitude (N) - ... Longitude(E) - ...`, including compact multi-borehole OCR lines and hemisphere labels.
- Added regression coverage for multi-borehole geotech-document reports without plottable coordinates, WGS84-only borehole-log locations, compact report latitude/longitude rows, partial-coordinate fallback, and site-coordinate text that must not create fake borehole map points.

### Calculation Readiness Workflow Exposure

- Added `calculation-readiness` as a first-class project-aware deterministic workflow task for `geotech agent --task calculation-readiness`.
- Routed calculation-readiness prompts and validated model-selected bearing/settlement/pile/liquefaction/slope/FEM readiness route names, including exact foundation-settlement and excavation-deformation FEM aliases, into the existing GroundModel verifier readiness contract instead of creating model-owned calculation logic.
- Included validated command templates in project workflow action reports and workspace-backed agent context so BYOK/default models see deterministic routes, missing inputs, and review gates before any optional LLM reasoning.
- Added regression coverage proving the new task stays provider-neutral, records no model calls, and produces readiness actions from the existing GroundModel verifier evidence.

### Optional LLM Workflow Route Proposals

- Added `geotech agent --route-with-model` for ambiguous project prompts that need a hosted/BYOK model to propose a strict JSON workflow route, while clear prompts still use the zero-model deterministic router.
- Added route provenance fields including `selectionSource`, validated/rejected model task lists, model-call audit rows, and confidence-gate status in `workflow_route.json` and `model_calls.jsonl`.
- Kept model proposals planner-only: unknown tasks are rejected, no-evidence model suggestions are capped below deterministic execution, and rejected or failed proposals fall back to the workspace-backed LLM agent path.
- Added regression coverage proving opt-in model route proposals execute only validated workflows, rejected model proposals preserve fallback behavior, and failed router calls persist a failed model-call row before handing off to the workspace-backed agent path.

### LLM-Agnostic Project Workflow Router

- Added a provider-neutral project workflow router contract that accepts explicit tasks, optional validated model selections, or deterministic keyword routing, rejects unknown task names, and returns a planner/reviewer-only route with `modelCalls: []`.
- Added provider operating-contract support for the `project-workflow-router` task so hosted GLM, direct Z.ai, OpenAI-compatible BYOK, free OpenRouter-style routes, and local-compatible models receive the same "select workflows only" boundary when router prompts are used.
- Made prompted project requests such as `geotech agent "find anomalies and create visualizations"` route through confidence-gated deterministic child workflow outputs before falling back to the workspace-backed LLM agent for custom questions or low-confidence routes.
- Added `workflow_route.json` and `workflow_route_report.md` artifacts, combined route reporting, and CLI regression coverage proving routed workflows call `runProjectWorkflow`, avoid `runAgent`/`runSwarm`, and keep `model_calls.jsonl` empty.
- Added router tests covering provider profiles, free-route review gates, invalid/fenced JSON parsing, rejected tasks, keyword fallback, and custom-question review mode.

### Project-Aware Deterministic Workflow Executor

- Added a core provider-neutral `runProjectWorkflow` executor for explicit project-agent tasks: data quality, ground model, risk analysis, anomaly detection, recommendations, and visualization.
- Added deterministic project workflow reports through `buildProjectWorkflowReport`, plus the `@geotechcli/core/project-workflow` export surface for downstream integration.
- Made `geotech agent --task ... --workspace <dir>` short-circuit before quota checks, provider config, `runAgent`, or `runSwarm`, then write `workflow_result.json`, `workflow_report.md`, `workflow_trace.json`, append deterministic tool-call records, and keep `model_calls.jsonl` empty.
- Kept custom natural-language project questions on the existing agent path so BYOK/default models can still reason over the compact workspace evidence packet when the request does not map to deterministic workflow routing.
- Added regression coverage for all six deterministic project tasks, visualization chart specs, report rendering, blocked GroundModel states, and CLI no-model-call behavior.

### Project-Aware Agent Root, Intent, And Swarm Trace Slice

- Added core workspace root detection for `geotech agent` with the order: explicit `--workspace`, parent `.geotech/project.json`, nearest git root, then cwd.
- Made prompted `geotech agent "..."` project-aware by default and kept `--no-workspace` as the opt-out for generic one-off AI prompts.
- Added `geotech agent .`, `--max-files`, `--max-depth`, and `--trace` support for bounded, auditable project-aware runs.
- Added `.geotech/evidence/file_index.jsonl`, `.geotech/evidence/evidence_index.jsonl`, `.geotech/context/memory.json`, `.geotech/runs/<runId>/run_manifest.json`, `intent.json`, `tool_calls.jsonl`, and `model_calls.jsonl`.
- Hardened swarm planning so disabled skill tools and unavailable orchestrator deliverable tools are not advertised, reviewer tool context is preserved, and rejected review cycles remain `UNRESOLVED - REVIEW REJECTED`.

### Project-Aware Agent Harness Slice

- Made `geotech agent --plan-only` and no-prompt `geotech agent` run deterministic workspace discovery first, write `.geotech/project.json`, `.geotech/manifest.json`, `.geotech/context/readiness.json`, `.geotech/context/project_summary.md`, and per-run plan/trace files, then present ready/blocked project workflows without calling an LLM.
- Added `geotech agent --task data-quality|ground-model|risk-analysis|anomaly-detection|recommendations|visualization --workspace <dir>` so selected project workflows route through the existing provider-neutral manifest/GroundModel/verifier context before the LLM reasons.
- Kept `--no-workspace` as the generic-prompt opt-out while project-aware discovery becomes the default agent entry point.
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

- Expand PDF/image preprocessing validation beyond the current projection-profile deskew, smarter log/table crop candidates, normalized crop assets, and quality scoring with broader page-region comparison fixtures on borehole, CPT, lab, mixed scanned/digital, and malformed reports.
- Expand the internal corpus benchmark from the current cached/real-fixture wrapper and local trend output into broader real-private fixture latency profiles, deeper region-level preprocessing comparisons, and richer dashboards.
- Add live provider/BYOK benchmark profiles so OpenAI-compatible, hosted-beta, and future user-selected LLMs are evaluated with the same PDF/image evidence contract instead of model-specific assumptions.
- Add deeper GroundModel-to-FEM acceptance fixtures for shaft, pile-group, slope/embankment, retaining support, seepage/groundwater, and staged settlement/consolidation before adding any production solver workflow; keep the current strict validation, benchmark guardrails, and WebGL index limits in front of all preview backends.
- Expand `geotech signal analyze` from deterministic V0 into richer threshold profiles, broader monitoring/sensor benchmark fixtures, and historical trend output.
- Expand benchmark evaluation fixtures from the initial small cached corpus registry into real private/local full-PDF borehole, CPT, lab, reports, monitoring, sensor, pile load, and signal datasets.

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

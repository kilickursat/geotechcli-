import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { GEOTECHCLI_VERSION } from '@geotechcli/core/meta';

const releases = [
  {
    version: GEOTECHCLI_VERSION,
    date: '2026-05-06',
    tag: `${GEOTECHCLI_VERSION} Release`,
    changes: [
      { type: 'feat', text: 'Added standards-profile assumptions for Eurocode 7, AASHTO, IS, BS, and ASTM workspace analysis so GroundModel readiness carries an explicit design-profile basis' },
      { type: 'feat', text: 'Added opt-in, non-executing calculation input drafts for bearing, settlement, pile, liquefaction, and slope workflows through geotech analyze --draft-inputs' },
      { type: 'fix', text: 'Repaired bundled skill bootstrap so partial installs no longer stop after the first few skill manifests and first use repairs the complete approved catalog' },
      { type: 'fix', text: 'Removed the stale public docs example that referenced an internal bundled ZIP filename' },
      { type: 'fix', text: 'Added regression coverage for standards profile exports, calculation input drafts, workspace propagation, HTML readiness rendering, and partial skill-catalog repair' },
    ],
  },
  {
    version: '0.4.46',
    date: '2026-05-05',
    tag: '0.4.46 Release',
    changes: [
      { type: 'feat', text: 'Added a provider-neutral DocumentEvidencePacket synthesis prompt compiler so report synthesis reads the same page, observation, source-page, review-gate, and traceability contract used by agents and benchmarks' },
      { type: 'fix', text: 'Routed geotechnical document synthesis through the evidence-packet compiler instead of raw extraction arrays, preserving whole-report outline order, borehole continuity, missing-data gates, and source-page citation rules across hosted GLM and future BYOK providers' },
      { type: 'feat', text: 'Advanced the document evidence packet schema to v2 with extracted risk and recommendation signals so synthesis can stay packet-first without losing engineering interpretation context' },
      { type: 'feat', text: 'Added a provider-agnostic agent operating contract for single-agent, swarm, and legacy specialist prompts so BYOK models receive the same GeotechCLI evidence, tool, capability, confidence, and review-gate instructions as hosted GLM' },
      { type: 'fix', text: 'Added free/open-route model adaptation rules for compact evidence, smaller steps, provider capability failures, and native-PDF/image fallbacks so free OpenRouter-style models fail clearly instead of drifting silently' },
      { type: 'fix', text: 'Tightened OpenAI-compatible capability profiling so known text-only free routes are review-gated for image understanding while multimodal omni/VL/vision routes remain image-capable' },
      { type: 'feat', text: 'Added npm run smoke:byok for local provider-key smoke tests across Z.ai, OpenAI, Anthropic, Hugging Face, and OpenAI-compatible endpoints when matching environment keys are present' },
      { type: 'fix', text: 'Documented BYOK smoke environment variables and added regression coverage for packet-first synthesis prompt compilation and provider-agnostic agent prompt injection' },
    ],
  },
  {
    version: '0.4.45',
    date: '2026-05-05',
    tag: '0.4.45 Release',
    changes: [
      { type: 'feat', text: 'Added a schema-validated DocumentEvidencePacket for geotechnical document ingest results, normalizing page methods, source pages, observations, content chunks, synthesis, review gates, and traceability into a provider-neutral contract' },
      { type: 'fix', text: 'Attached evidence packets to geotechnical document ingest and async job-adjusted results so reports, benchmarks, and agents share the same evidence shape' },
      { type: 'feat', text: 'Added compact agent evidence summaries for geotechnical ingest, job-result, and persisted-review tools so source pages, methods, missing values, review gates, borehole IDs, and max depth survive prompt truncation' },
      { type: 'fix', text: 'Updated single-agent and swarm tool-result serialization to prefer compact evidence summaries before raw JSON' },
      { type: 'fix', text: 'Added regression coverage for packet schema validation, benchmark evidence-contract metrics, agent ingest summaries, and prompt serialization' },
    ],
  },
  {
    version: '0.4.44',
    date: '2026-05-05',
    tag: '0.4.44 Release',
    changes: [
      { type: 'fix', text: 'Made geotechnical document synthesis read an ordered whole-report outline before high-signal extraction rows so takeaways, risks, recommendations, and borehole evidence stay report-level first' },
      { type: 'fix', text: 'Prevented figure, table, and borehole-log titles from replacing the report title in generated Geotechnical Intelligence Reports, including cached result rendering' },
      { type: 'feat', text: 'Rebuilt borehole and ground-model report visuals with compact lithology-colored profiles, source-page legend rows, inferred-contact styling, and overflow-safe SVG layout' },
      { type: 'fix', text: 'Curated noisy OCR material fragments out of the main material table while keeping page-level traceability in source evidence and Processing Audit' },
      { type: 'fix', text: 'Verified the cached GeotechnicalInvestigationReport PDF output with Playwright screenshot and layout assertions for horizontal overflow and SVG text overflow' },
    ],
  },
  {
    version: '0.4.43',
    date: '2026-05-04',
    tag: '0.4.43 Release',
    changes: [
      { type: 'fix', text: 'Increased the slow raster-page ingest recovery regression timeout so GitHub Actions can finish the same PDF/OCR-style path that passes locally on Windows' },
      { type: 'fix', text: 'Kept the benchmark, GroundModel readiness, provider-neutral evidence, and report filename behavior from 0.4.42 unchanged' },
    ],
  },
  {
    version: '0.4.42',
    date: '2026-05-04',
    tag: '0.4.42 Release',
    changes: [
      { type: 'feat', text: 'Added geotechnical report benchmark output for page cache reuse, estimated hosted calls, source-page traceability, retained signal counts, and GroundModel readiness gates' },
      { type: 'feat', text: 'Added npm run benchmark:geotech-report as a local two-pass benchmark harness for the canonical GeotechnicalInvestigationReport PDF' },
      { type: 'fix', text: 'Stamped retained geotechnical materials, classifications, and parameters with provider-neutral source pages for hosted GLM and future BYOK providers' },
      { type: 'feat', text: 'Added GroundModel calculation-readiness routing for bearing capacity, settlement, pile capacity, liquefaction, and slope stability' },
      { type: 'fix', text: 'Updated geotech analyze terminal and HTML report output to show deterministic workflow readiness before agents or users route evidence into calculations' },
      { type: 'fix', text: 'Renamed default generated ingest and workspace HTML filenames from legacy review wording to report wording while preserving internal compatibility APIs' },
    ],
  },
  {
    version: '0.4.41',
    date: '2026-05-04',
    tag: '0.4.41 Release',
    changes: [
      { type: 'fix', text: 'Renamed the generated HTML ingest output to a Geotechnical Intelligence Report presentation, including CLI summary labels and browser report prompts' },
      { type: 'feat', text: 'Reworked the report shell into a compact dark engineering dashboard with top navigation, cleaner hero hierarchy, dark evidence cards, and contained table/profile sections' },
      { type: 'fix', text: 'Tightened desktop and mobile layout constraints so status badges, source metadata, ground-model SVGs, borehole profiles, and engineering tables avoid overlap and horizontal clipping' },
      { type: 'fix', text: 'Kept Processing Audit and model-stage details below the engineering review surface while keeping the main report focused on decisions, evidence, confidence, and human verification' },
      { type: 'fix', text: 'Verified the GeotechnicalInvestigationReport PDF report regenerated with all 34 pages processed and clean desktop/mobile screenshots' },
    ],
  },
  {
    version: '0.4.40',
    date: '2026-05-03',
    tag: '0.4.40 Release',
    changes: [
      { type: 'fix', text: 'Stabilized PDF page evidence cache keys for generated per-page PDF payloads so repeated full-report ingest reuses native PDF page evidence instead of re-extracting regenerated pages' },
      { type: 'fix', text: 'Added regression coverage for synchronous and persisted async PDF page cache reuse when page payload bytes change between jobs' },
      { type: 'feat', text: 'Upgraded HTML ingest reports with status badges, searchable review filters, a schematic ground-model cross-section, source evidence actions, and a scroll-aware human review workflow bar' },
      { type: 'fix', text: 'Verified the GeotechnicalInvestigationReport PDF rerun completed with all 34 pages as cache hits and no new cache stores while keeping the review-focused report presentation intact' },
    ],
  },
  {
    version: '0.4.39',
    date: '2026-05-03',
    tag: '0.4.39 Release',
    changes: [
      { type: 'fix', text: 'Disabled automatic page evidence cache reuse under Vitest unless a test opts in explicitly, preventing synthetic page fixtures from reusing stale cached extraction output across tests' },
      { type: 'fix', text: 'Kept production and local CLI cache defaults unchanged, so repeated real PDF ingest still reuses unchanged page evidence' },
      { type: 'fix', text: 'Verified the full core test workspace after the cache-isolation fix' },
    ],
  },
  {
    version: '0.4.38',
    date: '2026-05-03',
    tag: '0.4.38 Release',
    changes: [
      { type: 'feat', text: 'Added a durable page evidence cache keyed by source file hash, page hash, page number, model version, preprocessing version, and schema version' },
      { type: 'fix', text: 'Reused cached geotechnical page evidence on reruns so repeated PDF ingest can skip duplicate OCR, GLM-OCR, GLM-5V, and page extraction work when inputs are unchanged' },
      { type: 'fix', text: 'Persisted cache audit metadata through async ingest checkpoints, segmented child-job merges, final page audits, CLI summaries, and HTML report processing audit views' },
      { type: 'fix', text: 'Kept cache I/O best-effort so inaccessible local cache storage never turns a valid page extraction into a failed page' },
      { type: 'fix', text: 'Added regression coverage for cache key stability, corrupt cache misses, invalidation, sync ingest reuse, async job reuse, and report cache presentation' },
    ],
  },
  {
    version: '0.4.37',
    date: '2026-05-03',
    tag: '0.4.37 Release',
    changes: [
      { type: 'fix', text: 'Raised installed-CLI hosted beta defaults to 2,000 text, 600 vision, 600 layout, and 200 agent requests per day for image-heavy PDF development runs' },
      { type: 'fix', text: 'Raised anonymous hosted beta defaults moderately while keeping stricter abuse protection than installed CLI traffic' },
      { type: 'fix', text: 'Hardened Geotechnical Intelligence Report borehole-profile inference to use retained inspection text and content chunks when structured parameter rows omit depth data' },
      { type: 'fix', text: 'Added regression coverage for profile generation from real report-style borehole schedule and conclusion text' },
    ],
  },
  {
    version: '0.4.36',
    date: '2026-05-03',
    tag: '0.4.36 Release',
    changes: [
      { type: 'feat', text: 'Redesigned HTML ingest reports as a premium Geotechnical Intelligence Report with a sticky sidebar, executive facts, review actions, engineering insight cards, and source-evidence navigation' },
      { type: 'feat', text: 'Added an evidence-first trust table for extracted and missing engineering parameters with source page, confidence, review posture, and evidence snippets' },
      { type: 'feat', text: 'Added a lightweight borehole stratigraphy SVG view for retained borehole and layer evidence, with dashed boundaries for uncertain or missing intervals' },
      { type: 'fix', text: 'Moved model-stage and raw page audit details into a collapsed Processing Audit section so the main report stays engineering-decision-first' },
      { type: 'fix', text: 'Added regression coverage for the premium report layout, trust layer, source evidence, processing audit, and borehole visualization' },
    ],
  },
  {
    version: '0.4.35',
    date: '2026-05-03',
    tag: '0.4.35 Release',
    changes: [
      { type: 'fix', text: 'Kept GLM thinking enabled for final report synthesis as the first attempt, then retried once without thinking when Z.ai returns an empty/no-content assistant response' },
      { type: 'fix', text: 'Prevented successful visual ingest runs from showing a GLM-5.1 synthesis failed warning when the fallback synthesis response is valid' },
      { type: 'fix', text: 'Added regression coverage for the hosted-beta synthesis fallback path so the report brief remains populated after an empty thinking-mode completion' },
    ],
  },
  {
    version: '0.4.34',
    date: '2026-05-03',
    tag: '0.4.34 Release',
    changes: [
      { type: 'feat', text: 'Added hosted GLM-OCR layout parsing with a separate layout quota bucket, configurable public limits, and developer key/IP bypass support' },
      { type: 'feat', text: 'Wired geotechnical document ingest to prefer GLM-OCR layout text before GLM-5V visual extraction, then run GLM-5.1 synthesis for report takeaways, ground model, key parameters, interpretation, and limitations' },
      { type: 'fix', text: 'Raised public hosted-beta CLI defaults to 300 text, 120 vision, 80 layout, and 40 agent requests per day while preserving tighter anonymous caps' },
      { type: 'fix', text: 'Routed hosted-beta image-only, graphics-only, and text-unreadable report pages directly into structured GLM visual extraction when no accepted text exists, avoiding duplicate OCR-only vision calls before interpretation' },
      { type: 'fix', text: 'Marked direct visual page extraction as vision-visual in page audits and forced manual review before approval so high-confidence image-only results do not silently auto-proceed' },
      { type: 'feat', text: 'Improved the HTML ingest report with report takeaways, grouped parameter tables, stage badges, an extraction overview strip, confidence meters, cleaner engineering brief text, and shortened table/page-card fragments for human review' },
      { type: 'feat', text: 'Applied a shadcn-style static report presentation pass so key engineering tables come before operational audit details, with raw page audit tables collapsed by default' },
      { type: 'fix', text: 'Preserved engineering units such as kN/m3, t/m2, kg/cm2, and m/s in report presentation while still cleaning OCR-like spacing' },
      { type: 'fix', text: 'Added regression coverage for synchronous ingest, persisted async jobs, direct visual extraction, and report HTML rendering' },
    ],
  },
  {
    version: '0.4.33',
    date: '2026-05-01',
    tag: '0.4.33 Release',
    changes: [
      { type: 'fix', text: 'Forced hosted-beta PDF page inputs through provider-safe raster images so geotech vision log no longer sends native PDF parts to the GLM vision model' },
      { type: 'fix', text: 'Applied the same hosted-beta PDF raster path to CLI ingest and agent ingest tools while preserving native PDF pages for providers that can support them' },
      { type: 'fix', text: 'Raised the public CLI hosted-beta vision burst window to four requests per minute so one-page image-only PDF workflows can complete OCR and structured extraction without self-rate-limiting' },
      { type: 'fix', text: 'Added regression coverage for forced raster PDF page inputs on digital-text PDFs' },
    ],
  },
  {
    version: '0.4.32',
    date: '2026-05-01',
    tag: '0.4.32 Release',
    changes: [
      { type: 'fix', text: 'Disabled GLM thinking mode for the hosted glm-5v-turbo vision path so borehole-log ingest and vision commands return final assistant content instead of empty completions' },
      { type: 'fix', text: 'Fixed the CLI vision retry backoff so recoverable hosted vision failures no longer let Node exit with an unsettled top-level await warning before the fallback attempt runs' },
      { type: 'fix', text: 'Added regression coverage for forwarding disabled thinking mode on GLM vision proxy requests' },
    ],
  },
  {
    version: '0.4.31',
    date: '2026-05-01',
    tag: '0.4.31 Release',
    changes: [
      { type: 'fix', text: 'Disabled GLM thinking mode by default in the hosted-beta proxy so low-latency text calls return final assistant content instead of spending tiny smoke-test budgets on reasoning tokens' },
      { type: 'fix', text: 'Added GEOTECHCLI_HOSTED_BETA_THINKING_MODE=disabled to the environment contract, with an opt-in path for future deeper reasoning tests' },
      { type: 'fix', text: 'Kept the Z.ai GLM model defaults and live release smoke checks aligned with the hosted-beta no-user-key contract' },
    ],
  },
  {
    version: '0.4.30',
    date: '2026-05-01',
    tag: '0.4.30 Release',
    changes: [
      { type: 'feat', text: 'Swapped the strong-beta hosted AI defaults to Z.ai GLM, using glm-5.1 for text and agent reasoning and glm-5v-turbo for vision' },
      { type: 'fix', text: 'Kept the public CLI contract on hosted-beta so end users still get default AI access without bringing their own provider key' },
      { type: 'fix', text: 'Retargeted the beta proxy, environment docs, release guardrails, and website copy around the server-side ZHIPU_API_KEY secret' },
      { type: 'fix', text: 'Disabled the legacy Modal deploy workflow by default while preserving it as a manual historical fallback' },
      { type: 'fix', text: 'Added guardrails for GLM proxy model defaults and provider-neutral timeout and fallback wording' },
    ],
  },
  {
    version: '0.4.29',
    date: '2026-04-24',
    tag: '0.4.29 Release',
    changes: [
      { type: 'feat', text: 'Added the canonical GroundModel v1 contract for workspace analysis, binding boreholes, SPT tests, groundwater, lab parameters, monitoring series, and rejected observations into one engineering model' },
      { type: 'feat', text: 'Added evidence-bound extraction for sampled CSV/XLSX data so analyze JSON and reports show source file, sheet, row, column, confidence, raw value, and normalized value' },
      { type: 'feat', text: 'Added a deterministic GroundModel verifier for rejected SPT values, missing groundwater, missing coordinates, undeclared local CRS, unknown standard profiles, and duplicate SPT depths' },
      { type: 'feat', text: 'Upgraded geotech analyze --format html with GroundModel, verifier findings, and evidence table sections while keeping terminal output compact' },
      { type: 'fix', text: 'Upgraded geotech agent --workspace so hosted-beta tasks receive a GroundModel/verifier summary without adding any Modal GPU calls to local analysis' },
    ],
  },
  {
    version: '0.4.28',
    date: '2026-04-24',
    tag: '0.4.28 Release',
    changes: [
      { type: 'feat', text: 'Added geotech analyze [workspace] for deterministic local project manifests with compact terminal output, JSON, and self-contained HTML reports' },
      { type: 'feat', text: 'Added core workspace intelligence for file discovery, geotechnical classification, branch detection, recommendations, and ProjectManifest generation without hosted-beta GPU spend' },
      { type: 'feat', text: 'Added lightweight CSV/XLSX schema inference for depth, coordinates, borehole/sample IDs, SPT/CPT, lab, monitoring, and signal-style columns' },
      { type: 'feat', text: 'Added geotech agent ... --workspace <dir> so agent tasks can receive a compact local manifest summary instead of guessing directly from raw files' },
      { type: 'docs', text: 'Documented geotech analyze ., --branch, --standard, --json, and --format html while clearly marking deeper planner/calculation behavior as future roadmap layers' },
    ],
  },
  {
    version: '0.4.27',
    date: '2026-04-24',
    tag: '0.4.27 Release',
    changes: [
      { type: 'fix', text: 'Reduced hosted Qwen Modal L4 admission pressure by defaulting concurrent inputs to 2, adding an explicit max-num-seqs guard, and keeping max containers at 1 for credit-safe operation' },
      { type: 'fix', text: 'Lowered hosted-beta proxy retry pressure with single-attempt vision and agent calls, fewer text retries, and separate per-minute limits for heavier vision and agent requests' },
      { type: 'fix', text: 'Serialized more long mixed PDF ingest jobs on hosted beta so image-only report appendix and tail pages do not flood one GPU queue' },
      { type: 'fix', text: 'Added cheaper PDF retry behavior with deterministic partial extraction for text timeouts, skipped duplicate vision OCR on retry, and manual-review downgrades for repeated slow visual tail pages' },
      { type: 'feat', text: 'Printed the exact browser-report command after plain persisted ingest results so users can immediately open the HTML review without rerunning the PDF' },
    ],
  },
  {
    version: '0.4.26',
    date: '2026-04-24',
    tag: '0.4.26 Release',
    changes: [
      { type: 'fix', text: 'Fixed bundled strong-beta skills in global npm installs by trusting only first-party bundled-skill archives while keeping arbitrary outside ZIP imports blocked' },
      { type: 'feat', text: 'Changed long PDF ingest to live-wait by default with visible page progress, elapsed time, heartbeat/status, and failure counts, plus --background for detached jobs' },
      { type: 'feat', text: 'Made ingest HTML format save and open a browser report by default for run, wait, and result flows while --no-open keeps save-only automation clean' },
      { type: 'fix', text: 'Hardened PDF ingest with page-count fallbacks, zero-page job rejection, retryable 524/upstream-timeout checkpoints, image-heavy concurrency control, and completed-partial resume retry behavior' },
      { type: 'fix', text: 'Improved report extraction by preserving user-declared report intent, limiting borehole appendix dominance, and rejecting impossible SPT values from standards references while retaining warnings as evidence' },
      { type: 'fix', text: 'Cleaned strong-beta drift across agent docs, handoff notes, changelog encoding, swarm final synthesis fallback, and effective config display for provider defaults' },
    ],
  },
  {
    version: '0.4.25',
    date: '2026-04-23',
    tag: '0.4.25 Release',
    changes: [
      { type: 'feat', text: 'Added hosted-beta long-PDF segmentation for geotechnical report ingest, using a 60 effective-page best-result window with linked sequential packets and one merged final result' },
      { type: 'feat', text: 'Added --page-range <start:end> to geotech ingest so targeted report subsets can be reviewed, rerun, and exported without processing the whole PDF' },
      { type: 'feat', text: 'Extended the HTML ingest report to show segment execution, selected page-range context, and merged packet outcomes inside one premium review surface' },
      { type: 'fix', text: 'Kept the shipped hosted-beta path on the non-quantized default Qwen model while forcing segmented long-report execution onto extraction concurrency 1 for better queue stability on L4' },
      { type: 'fix', text: 'Hardened parent and child persisted ingest jobs so segmented report packets checkpoint independently and merge back into the parent result with original page numbering preserved' },
    ],
  },
  {
    version: '0.4.24',
    date: '2026-04-23',
    tag: '0.4.24 Release',
    changes: [
      { type: 'fix', text: 'Fixed the Modal deploy workflow so blank repository variables now fall back to the intended defaults instead of crashing the hosted-beta launcher during GitHub Actions deploys' },
      { type: 'fix', text: 'Reduced hosted-beta L4 startup memory pressure by defaulting the vLLM compilation profile to cudagraph_mode NONE, enabling PyTorch expandable segments, and stripping stale num-gpu-blocks override startup args that can force KV-cache OOM' },
      { type: 'fix', text: 'Wired the new Modal compilation override through the deploy workflow and runtime notes so the hosted Qwen path can be tuned safely without turning on a baseline warm-container cost increase' },
      { type: 'fix', text: 'Updated the strong-beta release surfaces for 0.4.24 so package metadata, lockfile pins, changelog notes, and the website release contract stay aligned with the shipped hosted-beta hotfixes' },
    ],
  },
  {
    version: '0.4.22',
    date: '2026-04-21',
    tag: '0.4.22 Release',
    changes: [
      { type: 'fix', text: 'Unified the live single-agent and swarm tool bootstrap so both runtimes register the same filesystem, shell, data, deliverable, and skill tools instead of drifting when a tool depends on side-effect imports' },
      { type: 'fix', text: 'Aligned swarm with the same deterministic intake screen and first-turn hosted-beta fallback used by the main agent, so under-specified requests and provider warmup/outage cases now resolve more consistently across both execution paths' },
      { type: 'fix', text: 'Updated the strong-beta release surfaces together for this versioned reliability pass, including package metadata, README, website docs, website changelog, homepage bundled-skill copy, and release-consistency checks' },
      { type: 'feat', text: 'Added a self-contained HTML ingest report for geotech ingest so borehole packets and broader geotechnical reports can be reviewed as a polished engineering brief instead of raw JSON alone' },
      { type: 'feat', text: 'Added public strong-beta docs and README examples for report ingest, resumable long-PDF jobs, and HTML report export using real geotechnical report workflows' },
      { type: 'fix', text: 'Continued hardening the long-PDF ingest path around normalized page routing, async job orchestration, and broader geotechnical report extraction so mixed engineering PDFs behave like a first-class workflow' },
    ],
  },
  {
    version: '0.4.21',
    date: '2026-04-20',
    tag: '0.4.21 Release',
    changes: [
      { type: 'security', text: 'Added a dedicated proprietary-internals refusal policy across the main agent, swarm, and exported legacy multi-agent orchestrator paths so hidden prompts, internal instructions, repo layout, and protected source-file requests are blocked before any model call is made' },
      { type: 'security', text: 'Hardened the agent filesystem and shell sandbox against geotechCLI repo-internal disclosure by blocking protected source/build/test areas and rejecting broad repo-root enumeration when the CLI is run from its own source checkout' },
      { type: 'fix', text: 'Kept normal user flexibility intact by preserving high-level product explanations, ordinary project subdirectory scanning, and the existing opt-in command runner behavior while adding regression coverage for the new protection boundaries' },
    ],
  },
  {
    version: '0.4.20',
    date: '2026-04-20',
    tag: '0.4.20 Release',
    changes: [
      { type: 'fix', text: 'Added a repo-level contributor guide so maintainers and coding agents can follow the current strong-beta architecture, release workflow, and verification expectations more consistently' },
      { type: 'fix', text: 'Removed a stale internal swarm prompt reference to the deleted local integration surface so the shipped multi-agent guidance matches the real toolset and beta scope' },
      { type: 'fix', text: 'Kept the strong-beta build green after the internal agent-guidance cleanup so the CLI, core package, and web app stay aligned on the new release' },
    ],
  },
  {
    version: '0.4.19',
    date: '2026-04-20',
    tag: '0.4.19 Release',
    changes: [
      { type: 'fix', text: 'Trimmed an unfinished local integration surface from the shipped beta so the public CLI only exposes features that are currently supported end to end' },
      { type: 'fix', text: 'Removed the related internal tool wiring and exports so the packaged runtime and public API surface stay aligned with the current beta scope' },
      { type: 'fix', text: 'Cleaned docs, pricing copy, README content, and release notes so the website reflects the supported feature set more accurately' },
    ],
  },
  {
    version: '0.4.18',
    date: '2026-04-20',
    tag: '0.4.18 Release',
    changes: [
      { type: 'feat', text: 'Added a dedicated geotech skill section to the public docs with concrete list, show, validate, run, and agent-session examples so bundled skills are documented as a first-class strong-beta surface' },
      { type: 'feat', text: 'Added a homepage bundled-skills showcase on the beta site, including a direct docs link and terminal examples for direct CLI use and the per-session --skills agent opt-in path' },
      { type: 'fix', text: 'Updated the public beta capability messaging to show the bundled strong-beta skill catalog more explicitly instead of leaving skills buried inside release notes or command help' },
    ],
  },
  {
    version: '0.4.17',
    date: '2026-04-20',
    tag: '0.4.17 Release',
    changes: [
      { type: 'fix', text: 'Replaced bundled skill ZIP extraction with a pure JavaScript path inside @geotechcli/core so first-use skill bootstrap no longer depends on external tar or python executables just to list or inspect installed skills' },
      { type: 'fix', text: 'Preserved the strong-beta skill catalog and the new --skills agent session opt-in while removing the Windows-specific archive extraction footgun that could block fresh local skill discovery' },
      { type: 'fix', text: 'Kept archive path validation in place so bundled skill imports still reject unsafe ZIP paths during bootstrap and nested archive discovery' },
    ],
  },
  {
    version: '0.4.12',
    date: '2026-04-19',
    tag: '0.4.12 Release',
    changes: [
      { type: 'fix', text: 'Added strong-beta release guardrails so public beta pushes now require a new shared version and verify GitHub, npm, Cloudflare, and Modal release surfaces together' },
      { type: 'feat', text: 'Removed the Modal deploy path filter so versioned strong-beta releases always refresh the hosted Qwen runtime instead of silently skipping the Modal workflow' },
      { type: 'feat', text: 'Extended the strong-beta skill runner with compatibility adapters for the remaining EPB tunnel workspace bundles so tunnel skills now share the same trusted install, sandbox, and artifact pipeline as the rest of the catalog' },
      { type: 'feat', text: 'Approved the remaining EPB tunnel skills for strong-beta execution after end-to-end certification against their bundled example inputs' },
      { type: 'fix', text: 'Fixed skill run workspace naming so back-to-back skill executions cannot collide in the same millisecond and corrupt output bundles' },
      { type: 'fix', text: 'Expanded skill runtime regression coverage so the full tunnel workspace compatibility set stays aligned with the strong-beta approval catalog' },
    ],
  },
  {
    version: '0.4.11',
    date: '2026-04-17',
    tag: '0.4.11 Release',
    changes: [
      { type: 'fix', text: 'Raised hosted-beta agent timeout budgets to better match real Modal cold starts so the CLI is less likely to fall back before the Qwen server is actually ready' },
      { type: 'fix', text: 'Changed first-turn fallback messaging to explicitly say when the Modal.com GPU is warming up or the timeout budget was exceeded instead of implying the hosted stack is simply unavailable' },
      { type: 'feat', text: 'Added live waiting hints for hosted-beta sessions so geotech agent and geotech chat can show a clearer Modal.com GPU warmup message while users wait' },
      { type: 'fix', text: 'Limited hosted agent proxy calls to a single upstream attempt instead of retrying cold starts, reducing wasted L4 GPU time and keeping timeout behavior more honest for the current budget' },
      { type: 'fix', text: 'Added regression coverage for Modal warmup and timeout fallback wording plus the no-retry hosted agent proxy path' },
    ],
  },
  {
    version: '0.4.10',
    date: '2026-04-17',
    tag: '0.4.10 Release',
    changes: [
      { type: 'feat', text: 'Added a terminal-rich text renderer for geotech agent, swarm, and chat answers so sections, bullets, tables, and inline tool names render as a cleaner engineering brief instead of raw markdown' },
      { type: 'feat', text: 'Refined the interactive plot viewer with a lighter product-style surface, scrollable legends, contained labels, and inside-only zoom so the old thick bottom slider no longer crowds the plot area' },
      { type: 'fix', text: 'Shortened chart subtitles and adjusted chart spacing so the actual engineering plot keeps priority over surrounding viewer chrome on narrower screens' },
      { type: 'fix', text: 'Skipped mixed-unit overview charts for generic CSV and workbook plots unless the overlaid series share a clear unit signature' },
      { type: 'fix', text: 'Promoted CPT templates to true inverted depth profiles, split pile browser plots into separate force and stress views, and corrected liquefaction chart domains so factor-of-safety charts are no longer stretched by blow-count ranges' },
    ],
  },
  {
    version: '0.4.9',
    date: '2026-04-17',
    tag: '0.4.9 Release',
    changes: [
      { type: 'fix', text: 'Generic hosted-beta transport failures like Hosted beta AI request failed, empty upstream content, and fetch failed are now treated as temporary first-turn availability issues instead of surfacing a raw chat error and then continuing down a second answer path' },
      { type: 'feat', text: 'Added a live terminal status controller for geotech agent and geotech chat so users see Terzaghi actively thinking, calling tools, and reviewing results while the response is being prepared' },
      { type: 'fix', text: 'Kept the underlying agent workflow unchanged for evidence-backed requests while making the waiting experience feel active and more trustworthy during long hosted responses' },
      { type: 'fix', text: 'Broadened tunnelling intake detection so UCS, water inflow, face, and machine-selection prompts now short-circuit into the data-requirements screen even when users do not explicitly say TBM or tunnel' },
    ],
  },
  {
    version: '0.4.8',
    date: '2026-04-17',
    tag: '0.4.8 Release',
    changes: [
      { type: 'feat', text: 'Replaced the narrow foundation-only shortcut with a catalog-driven geotechnical intake layer that screens multiple analysis families before calling the hosted model' },
      { type: 'fix', text: 'Under-specified foundation, soil classification, and liquefaction prompts now return immediate engineering data requirements instead of burning a long hosted-beta round trip' },
      { type: 'fix', text: 'Project metadata and notes alone no longer suppress agent intake; only real evidence such as soil profiles, datasets, derived parameters, or active analysis context can bypass it' },
      { type: 'fix', text: 'Added regression coverage to keep metadata-only project sessions from slipping past intake while still allowing evidence-backed project context to reach hosted beta normally' },
    ],
  },
  {
    version: '0.4.7',
    date: '2026-04-17',
    tag: '0.4.7 Release',
    changes: [
      { type: 'fix', text: 'Added an immediate deterministic screening answer for under-specified foundation and soil-profile agent prompts so the CLI responds instantly instead of waiting on hosted-beta just to request missing data' },
      { type: 'fix', text: 'Improved the hosted-beta fallback for the same foundation-screening prompts so transient provider issues now return a useful engineering checklist instead of the generic no-fallback message' },
      { type: 'fix', text: 'Switched hosted beta to the native vLLM OpenAI-compatible server on Modal so text and image chat completions share the same contract and the broken modal-http invalid function call path is removed' },
      { type: 'fix', text: 'Kept hosted beta on Qwen/Qwen3.5-9B as the shared hybrid multimodal model instead of drifting to a separate Qwen2.5-VL default' },
      { type: 'fix', text: 'Corrected the Modal vLLM launcher to pass --limit-mm-per-prompt as JSON so the current vllm serve CLI accepts multimodal limits during deploy' },
      { type: 'feat', text: 'Expanded the Modal deploy workflow to watch hosted-beta contract files and added a post-deploy /health smoke check to catch drift immediately' },
      { type: 'feat', text: 'Replaced ASCII-first plotting with an interactive browser plot viewer for geotech viz and command-level --plot flows, while keeping terminal fallback available' },
    ],
  },
  {
    version: 'strong-beta-qwen-migration',
    date: '2026-04-16',
    tag: 'Qwen on Modal',
    changes: [
      { type: 'feat', text: 'Migrated hosted beta backend from GLM (Zhipu/Z.AI) to Qwen/Qwen3.5-9B served on Modal.com with NVIDIA L4 GPU' },
      { type: 'feat', text: 'Modal deployment auto-scales to zero after 10 minutes idle to conserve GPU credits' },
      { type: 'feat', text: 'Hosted beta text and vision defaults unified to Qwen/Qwen3.5-9B' },
      { type: 'fix', text: 'Updated proxy, CLI defaults, docs, privacy, and website copy for the new model and provider' },
    ],
  },
  {
    version: 'strong-beta-model-refresh',
    date: '2026-04-14',
    tag: 'Hosted Model Update',
    changes: [
      { type: 'feat', text: 'Hosted beta text default switched to glm-4.7-flash to reduce shared credit burn during strong beta' },
      { type: 'feat', text: 'Hosted beta vision default switched to glm-4.6v-flash for lower-cost image analysis during strong beta' },
      { type: 'fix', text: 'Hosted proxy allowlist, CLI defaults, and docs were aligned to the new flash model IDs' },
    ],
  },
  {
    version: 'strong-beta-wave2',
    date: '2026-04-03',
    tag: 'Hosted Qwen Beta',
    changes: [
      { type: 'feat', text: 'Hosted beta gateway enabled for strong-beta with Qwen/Qwen3.5-9B on Modal' },
      { type: 'security', text: 'Proxy now validates requests, enforces model allowlists, and applies server-side rate limits before calling upstream' },
      { type: 'feat', text: 'CLI default provider switched to hosted-beta so users can try AI commands without bringing their own key' },
      { type: 'feat', text: 'Website, docs, and privacy copy updated to reflect hosted beta access with no-signup limits' },
    ],
  },
  {
    version: 'strong-beta',
    date: '2026-04-03',
    tag: 'Strong Beta Branch',
    changes: [
      { type: 'feat', text: 'Public beta branch introduced for safe Cloudflare deployment trials' },
      { type: 'feat', text: 'Website messaging rewritten around strong beta: deterministic CLI live, hosted anonymous AI coming in a later wave' },
      { type: 'fix', text: 'Signup, checkout, usage, webhook, and hosted proxy endpoints disabled until the beta gateway is ready' },
      { type: 'fix', text: 'CLI AI flows now use the user configured provider directly in Wave 1, without fake registration walls' },
      { type: 'feat', text: 'Hosted beta defaults are Qwen/Qwen3.5-9B for both text and vision' },
    ],
  },
  {
    version: '0.4.4',
    date: '2026-04-14',
    tag: '0.4.4 Release',
    changes: [
      { type: 'fix', text: 'Deepened hosted-beta upstream retry and backoff behavior again so transient free-model overload windows are less likely to surface as immediate CLI failures' },
      { type: 'feat', text: 'Added a local heuristic fallback for geotech ai-classify so descriptive soil classification can still return a USCS-style result when hosted-beta text is temporarily unavailable' },
      { type: 'fix', text: 'Added deterministic fallback behavior for the first agent turn so provider saturation now yields a useful engineering limitation analysis instead of a blank agent failure' },
      { type: 'fix', text: 'Added focused regression tests for the new ai-classify and agent fallback paths before releasing the patch' },
      { type: 'feat', text: 'Raised hosted-beta limits for installed geotechCLI clients while keeping stricter anonymous caps in place for the public beta proxy' },
      { type: 'fix', text: 'Added retry and backoff handling for transient upstream 429 and gateway overload responses so simple AI commands recover more gracefully' },
      { type: 'fix', text: 'Extended hosted-beta timeout budgets for text, vision, and agent requests and translated raw aborts into clearer timeout messages in the CLI' },
      { type: 'fix', text: 'Separated daily usage fingerprints by client mode so geotechCLI traffic no longer burns through the same low anonymous bucket' },
      { type: 'fix', text: 'Added focused hosted-beta regression tests covering client-mode limits, upstream retry behavior, and timeout handling before shipping the patch release' },
      { type: 'feat', text: 'Expanded terminal plotting so classify uscs, liquefaction, and pile now support direct engineering ASCII charts through the shared --plot flag' },
      { type: 'feat', text: 'Added geotech viz engineering presets for Mohr circle and Atterberg plasticity charts with field-friendly CLI inputs' },
      { type: 'feat', text: 'Added geotech viz file templates for compaction curves, grain-size distribution curves, and CPT-style plotting to speed up daily engineering review' },
      { type: 'feat', text: 'Committed new visualization showcase files for compaction, gradation, and CPT workflows and kept the docs in sync with the CLI surface' },
      { type: 'security', text: 'Closed agent sandbox escape paths, gated command execution more tightly, and hardened hosted-beta request handling for production-facing strong-beta use' },
      { type: 'fix', text: 'Corrected slope seismic regression behavior and locked the deterministic engineering suite back to a passing state' },
      { type: 'feat', text: 'Added additive case-file persistence, deterministic report assembly, conservative evidence records, and agent deliverable tools for report and export generation' },
      { type: 'feat', text: 'Enabled PDF and DOCX exports for deterministic stored-case reports using dedicated layout generators' },
      { type: 'feat', text: 'Added terminal visualization with geotech viz plus committed CSV and Excel showcase samples for demos and quick plotting' },
      { type: 'feat', text: 'Borehole log vision can now process multi-page PDFs page by page and merge the extracted log output into one result' },
      { type: 'fix', text: 'Added settlement trough and forgiving through aliases so the Peck plotting command matches the public examples and common user phrasing' },
      { type: 'fix', text: 'Export examples and committed mock datasets were added so GeoJSON, DXF, and CSV flows can be smoke-tested reliably' },
      { type: 'security', text: 'Updated Next.js to 15.5.15 and the Vitest toolchain to 4.1.4 so the release workspace installs cleanly with no npm audit vulnerabilities' },
      { type: 'fix', text: 'Aligned GitHub Actions and Cloudflare release jobs to Node 22 and added the direct esbuild install required by the OpenNext Cloudflare bundler' },
      { type: 'fix', text: 'Aligned the public release surface on Qwen3.5-9B defaults across docs, CLI, and website copy' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-30',
    tag: 'Stability + Safety',
    changes: [
      { type: 'security', text: 'Filesystem sandbox and shell command hardening for agent tools' },
      { type: 'feat', text: 'Pile capacity, slope stability, and lateral earth pressure modules added to the deterministic core' },
      { type: 'fix', text: 'Bearing capacity water-table correction implemented for shallow foundations' },
      { type: 'feat', text: 'Persistent CLI usage tracking and email verification flow added' },
      { type: 'feat', text: '--quiet and --dry-run wired into the CLI for safer scripted workflows' },
      { type: 'fix', text: 'Expanded guardrails, standards coverage, and tool registry breadth for agent execution' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-26',
    tag: 'Initial Release',
    changes: [
      { type: 'feat', text: 'Bearing capacity calculation (Terzaghi, Meyerhof, Hansen, Vesic)' },
      { type: 'feat', text: 'Liquefaction triggering analysis (Boulanger & Idriss 2014, NCEER)' },
      { type: 'feat', text: 'Rock & soil classification (RMR89, USCS, Q-system)' },
      { type: 'feat', text: 'TBM performance prediction, type selection, cutter wear estimation' },
      { type: 'feat', text: 'AI vision analysis: core box, hybrid RMR, sensor data, borehole logs' },
      { type: 'feat', text: 'Multi-agent orchestrator (Geo, Tunnel, Hydro, Seismic, Slope, Foundation agents)' },
      { type: 'feat', text: 'AI-powered report generation from analysis data' },
      { type: 'feat', text: 'Natural language soil classification' },
      { type: 'feat', text: 'GBR document Q&A with vision model' },
      { type: 'feat', text: 'Export to GeoJSON, DXF (AutoCAD), and CSV' },
      { type: 'feat', text: 'LLM-agnostic provider layer: Qwen, OpenAI, Anthropic, Hugging Face, and self-hosted backends' },
      { type: 'feat', text: 'Anti-abuse metering: 5 free AI calls for unregistered users, IP fingerprinting' },
      { type: 'feat', text: '--json, --verbose, --plot, --output global flags on every command' },
      { type: 'security', text: 'API keys never logged, echoed, or included in error messages' },
      { type: 'security', text: 'JSON output auto-redacts all sensitive fields' },
    ],
  },
];

const typeColors: Record<string, string> = {
  feat: 'bg-[rgba(45,212,191,0.15)] text-[var(--accent-teal)]',
  fix: 'bg-[rgba(59,130,246,0.15)] text-[var(--accent-blue)]',
  security: 'bg-[rgba(245,158,11,0.15)] text-[var(--accent-orange)]',
  breaking: 'bg-[rgba(239,68,68,0.15)] text-red-400',
};

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 px-12 pb-16 max-w-[800px]">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Changelog</h1>
        <p className="text-[var(--text-secondary)] text-base mb-12">
          Strong beta branch notes followed by the main historical release log.
        </p>

        {releases.map((release) => (
          <section key={release.version} className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-2xl font-bold tracking-tight">v{release.version}</h2>
              <span className="font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
                {release.date}
              </span>
              <span className="px-2.5 py-0.5 bg-[rgba(45,212,191,0.1)] text-[var(--accent-teal)] text-[10px] font-semibold rounded-full uppercase tracking-wider">
                {release.tag}
              </span>
            </div>

            <div className="space-y-3">
              {release.changes.map((change, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wider ${typeColors[change.type] ?? typeColors.feat}`}
                  >
                    {change.type}
                  </span>
                  <span className="text-[14px] text-[var(--text-secondary)] leading-[1.6]">
                    {change.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}

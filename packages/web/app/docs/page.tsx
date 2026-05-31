import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_VISION_MODEL,
  GLOBAL_FLAG_DEFINITIONS,
} from '@geotechcli/core/meta';

const globalFlagsTable = [
  '| Flag | Description |',
  '|------|-------------|',
  ...GLOBAL_FLAG_DEFINITIONS.map((flag) => `| \`${flag.option}\` | ${flag.description} |`),
].join('\n');

const sections = [
  {
    id: 'install',
    title: 'Installation',
    content: `\`\`\`bash
# Install Node.js LTS first and verify the toolchain
node -v
npm -v

# Install geotechCLI
npm install -g geotechcli
\`\`\`

Use the official Node.js installer or a trusted OS package manager. Deterministic commands work immediately after install, and strong-beta AI commands use the hosted GLM gateway by default. Verify installation:

\`\`\`bash
geotech --version
geotech status
\`\`\``,
  },
  {
    id: 'config',
    title: 'Configuration',
    content: `geotechCLI stores configuration in \`~/.geotechcli/config.json\`.

\`\`\`bash
# View current config
geotech config view

# Set LLM provider (default: ${DEFAULT_LLM_PROVIDER})
geotech config set llm.provider ${DEFAULT_LLM_PROVIDER}

# Strong beta defaults
geotech config get llm.provider   # ${DEFAULT_LLM_PROVIDER}
geotech config get llm.model      # provider default (${DEFAULT_LLM_MODEL})
geotech config get llm.vision_model  # provider default (${DEFAULT_LLM_VISION_MODEL})

# Hosted beta is the default and does not require a user provider key.
# Optional advanced override: switch to another provider with your own key.

# Hugging Face — advanced beta with your own token
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct

# HF with specific provider backend or auto-routing
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct:cerebras
geotech config set llm.model deepseek-ai/DeepSeek-V3:cheapest

# HF vision model for geotech vision commands
geotech config set llm.vision_model glm-5v-turbo

# OpenAI — advanced beta with your own key
geotech config set llm.provider openai
geotech config set llm.api_key sk-...

# Anthropic — advanced beta with your own key
geotech config set llm.provider anthropic
geotech config set llm.api_key sk-ant-...

# Self-hosted model (OpenAI-compatible endpoint)
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://your-vps:8000/v1
geotech config set llm.model local-model-id

# Optional local BYOK smoke checks for configured environment keys
npm run smoke:byok
npm run smoke:byok -- --provider=openai-compatible --strict
npm run smoke:byok -- --provider=openrouter --strict

# Reset to defaults
geotech config reset
\`\`\`

Strong-beta behavior: deterministic commands work immediately after install. AI, vision, and agent commands use hosted GLM access by default, with higher installed-CLI development limits, stricter anonymous caps, and no user provider key required. Bring-your-own provider keys remain available as an advanced override.

Installed skills are also bundled in strong beta. Direct geotech skill commands are ready immediately, while geotech agent and geotech chat can opt into skill tools per session with the --skills flag.

Hugging Face setup: get a token at huggingface.co/settings/tokens with "Make calls to Inference Providers" permission. Browse models at huggingface.co/models. Append :fastest or :cheapest to auto-route, or :provider to force a specific backend (cerebras, together, groq, etc.).

BYOK smoke setup: npm run smoke:byok uses OPENROUTER_API_KEY, OPENROUTER_MODEL, ZHIPU_API_KEY/ZAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, HF_TOKEN/HUGGINGFACE_API_KEY, or OPENAI_COMPATIBLE_API_KEY + OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_MODEL when present. The smoke checks validate text synthesis against the provider-neutral document evidence prompt path; PDF/OCR/vision quality still depends on the selected model capability.`,
  },
  {
    id: 'provider-contract',
    title: 'Provider-agnostic agent contract',
    content: `Hosted GLM is the default strong-beta provider, but GeotechCLI agent prompts are built around a provider-agnostic operating contract. The contract tells hosted GLM, paid BYOK models, free OpenRouter routes, Hugging Face, and local OpenAI-compatible servers how to behave inside the same geotechnical workflow.

The operating contract includes:

- provider capability profile: text, JSON, image, native-PDF, and context strategy
- evidence-first rules for DocumentEvidencePacket, GroundModel, EvidenceRef, source pages, standards snippets, and tool outputs
- deterministic calculation boundaries so models use GeotechCLI tools instead of inventing numbers
- confidence and review gates for missing, low-confidence, direct-visual-only, or canAutoProceed=false evidence
- free/open-route adaptation for compact evidence, smaller steps, unsupported image/PDF routes, null content, and rate limits

This keeps BYOK model quality dependent on model capability, while keeping GeotechCLI behavior consistent and defensible across providers. Project workflow routing uses the same boundary: shipped recognized workflow prompts route deterministically with confidence gates, and --route-with-model lets ambiguous prompts request a strict JSON model proposal that is validated against the allowed workflow list before GeotechCLI owns calculations, FEM case data, visualization specs, confidence, and artifacts. Optional swarm mode adds a deterministic role plan on top of that contract, so BYOK models receive explicit WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer responsibilities before they reason over evidence.`,
  },
  {
    id: 'skills',
    title: 'geotech skill',
    content: `Bundled strong-beta skills ship with the CLI and bootstrap on first use. Use direct skill commands when you want a repeatable local workflow. Use the --skills flag when you want geotech agent or geotech chat to discover and call approved installed skills for that one session.

\`\`\`bash
# See the bundled catalog
geotech skill list

# Inspect one installed workflow and its approval state
geotech skill show shallow-foundation-option-screening

# Validate an installed bundled skill
geotech skill validate shallow-foundation-option-screening

# Run one approved deterministic skill against your prepared input directory
geotech skill run shallow-foundation-option-screening --input-dir ./foundation-inputs

# Let agent or chat use approved skills for one session
geotech agent "screen shallow foundation options for this site" --skills
geotech chat --skills
\`\`\`

Strong beta currently bundles 49 skills: 48 approved executable skills and 1 prompt-only reviewer skill.`,
  },
  {
    id: 'bearing',
    title: 'geotech bearing',
    content: `Calculate bearing capacity using Terzaghi, Meyerhof, Hansen, or Vesic methods.

\`\`\`bash
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5 --method meyerhof

# With JSON output for scripts
geotech bearing --depth 5 --phi 30 --json

# Show calculation steps
geotech bearing --depth 5 --phi 30 --verbose

# All options
geotech bearing \\
  --depth <m>        # Embedment depth Df (required)
  --phi <deg>        # Friction angle φ (required)
  --cohesion <kPa>   # Cohesion c (default: 0)
  --width <m>        # Foundation width B (default: 2)
  --length <m>       # Foundation length L (omit for strip)
  --unit-weight <kN/m3>  # Soil unit weight γ (default: 18)
  --method <n>       # terzaghi|meyerhof|hansen|vesic (default: meyerhof)
  --fs <number>      # Factor of safety (default: 3)
  --shape <type>     # strip|square|circular|rectangular (default: strip)
\`\`\``,
  },
  {
    id: 'liquefaction',
    title: 'geotech liquefaction',
    content: `Seismic liquefaction triggering analysis using Boulanger & Idriss (2014) or NCEER simplified procedure.

\`\`\`bash
# With SPT profile CSV (columns: depth,sptN,finesContent,unitWeight,waterTableDepth)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# Single layer quick check
geotech liquefaction --pga 0.3 --magnitude 7.0 --depth 5 --spt 12 --fines 15

# Demo mode (built-in sample data)
geotech liquefaction --pga 0.25 --magnitude 7.5 --demo

# Open the interactive depth profile viewer
geotech liquefaction --pga 0.25 --magnitude 7.5 --demo --plot
\`\`\``,
  },
  {
    id: 'classify',
    title: 'geotech classify',
    content: `Rock and soil classification systems.

\`\`\`bash
# RMR89 (Bieniawski 1989)
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# USCS (ASTM D2487)
geotech classify uscs --gravel 12 --sand 58 --fines 30 --ll 42 --pi 18

# Plot the sample on the plasticity chart
geotech classify uscs --gravel 5 --sand 20 --fines 75 --ll 55 --pl 25 --plot

# Q-system (Barton 1974)
geotech classify q-system --rqd 80 --jn 6 --jr 1.5 --ja 2 --jw 0.66 --srf 1
\`\`\``,
  },
  {
    id: 'tunnel',
    title: 'geotech tunnel',
    content: `Tunnel engineering commands — TBM prediction, selection, and cutter wear.

\`\`\`bash
# TBM performance prediction
geotech tunnel tbm-predict --diameter 6.5 --ucs 80 --rqd 65 --cai 2.1

# TBM type selection
geotech tunnel tbm-select --diameter 6.5 --ground mixed --water 3 --boulders

# Cutter wear prediction
geotech tunnel cutter-wear --cai 3.5 --ucs 120 --distance 5000 --cutters 48
\`\`\``,
  },
  {
    id: 'vision',
    title: 'geotech vision (AI)',
    content: `AI-powered image analysis. Uses hosted GLM vision by default.

\`\`\`bash
# Core box analysis → RQD, fracture spacing, weathering
geotech vision corebox core-photo.jpg

# Hybrid RMR: vision extracts → deterministic scoring
geotech vision rmr tunnel-face.jpg

# Sensor data interpretation
geotech vision sensor piezometer-chart.png

# Borehole log extraction from image
geotech vision log borehole-log.png

# Multi-page borehole PDF processing
geotech vision log Appendix-2A-Geotechnical-Report-Part-6.pdf
\`\`\``,
  },
  {
    id: 'analyze',
    title: 'geotech analyze',
    content: `Local project-folder intelligence. This deterministic command scans a workspace, builds a project manifest, classifies geotechnical files, samples CSV/XLSX schemas, builds an evidence-bound GroundModel with visual review, records requested branch or standard context, and reports calculation-readiness routing without spending hosted-beta GPU time.

\`\`\`bash
# Compact terminal analysis
geotech analyze .

# Automation-friendly manifest plus GroundModel/verifier
geotech analyze . --json

# Self-contained browser report
geotech analyze . --format html

# Save the manifest, then plot GroundModel map, SPT, lab, and groundwater charts
geotech analyze . --json --output workspace.json
geotech viz workspace.json --list
geotech viz workspace.json --save-html ground-model-review.html --no-open

# Branch and standards context for downstream workflows
geotech analyze . --branch foundation
geotech analyze . --standard eurocode7
geotech analyze . --standard eurocode7 --draft-inputs --json
\`\`\`

Current strong-beta scope: file discovery, AGS/PDF/image/GIS/CAD classification, context-aware CSV/XLSX schema inference for common borehole IDs and groundwater-depth tables, evidence references, canonical GroundModel construction, GroundModel coordinate maps with CRS/local-grid warnings, compact borehole strip logs, SPT-depth plots, lab-parameter depth charts, groundwater/monitoring summaries, standards-profile assumptions and validation blockers for Eurocode 7/AASHTO/IS/BS/ASTM, verifier findings, detected branches, calculation readiness for bearing, settlement, evidence-prefilled experimental FEM foundation/excavation/tunnel drafts, report/GroundModel-derived FEM draft candidates, reviewed FEM draft-to-run acceptance, pile, liquefaction, and slope workflows, optional non-executing calculation input drafts with source locations, source pages, evidence-derived confidence, review gates, warnings, and recommended next steps. Analyze does not yet auto-run design calculations from the folder; it reports which deterministic workflow is ready, blocked, or needs explicit assumptions before routing. The optional agent swarm planner can consume this workspace evidence with --workspace --swarm.`,
  },
  {
    id: 'fem',
    title: 'geotech fem',
    content: `Experimental deterministic FEM case drafting, reviewed draft execution, and 3D FEM/WebGL previews. The current strong-beta surfaces prepare review-gated foundation-settlement, staged-excavation deformation, and tunnel volume-loss settlement analysis cases, then either run a human-reviewed analysis_case.json through deterministic built-in preview backends or run built-in raft, excavation, and empirical tunnel settlement demos that validate analysis cases, produce deterministic result manifests, and export self-contained WebGL artifacts without spending hosted-beta model calls.

\`\`\`bash
geotech fem draft foundation-settlement --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem draft foundation-settlement --workspace ./site-data --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem run analysis_case.json --experimental --save-html fem-run.html --output fem-run.manifest.json --no-open
geotech fem draft excavation-deformation --excavation-length 22 --excavation-width 14 --excavation-depth 9 --stage-depths 3,6,9 --support-levels 0,2,5 --json
geotech fem demo raft --experimental
geotech fem demo raft --experimental --save-html raft-fem.html --no-open
geotech fem demo raft --experimental --output raft-fem.manifest.json --json
geotech fem demo excavation --experimental
geotech fem demo excavation --experimental --save-html excavation-fem.html --no-open
geotech fem demo excavation --experimental --output excavation-fem.manifest.json --json
geotech fem draft tunnel-volume-loss-settlement --tunnel-diameter 6 --tunnel-depth 18 --tunnel-length 60 --volume-loss 1.2 --trough-width 0.5 --json
geotech fem demo tunnel --experimental
geotech fem demo tunnel --experimental --save-html tunnel-fem.html --no-open
geotech fem demo tunnel --experimental --output tunnel-fem.manifest.json --json
geotech fem agent "which FEM route fits a braced excavation beside an existing building?"
geotech fem agent "draft a staged excavation FEM case" --objective excavation-deformation --json
geotech fem agent "review FEM readiness for this site" --workspace ./site-data --objective foundation-settlement
\`\`\`

Current executable preview scope: foundation-settlement, staged-excavation deformation, and tunnel volume-loss settlement drafts/demos, explicit draft inputs, reviewed case-file execution through \`geotech fem run\`, workspace and report-derived evidence prefill for material and groundwater assumptions, fixed built-in demo geometry, deterministic result envelopes, validation warnings, and browser artifact export. Shaft deformation, pile-group interaction, slope/embankment deformation, retaining-wall/excavation-support, seepage/groundwater coupling, and staged settlement/consolidation are contract-only draft routes: they expose required evidence, missing inputs, blocker codes, and safe draft commands, but they do not create \`analysis_case.json\`, run solvers, render WebGL, or claim results. \`geotech fem draft\` prepares editable \`analysis_case.json\` inputs only for implemented preview routes; ingest HTML reports list FEM draft candidates from the extracted GroundModel as routing guidance only; \`geotech fem run\` accepts a reviewed \`analysis_case.json\` and dispatches it through deterministic built-in preview backends; demo commands execute only the built-in experimental examples. Raft and excavation previews use deterministic elastic screening fields; the tunnel preview uses an empirical Gaussian settlement trough from prescribed volume loss and trough-width factor. Workspace/report prefill can carry material stiffness, unit weight, groundwater assumptions, readiness scores, and evidence references into supported drafts, but geometry, loads, staging, mesh intent, volume-loss assumptions, and engineering approval still require explicit user review. The excavation preview adds staged field controls for surface settlement, horizontal displacement, and wall-deflection proxy. FEM manifests also include optional resultFields, steps, and datasets metadata so planned routes can share the same validation and viewer contract once deterministic backends exist. It is deliberately gated behind --experimental and is not a production FEM solver, wall-design check, tunnel lining check, face-stability check, basal-heave check, seepage analysis, or design calculation.

Agent and swarm mode see FEM through deterministic routing tools rather than prompt-only claims. geotech fem agent is a narrower LLM brain for FEM planning: it may only list FEM capabilities, prepare review-gated case drafts, and validate FEM cases. With --workspace, it receives FEM-only GroundModel readiness context and the same evidence-prefill contract as geotech fem draft for supported workspace draft routes. It cannot run solvers, invoke \`geotech fem run\`, write WebGL artifacts, or invent FEM displacement/reaction values. In general swarm mode, simulation-stage FEM/calculation tool outputs are threaded into reviewer prompts as deterministic tool context so RiskReviewer validation does not depend on a model restating every case detail in prose. Blocked or review-required FEM validation remains unresolved until human review; malformed, contradictory, or contaminated reviewer JSON fails closed; and generic artifact tools block invented FEM result manifests, solver outputs, WebGL claims, or fabricated FEM analysis files. The purpose is to stabilize the provider-neutral FEM case/result contract before future GroundModel-to-calculation routing, report-derived input drafting, and agent review workflows use the same deterministic boundary.`,
  },
  {
    id: 'ingest',
    title: 'geotech ingest',
    content: `Structured ingest for geotechnical PDFs and images. Use \`borehole-log\` for focused borehole extraction and \`geotech-document\` for broader report intelligence such as geology, lithology, classifications, and engineering parameters.

\`\`\`bash
# Borehole-log extraction from images or PDF packets
geotech ingest borehole-log.pdf --type borehole-log

# Broader geotechnical report intelligence.
# Long PDFs show live progress by default; add --background to detach.
geotech ingest Geotechnical-Report.pdf --type geotech-document

# Export and open the self-contained HTML report for design review or sharing.
# Add --no-open to save the file without launching a browser.
geotech ingest Geotechnical-Report.pdf --type geotech-document --format html --output geotechnical-report.html

# Large hosted-beta reports automatically switch to segmented resumable async jobs
geotech ingest Geotechnical-Report.pdf --type geotech-document
geotech ingest wait <jobId> --format html --output geotechnical-report.html
geotech ingest result <jobId> --format html --output geotechnical-report.html

# Write a benchmark JSON for first-run vs cached-rerun comparisons
geotech ingest result <jobId> --format benchmark --output geotechnical-report.benchmark.json

# Optional local two-pass benchmark against the canonical development PDF
npm run benchmark:geotech-report

# Review a focused range without processing the whole report
geotech ingest Geotechnical-Report.pdf --type geotech-document --page-range 61:102

# Persist a project-backed ingest, then reopen the latest stored review later
geotech ingest Geotechnical-Report.pdf --type geotech-document --project demo-project
geotech ingest review demo-project --dataset ingest-review:latest --format html --output review-report.html
\`\`\`

The HTML report is a self-contained Geotechnical Intelligence Report with sticky navigation, executive facts, Review confidence metrics, a provider-neutral Trust breakdown, review actions, engineering insight cards, an evidence-first trust table, source evidence, lightweight borehole stratigraphy visualization when layer evidence is available, and a GroundModel Visual Review with compact strip logs, SPT-depth plots, lab-parameter depth charts, and groundwater summaries when PDF evidence supports them. Stored-review and approval context appears when the ingest is project-backed. Technical model-stage details, page audit matrices, local evidence cache status, and operational warnings live in a collapsed Processing Audit section. Interactive terminals open the report in the browser by default; use --no-open for save-only workflows.

Hosted-beta reliability note: geotechnical PDFs above the best-result window are split into resumable page jobs with live progress, retryable transient failures, and merged final results plus HTML report output. The hosted-beta path runs GLM-OCR layout extraction before vision OCR, uses GLM-5V visual interpretation only where layout/text is insufficient, preprocesses image evidence with margin trimming, projection-profile/fine-pass deskew, normalized page/crop assets, smarter log/table and borehole/log strip crop candidates, and region quality scoring, caches compact page evidence locally by file/page/model/preprocessing/schema hash for repeatable reruns, and feeds compact evidence into GLM-5.1 synthesis for human-readable report interpretation. Use --format benchmark on completed geotechnical report jobs to compare cache reuse, estimated hosted calls, confidence breakdown, direct and audit-backed source-page traceability, provider capability profile, preprocessing mode, deskew and quality scores, preprocessing/region coverage, page latency, and ground-model readiness across OCR/vision changes. The optional npm run benchmark:geotech-report script runs the same contract as a local two-pass report benchmark when the canonical PDF is available; use --preprocessing-mode none|ocr-optimized|region-v2, or --first-preprocessing-mode and --second-preprocessing-mode, to compare preprocessing modes. npm run benchmark:preprocessing is the no-model fixture benchmark for borehole/table, CPT, lab, mixed scanned, mixed digital/scanned, and malformed scanned PDFs; it compares none, ocr-optimized, and region-v2 through latency, quality, crop assets, region counts, region quality, and path-leak checks before those fixture classes move into hosted ingest benchmarks. npm run benchmark:geotech-corpus compares none, ocr-optimized, and region-v2 by default across the internal fixture corpus, includes a committed image-only borehole/table PDF fixture that gates rendered PDF crop detection, and region-v2 routes crop assets into OCR before full-page vision OCR. npm run benchmark:signal-analysis creates a synthetic monitoring workspace, verifies deterministic signal artifacts, direct threshold and missing-interval metrics, zero model calls, and writes comparison JSON plus an SVG summary. The benchmark contract is provider-neutral so future BYOK models can be evaluated against the same page evidence, traceability, confidence, and readiness metrics. Confidence is workflow trust, not model self-score, and synthesis alone does not raise it.`,
  },
  {
    id: 'signal',
    title: 'geotech signal analyze',
    content: `Deterministic monitoring and time-series analysis for settlement, piezometer, inclinometer, vibration, and load-test files. This command parses CSV/TSV/XLSX data without an LLM, infers or accepts timestamp/depth/value/instrument/location columns, and emits trend summaries, optional threshold flags, missing interval detection, rate-of-change metrics, and chart-ready series. Threshold flags are emitted only when --threshold or --rate-threshold is supplied because units vary by instrument and project convention. Agent and swarm runs can consume the same deterministic summary through the sandboxed analyze_signal_file interpretation tool; LLMs may plan and review from the summary but cannot invent signal metrics.

\`\`\`bash
# JSON is the default output for automation
geotech signal analyze monitoring.csv

# Settlement monitoring with a daily expected interval
geotech signal analyze settlement.csv --type settlement --expected-interval-hours 24

# Excel workbook with explicit sheet and column names
geotech signal analyze readings.xlsx --sheet Daily --timestamp date --value settlement_mm

# Optional project-specific threshold flags
geotech signal analyze piezometer.tsv --type piezometer --threshold 50 --rate-threshold 5

# Interactive HTML signal plot without opening a browser
geotech signal analyze settlement.csv --save-html settlement-signal.html --no-open

# Human-readable terminal summary
geotech signal analyze inclinometer.csv --format text
\`\`\`

Signal V0 is an internal strong-beta deterministic parser. Agent interpretation can consume its JSON summary later, but the CLI command itself does not invent engineering conclusions or call hosted/BYOK models. Use npm run smoke:signal-analysis or npm run benchmark:signal-analysis after npm run build to validate the synthetic monitoring fixture, persisted signal artifact index, per-source analysis JSON, direct threshold and missing-interval metrics, tool-call trace, and empty model_calls.jsonl.`,
  },
  {
    id: 'agent',
    title: 'geotech agent (AI)',
    content: `Agentic geotechnical reasoning. No-prompt, dot-argument, --plan-only, --task, and prompted runs now start with project-aware discovery unless --no-workspace is supplied: the CLI resolves the workspace boundary from --workspace, .geotech/project.json, git root, or cwd; scans the selected root; writes .geotech project/evidence/context/run artifacts; computes workflow readiness; and asks which project workflow should run before spending hosted-beta time. Recognized prompted workflow requests are routed through the provider-neutral workflow router and confidence-gated deterministic project executors before any optional model review; custom questions and low-confidence routes fall back to the workspace-backed LLM path. Custom Terzaghi agent questions still support deterministic tools, persistent project memory with --project, and --swarm for role-based specialist planning over workspace evidence, standards readiness, calculation input drafts, skills, and review gates.

\`\`\`bash
# Project-aware discovery with no LLM call
geotech agent --plan-only
geotech agent .

# Run a selected project-aware workflow deterministically from workspace evidence
geotech agent --task data-quality --workspace .
geotech agent --task ground-model --workspace .
geotech agent --task calculation-readiness --workspace .
geotech agent --task risk-analysis --workspace .
geotech agent --task anomaly-detection --workspace .
geotech agent --task recommendations --workspace .
geotech agent --task signal-analysis --workspace .
geotech agent --task visualization --workspace .
geotech agent "find anomalies and create visualizations"
geotech agent "decide the best project workflow" --route-with-model

# Default Terzaghi agent
geotech agent "evaluate TBM selection for 6.5m tunnel in mixed face conditions with 3 bar water pressure"

geotech agent "classify the soil profile and recommend foundation type for a 12-story building"

# Attach a local workspace GroundModel and verifier summary before calling the agent
geotech agent "analyze this folder and prepare a foundation screening report" --workspace .

# Disable project discovery for a generic one-off prompt
geotech agent "explain Terzaghi bearing factors" --no-workspace

# Optional role-based swarm orchestration
geotech agent "review bearing, settlement, and slope risks for this site" --workspace . --skills --swarm

# Explicitly enable installed skill tools for this one session
geotech agent "screen shallow foundation options for this site" --skills

# Interactive chat with explicit skill access
geotech chat --skills

# Reuse persistent project memory across runs
geotech agent "check bearing and settlement for the current foundation concept" --project tokyo-shaft

# Save report to file
geotech agent "analyze slope stability for 15m cut" --output slope-report.md
\`\`\`

Strong-beta reliability note: project-aware discovery writes .geotech/project.json, .geotech/manifest.json, .geotech/evidence/file_index.jsonl, .geotech/evidence/evidence_index.jsonl, .geotech/context/readiness.json, .geotech/context/project_summary.md, .geotech/context/memory.json, and per-run intent/plan/trace/tool-call/model-call artifacts from deterministic workspace analysis before any LLM call. Use --max-files and --max-depth to bound discovery. Recognized prompted workflow requests write workflow_route.json, deterministic child workflow outputs, and workflow_route_report.md while keeping model_calls.jsonl empty. Calculation-readiness prompts such as bearing, settlement, pile, liquefaction, slope, and FEM draft readiness route through the GroundModel verifier contract and command templates instead of letting an LLM invent design inputs. Monitoring prompts such as piezometer, inclinometer, vibration, settlement monitoring, load-test, threshold, trigger-level, or time-series review route through deterministic signal-analysis command templates and persisted signal JSON artifacts instead of letting an LLM invent signal metrics. Ambiguous requests can opt into --route-with-model; the configured hosted/BYOK model proposes strict JSON workflow tasks, GeotechCLI rejects unknown tasks and confidence-gates execution, and model_calls.jsonl records only that router proposal plus any later planned workspace-backed agent call. Explicit --task data-quality, ground-model, calculation-readiness, risk-analysis, anomaly-detection, recommendations, signal-analysis, and visualization runs execute a deterministic provider-neutral project workflow first, write workflow_result.json, workflow_report.md, and workflow_trace.json under .geotech/runs/<runId>/, and keep model_calls.jsonl empty unless the user separately asks for LLM review. signal-analysis also writes .geotech/runs/<runId>/signals/index.json plus per-source .analysis.json outputs for detected monitoring files; the signal smoke/benchmark script verifies this contract against a synthetic fixture. Terzaghi single-agent mode and optional role-based swarm mode remain available for custom prompted reasoning and share the same under-specified hosted-beta intake screen, first-turn hosted-beta fallback behavior, and case-file deliverable tool bootstrap for report and export follow-on workflows. Swarm mode prepares WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer ownership before specialist prompts run; skill tools are not advertised unless --skills is enabled, reviewer tool context is retained, and rejected reviews remain unresolved rather than approved-with-notes.`,
  },
  {
    id: 'export',
    title: 'geotech export',
    content: `Export results to external formats.

\`\`\`bash
# GeoJSON (for GIS)
geotech export geojson --input samples/exports/mock-boreholes.json --output boreholes.geojson

# AutoCAD DXF
geotech export dxf --input samples/exports/mock-boreholes.json --output profile.dxf

# CSV spreadsheet
geotech export csv --input samples/exports/mock-liquefaction.json --output data.csv
\`\`\``,
  },
  {
    id: 'viz',
    title: 'geotech viz',
    content: `Interactive browser visualization for saved JSON, GroundModel maps, SPT-depth charts, lab-depth charts, groundwater plots, CSV, and Excel data.

\`\`\`bash
# Inspect available series first
geotech viz samples/visualization/geotech-viz-showcase.xlsx --list

# Open the default interactive viewer
geotech viz samples/visualization/geotech-viz-showcase.csv

# Plot saved JSON analysis data
geotech viz result.json

# Plot GroundModel map, SPT, lab, and groundwater charts from analyze JSON
geotech analyze . --json --output workspace.json
geotech viz workspace.json --list
geotech viz workspace.json --save-html ground-model-review.html --no-open

# Common engineering presets
geotech viz --preset mohr-circle --sigma1 250 --sigma3 90 --cohesion 15 --phi 28
geotech viz --preset atterberg --ll 55 --pl 25

# Common engineering file templates
geotech viz samples/visualization/geotech-viz-compaction.csv --template compaction
geotech viz samples/visualization/geotech-viz-gradation.csv --template gradation
geotech viz samples/visualization/geotech-viz-cpt.csv --template cpt
geotech viz samples/visualization/geotech-viz-showcase.csv --save-html review.html --no-open

# Force terminal fallback if you do not want a browser window
GEOTECHCLI_PLOT_MODE=ascii geotech viz samples/visualization/geotech-viz-showcase.csv

# Use command-level plotting where supported
geotech classify uscs --gravel 5 --sand 20 --fines 75 --ll 55 --pl 25 --plot
geotech liquefaction --pga 0.25 --magnitude 7.5 --demo --plot
geotech settlement trough --volume-loss 1.5 --depth 18 --diameter 6.5 --plot
\`\`\`

This command is meant for quick engineering review in an interactive browser workspace before exporting or reporting. Set \`GEOTECHCLI_PLOT_MODE=ascii\` to keep the older terminal-only workflow.`,
  },
  {
    id: 'global-flags',
    title: 'Global Flags',
    content: `Most calculation and analysis commands support these flags:

${globalFlagsTable}`,
  },
];

function renderMarkdown(md: string) {
  // Minimal markdown-to-HTML for code blocks, tables, and inline code
  let html = md
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 my-4 overflow-x-auto font-[var(--font-mono)] text-[13px] leading-[1.8] text-[var(--text-secondary)]">${code.replace(/</g, '&lt;')}</pre>`
    )
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--bg-card)] px-1.5 py-0.5 rounded text-[var(--accent-teal)] font-[var(--font-mono)] text-[12px]">$1</code>')
    .replace(/\n\n/g, '</p><p class="text-[var(--text-secondary)] text-[14px] leading-[1.7] mb-4">')
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (_m, header, body) => {
      const ths = header.split('|').filter(Boolean).map((h: string) => `<th class="px-3 py-2 text-left text-xs font-semibold text-[var(--text-primary)] border-b border-[var(--border-color)]">${h.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map((row: string) => {
        const tds = row.split('|').filter(Boolean).map((d: string) => `<td class="px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--border-color)] font-[var(--font-mono)]">${d.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table class="w-full my-4 border border-[var(--border-color)] rounded-lg overflow-hidden"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

  return `<p class="text-[var(--text-secondary)] text-[14px] leading-[1.7] mb-4">${html}</p>`;
}

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 px-12 pb-16 max-w-[900px]">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Strong Beta Docs</h1>
        <p className="text-[var(--text-secondary)] text-base mb-12">
          Strong beta reference for geotechCLI commands, hosted multimodal GLM defaults, and optional advanced provider overrides.
        </p>

        {/* Table of contents */}
        <nav className="mb-16 p-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl">
          <h2 className="text-sm font-semibold mb-4 text-[var(--text-muted)] uppercase tracking-wider">Contents</h2>
          <div className="grid grid-cols-3 gap-2">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-[13px] text-[var(--accent-teal)] hover:text-[var(--text-primary)] transition font-[var(--font-mono)]">
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Sections */}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mb-16 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight mb-6 pb-3 border-b border-[var(--border-color)]">
              {s.title}
            </h2>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(s.content) }} />
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}

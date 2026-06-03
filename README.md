<div align="center">

# geotechCLI

**Strong beta CLI for geotechnical engineering.**

[Website](https://beta.geotechcli.com) | [Documentation](https://beta.geotechcli.com/docs) | [Changelog](https://beta.geotechcli.com/changelog) | [Beta](https://beta.geotechcli.com/pricing)

</div>

---

> **PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**
>
> Copyright (c) 2026 geotechCLI. This software is proprietary and confidential.
> No part of this software may be reproduced, distributed, or transmitted in any
> form or by any means without the prior written permission of the owner.
> See [LICENSE](./LICENSE) for full terms.

---

## What is geotechCLI?

geotechCLI is a terminal-first geotechnical engineering product that combines deterministic analysis, AI-assisted interpretation, vision workflows, agentic reasoning, and export utilities in one CLI.

## Strong Beta Status

- Deterministic commands are available now.
- Hosted GLM beta access is available now with no user API key required.
- Text/agent reasoning defaults to `glm-5.1`; vision defaults to `glm-5v-turbo`; PDF/table layout extraction uses hosted `glm-ocr` through Z.ai.
- Server-side rate limits protect the hosted beta credit pool, with higher installed-CLI limits for development runs and stricter anonymous caps.
- Local page evidence caching reuses unchanged PDF page extraction results across reruns to reduce repeated OCR/vision calls and improve audit traceability.
- Signup, billing, and paid entitlements are intentionally disabled on `strong-beta`.

## Install

```bash
# Install Node.js LTS first, then verify the toolchain
node -v
npm -v

# Install geotechCLI
npm install -g geotechcli
```

Use the official Node.js installer or a trusted OS package manager. For strong beta, the safest install path is still Node.js LTS plus `npm install -g geotechcli`.

## Quick Start

```bash
# Confirm the hosted beta path is active
geotech status

# Local project manifest, GroundModel, and verifier
geotech analyze .
geotech analyze . --format html --no-open
geotech analyze . --json --output workspace.json
geotech viz workspace.json --save-html ground-model-review.html --no-open

# Experimental deterministic 3D FEM/WebGL preview
geotech fem draft foundation-settlement --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem draft foundation-settlement --workspace ./site-data --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem run analysis_case.json --experimental --reviewed --save-html fem-run.html --no-open
geotech fem demo raft --experimental --save-html raft-fem.html --no-open
geotech fem demo excavation --experimental --save-html excavation-fem.html --no-open
geotech fem demo tunnel --experimental --save-html tunnel-fem.html --no-open
geotech fem demo consolidation --experimental --save-html consolidation-fem.html --no-open

# Bearing capacity (Meyerhof)
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5

# Liquefaction triggering (Boulanger and Idriss 2014)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# RMR89 classification
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# AI: classify RMR from a tunnel face photo
geotech vision rmr tunnel-face.jpg

# AI: ingest a geotechnical report and open an HTML report
geotech ingest Geotechnical-Report.pdf --type geotech-document --format html --output geotechnical-report.html

# Bundled strong-beta skills
geotech skill list
geotech skill show shallow-foundation-option-screening

# AI: Terzaghi agent analysis with project-aware workspace context by default
geotech agent "evaluate foundation options for a 12-story building on soft clay"

# AI: project-aware discovery from the current folder, no model call
geotech agent --plan-only
geotech agent .

# AI: run a selected project-aware workflow deterministically from workspace evidence
geotech agent --task risk-analysis --workspace .

# AI: route a prompted project workflow through deterministic tools first
geotech agent "find anomalies and create visualizations" --workspace .

# AI: disable workspace discovery for a generic one-off prompt
geotech agent "explain Terzaghi bearing factors" --no-workspace

# AI: role-based swarm planning over workspace evidence and review gates
geotech agent "review bearing, settlement, and slope risks for this site" --workspace . --skills --swarm

# AI: explicitly enable installed skills for this session
geotech agent "screen shallow foundation options for this site" --skills

# Export to AutoCAD DXF
geotech export dxf --input boreholes.json --output profile.dxf
```

## Workspace Analysis

`geotech analyze` is the deterministic local project analyst surface. It scans a project folder, classifies geotechnical files, samples CSV/XLSX schemas, detects likely branches such as foundation, mapping, monitoring, and signal processing, and builds an evidence-bound `GroundModel` with visual review, verifier findings, and calculation-readiness routing without spending hosted-beta GPU time.

```bash
geotech analyze .
geotech analyze . --json
geotech analyze . --format html
geotech analyze . --branch foundation
geotech analyze . --standard eurocode7
geotech analyze . --standard eurocode7 --draft-inputs --json
```

Current strong-beta scope: workspace awareness, context-aware CSV/XLSX schema inference for common borehole IDs and groundwater-depth tables, AGS/PDF/image/GIS/CAD classification, evidence references, canonical GroundModel construction, GroundModel coordinate maps with CRS/local-grid warnings, compact borehole strip logs, SPT-depth plots, lab-parameter depth charts, groundwater/monitoring summaries, standards-profile assumptions and validation blockers for Eurocode 7/AASHTO/IS/BS/ASTM, deterministic verifier findings, calculation readiness for bearing, settlement, evidence-prefilled experimental FEM foundation/excavation/tunnel drafts, report/GroundModel-derived FEM draft candidates, reviewed FEM draft-to-run acceptance, pile, liquefaction, and slope workflows, optional non-executing calculation input drafts with source locations, source pages, evidence-derived confidence, review gates, recommendations, and a self-contained HTML report. It does not yet auto-run branch-specific design calculations from the folder; it tells you which calculation route is ready, blocked, or needs explicit assumptions.

Standards-profile guardrail: Eurocode 7, AASHTO, IS, BS, and ASTM profiles are deterministic readiness validators only. The acceptance fixture requires stable blocker codes, required assumptions, safety-factor context, and source-reference anchors, and fails closed if standards output starts carrying run commands, solver/FEM metadata, calculation/design result payloads, raw prompts/responses/source-evidence/model payload keys, private paths, token-shaped values, or source IDs outside the embedded standards database.

Calculation-draft guardrail: opt-in GroundModel drafts for bearing, settlement, pile, liquefaction, and slope remain input-preparation artifacts. The acceptance fixture requires missing-user-input review gates, evidence IDs, source references, source pages where available, and workflow-trust confidence, and fails closed if a draft becomes auto-ready or starts carrying FEM/run/case-output execution payloads, result manifests, raw prompts/responses/source-evidence/model payload keys, private paths, or token-shaped values.

## Experimental FEM Preview

`geotech fem draft` prepares editable, review-gated FEM `analysis_case.json` inputs from explicit user values and optional workspace GroundModel evidence without running a solver. Workspace and report-derived GroundModel evidence can carry material stiffness, unit weight, groundwater assumptions, readiness scores, and evidence references into supported draft candidates; geometry, loads, staging, mesh intent, volume-loss/consolidation assumptions, and engineering approval still require explicit user review. Ingest HTML reports surface these candidates in a FEM draft routing table, but they remain draft-only. `geotech fem run <analysis_case.json> --experimental --reviewed` accepts a reviewed draft case and dispatches it through the deterministic built-in preview backend, exporting the same manifest and WebGL artifact path without exposing solver execution to LLM agents. `geotech fem demo raft`, `geotech fem demo excavation`, `geotech fem demo tunnel`, and `geotech fem demo consolidation` are opt-in experimental WebGL previews for the future finite-element workflow. They build deterministic analysis cases in core, validate assumptions and result arrays, then export self-contained WebGL artifacts that can be inspected without a hosted model call.

```bash
geotech fem demo raft --experimental
geotech fem demo raft --experimental --save-html raft-fem.html --no-open
geotech fem demo raft --experimental --output raft-fem.manifest.json --json
geotech fem draft foundation-settlement --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem draft foundation-settlement --workspace ./site-data --raft-length 10 --raft-width 8 --pressure 150 --case-output analysis_case.json
geotech fem run analysis_case.json --experimental --reviewed --save-html fem-run.html --output fem-run.manifest.json --no-open
geotech fem draft excavation-deformation --excavation-length 22 --excavation-width 14 --excavation-depth 9 --stage-depths 3,6,9 --support-levels 0,2,5 --json
geotech fem demo excavation --experimental
geotech fem demo excavation --experimental --save-html excavation-fem.html --no-open
geotech fem demo excavation --experimental --output excavation-fem.manifest.json --json
geotech fem draft tunnel-volume-loss-settlement --tunnel-diameter 6 --tunnel-depth 18 --tunnel-length 60 --volume-loss 1.2 --trough-width 0.5 --json
geotech fem demo tunnel --experimental
geotech fem demo tunnel --experimental --save-html tunnel-fem.html --no-open
geotech fem demo tunnel --experimental --output tunnel-fem.manifest.json --json
geotech fem draft staged-settlement-consolidation --layer-thickness 10 --surface-area 200 --stage-loads 45,35,20 --stage-durations 0.5,1,2 --drainage double --constrained-modulus 8000 --cv 0.8 --friction-angle 28 --cohesion 12 --json
geotech fem demo consolidation --experimental
geotech fem demo consolidation --experimental --save-html consolidation-fem.html --no-open
geotech fem demo consolidation --experimental --output consolidation-fem.manifest.json --json
geotech fem agent "which FEM route fits a braced excavation beside an existing building?"
geotech fem agent "draft a staged excavation FEM case" --objective excavation-deformation --json
geotech fem agent "review FEM readiness for this site" --workspace ./site-data --objective foundation-settlement
geotech fem agent "is FEM production-grade for nonlinear plasticity, consolidation, seepage, and support design?" --json
```

Current executable preview scope: foundation-settlement, staged-excavation deformation, tunnel volume-loss settlement, and staged settlement/consolidation drafts/demos, explicit draft inputs, reviewed case-file execution through `geotech fem run --experimental --reviewed`, workspace evidence prefill for material and groundwater assumptions, fixed built-in demo geometry, deterministic result manifests, and WebGL/Canvas visualization. Shaft deformation, pile-group interaction, slope/embankment deformation, retaining-wall/excavation-support, and seepage/groundwater coupling are contract-only draft routes: they expose required evidence, missing inputs, blocker codes, and safe draft commands, but they do not create `analysis_case.json`, run solvers, render WebGL, claim results, or persist raw prompt/response/source-evidence/model payload keys. Local absolute evidence source paths are reduced before candidate exposure. The draft command emits editable analysis cases only for implemented preview routes; the run command executes a reviewed `analysis_case.json` only after explicit `--reviewed` acknowledgement; the demo commands execute only the built-in experimental examples. Raft and excavation previews use deterministic elastic screening fields; the tunnel preview uses an empirical Gaussian settlement trough from prescribed volume loss and trough-width factor; the consolidation preview uses a 1D Terzaghi staged time-stepper with Mohr-Coulomb material-point strength gates. The excavation and consolidation previews add staged field controls. FEM manifests also include optional `resultFields`, `steps`, and `datasets` metadata so future planned routes can share the same validation and viewer contract once deterministic backends exist. These commands are not production FEM solvers, wall-design checks, tunnel lining checks, face-stability checks, basal-heave checks, seepage analyses, full 2D/3D coupled consolidation analyses, or design calculations; they exist to validate the agentic contract, result schema, reviewer warnings, and browser artifact path before report-ingested GroundModel routing is expanded.

Production-readiness assessment is deterministic and currently reports `productionReady: false` for nonlinear/plasticity, consolidation, seepage/pore-pressure coupling, advanced staged construction, support design, real project workspace-to-run acceptance, independent benchmark validation, and licensed-review workflow until those solver and evidence gates are implemented.

Agents and swarm runs now see FEM through deterministic routing tools, not prompt-only instructions. `geotech fem agent` is a narrower LLM brain for FEM planning: it may only list FEM capabilities, assess FEM production-readiness blockers, prepare review-gated case drafts, and validate FEM cases. Production-grade, nonlinear, consolidation, seepage, pore-pressure, support-design, benchmark, or real-project workspace-to-run requests must use the production-readiness assessment before final answer. With `--workspace`, it receives FEM-only GroundModel readiness context and the same evidence-prefill contract as `geotech fem draft` for supported workspace draft routes. It cannot run solvers, write WebGL artifacts, invoke `geotech fem run`, or invent FEM displacement/reaction values. In general swarm mode, simulation-stage FEM/calculation tool outputs are threaded into reviewer prompts as deterministic tool context so RiskReviewer validation does not depend on a model restating every case detail in prose. Blocked or review-required FEM validation remains unresolved until human review; malformed, contradictory, or contaminated reviewer JSON fails closed; and generic artifact tools block invented FEM result manifests, solver outputs, WebGL claims, or fabricated FEM analysis files.

Internal benchmarks enforce the same boundary. `npm run smoke:fem:draft-run` checks reviewed-run gating, contract-only route refusal, reference balances, and mock-dataset trends. `npm run smoke:geotech-report-benchmark` and corpus acceptance fail if planned contract-only routes expose case-output creation, run command templates, agent solver/WebGL/result-manifest actions, raw payload/result keys, private paths/tokens, or lose blocked-until requirements, disallowed agent actions, route-specific review gates, or boundary blocked reasons. These checks are guardrails for future production candidates, not a claim that planned FEM routes are production solvers.

## Project-Aware Agent Harness

`geotech agent --plan-only` is the low-cost project-aware entry point. It resolves the workspace boundary from `--workspace`, an existing `.geotech/project.json`, the nearest git root, or the current directory, then scans the selected workspace with the deterministic analyzer. It writes `.geotech/project.json`, `.geotech/manifest.json`, `.geotech/evidence/file_index.jsonl`, `.geotech/evidence/evidence_index.jsonl`, `.geotech/context/readiness.json`, `.geotech/context/project_summary.md`, `.geotech/context/memory.json`, and per-run intent/plan/trace/tool-call/model-call artifacts before any LLM call is made.

```bash
cd ./my-geotech-project
geotech agent --plan-only
geotech agent .
geotech agent "find anomalies and create visualizations"
geotech agent "decide the best project workflow" --route-with-model
geotech agent --task data-quality --workspace .
geotech agent --task ground-model --workspace .
geotech agent --task calculation-readiness --workspace .
geotech agent --task risk-analysis --workspace .
geotech agent --task anomaly-detection --workspace .
geotech agent --task recommendations --workspace .
geotech agent --task signal-analysis --workspace .
geotech agent --task visualization --workspace .
```

No-prompt `geotech agent` and `geotech agent .` enter the same discovery-first mode and print the next workflow choices instead of behaving like generic chat. Prompted usage now also builds the project context by default unless `--no-workspace` is supplied. Recognized project workflow prompts are routed through the provider-neutral workflow router first, so requests like "find anomalies and create visualizations" execute confidence-gated deterministic `anomaly-detection` and `visualization` workflows, while requests like "can we run a bearing calculation?" route to deterministic `calculation-readiness` over GroundModel verifier evidence and requests about piezometers, inclinometers, vibration, settlement monitoring, load tests, thresholds, or time-series data route to deterministic `signal-analysis`. These runs write `workflow_route.json`, child workflow outputs, and `workflow_route_report.md`, and keep `model_calls.jsonl` empty. Ambiguous prompts can opt into `--route-with-model`: the configured hosted/BYOK model may propose strict JSON workflow tasks, but GeotechCLI validates the proposal, rejects unknown tasks, writes proposal provenance to `workflow_route.json`, and records the router call in `model_calls.jsonl` only when that opt-in path is used. Custom project questions, low-confidence routes, rejected proposals, and failed proposals still fall back to the workspace-backed LLM agent with the same manifest, readiness, evidence index, and GroundModel/verifier summary instead of guessing from raw files. Use `--max-files` and `--max-depth` to bound discovery. Explicit `--task data-quality|ground-model|calculation-readiness|risk-analysis|anomaly-detection|recommendations|signal-analysis|visualization` runs execute a deterministic provider-neutral workflow first, write `workflow_result.json`, `workflow_report.md`, and `workflow_trace.json` under `.geotech/runs/<runId>/`, and keep `model_calls.jsonl` empty unless the user separately asks for LLM review. `signal-analysis` also persists deterministic signal JSON artifacts and an index under `.geotech/runs/<runId>/signals/` for detected monitoring, settlement, piezometer, inclinometer, vibration, and load-test files.

## Interactive Visualization

Use `geotech viz` to open browser-grade interactive engineering plots from saved analysis data, including GroundModel coordinate maps, SPT-depth charts, lab-depth charts, and groundwater plots, with terminal ASCII fallback available when needed.

```bash
geotech viz samples/visualization/geotech-viz-showcase.csv
geotech viz samples/visualization/geotech-viz-showcase.xlsx --list
geotech viz result.json
geotech analyze . --json --output workspace.json
geotech viz workspace.json --list
geotech viz workspace.json --save-html ground-model-review.html --no-open
geotech viz --preset mohr-circle --sigma1 250 --sigma3 90 --cohesion 15 --phi 28
geotech viz --preset atterberg --ll 55 --pl 25
geotech viz samples/visualization/geotech-viz-compaction.csv --template compaction
geotech viz samples/visualization/geotech-viz-gradation.csv --template gradation
geotech viz samples/visualization/geotech-viz-showcase.csv --save-html review.html --no-open
```

Set `GEOTECHCLI_PLOT_MODE=ascii` if you want to force terminal charts instead of opening the browser viewer.

Showcase files are committed in:

- `samples/visualization/geotech-viz-showcase.csv`
- `samples/visualization/geotech-viz-showcase.xlsx`
- `samples/visualization/geotech-viz-compaction.csv`
- `samples/visualization/geotech-viz-gradation.csv`
- `samples/visualization/geotech-viz-cpt.csv`

Common daily-use chart shortcuts now include:

- `geotech classify uscs --gravel 5 --sand 20 --fines 75 --ll 55 --pl 25 --plot`
- `geotech liquefaction --pga 0.25 --magnitude 7.5 --demo --plot`
- `geotech pile --diameter 0.8 --length 12 --su 45 --plot`
- `geotech settlement trough --volume-loss 1.5 --depth 18 --diameter 6.5 --plot`

Any `--plot`-capable command can also use `--save-html <file>` and `--no-open` to export the browser viewer without launching it.

## Commands

### Deterministic

These commands are the public strong-beta foundation and are available now.

| Command | Description |
|---------|-------------|
| `geotech bearing` | Bearing capacity using Terzaghi, Meyerhof, Hansen, and Vesic |
| `geotech liquefaction` | Seismic liquefaction using Boulanger and Idriss 2014 and NCEER |
| `geotech classify rmr` | Rock Mass Rating using Bieniawski 1989 |
| `geotech classify uscs` | USCS soil classification using ASTM D2487 |
| `geotech classify q-system` | Q-system using Barton et al. |
| `geotech tunnel tbm-predict` | TBM penetration rate, thrust, torque, and cutter life |
| `geotech tunnel tbm-select` | TBM type recommendation |
| `geotech tunnel cutter-wear` | Cutter wear prediction with cost estimate |
| `geotech slope` | Slope stability using Bishop Simplified |
| `geotech pile` | Pile capacity using alpha, beta, and SPT methods |
| `geotech retaining` | Lateral earth pressure using Rankine and Coulomb |
| `geotech analyze` | Local project manifest, CSV/XLSX schema inference, evidence-bound GroundModel, map, strip logs, verifier, and HTML report |
| `geotech fem draft` | Deterministic review-gated FEM analysis-case drafting without solver execution |
| `geotech fem run` | Human-invoked experimental execution of a reviewed FEM `analysis_case.json` through deterministic preview backends; requires `--experimental --reviewed` |
| `geotech fem demo raft` | Experimental deterministic 3D FEM/WebGL raft settlement preview |
| `geotech fem demo excavation` | Experimental deterministic staged excavation deformation WebGL preview |
| `geotech fem demo tunnel` | Experimental deterministic tunnel volume-loss settlement WebGL preview |
| `geotech fem demo consolidation` | Experimental deterministic 1D staged settlement consolidation WebGL preview |
| `geotech fem agent` | Scoped LLM FEM planning brain for route selection, case drafts, and validation only |
| `geotech viz` | Interactive browser visualization for saved JSON, GroundModel maps, SPT/lab/GWL charts, CSV, and Excel data |
| `geotech signal analyze` | Deterministic monitoring/time-series analysis for settlement, piezometer, inclinometer, vibration, and load-test CSV/TSV/XLSX files |

### AI-Assisted

These commands now use the hosted beta GLM path by default.

| Command | Description |
|---------|-------------|
| `geotech vision corebox` | Core box image analysis for RQD, fracture spacing, and weathering |
| `geotech vision rmr` | Vision-assisted RMR workflow |
| `geotech vision sensor` | Sensor and chart image interpretation |
| `geotech vision log` | Borehole log extraction from images or multi-page PDFs |
| `geotech ingest` | Geotechnical PDF/image ingest for borehole logs and broader report intelligence, with live PDF progress and optional browser HTML report or benchmark output |
| `geotech ai-classify` | Natural language soil description to USCS and properties |
| `geotech gbr chat` | GBR document question answering |
| `geotech agent` | Project-aware discovery with `--plan-only`, deterministic provider-neutral `--task` workflows, Terzaghi single-agent reasoning for prompted tasks, optional evidence-bound `--workspace`, role-based `--swarm`, skills, and project memory |
| `geotech chat` | Interactive AI session with optional project memory |
| `geotech report` | AI-generated geotechnical report drafting |

Installed strong-beta skills are available directly through `geotech skill ...`. Agent and chat sessions can opt into skill tools explicitly with `--skills` while the default strong-beta agent path stays unchanged.

Strong-beta reliability note: Terzaghi single-agent mode and optional role-based swarm mode share the same under-specified hosted-beta intake screen, the same first-turn hosted-beta fallback behavior, and the same case-file deliverable tool bootstrap for report and export follow-on workflows. Swarm mode now prepares a deterministic WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, and ReportEngineer plan over workspace evidence, standards readiness, calculation input drafts, approved executable skills, and blocked review gates before specialist prompts run. Skill tools are not advertised in role plans unless `--skills` is enabled, reviewer tool context is retained in the final session context, and rejected review cycles remain `UNRESOLVED - REVIEW REJECTED` rather than approved-with-notes.

## Geotechnical Document Ingest

`geotech ingest` is the strong-beta path for extracting structured engineering content from geotechnical PDFs and images. It supports both focused borehole-log extraction and broader report intelligence for geology, lithology, and engineering parameters.

```bash
# Borehole-log extraction from an image or PDF packet
geotech ingest borehole-log.pdf --type borehole-log

# Broader report intelligence from a geotechnical report.
# Long PDFs show live progress by default; use --background to detach.
geotech ingest Geotechnical-Report.pdf --type geotech-document

# Export and open the self-contained HTML report for review and sharing.
# Add --no-open to save the file without launching a browser.
geotech ingest Geotechnical-Report.pdf --type geotech-document --format html --output geotechnical-report.html

# Large hosted-beta reports automatically switch to segmented resumable async ingest jobs
geotech ingest Geotechnical-Report.pdf --type geotech-document
geotech ingest wait <jobId> --format html --output geotechnical-report.html
geotech ingest result <jobId> --format html --output geotechnical-report.html

# Write a benchmark JSON for first-run vs cached-rerun comparisons
geotech ingest result <jobId> --format benchmark --output geotechnical-report.benchmark.json

# Optional local two-pass benchmark against the canonical development PDF
# Set GEOTECHCLI_BENCHMARK_PDF when the report lives outside the default path.
npm run benchmark:geotech-report

# Internal fixture-category corpus benchmark for provider/preprocessing guardrails
npm run benchmark:geotech-corpus

# Optional real local fixture mode; missing env-backed fixtures are skipped unless --required is used.
GEOTECHCLI_BENCHMARK_BOREHOLE_PDF=/path/to/borehole.pdf npm run benchmark:geotech-corpus -- --real-fixtures
GEOTECHCLI_BENCHMARK_MIXED_DIGITAL_SCANNED_PDF=/path/to/mixed-digital-scanned.pdf npm run benchmark:geotech-corpus -- --real-fixtures

# Synthetic monitoring benchmark for deterministic signal-analysis artifacts and threshold profiles
npm run benchmark:signal-analysis

# Review a focused range without processing the whole report
geotech ingest Geotechnical-Report.pdf --type geotech-document --page-range 61:102

# Persist a project-backed ingest, then reopen the latest stored review later
geotech ingest Geotechnical-Report.pdf --type geotech-document --project demo-project
geotech ingest review demo-project --dataset ingest-review:latest --format html --output review-report.html
```

The HTML report is a self-contained Geotechnical Intelligence Report with:

- executive facts, Review confidence metrics, review actions, and sticky navigation
- a provider-neutral Trust breakdown for extraction quality, page evidence, source traceability, cross-method corroboration, engineering completeness, readiness, missing critical data, and retained review gates
- engineering insight cards for ground conditions, design implications, missing critical data, and verification focus
- an evidence-first trust table for retained and missing parameters with source page, confidence, review posture, and evidence snippets
- extracted materials, classifications, grouped engineering parameters, and normalized section map
- a lightweight borehole stratigraphy visualization when borehole/layer evidence is available
- a GroundModel Visual Review with compact strip logs, SPT-depth plots, lab-parameter depth charts, and groundwater summaries when PDF evidence supports them
- source evidence cards for page-level review
- collapsed Processing Audit details for page audit matrices, local evidence cache status, operational warnings, and native text, GLM-OCR, GLM-5V, and GLM-5.1 synthesis stage badges
- stored-review and approval context when the ingest is project-backed

Hosted-beta reliability note: geotechnical PDFs above the best-result window are now split into linked sequential packets automatically, and the final result plus HTML report merge those packets back into one review surface.
Benchmark note: `--format benchmark` emits a compact JSON harness for geotechnical reports with cache hit rate, estimated hosted calls, direct and audit-backed source-page traceability, retained signal counts, confidence breakdown, provider capability profile, preprocessing mode, deskew and quality scores, preprocessing/region coverage, page latency, and ground-model readiness gates so OCR/vision changes can be compared against the same PDF instead of judged manually. `npm run benchmark:geotech-report` runs the local two-pass harness against `GeotechnicalInvestigationReport (1).pdf` when that file is available, writes first-run/cached-rerun benchmark JSON, and fails if cache reuse, source-page traceability, or GroundModel readiness falls below the current acceptance floor. Use `--preprocessing-mode none|ocr-optimized|region-v2`, or `--first-preprocessing-mode` and `--second-preprocessing-mode`, to compare preprocessing modes while keeping the same benchmark contract. `region-v2` adds fine-pass deskew metadata, higher-resolution normalized page assets, smarter table and borehole/log strip crops, region quality scoring, and region-first OCR before full-page vision OCR. `npm run benchmark:preprocessing` is the no-model preprocessing fixture benchmark for borehole/table, CPT, lab, mixed scanned, mixed digital/scanned, and malformed scanned PDFs; it compares `none`, `ocr-optimized`, and `region-v2` through latency, quality, crop assets, region counts, region quality, all mode-pair deltas, path/secret safety metadata, report/trend contract validation, history JSON, trend JSON, and a trend HTML dashboard before those fixture classes are promoted into hosted ingest benchmarks. `npm run benchmark:geotech-corpus` is an internal R&D wrapper around that same per-document benchmark contract: it aggregates small in-repo fixtures for full reports, borehole logs, CPT tables, lab tables, mixed scanned PDFs, mixed digital/scanned PDFs, malformed scanned PDFs, provider profiles, preprocessing modes, traceability, cache reuse, GroundModel readiness, and FEM execution-boundary guardrails into JSON plus HTML/SVG summaries, then writes core-validated summary-only `corpus-history.json`, `corpus-trend.json`, and `corpus-trend.html` artifacts without raw benchmark JSON, report text, model IDs, private paths, or tokens. The corpus includes a committed image-only borehole/table PDF fixture that gates `region-v2` on nonzero rendered PDF regions, persisted crop assets, region quality, cache reuse, and same-or-better traceability versus `none` and `ocr-optimized`. Add `--real-fixtures` to run two-pass ingest against private local fixture files supplied by `GEOTECHCLI_BENCHMARK_PDF`, `GEOTECHCLI_BENCHMARK_BOREHOLE_PDF`, `GEOTECHCLI_BENCHMARK_CPT_PDF`, `GEOTECHCLI_BENCHMARK_LAB_PDF`, `GEOTECHCLI_BENCHMARK_MIXED_SCANNED_PDF`, `GEOTECHCLI_BENCHMARK_MIXED_DIGITAL_SCANNED_PDF`, and `GEOTECHCLI_BENCHMARK_MALFORMED_SCANNED_PDF`; missing fixtures are skipped by default and fail only with `--required`, and generated benchmark JSON redacts absolute source paths. Corpus reports also include a path-safety block and fail acceptance when fixture or benchmark inputs contain local absolute paths or API-token-shaped values; findings are redacted before persistence. The corpus provider matrix separates hosted-beta, OpenAI-compatible BYOK, OpenRouter/free, and local/HF-compatible profiles so text-only or free providers are scored against preprocessed OCR/page evidence instead of being treated as image or native-PDF readers. `npm run benchmark:signal-analysis` creates a synthetic monitoring workspace for settlement, piezometer, inclinometer, vibration, and load-test files, runs `geotech agent --task signal-analysis`, verifies persisted signal artifacts and zero model calls, runs a direct `--threshold-profile auto` signal check with deterministic HTML plot export, contract-validates comparison/trend artifacts for instrument coverage, direct threshold-profile metrics, plot payload shape, and path/secret safety, and writes comparison JSON with `contractValidation`, the direct signal HTML plot, signal history JSON, signal trend JSON, a small trend HTML dashboard, and an SVG summary. The evidence model is provider-neutral: hosted GLM is the strong-beta default, but BYOK providers should be judged against the same PDF/page evidence, cache, traceability, and readiness contract. Confidence is treated as workflow trust, not model self-score, and synthesis alone does not raise it.
Cost-control note: hosted-beta PDF ingest now tries GLM-OCR layout parsing before vision OCR, routes image-only pages into GLM-5V visual extraction only when layout/text is insufficient, preprocesses image evidence with margin trimming, projection-profile deskew, normalized page/crop assets, smarter log/table crop candidates, and region quality scoring, caches compact page evidence locally by file/page/model/preprocessing/schema hash, and marks direct visual pages for human review as `vision-visual`.

## Signal Analysis

`geotech signal analyze` is the deterministic V0 path for monitoring and time-series files. It does not call an LLM; it parses CSV/TSV/XLSX data, infers or accepts timestamp/depth/value/instrument/location columns, and emits trend summaries, optional threshold flags, missing interval detection, rate-of-change metrics, and chart-ready series. Threshold flags can come from project-specific `--threshold` / `--rate-threshold` values or from opt-in generic review profiles with `--threshold-profile auto|settlement-review-mm|piezometer-review-kpa|inclinometer-review-mm|vibration-ppv-review-mm-s|load-test-review-kn`. Generic profiles are internal R&D review triggers and remain gated until replaced or confirmed against project-specific trigger levels, units, baselines, and instrument conventions. Agent and swarm runs can consume the same deterministic summary through the sandboxed `analyze_signal_file` interpretation tool; LLMs may plan and review from the summary but cannot invent signal metrics. Project-aware `geotech agent --task signal-analysis --workspace .` runs the same deterministic analyzer for detected signal files and stores JSON artifacts in `.geotech/runs/<runId>/signals/`. Use `npm run smoke:signal-analysis` or `npm run benchmark:signal-analysis` after `npm run build` to verify the local synthetic fixture, all five instrument classes, artifact index, per-source analyses, threshold-profile metrics, path-safe comparison/history/trend artifacts, trend HTML output, tool-call trace, and empty `model_calls.jsonl`.

Signal-analysis guardrail: deterministic signal outputs are contract-checked across settlement, piezometer, inclinometer, vibration, and load-test fixtures. The contract requires trend summaries, rate metrics, chart-ready series, threshold-profile review gates, sanitized source labels, and no model/LLM metadata, private local paths, API keys, or token-shaped values. The signal benchmark comparison and trend JSON are also contract-checked so synthetic coverage, zero model calls, direct settlement threshold-profile metrics, direct HTML plot payloads, and path-safe history stay measurable.

```bash
# JSON is the default output for automation
geotech signal analyze monitoring.csv

# Settlement monitoring with a daily expected interval
geotech signal analyze settlement.csv --type settlement --expected-interval-hours 24

# Generic internal review profile selected by signal type
geotech signal analyze settlement.csv --type settlement --threshold-profile auto

# Excel workbook with explicit sheet and column names
geotech signal analyze readings.xlsx --sheet Daily --timestamp date --value settlement_mm

# Optional project-specific threshold flags
geotech signal analyze piezometer.tsv --type piezometer --threshold 50 --rate-threshold 5

# Interactive HTML signal plot without opening a browser
geotech signal analyze settlement.csv --save-html settlement-signal.html --no-open

# Human-readable terminal summary
geotech signal analyze inclinometer.csv --format text
```

### Bundled Skills

Strong beta currently ships a bundled skill catalog and bootstraps it on first use.

| Command | Description |
|---------|-------------|
| `geotech skill list` | Show the installed bundled skill catalog |
| `geotech skill show <name>` | Inspect one installed skill and its approval state |
| `geotech skill validate <target>` | Validate an installed skill name or a local bundle before import |
| `geotech skill run <name> --input-dir <dir>` | Run one approved deterministic skill against a prepared input directory |
| `geotech agent "..." --skills` | Let a single agent session discover and call approved installed skills |
| `geotech chat --skills` | Start an interactive AI session with skill tools enabled for that session |

Current bundled strong-beta catalog: 49 skills total, including 48 approved executable skills and 1 prompt-only reviewer skill.

### Export and Integration

| Command | Description |
|---------|-------------|
| `geotech export geojson` | Export to GeoJSON |
| `geotech export dxf` | Export to AutoCAD DXF |
| `geotech export csv` | Export to CSV |

Sample export fixtures are committed under `samples/exports/`:

- `samples/exports/mock-boreholes.json`
- `samples/exports/mock-liquefaction.json`

Example export smoke checks:

```bash
geotech export geojson --input samples/exports/mock-boreholes.json --output boreholes.geojson
geotech export dxf --input samples/exports/mock-boreholes.json --output profile.dxf
geotech export csv --input samples/exports/mock-liquefaction.json --output data.csv
```

## Global Flags

Most calculation and analysis commands support:

| Flag | Description |
|------|-------------|
| `--json` | Raw JSON output for scripting and automation |
| `--plot` | Open an interactive engineering plot viewer with terminal fallback |
| `--save-html <file>` | Write the interactive plot viewer to a specific HTML file |
| `--no-open` | Generate interactive plot HTML without launching a browser |
| `--verbose` | Show step-by-step calculation details |
| `--quiet` | Suppress non-essential output |
| `--dry-run` | Show what would be calculated without executing |
| `--output <file>` | Save results to a file |
| `--no-color` | Disable colored output |

## LLM Configuration

In `strong-beta`, AI commands default to the hosted beta provider, so a user does not need to bring their own API key.

- Default provider: `hosted-beta`
- Default text model: `glm-5.1`
- Default vision model: `glm-5v-turbo`
- Hosted layout/OCR model: `glm-ocr`

```bash
# Confirm the strong-beta defaults
geotech config get llm.provider
geotech config get llm.model
geotech config get llm.vision_model

# Restore hosted beta defaults
geotech config reset

# Optional advanced override: Hugging Face
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct
# Or set HF_TOKEN / HUGGINGFACE_API_KEY in your shell.

# Optional advanced override: OpenAI
geotech config set llm.provider openai
geotech config set llm.api_key sk-...

# Optional advanced override: Anthropic
geotech config set llm.provider anthropic
geotech config set llm.api_key sk-ant-...

# Optional advanced override: self-hosted OpenAI-compatible endpoint
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://localhost:11434/v1
geotech config set llm.model local-model-id

# Optional advanced override: OpenRouter through the OpenAI-compatible adapter
geotech config set llm.provider openai-compatible
geotech config set llm.base_url https://openrouter.ai/api/v1
geotech config set llm.model provider/model-id
# Or set OPENROUTER_API_KEY plus optional OPENROUTER_MODEL.
```

BYOK smoke testing is available for local release checks without changing the strong-beta default:

```bash
# Runs only providers with matching environment keys configured.
npm run smoke:byok

# Narrow to one provider and fail when no matching key is configured.
npm run smoke:byok -- --provider=openai --strict

# OpenRouter is tested through the OpenAI-compatible adapter shortcut.
# Set OPENROUTER_API_KEY and optional OPENROUTER_MODEL in your shell first.
npm run smoke:byok -- --provider=openrouter --strict

# Persist a structured provider comparison artifact.
npm run smoke:byok -- --provider=openrouter --out __byok-smoke/report.json
```

Supported runtime and smoke environment variables are `GEOTECHCLI_BYOK_HOSTED_BETA=1` for the hosted-beta proxy, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ZHIPU_API_KEY`/`ZAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HF_TOKEN`/`HUGGINGFACE_API_KEY`, or `OPENAI_COMPATIBLE_API_KEY` with `OPENAI_COMPATIBLE_BASE_URL` and `OPENAI_COMPATIBLE_MODEL` (`OPENAI_COMPATIBLE_MODEL_ID` remains a fallback alias). When `llm.provider` is `openai-compatible`, `OPENROUTER_API_KEY` automatically selects `https://openrouter.ai/api/v1` unless `OPENROUTER_BASE_URL` or `OPENAI_COMPATIBLE_BASE_URL` is set. These checks validate that BYOK text synthesis can answer the same compact preprocessed page-evidence contract prompt with source-evidence citations and review gates; they do not send image or native-PDF inputs through text-only providers. Persisted smoke reports include `contractValidation` metadata and redact private paths or token-shaped values before writing provider comparison JSON. When `--out` is used, the smoke also writes summary-only `byok-history.json`, `byok-trend.json`, and `byok-trend.html` artifacts beside the report so local provider runs can be compared over time without storing raw prompts, source-evidence snippets, provider responses, private paths, or tokens. PDF, OCR, and vision confidence still depends on the provider capability advertised for the selected model.

Provider-agnostic agent behavior: hosted GLM is the strong-beta default, but GeotechCLI now injects the same operating contract into workflow router prompts, single-agent, role-based swarm, and specialist-agent prompts for BYOK providers. That contract tells each model what capabilities it has, when to use `DocumentEvidencePacket`, `GroundModel`, standards snippets, deterministic tools, source pages, confidence, and review gates, and how to fall back when a free/open route lacks image, native-PDF, strict JSON, or stable capacity. In the shipped recognized workflow path, routing is deterministic and confidence-gated; `--route-with-model` lets a configured model propose an allowed workflow sequence for ambiguous prompts, but GeotechCLI validates the route, rejects unknown tasks, applies confidence gates, and keeps deterministic executors responsible for calculations, FEM case data, visualization specs, confidence, and persisted artifacts.

## Pricing

| Tier | Price | Status |
|------|-------|--------|
| **Strong Beta** | $0 | Active now |
| **Lite Pro** | Coming Soon | Not active in this branch |
| **Pro** | Coming Soon | Not active in this branch |
| **Annual** | Coming Soon | Not active in this branch |

Strong beta currently gives users deterministic commands plus hosted GLM beta access with limits. Managed commercial plans and entitlements come later.

## Security and Privacy

- End users do not need to submit their own API key for hosted beta usage.
- Hosted beta requests are forwarded for completion and are not intended to be stored as reusable prompt or file history on geotechCLI servers.
- geotechCLI does not use prompts, uploaded project files, or outputs to train geotechCLI.
- geotechCLI does not sell user engineering data.
- Hosted beta keeps only minimal hashed abuse-protection counters and service metadata.
- API keys are never logged, echoed, or included in error messages.
- `--json` output redacts sensitive fields.
- Environment variables take precedence over config file values when present.
- Config is stored at `~/.geotechcli/config.json` and protected with restrictive permissions where supported.
- Agent filesystem tools are sandboxed to the working directory.
- Shell commands are sandbox-validated and limited to a narrow allowlist.

## License

**Copyright (c) 2026 geotechCLI. All Rights Reserved.**

This is proprietary software. No part of this software may be reproduced,
distributed, or transmitted in any form without prior written permission.
See [LICENSE](./LICENSE) for full terms.

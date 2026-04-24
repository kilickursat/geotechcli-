# geotechCLI Development Status

Last updated: 2026-04-24

## Current Work

We are shipping the v0.4.29 engineering truth layer for `geotech analyze` and `geotech agent --workspace`.

Current focus:

- Add canonical `GroundModel` v1 for local workspace analysis.
- Bind extracted CSV/XLSX facts to explicit evidence references.
- Add deterministic verifier findings before agent/report synthesis.
- Upgrade analyze JSON, terminal, and HTML dossier outputs with GroundModel/verifier sections.
- Keep the path local and cost-aware so this work does not add Modal GPU usage.

## Done So Far

### v0.4.26 Reliability Fixes

- Fixed bundled skill trust for global npm installs without weakening arbitrary ZIP import security.
- Made long PDF ingest visibly active by default with live progress.
- Made ingest HTML outputs save/open real browser dossiers.
- Added retry/resume hardening for long PDF ingest and transient hosted-beta failures.
- Cleaned public docs, changelog, agent docs, and release-surface drift.

### v0.4.27 Cost-Aware Hosted-Beta Stabilization

- Lowered Modal/vLLM request pressure for the hosted Qwen L4 path.
- Reduced retry pressure for vision and agent requests.
- Serialized expensive image-heavy PDF ingest cases.
- Added cheaper partial-failure behavior for repeated text/vision timeouts.
- Preserved the user’s limited Modal GPU credit by avoiding unnecessary warm/health calls.

### v0.4.28 Workspace Analyze Foundation

- Added `geotech analyze [workspace]`.
- Added deterministic local project scanning and `ProjectManifest`.
- Added file classification for PDF, CSV, XLSX, AGS, JSON, images, GIS, CAD, office, and text files.
- Added CSV/XLSX schema inference for depth, coordinates, borehole/sample IDs, SPT/CPT, lab, monitoring, and signal columns.
- Added text, JSON, and HTML workspace dossier outputs.
- Added `geotech agent ... --workspace <dir>` so agents receive a compact manifest summary instead of guessing directly from raw files.
- Updated README, docs, homepage examples, changelog, package metadata, npm package versions, and live site release surfaces.

### v0.4.29 GroundModel Truth Layer

- Added `EvidenceRef` and evidence-bound values.
- Added canonical `GroundModel` v1 types.
- Added local GroundModel builder from workspace manifest and sampled tabular files.
- Added deterministic verifier checks for rejected SPT values, missing groundwater, missing coordinates, undeclared local CRS, unknown standards, duplicate SPT depths, and no-evidence workspaces.
- Added tests for GroundModel construction, evidence binding, rejected SPT standards-reference values, and analyze JSON/HTML output.

## Left To Do

Highest-value next work:

- Add standards/profile engine integration for `eurocode7`, `aashto`, `is`, `bs`, and `astm` assumptions.
- Expand verifier from data-quality checks into calculation-readiness checks.
- Add deterministic calculation routing from GroundModel into bearing, settlement, pile, liquefaction, and slope workflows.
- Add map visualization from GroundModel coordinates and local CRS assumptions.
- Add richer borehole strip logs, SPT-depth plots, lab charts, and monitoring plots to the dossier.
- Add PDF/image preprocessing before vision: render, classify, deskew, crop tables/log panels, OCR cache, and page-level reuse.
- Add document/page caching by file hash, page hash, preprocessing settings, model version, and extraction schema version.
- Add `geotech signal analyze` for settlement, piezometer, inclinometer, vibration, load-test, and time-series data.
- Add role-based swarm planning over structured evidence: WorkspaceScout, DataEngineer, GroundModeler, StandardsChecker, DesignEngineer, RiskReviewer, ReportEngineer.
- Add benchmark evaluation fixtures for boreholes, CPT, lab, reports, monitoring, sensor, pile load, and signal datasets.

## Cost And Reliability Notes

- Prefer local deterministic parsing before hosted-beta or vision calls.
- Do not use Modal health checks or live multimodal tests unless needed for release validation.
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

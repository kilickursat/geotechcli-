# geotechCLI Development Status

Last updated: 2026-05-03

## Current Work

We are shipping the v0.4.34 hosted GLM-OCR report synthesis and dossier UX release for the strong-beta AI path.

Current focus:

- Keep the public provider as `hosted-beta` so users do not bring their own key.
- Route hosted text and agent reasoning to `glm-5.1`.
- Route hosted vision to `glm-5v-turbo`.
- Route hosted PDF/table layout extraction to `glm-ocr`.
- Use the server-side `ZHIPU_API_KEY` secret in GitHub and Cloudflare.
- Keep the legacy Modal deploy workflow present but disabled by default.

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
- Wired geotechnical report ingest to prefer GLM-OCR layout text, use GLM-5V only when visual reasoning is needed, and generate GLM-5.1 report synthesis for the HTML dossier.
- Raised hosted-beta public CLI daily limits for text, vision, layout, and agent workflows while preserving tighter anonymous caps.
- Improved the HTML dossier with report takeaways, grouped key parameters, stage badges, extraction overview, confidence meters, and shadcn-style collapsed audit details.
- Added regression coverage for synchronous ingest, persisted async jobs, direct visual extraction, GLM-OCR fallback, hosted layout limits, and dossier HTML rendering.

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

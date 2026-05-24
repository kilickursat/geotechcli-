# geotechCLI project-aware agent harness implementation guide

**Audience:** GPT-5.5 Codex xhigh, geotechCLI maintainers, agent/runtime engineers  
**Goal:** make `geotech agent` understand and operate on the **local project folder** as its default working context, then ask the user what project-level outcome they want: data analysis, interpretation, risk analysis, anomaly detection, recommendations, visualizations, or downstream engineering workflows.

---

## 1. Product behavior

When a user opens a terminal inside a geotechnical project folder and runs:

```bash
geotech agent
```

or:

```bash
geotech agent .
```

the agent should understand:

```text
“I am inside a project workspace. First, inspect the folder safely, build a project context, then ask the user what they want me to do next.”
```

It should not behave like a generic chat assistant.

It should behave like a **project-aware geotechnical engineer agent**:

```text
1. Discover the current project folder.
2. Safely scan structured and unstructured files.
3. Build a project manifest.
4. Build or refresh an evidence-bound project context.
5. Summarize what it found.
6. Ask the user which workflow to run.
7. Execute the selected workflow through the harness.
8. Produce traceable outputs, review packages, and visualizations.
```

This extends existing geotechCLI behavior: the current docs already describe `geotech analyze .` as local project-folder intelligence that scans a workspace, builds a manifest, classifies geotechnical files, infers common CSV/XLSX schemas, builds an evidence-bound GroundModel, and reports workflow readiness; they also show `geotech agent "..." --workspace .` for attaching local workspace evidence to the agent. [S1]

The new requirement is to make project-folder intelligence a first-class `geotech agent` mode, not only an optional flag.

---

## 2. Conceptual model

### 2.1 Current model

```text
geotech agent "question" --workspace .
  -> read workspace summary if provided
  -> answer user request
```

### 2.2 Target model

```text
terminal cwd = project folder

geotech agent
  -> detect workspace root
  -> scan project files
  -> build project memory
  -> build evidence index
  -> infer project type and readiness
  -> ask user what outcome they want
  -> run selected harness workflow
  -> generate traceable artifacts
```

### 2.3 The agent is not just a model

The project-aware agent is a harnessed runtime:

```text
ProjectAwareAgent =
  LLM reasoning
  + workspace scanner
  + evidence index
  + geotechnical tools
  + deterministic validators
  + CRS/units guardrails
  + project memory
  + review gates
  + traces
```

OpenAI’s Agents SDK describes agents as LLMs configured with instructions, tools, and optional runtime behavior such as handoffs, guardrails, and structured outputs. That maps directly to the geotechCLI target: the model reasons, but the harness controls tools, validation, state, and outputs. [S2]

---

## 3. Required command UX

### 3.1 Default interactive project mode

```bash
cd ./my-geotech-project
geotech agent
```

Expected behavior:

```text
Detected project folder: ./my-geotech-project

I found:
- 4 PDF reports
- 11 borehole log images
- 2 AGS files
- 5 CSV/XLSX lab/monitoring files
- 1 site boundary GeoJSON
- 1 CAD drawing
- coordinates appear to use EPSG:27700, but vertical datum needs confirmation
- boreholes and SPT data appear sufficient for ground-model review
- foundation and liquefaction workflows may be partially ready
- tunnel workflow does not appear ready because no alignment file was found

What would you like me to do?

[1] Data inventory and quality report
[2] Interpret ground model
[3] Risk analysis
[4] Anomaly detection / data conflicts
[5] Foundation recommendations
[6] Liquefaction screening
[7] Visualizations and maps
[8] Build integrated review HTML
[9] Ask a custom question
```

The agent should wait for the user’s selection before running expensive, long, or model-heavy workflows.

### 3.2 Prompted project mode

```bash
geotech agent "review this project and tell me what analyses are ready"
```

If the user runs it inside a folder, the agent should still inspect the folder unless disabled:

```bash
geotech agent "review this project" --no-workspace
```

### 3.3 Explicit workspace

```bash
geotech agent "perform anomaly detection" --workspace .
```

or:

```bash
geotech agent "perform anomaly detection" --workspace /path/to/project
```

### 3.4 Non-interactive selection

```bash
geotech agent --workspace . --task data-quality --output out/data-quality.md
```

```bash
geotech agent --workspace . --task risk-analysis --format html --output out/risk-review.html
```

```bash
geotech agent --workspace . --task visualize --save-html out/project-review.html --no-open
```

### 3.5 Safe dry run

```bash
geotech agent --workspace . --plan-only
```

Output:

```text
No analysis executed.

Proposed project context:
- project type: site investigation
- primary data: PDF reports, AGS, CSV lab data
- likely workflows: ground model, foundation screening, liquefaction screening

Recommended next tasks:
1. data-quality
2. ground-model
3. anomaly-detection
4. visualization
```

---

## 4. Workspace root detection

The agent needs a clear filesystem boundary. MCP’s “roots” concept is useful here: roots define filesystem boundaries for server operations and help servers understand which directories and files they can access. [S3]

Implement:

```ts
type WorkspaceRoot = {
  path: string;
  detectedBy:
    | "explicit_workspace_arg"
    | "geotech_project_file"
    | "git_root"
    | "cwd";
  trustLevel: "explicit" | "inferred";
  readScope: "root_only";
  writeScope: "geotech_output_only";
};
```

Root detection order:

```text
1. --workspace argument
2. .geotech/project.json
3. git root
4. current working directory
```

Never scan outside the selected root unless the user explicitly provides additional roots.

Add optional config:

```json
{
  "workspace": {
    "maxFiles": 5000,
    "maxFileSizeMB": 100,
    "ignore": [
      "node_modules",
      ".git",
      ".venv",
      "dist",
      "build",
      ".geotech/cache"
    ],
    "allowedExtensions": [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".tif",
      ".tiff",
      ".csv",
      ".xlsx",
      ".xls",
      ".ags",
      ".json",
      ".geojson",
      ".dxf",
      ".dwg",
      ".txt",
      ".md"
    ]
  }
}
```

---

## 5. Project state folder

Every project-aware run should create or update:

```text
.geotech/
  project.json
  manifest.json
  evidence/
    evidence_index.jsonl
    file_index.jsonl
    extracted_fields.jsonl
  context/
    project_summary.md
    ground_model_summary.json
    readiness.json
    memory.json
  runs/
    run_<timestamp>/
      run_manifest.json
      trace.json
      tool_calls.jsonl
      model_calls.jsonl
      outputs/
  cache/
    file_hashes.json
    ocr_cache/
    embeddings/
  review/
    latest.html
```

### 5.1 `project.json`

```json
{
  "schemaVersion": "geotech.project.v1",
  "projectId": "metro-extension-package-a",
  "name": "Metro Extension Package A",
  "root": "/path/to/project",
  "country": "United Kingdom",
  "coordinateSystem": {
    "sourceCrs": "EPSG:27700",
    "status": "pass_with_warning",
    "verticalDatum": "mAOD"
  },
  "createdAt": "2026-05-11T10:00:00+09:00",
  "updatedAt": "2026-05-11T10:00:00+09:00"
}
```

### 5.2 `manifest.json`

```json
{
  "schemaVersion": "geotech.workspace_manifest.v1",
  "root": ".",
  "files": [
    {
      "path": "reports/GI_Report.pdf",
      "hash": "sha256:...",
      "type": "pdf_report",
      "sizeBytes": 18420000,
      "lastModified": "2026-05-01T12:00:00Z",
      "classification": {
        "domain": "geotechnical_report",
        "confidence": 0.92
      },
      "evidenceStatus": "indexed"
    }
  ],
  "summary": {
    "pdfReports": 4,
    "boreholeLogs": 11,
    "agsFiles": 2,
    "csvTables": 5,
    "gisFiles": 1,
    "cadFiles": 1
  }
}
```

### 5.3 `readiness.json`

```json
{
  "schemaVersion": "geotech.workflow_readiness.v1",
  "workflows": {
    "data_quality": {
      "status": "ready",
      "reasons": ["project manifest and evidence index exist"]
    },
    "ground_model_interpretation": {
      "status": "ready",
      "reasons": ["boreholes, strata, SPT, and groundwater found"]
    },
    "foundation_screening": {
      "status": "partially_ready",
      "missing": ["foundation loads", "settlement criteria"]
    },
    "liquefaction_screening": {
      "status": "partially_ready",
      "missing": ["PGA", "earthquake magnitude"]
    },
    "tunnel_screening": {
      "status": "blocked",
      "missing": ["alignment", "tunnel diameter", "machine constraints"]
    }
  }
}
```

---

## 6. Project-aware agent command architecture

### 6.1 New command shape

```bash
geotech agent [prompt] [options]
```

Options:

```text
--workspace <path>          Project root. Defaults to cwd.
--no-workspace              Disable project scan.
--refresh                   Rebuild manifest and evidence index.
--task <task>               Non-interactive task selection.
--route-with-model          Ask the configured hosted/BYOK model for a validated route only when deterministic routing needs selection.
--plan-only                 Inspect project and propose tasks only.
--max-files <n>             Limit workspace scan.
--max-depth <n>             Limit directory recursion.
--skills                    Allow approved skills.
--tools                     Allow tool execution.
--dry-run                   Show tool plan without executing.
--review-gate               Require review for low-confidence outputs.
--output <path>             Save result.
--format text|json|html     Output format.
--trace                     Save trace.
--no-open                   Do not open browser report.
```

### 6.2 Command router

```ts
async function runProjectAwareAgent(rawPrompt?: string, options: AgentOptions) {
  const workspace = await resolveWorkspaceRoot(options);
  const projectContext = await loadOrBuildProjectContext(workspace, options);
  const readiness = await computeWorkflowReadiness(projectContext);

  if (!rawPrompt && !options.task) {
    return askUserForNextTask(projectContext, readiness);
  }

  const intent = await resolveIntent(rawPrompt, options.task, projectContext, readiness);
  const plan = await buildHarnessPlan(intent, projectContext);

  if (options.planOnly || options.dryRun) {
    return renderPlan(plan);
  }

  return runHarnessedProjectTask(plan, projectContext, options);
}
```

---

## 7. Workspace intelligence pipeline

### Stage 1 — Preflight

```text
- identify workspace root
- apply ignore rules
- check file count and size limits
- detect .geotech project state
- load config and provider profile
- start trace
```

Tool candidates:

```text
workspace.resolve_root
workspace.load_project_state
workspace.apply_ignore_rules
workspace.preflight_limits
harness.start_trace
```

### Stage 2 — File discovery

```text
- recursively list allowed files
- hash files
- detect file types
- classify likely geotechnical content
```

Tool candidates:

```text
workspace.scan
file.hash
file.detect_type
file.classify_geotech_type
workspace.write_manifest
```

### Stage 3 — Structured data indexing

For structured files:

```text
AGS
CSV
XLSX
GeoJSON
JSON
DXF/CAD metadata
```

Tool candidates:

```text
ags.read
ags.validate
csv.infer_schema
csv.sample_rows
xlsx.infer_sheets
geojson.inspect
cad.inspect_metadata
```

### Stage 4 — Unstructured data indexing

For unstructured files:

```text
PDF reports
scanned borehole logs
images
drawings
text reports
```

Tool candidates:

```text
pdf.extract_text
pdf.classify_pages
ocr.parse_layout
image.classify
vision.verify_crop
evidence.create_refs
```

This should reuse existing `geotech analyze .` and `geotech ingest` capabilities rather than duplicating them. The docs already say `geotech analyze .` handles file discovery, AGS/PDF/image/GIS/CAD classification, CSV/XLSX schema inference, GroundModel construction, maps, charts, warnings, and workflow readiness. [S1]

### Stage 5 — Project context synthesis

Build a compact summary:

```json
{
  "projectType": "site_investigation",
  "detectedWorkflows": [
    "ground_model",
    "foundation_screening",
    "liquefaction_screening",
    "visual_review"
  ],
  "dataSources": {
    "boreholes": 4,
    "labTables": 5,
    "monitoring": 2,
    "gis": 1
  },
  "keyFindings": [
    "Borehole logs found on pages 10-13",
    "Coordinates likely EPSG:27700",
    "Groundwater strikes appear in all boreholes"
  ],
  "warnings": [
    "Vertical datum should be confirmed",
    "Some gravel boundaries are review-recommended"
  ]
}
```

Tool candidates:

```text
project.summarize_manifest
project.build_evidence_graph
ground_model.build_preliminary
workflow.compute_readiness
```

### Stage 6 — Ask the user

The agent should ask a structured question:

```text
I have built the project context. What would you like me to do?

1. Data inventory and quality report
2. Ground-model interpretation
3. Risk analysis
4. Anomaly/conflict detection
5. Engineering recommendations
6. Visualizations
7. Run a specific geotechCLI command
8. Ask a custom question
```

Non-interactive users can skip this with:

```bash
geotech agent --task risk-analysis
```

---

## 8. Intent router

The agent must translate the user’s response into a **workflow intent**, not a free-form chat.

```ts
type ProjectAgentIntent =
  | { type: "data_quality" }
  | { type: "interpretation"; focus?: "ground_model" | "hydrogeology" | "geology" }
  | { type: "risk_analysis"; focus?: string[] }
  | { type: "anomaly_detection"; severityThreshold?: number }
  | { type: "recommendations"; target?: "foundation" | "slope" | "tunnel" | "general" }
  | { type: "visualization"; outputs?: string[] }
  | { type: "run_command"; command: string; args: Record<string, unknown> }
  | { type: "custom_question"; question: string };
```

The intent router should use:

```text
- user response
- workspace manifest
- readiness.json
- available tools
- provider capabilities
- safety/review policy
```

Implementation note for the strong-beta route layer:

- Clear prompted workflow intents should stay on the deterministic router fast path and keep `model_calls.jsonl` empty.
- Ambiguous prompts may opt into `--route-with-model`.
- Model route output must be strict JSON and can only propose allowed deterministic workflows.
- Unknown proposed tasks must be recorded as rejected, not executed.
- Rejected, failed, low-confidence, or no-evidence model proposals must fall back to `custom_question` / workspace-backed agent handling.
- The LLM may propose or review workflow order only; deterministic GeotechCLI tools own calculations, FEM cases, visualization specs, confidence, and artifacts.

The final intent should be saved:

```text
.geotech/runs/<run_id>/intent.json
```

---

## 9. Project-aware workflows

### 9.1 Data analysis / data quality

Command:

```bash
geotech agent --task data-quality
```

Harness workflow:

```text
manifest -> evidence graph -> schema checks -> missing data -> duplicates -> conflicts -> report
```

Tools:

```text
qa.detect_duplicate_boreholes
qa.detect_missing_coordinates
qa.detect_depth_gaps
qa.detect_lab_outliers
qa.detect_groundwater_conflicts
qa.compare_pdf_vs_ags
qa.generate_missing_data_list
review.render_data_quality
```

Outputs:

```text
out/data_quality_report.md
out/data_quality_report.html
out/qa/findings.json
```

### 9.2 Interpretation

Command:

```bash
geotech agent --task interpretation
```

Harness workflow:

```text
evidence graph -> preliminary ground model -> geology/hydrogeology summary -> uncertainty map -> interpretation note
```

Tools:

```text
ground_model.build_from_evidence
ground_model.correlate_strata
ground_model.flag_inconsistent_boundaries
groundwater.summarize_observations
lab.summarize_parameters
interpretation.write_ground_model_note
```

Outputs:

```text
out/interpretation/ground_model.json
out/interpretation/interpretation_note.md
out/interpretation/uncertainty_register.json
```

### 9.3 Risk analysis

Command:

```bash
geotech agent --task risk-analysis
```

Harness workflow:

```text
readiness -> risk taxonomy -> missing critical data -> risk scoring -> mitigation suggestions -> review gates
```

Tools:

```text
risk.identify_geotechnical_hazards
risk.score_likelihood_consequence
risk.groundwater_risk
risk.settlement_risk
risk.excavation_risk
risk.liquefaction_risk
risk.slope_risk
risk.tunnel_risk
risk.generate_register
```

Outputs:

```text
out/risk/risk_register.json
out/risk/risk_summary.md
out/risk/risk_matrix.html
```

### 9.4 Anomaly detection

Command:

```bash
geotech agent --task anomaly-detection
```

Harness workflow:

```text
structured data + extracted data -> statistical checks -> spatial checks -> cross-source conflicts -> anomaly report
```

Tools:

```text
anomaly.detect_coordinate_outliers
anomaly.detect_spt_outliers
anomaly.detect_strata_boundary_outliers
anomaly.detect_lab_parameter_outliers
anomaly.detect_groundwater_outliers
anomaly.detect_pdf_ags_conflicts
anomaly.rank_findings
```

Examples:

```text
- BH-03 ground level differs between PDF and AGS
- SPT N=80 appears inconsistent with neighboring values
- groundwater strike depth differs by >3 m from nearby boreholes
- coordinate appears outside site boundary
- borehole final depth conflicts with deepest stratum
```

Outputs:

```text
out/anomalies/anomalies.json
out/anomalies/anomaly_review.html
```

### 9.5 Recommendations

Command:

```bash
geotech agent --task recommendations
```

The agent must not pretend to deliver final design unless data and review gates pass.

Workflow:

```text
readiness -> feasible workflows -> preliminary recommendations -> required missing inputs -> review flags
```

Tools:

```text
workflow.readiness_router
foundation.option_screen
slope.mechanism_screen
liquefaction.screening
tunnel.tbm_select
risk.generate_recommendations
report.write_recommendation_note
```

Output language must distinguish:

```text
- evidence-backed recommendation
- preliminary screening recommendation
- missing-data-driven recommendation
- not enough information
```

### 9.6 Visualizations

Command:

```bash
geotech agent --task visualization
```

Workflow:

```text
validated JSON -> deterministic renderers -> review HTML
```

Tools:

```text
viz.borehole_strip_log
viz.map_boreholes
viz.stratigraphic_section
viz.spt_depth_plot
viz.lab_depth_plot
viz.groundwater_time_series
viz.integrated_review_html
```

Outputs:

```text
out/review/integrated_review.html
out/viz/boreholes.geojson
out/viz/section.svg
out/viz/spt_depth.html
```

---

## 10. Interactive conversation contract

The agent should ask the user, but not with vague chat.

Use a structured prompt:

```text
I scanned this folder and built a project context.

Detected project:
- Name: Metro Extension Package A
- Main data: GI report PDF, AGS, borehole logs, lab CSV, GeoJSON boundary
- Likely CRS: EPSG:27700, confidence high
- Vertical datum: mAOD, needs confirmation
- Ready workflows: data quality, ground model, visualization
- Partially ready: foundation screening, liquefaction screening
- Blocked: tunnel screening, because no alignment was found

Choose the next action:
1. Data quality / missing data
2. Ground model interpretation
3. Risk analysis
4. Anomaly detection
5. Preliminary recommendations
6. Visualizations
7. Run a specific command
8. Ask a custom project question
```

Then parse response into `ProjectAgentIntent`.

If the user says:

```text
do risk analysis and visualization
```

the agent should build a combined plan:

```json
{
  "intent": {
    "type": "combined",
    "tasks": [
      {"type": "risk_analysis"},
      {"type": "visualization"}
    ]
  },
  "requiresReview": true
}
```

---

## 11. Project memory

### 11.1 Memory scope

Project memory should be local to the folder:

```text
.geotech/context/memory.json
```

It should store:

```json
{
  "assumptions": [
    {
      "id": "asm_001",
      "text": "User confirmed vertical datum is mAOD.",
      "createdAt": "...",
      "source": "user_confirmation"
    }
  ],
  "decisions": [
    {
      "id": "dec_001",
      "text": "Use EPSG:27700 as project source CRS.",
      "evidence": ["ev_report_titleblock_crs"],
      "status": "confirmed"
    }
  ],
  "userPreferences": {
    "preferredStandard": "Eurocode 7",
    "preferredOutput": "html"
  }
}
```

### 11.2 Do not store

Do not store:

```text
- API keys
- personally sensitive information unless explicit
- raw confidential source documents in memory
- irreversible design decisions without user confirmation
```

---

## 12. Safety and permission model

### 12.1 Read permissions

Default:

```text
read current workspace root only
```

Require explicit user approval for:

```text
- reading outside workspace
- following symlinks outside workspace
- uploading documents to hosted providers
- using non-local model providers for confidential files
```

### 12.2 Write permissions

Default write scope:

```text
.geotech/
out/
```

Require approval for:

```text
- overwriting source files
- writing outside workspace
- deleting files
- modifying CAD/GIS/AGS originals
```

### 12.3 Tool approval

Use side-effect levels:

```ts
type ToolSideEffect =
  | "read_only"
  | "write_output"
  | "network_model_call"
  | "external_process"
  | "destructive";
```

Approval policy:

```text
read_only                 auto-allowed
write_output              allowed in .geotech/ or out/
network_model_call        allowed if provider profile permits; otherwise confirm
external_process          confirm
destructive               blocked by default
```

OpenAI’s tool model supports tools that take actions such as fetching data, running code, calling APIs, and using a computer; geotechCLI should expose those capabilities only through its side-effect policy and trace system. [S4]

---

## 13. Tools required for project-aware agent

### 13.1 Workspace tools

```text
workspace.resolve_root
workspace.scan
workspace.apply_ignore_rules
workspace.hash_files
workspace.detect_project_type
workspace.load_state
workspace.save_state
workspace.build_manifest
workspace.diff_since_last_scan
```

### 13.2 File classification tools

```text
file.detect_type
file.classify_geotech_file
file.extract_metadata
file.detect_duplicate_files
file.safe_sample
```

### 13.3 Structured data tools

```text
ags.read
ags.validate
csv.infer_schema
csv.sample_rows
xlsx.infer_sheets
geojson.inspect
cad.inspect_metadata
json.validate_schema
```

### 13.4 Unstructured data tools

```text
pdf.extract_text
pdf.classify_pages
pdf.render_pages
ocr.parse_layout
image.classify
vision.verify_crop
evidence.create_refs
```

### 13.5 Context and readiness tools

```text
project.summarize_manifest
project.build_evidence_graph
project.build_context_pack
workflow.compute_readiness
workflow.route_intent
workflow.plan_task
```

### 13.6 Analysis tools

```text
qa.detect_missing_data
qa.detect_duplicate_boreholes
qa.detect_coordinate_outliers
qa.detect_depth_gaps
qa.detect_pdf_ags_conflicts
anomaly.detect_spt_outliers
anomaly.detect_lab_outliers
risk.identify_geotechnical_hazards
risk.score_register
ground_model.build_from_evidence
ground_model.correlate_strata
```

### 13.7 Visualization tools

```text
viz.integrated_review_html
viz.borehole_strip_log
viz.map_boreholes
viz.stratigraphic_section
viz.spt_depth_plot
viz.lab_depth_plot
viz.groundwater_time_series
```

### 13.8 Explanation tools

```text
agent.explain_project
agent.explain_field
agent.explain_readiness
agent.explain_missing_data
agent.explain_risk_score
agent.summarize_trace
```

---

## 14. Project context pack

The agent should not stuff the whole folder into the LLM context.

Build a compact context pack:

```json
{
  "project": {
    "name": "Metro Extension Package A",
    "country": "United Kingdom",
    "sourceCrs": "EPSG:27700",
    "verticalDatum": "mAOD"
  },
  "files": {
    "pdfReports": 4,
    "agsFiles": 2,
    "csvFiles": 5,
    "gisFiles": 1,
    "images": 11
  },
  "evidenceSummary": {
    "boreholes": 4,
    "strataRecords": 16,
    "sptRecords": 16,
    "groundwaterRecords": 4,
    "labTables": 5
  },
  "readiness": {
    "data_quality": "ready",
    "ground_model": "ready",
    "foundation_screening": "partially_ready",
    "liquefaction_screening": "partially_ready",
    "tunnel_screening": "blocked"
  },
  "warnings": [
    "Vertical datum needs confirmation for survey-grade section export",
    "Some groundwater records are symbol-only"
  ],
  "links": {
    "manifest": ".geotech/manifest.json",
    "evidenceIndex": ".geotech/evidence/evidence_index.jsonl",
    "groundModel": ".geotech/context/ground_model_summary.json",
    "readiness": ".geotech/context/readiness.json"
  }
}
```

This becomes the main agent input.

---

## 15. Agent orchestration

Use a manager + specialists pattern.

```text
ProjectScoutAgent
  -> scans workspace and builds manifest

DataEngineerAgent
  -> indexes structured and unstructured data

GroundModelAgent
  -> builds preliminary ground model

QAAgent
  -> detects missing data, conflicts, anomalies

RiskAgent
  -> creates risk register

VisualizationAgent
  -> generates maps, sections, review HTML

ReportAgent
  -> writes user-facing output
```

The manager agent should not do calculations itself. It should call tools and specialists.

The Agents SDK supports handoffs/delegation between agents and guardrails for validation; even if geotechCLI remains SDK-independent, these are the right architectural primitives. [S2]

---

## 16. Tracing

Every `geotech agent` project run should write:

```text
.geotech/runs/<run_id>/trace.json
.geotech/runs/<run_id>/tool_calls.jsonl
.geotech/runs/<run_id>/model_calls.jsonl
.geotech/runs/<run_id>/intent.json
.geotech/runs/<run_id>/plan.json
```

`model_calls.jsonl` should always exist for audit consistency. Deterministic discovery, explicit `--task`, and clear recognized workflow routes should leave it empty. `--route-with-model` should append a compact router-proposal row, and fallback to the workspace-backed agent should add a planned handoff row for that agent path.

Trace should include:

```json
{
  "runId": "run_2026_05_11_001",
  "workspace": ".",
  "intent": "risk_analysis",
  "steps": [
    {
      "type": "tool_call",
      "tool": "workspace.scan",
      "status": "pass",
      "outputs": [".geotech/manifest.json"]
    },
    {
      "type": "tool_call",
      "tool": "workflow.compute_readiness",
      "status": "pass",
      "outputs": [".geotech/context/readiness.json"]
    },
    {
      "type": "model_call",
      "model": "glm-5.1",
      "purpose": "intent_resolution",
      "status": "pass"
    }
  ]
}
```

OpenAI Agents SDK tracing records LLM generations, tool calls, handoffs, guardrails, and custom events; geotechCLI should record the same categories locally for reproducibility and auditability. [S5]

---

## 17. Implementation steps for Codex

### Phase 1 — Add project-aware agent mode

Implement:

```text
src/cli/commands/agent.ts
src/agent/projectAwareAgent.ts
src/workspace/resolveWorkspaceRoot.ts
src/workspace/scanWorkspace.ts
src/workspace/projectState.ts
```

Acceptance:

```bash
cd sample-project
geotech agent --plan-only
```

Produces:

```text
.geotech/manifest.json
.geotech/context/readiness.json
.geotech/runs/<run_id>/plan.json
```

### Phase 2 — Add local project state

Implement:

```text
.geotech/project.json
.geotech/manifest.json
.geotech/context/project_summary.md
.geotech/context/readiness.json
.geotech/runs/<run_id>/trace.json
```

Acceptance:

```bash
geotech agent --workspace . --refresh --plan-only
```

Rebuilds state deterministically.

### Phase 3 — Add interactive task selection

Implement terminal prompt:

```text
What would you like me to do?
[1] Data quality
[2] Interpretation
[3] Risk analysis
[4] Anomaly detection
[5] Recommendations
[6] Visualizations
[7] Custom question
```

Acceptance:

```bash
geotech agent
```

without a prompt enters project discovery + selection mode.

### Phase 4 — Add intent router

Implement:

```text
src/agent/intentRouter.ts
src/agent/projectIntent.schema.json
```

Acceptance:

```bash
geotech agent "find anomalies and create visualizations" --workspace . --plan-only
```

Produces:

```json
{
  "type": "combined",
  "tasks": [
    {"type": "anomaly_detection"},
    {"type": "visualization"}
  ]
}
```

### Phase 5 — Add workflow plans

Implement:

```text
src/agent/workflows/dataQuality.ts
src/agent/workflows/interpretation.ts
src/agent/workflows/riskAnalysis.ts
src/agent/workflows/anomalyDetection.ts
src/agent/workflows/recommendations.ts
src/agent/workflows/visualization.ts
```

Acceptance:

```bash
geotech agent --task data-quality --workspace . --output out/data-quality.html
```

Produces:

```text
out/data-quality.html
.geotech/runs/<run_id>/trace.json
```

### Phase 6 — Add project memory

Implement:

```text
src/agent/projectMemory.ts
.geotech/context/memory.json
```

Acceptance:

```bash
geotech agent "use Eurocode 7 for this project" --workspace .
```

Stores a user-confirmed preference locally.

### Phase 7 — Add safeguards

Implement:

```text
src/agent/permissions.ts
src/agent/sideEffectPolicy.ts
src/workspace/symlinkGuard.ts
src/workspace/pathBoundary.ts
```

Acceptance:

```text
- reading outside root requires approval
- writing outside .geotech/ or out/ requires approval
- destructive operations are blocked by default
```

### Phase 8 — Add project explanation commands

Implement:

```bash
geotech agent explain project
geotech agent explain readiness
geotech agent explain field boreholes[2].strata[1].base
geotech agent explain trace .geotech/runs/<run_id>/trace.json
```

Acceptance:

```bash
geotech agent explain readiness
```

Outputs:

```text
Foundation screening: partially ready
Reason:
- borehole data found
- SPT data found
- missing foundation load and settlement criteria
```

---

## 18. Integration with existing commands

### 18.1 `geotech analyze .`

`geotech analyze .` remains the deterministic scanner.

`geotech agent` should call it internally or share the same workspace modules.

```text
geotech analyze .
  -> deterministic project context

geotech agent
  -> project context + reasoning + task routing + workflow execution
```

### 18.2 `geotech ingest`

Use when files need deeper extraction.

```text
ProjectAwareAgent detects PDFs/images
  -> asks whether to run ingest
  -> runs ingest only when selected or required by task
```

### 18.3 `geotech viz`

Use when the user selects visualization.

```text
ProjectAwareAgent -> viz tools -> integrated review UI
```

### 18.4 `geotech harness`

Every project-agent workflow should run through the harness.

```text
geotech agent --task risk-analysis
  -> runHarness("project.risk_analysis.v1")
```

---

## 19. User-facing examples

### Example A — project scan and question

```bash
cd projects/metro-extension
geotech agent
```

Output:

```text
I scanned this project folder and found enough information for:
- data quality review
- ground model interpretation
- anomaly detection
- borehole visualizations

Foundation screening is partially ready.
Liquefaction screening is partially ready.
Tunnel screening is blocked.

What would you like me to do?
```

### Example B — anomaly detection

```bash
geotech agent "detect anomalies in this project"
```

Output artifacts:

```text
out/anomalies/anomalies.json
out/anomalies/anomaly_review.html
.geotech/runs/<run_id>/trace.json
```

### Example C — recommendations

```bash
geotech agent "recommend foundation options for this site"
```

If missing data:

```text
Foundation recommendation is review-required.

I found borehole and SPT evidence, but I did not find:
- column loads
- allowable settlement criteria
- groundwater design level confirmation

I can prepare a preliminary screening note or draft the missing-data request.
```

### Example D — visualization

```bash
geotech agent "create maps and cross sections"
```

Output:

```text
out/review/integrated_review.html
out/geospatial/boreholes.geojson
out/geospatial/section.svg
```

If CRS is missing:

```text
Visualization blocked: CRS is not confirmed.

I found easting/northing values, but no CRS evidence.
Please select the source CRS or provide local-grid transform parameters.
```

---

## 20. Codex implementation prompt

Use this prompt with GPT-5.5 Codex xhigh:

```text
Implement project-aware geotech agent mode.

The goal is that when a user runs `geotech agent` inside a local project folder, the agent safely scans the current workspace, builds a project manifest, creates a local .geotech project state, computes workflow readiness, summarizes what it found, and asks the user what next action they want: data analysis, interpretation, risk analysis, anomaly detection, recommendations, visualizations, run command, or custom question.

Implementation requirements:
1. Default workspace root is cwd unless --workspace is provided.
2. Never scan outside the workspace root without explicit approval.
3. Create .geotech/project.json, .geotech/manifest.json, .geotech/context/readiness.json, and .geotech/runs/<run_id>/trace.json.
4. Reuse existing analyze/ingest/viz modules where possible; do not duplicate scanner logic.
5. Add --plan-only, --refresh, --task, --no-workspace, --trace, --format, and --output options.
6. If no prompt and no task are provided, enter interactive project-discovery mode and ask a structured next-action question.
7. Parse user response into a ProjectAgentIntent schema.
8. Run selected workflows through runHarness, not direct ad hoc code.
9. For structured files, inspect AGS, CSV, XLSX, JSON, GeoJSON, and CAD metadata.
10. For unstructured files, classify PDFs/images and call ingest/OCR only when needed.
11. Build a compact ProjectContextPack for the LLM; do not dump entire files into model context.
12. Add local project memory at .geotech/context/memory.json for confirmed assumptions and user preferences.
13. Require evidence IDs for extracted engineering values.
14. Block map/cross-section rendering until CRS validation passes.
15. Write tool-call and model-call traces for every run.
16. Add tests for root detection, scan limits, intent routing, task selection, and permission boundaries.
17. Add docs explaining project-aware agent behavior.
```

---

## 21. Acceptance criteria

The implementation is accepted when:

```text
- `geotech agent` inside a project folder scans the folder and asks what the user wants next.
- `geotech agent --plan-only` produces a project summary and readiness plan without running expensive workflows.
- `geotech agent --task data-quality` runs data quality workflow and writes outputs.
- `geotech agent --task anomaly-detection` finds cross-source anomalies and writes a review artifact.
- `geotech agent --task visualization` generates deterministic project visualizations only from validated data.
- The agent never scans outside the workspace root without approval.
- The agent writes .geotech project state and run traces.
- The agent can explain why a workflow is ready, blocked, or review-required.
- The selected workflow uses the harness and registered tools.
- Project memory stores only confirmed assumptions and preferences.
```

---

## 22. Citations and references

[S1] geotechCLI Strong Beta Docs, especially `geotech analyze` and `geotech agent --workspace .`.  
https://beta.geotechcli.com/docs

[S2] OpenAI Agents SDK, “Agents.” Agents are LLMs configured with instructions, tools, and optional runtime behavior such as handoffs, guardrails, and structured outputs.  
https://openai.github.io/openai-agents-python/agents/

[S3] Model Context Protocol, “Roots.” Roots define filesystem boundaries and help tools/servers understand the directories and files they can access.  
https://modelcontextprotocol.io/specification/2025-06-18/client/roots

[S4] OpenAI Agents SDK, “Tools.” Tools let agents take actions such as fetching data, running code, calling APIs, and using computers.  
https://openai.github.io/openai-agents-python/tools/

[S5] OpenAI Agents SDK, “Tracing.” Tracing records LLM generations, tool calls, handoffs, guardrails, and custom events during agent runs.  
https://openai.github.io/openai-agents-python/tracing/

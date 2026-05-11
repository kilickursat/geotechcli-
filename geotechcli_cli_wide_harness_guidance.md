# geotechCLI CLI-wide harness engineering implementation guide

**Audience:** GPT-5.5 Codex xhigh, geotechCLI maintainers, agent/tooling engineers  
**Goal:** convert the entire geotechCLI into a harnessed, provider-agnostic geotechnical engineering runtime, not just a PDF/OCR extraction tool.  
**Core product statement:** geotechCLI should be **LLM-agnostic, evidence-strict, tool-rich, validator-gated, traceable, replayable, and reviewable**.

---

## 0. Why this change is needed

geotechCLI already has a strong command surface and a large skill catalog. The current public docs describe commands such as `geotech skill`, `geotech bearing`, `geotech liquefaction`, `geotech classify`, `geotech tunnel`, `geotech vision`, `geotech analyze`, `geotech ingest`, `geotech agent`, `geotech export`, and `geotech viz`; they also state that strong beta bundles **49 skills**. [S6]

That is a good base, but the product needs a clearer separation between:

```text
skills  = reusable domain workflows
tools   = small callable primitives with schemas, guardrails, traces, and validators
harness = the runtime that decides which tools can run, validates their results, records evidence, and gates outputs
```

The current opportunity is to make every CLI command run through the same harness runtime:

```text
user command
  -> command harness spec
  -> context/evidence loading
  -> provider/tool capability checks
  -> deterministic tools
  -> model calls only where useful
  -> validators
  -> review gates
  -> exports
  -> traces/evals
```

This follows the core harness-engineering idea: humans steer, agents execute, and engineering effort shifts toward designing environments, specifying intent, and building feedback loops that make agents reliable. [S1]

---

## 1. Definitions for geotechCLI

### 1.1 Harness

A **harness** is the enforceable runtime envelope around every command.

It includes:

```text
- command intent
- allowed tools
- forbidden actions
- required inputs
- schemas
- validators
- evidence requirements
- provider capability requirements
- trace recording
- review gates
- export gates
- eval metrics
```

### 1.2 Skill

A **skill** is a reusable workflow package.

Examples:

```text
- shallow-foundation-option-screening
- epb-soft-ground-screening
- natm-support-selection
- slope-failure-mechanism-screening
```

A skill can call many tools, but it should not bypass the harness.

### 1.3 Tool

A **tool** is a small, typed, testable operation.

Examples:

```text
- soil.compute_effective_stress
- bearing.terzaghi_capacity
- liquefaction.bi2014_crr
- geo.transform_crs
- evidence.resolve_field_source
- borehole.calibrate_depth_axis
- export.write_ags4
```

Tools must have:

```text
- name
- description
- input schema
- output schema
- side-effect declaration
- guardrails
- trace metadata
- tests
```

MCP’s tool model is useful here because it formalizes uniquely named tools with input schemas and model-controlled invocation, while recommending human-in-the-loop visibility and approval for tool use. [S4]

---

## 2. Non-negotiable principles

### Principle A — CLI-wide harnessing

No command should be “outside the harness.”

Even simple deterministic commands such as:

```bash
geotech bearing ...
geotech classify uscs ...
geotech liquefaction ...
```

should produce:

```text
- command manifest
- normalized inputs
- tool-call trace
- validation report
- reproducible JSON result
```

### Principle B — skills are not enough

49 skills are useful, but the CLI needs a much larger library of small tools. Skills should orchestrate tools; they should not hide calculations inside opaque scripts.

### Principle C — deterministic first, model-assisted second

Use LLM/VLM/OCR models for:

```text
- interpreting text/images
- classifying evidence
- resolving ambiguous regions
- normalizing evidence into schemas
- planning tool sequences
```

Use deterministic tools for:

```text
- calculations
- units
- coordinate transforms
- validators
- plotting
- exports
- checks against known equations/standards
```

Anthropic’s agent guidance is relevant: start with simple building blocks, keep workflows predictable where tasks are well-defined, and optimize tools rather than only prompts. [S2]

### Principle D — no evidence, no trusted output

For any command that consumes extracted or user-provided project data:

```text
no evidence reference -> no trusted engineering export
```

For purely numeric commands, evidence can be a CLI argument, input file cell, config item, or user assumption record.

### Principle E — no map before CRS validation

Any map, coordinate table, section line, or geospatial output must be blocked until CRS is known or explicitly user-approved as a local grid.

pyproj/PROJ should be the authoritative server-side transformation path because pyproj’s Transformer supports transformations between definable coordinate systems, including datum transformations. [S9]

### Principle F — trace everything

Each command run should produce a trace with:

```text
- command
- inputs
- normalized inputs
- tools called
- model calls
- guardrails
- validators
- outputs
- artifacts
- warnings
- review gates
```

OpenAI’s Agents SDK tracing model is a useful reference because it records LLM generations, tool calls, handoffs, guardrails, and custom events. [S10]

---

## 3. Target CLI architecture

```text
geotechcli/
  src/
    cli/
      commands/
        bearing.ts
        liquefaction.ts
        classify.ts
        tunnel.ts
        vision.ts
        analyze.ts
        ingest.ts
        agent.ts
        export.ts
        viz.ts
        skill.ts
        harness.ts
        tool.ts
        geo.ts
        project.ts
        qa.ts

    harness/
      kernel/
        runHarness.ts
        commandRegistry.ts
        toolRegistry.ts
        providerRegistry.ts
        guardrailRunner.ts
        validatorRunner.ts
        traceRecorder.ts
        artifactStore.ts
        reviewGate.ts
        policyEngine.ts
      specs/
        commandSpec.ts
        toolSpec.ts
        harnessManifest.ts
        providerProfile.ts
        evidenceSpec.ts
        traceSpec.ts
      manifests/
        bearing.capacity.v1.yaml
        classify.uscs.v1.yaml
        liquefaction.triggering.v1.yaml
        tunnel.tbm_select.v1.yaml
        ingest.borehole_log.v1.yaml
        analyze.workspace.v1.yaml
        viz.ground_model.v1.yaml

    tools/
      core/
      evidence/
      data/
      units/
      geo/
      soil/
      rock/
      lab/
      groundwater/
      foundation/
      pile/
      retaining/
      slope/
      settlement/
      liquefaction/
      seismic/
      tunnel/
      monitoring/
      viz/
      export/
      standards/
      qa/

    validators/
      common/
      geotechnical/
      geospatial/
      command_specific/

    schemas/
      evidence/
      ground_model/
      borehole/
      lab/
      groundwater/
      foundation/
      slope/
      tunnel/
      export/
      trace/

    providers/
      glm/
      openai/
      anthropic/
      gemini/
      openai-compatible/
      local/

    review-ui/
      integrated/
      components/
      renderers/

    evals/
      datasets/
      metrics/
      runners/

  docs/
    harness/
    workflows/
    tools/
    schemas/
    validators/
    evals/
    decisions/

  AGENTS.md
```

---

## 4. Universal command lifecycle

Every CLI command should execute through this lifecycle.

```text
1. Resolve command spec
2. Parse raw CLI args
3. Normalize units and input schema
4. Load project context, config, provider profile, and workspace
5. Run input guardrails
6. Build execution plan
7. Call allowed tools
8. Record tool calls and artifacts
9. Run validators
10. Run output guardrails
11. Decide export/review status
12. Write trace
13. Write JSON output
14. Write optional human review artifacts
```

### 4.1 Command run manifest

Every run should write:

```json
{
  "runId": "run_2026_05_11_001",
  "command": "geotech bearing",
  "workflow": "bearing.capacity.v1",
  "startedAt": "2026-05-11T10:00:00+09:00",
  "providerProfile": "glm_default",
  "inputHash": "sha256:...",
  "workspace": "./project",
  "harnessVersion": "0.1.0",
  "status": "pass|review_required|blocked|failed"
}
```

### 4.2 Tool trace event

```json
{
  "type": "tool_call",
  "tool": "bearing.meyerhof_capacity",
  "inputHash": "sha256:...",
  "startedAt": "...",
  "endedAt": "...",
  "status": "pass",
  "guardrails": {
    "input": "pass",
    "output": "pass"
  },
  "artifacts": [],
  "warnings": []
}
```

### 4.3 Model trace event

```json
{
  "type": "model_call",
  "provider": "z_ai",
  "model": "glm-5.1",
  "purpose": "schema_normalization",
  "inputEvidenceIds": ["ev_p012_b001"],
  "outputSchema": "borehole_log.v1",
  "status": "pass",
  "cost": null,
  "tokens": null
}
```

---

## 5. Harness kernel implementation steps

### Step 1 — Add `harness/kernel/runHarness.ts`

Codex should implement a single entrypoint:

```ts
export async function runHarness<TInput, TOutput>(
  commandName: string,
  rawArgs: unknown,
  options: HarnessRunOptions
): Promise<HarnessRunResult<TOutput>>;
```

Responsibilities:

```text
- load CommandSpec
- normalize input
- enforce allowed tools
- run preflight checks
- call command executor
- run validators
- apply review/export gates
- write artifacts
- write trace
```

### Step 2 — Add command specs

```ts
export type CommandSpec = {
  id: string;
  command: string;
  workflow: string;
  version: string;

  inputSchema: JsonSchema;
  outputSchema: JsonSchema;

  requiredTools: string[];
  optionalTools: string[];
  forbiddenTools?: string[];

  requiredCapabilities?: {
    text?: boolean;
    vision?: boolean;
    ocr?: boolean;
    structuredJson?: boolean;
    geospatial?: boolean;
  };

  guardrails: {
    input: string[];
    tool: string[];
    output: string[];
  };

  validators: string[];

  reviewGates: ReviewGateRule[];
  artifacts: ArtifactSpec[];
};
```

### Step 3 — Add tool specs

```ts
export type ToolSpec = {
  name: string;
  title: string;
  description: string;
  domain: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;

  sideEffects: "none" | "read_files" | "write_files" | "network" | "external_process";
  deterministic: boolean;
  requiresApproval: boolean;

  guardrails: {
    before: string[];
    after: string[];
  };

  examples: ToolExample[];
};
```

### Step 4 — Add the tool registry

```ts
export class ToolRegistry {
  register(spec: ToolSpec, implementation: ToolImplementation): void;
  get(name: string): RegisteredTool;
  list(filter?: ToolFilter): ToolSpec[];
  assertAllowed(toolName: string, commandSpec: CommandSpec): void;
}
```

Add CLI commands:

```bash
geotech tool list
geotech tool show soil.compute_effective_stress
geotech tool run soil.compute_effective_stress --input input.json
geotech tool validate soil.compute_effective_stress
geotech tool doctor
```

### Step 5 — Add guardrail runner

Use the OpenAI Agents SDK guardrail model as a conceptual reference: input guardrails before a run, tool guardrails around function tools, and output guardrails after final output. [S5]

Implement locally:

```ts
export type GuardrailResult = {
  status: "pass" | "warn" | "tripwire";
  code?: string;
  message?: string;
  fieldPath?: string;
  remediation?: string;
};
```

Guardrail types:

```text
- input guardrails
- tool input guardrails
- tool output guardrails
- command output guardrails
- export guardrails
```

### Step 6 — Add review gates

```ts
export type ReviewGateRule = {
  id: string;
  when: ReviewGateExpression;
  severity: "review_recommended" | "review_required" | "blocked";
  message: string;
};
```

Examples:

```yaml
- id: no_export_without_evidence
  when: "output.containsExtractedValuesWithoutEvidence == true"
  severity: blocked

- id: crs_ambiguous
  when: "geospatial.crsValidation.status == 'ambiguous'"
  severity: blocked

- id: low_confidence_design_input
  when: "field.confidence < 0.85 && field.usedForDesign == true"
  severity: review_required
```

### Step 7 — Add trace recorder

```ts
export interface TraceRecorder {
  startRun(manifest: HarnessRunManifest): Promise<void>;
  recordEvent(event: TraceEvent): Promise<void>;
  finishRun(result: HarnessRunResult<unknown>): Promise<void>;
}
```

Output:

```text
out/traces/run_trace.json
out/traces/tool_calls.jsonl
out/traces/model_calls.jsonl
```

---

## 6. CLI-wide command harness map

### 6.1 `geotech config`

Purpose: configure provider profiles, defaults, policies, and workspace.

Harness requirements:

```text
- validate config schema
- redact secrets in traces
- verify provider capabilities
- write config-change trace
```

Tools:

```text
config.read
config.write
config.validate
provider.healthcheck
provider.capability_probe
secrets.redact
```

Review gates:

```text
- block if provider profile lacks required model capability for selected workflow
- warn if API key is stored inline instead of env var
```

---

### 6.2 `geotech status`

Purpose: show CLI health, providers, tools, skills, cache, and harness readiness.

Harness requirements:

```text
- run lightweight healthchecks
- list broken tools
- list stale manifests
- list missing schemas
```

Tools:

```text
system.node_version
system.platform_info
provider.healthcheck_all
tool.registry_status
skill.registry_status
cache.status
harness.doctor
```

---

### 6.3 `geotech skill`

Purpose: manage 49 bundled skills and any user-installed skills.

Harness requirements:

```text
- validate skill manifest
- inspect tool dependencies
- require approval before executing untrusted skills
- record skill execution trace
```

Tools:

```text
skill.list
skill.show
skill.validate_manifest
skill.resolve_dependencies
skill.run_sandboxed
skill.approve
skill.revoke
skill.audit
```

Important rule:

```text
Skills orchestrate tools; tools remain individually traceable.
```

---

### 6.4 `geotech bearing`

Purpose: bearing capacity calculations.

Harness requirements:

```text
- unit normalization
- parameter range checks
- method-specific equation trace
- calculation reproducibility
- design-output review gate if source parameters lack evidence
```

Tools:

```text
units.normalize
soil.compute_effective_stress
bearing.terzaghi_capacity
bearing.meyerhof_capacity
bearing.hansen_capacity
bearing.vesic_capacity
bearing.shape_factors
bearing.depth_factors
bearing.inclination_factors
bearing.water_table_correction
bearing.factor_of_safety
report.calculation_sheet
```

Validators:

```text
- phi range
- cohesion range
- unit weight range
- foundation dimensions positive
- water table depth consistent
- FS positive and within configured policy
```

Outputs:

```text
bearing_result.json
bearing_calculation_sheet.md
trace.json
```

---

### 6.5 `geotech liquefaction`

Purpose: liquefaction triggering and screening.

Harness requirements:

```text
- input profile schema validation
- unit consistency
- groundwater requirement
- seismic parameter checks
- method trace
```

Tools:

```text
csv.read_profile
profile.validate_depth_series
seismic.compute_total_stress
seismic.compute_effective_stress
liquefaction.compute_csr
liquefaction.compute_msf
liquefaction.nceer_crr
liquefaction.bi2014_crr_spt
liquefaction.fines_correction
liquefaction.factor_of_safety
liquefaction.lpi
viz.liquefaction_profile
```

Review gates:

```text
- review required if groundwater depth missing
- blocked if depth series non-monotonic
- review required if fines content is inferred
```

---

### 6.6 `geotech classify`

Purpose: soil and rock classification.

Harness requirements:

```text
- do not infer classification from incomplete data unless marked inferred
- preserve source lab evidence
- draw deterministic classification plots
```

Tools:

```text
classify.uscs
classify.astm_d2487_input_check
classify.aashto
classify.plasticity_chart
classify.rmr89
classify.q_system
classify.gsi
classify.rock_weathering
classify.soil_description_normalizer
viz.plasticity_chart
viz.rmr_breakdown
```

Review gates:

```text
- block USCS export if required particle-size / Atterberg data missing and classification is not explicitly source-stated
- warn if visual description is used as classification input
```

---

### 6.7 `geotech tunnel`

Purpose: TBM selection, cutter wear, tunnelling support, NATM/EPB/slurry workflows.

Harness requirements:

```text
- separate factual ground evidence from design assumptions
- enforce missing-data lists
- require method-specific input validation
- trace risk ranking
```

Tools:

```text
tunnel.tbm_select
tunnel.epb_suitability
tunnel.slurry_suitability
tunnel.convertible_tbm_screen
tunnel.cutter_wear
tunnel.penetration_rate_predict
tunnel.face_pressure_check
tunnel.settlement_screening
tunnel.natm_support_class
tunnel.rmr_to_support_hint
tunnel.q_to_support_hint
tunnel.risk_register
viz.tunnel_alignment_zones
```

Review gates:

```text
- review required when groundwater pressure is unknown
- review required for mixed-face zones
- block final recommendation if ground model confidence below threshold
```

---

### 6.8 `geotech vision`

Purpose: image and visual evidence workflows.

Harness requirements:

```text
- every vision output must be evidence-bound
- vision model cannot be final authority for engineering calculation
- deterministic validators decide accepted values
```

Tools:

```text
vision.classify_image_type
vision.verify_crop
vision.read_symbol
vision.compare_ocr_alternatives
vision.corebox_fracture_detection
vision.rqd_from_corebox
vision.face_mapping_feature_detect
vision.piezometer_chart_read
image.crop
image.deskew
image.render_pdf_page
evidence.create_visual_ref
```

Review gates:

```text
- review required for symbol-only groundwater observations
- review required for low-quality image extraction
- block if no evidence crop is stored
```

---

### 6.9 `geotech ingest`

Purpose: structured ingestion of reports, images, AGS, spreadsheets, and geotechnical documents.

Harness requirements:

```text
- input type routing
- evidence normalization
- page/record classification
- schema extraction
- validators
- review package generation
```

Tools:

```text
file.detect_type
pdf.extract_text
pdf.render_pages
ocr.glm_layout_parse
ocr.normalize_blocks
document.classify_pages
borehole.extract_log
borehole.calibrate_depth_axis
lab.extract_tables
groundwater.extract_observations
geology.extract_units
evidence.store
review.build_integrated_html
```

Outputs:

```text
evidence/evidence.jsonl
extraction/boreholes.json
extraction/lab_tests.json
validation/validation.json
review/integrated_review.html
trace/run_trace.json
```

---

### 6.10 `geotech analyze`

Purpose: workspace intelligence and project-level readiness.

Harness requirements:

```text
- scan files
- classify data sources
- build manifest
- build preliminary ground model
- route readiness by workflow
- do not auto-run design unless explicitly requested
```

Tools:

```text
workspace.scan
workspace.hash_files
workspace.classify_files
ags.read
ags.validate
csv.infer_schema
xlsx.infer_schema
gis.detect_layers
cad.detect_drawings
ground_model.build_from_evidence
ground_model.validate
workflow.readiness_router
standards.detect_context
review.workspace_html
```

Review gates:

```text
- warn if local-grid coordinates detected
- warn if AGS and PDF data conflict
- block downstream design if required ground model fields missing
```

---

### 6.11 `geotech agent` and `geotech chat`

Purpose: agentic orchestration over CLI tools and skills.

Harness requirements:

```text
- model can only call approved tools
- every tool call is traced
- side-effecting tools require approval
- agent must cite evidence/tool outputs
- agent cannot invent design values
```

Tools:

```text
agent.plan
agent.route_workflow
agent.call_tool
agent.call_skill
agent.explain_field
agent.request_review
agent.summarize_trace
```

Policy:

```text
- allow read-only tools by default
- require confirmation for file writes outside output directory
- require confirmation for network calls except configured providers
- disallow destructive filesystem operations unless explicitly enabled
```

MCP compatibility:

```text
geotech mcp serve
```

Expose only approved tools through MCP. The MCP spec recommends making exposed tools visible to users and providing confirmation prompts for operations, so the CLI should show the tool name, arguments, and side-effect level before risky calls. [S4]

---

### 6.12 `geotech export`

Purpose: export structured data and reports.

Harness requirements:

```text
- export only validated data
- include provenance metadata
- include source CRS and display CRS
- include review warnings
```

Tools:

```text
export.write_json
export.write_csv
export.write_geojson
export.write_ags4
export.write_agsi
export.write_dxf
export.write_svg
export.write_pdf_report
export.write_calculation_sheet
export.package_artifacts
```

Geotechnical standard targets:

```text
AGS factual data
AGSi interpreted ground model data
GeoJSON geospatial output
CSV/JSON automation output
HTML review package
```

AGS is a standard transfer format for geotechnical and geoenvironmental site investigation data, and AGSi is a schema/transfer format for ground model and interpreted data. [S7][S8]

---

### 6.13 `geotech viz`

Purpose: deterministic visualization.

Harness requirements:

```text
- render only from validated JSON
- no model-generated final drawings
- show confidence and review status visually
```

Tools:

```text
viz.borehole_strip_log
viz.spt_depth_plot
viz.lab_depth_chart
viz.groundwater_summary
viz.ground_model_map
viz.stratigraphic_section
viz.liquefaction_profile
viz.bearing_calculation_summary
viz.tunnel_alignment_risk
viz.export_svg
viz.export_png
viz.export_html
```

Review gates:

```text
- block map if CRS validation failed
- warn if vertical datum missing for elevation section
- mark interpolated surfaces as conceptual
```

---

### 6.14 New command group: `geotech tool`

Purpose: expose the tool registry directly.

Commands:

```bash
geotech tool list
geotech tool list --domain foundation
geotech tool show bearing.meyerhof_capacity
geotech tool run bearing.meyerhof_capacity --input input.json
geotech tool validate bearing.meyerhof_capacity
geotech tool test bearing.meyerhof_capacity
geotech tool doctor
```

This solves the “skills are many, tools are too low” issue.

---

### 6.15 New command group: `geotech harness`

Purpose: run, audit, replay, evaluate, and debug harnessed workflows.

Commands:

```bash
geotech harness list
geotech harness show borehole-log-extraction-v1
geotech harness run borehole-log-extraction-v1 report.pdf --output out/
geotech harness audit out/
geotech harness replay out/traces/run_trace.json
geotech harness explain out/ --field "boreholes[2].strata[1].base"
geotech harness eval borehole ./golden --profiles glm_default,user_custom
geotech harness doctor
```

---

### 6.16 New command group: `geotech geo`

Purpose: CRS validation, coordinate transformation, section-line generation, geospatial exports.

Tools:

```text
geo.detect_crs_candidates
geo.validate_crs_area_of_use
geo.validate_coordinate_magnitude
geo.transform_crs
geo.detect_local_grid
geo.fit_local_grid_transform
geo.compute_chainage
geo.create_section_line
geo.write_geojson
geo.write_section_line_geojson
```

Commands:

```bash
geotech geo validate boreholes.json --project-country GB --crs auto
geotech geo transform boreholes.json --source-crs EPSG:27700 --target-crs EPSG:4326
geotech geo section boreholes.json --line auto --vertical-datum mAOD
```

---

### 6.17 New command group: `geotech qa`

Purpose: QA/QC across project artifacts.

Tools:

```text
qa.compare_pdf_vs_ags
qa.detect_duplicate_boreholes
qa.detect_depth_gaps
qa.detect_coordinate_outliers
qa.detect_lab_outliers
qa.detect_groundwater_conflicts
qa.check_required_design_inputs
qa.generate_missing_data_list
qa.generate_review_actions
```

Commands:

```bash
geotech qa project out/
geotech qa boreholes out/extraction/boreholes.json
geotech qa coordinates out/extraction/boreholes.json
geotech qa readiness out/ --workflow shallow-foundation
```

---

## 7. Proposed tool expansion roadmap

### Current problem

Skills are relatively high-level. The CLI needs a larger set of smaller tools so agents can act precisely and traces can be audited.

Target:

```text
MVP tool count: 80-120
Production tool count: 180-250
```

### 7.1 Core and harness tools

```text
core.read_json
core.write_json
core.hash_file
core.hash_directory
core.create_artifact_dir
core.validate_schema
core.diff_json
core.merge_json_patch
core.redact_secrets
core.capture_environment
harness.load_command_spec
harness.validate_manifest
harness.record_trace_event
harness.apply_review_gate
harness.explain_field
```

### 7.2 Evidence tools

```text
evidence.create_ref
evidence.resolve_ref
evidence.require_ref
evidence.store_crop
evidence.store_page_image
evidence.link_field
evidence.find_conflicts
evidence.merge_packets
evidence.render_overlay
evidence.audit_coverage
```

### 7.3 File and data tools

```text
file.detect_type
file.scan_workspace
file.extract_archive
pdf.extract_text
pdf.render_page
pdf.extract_tables
ocr.parse_layout
ocr.normalize_blocks
csv.read
csv.validate_schema
xlsx.read_sheets
ags.read
ags.validate
ags.map_groups
gis.read_layers
cad.detect_entities
```

### 7.4 Units and constants tools

```text
units.normalize_length
units.normalize_stress
units.normalize_density
units.normalize_force
units.normalize_angle
units.convert_depth_profile
units.validate_unit_system
constants.water_unit_weight
constants.gravity
```

### 7.5 Geospatial tools

```text
geo.detect_crs_candidates
geo.validate_crs_area_of_use
geo.validate_coordinate_magnitude
geo.transform_crs
geo.detect_local_grid
geo.fit_local_grid_transform
geo.compute_chainage
geo.project_points_to_section
geo.interpolate_section_line
geo.write_geojson
geo.read_geojson
geo.bounding_box
```

### 7.6 Borehole and ground model tools

```text
borehole.normalize_id
borehole.validate_depths
borehole.detect_duplicate_ids
borehole.merge_pages
borehole.calibrate_depth_axis
borehole.extract_spt
borehole.extract_samples
borehole.extract_groundwater
borehole.render_strip_log
ground_model.build_layers
ground_model.correlate_strata
ground_model.flag_inconsistent_boundaries
ground_model.compute_layer_statistics
ground_model.section_interpolate
```

### 7.7 Soil classification and lab tools

```text
lab.parse_particle_size
lab.parse_atterberg
lab.parse_moisture_content
lab.parse_unit_weight
lab.parse_triaxial
lab.parse_oedometer
lab.validate_lab_ranges
classify.uscs
classify.aashto
classify.plasticity_chart
classify.soil_description_tokens
classify.source_stated_classification
```

### 7.8 Foundation tools

```text
foundation.pad_geometry
foundation.strip_geometry
foundation.raft_geometry
bearing.terzaghi_capacity
bearing.meyerhof_capacity
bearing.hansen_capacity
bearing.vesic_capacity
bearing.water_table_correction
settlement.elastic_settlement
settlement.consolidation_settlement
settlement.raft_differential_screen
foundation.option_screen
foundation.missing_data
```

### 7.9 Pile tools

```text
pile.axial_capacity_static
pile.shaft_resistance_alpha
pile.shaft_resistance_beta
pile.end_bearing
pile.negative_skin_friction_screen
pile.group_efficiency
pile.lateral_p_y_screen
pile.settlement_screen
pile.drivability_screen
```

### 7.10 Retaining and excavation tools

```text
retaining.earth_pressure_rankine
retaining.earth_pressure_coulomb
retaining.surcharge_pressure
retaining.water_pressure
retaining.base_heave_screen
retaining.bottom_stability
retaining.wall_deflection_screen
excavation.dewatering_screen
excavation.strut_load_envelope
```

### 7.11 Slope tools

```text
slope.infinite_slope_fs
slope.planar_failure_screen
slope.circular_failure_screen
slope.wedge_failure_screen
slope.rainfall_sensitivity
slope.groundwater_sensitivity
slope.mechanism_classifier
```

### 7.12 Liquefaction and seismic tools

```text
seismic.total_stress
seismic.effective_stress
liquefaction.csr
liquefaction.magnitude_scaling_factor
liquefaction.nceer_crr_spt
liquefaction.bi2014_crr_spt
liquefaction.fines_correction
liquefaction.factor_of_safety
liquefaction.lpi
liquefaction.post_liquefaction_settlement_screen
```

### 7.13 Tunnel tools

```text
tunnel.tbm_select
tunnel.epb_suitability
tunnel.slurry_suitability
tunnel.convertible_tbm_screen
tunnel.face_pressure_screen
tunnel.settlement_screen
tunnel.cutter_wear
tunnel.penetration_rate
tunnel.natm_support_class
tunnel.monitoring_trigger_check
```

### 7.14 Groundwater and monitoring tools

```text
groundwater.normalize_observation
groundwater.hydrostatic_pressure
groundwater.piezometer_trend
groundwater.drawdown_screen
groundwater.dewatering_risk
monitoring.parse_inclinometer
monitoring.parse_settlement_points
monitoring.parse_piezometer
monitoring.trigger_level_check
monitoring.trend_alarm
```

### 7.15 Visualization tools

```text
viz.borehole_strip_log
viz.stratigraphic_section
viz.map_boreholes
viz.spt_depth_plot
viz.lab_depth_plot
viz.groundwater_time_series
viz.liquefaction_profile
viz.foundation_option_matrix
viz.tunnel_alignment_risk
viz.export_html
viz.export_svg
viz.export_png
viz.export_pdf
```

### 7.16 Export tools

```text
export.json
export.csv
export.xlsx
export.ags4
export.agsi
export.geojson
export.dxf
export.svg
export.html_review
export.calculation_report
export.zip_package
```

---

## 8. Harness manifests

Create one manifest per command/workflow.

Example: `harness/manifests/bearing.capacity.v1.yaml`

```yaml
id: bearing.capacity.v1
command: geotech bearing
version: 1.0.0

input_schema: schemas/foundation/bearing_input.schema.json
output_schema: schemas/foundation/bearing_output.schema.json

required_tools:
  - units.normalize_length
  - units.normalize_stress
  - soil.compute_effective_stress
  - bearing.meyerhof_capacity
  - bearing.factor_of_safety

validators:
  - validators.common.positive_dimensions
  - validators.foundation.bearing_parameter_ranges
  - validators.foundation.water_table_consistency

review_gates:
  - id: no_source_evidence_for_design
    severity: review_required
    when: input.source == "extracted" && evidenceCoverage < 0.98

artifacts:
  - bearing_result.json
  - bearing_calculation_sheet.md
  - trace/run_trace.json
```

Example: `harness/manifests/geospatial.review.v1.yaml`

```yaml
id: geospatial.review.v1
command: geotech geo
version: 1.0.0

required_tools:
  - geo.detect_crs_candidates
  - geo.validate_crs_area_of_use
  - geo.validate_coordinate_magnitude
  - geo.transform_crs
  - geo.compute_chainage
  - viz.map_boreholes
  - viz.stratigraphic_section

review_gates:
  - id: missing_crs
    severity: blocked
    when: crs.status == "missing"

  - id: local_grid_without_transform
    severity: blocked
    when: crs.type == "local_grid" && transformParameters == null

  - id: missing_vertical_datum
    severity: review_required
    when: output.includesElevationSection == true && verticalDatum == null
```

---

## 9. Repository documentation harness

Add:

```text
AGENTS.md
docs/harness/index.md
docs/harness/command-lifecycle.md
docs/harness/tool-registry.md
docs/harness/review-gates.md
docs/harness/tracing.md
docs/tools/catalog.md
docs/tools/authoring.md
docs/workflows/
docs/validators/
docs/schemas/
docs/evals/
docs/decisions/
```

### AGENTS.md

Keep `AGENTS.md` short and route Codex to detailed docs.

```md
# AGENTS.md

You are working on geotechCLI.

Read first:
- docs/harness/index.md
- docs/harness/command-lifecycle.md
- docs/tools/catalog.md
- docs/validators/common-rules.md

Rules:
- All CLI commands must use runHarness.
- Do not add a new command without a CommandSpec.
- Do not add a new tool without a ToolSpec, schemas, guardrails, tests, and trace metadata.
- Do not export extracted engineering values without evidence IDs.
- Do not render maps before CRS validation.
- Do not render final visualizations from LLM-generated images.
```

OpenAI’s harness-engineering article emphasizes making repo-local knowledge and tools legible to agents rather than relying on ad hoc prompting. [S1]

---

## 10. Testing and evaluation

### 10.1 Tool tests

Every tool must have:

```text
- schema validation tests
- normal case tests
- edge case tests
- invalid input tests
- snapshot output tests where appropriate
```

### 10.2 Command tests

Every command must have:

```text
- CLI argument tests
- JSON output tests
- trace output tests
- guardrail tripwire tests
- review gate tests
```

### 10.3 Harness evals

Add:

```bash
geotech harness eval all ./golden
geotech harness eval bearing ./golden/foundation
geotech harness eval liquefaction ./golden/liquefaction
geotech harness eval ingest ./golden/reports
geotech harness eval geo ./golden/geospatial
```

Metrics:

```text
- valid JSON rate
- validator pass rate
- missing evidence rate
- hallucinated value rate
- calculation reproducibility
- CRS detection accuracy
- map-block correctness
- review-required correctness
- cost per run
- latency per run
```

---

## 11. Step-by-step Codex implementation plan

### Phase 1 — Harness kernel skeleton

Implement:

```text
src/harness/kernel/runHarness.ts
src/harness/specs/commandSpec.ts
src/harness/specs/toolSpec.ts
src/harness/kernel/toolRegistry.ts
src/harness/kernel/traceRecorder.ts
src/harness/kernel/guardrailRunner.ts
src/harness/kernel/validatorRunner.ts
```

Acceptance:

```bash
geotech harness doctor
geotech tool list
```

must run.

---

### Phase 2 — Wrap deterministic commands

Wrap:

```text
geotech bearing
geotech classify
geotech liquefaction
geotech tunnel
```

Acceptance:

```bash
geotech bearing --depth 5 --phi 30 --json
```

must produce:

```text
- normal stdout result
- JSON result
- trace file when --trace is enabled
- validation status
```

---

### Phase 3 — Add tool registry and first 40 tools

Implement first tools:

```text
units.*
bearing.*
classify.*
liquefaction.*
geo.*
viz.borehole_strip_log
export.json
export.csv
```

Acceptance:

```bash
geotech tool list --domain bearing
geotech tool run bearing.meyerhof_capacity --input examples/bearing.json
```

---

### Phase 4 — Harness `analyze`, `ingest`, and `vision`

Wrap AI/document commands.

Acceptance:

```bash
geotech ingest report.pdf --type borehole-log --output out/
```

must write:

```text
out/evidence/evidence.jsonl
out/extraction/boreholes.json
out/validation/validation.json
out/traces/run_trace.json
```

---

### Phase 5 — Add `geo`, `qa`, and integrated review UI

Implement:

```bash
geotech geo validate
geotech geo transform
geotech geo section
geotech qa project
geotech review build
```

Acceptance:

```bash
geotech review build out/ --template integrated
```

must generate the integrated HTML review UI.

---

### Phase 6 — Agent and MCP tool exposure

Add:

```bash
geotech mcp serve
geotech agent --tools
geotech chat --tools
```

Acceptance:

```text
- only approved tools exposed
- side-effecting tools require confirmation
- every tool call traced
- tool schemas visible
```

MCP supports listing and calling tools through schema-described messages, which fits the planned registry model. [S4]

---

### Phase 7 — Evals and release gates

Implement:

```bash
geotech harness eval
geotech harness audit
geotech harness replay
geotech harness explain
```

Acceptance:

```text
- golden dataset can be run in CI
- provider profiles can be compared
- release can fail on regression thresholds
```

---

## 12. Codex implementation prompt

Use this prompt with GPT-5.5 Codex xhigh:

```text
Implement CLI-wide harness engineering for geotechCLI.

Do not focus only on PDF/OCR workflows. Every command must be routed through the harness kernel.

Primary deliverables:
1. Add runHarness as the universal command runtime.
2. Add CommandSpec and ToolSpec schemas.
3. Add a ToolRegistry with list/show/run/validate commands.
4. Add trace recording for every command.
5. Add input, tool, output, and export guardrails.
6. Add review gates.
7. Wrap deterministic commands first: bearing, classify, liquefaction, tunnel.
8. Wrap document/AI commands next: vision, ingest, analyze.
9. Add new command groups: tool, harness, geo, qa.
10. Implement at least 40 tools in the first pass, then expand toward 120.
11. Preserve provider-agnostic behavior. GLM is the default profile, not a hard dependency.
12. Never export extracted engineering values without evidence IDs.
13. Never render maps before CRS validation.
14. Every tool must have an input schema, output schema, tests, guardrails, and trace metadata.
15. Add AGENTS.md and docs/harness/* so future Codex runs understand the architecture.

Acceptance criteria:
- geotech harness doctor passes.
- geotech tool list shows registered tools.
- geotech bearing still works but now emits harness metadata with --json or --trace.
- geotech ingest writes evidence, extraction, validation, and trace artifacts.
- geotech geo validate blocks ambiguous CRS.
- geotech review build uses integrated extracted data, not disconnected mock data.
- CI includes tool tests, command tests, harness tests, and eval smoke tests.
```

---

## 13. Citations and design references

[S1] OpenAI, “Harness engineering: leveraging Codex in an agent-first world.”  
https://openai.com/index/harness-engineering/

[S2] Anthropic, “Building effective agents.”  
https://www.anthropic.com/engineering/building-effective-agents

[S3] OpenAI Agents SDK documentation.  
https://openai.github.io/openai-agents-python/

[S4] Model Context Protocol, “Tools.”  
https://modelcontextprotocol.io/specification/2025-06-18/server/tools

[S5] OpenAI Agents SDK, “Guardrails.”  
https://openai.github.io/openai-agents-python/guardrails/

[S6] geotechCLI strong beta docs.  
https://beta.geotechcli.com/docs

[S7] British Geological Survey, “AGS data format.”  
https://www.bgs.ac.uk/ngdc/ags-data-format/

[S8] AGS, “AGSi Ground Model.”  
https://www.ags.org.uk/data-format/agsi-ground-model/

[S9] pyproj Transformer documentation.  
https://pyproj4.github.io/pyproj/stable/api/transformer.html

[S10] OpenAI Agents SDK, “Tracing.”  
https://openai.github.io/openai-agents-python/tracing/

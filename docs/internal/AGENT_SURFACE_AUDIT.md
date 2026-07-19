# geotechCLI Agentic Surface — Audit

_Last updated: 2026-06-20 · Scope: map the LLM-active agentic surface, the tools the agent can call, and what dataset context the LLM actually receives, vs the "LLM actively works on the datasets" product vision._

## Summary

The LLM-active agentic engine exists and works: `geotech chat` and `geotech agent` run a real ReAct
loop over a ~50-tool catalog, and the provider is pluggable (default GLM-5.2 or BYOK). The gaps are
**not** about whether the LLM reasons — they are about **what it is allowed to see**. The richest
asset, the deterministic evidence-bound `GroundModel` that `geotech analyze` builds, is currently
reduced to **counts** before it reaches the agent, and there is no read-only tool to query it. The
highest-leverage, trust-preserving improvement is to expose that GroundModel to the agent.

Design intent to preserve (confirmed direction): keep `analyze` deterministic and `agent`/`chat` as the
explicit LLM layer, but **sharpen what the agent sees** — the LLM orchestrates and interprets;
deterministic code still owns every number.

---

## 1. The core is a real agent, and it is LLM-agnostic

- [`runAgent` — packages/core/src/agents/brain.ts:300](packages/core/src/agents/brain.ts#L300) is a
  genuine **ReAct loop**: system prompt → LLM emits a ` ```tool ` call → execute → feed the result
  back → repeat (max **8 iterations**), with guardrails, FEM-overclaim blocking, context compression,
  and a deterministic fallback when the hosted LLM is unavailable.
- [`geotech chat` — packages/cli/src/commands/ai.ts:2824](packages/cli/src/commands/ai.ts#L2824)
  wraps it in a memory-carrying REPL (`AgentConversation`).
- Provider is pluggable across **hosted-beta (GLM-5.2) / zhipu / openai / anthropic /
  openai-compatible / huggingface** ([config/index.ts:11](packages/core/src/config/index.ts#L11)).
  BYOK is real, and a provider-operating contract is injected so BYOK models receive the same rules.

**Verdict:** the LLM-active agentic engine envisioned for the product exists and functions. The work
ahead is about context richness, not the existence of the agent.

## 2. LLM-active entry points

| Verb | LLM role |
|---|---|
| `geotech chat` | interactive ReAct agent + session memory |
| `geotech agent "<q>"` | single-shot agent (auto-scans workspace into context) |
| `geotech agent … --swarm` | multi-role agent team (planner + reviewer) |
| `geotech agent … --route-with-model` | LLM proposes the workflow route |
| `geotech ingest` / `vision` / `gbr` / `report` | LLM document/image understanding + synthesis |

## 3. Tool catalog (~50 tools the agent can call)

- **Engineering calculators (deterministic):** bearing, liquefaction, pile, slope, lateral earth
  pressure, consolidation, Schmertmann settlement, tunnel settlement, USCS, Q-system, TBM
  performance/type, cutter wear (13) — [tools.ts](packages/core/src/agents/tools.ts)
- **Raw-data access:** `read_file`, `parse_csv`, `parse_ags`, `parse_cpt`, `list_directory`,
  `scan_project` — the LLM **can** reach actual file content
  ([filesystem-tools.ts](packages/core/src/agents/filesystem-tools.ts),
  [data-tools.ts](packages/core/src/agents/data-tools.ts))
- **Ingest pipeline:** `ingest_geotech_document` + async job tools (start/get/wait/load/list) +
  persisted-review workflow (list/load/promote/approve)
- **Signal:** `analyze_signal_file` · **Standards:** `query_standards`
- **FEM (planning only, gated):** `list_fem_capabilities`, `assess_fem_production_readiness`,
  `prepare_fem_analysis_case`, `validate_fem_analysis_case`, `check_fem_support_member_design`
- **Project memory:** `project_create/load/list/save_dataset/save_parameter/add_assumption/add_artifact/save_result`
- **Deliverables:** `generate_report`, `render_pdf`, `render_docx`,
  `export_csv/dxf/geojson/agsi/diggs`
- **Skills:** `list_skills`, `describe_skill`, `run_skill` · **Shell:** `run_command`

Breadth is genuinely strong; raw-data tools mean the LLM is not blind to file content.

## 4. What the LLM actually receives about the data — the crux

1. **System prompt = tool list + rules only.** No dataset content.
2. **Dataset context is injected as `sessionContext`**, but
   [`buildAgentRuntimeContext` — ai.ts:122](packages/cli/src/commands/ai.ts#L122) passes
   `groundModel: { stats, coordinateSystem }` — i.e. **counts** (`12 boreholes, 47 strata,
   9 evidence refs`), **not** the strata, SPT profiles, lab parameters, or groundwater depths.
3. **The rich GroundModel that `analyze` builds is discarded down to stats.** There is **no
   `query_ground_model` / `get_borehole_detail` tool** — to see, e.g., "BH-3 soft clay 2–8 m,
   N=4, cu=25 kPa," the agent must **re-parse the raw files** (`parse_ags`/`parse_csv`),
   re-deriving what `analyze` already computed.
4. **`geotech chat` starts cold** — it loads only stored project memory and does **not** auto-scan the
   current folder. `geotech agent --workspace` scans; `chat` does not
   ([ai.ts:2853](packages/cli/src/commands/ai.ts#L2853)).
5. **Tool results are truncated to 3,000 chars**
   ([brain.ts:645](packages/core/src/agents/brain.ts#L645)) and the **hosted loop budget is
   700 tokens/step** ([brain.ts:64](packages/core/src/agents/brain.ts#L64)) — fine for tool
   orchestration, tight for "reason across the whole dataset."

## 5. Gaps vs the "LLM actively works on the datasets" vision

| # | Gap | Sharpen (keeps the trust boundary) |
|---|---|---|
| **A** ⭐ | Deterministic GroundModel is not queryable by the agent — only stats injected | Add a **read-only `query_ground_model`** tool (strata, parameters, groundwater, per-borehole, evidence IDs). The LLM reasons over *interpreted* data; deterministic code still owns it |
| **B** | `chat` does not auto-load the project's dataset context | Have `chat` (optionally) auto-scan cwd and inject the same digest `agent --workspace` gets |
| **C** | Injected context is counts, not values | Feed a **bounded structured digest** (strata table, key params, GWL per borehole) within the token budget |
| **D** | 3 KB tool-result cap + 700-token steps limit dataset depth | Allow larger result windows / a "fetch more" tool for data-heavy questions |
| **E** | Deterministic preflight can answer before the LLM runs | By design — but worth a flag to force the agentic path |
| **F** | LLM verbs are not signposted from `analyze` | `analyze` output should route users to `geotech agent` / `geotech chat` |

## 6. Recommended highest-leverage next slice

**Gap A — expose the GroundModel as a read-only agent tool + a richer (bounded) context digest.**

It is the single change that most directly realizes _"the LLM understands and works on my datasets
through the agentic structure"_ and fits the "keep explicit, sharpen the agent" direction: the LLM
gains real visibility into the **deterministically built** ground model without ever owning the
numbers. **Gap B** (chat auto-context) is the natural follow-on.

### Acceptance sketch (for when this is scoped)

- New read-only tool `query_ground_model` returning strata / parameters / groundwater / per-borehole
  detail + evidence IDs from the already-built `GroundModel` (no recomputation, no writes).
- Richer-but-bounded GroundModel digest injected into `buildAgentRuntimeContext` (values, not just
  counts), within the hosted token budget.
- Tests: tool returns evidence-bound detail; agent context digest includes representative strata/
  parameter values; back-compat for workspaces with no GroundModel; trust boundary preserved (tool is
  read-only and cannot mutate or fabricate).

---

_Source files referenced: [brain.ts](packages/core/src/agents/brain.ts),
[ai.ts](packages/cli/src/commands/ai.ts), [tools.ts](packages/core/src/agents/tools.ts),
[data-tools.ts](packages/core/src/agents/data-tools.ts),
[filesystem-tools.ts](packages/core/src/agents/filesystem-tools.ts),
[config/index.ts](packages/core/src/config/index.ts),
[scanner.ts](packages/core/src/workspace/scanner.ts)._

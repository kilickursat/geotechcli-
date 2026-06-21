# geotechCLI Agentic Surface — Implementation Plans for Gaps D, E, F

_Created 2026-06-21 · Follow-on to [AGENT_SURFACE_AUDIT.md](AGENT_SURFACE_AUDIT.md). Gap A shipped in
0.4.129 (`query_ground_model` + bounded context digest). Gap B shipped on this branch (`geotech chat`
auto-scans the project folder into session context). This document plans the remaining sharpening gaps
D, E, F. Standing rules: preserve existing behavior, additive only (no refactor), tests gate each step,
trust boundary intact (LLM interprets; deterministic code owns every number), no release without
explicit approval._

---

## Gap D — Larger tool-result window / a "fetch more" affordance

### Problem (from the audit)
Tool results are serialized into the prompt capped at **3,000 chars**
([brain.ts:645](packages/core/src/agents/brain.ts#L645) — `serializeToolDataForPrompt(result.data, 3000)`)
and the hosted loop/final answer token budgets are **700 / 900**
([brain.ts:64](packages/core/src/agents/brain.ts#L64) — `getHostedAgentMaxTokens`). Fine for
calculator orchestration; too tight when the LLM legitimately needs to read a data-heavy result
(e.g. `query_ground_model section=all`, `parse_ags`, `parse_cpt`) to reason across the dataset. The
detail is truncated even when the LLM explicitly asked for it.

### Approach — additive, per-tool budget + paging signposts (no refactor of the loop)
1. **Per-tool result window.** Add `AgentRunOptions.toolResultMaxChars?` (default `3000`, unchanged)
   and a small constant set `DATA_TOOL_RESULT_CHARS` in [brain.ts](packages/core/src/agents/brain.ts)
   mapping read-only data tools (`query_ground_model`, `parse_ags`, `parse_csv`, `parse_cpt`,
   `read_file`, `analyze_signal_file`) to a larger budget (e.g. `8000`). At the call site (brain.ts:645)
   pick `DATA_TOOL_RESULT_CHARS[toolCall.tool] ?? options.toolResultMaxChars ?? 3000`. Calculators keep
   3 KB; data tools get a wider window. `serializeToolDataForPrompt` already accepts the cap as an arg —
   only the chosen number changes, so the agent-evidence-summary prefix logic is untouched.
2. **Compression headroom.** Confirm `COMPRESS_THRESHOLD` / `compressMessages`
   ([brain.ts:350](packages/core/src/agents/brain.ts#L350)) still triggers correctly with a larger
   single result, so a big data result can't blow the context — compression already runs each iteration;
   only verify the threshold is comfortably above the new per-tool max.
3. **Final-answer budget for data-rich sessions.** Make the hosted final-answer budget the higher of
   the current value and a data-aware bump (e.g. `1200`) when the session contains ≥1 data-tool result,
   so the LLM can actually synthesize across strata. Keep the loop budget at 700 (cheap orchestration);
   only the **final** synthesis grows, and only when data was read. Stays within hosted proxy limits.
4. **"Fetch more" is already partly real — signpost it.** `query_ground_model` already supports
   `section` / `boreholeId` / `limit` (shipped 0.4.129), which *is* the paging mechanism. Add one line to
   the system prompt / tool description: "Data tools are paginated — re-call `query_ground_model` with a
   higher `limit` or a specific `section`/`boreholeId` to fetch more detail." No new tool needed.

### Files
- [packages/core/src/agents/brain.ts](packages/core/src/agents/brain.ts) — `DATA_TOOL_RESULT_CHARS`
  const, per-tool cap selection at the result-serialization site, data-aware final-answer budget,
  optional `toolResultMaxChars` on `AgentRunOptions`.
- [packages/core/src/agents/safety.ts](packages/core/src/agents/safety.ts) — none required
  (`serializeToolDataForPrompt` already parameterized); add a unit assertion if convenient.
- System prompt builder in brain.ts — one paging sentence.

### Tests (`packages/core/tests/`)
- New `agent-tool-result-window.test.ts`: a registered fake data tool returning >3 KB is serialized at
  the wider budget; a fake calculator tool stays at 3 KB; `toolResultMaxChars` override honored.
- Assert the data-aware final-answer budget selection via a small exported pure helper
  (e.g. `selectFinalAnswerBudget(session, config)`), so it's testable without a live LLM.

### Risk / trust
Read-only; only changes how much already-computed data the LLM may *read*. No number is recomputed.
Cost/latency rise only for data-heavy turns; defaults unchanged for calculator turns. Verify the
hosted request stays under `HOSTED_BETA_REQUEST_SAFE_BYTES`.

---

## Gap E — Flag to force the agentic path past the deterministic preflight

### Problem (from the audit)
`runAgent` runs a **deterministic preflight** that can answer before the LLM loop starts
([brain.ts:325](packages/core/src/agents/brain.ts#L325) → `buildDeterministicPreflightAnswer` →
`buildGeotechnicalPreflightAnswer`, [runtime-fallbacks.ts:42](packages/core/src/agents/runtime-fallbacks.ts#L42)).
For some foundation/classification intents with actionable inline data, the user never reaches the LLM.
This is **by design** (fast, deterministic, trust-preserving) — but there is no way to say "actually run
the agent." The hook already exists: `AgentRunOptions.disableDeterministicPreflight`
([brain.ts:55](packages/core/src/agents/brain.ts#L55)) is honored at brain.ts:325; it is simply never set
from the CLI.

### Approach — expose the existing option as an opt-in CLI flag (thread it through; no new logic)
1. **`geotech agent --force-agent`.** Add the flag to
   [registerAgentCommand](packages/cli/src/commands/ai.ts#L2450). Pass a 5th arg to the single-agent call
   (`runAgent(agentTask, config, cb, runtimeContext, { disableDeterministicPreflight: opts.forceAgent === true })`,
   [ai.ts:2771](packages/cli/src/commands/ai.ts#L2771)). (Swarm path deferred — it has separate routing;
   note it explicitly.)
2. **`geotech chat --force-agent`.** Extend `AgentConversation.ask`
   ([brain.ts:724](packages/core/src/agents/brain.ts#L724)) to accept an optional
   `options?: AgentRunOptions` and forward it to `runAgent` (currently calls with 4 args). Store the
   session's run options on the `AgentConversation` (constructor `runOptions?`) or pass per `ask`. The
   chat command sets `disableDeterministicPreflight` from `--force-agent`. This is the only core change,
   and it is purely additive (new optional param; existing callers unaffected).
3. **UX.** When forced, print a one-line gray note ("Forcing the LLM agent path; deterministic preflight
   disabled."). Keep the default OFF — the deterministic preflight stays the default trust-preserving
   behavior the product intends.

### Files
- [packages/core/src/agents/brain.ts](packages/core/src/agents/brain.ts) — `AgentConversation.ask`
  (+ optional constructor `runOptions`) forwarding `AgentRunOptions` to `runAgent`. `AgentRunOptions`
  and `disableDeterministicPreflight` already exist.
- [packages/cli/src/commands/ai.ts](packages/cli/src/commands/ai.ts) — `--force-agent` on `agent` and
  `chat`; thread the option into the `runAgent` call and the `AgentConversation` usage.

### Tests
- `packages/cli/tests/agent-command.test.ts`: `agent "<q>" --force-agent --no-workspace` →
  `runAgent` called with a 5th arg `{ disableDeterministicPreflight: true }`; without the flag → the
  current 4-arg call (back-compat) preserved.
- `packages/cli/tests/chat-command.test.ts`: `chat --force-agent` → `conversation.ask` receives the run
  options (extend the `AgentConversation` mock to capture `ask`'s 4th arg).
- `packages/core/tests/` (existing brain/agent tests): a `disableDeterministicPreflight: true` run skips
  the preflight short-circuit and enters the loop even for a preflight-eligible query.

### Risk / trust
Opt-in only; default behavior identical. No determinism removed — it just lets the user route a question
through the LLM loop instead of the deterministic shortcut. Trust boundary unchanged (the loop still owns
no numbers; calculators do).

---

## Gap F — Signpost the LLM verbs from `analyze` output

### Problem (from the audit)
`geotech analyze` produces the rich manifest but never tells the user the LLM-active next step. After the
deterministic tables it prints recommendations + "Open browser report"
([analyze.ts:156-244](packages/cli/src/commands/analyze.ts#L156-L244)) but not "ask the agent about this
data." New users don't discover `geotech agent` / `geotech chat`.

### Approach — additive output footer (text format only; JSON/HTML untouched)
1. In `renderTextManifest` (or right after it in the action, [analyze.ts:240](packages/cli/src/commands/analyze.ts#L240)),
   add a gray "Work with this data using the AI agent:" footer printing two concrete, copy-pasteable
   commands seeded from the actual scan:
   - `geotech chat` — "interactive agent; the project folder is auto-scanned into context" (Gap B).
   - `geotech agent "<contextual question>"` — pick the question from the manifest (e.g. if a GroundModel
     exists → `"interpret the ground model and flag the main risks"`; else if monitoring branch →
     `"review the monitoring trends"`; else a generic `"what can you tell me about this project data?"`).
2. Gate behind `!flags.quiet` and text format only (skip for `--json` / `--format html`), mirroring the
   existing "Open browser report" hint so machine output is unaffected.
3. Keep it short (2–3 lines). No behavioral change; pure signposting.

### Files
- [packages/cli/src/commands/analyze.ts](packages/cli/src/commands/analyze.ts) — footer in the text
  render path; a tiny pure helper `suggestAgentQuestion(manifest): string` for the contextual prompt.

### Tests
- `packages/cli/tests/analyze.test.ts`: text run prints `geotech chat` and `geotech agent` lines;
  `--json` and `--format html` runs do NOT; `suggestAgentQuestion` picks ground-model vs monitoring vs
  generic from the manifest shape.

### Risk / trust
Cosmetic/UX only. No engineering output changes. Lowest-risk of the three.

---

## Suggested sequencing & release shape

| Order | Gap | Surface | Effort | Risk |
|------|-----|---------|--------|------|
| 1 | **B** (done) | `chat` auto-context | — | low (additive, tested) |
| 2 | **F** | `analyze` signpost | small | lowest |
| 3 | **E** | `--force-agent` | small | low (opt-in) |
| 4 | **D** | result window / paging | medium | low–medium (cost/latency on data turns) |

Each is independently shippable. Recommended: **B + F + E** in one release (all additive, all
low-risk, together they make the agent discoverable, auto-contextual, and forceable), then **D** as a
focused follow-up since it touches token/cost budgets and deserves its own verification. Alternatively,
ship **B alone now** and bundle **D/E/F** next. Final call is the user's.

## Out of scope (still deferred)
Swarm-path `--force-agent`; DIGGS/AGSi round-trip *import*; the larger FEM execution goal; corpus trend
contracts for continuity/coordinate/lithology metrics. (Carried from the audit's deferral list.)

# Changelog

## [0.2.0] — 2026-03-30

### Security Fixes (P0)

- **Filesystem sandbox** — All agent filesystem tools (`read_file`, `write_file`, `parse_csv`, `scan_project`, `list_directory`) now validate paths through `sandbox.ts`. Blocks access to `.ssh`, `.aws`, `.gnupg`, `/etc`, `/proc`, and other sensitive system directories. Symlink escape prevention via `realpathSync` re-check.
- **Shell command hardening** — `run_command` tool now uses centralized `validateShellCommand()`. Blocks `python -c`, `python -m`, pipe operators, redirects, `curl`, `wget`, `sudo`, and all destructive commands. Only allows read-only commands and `python <script.py>`.
- **Fail-closed proxy** — Production proxy (`/api/proxy`) now refuses all requests if `PROXY_SECRET` is not configured when `NODE_ENV=production`.
- **Registration rate limiting** — `/api/auth` registration endpoint limited to 5 attempts per IP per hour.
- **PLAXIS bridge hardened** — Added `open(`, `write(`, `unlink` to blocked PLAXIS command patterns.

### New Calculation Modules

- **Pile capacity** (`geotech pile`) — α-method (Tomlinson) for cohesive soils, β-method (Burland) for cohesionless soils, SPT-based (Meyerhof 1976) for driven piles. Supports driven/bored/CFA piles, multi-layer soils, water table, per-layer shaft friction breakdown. References: API RP 2GEO, Eurocode 7 §7.6.
- **Slope stability** (`geotech slope`) — Bishop Simplified method with automatic critical circle search. Multi-layer soils, water table, surcharge, pseudo-static seismic loading (kh). Returns FOS, stability class (STABLE/MARGINAL/UNSTABLE/CRITICAL), and slice-by-slice results. References: Duncan & Wright (2005), Eurocode 7 §11.
- **Lateral earth pressure** (`geotech retaining`) — Rankine and Coulomb methods for active, passive, and at-rest (Jaky K0) states. Wall friction angle (δ), sloping backfill (β), wall inclination (α), water table, surcharge. Full pressure distribution profile. References: Eurocode 7 §9.

### Engineering Accuracy Fix

- **Water table correction in bearing capacity** — Implemented 3-case water table correction: (1) GWT above foundation → reduced γ' in both Nq and Nγ terms, (2) GWT within influence zone (D to D+B) → interpolated γ_eff in Nγ term, (3) GWT below D+B → no correction. Previously the `waterTableDepth` parameter was accepted but ignored, which could produce unconservative results for sites with shallow water tables.

### Standards Database

- Added **JGS 0121** (Japanese SPT), **JGS 4101** (Japanese pile design), **JSCE C7.11** (NATM tunnel classification), **NEXCO tunnel design**, **JSCE FOS standards**
- Added Eurocode 7 pile shaft resistance (§7.4), slope stability methods (§11.5), retaining wall design checks (§9.5)
- Added Schmertmann (1970/1978) and Meyerhof pile (1976) provisions
- Standards database expanded from 12 to 20+ provisions

### Agent & Guardrails

- **3 new Poka-Yoke guardrail sets** for pile capacity, slope stability, and lateral earth pressure. Validates: pile L/D ratio, zero-strength soil layers, wall friction angle vs soil friction, seismic coefficient range.
- **Swarm simulation agent** now has access to all 3 new calculation tools.
- **Tool registry** expanded from 26 to 29+ registered tools.

### CLI Improvements

- **`--quiet` flag** — Suppress all non-essential output (for scripting).
- **`--dry-run` flag** — Show what would be calculated without executing.
- Removed v0.2 placeholder commands; `settlement` now points to agent workaround.
- Version bumped to 0.2.0 across all packages.

### Test Suite

- **~120 new tests** covering: pile capacity (4 tests), slope stability (3 tests), lateral earth pressure (6 tests), bearing capacity water table correction (2 tests), filesystem sandbox (5 tests), shell command sandbox (8 tests), new tool registration verification (4 tests).
- Total test coverage now includes all deterministic calculation modules, guardrails, sandbox, standards, and export formats.

### Documentation

- README updated with new commands, quick start examples, expanded security section.
- Global flags table updated with `--quiet` and `--dry-run`.

---

## [0.1.0] — 2026-03-15

Initial release. See README for full feature list.

### P1 Fixes (added in v0.2.0 final)

- **Persistent CLI usage counters** — `FileUsageStore` replaces `InMemoryUsageStore` in the CLI. Usage counters now persist to `~/.geotechcli/usage.json` across process restarts, so the unregistered 5-call limit and monthly quotas are enforced across sessions. File secured to `0600` permissions.
- **Email verification flow** — Registration now requires 2 steps: (1) `POST /api/auth {action:"register", email}` sends a 6-digit verification code (10-min TTL, 5 attempts max), (2) `POST /api/auth {action:"verify", email, code}` verifies and creates the account. API key is only returned after verification. Dev mode includes code in response; production requires email delivery (SendGrid/Resend integration point provided).
- **Structured logging** — `logger.ts` replaces all `console.error/log/warn` in API routes. Production mode outputs JSON lines (Datadog/Cloudflare Logpush compatible); dev mode outputs human-readable. All sensitive fields (`api_key`, `token`, `secret`, `password`) auto-redacted. Proxy route: 0 console calls remaining. Webhook route: 0 console calls remaining.
- **`--quiet` and `--dry-run` flags fully wired** — Both flags defined in `flags.ts` AND consumed in 6 command handlers (bearing, liquefaction, pile, slope, retaining, ai/agent/swarm). `--quiet` outputs only the key result value (for piping). `--dry-run` shows parameters without executing.

### Pre-Launch Critical Fixes

- **Webhook idempotency** — Stripe webhook handler now tracks processed event IDs in memory (24-hour TTL with hourly cleanup). Duplicate events are detected by `event.id` and acknowledged without re-processing. Prevents double-activation of subscriptions or double-downgrades from retry deliveries. For multi-instance deployments, swap the `Map` for Redis `SET` + `EXPIRE`.
- **ReAct brain → proper message arrays** — `brain.ts` completely rewritten. Replaces string concatenation (`conversationHistory += ...`) with a proper `ChatMessage[]` array using alternating `user`/`assistant` roles. New `generateChat()` function in the LLM router accepts multi-turn message arrays directly. Context window management: when conversation exceeds ~10K tokens, older tool exchanges are automatically compressed into a summary message (keeps system prompt, user query, and last 4 messages intact). Tool result data is compacted (no pretty-print, truncated at 3K chars) to save tokens.
- **Swarm agent loop also fixed** — `swarm.ts` `runAgentLoop` rewritten with the same message-array pattern. All 3 swarm agents (interpretation, simulation, reviewer) now use proper multi-turn conversations instead of string concatenation.

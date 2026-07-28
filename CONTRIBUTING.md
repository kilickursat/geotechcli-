# Contributing to geotechCLI

Thanks for helping build the open-source agentic AI CLI for geotechnical engineering!
Contributions of every size are welcome — bug reports from real project data are especially
valuable. You never need to be a sponsor to contribute — issues and PRs are open to everyone
and sponsorship is never a paywall. If you would like to support the project financially,
[GitHub Sponsors](https://github.com/sponsors/kilickursat) offers monthly tiers and one-time
contributions.

## Quick start (dev setup)

```bash
git clone https://github.com/kilickursat/geotechcli-.git
cd geotechcli-
npm ci
npm run build                       # build all packages (Turborepo)
npm test --workspace=packages/core  # core test suite
npm run smoke:agent-tasks           # deterministic agent benchmark (zero network)
npm run verify:consistency          # release-surface consistency guard
```

Node 22+ recommended. The repo is TypeScript throughout (npm workspaces:
`packages/cli`, `packages/core`, `packages/web`).

## Branch flow — PRs target `strong-beta`

| Branch | Purpose |
|--------|---------|
| `strong-beta` | Integration branch — **open your PR against this branch.** Releases from here publish npm under the `beta` dist-tag and deploy the beta site. |
| `main` | Production — updated by maintainer merges from `strong-beta`; promotes npm `latest` and deploys www.geotechcli.com. Never PR directly to `main`. |
| `master` | Legacy development branch. |

Fork → feature branch → PR into `strong-beta`. The maintainer reviews, merges, and cuts
releases (every `strong-beta` release carries a version bump + CHANGELOG entry — maintainer
handles this unless you're asked to include it).

## The trust boundary (non-negotiable)

geotechCLI's core promise: **the LLM interprets and orchestrates; deterministic code owns every
number.** PRs must preserve this:

1. **No LLM-owned numbers.** Engineering values come from deterministic engines with tests —
   never from model output. New calculations follow published methods with citations in comments.
2. **Evidence-bound data.** Extracted values carry evidence references (source page/row);
   unverifiable values become explicit review gates, not silent guesses.
3. **Fail closed.** Guards (FEM artifact guards, reviewer contracts, tool allowlists) must
   stay fail-closed. If your change can fail, it must fail blocked — not approved.
4. **Benchmarks stay green.** `npm run smoke:agent-tasks` gates CI; if your change breaks a
   scenario, fix the change or (with justification) evolve the scenario in the same PR.
5. **No secrets, ever.** CI scans every push. Test tokens must be obviously fake and
   non-alphanumeric-only (e.g. `sk-test_fake_...`) so the secret scan ignores them.

## Adding a new calculation (the standard path)

1. Implement in `packages/core/src/geo/` with a Zod schema and unit tests.
2. Register as an agent tool in `packages/core/src/agents/tools.ts`.
3. Add physical-constraint guardrails in `packages/core/src/agents/guardrails.ts`.
4. Add to the swarm tool allowlists in `packages/core/src/agents/swarm.ts` where appropriate.
5. Add the CLI command in `packages/cli/src/commands/` and export from `packages/core/src/geo/index.ts`.
6. Consider an agent-task benchmark scenario if the tool changes agent behavior.

## Before opening a PR

```bash
npm run verify:consistency
npm test --workspace=packages/core
npm run smoke:agent-tasks
npx tsc --noEmit   # in packages/core (and packages/cli if touched)
```

Match the surrounding code style; keep comments for constraints the code can't express.
By contributing you agree your contribution is licensed under [Apache-2.0](LICENSE)
(see LICENSE §5 — no CLA needed).

## Releases (maintainer)

npm publishing uses Trusted Publishing/OIDC from `release.yml` on `strong-beta` (dist-tag
`beta`); merging to `main` promotes `latest`. See `.github/workflows/release.yml`.

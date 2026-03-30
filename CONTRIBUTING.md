# Contributing to geotechCLI

## Branching Strategy

```
main ──────●──────────●──────── (production, CI-gated)
           ↑ PR+CI    ↑ PR+CI
dev ──●──●─┴──●──●────┴──●──── (development, CI on push)
      ↑  ↑    ↑
      feature branches
```

| Branch | Purpose | Protected |
|--------|---------|-----------|
| `main` | Production. Only via PR from `dev`. | Yes — CI must pass |
| `dev` | Integration. All work merges here first. | No — CI runs on push |
| `feature/*` | Individual fixes/features. | No |
| `hotfix/*` | Emergency fixes. PR to main + dev. | Same as main |

## Daily Workflow

```bash
git checkout dev && git pull
git checkout -b feature/my-fix
# ... work, test ...
npm test --workspace=packages/core
git push -u origin feature/my-fix
# Merge into dev → When stable, PR dev → main
```

## Adding a New Calculation

1. Implement in `packages/core/src/geo/` with Zod schema
2. Register as tool in `packages/core/src/agents/tools.ts`
3. Add guardrails in `packages/core/src/agents/guardrails.ts`
4. Add to swarm tool list in `packages/core/src/agents/swarm.ts`
5. Write tests in `packages/core/tests/core.test.ts`
6. Add CLI command in `packages/cli/src/commands/`
7. Export from `packages/core/src/geo/index.ts`

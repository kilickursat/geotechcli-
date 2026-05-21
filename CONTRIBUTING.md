# Contributing to geotechCLI

## Branching Strategy

geotechCLI uses this branch flow:

`feature/* -> master -> strong-beta -> main`

| Branch | Purpose | Protected |
|--------|---------|-----------|
| `master` | Default development branch. All normal work lands here first. | Recommended |
| `strong-beta` | Public beta branch for Cloudflare beta deploys and the automated npm release path used for current public beta drops. | Yes |
| `main` | Stable production branch for final promotion, stable website traffic, and release tags. | Yes |
| `feature/*` | Focused work branches opened from `master`. | No |
| `hotfix/*` | Emergency fixes branched from `main`, then merged back into `main` and `master`. | Same as `main` |

## Daily Workflow

```bash
git checkout master
git pull
git checkout -b feature/my-fix

# ... work, test, and commit ...

git push -u origin feature/my-fix
# Open PR: feature/my-fix -> master
```

When `master` is ready for a public beta drop, open:

```bash
# PR: master -> strong-beta
```

When the beta has passed smoke checks and manual review, open:

```bash
# PR: strong-beta -> main
```

`strong-beta` is the branch that currently drives the public beta website and automated npm release pipeline. Promote `strong-beta -> main` after beta validation when you want the same version to be reflected as the stable branch state and tagged release.

## npm Trusted Publishing

The npm release workflow publishes `geotechcli` and `@geotechcli/core` with npm Trusted Publishing/OIDC instead of a long-lived write token. Configure the same GitHub Actions trusted publisher on both npm packages:

| npm package | Publisher | Organization/user | Repository | Workflow filename | Environment | Allowed actions |
|-------------|-----------|-------------------|------------|-------------------|-------------|-----------------|
| `geotechcli` | GitHub Actions | `kilickursat` | `geotechcli-` | `release.yml` | leave blank | `npm publish` |
| `@geotechcli/core` | GitHub Actions | `kilickursat` | `geotechcli-` | `release.yml` | leave blank | `npm publish` |

After both trusted publishers are verified by one successful release, restrict package publishing access in npm package settings to require 2FA and disallow traditional tokens, then revoke the old `NPM_TOKEN` automation secret from GitHub.

## Minimum Validation

Before opening a PR, aim to run:

```bash
npm run verify:consistency
npm test --workspace=packages/core
```

If your change touches the website or CLI behavior, also run beta smoke checks when they are available.

## Adding a New Calculation

1. Implement in `packages/core/src/geo/` with Zod schema.
2. Register as a tool in `packages/core/src/agents/tools.ts`.
3. Add guardrails in `packages/core/src/agents/guardrails.ts`.
4. Add to the swarm tool list in `packages/core/src/agents/swarm.ts`.
5. Write tests in `packages/core/tests/core.test.ts`.
6. Add the CLI command in `packages/cli/src/commands/`.
7. Export from `packages/core/src/geo/index.ts`.

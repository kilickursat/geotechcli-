## Summary
<!-- What does this PR change, and why? -->

## Type
- [ ] Bug fix
- [ ] New feature
- [ ] Security patch
- [ ] Documentation

## Checklist
- [ ] PR targets `strong-beta` (not `main`)
- [ ] `npm test --workspace=packages/core` — all pass
- [ ] `npm run smoke:agent-tasks` — agent benchmark green
- [ ] `npx tsc --noEmit` in touched packages — zero errors
- [ ] Tests added for new calculations; guardrails added for new agent tools
- [ ] Trust boundary respected: no LLM-owned numbers, fail-closed guards intact
- [ ] No hardcoded API keys or secrets (fake test tokens use non-alphanumeric shapes)
- [ ] Changelog updated (if user-facing; maintainer can handle at release)

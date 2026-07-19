# Security Policy

## Supported versions

Only the latest published version of `geotechcli` / `@geotechcli/core` (npm dist-tag `latest`,
plus the current `beta`) receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities **privately** — do not open a public issue:

- Preferred: GitHub → Security → **Report a vulnerability** (private security advisory), or
- Email: **support@geotechcli.com** with subject `[SECURITY]`.

Include reproduction steps and impact. You should receive an acknowledgement within a few days;
fixes ship through the normal release channel (`beta` first, then `latest`). Please allow a
reasonable disclosure window before publishing details.

## Scope

- The `geotechcli` CLI and `@geotechcli/core` library (npm packages).
- The hosted proxy and website at `geotechcli.com` (rate-limit bypasses, key exposure,
  injection paths into the hosted LLM).

Out of scope: vulnerabilities in third-party LLM providers themselves, and issues requiring a
compromised local machine. There is currently no bug bounty — fixes are credited in the
changelog if you wish.

## Handling of secrets

The repository never contains real credentials (CI enforces a secret scan on every push).
BYOK API keys stay in the user's local config with `0600` permissions; the hosted provider key
lives only in server-side secrets. If you believe a credential has leaked, report it privately
immediately.

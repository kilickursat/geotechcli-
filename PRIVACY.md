# geotechCLI Privacy

## Strong Beta Position

geotechCLI is being built so engineers can evaluate deterministic and AI-assisted workflows without giving up control of their project data.

In the current `strong-beta` branch:

- No signup is required.
- Deterministic commands run without an AI provider.
- AI, vision, and agent commands in Wave 1 use the provider configured by the user.
- Hosted anonymous GLM beta is being added separately and is expected to keep the same privacy posture.

## What geotechCLI does not do

- We do not sell user engineering data.
- We do not use prompts, uploaded files, or generated outputs to train geotechCLI.
- We do not keep a signup-based customer profile in strong beta.
- We do not persist raw prompt or file content on geotechCLI servers as part of the intended hosted beta design.

## What happens in Wave 1

Wave 1 AI commands use the provider configured by the user.

That means:

- Requests go directly from the CLI to the selected provider.
- Provider API keys stay in the local geotechCLI config or environment variables.
- geotechCLI is not in the middle of those AI requests in this wave.

## What hosted beta is designed to keep

For the hosted beta path, geotechCLI is being shaped around these rules:

- Requests are forwarded only for real-time completion.
- Raw prompt and file content are not stored on geotechCLI servers.
- User engineering data is not used to train geotechCLI.
- Abuse protection keeps only minimal hashed counters and short-lived operational metadata.

## Important provider note

A model response still requires sending the request to the model provider that generates it.

- In Wave 1, that provider is chosen by the user.
- In hosted Z.AI beta, provider-side handling follows the provider API terms and privacy commitments in addition to geotechCLI server behavior.

## Local config

geotechCLI stores local settings in `~/.geotechcli/config.json`.

- API keys are redacted in CLI output.
- Restrictive filesystem permissions are applied where the platform supports them.
- Environment variables take precedence over config values when present.

## Minimal operational data

When hosted beta rate limiting is enabled, the goal is to retain only what is needed to protect the service:

- short-lived hashed abuse-protection counters
- basic service health metadata
- no reusable prompt history
- no stored engineering file content

## Summary

The intended privacy model is simple:

- no training on user project data
- no prompt storage on geotechCLI servers
- no sale of engineering data
- only the minimum metadata needed to keep the beta safe

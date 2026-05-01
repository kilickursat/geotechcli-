# geotechCLI Privacy

## Strong Beta Position

geotechCLI is being built so engineers can evaluate deterministic and AI-assisted workflows without giving up control of their project data.

In the current `strong-beta` branch:

- No signup is required.
- Deterministic commands run without an AI provider.
- AI, vision, and agent commands use hosted GLM beta by default.
- Bring-your-own provider keys remain available only as an advanced override.

## What geotechCLI does not do

- We do not sell user engineering data.
- We do not use prompts, uploaded files, or generated outputs to train geotechCLI.
- We do not keep a signup-based customer profile in strong beta.
- We do not persist raw prompt or file content on geotechCLI servers as part of the intended hosted beta design.

## What happens in strong beta

Strong-beta AI commands use the hosted GLM gateway backed by Z.ai by default.

That means:

- Requests are forwarded only for real-time completion.
- End users do not need to provide their own API key for the default hosted path.
- geotechCLI applies server-side rate limits and abuse controls before calling the model provider.
- Raw prompt and file content are not intended to be stored on geotechCLI servers as reusable history.

## Important provider note

A model response still requires sending the request to the model provider that generates it.

- In strong beta, the default hosted provider path uses `glm-5.1` for text/agent reasoning and `glm-5v-turbo` for vision.
- If a user manually switches to another provider, that provider handles the request directly.
- Provider-side handling follows that provider's API terms and privacy commitments in addition to geotechCLI server behavior.

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

<div align="center">

# geotechCLI

**Strong beta CLI for geotechnical engineering.**

[Website](https://geotechcli.com) | [Documentation](https://geotechcli.com/docs) | [Changelog](https://geotechcli.com/changelog) | [Beta](https://geotechcli.com/pricing)

</div>

---

> **PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**
>
> Copyright (c) 2026 Kursat Kilic. This software is proprietary and confidential.
> No part of this software may be reproduced, distributed, or transmitted in any
> form or by any means without the prior written permission of the owner.
> See [LICENSE](./LICENSE) for full terms.

---

## What is geotechCLI?

geotechCLI is a geotechnical engineering command-line tool that combines deterministic analysis, AI-assisted interpretation, vision workflows, and export utilities in one terminal-first product.

## Strong Beta Status

- Deterministic commands are available now.
- AI, vision, and agent commands work with your own provider key in Wave 1.
- Hosted anonymous GLM beta access, signup, and billing are intentionally disabled on `strong-beta`.
- Paid plans remain visible as product direction, but they are not active yet on this branch.

## Install

```bash
# Install Node.js LTS first, then verify the toolchain
node -v
npm -v

# Install geotechCLI
npm install -g geotechcli
```

Use the official Node.js installer or a trusted OS package manager. For the beta, the safest install path is still Node.js LTS plus `npm install -g geotechcli`.

## Quick Start

```bash
# Configure the default Z.AI provider for strong beta AI commands
geotech config set llm.provider zhipu
geotech config set llm.api_key your-key

# Bearing capacity (Meyerhof)
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5

# Liquefaction triggering (Boulanger and Idriss 2014)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# RMR89 classification
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# TBM performance prediction
geotech tunnel tbm-predict --diameter 6.5 --ucs 80 --rqd 65 --cai 2.1

# AI: classify RMR from a tunnel face photo
geotech vision rmr tunnel-face.jpg

# AI: multi-agent analysis
geotech agent "evaluate foundation options for a 12-story building on soft clay"

# Export to AutoCAD DXF
geotech export dxf --input boreholes.json --output profile.dxf
```

## Commands

### Deterministic

These commands are the public strong beta foundation and are available now.

| Command | Description |
|---------|-------------|
| `geotech bearing` | Bearing capacity using Terzaghi, Meyerhof, Hansen, and Vesic |
| `geotech liquefaction` | Seismic liquefaction using Boulanger and Idriss 2014 and NCEER |
| `geotech classify rmr` | Rock Mass Rating using Bieniawski 1989 |
| `geotech classify uscs` | USCS soil classification using ASTM D2487 |
| `geotech classify q-system` | Q-system using Barton et al. |
| `geotech tunnel tbm-predict` | TBM penetration rate, thrust, torque, and cutter life |
| `geotech tunnel tbm-select` | TBM type recommendation |
| `geotech tunnel cutter-wear` | Cutter wear prediction with cost estimate |
| `geotech slope` | Slope stability using Bishop Simplified |
| `geotech pile` | Pile capacity using alpha, beta, and SPT methods |
| `geotech retaining` | Lateral earth pressure using Rankine and Coulomb |

### AI-Assisted

These commands are available in strong beta with your own provider key in Wave 1.

| Command | Description |
|---------|-------------|
| `geotech vision corebox` | Core box image analysis for RQD, fracture spacing, and weathering |
| `geotech vision rmr` | Vision-assisted RMR workflow |
| `geotech vision sensor` | Sensor and chart image interpretation |
| `geotech vision log` | Borehole log image or PDF extraction |
| `geotech ai-classify` | Natural language soil description to USCS and properties |
| `geotech gbr chat` | GBR document question answering |
| `geotech agent` | Multi-agent orchestration with optional project memory |
| `geotech chat` | Interactive AI session with optional project memory |
| `geotech report` | AI-generated geotechnical report drafting |

### Export and Integration

| Command | Description |
|---------|-------------|
| `geotech export geojson` | Export to GeoJSON |
| `geotech export dxf` | Export to AutoCAD DXF |
| `geotech export csv` | Export to CSV |
| `geotech bridge detect` | Detect running PLAXIS, FLAC, or Rocscience processes |
| `geotech bridge generate` | Generate automation scripts for supported software |

## Global Flags

Most calculation and analysis commands support:

| Flag | Description |
|------|-------------|
| `--json` | Raw JSON output for scripting and automation |
| `--plot` | Render ASCII charts in the terminal |
| `--verbose` | Show step-by-step calculation details |
| `--quiet` | Suppress non-essential output |
| `--dry-run` | Show what would be calculated without executing |
| `--output <file>` | Save results to a file |
| `--no-color` | Disable colored output |

## LLM Configuration

In `strong-beta`, AI commands use your own provider key. The default Z.AI models are:

- Text: `glm-5-turbo`
- Vision: `glm-5v-turbo`

```bash
# Default beta setup (Z.AI)
geotech config set llm.provider zhipu
geotech config set llm.api_key your-key

# Hugging Face with your own token
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct

# OpenAI with your own key
geotech config set llm.provider openai
geotech config set llm.api_key sk-...

# Anthropic with your own key
geotech config set llm.provider anthropic
geotech config set llm.api_key sk-ant-...

# Self-hosted model
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://localhost:11434/v1
geotech config set llm.model qwen3.5-4b
```

Hosted anonymous GLM access and server-side rate limiting are planned for Wave 2.

## Pricing

| Tier | Price | Status |
|------|-------|--------|
| **Strong Beta** | $0 | Active now |
| **Lite Pro** | Coming Soon | Not active in this branch |
| **Pro** | Coming Soon | Not active in this branch |
| **Annual** | Coming Soon | Not active in this branch |

Strong beta currently gives users deterministic commands plus AI and vision with their own provider key. Managed hosted AI and paid entitlements come later.

## Security

- API keys are never logged, echoed, or included in error messages.
- `--json` output redacts sensitive fields.
- Environment variables take precedence over config file values when present.
- Config is stored at `~/.geotechcli/config.json` and protected with restrictive permissions where supported.
- In Wave 1, AI calls go directly to the provider configured locally by the user.
- geotechCLI does not use prompts, project files, or outputs to train its own models.
- geotechCLI does not sell user engineering data.
- Agent filesystem tools are sandboxed to the working directory.
- Shell commands are sandbox-validated and limited to a narrow allowlist.
- Signup, checkout, usage, webhook, and hosted proxy endpoints are disabled on `strong-beta`.
- Hosted anonymous GLM beta rate limiting will arrive in the next wave.

## License

**Copyright (c) 2026 Kursat Kilic. All Rights Reserved.**

This is proprietary software. No part of this software may be reproduced,
distributed, or transmitted in any form without prior written permission.
See [LICENSE](./LICENSE) for full terms.

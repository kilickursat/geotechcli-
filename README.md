<div align="center">

# geotechCLI

**Strong beta CLI for geotechnical engineering.**

[Website](https://beta.geotechcli.com) | [Documentation](https://beta.geotechcli.com/docs) | [Changelog](https://beta.geotechcli.com/changelog) | [Beta](https://beta.geotechcli.com/pricing)

</div>

---

> **PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**
>
> Copyright (c) 2026 geotechCLI. This software is proprietary and confidential.
> No part of this software may be reproduced, distributed, or transmitted in any
> form or by any means without the prior written permission of the owner.
> See [LICENSE](./LICENSE) for full terms.

---

## What is geotechCLI?

geotechCLI is a terminal-first geotechnical engineering product that combines deterministic analysis, AI-assisted interpretation, vision workflows, agentic reasoning, and export utilities in one CLI.

## Strong Beta Status

- Deterministic commands are available now.
- Hosted Qwen beta access is available now with no user API key required.
- Text and vision default to `Qwen/Qwen2.5-VL-7B-Instruct` served on Modal.com (NVIDIA L4 GPU).
- Server-side rate limits protect the hosted beta credit pool.
- Signup, billing, and paid entitlements are intentionally disabled on `strong-beta`.

## Install

```bash
# Install Node.js LTS first, then verify the toolchain
node -v
npm -v

# Install geotechCLI
npm install -g geotechcli
```

Use the official Node.js installer or a trusted OS package manager. For strong beta, the safest install path is still Node.js LTS plus `npm install -g geotechcli`.

## Quick Start

```bash
# Confirm the hosted beta path is active
geotech status

# Bearing capacity (Meyerhof)
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5

# Liquefaction triggering (Boulanger and Idriss 2014)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# RMR89 classification
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# AI: classify RMR from a tunnel face photo
geotech vision rmr tunnel-face.jpg

# AI: multi-agent analysis
geotech agent "evaluate foundation options for a 12-story building on soft clay"

# Export to AutoCAD DXF
geotech export dxf --input boreholes.json --output profile.dxf
```

## Interactive Visualization

Use `geotech viz` to open browser-grade interactive engineering plots from saved analysis data, with terminal ASCII fallback available when needed.

```bash
geotech viz samples/visualization/geotech-viz-showcase.csv
geotech viz samples/visualization/geotech-viz-showcase.xlsx --list
geotech viz result.json
geotech viz --preset mohr-circle --sigma1 250 --sigma3 90 --cohesion 15 --phi 28
geotech viz --preset atterberg --ll 55 --pl 25
geotech viz samples/visualization/geotech-viz-compaction.csv --template compaction
geotech viz samples/visualization/geotech-viz-gradation.csv --template gradation
geotech viz samples/visualization/geotech-viz-showcase.csv --save-html review.html --no-open
```

Set `GEOTECHCLI_PLOT_MODE=ascii` if you want to force terminal charts instead of opening the browser viewer.

Showcase files are committed in:

- `samples/visualization/geotech-viz-showcase.csv`
- `samples/visualization/geotech-viz-showcase.xlsx`
- `samples/visualization/geotech-viz-compaction.csv`
- `samples/visualization/geotech-viz-gradation.csv`
- `samples/visualization/geotech-viz-cpt.csv`

Common daily-use chart shortcuts now include:

- `geotech classify uscs --gravel 5 --sand 20 --fines 75 --ll 55 --pl 25 --plot`
- `geotech liquefaction --pga 0.25 --magnitude 7.5 --demo --plot`
- `geotech pile --diameter 0.8 --length 12 --su 45 --plot`
- `geotech settlement trough --volume-loss 1.5 --depth 18 --diameter 6.5 --plot`

Any `--plot`-capable command can also use `--save-html <file>` and `--no-open` to export the browser viewer without launching it.

## Commands

### Deterministic

These commands are the public strong-beta foundation and are available now.

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
| `geotech viz` | Interactive browser visualization for saved JSON, CSV, and Excel data |

### AI-Assisted

These commands now use the hosted beta Qwen path by default.

| Command | Description |
|---------|-------------|
| `geotech vision corebox` | Core box image analysis for RQD, fracture spacing, and weathering |
| `geotech vision rmr` | Vision-assisted RMR workflow |
| `geotech vision sensor` | Sensor and chart image interpretation |
| `geotech vision log` | Borehole log extraction from images or multi-page PDFs |
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

Sample export fixtures are committed under `samples/exports/`:

- `samples/exports/mock-boreholes.json`
- `samples/exports/mock-liquefaction.json`

Example export smoke checks:

```bash
geotech export geojson --input samples/exports/mock-boreholes.json --output boreholes.geojson
geotech export dxf --input samples/exports/mock-boreholes.json --output profile.dxf
geotech export csv --input samples/exports/mock-liquefaction.json --output data.csv
```

## Global Flags

Most calculation and analysis commands support:

| Flag | Description |
|------|-------------|
| `--json` | Raw JSON output for scripting and automation |
| `--plot` | Open an interactive engineering plot viewer with terminal fallback |
| `--save-html <file>` | Write the interactive plot viewer to a specific HTML file |
| `--no-open` | Generate interactive plot HTML without launching a browser |
| `--verbose` | Show step-by-step calculation details |
| `--quiet` | Suppress non-essential output |
| `--dry-run` | Show what would be calculated without executing |
| `--output <file>` | Save results to a file |
| `--no-color` | Disable colored output |

## LLM Configuration

In `strong-beta`, AI commands default to the hosted beta provider, so a user does not need to bring their own API key.

- Default provider: `hosted-beta`
- Default text model: `Qwen/Qwen2.5-VL-7B-Instruct`
- Default vision model: `Qwen/Qwen2.5-VL-7B-Instruct`

```bash
# Confirm the strong-beta defaults
geotech config get llm.provider
geotech config get llm.model
geotech config get llm.vision_model

# Restore hosted beta defaults
geotech config reset

# Optional advanced override: Hugging Face
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct

# Optional advanced override: OpenAI
geotech config set llm.provider openai
geotech config set llm.api_key sk-...

# Optional advanced override: Anthropic
geotech config set llm.provider anthropic
geotech config set llm.api_key sk-ant-...

# Optional advanced override: self-hosted OpenAI-compatible endpoint
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://localhost:11434/v1
geotech config set llm.model Qwen/Qwen2.5-VL-7B-Instruct
```

## Pricing

| Tier | Price | Status |
|------|-------|--------|
| **Strong Beta** | $0 | Active now |
| **Lite Pro** | Coming Soon | Not active in this branch |
| **Pro** | Coming Soon | Not active in this branch |
| **Annual** | Coming Soon | Not active in this branch |

Strong beta currently gives users deterministic commands plus hosted Qwen beta access with limits. Managed commercial plans and entitlements come later.

## Security and Privacy

- End users do not need to submit their own API key for hosted beta usage.
- Hosted beta requests are forwarded for completion and are not intended to be stored as reusable prompt or file history on geotechCLI servers.
- geotechCLI does not use prompts, uploaded project files, or outputs to train geotechCLI.
- geotechCLI does not sell user engineering data.
- Hosted beta keeps only minimal hashed abuse-protection counters and service metadata.
- API keys are never logged, echoed, or included in error messages.
- `--json` output redacts sensitive fields.
- Environment variables take precedence over config file values when present.
- Config is stored at `~/.geotechcli/config.json` and protected with restrictive permissions where supported.
- Agent filesystem tools are sandboxed to the working directory.
- Shell commands are sandbox-validated and limited to a narrow allowlist.

## License

**Copyright (c) 2026 geotechCLI. All Rights Reserved.**

This is proprietary software. No part of this software may be reproduced,
distributed, or transmitted in any form without prior written permission.
See [LICENSE](./LICENSE) for full terms.

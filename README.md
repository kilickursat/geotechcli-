<div align="center">

# geotechCLI

**AI-native CLI for geotechnical engineering.**

[![CI](https://github.com/kilickursat/geotechcli/actions/workflows/ci.yml/badge.svg)](https://github.com/kilickursat/geotechcli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/geotechcli.svg)](https://www.npmjs.com/package/geotechcli)

[Website](https://geotechcli.com) · [Documentation](https://geotechcli.com/docs) · [Changelog](https://geotechcli.com/changelog) · [Pricing](https://geotechcli.com/pricing)

</div>

---

> **⚠ PROPRIETARY SOFTWARE — ALL RIGHTS RESERVED**
>
> Copyright © 2026 Kursat Kilic. This software is proprietary and confidential.
> No part of this software may be reproduced, distributed, or transmitted in any
> form or by any means without the prior written permission of the owner.
> See [LICENSE](./LICENSE) for full terms.

---

## What is geotechCLI?

The first AI-native command-line tool built for geotechnical engineers. Deterministic calculations, LLM-powered interpretation, vision-based analysis, and rich terminal output — all from one command.

No geotechnical CLI tool like this exists. Until now.

## Install

```bash
npm install -g geotechcli
```

Requires Node.js ≥ 18.

## Quick Start

```bash
# Bearing capacity (Meyerhof)
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5

# Liquefaction triggering (Boulanger & Idriss 2014)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# RMR89 classification
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# TBM performance prediction
geotech tunnel tbm-predict --diameter 6.5 --ucs 80 --rqd 65 --cai 2.1

# TBM type selection
geotech tunnel tbm-select --diameter 6.5 --ground mixed --water 3

# AI: classify RMR from tunnel face photo
geotech vision rmr tunnel-face.jpg

# AI: multi-agent analysis
geotech agent "evaluate foundation options for 12-story building on soft clay"

# AI: reuse stored project context
geotech agent "check bearing and settlement for the current footing concept" --project tokyo-shaft

# Export to AutoCAD DXF
geotech export dxf --input boreholes.json --output profile.dxf

# Pile capacity (α-method for clay)
geotech pile --diameter 0.6 --length 15 --su 60 --type driven

# Slope stability (Bishop Simplified)
geotech slope --height 10 --angle 35 --cohesion 15 --phi 28

# Lateral earth pressure (Rankine active)
geotech retaining --height 6 --phi 30 --state active

# Generate PLAXIS automation script
geotech bridge generate --software plaxis
```

## Commands

### Deterministic (always free, works offline)

| Command | Description |
|---------|-------------|
| `geotech bearing` | Bearing capacity — Terzaghi, Meyerhof, Hansen, Vesic |
| `geotech liquefaction` | Seismic liquefaction — Boulanger & Idriss 2014, NCEER |
| `geotech classify rmr` | Rock Mass Rating — Bieniawski 1989 |
| `geotech classify uscs` | USCS soil classification — ASTM D2487 |
| `geotech classify q-system` | Q-system — Barton et al. 1974 |
| `geotech tunnel tbm-predict` | TBM penetration rate, thrust, torque, cutter life |
| `geotech tunnel tbm-select` | TBM type recommendation (EPB/Slurry/Open/Shield) |
| `geotech tunnel cutter-wear` | Cutter wear prediction with cost estimate |
| `geotech settlement` | Settlement analysis (coming v0.3) |
| `geotech slope` | Slope stability — Bishop Simplified |
| `geotech pile` | Pile capacity — α/β/SPT methods |
| `geotech retaining` | Lateral earth pressure — Rankine/Coulomb |
| `geotech seepage` | Seepage analysis (coming v0.3) |

### AI-Powered (metered, requires API key)

| Command | Description |
|---------|-------------|
| `geotech vision corebox` | Core box image → RQD, fracture spacing, weathering |
| `geotech vision rmr` | Hybrid: vision extracts features → deterministic RMR scoring |
| `geotech vision sensor` | Sensor data image interpretation |
| `geotech vision log` | Borehole log PDF/image → structured data extraction |
| `geotech ai-classify` | Natural language soil description → USCS + properties |
| `geotech gbr chat` | GBR document Q&A |
| `geotech agent` | Multi-agent orchestrator with optional persistent `--project` memory |
| `geotech chat` | Interactive agent session with optional persistent `--project` memory |
| `geotech report` | AI-generated professional geotechnical report |

### Export & Integration

| Command | Description |
|---------|-------------|
| `geotech export geojson` | Export to GeoJSON |
| `geotech export dxf` | Export to AutoCAD DXF |
| `geotech export csv` | Export to CSV spreadsheet |
| `geotech bridge detect` | Detect running PLAXIS / FLAC / Rocscience |
| `geotech bridge generate` | Generate automation scripts for geotech software |

## Global Flags

Every command supports:

| Flag | Description |
|------|-------------|
| `--json` | Raw JSON output for piping to `jq`, scripts, CI/CD |
| `--plot` | Render ASCII chart in terminal |
| `--verbose` | Show step-by-step calculation details |
| `--quiet` | Suppress all non-essential output |
| `--dry-run` | Show what would be calculated without executing |
| `--output <file>` | Save results to file |
| `--no-color` | Disable colored output |

## LLM Configuration

geotechCLI is LLM-agnostic. Default: Zhipu GLM-5 (free tier).

```bash
# Default (Zhipu GLM-5)
geotech config set llm.provider zhipu
geotech config set llm.api_key your-key

# Hugging Face — any model from the Hub (Pro tier)
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct

# HF with specific backend provider
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct:cerebras

# HF auto-routing: fastest or cheapest
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct:fastest
geotech config set llm.model deepseek-ai/DeepSeek-V3:cheapest

# HF vision models
geotech config set llm.vision_model Qwen/Qwen2.5-VL-7B-Instruct

# OpenAI (Pro tier)
geotech config set llm.provider openai

# Anthropic (Pro tier)
geotech config set llm.provider anthropic

# Self-hosted (Ollama, vLLM, etc.)
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://localhost:11434/v1
geotech config set llm.model qwen3.5-4b
```

### Hugging Face Setup

1. Get a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Enable **"Make calls to Inference Providers"** permission
3. Set it: `geotech config set llm.api_key hf_your_token`
4. Pick any model from the [Hub](https://huggingface.co/models?pipeline_tag=text-generation)
5. Requires **Pro** or **Annual** geotechCLI subscription

## Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | GLM-5 default, 50 AI analyses/month, unlimited deterministic |
| **Lite Pro** | $15/mo | GLM unlimited, 1000 analyses/month |
| **Pro** | $49/mo | Bring Your Own LLM, unlimited everything |
| **Annual** | $399/yr | Everything + SLA + CI/CD batch |

Deterministic calculations are **always free and unlimited** on all tiers.

## Security

- API keys are never logged, echoed, or included in error messages
- `--json` output auto-redacts all sensitive fields
- Environment variables take precedence over config file
- Config file at `~/.geotechcli/config.json` is auto-secured to `0600` permissions
- Free-tier LLM requests route through a metered proxy; Pro-tier calls go direct to your provider
- Agent filesystem tools are sandboxed to the working directory — no access to `.ssh`, `.aws`, or system paths
- Shell commands are restricted to read-only operations (ls, cat, grep, etc.)
- Registration and proxy endpoints are rate-limited with IP hashing (SHA-256)
- Stripe webhook signatures are verified before processing
- IP addresses are never stored — only hashed fingerprints in Redis with auto-expiry

## License

**Copyright © 2026 Kursat Kilic. All Rights Reserved.**

This is proprietary software. No part of this software may be reproduced,
distributed, or transmitted in any form without prior written permission.
See [LICENSE](./LICENSE) for full terms.

Unauthorized use, copying, modification, or distribution is strictly prohibited.

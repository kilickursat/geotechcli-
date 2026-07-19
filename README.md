<div align="center">

<img src="docs/assets/geotechcli-logo.png" alt="geotechCLI logo" width="300" />

# geotechCLI

**Open-source agentic AI CLI for geotechnical engineering.**

Deterministic geotechnical engines + LLM reasoning over an evidence-bound GroundModel —
the AI interprets, deterministic code owns every number.

[![npm version](https://img.shields.io/npm/v/geotechcli?color=00b37e&label=npm)](https://www.npmjs.com/package/geotechcli)
[![npm beta](https://img.shields.io/npm/v/geotechcli/beta?color=f5a623&label=beta)](https://www.npmjs.com/package/geotechcli?activeTab=versions)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![CI](https://github.com/kilickursat/geotechcli-/actions/workflows/ci.yml/badge.svg)](https://github.com/kilickursat/geotechcli-/actions/workflows/ci.yml)
[![sponsor](https://img.shields.io/badge/sponsor-Patreon-f96854?logo=patreon)](https://www.patreon.com/16003704/join)

[**Website**](https://www.geotechcli.com) · [**Documentation**](https://www.geotechcli.com/docs) · [**Changelog**](https://www.geotechcli.com/changelog) · [**Support the project**](#-support--sponsorship)

</div>

---

## What is geotechCLI?

geotechCLI turns a folder of geotechnical data — borehole logs, SPT/CPT tables, lab results,
monitoring CSVs, PDF reports — into an **evidence-bound GroundModel** you can calculate against,
visualize, export, and interrogate with an AI agent from your terminal.

The design principle throughout is a strict **trust boundary**:

> **The LLM interprets and orchestrates. Deterministic code owns every number.**
> Calculations come from published methods (Terzaghi, Meyerhof, Boulanger–Idriss, Bishop, …),
> every extracted value carries evidence references back to its source page or row, and anything
> unverified is surfaced as an explicit review gate instead of silently guessed.

## 🤖 AI included — GLM 5.2 free by default

The AI features work **out of the box, free, with no API key and no signup**: geotechCLI ships
connected to a hosted `hosted-beta` provider running **`glm-5.2`** for text/agents and
**`glm-5v-turbo`** for vision (plus `glm-ocr` for PDF/table layout), behind fair rate limits.

Prefer your own models? **BYOK** is first-class: OpenAI, Anthropic, Zhipu/Z.ai,
OpenAI-compatible/OpenRouter, and Hugging Face providers plug into the same evidence contract.

> The hosted API bill is paid by the project. If geotechCLI saves you time,
> [**sponsoring**](#-support--sponsorship) helps keep the free tier free.

## Quick start

```bash
npm install -g geotechcli          # latest stable
# npm install -g geotechcli@beta   # early-adopter channel

geotech analyze .                  # scan a project folder into a GroundModel (offline, deterministic)
geotech chat                       # AI agent with your project auto-loaded as context
geotech liquefaction --demo        # deterministic liquefaction screening on sample data
```

## Features

**Deterministic engines — free forever, work offline, no key:**

| Command | What it does |
|---------|--------------|
| `geotech bearing` | Bearing capacity — Terzaghi / Meyerhof / Hansen / Vesic |
| `geotech liquefaction` | Liquefaction triggering — Boulanger & Idriss / NCEER |
| `geotech classify` | USCS, RMR89, Q-system classification |
| `geotech pile` | Pile capacity — alpha / beta / SPT methods |
| `geotech slope` | Slope stability — Bishop simplified |
| `geotech retaining` | Earth pressures — Rankine / Coulomb |
| `geotech settlement` | Elastic / consolidation / Schmertmann settlement |
| `geotech seepage` | Deterministic groundwater routing |
| `geotech tunnel` | TBM performance, selection, cutter wear |
| `geotech analyze` | Workspace scan → evidence-bound GroundModel + verifier |
| `geotech signal` | Monitoring analysis — settlement, piezometer, inclinometer, vibration, load tests |
| `geotech viz` / `export` | Interactive plots; CSV, DXF, GeoJSON, AGSi, DIGGS export |

**AI features — powered by the free hosted GLM or your own key:**

| Command | What it does |
|---------|--------------|
| `geotech chat` | Interactive ReAct agent with memory; auto-loads your project dataset |
| `geotech agent` | Project agent — queries the GroundModel, routes work into deterministic tools |
| `geotech ingest` | Evidence-bound extraction from borehole logs and reports (PDF/image) |
| `geotech vision` | Core-box photos, tunnel-face RMR, sensor charts, log photos |
| `geotech gbr` | Interrogate a Geotechnical Baseline Report in the terminal |
| `geotech report` | Draft evidence-first geotechnical reports |
| `geotech ai-classify` | Natural-language soil description → USCS + properties |

**Bundled skills.** Repeatable screening workflows (ground-model building, data-quality review,
parameter triangulation, risk registers, …) ship with the CLI.
Current bundled strong-beta catalog: 49 skills total, including 48 approved executable skills and 1 prompt-only reviewer skill.

**Global flags** on most commands: `--json`, `--plot`, `--save-html <file>`, `--no-open`,
`--verbose`, `--quiet`, `--dry-run`, `--output <file>`, `--no-color`.

## How it works

```
your project folder
   └─ borehole logs · SPT/CPT/lab CSVs · monitoring data · PDF reports
        │
        ▼  deterministic scan + OCR/layout extraction (evidence refs on every value)
   GroundModel  ──────  verifier (review gates, standards readiness, missing-data flags)
        │
        ├─ deterministic engines: bearing · settlement · liquefaction · slope · pile · …
        ├─ visualization / export: plots · GeoJSON · DXF · AGSi · DIGGS
        └─ AI layer: chat/agent query the GroundModel read-only and route work
           into the deterministic tools — they never invent a number
```

Agent quality is enforced, not hoped for: a deterministic **agent-task benchmark** (scripted-model
scenarios, zero network) gates every CI run — tool correctness, evidence citation, review-gate
preservation, and fail-closed guardrails (fabricated values blocked, invented artifacts rejected).

## 💖 Support & Sponsorship

geotechCLI is free and open source, built and maintained with significant time and real hosted-API
costs. If it helps your work, consider sponsoring — it directly funds development and keeps the
hosted GLM tier free for everyone.

| Tier | | What you get |
|------|--|--------------|
| **Supporter** | **$10/mo** | Fund development and the free hosted AI · your name in SUPPORTERS (opt-in) · early access to new AI features |
| **Excellent Support** | **$50/mo** | Everything above · priority support and feedback · roadmap influence · hands-on collaboration time on *your* geotech projects |
| **Diamond Supporter** | **$500/mo** | Everything above · deep-level implementation partnership · direct access to the maintainer · sponsored-feature prioritization |

<div align="center">

[**❤️ Become a sponsor on Patreon**](https://www.patreon.com/16003704/join)

</div>

> **Note on billing:** Patreon memberships renew monthly — there is no one-time option. To make a
> one-time donation, you can cancel your membership any time, including right after your payment
> clears, and you keep the month you paid for.

Everyone can contribute regardless of sponsorship — issues and pull requests are always open.
Sponsorship adds priority and collaboration on top; it is never a paywall.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, branch flow
(PRs target `strong-beta`), and the trust-boundary rules every change must respect. Good first
steps: try the CLI on real project data and file issues, improve docs, or pick up a
`good first issue`.

geotechCLI is maintained by [Kursat Kilic](https://github.com/kilickursat), who reviews and merges
all changes.

## Citing geotechCLI

If geotechCLI contributes to your research or engineering work, please cite it
(see [CITATION.cff](CITATION.cff) — GitHub's *Cite this repository* button gives APA/BibTeX):

```bibtex
@software{geotechcli,
  author  = {Kilic, Kursat},
  title   = {geotechCLI: an open-source agentic AI CLI for geotechnical engineering},
  url     = {https://github.com/kilickursat/geotechcli-},
  license = {Apache-2.0},
  year    = {2026}
}
```

## Security & privacy

- Deterministic commands run fully offline; nothing leaves your machine.
- AI commands send only the bounded, evidence-referenced context they need to the configured
  provider; the hosted proxy holds the API key server-side and stores no user documents.
- API keys for BYOK live in your local config (`0600` permissions) and are never transmitted
  anywhere except the provider you chose. Error paths redact key-shaped values.
- Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) © 2026 Kursat Kilic. The [NOTICE](NOTICE) file travels with redistributions.

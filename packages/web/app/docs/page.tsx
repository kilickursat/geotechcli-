import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_VISION_MODEL,
  GLOBAL_FLAG_DEFINITIONS,
} from '@geotechcli/core';

const globalFlagsTable = [
  '| Flag | Description |',
  '|------|-------------|',
  ...GLOBAL_FLAG_DEFINITIONS.map((flag) => `| \`${flag.option}\` | ${flag.description} |`),
].join('\n');

const sections = [
  {
    id: 'install',
    title: 'Installation',
    content: `\`\`\`bash
# Install Node.js LTS first and verify the toolchain
node -v
npm -v

# Install geotechCLI
npm install -g geotechcli
\`\`\`

Use the official Node.js installer or a trusted OS package manager. Deterministic commands work immediately after install, and strong-beta AI commands use the hosted GLM gateway by default. Verify installation:

\`\`\`bash
geotech --version
geotech status
\`\`\``,
  },
  {
    id: 'config',
    title: 'Configuration',
    content: `geotechCLI stores configuration in \`~/.geotechcli/config.json\`.

\`\`\`bash
# View current config
geotech config view

# Set LLM provider (default: ${DEFAULT_LLM_PROVIDER})
geotech config set llm.provider ${DEFAULT_LLM_PROVIDER}

# Strong beta defaults
geotech config get llm.provider   # ${DEFAULT_LLM_PROVIDER}
geotech config get llm.model      # provider default (${DEFAULT_LLM_MODEL})
geotech config get llm.vision_model  # provider default (${DEFAULT_LLM_VISION_MODEL})

# Hosted beta is the default and does not require a user provider key.
# Optional advanced override: switch to another provider with your own key.

# Hugging Face — advanced beta with your own token
geotech config set llm.provider huggingface
geotech config set llm.api_key hf_your_token
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct

# HF with specific provider backend or auto-routing
geotech config set llm.model meta-llama/Llama-3.1-8B-Instruct:cerebras
geotech config set llm.model deepseek-ai/DeepSeek-V3:cheapest

# HF vision model for geotech vision commands
geotech config set llm.vision_model Qwen/Qwen2.5-VL-7B-Instruct

# OpenAI — advanced beta with your own key
geotech config set llm.provider openai
geotech config set llm.api_key sk-...

# Anthropic — advanced beta with your own key
geotech config set llm.provider anthropic
geotech config set llm.api_key sk-ant-...

# Self-hosted model (e.g. Qwen on VPS)
geotech config set llm.provider openai-compatible
geotech config set llm.base_url http://your-vps:8000/v1
geotech config set llm.model qwen3.5-4b

# Reset to defaults
geotech config reset
\`\`\`

Strong-beta behavior: deterministic commands work immediately after install. AI, vision, and agent commands use hosted GLM access by default, with server-side rate limits and no user provider key required. Bring-your-own provider keys remain available as an advanced override.

Hugging Face setup: get a token at huggingface.co/settings/tokens with "Make calls to Inference Providers" permission. Browse models at huggingface.co/models. Append :fastest or :cheapest to auto-route, or :provider to force a specific backend (cerebras, together, groq, etc.).`,
  },
  {
    id: 'bearing',
    title: 'geotech bearing',
    content: `Calculate bearing capacity using Terzaghi, Meyerhof, Hansen, or Vesic methods.

\`\`\`bash
geotech bearing --depth 5 --phi 30 --cohesion 25 --width 2.5 --method meyerhof

# With JSON output for scripts
geotech bearing --depth 5 --phi 30 --json

# Show calculation steps
geotech bearing --depth 5 --phi 30 --verbose

# All options
geotech bearing \\
  --depth <m>        # Embedment depth Df (required)
  --phi <deg>        # Friction angle φ (required)
  --cohesion <kPa>   # Cohesion c (default: 0)
  --width <m>        # Foundation width B (default: 2)
  --length <m>       # Foundation length L (omit for strip)
  --unit-weight <kN/m3>  # Soil unit weight γ (default: 18)
  --method <n>       # terzaghi|meyerhof|hansen|vesic (default: meyerhof)
  --fs <number>      # Factor of safety (default: 3)
  --shape <type>     # strip|square|circular|rectangular (default: strip)
\`\`\``,
  },
  {
    id: 'liquefaction',
    title: 'geotech liquefaction',
    content: `Seismic liquefaction triggering analysis using Boulanger & Idriss (2014) or NCEER simplified procedure.

\`\`\`bash
# With SPT profile CSV (columns: depth,sptN,finesContent,unitWeight,waterTableDepth)
geotech liquefaction --pga 0.25 --magnitude 7.5 --spt-profile site.csv

# Single layer quick check
geotech liquefaction --pga 0.3 --magnitude 7.0 --depth 5 --spt 12 --fines 15

# Demo mode (built-in sample data)
geotech liquefaction --pga 0.25 --magnitude 7.5
\`\`\``,
  },
  {
    id: 'classify',
    title: 'geotech classify',
    content: `Rock and soil classification systems.

\`\`\`bash
# RMR89 (Bieniawski 1989)
geotech classify rmr --ucs 85 --rqd 72 --spacing 0.4 --condition fair --gw dry

# USCS (ASTM D2487)
geotech classify uscs --gravel 12 --sand 58 --fines 30 --ll 42 --pi 18

# Q-system (Barton 1974)
geotech classify q-system --rqd 80 --jn 6 --jr 1.5 --ja 2 --jw 0.66 --srf 1
\`\`\``,
  },
  {
    id: 'tunnel',
    title: 'geotech tunnel',
    content: `Tunnel engineering commands — TBM prediction, selection, and cutter wear.

\`\`\`bash
# TBM performance prediction
geotech tunnel tbm-predict --diameter 6.5 --ucs 80 --rqd 65 --cai 2.1

# TBM type selection
geotech tunnel tbm-select --diameter 6.5 --ground mixed --water 3 --boulders

# Cutter wear prediction
geotech tunnel cutter-wear --cai 3.5 --ucs 120 --distance 5000 --cutters 48
\`\`\``,
  },
  {
    id: 'vision',
    title: 'geotech vision (AI)',
    content: `AI-powered image analysis. Uses hosted GLM beta by default.

\`\`\`bash
# Core box analysis → RQD, fracture spacing, weathering
geotech vision corebox core-photo.jpg

# Hybrid RMR: vision extracts → deterministic scoring
geotech vision rmr tunnel-face.jpg

# Sensor data interpretation
geotech vision sensor piezometer-chart.png

# Borehole log extraction
geotech vision log borehole-log.pdf
\`\`\``,
  },
  {
    id: 'agent',
    title: 'geotech agent (AI)',
    content: `Multi-agent orchestrator for complex tasks. Routes to specialized Geo, Tunnel, Hydro, Seismic, Slope, and Foundation agents, and can reuse persistent project memory with --project.

\`\`\`bash
geotech agent "evaluate TBM selection for 6.5m tunnel in mixed face conditions with 3 bar water pressure"

geotech agent "classify the soil profile and recommend foundation type for a 12-story building"

# Reuse persistent project memory across runs
geotech agent "check bearing and settlement for the current foundation concept" --project tokyo-shaft

# Save report to file
geotech agent "analyze slope stability for 15m cut" --output slope-report.md
\`\`\``,
  },
  {
    id: 'export',
    title: 'geotech export',
    content: `Export results to external formats.

\`\`\`bash
# GeoJSON (for GIS)
geotech export geojson --input results.json --output boreholes.geojson

# AutoCAD DXF
geotech export dxf --input boreholes.json --output profile.dxf

# CSV spreadsheet
geotech export csv --input results.json --output data.csv
\`\`\``,
  },
  {
    id: 'bridge',
    title: 'geotech bridge',
    content: `Connect to local geotechnical software.

\`\`\`bash
# Detect running instances
geotech bridge detect

# Generate automation script
geotech bridge generate --software plaxis --output model.py
geotech bridge generate --software flac --output model.fis
geotech bridge generate --software rocscience --analysis slope
\`\`\``,
  },
  {
    id: 'global-flags',
    title: 'Global Flags',
    content: `Most calculation and analysis commands support these flags:

${globalFlagsTable}`,
  },
];

function renderMarkdown(md: string) {
  // Minimal markdown-to-HTML for code blocks, tables, and inline code
  let html = md
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 my-4 overflow-x-auto font-[var(--font-mono)] text-[13px] leading-[1.8] text-[var(--text-secondary)]">${code.replace(/</g, '&lt;')}</pre>`
    )
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--bg-card)] px-1.5 py-0.5 rounded text-[var(--accent-teal)] font-[var(--font-mono)] text-[12px]">$1</code>')
    .replace(/\n\n/g, '</p><p class="text-[var(--text-secondary)] text-[14px] leading-[1.7] mb-4">')
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (_m, header, body) => {
      const ths = header.split('|').filter(Boolean).map((h: string) => `<th class="px-3 py-2 text-left text-xs font-semibold text-[var(--text-primary)] border-b border-[var(--border-color)]">${h.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map((row: string) => {
        const tds = row.split('|').filter(Boolean).map((d: string) => `<td class="px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--border-color)] font-[var(--font-mono)]">${d.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table class="w-full my-4 border border-[var(--border-color)] rounded-lg overflow-hidden"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

  return `<p class="text-[var(--text-secondary)] text-[14px] leading-[1.7] mb-4">${html}</p>`;
}

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 px-12 pb-16 max-w-[900px]">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Strong Beta Docs</h1>
        <p className="text-[var(--text-secondary)] text-base mb-12">
          Strong beta reference for geotechCLI commands, hosted GLM defaults, and optional advanced provider overrides.
        </p>

        {/* Table of contents */}
        <nav className="mb-16 p-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl">
          <h2 className="text-sm font-semibold mb-4 text-[var(--text-muted)] uppercase tracking-wider">Contents</h2>
          <div className="grid grid-cols-3 gap-2">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-[13px] text-[var(--accent-teal)] hover:text-[var(--text-primary)] transition font-[var(--font-mono)]">
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Sections */}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mb-16 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight mb-6 pb-3 border-b border-[var(--border-color)]">
              {s.title}
            </h2>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(s.content) }} />
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}

import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { GEOTECHCLI_VERSION } from '@geotechcli/core/meta';

const releases = [
  {
    version: GEOTECHCLI_VERSION,
    date: '2026-04-17',
    tag: `${GEOTECHCLI_VERSION} Release`,
    changes: [
      { type: 'feat', text: 'Replaced the narrow foundation-only shortcut with a catalog-driven geotechnical intake layer that screens multiple analysis families before calling the hosted model' },
      { type: 'fix', text: 'Under-specified foundation, soil classification, and liquefaction prompts now return immediate engineering data requirements instead of burning a long hosted-beta round trip' },
      { type: 'fix', text: 'Project metadata and notes alone no longer suppress agent intake; only real evidence such as soil profiles, datasets, derived parameters, or active analysis context can bypass it' },
      { type: 'fix', text: 'Added regression coverage to keep metadata-only project sessions from slipping past intake while still allowing evidence-backed project context to reach hosted beta normally' },
    ],
  },
  {
    version: '0.4.7',
    date: '2026-04-17',
    tag: '0.4.7 Release',
    changes: [
      { type: 'fix', text: 'Added an immediate deterministic screening answer for under-specified foundation and soil-profile agent prompts so the CLI responds instantly instead of waiting on hosted-beta just to request missing data' },
      { type: 'fix', text: 'Improved the hosted-beta fallback for the same foundation-screening prompts so transient provider issues now return a useful engineering checklist instead of the generic no-fallback message' },
      { type: 'fix', text: 'Switched hosted beta to the native vLLM OpenAI-compatible server on Modal so text and image chat completions share the same contract and the broken modal-http invalid function call path is removed' },
      { type: 'fix', text: 'Kept hosted beta on Qwen/Qwen3.5-9B as the shared hybrid multimodal model instead of drifting to a separate Qwen2.5-VL default' },
      { type: 'fix', text: 'Corrected the Modal vLLM launcher to pass --limit-mm-per-prompt as JSON so the current vllm serve CLI accepts multimodal limits during deploy' },
      { type: 'feat', text: 'Expanded the Modal deploy workflow to watch hosted-beta contract files and added a post-deploy /health smoke check to catch drift immediately' },
      { type: 'feat', text: 'Replaced ASCII-first plotting with an interactive browser plot viewer for geotech viz and command-level --plot flows, while keeping terminal fallback available' },
    ],
  },
  {
    version: 'strong-beta-qwen-migration',
    date: '2026-04-16',
    tag: 'Qwen on Modal',
    changes: [
      { type: 'feat', text: 'Migrated hosted beta backend from GLM (Zhipu/Z.AI) to Qwen/Qwen3.5-9B served on Modal.com with NVIDIA L4 GPU' },
      { type: 'feat', text: 'Modal deployment auto-scales to zero after 10 minutes idle to conserve GPU credits' },
      { type: 'feat', text: 'Hosted beta text and vision defaults unified to Qwen/Qwen3.5-9B' },
      { type: 'fix', text: 'Updated proxy, CLI defaults, docs, privacy, and website copy for the new model and provider' },
    ],
  },
  {
    version: 'strong-beta-model-refresh',
    date: '2026-04-14',
    tag: 'Hosted Model Update',
    changes: [
      { type: 'feat', text: 'Hosted beta text default switched to glm-4.7-flash to reduce shared credit burn during strong beta' },
      { type: 'feat', text: 'Hosted beta vision default switched to glm-4.6v-flash for lower-cost image analysis during strong beta' },
      { type: 'fix', text: 'Hosted proxy allowlist, CLI defaults, and docs were aligned to the new flash model IDs' },
    ],
  },
  {
    version: 'strong-beta-wave2',
    date: '2026-04-03',
    tag: 'Hosted Qwen Beta',
    changes: [
      { type: 'feat', text: 'Hosted beta gateway enabled for strong-beta with Qwen/Qwen3.5-9B on Modal' },
      { type: 'security', text: 'Proxy now validates requests, enforces model allowlists, and applies server-side rate limits before calling upstream' },
      { type: 'feat', text: 'CLI default provider switched to hosted-beta so users can try AI commands without bringing their own key' },
      { type: 'feat', text: 'Website, docs, and privacy copy updated to reflect hosted beta access with no-signup limits' },
    ],
  },
  {
    version: 'strong-beta',
    date: '2026-04-03',
    tag: 'Strong Beta Branch',
    changes: [
      { type: 'feat', text: 'Public beta branch introduced for safe Cloudflare deployment trials' },
      { type: 'feat', text: 'Website messaging rewritten around strong beta: deterministic CLI live, hosted anonymous AI coming in a later wave' },
      { type: 'fix', text: 'Signup, checkout, usage, webhook, and hosted proxy endpoints disabled until the beta gateway is ready' },
      { type: 'fix', text: 'CLI AI flows now use the user configured provider directly in Wave 1, without fake registration walls' },
      { type: 'feat', text: 'Hosted beta defaults are Qwen/Qwen3.5-9B for both text and vision' },
    ],
  },
  {
    version: '0.4.4',
    date: '2026-04-14',
    tag: '0.4.4 Release',
    changes: [
      { type: 'fix', text: 'Deepened hosted-beta upstream retry and backoff behavior again so transient free-model overload windows are less likely to surface as immediate CLI failures' },
      { type: 'feat', text: 'Added a local heuristic fallback for geotech ai-classify so descriptive soil classification can still return a USCS-style result when hosted-beta text is temporarily unavailable' },
      { type: 'fix', text: 'Added deterministic fallback behavior for the first agent turn so provider saturation now yields a useful engineering limitation analysis instead of a blank agent failure' },
      { type: 'fix', text: 'Added focused regression tests for the new ai-classify and agent fallback paths before releasing the patch' },
      { type: 'feat', text: 'Raised hosted-beta limits for installed geotechCLI clients while keeping stricter anonymous caps in place for the public beta proxy' },
      { type: 'fix', text: 'Added retry and backoff handling for transient upstream 429 and gateway overload responses so simple AI commands recover more gracefully' },
      { type: 'fix', text: 'Extended hosted-beta timeout budgets for text, vision, and agent requests and translated raw aborts into clearer timeout messages in the CLI' },
      { type: 'fix', text: 'Separated daily usage fingerprints by client mode so geotechCLI traffic no longer burns through the same low anonymous bucket' },
      { type: 'fix', text: 'Added focused hosted-beta regression tests covering client-mode limits, upstream retry behavior, and timeout handling before shipping the patch release' },
      { type: 'feat', text: 'Expanded terminal plotting so classify uscs, liquefaction, and pile now support direct engineering ASCII charts through the shared --plot flag' },
      { type: 'feat', text: 'Added geotech viz engineering presets for Mohr circle and Atterberg plasticity charts with field-friendly CLI inputs' },
      { type: 'feat', text: 'Added geotech viz file templates for compaction curves, grain-size distribution curves, and CPT-style plotting to speed up daily engineering review' },
      { type: 'feat', text: 'Committed new visualization showcase files for compaction, gradation, and CPT workflows and kept the docs in sync with the CLI surface' },
      { type: 'security', text: 'Closed agent sandbox escape paths, gated command execution more tightly, and hardened hosted-beta request handling for production-facing strong-beta use' },
      { type: 'fix', text: 'Corrected slope seismic regression behavior and locked the deterministic engineering suite back to a passing state' },
      { type: 'feat', text: 'Added additive case-file persistence, deterministic report assembly, conservative evidence records, and agent deliverable tools for report and export generation' },
      { type: 'feat', text: 'Enabled PDF and DOCX exports for deterministic stored-case reports using dedicated layout generators' },
      { type: 'feat', text: 'Added terminal visualization with geotech viz plus committed CSV and Excel showcase samples for demos and quick plotting' },
      { type: 'feat', text: 'Borehole log vision can now process multi-page PDFs page by page and merge the extracted log output into one result' },
      { type: 'fix', text: 'Added settlement trough and forgiving through aliases so the Peck plotting command matches the public examples and common user phrasing' },
      { type: 'fix', text: 'Export examples and committed mock datasets were added so GeoJSON, DXF, and CSV flows can be smoke-tested reliably' },
      { type: 'security', text: 'Updated Next.js to 15.5.15 and the Vitest toolchain to 4.1.4 so the release workspace installs cleanly with no npm audit vulnerabilities' },
      { type: 'fix', text: 'Aligned GitHub Actions and Cloudflare release jobs to Node 22 and added the direct esbuild install required by the OpenNext Cloudflare bundler' },
      { type: 'fix', text: 'Aligned the public release surface on Qwen3.5-9B defaults across docs, CLI, and website copy' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-30',
    tag: 'Stability + Safety',
    changes: [
      { type: 'security', text: 'Filesystem sandbox and shell command hardening for agent tools' },
      { type: 'feat', text: 'Pile capacity, slope stability, and lateral earth pressure modules added to the deterministic core' },
      { type: 'fix', text: 'Bearing capacity water-table correction implemented for shallow foundations' },
      { type: 'feat', text: 'Persistent CLI usage tracking and email verification flow added' },
      { type: 'feat', text: '--quiet and --dry-run wired into the CLI for safer scripted workflows' },
      { type: 'fix', text: 'Expanded guardrails, standards coverage, and tool registry breadth for agent execution' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-26',
    tag: 'Initial Release',
    changes: [
      { type: 'feat', text: 'Bearing capacity calculation (Terzaghi, Meyerhof, Hansen, Vesic)' },
      { type: 'feat', text: 'Liquefaction triggering analysis (Boulanger & Idriss 2014, NCEER)' },
      { type: 'feat', text: 'Rock & soil classification (RMR89, USCS, Q-system)' },
      { type: 'feat', text: 'TBM performance prediction, type selection, cutter wear estimation' },
      { type: 'feat', text: 'AI vision analysis: core box, hybrid RMR, sensor data, borehole logs' },
      { type: 'feat', text: 'Multi-agent orchestrator (Geo, Tunnel, Hydro, Seismic, Slope, Foundation agents)' },
      { type: 'feat', text: 'AI-powered report generation from analysis data' },
      { type: 'feat', text: 'Natural language soil classification' },
      { type: 'feat', text: 'GBR document Q&A with vision model' },
      { type: 'feat', text: 'Export to GeoJSON, DXF (AutoCAD), and CSV' },
      { type: 'feat', text: 'PLAXIS / FLAC / Rocscience bridge (detection + script generation)' },
      { type: 'feat', text: 'LLM-agnostic provider layer: Qwen, OpenAI, Anthropic, Hugging Face, and self-hosted backends' },
      { type: 'feat', text: 'Anti-abuse metering: 5 free AI calls for unregistered users, IP fingerprinting' },
      { type: 'feat', text: '--json, --verbose, --plot, --output global flags on every command' },
      { type: 'security', text: 'API keys never logged, echoed, or included in error messages' },
      { type: 'security', text: 'JSON output auto-redacts all sensitive fields' },
    ],
  },
];

const typeColors: Record<string, string> = {
  feat: 'bg-[rgba(45,212,191,0.15)] text-[var(--accent-teal)]',
  fix: 'bg-[rgba(59,130,246,0.15)] text-[var(--accent-blue)]',
  security: 'bg-[rgba(245,158,11,0.15)] text-[var(--accent-orange)]',
  breaking: 'bg-[rgba(239,68,68,0.15)] text-red-400',
};

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 px-12 pb-16 max-w-[800px]">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Changelog</h1>
        <p className="text-[var(--text-secondary)] text-base mb-12">
          Strong beta branch notes followed by the main historical release log.
        </p>

        {releases.map((release) => (
          <section key={release.version} className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-2xl font-bold tracking-tight">v{release.version}</h2>
              <span className="font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
                {release.date}
              </span>
              <span className="px-2.5 py-0.5 bg-[rgba(45,212,191,0.1)] text-[var(--accent-teal)] text-[10px] font-semibold rounded-full uppercase tracking-wider">
                {release.tag}
              </span>
            </div>

            <div className="space-y-3">
              {release.changes.map((change, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wider ${typeColors[change.type] ?? typeColors.feat}`}
                  >
                    {change.type}
                  </span>
                  <span className="text-[14px] text-[var(--text-secondary)] leading-[1.6]">
                    {change.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}

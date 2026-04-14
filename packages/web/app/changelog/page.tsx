import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { GEOTECHCLI_VERSION } from '@geotechcli/core/meta';

const releases = [
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
    tag: 'Hosted GLM Beta',
    changes: [
      { type: 'feat', text: 'Hosted GLM beta gateway enabled for strong-beta, with the public hosted defaults now standardized on glm-4.7-flash and glm-4.6v-flash' },
      { type: 'security', text: 'Proxy now validates requests, enforces model allowlists, and applies server-side rate limits before calling Z.AI' },
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
      { type: 'feat', text: 'Website messaging rewritten around strong beta: deterministic CLI live, hosted anonymous GLM coming in a later wave' },
      { type: 'fix', text: 'Signup, checkout, usage, webhook, and hosted proxy endpoints disabled until the beta gateway is ready' },
      { type: 'fix', text: 'CLI AI flows now use the user configured provider directly in Wave 1, without fake registration walls' },
      { type: 'feat', text: 'Hosted Z.AI defaults are now presented publicly as glm-4.7-flash for text and glm-4.6v-flash for vision' },
    ],
  },
  {
    version: GEOTECHCLI_VERSION,
    date: '2026-04-14',
    tag: '0.4.0 Release Prep',
    changes: [
      { type: 'security', text: 'Closed agent sandbox escape paths, gated command execution more tightly, and hardened hosted-beta request handling for production-facing strong-beta use' },
      { type: 'fix', text: 'Corrected slope seismic regression behavior and locked the deterministic engineering suite back to a passing state' },
      { type: 'feat', text: 'Added additive case-file persistence, deterministic report assembly, conservative evidence records, and agent deliverable tools for report and export generation' },
      { type: 'feat', text: 'Enabled PDF and DOCX exports for deterministic stored-case reports using dedicated layout generators' },
      { type: 'fix', text: 'Aligned the public release surface on GLM-4.7-Flash text defaults and GLM-4.6V-Flash vision defaults across docs, CLI, and website copy' },
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
      { type: 'feat', text: 'LLM-agnostic provider layer: Zhipu GLM family, OpenAI, Anthropic, and self-hosted backends' },
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

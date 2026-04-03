const features = [
  {
    icon: 'G',
    color: 'teal',
    name: 'Classification & Borehole Workflows',
    desc: 'USCS, RMR, Q-system, borehole interpretation, and export-oriented geotechnical workflows from one CLI.',
    specs: ['USCS, RMR, and Q-system', 'Borehole log interpretation path', 'GeoJSON / DXF export'],
  },
  {
    icon: 'S',
    color: 'blue',
    name: 'SPT / CPT Analysis',
    desc: 'SPT and CPT ingestion, liquefaction checks, and deterministic workflows that are practical in day-to-day site evaluation.',
    specs: ['CPT + AGS ingestion', 'Liquefaction triggering', 'Plot-ready terminal outputs'],
  },
  {
    icon: 'F',
    color: 'orange',
    name: 'Foundation Analysis',
    desc: 'Bearing, pile, retaining, and settlement-oriented calculations with deterministic geotechnical methods.',
    specs: ['Bearing + pile capacity', 'Retaining pressure checks', 'Settlement-related workflows'],
  },
  {
    icon: 'T',
    color: 'teal',
    name: 'Slope & Tunnel Commands',
    desc: 'Bishop Simplified slope stability, TBM prediction, cutter wear, and tunnel support-facing CLI workflows.',
    specs: ['Slope stability', 'TBM selection + performance', 'Tunnel reporting workflows'],
  },
  {
    icon: 'A',
    color: 'blue',
    name: 'Agentic CLI Beta',
    desc: 'Agent, chat, vision, and report commands now run against the hosted GLM beta by default, with optional BYO-provider overrides for advanced users.',
    specs: ['Hosted GLM text + vision', 'Agent + chat flows', 'Report generation beta'],
  },
  {
    icon: 'B',
    color: 'orange',
    name: 'Strong Beta Rollout',
    desc: 'Public beta is focused on installability, deterministic confidence, hosted GLM evaluation, and safe iteration before signup and billing go live.',
    specs: ['Installable CLI now', 'Hosted beta with rate limits', 'No signup or billing yet'],
  },
];

const colorMap: Record<string, string> = {
  teal: 'bg-[rgba(45,212,191,0.1)] text-[var(--accent-teal)]',
  blue: 'bg-[rgba(59,130,246,0.1)] text-[var(--accent-blue)]',
  orange: 'bg-[rgba(245,158,11,0.1)] text-[var(--accent-orange)]',
};

export function Features() {
  return (
    <section className="px-12 pb-24">
      <div className="flex items-end justify-between mb-14 gap-10">
        <div>
          <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
            Capabilities
          </div>
          <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight leading-[1.15]">
            Built for the
            <br />
            subsurface.
          </h2>
        </div>
        <p className="text-[15px] text-[var(--text-secondary)] max-w-[340px] leading-[1.6]">
          A practical beta slice of geotechCLI: deterministic engines first,
          with hosted GLM access now live and the commercial stack still gated behind later waves.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-px bg-[var(--border-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
        {features.map((f) => (
          <div
            key={f.name}
            className="bg-[var(--bg-secondary)] p-10 relative group hover:bg-[var(--bg-card)] transition-all duration-500"
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--accent-teal)] to-[var(--accent-blue)] opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
            <div
              className={`w-[42px] h-[42px] rounded-[10px] flex items-center justify-center mb-6 text-xl group-hover:scale-110 transition-transform duration-400 ${colorMap[f.color]}`}
            >
              {f.icon}
            </div>
            <h3 className="text-base font-semibold mb-2.5 tracking-tight">
              {f.name}
            </h3>
            <p className="text-[13.5px] text-[var(--text-secondary)] leading-[1.65] mb-5">
              {f.desc}
            </p>
            <div className="opacity-0 max-h-0 overflow-hidden group-hover:opacity-100 group-hover:max-h-[120px] transition-all duration-500">
              {f.specs.map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 font-[var(--font-mono)] text-[11.5px] text-[var(--text-muted)] py-0.5"
                >
                  <span className="w-1 h-1 rounded-full bg-[var(--accent-teal)] shrink-0" />
                  {s}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

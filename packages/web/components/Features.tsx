const features = [
  {
    icon: '⛏',
    color: 'teal',
    name: 'Soil Stratification Engine',
    desc: 'AI-powered borehole log interpretation with USCS & AASHTO classification, multi-borehole correlation.',
    specs: ['USCS & AASHTO classification', 'Multi-borehole correlation', 'GeoJSON / DXF export'],
  },
  {
    icon: '⏱',
    color: 'blue',
    name: 'SPT / CPT Analysis',
    desc: 'Full SPT corrections (N₁₆₀), Robertson CPT charts, and liquefaction triggering with Boulanger & Idriss 2014.',
    specs: ['Robertson 1990 / 2016 charts', 'Boulanger & Idriss CRR model', 'Real-time plotting via --plot'],
  },
  {
    icon: '⚡',
    color: 'orange',
    name: 'AI Bearing Capacity',
    desc: 'Terzaghi, Meyerhof, Hansen, and Vesic methods with AI-enhanced soil parameter estimation.',
    specs: ['Shallow & deep foundations', '4 classical methods', 'Uncertainty quantification'],
  },
  {
    icon: '📐',
    color: 'teal',
    name: 'Settlement Modeling',
    desc: 'Terzaghi 1D consolidation, Schmertmann immediate settlement, and Peck tunnel settlement trough.',
    specs: ['Terzaghi 1D consolidation', 'Schmertmann strain influence', 'CSV time-series output'],
  },
  {
    icon: '🚇',
    color: 'blue',
    name: 'TBM Performance & Selection',
    desc: 'Penetration rate, cutter wear, thrust, torque prediction. Automatic EPB/Slurry/Open TBM recommendation.',
    specs: ['NTNU/CSM penetration model', 'Gehring cutter wear model', 'Multi-mode TBM selection'],
  },
  {
    icon: '🔗',
    color: 'orange',
    name: 'Pipeline & CI/CD Ready',
    desc: 'Scriptable JSON output for batch processing. Docker, GitHub Actions, and webhook integrations.',
    specs: ['--json flag on every command', 'Webhook & Slack alerts', 'Docker & GitHub Actions'],
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
          Every geotechnical calculation you need, from bearing capacity to TBM
          selection — deterministic engines plus AI interpretation.
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

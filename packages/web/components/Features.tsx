'use client';

import { Reveal } from '@/components/Reveal';

const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 12h4l3-9 4 18 3-9h4" />
      </svg>
    ),
    colorClass: 'teal',
    name: 'Classification & Borehole',
    desc: 'USCS, RMR89, Q-system, and borehole log interpretation from one CLI. Export to GeoJSON or AutoCAD DXF.',
    tag: 'Live',
    tagColor: 'teal',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" /><path d="M8 12l2.5 2.5L16 9" />
      </svg>
    ),
    colorClass: 'cyan',
    name: 'Foundation Analysis',
    desc: 'Bearing capacity via Terzaghi, Meyerhof, Hansen, and Vesic. Pile capacity, retaining pressure, and settlement.',
    tag: 'Deterministic',
    tagColor: 'cyan',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    colorClass: 'purple',
    name: 'Slope & Liquefaction',
    desc: 'Bishop Simplified slope stability and Boulanger & Idriss 2014 seismic liquefaction triggering analysis.',
    tag: 'Deterministic',
    tagColor: 'purple',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
      </svg>
    ),
    colorClass: 'teal',
    name: 'TBM & Tunnel Commands',
    desc: 'TBM penetration rate, thrust, torque, cutter wear prediction, and type selection for mechanised tunnelling.',
    tag: 'Live',
    tagColor: 'teal',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    colorClass: 'cyan',
    name: 'AI Agent & Vision Beta',
    desc: 'Multi-agent orchestration, chat, vision workflows (core box, RMR, borehole log), and report generation via hosted GLM.',
    tag: 'AI Beta',
    tagColor: 'cyan',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    colorClass: 'purple',
    name: 'Export & Bridge',
    desc: 'Export to GeoJSON, DXF, and CSV. Detect running PLAXIS, FLAC, or Rocscience processes and generate automation scripts.',
    tag: 'Live',
    tagColor: 'purple',
  },
];

const palette = {
  teal:   { bg: 'rgba(0,229,160,0.08)',   text: 'var(--accent-teal)',   border: 'rgba(0,229,160,0.15)'   },
  cyan:   { bg: 'rgba(0,196,255,0.08)',   text: 'var(--accent-cyan)',   border: 'rgba(0,196,255,0.15)'   },
  purple: { bg: 'rgba(123,97,255,0.08)', text: 'var(--accent-purple)', border: 'rgba(123,97,255,0.15)' },
};

export function Features() {
  return (
    <section className="px-12 pb-24 max-w-[1200px] mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-16">
        <Reveal>
          <div className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[2.5px] text-[var(--accent-teal)] mb-4">
            Capabilities
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h2
            className="font-bold tracking-[-2px] leading-[1.1] mb-5"
            style={{ fontSize: 'clamp(30px,4vw,50px)' }}
          >
            Built for the subsurface.
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="text-[17px] text-[var(--text-secondary)] max-w-[460px] mx-auto leading-[1.7]">
            Deterministic engines first. AI capabilities now live via hosted GLM beta.
            Commercial stack gated behind later waves.
          </p>
        </Reveal>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-6">
        {features.map((f, i) => {
          const p = palette[f.colorClass as keyof typeof palette];
          return (
            <Reveal key={f.name} delay={i * 80}>
              <div
                className="group relative rounded-2xl p-8 border transition-all duration-400 cursor-default overflow-hidden"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(-4px)';
                  el.style.borderColor = p.border;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = '';
                  el.style.borderColor = 'var(--border-color)';
                }}
              >
                {/* Top gradient line on hover */}
                <div
                  className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                  style={{ background: `linear-gradient(90deg, transparent, ${p.text}, transparent)` }}
                />

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform duration-400 group-hover:scale-110"
                  style={{ background: p.bg, color: p.text }}
                >
                  {f.icon}
                </div>

                <h3 className="text-[17px] font-bold mb-2.5 tracking-tight">{f.name}</h3>
                <p className="text-[13.5px] text-[var(--text-secondary)] leading-[1.7] mb-5">{f.desc}</p>

                {/* Tag */}
                <span
                  className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border"
                  style={{ background: p.bg, color: p.text, borderColor: p.border }}
                >
                  {f.tag}
                </span>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

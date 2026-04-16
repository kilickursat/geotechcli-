'use client';

import { Reveal } from '@/components/Reveal';

const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    colorClass: 'teal',
    name: 'Multi-Agent Orchestration',
    desc: 'Geo, Foundation, Seismic, Tunnel, Slope, and Hydro agents collaborate autonomously — powered by Qwen3.5-9B via hosted beta on Modal. No key required.',
    tag: 'Qwen3.5-9B',
    tagColor: 'teal',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    ),
    colorClass: 'cyan',
    name: 'Vision AI Workflows',
    desc: 'Point a photo at a tunnel face, core box, or borehole log — Qwen3.5-9B extracts RQD, fracture spacing, weathering, and USCS classification automatically.',
    tag: 'Qwen3.5-9B',
    tagColor: 'cyan',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    colorClass: 'purple',
    name: 'AI Chat & GBR Q&A',
    desc: 'Interactive AI session with project memory, or interrogate a Geotechnical Baseline Report using vision-backed document Q&A — all from the terminal.',
    tag: 'Agentic AI',
    tagColor: 'purple',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 12h4l3-9 4 18 3-9h4" />
      </svg>
    ),
    colorClass: 'teal',
    name: 'Deterministic Engines',
    desc: 'USCS, RMR89, Q-system, bearing capacity (4 methods), pile, slope, liquefaction, TBM, retaining, and terminal engineering plots like Mohr circle, plasticity, compaction, and gradation.',
    tag: 'Live',
    tagColor: 'teal',
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
      </svg>
    ),
    colorClass: 'cyan',
    name: 'TBM & Tunnel Analysis',
    desc: 'Penetration rate, thrust, torque, cutter wear prediction, and TBM type selection — then hand off to a tunnel agent for full subsurface reasoning.',
    tag: 'Live + AI',
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
    name: 'AI Report Generation',
    desc: 'One command drafts a full geotechnical report from your analysis data — structured sections, engineering language, export to Markdown or JSON.',
    tag: 'Qwen3.5-9B',
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
            Deterministic engines first. AI capabilities now live via hosted Qwen beta on Modal.
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

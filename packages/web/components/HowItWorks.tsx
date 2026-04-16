import { Reveal } from '@/components/Reveal';

const steps = [
  {
    num: '1',
    accent: 'var(--accent-teal)',
    glow: 'rgba(0,229,160,0.2)',
    title: 'Install',
    desc: 'One npm command. No runtime dependencies, no provider key, no account required. Node.js LTS is all you need.',
    cli: { prompt: 'var(--accent-teal)', line: 'npm install -g geotechcli' },
  },
  {
    num: '2',
    accent: 'var(--accent-cyan)',
    glow: 'rgba(0,196,255,0.2)',
    title: 'Analyze',
    desc: 'Run deterministic calculations or send AI commands against the hosted Qwen beta. Results in seconds, not spreadsheets.',
    cli: { prompt: 'var(--accent-cyan)', line: 'geotech bearing --depth 5 --phi 30 --cohesion 25' },
  },
  {
    num: '3',
    accent: 'var(--accent-purple)',
    glow: 'rgba(123,97,255,0.2)',
    title: 'Deliver',
    desc: 'Export to JSON, GeoJSON, DXF, or generate an AI-drafted report. Pipe output to scripts or CI pipelines.',
    cli: { prompt: 'var(--accent-purple)', line: 'geotech report --json > site-analysis.json' },
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-12 py-28 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="text-center mb-20">
        <Reveal>
          <div className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[2.5px] text-[var(--accent-teal)] mb-4">
            Workflow
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h2
            className="font-bold tracking-[-2px] leading-[1.1] mb-5"
            style={{ fontSize: 'clamp(30px,4vw,50px)' }}
          >
            Three commands. Full pipeline.
          </h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="text-[17px] text-[var(--text-secondary)] max-w-[480px] mx-auto leading-[1.7]">
            From raw site parameters to engineering deliverables — no boilerplate, no setup friction.
          </p>
        </Reveal>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-3 gap-10 relative">
        {/* Connector line */}
        <div
          className="absolute top-[28px] left-[22%] right-[22%] h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(0,229,160,0.3), rgba(0,196,255,0.3), transparent)',
          }}
        />

        {steps.map((step, i) => (
          <Reveal key={step.num} delay={i * 120} className="text-center">
            {/* Number circle */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-extrabold mx-auto mb-7 relative z-10"
              style={{
                border: `2px solid ${step.accent}`,
                color: step.accent,
                background: 'var(--bg-primary)',
                boxShadow: `0 0 28px ${step.glow}`,
              }}
            >
              {step.num}
            </div>

            <h3 className="text-[18px] font-bold mb-3 tracking-tight">{step.title}</h3>
            <p className="text-[14px] text-[var(--text-secondary)] leading-[1.75] max-w-[260px] mx-auto mb-5">
              {step.desc}
            </p>

            {/* CLI snippet */}
            <div
              className="rounded-lg px-4 py-3 font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)] text-left"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              <span style={{ color: step.cli.prompt === 'var(--accent-teal)' ? 'var(--accent-teal)' : step.cli.prompt === 'var(--accent-cyan)' ? 'var(--accent-cyan)' : 'var(--accent-purple)' }}>
                $
              </span>{' '}
              {step.cli.line}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

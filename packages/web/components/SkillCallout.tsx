'use client';

import { Reveal } from '@/components/Reveal';

const highlights = [
  'Bundled with the strong-beta install and bootstrapped on first use',
  'Direct CLI workflow for list, show, validate, and run',
  'Optional agent and chat access with the per-session --skills flag',
];

export function SkillCallout() {
  return (
    <section className="px-12 pb-24 max-w-[1200px] mx-auto w-full">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <Reveal>
          <div
            className="rounded-[24px] p-9 border"
            style={{
              background: 'linear-gradient(180deg, rgba(0,229,160,0.08), rgba(0,196,255,0.03))',
              borderColor: 'rgba(0,229,160,0.14)',
            }}
          >
            <div className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[2.5px] text-[var(--accent-teal)] mb-4">
              Bundled Skills
            </div>
            <h2
              className="font-bold tracking-[-2px] leading-[1.1] mb-5"
              style={{ fontSize: 'clamp(28px,3.5vw,44px)' }}
            >
              Strong-beta skills are now visible, bundled, and ready.
            </h2>
            <p className="text-[16px] text-[var(--text-secondary)] leading-[1.75] max-w-[520px] mb-7">
              Use the local skill catalog directly from the CLI, or let agent and chat sessions
              opt into the approved skill toolset when you want repeatable workflows inside AI analysis.
            </p>
            <div className="space-y-3 mb-8">
              {highlights.map((item) => (
                <div key={item} className="flex items-start gap-3 text-[14px] text-[var(--text-secondary)] leading-[1.6]">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--accent-teal)' }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              <a
                href="/docs#skills"
                className="px-5 py-3 rounded-lg text-[14px] font-semibold transition"
                style={{
                  background: 'var(--accent-teal)',
                  color: 'var(--bg-primary)',
                }}
              >
                Read Skill Docs
              </a>
              <a
                href="/changelog"
                className="px-5 py-3 rounded-lg text-[14px] font-semibold border transition"
                style={{
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                See Release Notes
              </a>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div
            className="rounded-[24px] overflow-hidden border"
            style={{
              background: 'rgba(10,10,20,0.9)',
              borderColor: 'var(--border-color)',
              boxShadow: '0 0 0 1px rgba(0,196,255,0.05), 0 24px 64px rgba(0,0,0,0.35)',
            }}
          >
            <div
              className="px-5 py-4 border-b font-[var(--font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--text-muted)]"
              style={{ borderColor: 'var(--border-color)' }}
            >
              skill workflow
            </div>
            <pre className="p-5 font-[var(--font-mono)] text-[13px] leading-[1.9] text-[var(--text-secondary)] overflow-x-auto">
              <span style={{ color: 'var(--text-muted)' }}># See the bundled catalog</span>
              {'\n'}
              <span style={{ color: 'var(--accent-teal)' }}>$</span>{' '}
              <span style={{ color: 'var(--text-primary)' }}>geotech skill list</span>
              {'\n'}
              <span style={{ color: 'var(--accent-cyan)' }}>49 bundled strong-beta skills detected</span>
              {'\n'}
              {'\n'}
              <span style={{ color: 'var(--text-muted)' }}># Inspect one installed workflow</span>
              {'\n'}
              <span style={{ color: 'var(--accent-teal)' }}>$</span>{' '}
              <span style={{ color: 'var(--text-primary)' }}>geotech skill show shallow-foundation-option-screening</span>
              {'\n'}
              <span style={{ color: 'var(--text-primary)' }}>approval:</span>{' '}
              <span style={{ color: 'var(--accent-teal)' }}>approved</span>
              {'\n'}
              <span style={{ color: 'var(--text-primary)' }}>runtime:</span>{' '}
              <span style={{ color: 'var(--accent-cyan)' }}>python-script</span>
              {'\n'}
              {'\n'}
              <span style={{ color: 'var(--text-muted)' }}># Let agent use skills for one session</span>
              {'\n'}
              <span style={{ color: 'var(--accent-teal)' }}>$</span>{' '}
              <span style={{ color: 'var(--text-primary)' }}>geotech agent</span>{' '}
              <span style={{ color: 'var(--accent-cyan)' }}>&quot;screen shallow foundation options for this site&quot;</span>{' '}
              <span style={{ color: 'var(--accent-purple)' }}>--skills</span>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

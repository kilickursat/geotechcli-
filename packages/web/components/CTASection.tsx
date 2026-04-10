'use client';

import { Reveal } from '@/components/Reveal';

export function CTASection() {
  return (
    <section className="py-28 px-12 text-center max-w-[860px] mx-auto">
      <div
        className="relative rounded-3xl px-16 py-20 overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 0%, rgba(0,229,160,0.05), transparent 60%)' }}
        />
        <div className="relative z-10">
          <Reveal>
            <div className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[2.5px] text-[var(--accent-teal)] mb-5">
              Get Started
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h2
              className="font-bold tracking-[-2px] leading-[1.1] mb-4"
              style={{ fontSize: 'clamp(28px,3.5vw,44px)' }}
            >
              Install the beta.
              <br />Shape the product.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-[var(--text-secondary)] text-[16px] mb-10 max-w-md mx-auto leading-[1.7]">
              No signup. No credit card. No provider key required.
              The strong beta is focused on real CLI usage and safe iteration.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="flex gap-4 justify-center flex-wrap">
              <a
                href="/docs"
                className="px-8 py-3.5 font-bold text-[15px] rounded-lg transition-all duration-300 inline-block"
                style={{ background: 'var(--accent-teal)', color: 'var(--bg-primary)', letterSpacing: '-0.3px' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.boxShadow = '0 8px 40px rgba(0,229,160,0.35)';
                  el.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.boxShadow = '';
                  el.style.transform = '';
                }}
              >
                Install Beta →
              </a>
              <a
                href="mailto:support@geotechcli.com"
                className="px-8 py-3.5 font-semibold text-[15px] rounded-lg border transition-all duration-300 inline-block"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', letterSpacing: '-0.3px' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = 'rgba(255,255,255,0.2)';
                  el.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = 'rgba(255,255,255,0.1)';
                  el.style.color = 'var(--text-secondary)';
                }}
              >
                Contact Us
              </a>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <p className="text-[12px] text-[var(--text-muted)] mt-6">
              Free during beta · No credit card · Privacy-first AI evaluation
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core/meta';
import { FREE_DETERMINISTIC, TIER1_LLM, BYOK_PROVIDERS } from '@/lib/tiers';
import {
  PATREON_JOIN_URL,
  PATREON_PAGE_URL,
  GITHUB_URL,
  MEMBERSHIP_TIERS,
} from '@/lib/site';

// Community-supported open source section (kept exported as `Pricing` for existing
// imports on the homepage and /pricing route). The support ask leads; the
// free-vs-donation-supported breakdown follows it.
export function Pricing() {
  return (
    <section className="px-12 py-24" id="support">
      <div className="text-center mb-16">
        <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
          Community-supported open source
        </div>
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight">
          Keep geotechCLI open, reliable, and accessible.
        </h2>
        <p className="text-[var(--text-secondary)] text-[15px] mt-3 max-w-[680px] mx-auto leading-relaxed">
          geotechCLI is an Apache-2.0 open-source toolkit for geotechnical engineering. The
          deterministic engines remain free for everyone. Sponsorship helps cover hosted AI usage,
          cross-platform testing, documentation, security maintenance, and the time required to
          review contributions and ship dependable releases.
        </p>
      </div>

      {/* Sponsor monthly */}
      <div className="max-w-[1100px] mx-auto">
        <h3 className="text-center text-[clamp(22px,2.5vw,30px)] font-bold tracking-tight mb-8">
          Sponsor monthly
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {MEMBERSHIP_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={
                tier.recommended
                  ? 'rounded-2xl p-7 bg-[var(--bg-card)] border-2 border-[var(--accent-teal)] shadow-[0_0_40px_rgba(0,229,160,0.08)] flex flex-col'
                  : 'rounded-2xl p-7 bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col'
              }
            >
              {tier.recommended && (
                <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--accent-teal)] mb-2">
                  Recommended
                </div>
              )}
              <div className="text-lg font-semibold">{tier.name}</div>
              <div className="mt-1 mb-1">
                <span className="text-[32px] font-bold tracking-tight">${tier.priceUsd}</span>
                <span className="text-[13px] text-[var(--text-muted)]"> / month</span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mb-5">{tier.tagline}</p>
              <ul className="flex-1 space-y-2 mb-6">
                {tier.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)] leading-[1.5]">
                    <span className="text-[var(--accent-teal)] mt-0.5 shrink-0">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <a
                href={PATREON_JOIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  tier.recommended
                    ? 'text-center px-6 py-3 rounded-lg text-sm font-bold bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110 transition'
                    : 'text-center px-6 py-3 rounded-lg text-sm font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition'
                }
              >
                Sponsor on Patreon — ${tier.priceUsd}/mo
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* How billing works — stated plainly, not as a warning */}
      <div className="max-w-[1100px] mx-auto mt-6 rounded-2xl p-8 bg-[var(--bg-secondary)] border border-[var(--border-color)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight mb-1">How sponsorship works</h3>
            <p className="text-[var(--text-secondary)] text-[14px] max-w-[560px] leading-relaxed">
              Sponsorship runs through Patreon and is billed{' '}
              <span className="text-[var(--text-primary)] font-semibold">monthly</span>. You can change
              tier or cancel at any time from your Patreon account, and cancelling keeps the month you
              have already paid for. There is no minimum commitment and no contract.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3">
            <a
              href={PATREON_JOIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center px-7 py-3 rounded-lg text-sm font-bold bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110 transition"
            >
              Sponsor on Patreon
            </a>
            <a
              href={PATREON_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center px-7 py-2.5 rounded-lg text-[13px] font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              View our Patreon
            </a>
          </div>
        </div>
      </div>

      {/* Trust note */}
      <div className="max-w-[1100px] mx-auto mt-4 rounded-2xl p-6 bg-[var(--bg-secondary)] border border-[var(--border-color)]">
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          <span className="font-semibold text-[var(--text-primary)]">Trust note:</span> Sponsorship is
          optional and never changes access to the project. It does not purchase engineering approval,
          an SLA, roadmap control, or a guaranteed feature. Priorities remain based on safety,
          community value, and maintainer capacity.
        </p>
      </div>

      {/* Contribute time */}
      <div className="max-w-[1100px] mx-auto mt-4 rounded-2xl p-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight mb-1">Prefer to contribute time?</h3>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-[620px]">
            Report an issue, improve the documentation, propose a test case, or open a pull request.
            Apache-2.0 licensed — issues and pull requests are open to everyone, and you never need to
            be a sponsor to contribute.
          </p>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-center px-6 py-2.5 rounded-lg text-[13px] font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
        >
          View on GitHub →
        </a>
      </div>

      {/* What is free vs donation-supported — kept below the support ask */}
      <div className="max-w-[1100px] mx-auto mt-16">
        <h3 className="text-center text-[clamp(22px,2.5vw,30px)] font-bold tracking-tight mb-3">
          What is free, and what your support funds
        </h3>
        <p className="text-center text-[var(--text-secondary)] text-[14px] mb-8 max-w-[640px] mx-auto">
          Every deterministic geotechnical calculation is free for everyone, forever — no signup,
          works offline. The agentic LLM features are what sponsorship keeps running.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Free forever — deterministic */}
          <div className="rounded-2xl p-8 bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold">Deterministic CLI</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[rgba(45,212,191,0.15)] text-[var(--accent-teal)]">
                Free forever
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mb-6">No signup · works offline · no API key</p>
            <ul className="flex-1 space-y-2.5">
              {FREE_DETERMINISTIC.map((feature) => (
                <li
                  key={feature.command}
                  className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)] leading-[1.5]"
                >
                  <span className="text-[var(--accent-teal)] mt-0.5 shrink-0">-</span>
                  <span>
                    <span className="text-[var(--text-primary)] font-medium">{feature.name}</span> — {feature.desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tier-1 — donation-supported LLM/agentic */}
          <div className="rounded-2xl p-8 bg-[var(--bg-card)] border-2 border-[var(--accent-purple)] shadow-[0_0_40px_rgba(123,97,255,0.1)] flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold">Tier-1 LLM &amp; Agentic</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[rgba(123,97,255,0.15)] text-[var(--accent-purple)]">
                Sponsor-supported
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mb-6">
              Hosted GLM defaults: {DEFAULT_LLM_MODEL} (text) / {DEFAULT_LLM_VISION_MODEL} (vision) — or bring your own key.
            </p>
            <ul className="flex-1 space-y-2.5">
              {TIER1_LLM.map((feature) => (
                <li
                  key={feature.command}
                  className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)] leading-[1.5]"
                >
                  <span className="text-[var(--accent-purple)] mt-0.5 shrink-0">-</span>
                  <span>
                    <span className="text-[var(--text-primary)] font-medium">{feature.name}</span> — {feature.desc}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-5 border-t border-[var(--border-color)]">
              <p className="text-[12px] text-[var(--text-muted)]">
                Bring your own key: {BYOK_PROVIDERS.join(' · ')}.
              </p>
            </div>
          </div>
        </div>
        <p className="text-center text-[12px] text-[var(--text-muted)] mt-6">
          Deterministic engines stay free whether or not anyone sponsors — they run offline with no
          key and no account.
        </p>
      </div>
    </section>
  );
}

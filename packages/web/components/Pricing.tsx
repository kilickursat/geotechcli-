import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core/meta';
import { FREE_DETERMINISTIC, TIER1_LLM, BYOK_PROVIDERS } from '@/lib/tiers';
import { PATREON_JOIN_URL, PATREON_PAGE_URL, DONATION_MINIMUM_USD, GITHUB_URL, MEMBERSHIP_TIERS } from '@/lib/site';

// Donation & Membership section (kept exported as `Pricing` for existing imports on the
// homepage and /pricing route). Discloses exactly what is free vs donation-supported.
export function Pricing() {
  return (
    <section className="px-12 py-24" id="support">
      <div className="text-center mb-16">
        <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
          Support &amp; Membership
        </div>
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight">
          Deterministic tools are free. LLM features run on your support.
        </h2>
        <p className="text-[var(--text-secondary)] text-[15px] mt-3 max-w-[640px] mx-auto">
          Every deterministic geotechnical calculation in the CLI is free for everyone, forever — no signup,
          works offline. The agentic LLM (Tier-1) features are donation-supported so we can keep building.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-[1100px] mx-auto lg:grid-cols-2">
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
              Donation-supported
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

      {/* Open source strip */}
      <div className="max-w-[1100px] mx-auto mt-6 rounded-2xl p-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight mb-1">geotechCLI is open source</h3>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-[620px]">
            Apache-2.0 licensed — fork it, star it, contribute. Issues and pull requests are open to
            everyone; sponsorship adds priority collaboration on top, never a paywall.
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

      {/* Membership tiers */}
      <div className="max-w-[1100px] mx-auto mt-10">
        <h3 className="text-center text-[clamp(22px,2.5vw,30px)] font-bold tracking-tight mb-8">Choose your membership</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {MEMBERSHIP_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={
                tier.id === 'excellent'
                  ? 'rounded-2xl p-7 bg-[var(--bg-card)] border-2 border-[var(--accent-teal)] shadow-[0_0_40px_rgba(0,229,160,0.08)] flex flex-col'
                  : 'rounded-2xl p-7 bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col'
              }
            >
              {tier.id === 'excellent' && (
                <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--accent-teal)] mb-2">
                  Most popular
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
                  tier.id === 'excellent'
                    ? 'text-center px-6 py-3 rounded-lg text-sm font-bold bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110 transition'
                    : 'text-center px-6 py-3 rounded-lg text-sm font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition'
                }
              >
                Join — ${tier.priceUsd}/mo
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Donate card + the required Patreon recurring-cancel notice */}
      <div className="max-w-[1100px] mx-auto mt-6 rounded-2xl p-8 bg-[var(--bg-secondary)] border border-[var(--border-color)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight mb-1">Support Tier-1 with a donation</h3>
            <p className="text-[var(--text-secondary)] text-[14px] max-w-[560px] leading-relaxed">
              Donations start at{' '}
              <span className="text-[var(--text-primary)] font-semibold">${DONATION_MINIMUM_USD} or more</span>{' '}
              through Patreon. Your support keeps the LLM and agentic features alive and improving.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3">
            <a
              href={PATREON_JOIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center px-7 py-3 rounded-lg text-sm font-bold bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110 transition"
            >
              Donate on Patreon — ${DONATION_MINIMUM_USD}+
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

        <div
          className="mt-6 rounded-xl p-5 border"
          style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-[var(--accent-orange)] text-lg font-bold leading-none mt-0.5" aria-hidden>
              !
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[var(--accent-orange)] mb-1">Before you donate — please read</p>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                Patreon has no one-time payment option; memberships{' '}
                <span className="font-semibold text-[var(--text-primary)]">renew automatically every month</span>. Our
                goal is a donation, not a subscription. To keep it a one-time gift and avoid automatic withdrawals in
                the following months,{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  cancel your Patreon membership immediately after your payment clears
                </span>
                . Your support for this month is what matters — thank you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

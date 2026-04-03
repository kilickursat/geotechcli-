import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core';

const tiers = [
  {
    name: 'Strong Beta',
    price: '$0',
    period: 'for now',
    highlight: true,
    badge: 'Active',
    features: [
      'Unlimited deterministic calculations',
      'Hosted GLM beta access with no user provider key',
      `Current defaults: ${DEFAULT_LLM_MODEL} and ${DEFAULT_LLM_VISION_MODEL}`,
      'Server-side rate limits and abuse protection',
      'Docs, changelog, and feedback-driven updates',
      'No signup or billing during this wave',
    ],
    cta: 'Install Beta',
    ctaLink: '/docs',
    disabled: false,
  },
  {
    name: 'Lite Pro',
    price: 'Coming Soon',
    period: '',
    highlight: false,
    badge: 'Planned',
    features: [
      'Hosted GLM usage tiers are under evaluation',
      'Roadmap pricing only, not purchasable in beta',
      'Feedback from strong-beta will shape final limits',
    ],
    cta: 'Coming Soon',
    ctaLink: '/pricing',
    disabled: true,
  },
  {
    name: 'Pro',
    price: 'Coming Soon',
    period: '',
    highlight: false,
    badge: 'Planned',
    features: [
      'Bring Your Own LLM and hosted plans will return later',
      'Beta branch is not selling paid access yet',
      'Production entitlements come after billing validation',
    ],
    cta: 'Coming Soon',
    ctaLink: '/pricing',
    disabled: true,
  },
  {
    name: 'Annual',
    price: 'Coming Soon',
    period: '',
    highlight: false,
    badge: 'Planned',
    features: [
      'Reserved for the stable product phase',
      'No live annual plan during strong beta',
      'Commercial rollout starts after beta validation',
    ],
    cta: 'Coming Soon',
    ctaLink: '/pricing',
    disabled: true,
  },
];

export function Pricing() {
  return (
    <section className="px-12 py-24" id="pricing">
      <div className="text-center mb-16">
        <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
          Beta Rollout
        </div>
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight">
          Strong beta now. Commercial rollout later.
        </h2>
        <p className="text-[var(--text-secondary)] text-[15px] mt-3 max-w-[480px] mx-auto">
          Deterministic calculations and hosted GLM beta access are live now.
          Paid tiers are still being introduced carefully in later waves.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-[1200px] mx-auto md:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-2xl p-8 flex flex-col ${
              tier.highlight
                ? 'bg-[var(--bg-card)] border-2 border-[var(--accent-teal)] shadow-[0_0_40px_rgba(45,212,191,0.1)]'
                : 'bg-[var(--bg-secondary)] border border-[var(--border-color)]'
            }`}
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--accent-teal)] text-[var(--bg-primary)] text-[10px] font-bold uppercase tracking-wider rounded-full">
                Available Now
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg font-semibold">{tier.name}</span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    tier.highlight
                      ? 'bg-[rgba(45,212,191,0.15)] text-[var(--accent-teal)]'
                      : 'bg-[rgba(59,130,246,0.1)] text-[var(--accent-blue)]'
                  }`}
                >
                  {tier.badge}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-sm text-[var(--text-muted)]">{tier.period}</span>
              </div>
            </div>

            <ul className="flex-1 space-y-3 mb-8">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)] leading-[1.5]"
                >
                  <span className="text-[var(--accent-teal)] mt-0.5 shrink-0">-</span>
                  {feature}
                </li>
              ))}
            </ul>

            {tier.disabled ? (
              <span className="block text-center py-2.5 rounded-lg text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] cursor-not-allowed">
                {tier.cta}
              </span>
            ) : (
              <a
                href={tier.ctaLink}
                className="block text-center py-2.5 rounded-lg text-sm font-semibold transition bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110"
              >
                {tier.cta}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

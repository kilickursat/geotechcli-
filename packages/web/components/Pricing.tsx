import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
  TIER_LIMITS,
} from '@geotechcli/core';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    highlight: false,
    badge: 'Default Models',
    features: [
      `${DEFAULT_LLM_MODEL} + ${DEFAULT_LLM_VISION_MODEL} default models`,
      `${TIER_LIMITS.free.llmCallsPerMonth} AI analyses / month`,
      `${TIER_LIMITS.free.visionCallsPerMonth} vision analyses / month`,
      `${TIER_LIMITS.free.agentCallsPerMonth} agent tasks / month`,
      'Unlimited deterministic calculations',
      '--json output for CI/CD',
      'Community support',
    ],
    cta: 'Get Started Free',
    ctaLink: '/docs',
  },
  {
    name: 'Lite Pro',
    price: '$15',
    period: '/month',
    highlight: false,
    badge: 'GLM Unlimited',
    features: [
      'Everything in Free',
      'Unlimited GLM model access',
      `${TIER_LIMITS.lite_pro.llmCallsPerMonth.toLocaleString()} AI analyses / month`,
      `${TIER_LIMITS.lite_pro.visionCallsPerMonth.toLocaleString()} vision analyses / month`,
      `${TIER_LIMITS.lite_pro.agentCallsPerMonth.toLocaleString()} agent tasks / month`,
      'PDF report generation',
      'Email support',
    ],
    cta: 'Subscribe',
    ctaLink: '/pricing',
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    highlight: true,
    badge: 'BYOL Enabled',
    features: [
      'Everything in Lite Pro',
      'Bring Your Own LLM (OpenAI, Anthropic, etc.)',
      'Unlimited everything',
      'Batch processing',
      'PLAXIS / FLAC / Rocscience bridge',
      'DXF / GeoJSON / Excel export',
      'Priority support',
    ],
    cta: 'Go Pro',
    ctaLink: '/pricing',
  },
  {
    name: 'Annual',
    price: '$399',
    period: '/year',
    highlight: false,
    badge: 'Save 32%',
    features: [
      'Everything in Pro',
      'Billed annually ($33/mo effective)',
      'CI/CD batch pipelines',
      'Dedicated support channel',
      'SLA guarantee',
      'Custom model deployment',
      'Early access to new features',
    ],
    cta: 'Get Annual',
    ctaLink: '/pricing',
  },
];

export function Pricing() {
  return (
    <section className="px-12 py-24" id="pricing">
      <div className="text-center mb-16">
        <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
          Pricing
        </div>
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight">
          Start free. Scale when ready.
        </h2>
        <p className="text-[var(--text-secondary)] text-[15px] mt-3 max-w-[480px] mx-auto">
          Deterministic calculations are always free and unlimited. AI features
          are metered by tier.
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
                Most Popular
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
                  <span className="text-[var(--accent-teal)] mt-0.5 shrink-0">•</span>
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href={tier.ctaLink}
              className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition ${
                tier.highlight
                  ? 'bg-[var(--accent-teal)] text-[var(--bg-primary)] hover:brightness-110'
                  : 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--accent-teal)]'
              }`}
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

// Single source of truth for deploy environment, canonical URL, indexing, and donation links.
// Derived from NEXT_PUBLIC_APP_URL, which is set per-deploy:
//   production worker -> https://www.geotechcli.com  (public, indexed)
//   beta worker       -> https://beta.geotechcli.com (internal R&D, noindex)
// Reused by app/layout.tsx (metadata), app/robots.ts (indexing), app/sitemap.ts, and the donation UI.

const DEFAULT_BETA_URL = 'https://beta.geotechcli.com';
const PUBLIC_PRODUCTION_URL = 'https://www.geotechcli.com';

function normalizeUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_BETA_URL;
  return trimmed.replace(/\/+$/, '');
}

/** The canonical base URL for this deploy (no trailing slash). */
export const SITE_URL = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL);

/** True only on the public production host (www). Everything else stays non-public / noindex. */
export const IS_PUBLIC_PRODUCTION = SITE_URL === PUBLIC_PRODUCTION_URL;

// Sponsorship links. Patreon is the single sponsorship flow.
//
// GitHub Sponsors was evaluated and dropped: its payouts run through Stripe
// Connect, which does not support ゆうちょ銀行 (Japan Post Bank), so the
// maintainer cannot actually receive money through it. Nothing on the site may
// advertise a one-time contribution while Patreon is the only flow — Patreon
// memberships are recurring monthly, and offering a one-time option we cannot
// honour would be worse than not offering one at all.

/** Sponsor CTA target: the Patreon membership / join flow. */
export const PATREON_JOIN_URL = 'https://www.patreon.com/16003704/join';
/** Secondary link: the public creator page. */
export const PATREON_PAGE_URL = 'https://www.patreon.com/c/geotechcli/posts';

/** Lowest monthly tier shown in the UI. */
export const DONATION_MINIMUM_USD = 10;

/** Public open-source repository (Apache-2.0). */
export const GITHUB_URL = 'https://github.com/kilickursat/geotechcli-';

/**
 * Monthly sponsorship tiers. Prices mirror the live Patreon tiers so the site
 * never advertises an amount different from what a sponsor is actually charged.
 * Benefits describe funding purpose and optional recognition only — no support
 * SLA, roadmap control, or professional-services commitments.
 */
export const MEMBERSHIP_TIERS = [
  {
    id: 'community-backer',
    name: 'Community Backer',
    priceUsd: 10,
    tagline: 'Hosting, CI and shared API costs',
    recommended: false,
    benefits: [
      'Help cover hosting, CI, and shared API costs',
      'Optional recognition in SUPPORTERS.md',
    ],
  },
  {
    id: 'project-sustainer',
    name: 'Project Sustainer',
    priceUsd: 50,
    tagline: 'Testing, documentation, security and releases',
    recommended: true,
    benefits: [
      'Support documentation, testing, maintenance, and regular releases',
      'Optional recognition in SUPPORTERS.md',
      'Periodic public project updates',
    ],
  },
  {
    id: 'organization-sponsor',
    name: 'Organization Sponsor',
    priceUsd: 100,
    tagline: 'Firms, labs and universities',
    recommended: false,
    benefits: [
      'For engineering firms, research groups, and universities using geotechCLI',
      'Optional name or logo recognition on the sponsor page and README',
    ],
  },
] as const;

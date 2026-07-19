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

// Patreon donation links (honor-based Tier-1 funding).
/** Donate CTA target: the membership / join flow. */
export const PATREON_JOIN_URL = 'https://www.patreon.com/16003704/join';
/** Secondary link: the public creator page. */
export const PATREON_PAGE_URL = 'https://www.patreon.com/c/geotechcli/posts';

/** Minimum suggested donation shown in the UI. */
export const DONATION_MINIMUM_USD = 10;

/** Public open-source repository (Apache-2.0). */
export const GITHUB_URL = 'https://github.com/kilickursat/geotechcli-';

/** Patreon membership tiers shown on the support page (copy reworked for the site). */
export const MEMBERSHIP_TIERS = [
  {
    id: 'supporter',
    name: 'Supporter',
    priceUsd: 10,
    tagline: 'Keep the free hosted AI free',
    benefits: [
      'Fund development and the hosted GLM API bill',
      'Early access to new AI features',
      'Your name in the SUPPORTERS list (opt-in)',
    ],
  },
  {
    id: 'excellent',
    name: 'Excellent Support',
    priceUsd: 50,
    tagline: 'Become part of the journey',
    benefits: [
      'Everything in Supporter',
      'Priority support and feedback',
      'Roadmap influence on new features',
      'Hands-on collaboration time on your geotech projects',
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond Supporter',
    priceUsd: 500,
    tagline: 'Drive the future of the tool',
    benefits: [
      'Everything in Excellent Support',
      'Deep-level implementation partnership',
      'Direct access to the maintainer',
      'Sponsored-feature prioritization',
    ],
  },
] as const;

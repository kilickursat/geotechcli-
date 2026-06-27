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

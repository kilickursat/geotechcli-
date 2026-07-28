import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf-8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const routeExpectations = [
  {
    path: ['packages', 'web', 'app', 'api', 'version', 'route.ts'],
    handlers: ['GET'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'proxy', 'route.ts'],
    handlers: ['GET', 'POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'auth', 'route.ts'],
    handlers: ['POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'usage', 'route.ts'],
    handlers: ['GET'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'checkout', 'route.ts'],
    handlers: ['POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'webhook', 'route.ts'],
    handlers: ['POST'],
  },
];

for (const route of routeExpectations) {
  const source = readText(...route.path);
  for (const handler of route.handlers) {
    assert(
      source.includes(`export async function ${handler}`),
      `${route.path.join('/')} is missing ${handler} handler export.`,
    );
  }
}

// Domain-aware indexing + sitemap: production (www) indexable, beta stays noindex.
const siteSource = readText('packages', 'web', 'lib', 'site.ts');
assert(
  siteSource.includes('SITE_URL') && siteSource.includes('IS_PUBLIC_PRODUCTION'),
  'packages/web/lib/site.ts must export SITE_URL and IS_PUBLIC_PRODUCTION.',
);
assert(
  siteSource.includes('https://www.geotechcli.com') && siteSource.includes('https://beta.geotechcli.com'),
  'packages/web/lib/site.ts must define both the production (www) and beta hosts.',
);
assert(
  siteSource.includes('https://www.patreon.com/16003704/join'),
  'packages/web/lib/site.ts must define the Patreon join URL as the sponsorship flow.',
);
assert(
  siteSource.includes('https://github.com/kilickursat/geotechcli-'),
  'packages/web/lib/site.ts must define the public GitHub repository URL.',
);
assert(
  siteSource.includes('MEMBERSHIP_TIERS') &&
    ['Community Backer', 'Project Sustainer', 'Organization Sponsor'].every((tier) =>
      siteSource.includes(tier),
    ),
  'packages/web/lib/site.ts must define the three monthly sponsorship tiers.',
);
assert(
  !/Excellent Support|Diamond Supporter/.test(siteSource),
  'The retired Excellent Support / Diamond Supporter tiers must not reappear in packages/web/lib/site.ts.',
);

// Patreon is the only sponsorship flow. GitHub Sponsors payouts run through
// Stripe Connect, which does not support the maintainer's bank, so no surface
// may link it — a dead sponsor button is worse than none.
const pricingComponentSource = readText('packages', 'web', 'components', 'Pricing.tsx');
const pricingRouteSource = readText('packages', 'web', 'app', 'pricing', 'page.tsx');
const ctaSource = readText('packages', 'web', 'components', 'CTASection.tsx');
for (const [label, source] of [
  ['components/Pricing.tsx', pricingComponentSource],
  ['app/pricing/page.tsx', pricingRouteSource],
  ['components/CTASection.tsx', ctaSource],
]) {
  assert(
    !/github\.com\/sponsors/i.test(source) && !source.includes('GITHUB_SPONSORS_URL'),
    `${label} must not link GitHub Sponsors — payouts are not receivable through it.`,
  );
  assert(
    source.includes('PATREON_JOIN_URL'),
    `${label} must link the Patreon sponsorship flow.`,
  );
}
// The support page must not tell sponsors to cancel immediately after paying.
for (const [label, source] of [
  ['components/Pricing.tsx', pricingComponentSource],
  ['app/pricing/page.tsx', pricingRouteSource],
]) {
  assert(
    !/cancel your Patreon membership immediately|immediately after your payment clears/i.test(source),
    `${label} must not instruct sponsors to cancel their membership immediately after paying.`,
  );
}
// Patreon cannot process one-time payments, so nothing may advertise one.
assert(
  !/one-time|one time/i.test(pricingComponentSource),
  'components/Pricing.tsx must not advertise a one-time contribution while Patreon is the only flow.',
);
assert(
  pricingComponentSource.includes('Recommended') && !pricingComponentSource.includes('Most popular'),
  'components/Pricing.tsx must label the mid tier "Recommended", not "Most popular".',
);
assert(
  /Trust note/i.test(pricingComponentSource),
  'components/Pricing.tsx must carry the sponsorship trust note.',
);
assert(
  /billed\{?'?\s*\}?\s*<?/.test(pricingComponentSource) && /monthly/i.test(pricingComponentSource),
  'components/Pricing.tsx must state plainly that sponsorship is billed monthly.',
);

const robotsSource = readText('packages', 'web', 'app', 'robots.ts');
assert(
  robotsSource.includes('IS_PUBLIC_PRODUCTION'),
  'packages/web/app/robots.ts must gate indexing on IS_PUBLIC_PRODUCTION.',
);
assert(
  robotsSource.includes("disallow: '/'"),
  'packages/web/app/robots.ts must keep disallow for non-production hosts (beta stays noindex).',
);
assert(
  robotsSource.includes('sitemap'),
  'packages/web/app/robots.ts must link the sitemap on production.',
);

const sitemapSource = readText('packages', 'web', 'app', 'sitemap.ts');
assert(
  sitemapSource.includes('SITE_URL'),
  'packages/web/app/sitemap.ts must build URLs from SITE_URL.',
);

console.log('smoke-web-routes: OK');

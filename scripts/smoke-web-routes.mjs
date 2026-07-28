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
  siteSource.includes('https://github.com/sponsors/kilickursat'),
  'packages/web/lib/site.ts must define the GitHub Sponsors URL as the primary sponsor flow.',
);
assert(
  siteSource.includes('https://www.patreon.com/16003704/join'),
  'packages/web/lib/site.ts must keep the Patreon join URL for existing sponsors.',
);
assert(
  siteSource.includes('https://github.com/kilickursat/geotechcli-'),
  'packages/web/lib/site.ts must define the public GitHub repository URL.',
);
assert(
  siteSource.includes('ONE_TIME_AMOUNTS_USD') &&
    ['10', '25', '50'].every((amount) => siteSource.includes(amount)),
  'packages/web/lib/site.ts must define the one-time contribution amounts (10 / 25 / 50).',
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

// The support page must not tell sponsors to cancel immediately after paying —
// one-time contributions now go through GitHub Sponsors instead.
const pricingComponentSource = readText('packages', 'web', 'components', 'Pricing.tsx');
const pricingRouteSource = readText('packages', 'web', 'app', 'pricing', 'page.tsx');
for (const [label, source] of [
  ['components/Pricing.tsx', pricingComponentSource],
  ['app/pricing/page.tsx', pricingRouteSource],
]) {
  assert(
    !/cancel your Patreon membership immediately/i.test(source),
    `${label} must not instruct sponsors to cancel their membership immediately after paying.`,
  );
  assert(
    source.includes('GITHUB_SPONSORS_URL'),
    `${label} must link the GitHub Sponsors flow.`,
  );
}
assert(
  pricingComponentSource.includes('Recommended') && !pricingComponentSource.includes('Most popular'),
  'components/Pricing.tsx must label the mid tier "Recommended", not "Most popular".',
);
assert(
  /Trust note/i.test(pricingComponentSource),
  'components/Pricing.tsx must carry the sponsorship trust note.',
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

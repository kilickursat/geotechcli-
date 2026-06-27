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
  'packages/web/lib/site.ts must define the Patreon donate (join) URL.',
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

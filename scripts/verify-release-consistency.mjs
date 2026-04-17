import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf-8');
}

function readJson(...parts) {
  return JSON.parse(readText(...parts));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const metadata = readJson('packages', 'core', 'src', 'meta', 'metadata.json');
const cliPkg = readJson('packages', 'cli', 'package.json');
const corePkg = readJson('packages', 'core', 'package.json');
const webPkg = readJson('packages', 'web', 'package.json');

for (const pkg of [cliPkg, corePkg, webPkg]) {
  assert(
    pkg.version === metadata.version,
    `Package ${pkg.name} version ${pkg.version} does not match shared metadata version ${metadata.version}.`,
  );
}

const readme = readText('README.md');
assert(
  readme.includes(metadata.defaults.provider),
  `README.md must mention the shared default provider ${metadata.defaults.provider}.`,
);
assert(
  readme.includes(metadata.defaults.model),
  `README.md must mention the shared default text model ${metadata.defaults.model}.`,
);
assert(
  readme.includes(metadata.defaults.visionModel),
  `README.md must mention the shared default vision model ${metadata.defaults.visionModel}.`,
);
for (const requiredFlag of ['--quiet', '--dry-run']) {
  assert(
    readme.includes(requiredFlag),
    `README.md is missing required global flag documentation for ${requiredFlag}.`,
  );
}

const statusSource = readText('packages', 'cli', 'src', 'commands', 'status.ts');
assert(
  statusSource.includes('GEOTECHCLI_VERSION'),
  'CLI status command must use GEOTECHCLI_VERSION from shared metadata.',
);
assert(
  statusSource.includes('probeHostedBetaHealth') && statusSource.includes('hosted_beta_health'),
  'CLI status command must use hosted-beta health probing by default.',
);
assert(
  statusSource.includes('--live') && statusSource.includes('live_completion'),
  'CLI status command must keep the live completion probe behind --live.',
);

const liquefactionSource = readText('packages', 'cli', 'src', 'commands', 'liquefaction.ts');
assert(
  liquefactionSource.includes("option('--demo'") &&
    liquefactionSource.includes('else if (opts.demo)'),
  'Liquefaction command must require explicit --demo for built-in sample data.',
);
assert(
  liquefactionSource.includes('No SPT profile provided. Use --spt-profile <file>, provide --depth/--spt, or pass --demo.'),
  'Liquefaction command must fail clearly when no real input or --demo is provided.',
);

const exportSource = readText('packages', 'cli', 'src', 'commands', 'export.ts');
assert(
  exportSource.includes('Missing latitude/longitude') && exportSource.includes('Provide lat/lng or latitude/longitude fields'),
  'GeoJSON export must reject missing coordinates instead of fabricating them.',
);
assert(
  !exportSource.includes('35.0 + i') && !exportSource.includes('139.0 + i'),
  'GeoJSON export must not inject fallback coordinates.',
);

const envExample = readText('.env.example');
assert(
  envExample.includes('GEOTECHCLI_PROXY_URL=https://beta.geotechcli.com/api/proxy') &&
    envExample.includes('NEXT_PUBLIC_APP_URL=https://beta.geotechcli.com'),
  '.env.example must point at the beta geotechcli.com host for both proxy and app URL.',
);
assert(
  envExample.includes('MODAL_ENDPOINT_URL=') &&
    envExample.includes('MODAL_API_TOKEN='),
  '.env.example must document the Modal hosted-beta endpoint and optional bearer token.',
);
assert(
  !envExample.includes('GEOTECHCLI_PROXY_URL=https://geotechcli.com/api/proxy') &&
    !envExample.includes('NEXT_PUBLIC_APP_URL=https://geotechcli.com') &&
    !envExample.includes('ZAI_API_BASE_URL='),
  '.env.example must not reference the legacy apex host or the retired Z.AI upstream.',
);

const docsSource = readText('packages', 'web', 'app', 'docs', 'page.tsx');
assert(
  docsSource.includes('GLOBAL_FLAG_DEFINITIONS'),
  'Docs page must render global flags from shared metadata.',
);

const pricingSource = readText('packages', 'web', 'app', 'pricing', 'page.tsx');
assert(
  pricingSource.includes('DEFAULT_LLM_MODEL') &&
    pricingSource.includes('DEFAULT_LLM_VISION_MODEL'),
  'Pricing page must use shared default model metadata.',
);

const changelogSource = readText('packages', 'web', 'app', 'changelog', 'page.tsx');
assert(
  changelogSource.includes('GEOTECHCLI_VERSION'),
  'Changelog page must use GEOTECHCLI_VERSION for the current release entry.',
);

console.log('verify-release-consistency: OK');

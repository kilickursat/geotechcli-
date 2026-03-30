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
  readme.includes(`Default: Zhipu ${metadata.defaults.model}`),
  `README.md must mention the shared default text model ${metadata.defaults.model}.`,
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

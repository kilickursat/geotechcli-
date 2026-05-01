import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf-8');
}

function readJson(...parts) {
  return JSON.parse(readText(...parts));
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
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
const skillApprovalSource = readText('packages', 'core', 'src', 'skills', 'approval.ts');
const approvedSkillCount = countMatches(skillApprovalSource, /approval\('approved'/g);
const promptOnlySkillCount = countMatches(skillApprovalSource, /approval\('prompt_only'/g);
const totalBundledSkillCount = approvedSkillCount + promptOnlySkillCount;
const lockfile = readJson('package-lock.json');
const lockCliPkg = lockfile.packages?.['packages/cli'];
const lockCorePkg = lockfile.packages?.['packages/core'];
const lockWebPkg = lockfile.packages?.['packages/web'];

assert(metadata.defaults.provider === 'hosted-beta', 'Strong beta must keep hosted-beta as the public default provider.');
assert(metadata.defaults.model === 'glm-5.1', `Default text model must be glm-5.1, found ${metadata.defaults.model}.`);
assert(metadata.defaults.visionModel === 'glm-5v-turbo', `Default vision model must be glm-5v-turbo, found ${metadata.defaults.visionModel}.`);
assert(
  Array.isArray(metadata.proxyModels) &&
    metadata.proxyModels.includes('glm-5.1') &&
    metadata.proxyModels.includes('glm-5v-turbo') &&
    !metadata.proxyModels.some((model) => /qwen/i.test(model)),
  'Supported proxy models must include the GLM text and vision defaults and must not include stale Qwen defaults.',
);

for (const pkg of [cliPkg, corePkg, webPkg]) {
  assert(
    pkg.version === metadata.version,
    `Package ${pkg.name} version ${pkg.version} does not match shared metadata version ${metadata.version}.`,
  );
}

assert(
  cliPkg.dependencies?.['@geotechcli/core'] === corePkg.version,
  `CLI dependency on @geotechcli/core must be pinned exactly to ${corePkg.version}, found ${cliPkg.dependencies?.['@geotechcli/core']}.`,
);
assert(
  webPkg.dependencies?.['@geotechcli/core'] === corePkg.version,
  `Web dependency on @geotechcli/core must be pinned exactly to ${corePkg.version}, found ${webPkg.dependencies?.['@geotechcli/core']}.`,
);
assert(lockCliPkg?.version === cliPkg.version, `package-lock.json CLI version ${lockCliPkg?.version} does not match package version ${cliPkg.version}.`);
assert(lockCorePkg?.version === corePkg.version, `package-lock.json core version ${lockCorePkg?.version} does not match package version ${corePkg.version}.`);
assert(lockWebPkg?.version === webPkg.version, `package-lock.json web version ${lockWebPkg?.version} does not match package version ${webPkg.version}.`);
assert(
  lockCliPkg?.dependencies?.['@geotechcli/core'] === corePkg.version,
  `package-lock.json CLI dependency on @geotechcli/core must be pinned exactly to ${corePkg.version}, found ${lockCliPkg?.dependencies?.['@geotechcli/core']}.`,
);
assert(
  lockWebPkg?.dependencies?.['@geotechcli/core'] === corePkg.version,
  `package-lock.json web dependency on @geotechcli/core must be pinned exactly to ${corePkg.version}, found ${lockWebPkg?.dependencies?.['@geotechcli/core']}.`,
);

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
assert(
  readme.includes(`Current bundled strong-beta catalog: ${totalBundledSkillCount} skills total, including ${approvedSkillCount} approved executable skills and ${promptOnlySkillCount} prompt-only reviewer skill.`),
  'README.md must keep the bundled strong-beta skill counts aligned with the approval catalog.',
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
  envExample.includes('ZHIPU_API_KEY=') &&
    envExample.includes('ZHIPU_API_BASE_URL=https://api.z.ai/api/paas/v4') &&
    !envExample.includes('MODAL_ENDPOINT_URL=') &&
    !envExample.includes('MODAL_API_TOKEN='),
  '.env.example must document Z.ai hosted-beta secrets and must not advertise Modal as the active hosted-beta upstream.',
);
assert(
  !envExample.includes('GEOTECHCLI_PROXY_URL=https://geotechcli.com/api/proxy') &&
    !envExample.includes('NEXT_PUBLIC_APP_URL=https://geotechcli.com') &&
    !envExample.includes('ZAI_API_BASE_URL='),
  '.env.example must not reference the legacy apex host or duplicate Z.ai env aliases.',
);

const proxyRouteSource = readText('packages', 'web', 'app', 'api', 'proxy', 'route.ts');
assert(
  proxyRouteSource.includes('getHostedBetaUpstreamApiKey') &&
    proxyRouteSource.includes('getHostedBetaUpstreamChatCompletionsUrl') &&
    !proxyRouteSource.includes('MODAL_ENDPOINT_URL') &&
    !proxyRouteSource.includes('MODAL_API_TOKEN') &&
    !proxyRouteSource.includes('modal.run'),
  'Hosted beta proxy must use the Z.ai/ZHIPU upstream secret path and must not call the legacy Modal endpoint.',
);

const modalDeployWorkflow = readText('.github', 'workflows', 'modal-deploy.yml');
assert(
  !modalDeployWorkflow.includes('branches: [strong-beta]') &&
    modalDeployWorkflow.includes('run_legacy_modal_deploy') &&
    modalDeployWorkflow.includes('Deploy Legacy Qwen to Modal'),
  'Legacy Modal workflow must remain present but disabled from automatic strong-beta pushes.',
);

const docsSource = readText('packages', 'web', 'app', 'docs', 'page.tsx');
assert(
  docsSource.includes('GLOBAL_FLAG_DEFINITIONS'),
  'Docs page must render global flags from shared metadata.',
);
assert(
  docsSource.includes(`Strong beta currently bundles ${totalBundledSkillCount} skills: ${approvedSkillCount} approved executable skills and ${promptOnlySkillCount} prompt-only reviewer skill.`),
  'Docs page must keep bundled skill counts aligned with the approval catalog.',
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
const rootChangelog = readText('CHANGELOG.md');
const topChangelogVersion = rootChangelog.match(/^## \[([^\]]+)\]/m)?.[1];
assert(
  topChangelogVersion === metadata.version,
  `CHANGELOG.md top entry must match shared metadata version ${metadata.version}, found ${topChangelogVersion ?? '(missing)'}.`,
);

const featureSource = readText('packages', 'web', 'components', 'Features.tsx');
assert(
  featureSource.includes(`${totalBundledSkillCount} bundled strong-beta skills ship`) &&
    featureSource.includes('--skills'),
  'Homepage features panel must keep bundled-skill messaging aligned with the approval catalog and per-session --skills opt-in.',
);

const skillCalloutSource = readText('packages', 'web', 'components', 'SkillCallout.tsx');
assert(
  skillCalloutSource.includes(`${totalBundledSkillCount} bundled strong-beta skills detected`) &&
    skillCalloutSource.includes('--skills'),
  'Homepage skill callout must keep bundled-skill messaging aligned with the approval catalog and per-session --skills opt-in.',
);

const versionRouteSource = readText('packages', 'web', 'app', 'api', 'version', 'route.ts');
assert(
  versionRouteSource.includes('DEFAULT_LLM_PROVIDER') &&
    versionRouteSource.includes('GEOTECHCLI_VERSION'),
  '/api/version must expose shared provider and version metadata from the core package.',
);

console.log('verify-release-consistency: OK');

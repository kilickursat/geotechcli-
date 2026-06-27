// Authoritative Tier-1 disclosure for the public site: what is free vs donation-supported.
// Sourced from the CLI command surface (packages/cli/src/index.ts). Shown so users see exactly
// what their donation supports before they pay (honor-based funding model).

export interface FeatureItem {
  command: string;
  name: string;
  desc: string;
}

/** Free forever — deterministic, offline, no signup, no key. */
export const FREE_DETERMINISTIC: FeatureItem[] = [
  { command: 'geotech bearing', name: 'Bearing capacity', desc: 'Terzaghi / Meyerhof / Hansen / Vesic.' },
  { command: 'geotech liquefaction', name: 'Liquefaction', desc: 'Boulanger & Idriss / NCEER triggering.' },
  { command: 'geotech classify', name: 'Classification', desc: 'USCS, RMR89, Q-system.' },
  { command: 'geotech pile', name: 'Pile capacity', desc: 'Alpha / beta / SPT methods.' },
  { command: 'geotech slope', name: 'Slope stability', desc: 'Bishop simplified.' },
  { command: 'geotech retaining', name: 'Retaining / earth pressure', desc: 'Rankine / Coulomb.' },
  { command: 'geotech seepage', name: 'Seepage', desc: 'Deterministic groundwater routing.' },
  { command: 'geotech settlement', name: 'Settlement', desc: 'Elastic / consolidation / Schmertmann.' },
  { command: 'geotech tunnel', name: 'Tunnel / TBM', desc: 'Penetration, thrust, torque, cutter wear, TBM selection.' },
  { command: 'geotech analyze', name: 'Workspace analysis', desc: 'Evidence-bound GroundModel + verifier, fully offline.' },
  { command: 'geotech signal', name: 'Monitoring analysis', desc: 'Settlement, piezometer, inclinometer, vibration, load-test trends.' },
  { command: 'geotech viz', name: 'Visualization', desc: 'Interactive engineering plots.' },
  { command: 'geotech export', name: 'Export', desc: 'CSV, DXF, GeoJSON, AGSi, DIGGS interchange.' },
  { command: 'geotech skill', name: 'Bundled skills', desc: 'Repeatable deterministic screening workflows.' },
];

/** Tier-1 — LLM / agentic features, donation-supported. */
export const TIER1_LLM: FeatureItem[] = [
  { command: 'geotech chat', name: 'Agentic chat', desc: 'Interactive ReAct agent with memory; auto-loads your project dataset.' },
  { command: 'geotech agent', name: 'Project agent', desc: 'Reasons over the GroundModel and routes work into deterministic tools.' },
  { command: 'geotech ingest', name: 'Document ingest', desc: 'Evidence-bound extraction from borehole logs and reports (PDF/image).' },
  { command: 'geotech vision', name: 'Vision workflows', desc: 'Core box, tunnel-face RMR, sensor charts, borehole-log photos.' },
  { command: 'geotech gbr', name: 'GBR Q&A', desc: 'Interrogate a Geotechnical Baseline Report in the terminal.' },
  { command: 'geotech report', name: 'AI report synthesis', desc: 'Draft evidence-first geotechnical reports.' },
  { command: 'geotech ai-classify', name: 'NL classification', desc: 'Soil description to USCS + properties.' },
];

/** Bring-your-own-key providers usable for Tier-1 features. */
export const BYOK_PROVIDERS = [
  'OpenAI',
  'Anthropic',
  'Zhipu / Z.ai',
  'OpenAI-compatible / OpenRouter',
  'Hugging Face',
];

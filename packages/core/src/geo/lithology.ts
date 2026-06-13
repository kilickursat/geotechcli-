/**
 * Shared deterministic lithology normalization.
 *
 * Soil/rock descriptions were classified by six independent ad-hoc matchers across the codebase
 * (vision heuristic, ingest dossier material key/tone, integrated-review class, workspace dossier
 * kind, html cross-section fallback, and USCS extraction) with subtly different vocabularies and two
 * real bugs (organic dropped to 'unknown'/'mixed'). This module is the single controlled vocabulary
 * they all delegate to. It is pure, deterministic, dependency-free, and never uses fuzzy matching.
 *
 * Raw descriptions are always preserved by callers; this only derives normalized labels.
 */

export type LithologyMaterialKey =
  | 'organic'
  | 'bedrock'
  | 'weathered-rock'
  | 'gravel'
  | 'sand'
  | 'clay'
  | 'silt'
  | 'fill'
  | 'mixed';

/** Collapsed class used by the integrated-review model (bedrock/weathered-rock -> 'rock'). */
export type LithologyClass = 'fill' | 'clay' | 'silt' | 'sand' | 'gravel' | 'rock' | 'organic' | 'mixed';

export type LithologyTone = 'neutral' | 'warning' | 'accent' | 'good';

export interface LithologyNormalization {
  key: LithologyMaterialKey;
  materialClass: LithologyClass;
  uscsSymbol: string | null;
  tone: LithologyTone;
  confidence: number;
  matchedTerms: string[];
}

export interface LithologyDescriptors {
  hasClay: boolean;
  hasSilt: boolean;
  hasSand: boolean;
  hasGravel: boolean;
  hasOrganic: boolean;
  hasPeat: boolean;
  highPlasticity: boolean;
  lowPlasticity: boolean;
  wellGraded: boolean;
  poorlyGraded: boolean;
  lowPermeability: boolean;
  highPermeability: boolean;
  softConsistency: boolean;
  stiffConsistency: boolean;
  looseDensity: boolean;
  denseDensity: boolean;
}

export const LITHOLOGY_MATERIAL_KEYS: readonly LithologyMaterialKey[] = [
  'organic',
  'bedrock',
  'weathered-rock',
  'gravel',
  'sand',
  'clay',
  'silt',
  'fill',
  'mixed',
];

const USCS_SYMBOL_RE = /\b(GW|GP|GM|GC|SW|SP|SM|SC|ML|CL|OL|MH|CH|OH|PT|CL-ML)\b/i;

/** Exact USCS-symbol regex (formerly inferUscsFromText in vision/geotech-document.ts). */
export function extractUscsSymbol(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const match = text.match(USCS_SYMBOL_RE);
  return match ? match[1]!.toUpperCase() : null;
}

// Canonical key matchers in precedence order. The vocabulary is the SUPERSET of all prior sites:
// the full rock-name union, `moderately strong`, cobble/boulder, topsoil, and organic.
const KEY_MATCHERS: ReadonlyArray<{ key: Exclude<LithologyMaterialKey, 'mixed'>; pattern: RegExp }> = [
  { key: 'organic', pattern: /peat|organic|top\s*soil|topsoil/ },
  {
    key: 'bedrock',
    pattern: /bedrock|fresh\s+rock|moderately\s+strong|strong\s+(?:shale|sandstone|siltstone|mudstone|limestone|granite|basalt|gneiss|rock)/,
  },
  {
    key: 'weathered-rock',
    pattern: /weathered|fractured|residual\s+rock|rocky\s+shale|shale|sandstone|siltstone|mudstone|limestone|granite|basalt|gneiss|rock/,
  },
  { key: 'gravel', pattern: /gravel|cobble|boulder|\bgm\b|\bgp\b|\bgw\b/ },
  { key: 'sand', pattern: /sand|\bsm\b|\bsp\b|\bsw\b|\bsc\b/ },
  { key: 'clay', pattern: /clay|clayey|\bci\b|\bcl\b|\bch\b/ },
  { key: 'silt', pattern: /silt|silty|\bml\b|\bmh\b/ },
  { key: 'fill', pattern: /fill|made\s+ground|debris/ },
];

/**
 * Tone matcher — replicated VERBATIM from the original ingest-dossier materialTone (clay before
 * sand). Tone intentionally has a different precedence than the key, so e.g. "sandy clay" -> key
 * `sand` but tone `warning`, and "mudstone" -> key `weathered-rock` but tone `good`. Do not derive
 * tone from the key.
 */
function matchTone(text: string): LithologyTone {
  if (/rock|shale|limestone|sandstone|fractured|weathered/.test(text)) return 'neutral';
  if (/clay|ci|cl|ch/.test(text)) return 'warning';
  if (/sand|sm|sp|sw|gravel|gm|gp|gw/.test(text)) return 'accent';
  return 'good';
}

export function lithologyClassForKey(key: LithologyMaterialKey): LithologyClass {
  if (key === 'bedrock' || key === 'weathered-rock') return 'rock';
  return key;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Detect the descriptor flags the vision heuristic relies on. Normalization matches the original
 * vision routine exactly (lowercase + strip non-[a-z0-9\s/-]); the only intentional change is that
 * `boulder` now counts as a coarse-grained (gravel-family) descriptor (D3).
 */
export function detectLithologyDescriptors(description: string): LithologyDescriptors {
  const normalized = description.toLowerCase().replace(/[^a-z0-9\s/-]+/g, ' ');
  return {
    hasClay: includesAny(normalized, [' clay', 'clayey', 'fat clay', 'lean clay']) || normalized.startsWith('clay'),
    hasSilt: includesAny(normalized, [' silt', 'silty']) || normalized.startsWith('silt'),
    hasSand: includesAny(normalized, [' sand', 'sandy']) || normalized.startsWith('sand'),
    hasGravel:
      includesAny(normalized, [' gravel', 'gravelly', 'cobble', 'cobbly', 'boulder']) || normalized.startsWith('gravel'),
    hasOrganic: includesAny(normalized, ['organic', 'organics', 'humic', 'humus']),
    hasPeat: includesAny(normalized, ['peat', 'peaty']),
    highPlasticity: includesAny(normalized, ['high plasticity', 'very plastic', 'fat clay', 'high pi']),
    lowPlasticity: includesAny(normalized, ['low plasticity', 'lean clay', 'lean silt', 'low pi']),
    wellGraded: includesAny(normalized, ['well graded', 'well-graded', 'wide gradation']),
    poorlyGraded: includesAny(normalized, ['poorly graded', 'poorly-graded', 'uniform']),
    lowPermeability: includesAny(normalized, ['low permeability', 'impermeable', 'low hydraulic conductivity']),
    highPermeability: includesAny(normalized, ['high permeability', 'free draining', 'freely draining']),
    softConsistency: includesAny(normalized, ['very soft', 'soft']),
    stiffConsistency: includesAny(normalized, ['very stiff', 'stiff', 'hard']),
    looseDensity: includesAny(normalized, ['very loose', 'loose']),
    denseDensity: includesAny(normalized, ['very dense', 'dense']),
  };
}

function matchKey(text: string): { key: LithologyMaterialKey; matchedTerms: string[] } {
  const matchedTerms: string[] = [];
  let key: LithologyMaterialKey = 'mixed';
  for (const matcher of KEY_MATCHERS) {
    if (matcher.pattern.test(text)) {
      matchedTerms.push(matcher.key);
      if (key === 'mixed') {
        key = matcher.key;
      }
    }
  }
  return { key, matchedTerms };
}

/**
 * Normalize a soil/rock description (plus optional explicit USCS symbol) to a canonical material
 * key, collapsed class, tone, and a 0-1 confidence. Key and tone matching use `.toLowerCase()` only
 * (matching the original material-key/tone matchers); the explicit USCS symbol, when given, is
 * appended to the matching text exactly as the dossier matchers did.
 */
export function normalizeLithology(
  description: string | null | undefined,
  uscsSymbol?: string | null,
): LithologyNormalization {
  const desc = typeof description === 'string' ? description : '';
  const explicit = typeof uscsSymbol === 'string' && uscsSymbol.trim() ? uscsSymbol.trim().toUpperCase() : null;
  const matchText = `${desc} ${explicit ?? ''}`.toLowerCase();

  const { key, matchedTerms } = matchKey(matchText);
  const tone = matchTone(matchText);
  const resolvedUscs = explicit ?? extractUscsSymbol(desc);
  const descriptors = detectLithologyDescriptors(desc);

  let confidence: number;
  if (key === 'mixed') {
    confidence = 0.35;
  } else {
    const extraCategories = [
      descriptors.highPlasticity || descriptors.lowPlasticity,
      descriptors.wellGraded || descriptors.poorlyGraded,
      descriptors.lowPermeability || descriptors.highPermeability,
      descriptors.softConsistency || descriptors.stiffConsistency || descriptors.looseDensity || descriptors.denseDensity,
      resolvedUscs != null,
    ].filter(Boolean).length;
    confidence = Math.min(0.9, 0.58 + 0.08 * extraCategories);
  }

  return {
    key,
    materialClass: lithologyClassForKey(key),
    uscsSymbol: resolvedUscs,
    tone,
    confidence,
    matchedTerms,
  };
}

import type { LLMConfig } from '../llm/types.js';
import { generateVision, generateText } from '../llm/router.js';
import { classifyRMR89 } from '../geo/classification.js';
import {
  clampConfidence,
  createParseSafety,
  deriveParseStatus,
  normalizeWarnings,
  parseJsonObject,
  readNumber,
  readString,
  type ParseSafety,
  type ParseStatus,
} from './parse.js';

export type { ParseSafety, ParseStatus } from './parse.js';

// ---------------------------------------------------------------------------
// Vision retry helper — handles upstream empty-content failures
// ---------------------------------------------------------------------------

function isRecoverableVisionEmptyResponse(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('returned no content') ||
    message.includes('did not contain assistant text') ||
    message.includes('no completion choices') ||
    message.includes('empty completion')
  );
}

/**
 * Execute a vision call with automatic retry on empty/null response.
 * First attempt: strict JSON-only prompt at low temperature.
 * Second attempt: softer plain-text prompt at higher temperature, same image.
 * This handles hosted-beta vision models returning empty content on the first call.
 */
async function visionWithRetry(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  strictPrompt: string,
  softPrompt: string,
  systemPrompt: string,
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; usedFallback: boolean }> {
  const start = Date.now();

  // Attempt 1: strict JSON prompt
  try {
    const r1 = await generateVision(strictPrompt, imageBase64, mimeType, config, {
      systemPrompt,
      temperature: 0.1,
      maxTokens,
    });
    if (r1.text && r1.text.trim().length > 10) {
      return { text: r1.text, latencyMs: r1.latencyMs, usedFallback: false };
    }
  } catch (error) {
    if (!isRecoverableVisionEmptyResponse(error)) {
      throw error;
    }
  }

  // Attempt 2: softer plain text prompt
  try {
    const r2 = await generateVision(softPrompt, imageBase64, mimeType, config, {
      systemPrompt:
        systemPrompt + ' Be concise but thorough. You must provide values even if approximate.',
      temperature: 0.3,
      maxTokens: maxTokens + 200,
    });

    if (r2.text && r2.text.trim().length > 0) {
      return {
        text: r2.text,
        latencyMs: Date.now() - start,
        usedFallback: true,
      };
    }
  } catch (error) {
    if (!isRecoverableVisionEmptyResponse(error)) {
      throw error;
    }
  }

  return {
    text: '',
    latencyMs: Date.now() - start,
    usedFallback: true,
  };
}

const VALID_JOINT_CONDITIONS = [
  'very_good',
  'good',
  'fair',
  'poor',
  'very_poor',
] as const;

const VALID_GROUNDWATER_CONDITIONS = [
  'dry',
  'damp',
  'wet',
  'dripping',
  'flowing',
] as const;

function asEnumValue<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  warnings: string[],
  key: string,
): T[number] | null {
  if (value && allowed.includes(value as T[number])) {
    return value as T[number];
  }
  warnings.push(`Field "${key}" must be one of: ${allowed.join(', ')}.`);
  return null;
}

function combineWarnings(base: string[], extra: string[]): string[] {
  return [...new Set([...base, ...extra])];
}

function splitSentences(rawText: string): string[] {
  return rawText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function firstMatchingSentence(
  rawText: string,
  predicate: (sentence: string) => boolean,
): string | null {
  return splitSentences(rawText).find(predicate) ?? null;
}

function inferSensorType(rawText: string): string | null {
  const normalized = rawText.toLowerCase();
  if (normalized.includes('piezometer')) return 'piezometer';
  if (normalized.includes('inclinometer')) return 'inclinometer';
  if (normalized.includes('extensometer')) return 'extensometer';
  if (normalized.includes('load cell')) return 'load_cell';
  if (normalized.includes('settlement plate')) return 'settlement_plate';
  if (normalized.includes('tiltmeter')) return 'tiltmeter';
  return null;
}

function inferSensorEvaluation(rawText: string): string | null {
  const normalized = rawText.toLowerCase();
  if (/(critical|alarm|urgent|failure|unsafe|exceed)/.test(normalized)) return 'critical';
  if (/(warning|alert|watch|caution|elevated)/.test(normalized)) return 'warning';
  if (/(normal|stable|within limit|acceptable|no significant movement)/.test(normalized)) return 'normal';
  return null;
}

function extractSensorFallback(rawText: string): {
  value: Record<string, unknown> | null;
  baseStatus: ParseStatus;
  warnings: string[];
} {
  if (!rawText.trim()) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  const sensorType = inferSensorType(rawText);
  const measurements = firstMatchingSentence(
    rawText,
    (sentence) => /\d/.test(sentence) || /(reading|pressure|head|displacement|settlement|movement|trend)/i.test(sentence),
  );
  const interpretation = firstMatchingSentence(
    rawText,
    (sentence) => /(indicat|show|suggest|trend|behavio|movement|response)/i.test(sentence),
  ) ?? splitSentences(rawText)[0] ?? null;
  const evaluation = inferSensorEvaluation(rawText);
  const recommendations = firstMatchingSentence(
    rawText,
    (sentence) => /(recommend|should|monitor|inspect|review|action|recheck)/i.test(sentence),
  );

  const presentCount = [sensorType, measurements, interpretation, evaluation, recommendations]
    .filter((value) => value != null && value !== '')
    .length;

  if (presentCount === 0) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  return {
    value: {
      sensorType,
      measurements,
      interpretation,
      evaluation,
      recommendations,
    },
    baseStatus: 'partial',
    warnings: ['Vision model returned narrative text; extracted partial structured sensor fields.'],
  };
}

function inferUscsFromText(rawText: string): string | null {
  const match = rawText.match(/\b(GW|GP|GM|GC|SW|SP|SM|SC|ML|CL|OL|MH|CH|OH|PT)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function extractBoreholeFallback(rawText: string, boreholeId?: string): {
  value: Record<string, unknown> | null;
  baseStatus: ParseStatus;
  warnings: string[];
} {
  if (!rawText.trim()) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  const layers: Array<Record<string, unknown>> = [];
  const layerRegex = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*m[:\s-]*([^\n.;]+)/gi;
  for (const match of rawText.matchAll(layerRegex)) {
    const description = match[3]?.trim() ?? '';
    const sptMatch = description.match(/(?:spt|n)[-=\s:]*?(\d+(?:\.\d+)?)/i);
    layers.push({
      depthFrom: Number(match[1]),
      depthTo: Number(match[2]),
      description,
      uscsSymbol: inferUscsFromText(description),
      sptN: sptMatch ? Number(sptMatch[1]) : null,
      waterContent: null,
      notes: null,
    });
  }

  const totalDepthMatch = rawText.match(/total depth[^0-9]*(\d+(?:\.\d+)?)\s*m/i)
    ?? rawText.match(/depth[^0-9]*(\d+(?:\.\d+)?)\s*m/i);
  const waterTableMatch = rawText.match(/water table[^0-9]*(\d+(?:\.\d+)?)\s*m/i)
    ?? rawText.match(/gwl[^0-9]*(\d+(?:\.\d+)?)\s*m/i);
  const boreholeMatch = rawText.match(/\bBH[-_\s]?[A-Z0-9]+\b/i);
  const summary = firstMatchingSentence(
    rawText,
    (sentence) => /(summary|consist|encountered|profile|strata|predominant)/i.test(sentence),
  ) ?? splitSentences(rawText)[0] ?? null;

  const value: Record<string, unknown> = {};
  if (boreholeMatch?.[0] || boreholeId) value.boreholeId = (boreholeMatch?.[0] ?? boreholeId)?.replace(/\s+/g, '');
  if (totalDepthMatch?.[1]) value.totalDepth = Number(totalDepthMatch[1]);
  if (waterTableMatch?.[1]) value.waterTableDepth = Number(waterTableMatch[1]);
  if (layers.length > 0) value.layers = layers;
  if (summary) value.summary = summary;

  if (Object.keys(value).length === 0) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  return {
    value,
    baseStatus: 'partial',
    warnings: ['Vision model returned narrative text; extracted partial structured borehole fields.'],
  };
}

export interface CoreBoxAnalysisResult extends ParseSafety {
  rqd: number | null;
  fractureSpacing: string | null;
  weatheringGrade: string | null;
  rockType: string | null;
  coreRecovery: number | null;
  discontinuities: string | null;
  rawAnalysis: string;
  latencyMs: number;
}

export async function analyzeCoreBox(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
): Promise<CoreBoxAnalysisResult> {
  const strictPrompt = `Analyze this rock core box image. You MUST respond with ONLY a JSON object (no markdown, no backticks, no explanation) with these exact fields:
{
  "rqd": <number 0-100, Rock Quality Designation percentage>,
  "fractureSpacing": "<string: very close/close/moderate/wide/very wide>",
  "weatheringGrade": "<string: W1-Fresh/W2-Slightly/W3-Moderately/W4-Highly/W5-Completely/W6-Residual>",
  "rockType": "<string: identified lithology>",
  "coreRecovery": <number 0-100, percentage>,
  "discontinuities": "<string: description of joint surfaces, infilling, roughness>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const softPrompt = `Examine this rock core box image and describe:
1. RQD (Rock Quality Designation) as a percentage 0-100
2. Fracture spacing (very close / close / moderate / wide / very wide)
3. Weathering grade (W1-Fresh through W6-Residual)
4. Rock type / lithology
5. Core recovery percentage
6. Discontinuity description (surfaces, infilling, roughness)
Provide approximate values even if uncertain.`;

  const response = await visionWithRetry(
    imageBase64, mimeType, config,
    strictPrompt, softPrompt,
    'You are an expert engineering geologist performing core logging. Respond with JSON only.',
    900,
  );

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
  if (response.usedFallback) {
    warnings.push('Vision model used plain-text fallback — values extracted from narrative response.');
  }
  const rqd = readNumber(parsed.value, 'rqd', warnings);
  const fractureSpacing = readString(parsed.value, 'fractureSpacing', warnings);
  const weatheringGrade = readString(parsed.value, 'weatheringGrade', warnings);
  const rockType = readString(parsed.value, 'rockType', warnings);
  const coreRecovery = readNumber(parsed.value, 'coreRecovery', warnings);
  const discontinuities = readString(parsed.value, 'discontinuities', warnings);
  const confidence = clampConfidence(
    parsed.value?.confidence,
    parsed.baseStatus === 'parsed' ? 80 : 0,
  );

  const status = deriveParseStatus(
    parsed.baseStatus,
    [rqd, fractureSpacing, weatheringGrade, rockType, coreRecovery, discontinuities].filter(
      (value) => value !== null,
    ).length,
    6,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(parsed.value?.warnings)),
  );

  return {
    ...safety,
    rqd,
    fractureSpacing,
    weatheringGrade,
    rockType,
    coreRecovery,
    discontinuities,
    rawAnalysis: response.text,
    latencyMs: response.latencyMs,
  };
}

export interface HybridRMRResult extends ParseSafety {
  visionExtraction: {
    estimatedUCS: number | null;
    estimatedRQD: number | null;
    estimatedSpacing: number | null;
    jointCondition: string | null;
    groundwaterCondition: string | null;
  };
  rmrResult: {
    totalRating: number;
    rockClass: string;
    classNumber: string;
    supportRecommendation: string;
  } | null;
  rawVisionText: string;
  latencyMs: number;
}

export async function classifyRMRFromImage(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
): Promise<HybridRMRResult> {
  const strictPrompt = `Analyze this rock exposure / tunnel face / core box image for Rock Mass Rating input parameters. Respond with ONLY a JSON object (no markdown):
{
  "estimatedUCS": <number in MPa, estimate from visual appearance>,
  "estimatedRQD": <number 0-100>,
  "estimatedSpacing": <number in meters, mean discontinuity spacing>,
  "jointCondition": "<very_good|good|fair|poor|very_poor>",
  "groundwaterCondition": "<dry|damp|wet|dripping|flowing>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const softPrompt = `Look at this rock mass image and estimate:
1. Uniaxial compressive strength UCS in MPa (from rock appearance)
2. Rock Quality Designation RQD as % 0-100
3. Mean discontinuity spacing in meters
4. Joint condition: very_good, good, fair, poor, or very_poor
5. Groundwater condition: dry, damp, wet, dripping, or flowing
Give approximate values based on what you observe.`;

  const response = await visionWithRetry(
    imageBase64, mimeType, config,
    strictPrompt, softPrompt,
    'You are an expert rock mechanics engineer performing field classification. Respond with JSON only.',
    700,
  );

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
  if (response.usedFallback) {
    warnings.push('Vision model used plain-text fallback — values extracted from narrative response.');
  }
  const estimatedUCS = readNumber(parsed.value, 'estimatedUCS', warnings);
  const estimatedRQD = readNumber(parsed.value, 'estimatedRQD', warnings);
  const estimatedSpacing = readNumber(parsed.value, 'estimatedSpacing', warnings);
  const jointCondition = asEnumValue(
    readString(parsed.value, 'jointCondition', warnings),
    VALID_JOINT_CONDITIONS,
    warnings,
    'jointCondition',
  );
  const groundwaterCondition = asEnumValue(
    readString(parsed.value, 'groundwaterCondition', warnings),
    VALID_GROUNDWATER_CONDITIONS,
    warnings,
    'groundwaterCondition',
  );
  const confidence = clampConfidence(
    parsed.value?.confidence,
    parsed.baseStatus === 'parsed' ? 75 : 0,
  );

  const status = deriveParseStatus(
    parsed.baseStatus,
    [
      estimatedUCS,
      estimatedRQD,
      estimatedSpacing,
      jointCondition,
      groundwaterCondition,
    ].filter((value) => value !== null).length,
    5,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(parsed.value?.warnings)),
  );

  const visionExtraction = {
    estimatedUCS,
    estimatedRQD,
    estimatedSpacing,
    jointCondition,
    groundwaterCondition,
  };

  let rmrResult: HybridRMRResult['rmrResult'] = null;
  if (
    safety.canAutoProceed &&
    estimatedUCS !== null &&
    estimatedRQD !== null &&
    estimatedSpacing !== null &&
    jointCondition !== null &&
    groundwaterCondition !== null
  ) {
    const scored = classifyRMR89({
      ucs: estimatedUCS,
      rqd: estimatedRQD,
      spacing: estimatedSpacing,
      condition: jointCondition,
      groundwater: groundwaterCondition,
      orientationAdjustment: 0,
    });
    rmrResult = {
      totalRating: scored.totalRating,
      rockClass: scored.rockClass,
      classNumber: scored.classNumber,
      supportRecommendation: scored.supportRecommendation,
    };
  }

  return {
    ...safety,
    visionExtraction,
    rmrResult,
    rawVisionText: response.text,
    latencyMs: response.latencyMs,
  };
}

export interface SoilClassificationFromTextResult extends ParseSafety {
  description: string;
  uscsSymbol: string | null;
  uscsName: string | null;
  estimatedProperties: {
    frictionAngle: number | null;
    cohesion: number | null;
    unitWeight: number | null;
    permeability: string | null;
  };
  engineeringNotes: string | null;
  rawLLMText: string;
}

type HeuristicSoilProfile = {
  symbol: string;
  name: string;
  frictionAngle: number | null;
  cohesion: number | null;
  unitWeight: number | null;
  permeability: string | null;
  notes: string;
};

const HEURISTIC_SOIL_PROFILES: Record<string, HeuristicSoilProfile> = {
  CH: {
    symbol: 'CH',
    name: 'Fat Clay',
    frictionAngle: 18,
    cohesion: 35,
    unitWeight: 17,
    permeability: '1e-9 to 1e-8 m/s',
    notes: 'High-plasticity clay; expect low permeability, high compressibility, and undrained-strength-controlled behavior.',
  },
  CL: {
    symbol: 'CL',
    name: 'Lean Clay',
    frictionAngle: 24,
    cohesion: 25,
    unitWeight: 18,
    permeability: '1e-8 to 1e-7 m/s',
    notes: 'Low- to medium-plasticity clay; moderate cohesion with settlement and moisture sensitivity.',
  },
  'CL-ML': {
    symbol: 'CL-ML',
    name: 'Silty Clay / Clayey Silt',
    frictionAngle: 26,
    cohesion: 15,
    unitWeight: 18,
    permeability: '1e-7 to 1e-6 m/s',
    notes: 'Borderline clay-silt behavior; check Atterberg limits and fines content before design use.',
  },
  MH: {
    symbol: 'MH',
    name: 'Elastic Silt',
    frictionAngle: 27,
    cohesion: 8,
    unitWeight: 17,
    permeability: '1e-7 to 1e-6 m/s',
    notes: 'High-plasticity silt; can soften rapidly with water and may show significant compressibility.',
  },
  ML: {
    symbol: 'ML',
    name: 'Silt',
    frictionAngle: 30,
    cohesion: 5,
    unitWeight: 18,
    permeability: '1e-6 to 1e-5 m/s',
    notes: 'Low-plasticity silt; often moisture-sensitive with moderate drainage and erosion susceptibility.',
  },
  SC: {
    symbol: 'SC',
    name: 'Clayey Sand',
    frictionAngle: 29,
    cohesion: 8,
    unitWeight: 19,
    permeability: '1e-7 to 1e-5 m/s',
    notes: 'Sand with clay fines; lower drainage and higher apparent cohesion than clean sands.',
  },
  SM: {
    symbol: 'SM',
    name: 'Silty Sand',
    frictionAngle: 31,
    cohesion: 3,
    unitWeight: 19,
    permeability: '1e-6 to 1e-4 m/s',
    notes: 'Sand with silt fines; permeability drops quickly as fines increase, so check gradation and fines content.',
  },
  SW: {
    symbol: 'SW',
    name: 'Well-Graded Sand',
    frictionAngle: 35,
    cohesion: 0,
    unitWeight: 20,
    permeability: '1e-4 to 1e-3 m/s',
    notes: 'Dense, well-graded sand; high frictional strength with good drainage and low compressibility.',
  },
  SP: {
    symbol: 'SP',
    name: 'Poorly Graded Sand',
    frictionAngle: 33,
    cohesion: 0,
    unitWeight: 19,
    permeability: '1e-4 to 1e-3 m/s',
    notes: 'Uniform sand; frictional material with high drainage but potentially lower density efficiency than well-graded sands.',
  },
  GC: {
    symbol: 'GC',
    name: 'Clayey Gravel',
    frictionAngle: 34,
    cohesion: 10,
    unitWeight: 21,
    permeability: '1e-6 to 1e-4 m/s',
    notes: 'Gravel with clay fines; stronger than fine soils but drainage is reduced by cohesive fines.',
  },
  GM: {
    symbol: 'GM',
    name: 'Silty Gravel',
    frictionAngle: 36,
    cohesion: 5,
    unitWeight: 21,
    permeability: '1e-5 to 1e-3 m/s',
    notes: 'Gravel with silt fines; usually free-draining unless fines become dominant.',
  },
  GW: {
    symbol: 'GW',
    name: 'Well-Graded Gravel',
    frictionAngle: 40,
    cohesion: 0,
    unitWeight: 21,
    permeability: '1e-3 to 1e-2 m/s',
    notes: 'Clean well-graded gravel; very high drainage and strong frictional behavior.',
  },
  GP: {
    symbol: 'GP',
    name: 'Poorly Graded Gravel',
    frictionAngle: 38,
    cohesion: 0,
    unitWeight: 20,
    permeability: '1e-3 to 1e-2 m/s',
    notes: 'Clean poorly graded gravel; high drainage and friction, but check density and particle breakage effects.',
  },
  OL: {
    symbol: 'OL',
    name: 'Organic Silt / Organic Clay (Low Plasticity)',
    frictionAngle: 20,
    cohesion: 10,
    unitWeight: 15,
    permeability: '1e-8 to 1e-6 m/s',
    notes: 'Organic fine-grained soil; expect high compressibility and reduced strength relative to mineral soils.',
  },
  OH: {
    symbol: 'OH',
    name: 'Organic Clay / Organic Silt (High Plasticity)',
    frictionAngle: 16,
    cohesion: 8,
    unitWeight: 14,
    permeability: '1e-9 to 1e-7 m/s',
    notes: 'Highly organic, plastic fine soil; settlement and durability concerns are usually critical.',
  },
  PT: {
    symbol: 'PT',
    name: 'Peat',
    frictionAngle: 14,
    cohesion: 5,
    unitWeight: 11,
    permeability: '1e-6 to 1e-4 m/s',
    notes: 'Peat / highly organic soil; extremely compressible and usually unsuitable for direct foundation support without treatment.',
  },
};

function isHostedBetaTemporarilyUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('provider is busy') ||
    message.includes('rate limit') ||
    message.includes('retry in about') ||
    message.includes('timed out') ||
    message.includes('upstream request failed')
  );
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function classifySoilFromDescriptionHeuristically(
  description: string,
): SoilClassificationFromTextResult {
  const normalized = description.toLowerCase().replace(/[^a-z0-9\s/-]+/g, ' ');
  const hasClay = includesAny(normalized, [' clay', 'clayey', 'fat clay', 'lean clay']) || normalized.startsWith('clay');
  const hasSilt = includesAny(normalized, [' silt', 'silty']) || normalized.startsWith('silt');
  const hasSand = includesAny(normalized, [' sand', 'sandy']) || normalized.startsWith('sand');
  const hasGravel = includesAny(normalized, [' gravel', 'gravelly', 'cobble', 'cobbly']) || normalized.startsWith('gravel');
  const hasOrganic = includesAny(normalized, ['organic', 'organics', 'humic', 'humus']);
  const hasPeat = includesAny(normalized, ['peat', 'peaty']);
  const highPlasticity = includesAny(normalized, ['high plasticity', 'very plastic', 'fat clay', 'high pi']);
  const lowPlasticity = includesAny(normalized, ['low plasticity', 'lean clay', 'lean silt', 'low pi']);
  const wellGraded = includesAny(normalized, ['well graded', 'well-graded', 'wide gradation']);
  const poorlyGraded = includesAny(normalized, ['poorly graded', 'poorly-graded', 'uniform']);
  const lowPermeability = includesAny(normalized, ['low permeability', 'impermeable', 'low hydraulic conductivity']);
  const highPermeability = includesAny(normalized, ['high permeability', 'free draining', 'freely draining']);
  const softConsistency = includesAny(normalized, ['very soft', 'soft']);
  const stiffConsistency = includesAny(normalized, ['very stiff', 'stiff', 'hard']);
  const looseDensity = includesAny(normalized, ['very loose', 'loose']);
  const denseDensity = includesAny(normalized, ['very dense', 'dense']);

  let symbol: string | null = null;

  if (hasPeat) {
    symbol = 'PT';
  } else if (hasOrganic && (hasClay || hasSilt)) {
    symbol = highPlasticity ? 'OH' : 'OL';
  } else if (hasClay && hasSilt) {
    symbol = highPlasticity ? 'CH' : 'CL-ML';
  } else if (hasClay) {
    symbol = highPlasticity ? 'CH' : 'CL';
  } else if (hasSilt) {
    symbol = highPlasticity ? 'MH' : 'ML';
  } else if (hasSand) {
    if (hasClay) symbol = 'SC';
    else if (hasSilt) symbol = 'SM';
    else symbol = wellGraded && !poorlyGraded ? 'SW' : 'SP';
  } else if (hasGravel) {
    if (hasClay) symbol = 'GC';
    else if (hasSilt) symbol = 'GM';
    else symbol = wellGraded && !poorlyGraded ? 'GW' : 'GP';
  }

  const profile = symbol ? HEURISTIC_SOIL_PROFILES[symbol] : null;
  const descriptorCount = [
    hasClay || hasSilt || hasSand || hasGravel || hasOrganic || hasPeat,
    highPlasticity || lowPlasticity,
    lowPermeability || highPermeability,
    softConsistency || stiffConsistency || looseDensity || denseDensity,
  ].filter(Boolean).length;
  const confidence = clampConfidence(symbol ? 58 + descriptorCount * 8 : 35, 0);
  const warnings = ['Heuristic fallback used because hosted beta text classification was temporarily unavailable.'];

  if (!symbol || !profile) {
    warnings.push('Description does not contain enough standard soil descriptors to infer a reliable USCS group.');
    return {
      ...createParseSafety('failed', confidence, warnings),
      description,
      uscsSymbol: null,
      uscsName: null,
      estimatedProperties: {
        frictionAngle: null,
        cohesion: null,
        unitWeight: null,
        permeability: null,
      },
      engineeringNotes: 'Add dominant soil type, gradation/fines, plasticity, and consistency or density descriptors for a stronger deterministic fallback.',
      rawLLMText: '',
    };
  }

  if ((hasSand || hasGravel) && !wellGraded && !poorlyGraded && !hasSilt && !hasClay) {
    warnings.push('Gradation was not described explicitly, so the clean coarse-grained classification is approximate.');
  }

  const permeability = lowPermeability
    ? 'low permeability'
    : highPermeability
      ? 'high permeability'
      : profile.permeability;

  const notes = [
    profile.notes,
    softConsistency ? 'Description indicates soft consistency, so undrained strength and deformation control should be checked carefully.' : null,
    stiffConsistency ? 'Description indicates stiff consistency, which may improve short-term bearing and excavation stand-up.' : null,
    looseDensity ? 'Description indicates loose state, so settlement and contractive behavior should be checked.' : null,
    denseDensity ? 'Description indicates dense state, which usually improves drained strength and reduces compressibility.' : null,
  ].filter((value): value is string => Boolean(value)).join(' ');

  return {
    ...createParseSafety('parsed', confidence, warnings),
    description,
    uscsSymbol: profile.symbol,
    uscsName: profile.name,
    estimatedProperties: {
      frictionAngle: profile.frictionAngle,
      cohesion: profile.cohesion,
      unitWeight: profile.unitWeight,
      permeability,
    },
    engineeringNotes: notes,
    rawLLMText: '',
  };
}

export async function classifySoilFromDescription(
  description: string,
  config: LLMConfig,
): Promise<SoilClassificationFromTextResult> {
  const prompt = `Given this soil description: "${description}"

Classify the soil and estimate engineering properties. Respond with ONLY a JSON object:
{
  "uscsSymbol": "<USCS symbol e.g. CL, SM, GP>",
  "uscsName": "<full name e.g. Lean Clay, Silty Sand>",
  "estimatedFrictionAngle": <degrees>,
  "estimatedCohesion": <kPa>,
  "estimatedUnitWeight": <kN/m3>,
  "estimatedPermeability": "<e.g. 1e-7 m/s>",
  "engineeringNotes": "<brief note on behavior, compressibility, strength>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  let response;
  try {
    response = await generateText(prompt, config, {
      systemPrompt: 'You are an expert geotechnical engineer. Classify soils based on verbal descriptions using USCS and estimate engineering properties. Respond with JSON only.',
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 700,
    });
  } catch (error) {
    if (isHostedBetaTemporarilyUnavailable(error)) {
      return classifySoilFromDescriptionHeuristically(description);
    }
    throw error;
  }

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
  const uscsSymbol = readString(parsed.value, 'uscsSymbol', warnings);
  const uscsName = readString(parsed.value, 'uscsName', warnings);
  const frictionAngle = readNumber(parsed.value, 'estimatedFrictionAngle', warnings);
  const cohesion = readNumber(parsed.value, 'estimatedCohesion', warnings);
  const unitWeight = readNumber(parsed.value, 'estimatedUnitWeight', warnings);
  const permeability = readString(parsed.value, 'estimatedPermeability', warnings);
  const engineeringNotes = readString(parsed.value, 'engineeringNotes', warnings);
  const confidence = clampConfidence(
    parsed.value?.confidence,
    parsed.baseStatus === 'parsed' ? 70 : 0,
  );

  const status = deriveParseStatus(
    parsed.baseStatus,
    [uscsSymbol, uscsName, frictionAngle, cohesion, unitWeight, permeability].filter(
      (value) => value !== null,
    ).length,
    6,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(parsed.value?.warnings)),
  );

  return {
    ...safety,
    description,
    uscsSymbol,
    uscsName,
    estimatedProperties: {
      frictionAngle,
      cohesion,
      unitWeight,
      permeability,
    },
    engineeringNotes,
    rawLLMText: response.text,
  };
}

export interface BoreholeLayer {
  depthFrom: number | null;
  depthTo: number | null;
  description: string | null;
  uscsSymbol: string | null;
  sptN: number | null;
  waterContent: number | null;
  notes: string | null;
}

export interface BoreholeInterpretation extends ParseSafety {
  boreholeId: string;
  totalDepth: number | null;
  waterTableDepth: number | null;
  layers: BoreholeLayer[];
  summary: string | null;
  rawLLMText: string;
  latencyMs: number;
}

export async function interpretBoreholeLog(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  boreholeId?: string,
): Promise<BoreholeInterpretation> {
  const strictPrompt = `Extract structured data from this borehole log image. Respond with ONLY a JSON object:
{
  "boreholeId": "<ID if visible, or 'BH-unknown'>",
  "totalDepth": <number in meters>,
  "waterTableDepth": <number in meters or null>,
  "layers": [
    {
      "depthFrom": <m>,
      "depthTo": <m>,
      "description": "<soil/rock description>",
      "uscsSymbol": "<USCS if identifiable>",
      "sptN": <number or null>,
      "waterContent": <percent or null>,
      "notes": "<any additional notes>"
    }
  ],
  "summary": "<brief engineering summary of the borehole>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const softPrompt = `Read this borehole log carefully and extract the key structured data:
1. Borehole ID if visible
2. Total depth in meters
3. Water table depth if shown
4. Each stratigraphic layer with depthFrom, depthTo, description, USCS symbol, SPT N, water content, and notes
5. A brief engineering summary
Provide approximate values where necessary, but keep the structure complete.`;

  const response = await visionWithRetry(
    imageBase64,
    mimeType,
    config,
    strictPrompt,
    softPrompt,
    'You are an expert geotechnical engineer extracting data from borehole log documents. Be precise with depths, descriptions, and test values. Respond with JSON only.',
    1500,
  );

  const parsed = parseJsonObject(response.text);
  const narrativeFallback = extractBoreholeFallback(response.text, boreholeId);
  const mergedValue = {
    ...(narrativeFallback.value ?? {}),
    ...(parsed.value ?? {}),
  };
  const baseStatus = parsed.baseStatus !== 'failed' ? parsed.baseStatus : narrativeFallback.baseStatus;
  const warnings = [...parsed.warnings, ...narrativeFallback.warnings];
  const parsedLayers = Array.isArray(mergedValue.layers)
    ? (mergedValue.layers as Record<string, unknown>[])
    : [];

  if (!Array.isArray(mergedValue.layers)) {
    warnings.push('Missing or invalid "layers" array.');
  }

  const layers: BoreholeLayer[] = parsedLayers.map((layer) => {
    const layerWarnings: string[] = [];
    const item: BoreholeLayer = {
      depthFrom: readNumber(layer, 'depthFrom', layerWarnings),
      depthTo: readNumber(layer, 'depthTo', layerWarnings),
      description: readString(layer, 'description', layerWarnings),
      uscsSymbol: readString(layer, 'uscsSymbol', []),
      sptN: layer.sptN == null ? null : readNumber(layer, 'sptN', layerWarnings),
      waterContent:
        layer.waterContent == null ? null : readNumber(layer, 'waterContent', layerWarnings),
      notes: readString(layer, 'notes', []),
    };
    warnings.push(...layerWarnings.map((warning) => `Layer warning: ${warning}`));
    return item;
  });

  const totalDepth = readNumber(mergedValue, 'totalDepth', warnings);
  const waterTableDepth =
    mergedValue.waterTableDepth == null
      ? null
      : readNumber(mergedValue, 'waterTableDepth', warnings);
  const summary = readString(mergedValue, 'summary', warnings);
  const resolvedBoreholeId =
    readString(mergedValue, 'boreholeId', []) ?? boreholeId ?? 'BH-unknown';
  const confidence = clampConfidence(
    mergedValue.confidence,
    baseStatus === 'parsed' ? 75 : baseStatus === 'partial' ? 58 : 0,
  );

  const status = deriveParseStatus(
    baseStatus,
    [totalDepth, summary, layers.length > 0 ? 'layers' : null].filter((value) => value !== null)
      .length,
    3,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(mergedValue.warnings)),
  );

  return {
    ...safety,
    boreholeId: resolvedBoreholeId,
    totalDepth,
    waterTableDepth,
    layers,
    summary,
    rawLLMText: response.text,
    latencyMs: response.latencyMs,
  };
}

export async function queryGBRDocument(
  question: string,
  documentBase64: string,
  mimeType: string,
  config: LLMConfig,
): Promise<{ answer: string; latencyMs: number }> {
  const response = await visionWithRetry(
    documentBase64,
    mimeType,
    config,
    `Based on this Geotechnical Baseline Report, answer the following question with a concise, technically accurate response and specific page/section references where possible:\n\n${question}`,
    `Read this Geotechnical Baseline Report and answer the question directly:\n\n${question}\n\nUse specific values, limits, assumptions, and references if they are visible in the document.`,
    'You are an expert geotechnical engineer analyzing a Geotechnical Baseline Report (GBR). Provide precise, actionable answers referencing specific data from the document.',
    2000,
  );

  if (!response.text.trim()) {
    throw new Error(
      'Hosted beta upstream returned no content. The document could not be interpreted. Try a smaller PNG or JPG export of the relevant pages.',
    );
  }

  return { answer: response.text, latencyMs: response.latencyMs };
}

export interface SensorInterpretation extends ParseSafety {
  sensorType: string | null;
  measurements: string | null;
  interpretation: string | null;
  evaluation: string | null;
  recommendations: string | null;
  rawLLMText: string;
  latencyMs: number;
}

export async function interpretSensorImage(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
): Promise<SensorInterpretation> {
  const strictPrompt = `Analyze this geotechnical sensor data image. Respond with ONLY a JSON object:
{
  "sensorType": "<inclinometer|piezometer|extensometer|load_cell|settlement_plate|tiltmeter|other>",
  "measurements": "<key readings and values observed>",
  "interpretation": "<what the data shows about ground/structure behavior>",
  "evaluation": "<whether conditions are normal, warning, or critical>",
  "recommendations": "<recommended actions if any>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const softPrompt = `Inspect this geotechnical instrumentation image and extract:
1. Sensor type
2. Key readings and visible values
3. What the measurements indicate about ground or structural behavior
4. Whether the condition appears normal, warning, or critical
5. Recommended follow-up actions if any
If the display is partially unreadable, provide the best approximate interpretation from the visible chart or text.`;

  const response = await visionWithRetry(
    imageBase64,
    mimeType,
    config,
    strictPrompt,
    softPrompt,
    'You are an expert geotechnical instrumentation engineer. Interpret sensor data precisely.',
    800,
  );

  const parsed = parseJsonObject(response.text);
  const narrativeFallback = extractSensorFallback(response.text);
  const mergedValue = {
    ...(narrativeFallback.value ?? {}),
    ...(parsed.value ?? {}),
  };
  const baseStatus = parsed.baseStatus !== 'failed' ? parsed.baseStatus : narrativeFallback.baseStatus;
  const warnings = [...parsed.warnings, ...narrativeFallback.warnings];
  const sensorType = readString(mergedValue, 'sensorType', warnings);
  const measurements = readString(mergedValue, 'measurements', warnings);
  const interpretation = readString(mergedValue, 'interpretation', warnings);
  const evaluation = readString(mergedValue, 'evaluation', warnings);
  const recommendations = readString(mergedValue, 'recommendations', warnings);
  const confidence = clampConfidence(
    mergedValue.confidence,
    baseStatus === 'parsed' ? 70 : baseStatus === 'partial' ? 55 : 0,
  );

  const status = deriveParseStatus(
    baseStatus,
    [sensorType, measurements, interpretation, evaluation, recommendations].filter(
      (value) => value !== null,
    ).length,
    5,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(mergedValue.warnings)),
  );

  return {
    ...safety,
    sensorType,
    measurements,
    interpretation,
    evaluation,
    recommendations,
    rawLLMText: response.text,
    latencyMs: response.latencyMs,
  };
}

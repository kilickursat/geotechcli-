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
} from './parse.js';

export type { ParseSafety, ParseStatus } from './parse.js';

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
  const prompt = `Analyze this rock core box image. You MUST respond with ONLY a JSON object (no markdown, no backticks, no explanation) with these exact fields:
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

  const response = await generateVision(prompt, imageBase64, mimeType, config, {
    systemPrompt: 'You are an expert engineering geologist performing core logging. Respond with JSON only.',
    temperature: 0.1,
    maxTokens: 900,
  });

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
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
  const prompt = `Analyze this rock exposure / tunnel face / core box image for Rock Mass Rating input parameters. Respond with ONLY a JSON object (no markdown):
{
  "estimatedUCS": <number in MPa, estimate from visual appearance>,
  "estimatedRQD": <number 0-100>,
  "estimatedSpacing": <number in meters, mean discontinuity spacing>,
  "jointCondition": "<very_good|good|fair|poor|very_poor>",
  "groundwaterCondition": "<dry|damp|wet|dripping|flowing>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const response = await generateVision(prompt, imageBase64, mimeType, config, {
    systemPrompt: 'You are an expert rock mechanics engineer performing field classification. Respond with JSON only.',
    temperature: 0.1,
    maxTokens: 700,
  });

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
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

  const response = await generateText(prompt, config, {
    systemPrompt: 'You are an expert geotechnical engineer. Classify soils based on verbal descriptions using USCS and estimate engineering properties. Respond with JSON only.',
    temperature: 0.1,
    jsonMode: true,
    maxTokens: 700,
  });

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
  const prompt = `Extract structured data from this borehole log image. Respond with ONLY a JSON object:
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

  const response = await generateVision(prompt, imageBase64, mimeType, config, {
    systemPrompt: 'You are an expert geotechnical engineer extracting data from borehole log documents. Be precise with depths, descriptions, and test values. Respond with JSON only.',
    temperature: 0.1,
    maxTokens: 2200,
  });

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
  const parsedLayers = Array.isArray(parsed.value?.layers)
    ? (parsed.value?.layers as Record<string, unknown>[])
    : [];

  if (!Array.isArray(parsed.value?.layers)) {
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

  const totalDepth = readNumber(parsed.value, 'totalDepth', warnings);
  const waterTableDepth =
    parsed.value?.waterTableDepth == null
      ? null
      : readNumber(parsed.value, 'waterTableDepth', warnings);
  const summary = readString(parsed.value, 'summary', warnings);
  const resolvedBoreholeId =
    readString(parsed.value, 'boreholeId', []) ?? boreholeId ?? 'BH-unknown';
  const confidence = clampConfidence(
    parsed.value?.confidence,
    parsed.baseStatus === 'parsed' ? 75 : 0,
  );

  const status = deriveParseStatus(
    parsed.baseStatus,
    [totalDepth, summary, layers.length > 0 ? 'layers' : null].filter((value) => value !== null)
      .length,
    3,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(parsed.value?.warnings)),
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
  const response = await generateVision(
    `Based on this Geotechnical Baseline Report, answer the following question:\n\n${question}\n\nProvide a concise, technically accurate answer with specific values and page/section references where possible.`,
    documentBase64,
    mimeType,
    config,
    {
      systemPrompt: 'You are an expert geotechnical engineer analyzing a Geotechnical Baseline Report (GBR). Provide precise, actionable answers referencing specific data from the document.',
      maxTokens: 2000,
    },
  );

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
  const prompt = `Analyze this geotechnical sensor data image. Respond with ONLY a JSON object:
{
  "sensorType": "<inclinometer|piezometer|extensometer|load_cell|settlement_plate|tiltmeter|other>",
  "measurements": "<key readings and values observed>",
  "interpretation": "<what the data shows about ground/structure behavior>",
  "evaluation": "<whether conditions are normal, warning, or critical>",
  "recommendations": "<recommended actions if any>",
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}`;

  const response = await generateVision(prompt, imageBase64, mimeType, config, {
    systemPrompt: 'You are an expert geotechnical instrumentation engineer. Interpret sensor data precisely.',
    temperature: 0.1,
    maxTokens: 1100,
  });

  const parsed = parseJsonObject(response.text);
  const warnings = [...parsed.warnings];
  const sensorType = readString(parsed.value, 'sensorType', warnings);
  const measurements = readString(parsed.value, 'measurements', warnings);
  const interpretation = readString(parsed.value, 'interpretation', warnings);
  const evaluation = readString(parsed.value, 'evaluation', warnings);
  const recommendations = readString(parsed.value, 'recommendations', warnings);
  const confidence = clampConfidence(
    parsed.value?.confidence,
    parsed.baseStatus === 'parsed' ? 70 : 0,
  );

  const status = deriveParseStatus(
    parsed.baseStatus,
    [sensorType, measurements, interpretation, evaluation, recommendations].filter(
      (value) => value !== null,
    ).length,
    5,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(warnings, normalizeWarnings(parsed.value?.warnings)),
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

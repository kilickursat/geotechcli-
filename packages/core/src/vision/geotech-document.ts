import type { LLMConfig } from '../llm/types.js';
import { generateDocumentVision, generateText, generateVision } from '../llm/router.js';
import {
  clampConfidence,
  createParseSafety,
  deriveParseStatus,
  normalizeWarnings,
  parseJsonObject,
  type ParseSafety,
  type ParseStatus,
} from './parse.js';
import { transcribeDocumentImageText } from './index.js';

export type { ParseSafety, ParseStatus } from './parse.js';

function getHostedBetaGeotechDocumentMaxTokens(
  config: LLMConfig,
  profile: 'structured-text' | 'fallback-text' | 'structured-vision' | 'fallback-vision',
  requestedMaxTokens: number,
): number {
  if (config.provider !== 'hosted-beta') {
    return requestedMaxTokens;
  }

  const capByProfile = {
    'structured-text': 700,
    'fallback-text': 850,
    'structured-vision': 850,
    'fallback-vision': 950,
  } as const;
  const cap = capByProfile[profile];
  return Math.min(requestedMaxTokens, cap);
}

function isRecoverableTextRetryResponse(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('returned no content')
    || message.includes('did not contain assistant text')
    || message.includes('no completion choices')
    || message.includes('empty completion')
    || message.includes('524')
    || message.includes('upstream request failed')
    || message.includes('upstream request timed out')
    || message.includes('upstream timeout')
    || message.includes('timed out')
    || message.includes('malformed json response')
    || message.includes('not valid json')
    || message.includes('unterminated string in json')
    || message.includes('unexpected end of json')
    || message.includes('provider is busy')
    || message.includes('temporarily unavailable')
  );
}

async function waitForRecoverableTextBackoff(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    timer.unref?.();
  });
}

async function textWithRetry(
  prompt: string,
  config: LLMConfig,
  systemPrompt: string,
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; usedFallback: boolean }> {
  const start = Date.now();
  const primaryMaxTokens = getHostedBetaGeotechDocumentMaxTokens(config, 'structured-text', maxTokens);
  const fallbackMaxTokens = getHostedBetaGeotechDocumentMaxTokens(config, 'fallback-text', maxTokens + 250);

  try {
    const first = await generateText(prompt, config, {
      systemPrompt,
      temperature: 0.1,
      jsonMode: true,
      maxTokens: primaryMaxTokens,
    });
    if (first.text && first.text.trim().length > 10) {
      return { text: first.text, latencyMs: first.latencyMs, usedFallback: false };
    }
  } catch (error) {
    if (!isRecoverableTextRetryResponse(error)) {
      throw error;
    }
    await waitForRecoverableTextBackoff();
  }

  try {
    const second = await generateText(prompt, config, {
      systemPrompt: `${systemPrompt} Return best-effort structured information even if some fields are uncertain.`,
      temperature: 0.25,
      jsonMode: false,
      maxTokens: fallbackMaxTokens,
    });

    if (second.text && second.text.trim().length > 0) {
      return {
        text: second.text,
        latencyMs: Date.now() - start,
        usedFallback: true,
      };
    }
  } catch (error) {
    if (!isRecoverableTextRetryResponse(error)) {
      throw error;
    }
  }

  return {
    text: '',
    latencyMs: Date.now() - start,
    usedFallback: true,
  };
}

async function documentVisionWithRetry(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  strictPrompt: string,
  softPrompt: string,
  systemPrompt: string,
  maxTokens: number,
): Promise<{ text: string; latencyMs: number; usedFallback: boolean }> {
  const start = Date.now();
  const multimodalCall = mimeType === 'application/pdf'
    ? generateDocumentVision
    : generateVision;
  const primaryMaxTokens = getHostedBetaGeotechDocumentMaxTokens(config, 'structured-vision', maxTokens);
  const fallbackMaxTokens = getHostedBetaGeotechDocumentMaxTokens(config, 'fallback-vision', maxTokens + 250);

  try {
    const first = await multimodalCall(strictPrompt, imageBase64, mimeType, config, {
      systemPrompt,
      temperature: 0.1,
      maxTokens: primaryMaxTokens,
    });
    if (first.text && first.text.trim().length > 10) {
      return { text: first.text, latencyMs: first.latencyMs, usedFallback: false };
    }
  } catch (error) {
    if (!isRecoverableTextRetryResponse(error)) {
      throw error;
    }
    await waitForRecoverableTextBackoff();
  }

  try {
    const second = await multimodalCall(softPrompt, imageBase64, mimeType, config, {
      systemPrompt: `${systemPrompt} Return best-effort structured information even when some cells or labels are only partly legible.`,
      temperature: 0.2,
      maxTokens: fallbackMaxTokens,
    });

    if (second.text && second.text.trim().length > 0) {
      return {
        text: second.text,
        latencyMs: Date.now() - start,
        usedFallback: true,
      };
    }
  } catch (error) {
    if (!isRecoverableTextRetryResponse(error)) {
      throw error;
    }
  }

  return {
    text: '',
    latencyMs: Date.now() - start,
    usedFallback: true,
  };
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

function readOptionalString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readOptionalNumber(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean),
  )];
}

function normalizeSourcePages(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )].sort((left, right) => left - right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MATERIAL_KINDS = ['soil', 'rock', 'fill', 'groundwater', 'mixed', 'other'] as const;

export interface GeotechMaterialObservation {
  kind: typeof MATERIAL_KINDS[number];
  description: string;
  uscsSymbol: string | null;
  lithology: string | null;
  sourcePages?: number[];
}

export interface GeotechDocumentClassification {
  system: string;
  value: string;
  context: string | null;
  sourcePages?: number[];
}

export interface GeotechParameterObservation {
  name: string;
  valueText: string;
  numericValue: number | null;
  unit: string | null;
  material: string | null;
  context: string | null;
  sourcePages?: number[];
}

export interface GeotechDocumentContext {
  pageNumber?: number;
  totalPages?: number;
  pageTextHint?: string;
  pageClassification?: string;
  textRecoveryAttempted?: boolean;
  directVisualPreferred?: boolean;
}

export interface GeotechDocumentInsight extends ParseSafety {
  documentClass: string | null;
  title: string | null;
  summary: string | null;
  materials: GeotechMaterialObservation[];
  classifications: GeotechDocumentClassification[];
  parameters: GeotechParameterObservation[];
  risks: string[];
  recommendations: string[];
  pageNumber: number | null;
  totalPages: number | null;
  rawLLMText: string;
  latencyMs: number;
}

function normalizeMaterialKind(value: unknown): GeotechMaterialObservation['kind'] {
  return typeof value === 'string' && MATERIAL_KINDS.includes(value as GeotechMaterialObservation['kind'])
    ? value as GeotechMaterialObservation['kind']
    : 'other';
}

function inferUscsFromText(rawText: string): string | null {
  const match = rawText.match(/\b(GW|GP|GM|GC|SW|SP|SM|SC|ML|CL|OL|MH|CH|OH|PT|CL-ML)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeMaterials(value: unknown): GeotechMaterialObservation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const materials: GeotechMaterialObservation[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const description = typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : null;
    if (!description) {
      continue;
    }

    const normalized: GeotechMaterialObservation = {
      kind: normalizeMaterialKind(item.kind),
      description,
      uscsSymbol: typeof item.uscsSymbol === 'string' && item.uscsSymbol.trim()
        ? item.uscsSymbol.trim().toUpperCase()
        : inferUscsFromText(description),
      lithology: typeof item.lithology === 'string' && item.lithology.trim()
        ? item.lithology.trim()
        : null,
    };
    const sourcePages = normalizeSourcePages(item.sourcePages);
    if (sourcePages.length > 0) {
      normalized.sourcePages = sourcePages;
    }

    const key = [
      normalized.kind,
      normalized.description.toLowerCase(),
      normalized.uscsSymbol ?? '',
      normalized.lithology?.toLowerCase() ?? '',
    ].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    materials.push(normalized);
  }

  return materials;
}

function normalizeClassifications(value: unknown): GeotechDocumentClassification[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const classifications: GeotechDocumentClassification[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const system = typeof item.system === 'string' && item.system.trim() ? item.system.trim() : null;
    const classificationValue =
      typeof item.value === 'string' && item.value.trim() ? item.value.trim() : null;
    if (!system || !classificationValue) {
      continue;
    }

    const context =
      typeof item.context === 'string' && item.context.trim() ? item.context.trim() : null;
    const key = [system.toLowerCase(), classificationValue.toLowerCase(), context?.toLowerCase() ?? ''].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const normalized: GeotechDocumentClassification = {
      system,
      value: classificationValue,
      context,
    };
    const sourcePages = normalizeSourcePages(item.sourcePages);
    if (sourcePages.length > 0) {
      normalized.sourcePages = sourcePages;
    }

    classifications.push(normalized);
  }

  return classifications;
}

function normalizeParameters(value: unknown): GeotechParameterObservation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const parameters: GeotechParameterObservation[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
    const valueText = typeof item.valueText === 'string' && item.valueText.trim()
      ? item.valueText.trim()
      : (item.numericValue != null ? String(item.numericValue) : null);
    if (!name || !valueText) {
      continue;
    }

    const numericValue =
      typeof item.numericValue === 'number' && Number.isFinite(item.numericValue)
        ? item.numericValue
        : (Number.isFinite(Number(valueText)) ? Number(valueText) : null);
    const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : null;
    const material = typeof item.material === 'string' && item.material.trim() ? item.material.trim() : null;
    const context = typeof item.context === 'string' && item.context.trim() ? item.context.trim() : null;

    const normalized: GeotechParameterObservation = {
      name,
      valueText,
      numericValue,
      unit,
      material,
      context,
    };
    const sourcePages = normalizeSourcePages(item.sourcePages);
    if (sourcePages.length > 0) {
      normalized.sourcePages = sourcePages;
    }

    const key = [
      normalized.name.toLowerCase(),
      normalized.valueText.toLowerCase(),
      normalized.unit?.toLowerCase() ?? '',
      normalized.material?.toLowerCase() ?? '',
      normalized.context?.toLowerCase() ?? '',
    ].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    parameters.push(normalized);
  }

  return parameters;
}

function sanitizeImplausibleSptParameters(parameters: GeotechParameterObservation[]): {
  parameters: GeotechParameterObservation[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sanitized = parameters.filter((parameter) => {
    if (parameter.name.toLowerCase() !== 'sptn' || parameter.numericValue == null || parameter.numericValue <= 200) {
      return true;
    }

    warnings.push(
      `Ignored implausible SPT N value (${parameter.valueText}); it appears to be a standard/reference number rather than a blow count.`,
    );
    return false;
  });

  return { parameters: sanitized, warnings };
}

function classifyDocumentHeuristically(rawText: string): string {
  const normalized = rawText.toLowerCase();
  const hasReportSignal = /\b(geotechnical (?:investigation|report)|site investigation|subsurface investigation|foundation recommendations?|executive summary|scope of work|recommendations?)\b/.test(normalized);
  const hasBoreholeAppendixSignal = /\b(?:appendix|attached|included|record of)\b[^.]{0,120}\bborehole(?: logs?| records?)?\b|\bborehole(?: logs?| records?)\b[^.]{0,120}\b(?:appendix|attached|included)\b/.test(normalized);
  if (hasReportSignal && hasBoreholeAppendixSignal) return 'site-investigation-report';
  if (/\bborehole\b|\bspt\b|\bwater table\b/.test(normalized)) return 'borehole-log';
  if (/\brqd\b|\brmr\b|\bucs\b|\bjoint\b|\bcore box\b/.test(normalized)) return 'rock-mass-document';
  if (/\b(chain of custody|required analysis|sample id|parcel id|matrix type|lab use only|certificate of analysis|analyte|reporting limit|source result|surrogate|analytical laboratory|paracel|ccil|liquid limit|plasticity index|atterberg|triaxial|permeability)\b/.test(normalized)) return 'lab-report';
  if (/\blithology\b|\bgeology\b|\bstrata\b|\bformation\b/.test(normalized)) return 'geology-log';
  return 'geotechnical-document';
}

function extractRiskHints(rawText: string): string[] {
  const sentences = splitSentences(rawText);
  const matches = sentences.filter((sentence) =>
    /(settlement|liquefaction|groundwater|seepage|collapse|weathered|weak|loose|soft|instability|squeezing|high plasticity|compressible)/i.test(sentence),
  );
  return [...new Set(matches)].slice(0, 6);
}

function extractParameterMatches(rawText: string): GeotechParameterObservation[] {
  const patterns: Array<{
    name: string;
    unit: string | null;
    regex: RegExp;
  }> = [
    { name: 'frictionAngle', unit: 'deg', regex: /\b(?:friction angle|phi|φ)\b[^0-9-]{0,20}(-?\d+(?:\.\d+)?)\s*(?:deg|°)?/gi },
    { name: 'cohesion', unit: 'kPa', regex: /\bcohesion\b[^0-9-]{0,20}(-?\d+(?:\.\d+)?)\s*(?:kpa)?/gi },
    { name: 'unitWeight', unit: 'kN/m3', regex: /\b(?:unit weight|gamma|γ)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*(?:kn\/m(?:\^?3|3|³))?/gi },
    { name: 'waterContent', unit: '%', regex: /\b(?:water content|moisture content)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*%/gi },
    { name: 'liquidLimit', unit: '%', regex: /\b(?:liquid limit|ll)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*%/gi },
    { name: 'plasticityIndex', unit: '%', regex: /\b(?:plasticity index|pi)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*%/gi },
    { name: 'permeability', unit: 'm/s', regex: /\b(?:permeability|hydraulic conductivity|k)\b[^0-9-]{0,20}((?:\d+(?:\.\d+)?)?(?:e[+-]?\d+|\d*(?:\.\d+)?))\s*(?:m\/s)?/gi },
    { name: 'modulusSubgradeReaction', unit: 'MPa/m', regex: /\bmodulus of subgrade reaction\b[^0-9-]{0,40}(\d+(?:\.\d+)?)\s*(?:mpa\s*\/\s*m|mpa\/m)?/gi },
    { name: 'relativeCompaction', unit: '% SPMDD', regex: /\bcompacted to\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*%\s+of\b[^.]{0,96}\b(?:standard proctor maximum dry density|spmdd)\b/gi },
    { name: 'optimumMoistureTolerance', unit: '%', regex: /\bwithin\s*\+\/-\s*(\d+(?:\.\d+)?)\s*%\s+of\s+its\s+optimum moisture content\b/gi },
    { name: 'liftThickness', unit: 'm', regex: /\b(?:not greater than|generally not greater than)\s*(\d+(?:\.\d+)?)\s*m\b[^.]{0,80}\bloose lifts\b/gi },
    { name: 'ucs', unit: 'MPa', regex: /\b(?:ucs|uniaxial compressive strength)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*(?:mpa)?/gi },
    { name: 'rqd', unit: '%', regex: /\brqd\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*%?/gi },
    { name: 'rmr', unit: null, regex: /\brmr\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\b/gi },
    { name: 'sptN', unit: null, regex: /\b(?:spt|n[- ]?value|n60|n160)\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\b/gi },
  ];

  const parameters: GeotechParameterObservation[] = [];

  for (const pattern of patterns) {
    for (const match of rawText.matchAll(pattern.regex)) {
      const valueText = match[1]?.trim();
      if (!valueText) {
        continue;
      }

      parameters.push({
        name: pattern.name,
        valueText,
        numericValue: Number.isFinite(Number(valueText)) ? Number(valueText) : null,
        unit: pattern.unit,
        material: null,
        context: null,
      });
    }
  }

  return normalizeParameters(parameters);
}

function extractMaterialMatches(rawText: string): GeotechMaterialObservation[] {
  const matches: GeotechMaterialObservation[] = [];
  const normalized = rawText.toLowerCase();
  const dictionaries: Array<{
    kind: GeotechMaterialObservation['kind'];
    values: string[];
  }> = [
    { kind: 'soil', values: ['clay', 'silt', 'sand', 'gravel', 'peat', 'fill', 'alluvium', 'colluvium'] },
    { kind: 'rock', values: ['sandstone', 'siltstone', 'shale', 'mudstone', 'claystone', 'limestone', 'granite', 'basalt', 'tuff', 'schist', 'gneiss', 'rock'] },
    { kind: 'groundwater', values: ['groundwater', 'water table', 'seepage'] },
  ];

  for (const dictionary of dictionaries) {
    for (const value of dictionary.values) {
      if (!normalized.includes(value)) {
        continue;
      }

      matches.push({
        kind: dictionary.kind,
        description: value,
        uscsSymbol: dictionary.kind === 'soil' ? inferUscsFromText(value) : null,
        lithology: dictionary.kind === 'rock' && value !== 'rock' ? value : null,
      });
    }
  }

  const layeredSentences = splitSentences(rawText).filter((sentence) =>
    /(clay|silt|sand|gravel|peat|fill|sandstone|shale|limestone|granite|basalt|mudstone|siltstone)/i.test(sentence),
  );
  for (const sentence of layeredSentences.slice(0, 6)) {
    const description = sentence.trim();
    const lower = description.toLowerCase();
    const kind: GeotechMaterialObservation['kind'] =
      /(sandstone|shale|limestone|granite|basalt|mudstone|siltstone|rock)/i.test(lower)
        ? 'rock'
        : /(water table|groundwater|seepage)/i.test(lower)
          ? 'groundwater'
          : /(fill)/i.test(lower)
            ? 'fill'
            : 'soil';

    matches.push({
      kind,
      description,
      uscsSymbol: kind === 'soil' ? inferUscsFromText(description) : null,
      lithology: kind === 'rock'
        ? firstMatchingSentence(description, () => true)
        : null,
    });
  }

  return normalizeMaterials(matches);
}

function extractClassificationMatches(rawText: string): GeotechDocumentClassification[] {
  const classifications: GeotechDocumentClassification[] = [];
  const uscsMatches = [...rawText.matchAll(/\b(GW|GP|GM|GC|SW|SP|SM|SC|ML|CL|OL|MH|CH|OH|PT|CL-ML)\b/gi)];
  if (uscsMatches.length > 0) {
    for (const match of uscsMatches) {
      classifications.push({
        system: 'USCS',
        value: match[1]!.toUpperCase(),
        context: null,
      });
    }
  }

  const scalarMatches: Array<{ system: string; regex: RegExp }> = [
    { system: 'RMR', regex: /\bRMR\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\b/i },
    { system: 'RQD', regex: /\bRQD\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\s*%?/i },
    { system: 'Q-system', regex: /\bQ(?:-system)?\b[^0-9-]{0,20}(\d+(?:\.\d+)?)\b/i },
  ];

  for (const scalarMatch of scalarMatches) {
    const match = rawText.match(scalarMatch.regex);
    if (match?.[1]) {
      classifications.push({
        system: scalarMatch.system,
        value: match[1],
        context: null,
      });
    }
  }

  return normalizeClassifications(classifications);
}

function extractGeotechDocumentFallback(rawText: string): {
  value: Record<string, unknown> | null;
  baseStatus: ParseStatus;
  warnings: string[];
} {
  if (!rawText.trim()) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  const summary = firstMatchingSentence(
    rawText,
    (sentence) => /(ground|soil|rock|litholog|formation|parameter|strength|plasticity|permeability|settlement|bearing|laborator|analysis|sample id|chain of custody|required analysis|parcel id)/i.test(sentence),
  ) ?? splitSentences(rawText)[0] ?? null;
  const materials = extractMaterialMatches(rawText);
  const classifications = extractClassificationMatches(rawText);
  const parameters = extractParameterMatches(rawText);
  const risks = extractRiskHints(rawText);
  const recommendations = splitSentences(rawText)
    .filter((sentence) => /(recommend|should|verify|review|check|monitor|confirm|test)/i.test(sentence))
    .slice(0, 5);

  const value: Record<string, unknown> = {
    documentClass: classifyDocumentHeuristically(rawText),
  };
  if (summary) value.summary = summary;
  if (materials.length > 0) value.materials = materials;
  if (classifications.length > 0) value.classifications = classifications;
  if (parameters.length > 0) value.parameters = parameters;
  if (risks.length > 0) value.risks = risks;
  if (recommendations.length > 0) value.recommendations = recommendations;

  if (Object.keys(value).length <= 1) {
    return { value: null, baseStatus: 'failed', warnings: [] };
  }

  return {
    value,
    baseStatus: 'partial',
    warnings: ['Vision model returned narrative text; extracted partial structured geotechnical document fields.'],
  };
}

function buildGeotechDocumentInsightFromValue(input: {
  mergedValue: Record<string, unknown>;
  baseStatus: ParseStatus;
  warnings: string[];
  normalizedPageText: string;
  context: GeotechDocumentContext;
  rawLLMText: string;
  latencyMs: number;
}): GeotechDocumentInsight {
  const materials = normalizeMaterials(input.mergedValue.materials);
  const classifications = normalizeClassifications(input.mergedValue.classifications);
  const parameterSanitization = sanitizeImplausibleSptParameters(normalizeParameters(input.mergedValue.parameters));
  const parameters = parameterSanitization.parameters;
  const risks = normalizeTextList(input.mergedValue.risks);
  const recommendations = normalizeTextList(input.mergedValue.recommendations);
  const summary = readOptionalString(input.mergedValue, 'summary');
  const title = readOptionalString(input.mergedValue, 'title');
  const documentClass =
    readOptionalString(input.mergedValue, 'documentClass')
    ?? classifyDocumentHeuristically(input.normalizedPageText);
  const confidence = clampConfidence(
    input.mergedValue.confidence,
    input.baseStatus === 'parsed' ? 74 : input.baseStatus === 'partial' ? 58 : 0,
  );

  const status = deriveParseStatus(
    input.baseStatus,
    [
      summary,
      materials.length > 0 ? 'materials' : null,
      classifications.length > 0 ? 'classifications' : null,
      parameters.length > 0 ? 'parameters' : null,
    ].filter((value) => value !== null).length,
    2,
  );
  const safety = createParseSafety(
    status,
    confidence,
    combineWarnings(
      [...input.warnings, ...parameterSanitization.warnings],
      normalizeWarnings(input.mergedValue.warnings),
    ),
  );

  return {
    ...safety,
    documentClass,
    title,
    summary,
    materials,
    classifications,
    parameters,
    risks,
    recommendations,
    pageNumber: input.context.pageNumber ?? null,
    totalPages: input.context.totalPages ?? null,
    rawLLMText: input.rawLLMText,
    latencyMs: input.latencyMs,
  };
}

function shouldShortCircuitToDeterministicFallback(insight: GeotechDocumentInsight): boolean {
  const hasSummary = typeof insight.summary === 'string' && insight.summary.trim().length > 0;
  const hasTitle = typeof insight.title === 'string' && insight.title.trim().length > 0;
  const signalText = [
    insight.title,
    insight.summary,
    ...insight.materials.map((material) => material.description),
    ...insight.classifications.map((classification) => `${classification.system} ${classification.value}`.trim()),
    ...insight.parameters.map((parameter) => `${parameter.name} ${parameter.valueText}`.trim()),
    ...insight.risks,
    ...insight.recommendations,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
  const hasStrongStructuredSignal =
    insight.parameters.length > 0
    || (insight.materials.length > 0 && insight.classifications.length > 0)
    || (insight.materials.length > 0 && insight.risks.length > 0);
  const hasAnyStructuredSignal =
    hasStrongStructuredSignal
    || insight.materials.length > 0
    || insight.classifications.length > 0
    || insight.risks.length > 0
    || insight.recommendations.length > 0;
  const hasRecognizableLabFormSignal =
    insight.documentClass === 'lab-report'
    && /chain of custody|required analysis|sample id|analytical laboratory|laboratories|certificate of analysis|analyte|reporting limit|source result|surrogate/i.test(
      signalText,
    );
  const hasBoreholeProcedureSignal =
    insight.documentClass === 'borehole-log'
    && /\bbh\d{1,5}[a-z0-9-]*\b|\bnorthing\b|\beasting\b|\belevation\b|\bstandard penetration test\b|\bspt\b|\bastm d1586\b|\bsplit spoon\b|\bsample location\b/i.test(
      signalText,
    );
  const hasBroaderEngineeringSignal =
    /\blaboratory\b|\bplasticity\b|\bliquid limit\b|\bmoisture content\b|\btriaxial\b|\bpermeability\b|\bgroundwater\b|\bstratigraphy\b|\blithology\b|\bformation\b|\bweathered\b|\brqd\b|\brmr\b|\bq-system\b/i.test(
      signalText,
    );

  if (hasSummary && (hasStrongStructuredSignal || hasRecognizableLabFormSignal)) {
    return true;
  }

  if (
    (insight.documentClass === 'borehole-log' || insight.documentClass === 'lab-report')
    && (hasSummary || hasTitle)
    && (hasAnyStructuredSignal || hasBoreholeProcedureSignal || hasBroaderEngineeringSignal)
  ) {
    return true;
  }

  if (
    (insight.documentClass === 'geology-log' || insight.documentClass === 'rock-mass-document')
    && (hasSummary || hasTitle)
    && (hasAnyStructuredSignal || hasBroaderEngineeringSignal)
  ) {
    return true;
  }

  return false;
}

function buildDeterministicGeotechDocumentInsight(
  normalizedPageText: string,
  context: GeotechDocumentContext,
): GeotechDocumentInsight | null {
  const fallback = extractGeotechDocumentFallback(normalizedPageText);
  if (!fallback.value) {
    return null;
  }

  return buildGeotechDocumentInsightFromValue({
    mergedValue: fallback.value,
    baseStatus: fallback.baseStatus,
    warnings: fallback.warnings,
    normalizedPageText,
    context,
    rawLLMText: '',
    latencyMs: 0,
  });
}

export function extractGeotechDocumentDeterministicFactsFromText(
  pageText: string,
  context: GeotechDocumentContext = {},
  options: {
    warning?: string;
    forcePartial?: boolean;
  } = {},
): GeotechDocumentInsight | null {
  const normalizedPageText = pageText.replace(/\s+/g, ' ').trim();
  if (!normalizedPageText) {
    return null;
  }

  const insight = buildDeterministicGeotechDocumentInsight(normalizedPageText, context);
  if (!insight) {
    return null;
  }

  const parseStatus =
    options.forcePartial && insight.parseStatus !== 'failed'
      ? 'partial'
      : insight.parseStatus;

  return {
    ...insight,
    parseStatus,
    confidence: options.forcePartial ? Math.min(insight.confidence, 68) : insight.confidence,
    canAutoProceed: options.forcePartial ? false : insight.canAutoProceed,
    warnings: options.warning
      ? combineWarnings(insight.warnings, [options.warning])
      : insight.warnings,
  };
}

export async function extractGeotechDocumentFactsFromText(
  pageText: string,
  config: LLMConfig,
  context: GeotechDocumentContext = {},
): Promise<GeotechDocumentInsight> {
  const normalizedPageText = pageText.replace(/\s+/g, ' ').trim();
  if (!normalizedPageText) {
    return {
      ...createParseSafety('failed', 0, ['No usable document text was available for geotechnical extraction.']),
      documentClass: null,
      title: null,
      summary: null,
      materials: [],
      classifications: [],
      parameters: [],
      risks: [],
      recommendations: [],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: '',
      latencyMs: 0,
    };
  }

  const contextParts = [
    context.pageNumber != null && context.totalPages != null
      ? `Page ${context.pageNumber} of ${context.totalPages}`
      : null,
    context.pageClassification ? `Page classification: ${context.pageClassification}` : null,
  ].filter((value): value is string => Boolean(value));
  const sharedContext = contextParts.join('\n');
  const fallback = extractGeotechDocumentFallback(normalizedPageText);
  const deterministicFallbackInsight = buildDeterministicGeotechDocumentInsight(normalizedPageText, context);

  if (deterministicFallbackInsight && shouldShortCircuitToDeterministicFallback(deterministicFallbackInsight)) {
    const deterministicConfidence = Math.max(deterministicFallbackInsight.confidence, 72);
    return {
      ...deterministicFallbackInsight,
      confidence: deterministicConfidence,
      canAutoProceed:
        deterministicFallbackInsight.parseStatus === 'parsed'
        && deterministicConfidence >= 70,
      warnings: combineWarnings(
        deterministicFallbackInsight.warnings,
        ['Strong deterministic text extraction satisfied the evidence threshold; skipped model extraction for this page.'],
      ),
    };
  }

  const prompt = `Analyze this extracted geotechnical document text and extract the crucial engineering content. Respond with ONLY a JSON object:
{
  "documentClass": "<borehole-log|geology-log|lab-report|rock-mass-document|site-investigation-report|geotechnical-document|unknown>",
  "title": "<short title if clearly visible in the text or null>",
  "summary": "<brief engineering summary of the page text>",
  "materials": [
    {
      "kind": "<soil|rock|fill|groundwater|mixed|other>",
      "description": "<ground type / soil / rock / lithology description>",
      "uscsSymbol": "<USCS symbol if identifiable or null>",
      "lithology": "<lithology if identifiable or null>"
    }
  ],
  "classifications": [
    {
      "system": "<USCS|RMR|RQD|Q-system|other>",
      "value": "<classification value>",
      "context": "<material or page context or null>"
    }
  ],
  "parameters": [
    {
      "name": "<parameter key such as frictionAngle, cohesion, unitWeight, waterContent, liquidLimit, plasticityIndex, permeability, ucs, rqd, rmr, sptN>",
      "valueText": "<printed or inferred value as text>",
      "numericValue": <number or null>,
      "unit": "<unit or null>",
      "material": "<material/layer context or null>",
      "context": "<page/table context or null>"
    }
  ],
  "risks": ["<engineering risk or limitation>"],
  "recommendations": ["<follow-up recommendation>"],
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}

Capture geology, lithology, soil/rock mechanics parameters, groundwater cues, and critical engineering insights only when supported by the text.

Context:
${sharedContext}

Document text:
${normalizedPageText.slice(0, 6000)}`;

  let response;
  try {
    response = await textWithRetry(
      prompt,
      config,
      'You are an expert geotechnical engineer and engineering geologist extracting structured engineering meaning from document text. Respond with JSON only when possible.',
      1200,
    );
  } catch (error) {
    if (deterministicFallbackInsight) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...deterministicFallbackInsight,
        canAutoProceed: false,
        warnings: combineWarnings(
          deterministicFallbackInsight.warnings,
          [`Structured text extraction failed (${message}); used deterministic fallback instead.`],
        ),
      };
    }

    throw error;
  }

  const parsed = parseJsonObject(response.text);
  const mergedValue = {
    ...(fallback.value ?? {}),
    ...(parsed.value ?? {}),
  };
  const baseStatus = parsed.baseStatus !== 'failed' ? parsed.baseStatus : fallback.baseStatus;
  const warnings = [...parsed.warnings, ...fallback.warnings];
  if (response.usedFallback) {
    warnings.push('Text extraction required a fallback retry before structured parsing succeeded.');
  }
  return buildGeotechDocumentInsightFromValue({
    mergedValue,
    baseStatus,
    warnings,
    normalizedPageText,
    context,
    rawLLMText: response.text,
    latencyMs: response.latencyMs,
  });
}

async function extractGeotechDocumentFactsFromImage(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  context: GeotechDocumentContext = {},
): Promise<GeotechDocumentInsight> {
  const contextParts = [
    context.pageNumber != null && context.totalPages != null
      ? `Page ${context.pageNumber} of ${context.totalPages}`
      : null,
    context.pageClassification ? `Page classification: ${context.pageClassification}` : null,
    context.textRecoveryAttempted ? 'OCR/text recovery was already attempted and did not produce usable text.' : null,
  ].filter((value): value is string => Boolean(value));
  const sharedContext = contextParts.join('\n');
  const strictPrompt = `Extract geotechnical engineering content directly from this document page image. Respond with ONLY a JSON object:
{
  "documentClass": "<borehole-log|geology-log|lab-report|rock-mass-document|site-investigation-report|visual-appendix-document|geotechnical-document|unknown>",
  "title": "<short visible page/report title or null>",
  "summary": "<brief technical summary of the visible page>",
  "materials": [
    {
      "kind": "<soil|rock|fill|groundwater|mixed|other>",
      "description": "<visible ground type, soil/rock layer, lithology, or visual observation>",
      "uscsSymbol": "<USCS symbol if visible or inferable from visible labels, otherwise null>",
      "lithology": "<lithology if visible or null>"
    }
  ],
  "classifications": [
    {
      "system": "<USCS|RMR|RQD|SPT|grain-size|other>",
      "value": "<visible classification, chart value, or class label>",
      "context": "<borehole/sample/depth/page context or null>"
    }
  ],
  "parameters": [
    {
      "name": "<parameter key such as sptN, depth, clayPercent, siltPercent, sandPercent, gravelPercent, waterTableDepth, ucs, rqd, rmr>",
      "valueText": "<visible printed or chart-derived value>",
      "numericValue": <number or null>,
      "unit": "<unit or null>",
      "material": "<material/borehole/sample context or null>",
      "context": "<visible source such as chart/table/borehole log/photo caption or null>"
    }
  ],
  "risks": ["<visible engineering risk or limitation>"],
  "recommendations": ["<specific review or follow-up recommendation>"],
  "confidence": <number 0-100>,
  "warnings": ["<warning>", "<warning>"]
}

Prioritize borehole IDs, depths, SPT N values, grain-size percentages, Atterberg/strength values, water table, strata descriptions, and foundation design values. For photos or figures with little tabular data, classify as visual-appendix-document and summarize what the image evidences instead of failing.

Context:
${sharedContext}`;

  const softPrompt = `Read this geotechnical report page visually. Extract any visible borehole log data, chart/table values, strata descriptions, laboratory values, SPT/depth values, or photo evidence. If it is mostly a figure or site photo, summarize the visible geotechnical evidence and mark limitations. Return concise JSON with documentClass, summary, materials, classifications, parameters, risks, recommendations, confidence, and warnings.

Context:
${sharedContext}`;

  const response = await documentVisionWithRetry(
    imageBase64,
    mimeType,
    config,
    strictPrompt,
    softPrompt,
    'You are an expert geotechnical engineer extracting structured evidence directly from scanned report pages, graphs, tables, borehole logs, and site photographs. Respond with JSON only when possible.',
    1200,
  );

  const parsed = parseJsonObject(response.text);
  const fallback = extractGeotechDocumentFallback(response.text);
  const mergedValue = {
    ...(fallback.value ?? {}),
    ...(parsed.value ?? {}),
  };
  const baseStatus = parsed.baseStatus !== 'failed' ? parsed.baseStatus : fallback.baseStatus;
  const warnings = [...parsed.warnings, ...fallback.warnings];
  if (response.usedFallback) {
    warnings.push('Direct visual extraction required a fallback retry before structured parsing succeeded.');
  }

  if (!parsed.value && !fallback.value) {
    return {
      ...createParseSafety('failed', 0, combineWarnings(warnings, ['Direct visual extraction did not recover usable geotechnical content.'])),
      documentClass: null,
      title: null,
      summary: null,
      materials: [],
      classifications: [],
      parameters: [],
      risks: [],
      recommendations: [],
      pageNumber: context.pageNumber ?? null,
      totalPages: context.totalPages ?? null,
      rawLLMText: response.text,
      latencyMs: response.latencyMs,
    };
  }

  return buildGeotechDocumentInsightFromValue({
    mergedValue,
    baseStatus,
    warnings,
    normalizedPageText: response.text,
    context,
    rawLLMText: response.text,
    latencyMs: response.latencyMs,
  });
}

export async function interpretGeotechDocumentPage(
  imageBase64: string,
  mimeType: string,
  config: LLMConfig,
  context: GeotechDocumentContext = {},
): Promise<GeotechDocumentInsight> {
  const seededText = typeof context.pageTextHint === 'string' && context.pageTextHint.trim().length >= 24
    ? context.pageTextHint.trim()
    : null;
  let text = seededText;
  const transcriptionWarnings: string[] = [];
  let transcriptionLatencyMs = 0;

  if (!text) {
    if (context.directVisualPreferred) {
      transcriptionWarnings.push('OCR-only transcription was skipped for this image-only page; direct visual extraction was used to preserve charts, tables, and borehole log context.');
    } else if (context.textRecoveryAttempted) {
      transcriptionWarnings.push('Upstream text recovery already failed to recover usable text; using direct visual extraction instead of repeating OCR.');
    } else {
      const transcription = await transcribeDocumentImageText(imageBase64, mimeType, config);
      text = transcription.text.trim();
      transcriptionWarnings.push(...transcription.warnings);
      transcriptionLatencyMs = transcription.latencyMs;
      if (!text) {
        transcriptionWarnings.push('OCR-style transcription did not recover usable text from the page image.');
      }
    }
  }

  const extracted = text
    ? await extractGeotechDocumentFactsFromText(text, config, context)
    : await extractGeotechDocumentFactsFromImage(imageBase64, mimeType, config, context);
  return {
    ...extracted,
    warnings: combineWarnings(extracted.warnings, transcriptionWarnings),
    latencyMs: extracted.latencyMs + transcriptionLatencyMs,
  };
}

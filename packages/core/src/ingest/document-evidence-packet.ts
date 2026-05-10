import { z } from 'zod';
import type { DocumentTextHintSource } from '../vision/ocr.js';
import type {
  GeotechDocumentContentChunk,
  GeotechDocumentFinding,
  GeotechDocumentIngestResult,
  GeotechDocumentPageAudit,
} from './geotech-document.js';

export const DOCUMENT_EVIDENCE_PACKET_SCHEMA_VERSION = 2;

export const DocumentEvidenceMethodSchema = z.enum([
  'native-pdf-text',
  'layout-ocr',
  'visual-reasoning',
  'hybrid',
  'none',
]);

export const DocumentEvidenceReviewStatusSchema = z.enum([
  'verified',
  'needs_review',
  'missing',
  'uncertain',
]);

export const DocumentEvidenceObservationTypeSchema = z.enum([
  'material',
  'classification',
  'parameter',
]);

const SourceSchema = z.object({
  fileName: z.string().optional(),
  filePath: z.string().optional(),
  inputKind: z.enum(['image', 'pdf']),
  pageRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  totalPages: z.number().int().nonnegative(),
  successfulPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
});

const DocumentSchema = z.object({
  title: z.string().nullable(),
  documentClass: z.string().nullable(),
  parseStatus: z.enum(['parsed', 'partial', 'failed']),
  confidence: z.number().min(0).max(100),
  confidenceBreakdown: z.object({
    schemaVersion: z.literal(1),
    overall: z.number().min(0).max(100),
    extractionConfidence: z.number().min(0).max(100),
    engineeringCompleteness: z.number().min(0).max(100),
    traceabilityScore: z.number().min(0).max(100),
    corroborationScore: z.number().min(0).max(100),
    readinessScore: z.number().min(0).max(100),
    pageEvidenceConfidence: z.number().min(0).max(100),
    methodCoverage: z.object({
      nativeTextPages: z.number().int().nonnegative(),
      layoutOcrPages: z.number().int().nonnegative(),
      visualReasoningPages: z.number().int().nonnegative(),
      directVisualPages: z.number().int().nonnegative(),
    }),
    missingCriticalData: z.array(z.string()),
    reviewGates: z.array(z.string()),
    notes: z.array(z.string()),
  }).optional(),
  reviewRequired: z.boolean(),
  canAutoProceed: z.boolean(),
});

const PageSchema = z.object({
  pageNumber: z.number().int().positive(),
  classification: z.string().nullable(),
  parseStatus: z.enum(['parsed', 'partial', 'failed']),
  confidence: z.number().min(0).max(100),
  method: DocumentEvidenceMethodSchema,
  rawSource: z.string(),
  sourceCategory: z.enum(['native-text', 'layout-ocr', 'vision', 'none']),
  cacheStatus: z.enum(['hit', 'miss', 'stored', 'skipped', 'unavailable']),
  cacheEntryId: z.string().optional(),
  counts: z.object({
    materials: z.number().int().nonnegative(),
    classifications: z.number().int().nonnegative(),
    parameters: z.number().int().nonnegative(),
  }),
  warnings: z.array(z.string()),
});

const ObservationSchema = z.object({
  id: z.string(),
  type: DocumentEvidenceObservationTypeSchema,
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  numericValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  sourcePages: z.array(z.number().int().positive()),
  method: DocumentEvidenceMethodSchema,
  confidence: z.number().min(0).max(100),
  reviewStatus: DocumentEvidenceReviewStatusSchema,
  warnings: z.array(z.string()),
});

const ContentChunkSchema = z.object({
  chunkId: z.string(),
  pageRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  headingAncestry: z.array(z.string()),
  scope: z.enum(['page', 'table', 'figure', 'section']),
  sectionType: z.string().optional(),
  significance: z.number().optional(),
  sourcePages: z.array(z.number().int().positive()),
  text: z.string(),
});

const ReviewFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['advisory', 'review', 'blocking']),
  scope: z.enum(['document', 'page', 'material']),
  message: z.string(),
  pageNumber: z.number().int().positive().optional(),
  materialDescription: z.string().optional(),
});

const SynthesisSchema = z.object({
  takeaways: z.array(z.string()),
  groundModel: z.array(z.string()),
  keyParameters: z.array(z.string()),
  interpretation: z.array(z.string()),
  limitations: z.array(z.string()),
  sourcePages: z.array(z.number().int().positive()),
  latencyMs: z.number().nonnegative().optional(),
}).nullable();

const EngineeringSignalsSchema = z.object({
  risks: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const DocumentEvidencePacketSchema = z.object({
  kind: z.literal('document-evidence-packet'),
  schemaVersion: z.literal(DOCUMENT_EVIDENCE_PACKET_SCHEMA_VERSION),
  generatedAt: z.string(),
  providerContract: z.object({
    providerNeutral: z.literal(true),
    purpose: z.literal('byok-document-understanding'),
    normalizedMethods: z.array(DocumentEvidenceMethodSchema),
    reviewGates: z.array(z.string()),
  }),
  source: SourceSchema,
  document: DocumentSchema,
  pages: z.array(PageSchema),
  observations: z.object({
    materials: z.array(ObservationSchema),
    classifications: z.array(ObservationSchema),
    parameters: z.array(ObservationSchema),
  }),
  contentChunks: z.array(ContentChunkSchema),
  engineeringSignals: EngineeringSignalsSchema,
  synthesis: SynthesisSchema,
  review: z.object({
    warnings: z.array(z.string()),
    reviewReasons: z.array(z.string()),
    findings: z.array(ReviewFindingSchema),
  }),
  traceability: z.object({
    sourcePages: z.array(z.number().int().positive()),
    pagesWithEvidence: z.array(z.number().int().positive()),
    directVisualPages: z.array(z.number().int().positive()),
    layoutOcrPages: z.array(z.number().int().positive()),
    nativeTextPages: z.array(z.number().int().positive()),
    boreholeIds: z.array(z.string()),
    maxDepthMeters: z.number().nullable(),
    parametersWithSourcePage: z.number().int().nonnegative(),
    parametersWithoutSourcePage: z.number().int().nonnegative(),
    parameterTraceabilityRate: z.number().min(0).max(1),
    methodCounts: z.record(z.string(), z.number().int().nonnegative()),
  }),
});

export type DocumentEvidenceMethod = z.infer<typeof DocumentEvidenceMethodSchema>;
export type DocumentEvidencePacket = z.infer<typeof DocumentEvidencePacketSchema>;
export type DocumentEvidenceReviewStatus = z.infer<typeof DocumentEvidenceReviewStatusSchema>;

export interface SummarizeDocumentEvidencePacketForAgentOptions {
  maxObservationsPerGroup?: number;
  maxReviewGates?: number;
  maxContentChars?: number;
}

export interface CompileDocumentEvidenceSynthesisPromptOptions {
  maxEvidenceChars?: number;
  maxOutlineChunks?: number;
  maxHighSignalChunks?: number;
  maxParameters?: number;
  maxMaterials?: number;
  maxClassifications?: number;
}

export interface CompiledDocumentEvidenceSynthesisPrompt {
  systemPrompt: string;
  prompt: string;
  evidence: string;
  hasEngineeringSignal: boolean;
  sourcePages: number[];
  reviewGates: string[];
  schemaVersion: number;
}

export function buildDocumentEvidencePacket(result: GeotechDocumentIngestResult): DocumentEvidencePacket {
  const pages = result.pageAudits.map((audit) => buildEvidencePage(audit));
  const traceability = buildTraceability(result, pages);
  const packet = {
    kind: 'document-evidence-packet' as const,
    schemaVersion: DOCUMENT_EVIDENCE_PACKET_SCHEMA_VERSION,
    generatedAt: result.generatedAt,
    providerContract: {
      providerNeutral: true as const,
      purpose: 'byok-document-understanding' as const,
      normalizedMethods: ['native-pdf-text', 'layout-ocr', 'visual-reasoning', 'hybrid', 'none'] as DocumentEvidenceMethod[],
      reviewGates: buildReviewGates(result),
    },
    source: {
      ...(result.source.fileName ? { fileName: result.source.fileName } : {}),
      ...(result.source.filePath ? { filePath: result.source.filePath } : {}),
      inputKind: result.source.inputKind,
      ...(result.source.pageRange ? { pageRange: result.source.pageRange } : {}),
      totalPages: result.source.totalPages,
      successfulPages: result.source.successfulPages,
      failedPages: result.source.failedPages,
    },
    document: {
      title: result.title,
      documentClass: result.documentClass,
      parseStatus: result.parseStatus,
      confidence: normalizeConfidence(result.confidence),
      ...(result.confidenceBreakdown ? { confidenceBreakdown: result.confidenceBreakdown } : {}),
      reviewRequired: result.reviewRequired,
      canAutoProceed: result.canAutoProceed,
    },
    pages,
    observations: {
      materials: result.materials.map((material, index) => {
        const sourcePages = sourcePagesFromObservation(material.sourcePages, material.description);
        return {
          id: observationId('material', index, material.description),
          type: 'material' as const,
          label: material.kind,
          value: material.description,
          material: material.lithology,
          context: material.uscsSymbol ? `USCS ${material.uscsSymbol}` : null,
          sourcePages,
          method: methodForSourcePages(sourcePages, pages),
          confidence: confidenceForSourcePages(sourcePages, pages, result.confidence),
          reviewStatus: sourcePages.length > 0 ? 'verified' as const : 'needs_review' as const,
          warnings: [],
        };
      }),
      classifications: result.classifications.map((classification, index) => {
        const sourcePages = sourcePagesFromObservation(classification.sourcePages, classification.context);
        return {
          id: observationId('classification', index, `${classification.system}:${classification.value}`),
          type: 'classification' as const,
          label: classification.system,
          value: classification.value,
          context: classification.context,
          sourcePages,
          method: methodForSourcePages(sourcePages, pages),
          confidence: confidenceForSourcePages(sourcePages, pages, result.confidence),
          reviewStatus: sourcePages.length > 0 ? 'verified' as const : 'needs_review' as const,
          warnings: [],
        };
      }),
      parameters: result.parameters.map((parameter, index) => {
        const sourcePages = sourcePagesFromObservation(parameter.sourcePages, parameter.context);
        const missing = isMissingValue(parameter.valueText, parameter.numericValue);
        return {
          id: observationId('parameter', index, `${parameter.name}:${parameter.valueText}`),
          type: 'parameter' as const,
          label: parameter.name,
          value: parameter.valueText,
          numericValue: parameter.numericValue,
          unit: parameter.unit,
          material: parameter.material,
          context: parameter.context,
          sourcePages,
          method: methodForSourcePages(sourcePages, pages),
          confidence: missing ? 0 : confidenceForSourcePages(sourcePages, pages, result.confidence),
          reviewStatus: missing
            ? 'missing' as const
            : sourcePages.length > 0
              ? 'verified' as const
              : 'needs_review' as const,
          warnings: missing ? ['Value is missing or not extracted.'] : [],
        };
      }),
    },
    contentChunks: (result.contentChunks ?? []).map(compactContentChunk),
    engineeringSignals: {
      risks: uniqueNonEmpty(result.risks).slice(0, 24),
      recommendations: uniqueNonEmpty(result.recommendations).slice(0, 24),
    },
    synthesis: result.synthesis
      ? {
          takeaways: result.synthesis.takeaways,
          groundModel: result.synthesis.groundModel,
          keyParameters: result.synthesis.keyParameters,
          interpretation: result.synthesis.interpretation,
          limitations: result.synthesis.limitations,
          sourcePages: normalizePages(result.synthesis.sourcePages),
          ...(Number.isFinite(result.synthesis.latencyMs) ? { latencyMs: Math.max(0, Math.round(result.synthesis.latencyMs as number)) } : {}),
        }
      : null,
    review: {
      warnings: result.warnings,
      reviewReasons: result.reviewReasons,
      findings: result.reviewFindings.map(compactReviewFinding),
    },
    traceability,
  };

  return DocumentEvidencePacketSchema.parse(packet);
}

export function attachDocumentEvidencePacket<T extends GeotechDocumentIngestResult>(
  result: T,
): T & { evidencePacket: DocumentEvidencePacket } {
  return {
    ...result,
    evidencePacket: buildDocumentEvidencePacket(result),
  };
}

export function documentEvidencePacketHasEngineeringSignal(packet: DocumentEvidencePacket): boolean {
  return packet.observations.materials.length > 0
    || packet.observations.classifications.length > 0
    || packet.observations.parameters.length > 0
    || packet.engineeringSignals.risks.length > 0
    || packet.engineeringSignals.recommendations.length > 0
    || packet.contentChunks.some((chunk) =>
      chunk.text.trim().length > 0
      && chunk.sectionType !== 'administrative'
      && chunk.sectionType !== 'visual-appendix',
    );
}

export function compileDocumentEvidenceSynthesisPrompt(
  packet: DocumentEvidencePacket,
  options: CompileDocumentEvidenceSynthesisPromptOptions = {},
): CompiledDocumentEvidenceSynthesisPrompt {
  const maxEvidenceChars = options.maxEvidenceChars ?? 9000;
  const outlineChunks = [...packet.contentChunks]
    .filter((chunk) => chunk.text.trim().length > 0 && chunk.sectionType !== 'administrative')
    .sort((left, right) =>
      left.pageRange[0] - right.pageRange[0]
      || left.pageRange[1] - right.pageRange[1],
    )
    .slice(0, options.maxOutlineChunks ?? 28)
    .map((chunk) => formatContentChunkForSynthesis(chunk, 240));
  const highSignalChunks = [...packet.contentChunks]
    .filter((chunk) => chunk.text.trim().length > 0 && chunk.sectionType !== 'administrative')
    .sort((left, right) => (right.significance ?? 0) - (left.significance ?? 0))
    .slice(0, options.maxHighSignalChunks ?? 18)
    .map((chunk) => formatContentChunkForSynthesis(chunk, 360));
  const parameters = packet.observations.parameters
    .slice(0, options.maxParameters ?? 48)
    .map((observation) => formatObservationForSynthesis(observation));
  const materials = packet.observations.materials
    .slice(0, options.maxMaterials ?? 36)
    .map((observation) => formatObservationForSynthesis(observation));
  const classifications = packet.observations.classifications
    .slice(0, options.maxClassifications ?? 28)
    .map((observation) => formatObservationForSynthesis(observation));
  const boreholeLines = buildBoreholeContinuityLines(packet);
  const pageLines = packet.pages
    .slice()
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) =>
      `Page ${page.pageNumber}: ${page.parseStatus}; method=${page.method}; source=${page.rawSource}; class=${page.classification ?? 'unknown'}; confidence=${page.confidence}%; counts m/c/p=${page.counts.materials}/${page.counts.classifications}/${page.counts.parameters}${page.warnings.length > 0 ? `; warnings=${page.warnings.slice(0, 3).join(' | ')}` : ''}`,
    );
  const missingParameters = packet.observations.parameters
    .filter((observation) => observation.reviewStatus === 'missing')
    .map((observation) => formatObservationForSynthesis(observation));
  const reviewParameters = packet.observations.parameters
    .filter((observation) => observation.reviewStatus === 'needs_review' || observation.reviewStatus === 'uncertain')
    .map((observation) => formatObservationForSynthesis(observation));

  const evidence = compactText([
    'Provider-neutral DocumentEvidencePacket synthesis evidence contract.',
    `Packet schema: v${packet.schemaVersion}; providerNeutral=${packet.providerContract.providerNeutral}; purpose=${packet.providerContract.purpose}.`,
    `Source: ${packet.source.fileName ?? packet.source.filePath ?? packet.source.inputKind}; pages ${packet.source.successfulPages}/${packet.source.totalPages}; evidence pages ${pageList(packet.traceability.pagesWithEvidence)}.`,
    `Document: ${packet.document.title ?? 'untitled'}; class=${packet.document.documentClass ?? 'unknown'}; status=${packet.document.parseStatus}; confidence=${packet.document.confidence}%; reviewRequired=${packet.document.reviewRequired ? 'yes' : 'no'}; canAutoProceed=${packet.document.canAutoProceed ? 'yes' : 'no'}.`,
    packet.document.confidenceBreakdown
      ? `Trust breakdown: extraction=${packet.document.confidenceBreakdown.extractionConfidence}%; completeness=${packet.document.confidenceBreakdown.engineeringCompleteness}%; traceability=${packet.document.confidenceBreakdown.traceabilityScore}%; corroboration=${packet.document.confidenceBreakdown.corroborationScore}%; readiness=${packet.document.confidenceBreakdown.readinessScore}%.`
      : null,
    `Traceability: source pages ${pageList(packet.traceability.sourcePages)}; native=${pageList(packet.traceability.nativeTextPages)}; layout/OCR=${pageList(packet.traceability.layoutOcrPages)}; visual=${pageList(packet.traceability.directVisualPages)}; parameter source-page rate=${Math.round(packet.traceability.parameterTraceabilityRate * 100)}%.`,
    `Review gates: ${packet.providerContract.reviewGates.join('; ') || 'none'}.`,
    `Borehole summary: ${packet.traceability.boreholeIds.join(', ') || 'not detected'}; max depth=${packet.traceability.maxDepthMeters != null ? `${packet.traceability.maxDepthMeters} m` : 'not extracted'}.`,
    '',
    'Ordered whole-report outline by source page:',
    outlineChunks.join('\n') || 'No ordered outline retained.',
    '',
    'Borehole continuity evidence:',
    boreholeLines.join('\n') || 'No borehole-specific continuity evidence detected.',
    '',
    'Engineering parameters:',
    parameters.join('\n') || 'None extracted.',
    '',
    'Material observations:',
    materials.join('\n') || 'None extracted.',
    '',
    'Classifications:',
    classifications.join('\n') || 'None extracted.',
    '',
    'Risks extracted from page evidence:',
    packet.engineeringSignals.risks.slice(0, 16).map((risk) => `- ${compactText(risk, 220)}`).join('\n') || 'None extracted.',
    '',
    'Recommendations extracted from page evidence:',
    packet.engineeringSignals.recommendations.slice(0, 16).map((recommendation) => `- ${compactText(recommendation, 220)}`).join('\n') || 'None extracted.',
    '',
    'Missing or review-gated parameters:',
    [...missingParameters.slice(0, 16), ...reviewParameters.slice(0, 16)].join('\n') || 'None flagged.',
    '',
    'High-signal source chunks:',
    highSignalChunks.join('\n') || 'No high-signal chunks retained.',
    '',
    'Page-level method and audit summary:',
    pageLines.join('\n') || 'No page audit retained.',
    '',
    'Warnings and review findings:',
    [
      ...packet.review.warnings.slice(0, 12).map((warning) => `Warning: ${compactText(warning, 220)}`),
      ...packet.review.findings.slice(0, 12).map((finding) =>
        `${finding.severity.toUpperCase()} ${finding.code}${finding.pageNumber ? ` page ${finding.pageNumber}` : ''}: ${compactText(finding.message, 220)}`,
      ),
    ].join('\n') || 'None.',
  ].filter((line): line is string => typeof line === 'string').join('\n'), maxEvidenceChars);

  const prompt = `Create a concise engineering synthesis from the provider-neutral geotechnical document evidence packet below. Respond with ONLY a JSON object:
{
  "takeaways": ["<report-level engineering takeaway with source-page wording where possible>"],
  "groundModel": ["<depth-bounded soil/rock/groundwater model statement with source pages if known>"],
  "keyParameters": ["<parameter, value, unit, material/context, source page if known>"],
  "interpretation": ["<construction/design interpretation supported by extracted evidence>"],
  "limitations": ["<uncertainty, missing evidence, OCR/layout/visual limitations>"],
  "sourcePages": [<page numbers that support the synthesis>]
}

Instructions:
- Read the ordered whole-report outline first before summarizing individual extraction rows.
- Preserve borehole-log continuity when a borehole spans multiple pages; group depth intervals, lithology, SPT/RQD/recovery, groundwater, and source pages by borehole where evidence supports it.
- Cite source pages from the packet in every specific engineering claim where possible.
- Do not invent values, strata boundaries, groundwater, SPT, RQD, strength, density, or design parameters.
- Do not let synthesis raise extraction confidence. Confidence comes only from source evidence coverage and corroboration.
- Treat direct-visual-only, missing, needs-review, and uncertain values as review-gated evidence.
- Prefer explicit soil and rock mechanics parameters, groundwater observations, classification systems, and foundation/geohazard/construction implications.

Evidence:
${evidence}`;

  return {
    systemPrompt: 'You are a senior geotechnical engineer synthesizing provider-neutral document evidence into a review brief. Use cautious, evidence-bound language, cite source pages, preserve missing-data limitations, and respond with JSON only.',
    prompt,
    evidence,
    hasEngineeringSignal: documentEvidencePacketHasEngineeringSignal(packet),
    sourcePages: packet.traceability.sourcePages,
    reviewGates: packet.providerContract.reviewGates,
    schemaVersion: packet.schemaVersion,
  };
}

export function summarizeDocumentEvidencePacketForAgent(
  packet: DocumentEvidencePacket,
  options: SummarizeDocumentEvidencePacketForAgentOptions = {},
): string {
  const maxObservationsPerGroup = options.maxObservationsPerGroup ?? 8;
  const maxReviewGates = options.maxReviewGates ?? 8;
  const maxContentChars = options.maxContentChars ?? 2400;
  const pageOutcomes = countPageOutcomes(packet);
  const methods = Object.entries(packet.traceability.methodCounts)
    .filter(([, count]) => count > 0)
    .map(([method, count]) => `${method}:${count}`)
    .join(', ') || 'none';
  const reviewGates = packet.providerContract.reviewGates.slice(0, maxReviewGates);
  const missingParameters = packet.observations.parameters
    .filter((parameter) => parameter.reviewStatus === 'missing')
    .slice(0, maxObservationsPerGroup)
    .map((parameter) => parameter.label);
  const reviewParameters = packet.observations.parameters
    .filter((parameter) => parameter.reviewStatus === 'needs_review' || parameter.reviewStatus === 'uncertain')
    .slice(0, maxObservationsPerGroup)
    .map((parameter) => `${parameter.label}${parameter.context ? ` (${parameter.context})` : ''}`);
  const verifiedParameters = packet.observations.parameters
    .filter((parameter) => parameter.reviewStatus === 'verified')
    .slice(0, maxObservationsPerGroup)
    .map((parameter) => formatObservationForAgent(parameter));
  const materials = packet.observations.materials
    .slice(0, maxObservationsPerGroup)
    .map((material) => formatObservationForAgent(material));
  const classifications = packet.observations.classifications
    .slice(0, maxObservationsPerGroup)
    .map((classification) => formatObservationForAgent(classification));
  const synthesis = [
    ...(packet.synthesis?.takeaways.slice(0, 4) ?? []),
    ...(packet.synthesis?.groundModel.slice(0, 4) ?? []),
    ...(packet.synthesis?.interpretation.slice(0, 3) ?? []),
    ...(packet.synthesis?.limitations.slice(0, 3) ?? []),
  ];

  return compactText([
    `DocumentEvidencePacket v${packet.schemaVersion} provider-neutral agent context.`,
    `Source: ${packet.source.fileName ?? packet.source.filePath ?? packet.source.inputKind}; pages ${packet.source.successfulPages}/${packet.source.totalPages}; evidence pages ${pageList(packet.traceability.pagesWithEvidence)}.`,
    `Document: ${packet.document.title ?? 'untitled'}; class ${packet.document.documentClass ?? 'unknown'}; status ${packet.document.parseStatus}; confidence ${packet.document.confidence}%; reviewRequired ${packet.document.reviewRequired ? 'yes' : 'no'}; canAutoProceed ${packet.document.canAutoProceed ? 'yes' : 'no'}.`,
    packet.document.confidenceBreakdown
      ? `Trust breakdown: extraction ${packet.document.confidenceBreakdown.extractionConfidence}%, completeness ${packet.document.confidenceBreakdown.engineeringCompleteness}%, traceability ${packet.document.confidenceBreakdown.traceabilityScore}%, corroboration ${packet.document.confidenceBreakdown.corroborationScore}%, readiness ${packet.document.confidenceBreakdown.readinessScore}%.`
      : null,
    `Methods: ${methods}; native pages ${pageList(packet.traceability.nativeTextPages)}; layout/OCR pages ${pageList(packet.traceability.layoutOcrPages)}; direct visual pages ${pageList(packet.traceability.directVisualPages)}.`,
    `Page outcomes: parsed ${pageOutcomes.parsed}, partial ${pageOutcomes.partial}, failed ${pageOutcomes.failed}.`,
    `Traceability: source pages ${pageList(packet.traceability.sourcePages)}; parameter source-page rate ${Math.round(packet.traceability.parameterTraceabilityRate * 100)}%; with source ${packet.traceability.parametersWithSourcePage}, without source ${packet.traceability.parametersWithoutSourcePage}.`,
    `Boreholes: ${packet.traceability.boreholeIds.join(', ') || 'not detected'}; max depth ${packet.traceability.maxDepthMeters != null ? `${packet.traceability.maxDepthMeters} m` : 'not extracted'}.`,
    reviewGates.length > 0 ? `Review gates: ${reviewGates.join('; ')}.` : 'Review gates: none.',
    missingParameters.length > 0 ? `Missing parameters: ${missingParameters.join('; ')}.` : 'Missing parameters: none flagged in packet.',
    reviewParameters.length > 0 ? `Parameters needing review: ${reviewParameters.join('; ')}.` : '',
    verifiedParameters.length > 0 ? `Verified parameters: ${verifiedParameters.join('; ')}.` : '',
    materials.length > 0 ? `Materials: ${materials.join('; ')}.` : '',
    classifications.length > 0 ? `Classifications: ${classifications.join('; ')}.` : '',
    synthesis.length > 0 ? `Synthesis evidence: ${synthesis.map((item) => compactText(item, 180)).join(' | ')}.` : '',
    packet.engineeringSignals.risks.length > 0 ? `Risks: ${packet.engineeringSignals.risks.slice(0, 5).map((item) => compactText(item, 140)).join('; ')}.` : '',
    packet.engineeringSignals.recommendations.length > 0 ? `Recommendations: ${packet.engineeringSignals.recommendations.slice(0, 5).map((item) => compactText(item, 140)).join('; ')}.` : '',
    packet.review.warnings.length > 0 ? `Warnings: ${packet.review.warnings.slice(0, 6).join('; ')}.` : '',
    'Agent rule: cite source pages from this packet; do not run deterministic calculations from missing, direct-visual-only, or needs-review evidence without explicit review/approval.',
  ].filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n'), maxContentChars);
}

export function summarizeGeotechDocumentResultForAgent(
  result: GeotechDocumentIngestResult,
  options: SummarizeDocumentEvidencePacketForAgentOptions = {},
): string {
  return summarizeDocumentEvidencePacketForAgent(
    result.evidencePacket ?? buildDocumentEvidencePacket(result),
    options,
  );
}

function buildEvidencePage(audit: GeotechDocumentPageAudit): DocumentEvidencePacket['pages'][number] {
  const cache = audit.evidenceCache;
  return {
    pageNumber: audit.pageNumber,
    classification: audit.classification,
    parseStatus: audit.parseStatus,
    confidence: normalizeConfidence(audit.confidence),
    method: methodFromTextHintSource(audit.textHintSource),
    rawSource: audit.textHintSource,
    sourceCategory: sourceCategoryFromTextHintSource(audit.textHintSource),
    cacheStatus: cache?.status ?? 'unavailable',
    ...(cache?.entryId ? { cacheEntryId: cache.entryId } : {}),
    counts: {
      materials: audit.materialCount,
      classifications: audit.classificationCount,
      parameters: audit.parameterCount,
    },
    warnings: audit.warnings,
  };
}

function countPageOutcomes(packet: DocumentEvidencePacket): Record<'parsed' | 'partial' | 'failed', number> {
  return packet.pages.reduce<Record<'parsed' | 'partial' | 'failed', number>>(
    (counts, page) => {
      counts[page.parseStatus] += 1;
      return counts;
    },
    { parsed: 0, partial: 0, failed: 0 },
  );
}

function pageList(pages: number[]): string {
  return pages.length > 0 ? pages.join(', ') : 'none';
}

function formatObservationForAgent(
  observation: DocumentEvidencePacket['observations']['parameters'][number],
): string {
  const value = observation.unit ? `${String(observation.value)} ${observation.unit}` : String(observation.value);
  const pageSuffix = observation.sourcePages.length > 0 ? ` p${observation.sourcePages.join(',')}` : ' no-source-page';
  const confidenceSuffix = observation.confidence > 0 ? ` ${observation.confidence}%` : '';
  return `${observation.label}=${value}${observation.material ? ` ${observation.material}` : ''}${pageSuffix}${confidenceSuffix}`;
}

function formatObservationForSynthesis(
  observation: DocumentEvidencePacket['observations']['parameters'][number],
): string {
  const value = observation.unit && String(observation.value).trim() && String(observation.value).trim() !== observation.unit
    ? `${String(observation.value)} ${observation.unit}`
    : String(observation.value);
  return [
    observation.label,
    `value=${value}`,
    observation.material ? `material=${observation.material}` : null,
    observation.context ? `context=${compactText(observation.context, 180)}` : null,
    `pages=${pageList(observation.sourcePages)}`,
    `method=${observation.method}`,
    `confidence=${observation.confidence}%`,
    `review=${observation.reviewStatus}`,
    observation.warnings.length > 0 ? `warnings=${observation.warnings.slice(0, 3).join(' | ')}` : null,
  ].filter(Boolean).join(' | ');
}

function formatContentChunkForSynthesis(
  chunk: DocumentEvidencePacket['contentChunks'][number],
  maxTextLength: number,
): string {
  return [
    `Pages ${chunk.pageRange[0]}-${chunk.pageRange[1]}`,
    chunk.sectionType ?? 'general',
    chunk.scope,
    chunk.headingAncestry.length > 0 ? compactText(chunk.headingAncestry.join(' > '), 110) : 'untitled',
    `sources=${pageList(chunk.sourcePages)}`,
    compactText(chunk.text, maxTextLength),
  ].join(' | ');
}

function buildBoreholeContinuityLines(packet: DocumentEvidencePacket): string[] {
  const observations = [
    ...packet.observations.parameters,
    ...packet.observations.materials,
    ...packet.observations.classifications,
  ];
  return packet.traceability.boreholeIds.slice(0, 20).map((id) => {
    const pattern = new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^BH/i, 'B\\.?H\\.?\\s*')}(?:\\b|\\s|[-#:])`, 'i');
    const matchingObservations = observations
      .filter((observation) =>
        pattern.test([
          observation.label,
          String(observation.value),
          observation.material,
          observation.context,
        ].filter(Boolean).join(' ')),
      )
      .slice(0, 12)
      .map((observation) => `${observation.label}=${String(observation.value)} pages=${pageList(observation.sourcePages)} review=${observation.reviewStatus}`);
    const matchingChunks = packet.contentChunks
      .filter((chunk) => pattern.test(`${chunk.headingAncestry.join(' ')} ${chunk.text}`))
      .slice(0, 4)
      .map((chunk) => `pages ${chunk.pageRange[0]}-${chunk.pageRange[1]}: ${compactText(chunk.text, 180)}`);
    return `${id}: ${[...matchingObservations, ...matchingChunks].join('; ') || 'borehole identifier detected, but no compact interval evidence retained.'}`;
  });
}

function buildTraceability(
  result: GeotechDocumentIngestResult,
  pages: DocumentEvidencePacket['pages'],
): DocumentEvidencePacket['traceability'] {
  const parameterSourcePages = result.parameters.map((parameter) =>
    sourcePagesFromObservation(parameter.sourcePages, parameter.context),
  );
  const parametersWithSourcePage = parameterSourcePages.filter((pagesForParameter) => pagesForParameter.length > 0).length;
  const sourcePages = normalizePages([
    ...parameterSourcePages.flat(),
    ...result.materials.flatMap((material) => sourcePagesFromObservation(material.sourcePages, material.description)),
    ...result.classifications.flatMap((classification) => sourcePagesFromObservation(classification.sourcePages, classification.context)),
    ...(result.synthesis?.sourcePages ?? []),
    ...(result.contentChunks ?? []).flatMap((chunk) => chunk.sourcePages),
  ]);
  const pagesWithEvidence = pages
    .filter((page) => page.counts.materials + page.counts.classifications + page.counts.parameters > 0)
    .map((page) => page.pageNumber);
  const methodCounts = countMethods(pages);
  const evidenceText = collectEvidenceText(result);

  return {
    sourcePages,
    pagesWithEvidence: normalizePages(pagesWithEvidence),
    directVisualPages: normalizePages(pages.filter((page) => page.rawSource === 'vision-visual').map((page) => page.pageNumber)),
    layoutOcrPages: normalizePages(pages.filter((page) => page.sourceCategory === 'layout-ocr').map((page) => page.pageNumber)),
    nativeTextPages: normalizePages(pages.filter((page) => page.sourceCategory === 'native-text').map((page) => page.pageNumber)),
    boreholeIds: inferBoreholeIds(evidenceText),
    maxDepthMeters: inferMaxDepthMeters(evidenceText),
    parametersWithSourcePage,
    parametersWithoutSourcePage: Math.max(0, result.parameters.length - parametersWithSourcePage),
    parameterTraceabilityRate: result.parameters.length > 0
      ? roundRatio(parametersWithSourcePage / result.parameters.length)
      : 0,
    methodCounts,
  };
}

function compactContentChunk(chunk: GeotechDocumentContentChunk): DocumentEvidencePacket['contentChunks'][number] {
  return {
    chunkId: chunk.chunkId,
    pageRange: chunk.pageRange,
    headingAncestry: chunk.headingAncestry,
    scope: chunk.scope,
    ...(chunk.sectionType ? { sectionType: chunk.sectionType } : {}),
    ...(Number.isFinite(chunk.significance) ? { significance: chunk.significance } : {}),
    sourcePages: normalizePages(chunk.sourcePages),
    text: compactText(chunk.text, 1200),
  };
}

function compactReviewFinding(finding: GeotechDocumentFinding): DocumentEvidencePacket['review']['findings'][number] {
  return {
    code: finding.code,
    severity: finding.severity,
    scope: finding.scope,
    message: finding.message,
    ...(finding.pageNumber != null ? { pageNumber: finding.pageNumber } : {}),
    ...(finding.materialDescription ? { materialDescription: finding.materialDescription } : {}),
  };
}

function methodFromTextHintSource(source: DocumentTextHintSource): DocumentEvidenceMethod {
  if (source === 'native-text' || source === 'pdfjs-text') {
    return 'native-pdf-text';
  }
  if (source === 'glm-ocr' || source === 'local-ocr') {
    return 'layout-ocr';
  }
  if (source === 'vision-ocr' || source === 'vision-visual') {
    return 'visual-reasoning';
  }
  return 'none';
}

function sourceCategoryFromTextHintSource(source: DocumentTextHintSource): DocumentEvidencePacket['pages'][number]['sourceCategory'] {
  if (source === 'native-text' || source === 'pdfjs-text') {
    return 'native-text';
  }
  if (source === 'glm-ocr' || source === 'local-ocr') {
    return 'layout-ocr';
  }
  if (source === 'vision-ocr' || source === 'vision-visual') {
    return 'vision';
  }
  return 'none';
}

function methodForSourcePages(
  sourcePages: number[],
  pages: DocumentEvidencePacket['pages'],
): DocumentEvidenceMethod {
  const methods = new Set(
    pages
      .filter((page) => sourcePages.includes(page.pageNumber))
      .map((page) => page.method)
      .filter((method) => method !== 'none'),
  );
  if (methods.size > 1) {
    return 'hybrid';
  }
  return [...methods][0] ?? 'none';
}

function confidenceForSourcePages(
  sourcePages: number[],
  pages: DocumentEvidencePacket['pages'],
  fallback: number,
): number {
  const matching = pages
    .filter((page) => sourcePages.includes(page.pageNumber) && Number.isFinite(page.confidence))
    .map((page) => page.confidence);
  if (matching.length === 0) {
    return normalizeConfidence(fallback);
  }
  return normalizeConfidence(matching.reduce((sum, value) => sum + value, 0) / matching.length);
}

function countMethods(pages: DocumentEvidencePacket['pages']): Record<string, number> {
  const counts: Record<string, number> = {
    'native-pdf-text': 0,
    'layout-ocr': 0,
    'visual-reasoning': 0,
    hybrid: 0,
    none: 0,
  };
  for (const page of pages) {
    counts[page.method] = (counts[page.method] ?? 0) + 1;
  }
  return counts;
}

function buildReviewGates(result: GeotechDocumentIngestResult): string[] {
  return [
    result.reviewRequired ? 'human-review-required' : null,
    result.pageFailures.length > 0 ? 'page-failures-present' : null,
    result.pageAudits.some((audit) => audit.parseStatus === 'partial') ? 'partial-pages-present' : null,
    result.pageAudits.some((audit) => audit.textHintSource === 'vision-visual') ? 'direct-visual-verification-required' : null,
    result.parameters.some((parameter) => isMissingValue(parameter.valueText, parameter.numericValue)) ? 'missing-parameters-present' : null,
  ].filter((value): value is string => value != null);
}

function sourcePagesFromObservation(
  sourcePages: number[] | null | undefined,
  context: string | null | undefined,
): number[] {
  return normalizePages([
    ...(sourcePages ?? []),
    ...extractPageNumbers(context),
  ]);
}

function extractPageNumbers(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }
  return normalizePages(
    [...value.matchAll(/\b(?:page|p\.?)\s*#?\s*(\d{1,4})\b/gi)]
      .map((match) => Number(match[1])),
  );
}

function normalizePages(values: Array<number | null | undefined>): number[] {
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )].sort((left, right) => left - right);
}

function isMissingValue(valueText: string | null | undefined, numericValue: number | null | undefined): boolean {
  if (numericValue != null && Number.isFinite(numericValue)) {
    return false;
  }
  const value = String(valueText ?? '').trim();
  return !value || /^(?:-|--|—|n\/?a|nil|none|not\s+(?:reported|extracted|encountered|available)|unavailable|missing)$/i.test(value);
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function roundRatio(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .map((value) => compactText(value, 500))
      .filter((value) => value.length > 0),
  )];
}

function observationId(type: string, index: number, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'item';
  return `${type}-${index + 1}-${slug}`;
}

function compactText(value: string | null | undefined, maxLength: number): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized;
}

function collectEvidenceText(result: GeotechDocumentIngestResult): string {
  return [
    result.title,
    result.summary,
    ...result.materials.flatMap((material) => [material.description, material.uscsSymbol, material.lithology]),
    ...result.parameters.flatMap((parameter) => [parameter.name, parameter.valueText, parameter.material, parameter.context]),
    ...result.classifications.flatMap((classification) => [classification.system, classification.value, classification.context]),
    ...result.risks,
    ...result.recommendations,
    ...(result.contentChunks ?? []).flatMap((chunk) => [...chunk.headingAncestry, chunk.text]),
    ...(result.synthesis
      ? [
          ...result.synthesis.takeaways,
          ...result.synthesis.groundModel,
          ...result.synthesis.keyParameters,
          ...result.synthesis.interpretation,
          ...result.synthesis.limitations,
        ]
      : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n');
}

function inferBoreholeIds(text: string): string[] {
  const patterns = [
    /\bB\.?\s*H\.?\s*(?:NO\.?)?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
    /\bBORE\s*HOLE\s*NO\.?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
    /\bBOREHOLE\s*NO\.?\s*[:#-]?\s*0*(\d{1,3})\b/gi,
  ];
  return [...new Set(
    patterns.flatMap((pattern) =>
      [...text.matchAll(pattern)]
        .map((match) => `BH${match[1]}`)
        .filter((id) => !/^BH0$/.test(id)),
    ),
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function inferMaxDepthMeters(text: string): number | null {
  const depths = [
    ...[...text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*m\b/gi)].map((match) => Number(match[1])),
    ...[...text.matchAll(/\b(?:maximum\s+depth|termination|terminated)\b[^0-9]{0,60}(\d{1,3}(?:\.\d+)?)\b/gi)].map((match) => Number(match[1])),
  ].filter((depth) => Number.isFinite(depth) && depth > 0 && depth <= 120);
  return depths.length > 0 ? Math.max(...depths) : null;
}

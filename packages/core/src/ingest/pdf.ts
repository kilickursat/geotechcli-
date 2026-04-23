import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  encodeRawRasterToPng,
  preprocessVisionImageBuffer,
  renderPdfPageToImageBuffer,
} from '../vision/preprocess.js';

export type PdfPageClassification =
  | 'digital-text'
  | 'mixed'
  | 'image-only'
  | 'graphics-only'
  | 'text-unreadable'
  | 'empty'
  | 'unknown';

export type PdfCapabilityAvailability = 'available' | 'partial' | 'unavailable';

export interface PdfInspectionCapabilities {
  nativeTextExtraction: PdfCapabilityAvailability;
  pageRendering: PdfCapabilityAvailability;
  ocr: 'unavailable';
}

export interface PdfDegradationState {
  level: 'none' | 'partial' | 'full';
  notes: string[];
}

export interface PdfPageInspectionMetadata {
  objectRef: string;
  width: number | null;
  height: number | null;
  rotation: number;
  characterCount: number;
  wordCount: number;
  lineCount: number;
  contentStreamCount: number;
  decodedContentStreamCount: number;
  undecodedContentStreamCount: number;
  contentFilters: string[];
  fontNames: string[];
  hasTextOperators: boolean;
  hasRasterImages: boolean;
  hasVectorGraphics: boolean;
}

export interface PdfTextQualityAssessment {
  accepted: boolean;
  score: number;
  printableRatio: number;
  replacementRatio: number;
  symbolNoiseRatio: number;
  suspiciousTokenRatio: number;
  dictionaryCoverageRatio: number;
  averageTokenShapeScore: number;
  reasons: string[];
}

export interface PdfPageNormalizedArtifact {
  pageNumber: number;
  classification: PdfPageClassification;
  rotation: number;
  nativeText: string | null;
  textQuality: PdfTextQualityAssessment;
  textSource: 'native-text' | 'native-text-low-quality' | 'none';
  renderedImageAvailable: boolean;
  headingHints: string[];
  tablesDetected: boolean;
  figuresDetected: boolean;
  warnings: string[];
  confidence: number;
}

export interface PdfPageInspection {
  pageNumber: number;
  totalPages: number;
  classification: PdfPageClassification;
  extractedText: string;
  normalizedText: string;
  normalizedArtifact: PdfPageNormalizedArtifact;
  gracefulDegradationNotes: string[];
  degradation: PdfDegradationState;
  capabilities: PdfInspectionCapabilities;
  metadata: PdfPageInspectionMetadata;
  warnings: string[];
}

export interface PdfDocumentMetadata {
  parser: 'lightweight-page-inspector';
  byteLength: number;
  pdfVersion: string | null;
  isEncrypted: boolean;
  objectCount: number;
}

export interface PdfDocumentInspection {
  kind: 'pdf-document-inspection';
  totalPages: number;
  pages: PdfPageInspection[];
  capabilities: PdfInspectionCapabilities;
  degradation: PdfDegradationState;
  gracefulDegradationNotes: string[];
  metadata: PdfDocumentMetadata;
  warnings: string[];
}

export interface PdfPageRasterImage {
  pageNumber: number;
  totalPages: number;
  objectRef: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  byteLength: number;
  source: 'xobject-image' | 'page-render';
  warnings: string[];
  data: Uint8Array;
}

interface PdfRef {
  objectNumber: number;
  generationNumber: number;
}

interface ParsedPdfObject {
  ref: PdfRef;
  body: string;
  dictionarySource: string | null;
  dictionaryEntries: Map<string, string>;
  streamSpec: PdfObjectStreamSpec | null;
}

interface PdfObjectStreamSpec {
  startOffset: number;
  fallbackEndOffset: number;
  lengthRaw: string | undefined;
}

interface DecodedStream {
  filters: string[];
  content: string;
  warning: string | null;
}

interface ContentAnalysis {
  extractedText: string;
  normalizedText: string;
  hasTextOperators: boolean;
  hasVectorGraphics: boolean;
  hasInlineImages: boolean;
  paintedXObjectNames: string[];
}

interface PageAssembly {
  pageObject: ParsedPdfObject;
  width: number | null;
  height: number | null;
  rotation: number;
  fontNames: string[];
  imageXObjectNames: Set<string>;
  imageXObjects: PdfPageImageXObject[];
}

interface PdfToken {
  kind: 'literal-string' | 'hex-string' | 'array' | 'name' | 'operator' | 'other';
  raw: string;
  decodedText?: string;
}

interface PdfPageImageXObject {
  alias: string;
  ref: PdfRef;
  object: ParsedPdfObject;
  width: number | null;
  height: number | null;
  bitsPerComponent: number | null;
  colorSpace: string | null;
  filters: string[];
}

const DICTIONARY_START = '<<';
const DICTIONARY_END = '>>';

const VECTOR_GRAPHICS_OPERATORS = new Set([
  'm', 'l', 'c', 'v', 'y', 'h', 're',
  'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*',
  'W', 'W*', 'n', 'sh',
]);

const CONTENT_STREAM_OPERATORS = new Set([
  'BT', 'ET', 'Tf', 'Tm', 'Td', 'TD', 'T*', 'Tc', 'Tw', 'Tz', 'TL', 'Tr', 'Ts',
  'Tj', 'TJ', '\'', '"',
  'Do',
  'm', 'l', 'c', 'v', 'y', 'h', 're',
  'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*',
  'W', 'W*', 'n', 'q', 'Q', 'cm', 'rg', 'RG', 'g', 'G',
]);

const TEXT_QUALITY_DICTIONARY = new Set([
  'and', 'at', 'borehole', 'classification', 'clay', 'cohesion', 'content',
  'depth', 'description', 'easting', 'elevation', 'engineering', 'fill',
  'foundation', 'friction', 'geology', 'geotechnical', 'ground', 'groundwater',
  'investigation', 'layer', 'limit', 'lithology', 'moisture', 'northing',
  'parameter', 'permeability', 'plasticity', 'report', 'rock', 'sample',
  'sand', 'silt', 'soil', 'spt', 'strength', 'table', 'test', 'unit',
  'water', 'weight',
]);

export function inspectPdfDocument(input: string | Uint8Array): PdfDocumentInspection {
  const buffer = typeof input === 'string'
    ? readFileSync(resolve(input))
    : Buffer.from(input);

  const metadata: PdfDocumentMetadata = {
    parser: 'lightweight-page-inspector',
    byteLength: buffer.byteLength,
    pdfVersion: readPdfVersion(buffer),
    isEncrypted: hasPdfEncryptMarker(buffer),
    objectCount: 0,
  };

  const warnings: string[] = [];
  if (metadata.isEncrypted) {
    warnings.push('Encrypted PDF markers were detected. This MVP parser does not support decryption.');
  }

  const objects = parsePdfObjects(buffer);
  metadata.objectCount = objects.size;

  const pageObjects = collectPageObjects(objects);
  const totalPages = pageObjects.length;

  const pages = pageObjects.map((pageObject, index) =>
    inspectPage(pageObject, index + 1, totalPages, buffer, objects),
  );

  for (const page of pages) {
    warnings.push(...page.warnings);
  }

  const capabilities = summarizeDocumentCapabilities(pages);
  const degradation = summarizeDocumentDegradation(pages, warnings, metadata.isEncrypted);

  return {
    kind: 'pdf-document-inspection',
    totalPages,
    pages,
    capabilities,
    degradation,
    gracefulDegradationNotes: degradation.notes,
    metadata,
    warnings: uniqueStrings(warnings),
  };
}

export async function extractPrimaryPdfPageImages(input: string | Uint8Array): Promise<PdfPageRasterImage[]> {
  const buffer = typeof input === 'string'
    ? readFileSync(resolve(input))
    : Buffer.from(input);
  const objects = parsePdfObjects(buffer);
  const pageObjects = collectPageObjects(objects);
  const totalPages = pageObjects.length;
  const images: PdfPageRasterImage[] = [];

  for (const [index, pageObject] of pageObjects.entries()) {
    const pageImage = await extractPrimaryPageImage(
      pageObject,
      index + 1,
      totalPages,
      buffer,
      objects,
    );
    if (pageImage) {
      images.push(pageImage);
    }
  }

  return images;
}

export async function renderPdfPageImage(
  input: string | Uint8Array,
  pageNumber: number,
  options?: {
    scale?: number;
  },
): Promise<PdfPageRasterImage | null> {
  const buffer = typeof input === 'string'
    ? readFileSync(resolve(input))
    : Buffer.from(input);
  const renderedPage = await renderPdfPageToImageBuffer(buffer, pageNumber, {
    scale: options?.scale,
    preprocessPolicy: 'ocr-optimized',
  });

  if (!renderedPage) {
    return null;
  }

  return {
    pageNumber,
    totalPages: inspectPdfDocument(buffer).totalPages,
    objectRef: `page:${pageNumber}`,
    mimeType: renderedPage.mimeType,
    width: renderedPage.width,
    height: renderedPage.height,
    byteLength: renderedPage.buffer.length,
    source: 'page-render',
    warnings: renderedPage.warnings,
    data: renderedPage.buffer,
  };
}

function inspectPage(
  pageObject: ParsedPdfObject,
  pageNumber: number,
  totalPages: number,
  buffer: Buffer,
  objects: Map<string, ParsedPdfObject>,
): PdfPageInspection {
  const pageAssembly = assemblePage(pageObject, objects);
  const contentStreamRefs = parseSingleOrArrayRefs(pageObject.dictionaryEntries.get('Contents'));

  const warnings: string[] = [];
  const decodedAnalyses: ContentAnalysis[] = [];
  const allFilters: string[] = [];
  let decodedContentStreamCount = 0;

  for (const ref of contentStreamRefs) {
    const object = objects.get(pdfRefKey(ref));
    if (!object || !object.streamSpec) {
      warnings.push(`Content stream ${pdfRefLabel(ref)} could not be resolved.`);
      continue;
    }

    const decoded = decodeObjectStream(object, objects, buffer);
    allFilters.push(...decoded.filters);

    if (decoded.warning) {
      warnings.push(decoded.warning);
      continue;
    }

    decodedContentStreamCount += 1;
    decodedAnalyses.push(analyzeContentStream(decoded.content));
  }

  const extractedText = decodedAnalyses
    .map((analysis) => analysis.extractedText)
    .filter((value) => value.length > 0)
    .join('\n')
    .trim();
  const normalizedText = normalizeExtractedText(extractedText);
  const textQuality = assessPdfTextQuality(normalizedText);
  const hasTextOperators = decodedAnalyses.some((analysis) => analysis.hasTextOperators);
  const hasVectorGraphics = decodedAnalyses.some((analysis) => analysis.hasVectorGraphics);
  const paintedXObjects = new Set<string>();
  let hasInlineImages = false;

  for (const analysis of decodedAnalyses) {
    hasInlineImages ||= analysis.hasInlineImages;
    for (const name of analysis.paintedXObjectNames) {
      paintedXObjects.add(name);
    }
  }

  const paintedRasterImages = [...paintedXObjects].some((name) => pageAssembly.imageXObjectNames.has(name));
  const hasRasterImages = hasInlineImages || paintedRasterImages;
  const characterCount = normalizedText.length;
  const wordCount = normalizedText.length === 0 ? 0 : normalizedText.split(/\s+/).filter(Boolean).length;
  const lineCount = extractedText.length === 0 ? 0 : extractedText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  const undecodedContentStreamCount = Math.max(contentStreamRefs.length - decodedContentStreamCount, 0);

  const classification = classifyPage({
    normalizedText,
    textQuality,
    hasTextOperators,
    hasRasterImages,
    hasVectorGraphics,
    contentStreamCount: contentStreamRefs.length,
    decodedContentStreamCount,
  });

  const degradationNotes = buildPageDegradationNotes({
    classification,
    normalizedText,
    textQuality,
    hasTextOperators,
    hasRasterImages,
    contentStreamCount: contentStreamRefs.length,
    decodedContentStreamCount,
    warnings,
  });

  const degradation: PdfDegradationState = {
    level: inferDegradationLevel(degradationNotes, textQuality.accepted && normalizedText.length > 0),
    notes: degradationNotes,
  };

  const capabilities: PdfInspectionCapabilities = {
    nativeTextExtraction: inferPageTextCapability({
      normalizedText: textQuality.accepted ? normalizedText : '',
      hasTextOperators,
      contentStreamCount: contentStreamRefs.length,
      decodedContentStreamCount,
    }),
    pageRendering: 'available',
    ocr: 'unavailable',
  };

  const contentHints = extractContentHints(textQuality.accepted ? normalizedText : '');
  const normalizedArtifact: PdfPageNormalizedArtifact = {
    pageNumber,
    classification,
    rotation: pageAssembly.rotation,
    nativeText: textQuality.accepted ? normalizedText : null,
    textQuality,
    textSource:
      normalizedText.length === 0
        ? 'none'
        : textQuality.accepted
          ? 'native-text'
          : 'native-text-low-quality',
    renderedImageAvailable: true,
    headingHints: contentHints.headings,
    tablesDetected: contentHints.tablesDetected,
    figuresDetected: contentHints.figuresDetected,
    warnings: uniqueStrings([
      ...warnings,
      ...textQuality.reasons.map((reason) => `Native text quality: ${reason}`),
    ]),
    confidence: Math.round(textQuality.score * 100),
  };

  return {
    pageNumber,
    totalPages,
    classification,
    extractedText,
    normalizedText,
    normalizedArtifact,
    gracefulDegradationNotes: degradation.notes,
    degradation,
    capabilities,
    metadata: {
      objectRef: pdfRefLabel(pageObject.ref),
      width: pageAssembly.width,
      height: pageAssembly.height,
      rotation: pageAssembly.rotation,
      characterCount,
      wordCount,
      lineCount,
      contentStreamCount: contentStreamRefs.length,
      decodedContentStreamCount,
      undecodedContentStreamCount,
      contentFilters: uniqueStrings(allFilters),
      fontNames: pageAssembly.fontNames,
      hasTextOperators,
      hasRasterImages,
      hasVectorGraphics,
    },
    warnings: uniqueStrings(warnings),
  };
}

function summarizeDocumentCapabilities(pages: PdfPageInspection[]): PdfInspectionCapabilities {
  const pageCapabilities = new Set(pages.map((page) => page.capabilities.nativeTextExtraction));
  let nativeTextExtraction: PdfCapabilityAvailability = 'unavailable';

  if (pageCapabilities.has('available') && pageCapabilities.size === 1) {
    nativeTextExtraction = 'available';
  } else if (pageCapabilities.has('available') || pageCapabilities.has('partial')) {
    nativeTextExtraction = 'partial';
  } else if (pages.length === 0) {
    nativeTextExtraction = 'unavailable';
  }

  return {
    nativeTextExtraction,
    pageRendering: 'available',
    ocr: 'unavailable',
  };
}

function summarizeDocumentDegradation(
  pages: PdfPageInspection[],
  warnings: string[],
  isEncrypted: boolean,
): PdfDegradationState {
  const notes: string[] = [];

  if (isEncrypted) {
    notes.push('Encrypted content is not supported by this lightweight PDF inspector.');
  }

  const pagesRequiringOcr = pages.filter((page) => page.classification === 'image-only');
  if (pagesRequiringOcr.length > 0) {
    notes.push(`${pagesRequiringOcr.length} image-only page(s) should be rerouted through raster/OCR fallback because they do not expose usable native text.`);
  }

  const unreadablePages = pages.filter((page) => page.classification === 'text-unreadable');
  if (unreadablePages.length > 0) {
    notes.push(`${unreadablePages.length} page(s) have unreadable or rejected native text and should use raster/OCR fallback.`);
  }

  if (warnings.some((warning) => warning.includes('Unsupported filter pipeline'))) {
    notes.push('One or more content streams use filters that this MVP parser does not decode.');
  }

  const uniqueNotes = uniqueStrings(notes);
  return {
    level: inferDocumentDegradationLevel(pages, uniqueNotes),
    notes: uniqueNotes,
  };
}

function inferDocumentDegradationLevel(pages: PdfPageInspection[], notes: string[]): PdfDegradationState['level'] {
  if (notes.length === 0) return 'none';
  if (pages.length === 0) return 'full';
  const pagesWithText = pages.filter((page) => page.normalizedArtifact.nativeText?.length).length;
  return pagesWithText > 0 ? 'partial' : 'full';
}

function inferPageTextCapability(input: {
  normalizedText: string;
  hasTextOperators: boolean;
  contentStreamCount: number;
  decodedContentStreamCount: number;
}): PdfCapabilityAvailability {
  if (input.normalizedText.length > 0 && input.decodedContentStreamCount === input.contentStreamCount) {
    return 'available';
  }
  if (input.normalizedText.length > 0 || input.hasTextOperators || input.decodedContentStreamCount > 0) {
    return 'partial';
  }
  return 'unavailable';
}

function buildPageDegradationNotes(input: {
  classification: PdfPageClassification;
  normalizedText: string;
  textQuality: PdfTextQualityAssessment;
  hasTextOperators: boolean;
  hasRasterImages: boolean;
  contentStreamCount: number;
  decodedContentStreamCount: number;
  warnings: string[];
}): string[] {
  const notes: string[] = [];

  if (input.classification === 'image-only' && input.hasRasterImages) {
    notes.push('No usable native text layer was extracted from this page; raster/OCR fallback should be used.');
  }

  if (input.classification === 'text-unreadable' && input.hasTextOperators) {
    notes.push('Text drawing operators were detected, but the lightweight parser could not decode the page text reliably.');
  }

  if (input.normalizedText.length > 0 && !input.textQuality.accepted) {
    notes.push('The native PDF text layer looked degraded or garbled and should be rerouted through OCR or page rendering fallback.');
  }

  if (input.contentStreamCount > input.decodedContentStreamCount) {
    notes.push(`${input.contentStreamCount - input.decodedContentStreamCount} content stream(s) could not be decoded by the lightweight parser.`);
  }

  if (input.classification === 'unknown' && input.contentStreamCount === 0) {
    notes.push('The page does not expose a standard content stream that this MVP parser can inspect.');
  }

  for (const warning of input.warnings) {
    if (warning.includes('Unsupported filter pipeline')) {
      notes.push('The page uses an unsupported content-stream filter pipeline.');
    }
  }

  return uniqueStrings(notes);
}

function inferDegradationLevel(notes: string[], hasExtractedText: boolean): PdfDegradationState['level'] {
  if (notes.length === 0) return 'none';
  return hasExtractedText ? 'partial' : 'full';
}

function classifyPage(input: {
  normalizedText: string;
  textQuality: PdfTextQualityAssessment;
  hasTextOperators: boolean;
  hasRasterImages: boolean;
  hasVectorGraphics: boolean;
  contentStreamCount: number;
  decodedContentStreamCount: number;
}): PdfPageClassification {
  const hasText = input.normalizedText.length > 0 && input.textQuality.accepted;

  if (hasText) {
    return input.hasRasterImages || input.hasVectorGraphics ? 'mixed' : 'digital-text';
  }

  if (input.hasRasterImages) return 'image-only';
  if (input.hasVectorGraphics) return 'graphics-only';
  if (input.hasTextOperators) return 'text-unreadable';
  if (input.contentStreamCount === 0) return 'empty';
  if (input.decodedContentStreamCount === 0) return 'unknown';
  return 'empty';
}

function assemblePage(pageObject: ParsedPdfObject, objects: Map<string, ParsedPdfObject>): PageAssembly {
  const mediaBox = resolveInheritedNumberArray(pageObject, 'MediaBox', objects);
  const width = mediaBox && mediaBox.length >= 4 ? mediaBox[2] - mediaBox[0] : null;
  const height = mediaBox && mediaBox.length >= 4 ? mediaBox[3] - mediaBox[1] : null;
  const rotation = resolveInheritedNumber(pageObject, 'Rotate', objects) ?? 0;
  const resourceEntries = resolveInheritedDictionary(pageObject, 'Resources', objects);
  const fontNames = resourceEntries ? extractFontNames(resourceEntries, objects) : [];
  const imageXObjectNames = resourceEntries ? extractRasterImageXObjectNames(resourceEntries, objects) : new Set<string>();

  return {
    pageObject,
    width,
    height,
    rotation,
    fontNames,
    imageXObjectNames,
    imageXObjects: resourceEntries ? extractRasterImageXObjects(resourceEntries, objects) : [],
  };
}

function extractFontNames(resourceEntries: Map<string, string>, objects: Map<string, ParsedPdfObject>): string[] {
  const fontEntries = resolveDictionaryFromRaw(resourceEntries.get('Font'), objects);
  if (!fontEntries) return [];

  const names: string[] = [];
  for (const [alias, rawValue] of fontEntries.entries()) {
    const resolved = resolveDictionaryFromRaw(rawValue, objects);
    const baseFont = resolved?.get('BaseFont');
    const baseFontName = parsePdfName(baseFont);
    names.push(baseFontName ?? alias);
  }

  return uniqueStrings(names);
}

function extractRasterImageXObjectNames(
  resourceEntries: Map<string, string>,
  objects: Map<string, ParsedPdfObject>,
): Set<string> {
  const names = new Set<string>();
  const xObjectEntries = resolveDictionaryFromRaw(resourceEntries.get('XObject'), objects);
  if (!xObjectEntries) return names;

  for (const [alias, rawValue] of xObjectEntries.entries()) {
    const resolved = resolveDictionaryFromRaw(rawValue, objects);
    const subtype = parsePdfName(resolved?.get('Subtype'));
    if (subtype === 'Image') {
      names.add(alias);
    }
  }

  return names;
}

function extractRasterImageXObjects(
  resourceEntries: Map<string, string>,
  objects: Map<string, ParsedPdfObject>,
): PdfPageImageXObject[] {
  const images: PdfPageImageXObject[] = [];
  const xObjectEntries = resolveDictionaryFromRaw(resourceEntries.get('XObject'), objects);
  if (!xObjectEntries) return images;

  for (const [alias, rawValue] of xObjectEntries.entries()) {
    const ref = parsePdfRef(rawValue);
    if (!ref) continue;

    const object = objects.get(pdfRefKey(ref));
    if (!object) continue;

    const resolved = resolveDictionaryFromRaw(rawValue, objects);
    const subtype = parsePdfName(resolved?.get('Subtype'));
    if (subtype !== 'Image') continue;

    images.push({
      alias,
      ref,
      object,
      width: parseDirectNumber(resolved?.get('Width')) ?? parseDirectNumber(resolved?.get('W')),
      height: parseDirectNumber(resolved?.get('Height')) ?? parseDirectNumber(resolved?.get('H')),
      bitsPerComponent:
        parseDirectNumber(resolved?.get('BitsPerComponent'))
        ?? parseDirectNumber(resolved?.get('BPC')),
      colorSpace: parsePdfName(resolved?.get('ColorSpace')) ?? parseColorSpaceName(resolved?.get('ColorSpace')),
      filters: parseFilterNames(resolved?.get('Filter')),
    });
  }

  return images;
}

async function extractPrimaryPageImage(
  pageObject: ParsedPdfObject,
  pageNumber: number,
  totalPages: number,
  buffer: Buffer,
  objects: Map<string, ParsedPdfObject>,
): Promise<PdfPageRasterImage | null> {
  const pageAssembly = assemblePage(pageObject, objects);
  if (pageAssembly.imageXObjects.length === 0) {
    return null;
  }

  const paintedAliases = collectPaintedXObjectAliases(pageObject, buffer, objects);
  const candidateImages =
    paintedAliases.size > 0
      ? pageAssembly.imageXObjects.filter((image) => paintedAliases.has(image.alias))
      : pageAssembly.imageXObjects;

  const sortedCandidates = [...candidateImages].sort((left, right) => {
    const leftPixels = (left.width ?? 0) * (left.height ?? 0);
    const rightPixels = (right.width ?? 0) * (right.height ?? 0);
    return rightPixels - leftPixels;
  });

  for (const candidate of sortedCandidates) {
    const decoded = await decodeRasterImageObject(candidate, buffer, objects);
    if (!decoded) {
      continue;
    }

    return {
      pageNumber,
      totalPages,
      objectRef: pdfRefLabel(candidate.ref),
      mimeType: decoded.mimeType,
      width: candidate.width,
      height: candidate.height,
      byteLength: decoded.data.length,
      source: 'xobject-image',
      warnings: decoded.warnings,
      data: decoded.data,
    };
  }

  return null;
}

function collectPaintedXObjectAliases(
  pageObject: ParsedPdfObject,
  buffer: Buffer,
  objects: Map<string, ParsedPdfObject>,
): Set<string> {
  const aliases = new Set<string>();
  const contentStreamRefs = parseSingleOrArrayRefs(pageObject.dictionaryEntries.get('Contents'));

  for (const ref of contentStreamRefs) {
    const object = objects.get(pdfRefKey(ref));
    if (!object || !object.streamSpec) {
      continue;
    }

    const decoded = decodeObjectStream(object, objects, buffer);
    if (decoded.warning) {
      continue;
    }

    const analysis = analyzeContentStream(decoded.content);
    for (const name of analysis.paintedXObjectNames) {
      aliases.add(name);
    }
  }

  return aliases;
}

async function decodeRasterImageObject(
  image: PdfPageImageXObject,
  buffer: Buffer,
  objects: Map<string, ParsedPdfObject>,
): Promise<{ mimeType: string; data: Uint8Array; warnings: string[] } | null> {
  if (!image.object.streamSpec) {
    return null;
  }

  const length = resolveStreamLength(image.object.streamSpec.lengthRaw, objects);
  const rawStream = sliceObjectStreamBytes(image.object.streamSpec, length, buffer);
  const filters = image.filters;
  const warnings: string[] = [];

  if (filters.length === 1 && filters[0] === 'DCTDecode') {
    const preprocessed = await preprocessVisionImageBuffer(rawStream, 'image/jpeg');
    warnings.push(...preprocessed.warnings);
    return {
      mimeType: preprocessed.mimeType,
      data: preprocessed.buffer,
      warnings,
    };
  }

  if (filters.length === 1 && filters[0] === 'JPXDecode') {
    const preprocessed = await preprocessVisionImageBuffer(rawStream, 'image/jp2');
    warnings.push(...preprocessed.warnings);
    return {
      mimeType: preprocessed.mimeType,
      data: preprocessed.buffer,
      warnings,
    };
  }

  if (filters.length > 1) {
    warnings.push(`Unsupported image filter pipeline on ${pdfRefLabel(image.ref)}: ${filters.join(', ')}.`);
    return null;
  }

  const rawRaster = filters.length === 1 && filters[0] === 'FlateDecode'
    ? tryInflateRaster(rawStream, image.ref, warnings)
    : filters.length === 0
      ? rawStream
      : null;

  if (!rawRaster) {
    return null;
  }

  const channels = inferColorChannels(image.colorSpace);
  if (!image.width || !image.height || !channels || image.bitsPerComponent !== 8) {
    warnings.push(
      `Unsupported raw image encoding on ${pdfRefLabel(image.ref)}. Width/height/channels/bits-per-component were insufficient for PNG conversion.`,
    );
    return null;
  }

  const expectedBytes = image.width * image.height * channels;
  if (rawRaster.length < expectedBytes) {
    warnings.push(
      `Raw image data on ${pdfRefLabel(image.ref)} was shorter than expected (${rawRaster.length}/${expectedBytes} bytes).`,
    );
    return null;
  }

  try {
    const pngBuffer = await encodeRawRasterToPng(rawRaster.subarray(0, expectedBytes), {
      width: image.width,
      height: image.height,
      channels,
    });
    const preprocessed = await preprocessVisionImageBuffer(pngBuffer, 'image/png');
    warnings.push(...preprocessed.warnings);
    return {
      mimeType: preprocessed.mimeType,
      data: preprocessed.buffer,
      warnings,
    };
  } catch (error) {
    warnings.push(
      `Failed to convert raw image data on ${pdfRefLabel(image.ref)} to PNG: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function tryInflateRaster(rawStream: Buffer, ref: PdfRef, warnings: string[]): Buffer | null {
  try {
    return inflateSync(rawStream);
  } catch {
    warnings.push(`Failed to inflate raster image data for ${pdfRefLabel(ref)}.`);
    return null;
  }
}

function inferColorChannels(colorSpace: string | null): number | null {
  switch (colorSpace) {
    case 'DeviceGray':
      return 1;
    case 'DeviceRGB':
      return 3;
    case 'DeviceCMYK':
      return 4;
    default:
      return null;
  }
}

function resolveInheritedDictionary(
  pageObject: ParsedPdfObject,
  key: string,
  objects: Map<string, ParsedPdfObject>,
): Map<string, string> | null {
  const rawValue = resolveInheritedRawValue(pageObject, key, objects);
  return resolveDictionaryFromRaw(rawValue, objects);
}

function resolveInheritedNumberArray(
  pageObject: ParsedPdfObject,
  key: string,
  objects: Map<string, ParsedPdfObject>,
): number[] | null {
  const rawValue = resolveInheritedRawValue(pageObject, key, objects);
  if (!rawValue) return null;
  return parseNumberArray(rawValue);
}

function resolveInheritedNumber(
  pageObject: ParsedPdfObject,
  key: string,
  objects: Map<string, ParsedPdfObject>,
): number | null {
  const rawValue = resolveInheritedRawValue(pageObject, key, objects);
  if (!rawValue) return null;
  return parseDirectNumber(rawValue);
}

function resolveInheritedRawValue(
  pageObject: ParsedPdfObject,
  key: string,
  objects: Map<string, ParsedPdfObject>,
): string | undefined {
  let current: ParsedPdfObject | undefined = pageObject;

  while (current) {
    const rawValue = current.dictionaryEntries.get(key);
    if (rawValue !== undefined) return rawValue;

    const parentRef = parsePdfRef(current.dictionaryEntries.get('Parent'));
    current = parentRef ? objects.get(pdfRefKey(parentRef)) : undefined;
  }

  return undefined;
}

function decodeObjectStream(
  object: ParsedPdfObject,
  objects: Map<string, ParsedPdfObject>,
  buffer: Buffer,
): DecodedStream {
  if (!object.streamSpec) {
    return {
      filters: [],
      content: '',
      warning: `Object ${pdfRefLabel(object.ref)} does not expose a stream.`,
    };
  }

  const filters = parseFilterNames(object.dictionaryEntries.get('Filter'));
  const length = resolveStreamLength(object.streamSpec.lengthRaw, objects);
  const rawStream = sliceObjectStreamBytes(object.streamSpec, length, buffer);

  let decoded = rawStream;

  if (filters.length > 0) {
    for (const filter of filters) {
      if (filter !== 'FlateDecode') {
        return {
          filters,
          content: '',
          warning: `Unsupported filter pipeline on ${pdfRefLabel(object.ref)}: ${filters.join(', ')}.`,
        };
      }

      try {
        decoded = inflateSync(decoded);
      } catch {
        return {
          filters,
          content: '',
          warning: `Failed to inflate FlateDecode content for ${pdfRefLabel(object.ref)}.`,
        };
      }
    }
  }

  return {
    filters,
    content: decoded.toString('latin1'),
    warning: null,
  };
}

function sliceObjectStreamBytes(
  streamSpec: PdfObjectStreamSpec,
  resolvedLength: number | null,
  buffer: Buffer,
): Buffer {
  if (resolvedLength !== null && resolvedLength >= 0) {
    const endOffset = Math.min(streamSpec.startOffset + resolvedLength, buffer.length);
    return buffer.subarray(streamSpec.startOffset, endOffset);
  }

  let rawStream = buffer.subarray(streamSpec.startOffset, Math.min(streamSpec.fallbackEndOffset, buffer.length));
  while (rawStream.length > 0 && isPdfWhitespace(rawStream[rawStream.length - 1])) {
    rawStream = rawStream.subarray(0, rawStream.length - 1);
  }
  return rawStream;
}

function resolveStreamLength(
  lengthRaw: string | undefined,
  objects: Map<string, ParsedPdfObject>,
): number | null {
  if (!lengthRaw) return null;

  const directNumber = parseDirectNumber(lengthRaw);
  if (directNumber !== null) return directNumber;

  const ref = parsePdfRef(lengthRaw);
  if (!ref) return null;

  const referencedObject = objects.get(pdfRefKey(ref));
  if (!referencedObject) return null;

  return parseDirectNumber(referencedObject.body.trim());
}

function analyzeContentStream(content: string): ContentAnalysis {
  const tokens = tokenizeContentStream(content);
  const operands: PdfToken[] = [];
  const textParts: string[] = [];
  let hasTextOperators = false;
  let hasVectorGraphics = false;
  let hasInlineImages = /\bBI\b[\s\S]*?\bID\b/.test(content);
  const paintedXObjectNames = new Set<string>();
  let nextTextJoinMode: 'space' | 'newline' = 'space';

  for (const token of tokens) {
    if (token.kind !== 'operator') {
      operands.push(token);
      continue;
    }

    const operator = token.raw;

    if (VECTOR_GRAPHICS_OPERATORS.has(operator)) {
      hasVectorGraphics = true;
    }

    if (operator === 'Do') {
      const nameToken = findLastNameOperand(operands);
      if (nameToken) {
        paintedXObjectNames.add(nameToken.raw.slice(1));
      }
    }

    if (operator === 'BT' && textParts.length > 0) {
      nextTextJoinMode = 'newline';
    }

    if (operator === 'Tj') {
      hasTextOperators = true;
      appendTextPart(textParts, decodeTextOperand(operands[operands.length - 1]), nextTextJoinMode);
      nextTextJoinMode = 'space';
    } else if (operator === 'TJ') {
      hasTextOperators = true;
      appendTextPart(textParts, decodeTextArrayOperand(operands[operands.length - 1]), nextTextJoinMode);
      nextTextJoinMode = 'space';
    } else if (operator === '\'') {
      hasTextOperators = true;
      appendTextPart(textParts, decodeTextOperand(operands[operands.length - 1]), 'newline');
      nextTextJoinMode = 'space';
    } else if (operator === '"') {
      hasTextOperators = true;
      appendTextPart(textParts, decodeTextOperand(operands[operands.length - 1]), 'newline');
      nextTextJoinMode = 'space';
    }

    operands.length = 0;
  }

  const extractedText = textParts.join('').trim();
  const normalizedText = normalizeExtractedText(extractedText);

  return {
    extractedText,
    normalizedText,
    hasTextOperators,
    hasVectorGraphics,
    hasInlineImages,
    paintedXObjectNames: [...paintedXObjectNames],
  };
}

function appendTextPart(parts: string[], value: string, joinMode: 'space' | 'newline'): void {
  const normalized = normalizeFragment(value);
  if (normalized.length === 0) return;

  if (parts.length > 0) {
    parts.push(joinMode === 'newline' ? '\n' : ' ');
  }

  parts.push(normalized);
}

function normalizeFragment(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeTextQualityToken(token: string): string {
  return token
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9]+$/, '');
}

function scoreTextTokenShape(token: string): number {
  const normalized = normalizeTextQualityToken(token);
  if (!normalized) return 0;

  if (/^\d+(?:\.\d+)?(?:[-/]\d+(?:\.\d+)?)*(?:m|mm|cm|kpa|mpa|%)?$/i.test(normalized)) {
    return 0.85;
  }

  if (/^[A-Za-z0-9]+(?:[-/.][A-Za-z0-9]+)*$/.test(normalized)) {
    const lettersOnly = normalized.replace(/[^A-Za-z]/g, '');
    if (lettersOnly.length === 0) {
      return 0.75;
    }
    if (lettersOnly.length >= 5 && !/[AEIOUYaeiouy]/.test(lettersOnly) && !/^[A-Z]{2,5}$/.test(lettersOnly)) {
      return 0.2;
    }
    return 1;
  }

  if (/^[().,:;/%-]+$/.test(normalized)) {
    return 0.15;
  }

  return /[A-Za-z0-9]/.test(normalized) ? 0.45 : 0.05;
}

function isSuspiciousTextQualityToken(token: string): boolean {
  const normalized = normalizeTextQualityToken(token);
  if (!normalized) {
    return true;
  }

  if (normalized.includes('\uFFFD')) {
    return true;
  }

  const visibleChars = [...normalized];
  const symbolCount = visibleChars.filter((char) => /[@#$%^&*_~`|<>{}\[\]\\]/.test(char)).length;
  if (visibleChars.length >= 3 && symbolCount >= Math.ceil(visibleChars.length / 2)) {
    return true;
  }

  const lettersOnly = normalized.replace(/[^A-Za-z]/g, '');
  return lettersOnly.length >= 5
    && !/[AEIOUYaeiouy]/.test(lettersOnly)
    && !/^[A-Z]{2,5}$/.test(lettersOnly);
}

export function assessPdfTextQuality(value: string): PdfTextQualityAssessment {
  const normalized = normalizeExtractedText(value);
  if (!normalized) {
    return {
      accepted: false,
      score: 0,
      printableRatio: 0,
      replacementRatio: 0,
      symbolNoiseRatio: 0,
      suspiciousTokenRatio: 0,
      dictionaryCoverageRatio: 0,
      averageTokenShapeScore: 0,
      reasons: ['No native text was extracted from the PDF page.'],
    };
  }

  const visibleChars = [...normalized].filter((char) => !/\s/.test(char));
  const printableCount = visibleChars.filter((char) => !/[\u0000-\u001F\u007F]/.test(char)).length;
  const replacementCount = visibleChars.filter((char) => char === '\uFFFD').length;
  const symbolNoiseCount = visibleChars.filter((char) => /[@#$%^&*_~`|<>{}\[\]\\]/.test(char)).length;
  const mojibakeNoiseCount = visibleChars.filter((char) => /[\uFF61-\uFFEF]/.test(char)).length;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const suspiciousTokenCount = tokens.filter(isSuspiciousTextQualityToken).length;
  const normalizedTokens = tokens.map(normalizeTextQualityToken).filter(Boolean);
  const dictionaryHits = normalizedTokens.filter((token) => TEXT_QUALITY_DICTIONARY.has(token.toLowerCase())).length;
  const averageTokenShapeScore = normalizedTokens.length === 0
    ? 0
    : normalizedTokens.reduce((sum, token) => sum + scoreTextTokenShape(token), 0) / normalizedTokens.length;

  const printableRatio = visibleChars.length === 0 ? 0 : printableCount / visibleChars.length;
  const replacementRatio = visibleChars.length === 0 ? 0 : replacementCount / visibleChars.length;
  const symbolNoiseRatio = visibleChars.length === 0 ? 0 : symbolNoiseCount / visibleChars.length;
  const mojibakeNoiseRatio = visibleChars.length === 0 ? 0 : mojibakeNoiseCount / visibleChars.length;
  const suspiciousTokenRatio = tokens.length === 0 ? 0 : suspiciousTokenCount / tokens.length;
  const dictionaryCoverageRatio = normalizedTokens.length === 0 ? 0 : dictionaryHits / normalizedTokens.length;
  const lacksRecognizableWordsOnLongPage =
    normalizedTokens.length >= 12
    && dictionaryCoverageRatio === 0
    && (symbolNoiseRatio >= 0.12 || suspiciousTokenRatio >= 0.18 || averageTokenShapeScore < 0.78);

  const score = Math.max(0, Math.min(1,
    (printableRatio * 0.22)
    + ((1 - replacementRatio) * 0.18)
    + ((1 - symbolNoiseRatio) * 0.18)
    + ((1 - suspiciousTokenRatio) * 0.22)
    + (averageTokenShapeScore * 0.15)
    + (Math.min(dictionaryCoverageRatio, 0.25) * 0.2),
  ));

  const accepted =
    printableRatio >= 0.85
    && replacementRatio < 0.08
    && symbolNoiseRatio < 0.3
    && mojibakeNoiseRatio < 0.08
    && score >= 0.62
    && !(suspiciousTokenRatio >= 0.6 && averageTokenShapeScore < 0.55)
    && !(dictionaryCoverageRatio < 0.05 && averageTokenShapeScore < 0.5 && normalizedTokens.length >= 4)
    && !lacksRecognizableWordsOnLongPage;

  const reasons: string[] = [];
  if (printableRatio < 0.85) {
    reasons.push('Printable character coverage was too low.');
  }
  if (replacementRatio >= 0.02) {
    reasons.push('Replacement characters were detected in the native text layer.');
  }
  if (symbolNoiseRatio >= 0.18) {
    reasons.push('Symbol-heavy noise was too high for trusted native text.');
  }
  if (mojibakeNoiseRatio >= 0.08) {
    reasons.push('Encoding noise was too high for trusted native text.');
  }
  if (suspiciousTokenRatio >= 0.45) {
    reasons.push('Too many tokens looked garbled or non-linguistic.');
  }
  if (lacksRecognizableWordsOnLongPage) {
    reasons.push('Recognizable word coverage was too low to trust this longer native text layer.');
  }
  if (dictionaryCoverageRatio < 0.08 && averageTokenShapeScore < 0.55 && normalizedTokens.length >= 4) {
    reasons.push('Recognizable word coverage was too low to trust the native text layer.');
  }
  if (!accepted && reasons.length === 0) {
    reasons.push('Native text fell below the PDF text-quality threshold.');
  }

  return {
    accepted,
    score,
    printableRatio,
    replacementRatio,
    symbolNoiseRatio,
    suspiciousTokenRatio,
    dictionaryCoverageRatio,
    averageTokenShapeScore,
    reasons: accepted ? [] : uniqueStrings(reasons),
  };
}

function extractContentHints(text: string): {
  headings: string[];
  tablesDetected: boolean;
  figuresDetected: boolean;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headings = uniqueStrings([
    ...lines.filter((line) =>
      line.length <= 80
      && /^(BH[-\s]?\d+|borehole|project|report|page|sheet|appendix|table|figure)/i.test(line),
    ),
    lines[0] ?? '',
  ]).slice(0, 3);

  const numericLineCount = lines.filter((line) =>
    /\b\d+(?:\.\d+)?\b/.test(line)
    && /\b\d+(?:\.\d+)?\b.*\b\d+(?:\.\d+)?\b/.test(line),
  ).length;

  return {
    headings,
    tablesDetected:
      numericLineCount >= 2
      || (/\bdepth\b/i.test(text) && /\bspt\b/i.test(text)),
    figuresDetected: /\b(figure|fig\.|plate|photo|sketch|section)\b/i.test(text),
  };
}

function decodeTextOperand(token: PdfToken | undefined): string {
  if (!token) return '';
  if (token.kind === 'literal-string' || token.kind === 'hex-string') {
    return token.decodedText ?? '';
  }
  if (token.kind === 'array') {
    return decodeTextArrayOperand(token);
  }
  return '';
}

function decodeTextArrayOperand(token: PdfToken | undefined): string {
  if (!token || token.kind !== 'array') return '';

  const pieces: string[] = [];
  let index = 1;
  const raw = token.raw;

  while (index < raw.length - 1) {
    index = skipPdfWhitespaceAndComments(raw, index);
    if (index >= raw.length - 1) break;

    const value = readPdfValueRaw(raw, index);
    if (!value) break;

    if (value.raw.startsWith('(')) {
      pieces.push(decodeLiteralString(value.raw));
    } else if (value.raw.startsWith('<') && !value.raw.startsWith(DICTIONARY_START)) {
      pieces.push(decodeHexString(value.raw));
    }

    index = value.nextIndex;
  }

  return pieces.join('');
}

function findLastNameOperand(tokens: PdfToken[]): PdfToken | undefined {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index].kind === 'name') {
      return tokens[index];
    }
  }
  return undefined;
}

function tokenizeContentStream(content: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  let index = 0;

  while (index < content.length) {
    index = skipPdfWhitespaceAndComments(content, index);
    if (index >= content.length) break;

    const value = readPdfValueRaw(content, index);
    if (!value) break;

    const raw = value.raw;
    if (raw.startsWith('(')) {
      tokens.push({
        kind: 'literal-string',
        raw,
        decodedText: decodeLiteralString(raw),
      });
    } else if (raw.startsWith('<') && !raw.startsWith(DICTIONARY_START)) {
      tokens.push({
        kind: 'hex-string',
        raw,
        decodedText: decodeHexString(raw),
      });
    } else if (raw.startsWith('[')) {
      tokens.push({ kind: 'array', raw });
    } else if (raw.startsWith('/')) {
      tokens.push({ kind: 'name', raw });
    } else if (CONTENT_STREAM_OPERATORS.has(raw)) {
      tokens.push({ kind: 'operator', raw });
    } else {
      tokens.push({ kind: 'other', raw });
    }

    index = value.nextIndex;
  }

  return tokens;
}

function decodeLiteralString(raw: string): string {
  let result = '';

  for (let index = 1; index < raw.length - 1; index += 1) {
    const char = raw[index];
    if (char !== '\\') {
      result += char;
      continue;
    }

    index += 1;
    const escaped = raw[index];
    if (escaped === undefined) break;

    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      for (let lookahead = 0; lookahead < 2; lookahead += 1) {
        const nextChar = raw[index + 1];
        if (!nextChar || !/[0-7]/.test(nextChar)) break;
        octal += nextChar;
        index += 1;
      }
      result += String.fromCharCode(parseInt(octal, 8));
      continue;
    }

    switch (escaped) {
      case 'n':
        result += '\n';
        break;
      case 'r':
        result += '\r';
        break;
      case 't':
        result += '\t';
        break;
      case 'b':
        result += '\b';
        break;
      case 'f':
        result += '\f';
        break;
      case '\n':
        break;
      case '\r':
        if (raw[index + 1] === '\n') {
          index += 1;
        }
        break;
      default:
        result += escaped;
        break;
    }
  }

  return decodePdfByteString(Buffer.from(result, 'latin1'));
}

function decodeHexString(raw: string): string {
  let hex = raw.slice(1, -1).replace(/\s+/g, '');
  if (hex.length % 2 === 1) {
    hex += '0';
  }

  return decodePdfByteString(Buffer.from(hex, 'hex'));
}

function decodePdfByteString(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16BigEndian(bytes.subarray(2));
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeUtf16LittleEndian(bytes.subarray(2));
  }

  if (bytes.length >= 4 && looksLikeUtf16BigEndian(bytes)) {
    return decodeUtf16BigEndian(bytes);
  }

  if (bytes.length >= 4 && looksLikeUtf16LittleEndian(bytes)) {
    return decodeUtf16LittleEndian(bytes);
  }

  return bytes.toString('latin1');
}

function decodeUtf16BigEndian(bytes: Buffer): string {
  const chars: string[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    chars.push(String.fromCharCode((bytes[index] << 8) | bytes[index + 1]));
  }
  return chars.join('');
}

function decodeUtf16LittleEndian(bytes: Buffer): string {
  const chars: string[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    chars.push(String.fromCharCode(bytes[index] | (bytes[index + 1] << 8)));
  }
  return chars.join('');
}

function looksLikeUtf16BigEndian(bytes: Buffer): boolean {
  let zeroBytes = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    if (bytes[index] === 0x00) zeroBytes += 1;
  }
  return zeroBytes >= Math.floor(bytes.length / 4);
}

function looksLikeUtf16LittleEndian(bytes: Buffer): boolean {
  let zeroBytes = 0;
  for (let index = 1; index < bytes.length; index += 2) {
    if (bytes[index] === 0x00) zeroBytes += 1;
  }
  return zeroBytes >= Math.floor(bytes.length / 4);
}

function parsePdfObjects(buffer: Buffer): Map<string, ParsedPdfObject> {
  const source = buffer.toString('latin1');
  const objects = new Map<string, ParsedPdfObject>();
  const objectPattern = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;

  for (const match of source.matchAll(objectPattern)) {
    const objectNumber = Number(match[1]);
    const generationNumber = Number(match[2]);
    const rawBody = match[3] ?? '';
    const trimmedBody = rawBody.trim();
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;
    const bodyRelativeStart = fullMatch.indexOf(rawBody);
    const bodyAbsoluteStart = matchIndex + Math.max(bodyRelativeStart, 0);
    const streamMarker = findStreamMarker(rawBody);

    let dictionarySource: string | null = null;
    let dictionaryEntries = new Map<string, string>();
    let streamSpec: PdfObjectStreamSpec | null = null;

    if (streamMarker) {
      const dictCandidate = rawBody.slice(0, streamMarker.markerIndex).trim();
      if (dictCandidate.startsWith(DICTIONARY_START)) {
        dictionarySource = dictCandidate;
        dictionaryEntries = parseDictionaryEntries(dictCandidate);
      }

      streamSpec = {
        startOffset: bodyAbsoluteStart + streamMarker.contentStartIndex,
        fallbackEndOffset: bodyAbsoluteStart + streamMarker.endstreamIndex,
        lengthRaw: dictionaryEntries.get('Length'),
      };
    } else if (trimmedBody.startsWith(DICTIONARY_START)) {
      dictionarySource = trimmedBody;
      dictionaryEntries = parseDictionaryEntries(trimmedBody);
    }

    const ref: PdfRef = { objectNumber, generationNumber };
    objects.set(pdfRefKey(ref), {
      ref,
      body: trimmedBody,
      dictionarySource,
      dictionaryEntries,
      streamSpec,
    });
  }

  return objects;
}

function findStreamMarker(rawBody: string): { markerIndex: number; contentStartIndex: number; endstreamIndex: number } | null {
  const markerIndex = rawBody.indexOf('stream');
  if (markerIndex < 0) return null;

  const endstreamIndex = rawBody.indexOf('endstream', markerIndex);
  if (endstreamIndex < 0) return null;

  let contentStartIndex = markerIndex + 'stream'.length;
  if (rawBody.startsWith('\r\n', contentStartIndex)) {
    contentStartIndex += 2;
  } else if (rawBody[contentStartIndex] === '\n' || rawBody[contentStartIndex] === '\r') {
    contentStartIndex += 1;
  }

  return {
    markerIndex,
    contentStartIndex,
    endstreamIndex,
  };
}

function collectPageObjects(objects: Map<string, ParsedPdfObject>): ParsedPdfObject[] {
  const catalog = [...objects.values()].find((object) => parsePdfName(object.dictionaryEntries.get('Type')) === 'Catalog');
  const rootPagesRef = catalog ? parsePdfRef(catalog.dictionaryEntries.get('Pages')) : null;

  if (rootPagesRef) {
    return walkPageTree(rootPagesRef, objects, new Set<string>());
  }

  return [...objects.values()]
    .filter((object) => parsePdfName(object.dictionaryEntries.get('Type')) === 'Page')
    .sort((left, right) => left.ref.objectNumber - right.ref.objectNumber);
}

function walkPageTree(
  ref: PdfRef,
  objects: Map<string, ParsedPdfObject>,
  visited: Set<string>,
): ParsedPdfObject[] {
  const key = pdfRefKey(ref);
  if (visited.has(key)) return [];
  visited.add(key);

  const object = objects.get(key);
  if (!object) return [];

  const type = parsePdfName(object.dictionaryEntries.get('Type'));
  if (type === 'Page') {
    return [object];
  }

  if (type !== 'Pages') {
    return [];
  }

  const kids = parseSingleOrArrayRefs(object.dictionaryEntries.get('Kids'));
  return kids.flatMap((kid) => walkPageTree(kid, objects, visited));
}

function resolveDictionaryFromRaw(
  rawValue: string | undefined,
  objects: Map<string, ParsedPdfObject>,
): Map<string, string> | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();

  if (trimmed.startsWith(DICTIONARY_START)) {
    return parseDictionaryEntries(trimmed);
  }

  const ref = parsePdfRef(trimmed);
  if (!ref) return null;

  const object = objects.get(pdfRefKey(ref));
  if (!object) return null;

  if (object.dictionarySource) {
    return object.dictionaryEntries;
  }

  if (object.body.startsWith(DICTIONARY_START)) {
    return parseDictionaryEntries(object.body);
  }

  return null;
}

function parseSingleOrArrayRefs(rawValue: string | undefined): PdfRef[] {
  if (!rawValue) return [];

  const directRef = parsePdfRef(rawValue);
  if (directRef) return [directRef];

  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('[')) return [];

  const refs: PdfRef[] = [];
  let index = 1;
  while (index < trimmed.length - 1) {
    index = skipPdfWhitespaceAndComments(trimmed, index);
    if (index >= trimmed.length - 1) break;

    const value = readPdfValueRaw(trimmed, index);
    if (!value) break;

    const ref = parsePdfRef(value.raw);
    if (ref) refs.push(ref);
    index = value.nextIndex;
  }

  return refs;
}

function parseColorSpaceName(rawValue: string | undefined): string | null {
  if (!rawValue) return null;

  const directName = parsePdfName(rawValue);
  if (directName) return directName;

  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('[')) return null;

  const match = trimmed.match(/\/([A-Za-z0-9._-]+)/);
  return match?.[1] ?? null;
}

function parseNumberArray(rawValue: string): number[] | null {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('[')) return null;

  const numbers: number[] = [];
  let index = 1;
  while (index < trimmed.length - 1) {
    index = skipPdfWhitespaceAndComments(trimmed, index);
    if (index >= trimmed.length - 1) break;

    const value = readPdfValueRaw(trimmed, index);
    if (!value) break;

    const numericValue = parseDirectNumber(value.raw);
    if (numericValue !== null) numbers.push(numericValue);
    index = value.nextIndex;
  }

  return numbers;
}

function parseFilterNames(rawValue: string | undefined): string[] {
  if (!rawValue) return [];

  const directName = parsePdfName(rawValue);
  if (directName) return [directName];

  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('[')) return [];

  const names: string[] = [];
  let index = 1;
  while (index < trimmed.length - 1) {
    index = skipPdfWhitespaceAndComments(trimmed, index);
    if (index >= trimmed.length - 1) break;

    const value = readPdfValueRaw(trimmed, index);
    if (!value) break;

    const name = parsePdfName(value.raw);
    if (name) names.push(name);
    index = value.nextIndex;
  }

  return names;
}

function parsePdfRef(rawValue: string | undefined): PdfRef | null {
  if (!rawValue) return null;
  const match = rawValue.trim().match(/^(\d+)\s+(\d+)\s+R$/);
  if (!match) return null;

  return {
    objectNumber: Number(match[1]),
    generationNumber: Number(match[2]),
  };
}

function parsePdfName(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('/')) return null;
  return trimmed.slice(1);
}

function parseDirectNumber(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseDictionaryEntries(dictionarySource: string): Map<string, string> {
  const entries = new Map<string, string>();
  let index = dictionarySource.indexOf(DICTIONARY_START);

  if (index < 0) return entries;
  index += DICTIONARY_START.length;

  while (index < dictionarySource.length) {
    index = skipPdfWhitespaceAndComments(dictionarySource, index);
    if (index >= dictionarySource.length) break;
    if (dictionarySource.startsWith(DICTIONARY_END, index)) break;
    if (dictionarySource[index] !== '/') {
      index += 1;
      continue;
    }

    const keyToken = readPdfNameToken(dictionarySource, index);
    const key = keyToken.raw.slice(1);
    index = skipPdfWhitespaceAndComments(dictionarySource, keyToken.nextIndex);

    const value = readPdfValueRaw(dictionarySource, index);
    if (!value) {
      entries.set(key, '');
      break;
    }

    entries.set(key, value.raw.trim());
    index = value.nextIndex;
  }

  return entries;
}

function readPdfValueRaw(source: string, startIndex: number): { raw: string; nextIndex: number } | null {
  let index = skipPdfWhitespaceAndComments(source, startIndex);
  if (index >= source.length) return null;

  const char = source[index];

  if (char === '(') {
    return readEnclosedToken(source, index, '(', ')');
  }

  if (char === '<') {
    if (source.startsWith(DICTIONARY_START, index)) {
      return readNestedDictionaryToken(source, index);
    }
    return readHexStringToken(source, index);
  }

  if (char === '[') {
    return readEnclosedToken(source, index, '[', ']');
  }

  if (char === '/') {
    return readPdfNameToken(source, index);
  }

  if (char === '\'' || char === '"') {
    return { raw: char, nextIndex: index + 1 };
  }

  const firstWord = readPdfWord(source, index);
  if (!firstWord) return null;

  if (/^[+-]?\d+(?:\.\d+)?$/.test(firstWord.raw)) {
    let lookaheadIndex = skipPdfWhitespaceAndComments(source, firstWord.nextIndex);
    const secondWord = readPdfWord(source, lookaheadIndex);
    if (secondWord && /^\d+$/.test(secondWord.raw)) {
      lookaheadIndex = skipPdfWhitespaceAndComments(source, secondWord.nextIndex);
      const refWord = readPdfWord(source, lookaheadIndex);
      if (refWord?.raw === 'R') {
        return {
          raw: source.slice(index, refWord.nextIndex),
          nextIndex: refWord.nextIndex,
        };
      }
    }
  }

  return firstWord;
}

function readPdfNameToken(source: string, startIndex: number): { raw: string; nextIndex: number } {
  let index = startIndex + 1;
  while (index < source.length && !isPdfDelimiter(source[index]) && !isPdfWhitespaceChar(source[index])) {
    index += 1;
  }
  return {
    raw: source.slice(startIndex, index),
    nextIndex: index,
  };
}

function readHexStringToken(source: string, startIndex: number): { raw: string; nextIndex: number } {
  let index = startIndex + 1;
  while (index < source.length && source[index] !== '>') {
    index += 1;
  }
  const nextIndex = index < source.length ? index + 1 : source.length;
  return {
    raw: source.slice(startIndex, nextIndex),
    nextIndex,
  };
}

function readNestedDictionaryToken(source: string, startIndex: number): { raw: string; nextIndex: number } {
  let index = startIndex;
  let depth = 0;

  while (index < source.length) {
    if (source.startsWith(DICTIONARY_START, index)) {
      depth += 1;
      index += 2;
      continue;
    }

    if (source.startsWith(DICTIONARY_END, index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) {
        return {
          raw: source.slice(startIndex, index),
          nextIndex: index,
        };
      }
      continue;
    }

    if (source[index] === '(') {
      const literal = readEnclosedToken(source, index, '(', ')');
      index = literal.nextIndex;
      continue;
    }

    if (source[index] === '<' && !source.startsWith(DICTIONARY_START, index)) {
      const hexString = readHexStringToken(source, index);
      index = hexString.nextIndex;
      continue;
    }

    if (source[index] === '[') {
      const arrayToken = readEnclosedToken(source, index, '[', ']');
      index = arrayToken.nextIndex;
      continue;
    }

    index += 1;
  }

  return {
    raw: source.slice(startIndex),
    nextIndex: source.length,
  };
}

function readEnclosedToken(
  source: string,
  startIndex: number,
  openChar: '(' | '[',
  closeChar: ')' | ']',
): { raw: string; nextIndex: number } {
  let index = startIndex + 1;
  let depth = 1;

  while (index < source.length) {
    const char = source[index];

    if (openChar === '(' && char === '\\') {
      index += 2;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return {
          raw: source.slice(startIndex, index),
          nextIndex: index,
        };
      }
      continue;
    }

    if (openChar === '[' && char === '(') {
      const literal = readEnclosedToken(source, index, '(', ')');
      index = literal.nextIndex;
      continue;
    }

    if (openChar === '[' && char === '<') {
      if (source.startsWith(DICTIONARY_START, index)) {
        const dict = readNestedDictionaryToken(source, index);
        index = dict.nextIndex;
      } else {
        const hexString = readHexStringToken(source, index);
        index = hexString.nextIndex;
      }
      continue;
    }

    if (openChar === '[' && char === '[') {
      const nested = readEnclosedToken(source, index, '[', ']');
      index = nested.nextIndex;
      continue;
    }

    index += 1;
  }

  return {
    raw: source.slice(startIndex),
    nextIndex: source.length,
  };
}

function readPdfWord(source: string, startIndex: number): { raw: string; nextIndex: number } | null {
  let index = startIndex;
  while (index < source.length && !isPdfDelimiter(source[index]) && !isPdfWhitespaceChar(source[index])) {
    index += 1;
  }

  if (index === startIndex) return null;

  return {
    raw: source.slice(startIndex, index),
    nextIndex: index,
  };
}

function skipPdfWhitespaceAndComments(source: string, startIndex: number): number {
  let index = startIndex;

  while (index < source.length) {
    const char = source[index];

    if (isPdfWhitespaceChar(char)) {
      index += 1;
      continue;
    }

    if (char === '%') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') {
        index += 1;
      }
      continue;
    }

    break;
  }

  return index;
}

function isPdfWhitespace(value: number): boolean {
  return value === 0x00 || value === 0x09 || value === 0x0a || value === 0x0c || value === 0x0d || value === 0x20;
}

function isPdfWhitespaceChar(char: string | undefined): boolean {
  return char === '\u0000' || char === '\t' || char === '\n' || char === '\f' || char === '\r' || char === ' ';
}

function isPdfDelimiter(char: string | undefined): boolean {
  return char === '('
    || char === ')'
    || char === '<'
    || char === '>'
    || char === '['
    || char === ']'
    || char === '{'
    || char === '}'
    || char === '/'
    || char === '%';
}

function readPdfVersion(buffer: Buffer): string | null {
  const header = buffer.subarray(0, Math.min(buffer.length, 32)).toString('latin1');
  const match = header.match(/%PDF-(\d\.\d)/);
  return match ? match[1] : null;
}

function hasPdfEncryptMarker(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
  return /\/Encrypt\b/.test(sample);
}

function pdfRefKey(ref: PdfRef): string {
  return `${ref.objectNumber} ${ref.generationNumber}`;
}

function pdfRefLabel(ref: PdfRef): string {
  return `${ref.objectNumber} ${ref.generationNumber} R`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

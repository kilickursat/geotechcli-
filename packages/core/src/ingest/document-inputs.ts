import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  extractPrimaryPdfPageImages,
  renderPdfPageImage,
  type PdfDocumentInspection,
  type PdfPageNormalizedArtifact,
  type PdfPageRasterImage,
  type PdfTextQualityAssessment,
} from './pdf.js';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export type DocumentInputKind = 'image' | 'pdf' | 'unknown';

export interface DocumentVisionInput {
  base64: string;
  mimeType: string;
  fileBytes: number;
  filePath: string;
  ext: string;
  kind: DocumentInputKind;
}

export interface DocumentPdfPageInput extends DocumentVisionInput {
  pageNumber: number;
  totalPages: number;
  sourceKind?: 'pdf-page' | 'raster-image';
  normalizedArtifact: DocumentPdfPageNormalizedArtifact;
}

export interface DocumentPdfPageNormalizedArtifact {
  kind: 'pdf' | 'image';
  source: 'native-pdf-page' | 'xobject-raster' | 'full-page-raster';
  mimeType: string;
  fileBytes: number;
  textSource: PdfPageNormalizedArtifact['textSource'];
  textQuality: PdfTextQualityAssessment | null;
  warnings: string[];
}

export interface ReadDocumentPdfPageInputsOptions {
  inspection?: PdfDocumentInspection | null;
  preferExtractedPageImages?: boolean;
  forceRasterImages?: boolean;
  dependencies?: {
    extractPageImages?: typeof extractPrimaryPdfPageImages;
    renderPageImage?: typeof renderPdfPageImage;
  };
}

const PROVIDER_SAFE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function readDocumentVisionInput(filePath: string): DocumentVisionInput {
  const buffer = readFileSync(filePath);
  const ext = extname(filePath).slice(1).toLowerCase();
  const kind: DocumentInputKind = ext === 'pdf' ? 'pdf' : MIME_TYPES[ext] ? 'image' : 'unknown';

  return {
    base64: buffer.toString('base64'),
    mimeType: MIME_TYPES[ext] ?? 'image/png',
    fileBytes: buffer.length,
    filePath,
    ext,
    kind,
  };
}

export async function countDocumentPdfPages(filePath: string): Promise<number> {
  const buffer = readFileSync(filePath);
  const quickCount = buffer
    .toString('latin1')
    .match(/\/Type\s*\/Page(?!s)\b/g)?.length ?? 0;
  if (quickCount > 0) {
    return quickCount;
  }

  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return source.getPageCount();
}

function extFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function imageBufferMatchesMimeType(buffer: Uint8Array, mimeType: string): boolean {
  const bytes = Buffer.from(buffer);
  if (bytes.length < 12) {
    return false;
  }

  switch (mimeType) {
    case 'image/png':
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
    case 'image/jpeg':
      return bytes[0] === 0xFF && bytes[1] === 0xD8;
    case 'image/gif':
      return bytes.subarray(0, 6).toString('ascii') === 'GIF87a'
        || bytes.subarray(0, 6).toString('ascii') === 'GIF89a';
    case 'image/webp':
      return bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

function isProviderSafeRasterImage(image: PdfPageRasterImage): boolean {
  return PROVIDER_SAFE_IMAGE_MIME_TYPES.has(image.mimeType)
    && imageBufferMatchesMimeType(image.data, image.mimeType);
}

function createDocumentPdfPageNormalizedArtifact(input: {
  kind: 'pdf' | 'image';
  source: 'native-pdf-page' | 'xobject-raster' | 'full-page-raster';
  mimeType: string;
  fileBytes: number;
  inspectionArtifact?: PdfPageNormalizedArtifact | null;
  warnings?: string[];
}): DocumentPdfPageNormalizedArtifact {
  return {
    kind: input.kind,
    source: input.source,
    mimeType: input.mimeType,
    fileBytes: input.fileBytes,
    textSource: input.inspectionArtifact?.textSource ?? 'none',
    textQuality: input.inspectionArtifact?.textQuality ?? null,
    warnings: [
      ...new Set([
        ...(input.inspectionArtifact?.warnings ?? []),
        ...(input.warnings ?? []),
      ]),
    ],
  };
}

export async function readDocumentPdfPageInputs(
  filePath: string,
  options?: ReadDocumentPdfPageInputsOptions,
): Promise<DocumentPdfPageInput[]> {
  const buffer = readFileSync(filePath);
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = source.getPageCount();
  const extractPageImages = options?.dependencies?.extractPageImages ?? extractPrimaryPdfPageImages;
  const renderPageImage = options?.dependencies?.renderPageImage ?? renderPdfPageImage;
  const shouldAttemptRasterExtraction =
    options?.preferExtractedPageImages !== false
    && (options?.inspection != null || options?.forceRasterImages === true);
  const extractedImages =
    !shouldAttemptRasterExtraction
      ? []
      : await extractPageImages(buffer);
  const extractedImageByPage = new Map(
    extractedImages.map((image) => [image.pageNumber, image] as const),
  );
  const pageInputs: DocumentPdfPageInput[] = [];

  for (let index = 0; index < totalPages; index++) {
    const pageNumber = index + 1;
    const inspectionPage = options?.inspection?.pages[index];
    const extractedImage = extractedImageByPage.get(pageNumber);
    const shouldPreferRasterImage =
      options?.forceRasterImages === true
      || inspectionPage?.classification === 'image-only'
      || inspectionPage?.classification === 'text-unreadable'
      || inspectionPage?.normalizedArtifact?.textSource === 'native-text-low-quality';

    if (shouldPreferRasterImage) {
      const rasterWarnings: string[] = [];
      if (extractedImage) {
        if (isProviderSafeRasterImage(extractedImage)) {
          pageInputs.push({
            base64: Buffer.from(extractedImage.data).toString('base64'),
            mimeType: extractedImage.mimeType,
            fileBytes: extractedImage.byteLength,
            filePath,
            ext: extFromMimeType(extractedImage.mimeType),
            kind: 'image',
            pageNumber,
            totalPages,
            sourceKind: 'raster-image',
            normalizedArtifact: createDocumentPdfPageNormalizedArtifact({
              kind: 'image',
              source: 'xobject-raster',
              mimeType: extractedImage.mimeType,
              fileBytes: extractedImage.byteLength,
              inspectionArtifact: inspectionPage?.normalizedArtifact,
              warnings: extractedImage.warnings,
            }),
          });
          continue;
        }

        rasterWarnings.push(
          `Extracted raster image for page ${pageNumber} was not a provider-safe ${extractedImage.mimeType} payload, so the full page was rerendered to PNG.`,
        );
      }

      const renderedPage = await renderPageImage(buffer, pageNumber);
      if (renderedPage) {
        pageInputs.push({
          base64: Buffer.from(renderedPage.data).toString('base64'),
          mimeType: renderedPage.mimeType,
          fileBytes: renderedPage.byteLength,
          filePath,
          ext: extFromMimeType(renderedPage.mimeType),
          kind: 'image',
          pageNumber,
          totalPages,
          sourceKind: 'raster-image',
          normalizedArtifact: createDocumentPdfPageNormalizedArtifact({
            kind: 'image',
            source: 'full-page-raster',
            mimeType: renderedPage.mimeType,
            fileBytes: renderedPage.byteLength,
            inspectionArtifact: inspectionPage?.normalizedArtifact,
            warnings: [...rasterWarnings, ...renderedPage.warnings],
          }),
        });
        continue;
      }
    }

    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(source, [index]);
    pageDoc.addPage(copiedPage);
    const pageBytes = await pageDoc.save();
    const pageBuffer = Buffer.from(pageBytes);

    pageInputs.push({
      base64: pageBuffer.toString('base64'),
      mimeType: 'application/pdf',
      fileBytes: pageBuffer.length,
      filePath,
      ext: 'pdf',
      kind: 'pdf',
      pageNumber,
      totalPages,
      sourceKind: 'pdf-page',
      normalizedArtifact: createDocumentPdfPageNormalizedArtifact({
        kind: 'pdf',
        source: 'native-pdf-page',
        mimeType: 'application/pdf',
        fileBytes: pageBuffer.length,
        inspectionArtifact: inspectionPage?.normalizedArtifact,
        warnings:
          shouldPreferRasterImage && extractedImage && !isProviderSafeRasterImage(extractedImage)
            ? [`Extracted raster image for page ${pageNumber} could not be normalized into a provider-safe image payload, so the job fell back to a native PDF page.`]
            : [],
      }),
    });
  }

  return pageInputs;
}

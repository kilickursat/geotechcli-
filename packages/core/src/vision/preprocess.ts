import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface VisionImagePreprocessResult {
  buffer: Buffer;
  mimeType: string;
  transformed: boolean;
  warnings: string[];
}

export type VisionImagePreprocessPolicy = 'none' | 'ocr-optimized';

export interface PdfPageRasterRenderResult {
  buffer: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
  warnings: string[];
}

interface PdfRendererModule {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }>;
    destroy(): void;
  };
}

type CanvasLike = {
  width: number;
  height: number;
  getContext(type: '2d'): unknown;
  toBuffer(mimeType: 'image/png'): Buffer;
};

type CreateCanvasLike = (width: number, height: number) => CanvasLike;
type PdfTextContentItem = { str?: string };

const require = createRequire(import.meta.url);

let cachedPdfRendererModule: Promise<PdfRendererModule> | null = null;
let cachedCanvasFactory: Promise<CreateCanvasLike> | null = null;
let cachedStandardFontDataUrl: string | null = null;
let cachedPdfRendererUrl: string | null = null;
let cachedCanvasModuleUrl: string | null = null;

async function loadSharp(): Promise<any | null> {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function loadPdfRendererModule(): Promise<PdfRendererModule> {
  if (!cachedPdfRendererUrl) {
    const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
    cachedPdfRendererUrl = pathToFileURL(
      join(dirname(pdfjsPackagePath), 'legacy', 'build', 'pdf.mjs'),
    ).href;
  }

  cachedPdfRendererModule ??= import(cachedPdfRendererUrl) as Promise<PdfRendererModule>;
  return cachedPdfRendererModule;
}

async function loadCanvasFactory(): Promise<CreateCanvasLike> {
  if (!cachedCanvasModuleUrl) {
    const canvasSpecifier = ['@napi-rs', 'canvas'].join('/');
    cachedCanvasModuleUrl = pathToFileURL(require.resolve(canvasSpecifier)).href;
  }

  cachedCanvasFactory ??= import(/* webpackIgnore: true */ cachedCanvasModuleUrl)
    .then((mod) => (mod.createCanvas ?? mod.default?.createCanvas) as CreateCanvasLike);
  return cachedCanvasFactory;
}

function resolvePdfStandardFontDataUrl(): string {
  if (cachedStandardFontDataUrl) {
    return cachedStandardFontDataUrl;
  }

  const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
  cachedStandardFontDataUrl = `${join(dirname(pdfjsPackagePath), 'standard_fonts').replaceAll('\\', '/')}/`;
  return cachedStandardFontDataUrl;
}

export async function encodeRawRasterToPng(
  pixels: Uint8Array,
  details: { width: number; height: number; channels: number },
): Promise<Buffer> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error('sharp is unavailable for raw raster encoding.');
  }

  return sharp(Buffer.from(pixels), {
    raw: {
      width: details.width,
      height: details.height,
      channels: details.channels,
    },
  })
    .png()
    .toBuffer();
}

export async function preprocessVisionImageBuffer(
  buffer: Uint8Array,
  mimeType: string,
  policy: VisionImagePreprocessPolicy = 'ocr-optimized',
): Promise<VisionImagePreprocessResult> {
  if (policy === 'none') {
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings: [],
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings: ['Image preprocessing skipped because sharp is unavailable in this runtime.'],
    };
  }

  try {
    const output = await sharp(Buffer.from(buffer), { pages: 1 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .trim({
        background: '#ffffff',
        threshold: 10,
      })
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    return {
      buffer: output,
      mimeType: 'image/png',
      transformed: true,
      warnings: [],
    };
  } catch (error) {
    return {
      buffer: Buffer.from(buffer),
      mimeType,
      transformed: false,
      warnings: [
        `Image preprocessing skipped: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

export async function renderPdfPageToImageBuffer(
  buffer: Uint8Array,
  pageNumber = 1,
  options?: {
    scale?: number;
    preprocessPolicy?: VisionImagePreprocessPolicy;
  },
): Promise<PdfPageRasterRenderResult | null> {
  const renderer = await loadPdfRendererModule();
  const createCanvas = await loadCanvasFactory();
  const loadingTask = renderer.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl: resolvePdfStandardFontDataUrl(),
  });

  let pdfDocument:
    | {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }
    | null = null;

  try {
    pdfDocument = await loadingTask.promise;
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      return null;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: options?.scale ?? 1.5 });
    const canvas = createCanvas(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height)),
    );
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const renderedBuffer = canvas.toBuffer('image/png');
    const preprocessed = await preprocessVisionImageBuffer(
      renderedBuffer,
      'image/png',
      options?.preprocessPolicy ?? 'ocr-optimized',
    );

    return {
      buffer: preprocessed.buffer,
      mimeType: 'image/png',
      width: canvas.width,
      height: canvas.height,
      warnings: preprocessed.warnings,
    };
  } finally {
    try {
      if (pdfDocument) {
        await pdfDocument.destroy();
      } else {
        loadingTask.destroy();
      }
    } catch {
      // Ignore renderer cleanup errors.
    }
  }
}

export async function extractPdfPageTextFromBuffer(
  buffer: Uint8Array,
  pageNumber = 1,
): Promise<string | null> {
  const renderer = await loadPdfRendererModule();
  const loadingTask = renderer.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl: resolvePdfStandardFontDataUrl(),
  });

  let pdfDocument:
    | {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items?: PdfTextContentItem[] }>;
      }>;
      destroy(): Promise<void>;
    }
    | null = null;

  try {
    pdfDocument = await loadingTask.promise as unknown as {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items?: PdfTextContentItem[] }>;
      }>;
      destroy(): Promise<void>;
    };
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      return null;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = Array.isArray(textContent.items) ? textContent.items : [];
    const text = items
      .map((item) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text || null;
  } finally {
    try {
      await pdfDocument?.destroy();
    } catch {
      // Ignore cleanup failures from pdfjs during fallback extraction.
    }
    loadingTask.destroy();
  }
}

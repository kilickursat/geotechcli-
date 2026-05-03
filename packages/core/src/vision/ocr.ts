import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assessPdfTextQuality } from '../ingest/pdf.js';
import type { LLMConfig } from '../llm/types.js';
import { extractPdfPageTextFromBuffer, preprocessVisionImageBuffer } from './preprocess.js';
import {
  parseDocumentLayoutWithGlmOcr,
  supportsGlmOcrLayoutParsing,
  type GlmOcrLayoutResult,
} from './layout-ocr.js';

export type DocumentTextHintSource = 'native-text' | 'pdfjs-text' | 'local-ocr' | 'vision-ocr' | 'vision-visual' | 'glm-ocr' | 'none';

export interface VisionTranscriptionLike {
  text: string;
  warnings: string[];
  usedFallback: boolean;
  latencyMs: number;
}

export interface RecoverDocumentTextHintOptions {
  existingTextHint?: string | null;
  existingTextAccepted?: boolean;
  imageBase64: string;
  mimeType: string;
  config: LLMConfig;
  pdfFilePath?: string;
  pdfPageNumber?: number;
  minimumLength?: number;
  allowLayoutOcr?: boolean;
  allowVisionOcr?: boolean;
  layoutParse?: (
    documentBase64: string,
    mimeType: string,
    config: LLMConfig,
  ) => Promise<GlmOcrLayoutResult>;
  visionTranscribe?: (
    imageBase64: string,
    mimeType: string,
    config: LLMConfig,
  ) => Promise<VisionTranscriptionLike>;
}

export interface RecoverDocumentTextHintResult {
  textHint?: string;
  source: DocumentTextHintSource;
  warnings: string[];
  latencyMs: number;
  transformed: boolean;
  layout?: GlmOcrLayoutResult;
}

let cachedLocalTesseractAvailability: boolean | null = null;

async function loadSharp(): Promise<any | null> {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function normalizeTextHint(value: string | null | undefined, maxLength = 1600): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function looksLikeVisionOcrCommentary(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('the user wants me to transcribe')
    || normalized.includes('analyze the image')
    || normalized.includes('transcribe the text')
    || normalized.includes('refine the transcription')
    || normalized.includes('the top line reads')
    || normalized.includes('looking very closely')
    || normalized.includes('let\'s look closer')
    || normalized.includes('1. **analyze the image:**')
    || normalized.includes('2. **transcribe the text:**')
    || normalized.includes('3. **refine the transcription:**')
  );
}

function sanitizeVisionOcrText(value: string | null | undefined): {
  textHint?: string;
  rejectedReason?: string;
} {
  const normalized = normalizeTextHint(value);
  if (!normalized) {
    return {};
  }

  if (looksLikeVisionOcrCommentary(normalized)) {
    return {
      rejectedReason: 'Vision OCR returned commentary/instructions instead of plain OCR text.',
    };
  }

  return { textHint: normalized };
}

async function buildVisionOcrChunkInputs(
  buffer: Buffer,
  mimeType: string,
): Promise<Array<{ buffer: Buffer; mimeType: string; label: string }>> {
  if (!mimeType.startsWith('image/')) {
    return [];
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return [];
  }

  try {
    const source = sharp(buffer, { pages: 1 });
    const metadata = await source.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < 32 || height < 900) {
      return [];
    }

    const chunkCount = height >= 1300 ? 3 : 2;
    const overlap = Math.min(32, Math.max(12, Math.round(height * 0.015)));
    const step = Math.ceil(height / chunkCount);
    const chunks: Array<{ buffer: Buffer; mimeType: string; label: string }> = [];

    for (let index = 0; index < chunkCount; index += 1) {
      const startTop = index * step;
      const endTop = Math.min(height, (index + 1) * step);
      const top = Math.max(0, startTop - (index > 0 ? overlap : 0));
      const chunkHeight = Math.max(1, Math.min(height, endTop + (index < chunkCount - 1 ? overlap : 0)) - top);
      const chunkBuffer = await sharp(buffer, { pages: 1 })
        .extract({
          left: 0,
          top,
          width,
          height: chunkHeight,
        })
        .png()
        .toBuffer();

      chunks.push({
        buffer: chunkBuffer,
        mimeType: 'image/png',
        label: `OCR chunk ${index + 1}/${chunkCount}`,
      });
    }

    return chunks;
  } catch {
    return [];
  }
}

export function hasLocalTesseractOcr(): boolean {
  if (cachedLocalTesseractAvailability != null) {
    return cachedLocalTesseractAvailability;
  }

  try {
    const result = spawnSync('tesseract', ['--version'], { stdio: 'ignore' });
    cachedLocalTesseractAvailability = result.status === 0;
  } catch {
    cachedLocalTesseractAvailability = false;
  }

  return cachedLocalTesseractAvailability;
}

function runLocalTesseractOcr(buffer: Buffer, mimeType: string): string | null {
  if (!hasLocalTesseractOcr()) {
    return null;
  }

  const extension =
    mimeType === 'image/jpeg' ? 'jpg'
      : mimeType === 'image/png' ? 'png'
        : mimeType === 'image/webp' ? 'webp'
          : mimeType === 'image/gif' ? 'gif'
            : 'png';
  const tempDir = mkdtempSync(join(tmpdir(), 'geotechcli-ocr-'));
  const inputPath = join(tempDir, `page.${extension}`);

  try {
    writeFileSync(inputPath, buffer);
    try {
      const stdout = execFileSync(
        'tesseract',
        [inputPath, 'stdout', '--psm', '6'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      return typeof stdout === 'string' ? stdout.trim() : '';
    } catch {
      return null;
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function recoverDocumentTextHint(
  options: RecoverDocumentTextHintOptions,
): Promise<RecoverDocumentTextHintResult> {
  const minimumLength = options.minimumLength ?? 24;
  const seededText = normalizeTextHint(options.existingTextHint);
  const seededTextQuality = seededText ? assessPdfTextQuality(seededText) : null;
  const existingTextAccepted =
    options.existingTextAccepted
    ?? seededTextQuality?.accepted
    ?? false;
  const nativeTextWarnings =
    !existingTextAccepted && seededTextQuality
      ? seededTextQuality.reasons.map((reason) => `Native text quality gate rejected the seeded text hint: ${reason}`)
      : [];
  const start = Date.now();

  if (existingTextAccepted && seededText && seededText.length >= minimumLength) {
    return {
      textHint: seededText,
      source: 'native-text',
      warnings: [],
      latencyMs: 0,
      transformed: false,
    };
  }

  if (
    options.pdfFilePath
    && options.pdfFilePath.toLowerCase().endsWith('.pdf')
    && Number.isFinite(options.pdfPageNumber)
    && (options.pdfPageNumber ?? 0) > 0
  ) {
    try {
      const pdfjsText = normalizeTextHint(
        await extractPdfPageTextFromBuffer(
          readFileSync(options.pdfFilePath),
          options.pdfPageNumber,
        ),
      );
      const pdfjsQuality = pdfjsText ? assessPdfTextQuality(pdfjsText) : null;
      if (pdfjsText && pdfjsQuality?.accepted && pdfjsText.length >= minimumLength) {
        return {
          textHint: pdfjsText,
          source: 'pdfjs-text',
          warnings: nativeTextWarnings,
          latencyMs: Date.now() - start,
          transformed: false,
        };
      }
      if (pdfjsText && pdfjsQuality && !pdfjsQuality.accepted) {
        nativeTextWarnings.push(
          ...pdfjsQuality.reasons.map((reason) => `High-fidelity PDF text fallback was rejected: ${reason}`),
        );
      }
    } catch (error) {
      nativeTextWarnings.push(
        `High-fidelity PDF text fallback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const allowLayoutOcr = options.allowLayoutOcr ?? true;
  if (allowLayoutOcr && supportsGlmOcrLayoutParsing(options.config)) {
    const layoutParse = options.layoutParse ?? parseDocumentLayoutWithGlmOcr;
    try {
      const layout = await layoutParse(
        options.imageBase64,
        options.mimeType,
        options.config,
      );
      const layoutText = normalizeTextHint(layout.text || layout.markdown, 6000);
      if (layoutText && layoutText.length >= minimumLength) {
        return {
          textHint: layoutText,
          source: 'glm-ocr',
          warnings: [
            ...nativeTextWarnings,
            ...layout.warnings,
            `Recovered GLM-OCR layout text with ${layout.pages.length} parsed page(s).`,
          ],
          latencyMs: Date.now() - start,
          transformed: false,
          layout,
        };
      }
      nativeTextWarnings.push('GLM-OCR layout parsing returned no usable text hint for this page.');
      nativeTextWarnings.push(...layout.warnings);
    } catch (error) {
      nativeTextWarnings.push(
        `GLM-OCR layout parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (!allowLayoutOcr) {
    nativeTextWarnings.push('GLM-OCR layout parsing was skipped for this retry because layout recovery had already been attempted for the page.');
  }

  if (!options.mimeType.startsWith('image/')) {
    const nativeWarnings =
      !existingTextAccepted && seededText
        ? [
          ...nativeTextWarnings,
          'Native text was present but failed the text-quality gate, and this non-image page input could not use image OCR directly.',
        ]
        : [];
    return {
      textHint: existingTextAccepted ? seededText : undefined,
      source: existingTextAccepted ? 'native-text' : 'none',
      warnings: nativeWarnings.length > 0
        ? nativeWarnings
        : seededText
          ? []
          : ['No image-based OCR path was available for this non-image page input.'],
        latencyMs: 0,
        transformed: false,
      };
  }

  const warnings: string[] = [...nativeTextWarnings];
  const originalBuffer = Buffer.from(options.imageBase64, 'base64');
  const preprocessed = await preprocessVisionImageBuffer(originalBuffer, options.mimeType, 'ocr-optimized');
  warnings.push(...preprocessed.warnings);

  const localText = normalizeTextHint(runLocalTesseractOcr(preprocessed.buffer, preprocessed.mimeType));
  if (localText && localText.length >= minimumLength) {
    return {
      textHint: localText,
      source: 'local-ocr',
      warnings,
      latencyMs: Date.now() - start,
      transformed: preprocessed.transformed,
    };
  }

  const allowVisionOcr = options.allowVisionOcr ?? true;
  if (!allowVisionOcr) {
    warnings.push('Vision OCR was skipped for this retry because OCR/text recovery had already been attempted for the page.');
  }

  if (allowVisionOcr && options.visionTranscribe) {
    let recoveredVisionText: string | undefined;

    try {
      const transcription = await options.visionTranscribe(
        preprocessed.buffer.toString('base64'),
        preprocessed.mimeType,
        options.config,
      );
      const sanitized = sanitizeVisionOcrText(transcription.text);
      warnings.push(...transcription.warnings);
      if (sanitized.rejectedReason) {
        warnings.push(sanitized.rejectedReason);
      } else if (sanitized.textHint) {
        recoveredVisionText = sanitized.textHint;
      }
    } catch (error) {
      warnings.push(`Vision OCR failed on the full page: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (recoveredVisionText && recoveredVisionText.length >= minimumLength) {
      return {
        textHint: recoveredVisionText,
        source: 'vision-ocr',
        warnings,
        latencyMs: Date.now() - start,
        transformed: preprocessed.transformed,
      };
    }

    if (recoveredVisionText) {
      warnings.push('Vision OCR returned a text hint, but it was too short to trust for document extraction.');
    }

    const chunkInputs = await buildVisionOcrChunkInputs(preprocessed.buffer, preprocessed.mimeType);
    if (chunkInputs.length > 0) {
      const chunkTexts: string[] = [];

      for (const chunkInput of chunkInputs) {
        try {
          const chunkTranscription = await options.visionTranscribe(
            chunkInput.buffer.toString('base64'),
            chunkInput.mimeType,
            options.config,
          );
          const sanitized = sanitizeVisionOcrText(chunkTranscription.text);
          warnings.push(...chunkTranscription.warnings.map((warning) => `${chunkInput.label}: ${warning}`));
          if (sanitized.rejectedReason) {
            warnings.push(`${chunkInput.label}: ${sanitized.rejectedReason}`);
            continue;
          }
          if (sanitized.textHint) {
            chunkTexts.push(sanitized.textHint);
          }
        } catch (error) {
          warnings.push(`${chunkInput.label} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const combinedChunkText = normalizeTextHint(chunkTexts.join('\n'));
      if (combinedChunkText && combinedChunkText.length >= minimumLength) {
        warnings.push(`Recovered OCR text by chunking a dense document image into ${chunkInputs.length} slice(s).`);
        return {
          textHint: combinedChunkText,
          source: 'vision-ocr',
          warnings: [...new Set(warnings)],
          latencyMs: Date.now() - start,
          transformed: preprocessed.transformed,
        };
      }

      if (combinedChunkText) {
        warnings.push('Chunked vision OCR recovered text fragments, but they were still too short to trust for document extraction.');
      }
    }
  }

  return {
    textHint: existingTextAccepted ? seededText : undefined,
    source: existingTextAccepted ? 'native-text' : 'none',
    warnings: warnings.length > 0 ? warnings : ['No usable OCR text hint was recovered.'],
    latencyMs: Date.now() - start,
    transformed: preprocessed.transformed,
  };
}

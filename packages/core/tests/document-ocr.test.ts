import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

import { recoverDocumentTextHint } from '../src/vision/ocr.js';

describe('document text recovery', () => {
  it('keeps native text hints without invoking OCR fallback', async () => {
    const visionTranscribe = vi.fn();

    const result = await recoverDocumentTextHint({
      existingTextHint: 'BH-12 0.0-2.0m stiff clay',
      imageBase64: Buffer.from('fake').toString('base64'),
      mimeType: 'application/pdf',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      visionTranscribe,
    });

    expect(result.source).toBe('native-text');
    expect(result.textHint).toContain('BH-12');
    expect(visionTranscribe).not.toHaveBeenCalled();
  });

  it('rejects low-quality native text hints before falling back', async () => {
    const visionTranscribe = vi.fn().mockResolvedValue({
      text: 'Recovered OCR text: BH-12 2.0-4.0m SILTY SAND',
      warnings: [],
      usedFallback: false,
      latencyMs: 25,
    });

    const result = await recoverDocumentTextHint({
      existingTextHint: '@@@ #### $$$$ %%%% x1x1x1x1',
      imageBase64: Buffer.from('fake-image').toString('base64'),
      mimeType: 'image/png',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toContain('Recovered OCR text');
    expect(result.warnings.join(' ')).toMatch(/quality gate rejected/i);
    expect(visionTranscribe).toHaveBeenCalledTimes(1);
  });

  it('falls back to vision OCR when no native text hint is available', async () => {
    const visionTranscribe = vi.fn().mockResolvedValue({
      text: 'Recovered OCR text: BH-12 2.0-4.0m SILTY SAND',
      warnings: ['Fallback retry used.'],
      usedFallback: true,
      latencyMs: 25,
    });

    const result = await recoverDocumentTextHint({
      imageBase64: Buffer.from('fake-image').toString('base64'),
      mimeType: 'image/png',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toContain('Recovered OCR text');
    expect(result.warnings.join(' ')).toMatch(/fallback/i);
    expect(visionTranscribe).toHaveBeenCalledTimes(1);
  });

  it('uses high-fidelity PDF text fallback before image OCR when native PDF text is degraded', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'geotechcli-pdfjs-ocr-'));
    const filePath = join(tempDir, 'late-appendix-page.pdf');

    try {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.TimesRoman);
      const page = pdf.addPage([612, 792]);
      page.drawText(
        'RESULTS\\nThe interpreted depth to competent bedrock ranged from approximately 10 m to 13 m below ground surface.\\nThe applicable Site Class is C.',
        {
          x: 72,
          y: 680,
          size: 12,
          font,
          lineHeight: 18,
        },
      );
      writeFileSync(filePath, Buffer.from(await pdf.save()));

      const visionTranscribe = vi.fn();
      const result = await recoverDocumentTextHint({
        existingTextHint: '@@@ #### $$$$ %%%% x1x1x1x1',
        existingTextAccepted: false,
        imageBase64: Buffer.from('fake-pdf-page').toString('base64'),
        mimeType: 'application/pdf',
        pdfFilePath: filePath,
        pdfPageNumber: 1,
        config: {
          provider: 'hosted-beta',
          apiKey: '',
        },
        visionTranscribe,
      });

      expect(result.source).toBe('pdfjs-text');
      expect(result.textHint).toMatch(/competent bedrock/i);
      expect(result.textHint).toMatch(/RESULTS/i);
      expect(visionTranscribe).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('chunks dense scanned pages when the full-page vision OCR call fails', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 320,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const visionTranscribe = vi.fn()
      .mockRejectedValueOnce(new Error('Hosted beta request timed out after 150s.'))
      .mockResolvedValueOnce({
        text: 'PARACEL LABORATORIES LTD Chain of Custody Parcel ID 2250463 Client Name MALROZ',
        warnings: [],
        usedFallback: false,
        latencyMs: 40,
      })
      .mockResolvedValueOnce({
        text: 'Sample ID BH102 S01 BH103 S01 Required Analysis VOCs PAHs pH',
        warnings: [],
        usedFallback: false,
        latencyMs: 40,
      });

    const result = await recoverDocumentTextHint({
      imageBase64: imageBuffer.toString('base64'),
      mimeType: 'image/png',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toMatch(/Chain of Custody/i);
    expect(result.textHint).toMatch(/Sample ID/i);
    expect(result.warnings.join(' ')).toMatch(/chunking a dense document image/i);
    expect(visionTranscribe).toHaveBeenCalledTimes(3);
  });
});

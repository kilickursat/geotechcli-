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
      allowLayoutOcr: false,
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
      allowLayoutOcr: false,
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
      allowLayoutOcr: false,
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toContain('Recovered OCR text');
    expect(result.warnings.join(' ')).toMatch(/fallback/i);
    expect(visionTranscribe).toHaveBeenCalledTimes(1);
  });

  it('uses GLM-OCR layout parsing before vision OCR when hosted layout text is available', async () => {
    const layoutParse = vi.fn().mockResolvedValue({
      provider: 'hosted-beta',
      model: 'GLM-OCR',
      markdown: '## Page 1\n| Depth | SPT N |\n| 2.0 m | 12 |',
      text: 'Depth 2.0 m SPT N 12 silty sand',
      pages: [{
        pageNumber: 1,
        width: 612,
        height: 792,
        elements: [],
        text: 'Depth 2.0 m SPT N 12 silty sand',
        tables: ['| Depth | SPT N |\n| 2.0 m | 12 |'],
        formulas: [],
        images: [],
      }],
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      latencyMs: 25,
      warnings: [],
    });
    const visionTranscribe = vi.fn();

    const result = await recoverDocumentTextHint({
      imageBase64: Buffer.from('fake-image').toString('base64'),
      mimeType: 'image/png',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      layoutParse,
      visionTranscribe,
    });

    expect(result.source).toBe('glm-ocr');
    expect(result.textHint).toContain('SPT N 12');
    expect(result.layout?.pages[0]?.tables[0]).toContain('Depth');
    expect(layoutParse).toHaveBeenCalledTimes(1);
    expect(visionTranscribe).not.toHaveBeenCalled();
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
        allowLayoutOcr: false,
        visionTranscribe,
      });

      expect(result.source).toBe('pdfjs-text');
      expect(result.textHint).toMatch(/competent bedrock/i);
      expect(result.textHint).toMatch(/RESULTS/i);
      expect(visionTranscribe).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 15_000);

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
      allowLayoutOcr: false,
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toMatch(/Chain of Custody/i);
    expect(result.textHint).toMatch(/Sample ID/i);
    expect(result.warnings.join(' ')).toMatch(/chunking a dense document image/i);
    expect(visionTranscribe).toHaveBeenCalledTimes(3);
  });

  it('tries detected preprocessing region crops before generic dense-page chunking', async () => {
    const svg = `
      <svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1100" fill="white"/>
        <g stroke="black" stroke-width="3">
          <rect x="120" y="100" width="400" height="400" fill="none"/>
          <line x1="120" y1="200" x2="520" y2="200"/>
          <line x1="120" y1="300" x2="520" y2="300"/>
          <line x1="120" y1="400" x2="520" y2="400"/>
          <line x1="220" y1="100" x2="220" y2="500"/>
          <line x1="320" y1="100" x2="320" y2="500"/>
          <line x1="420" y1="100" x2="420" y2="500"/>
        </g>
        <g fill="black">
          <rect x="650" y="850" width="120" height="10"/>
          <rect x="650" y="875" width="90" height="10"/>
        </g>
      </svg>
    `;
    const imageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const visionTranscribe = vi.fn()
      .mockResolvedValueOnce({
        text: 'short',
        warnings: [],
        usedFallback: false,
        latencyMs: 20,
      })
      .mockResolvedValueOnce({
        text: 'BH-12 depth 0.0 to 2.0 m silty sand SPT N 12 groundwater not reported',
        warnings: [],
        usedFallback: false,
        latencyMs: 30,
      });

    const result = await recoverDocumentTextHint({
      imageBase64: imageBuffer.toString('base64'),
      mimeType: 'image/png',
      config: {
        provider: 'hosted-beta',
        apiKey: '',
      },
      allowLayoutOcr: false,
      visionTranscribe,
    });

    expect(result.source).toBe('vision-ocr');
    expect(result.textHint).toMatch(/BH-12 depth/i);
    expect(result.warnings.join(' ')).toMatch(/preprocessed region crop/i);
    expect(result.warnings.join(' ')).not.toMatch(/chunking a dense document image/i);
    expect(result.preprocessing?.regions.some((region) => region.id === 'table-log-panel-candidate' && region.asset?.dataBase64)).toBe(true);
    expect(visionTranscribe).toHaveBeenCalledTimes(2);
  });

  it('routes region-v2 crops into vision OCR before full-page extraction', async () => {
    const previousMode = process.env.GEOTECHCLI_PREPROCESSING_MODE;
    process.env.GEOTECHCLI_PREPROCESSING_MODE = 'region-v2';
    const svg = `
      <svg width="1100" height="1000" xmlns="http://www.w3.org/2000/svg">
        <rect width="1100" height="1000" fill="white"/>
        <g stroke="black" stroke-width="4" fill="none">
          <rect x="90" y="90" width="280" height="790"/>
          <line x1="90" y1="220" x2="370" y2="220"/>
          <line x1="90" y1="350" x2="370" y2="350"/>
          <line x1="90" y1="480" x2="370" y2="480"/>
          <line x1="90" y1="610" x2="370" y2="610"/>
          <line x1="90" y1="740" x2="370" y2="740"/>
          <line x1="180" y1="90" x2="180" y2="880"/>
          <line x1="280" y1="90" x2="280" y2="880"/>
          <rect x="510" y="120" width="470" height="380"/>
          <line x1="510" y1="245" x2="980" y2="245"/>
          <line x1="510" y1="370" x2="980" y2="370"/>
          <line x1="665" y1="120" x2="665" y2="500"/>
          <line x1="820" y1="120" x2="820" y2="500"/>
        </g>
      </svg>
    `;
    const imageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const visionTranscribe = vi.fn().mockResolvedValue({
      text: 'BH-01 0.0 to 2.0 m fill 2.0 to 5.0 m clay SPT N 12 groundwater not reported',
      warnings: [],
      usedFallback: false,
      latencyMs: 30,
    });

    try {
      const result = await recoverDocumentTextHint({
        imageBase64: imageBuffer.toString('base64'),
        mimeType: 'image/png',
        config: {
          provider: 'hosted-beta',
          apiKey: '',
        },
        allowLayoutOcr: false,
        visionTranscribe,
      });

      expect(result.source).toBe('vision-ocr');
      expect(result.preprocessing?.policy).toBe('region-v2');
      expect(result.textHint).toMatch(/BH-01/);
      expect(result.warnings.join(' ')).toMatch(/preprocessed region crop/i);
      expect(result.preprocessing?.regions.some((region) => region.id.startsWith('region-v2-') && region.asset?.dataBase64)).toBe(true);
      const regionAssetCount = result.preprocessing?.regions.filter((region) =>
        region.id !== 'normalized-full-page'
        && region.id !== 'original-full-page'
        && region.asset?.dataBase64,
      ).length ?? 0;
      expect(visionTranscribe).toHaveBeenCalledTimes(regionAssetCount);
    } finally {
      if (previousMode === undefined) {
        delete process.env.GEOTECHCLI_PREPROCESSING_MODE;
      } else {
        process.env.GEOTECHCLI_PREPROCESSING_MODE = previousMode;
      }
    }
  });

  it('keeps region-v2 preprocessing metadata when GLM-OCR layout succeeds first', async () => {
    const previousMode = process.env.GEOTECHCLI_PREPROCESSING_MODE;
    process.env.GEOTECHCLI_PREPROCESSING_MODE = 'region-v2';
    const svg = `
      <svg width="1100" height="1000" xmlns="http://www.w3.org/2000/svg">
        <rect width="1100" height="1000" fill="white"/>
        <g stroke="black" stroke-width="4" fill="none">
          <rect x="90" y="90" width="280" height="790"/>
          <line x1="90" y1="220" x2="370" y2="220"/>
          <line x1="90" y1="350" x2="370" y2="350"/>
          <line x1="90" y1="480" x2="370" y2="480"/>
          <line x1="90" y1="610" x2="370" y2="610"/>
          <line x1="90" y1="740" x2="370" y2="740"/>
          <line x1="180" y1="90" x2="180" y2="880"/>
          <line x1="280" y1="90" x2="280" y2="880"/>
          <rect x="510" y="120" width="470" height="380"/>
          <line x1="510" y1="245" x2="980" y2="245"/>
          <line x1="510" y1="370" x2="980" y2="370"/>
          <line x1="665" y1="120" x2="665" y2="500"/>
          <line x1="820" y1="120" x2="820" y2="500"/>
        </g>
      </svg>
    `;
    const imageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const layoutParse = vi.fn().mockResolvedValue({
      text: 'BH-01 borehole log layout OCR recovered table values. SPT N equals 12 and groundwater is not reported.',
      markdown: '',
      pages: [{
        pageNumber: 1,
        width: 1100,
        height: 1000,
        text: 'BH-01 SPT N equals 12',
        tables: ['| Depth | SPT |'],
        formulas: [],
        images: [],
        elements: [{
          index: 1,
          label: 'table',
          bbox2d: [0.1, 0.1, 0.8, 0.4],
          content: '| Depth | SPT |',
          confidence: null,
        }],
      }],
      warnings: [],
      latencyMs: 20,
    });

    try {
      const result = await recoverDocumentTextHint({
        imageBase64: imageBuffer.toString('base64'),
        mimeType: 'image/png',
        config: {
          provider: 'hosted-beta',
          apiKey: '',
        },
        layoutParse,
        visionTranscribe: vi.fn(),
      });

      expect(result.source).toBe('glm-ocr');
      expect(result.preprocessing?.policy).toBe('region-v2');
      expect(result.preprocessing?.regions.some((region) => region.id.startsWith('region-v2-') && region.asset?.dataBase64)).toBe(true);
      expect(result.layout?.pages[0]?.elements).toHaveLength(1);
      expect(layoutParse).toHaveBeenCalledTimes(1);
      expect(layoutParse.mock.calls[0]?.[1]).toBe('image/png');
      expect(layoutParse.mock.calls[0]?.[0]).not.toBe(imageBuffer.toString('base64'));
    } finally {
      if (previousMode === undefined) {
        delete process.env.GEOTECHCLI_PREPROCESSING_MODE;
      } else {
        process.env.GEOTECHCLI_PREPROCESSING_MODE = previousMode;
      }
    }
  });
});

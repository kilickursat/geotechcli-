import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { readVisionPdfPageInputs } from '../src/util/vision-output.js';

describe('vision PDF input utilities', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('splits a multi-page PDF into page-level vision inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-pdf-pages-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'borehole-log.pdf');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      const page = pdf.addPage([595, 842]);
      page.drawText(`BH-01 Page ${pageIndex + 1}`, { x: 40, y: 780, size: 16, font });
      page.drawText(`${pageIndex * 5} - ${(pageIndex + 1) * 5} m Silty CL`, { x: 40, y: 740, size: 12, font });
    }

    await writeFile(pdfPath, await pdf.save());

    const pages = await readVisionPdfPageInputs(pdfPath);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.pageNumber).toBe(1);
    expect(pages[2]?.pageNumber).toBe(3);
    expect(pages.every((page) => page.totalPages === 3)).toBe(true);
    expect(pages.every((page) => page.mimeType === 'application/pdf')).toBe(true);
    expect(pages.every((page) => page.base64.length > 0)).toBe(true);
  });
});

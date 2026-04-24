import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectPdfDocument } from '@geotechcli/core';
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

  it('prefers extracted raster images for scanned/image-only PDF pages when inspection is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-pdf-raster-pages-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'scanned-log.pdf');
    await writeFile(pdfPath, await createImageOnlyPdfBuffer());

    const inspection = inspectPdfDocument(pdfPath);
    expect(inspection.pages[0]?.classification).toBe('image-only');

    const pages = await readVisionPdfPageInputs(pdfPath, { inspection });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.mimeType).toMatch(/^image\//);
    expect(pages[0]?.kind).toBe('image');
    expect(pages[0]?.sourceKind).toBe('raster-image');
    expect(pages[0]?.base64.length).toBeGreaterThan(0);
  }, 15_000);

  it('keeps digital pages as PDF slices while routing scanned pages to raster-image inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-pdf-mixed-pages-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'mixed-log.pdf');
    await writeFile(pdfPath, await createMixedPdfBuffer());

    const inspection = inspectPdfDocument(pdfPath);
    expect(inspection.pages.map((page) => page.classification)).toEqual([
      'digital-text',
      'image-only',
    ]);

    const pages = await readVisionPdfPageInputs(pdfPath, { inspection });
    expect(pages).toHaveLength(2);
    expect(pages[0]?.mimeType).toBe('application/pdf');
    expect(pages[0]?.kind).toBe('pdf');
    expect(pages[0]?.sourceKind).toBe('pdf-page');
    expect(pages[1]?.mimeType).toMatch(/^image\//);
    expect(pages[1]?.kind).toBe('image');
    expect(pages[1]?.sourceKind).toBe('raster-image');
  }, 15_000);

  it('routes a report packet cover/log/scanned continuation sequence through the expected page input kinds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-pdf-packet-pages-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'packet-log.pdf');
    await writeFile(pdfPath, await createReportPacketPdfBuffer());

    const inspection = inspectPdfDocument(pdfPath);
    expect(inspection.pages.map((page) => page.classification)).toEqual([
      'digital-text',
      'digital-text',
      'image-only',
    ]);

    const pages = await readVisionPdfPageInputs(pdfPath, { inspection });
    expect(pages).toHaveLength(3);
    expect(pages[0]?.sourceKind).toBe('pdf-page');
    expect(pages[1]?.sourceKind).toBe('pdf-page');
    expect(pages[2]?.sourceKind).toBe('raster-image');
    expect(pages[2]?.mimeType).toMatch(/^image\//);
  }, 15_000);
});

async function createImageOnlyPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocumentKit } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocumentKit({
      autoFirstPage: false,
      compress: true,
      margin: 0,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    doc.addPage({ size: [595, 842], margin: 0 });
    doc.image(pngBytes, 0, 0, { width: 595, height: 842 });
    doc.end();
  });
}

async function createMixedPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocumentKit } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocumentKit({
      autoFirstPage: false,
      compress: true,
      margin: 0,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(16).text('BH-11 Page 1');
    doc.fontSize(12).text('0 - 4 m Silty sand');

    doc.addPage({ size: [595, 842], margin: 0 });
    doc.image(pngBytes, 0, 0, { width: 595, height: 842 });
    doc.end();
  });
}

async function createReportPacketPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocumentKit } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocumentKit({
      autoFirstPage: false,
      compress: true,
      margin: 0,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(18).text('Project Alpha Cover Sheet');
    doc.fontSize(12).text('Revision A');

    doc.addPage({ size: [612, 792], margin: 48 });
    doc.fontSize(16).text('BH-21 Page 1');
    doc.fontSize(12).text('0 - 5 m Silty sand');

    doc.addPage({ size: [595, 842], margin: 0 });
    doc.image(pngBytes, 0, 0, { width: 595, height: 842 });
    doc.end();
  });
}

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDocumentPdfPageInputs } from '../src/ingest/document-inputs.js';
import { assessPdfTextQuality, inspectPdfDocument, extractPrimaryPdfPageImages, renderPdfPageImage } from '../src/ingest/pdf.js';

interface TestPdfPage {
  size?: [number, number];
  lines: string[];
}

describe('inspectPdfDocument', { timeout: 15000 }, () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('classifies a simple digital PDF page and extracts native text', async () => {
    const pdfBuffer = await createPdfBuffer([
      {
        lines: [
          'BH-01 Page 1',
          '0 - 5 m Silty CL',
          'Groundwater observed at 1.5 m',
        ],
      },
    ]);

    const inspection = inspectPdfDocument(pdfBuffer);

    expect(inspection.totalPages).toBe(1);
    expect(inspection.capabilities.nativeTextExtraction).toBe('available');
    expect(inspection.capabilities.ocr).toBe('unavailable');
    expect(inspection.metadata.pdfVersion).toBeTruthy();

    const page = inspection.pages[0];
    expect(page.pageNumber).toBe(1);
    expect(page.totalPages).toBe(1);
    expect(page.classification).toBe('digital-text');
    expect(page.extractedText).toContain('BH-01 Page 1');
    expect(page.extractedText).toContain('0 - 5 m Silty CL');
    expect(page.extractedText).toContain('Groundwater observed at 1.5 m');
    expect(page.normalizedArtifact.nativeText).toContain('BH-01 Page 1');
    expect(page.normalizedArtifact.textSource).toBe('native-text');
    expect(page.normalizedArtifact.textQuality.accepted).toBe(true);
    expect(page.gracefulDegradationNotes).toEqual([]);
    expect(page.capabilities.nativeTextExtraction).toBe('available');
    expect(page.capabilities.pageRendering).toBe('available');
    expect(page.metadata.characterCount).toBeGreaterThan(20);
    expect(page.metadata.wordCount).toBeGreaterThan(5);
    expect(page.metadata.contentStreamCount).toBe(1);
    expect(page.metadata.decodedContentStreamCount).toBe(1);
    expect(page.metadata.fontNames).toContain('Helvetica');
    expect(page.metadata.hasTextOperators).toBe(true);
    expect(page.metadata.hasRasterImages).toBe(false);
  });

  it('exposes per-page metadata for a multi-page document through the main entry point', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-pdf-ingest-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'multi-page-log.pdf');
    const pdfBuffer = await createPdfBuffer([
      {
        size: [612, 792],
        lines: ['BH-07 Page 1', '0 - 4 m Sandy SILT'],
      },
      {
        size: [500, 700],
        lines: ['BH-07 Page 2', '4 - 9 m CLAY with gravel'],
      },
      {
        size: [700, 500],
        lines: ['BH-07 Page 3', '9 - 14 m Dense SAND'],
      },
    ]);
    await writeFile(pdfPath, pdfBuffer);

    const inspection = inspectPdfDocument(pdfPath);

    expect(inspection.totalPages).toBe(3);
    expect(inspection.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(inspection.pages.every((page) => page.totalPages === 3)).toBe(true);
    expect(inspection.pages.every((page) => page.classification === 'digital-text')).toBe(true);
    expect(inspection.gracefulDegradationNotes).toEqual([]);
    expect(inspection.metadata.objectCount).toBeGreaterThan(0);

    expect(inspection.pages[0]?.metadata.width).toBe(612);
    expect(inspection.pages[0]?.metadata.height).toBe(792);
    expect(inspection.pages[1]?.metadata.width).toBe(500);
    expect(inspection.pages[1]?.metadata.height).toBe(700);
    expect(inspection.pages[2]?.metadata.width).toBe(700);
    expect(inspection.pages[2]?.metadata.height).toBe(500);

    expect(inspection.pages[1]?.extractedText).toContain('BH-07 Page 2');
    expect(inspection.pages[1]?.extractedText).toContain('4 - 9 m CLAY with gravel');
    expect(inspection.pages[2]?.metadata.objectRef).toMatch(/\d+ \d+ R/);
    expect(inspection.pages[2]?.metadata.contentFilters).toContain('FlateDecode');
    expect(inspection.pages[2]?.metadata.lineCount).toBeGreaterThanOrEqual(2);
  });

  it('extracts the primary raster image from an image-only PDF page', async () => {
    const pdfBytes = await createImageOnlyPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);
    expect(inspection.pages[0]?.classification).toBe('image-only');

    const images = await extractPrimaryPdfPageImages(pdfBytes);
    expect(images).toHaveLength(1);
    expect(images[0]?.pageNumber).toBe(1);
    expect(images[0]?.mimeType).toMatch(/^image\//);
    expect(images[0]?.byteLength).toBeGreaterThan(0);
  });

  it('renders a full-page raster fallback for an image-only PDF page', async () => {
    const pdfBytes = await createImageOnlyPdfBuffer();
    const rendered = await renderPdfPageImage(pdfBytes, 1);

    expect(rendered).not.toBeNull();
    expect(rendered?.source).toBe('page-render');
    expect(rendered?.mimeType).toMatch(/^image\//);
    expect(rendered?.byteLength).toBeGreaterThan(0);
  });

  it('normalizes inline-image-only subset pages to raster instead of raw application/pdf', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-inline-image-pdf-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'inline-image-only.pdf');
    const pdfBytes = createInlineImageOnlyPdfBuffer();
    await writeFile(pdfPath, pdfBytes);

    const inspection = inspectPdfDocument(pdfBytes);
    const extractedImages = await extractPrimaryPdfPageImages(pdfBytes);
    const pageInputs = await readDocumentPdfPageInputs(pdfPath, { inspection });

    expect(inspection.pages[0]?.classification).toBe('image-only');
    expect(extractedImages).toHaveLength(0);
    expect(pageInputs).toHaveLength(1);
    expect(pageInputs[0]?.mimeType).toBe('image/png');
    expect(pageInputs[0]?.kind).toBe('image');
    expect(pageInputs[0]?.sourceKind).toBe('raster-image');
    expect(pageInputs[0]?.normalizedArtifact.source).toBe('full-page-raster');
    expect(pageInputs[0]?.normalizedArtifact.textSource).toBe('none');
  });

  it('can force PDF pages to raster images for providers without native PDF support', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-force-raster-pdf-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'digital-text.pdf');
    const pdfBytes = await createPdfBuffer([
      {
        lines: [
          'BH-09 Page 1',
          '0 - 2 m sandy clay',
        ],
      },
    ]);
    await writeFile(pdfPath, pdfBytes);

    const inspection = inspectPdfDocument(pdfBytes);
    const pageInputs = await readDocumentPdfPageInputs(pdfPath, {
      inspection,
      forceRasterImages: true,
      dependencies: {
        extractPageImages: async () => [],
        renderPageImage: async () => ({
          pageNumber: 1,
          totalPages: 1,
          objectRef: 'page-render:1',
          mimeType: 'image/png',
          width: 612,
          height: 792,
          byteLength: 4,
          source: 'page-render',
          warnings: [],
          data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        }),
      },
    });

    expect(inspection.pages[0]?.classification).toBe('digital-text');
    expect(pageInputs).toHaveLength(1);
    expect(pageInputs[0]?.mimeType).toBe('image/png');
    expect(pageInputs[0]?.kind).toBe('image');
    expect(pageInputs[0]?.sourceKind).toBe('raster-image');
    expect(pageInputs[0]?.normalizedArtifact.source).toBe('full-page-raster');
    expect(pageInputs[0]?.normalizedArtifact.textSource).toBe('native-text');
  });

  it('rerenders extracted raster payloads that are not provider-safe images', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-unsafe-raster-pdf-'));
    tempDirs.push(dir);

    const pdfPath = join(dir, 'unsafe-raster.pdf');
    const pdfBytes = await createImageOnlyPdfBuffer();
    await writeFile(pdfPath, pdfBytes);

    const inspection = inspectPdfDocument(pdfBytes);
    const renderedPage = await renderPdfPageImage(pdfBytes, 1);

    expect(renderedPage).not.toBeNull();

    const pageInputs = await readDocumentPdfPageInputs(pdfPath, {
      inspection,
      dependencies: {
        extractPageImages: async () => [{
          pageNumber: 1,
          totalPages: 1,
          objectRef: '7 0 R',
          mimeType: 'image/jp2',
          width: 1600,
          height: 2200,
          byteLength: 4,
          source: 'xobject-image',
          warnings: [],
          data: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
        }],
        renderPageImage: async () => renderedPage,
      },
    });

    expect(pageInputs).toHaveLength(1);
    expect(pageInputs[0]?.mimeType).toBe('image/png');
    expect(pageInputs[0]?.sourceKind).toBe('raster-image');
    expect(pageInputs[0]?.normalizedArtifact.source).toBe('full-page-raster');
    expect(pageInputs[0]?.normalizedArtifact.warnings.join(' ')).toMatch(/provider-safe|rerendered/i);
  });

  it('classifies mixed digital and scanned pages independently within one document', async () => {
    const pdfBytes = await createMixedPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);

    expect(inspection.totalPages).toBe(2);
    expect(inspection.pages.map((page) => page.classification)).toEqual([
      'digital-text',
      'image-only',
    ]);
    expect(inspection.capabilities.nativeTextExtraction).toBe('partial');
    expect(inspection.degradation.level).toBe('partial');
    expect(inspection.pages[0]?.normalizedText).toContain('BH-11 Page 1');
    expect(inspection.pages[1]?.metadata.hasRasterImages).toBe(true);
    expect(inspection.pages[1]?.capabilities.nativeTextExtraction).toBe('partial');
  });

  it('treats a scanned page with a useless native text layer as degraded image-only content', async () => {
    const pdfBytes = await createImagePdfWithWhitespaceTextLayer();
    const inspection = inspectPdfDocument(pdfBytes);

    expect(inspection.totalPages).toBe(1);
    expect(inspection.pages[0]?.classification).toBe('image-only');
    expect(inspection.pages[0]?.normalizedText).toBe('');
    expect(inspection.pages[0]?.metadata.hasTextOperators).toBe(true);
    expect(inspection.pages[0]?.metadata.hasRasterImages).toBe(true);
    expect(inspection.pages[0]?.capabilities.nativeTextExtraction).toBe('partial');
    expect(inspection.pages[0]?.normalizedArtifact.textSource).toBe('none');
    expect(inspection.pages[0]?.gracefulDegradationNotes.join(' ')).toMatch(/raster\/ocr fallback/i);
  });

  it('marks garbled native text as low quality instead of trusting it directly', async () => {
    const pdfBuffer = await createPdfBuffer([
      {
        lines: [
          'BH-99',
          '@@@ #### $$$$ %%%% ^^^^',
          'x1x1x1x1 999999999 00A00A00A',
        ],
      },
    ]);

    const inspection = inspectPdfDocument(pdfBuffer);
    const page = inspection.pages[0];

    expect(page?.normalizedText.length).toBeGreaterThan(0);
    expect(page?.classification).toBe('text-unreadable');
    expect(page?.normalizedArtifact.textQuality.accepted).toBe(false);
    expect(page?.normalizedArtifact.textSource).toBe('native-text-low-quality');
    expect(page?.normalizedArtifact.nativeText).toBeNull();
    expect(page?.gracefulDegradationNotes.join(' ')).toMatch(/garbled|rerouted|fallback/i);
  });

  it('rejects long native text with zero recognizable words and heavy encoding noise', () => {
    const quality = assessPdfTextQuality(
      'Dﾄでｯ ﾂ・} ﾃ・v P ] v ﾂ・] v P /ﾅｶﾄ析・> } ﾂ・ﾂ・} ﾂ・ﾃⅨnﾏｳﾏｰﾏｱ ﾃ o } ﾂ・u '
      + '9-+>398 63/8> 63/8> $/0 (+63.+>/. 9>/= +>/ $1H9=E= 449D9?>1< 9>6?B=1D9?> 1F19<12<5 '
      + 'E@?> B5AE5CD ﾃｬ ﾃｭ ﾃｬ ﾃｮ ﾃｬ ﾃｯ ﾃｬ ﾃｰ ﾃｬ ﾃｱ ﾃｬ ﾃｲ ﾃｬ ﾃｳ ﾃｬ ﾃｴ',
    );

    expect(quality.accepted).toBe(false);
    expect(quality.reasons.join(' ')).toMatch(/recognizable word coverage|encoding noise|garbled/i);
  });

  it('preserves extracted text and rotation metadata for a rotated continuation page', async () => {
    const pdfBytes = await createRotatedContinuationPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);

    expect(inspection.totalPages).toBe(2);
    expect(inspection.pages[0]?.classification).toBe('digital-text');
    expect(inspection.pages[1]?.classification).toBe('digital-text');
    expect(inspection.pages[1]?.metadata.rotation).toBe(90);
    expect(inspection.pages[1]?.extractedText).toContain('BH-51 Page 2');
    expect(inspection.pages[1]?.extractedText).toContain('5 - 10 m Clay');
  });

  it('inspects a packet with a cover page, digital borehole page, and scanned continuation page', async () => {
    const pdfBytes = await createReportPacketPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);
    const images = await extractPrimaryPdfPageImages(pdfBytes);

    expect(inspection.totalPages).toBe(3);
    expect(inspection.pages.map((page) => page.classification)).toEqual([
      'digital-text',
      'digital-text',
      'image-only',
    ]);
    expect(inspection.pages[0]?.normalizedText).toContain('Project Alpha Cover Sheet');
    expect(inspection.pages[1]?.normalizedText).toContain('BH-21 Page 1');
    expect(inspection.pages[2]?.metadata.hasRasterImages).toBe(true);
    expect(images).toHaveLength(1);
    expect(images[0]?.pageNumber).toBe(3);
    expect(images[0]?.mimeType).toMatch(/^image\//);
  });

  it('resolves inherited page properties and combines multiple content streams', async () => {
    const pdfBytes = await createInheritedMultiStreamPdfBuffer();
    const inspection = inspectPdfDocument(pdfBytes);

    expect(inspection.totalPages).toBe(1);
    expect(inspection.pages[0]?.classification).toBe('digital-text');
    expect(inspection.pages[0]?.metadata.width).toBe(612);
    expect(inspection.pages[0]?.metadata.height).toBe(792);
    expect(inspection.pages[0]?.metadata.fontNames).toContain('Helvetica');
    expect(inspection.pages[0]?.metadata.contentStreamCount).toBe(2);
    expect(inspection.pages[0]?.metadata.decodedContentStreamCount).toBe(2);
    expect(inspection.pages[0]?.extractedText).toContain('BH-81 Page 1');
    expect(inspection.pages[0]?.extractedText).toContain('0 - 6 m Silty sand');
  });
});

async function createPdfBuffer(pages: TestPdfPage[]): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 48,
    });

    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
    doc.on('error', reject);

    for (const page of pages) {
      doc.addPage({ size: page.size ?? [612, 792], margin: 48 });
      page.lines.forEach((line, index) => {
        doc.fontSize(index === 0 ? 16 : 12);
        doc.text(line);
      });
    }

    doc.end();
  });
}

async function createImageOnlyPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
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

function createInlineImageOnlyPdfBuffer(): Buffer {
  const contentStream = [
    'q',
    '595 0 0 842 0 0 cm',
    'BI',
    '/W 1',
    '/H 1',
    '/BPC 8',
    '/CS /RGB',
    '/F /ASCIIHexDecode',
    'ID',
    'FF0000>',
    'EI',
    'Q',
    '',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /ProcSet [/PDF /ImageC] >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}endstream`,
  ];

  let pdf = '%PDF-1.4\n%\x81\x81\x81\x81\n';
  const offsets: number[] = [0];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

async function createMixedPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
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

async function createImagePdfWithWhitespaceTextLayer(): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(pngBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: 595,
    height: 842,
  });
  page.drawText('   ', {
    x: 24,
    y: 24,
    size: 12,
    font,
  });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function createRotatedContinuationPdfBuffer(): Promise<Buffer> {
  const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const firstPage = pdf.addPage([595, 842]);
  firstPage.drawText('BH-51 Page 1', { x: 40, y: 780, size: 16, font });
  firstPage.drawText('0 - 5 m Silty sand', { x: 40, y: 740, size: 12, font });

  const secondPage = pdf.addPage([595, 842]);
  secondPage.setRotation(degrees(90));
  secondPage.drawText('BH-51 Page 2', { x: 40, y: 780, size: 16, font });
  secondPage.drawText('5 - 10 m Clay', { x: 40, y: 740, size: 12, font });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function createReportPacketPdfBuffer(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2Z0e0AAAAASUVORK5CYII=',
    'base64',
  );

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
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

async function createInheritedMultiStreamPdfBuffer(): Promise<Buffer> {
  const base = await createPdfBuffer([
    {
      lines: ['BH-81 Page 1'],
    },
  ]);

  const source = base.toString('latin1');
  const patchedPage = source.replace(
    /<<\s*\/Type \/Page\s*\/Parent 1 0 R\s*\/MediaBox \[0 0 612 792\]\s*\/Contents 5 0 R\s*\/Resources 6 0 R\s*>>/,
    [
      '<<',
      '/Type /Page',
      '/Parent 1 0 R',
      '/Contents [5 0 R 13 0 R]',
      '>>',
    ].join('\n'),
  );
  const patchedPages = patchedPage.replace(
    /<<\s*\/Type \/Pages\s*\/Count 1\s*\/Kids \[7 0 R\]\s*>>/,
    [
      '<<',
      '/Type /Pages',
      '/Count 1',
      '/Kids [7 0 R]',
      '/MediaBox [0 0 612 792]',
      '/Resources 6 0 R',
      '>>',
    ].join('\n'),
  );

  const secondStreamSource = [
    'BT',
    '/F1 12 Tf',
    '1 0 0 1 48 700 Tm',
    '(0 - 6 m Silty sand) Tj',
    'ET',
  ].join('\n');
  const secondObject = [
    '',
    '13 0 obj',
    '<<',
    `/Length ${Buffer.byteLength(secondStreamSource, 'latin1')}`,
    '>>',
    'stream',
    secondStreamSource,
    'endstream',
    'endobj',
    '',
  ].join('\n');

  const finalSource = patchedPages.includes('\nxref')
    ? patchedPages.replace(/\nxref/, `\n${secondObject}\nxref`)
    : `${patchedPages}\n${secondObject}`;

  return Buffer.from(finalSource, 'latin1');
}

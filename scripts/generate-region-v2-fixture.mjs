#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(
  repoRoot,
  'packages',
  'core',
  'tests',
  'fixtures',
  'geotech-corpus',
  'region-v2-scanned-borehole-table.fixture.pdf',
);

const pageWidth = 1240;
const pageHeight = 1754;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="clay" patternUnits="userSpaceOnUse" width="18" height="18">
      <path d="M0 16 C6 8 12 24 18 16" fill="none" stroke="#111827" stroke-width="1.4"/>
    </pattern>
    <pattern id="sand" patternUnits="userSpaceOnUse" width="14" height="14">
      <circle cx="3" cy="4" r="1.3" fill="#111827"/>
      <circle cx="10" cy="10" r="1.1" fill="#111827"/>
    </pattern>
    <pattern id="rock" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M0 20 L20 0 M-5 5 L5 -5 M15 25 L25 15" stroke="#111827" stroke-width="1.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="#fbfbf7"/>
  <g>
    <text x="96" y="110" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#111827">BH-01 Borehole Log and Lab Table</text>
    <text x="96" y="150" font-family="Arial, sans-serif" font-size="22" fill="#111827">Synthetic image-only PDF fixture for region-v2 preprocessing acceptance</text>

    <g id="borehole-log" stroke="#111827" stroke-width="4" fill="none">
      <rect x="90" y="230" width="270" height="980"/>
      <line x1="90" y1="370" x2="360" y2="370"/>
      <line x1="90" y1="510" x2="360" y2="510"/>
      <line x1="90" y1="650" x2="360" y2="650"/>
      <line x1="90" y1="790" x2="360" y2="790"/>
      <line x1="90" y1="930" x2="360" y2="930"/>
      <line x1="90" y1="1070" x2="360" y2="1070"/>
      <line x1="180" y1="230" x2="180" y2="1210"/>
      <line x1="270" y1="230" x2="270" y2="1210"/>
      <rect x="272" y="372" width="86" height="136" fill="url(#sand)" stroke="none"/>
      <rect x="272" y="512" width="86" height="136" fill="url(#clay)" stroke="none"/>
      <rect x="272" y="652" width="86" height="136" fill="url(#sand)" stroke="none"/>
      <rect x="272" y="792" width="86" height="136" fill="url(#rock)" stroke="none"/>
      <rect x="272" y="932" width="86" height="276" fill="url(#rock)" stroke="none"/>
    </g>

    <g id="lab-table" stroke="#111827" stroke-width="4" fill="none">
      <rect x="500" y="260" width="660" height="520"/>
      <line x1="500" y1="365" x2="1160" y2="365"/>
      <line x1="500" y1="470" x2="1160" y2="470"/>
      <line x1="500" y1="575" x2="1160" y2="575"/>
      <line x1="500" y1="680" x2="1160" y2="680"/>
      <line x1="665" y1="260" x2="665" y2="780"/>
      <line x1="830" y1="260" x2="830" y2="780"/>
      <line x1="995" y1="260" x2="995" y2="780"/>
    </g>

    <g font-family="Arial, sans-serif" font-size="22" fill="#111827">
      <text x="112" y="320" font-weight="700">Depth</text>
      <text x="196" y="320" font-weight="700">SPT</text>
      <text x="286" y="320" font-weight="700">Log</text>
      <text x="520" y="325" font-weight="700">Test</text>
      <text x="690" y="325" font-weight="700">Depth</text>
      <text x="850" y="325" font-weight="700">Value</text>
      <text x="1015" y="325" font-weight="700">Source</text>
      <text x="520" y="430">LL</text><text x="690" y="430">2.0 m</text><text x="850" y="430">46%</text><text x="1015" y="430">BH-01</text>
      <text x="520" y="535">PI</text><text x="690" y="535">2.0 m</text><text x="850" y="535">24%</text><text x="1015" y="535">BH-01</text>
      <text x="520" y="640">SPT N</text><text x="690" y="640">4.5 m</text><text x="850" y="640">18</text><text x="1015" y="640">BH-01</text>
      <text x="520" y="745">RQD</text><text x="690" y="745">8.0 m</text><text x="850" y="745">62%</text><text x="1015" y="745">BH-01</text>
    </g>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, adaptiveFiltering: false })
  .toBuffer();

const pdf = await PDFDocument.create();
pdf.setTitle('Region-v2 scanned borehole table fixture');
pdf.setAuthor('GeotechCLI test fixture generator');
pdf.setSubject('Image-only borehole log and table fixture for preprocessing acceptance');
pdf.setKeywords(['geotechcli', 'region-v2', 'fixture', 'borehole', 'table']);
pdf.setProducer('GeotechCLI fixture generator');
pdf.setCreator('GeotechCLI fixture generator');
pdf.setCreationDate(new Date('2026-05-31T00:00:00.000Z'));
pdf.setModificationDate(new Date('2026-05-31T00:00:00.000Z'));
const page = pdf.addPage([595.28, 841.89]);
const image = await pdf.embedPng(png);
page.drawImage(image, {
  x: 0,
  y: 0,
  width: page.getWidth(),
  height: page.getHeight(),
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, await pdf.save({ useObjectStreams: false }));
console.log(outputPath);

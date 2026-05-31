#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(repoRoot, 'packages', 'core', 'tests', 'fixtures', 'geotech-corpus');

const pageWidth = 1240;
const pageHeight = 1754;

const fixtures = [
  {
    fileName: 'preprocess-v2-cpt-table.fixture.pdf',
    title: 'Preprocessing v2 CPT table fixture',
    rotateDeg: -1.1,
    svg: cptTableSvg(),
  },
  {
    fileName: 'preprocess-v2-lab-table.fixture.pdf',
    title: 'Preprocessing v2 lab table fixture',
    rotateDeg: 0.9,
    svg: labTableSvg(),
  },
  {
    fileName: 'preprocess-v2-mixed-scanned-report.fixture.pdf',
    title: 'Preprocessing v2 mixed scanned report fixture',
    rotateDeg: -0.7,
    svg: mixedReportSvg(),
  },
];

mkdirSync(fixtureDir, { recursive: true });

for (const fixture of fixtures) {
  const png = await sharp(Buffer.from(fixture.svg))
    .rotate(fixture.rotateDeg, { background: '#fbfbf7' })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const pdf = await PDFDocument.create();
  pdf.setTitle(fixture.title);
  pdf.setAuthor('GeotechCLI test fixture generator');
  pdf.setSubject('Image-only preprocessing v2 fixture for broader page-region coverage');
  pdf.setKeywords(['geotechcli', 'preprocessing-v2', 'fixture', 'region-v2']);
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
  const outputPath = join(fixtureDir, fixture.fileName);
  writeFileSync(outputPath, await pdf.save({ useObjectStreams: false }));
  console.log(outputPath);
}

function pageStart(title, subtitle) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#fbfbf7"/>
  <text x="96" y="108" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#111827">${title}</text>
  <text x="96" y="148" font-family="Arial, sans-serif" font-size="21" fill="#111827">${subtitle}</text>`;
}

function pageEnd() {
  return '</svg>';
}

function cptTableSvg() {
  const rows = [300, 390, 480, 570, 660, 750, 840, 930, 1020, 1110, 1200, 1290];
  const cols = [90, 230, 370, 510, 650, 790, 930, 1070, 1160];
  return `${pageStart('CPT-01 Cone Penetration Test Table', 'Synthetic scanned CPT table for preprocessing v2 region coverage')}
  <g stroke="#111827" stroke-width="4" fill="none">
    <rect x="90" y="250" width="1070" height="1040"/>
    ${rows.map((y) => `<line x1="90" y1="${y}" x2="1160" y2="${y}"/>`).join('\n    ')}
    ${cols.slice(1, -1).map((x) => `<line x1="${x}" y1="250" x2="${x}" y2="1290"/>`).join('\n    ')}
  </g>
  <g font-family="Arial, sans-serif" font-size="22" fill="#111827">
    <text x="112" y="285" font-weight="700">Depth</text><text x="250" y="285" font-weight="700">qc</text><text x="390" y="285" font-weight="700">fs</text><text x="530" y="285" font-weight="700">u2</text><text x="670" y="285" font-weight="700">Rf</text><text x="810" y="285" font-weight="700">Ic</text><text x="950" y="285" font-weight="700">Soil</text>
    ${Array.from({ length: 10 }, (_, index) => {
      const y = 360 + index * 90;
      const depth = (index + 1) * 0.5;
      return `<text x="112" y="${y}">${depth.toFixed(1)} m</text><text x="250" y="${y}">${(4.8 + index * 0.7).toFixed(1)}</text><text x="390" y="${y}">${(42 + index * 3)}</text><text x="530" y="${y}">${(95 + index * 12)}</text><text x="670" y="${y}">${(0.9 + index * 0.1).toFixed(1)}</text><text x="810" y="${y}">${(2.1 + index * 0.05).toFixed(2)}</text><text x="950" y="${y}">${index < 4 ? 'sand' : index < 7 ? 'silt' : 'clay'}</text>`;
    }).join('\n    ')}
  </g>
  <g stroke="#111827" stroke-width="3" fill="none">
    <rect x="130" y="1370" width="920" height="180"/>
    <polyline points="150,1510 250,1470 350,1430 450,1405 550,1415 650,1390 750,1378 850,1388 950,1368" />
    <text x="1080" y="1455" font-family="Arial, sans-serif" font-size="22" fill="#111827">qc trend</text>
  </g>
${pageEnd()}`;
}

function labTableSvg() {
  const rows = [315, 420, 525, 630, 735, 840, 945, 1050, 1155];
  const cols = [90, 250, 410, 570, 730, 890, 1050, 1160];
  return `${pageStart('Laboratory Classification and Strength Summary', 'Synthetic scanned lab table for preprocessing v2 region coverage')}
  <g stroke="#111827" stroke-width="4" fill="none">
    <rect x="90" y="250" width="1070" height="905"/>
    ${rows.map((y) => `<line x1="90" y1="${y}" x2="1160" y2="${y}"/>`).join('\n    ')}
    ${cols.slice(1, -1).map((x) => `<line x1="${x}" y1="250" x2="${x}" y2="1155"/>`).join('\n    ')}
  </g>
  <g font-family="Arial, sans-serif" font-size="22" fill="#111827">
    <text x="112" y="292" font-weight="700">Sample</text><text x="270" y="292" font-weight="700">Depth</text><text x="430" y="292" font-weight="700">LL</text><text x="590" y="292" font-weight="700">PI</text><text x="750" y="292" font-weight="700">w%</text><text x="910" y="292" font-weight="700">UCS</text><text x="1065" y="292" font-weight="700">USCS</text>
    ${['BH1-S1','BH1-S2','BH2-S1','BH2-S2','BH3-S1','BH3-S2','BH3-R1','BH3-R2'].map((id, index) => {
      const y = 380 + index * 105;
      return `<text x="112" y="${y}">${id}</text><text x="270" y="${y}">${(1.5 + index * 0.8).toFixed(1)} m</text><text x="430" y="${y}">${42 + index}</text><text x="590" y="${y}">${20 + index}</text><text x="750" y="${y}">${(18.2 + index * 0.7).toFixed(1)}</text><text x="910" y="${y}">${index > 5 ? `${7 + index} MPa` : '-'}</text><text x="1065" y="${y}">${index < 3 ? 'CL' : index < 6 ? 'SM' : 'Rock'}</text>`;
    }).join('\n    ')}
  </g>
  <g stroke="#111827" stroke-width="3" fill="none">
    <rect x="120" y="1260" width="430" height="290"/>
    <line x1="160" y1="1510" x2="510" y2="1295"/>
    <text x="170" y="1325" font-family="Arial, sans-serif" font-size="22" fill="#111827">Plasticity chart</text>
    <rect x="680" y="1260" width="430" height="290"/>
    <polyline points="710,1500 775,1470 840,1450 905,1420 970,1395 1035,1360" />
    <text x="730" y="1325" font-family="Arial, sans-serif" font-size="22" fill="#111827">Strength trend</text>
  </g>
${pageEnd()}`;
}

function mixedReportSvg() {
  return `${pageStart('Mixed Scanned Geotechnical Report Page', 'Synthetic scanned report page with summary, borehole strip, table, and chart regions')}
  <g stroke="#111827" stroke-width="4" fill="none">
    <rect x="90" y="220" width="420" height="300"/>
    <line x1="90" y1="295" x2="510" y2="295"/>
    <line x1="90" y1="370" x2="510" y2="370"/>
    <line x1="90" y1="445" x2="510" y2="445"/>
    <rect x="90" y="610" width="270" height="820"/>
    <line x1="90" y1="770" x2="360" y2="770"/>
    <line x1="90" y1="930" x2="360" y2="930"/>
    <line x1="90" y1="1090" x2="360" y2="1090"/>
    <line x1="90" y1="1250" x2="360" y2="1250"/>
    <line x1="180" y1="610" x2="180" y2="1430"/>
    <line x1="270" y1="610" x2="270" y2="1430"/>
    <rect x="500" y="610" width="660" height="520"/>
    <line x1="500" y1="715" x2="1160" y2="715"/>
    <line x1="500" y1="820" x2="1160" y2="820"/>
    <line x1="500" y1="925" x2="1160" y2="925"/>
    <line x1="500" y1="1030" x2="1160" y2="1030"/>
    <line x1="665" y1="610" x2="665" y2="1130"/>
    <line x1="830" y1="610" x2="830" y2="1130"/>
    <line x1="995" y1="610" x2="995" y2="1130"/>
    <rect x="500" y="1230" width="660" height="300"/>
    <polyline points="535,1490 610,1450 685,1420 760,1390 835,1360 910,1340 985,1310 1060,1288" />
  </g>
  <g font-family="Arial, sans-serif" font-size="22" fill="#111827">
    <text x="112" y="267" font-weight="700">Risk</text><text x="250" y="267" font-weight="700">Evidence</text>
    <text x="112" y="340">Fill</text><text x="250" y="340">0.0-1.8 m</text>
    <text x="112" y="415">GW</text><text x="250" y="415">not found</text>
    <text x="112" y="490">Rock</text><text x="250" y="490">8.2 m</text>
    <text x="112" y="660" font-weight="700">Depth</text><text x="196" y="660" font-weight="700">SPT</text><text x="286" y="660" font-weight="700">Log</text>
    <text x="520" y="675" font-weight="700">Parameter</text><text x="690" y="675" font-weight="700">Depth</text><text x="850" y="675" font-weight="700">Value</text><text x="1015" y="675" font-weight="700">Page</text>
    <text x="520" y="780">SPT N</text><text x="690" y="780">3.0 m</text><text x="850" y="780">12</text><text x="1015" y="780">12</text>
    <text x="520" y="885">PI</text><text x="690" y="885">2.2 m</text><text x="850" y="885">26%</text><text x="1015" y="885">15</text>
    <text x="520" y="990">RQD</text><text x="690" y="990">8.5 m</text><text x="850" y="990">48%</text><text x="1015" y="990">18</text>
    <text x="520" y="1095">UCS</text><text x="690" y="1095">9.0 m</text><text x="850" y="1095">11 MPa</text><text x="1015" y="1095">20</text>
    <text x="540" y="1288">SPT-depth plot</text>
  </g>
${pageEnd()}`;
}

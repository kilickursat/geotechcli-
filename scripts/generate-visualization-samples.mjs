import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const outputDir = resolve('samples', 'visualization');
mkdirSync(outputDir, { recursive: true });

const settlementProfile = [
  { distance_m: -30, settlement_mm: 1.1, heave_mm: 0.0, trigger_ratio: 0.12 },
  { distance_m: -24, settlement_mm: 2.4, heave_mm: 0.0, trigger_ratio: 0.18 },
  { distance_m: -18, settlement_mm: 4.8, heave_mm: 0.1, trigger_ratio: 0.29 },
  { distance_m: -12, settlement_mm: 8.6, heave_mm: 0.2, trigger_ratio: 0.42 },
  { distance_m: -6, settlement_mm: 13.1, heave_mm: 0.4, trigger_ratio: 0.61 },
  { distance_m: 0, settlement_mm: 15.4, heave_mm: 0.5, trigger_ratio: 0.74 },
  { distance_m: 6, settlement_mm: 13.0, heave_mm: 0.4, trigger_ratio: 0.59 },
  { distance_m: 12, settlement_mm: 8.2, heave_mm: 0.2, trigger_ratio: 0.39 },
  { distance_m: 18, settlement_mm: 4.4, heave_mm: 0.1, trigger_ratio: 0.26 },
  { distance_m: 24, settlement_mm: 2.1, heave_mm: 0.0, trigger_ratio: 0.16 },
  { distance_m: 30, settlement_mm: 0.9, heave_mm: 0.0, trigger_ratio: 0.10 },
];

const liquefactionDepth = [
  { depth_m: 2, factor_of_safety: 1.42, csr: 0.182, crr: 0.258, n160cs: 17.5 },
  { depth_m: 4, factor_of_safety: 1.08, csr: 0.215, crr: 0.233, n160cs: 14.2 },
  { depth_m: 6, factor_of_safety: 0.86, csr: 0.241, crr: 0.208, n160cs: 11.8 },
  { depth_m: 8, factor_of_safety: 0.74, csr: 0.254, crr: 0.188, n160cs: 10.1 },
  { depth_m: 10, factor_of_safety: 0.95, csr: 0.236, crr: 0.224, n160cs: 13.7 },
  { depth_m: 12, factor_of_safety: 1.21, csr: 0.201, crr: 0.244, n160cs: 16.4 },
];

const pileProfile = [
  { depth_m: 0, unit_shaft_friction_kpa: 18, shaft_resistance_kn: 42, cumulative_shaft_kn: 42 },
  { depth_m: 2, unit_shaft_friction_kpa: 26, shaft_resistance_kn: 61, cumulative_shaft_kn: 103 },
  { depth_m: 4, unit_shaft_friction_kpa: 34, shaft_resistance_kn: 80, cumulative_shaft_kn: 183 },
  { depth_m: 6, unit_shaft_friction_kpa: 41, shaft_resistance_kn: 96, cumulative_shaft_kn: 279 },
  { depth_m: 8, unit_shaft_friction_kpa: 49, shaft_resistance_kn: 113, cumulative_shaft_kn: 392 },
  { depth_m: 10, unit_shaft_friction_kpa: 57, shaft_resistance_kn: 131, cumulative_shaft_kn: 523 },
  { depth_m: 12, unit_shaft_friction_kpa: 64, shaft_resistance_kn: 147, cumulative_shaft_kn: 670 },
];

function rowsToCsv(rows) {
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => row[header]).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

writeFileSync(resolve(outputDir, 'geotech-viz-showcase.csv'), rowsToCsv(settlementProfile), 'utf-8');

const workbook = new ExcelJS.Workbook();
workbook.creator = 'geotechCLI';
workbook.created = new Date('2026-04-14T00:00:00Z');

function addSheet(name, rows) {
  const sheet = workbook.addWorksheet(name);
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(14, header.length + 2),
  }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

addSheet('settlement_profile', settlementProfile);
addSheet('liquefaction_depth', liquefactionDepth);
addSheet('pile_capacity_profile', pileProfile);

await workbook.xlsx.writeFile(resolve(outputDir, 'geotech-viz-showcase.xlsx'));

console.log(`Generated visualization samples in ${outputDir}`);

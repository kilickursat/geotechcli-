import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { TabularCell, TabularRow } from './csv.js';

export interface ParsedWorkbookSheet {
  name: string;
  rows: TabularRow[];
  totalRowsSampled: number;
  warnings: string[];
}

export interface ParsedWorkbook {
  sheets: ParsedWorkbookSheet[];
  warnings: string[];
}

interface SheetRef {
  name: string;
  relId: string;
}

const DEFAULT_MAX_ROWS = 200;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ''));
}

function getZipText(entries: Record<string, Uint8Array>, name: string): string | undefined {
  const normalized = name.replace(/^\/+/, '');
  const entry = entries[normalized];
  return entry ? strFromU8(entry) : undefined;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function parseSharedStrings(xml?: string): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;

  while ((match = siPattern.exec(xml)) !== null) {
    const segment = match[1];
    const texts = [...segment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXml(textMatch[1]));
    strings.push(texts.length > 0 ? texts.join('') : stripTags(segment));
  }

  return strings;
}

function parseWorkbookSheets(workbookXml?: string): SheetRef[] {
  if (!workbookXml) return [];
  const sheets: SheetRef[] = [];
  const sheetPattern = /<sheet\b([^>]+?)\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = sheetPattern.exec(workbookXml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const relId = attrs['r:id'];
    if (attrs.name && relId) {
      sheets.push({ name: attrs.name, relId });
    }
  }

  return sheets;
}

function parseWorkbookRelationships(relsXml?: string): Map<string, string> {
  const rels = new Map<string, string>();
  if (!relsXml) return rels;
  const relPattern = /<Relationship\b([^>]+?)\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = relPattern.exec(relsXml)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) {
      const target = attrs.Target.startsWith('/xl/') ? attrs.Target.slice(1) : `xl/${attrs.Target.replace(/^\/+/, '')}`;
      rels.set(attrs.Id, target.replace(/\\/g, '/'));
    }
  }

  return rels;
}

function columnIndexFromRef(cellRef: string): number {
  const letters = (cellRef.match(/^[A-Z]+/i)?.[0] ?? '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function coerceCell(value: string): TabularCell {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);
  const parsed = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(parsed) && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed.replace(/,/g, ''))) {
    return parsed;
  }
  return trimmed;
}

function getCellValue(cellXml: string, sharedStrings: string[]): TabularCell {
  const openTag = cellXml.match(/^<c\b([^>]*)>/)?.[1] ?? '';
  const attrs = parseAttributes(openTag);
  const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];

  if (attrs.t === 's' && rawValue != null) {
    return sharedStrings[Number(rawValue)] ?? null;
  }

  if (attrs.t === 'inlineStr') {
    const inlineText = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join('');
    return inlineText.trim() ? inlineText : null;
  }

  if (attrs.t === 'str' && rawValue != null) {
    return decodeXml(rawValue);
  }

  if (attrs.t === 'b' && rawValue != null) {
    return rawValue.trim() === '1';
  }

  return rawValue == null ? null : coerceCell(decodeXml(rawValue));
}

function uniquifyHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function parseWorksheet(name: string, xml: string, sharedStrings: string[], maxRows: number): ParsedWorkbookSheet {
  const warnings: string[] = [];
  const matrix: TabularCell[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    if (matrix.length > maxRows + 1) {
      warnings.push(`Sampled first ${maxRows} data rows from sheet "${name}".`);
      break;
    }

    const rowCells: TabularCell[] = [];
    const cellPattern = /<c\b[^>]*>[\s\S]*?<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const ref = cellMatch[0].match(/^<c\b[^>]*\br="([^"]+)"/)?.[1];
      const columnIndex = ref ? columnIndexFromRef(ref) : rowCells.length;
      rowCells[columnIndex] = getCellValue(cellMatch[0], sharedStrings);
    }

    if (rowCells.some((cell) => cell != null && String(cell).trim().length > 0)) {
      matrix.push(rowCells);
    }
  }

  if (matrix.length === 0) {
    return { name, rows: [], totalRowsSampled: 0, warnings: [...warnings, `Sheet "${name}" has no readable rows.`] };
  }

  const headers = uniquifyHeaders(matrix[0].map((cell, index) => String(cell ?? `Column ${index + 1}`).trim()));
  const rows = matrix.slice(1, maxRows + 1).map((cells) => {
    const row: TabularRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? null;
    });
    return row;
  }).filter((row) => Object.values(row).some((cell) => cell != null && String(cell).trim().length > 0));

  return { name, rows, totalRowsSampled: rows.length, warnings };
}

export async function parseXlsxFile(filePath: string, options: { maxRows?: number } = {}): Promise<ParsedWorkbook> {
  const warnings: string[] = [];
  const bytes = await readFile(filePath);
  const entries = unzipSync(new Uint8Array(bytes));
  const workbookXml = getZipText(entries, 'xl/workbook.xml');
  const relsXml = getZipText(entries, 'xl/_rels/workbook.xml.rels');
  const sharedStrings = parseSharedStrings(getZipText(entries, 'xl/sharedStrings.xml'));
  const sheetRefs = parseWorkbookSheets(workbookXml);
  const rels = parseWorkbookRelationships(relsXml);
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);

  if (sheetRefs.length === 0) {
    warnings.push('Workbook sheet metadata was not found.');
  }

  const sheetPaths = sheetRefs.length > 0
    ? sheetRefs.map((sheet, index) => ({
        name: sheet.name,
        path: rels.get(sheet.relId) ?? `xl/worksheets/sheet${index + 1}.xml`,
      }))
    : Object.keys(entries)
        .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry))
        .sort()
        .map((path, index) => ({ name: `Sheet ${index + 1}`, path }));

  const sheets: ParsedWorkbookSheet[] = [];
  for (const sheet of sheetPaths) {
    const xml = getZipText(entries, sheet.path);
    if (!xml) {
      warnings.push(`Worksheet XML missing for "${sheet.name}".`);
      continue;
    }
    sheets.push(parseWorksheet(sheet.name, xml, sharedStrings, maxRows));
  }

  return { sheets, warnings };
}

import { readFile } from 'node:fs/promises';

export type TabularCell = string | number | boolean | null;
export type TabularRow = Record<string, TabularCell>;

export interface ParseDelimitedOptions {
  delimiter?: string;
  maxRows?: number;
}

export interface ParsedDelimitedTable {
  headers: string[];
  rows: TabularRow[];
  totalRowsSampled: number;
  delimiter: string;
  warnings: string[];
}

const DEFAULT_MAX_ROWS = 200;

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function detectDelimiter(line: string): string {
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;

  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && char === candidate) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

export function parseDelimitedLine(line: string, delimiter = ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function uniquifyHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((rawHeader, index) => {
    const fallback = `Column ${index + 1}`;
    const base = rawHeader.trim() || fallback;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function coerceCell(value: string): TabularCell {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);

  const normalizedNumber = trimmed.replace(/,/g, '');
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalizedNumber)) {
    const parsed = Number(normalizedNumber);
    if (Number.isFinite(parsed)) return parsed;
  }

  return trimmed;
}

export function parseDelimitedContent(
  content: string,
  options: ParseDelimitedOptions = {},
): ParsedDelimitedTable {
  const warnings: string[] = [];
  const lines = normalizeLineEndings(content)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], totalRowsSampled: 0, delimiter: options.delimiter ?? ',', warnings: ['No tabular rows found.'] };
  }

  const delimiter = options.delimiter ?? detectDelimiter(lines[0]);
  const headers = uniquifyHeaders(parseDelimitedLine(lines[0], delimiter));
  const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
  const rows: TabularRow[] = [];

  for (const line of lines.slice(1, maxRows + 1)) {
    const cells = parseDelimitedLine(line, delimiter);
    const row: TabularRow = {};
    headers.forEach((header, index) => {
      row[header] = coerceCell(cells[index] ?? '');
    });
    if (Object.values(row).some((value) => value !== null && String(value).trim().length > 0)) {
      rows.push(row);
    }
  }

  if (lines.length - 1 > maxRows) {
    warnings.push(`Sampled first ${maxRows} data rows out of ${lines.length - 1}.`);
  }

  return {
    headers,
    rows,
    totalRowsSampled: rows.length,
    delimiter,
    warnings,
  };
}

export async function parseDelimitedFile(
  filePath: string,
  options: ParseDelimitedOptions = {},
): Promise<ParsedDelimitedTable> {
  const content = await readFile(filePath, 'utf-8');
  return parseDelimitedContent(content, options);
}

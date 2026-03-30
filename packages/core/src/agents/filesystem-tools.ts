import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { toolRegistry, type ToolResult } from './tools.js';
import { validateReadPath, validateWritePath } from './sandbox.js';

// ---------------------------------------------------------------------------
// File reading (sandboxed)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'read_file',
    description:
      'Read the contents of a file from disk. Supports text files: .csv, .json, .txt, .ags, .log, .md. Returns the file content as text. Files must be in the current working directory or workspace.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
        maxLines: { type: 'number', description: 'Maximum number of lines to read (default: 200)', default: 200 },
      },
    },
  },
  (args): ToolResult => {
    const check = validateReadPath(String(args.path));
    if (!check.safe) {
      return { success: false, data: null, summary: '', error: check.error! };
    }
    const filePath = check.resolved;

    if (!existsSync(filePath)) {
      return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };
    }

    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      return { success: false, data: null, summary: '', error: 'Path is a directory. Use list_directory instead.' };
    }

    const ext = extname(filePath).toLowerCase();
    const allowedExts = ['.csv', '.json', '.txt', '.ags', '.log', '.md', '.toml', '.yaml', '.yml', '.xml', '.tsv', '.dat', '.gef'];
    if (!allowedExts.includes(ext)) {
      return { success: false, data: null, summary: '', error: `Unsupported file type: ${ext}. Supported: ${allowedExts.join(', ')}` };
    }

    if (stat.size > 5 * 1024 * 1024) {
      return { success: false, data: null, summary: '', error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const maxLines = (args.maxLines as number) ?? 200;
    const truncated = lines.length > maxLines;
    const output = truncated ? lines.slice(0, maxLines).join('\n') : content;

    return {
      success: true,
      data: { path: filePath, lines: lines.length, truncated, content: output },
      summary: `Read ${filePath}: ${lines.length} lines, ${(stat.size / 1024).toFixed(1)} KB${truncated ? ` (showing first ${maxLines})` : ''}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Directory listing (sandboxed)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'list_directory',
    description: 'List files and subdirectories in a folder. Restricted to working directory and workspace.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Directory path' },
        pattern: { type: 'string', description: 'Filter by extension, e.g. ".csv"' },
      },
    },
  },
  (args): ToolResult => {
    const check = validateReadPath(String(args.path));
    if (!check.safe) return { success: false, data: null, summary: '', error: check.error! };
    const dirPath = check.resolved;

    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
      return { success: false, data: null, summary: '', error: `Not a directory: ${dirPath}` };
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    const pattern = args.pattern ? String(args.pattern).toLowerCase() : null;

    const files = entries
      .map((entry) => {
        const fullPath = join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        let size = 0;
        if (!isDir) { try { size = statSync(fullPath).size; } catch { /* skip */ } }
        return {
          name: entry.name,
          type: isDir ? 'directory' : extname(entry.name).toLowerCase() || 'file',
          size: isDir ? null : size,
          sizeHuman: isDir ? '-' : size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`,
        };
      })
      .filter((f) => !pattern || f.type === pattern || f.type === 'directory')
      .sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

    const dirs = files.filter((f) => f.type === 'directory').length;
    return {
      success: true,
      data: { path: dirPath, entries: files },
      summary: `${dirPath}: ${files.length - dirs} files, ${dirs} directories${pattern ? ` (filtered: ${pattern})` : ''}`,
    };
  },
);

// ---------------------------------------------------------------------------
// Parse CSV (sandboxed)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'parse_csv',
    description: 'Read and parse a CSV file into structured rows. Returns column names and row data.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Path to CSV file' },
        delimiter: { type: 'string', description: 'Column delimiter', default: ',' },
        maxRows: { type: 'number', description: 'Max rows to parse', default: 500 },
      },
    },
  },
  (args): ToolResult => {
    const check = validateReadPath(String(args.path));
    if (!check.safe) return { success: false, data: null, summary: '', error: check.error! };
    const filePath = check.resolved;
    if (!existsSync(filePath)) return { success: false, data: null, summary: '', error: `File not found: ${filePath}` };

    const content = readFileSync(filePath, 'utf-8');
    const delimiter = String(args.delimiter ?? ',');
    const lines = content.trim().split('\n');
    const maxRows = (args.maxRows as number) ?? 500;

    if (lines.length === 0) return { success: false, data: null, summary: '', error: 'Empty CSV file' };

    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const rows: Record<string, string | number>[] = [];
    for (let i = 1; i < Math.min(lines.length, maxRows + 1); i++) {
      const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string | number> = {};
      headers.forEach((h, ci) => {
        const val = cols[ci] ?? '';
        const num = Number(val);
        row[h] = val !== '' && !isNaN(num) ? num : val;
      });
      rows.push(row);
    }

    return {
      success: true,
      data: { path: filePath, headers, rowCount: rows.length, totalRows: lines.length - 1, rows },
      summary: `Parsed ${basename(filePath)}: ${headers.length} columns (${headers.slice(0, 5).join(', ')}${headers.length > 5 ? '...' : ''}), ${rows.length} rows`,
    };
  },
);

// ---------------------------------------------------------------------------
// Write file (sandboxed — CWD/workspace only)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'write_file',
    description: 'Save text content or JSON data to a file. Only writes to the current directory or workspace.',
    parameters: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string', description: 'Output file path' },
        content: { type: 'string', description: 'Content to write' },
      },
    },
  },
  (args): ToolResult => {
    const check = validateWritePath(String(args.path));
    if (!check.safe) return { success: false, data: null, summary: '', error: check.error! };
    const filePath = check.resolved;
    const content = String(args.content);

    if (content.length > 10 * 1024 * 1024) {
      return { success: false, data: null, summary: '', error: 'Content exceeds 10 MB write limit.' };
    }

    try {
      writeFileSync(filePath, content, 'utf-8');
      return {
        success: true,
        data: { path: filePath, size: content.length },
        summary: `Written ${(content.length / 1024).toFixed(1)} KB to ${filePath}`,
      };
    } catch (err) {
      return { success: false, data: null, summary: '', error: `Write failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
);

// ---------------------------------------------------------------------------
// Scan project (sandboxed)
// ---------------------------------------------------------------------------

toolRegistry.register(
  {
    name: 'scan_project',
    description: 'Scan a project directory and identify geotechnical data files.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: { path: { type: 'string', description: 'Project directory path' } },
    },
  },
  (args): ToolResult => {
    const check = validateReadPath(String(args.path));
    if (!check.safe) return { success: false, data: null, summary: '', error: check.error! };
    const dirPath = check.resolved;

    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
      return { success: false, data: null, summary: '', error: `Directory not found: ${dirPath}` };
    }

    const categories: Record<string, string[]> = {
      boreholeData: [], sptCptData: [], soilTestResults: [], sensorData: [],
      gisFiles: [], cadFiles: [], plaxisModels: [], flacModels: [],
      reports: [], images: [], other: [],
    };

    function scanDir(dir: string, depth = 0): void {
      if (depth > 3) return;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { scanDir(full, depth + 1); continue; }
        const ext = extname(entry.name).toLowerCase();
        const name = entry.name.toLowerCase();
        const rel = full.replace(dirPath + '/', '');
        if (ext === '.ags' || name.includes('borehole')) categories.boreholeData.push(rel);
        else if (name.includes('spt') || name.includes('cpt')) categories.sptCptData.push(rel);
        else if (name.includes('triaxial') || name.includes('consolidation') || name.includes('atterberg')) categories.soilTestResults.push(rel);
        else if (name.includes('piezometer') || name.includes('inclinometer') || name.includes('sensor')) categories.sensorData.push(rel);
        else if (['.geojson', '.shp', '.kml', '.kmz'].includes(ext)) categories.gisFiles.push(rel);
        else if (['.dxf', '.dwg'].includes(ext)) categories.cadFiles.push(rel);
        else if (['.plx', '.p2d', '.p3d'].includes(ext)) categories.plaxisModels.push(rel);
        else if (['.sav', '.f3sav', '.fis'].includes(ext)) categories.flacModels.push(rel);
        else if (['.pdf', '.docx', '.xlsx'].includes(ext)) categories.reports.push(rel);
        else if (['.jpg', '.jpeg', '.png', '.tif'].includes(ext)) categories.images.push(rel);
        else if (['.csv', '.json', '.txt', '.dat', '.tsv'].includes(ext)) categories.other.push(rel);
      }
    }
    scanDir(dirPath);

    const totalFiles = Object.values(categories).flat().length;
    const nonEmpty = Object.entries(categories).filter(([, f]) => f.length > 0);
    return {
      success: true,
      data: { path: dirPath, categories, totalFiles },
      summary: `Project scan: ${totalFiles} files — ${nonEmpty.map(([c, f]) => `${f.length} ${c}`).join(', ')}`,
    };
  },
);

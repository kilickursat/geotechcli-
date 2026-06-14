import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  exportGeoJSON,
  exportCSV,
  exportBoreholeProfileDXF,
  exportBoreholeAgsi,
  exportBoreholeDiggs,
  type InterchangeBorehole,
} from '@geotechcli/core';
import { success, error } from '../ui/terminal.js';

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Map loosely-shaped borehole JSON into the interchange shape shared by AGSi/DIGGS export.
function toInterchangeBoreholes(input: unknown): InterchangeBorehole[] {
  const rows = Array.isArray(input) ? input : [input];
  return rows.map((raw: any, i: number) => ({
    id: String(raw?.id ?? raw?.boreholeId ?? `BH-${i + 1}`),
    lat: num(raw?.lat ?? raw?.latitude),
    lng: num(raw?.lng ?? raw?.longitude),
    easting: num(raw?.easting),
    northing: num(raw?.northing),
    groundLevel: num(raw?.groundLevel ?? raw?.gl),
    depth: num(raw?.depth ?? raw?.totalDepth ?? raw?.finalDepth),
    crs: typeof raw?.crs === 'string' ? raw.crs : undefined,
    layers: Array.isArray(raw?.layers)
      ? raw.layers.map((l: any) => ({
          depthFrom: num(l?.depthFrom ?? l?.from ?? l?.topDepth ?? l?.top) ?? 0,
          depthTo: num(l?.depthTo ?? l?.to ?? l?.baseDepth ?? l?.base) ?? 0,
          description: String(l?.description ?? l?.desc ?? l?.material ?? ''),
          uscs: typeof l?.uscs === 'string' ? l.uscs : typeof l?.uscsSymbol === 'string' ? l.uscsSymbol : undefined,
          lithology: l?.lithology ?? undefined,
        }))
      : [],
  }));
}

export function registerExportCommand(program: Command): void {
  const exp = new Command('export')
    .description('Export analysis results to GeoJSON, DXF, CSV, JSON, AGSi, or DIGGS');

  exp
    .command('geojson')
    .description('Export borehole/analysis data as GeoJSON')
    .requiredOption('--input <file>', 'JSON file with results to export')
    .option('--output <file>', 'Output filename', 'output.geojson')
    .action((opts) => {
      try {
        const data = JSON.parse(readFileSync(opts.input, 'utf-8'));
        const features = Array.isArray(data) ? data : [data];
        const missingCoordinates = features.filter(
          (feature: any) =>
            (feature.lat === undefined && feature.latitude === undefined) ||
            (feature.lng === undefined && feature.longitude === undefined),
        );

        if (missingCoordinates.length > 0) {
          throw new Error(
            `Missing latitude/longitude for ${missingCoordinates.length} feature(s). Provide lat/lng or latitude/longitude fields before exporting GeoJSON.`,
          );
        }

        const geoJsonFeatures = features.map((f: any, i: number) => ({
          lat: f.lat ?? f.latitude,
          lng: f.lng ?? f.longitude,
          properties: f,
          name: f.id ?? f.boreholeId ?? `Feature-${i + 1}`,
        }));
        const output = exportGeoJSON(geoJsonFeatures);
        writeFileSync(opts.output, output);
        success(`GeoJSON exported to ${opts.output}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });

  exp
    .command('dxf')
    .description('Export borehole profiles as AutoCAD DXF')
    .requiredOption('--input <file>', 'JSON file with borehole data')
    .option('--output <file>', 'Output filename', 'output.dxf')
    .option('--spacing <m>', 'Horizontal spacing between boreholes', parseFloat, 10)
    .action((opts) => {
      try {
        const data = JSON.parse(readFileSync(opts.input, 'utf-8'));
        const boreholes = Array.isArray(data) ? data : [data];
        const dxf = exportBoreholeProfileDXF(
          boreholes.map((bh: any) => ({
            id: bh.id ?? bh.boreholeId ?? 'BH',
            x: bh.x ?? 0,
            layers: bh.layers ?? [],
          })),
          opts.spacing,
        );
        writeFileSync(opts.output, dxf);
        success(`DXF exported to ${opts.output}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });

  exp
    .command('csv')
    .description('Export results as CSV spreadsheet')
    .requiredOption('--input <file>', 'JSON file with results')
    .option('--output <file>', 'Output filename', 'output.csv')
    .action((opts) => {
      try {
        const data = JSON.parse(readFileSync(opts.input, 'utf-8'));
        let headers: string[];
        let rows: (string | number)[][];

        if (Array.isArray(data)) {
          headers = Object.keys(data[0] ?? {});
          rows = data.map((item: any) => headers.map((h) => item[h] ?? ''));
        } else if (data.layers) {
          headers = Object.keys(data.layers[0] ?? {});
          rows = data.layers.map((l: any) => headers.map((h) => l[h] ?? ''));
        } else {
          headers = Object.keys(data);
          rows = [headers.map((h) => data[h] ?? '')];
        }

        const csv = exportCSV(headers, rows);
        writeFileSync(opts.output, csv);
        success(`CSV exported to ${opts.output}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });

  exp
    .command('agsi')
    .description('Export borehole/ground-model data as AGSi (AGS interchange JSON)')
    .requiredOption('--input <file>', 'JSON file with borehole data')
    .option('--output <file>', 'Output filename', 'output.agsi.json')
    .option('--project <name>', 'Project name')
    .option('--crs <crs>', 'Coordinate reference system (e.g. EPSG:27700)')
    .action((opts) => {
      try {
        const data = JSON.parse(readFileSync(opts.input, 'utf-8'));
        const agsi = exportBoreholeAgsi(toInterchangeBoreholes(data), {
          projectName: opts.project,
          crs: opts.crs,
        });
        writeFileSync(opts.output, agsi);
        success(`AGSi exported to ${opts.output}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });

  exp
    .command('diggs')
    .description('Export borehole data as DIGGS 2.x (geotechnical interchange XML)')
    .requiredOption('--input <file>', 'JSON file with borehole data')
    .option('--output <file>', 'Output filename', 'output.diggs.xml')
    .option('--project <name>', 'Project name')
    .option('--crs <crs>', 'Coordinate reference system (e.g. EPSG:27700)')
    .action((opts) => {
      try {
        const data = JSON.parse(readFileSync(opts.input, 'utf-8'));
        const diggs = exportBoreholeDiggs(toInterchangeBoreholes(data), {
          projectName: opts.project,
          crs: opts.crs,
        });
        writeFileSync(opts.output, diggs);
        success(`DIGGS exported to ${opts.output}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    });

  program.addCommand(exp);
}

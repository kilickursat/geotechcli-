import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { exportGeoJSON, exportCSV, exportBoreholeProfileDXF } from '@geotechcli/core';
import { success, error } from '../ui/terminal.js';

export function registerExportCommand(program: Command): void {
  const exp = new Command('export')
    .description('Export analysis results to GeoJSON, DXF, CSV, or JSON');

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

  program.addCommand(exp);
}

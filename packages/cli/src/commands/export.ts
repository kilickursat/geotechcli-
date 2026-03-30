import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { exportGeoJSON, exportDXF, exportCSV, exportJSON, exportBoreholeProfileDXF } from '@geotechcli/core';
import { heading, success, error, renderJSON } from '../ui/terminal.js';

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
        const geoJsonFeatures = features.map((f: any, i: number) => ({
          lat: f.lat ?? f.latitude ?? 35.0 + i * 0.001,
          lng: f.lng ?? f.longitude ?? 139.0 + i * 0.001,
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

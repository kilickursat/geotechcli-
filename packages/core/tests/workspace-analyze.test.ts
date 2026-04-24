import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeWorkspace, parseDelimitedContent, inferTabularSchema } from '../src/index.js';

function minimalWorkbookXml(sheetXml: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Locations" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
  return zipSync(files);
}

describe('workspace analysis', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('detects CSV SPT data, XLSX coordinate tables, AGS files, and skips hidden secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geotech-workspace-'));
    tempDirs.push(dir);

    await writeFile(
      join(dir, 'spt-profile.csv'),
      [
        'borehole_id,description,depth_m,sptN',
        'BH-01,"silty sand, dense",1.5,12',
        'BH-01,"silty sand, dense",3.0,18',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(
      join(dir, 'site.ags'),
      [
        '"GROUP","LOCA"',
        '"HEADING","LOCA_ID","LOCA_NATE","LOCA_NATN"',
        '"DATA","BH-01","500000","3200000"',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(join(dir, '.env'), 'SECRET=value', 'utf-8');

    const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>borehole_id</t></is></c><c r="B1" t="inlineStr"><is><t>easting</t></is></c><c r="C1" t="inlineStr"><is><t>northing</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>BH-01</t></is></c><c r="B2"><v>500000</v></c><c r="C2"><v>3200000</v></c></row>
      </sheetData></worksheet>`;
    await writeFile(join(dir, 'borehole-locations.xlsx'), minimalWorkbookXml(sheetXml));

    const manifest = await analyzeWorkspace(dir, { branch: 'foundation', standard: 'eurocode7' });

    expect(manifest.schemaVersion).toBe('workspace-manifest.v1');
    expect(manifest.requestedBranch).toBe('foundation');
    expect(manifest.requestedStandard).toBe('eurocode7');
    expect(manifest.files.map((file) => file.path)).not.toContain('.env');
    expect(manifest.summary.datasetTypes['spt-profile']).toBe(1);
    expect(manifest.summary.datasetTypes['coordinate-table']).toBe(1);
    expect(manifest.summary.datasetTypes['ags-ground-investigation']).toBe(1);
    expect(manifest.summary.branches).toContain('foundation');

    const sptFile = manifest.files.find((file) => file.path === 'spt-profile.csv');
    expect(sptFile?.schemas?.[0].detected.sptColumns).toContain('sptN');
    expect(sptFile?.schemas?.[0].detected.depthColumns).toContain('depth_m');
  });

  it('parses quoted CSV cells and infers lab-test schemas', () => {
    const parsed = parseDelimitedContent([
      'sample_id,description,liquid_limit,plasticity_index',
      'S-01,"clay, reddish brown",42,18',
      'S-02,"silty clay",39,15',
    ].join('\n'));
    const schema = inferTabularSchema({ rows: parsed.rows, sourceName: 'lab.csv' });

    expect(parsed.rows[0].description).toBe('clay, reddish brown');
    expect(schema.datasetType).toBe('lab-test-summary');
    expect(schema.detected.labColumns).toContain('liquid_limit');
    expect(schema.branches).toContain('foundation');
  });
});

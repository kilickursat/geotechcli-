import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBoreholeLocation } from '../src/geo/index.js';
import { parseAGSContent, parseCPTContent } from '../src/ingest/index.js';
import { addSoilProfile, createProject, loadProject } from '../src/storage/index.js';

describe('ingest and storage location metadata', () => {
  let configDir = '';
  let previousConfigDir: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-location-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    rmSync(configDir, { recursive: true, force: true });
  });

  it('adds BoreholeLocation metadata to AGS boreholes', () => {
    const ags = parseAGSContent(
      [
        '"GROUP","PROJ"',
        '"HEADING","PROJ_ID","PROJ_CRS"',
        '"UNIT","",""',
        '"TYPE","ID","X"',
        '"DATA","Project-1","EPSG:27700"',
        '"GROUP","LOCA"',
        '"HEADING","LOCA_ID","LOCA_NATE","LOCA_NATN","LOCA_GL"',
        '"UNIT","","m","m","m"',
        '"TYPE","ID","2DP","2DP","2DP"',
        '"DATA","BH-1","651409.903","313177.270","12.40"',
        '"GROUP","HOLE"',
        '"HEADING","HOLE_ID","HOLE_FDEP"',
        '"UNIT","","m"',
        '"TYPE","ID","2DP"',
        '"DATA","BH-1","25.00"',
      ].join('\n'),
    );

    expect(ags.coordinateReferenceSystem?.epsg).toBe(27700);
    expect(ags.boreholes).toHaveLength(1);
    expect(ags.boreholes[0]?.id).toBe('BH-1');
    expect(ags.boreholes[0]?.finalDepth).toBe(25);
    expect(ags.boreholes[0]?.location?.projected?.easting).toBeCloseTo(651409.903, 6);
    expect(ags.boreholes[0]?.location?.wgs84?.latitude).toBeCloseTo(52.65797, 4);
  });

  it('reads CPT metadata comments into optional location fields', () => {
    const cpt = parseCPTContent(
      [
        '# id: CPT-42',
        '# easting: 651409.903',
        '# northing: 313177.270',
        '# crs: EPSG:27700',
        'depth,qc,fs,u2',
        '0.0,10,50,0',
        '1.0,12,60,10',
      ].join('\n'),
    );

    expect(cpt.id).toBe('CPT-42');
    expect(cpt.location?.crs?.epsg).toBe(27700);
    expect(cpt.location?.projected?.northing).toBeCloseTo(313177.27, 6);
    expect(cpt.location?.wgs84?.longitude).toBeCloseTo(1.71605, 4);
  });

  it('persists optional location metadata in storage models', () => {
    const projectLocation = buildBoreholeLocation({
      easting: 651409.903,
      northing: 313177.27,
      crs: 'EPSG:27700',
      source: 'ags',
    });

    const project = createProject('Location Metadata Project', {
      location: 'Norwich',
      locationMetadata: projectLocation,
    });

    addSoilProfile(project.meta.id, {
      boreholeId: 'BH-1',
      location: buildBoreholeLocation({
        latitude: 52.65757,
        longitude: 1.71792,
        crs: 'EPSG:4326',
        source: 'manual',
      }),
      layers: [
        {
          depthFrom: 0,
          depthTo: 2,
          description: 'Made ground',
        },
      ],
      waterTableDepth: 1.8,
    });

    const loaded = loadProject(project.meta.id);
    expect(loaded.meta.locationMetadata?.crs?.epsg).toBe(27700);
    expect(loaded.meta.locationMetadata?.wgs84?.latitude).toBeCloseTo(52.65797, 4);
    expect(loaded.soilProfiles[0]?.location?.crs?.epsg).toBe(4326);
    expect(loaded.soilProfiles[0]?.location?.wgs84?.longitude).toBeCloseTo(1.71792, 4);
  });
});

import { describe, expect, it } from 'vitest';

import { parseAGSContent } from '../src/ingest/ags.js';
import { parseCPTContent } from '../src/ingest/cpt.js';

describe('location-aware ingest', () => {
  it('extracts borehole location metadata from AGS content', () => {
    const ags = parseAGSContent(`"GROUP","PROJ"
"HEADING","PROJ_ID","PROJ_NAME","PROJ_LOC","PROJ_GREF"
"UNIT","","","",""
"TYPE","ID","X","X","X"
"DATA","P-01","Dock Upgrade","London","EPSG:27700"
"GROUP","LOCA"
"HEADING","LOCA_ID","LOCA_NATE","LOCA_NATN","LOCA_GL","LOCA_LAT","LOCA_LON"
"UNIT","","m","m","m","",""
"TYPE","ID","2DP","2DP","2DP","2DP","2DP"
"DATA","BH-01","532500","178300","15.2","51.5036","-0.1276"
"GROUP","HOLE"
"HEADING","HOLE_ID","HOLE_FDEP"
"UNIT","","m"
"TYPE","ID","2DP"
"DATA","BH-01","25.0"`);

    expect(ags.coordinateReferenceSystem?.epsg).toBe(27700);
    expect(ags.boreholes[0]?.id).toBe('BH-01');
    expect(ags.boreholes[0]?.location?.projected?.easting).toBe(532500);
    expect(ags.boreholes[0]?.location?.projected?.northing).toBe(178300);
    expect(ags.boreholes[0]?.location?.wgs84?.latitude).toBe(51.5036);
    expect(ags.boreholes[0]?.location?.wgs84?.longitude).toBe(-0.1276);
  });

  it('extracts CPT location metadata from comment-prefixed metadata lines', () => {
    const cpt = parseCPTContent(`# id: CPT-22
# easting: 532500
# northing: 178300
# crs: EPSG:27700
depth,qc,fs,u2
0.5,5,50,0
1.0,10,60,0`);

    expect(cpt.id).toBe('CPT-22');
    expect(cpt.location?.projected?.easting).toBe(532500);
    expect(cpt.location?.projected?.northing).toBe(178300);
    expect(cpt.location?.crs?.epsg).toBe(27700);
    expect(cpt.summary.maxDepth).toBe(1);
  });
});

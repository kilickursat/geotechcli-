import { describe, expect, it } from 'vitest';

import { normalizeToolArgs } from '../src/agents/tool-normalization.js';

describe('tool normalization', () => {
  it('maps mixed-face language to the supported TBM ground enum', () => {
    expect(
      normalizeToolArgs('select_tbm_type', {
        diameter: 6.5,
        groundType: 'mixed face',
        waterPressure: 3,
      }),
    ).toMatchObject({
      groundType: 'mixed',
    });
  });

  it('normalizes at-rest lateral pressure wording', () => {
    expect(
      normalizeToolArgs('calculate_lateral_earth_pressure', {
        wallHeight: 8,
        soilLayers: [],
        pressureState: 'at rest',
      }),
    ).toMatchObject({
      pressureState: 'at_rest',
    });
  });

  it('normalizes bearing shape aliases without touching unrelated tools', () => {
    expect(
      normalizeToolArgs('calculate_bearing_capacity', {
        depth: 2,
        frictionAngle: 30,
        shape: 'rectangular footing',
      }),
    ).toMatchObject({
      shape: 'rectangular',
    });

    expect(
      normalizeToolArgs('predict_tbm_performance', {
        diameter: 6.5,
        ucs: 60,
        rqd: 70,
      }),
    ).toMatchObject({
      diameter: 6.5,
      ucs: 60,
      rqd: 70,
    });
  });
});

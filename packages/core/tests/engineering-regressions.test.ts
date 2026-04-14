import { describe, expect, it } from 'vitest';
import { calculatePileCapacity, calculateSlopeStability } from '../src/geo/index.js';

describe('Engineering regressions', () => {
  it('reduces slope FOS when seismic coefficient increases', () => {
    const baseInput = {
      slopeHeight: 12,
      slopeAngle: 38,
      soilLayers: [
        {
          thickness: 24,
          unitWeight: 18,
          cohesion: 14,
          frictionAngle: 29,
        },
      ],
      waterTableDepth: 100,
      surcharge: 0,
      numberOfSlices: 16,
      method: 'bishop' as const,
    };

    const staticResult = calculateSlopeStability({
      ...baseInput,
      seismicCoefficient: 0,
    });
    const seismicResult = calculateSlopeStability({
      ...baseInput,
      seismicCoefficient: 0.2,
    });

    expect(seismicResult.factorOfSafety).toBeLessThan(staticResult.factorOfSafety);
    expect(seismicResult.steps.some(step => step.includes('kh=0.2'))).toBe(true);
  });

  it('selects the toe layer at a boundary instead of the shallower layer', () => {
    const justAboveBoundary = calculatePileCapacity({
      pileDiameter: 0.6,
      pileLength: 3.999,
      pileType: 'driven',
      pileShape: 'circular',
      factorOfSafety: 2.5,
      method: 'spt-meyerhof',
      waterTableDepth: 100,
      layers: [
        {
          thickness: 4,
          soilType: 'sand',
          unit_weight: 18,
          friction_angle: 30,
          spt_n: 5,
        },
        {
          thickness: 6,
          soilType: 'sand',
          unit_weight: 20,
          friction_angle: 40,
          spt_n: 50,
        },
      ],
    });

    const atBoundary = calculatePileCapacity({
      pileDiameter: 0.6,
      pileLength: 4,
      pileType: 'driven',
      pileShape: 'circular',
      factorOfSafety: 2.5,
      method: 'spt-meyerhof',
      waterTableDepth: 100,
      layers: [
        {
          thickness: 4,
          soilType: 'sand',
          unit_weight: 18,
          friction_angle: 30,
          spt_n: 5,
        },
        {
          thickness: 6,
          soilType: 'sand',
          unit_weight: 20,
          friction_angle: 40,
          spt_n: 50,
        },
      ],
    });

    expect(atBoundary.baseResistance).toBeGreaterThan(justAboveBoundary.baseResistance);
  });

  it('ignores trailing layers below the pile toe when the toe remains within the same layer', () => {
    const reference = calculatePileCapacity({
      pileDiameter: 0.6,
      pileLength: 4.5,
      pileType: 'driven',
      pileShape: 'circular',
      factorOfSafety: 2.5,
      method: 'spt-meyerhof',
      waterTableDepth: 100,
      layers: [
        {
          thickness: 3,
          soilType: 'sand',
          unit_weight: 18,
          friction_angle: 30,
          spt_n: 5,
        },
        {
          thickness: 3,
          soilType: 'sand',
          unit_weight: 20,
          friction_angle: 35,
          spt_n: 20,
        },
      ],
    });

    const withTrailingLayer = calculatePileCapacity({
      pileDiameter: 0.6,
      pileLength: 4.5,
      pileType: 'driven',
      pileShape: 'circular',
      factorOfSafety: 2.5,
      method: 'spt-meyerhof',
      waterTableDepth: 100,
      layers: [
        {
          thickness: 3,
          soilType: 'sand',
          unit_weight: 18,
          friction_angle: 30,
          spt_n: 5,
        },
        {
          thickness: 3,
          soilType: 'sand',
          unit_weight: 20,
          friction_angle: 35,
          spt_n: 20,
        },
        {
          thickness: 10,
          soilType: 'sand',
          unit_weight: 21,
          friction_angle: 42,
          spt_n: 60,
        },
      ],
    });

    expect(withTrailingLayer.baseResistance).toBe(reference.baseResistance);
    expect(withTrailingLayer.ultimateCapacity).toBe(reference.ultimateCapacity);
  });

  it('increases shaft friction with depth when layered effective stress increases', () => {
    const result = calculatePileCapacity({
      pileDiameter: 0.5,
      pileLength: 8,
      pileType: 'driven',
      pileShape: 'circular',
      factorOfSafety: 2.5,
      method: 'beta',
      waterTableDepth: 100,
      layers: [
        {
          thickness: 3,
          soilType: 'sand',
          unit_weight: 17,
          friction_angle: 30,
        },
        {
          thickness: 5,
          soilType: 'sand',
          unit_weight: 20,
          friction_angle: 30,
        },
      ],
    });

    expect(result.shaftFrictionPerLayer.length).toBeGreaterThan(1);
    expect(result.shaftFrictionPerLayer[1].unitShaftFriction).toBeGreaterThan(result.shaftFrictionPerLayer[0].unitShaftFriction);
  });
});

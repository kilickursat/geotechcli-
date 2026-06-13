import { describe, expect, it } from 'vitest';

import {
  LITHOLOGY_MATERIAL_KEYS,
  detectLithologyDescriptors,
  extractUscsSymbol,
  lithologyClassForKey,
  normalizeLithology,
} from '../src/geo/lithology.js';

const key = (description: string, uscs?: string | null) => normalizeLithology(description, uscs).key;

describe('normalizeLithology key vocabulary', () => {
  it.each([
    ['PEAT, dark brown', 'organic'],
    ['organic silt', 'organic'],
    ['topsoil', 'organic'],
    ['top soil', 'organic'],
    ['fresh bedrock', 'bedrock'],
    ['moderately strong mudstone', 'bedrock'],
    ['strong sandstone', 'bedrock'],
    ['weathered shale, fractured', 'weathered-rock'],
    ['mudstone', 'weathered-rock'],
    ['limestone', 'weathered-rock'],
    ['residual rock', 'weathered-rock'],
    ['dense sand with gravel', 'gravel'],
    ['well graded GRAVEL with cobbles', 'gravel'],
    ['boulders and cobbles', 'gravel'],
    ['silty SAND', 'sand'],
    ['stiff CLAY', 'clay'],
    ['clayey deposit', 'clay'],
    ['low plasticity silt', 'silt'],
    ['made ground with brick debris', 'fill'],
    ['backfill', 'fill'],
    ['no recovery', 'mixed'],
  ])('classifies "%s" -> %s', (description, expected) => {
    expect(key(description)).toBe(expected);
  });

  it('uses canonical precedence: organic beats bedrock beats gravel beats sand beats clay beats silt beats fill', () => {
    expect(key('peat over bedrock')).toBe('organic');
    expect(key('fresh rock with sand seams')).toBe('bedrock');
    expect(key('gravelly clay')).toBe('gravel');
    expect(key('sandy clay')).toBe('sand');
    expect(key('clayey fill')).toBe('clay');
    expect(key('silty fill')).toBe('silt');
  });

  it('honours an explicit USCS symbol appended to the matching text', () => {
    expect(key('granular deposit', 'SM')).toBe('sand');
    expect(key('cohesive layer', 'CH')).toBe('clay');
  });
});

describe('lithologyClassForKey', () => {
  it('collapses bedrock and weathered-rock to rock and keeps organic distinct', () => {
    expect(lithologyClassForKey('bedrock')).toBe('rock');
    expect(lithologyClassForKey('weathered-rock')).toBe('rock');
    expect(lithologyClassForKey('organic')).toBe('organic');
    expect(lithologyClassForKey('mixed')).toBe('mixed');
    for (const k of ['fill', 'clay', 'silt', 'sand', 'gravel'] as const) {
      expect(lithologyClassForKey(k)).toBe(k);
    }
  });
});

describe('normalizeLithology tone (independent precedence)', () => {
  it('keeps tone matching verbatim, diverging from the key where the originals did', () => {
    expect(normalizeLithology('sandy clay').tone).toBe('warning'); // key sand, tone warning
    expect(normalizeLithology('mudstone').tone).toBe('good'); // key weathered-rock, tone good
    expect(normalizeLithology('weathered shale').tone).toBe('neutral');
    expect(normalizeLithology('dense sand').tone).toBe('accent');
    expect(normalizeLithology('peat').tone).toBe('good');
  });
});

describe('extractUscsSymbol', () => {
  it.each(['GW', 'GP', 'GM', 'GC', 'SW', 'SP', 'SM', 'SC', 'ML', 'CL', 'OL', 'MH', 'CH', 'OH', 'PT'])(
    'extracts %s as a standalone token',
    (symbol) => {
      expect(extractUscsSymbol(`Layer described as ${symbol} material`)).toBe(symbol);
    },
  );

  it('preserves the original regex quirk: CL-ML resolves to CL (CL matches first)', () => {
    // Identical behavior to the former inferUscsFromText regex; documented to lock the move.
    expect(extractUscsSymbol('Layer described as CL-ML material')).toBe('CL');
  });

  it('does not match symbols embedded in words', () => {
    expect(extractUscsSymbol('CLAY')).toBeNull();
    expect(extractUscsSymbol('SCum on surface')).toBeNull();
    expect(extractUscsSymbol(null)).toBeNull();
  });
});

describe('detectLithologyDescriptors', () => {
  it('flags boulder as coarse-grained (D3) while preserving the existing descriptors', () => {
    expect(detectLithologyDescriptors('large boulders').hasGravel).toBe(true);
    expect(detectLithologyDescriptors('cobbly gravel').hasGravel).toBe(true);
    const d = detectLithologyDescriptors('soft clay, high plasticity, low permeability');
    expect(d.hasClay).toBe(true);
    expect(d.highPlasticity).toBe(true);
    expect(d.lowPermeability).toBe(true);
    expect(d.softConsistency).toBe(true);
  });
});

describe('normalizeLithology confidence and determinism', () => {
  it('scores mixed low and rewards corroborating descriptors', () => {
    expect(normalizeLithology('no recovery').confidence).toBe(0.35);
    expect(normalizeLithology('clay').confidence).toBeCloseTo(0.58, 5);
    expect(normalizeLithology('stiff clay', 'CL').confidence).toBeCloseTo(0.74, 5);
    expect(normalizeLithology('soft fat clay, high plasticity, low permeability', 'CH').confidence).toBeCloseTo(0.9, 5);
  });

  it('is deterministic and uses no fuzzy matching', () => {
    const a = normalizeLithology('silty SAND', 'SM');
    const b = normalizeLithology('silty SAND', 'SM');
    expect(a).toEqual(b);
    // Transposed typos that do not contain the target as a substring stay unmatched.
    expect(key('caly')).toBe('mixed');
    expect(key('snad')).toBe('mixed');
  });

  it('exposes the full canonical key set', () => {
    expect(LITHOLOGY_MATERIAL_KEYS).toContain('organic');
    expect(LITHOLOGY_MATERIAL_KEYS).toContain('mixed');
    expect(LITHOLOGY_MATERIAL_KEYS).toHaveLength(9);
  });
});

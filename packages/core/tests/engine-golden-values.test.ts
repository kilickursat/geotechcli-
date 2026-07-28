import { describe, it, expect } from 'vitest';
import { calculateBearingCapacity } from '../src/geo/bearing-capacity.js';
import { calculateLiquefaction } from '../src/geo/liquefaction.js';
import { calculateSlopeStability } from '../src/geo/slope-stability.js';
import { calculatePileCapacity } from '../src/geo/pile-capacity.js';
import { calculateDupuitSeepage } from '../src/geo/seepage.js';
import { classifyUSCS } from '../src/geo/classification.js';

// ---------------------------------------------------------------------------
// Golden-value regression tests.
//
// The other engine suites assert direction and ordering ("FS goes down when
// PGA goes up"). Those pass just as happily against a mis-transcribed
// equation, so this file pins the engines to *absolute* numbers taken from the
// published sources. A change that silently alters a published method fails
// here.
//
// Every expected value below is either a published table entry or evaluated
// from the source equation as printed in the reference.
// ---------------------------------------------------------------------------

describe('bearing capacity — published factor tables', () => {
  const strip = { width: 2, depth: 0, unitWeight: 18, cohesion: 0 } as const;

  // Prandtl-Reissner Nq = tan²(45+φ/2)·e^(π·tanφ), Nc = (Nq−1)·cotφ.
  // Shared by Meyerhof, Hansen and Vesic.
  it.each([
    [0, 5.14, 1.0],
    [20, 14.83, 6.40],
    [25, 20.72, 10.66],
    [30, 30.14, 18.40],
    [32, 35.49, 23.18],
    [35, 46.12, 33.30],
    [40, 75.31, 64.20],
  ])('Prandtl-Reissner at φ=%i° gives Nc=%f, Nq=%f', (phi, Nc, Nq) => {
    for (const method of ['meyerhof', 'hansen', 'vesic'] as const) {
      const r = calculateBearingCapacity({ ...strip, frictionAngle: phi, method } as never);
      expect(r.bearingCapacityFactors.Nc, `${method} Nc at ${phi}°`).toBeCloseTo(Nc, 1);
      expect(r.bearingCapacityFactors.Nq, `${method} Nq at ${phi}°`).toBeCloseTo(Nq, 1);
    }
  });

  // Terzaghi (1943) uses his own Nq expression, not Prandtl-Reissner.
  it.each([
    [20, 17.69, 7.44],
    [30, 37.16, 22.46],
    [35, 57.75, 41.44],
  ])('Terzaghi at φ=%i° gives Nc=%f, Nq=%f', (phi, Nc, Nq) => {
    const r = calculateBearingCapacity({ ...strip, frictionAngle: phi, method: 'terzaghi' } as never);
    expect(r.bearingCapacityFactors.Nc).toBeCloseTo(Nc, 1);
    expect(r.bearingCapacityFactors.Nq).toBeCloseTo(Nq, 1);
  });

  // Each method carries its OWN Nγ. Collapsing these onto one expression was
  // the defect this table exists to prevent.
  it.each([
    // φ,   Meyerhof,  Hansen,   Vesic
    [30, 15.67, 15.07, 22.40],
    [35, 37.15, 33.92, 48.03],
    [40, 93.69, 79.54, 109.41],
  ])('Nγ at φ=%i° is method-specific: Meyerhof=%f, Hansen=%f, Vesic=%f', (phi, mey, han, ves) => {
    const get = (method: 'meyerhof' | 'hansen' | 'vesic') =>
      calculateBearingCapacity({ ...strip, frictionAngle: phi, method } as never)
        .bearingCapacityFactors.Ngamma;

    expect(get('meyerhof'), `Meyerhof Nγ at ${phi}°`).toBeCloseTo(mey, 1);
    expect(get('hansen'), `Hansen Nγ at ${phi}°`).toBeCloseTo(han, 1);
    expect(get('vesic'), `Vesic Nγ at ${phi}°`).toBeCloseTo(ves, 1);
  });

  it('hansen and vesic are not the same calculation', () => {
    const args = { width: 2, length: 4, depth: 1.5, unitWeight: 19, cohesion: 5, frictionAngle: 32 } as const;
    const h = calculateBearingCapacity({ ...args, method: 'hansen' } as never);
    const v = calculateBearingCapacity({ ...args, method: 'vesic' } as never);
    expect(h.qUltimate).not.toBeCloseTo(v.qUltimate, 1);
    // Hansen's sq uses sinφ, Vesic's uses tanφ, so Vesic is the larger of the two.
    expect(v.qUltimate).toBeGreaterThan(h.qUltimate);
  });

  it('Hansen and Vesic both take dγ = 1.0', () => {
    for (const method of ['hansen', 'vesic'] as const) {
      const r = calculateBearingCapacity({
        width: 2, depth: 3, unitWeight: 19, cohesion: 5, frictionAngle: 30, method,
      } as never);
      expect(r.depthFactors!.dgamma, `${method} dγ`).toBe(1.0);
    }
  });

  it('declared shape changes the result even without an explicit length', () => {
    const args = { width: 2, depth: 1.5, unitWeight: 19, cohesion: 10, frictionAngle: 30, method: 'meyerhof' } as const;
    const q = (shape: string) => calculateBearingCapacity({ ...args, shape } as never).qUltimate;

    expect(q('square')).toBeGreaterThan(q('strip'));
    expect(q('circular')).toBeGreaterThan(q('strip'));
  });

  it('φ=0 undrained strip reduces to q_ult = 5.14·cu·sc·dc + q', () => {
    const cu = 60;
    const r = calculateBearingCapacity({
      width: 2.5, depth: 1.2, unitWeight: 18, cohesion: cu, frictionAngle: 0, method: 'hansen',
    } as never);
    const expected = 5.14 * cu * r.shapeFactors!.sc * r.depthFactors!.dc + 18 * 1.2;
    expect(r.qUltimate).toBeCloseTo(expected, 1);
  });

  it('a water table at the surface roughly halves the Nγ contribution', () => {
    const args = { width: 3, depth: 1, unitWeight: 19, cohesion: 0, frictionAngle: 35, method: 'vesic' } as const;
    const dry = calculateBearingCapacity(args as never);
    const wet = calculateBearingCapacity({ ...args, waterTableDepth: 0 } as never);
    expect(wet.qUltimate).toBeLessThan(dry.qUltimate);
    // γ' / γ = (19 − 9.81)/19 ≈ 0.484 applies to both the q and Nγ terms.
    expect(wet.qUltimate / dry.qUltimate).toBeCloseTo((19 - 9.81) / 19, 2);
  });
});

describe('liquefaction — Boulanger & Idriss (2014) anchors', () => {
  /**
   * B&I (2014) Eq. 2.24, the deterministic triggering curve at M7.5 / 1 atm.
   * Written out term by term exactly as published.
   */
  function crr75Published(N: number): number {
    return Math.exp(N / 14.1 + (N / 126) ** 2 - (N / 23.6) ** 3 + (N / 25.4) ** 4 - 2.8);
  }

  // γ=18 with the water table at the surface gives σ'v = 8.19·z;
  // z = 12.372 m puts σ'v at exactly one atmosphere (101.325 kPa).
  const ONE_ATM_DEPTH = 12.372;

  function atOneAtm(sptN: number) {
    return calculateLiquefaction({
      earthquakeMagnitude: 7.5,
      pga: 0.2,
      method: 'boulanger-idriss-2014',
      layers: [{ depth: ONE_ATM_DEPTH, sptN, finesContent: 0, unitWeight: 18, waterTableDepth: 0 }],
    } as never).layers[0];
  }

  it('MSF is exactly 1.0 at Mw 7.5 regardless of density', () => {
    for (const sptN of [4, 10, 20, 35]) {
      expect(atOneAtm(sptN).MSF, `MSF at sptN=${sptN}`).toBeCloseTo(1.0, 3);
    }
  });

  it('Kσ is exactly 1.0 at σ′v = 1 atm', () => {
    const layer = atOneAtm(15);
    expect(layer.sigmaVPrime).toBeCloseTo(101.3, 0);
    expect(layer.Ksigma).toBeCloseTo(1.0, 3);
  });

  it('CRR lands on the published base curve across the density range', () => {
    // This is the test that fails against the pre-fix implementation, which
    // over-predicted CRR by 1.2x at (N1)60cs=10 rising to 39x at 30.
    for (const sptN of [4, 8, 12, 16, 20, 26]) {
      const layer = atOneAtm(sptN);
      const expected = crr75Published(layer.N160cs);
      expect(layer.CRR, `CRR at (N1)60cs=${layer.N160cs}`).toBeCloseTo(expected, 3);
    }
  });

  it('CRR at 1 atm / M7.5 matches published values to 3 decimals', () => {
    // Independent hardcoded anchors from Eq. 2.24.
    const anchors: Array<[number, number]> = [
      [10, 0.1181],
      [15, 0.1561],
      [20, 0.2059],
      [25, 0.2898],
      [30, 0.4845],
    ];
    for (const [N, crr] of anchors) {
      expect(crr75Published(N), `published curve at N=${N}`).toBeCloseTo(crr, 3);
    }
  });

  it('MSF rises below Mw 7.5 and falls above it', () => {
    const msf = (Mw: number) => calculateLiquefaction({
      earthquakeMagnitude: Mw, pga: 0.2,
      layers: [{ depth: ONE_ATM_DEPTH, sptN: 15, finesContent: 0, unitWeight: 18, waterTableDepth: 0 }],
    } as never).layers[0].MSF;

    expect(msf(6.0)).toBeGreaterThan(1.0);
    expect(msf(7.5)).toBeCloseTo(1.0, 3);
    expect(msf(8.5)).toBeLessThan(1.0);
  });

  it('Kσ falls below 1.0 as effective stress rises above 1 atm', () => {
    const deep = calculateLiquefaction({
      earthquakeMagnitude: 7.5, pga: 0.2,
      layers: [{ depth: 30, sptN: 15, finesContent: 0, unitWeight: 18, waterTableDepth: 0 }],
    } as never).layers[0];
    expect(deep.sigmaVPrime).toBeGreaterThan(101.325);
    expect(deep.Ksigma).toBeLessThan(1.0);
  });

  it('r_d tends to 1.0 at the surface and decreases with depth', () => {
    const rd = (depth: number) => calculateLiquefaction({
      earthquakeMagnitude: 7.5, pga: 0.2,
      layers: [{ depth, sptN: 12, unitWeight: 18, waterTableDepth: 0 }],
    } as never).layers[0].rd;

    expect(rd(0.01)).toBeCloseTo(1.0, 1);
    expect(rd(5)).toBeLessThan(rd(0.01));
    expect(rd(15)).toBeLessThan(rd(5));
    expect(rd(30)).toBeLessThan(rd(15));
  });

  it('B&I fines correction matches the published Δ(N1)60 trend', () => {
    // Eq. 2.11 gives ~0 at FC=0, ~1.1 at FC=10 and ~5.5 at FC=35.
    const delta = (FC: number) => {
      const clean = calculateLiquefaction({
        earthquakeMagnitude: 7.5, pga: 0.2,
        layers: [{ depth: ONE_ATM_DEPTH, sptN: 15, finesContent: 0, unitWeight: 18, waterTableDepth: 0 }],
      } as never).layers[0];
      const dirty = calculateLiquefaction({
        earthquakeMagnitude: 7.5, pga: 0.2,
        layers: [{ depth: ONE_ATM_DEPTH, sptN: 15, finesContent: FC, unitWeight: 18, waterTableDepth: 0 }],
      } as never).layers[0];
      return dirty.N160cs - clean.N160cs;
    };

    expect(delta(0)).toBeCloseTo(0, 1);
    expect(delta(10)).toBeGreaterThan(0.7);
    expect(delta(10)).toBeLessThan(1.6);
    expect(delta(35)).toBeGreaterThan(4.8);
    expect(delta(35)).toBeLessThan(6.2);
  });

  it('resistance increases monotonically with density', () => {
    let previous = 0;
    for (const sptN of [4, 8, 12, 16, 20, 25, 30]) {
      const crr = atOneAtm(sptN).CRR;
      expect(crr, `CRR at sptN=${sptN}`).toBeGreaterThan(previous);
      previous = crr;
    }
  });

  it('a loose saturated profile under a strong shake triggers on every layer', () => {
    // Mw 7.5 / 0.30 g over loose-to-medium sand. Before the CRR fix the lower
    // two layers were reported MODERATE and LOW.
    const r = calculateLiquefaction({
      earthquakeMagnitude: 7.5, pga: 0.3, method: 'boulanger-idriss-2014',
      layers: [
        { depth: 4, sptN: 8, finesContent: 10, unitWeight: 18, waterTableDepth: 1 },
        { depth: 8, sptN: 14, finesContent: 15, unitWeight: 19, waterTableDepth: 1 },
        { depth: 12, sptN: 20, finesContent: 5, unitWeight: 19, waterTableDepth: 1 },
      ],
    } as never);

    for (const layer of r.layers) {
      expect(layer.factorOfSafety, `FS at ${layer.depth}m`).toBeLessThan(1.0);
      expect(['HIGH', 'SEVERE']).toContain(layer.potential);
    }
    expect(r.estimatedSettlement).toBeGreaterThan(0);
  });

  it('settlement uses tributary thickness, not a hardcoded 2 m', () => {
    const spacing = (dz: number) => calculateLiquefaction({
      earthquakeMagnitude: 7.5, pga: 0.35, method: 'boulanger-idriss-2014',
      layers: [
        { depth: dz, sptN: 6, finesContent: 5, unitWeight: 18, waterTableDepth: 1 },
        { depth: dz * 2, sptN: 6, finesContent: 5, unitWeight: 18, waterTableDepth: 1 },
        { depth: dz * 3, sptN: 6, finesContent: 5, unitWeight: 18, waterTableDepth: 1 },
      ],
    } as never).estimatedSettlement;

    // Sampling the same profile on a wider spacing represents more soil,
    // so the integrated settlement must grow with the spacing.
    expect(spacing(3)).toBeGreaterThan(spacing(1));
  });

  it('an explicit layer thickness is honoured', () => {
    const withThickness = (t: number) => calculateLiquefaction({
      earthquakeMagnitude: 7.5, pga: 0.35, method: 'boulanger-idriss-2014',
      layers: [{ depth: 5, sptN: 6, finesContent: 5, unitWeight: 18, waterTableDepth: 1, thickness: t }],
    } as never).estimatedSettlement;

    // Settlement is reported in whole millimetres, so compare the ratio.
    expect(withThickness(4) / withThickness(1)).toBeCloseTo(4, 1);
  });

  it('NCEER remains a distinct procedure from B&I', () => {
    const args = {
      earthquakeMagnitude: 7.0, pga: 0.25,
      layers: [{ depth: 6, sptN: 12, finesContent: 15, unitWeight: 19, waterTableDepth: 1 }],
    };
    const bi = calculateLiquefaction({ ...args, method: 'boulanger-idriss-2014' } as never).layers[0];
    const nceer = calculateLiquefaction({ ...args, method: 'nceer' } as never).layers[0];

    expect(nceer.Ksigma).toBe(1.0);        // NCEER carries no Kσ
    expect(bi.CRR).not.toBeCloseTo(nceer.CRR, 3);
    expect(bi.rd).not.toBeCloseTo(nceer.rd, 3);
  });

  it('NCEER MSF follows Youd et al. (2001) Eq. 24', () => {
    const msf = (Mw: number) => calculateLiquefaction({
      earthquakeMagnitude: Mw, pga: 0.2, method: 'nceer',
      layers: [{ depth: 6, sptN: 12, unitWeight: 19, waterTableDepth: 1 }],
    } as never).layers[0].MSF;

    // MSF = 10^2.24 / Mw^2.56
    expect(msf(7.5)).toBeCloseTo(Math.pow(10, 2.24) / Math.pow(7.5, 2.56), 2);
    expect(msf(6.5)).toBeCloseTo(Math.pow(10, 2.24) / Math.pow(6.5, 2.56), 2);
  });
});

describe('slope stability — closed-form benchmarks', () => {
  /**
   * Taylor (1937) stability number for a φ=0 slope: FOS = c / (Ns·γ·H).
   * Chart values for a deep-seated circle with no firm base constraint.
   */
  it.each([
    [30, 0.178],
    [35, 0.181],
    [45, 0.182],
    [60, 0.191],
  ])('φ=0 slope at β=%i° matches the Taylor chart', (beta, Ns) => {
    const c = 50;
    const gamma = 19;
    const H = 10;
    const r = calculateSlopeStability({
      slopeHeight: H, slopeAngle: beta, numberOfSlices: 40,
      soilLayers: [{ thickness: 40, unitWeight: gamma, cohesion: c, frictionAngle: 0 }],
    } as never);

    const taylor = c / (Ns * gamma * H);
    const ratio = r.factorOfSafety / taylor;
    expect(ratio, `β=${beta}°: engine ${r.factorOfSafety} vs Taylor ${taylor.toFixed(3)}`)
      .toBeGreaterThan(0.92);
    expect(ratio).toBeLessThan(1.08);
  });

  it('a cohesionless slope approaches FOS = tanφ′/tanβ', () => {
    // The infinite-slope limit; a circular search should sit close to it.
    for (const [phi, beta] of [[30, 30], [35, 25], [30, 20]] as const) {
      const r = calculateSlopeStability({
        slopeHeight: 10, slopeAngle: beta, numberOfSlices: 40,
        soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 0.01, frictionAngle: phi }],
      } as never);
      const infinite = Math.tan((phi * Math.PI) / 180) / Math.tan((beta * Math.PI) / 180);
      const ratio = r.factorOfSafety / infinite;
      expect(ratio, `φ=${phi}° β=${beta}°: engine ${r.factorOfSafety} vs ${infinite.toFixed(3)}`)
        .toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(1.12);
    }
  });

  it('every soil layer influences the result', () => {
    const withSecondLayer = (cohesion: number, frictionAngle: number) =>
      calculateSlopeStability({
        slopeHeight: 10, slopeAngle: 35, numberOfSlices: 25,
        soilLayers: [
          { thickness: 2, unitWeight: 19, cohesion: 15, frictionAngle: 30 },
          { thickness: 20, unitWeight: 19, cohesion, frictionAngle },
        ],
      } as never).factorOfSafety;

    // A weak layer beneath a competent crust must dominate.
    expect(withSecondLayer(0, 5)).toBeLessThan(withSecondLayer(200, 45));
    expect(withSecondLayer(0, 5)).toBeLessThan(1.0);
  });

  it('the water table drives the result', () => {
    const atDepth = (gwt: number) => calculateSlopeStability({
      slopeHeight: 10, slopeAngle: 35, numberOfSlices: 25, waterTableDepth: gwt,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 10, frictionAngle: 30, saturatedUnitWeight: 21 }],
    } as never).factorOfSafety;

    const wet = atDepth(0);
    const dry = atDepth(999);
    expect(wet).toBeLessThan(dry);
    expect(wet).toBeGreaterThan(0);
    // Monotone as the table falls.
    expect(atDepth(2)).toBeGreaterThanOrEqual(wet);
    expect(atDepth(5)).toBeGreaterThanOrEqual(atDepth(2));
  });

  it('saturated unit weight is applied below the water table', () => {
    const base = {
      slopeHeight: 10, slopeAngle: 35, numberOfSlices: 25, waterTableDepth: 2,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 10, frictionAngle: 30 }],
    };
    const withoutSat = calculateSlopeStability(base as never).factorOfSafety;
    const withSat = calculateSlopeStability({
      ...base,
      soilLayers: [{ ...base.soilLayers[0], saturatedUnitWeight: 22 }],
    } as never).factorOfSafety;

    expect(withSat).not.toBe(withoutSat);
  });

  it('Bishop and Fellenius are different procedures, with Fellenius conservative', () => {
    const base = {
      slopeHeight: 10, slopeAngle: 35, numberOfSlices: 30, waterTableDepth: 3,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 10, frictionAngle: 30 }],
    };
    const bishop = calculateSlopeStability({ ...base, method: 'bishop' } as never);
    const ordinary = calculateSlopeStability({ ...base, method: 'ordinary' } as never);

    expect(ordinary.factorOfSafety).toBeLessThan(bishop.factorOfSafety);
    expect(ordinary.method).toBe('Ordinary Method of Slices');
    expect(bishop.method).toBe('Bishop Simplified');
  });

  it('pseudo-static loading reduces FOS monotonically', () => {
    const atKh = (kh: number) => calculateSlopeStability({
      slopeHeight: 10, slopeAngle: 35, numberOfSlices: 25, seismicCoefficient: kh,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 15, frictionAngle: 30 }],
    } as never).factorOfSafety;

    let previous = Infinity;
    for (const kh of [0, 0.05, 0.1, 0.15, 0.2]) {
      const fos = atKh(kh);
      expect(fos, `kh=${kh}`).toBeLessThan(previous);
      previous = fos;
    }
  });

  it('steeper slopes are less stable', () => {
    const atAngle = (beta: number) => calculateSlopeStability({
      slopeHeight: 10, slopeAngle: beta, numberOfSlices: 25,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 15, frictionAngle: 28 }],
    } as never).factorOfSafety;

    expect(atAngle(25)).toBeGreaterThan(atAngle(40));
    expect(atAngle(40)).toBeGreaterThan(atAngle(60));
  });

  it('reports a slip surface that daylights within the slope', () => {
    const H = 10;
    const beta = 35;
    const slopeBase = H / Math.tan((beta * Math.PI) / 180);
    const r = calculateSlopeStability({
      slopeHeight: H, slopeAngle: beta, numberOfSlices: 25,
      soilLayers: [{ thickness: 30, unitWeight: 19, cohesion: 15, frictionAngle: 30 }],
    } as never);

    expect(r.sliceResults.length).toBeGreaterThan(10);
    expect(r.criticalCircle.radius).toBeGreaterThan(0);
    // A plausible critical circle sits above and around the slope face.
    expect(r.criticalCircle.centerY).toBeGreaterThan(H * 0.5);
    expect(r.criticalCircle.centerX).toBeGreaterThan(-slopeBase);
    expect(r.criticalCircle.centerX).toBeLessThan(slopeBase * 3);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 engines: pile capacity, seepage, USCS classification.
//
// These three shipped with no published-value coverage at all, and each was
// found to contain a defect that the directional suites could not see.
// ---------------------------------------------------------------------------

describe('pile capacity — measured strength must govern over correlations', () => {
  const pile = {
    pileDiameter: 0.5,
    pileLength: 15,
    pileType: 'driven',
    pileShape: 'circular',
    waterTableDepth: 999,
  } as const;

  // A layer that carries a laboratory-measured undrained shear strength must
  // use it. Reading N/2 from an SPT correlation and discarding a direct Su
  // measurement throws away the better datum: at Su = 200 kPa the alpha method
  // gives fs = 0.4 x 200 = 80 kPa against N/2 = 5 kPa, a factor of 16.
  it('responds to a measured Su even when the layer also carries an SPT count', () => {
    const withSu = (su: number) => calculatePileCapacity({
      ...pile,
      layers: [
        { thickness: 12, soilType: 'sand', friction_angle: 33, spt_n: 20, unit_weight: 18 },
        { thickness: 8, soilType: 'clay', undrained_shear_strength: su, spt_n: 10, unit_weight: 18 },
      ],
    } as never);

    const soft = withSu(25);
    const stiff = withSu(200);

    expect(stiff.ultimateCapacity, 'Su is ignored — capacity does not move').toBeGreaterThan(
      soft.ultimateCapacity,
    );
  });

  // alpha per the Tomlinson-style total-stress correlation the engine
  // implements: 1.0 up to Su = 25 kPa, tapering to 0.5 at 50 kPa, held at 0.5
  // to 100 kPa, tapering to 0.4 at 200 kPa. fs = alpha x Su.
  it.each([
    [25, 1.0, 25],
    [50, 0.5, 25],
    [100, 0.5, 50],
    [200, 0.4, 80],
  ])('driven pile in clay at Su=%i kPa gives alpha=%f and fs=%i kPa', (su, _alpha, fs) => {
    const r = calculatePileCapacity({
      ...pile,
      method: 'alpha',
      layers: [{ thickness: 20, soilType: 'clay', undrained_shear_strength: su, unit_weight: 18 }],
    } as never);
    expect(r.shaftFrictionPerLayer[0].unitShaftFriction).toBeCloseTo(fs, 1);
  });

  // Deep-foundation base factor in clay is Nc = 9 (Skempton 1951), so
  // qb = 9 Su and Qb = qb x Ab.
  it('uses Nc = 9 for the base in clay (Skempton 1951)', () => {
    const D = 0.5;
    const Ab = Math.PI * (D / 2) ** 2;
    const r = calculatePileCapacity({
      ...pile,
      pileDiameter: D,
      method: 'alpha',
      layers: [{ thickness: 20, soilType: 'clay', undrained_shear_strength: 100, unit_weight: 18 }],
    } as never);
    expect(r.baseResistance).toBeCloseTo(9 * 100 * Ab, 0);
  });
});

describe('seepage — exit gradient from the Dupuit parabola', () => {
  // The engine solves Dupuit-Forchheimer, so the exit gradient must be the
  // gradient that solution actually produces at the downstream face, not the
  // average across the path. Differentiating h(x)^2 = h1^2 - (h1^2 - h2^2)x/L
  // gives dh/dx = -(h1^2 - h2^2) / (2hL), and at x = L, h = h2:
  //
  //     i_exit = (h1^2 - h2^2) / (2 * h2 * L)
  //
  // The exit gradient always exceeds the average H/L, which is why piping
  // starts at the downstream face.
  it.each([
    [10, 2, 8, 3.0],
    [8, 4, 10, 0.6],
    [6, 3, 6, 0.75],
  ])('h1=%i h2=%i L=%i gives i_exit=%f', (h1, h2, L, expected) => {
    const r = calculateDupuitSeepage({
      hydraulicConductivity: 1e-5,
      upstreamHead: h1,
      downstreamHead: h2,
      seepageLength: L,
      specificGravity: 2.65,
      voidRatio: 0.7,
    } as never);
    expect(r.exitGradient).toBeCloseTo(expected, 2);
  });

  it('reports an exit gradient strictly above the average gradient', () => {
    const h1 = 10, h2 = 2, L = 8;
    const r = calculateDupuitSeepage({
      hydraulicConductivity: 1e-5,
      upstreamHead: h1,
      downstreamHead: h2,
      seepageLength: L,
      specificGravity: 2.65,
      voidRatio: 0.7,
    } as never);
    expect(r.exitGradient).toBeGreaterThan((h1 - h2) / L);
  });

  // Terzaghi critical gradient i_cr = (Gs - 1)/(1 + e).
  it.each([
    [2.65, 0.7, 0.9706],
    [2.70, 0.5, 1.1333],
    [2.65, 1.0, 0.825],
  ])('critical gradient for Gs=%f e=%f is %f', (Gs, e, expected) => {
    const r = calculateDupuitSeepage({
      hydraulicConductivity: 1e-5,
      upstreamHead: 5,
      downstreamHead: 2,
      seepageLength: 10,
      specificGravity: Gs,
      voidRatio: e,
    } as never);
    expect(r.criticalGradient).toBeCloseTo(expected, 3);
  });
});

describe('USCS classification — ASTM D2487 organic groups', () => {
  // ASTM D2487 separates organic soils by the ratio of the liquid limit after
  // oven drying to the liquid limit not dried. A ratio below 0.75 classifies
  // the soil as organic: OL when LL < 50, OH when LL >= 50.
  it('classifies a low-plasticity organic silt as OL', () => {
    const r = classifyUSCS({
      gravelPercent: 5,
      sandPercent: 25,
      finesPercent: 70,
      liquidLimit: 40,
      plasticityIndex: 12,
      liquidLimitOvenDriedRatio: 0.6,
    } as never);
    expect(r.symbol).toBe('OL');
    expect(r.group).toBe('organic');
  });

  it('classifies a high-plasticity organic clay as OH', () => {
    const r = classifyUSCS({
      gravelPercent: 0,
      sandPercent: 10,
      finesPercent: 90,
      liquidLimit: 65,
      plasticityIndex: 30,
      liquidLimitOvenDriedRatio: 0.65,
    } as never);
    expect(r.symbol).toBe('OH');
    expect(r.group).toBe('organic');
  });

  it('classifies peat as Pt', () => {
    const r = classifyUSCS({
      gravelPercent: 0,
      sandPercent: 5,
      finesPercent: 95,
      liquidLimit: 120,
      plasticityIndex: 40,
      organicContentPercent: 80,
    } as never);
    expect(r.symbol).toBe('Pt');
    expect(r.group).toBe('organic');
  });

  it('leaves an inorganic soil unaffected by the organic test', () => {
    const r = classifyUSCS({
      gravelPercent: 5,
      sandPercent: 25,
      finesPercent: 70,
      liquidLimit: 40,
      plasticityIndex: 12,
      liquidLimitOvenDriedRatio: 0.9,
    } as never);
    expect(r.group).toBe('fine-grained');
    expect(['CL', 'ML', 'CL-ML']).toContain(r.symbol);
  });
});

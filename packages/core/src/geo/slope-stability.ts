import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slope Stability — method of slices on circular slip surfaces
//
// Two procedures are implemented and produce genuinely different results:
//   - Bishop Simplified (1955): iterative, interslice forces horizontal.
//   - Ordinary / Fellenius (1936): direct, interslice forces neglected.
//
// Sign convention: x increases downslope (crest plateau at x ≤ 0, toe at
// x = slopeBase), y is elevation above the toe. For a circular arc the base
// inclination satisfies sin(α) = (x − x_centre)/R, so slices upslope of the
// centre carry negative α and genuinely resist the movement.
//
// References:
//   - Bishop, A.W. (1955). "The use of the slip circle in the stability
//     analysis of slopes." Géotechnique 5(1), 7-17.
//   - Fellenius, W. (1936). "Calculation of the stability of earth dams."
//   - Duncan, J.M., Wright, S.G. & Brandon, T.L. (2014). "Soil Strength and
//     Slope Stability", 2nd ed.
//   - Eurocode 7 (EN 1997-1:2004), Section 11.
// ---------------------------------------------------------------------------

const GAMMA_W = 9.81; // unit weight of water (kN/m³)

export const SlopeStabilityInputSchema = z.object({
  slopeHeight: z.number().positive().describe('Slope height H (m)'),
  slopeAngle: z.number().min(1).max(89).describe('Slope angle from horizontal (degrees)'),
  soilLayers: z.array(z.object({
    thickness: z.number().positive().describe('Layer thickness measured down from the ground surface (m)'),
    unitWeight: z.number().positive().describe('Total (moist) unit weight γ (kN/m³)'),
    cohesion: z.number().min(0).describe('Effective cohesion c\' (kPa)'),
    frictionAngle: z.number().min(0).max(50).describe('Effective friction angle φ\' (degrees)'),
    saturatedUnitWeight: z.number().positive().optional().describe('Saturated unit weight γ_sat (kN/m³) — used below the water table'),
  })).min(1),
  waterTableDepth: z.number().min(0).default(999).describe('Depth to water table below the crest (m)'),
  surcharge: z.number().min(0).default(0).describe('Surcharge load at crest (kPa)'),
  seismicCoefficient: z.number().min(0).default(0).describe('Horizontal seismic coefficient kh'),
  numberOfSlices: z.number().int().min(5).max(50).default(10),
  method: z.enum(['bishop', 'ordinary']).default('bishop'),
});

export type SlopeStabilityInput = z.infer<typeof SlopeStabilityInputSchema>;

export interface SlopeStabilityResult {
  method: string;
  factorOfSafety: number;
  criticalCircle: {
    centerX: number;
    centerY: number;
    radius: number;
  };
  sliceResults: Array<{
    sliceNumber: number;
    width: number;
    weight: number;
    baseAngle: number;
    normalForce: number;
    shearStrength: number;
  }>;
  isStable: boolean;
  stabilityClass: 'STABLE' | 'MARGINAL' | 'UNSTABLE' | 'CRITICAL';
  steps: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Slope geometry
// ---------------------------------------------------------------------------

/** Ground surface elevation at horizontal position x. */
function surfaceElevation(x: number, H: number, slopeBase: number): number {
  if (x <= 0) return H;
  if (x >= slopeBase) return 0;
  return H * (1 - x / slopeBase);
}

/** Lower arc of the trial circle, or null where the circle does not reach x. */
function arcElevation(x: number, cx: number, cy: number, R: number): number | null {
  const dx = x - cx;
  const under = R * R - dx * dx;
  if (under <= 0) return null;
  return cy - Math.sqrt(under);
}

/** Depth of the slip surface below the ground surface at x (negative = above ground). */
function slipDepth(x: number, cx: number, cy: number, R: number, H: number, slopeBase: number): number {
  const yArc = arcElevation(x, cx, cy, R);
  if (yArc === null) return -Infinity;
  return surfaceElevation(x, H, slopeBase) - yArc;
}

/**
 * Locates the entry and exit points of the slip circle by scanning the chord
 * and refining each crossing by bisection.
 */
function findDaylightSpan(
  cx: number, cy: number, R: number, H: number, slopeBase: number,
): { xEntry: number; xExit: number } | null {
  const xLo = cx - R;
  const xHi = cx + R;
  const samples = 400;
  const step = (xHi - xLo) / samples;

  let first = NaN;
  let last = NaN;
  for (let i = 0; i <= samples; i++) {
    const x = xLo + i * step;
    if (slipDepth(x, cx, cy, R, H, slopeBase) > 0) {
      if (Number.isNaN(first)) first = x;
      last = x;
    }
  }
  if (Number.isNaN(first) || Number.isNaN(last) || last <= first) return null;

  const refine = (inside: number, outside: number): number => {
    let a = inside;
    let b = outside;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (slipDepth(m, cx, cy, R, H, slopeBase) > 0) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };

  const xEntry = refine(first, Math.max(xLo, first - step));
  const xExit = refine(last, Math.min(xHi, last + step));

  if (xExit - xEntry < 1e-6) return null;
  return { xEntry, xExit };
}

// ---------------------------------------------------------------------------
// Soil profile lookup
// ---------------------------------------------------------------------------

interface LayerPick {
  cohesion: number;
  frictionAngle: number;
}

/** Strength parameters of the layer containing elevation `y` under surface `ySurf`. */
function strengthAt(
  y: number, ySurf: number, layers: SlopeStabilityInput['soilLayers'],
): LayerPick {
  let depthBottom = 0;
  for (const layer of layers) {
    depthBottom += layer.thickness;
    if (y >= ySurf - depthBottom) {
      return { cohesion: layer.cohesion, frictionAngle: layer.frictionAngle };
    }
  }
  const last = layers[layers.length - 1];
  return { cohesion: last.cohesion, frictionAngle: last.frictionAngle };
}

/**
 * Slice weight per unit width, integrating each layer the slice passes through
 * and applying the saturated unit weight below the water table.
 */
function sliceWeight(
  yBase: number,
  ySurf: number,
  waterElevation: number,
  layers: SlopeStabilityInput['soilLayers'],
): number {
  let weightPerWidth = 0;
  let depthTop = 0;

  for (const layer of layers) {
    const layerTop = ySurf - depthTop;
    const layerBottom = ySurf - (depthTop + layer.thickness);

    const segTop = Math.min(layerTop, ySurf);
    const segBottom = Math.max(layerBottom, yBase);
    depthTop += layer.thickness;

    if (segBottom >= segTop) continue;

    const gammaMoist = layer.unitWeight;
    const gammaSat = layer.saturatedUnitWeight ?? layer.unitWeight;

    const hSubmerged = Math.max(0, Math.min(segTop, waterElevation) - segBottom);
    const hMoist = Math.max(0, segTop - Math.max(segBottom, waterElevation));

    weightPerWidth += gammaMoist * hMoist + gammaSat * hSubmerged;

    if (layerBottom <= yBase) break;
  }

  return weightPerWidth;
}

// ---------------------------------------------------------------------------
// Method of slices
// ---------------------------------------------------------------------------

interface CircleResult {
  fos: number;
  slices: SlopeStabilityResult['sliceResults'];
}

function analyzeCircle(
  cx: number,
  cy: number,
  R: number,
  H: number,
  slopeBase: number,
  layers: SlopeStabilityInput['soilLayers'],
  waterElevation: number,
  surcharge: number,
  kh: number,
  nSlices: number,
  method: 'bishop' | 'ordinary',
): CircleResult | null {
  const span = findDaylightSpan(cx, cy, R, H, slopeBase);
  if (!span) return null;

  const { xEntry, xExit } = span;
  const b = (xExit - xEntry) / nSlices;
  if (b <= 0) return null;

  // Reject circles that cut below the defined soil profile (rigid base).
  const profileDepth = layers.reduce((sum, l) => sum + l.thickness, 0);

  interface SliceData {
    b: number;
    W: number;
    alpha: number;
    u: number;
    c: number;
    tanPhi: number;
    yCentroid: number;
  }

  const data: SliceData[] = [];

  for (let i = 0; i < nSlices; i++) {
    const xMid = xEntry + (i + 0.5) * b;
    const yBase = arcElevation(xMid, cx, cy, R);
    if (yBase === null) continue;

    const ySurf = surfaceElevation(xMid, H, slopeBase);
    const h = ySurf - yBase;
    if (h <= 1e-6) continue;
    if (h > profileDepth) return null; // slip surface passes below the rigid base

    // The crest sits at x ≤ 0 and the ground descends towards +x, so the mass
    // slides in the +x direction and the driving weight lies upslope of the
    // centre. Positive α therefore corresponds to x < cx; slices beyond the
    // centre form the passive toe wedge and carry negative α.
    const sinAlpha = (cx - xMid) / R;
    if (Math.abs(sinAlpha) >= 1) return null;
    const alpha = Math.asin(sinAlpha);

    // The phreatic surface cannot rise above the ground: a water table given
    // relative to the crest is clipped to the local surface so that a shallow
    // GWT does not imply an external water load the model does not carry.
    const waterLocal = Math.min(waterElevation, ySurf);

    let W = sliceWeight(yBase, ySurf, waterLocal, layers) * b;
    if (xMid <= 0) W += surcharge * b; // surcharge acts on the crest plateau

    const u = Math.max(0, waterLocal - yBase) * GAMMA_W;
    const { cohesion, frictionAngle } = strengthAt(yBase, ySurf, layers);

    data.push({
      b,
      W,
      alpha,
      u,
      c: cohesion,
      tanPhi: Math.tan(degToRad(frictionAngle)),
      yCentroid: (ySurf + yBase) / 2,
    });
  }

  if (data.length < 3) return null;

  // Driving moment about the circle centre, divided through by R.
  // Weight term: W·sin(α). Pseudo-static term: kh·W·(y_c − y_cg)/R.
  let driving = 0;
  for (const s of data) {
    driving += s.W * Math.sin(s.alpha) + (kh * s.W * (cy - s.yCentroid)) / R;
  }
  if (driving <= 1e-6) return null; // no kinematically meaningful mechanism

  const buildSlices = (fos: number): SlopeStabilityResult['sliceResults'] =>
    data.map((s, index) => {
      const mAlpha = Math.cos(s.alpha) + (Math.sin(s.alpha) * s.tanPhi) / fos;
      const N = method === 'bishop'
        ? (s.W - s.u * s.b) / mAlpha
        : s.W * Math.cos(s.alpha) - kh * s.W * Math.sin(s.alpha);
      const l = s.b / Math.cos(s.alpha);
      const shear = method === 'bishop'
        ? s.c * s.b + Math.max(0, s.W - s.u * s.b) * s.tanPhi
        : s.c * l + Math.max(0, N - s.u * l) * s.tanPhi;
      return {
        sliceNumber: index + 1,
        width: Math.round(s.b * 100) / 100,
        weight: Math.round(s.W * 10) / 10,
        baseAngle: Math.round((s.alpha * 180) / Math.PI * 10) / 10,
        normalForce: Math.round(N * 10) / 10,
        shearStrength: Math.round(shear * 10) / 10,
      };
    });

  if (method === 'ordinary') {
    // Fellenius: N' = W·cosα − kh·W·sinα − u·l, taken directly.
    let resisting = 0;
    for (const s of data) {
      const l = s.b / Math.cos(s.alpha);
      const N = s.W * Math.cos(s.alpha) - kh * s.W * Math.sin(s.alpha);
      const effectiveN = Math.max(0, N - s.u * l);
      resisting += s.c * l + effectiveN * s.tanPhi;
    }
    const fos = resisting / driving;
    if (!Number.isFinite(fos) || fos <= 0) return null;
    return { fos, slices: buildSlices(fos) };
  }

  // Bishop simplified: iterate on F because m_alpha depends on it.
  let fos = 1.0;
  let converged = false;

  for (let iter = 0; iter < 100; iter++) {
    let resisting = 0;
    let invalid = false;

    for (const s of data) {
      const mAlpha = Math.cos(s.alpha) + (Math.sin(s.alpha) * s.tanPhi) / fos;
      // m_alpha below ~0.2 makes the slice normal force unreliable; the circle
      // is rejected rather than reported (standard practice).
      if (mAlpha < 0.2) { invalid = true; break; }
      // Effective normal force cannot go into tension under high pore pressure.
      const effectiveW = Math.max(0, s.W - s.u * s.b);
      resisting += (s.c * s.b + effectiveW * s.tanPhi) / mAlpha;
    }
    if (invalid) return null;

    const next = resisting / driving;
    if (!Number.isFinite(next) || next <= 0) return null;

    if (Math.abs(next - fos) < 1e-5) {
      fos = next;
      converged = true;
      break;
    }
    fos = next;
  }

  if (!converged) return null;
  return { fos, slices: buildSlices(fos) };
}

// ---------------------------------------------------------------------------
// Critical circle search
// ---------------------------------------------------------------------------

interface SearchBest {
  fos: number;
  cx: number;
  cy: number;
  R: number;
  slices: SlopeStabilityResult['sliceResults'];
}

function searchCritical(
  H: number,
  slopeBase: number,
  layers: SlopeStabilityInput['soilLayers'],
  waterElevation: number,
  surcharge: number,
  kh: number,
  nSlices: number,
  method: 'bishop' | 'ordinary',
  bounds: { xLo: number; xHi: number; yLo: number; yHi: number },
  nx: number,
  ny: number,
  nr: number,
  best: SearchBest | null,
): SearchBest | null {
  let current = best;

  for (let ix = 0; ix < nx; ix++) {
    const cx = bounds.xLo + (nx === 1 ? 0 : (ix / (nx - 1)) * (bounds.xHi - bounds.xLo));
    for (let iy = 0; iy < ny; iy++) {
      const cy = bounds.yLo + (ny === 1 ? 0 : (iy / (ny - 1)) * (bounds.yHi - bounds.yLo));

      // Radii spanning circles that clip the toe through to deep-seated ones.
      const rToe = Math.hypot(cx - slopeBase, cy);
      const rCrest = Math.hypot(cx, cy - H);
      const rLo = Math.min(rToe, rCrest) * 0.6;
      const rHi = Math.max(rToe, rCrest) * 1.4;

      for (let ir = 0; ir < nr; ir++) {
        const R = rLo + (nr === 1 ? 0 : (ir / (nr - 1)) * (rHi - rLo));
        if (R <= H * 0.2) continue;

        const result = analyzeCircle(
          cx, cy, R, H, slopeBase, layers, waterElevation, surcharge, kh, nSlices, method,
        );
        if (!result) continue;
        if (result.fos > 0 && result.fos < 50 && (current === null || result.fos < current.fos)) {
          current = { fos: result.fos, cx, cy, R, slices: result.slices };
        }
      }
    }
  }

  return current;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateSlopeStability(input: SlopeStabilityInput): SlopeStabilityResult {
  const v = SlopeStabilityInputSchema.parse(input);
  const steps: string[] = [];
  const {
    slopeHeight: H, slopeAngle, soilLayers,
    waterTableDepth: gwt, surcharge, seismicCoefficient: kh, numberOfSlices,
  } = v;

  const slopeBase = H / Math.tan(degToRad(slopeAngle));
  const waterElevation = H - gwt; // water table measured down from the crest
  const methodLabel = v.method === 'bishop' ? 'Bishop Simplified' : 'Ordinary Method of Slices';

  steps.push(`Slope: H=${H}m, angle=${slopeAngle}°, base=${slopeBase.toFixed(1)}m`);
  steps.push(`Soil: ${soilLayers.length} layer(s), GWT=${gwt}m below crest, kh=${kh}`);
  steps.push(`Method: ${methodLabel}`);

  // Coarse grid, then a local refinement pass around the best centre found.
  let best = searchCritical(
    H, slopeBase, soilLayers, waterElevation, surcharge, kh, numberOfSlices, v.method,
    { xLo: -0.6 * slopeBase - 0.2 * H, xHi: slopeBase + 0.8 * H, yLo: H * 0.7, yHi: H * 3.0 },
    12, 10, 12, null,
  );

  if (best) {
    const spanX = Math.max(slopeBase, H) * 0.25;
    const spanY = H * 0.35;
    best = searchCritical(
      H, slopeBase, soilLayers, waterElevation, surcharge, kh, numberOfSlices, v.method,
      {
        xLo: best.cx - spanX, xHi: best.cx + spanX,
        yLo: Math.max(best.cy - spanY, H * 0.55), yHi: best.cy + spanY,
      },
      9, 9, 14, best,
    );
  }

  if (!best) {
    steps.push('No kinematically valid slip circle was found for this geometry.');
    return {
      method: methodLabel,
      factorOfSafety: 0,
      criticalCircle: { centerX: 0, centerY: 0, radius: 0 },
      sliceResults: [],
      isStable: false,
      stabilityClass: 'CRITICAL',
      steps,
    };
  }

  const minFos = best.fos;

  let stabilityClass: SlopeStabilityResult['stabilityClass'];
  if (minFos >= 1.5) stabilityClass = 'STABLE';
  else if (minFos >= 1.25) stabilityClass = 'MARGINAL';
  else if (minFos >= 1.0) stabilityClass = 'UNSTABLE';
  else stabilityClass = 'CRITICAL';

  steps.push(`Critical circle: center (${best.cx.toFixed(1)}, ${best.cy.toFixed(1)}), R=${best.R.toFixed(1)}m`);
  steps.push(`Slices: ${best.slices.length} (base angles ${best.slices[0]?.baseAngle}° to ${best.slices[best.slices.length - 1]?.baseAngle}°)`);
  steps.push(`Factor of Safety: ${minFos.toFixed(3)}`);
  steps.push(`Classification: ${stabilityClass} (EC7 min FOS=1.25 with partial factors, global FOS=1.5)`);

  if (kh > 0) {
    steps.push(`Pseudo-static horizontal coefficient kh=${kh} applied as an inertia force at each slice centroid`);
  }
  if (waterElevation > 0) {
    steps.push(`Pore pressures from a water table ${gwt}m below the crest (elevation ${waterElevation.toFixed(1)}m)`);
  }

  return {
    method: methodLabel,
    factorOfSafety: Math.round(minFos * 1000) / 1000,
    criticalCircle: {
      centerX: Math.round(best.cx * 100) / 100,
      centerY: Math.round(best.cy * 100) / 100,
      radius: Math.round(best.R * 100) / 100,
    },
    sliceResults: best.slices,
    isStable: minFos >= 1.5,
    stabilityClass,
    steps,
  };
}

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shallow foundation bearing capacity
//
// Four procedures are implemented and kept distinct. Terzaghi uses his own
// factors and shape corrections; Meyerhof, Hansen and Vesic share the
// Prandtl-Reissner Nq/Nc but each carries its own Nγ, shape factors and depth
// factors.
//
// References:
//   - Terzaghi, K. (1943). "Theoretical Soil Mechanics." Wiley.
//   - Meyerhof, G.G. (1963). "Some recent research on the bearing capacity of
//     foundations." Canadian Geotechnical Journal 1(1), 16-26.
//   - Hansen, J.B. (1970). "A revised and extended formula for bearing
//     capacity." Danish Geotechnical Institute Bulletin No. 28.
//   - Vesic, A.S. (1973). "Analysis of ultimate loads of shallow foundations."
//     JSMFD, ASCE, 99(SM1), 45-73.
// ---------------------------------------------------------------------------

const GAMMA_W = 9.81; // unit weight of water (kN/m³)

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const BearingCapacityInputSchema = z.object({
  width: z.number().positive().describe('Foundation width B (m)'),
  length: z.number().positive().optional().describe('Foundation length L (m) — omit for strip'),
  depth: z.number().nonnegative().describe('Embedment depth Df (m)'),
  unitWeight: z.number().positive().describe('Soil unit weight γ (kN/m³)'),
  cohesion: z.number().nonnegative().describe('Cohesion c (kPa)'),
  frictionAngle: z.number().min(0).max(50).describe('Friction angle φ (degrees)'),
  method: z.enum(['terzaghi', 'meyerhof', 'hansen', 'vesic']).default('meyerhof'),
  factorOfSafety: z.number().positive().default(3.0),
  waterTableDepth: z.number().nonnegative().optional().describe('Depth to water table from surface (m)'),
  shape: z.enum(['strip', 'square', 'circular', 'rectangular']).default('strip'),
});

export type BearingCapacityInput = z.infer<typeof BearingCapacityInputSchema>;

export interface BearingCapacityResult {
  method: string;
  qUltimate: number;
  qAllowable: number;
  factorOfSafety: number;
  bearingCapacityFactors: { Nc: number; Nq: number; Ngamma: number };
  shapeFactors?: { sc: number; sq: number; sgamma: number };
  depthFactors?: { dc: number; dq: number; dgamma: number };
  steps: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// Bearing capacity factors
// ---------------------------------------------------------------------------

/**
 * Terzaghi (1943) factors. Nq uses Terzaghi's own expression (which differs
 * from the Prandtl-Reissner form used by the later methods).
 *
 * Terzaghi's Nγ is defined through the tabulated passive coefficient K_pγ and
 * has no exact closed form. The Vesic (1973) expression is used as the
 * closed-form surrogate — this is disclosed in the calculation steps because it
 * runs roughly 25-40% above Terzaghi's tabulated Nγ over the common φ range.
 */
function terzaghiFactors(phi: number): { Nc: number; Nq: number; Ngamma: number } {
  const phiRad = degToRad(phi);

  if (phi === 0) {
    return { Nc: 5.7, Nq: 1.0, Ngamma: 0.0 };
  }

  // Nq = exp(2π(0.75 - φ/360)tanφ) / (2cos²(45 + φ/2))
  const a = Math.exp(2 * Math.PI * (0.75 - phi / 360) * Math.tan(phiRad));
  const b = 2 * Math.pow(Math.cos(degToRad(45 + phi / 2)), 2);
  const Nq = a / b;

  const Nc = (Nq - 1) / Math.tan(phiRad);
  const Ngamma = 2 * (Nq + 1) * Math.tan(phiRad);

  return { Nc, Nq, Ngamma };
}

/**
 * Prandtl-Reissner Nq and Nc, shared by Meyerhof, Hansen and Vesic.
 *   Nq = tan²(45 + φ/2)·exp(π·tanφ)
 *   Nc = (Nq − 1)·cotφ
 */
function prandtlFactors(phi: number): { Nc: number; Nq: number } {
  if (phi === 0) {
    return { Nc: 5.14, Nq: 1.0 };
  }
  const phiRad = degToRad(phi);
  const Nq =
    Math.pow(Math.tan(degToRad(45 + phi / 2)), 2) * Math.exp(Math.PI * Math.tan(phiRad));
  const Nc = (Nq - 1) / Math.tan(phiRad);
  return { Nc, Nq };
}

/** Meyerhof (1963): Nγ = (Nq − 1)·tan(1.4φ) */
function meyerhofNgamma(phi: number, Nq: number): number {
  if (phi === 0) return 0;
  return (Nq - 1) * Math.tan(degToRad(1.4 * phi));
}

/** Hansen (1970): Nγ = 1.5·(Nq − 1)·tanφ */
function hansenNgamma(phi: number, Nq: number): number {
  if (phi === 0) return 0;
  return 1.5 * (Nq - 1) * Math.tan(degToRad(phi));
}

/** Vesic (1973): Nγ = 2·(Nq + 1)·tanφ */
function vesicNgamma(phi: number, Nq: number): number {
  if (phi === 0) return 0;
  return 2 * (Nq + 1) * Math.tan(degToRad(phi));
}

// ---------------------------------------------------------------------------
// Effective B/L ratio from the declared shape
// ---------------------------------------------------------------------------

/**
 * Resolves the declared shape and optional length into the B/L ratio used by
 * the shape factors. A strip footing has B/L = 0; square and circular have
 * B/L = 1. Supplying `length` without an explicit shape is treated as a
 * rectangular footing.
 */
function effectiveBOverL(
  shape: BearingCapacityInput['shape'],
  B: number,
  L: number | undefined,
): { BL: number; resolvedShape: string } {
  switch (shape) {
    case 'square':
      return { BL: 1, resolvedShape: 'square' };
    case 'circular':
      return { BL: 1, resolvedShape: 'circular' };
    case 'rectangular':
      if (L && L > 0) return { BL: Math.min(B / L, 1), resolvedShape: 'rectangular' };
      return { BL: 0, resolvedShape: 'rectangular (no length given — treated as strip)' };
    case 'strip':
    default:
      // Backwards compatible: an explicit length implies a rectangular footing.
      if (L && L > 0) return { BL: Math.min(B / L, 1), resolvedShape: 'rectangular (inferred from length)' };
      return { BL: 0, resolvedShape: 'strip' };
  }
}

// ---------------------------------------------------------------------------
// Shape factors
// ---------------------------------------------------------------------------

/** Meyerhof (1963), with Kp = tan²(45 + φ/2). */
function meyerhofShapeFactors(BL: number, phi: number): { sc: number; sq: number; sgamma: number } {
  if (BL <= 0) return { sc: 1, sq: 1, sgamma: 1 };
  const Kp = Math.pow(Math.tan(degToRad(45 + phi / 2)), 2);
  const sc = 1 + 0.2 * BL * Kp;
  const sqsg = phi >= 10 ? 1 + 0.1 * BL * Kp : 1;
  return { sc, sq: sqsg, sgamma: sqsg };
}

/** Hansen (1970): sq uses sinφ. */
function hansenShapeFactors(
  BL: number, phi: number, Nc: number, Nq: number,
): { sc: number; sq: number; sgamma: number } {
  if (BL <= 0) return { sc: 1, sq: 1, sgamma: 1 };
  return {
    sc: 1 + (Nq / Nc) * BL,
    sq: 1 + BL * Math.sin(degToRad(phi)),
    sgamma: Math.max(1 - 0.4 * BL, 0.6),
  };
}

/** Vesic (1973): sq uses tanφ. */
function vesicShapeFactors(
  BL: number, phi: number, Nc: number, Nq: number,
): { sc: number; sq: number; sgamma: number } {
  if (BL <= 0) return { sc: 1, sq: 1, sgamma: 1 };
  return {
    sc: 1 + (Nq / Nc) * BL,
    sq: 1 + BL * Math.tan(degToRad(phi)),
    sgamma: Math.max(1 - 0.4 * BL, 0.6),
  };
}

// ---------------------------------------------------------------------------
// Depth factors
// ---------------------------------------------------------------------------

/** Meyerhof (1963) depth factors. */
function meyerhofDepthFactors(B: number, D: number, phi: number): { dc: number; dq: number; dgamma: number } {
  const DB = D / B;
  const rootKp = Math.tan(degToRad(45 + phi / 2));
  const dc = 1 + 0.2 * DB * rootKp;
  const dqdg = phi >= 10 ? 1 + 0.1 * DB * rootKp : 1;
  return { dc, dq: dqdg, dgamma: dqdg };
}

/**
 * Hansen (1970) / Vesic (1973) depth factors — identical between the two.
 *   k = D/B          for D/B ≤ 1
 *   k = arctan(D/B)  for D/B > 1  (radians)
 *   dc = 1 + 0.4k,  dq = 1 + 2·tanφ·(1 − sinφ)²·k,  dγ = 1.0
 */
function hansenVesicDepthFactors(B: number, D: number, phi: number): { dc: number; dq: number; dgamma: number } {
  const DB = D / B;
  const k = DB <= 1 ? DB : Math.atan(DB);
  const phiRad = degToRad(phi);
  return {
    dc: 1 + 0.4 * k,
    dq: 1 + 2 * Math.tan(phiRad) * Math.pow(1 - Math.sin(phiRad), 2) * k,
    dgamma: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateBearingCapacity(
  input: BearingCapacityInput,
): BearingCapacityResult {
  const validated = BearingCapacityInputSchema.parse(input);
  const {
    width: B, length: L, depth: D, unitWeight: gamma,
    cohesion: c, frictionAngle: phi, method, factorOfSafety: FS,
  } = validated;

  const steps: string[] = [];
  steps.push(`Method: ${method.charAt(0).toUpperCase() + method.slice(1)}`);
  steps.push(`B = ${B} m, D = ${D} m, γ = ${gamma} kN/m³, c = ${c} kPa, φ = ${phi}°`);

  const { BL, resolvedShape } = effectiveBOverL(validated.shape, B, L);

  let Nc: number, Nq: number, Ngamma: number;
  let sc = 1, sq = 1, sgamma = 1;
  let dc = 1, dq = 1, dgamma = 1;

  if (method === 'terzaghi') {
    ({ Nc, Nq, Ngamma } = terzaghiFactors(phi));
    steps.push(`Bearing capacity factors (Terzaghi 1943): Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=${Ngamma.toFixed(2)}`);
    steps.push(`Note: Terzaghi's Nγ is tabulated via K_pγ; the Vesic (1973) closed form is used here as a surrogate and runs above Terzaghi's tabulated values.`);

    // Terzaghi's original shape corrections (no depth factors in his method).
    if (validated.shape === 'square') {
      sc = 1.3; sgamma = 0.8;
      steps.push(`Square footing (Terzaghi): sc=1.3, sγ=0.8`);
    } else if (validated.shape === 'circular') {
      sc = 1.3; sgamma = 0.6;
      steps.push(`Circular footing (Terzaghi): sc=1.3, sγ=0.6`);
    } else {
      steps.push(`Strip footing (Terzaghi): no shape correction`);
    }
  } else {
    ({ Nc, Nq } = prandtlFactors(phi));

    if (method === 'meyerhof') {
      Ngamma = meyerhofNgamma(phi, Nq);
      ({ sc, sq, sgamma } = meyerhofShapeFactors(BL, phi));
      ({ dc, dq, dgamma } = meyerhofDepthFactors(B, D, phi));
      steps.push(`Bearing capacity factors (Meyerhof 1963): Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=(Nq−1)tan(1.4φ)=${Ngamma.toFixed(2)}`);
    } else if (method === 'hansen') {
      Ngamma = hansenNgamma(phi, Nq);
      ({ sc, sq, sgamma } = hansenShapeFactors(BL, phi, Nc, Nq));
      ({ dc, dq, dgamma } = hansenVesicDepthFactors(B, D, phi));
      steps.push(`Bearing capacity factors (Hansen 1970): Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=1.5(Nq−1)tanφ=${Ngamma.toFixed(2)}`);
    } else {
      Ngamma = vesicNgamma(phi, Nq);
      ({ sc, sq, sgamma } = vesicShapeFactors(BL, phi, Nc, Nq));
      ({ dc, dq, dgamma } = hansenVesicDepthFactors(B, D, phi));
      steps.push(`Bearing capacity factors (Vesic 1973): Nc=${Nc.toFixed(2)}, Nq=${Nq.toFixed(2)}, Nγ=2(Nq+1)tanφ=${Ngamma.toFixed(2)}`);
    }

    steps.push(`Shape: ${resolvedShape} (B/L = ${BL.toFixed(3)})`);
    steps.push(`Shape factors: sc=${sc.toFixed(3)}, sq=${sq.toFixed(3)}, sγ=${sgamma.toFixed(3)}`);
    steps.push(`Depth factors: dc=${dc.toFixed(3)}, dq=${dq.toFixed(3)}, dγ=${dgamma.toFixed(3)}`);
  }

  // --- Water table correction ---
  // Case 1: GWT at or above foundation level → effective overburden and γ' in the Nγ term
  // Case 2: GWT between D and D+B → γ interpolated across the influence zone
  // Case 3: GWT below D+B → no correction
  const gwt = validated.waterTableDepth;
  const gammaPrime = Math.max(gamma - GAMMA_W, 0.1); // guard against γ ≤ γw

  let q: number;          // overburden pressure at foundation level
  let gammaBelow: number; // effective unit weight below foundation for the Nγ term

  if (gwt !== undefined && gwt < D + B) {
    if (gwt <= D) {
      q = gamma * gwt + gammaPrime * (D - gwt);
      gammaBelow = gammaPrime;
      steps.push(`Water table at ${gwt}m (at/above foundation): q = γ×${gwt} + γ'×${(D - gwt).toFixed(1)} = ${q.toFixed(2)} kPa`);
      steps.push(`Submerged unit weight γ' = ${gammaPrime.toFixed(2)} kN/m³ used in Nγ term`);
    } else {
      q = gamma * D;
      const dw = gwt - D;
      gammaBelow = gammaPrime + (dw / B) * (gamma - gammaPrime);
      steps.push(`Water table at ${gwt}m (within influence zone): γ_eff = ${gammaBelow.toFixed(2)} kN/m³ (interpolated)`);
    }
  } else {
    q = gamma * D;
    gammaBelow = gamma;
  }
  steps.push(`Overburden pressure: q = ${q.toFixed(2)} kPa`);

  // General bearing capacity equation:
  // q_ult = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ
  const term1 = c * Nc * sc * dc;
  const term2 = q * Nq * sq * dq;
  const term3 = 0.5 * gammaBelow * B * Ngamma * sgamma * dgamma;

  const qUltimate = term1 + term2 + term3;

  steps.push(`q_ult = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ`);
  steps.push(`q_ult = ${term1.toFixed(2)} + ${term2.toFixed(2)} + ${term3.toFixed(2)} = ${qUltimate.toFixed(2)} kPa`);

  const qAllowable = qUltimate / FS;
  steps.push(`q_allow = q_ult / FS = ${qUltimate.toFixed(2)} / ${FS} = ${qAllowable.toFixed(2)} kPa`);

  return {
    method,
    qUltimate: Math.round(qUltimate * 100) / 100,
    qAllowable: Math.round(qAllowable * 100) / 100,
    factorOfSafety: FS,
    bearingCapacityFactors: {
      Nc: Math.round(Nc * 100) / 100,
      Nq: Math.round(Nq * 100) / 100,
      Ngamma: Math.round(Ngamma * 100) / 100,
    },
    shapeFactors: { sc, sq, sgamma },
    depthFactors: { dc, dq, dgamma },
    steps,
  };
}

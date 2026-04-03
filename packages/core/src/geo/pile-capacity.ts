import { z } from 'zod';

// ---------------------------------------------------------------------------
// Pile Capacity — Axial capacity of single piles
//
// Methods:
//   - α-method (Tomlinson) for cohesive soils (undrained)
//   - β-method (Burland) for cohesionless soils (drained)
//   - SPT-based (Meyerhof 1976) for driven piles in sand/gravel
//   - API RP 2GEO for offshore piles
//
// References:
//   - Tomlinson, M.J. (1971). "Some effects of pile driving on skin friction."
//   - Burland, J.B. (1973). "Shaft friction of piles in clay."
//   - Meyerhof, G.G. (1976). "Bearing capacity and settlement of pile foundations."
//   - API RP 2GEO (2014). "Geotechnical and Foundation Design Considerations."
//   - Eurocode 7 (EN 1997-1:2004), Section 7.6
// ---------------------------------------------------------------------------

export const PileCapacityInputSchema = z.object({
  pileDiameter: z.number().positive().describe('Pile diameter or width (m)'),
  pileLength: z.number().positive().describe('Embedded pile length L (m)'),
  pileType: z.enum(['driven', 'bored', 'cfa']).default('driven'),
  pileShape: z.enum(['circular', 'square', 'h-section']).default('circular'),
  layers: z.array(z.object({
    thickness: z.number().positive().describe('Layer thickness (m)'),
    soilType: z.enum(['clay', 'sand', 'silt', 'gravel', 'rock']),
    undrained_shear_strength: z.number().min(0).optional().describe('Su or cu (kPa) — for cohesive soils'),
    friction_angle: z.number().min(0).max(50).optional().describe('φ\' (degrees) — for granular soils'),
    unit_weight: z.number().positive().default(18).describe('γ (kN/m³)'),
    spt_n: z.number().min(0).optional().describe('SPT N-value'),
    Ko: z.number().positive().optional().describe('At-rest earth pressure coefficient'),
  })).min(1),
  waterTableDepth: z.number().min(0).default(999).describe('Water table depth (m)'),
  factorOfSafety: z.number().positive().default(2.5),
  method: z.enum(['alpha', 'beta', 'spt-meyerhof', 'auto']).default('auto'),
});

export type PileCapacityInput = z.infer<typeof PileCapacityInputSchema>;

export interface PileCapacityResult {
  method: string;
  pileType: string;
  pileDiameter: number;
  pileLength: number;
  shaftResistance: number;     // Qs (kN)
  baseResistance: number;      // Qb (kN)
  ultimateCapacity: number;    // Qu = Qs + Qb (kN)
  allowableCapacity: number;   // Qa = Qu / FS (kN)
  factorOfSafety: number;
  shaftFrictionPerLayer: Array<{
    depth: number;
    thickness: number;
    soilType: string;
    unitShaftFriction: number; // fs (kPa)
    shaftResistance: number;   // kN
  }>;
  steps: string[];
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// α coefficients (Tomlinson 1971, updated API RP 2GEO)
// ---------------------------------------------------------------------------

function getAlpha(su: number, pileType: string): number {
  // API RP 2GEO / Tomlinson correlation
  if (pileType === 'driven') {
    if (su <= 25) return 1.0;
    if (su <= 50) return 1.0 - 0.5 * (su - 25) / 25;
    if (su <= 100) return 0.5;
    if (su <= 200) return 0.5 - 0.1 * (su - 100) / 100;
    return 0.4;
  }
  // Bored piles: lower α values
  if (su <= 25) return 0.7;
  if (su <= 50) return 0.7 - 0.3 * (su - 25) / 25;
  if (su <= 100) return 0.4;
  if (su <= 200) return 0.4 - 0.1 * (su - 100) / 100;
  return 0.3;
}

// ---------------------------------------------------------------------------
// β coefficients (Burland 1973)
// ---------------------------------------------------------------------------

function getBeta(phi: number, depth: number, pileType: string): number {
  const phiRad = degToRad(phi);
  const Ko = 1 - Math.sin(phiRad);
  const KoMultiplier = pileType === 'driven' ? 1.5 : 1.0;
  const delta = pileType === 'driven' ? phi * 0.75 : phi * 0.67; // interface friction
  return KoMultiplier * Ko * Math.tan(degToRad(delta));
}

// ---------------------------------------------------------------------------
// Base bearing capacity factor Nq (Berezantsev 1961)
// ---------------------------------------------------------------------------

function getBaseNq(phi: number): number {
  const phiRad = degToRad(phi);
  if (phi === 0) return 1;
  return Math.exp(Math.PI * Math.tan(phiRad)) * Math.pow(Math.tan(degToRad(45 + phi / 2)), 2);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculatePileCapacity(input: PileCapacityInput): PileCapacityResult {
  const v = PileCapacityInputSchema.parse(input);
  const steps: string[] = [];
  const { pileDiameter: D, pileLength: L, pileType, layers, waterTableDepth: gwt, factorOfSafety: FS } = v;

  // Pile geometry
  const Ap = v.pileShape === 'circular'
    ? Math.PI * (D / 2) ** 2
    : v.pileShape === 'square'
      ? D * D
      : D * 0.3; // H-section approximate

  const perimeter = v.pileShape === 'circular'
    ? Math.PI * D
    : v.pileShape === 'square'
      ? 4 * D
      : 2 * (D + 0.3); // H-section approximate

  steps.push(`Pile: ${pileType} ${v.pileShape}, D=${D}m, L=${L}m`);
  steps.push(`Base area Ab=${Ap.toFixed(4)} m², Perimeter P=${perimeter.toFixed(3)} m`);

  // Auto-select method based on dominant soil type
  let method = v.method;
  if (method === 'auto') {
    const dominantSoil = layers.reduce((a, b) => b.thickness > a.thickness ? b : a);
    if (dominantSoil.soilType === 'clay' || dominantSoil.soilType === 'silt') {
      method = 'alpha';
    } else if (dominantSoil.spt_n !== undefined) {
      method = 'spt-meyerhof';
    } else {
      method = 'beta';
    }
    steps.push(`Auto-selected method: ${method} (dominant soil: ${dominantSoil.soilType})`);
  }

  // Process layers
  let totalShaft = 0;
  let currentDepth = 0;
  const shaftFrictionPerLayer: PileCapacityResult['shaftFrictionPerLayer'] = [];

  for (const layer of layers) {
    const layerBottom = currentDepth + layer.thickness;
    // Only process portion of layer within pile length
    if (currentDepth >= L) break;
    const effectiveThickness = Math.min(layer.thickness, L - currentDepth);
    const midDepth = currentDepth + effectiveThickness / 2;

    // Effective stress at mid-depth
    const sigma_v = layer.unit_weight * midDepth;
    const u = midDepth > gwt ? 9.81 * (midDepth - gwt) : 0;
    const sigma_v_eff = Math.max(sigma_v - u, 1);

    let fs = 0; // unit shaft friction (kPa)

    if (method === 'alpha' && layer.undrained_shear_strength !== undefined) {
      const su = layer.undrained_shear_strength;
      const alpha = getAlpha(su, pileType);
      fs = alpha * su;
      steps.push(`  Layer ${currentDepth.toFixed(1)}-${(currentDepth + effectiveThickness).toFixed(1)}m: α=${alpha.toFixed(2)}, Su=${su} kPa → fs=${fs.toFixed(1)} kPa`);
    } else if (method === 'beta' && layer.friction_angle !== undefined) {
      const phi = layer.friction_angle;
      const beta = getBeta(phi, midDepth, pileType);
      fs = beta * sigma_v_eff;
      // Limit shaft friction per API RP 2GEO
      fs = Math.min(fs, 115);
      steps.push(`  Layer ${currentDepth.toFixed(1)}-${(currentDepth + effectiveThickness).toFixed(1)}m: β=${beta.toFixed(3)}, σ'v=${sigma_v_eff.toFixed(1)} kPa → fs=${fs.toFixed(1)} kPa`);
    } else if (method === 'spt-meyerhof' && layer.spt_n !== undefined) {
      const N = layer.spt_n;
      if (layer.soilType === 'clay' || layer.soilType === 'silt') {
        // Meyerhof: fs = N/2 for clay (kPa), limited
        fs = Math.min(N / 2, 100);
      } else {
        // Meyerhof: fs = 2N for sand (kPa), limited
        fs = Math.min(2 * N, 200);
      }
      steps.push(`  Layer ${currentDepth.toFixed(1)}-${(currentDepth + effectiveThickness).toFixed(1)}m: SPT N=${N} → fs=${fs.toFixed(1)} kPa`);
    } else {
      // Fallback: use whichever parameter is available
      if (layer.undrained_shear_strength !== undefined) {
        const alpha = getAlpha(layer.undrained_shear_strength, pileType);
        fs = alpha * layer.undrained_shear_strength;
      } else if (layer.friction_angle !== undefined) {
        const beta = getBeta(layer.friction_angle, midDepth, pileType);
        fs = Math.min(beta * sigma_v_eff, 115);
      }
      steps.push(`  Layer ${currentDepth.toFixed(1)}-${(currentDepth + effectiveThickness).toFixed(1)}m: fs=${fs.toFixed(1)} kPa (fallback)`);
    }

    const Qs_layer = fs * perimeter * effectiveThickness;
    totalShaft += Qs_layer;

    shaftFrictionPerLayer.push({
      depth: currentDepth,
      thickness: effectiveThickness,
      soilType: layer.soilType,
      unitShaftFriction: Math.round(fs * 10) / 10,
      shaftResistance: Math.round(Qs_layer * 10) / 10,
    });

    currentDepth = layerBottom;
  }

  // Base resistance
  const baseLayer = layers[layers.length - 1];
  const sigma_v_base = baseLayer.unit_weight * L;
  const u_base = L > gwt ? 9.81 * (L - gwt) : 0;
  const sigma_v_eff_base = Math.max(sigma_v_base - u_base, 1);

  let Qb = 0;

  if (method === 'alpha' && baseLayer.undrained_shear_strength !== undefined) {
    const Nc = 9; // bearing capacity factor for deep foundations in clay
    const qb = Nc * baseLayer.undrained_shear_strength;
    Qb = qb * Ap;
    steps.push(`Base: Nc=${Nc}, Su=${baseLayer.undrained_shear_strength} kPa → qb=${qb.toFixed(0)} kPa, Qb=${Qb.toFixed(0)} kN`);
  } else if (baseLayer.friction_angle !== undefined) {
    const Nq = getBaseNq(baseLayer.friction_angle);
    let qb = Nq * sigma_v_eff_base;
    // API limit for driven piles
    const qb_limit = pileType === 'driven' ? 12000 : 5000;
    qb = Math.min(qb, qb_limit);
    Qb = qb * Ap;
    steps.push(`Base: Nq=${Nq.toFixed(1)}, σ'v=${sigma_v_eff_base.toFixed(0)} kPa → qb=${qb.toFixed(0)} kPa, Qb=${Qb.toFixed(0)} kN`);
  } else if (baseLayer.spt_n !== undefined) {
    // Meyerhof SPT-based: qb = 400*N*Ab/D for driven, 133*N*Ab/D for bored
    const factor = pileType === 'driven' ? 400 : 133;
    let qb = factor * baseLayer.spt_n;
    qb = Math.min(qb, pileType === 'driven' ? 12000 : 5000);
    Qb = qb * Ap;
    steps.push(`Base (SPT): qb=${factor}×N=${qb.toFixed(0)} kPa, Qb=${Qb.toFixed(0)} kN`);
  }

  const Qu = totalShaft + Qb;
  const Qa = Qu / FS;

  steps.push(`Total shaft Qs = ${totalShaft.toFixed(0)} kN`);
  steps.push(`Total base Qb = ${Qb.toFixed(0)} kN`);
  steps.push(`Ultimate Qu = ${Qu.toFixed(0)} kN, Allowable Qa = ${Qa.toFixed(0)} kN (FS=${FS})`);

  return {
    method,
    pileType,
    pileDiameter: D,
    pileLength: L,
    shaftResistance: Math.round(totalShaft),
    baseResistance: Math.round(Qb),
    ultimateCapacity: Math.round(Qu),
    allowableCapacity: Math.round(Qa),
    factorOfSafety: FS,
    shaftFrictionPerLayer,
    steps,
  };
}

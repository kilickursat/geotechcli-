import { z } from 'zod';

// ---------------------------------------------------------------------------
// Pile Capacity — Axial capacity of single piles
//
// Methods:
//   - α-method (Tomlinson) for cohesive soils (undrained)
//   - β-method (Burland) for cohesionless soils (drained)
//   - SPT-based (Meyerhof 1976) for driven piles in sand/gravel
//
// References:
//   - Tomlinson, M.J. (1971). "Some effects of pile driving on skin friction."
//   - Burland, J.B. (1973). "Shaft friction of piles in clay."
//   - Meyerhof, G.G. (1976). "Bearing capacity and settlement of pile foundations."
//   - Skempton, A.W. (1951). Nc = 9 for deep foundations in clay.
//   - Eurocode 7 (EN 1997-1:2004), Section 7.6
//
// KNOWN LIMITATIONS — stated rather than implied:
//   - α is the Tomlinson-style total-stress correlation on Su alone. It is NOT
//     API RP 2GEO, which normalises on psi = Su/sigma'v0.
//   - The base factor is Prandtl-Reissner, not Berezantsev. It under-predicts
//     base resistance for deep piles and carries no L/D dependence.
//   - Working-stress only: a single lumped factor of safety, no EC7 partial
//     factors and no LRFD resistance factors.
//   - Compression only: no uplift, no negative skin friction, no group effects.
//   - H-section geometry uses a fixed 0.3 m flange assumption.
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

function getLayerAtDepth(layers: PileCapacityInput['layers'], depth: number) {
  let cumulativeDepth = 0;

  for (const layer of layers) {
    cumulativeDepth += layer.thickness;
    if (depth < cumulativeDepth) {
      return layer;
    }
  }

  return layers[layers.length - 1];
}

function calculateVerticalStress(depth: number, layers: PileCapacityInput['layers'], waterTableDepth: number): number {
  let remainingDepth = Math.max(depth, 0);
  let stress = 0;
  let currentDepth = 0;

  for (const layer of layers) {
    if (remainingDepth <= 0) {
      break;
    }

    const contributingThickness = Math.min(layer.thickness, remainingDepth);
    const topDepth = currentDepth;
    const bottomDepth = currentDepth + contributingThickness;
    const aboveWaterThickness = Math.max(0, Math.min(bottomDepth, waterTableDepth) - topDepth);
    const belowWaterThickness = contributingThickness - aboveWaterThickness;

    stress += layer.unit_weight * aboveWaterThickness;
    if (belowWaterThickness > 0) {
      stress += Math.max(layer.unit_weight - 9.81, 0) * belowWaterThickness;
    }

    currentDepth += contributingThickness;
    remainingDepth -= contributingThickness;
  }

  if (remainingDepth > 0) {
    const lastLayer = layers[layers.length - 1];
    const topDepth = currentDepth;
    const bottomDepth = currentDepth + remainingDepth;
    const aboveWaterThickness = Math.max(0, Math.min(bottomDepth, waterTableDepth) - topDepth);
    const belowWaterThickness = remainingDepth - aboveWaterThickness;

    stress += lastLayer.unit_weight * aboveWaterThickness;
    if (belowWaterThickness > 0) {
      stress += Math.max(lastLayer.unit_weight - 9.81, 0) * belowWaterThickness;
    }
  }

  return stress;
}

// ---------------------------------------------------------------------------
// α coefficients (Tomlinson 1971, updated API RP 2GEO)
// ---------------------------------------------------------------------------

// This is the Tomlinson-style TOTAL-STRESS correlation, keyed on Su alone. It
// is not API RP 2GEO: API keys alpha on the normalised ratio psi = Su/sigma'v0
// (alpha = 0.5·psi^-0.5 for psi <= 1, 0.5·psi^-0.25 above), so the two diverge
// wherever the effective overburden is not close to the implied value. The
// engine reports which correlation it used so the assumption is visible.
function getAlpha(su: number, pileType: string): number {
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

function getBeta(phi: number, pileType: string): number {
  const phiRad = degToRad(phi);
  const Ko = 1 - Math.sin(phiRad);
  const KoMultiplier = pileType === 'driven' ? 1.5 : 1.0;
  const delta = pileType === 'driven' ? phi * 0.75 : phi * 0.67; // interface friction
  return KoMultiplier * Ko * Math.tan(degToRad(delta));
}

// ---------------------------------------------------------------------------
// Base bearing capacity factor Nq — Prandtl-Reissner.
//
// This was labelled Berezantsev (1961), which it is not. It evaluates the
// classical shallow-foundation factor Nq = e^(pi·tan phi)·tan²(45 + phi/2),
// giving 18.4 / 33.3 / 64.2 at phi = 30 / 35 / 40. Berezantsev's deep-pile Nq
// is substantially larger at the same friction angle and additionally depends
// on the embedment ratio L/D, so using this factor UNDER-predicts base
// resistance for a deep pile — conservative, but it must not be presented as
// Berezantsev. Restoring the true Berezantsev chart needs the source tables;
// until then the engine states which factor it applied.
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
  const methodWasAuto = v.method === 'auto';
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

    // Effective vertical stress at mid-depth, integrated layer-by-layer.
    const sigma_v_eff = Math.max(calculateVerticalStress(midDepth, layers, gwt), 1);

    let fs = 0; // unit shaft friction (kPa)

    // A layer that carries a measured undrained shear strength must use it.
    // The auto-selected method is chosen from the DOMINANT soil, so a profile
    // that is mostly sand resolved to spt-meyerhof and then read N/2 for every
    // clay layer, discarding the laboratory strength entirely: Su could be
    // varied 25 -> 200 kPa without moving the answer, because fs stayed pinned
    // at N/2. An explicit --method is still honoured; only the automatic
    // choice defers to the better datum.
    const isCohesive = layer.soilType === 'clay' || layer.soilType === 'silt';
    const preferMeasuredSu =
      methodWasAuto && isCohesive && layer.undrained_shear_strength !== undefined;

    if ((method === 'alpha' || preferMeasuredSu) && layer.undrained_shear_strength !== undefined) {
      const su = layer.undrained_shear_strength;
      const alpha = getAlpha(su, pileType);
      fs = alpha * su;
      steps.push(`  Layer ${currentDepth.toFixed(1)}-${(currentDepth + effectiveThickness).toFixed(1)}m: α=${alpha.toFixed(2)}, Su=${su} kPa → fs=${fs.toFixed(1)} kPa`);
    } else if (method === 'beta' && layer.friction_angle !== undefined) {
      const phi = layer.friction_angle;
      const beta = getBeta(phi, pileType);
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
        const beta = getBeta(layer.friction_angle, pileType);
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
  const baseLayer = getLayerAtDepth(layers, L);
  const sigma_v_eff_base = Math.max(calculateVerticalStress(L, layers, gwt), 1);

  let Qb = 0;

  const baseIsCohesive = baseLayer.soilType === 'clay' || baseLayer.soilType === 'silt';
  const basePrefersMeasuredSu =
    methodWasAuto && baseIsCohesive && baseLayer.undrained_shear_strength !== undefined;

  if (
    (method === 'alpha' || basePrefersMeasuredSu) &&
    baseLayer.undrained_shear_strength !== undefined
  ) {
    const Nc = 9; // Skempton (1951) deep-foundation factor for clay
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

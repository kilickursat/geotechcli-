// ---------------------------------------------------------------------------
// Poka-Yoke (ポカヨケ) — Mistake-Proofing Guardrails
//
// Validates tool parameters BEFORE execution to prevent:
// - Physically impossible values (negative friction angles, UCS > 400 for soil)
// - Numerically dangerous inputs (zero denominators, extreme ranges)
// - Logically inconsistent combinations
//
// Returns either PASS or FAIL with a correction suggestion the agent
// can use for self-healing.
// ---------------------------------------------------------------------------

export interface GuardrailResult {
  passed: boolean;
  violations: GuardrailViolation[];
}

export interface GuardrailViolation {
  parameter: string;
  value: unknown;
  rule: string;
  severity: 'error' | 'warning';
  correction: string; // What the agent should do to fix it
}

// ---------------------------------------------------------------------------
// Per-tool guardrail definitions
// ---------------------------------------------------------------------------

type GuardrailFn = (args: Record<string, unknown>) => GuardrailViolation[];

const guardrails = new Map<string, GuardrailFn>();

// --- Bearing Capacity ---
guardrails.set('calculate_bearing_capacity', (args) => {
  const v: GuardrailViolation[] = [];
  const phi = Number(args.frictionAngle ?? args.phi ?? 0);
  const c = Number(args.cohesion ?? 0);
  const depth = Number(args.depth ?? 0);
  const width = Number(args.width ?? 2);
  const gamma = Number(args.unitWeight ?? 18);
  const fs = Number(args.factorOfSafety ?? 3);

  if (phi < 0) v.push({ parameter: 'frictionAngle', value: phi, rule: 'Friction angle cannot be negative', severity: 'error', correction: 'Use absolute value or check soil data. Typical range: 0-45° for soils.' });
  if (phi > 50) v.push({ parameter: 'frictionAngle', value: phi, rule: 'Friction angle > 50° is unrealistic for natural soils', severity: 'error', correction: 'Max 45° for dense gravel. Check if value is in radians (convert to degrees).' });
  if (c < 0) v.push({ parameter: 'cohesion', value: c, rule: 'Cohesion cannot be negative', severity: 'error', correction: 'Set to 0 for cohesionless soil, or use positive value.' });
  if (c > 500) v.push({ parameter: 'cohesion', value: c, rule: 'Cohesion > 500 kPa is unrealistic for soil (rock range)', severity: 'warning', correction: 'Typical clay: 10-150 kPa. Check units — value may be in Pa instead of kPa.' });
  if (depth <= 0) v.push({ parameter: 'depth', value: depth, rule: 'Embedment depth must be positive', severity: 'error', correction: 'Set depth > 0. Surface footings use depth = 0.5-1.0m minimum.' });
  if (depth > 30) v.push({ parameter: 'depth', value: depth, rule: 'Depth > 30m is deep foundation territory, not shallow', severity: 'warning', correction: 'For deep foundations use pile capacity analysis instead.' });
  if (width <= 0) v.push({ parameter: 'width', value: width, rule: 'Foundation width must be positive', severity: 'error', correction: 'Set width > 0. Typical range: 0.5-10m.' });
  if (gamma < 5 || gamma > 28) v.push({ parameter: 'unitWeight', value: gamma, rule: 'Unit weight outside 5-28 kN/m³ range', severity: 'warning', correction: 'Typical: 16-22 kN/m³ for soil, 22-27 for rock. Check if value is in wrong units.' });
  if (fs <= 0) v.push({ parameter: 'factorOfSafety', value: fs, rule: 'Factor of safety must be positive', severity: 'error', correction: 'Standard: FS=2.5-3.0 for bearing capacity.' });
  if (c === 0 && phi === 0) v.push({ parameter: 'frictionAngle+cohesion', value: '0+0', rule: 'Both c=0 and φ=0 gives zero bearing capacity', severity: 'error', correction: 'At least one must be non-zero. Check soil parameters.' });

  return v;
});

// --- Liquefaction ---
guardrails.set('calculate_liquefaction', (args) => {
  const v: GuardrailViolation[] = [];
  const mw = Number(args.earthquakeMagnitude ?? 0);
  const pga = Number(args.pga ?? 0);
  const layers = (args.layers as any[]) ?? [];

  if (mw < 4 || mw > 9.5) v.push({ parameter: 'earthquakeMagnitude', value: mw, rule: 'Magnitude must be 4.0-9.5', severity: 'error', correction: 'Typical design: Mw 6.0-8.0. Check seismic hazard maps for the site.' });
  if (pga <= 0) v.push({ parameter: 'pga', value: pga, rule: 'PGA must be positive', severity: 'error', correction: 'Typical range: 0.05-0.6g. Check site seismic hazard analysis.' });
  if (pga > 1.5) v.push({ parameter: 'pga', value: pga, rule: 'PGA > 1.5g is extremely rare', severity: 'warning', correction: 'Check units — value should be in g (not m/s² or %g). Max recorded: ~2.7g.' });
  if (layers.length === 0) v.push({ parameter: 'layers', value: '[]', rule: 'At least one soil layer required', severity: 'error', correction: 'Provide SPT data: [{depth, sptN, finesContent, unitWeight, waterTableDepth}].' });

  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (Number(l.sptN) < 0) v.push({ parameter: `layers[${i}].sptN`, value: l.sptN, rule: 'SPT N-value cannot be negative', severity: 'error', correction: 'SPT N ≥ 0. Typical range: 0-50+.' });
    if (Number(l.depth) < 0) v.push({ parameter: `layers[${i}].depth`, value: l.depth, rule: 'Depth cannot be negative', severity: 'error', correction: 'Depths must be positive, measured from ground surface.' });
    if (Number(l.finesContent) < 0 || Number(l.finesContent) > 100) v.push({ parameter: `layers[${i}].finesContent`, value: l.finesContent, rule: 'Fines content must be 0-100%', severity: 'error', correction: 'Percent passing #200 sieve, 0-100.' });
  }

  return v;
});

// --- RMR89 ---
guardrails.set('classify_rmr89', (args) => {
  const v: GuardrailViolation[] = [];
  const ucs = Number(args.ucs ?? 0);
  const rqd = Number(args.rqd ?? 0);

  if (ucs <= 0) v.push({ parameter: 'ucs', value: ucs, rule: 'UCS must be positive', severity: 'error', correction: 'Rock UCS range: 1-250+ MPa. Soil does not use RMR.' });
  if (ucs > 400) v.push({ parameter: 'ucs', value: ucs, rule: 'UCS > 400 MPa extremely rare', severity: 'warning', correction: 'Max typical: 250 MPa (granite). Check if value is in correct units (MPa, not kPa).' });
  if (rqd < 0 || rqd > 100) v.push({ parameter: 'rqd', value: rqd, rule: 'RQD must be 0-100%', severity: 'error', correction: 'RQD = % of core pieces > 10cm. Range: 0% (very poor) to 100% (excellent).' });

  return v;
});

// --- TBM Predict ---
guardrails.set('predict_tbm_performance', (args) => {
  const v: GuardrailViolation[] = [];
  const d = Number(args.diameter ?? 0);
  const ucs = Number(args.ucs ?? 0);
  const rqd = Number(args.rqd ?? 0);

  if (d < 1 || d > 20) v.push({ parameter: 'diameter', value: d, rule: 'TBM diameter typically 1-17m', severity: d < 0.5 || d > 20 ? 'error' : 'warning', correction: 'Standard range: 2-15m. Micro-TBM: 0.5-2m.' });
  if (ucs <= 0) v.push({ parameter: 'ucs', value: ucs, rule: 'UCS must be positive for TBM prediction', severity: 'error', correction: 'Provide rock UCS in MPa.' });
  if (rqd < 0 || rqd > 100) v.push({ parameter: 'rqd', value: rqd, rule: 'RQD must be 0-100%', severity: 'error', correction: 'RQD percentage, 0-100.' });

  return v;
});

// --- Settlement ---
guardrails.set('calculate_tunnel_settlement', (args) => {
  const v: GuardrailViolation[] = [];
  const d = Number(args.tunnelDiameter ?? 0);
  const z = Number(args.tunnelDepth ?? 0);
  const vl = Number(args.volumeLoss ?? 1);

  if (d <= 0) v.push({ parameter: 'tunnelDiameter', value: d, rule: 'Diameter must be positive', severity: 'error', correction: 'Tunnel diameter in meters.' });
  if (z <= 0) v.push({ parameter: 'tunnelDepth', value: z, rule: 'Tunnel depth must be positive', severity: 'error', correction: 'Depth to tunnel axis from surface.' });
  if (z < d / 2) v.push({ parameter: 'tunnelDepth', value: z, rule: 'Tunnel axis depth less than radius — tunnel at surface', severity: 'error', correction: 'Depth must be > diameter/2 for the tunnel to be underground.' });
  if (vl < 0) v.push({ parameter: 'volumeLoss', value: vl, rule: 'Volume loss cannot be negative', severity: 'error', correction: 'Typical: 0.5-2.0%. EPB in soft ground: 0.5-1.5%.' });
  if (vl > 10) v.push({ parameter: 'volumeLoss', value: vl, rule: 'Volume loss > 10% is catastrophic', severity: 'warning', correction: 'Check units — value should be in percent. Typical: 0.5-3%.' });

  return v;
});

// --- Consolidation ---
guardrails.set('calculate_consolidation', (args) => {
  const v: GuardrailViolation[] = [];
  const Cc = Number(args.compressionIndex ?? 0);
  const e0 = Number(args.voidRatio ?? 0);
  const H = Number(args.layerThickness ?? 0);
  const dSig = Number(args.stressIncrease ?? 0);
  const sig0 = Number(args.initialEffectiveStress ?? 0);
  if (Cc <= 0) v.push({ parameter: 'compressionIndex', value: Cc, rule: 'Cc must be positive', severity: 'error', correction: 'Typical: 0.1-0.4 for clays.' });
  if (Cc > 3) v.push({ parameter: 'compressionIndex', value: Cc, rule: 'Cc > 3 unrealistic', severity: 'warning', correction: 'Typical: 0.1-1.5.' });
  if (e0 <= 0) v.push({ parameter: 'voidRatio', value: e0, rule: 'Void ratio must be positive', severity: 'error', correction: 'Typical: 0.5-1.5.' });
  if (H <= 0) v.push({ parameter: 'layerThickness', value: H, rule: 'Thickness must be positive', severity: 'error', correction: 'In meters.' });
  if (dSig <= 0) v.push({ parameter: 'stressIncrease', value: dSig, rule: 'Stress increase must be positive', severity: 'error', correction: 'In kPa.' });
  if (sig0 <= 0) v.push({ parameter: 'initialEffectiveStress', value: sig0, rule: 'Initial stress must be positive', severity: 'error', correction: 'In kPa.' });
  return v;
});

// --- Schmertmann ---
guardrails.set('calculate_schmertmann_settlement', (args) => {
  const v: GuardrailViolation[] = [];
  const q = Number(args.appliedStress ?? 0);
  const B = Number(args.foundationWidth ?? 0);
  const layers = (args.layers as any[]) ?? [];
  if (q <= 0) v.push({ parameter: 'appliedStress', value: q, rule: 'Stress must be positive', severity: 'error', correction: 'In kPa.' });
  if (B <= 0) v.push({ parameter: 'foundationWidth', value: B, rule: 'Width must be positive', severity: 'error', correction: 'In meters.' });
  if (layers.length === 0) v.push({ parameter: 'layers', value: '[]', rule: 'At least one layer required', severity: 'error', correction: 'Provide [{thickness, elasticModulus}].' });
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (Number(l.elasticModulus) <= 0) v.push({ parameter: `layers[${i}].elasticModulus`, value: l.elasticModulus, rule: 'Es must be positive', severity: 'error', correction: 'In kPa.' });
  }
  return v;
});

// --- USCS ---
guardrails.set('classify_uscs', (args) => {
  const v: GuardrailViolation[] = [];
  const g = Number(args.gravelPercent ?? 0);
  const s = Number(args.sandPercent ?? 0);
  const f = Number(args.finesPercent ?? 0);
  const total = g + s + f;

  if (Math.abs(total - 100) > 5) v.push({ parameter: 'gravel+sand+fines', value: total, rule: 'Grain size fractions should sum to ~100%', severity: Math.abs(total - 100) > 15 ? 'error' : 'warning', correction: `Current sum: ${total}%. Adjust fractions to total 100%.` });
  if (g < 0 || s < 0 || f < 0) v.push({ parameter: 'fractions', value: `${g}/${s}/${f}`, rule: 'Grain size fractions cannot be negative', severity: 'error', correction: 'All fractions must be 0-100%.' });

  return v;
});

// ---------------------------------------------------------------------------
// Main validation function — called before every tool execution
// ---------------------------------------------------------------------------


// --- Pile Capacity ---
guardrails.set('calculate_pile_capacity', (args) => {
  const v: GuardrailViolation[] = [];
  const d = Number(args.pileDiameter ?? 0);
  const l = Number(args.pileLength ?? 0);
  const layers = (args.layers as any[]) ?? [];
  if (d <= 0 || d > 5) v.push({ parameter: 'pileDiameter', value: d, rule: 'Pile diameter must be 0.1-5m', severity: d <= 0 ? 'error' : 'warning', correction: 'Typical: 0.3-2.5m. Micro-piles: 0.1-0.3m. Large bored: 1.5-3m.' });
  if (l <= 0) v.push({ parameter: 'pileLength', value: l, rule: 'Pile length must be positive', severity: 'error', correction: 'Typical: 5-50m.' });
  if (l > 80) v.push({ parameter: 'pileLength', value: l, rule: 'Pile length > 80m is extremely long', severity: 'warning', correction: 'Typical: 10-40m. Very long piles may require special analysis.' });
  if (layers.length === 0) v.push({ parameter: 'layers', value: '[]', rule: 'At least one soil layer required', severity: 'error', correction: 'Provide [{thickness, soilType, undrained_shear_strength or friction_angle, unit_weight}].' });
  if (d > 0 && l > 0 && l / d < 5) v.push({ parameter: 'pileLength/diameter', value: l / d, rule: 'L/D < 5 is a short pier, not a pile', severity: 'warning', correction: 'Piles typically have L/D > 10. Short piers use bearing capacity theory.' });
  return v;
});

// --- Slope Stability ---
guardrails.set('calculate_slope_stability', (args) => {
  const v: GuardrailViolation[] = [];
  const h = Number(args.slopeHeight ?? 0);
  const angle = Number(args.slopeAngle ?? 0);
  const layers = (args.soilLayers as any[]) ?? [];
  const kh = Number(args.seismicCoefficient ?? 0);
  if (h <= 0) v.push({ parameter: 'slopeHeight', value: h, rule: 'Slope height must be positive', severity: 'error', correction: 'In meters.' });
  if (h > 200) v.push({ parameter: 'slopeHeight', value: h, rule: 'Slope height > 200m is unusual for circular analysis', severity: 'warning', correction: 'Very high slopes may need rock mechanics analysis instead.' });
  if (angle <= 0 || angle >= 90) v.push({ parameter: 'slopeAngle', value: angle, rule: 'Slope angle must be 1-89 degrees', severity: 'error', correction: 'Typical cut slopes: 30-60°. Natural slopes: 15-45°.' });
  if (layers.length === 0) v.push({ parameter: 'soilLayers', value: '[]', rule: 'At least one soil layer required', severity: 'error', correction: 'Provide [{thickness, unitWeight, cohesion, frictionAngle}].' });
  if (kh > 0.5) v.push({ parameter: 'seismicCoefficient', value: kh, rule: 'kh > 0.5 is extremely high', severity: 'warning', correction: 'Typical pseudo-static kh: 0.05-0.3. Check seismic hazard for the site.' });
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (Number(l.cohesion ?? 0) === 0 && Number(l.frictionAngle ?? 0) === 0) {
      v.push({ parameter: `soilLayers[${i}]`, value: 'c=0,φ=0', rule: 'Both c=0 and φ=0 gives zero shear strength', severity: 'error', correction: 'At least one must be non-zero.' });
    }
  }
  return v;
});

// --- Lateral Earth Pressure ---
guardrails.set('calculate_lateral_earth_pressure', (args) => {
  const v: GuardrailViolation[] = [];
  const h = Number(args.wallHeight ?? 0);
  const layers = (args.soilLayers as any[]) ?? [];
  const delta = Number(args.wallFrictionAngle ?? 0);
  if (h <= 0) v.push({ parameter: 'wallHeight', value: h, rule: 'Wall height must be positive', severity: 'error', correction: 'In meters.' });
  if (h > 30) v.push({ parameter: 'wallHeight', value: h, rule: 'Wall height > 30m requires special analysis', severity: 'warning', correction: 'Very tall walls may need anchored or tieback analysis.' });
  if (layers.length === 0) v.push({ parameter: 'soilLayers', value: '[]', rule: 'At least one soil layer required', severity: 'error', correction: 'Provide [{thickness, unitWeight, cohesion, frictionAngle}].' });
  if (delta > 0) {
    const phi = layers[0] ? Number((layers[0] as any).frictionAngle ?? 30) : 30;
    if (delta > phi) v.push({ parameter: 'wallFrictionAngle', value: delta, rule: 'δ cannot exceed soil φ', severity: 'error', correction: `Max δ = φ = ${phi}°. Typical: δ = 2/3 × φ.` });
  }
  return v;
});

export function validateToolArgs(toolName: string, args: Record<string, unknown>): GuardrailResult {
  const fn = guardrails.get(toolName);
  if (!fn) {
    return { passed: true, violations: [] };
  }

  const violations = fn(args);
  const hasErrors = violations.some((v) => v.severity === 'error');

  return {
    passed: !hasErrors,
    violations,
  };
}

/**
 * Format violations as a string the agent can read and act on.
 */
export function formatViolations(result: GuardrailResult): string {
  if (result.passed && result.violations.length === 0) return '';

  const lines = result.violations.map((v) => {
    const icon = v.severity === 'error' ? '🚫' : '⚠️';
    return `${icon} ${v.parameter} = ${v.value}: ${v.rule}\n   Fix: ${v.correction}`;
  });

  const header = result.passed
    ? 'GUARDRAIL WARNINGS (proceeding with caution):'
    : 'GUARDRAIL BLOCKED — fix these errors before executing:';

  return `${header}\n${lines.join('\n')}`;
}

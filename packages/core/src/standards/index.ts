// ---------------------------------------------------------------------------
// Geotechnical Standards Knowledge Base
// Embedded retrieval system — no vector DB needed for this scale.
// Keyword-indexed provisions from major geotechnical standards.
// The agent queries this via the `query_standards` tool.
// ---------------------------------------------------------------------------

export interface StandardProvision {
  id: string;
  standard: string;
  section: string;
  title: string;
  content: string;
  keywords: string[];
  topic: string;
}

const STANDARDS_DB: StandardProvision[] = [
  // --- Eurocode 7 (EN 1997) ---
  { id: 'EC7-2.4.7', standard: 'EN 1997-1:2004', section: '2.4.7', title: 'Partial factors – ULS', content: 'Design approach 1 (DA1): Combination 1: A1+M1+R1, Combination 2: A2+M2+R1. Partial factors on actions γG=1.35(unfav)/1.0(fav), γQ=1.5(unfav)/0. Partial factors on soil: γφ=1.0(C1)/1.25(C2), γc=1.0(C1)/1.25(C2), γcu=1.0(C1)/1.4(C2).', keywords: ['partial factor', 'uls', 'design approach', 'eurocode', 'safety factor', 'limit state'], topic: 'design' },
  { id: 'EC7-6.5', standard: 'EN 1997-1:2004', section: '6.5', title: 'Bearing resistance – spread foundations', content: 'The design bearing resistance shall be calculated from ground test results or pressuremeter test results. Analytical methods: Terzaghi, Meyerhof, Hansen, Vesic equations with partial factors applied. Rk = A\'(c\'Nc sc ic + q\'Nq sq iq + 0.5γ\'B\'Nγ sγ iγ). The design value Rd = Rk/γR where γR = 1.0(DA1-C1) or 1.4(DA1-C2).', keywords: ['bearing capacity', 'foundation', 'spread foundation', 'shallow', 'eurocode'], topic: 'foundations' },
  { id: 'EC7-7.6', standard: 'EN 1997-1:2004', section: '7.6', title: 'Pile bearing capacity', content: 'Ultimate compressive resistance from static formula: Rc,cal = Rs,cal + Rb,cal (shaft + base). Correlation factors ξ depend on number of test profiles. For driven piles: Rc,d = Rc,k/γt where γt = 1.0-1.6 depending on DA and pile type.', keywords: ['pile', 'bearing capacity', 'deep foundation', 'shaft resistance', 'base resistance'], topic: 'foundations' },
  { id: 'EC7-11', standard: 'EN 1997-1:2004', section: '11', title: 'Overall stability', content: 'Verification of overall stability required for slopes, embankments, earthworks. Bishop, Janbu, Morgenstern-Price methods acceptable. Minimum FOS: 1.0 when using partial factors on soil strength (DA3), or 1.25-1.5 for global FOS approach.', keywords: ['slope stability', 'overall stability', 'factor of safety', 'bishop', 'eurocode'], topic: 'slopes' },
  { id: 'EC7-12', standard: 'EN 1997-1:2004', section: '12', title: 'Embankments', content: 'End-of-construction stability, long-term stability, and rapid drawdown conditions shall be checked. Pore pressure assumptions: undrained (short-term), drained (long-term). Observation method per §2.7 is applicable for staged construction.', keywords: ['embankment', 'construction', 'stability', 'pore pressure', 'staged'], topic: 'slopes' },
  { id: 'EC7-9', standard: 'EN 1997-1:2004', section: '9', title: 'Retaining structures', content: 'Earth pressure: at-rest K0 = 1-sinφ\' (normally consolidated), active Ka, passive Kp. Compaction-induced pressures shall be considered. Water pressure treated separately from earth pressure. Design approaches DA1, DA2, DA3 applicable.', keywords: ['retaining wall', 'earth pressure', 'lateral', 'K0', 'active', 'passive'], topic: 'retaining' },

  // --- ASTM Standards ---
  { id: 'ASTM-D2487', standard: 'ASTM D2487', section: 'Full', title: 'USCS Classification', content: 'Unified Soil Classification System. Coarse-grained: >50% retained on #200 sieve → GW/GP/GM/GC/SW/SP/SM/SC based on gradation (Cu, Cc) and fines plasticity. Fine-grained: >50% passing #200 → CL/ML/CH/MH/OL/OH/Pt based on LL, PI, A-line (PI = 0.73(LL-20)). Dual symbols for borderline soils.', keywords: ['uscs', 'classification', 'soil classification', 'grain size', 'atterberg'], topic: 'classification' },
  { id: 'ASTM-D1586', standard: 'ASTM D1586', section: 'Full', title: 'Standard Penetration Test (SPT)', content: 'Drop hammer: 63.5 kg falling 760mm. Sampler: split-spoon 50.8mm OD. N-value: blows for last 300mm of 450mm drive. Corrections: N60 for energy ratio (CE), borehole diameter (CB), rod length (CR), sampler (CS). N1,60 = N × CN × CE × CB × CR × CS where CN = (Pa/σ\'v)^0.5 ≤ 1.7.', keywords: ['spt', 'standard penetration', 'n-value', 'borehole', 'blow count', 'correction'], topic: 'testing' },
  { id: 'ASTM-D5778', standard: 'ASTM D5778', section: 'Full', title: 'Cone Penetration Test (CPT)', content: 'Standard cone: 60° apex angle, 10 cm² projected area, 150 cm² friction sleeve. Measurements: qc (tip resistance), fs (sleeve friction), u2 (pore pressure). Corrected: qt = qc + u2(1-a). Robertson classification: SBTn based on normalized Qt and Fr. Ic = sqrt((3.47-logQt)² + (logFr+1.22)²).', keywords: ['cpt', 'cone penetration', 'robertson', 'tip resistance', 'friction ratio', 'soil behavior type'], topic: 'testing' },
  { id: 'ASTM-D4318', standard: 'ASTM D4318', section: 'Full', title: 'Atterberg Limits', content: 'Liquid Limit (LL): moisture content at 25 blows in Casagrande cup. Plastic Limit (PL): moisture content at which soil crumbles when rolled to 3mm thread. Plasticity Index PI = LL - PL. A-line: PI = 0.73(LL-20). Above A-line: clay. Below: silt. LL>50: high plasticity (H). LL<50: low plasticity (L).', keywords: ['atterberg', 'liquid limit', 'plastic limit', 'plasticity', 'consistency'], topic: 'testing' },

  // --- Bieniawski RMR ---
  { id: 'RMR89', standard: 'Bieniawski 1989', section: 'RMR', title: 'Rock Mass Rating System', content: 'RMR = sum of ratings for: (1) UCS 0-15, (2) RQD 3-20, (3) Discontinuity spacing 5-20, (4) Joint condition 0-30, (5) Groundwater 0-15, (6) Orientation adjustment -60 to 0. Classes: I (81-100) Very Good, II (61-80) Good, III (41-60) Fair, IV (21-40) Poor, V (<20) Very Poor. Support: Class I = no support, Class V = heavy steel + shotcrete + forepoling.', keywords: ['rmr', 'rock mass rating', 'bieniawski', 'rock classification', 'tunnel support'], topic: 'rock_classification' },

  // --- Barton Q-system ---
  { id: 'Q-SYSTEM', standard: 'Barton et al. 1974', section: 'Q', title: 'Q-system for tunnel support', content: 'Q = (RQD/Jn) × (Jr/Ja) × (Jw/SRF). Block size: RQD/Jn. Shear strength: Jr/Ja. Active stress: Jw/SRF. Support chart: equivalent dimension De = span/ESR. ESR values: powerhouse 1.6, road tunnel 1.0, storage 1.6, water tunnel 1.3. Q > 40: unsupported. Q = 0.1-4: systematic bolting + shotcrete. Q < 0.01: special methods (ground freezing, etc.).', keywords: ['q system', 'barton', 'tunnel support', 'rock quality', 'joint'], topic: 'rock_classification' },

  // --- Boulanger & Idriss ---
  { id: 'BI-2014', standard: 'Boulanger & Idriss 2014', section: 'Liquefaction', title: 'SPT-Based Liquefaction Triggering', content: 'CSR = 0.65(σv/σ\'v)(amax/g)(rd). CRR7.5 from deterministic curve using (N1)60cs. Fines correction: ΔNf = exp(1.63 + 9.7/(FC+0.01) - (15.7/(FC+0.01))²). MSF = 6.9exp(-Mw/4) - 0.058. Kσ correction for overburden. FS = (CRR × MSF × Kσ) / CSR. FS < 1.0: liquefaction likely. Settlement: Ishihara & Yoshimine 1992 volumetric strain method.', keywords: ['liquefaction', 'spt', 'csr', 'crr', 'earthquake', 'seismic', 'boulanger', 'idriss'], topic: 'seismic' },

  // --- Settlement ---
  { id: 'TERZAGHI-1D', standard: 'Terzaghi 1925', section: 'Consolidation', title: '1D Consolidation Settlement', content: 'Primary settlement: S = Cc/(1+e0) × H × log(σ\'f/σ\'0) for normally consolidated clay. For OC: S = Cr/(1+e0)×H×log(σ\'p/σ\'0) + Cc/(1+e0)×H×log(σ\'f/σ\'p). Time factor: Tv = Cv×t/Hd². U = 1 - 8/π²×exp(-π²Tv/4) for U < 60%.', keywords: ['settlement', 'consolidation', 'terzaghi', 'compression', 'clay', 'time'], topic: 'settlement' },

  // --- TBM ---
  { id: 'TBM-SELECT', standard: 'ITA/AITES 2000', section: 'TBM Selection', title: 'TBM Type Selection Guidelines', content: 'Open TBM: competent rock, UCS>100MPa, self-supporting, low water. Single Shield: variable rock, moderate water. Double Shield: mixed conditions, gripper+shield modes. EPB: soft ground, fines>30%, water<3bar. Slurry: high water pressure, coarse granular, high permeability. Convertible/Multi-mode: mixed face, transition zones.', keywords: ['tbm', 'tunnel boring machine', 'epb', 'slurry', 'shield', 'selection'], topic: 'tunneling' },

  // --- JGS (Japanese Geotechnical Society) ---
  { id: 'JGS-0121', standard: 'JGS 0121', section: 'Full', title: 'Standard Penetration Test', content: 'Japanese SPT standard. Same hammer (63.5 kg, 760mm drop) as ASTM D1586. Japanese practice typically uses automatic trip hammer (CE≈1.2). Corrections: N1 = CN × N × CE. For Japanese SPT, energy ratio is often higher than US practice. Rod length correction differs for short rods.', keywords: ['spt', 'standard penetration', 'japanese', 'jgs', 'n-value'], topic: 'testing' },
  { id: 'JGS-PILE', standard: 'JGS 4101', section: 'Full', title: 'Pile Foundation Design', content: 'Japanese pile design standard. Bearing capacity: Ra = (1/3)(qd·Ap + Σ(fi·Li·U)) for end-bearing + shaft. fi values: clay=cu×α (α from table), sand=10N/3 (kPa). End bearing: qd=300N for sand, 6cu for clay. Group effect reduction. Settlement check required for L/D < 25.', keywords: ['pile', 'foundation', 'bearing capacity', 'japanese', 'jgs', 'shaft resistance'], topic: 'foundations' },

  // --- JSCE (Japan Society of Civil Engineers) ---
  { id: 'JSCE-C7', standard: 'JSCE C7.11', section: 'C7.11', title: 'NATM Tunnel Support Classification', content: 'Rock classification for NATM tunnel support in Japan. Six ground classes (A-F): A=硬質・塊状岩 (hard massive), B=軟質・塊状岩 (soft massive), CI/CII=層状中硬質 (layered moderate), DI/DII=層状軟質 (layered soft), E=土砂 (soil), F=膨張性 (swelling). Support patterns specify shotcrete thickness, bolt spacing/length, and steel arch requirements per class.', keywords: ['natm', 'tunnel', 'support', 'jsce', 'rock classification', 'japanese tunnel'], topic: 'tunneling' },
  { id: 'JSCE-RMR', standard: 'JSCE / NEXCO', section: 'Design Guidelines Vol.3', title: 'NEXCO Tunnel Design Standards', content: 'NEXCO (formerly JH) tunnel design guidelines for expressway tunnels in Japan. Rock classification: 塊状-硬質岩, 塊状-中硬質岩・軟質岩, 層状-中硬質岩, 層状-軟質岩. Support patterns I through VI with increasing support intensity. Uses aggregated scores mapping to RMR equivalent. Includes convergence monitoring criteria and displacement thresholds per JSCE C7.10 LDP theory.', keywords: ['nexco', 'jsce', 'tunnel', 'natm', 'japanese', 'expressway', 'rock classification'], topic: 'tunneling' },
  { id: 'JSCE-FOS', standard: 'JSCE', section: 'Standard Specifications', title: 'Japanese Factor of Safety Standards', content: 'Japanese design practice FOS: shallow foundations FS≥3 (static), FS≥2 (seismic). Pile foundations FS≥3 (compression), FS≥6 (tension). Slopes FS≥1.5 (long-term), FS≥1.2 (seismic), FS≥1.1 (residual). Retaining walls: sliding FS≥1.5, overturning FS≥2.0, bearing capacity FS≥3.0.', keywords: ['factor of safety', 'japanese', 'jsce', 'design', 'fos', 'safety factor'], topic: 'design' },

  // --- Eurocode 7 additions ---
  { id: 'EC7-7.4', standard: 'EN 1997-1:2004', section: '7.4', title: 'Pile shaft resistance in clay — α-method', content: 'Shaft resistance: qs = α × cu. α depends on cu/σ\'v ratio and pile type. For driven piles: α = 0.5(cu/σ\'v)^-0.5 for cu/σ\'v ≤ 1, and α = 0.5(cu/σ\'v)^-0.25 for cu/σ\'v > 1 (API RP2A approach). For bored piles: reduce α by 0.8-0.9 factor. Base resistance: qb = Nc × cu, Nc = 9 for deep foundations (L/D > 4).', keywords: ['pile', 'shaft resistance', 'alpha method', 'clay', 'undrained', 'eurocode'], topic: 'foundations' },
  { id: 'EC7-SLOPE', standard: 'EN 1997-1:2004', section: '11.5', title: 'Slope stability — methods of analysis', content: 'Acceptable methods: Bishop simplified, Janbu simplified/rigorous, Spencer, Morgenstern-Price. Partial factors on soil strength: γφ=1.25 (DA1-C2, DA3), γc=1.25 (DA1-C2, DA3), γcu=1.4 (DA1-C2, DA3). Design approach 3 (DA3) recommended for slopes: factors on material + variable actions. Minimum reliability index β=3.8 for RC2 structures.', keywords: ['slope stability', 'bishop', 'eurocode', 'partial factor', 'spencer', 'morgenstern'], topic: 'slopes' },
  { id: 'EC7-RETAINING', standard: 'EN 1997-1:2004', section: '9.5', title: 'Retaining wall design checks', content: 'Verification: (1) Bearing capacity of base, (2) Sliding resistance: Rd ≥ Ed, where Rd = Vd×tan(δd) + c×B for drained, (3) Overturning: eccentricity e < B/3 (drained) or B/2 (undrained), (4) Overall stability (slope failure through wall). Active pressure: Ka from Rankine or Coulomb. Compaction-induced pressures must be considered. Water pressure treated separately with γF=1.35.', keywords: ['retaining wall', 'earth pressure', 'sliding', 'overturning', 'eurocode', 'bearing'], topic: 'retaining' },

  // --- Settlement additions ---
  { id: 'SCHMERTMANN', standard: 'Schmertmann 1970/1978', section: 'Full', title: 'Schmertmann Immediate Settlement', content: 'Strain influence factor method for granular soils. S = C1×C2×q×Σ(Iz/Es)×Δz. Influence factor peaks at Iz,max=0.5 at depth B/2 (square) or B (strip). C1 = 1-0.5(q0/Δq) embedment correction. C2 = 1+0.2log(t/0.1) creep correction. Applicable to sand, gravel, and cohesionless soils. Not valid for clays.', keywords: ['settlement', 'schmertmann', 'strain influence', 'granular', 'immediate', 'elastic'], topic: 'settlement' },

  // --- Pile design additions ---
  { id: 'MEYERHOF-PILE', standard: 'Meyerhof 1976', section: 'Full', title: 'SPT-Based Pile Capacity', content: 'Driven piles in sand: qb = 400N (kPa, limited to 400N ≤ 40000 kPa). Shaft: fs = 2N (kPa). Bored piles: qb = 133N, fs = N/3. N = average SPT N-value at base (±5D zone for qb, along shaft for fs). Method tends to be conservative. Corrections: N should be corrected for overburden (N1,60).', keywords: ['pile', 'spt', 'meyerhof', 'driven', 'bored', 'bearing capacity'], topic: 'foundations' },
];

// ---------------------------------------------------------------------------
// Query interface
// ---------------------------------------------------------------------------

export interface StandardsQueryResult {
  query: string;
  matches: StandardProvision[];
  bestMatch: StandardProvision | null;
}

export function queryStandards(query: string, maxResults = 5): StandardsQueryResult {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  // Score each provision by keyword overlap
  const scored = STANDARDS_DB.map((provision) => {
    let score = 0;
    const allText = [
      ...provision.keywords,
      provision.title.toLowerCase(),
      provision.topic,
      provision.standard.toLowerCase(),
    ].join(' ');

    for (const word of queryWords) {
      if (allText.includes(word)) score += 2;
      for (const kw of provision.keywords) {
        if (kw.includes(word) || word.includes(kw)) score += 3;
      }
    }

    // Boost exact topic match
    if (provision.topic === queryLower || provision.keywords.includes(queryLower)) {
      score += 10;
    }

    return { provision, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.provision);

  return {
    query,
    matches,
    bestMatch: matches[0] ?? null,
  };
}

export function listStandards(): Array<{ id: string; standard: string; title: string; topic: string }> {
  return STANDARDS_DB.map((s) => ({ id: s.id, standard: s.standard, title: s.title, topic: s.topic }));
}

export function getStandardById(id: string): StandardProvision | null {
  return STANDARDS_DB.find((s) => s.id === id) ?? null;
}

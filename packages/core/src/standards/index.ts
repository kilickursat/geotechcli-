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

export type StandardProfileId = 'eurocode7' | 'aashto' | 'is' | 'bs' | 'astm';

export interface StandardProfileAssumptions {
  id: StandardProfileId;
  label: string;
  basis: string;
  designFormat: 'partial-factor' | 'lrfd' | 'working-stress' | 'testing-classification';
  defaultFactorOfSafety: number;
  bearingMethod: 'terzaghi' | 'meyerhof' | 'hansen' | 'vesic';
  pileMethod: 'alpha' | 'beta' | 'spt-meyerhof' | 'auto';
  slopeMethod: 'bishop' | 'ordinary';
  liquefactionMethod: 'boulanger-idriss-2014';
  sourceReferences: string[];
  safetyFactorContext: StandardProfileSafetyFactorContext[];
  requiredAssumptions: StandardProfileRequiredAssumption[];
  notes: string[];
}

export type StandardProfileValidationStatus = 'pass' | 'review' | 'blocked';
export type StandardProfileValidationSeverity = 'blocking' | 'review' | 'info';

export interface StandardProfileSafetyFactorContext {
  workflow: string;
  label: string;
  designBasis: string;
  factorLabel: string;
  value?: number;
  sourceReferences: string[];
  notes: string[];
}

export interface StandardProfileRequiredAssumption {
  code: string;
  label: string;
  severity: StandardProfileValidationSeverity;
  workflows: string[];
  sourceReferences: string[];
  recommendation: string;
}

export interface StandardProfileValidationWorkflowInput {
  workflow: string;
  status: 'ready' | 'ready_with_assumptions' | 'blocked' | string;
  missing?: string[];
  assumptions?: string[];
  evidenceIds?: string[];
}

export interface StandardProfileEvidenceChecklist {
  hasBoreholes?: boolean;
  hasStrata?: boolean;
  hasDepthCoverage?: boolean;
  hasSpt?: boolean;
  hasGroundwater?: boolean;
  hasUnitWeight?: boolean;
  hasStrength?: boolean;
  hasCompressibility?: boolean;
  hasFinesOrGradation?: boolean;
  hasCoordinates?: boolean;
}

export interface StandardProfileValidationInput {
  requestedProfile?: string | null;
  declaredAssumptionCodes?: string[];
  evidence?: StandardProfileEvidenceChecklist;
  workflows?: StandardProfileValidationWorkflowInput[];
}

export interface StandardProfileValidationBlocker {
  code: string;
  severity: StandardProfileValidationSeverity;
  message: string;
  workflows: string[];
  sourceReferences: string[];
  evidenceIds: string[];
  recommendation: string;
}

export interface StandardProfileValidationRequiredAssumption extends StandardProfileRequiredAssumption {
  declared: boolean;
}

export interface StandardProfileValidation {
  schemaVersion: 'standard-profile-validation.v1';
  profile: StandardProfileAssumptions | null;
  requestedProfile?: string;
  status: StandardProfileValidationStatus;
  blockerCodes: string[];
  blockers: StandardProfileValidationBlocker[];
  requiredAssumptions: StandardProfileValidationRequiredAssumption[];
  safetyFactorContext: StandardProfileSafetyFactorContext[];
  sourceReferences: string[];
  notes: string[];
}

export interface StandardProfileValidationContract {
  schemaVersion: 'standard-profile-validation-contract.v1';
  ok: boolean;
  failures: string[];
}

const STANDARD_VALIDATION_WORKFLOWS = new Set([
  'bearing-capacity',
  'settlement',
  'pile-capacity',
  'liquefaction',
  'slope-stability',
]);

const STANDARD_PROFILE_PROHIBITED_EXECUTION_KEYS = new Set([
  'analysisCase',
  'caseOutput',
  'caseOutputPath',
  'calculationOutput',
  'calculationResult',
  'command',
  'commandTemplate',
  'designOutput',
  'designResult',
  'executable',
  'fem',
  'runCommand',
  'solver',
  'solverInput',
  'solverOutput',
  'toolName',
]);

const STANDARD_PROFILE_PROHIBITED_RAW_PAYLOAD_KEYS = new Set([
  'apiKey',
  'authorization',
  'headers',
  'messages',
  'model',
  'modelId',
  'prompt',
  'provider',
  'request',
  'response',
  'rawText',
  'sourceEvidence',
  'sourceEvidenceSnippet',
  'sourceEvidenceSnippets',
  'token',
  'visionModelId',
]);

const STANDARD_PROFILES: Record<StandardProfileId, StandardProfileAssumptions> = {
  eurocode7: {
    id: 'eurocode7',
    label: 'Eurocode 7',
    basis: 'EN 1997-1 style profile. Current deterministic engines remain global-FS calculations; profile notes identify EC7 partial-factor checks still requiring engineer confirmation.',
    designFormat: 'partial-factor',
    defaultFactorOfSafety: 3.0,
    bearingMethod: 'meyerhof',
    pileMethod: 'auto',
    slopeMethod: 'bishop',
    liquefactionMethod: 'boulanger-idriss-2014',
    sourceReferences: ['EC7-2.4.7', 'EC7-6.5', 'EC7-7.6', 'EC7-11'],
    safetyFactorContext: [
      {
        workflow: 'bearing-capacity',
        label: 'Spread foundation bearing resistance',
        designBasis: 'Partial-factor verification is required before claiming Eurocode 7 compliance.',
        factorLabel: 'Draft global factor of safety fallback',
        value: 3.0,
        sourceReferences: ['EC7-2.4.7', 'EC7-6.5'],
        notes: ['The deterministic bearing engine remains a global-FS draft route until design approach, actions, material factors, and resistance factors are declared.'],
      },
      {
        workflow: 'pile-capacity',
        label: 'Pile compressive resistance',
        designBasis: 'Pile resistance requires selected design approach, correlation factors, pile type, and resistance factors.',
        factorLabel: 'Draft global factor of safety fallback',
        value: 3.0,
        sourceReferences: ['EC7-2.4.7', 'EC7-7.6'],
        notes: ['Do not convert the draft pile route into EC7 design output without declared partial factors and test-profile correlation assumptions.'],
      },
      {
        workflow: 'slope-stability',
        label: 'Overall stability',
        designBasis: 'Overall stability requires material-factor and action-factor selection before design use.',
        factorLabel: 'Draft global stability check',
        sourceReferences: ['EC7-2.4.7', 'EC7-11'],
        notes: ['Global-FS slope outputs are screening checks, not an EC7 partial-factor verification.'],
      },
    ],
    requiredAssumptions: [
      {
        code: 'ec7_design_approach_required',
        label: 'Eurocode 7 design approach and combination',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['EC7-2.4.7'],
        recommendation: 'Declare Design Approach 1/2/3 and the governing action/material/resistance factor set before any EC7 design claim.',
      },
      {
        code: 'ec7_characteristic_values_required',
        label: 'Characteristic value selection basis',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['EC7-2.4.7'],
        recommendation: 'Record how characteristic soil and groundwater values were selected from the evidence before generated drafts are used for design.',
      },
    ],
    notes: [
      'Select design approach and partial factors before claiming Eurocode 7 compliance.',
      'Use generated inputs as draft characteristic-value checks, not final design values.',
    ],
  },
  aashto: {
    id: 'aashto',
    label: 'AASHTO LRFD',
    basis: 'AASHTO-style transportation profile for draft input preparation. Resistance-factor design is not yet applied by the deterministic engines.',
    designFormat: 'lrfd',
    defaultFactorOfSafety: 2.5,
    bearingMethod: 'meyerhof',
    pileMethod: 'spt-meyerhof',
    slopeMethod: 'bishop',
    liquefactionMethod: 'boulanger-idriss-2014',
    sourceReferences: ['AASHTO-LRFD-GEOTECH', 'ASTM-D1586', 'BI-2014'],
    safetyFactorContext: [
      {
        workflow: 'bearing-capacity',
        label: 'Service and strength bearing checks',
        designBasis: 'AASHTO LRFD requires selected limit state, load combination, and resistance factor.',
        factorLabel: 'Draft global factor of safety fallback',
        value: 2.5,
        sourceReferences: ['AASHTO-LRFD-GEOTECH'],
        notes: ['Draft bearing inputs are not LRFD design outputs until resistance factors and limit-state combinations are declared.'],
      },
      {
        workflow: 'pile-capacity',
        label: 'Driven pile SPT correlation route',
        designBasis: 'AASHTO-style pile drafts require pile type, construction method, resistance factor, and corrected SPT values.',
        factorLabel: 'Draft global factor of safety fallback',
        value: 2.5,
        sourceReferences: ['AASHTO-LRFD-GEOTECH', 'ASTM-D1586'],
        notes: ['SPT evidence should use corrected N-values where available before transportation foundation design checks.'],
      },
    ],
    requiredAssumptions: [
      {
        code: 'aashto_limit_state_required',
        label: 'AASHTO LRFD limit state and load combination',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['AASHTO-LRFD-GEOTECH'],
        recommendation: 'Declare service/strength limit state, load combination, and resistance factor before any AASHTO LRFD design claim.',
      },
      {
        code: 'aashto_resistance_factor_required',
        label: 'Resistance factor basis',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['AASHTO-LRFD-GEOTECH'],
        recommendation: 'Record the resistance factor and basis for the selected geotechnical resistance model.',
      },
    ],
    notes: [
      'Resistance factors, load combinations, and service/strength limit states must be selected before design use.',
      'SPT-based pile and liquefaction drafts require corrected N-values where available.',
    ],
  },
  is: {
    id: 'is',
    label: 'Indian Standards',
    basis: 'IS-code style working-stress profile for draft input preparation using common geotechnical global safety-factor workflows.',
    designFormat: 'working-stress',
    defaultFactorOfSafety: 3.0,
    bearingMethod: 'terzaghi',
    pileMethod: 'auto',
    slopeMethod: 'bishop',
    liquefactionMethod: 'boulanger-idriss-2014',
    sourceReferences: ['IS-6403', 'IS-2911', 'BI-2014'],
    safetyFactorContext: [
      {
        workflow: 'bearing-capacity',
        label: 'Working-stress bearing capacity',
        designBasis: 'IS-style bearing drafts require applicable code clause, water-table treatment, and settlement limit checks.',
        factorLabel: 'Draft factor of safety',
        value: 3.0,
        sourceReferences: ['IS-6403'],
        notes: ['The deterministic route prepares input drafts only; final IS compliance requires project-specific load and settlement criteria.'],
      },
      {
        workflow: 'pile-capacity',
        label: 'Pile design draft route',
        designBasis: 'Pile drafts require pile type, installation method, working load, and applicable IS pile design assumptions.',
        factorLabel: 'Draft factor of safety',
        value: 3.0,
        sourceReferences: ['IS-2911'],
        notes: ['Pile capacity drafts are not final IS design checks until installation method and code edition are declared.'],
      },
    ],
    requiredAssumptions: [
      {
        code: 'is_code_clause_required',
        label: 'Applicable IS code and clause basis',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['IS-6403', 'IS-2911'],
        recommendation: 'Declare the governing IS code, edition, clause basis, load case, and settlement criteria before design use.',
      },
      {
        code: 'is_water_table_treatment_required',
        label: 'Water-table treatment and seasonal basis',
        severity: 'review',
        workflows: ['bearing-capacity', 'pile-capacity', 'slope-stability', 'liquefaction'],
        sourceReferences: ['IS-6403'],
        recommendation: 'Record the adopted groundwater level and seasonal variation before routing generated inputs into calculations.',
      },
    ],
    notes: [
      'Confirm applicable IS code, load combination, and water-level assumptions before calculation.',
      'Treat SPT references to IS methods as standards text unless plausible blow counts are evidence-bound.',
    ],
  },
  bs: {
    id: 'bs',
    label: 'British Standards',
    basis: 'BS-style working-stress profile for preliminary checks where legacy BS methods or UK practice are requested.',
    designFormat: 'working-stress',
    defaultFactorOfSafety: 3.0,
    bearingMethod: 'meyerhof',
    pileMethod: 'auto',
    slopeMethod: 'bishop',
    liquefactionMethod: 'boulanger-idriss-2014',
    sourceReferences: ['BS-8004', 'BS-8002', 'EC7-2.4.7'],
    safetyFactorContext: [
      {
        workflow: 'bearing-capacity',
        label: 'Legacy BS / UK practice bearing draft',
        designBasis: 'BS-style checks require confirming whether legacy BS, Eurocode 7 with UK NA, or project specification controls.',
        factorLabel: 'Draft factor of safety',
        value: 3.0,
        sourceReferences: ['BS-8004', 'EC7-2.4.7'],
        notes: ['Generated drafts are readiness inputs; they do not apply UK national-annex partial factors.'],
      },
      {
        workflow: 'slope-stability',
        label: 'Overall stability draft',
        designBasis: 'Slope checks require selected legacy/NA basis, groundwater assumptions, and construction stage conditions.',
        factorLabel: 'Draft global stability check',
        sourceReferences: ['BS-8002', 'EC7-11'],
        notes: ['Use this as a readiness gate before deterministic slope runs, not as BS compliance output.'],
      },
    ],
    requiredAssumptions: [
      {
        code: 'bs_design_basis_required',
        label: 'Legacy BS versus Eurocode 7 UK NA design basis',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['BS-8004', 'EC7-2.4.7'],
        recommendation: 'Declare whether legacy BS, Eurocode 7 UK National Annex, or project specification governs before design claims.',
      },
      {
        code: 'bs_groundwater_and_stage_required',
        label: 'Groundwater and construction-stage assumptions',
        severity: 'review',
        workflows: ['bearing-capacity', 'slope-stability'],
        sourceReferences: ['BS-8002', 'BS-8004'],
        recommendation: 'Record groundwater and construction-stage assumptions before using generated bearing or stability inputs.',
      },
    ],
    notes: [
      'Confirm whether the project requires legacy BS, Eurocode 7 UK NA, or project-specific specifications.',
      'Generated drafts are preliminary and do not apply national-annex factors.',
    ],
  },
  astm: {
    id: 'astm',
    label: 'ASTM testing/classification',
    basis: 'ASTM-heavy profile for classification and test-method traceability. ASTM does not define a complete global design-code factor set.',
    designFormat: 'testing-classification',
    defaultFactorOfSafety: 3.0,
    bearingMethod: 'meyerhof',
    pileMethod: 'spt-meyerhof',
    slopeMethod: 'bishop',
    liquefactionMethod: 'boulanger-idriss-2014',
    sourceReferences: ['ASTM-D2487', 'ASTM-D1586', 'ASTM-D5778', 'ASTM-D4318'],
    safetyFactorContext: [
      {
        workflow: 'bearing-capacity',
        label: 'Testing/classification provenance for bearing drafts',
        designBasis: 'ASTM supports test method and classification provenance; it is not a complete geotechnical design-code profile.',
        factorLabel: 'No ASTM design factor',
        sourceReferences: ['ASTM-D2487', 'ASTM-D1586', 'ASTM-D4318'],
        notes: ['Select a companion design profile before turning ASTM-sourced evidence into design calculations.'],
      },
      {
        workflow: 'liquefaction',
        label: 'SPT/CPT provenance for liquefaction drafts',
        designBasis: 'ASTM SPT/CPT methods can provide traceable inputs for empirical liquefaction checks.',
        factorLabel: 'Boulanger-Idriss triggering method',
        sourceReferences: ['ASTM-D1586', 'ASTM-D5778', 'BI-2014'],
        notes: ['Corrected SPT/CPT parameters and seismic demand remain required user inputs.'],
      },
    ],
    requiredAssumptions: [
      {
        code: 'astm_companion_design_standard_required',
        label: 'Companion design standard for calculations',
        severity: 'blocking',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability'],
        sourceReferences: ['ASTM-D2487', 'ASTM-D1586'],
        recommendation: 'Use ASTM for test/classification traceability, then declare Eurocode 7, AASHTO, IS, BS, or a project specification for design factors.',
      },
      {
        code: 'astm_test_method_traceability_required',
        label: 'ASTM test method provenance',
        severity: 'review',
        workflows: ['bearing-capacity', 'settlement', 'pile-capacity', 'liquefaction', 'slope-stability'],
        sourceReferences: ['ASTM-D2487', 'ASTM-D1586', 'ASTM-D5778', 'ASTM-D4318'],
        recommendation: 'Preserve source test method, sample depth, correction factors, and classification evidence for all ASTM-derived parameters.',
      },
    ],
    notes: [
      'Use ASTM references for test/classification provenance, then select a design standard for final factors.',
      'Generated drafts preserve ASTM SPT/USCS traceability but are not ASTM design compliance outputs.',
    ],
  },
};

const STANDARDS_DB: StandardProvision[] = [
  // --- Eurocode 7 (EN 1997) ---
  { id: 'EC7-2.4.7', standard: 'EN 1997-1:2004', section: '2.4.7', title: 'Partial factors – ULS', content: 'Design approach 1 (DA1): Combination 1: A1+M1+R1, Combination 2: A2+M2+R1. Partial factors on actions γG=1.35(unfav)/1.0(fav), γQ=1.5(unfav)/0. Partial factors on soil: γφ=1.0(C1)/1.25(C2), γc=1.0(C1)/1.25(C2), γcu=1.0(C1)/1.4(C2).', keywords: ['partial factor', 'uls', 'design approach', 'eurocode', 'safety factor', 'limit state'], topic: 'design' },
  { id: 'EC7-6.5', standard: 'EN 1997-1:2004', section: '6.5', title: 'Bearing resistance – spread foundations', content: 'The design bearing resistance shall be calculated from ground test results or pressuremeter test results. Analytical methods: Terzaghi, Meyerhof, Hansen, Vesic equations with partial factors applied. Rk = A\'(c\'Nc sc ic + q\'Nq sq iq + 0.5γ\'B\'Nγ sγ iγ). The design value Rd = Rk/γR where γR = 1.0(DA1-C1) or 1.4(DA1-C2).', keywords: ['bearing capacity', 'foundation', 'spread foundation', 'shallow', 'eurocode'], topic: 'foundations' },
  { id: 'EC7-7.6', standard: 'EN 1997-1:2004', section: '7.6', title: 'Pile bearing capacity', content: 'Ultimate compressive resistance from static formula: Rc,cal = Rs,cal + Rb,cal (shaft + base). Correlation factors ξ depend on number of test profiles. For driven piles: Rc,d = Rc,k/γt where γt = 1.0-1.6 depending on DA and pile type.', keywords: ['pile', 'bearing capacity', 'deep foundation', 'shaft resistance', 'base resistance'], topic: 'foundations' },
  { id: 'EC7-11', standard: 'EN 1997-1:2004', section: '11', title: 'Overall stability', content: 'Verification of overall stability required for slopes, embankments, earthworks. Bishop, Janbu, Morgenstern-Price methods acceptable. Minimum FOS: 1.0 when using partial factors on soil strength (DA3), or 1.25-1.5 for global FOS approach.', keywords: ['slope stability', 'overall stability', 'factor of safety', 'bishop', 'eurocode'], topic: 'slopes' },
  { id: 'EC7-12', standard: 'EN 1997-1:2004', section: '12', title: 'Embankments', content: 'End-of-construction stability, long-term stability, and rapid drawdown conditions shall be checked. Pore pressure assumptions: undrained (short-term), drained (long-term). Observation method per §2.7 is applicable for staged construction.', keywords: ['embankment', 'construction', 'stability', 'pore pressure', 'staged'], topic: 'slopes' },
  { id: 'EC7-9', standard: 'EN 1997-1:2004', section: '9', title: 'Retaining structures', content: 'Earth pressure: at-rest K0 = 1-sinφ\' (normally consolidated), active Ka, passive Kp. Compaction-induced pressures shall be considered. Water pressure treated separately from earth pressure. Design approaches DA1, DA2, DA3 applicable.', keywords: ['retaining wall', 'earth pressure', 'lateral', 'K0', 'active', 'passive'], topic: 'retaining' },

  // --- AASHTO / IS / BS profile anchors ---
  { id: 'AASHTO-LRFD-GEOTECH', standard: 'AASHTO LRFD Bridge Design Specifications', section: 'Geotechnical', title: 'LRFD geotechnical design profile', content: 'Transportation foundation checks require declared limit state, load combination, resistance factor, serviceability criteria, and construction method. Draft inputs are not LRFD design output until these project-specific factors are selected.', keywords: ['aashto', 'lrfd', 'resistance factor', 'limit state', 'foundation', 'pile'], topic: 'design' },
  { id: 'IS-6403', standard: 'IS 6403', section: 'Bearing capacity', title: 'Shallow foundation bearing capacity profile', content: 'Working-stress bearing checks require declared foundation geometry, load case, water-table correction, soil parameter basis, and settlement criteria. Draft factors of safety must be confirmed against the governing project code edition.', keywords: ['indian standard', 'is', 'bearing capacity', 'foundation', 'water table', 'settlement'], topic: 'foundations' },
  { id: 'IS-2911', standard: 'IS 2911', section: 'Pile foundations', title: 'Pile design profile', content: 'Pile design checks require pile type, installation method, load case, group effects, groundwater assumptions, and source evidence for shaft and base resistance parameters before design use.', keywords: ['indian standard', 'is', 'pile', 'deep foundation', 'shaft resistance', 'base resistance'], topic: 'foundations' },
  { id: 'BS-8004', standard: 'BS 8004 / UK practice', section: 'Foundations', title: 'Foundation design profile', content: 'Foundation design readiness requires confirming whether legacy British Standards, Eurocode 7 UK National Annex, or project-specific specifications govern. Draft global factor checks do not apply national-annex factors.', keywords: ['british standard', 'bs', 'foundation', 'bearing capacity', 'uk national annex'], topic: 'foundations' },
  { id: 'BS-8002', standard: 'BS 8002 / UK practice', section: 'Earth retaining and stability', title: 'Retaining and stability profile', content: 'Retaining and stability checks require selected design basis, groundwater conditions, construction stage, surcharge, drainage, and material parameter basis before design claims.', keywords: ['british standard', 'bs', 'retaining', 'stability', 'groundwater', 'slope'], topic: 'slopes' },

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

export function normalizeStandardProfileId(value: string | null | undefined): StandardProfileId | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) {
    return undefined;
  }

  const aliases: Record<string, StandardProfileId> = {
    ec7: 'eurocode7',
    eurocode: 'eurocode7',
    eurocode7: 'eurocode7',
    en1997: 'eurocode7',
    aashto: 'aashto',
    aashtolrfd: 'aashto',
    is: 'is',
    indianstandard: 'is',
    indianstandards: 'is',
    bs: 'bs',
    britishstandard: 'bs',
    britishstandards: 'bs',
    astm: 'astm',
  };

  return aliases[normalized];
}

export function listStandardProfiles(): StandardProfileAssumptions[] {
  return Object.values(STANDARD_PROFILES).map(cloneStandardProfile);
}

export function getStandardProfile(id: string | null | undefined): StandardProfileAssumptions | null {
  const normalized = normalizeStandardProfileId(id);
  if (!normalized) {
    return null;
  }

  const profile = STANDARD_PROFILES[normalized];
  return cloneStandardProfile(profile);
}

export function validateStandardProfileReadiness(
  input: StandardProfileValidationInput = {},
): StandardProfileValidation {
  const requestedProfile = input.requestedProfile?.trim() || 'eurocode7';
  const normalized = normalizeStandardProfileId(requestedProfile);
  const profile = normalized ? STANDARD_PROFILES[normalized] : null;
  const declaredCodes = new Set((input.declaredAssumptionCodes ?? []).map((code) => code.toLowerCase()));

  if (!profile) {
    const blocker: StandardProfileValidationBlocker = {
      code: 'standard_profile_unknown',
      severity: 'blocking',
      message: `Requested standard profile "${requestedProfile}" is not supported.`,
      workflows: [],
      sourceReferences: [],
      evidenceIds: [],
      recommendation: 'Use one of eurocode7, aashto, is, bs, or astm before claiming standard-profile readiness.',
    };

    return {
      schemaVersion: 'standard-profile-validation.v1',
      profile: null,
      requestedProfile,
      status: 'blocked',
      blockerCodes: [blocker.code],
      blockers: [blocker],
      requiredAssumptions: [],
      safetyFactorContext: [],
      sourceReferences: [],
      notes: [],
    };
  }

  const workflowSet = new Set((input.workflows ?? []).map((workflow) => workflow.workflow));
  const workflowFilter = (workflow: string): boolean => workflowSet.size === 0 || workflowSet.has(workflow);
  const requiredAssumptions = profile.requiredAssumptions
    .filter((assumption) => assumption.workflows.some(workflowFilter))
    .map((assumption) => ({
      ...cloneRequiredAssumption(assumption),
      declared: declaredCodes.has(assumption.code.toLowerCase()),
    }));
  const safetyFactorContext = profile.safetyFactorContext
    .filter((context) => workflowFilter(context.workflow))
    .map(cloneSafetyFactorContext);
  const blockers: StandardProfileValidationBlocker[] = [];

  for (const assumption of requiredAssumptions) {
    if (assumption.declared) {
      continue;
    }

    blockers.push({
      code: assumption.code,
      severity: assumption.severity,
      message: `Required ${profile.label} assumption is not declared: ${assumption.label}.`,
      workflows: assumption.workflows.filter(workflowFilter),
      sourceReferences: [...assumption.sourceReferences],
      evidenceIds: [],
      recommendation: assumption.recommendation,
    });
  }

  blockers.push(...buildEvidenceValidationBlockers(profile, input));
  blockers.push(...buildWorkflowValidationBlockers(profile, input));

  const status: StandardProfileValidationStatus = blockers.some((blocker) => blocker.severity === 'blocking')
    ? 'blocked'
    : blockers.some((blocker) => blocker.severity === 'review')
      ? 'review'
      : 'pass';

  return {
    schemaVersion: 'standard-profile-validation.v1',
    profile: cloneStandardProfile(profile),
    requestedProfile,
    status,
    blockerCodes: [...new Set(blockers.map((blocker) => blocker.code))],
    blockers,
    requiredAssumptions,
    safetyFactorContext,
    sourceReferences: collectStandardSourceReferences(profile, safetyFactorContext, blockers),
    notes: [...profile.notes],
  };
}

export function validateStandardProfileValidationContract(
  value: unknown,
): StandardProfileValidationContract {
  const failures: string[] = [];

  if (!isRecord(value)) {
    return {
      schemaVersion: 'standard-profile-validation-contract.v1',
      ok: false,
      failures: ['standard validation contract must be an object'],
    };
  }

  if (value.schemaVersion !== 'standard-profile-validation.v1') {
    failures.push('standard validation schemaVersion must be standard-profile-validation.v1');
  }

  if (!['pass', 'review', 'blocked'].includes(String(value.status))) {
    failures.push('standard validation status must be pass, review, or blocked');
  }

  const profile = value.profile;
  if (profile !== null) {
    if (!isRecord(profile)) {
      failures.push('standard validation profile must be an object or null');
    } else {
      const profileId = typeof profile.id === 'string' ? normalizeStandardProfileId(profile.id) : undefined;
      if (!profileId) {
        failures.push('standard validation profile id must be one of eurocode7, aashto, is, bs, or astm');
      }
      if (!Array.isArray(profile.sourceReferences) || !profile.sourceReferences.some(isNonEmptyString)) {
        failures.push('standard validation profile must carry source references');
      }
      if (!Array.isArray(profile.requiredAssumptions) || profile.requiredAssumptions.length === 0) {
        failures.push('standard validation profile must carry required assumptions');
      }
      if (!Array.isArray(profile.safetyFactorContext) || profile.safetyFactorContext.length === 0) {
        failures.push('standard validation profile must carry safety-factor context');
      }
    }
  }

  const blockers = Array.isArray(value.blockers) ? value.blockers : [];
  const blockerCodes = Array.isArray(value.blockerCodes) ? value.blockerCodes : [];
  if (!Array.isArray(value.blockers)) {
    failures.push('standard validation blockers must be an array');
  }
  if (!Array.isArray(value.blockerCodes)) {
    failures.push('standard validation blockerCodes must be an array');
  }
  if (String(value.status) === 'blocked' && blockers.length === 0) {
    failures.push('blocked standard validation must include at least one blocker');
  }

  for (const code of blockerCodes) {
    if (!isStableBlockerCode(code)) {
      failures.push(`standard validation blocker code is not stable: ${String(code)}`);
    }
  }

  for (const [index, blocker] of blockers.entries()) {
    if (!isRecord(blocker)) {
      failures.push(`standard validation blocker ${index} must be an object`);
      continue;
    }
    if (!isStableBlockerCode(blocker.code)) {
      failures.push(`standard validation blocker ${index} has unstable code`);
    }
    if (!['blocking', 'review', 'info'].includes(String(blocker.severity))) {
      failures.push(`standard validation blocker ${String(blocker.code)} has invalid severity`);
    }
    if (!isNonEmptyString(blocker.message)) {
      failures.push(`standard validation blocker ${String(blocker.code)} must include a message`);
    }
    if (!Array.isArray(blocker.workflows)) {
      failures.push(`standard validation blocker ${String(blocker.code)} must include workflows`);
    }
    if (!Array.isArray(blocker.sourceReferences)) {
      failures.push(`standard validation blocker ${String(blocker.code)} must include source references`);
    }
    if (!Array.isArray(blocker.evidenceIds)) {
      failures.push(`standard validation blocker ${String(blocker.code)} must include evidenceIds`);
    }
    if (!isNonEmptyString(blocker.recommendation)) {
      failures.push(`standard validation blocker ${String(blocker.code)} must include a recommendation`);
    }
  }

  const requiredAssumptions = Array.isArray(value.requiredAssumptions) ? value.requiredAssumptions : [];
  if (!Array.isArray(value.requiredAssumptions)) {
    failures.push('standard validation requiredAssumptions must be an array');
  }
  for (const [index, assumption] of requiredAssumptions.entries()) {
    if (!isRecord(assumption)) {
      failures.push(`standard validation required assumption ${index} must be an object`);
      continue;
    }
    if (!isStableBlockerCode(assumption.code)) {
      failures.push(`standard validation required assumption ${index} has unstable code`);
    }
    if (typeof assumption.declared !== 'boolean') {
      failures.push(`standard validation required assumption ${String(assumption.code)} must expose declared boolean`);
    }
    if (!Array.isArray(assumption.sourceReferences) || !assumption.sourceReferences.some(isNonEmptyString)) {
      failures.push(`standard validation required assumption ${String(assumption.code)} must include source references`);
    }
  }

  const safetyFactorContext = Array.isArray(value.safetyFactorContext) ? value.safetyFactorContext : [];
  if (!Array.isArray(value.safetyFactorContext)) {
    failures.push('standard validation safetyFactorContext must be an array');
  }
  for (const [index, context] of safetyFactorContext.entries()) {
    if (!isRecord(context)) {
      failures.push(`standard validation safety-factor context ${index} must be an object`);
      continue;
    }
    if (!isNonEmptyString(context.workflow)) {
      failures.push(`standard validation safety-factor context ${index} must include workflow`);
    }
    if (!Array.isArray(context.sourceReferences) || !context.sourceReferences.some(isNonEmptyString)) {
      failures.push(`standard validation safety-factor context ${String(context.workflow)} must include source references`);
    }
  }

  for (const keyPath of collectProhibitedStandardProfileKeys(value)) {
    failures.push(`standard validation must stay readiness-only; prohibited execution key found at ${keyPath}`);
  }

  for (const keyPath of collectProhibitedStandardProfileRawPayloadKeys(value)) {
    failures.push(`standard validation must not carry raw prompt, response, model, or source-evidence payload key at ${keyPath}`);
  }

  for (const leak of collectStandardProfilePrivateLeaks(value)) {
    failures.push(`standard validation must not leak private paths or tokens at ${leak}`);
  }

  for (const sourceReference of collectSourceReferences(value)) {
    if (!getStandardById(sourceReference)) {
      failures.push(`standard validation source reference is not in the standards database: ${sourceReference}`);
    }
  }

  return {
    schemaVersion: 'standard-profile-validation-contract.v1',
    ok: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

function buildEvidenceValidationBlockers(
  profile: StandardProfileAssumptions,
  input: StandardProfileValidationInput,
): StandardProfileValidationBlocker[] {
  const evidence = input.evidence ?? {};
  const workflowSet = new Set((input.workflows ?? []).map((workflow) => workflow.workflow));
  const hasAnyWorkflow = (...workflows: string[]): boolean => (
    workflowSet.size === 0 || workflows.some((workflow) => workflowSet.has(workflow))
  );
  const blockers: StandardProfileValidationBlocker[] = [];

  if (evidence.hasGroundwater === false && hasAnyWorkflow('bearing-capacity', 'settlement', 'pile-capacity', 'liquefaction', 'slope-stability')) {
    blockers.push({
      code: 'standard_groundwater_review_required',
      severity: 'review',
      message: 'Groundwater condition is not evidence-bound for one or more standard-profile workflows.',
      workflows: filterWorkflows(workflowSet, ['bearing-capacity', 'settlement', 'pile-capacity', 'liquefaction', 'slope-stability']),
      sourceReferences: relevantProfileReferences(profile, ['bearing-capacity', 'settlement', 'pile-capacity', 'liquefaction', 'slope-stability']),
      evidenceIds: [],
      recommendation: 'Bind groundwater observations to source evidence or declare a dry/unknown groundwater assumption before calculation use.',
    });
  }

  if (evidence.hasUnitWeight === false && hasAnyWorkflow('bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability')) {
    blockers.push({
      code: 'standard_unit_weight_required',
      severity: 'review',
      message: 'Unit weight is missing from evidence for standard-profile calculation drafts.',
      workflows: filterWorkflows(workflowSet, ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability']),
      sourceReferences: relevantProfileReferences(profile, ['bearing-capacity', 'settlement', 'pile-capacity', 'slope-stability']),
      evidenceIds: [],
      recommendation: 'Add measured or explicitly assumed unit weight with source-page traceability before routing into calculations.',
    });
  }

  if (evidence.hasStrength === false && hasAnyWorkflow('bearing-capacity', 'slope-stability')) {
    blockers.push({
      code: 'standard_strength_basis_required',
      severity: 'blocking',
      message: 'Shear-strength evidence is missing for standard-profile bearing or slope checks.',
      workflows: filterWorkflows(workflowSet, ['bearing-capacity', 'slope-stability']),
      sourceReferences: relevantProfileReferences(profile, ['bearing-capacity', 'slope-stability']),
      evidenceIds: [],
      recommendation: 'Provide cohesion, friction angle, undrained strength, or an accepted correlation basis before design-routing these workflows.',
    });
  }

  if (evidence.hasSpt === false && hasAnyWorkflow('liquefaction')) {
    blockers.push({
      code: 'standard_spt_required_for_liquefaction',
      severity: 'blocking',
      message: 'Liquefaction readiness requires SPT/CPT evidence; no SPT evidence is currently bound.',
      workflows: filterWorkflows(workflowSet, ['liquefaction']),
      sourceReferences: relevantProfileReferences(profile, ['liquefaction']),
      evidenceIds: [],
      recommendation: 'Add corrected SPT/CPT data with depth and groundwater evidence before liquefaction routing.',
    });
  }

  if (evidence.hasFinesOrGradation === false && hasAnyWorkflow('liquefaction')) {
    blockers.push({
      code: 'standard_fines_correction_review_required',
      severity: 'review',
      message: 'Fines/gradation evidence is missing for liquefaction correction assumptions.',
      workflows: filterWorkflows(workflowSet, ['liquefaction']),
      sourceReferences: relevantProfileReferences(profile, ['liquefaction']),
      evidenceIds: [],
      recommendation: 'Add fines content, gradation, or an explicit conservative correction assumption before liquefaction use.',
    });
  }

  if (evidence.hasCoordinates === false && hasAnyWorkflow('slope-stability', 'pile-capacity', 'bearing-capacity')) {
    blockers.push({
      code: 'standard_location_traceability_review_required',
      severity: 'info',
      message: 'Borehole or investigation location coordinates are not evidence-bound.',
      workflows: filterWorkflows(workflowSet, ['bearing-capacity', 'pile-capacity', 'slope-stability']),
      sourceReferences: [...profile.sourceReferences],
      evidenceIds: [],
      recommendation: 'Bind borehole coordinates or explicitly mark the model as non-spatial before map or site-zoning decisions.',
    });
  }

  return blockers;
}

function buildWorkflowValidationBlockers(
  profile: StandardProfileAssumptions,
  input: StandardProfileValidationInput,
): StandardProfileValidationBlocker[] {
  return (input.workflows ?? [])
    .filter((workflow) => STANDARD_VALIDATION_WORKFLOWS.has(workflow.workflow) && workflow.status === 'blocked')
    .map((workflow) => ({
      code: `workflow_blocked_${sanitizeBlockerCode(workflow.workflow)}`,
      severity: 'blocking' as const,
      message: `${workflow.workflow} is blocked before ${profile.label} readiness can be claimed.`,
      workflows: [workflow.workflow],
      sourceReferences: relevantProfileReferences(profile, [workflow.workflow]),
      evidenceIds: [...new Set(workflow.evidenceIds ?? [])].slice(0, 12),
      recommendation: workflow.missing && workflow.missing.length > 0
        ? `Resolve missing inputs: ${workflow.missing.join(', ')}.`
        : 'Resolve deterministic workflow blockers before standard-profile approval.',
    }));
}

function cloneStandardProfile(profile: StandardProfileAssumptions): StandardProfileAssumptions {
  return {
    ...profile,
    sourceReferences: [...profile.sourceReferences],
    safetyFactorContext: profile.safetyFactorContext.map(cloneSafetyFactorContext),
    requiredAssumptions: profile.requiredAssumptions.map(cloneRequiredAssumption),
    notes: [...profile.notes],
  };
}

function cloneSafetyFactorContext(context: StandardProfileSafetyFactorContext): StandardProfileSafetyFactorContext {
  return {
    ...context,
    sourceReferences: [...context.sourceReferences],
    notes: [...context.notes],
  };
}

function cloneRequiredAssumption(assumption: StandardProfileRequiredAssumption): StandardProfileRequiredAssumption {
  return {
    ...assumption,
    workflows: [...assumption.workflows],
    sourceReferences: [...assumption.sourceReferences],
  };
}

function collectStandardSourceReferences(
  profile: StandardProfileAssumptions,
  safetyFactorContext: StandardProfileSafetyFactorContext[],
  blockers: StandardProfileValidationBlocker[],
): string[] {
  return [
    ...new Set([
      ...profile.sourceReferences,
      ...safetyFactorContext.flatMap((context) => context.sourceReferences),
      ...blockers.flatMap((blocker) => blocker.sourceReferences),
    ]),
  ].filter(Boolean);
}

function relevantProfileReferences(profile: StandardProfileAssumptions, workflows: string[]): string[] {
  const references = profile.safetyFactorContext
    .filter((context) => workflows.includes(context.workflow))
    .flatMap((context) => context.sourceReferences);

  return references.length > 0 ? [...new Set(references)] : [...profile.sourceReferences];
}

function filterWorkflows(workflowSet: Set<string>, workflows: string[]): string[] {
  return workflowSet.size === 0 ? workflows : workflows.filter((workflow) => workflowSet.has(workflow));
}

function sanitizeBlockerCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStableBlockerCode(value: unknown): value is string {
  return isNonEmptyString(value) && /^[a-z][a-z0-9_]*$/.test(value);
}

function collectSourceReferences(value: unknown): string[] {
  const references: string[] = [];

  walkUnknown(value, (entry, path) => {
    if ((path === 'sourceReferences' || path.endsWith('.sourceReferences')) && Array.isArray(entry)) {
      for (const item of entry) {
        if (isNonEmptyString(item)) {
          references.push(item);
        }
      }
    }
  });

  return [...new Set(references)];
}

function collectProhibitedStandardProfileKeys(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (STANDARD_PROFILE_PROHIBITED_EXECUTION_KEYS.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectProhibitedStandardProfileRawPayloadKeys(value: unknown): string[] {
  const paths: string[] = [];

  walkUnknown(value, (entry, path) => {
    if (!isRecord(entry)) {
      return;
    }

    for (const key of Object.keys(entry)) {
      if (STANDARD_PROFILE_PROHIBITED_RAW_PAYLOAD_KEYS.has(key)) {
        paths.push(path ? `${path}.${key}` : key);
      }
    }
  });

  return paths;
}

function collectStandardProfilePrivateLeaks(value: unknown): string[] {
  const paths: string[] = [];
  const leakPattern = /(?:[A-Za-z]:[\\/](?:Users|home|tmp|var|mnt)[\\/]|\/(?:home|Users|tmp|var|mnt)\/|sk-(?:or-)?[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{12,})/i;

  walkUnknown(value, (entry, path) => {
    if (typeof entry === 'string' && leakPattern.test(entry)) {
      paths.push(path || '<root>');
    }
  });

  return paths;
}

function walkUnknown(value: unknown, visit: (entry: unknown, path: string) => void, path = ''): void {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkUnknown(item, visit, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    walkUnknown(entry, visit, path ? `${path}.${key}` : key);
  }
}

export type StrongBetaSkillApprovalStatus = 'approved' | 'held_back' | 'prompt_only';

export interface StrongBetaSkillApproval {
  status: StrongBetaSkillApprovalStatus;
  reason: string;
  certifiedAt: string;
}

const CERTIFIED_AT = '2026-04-19';
const APPROVED_REASON =
  'Passed strong-beta certification against the bundled example inputs.';
const EPB_HOLD_REASON =
  'Held back in strong-beta because the current script expects explicit per-file arguments instead of the generic --input-dir/--output-dir runner contract.';
const PROMPT_ONLY_REASON =
  'Prompt-only skill is available for inspection but is not approved for execution in strong-beta Phase 1.';
const UNKNOWN_REASON =
  'Skill is not in the current strong-beta approved catalog.';

function approval(status: StrongBetaSkillApprovalStatus, reason: string): StrongBetaSkillApproval {
  return {
    status,
    reason,
    certifiedAt: CERTIFIED_AT,
  };
}

export const STRONG_BETA_SKILL_APPROVALS: Record<string, StrongBetaSkillApproval> = {
  'basal-heave-and-uplift': approval('approved', APPROVED_REASON),
  'bearing-capacity-and-settlement-audit': approval('approved', APPROVED_REASON),
  'borehole-cpt-ground-model': approval('approved', APPROVED_REASON),
  'constructability-risk-register': approval('approved', APPROVED_REASON),
  'deep-soil-mixing-and-jet-grouting-screening': approval('approved', APPROVED_REASON),
  'design-basis-and-calculation-coverage': approval('approved', APPROVED_REASON),
  'dewatering-impact-on-excavation': approval('approved', APPROVED_REASON),
  'earth-pressure-envelope-selector': approval('approved', APPROVED_REASON),
  'embankment-staged-construction': approval('approved', APPROVED_REASON),
  'epb-conditioning-clogging': approval('approved', APPROVED_REASON),
  'epb-face-support-window': approval('approved', APPROVED_REASON),
  'epb-production-and-ring-cycle': approval('approved', APPROVED_REASON),
  'epb-soft-ground-screening': approval('approved', APPROVED_REASON),
  'evidence-to-casefile-curator': approval('approved', APPROVED_REASON),
  'excavation-support-staged-review': approval('approved', APPROVED_REASON),
  'foundation-construction-risk-review': approval('approved', APPROVED_REASON),
  'geological-uncertainty-register': approval('approved', APPROVED_REASON),
  'geotechnical-assumptions-register': approval('approved', APPROVED_REASON),
  'ground-improvement-option-screening': approval('approved', APPROVED_REASON),
  'ground-improvement-qa-review': approval('approved', APPROVED_REASON),
  'groundwater-regime-screening': approval('approved', APPROVED_REASON),
  'instrumentation-trigger-and-action-review': approval('approved', APPROVED_REASON),
  'mixed-face-transition-planning': approval('approved', APPROVED_REASON),
  'natm-support-selection': approval('approved', APPROVED_REASON),
  'parameter-sanity-review': approval('approved', APPROVED_REASON),
  'permeation-and-compaction-grouting': approval('approved', APPROVED_REASON),
  'pile-group-and-downdrag': approval('approved', APPROVED_REASON),
  'preload-and-consolidation-control': approval('approved', APPROVED_REASON),
  'preload-vacuum-consolidation': approval('approved', APPROVED_REASON),
  'raft-and-piled-raft-screening': approval('approved', APPROVED_REASON),
  'rainfall-and-drawdown-trigger-review': approval('approved', APPROVED_REASON),
  'retaining-wall-preliminary-design': approval('approved', APPROVED_REASON),
  'rockburst-screening': approval('approved', APPROVED_REASON),
  'segmental-lining-review': approval('approved', APPROVED_REASON),
  'settlement-and-serviceability-strategy': approval('approved', APPROVED_REASON),
  'shallow-foundation-option-screening': approval('approved', APPROVED_REASON),
  'site-investigation-data-quality': approval('approved', APPROVED_REASON),
  'slope-failure-mechanism-screening': approval('approved', APPROVED_REASON),
  'slope-instrumentation-trigger-review': approval('approved', APPROVED_REASON),
  'slope-stability-review-and-remediation': approval('approved', APPROVED_REASON),
  'soft-ground-settlement-observational-control': approval('approved', APPROVED_REASON),
  'soil-parameter-triangulation': approval('approved', APPROVED_REASON),
  'squeezing-ground-response': approval('approved', APPROVED_REASON),
  'standards-and-safety-factor-audit': approval('approved', APPROVED_REASON),
  'temporary-works-observational-control': approval('approved', APPROVED_REASON),
  'tunnel-classification-fusion': approval('approved', APPROVED_REASON),
  'tunnel-engineering-reviewer': approval('prompt_only', PROMPT_ONLY_REASON),
  'vibro-stone-column-screening': approval('approved', APPROVED_REASON),
  'water-ingress-and-grouting': approval('approved', APPROVED_REASON),
};

export function getStrongBetaSkillApproval(name: string): StrongBetaSkillApproval {
  return STRONG_BETA_SKILL_APPROVALS[name] ?? approval('held_back', UNKNOWN_REASON);
}

export function isStrongBetaSkillApproved(name: string): boolean {
  return getStrongBetaSkillApproval(name).status === 'approved';
}

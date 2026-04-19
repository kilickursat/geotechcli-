import { describe, expect, it } from 'vitest';

import {
  getStrongBetaSkillApproval,
  isStrongBetaSkillApproved,
} from '../src/skills/index.js';

describe('Strong-beta skill approval catalog', () => {
  it('marks certified skills as approved', () => {
    expect(isStrongBetaSkillApproved('shallow-foundation-option-screening')).toBe(true);
    expect(getStrongBetaSkillApproval('shallow-foundation-option-screening').status).toBe('approved');
  });

  it('promotes certified EPB tunnel scripts after adapter support lands', () => {
    expect(isStrongBetaSkillApproved('epb-soft-ground-screening')).toBe(true);
    expect(getStrongBetaSkillApproval('epb-soft-ground-screening').status).toBe('approved');
    expect(isStrongBetaSkillApproved('epb-face-support-window')).toBe(true);
    expect(getStrongBetaSkillApproval('epb-face-support-window').status).toBe('approved');
    expect(isStrongBetaSkillApproved('epb-conditioning-clogging')).toBe(true);
    expect(getStrongBetaSkillApproval('epb-conditioning-clogging').status).toBe('approved');
    expect(isStrongBetaSkillApproved('epb-production-and-ring-cycle')).toBe(true);
    expect(getStrongBetaSkillApproval('epb-production-and-ring-cycle').status).toBe('approved');
    expect(isStrongBetaSkillApproved('mixed-face-transition-planning')).toBe(true);
    expect(getStrongBetaSkillApproval('mixed-face-transition-planning').status).toBe('approved');
    expect(isStrongBetaSkillApproved('soft-ground-settlement-observational-control')).toBe(true);
    expect(getStrongBetaSkillApproval('soft-ground-settlement-observational-control').status).toBe('approved');
  });

  it('keeps unknown skills blocked by default', () => {
    expect(isStrongBetaSkillApproved('unknown-skill')).toBe(false);
    expect(getStrongBetaSkillApproval('unknown-skill').status).toBe('held_back');
  });

  it('marks prompt-only bundles as non-executable in phase 1', () => {
    expect(isStrongBetaSkillApproved('tunnel-engineering-reviewer')).toBe(false);
    expect(getStrongBetaSkillApproval('tunnel-engineering-reviewer').status).toBe('prompt_only');
  });
});

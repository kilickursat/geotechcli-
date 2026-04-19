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

  it('holds back the EPB tunnel scripts until adapter support exists', () => {
    expect(isStrongBetaSkillApproved('epb-soft-ground-screening')).toBe(false);
    expect(getStrongBetaSkillApproval('epb-soft-ground-screening').status).toBe('held_back');
  });

  it('marks prompt-only bundles as non-executable in phase 1', () => {
    expect(isStrongBetaSkillApproved('tunnel-engineering-reviewer')).toBe(false);
    expect(getStrongBetaSkillApproval('tunnel-engineering-reviewer').status).toBe('prompt_only');
  });
});

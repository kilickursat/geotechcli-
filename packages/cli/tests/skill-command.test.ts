import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  ensureBundledSkillsInstalled: vi.fn(),
  getInstalledSkill: vi.fn(),
  getStrongBetaSkillApproval: vi.fn(),
  importSkillsFromSource: vi.fn(),
  isStrongBetaSkillApproved: vi.fn(),
  listInstalledSkills: vi.fn(),
  readInstalledSkillGuide: vi.fn(),
  runInstalledSkill: vi.fn(),
  validateInstalledSkill: vi.fn(),
  validateSkillSource: vi.fn(),
}));

vi.mock('@geotechcli/core', () => ({
  ensureBundledSkillsInstalled: coreMocks.ensureBundledSkillsInstalled,
  getInstalledSkill: coreMocks.getInstalledSkill,
  getStrongBetaSkillApproval: coreMocks.getStrongBetaSkillApproval,
  importSkillsFromSource: coreMocks.importSkillsFromSource,
  isStrongBetaSkillApproved: coreMocks.isStrongBetaSkillApproved,
  listInstalledSkills: coreMocks.listInstalledSkills,
  readInstalledSkillGuide: coreMocks.readInstalledSkillGuide,
  runInstalledSkill: coreMocks.runInstalledSkill,
  validateInstalledSkill: coreMocks.validateInstalledSkill,
  validateSkillSource: coreMocks.validateSkillSource,
}));

import { registerSkillCommand } from '../src/commands/skill.js';

const approvedSkill = {
  name: 'shallow-foundation-option-screening',
  displayName: 'Shallow Foundation Option Screening',
  description: 'Screen shallow foundation options',
  runtime: 'python-script',
  installPath: 'skills/shallow-foundation-option-screening',
  skillFile: 'skills/shallow-foundation-option-screening/SKILL.md',
  installedAt: '2026-04-19T00:00:00.000Z',
  entryScript: 'scripts/shallow_foundation_option_screening.py',
  sourceType: 'zip',
  sourceLabel: 'bundled',
  installHash: 'hash',
  scriptCount: 1,
  referenceCount: 0,
  assetCount: 0,
  hasOpenAIYaml: true,
  trusted: true,
};

describe('skill command contract', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    coreMocks.getStrongBetaSkillApproval.mockImplementation((name: string) => ({
      status: name === approvedSkill.name ? 'approved' : 'held_back',
      reason: name === approvedSkill.name ? 'approved test skill' : 'not approved',
      certifiedAt: '2026-04-19',
    }));
    coreMocks.isStrongBetaSkillApproved.mockImplementation((name: string) => name === approvedSkill.name);
    coreMocks.listInstalledSkills.mockReturnValue([approvedSkill]);
    coreMocks.getInstalledSkill.mockReturnValue(approvedSkill);
    coreMocks.readInstalledSkillGuide.mockReturnValue('# Shallow Foundation Option Screening');
    coreMocks.validateInstalledSkill.mockReturnValue({
      sourcePath: approvedSkill.installPath,
      valid: true,
      candidates: [],
      issues: [],
    });
    coreMocks.runInstalledSkill.mockReturnValue({
      skill: approvedSkill,
      success: true,
      exitCode: 0,
      runDir: 'run',
      outputDir: 'output',
      stdout: '',
      stderr: '',
      persistedToProject: false,
      summary: 'Skill completed.',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('bootstraps bundled skills before listing installed skills', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['skill', 'list', '--json'], { from: 'user' });

    expect(coreMocks.ensureBundledSkillsInstalled).toHaveBeenCalled();
    expect(coreMocks.listInstalledSkills).toHaveBeenCalled();
    expect(coreMocks.getStrongBetaSkillApproval).toHaveBeenCalledWith(approvedSkill.name);
  });

  it('validates installed skill names when the target is not a source path', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['skill', 'validate', approvedSkill.name, '--json'], { from: 'user' });

    expect(coreMocks.ensureBundledSkillsInstalled).toHaveBeenCalled();
    expect(coreMocks.validateInstalledSkill).toHaveBeenCalledWith(approvedSkill.name);
    expect(coreMocks.validateSkillSource).not.toHaveBeenCalled();
  });

  it('runs approved deterministic skills', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['skill', 'run', approvedSkill.name, '--input-dir', 'inputs', '--json'], { from: 'user' });

    expect(coreMocks.runInstalledSkill).toHaveBeenCalledWith(approvedSkill.name, {
      inputDir: 'inputs',
      projectId: undefined,
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('blocks held-back skills before execution', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['skill', 'run', 'unknown-skill', '--input-dir', 'inputs'], { from: 'user' });

    expect(coreMocks.runInstalledSkill).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';

import {
  SWARM_PLANNING_ROLES,
  buildSkillAwareSwarmPlan,
  formatSwarmPlanForPrompt,
  type SwarmPlanningSkill,
} from '../src/agents/swarm-planner.js';

const skillCatalog: SwarmPlanningSkill[] = [
  {
    name: 'shallow-foundation-option-screening',
    displayName: 'Shallow Foundation Option Screening',
    description: 'Screen shallow foundation options for bearing and settlement readiness.',
    runtime: 'python-script',
    approvalStatus: 'approved',
  },
  {
    name: 'soil-parameter-triangulation',
    displayName: 'Soil Parameter Triangulation',
    description: 'Triangulate phi, cu, gamma, stiffness, and compressibility by layer.',
    runtime: 'python-script',
    approvalStatus: 'approved',
  },
  {
    name: 'standards-and-safety-factor-audit',
    displayName: 'Standards And Safety Factor Audit',
    description: 'Audit deterministic outputs against standards and safety factor expectations.',
    runtime: 'python-script',
    approvalStatus: 'approved',
  },
  {
    name: 'constructability-risk-register',
    displayName: 'Constructability Risk Register',
    description: 'Build a geotechnical constructability risk register.',
    runtime: 'python-script',
    approvalStatus: 'approved',
  },
  {
    name: 'tunnel-engineering-reviewer',
    displayName: 'Tunnel Engineering Reviewer',
    description: 'Prompt-only universal tunnel engineering reviewer.',
    runtime: 'prompt-only',
    approvalStatus: 'prompt_only',
  },
];

const workspaceContext = {
  workspace: {
    summary: {
      branches: ['foundation', 'settlement'],
      datasetTypes: {
        'borehole-table': 2,
        'lab-test-summary': 1,
      },
    },
    verifier: {
      status: 'needs-review',
      calculationReadiness: {
        workflows: [
          {
            workflow: 'bearing-capacity',
            status: 'ready_with_assumptions',
            standardProfile: 'eurocode7',
            missing: ['foundation width'],
          },
          {
            workflow: 'liquefaction',
            status: 'blocked',
            standardProfile: 'eurocode7',
            missing: ['PGA', 'earthquake magnitude'],
          },
        ],
      },
    },
  },
};

describe('skill-aware swarm planner', () => {
  it('builds the seven role plan and selects approved executable skills only', () => {
    const plan = buildSkillAwareSwarmPlan(
      'screen foundation options and construction risks from the borehole report',
      workspaceContext,
      {
        skillsEnabled: true,
        installedSkills: skillCatalog,
        now: new Date('2026-05-06T00:00:00.000Z'),
      },
    );

    expect(plan.roles.map((role) => role.role)).toEqual([...SWARM_PLANNING_ROLES]);
    expect(plan.skillCatalog.installed).toBe(5);
    expect(plan.skillCatalog.executableApproved).toBe(4);
    expect(plan.skillCatalog.promptOnly).toBe(1);
    expect(plan.workspace.standardProfile).toBe('eurocode7');
    expect(plan.workspace.readyWorkflows).toContain('bearing-capacity');
    expect(plan.workspace.blockedWorkflows).toContain('liquefaction');

    const design = plan.roles.find((role) => role.role === 'DesignEngineer');
    expect(design?.recommendedSkills).toContain('shallow-foundation-option-screening');
    expect(design?.blockedSkills).not.toContain('tunnel-engineering-reviewer');
    expect(design?.toolStrategy).toContain('prepare_fem_analysis_case');

    const risk = plan.roles.find((role) => role.role === 'RiskReviewer');
    expect(risk?.toolStrategy).toContain('validate_fem_analysis_case');

    const standards = plan.roles.find((role) => role.role === 'StandardsChecker');
    expect(standards?.recommendedSkills).toContain('standards-and-safety-factor-audit');
    expect(plan.warnings.join(' ')).toContain('Prompt-only skills are excluded');
  });

  it('keeps skills out of the plan when the session does not opt in', () => {
    const plan = buildSkillAwareSwarmPlan(
      'review slope stability',
      workspaceContext,
      {
        skillsEnabled: false,
        installedSkills: skillCatalog,
      },
    );

    expect(plan.skillCatalog.installed).toBe(5);
    expect(plan.roles.flatMap((role) => role.recommendedSkills)).toEqual([]);
    expect(plan.warnings).toContain('Skill tools are disabled for this session; roles may only use deterministic core tools.');
  });

  it('formats a compact prompt contract for BYOK and hosted models', () => {
    const plan = buildSkillAwareSwarmPlan(
      'run foundation and risk review',
      workspaceContext,
      {
        skillsEnabled: true,
        installedSkills: skillCatalog,
      },
    );
    const prompt = formatSwarmPlanForPrompt(plan);

    expect(prompt).toContain('ROLE-BASED SWARM EXECUTION PLAN');
    expect(prompt).toContain('WorkspaceScout');
    expect(prompt).toContain('DesignEngineer');
    expect(prompt).toContain('approved skills: shallow-foundation-option-screening');
    expect(prompt).toContain('blockedWorkflows=liquefaction');
  });
});

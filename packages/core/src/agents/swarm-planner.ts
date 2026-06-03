import {
  ensureBundledSkillsInstalled,
  getStrongBetaSkillApproval,
  isAgentSkillToolName,
  type InstalledSkill,
  type StrongBetaSkillApprovalStatus,
} from '../skills/index.js';

export const SWARM_PLANNING_ROLES = [
  'WorkspaceScout',
  'DataEngineer',
  'GroundModeler',
  'StandardsChecker',
  'DesignEngineer',
  'RiskReviewer',
  'ReportEngineer',
] as const;

export type SwarmPlanningRole = (typeof SWARM_PLANNING_ROLES)[number];

export type SwarmPlanStatus = 'active' | 'supporting' | 'blocked';

export interface SwarmPlanningSkill {
  name: string;
  displayName: string;
  description: string;
  runtime: InstalledSkill['runtime'];
  approvalStatus: StrongBetaSkillApprovalStatus;
}

export interface SwarmRolePlan {
  role: SwarmPlanningRole;
  status: SwarmPlanStatus;
  legacyAgent: 'orchestrator' | 'interpretation' | 'simulation' | 'reviewer';
  objective: string;
  evidenceInputs: string[];
  toolStrategy: string[];
  recommendedSkills: string[];
  blockedSkills: string[];
  handoff: string;
}

export interface SwarmPlanWorkspaceSnapshot {
  branches: string[];
  datasetTypes: string[];
  verifierStatus?: string;
  standardProfile?: string;
  readyWorkflows: string[];
  blockedWorkflows: string[];
  missingInputs: string[];
}

export interface SwarmExecutionPlan {
  schemaVersion: 'swarm-execution-plan.v1';
  generatedAt: string;
  skillsEnabled: boolean;
  skillCatalog: {
    installed: number;
    executableApproved: number;
    promptOnly: number;
    heldBack: number;
  };
  workspace: SwarmPlanWorkspaceSnapshot;
  roles: SwarmRolePlan[];
  warnings: string[];
}

interface BuildSwarmExecutionPlanOptions {
  skillsEnabled?: boolean;
  installedSkills?: SwarmPlanningSkill[];
  now?: Date;
}

interface RoleSeed {
  role: SwarmPlanningRole;
  status: SwarmPlanStatus;
  legacyAgent: SwarmRolePlan['legacyAgent'];
  objective: string;
  evidenceInputs: string[];
  toolStrategy: string[];
  preferredSkills: string[];
  skillKeywords: string[];
  handoff: string;
}

const ROLE_SEEDS: RoleSeed[] = [
  {
    role: 'WorkspaceScout',
    status: 'active',
    legacyAgent: 'interpretation',
    objective: 'Inventory the workspace, identify high-value evidence, and avoid reading unrelated files.',
    evidenceInputs: ['workspace manifest', 'file classifications', 'dataset types', 'project context'],
    toolStrategy: ['scan_project', 'read_file', 'list_directory'],
    preferredSkills: ['site-investigation-data-quality', 'evidence-to-casefile-curator'],
    skillKeywords: ['data quality', 'casefile', 'case-file', 'site investigation'],
    handoff: 'Prioritized evidence map and gaps for DataEngineer.',
  },
  {
    role: 'DataEngineer',
    status: 'active',
    legacyAgent: 'interpretation',
    objective: 'Normalize boreholes, CPT/SPT, lab data, monitoring tables, reports, and image/PDF evidence into structured records.',
    evidenceInputs: ['DocumentEvidencePacket', 'GroundModel evidence refs', 'tabular schemas', 'page evidence summaries'],
    toolStrategy: ['parse_ags', 'parse_cpt', 'parse_csv', 'analyze_signal_file', 'ingest_geotech_document', 'list_skills', 'describe_skill'],
    preferredSkills: ['site-investigation-data-quality', 'soil-parameter-triangulation', 'borehole-cpt-ground-model'],
    skillKeywords: ['borehole', 'cpt', 'parameter', 'data quality', 'ground model'],
    handoff: 'Structured evidence and unresolved data gaps for GroundModeler.',
  },
  {
    role: 'GroundModeler',
    status: 'active',
    legacyAgent: 'interpretation',
    objective: 'Build or refine an evidence-bound GroundModel with strata, groundwater, coordinates, and rejected observations.',
    evidenceInputs: ['GroundModel', 'borehole/CPT correlations', 'groundwater observations', 'rejected values'],
    toolStrategy: ['scan_project', 'project_save_dataset', 'project_save_parameter', 'project_add_assumption'],
    preferredSkills: ['borehole-cpt-ground-model', 'groundwater-regime-screening', 'geological-uncertainty-register', 'soil-parameter-triangulation'],
    skillKeywords: ['ground model', 'groundwater', 'uncertainty', 'parameter'],
    handoff: 'Evidence-bound strata and assumptions for StandardsChecker and DesignEngineer.',
  },
  {
    role: 'StandardsChecker',
    status: 'active',
    legacyAgent: 'reviewer',
    objective: 'Attach the requested standards/profile assumptions and review gates before design calculations run.',
    evidenceInputs: ['requested standards profile', 'calculation readiness', 'normative references', 'assumption register'],
    toolStrategy: ['query_standards', 'list_skills', 'describe_skill'],
    preferredSkills: ['standards-and-safety-factor-audit', 'design-basis-and-calculation-coverage', 'geotechnical-assumptions-register', 'parameter-sanity-review'],
    skillKeywords: ['standard', 'safety factor', 'design basis', 'assumption', 'sanity'],
    handoff: 'Standards basis, acceptance criteria, and blocked assumptions for DesignEngineer.',
  },
  {
    role: 'DesignEngineer',
    status: 'active',
    legacyAgent: 'simulation',
    objective: 'Run deterministic calculations only when evidence and user-declared inputs make the workflow ready.',
    evidenceInputs: ['calculation input drafts', 'GroundModel parameters', 'loads/geometry/seismic user inputs', 'workflow readiness'],
    toolStrategy: ['calculate_bearing_capacity', 'calculate_consolidation', 'calculate_pile_capacity', 'calculate_liquefaction', 'calculate_slope_stability', 'list_fem_capabilities', 'assess_fem_production_readiness', 'prepare_fem_analysis_case', 'validate_fem_analysis_case', 'run_skill'],
    preferredSkills: [
      'shallow-foundation-option-screening',
      'bearing-capacity-and-settlement-audit',
      'settlement-and-serviceability-strategy',
      'raft-and-piled-raft-screening',
      'pile-group-and-downdrag',
      'retaining-wall-preliminary-design',
      'slope-stability-review-and-remediation',
    ],
    skillKeywords: ['foundation', 'bearing', 'settlement', 'pile', 'slope', 'retaining', 'liquefaction'],
    handoff: 'Calculation outputs, missing user inputs, and assumptions for RiskReviewer.',
  },
  {
    role: 'RiskReviewer',
    status: 'active',
    legacyAgent: 'reviewer',
    objective: 'Challenge constructability, groundwater, geological uncertainty, monitoring triggers, and parameter consistency.',
    evidenceInputs: ['simulation outputs', 'review findings', 'missing inputs', 'constructability constraints'],
    toolStrategy: ['query_standards', 'project_load', 'list_fem_capabilities', 'assess_fem_production_readiness', 'validate_fem_analysis_case', 'describe_skill'],
    preferredSkills: [
      'constructability-risk-register',
      'foundation-construction-risk-review',
      'geological-uncertainty-register',
      'groundwater-regime-screening',
      'instrumentation-trigger-and-action-review',
      'parameter-sanity-review',
    ],
    skillKeywords: ['risk', 'constructability', 'groundwater', 'uncertainty', 'instrumentation', 'trigger', 'parameter'],
    handoff: 'Approved, rejected, or conditional review status for ReportEngineer.',
  },
  {
    role: 'ReportEngineer',
    status: 'supporting',
    legacyAgent: 'orchestrator',
    objective: 'Produce the final evidence-first engineering report with traceable limitations and next actions.',
    evidenceInputs: ['role handoffs', 'case-file artifacts', 'review verdict', 'source evidence'],
    toolStrategy: [],
    preferredSkills: ['evidence-to-casefile-curator', 'design-basis-and-calculation-coverage'],
    skillKeywords: ['casefile', 'report', 'design basis', 'evidence'],
    handoff: 'Final answer with traceability, limitations, and review status.',
  },
];

function filterRoleToolStrategy(seed: RoleSeed, skillsEnabled: boolean): string[] {
  if (seed.legacyAgent === 'orchestrator') {
    return [];
  }
  if (skillsEnabled) {
    return seed.toolStrategy;
  }
  return seed.toolStrategy.filter((toolName) => !isAgentSkillToolName(toolName));
}

export function loadInstalledSkillsForSwarmPlanning(skillsEnabled: boolean): SwarmPlanningSkill[] {
  if (!skillsEnabled) {
    return [];
  }

  try {
    return ensureBundledSkillsInstalled().map((skill) => {
      const approval = getStrongBetaSkillApproval(skill.name);
      return {
        name: skill.name,
        displayName: skill.displayName,
        description: skill.description,
        runtime: skill.runtime,
        approvalStatus: approval.status,
      };
    });
  } catch {
    return [];
  }
}

export function buildSkillAwareSwarmPlan(
  task: string,
  sessionContext: Record<string, unknown> | undefined,
  options: BuildSwarmExecutionPlanOptions = {},
): SwarmExecutionPlan {
  const skillsEnabled = options.skillsEnabled === true;
  const installedSkills = options.installedSkills ?? loadInstalledSkillsForSwarmPlanning(skillsEnabled);
  const workspace = extractWorkspaceSnapshot(sessionContext);
  const contextText = buildContextText(task, sessionContext, workspace);
  const executableSkills = installedSkills.filter(
    (skill) => skill.approvalStatus === 'approved' && skill.runtime !== 'prompt-only',
  );
  const promptOnlySkills = installedSkills.filter((skill) => skill.runtime === 'prompt-only' || skill.approvalStatus === 'prompt_only');
  const heldBackSkills = installedSkills.filter((skill) => !['approved', 'prompt_only'].includes(skill.approvalStatus));

  const roles = ROLE_SEEDS.map((seed) => {
    const recommendedSkills = skillsEnabled
      ? selectRoleSkills(seed, executableSkills, contextText)
      : [];
    const blockedSkills = skillsEnabled
      ? selectRoleSkills(seed, promptOnlySkills, contextText)
      : [];
    const status = inferRoleStatus(seed, workspace, contextText);

    return {
      role: seed.role,
      status,
      legacyAgent: seed.legacyAgent,
      objective: seed.objective,
      evidenceInputs: seed.evidenceInputs,
      toolStrategy: filterRoleToolStrategy(seed, skillsEnabled),
      recommendedSkills,
      blockedSkills,
      handoff: seed.handoff,
    };
  });

  const warnings: string[] = [];
  if (!skillsEnabled) {
    warnings.push('Skill tools are disabled for this session; roles may only use deterministic core tools.');
  } else if (installedSkills.length === 0) {
    warnings.push('Skill tools are enabled, but no installed skill catalog was available to the swarm planner.');
  }
  if (promptOnlySkills.length > 0) {
    warnings.push(`Prompt-only skills are excluded from execution: ${promptOnlySkills.map((skill) => skill.name).join(', ')}.`);
  }
  if (workspace.blockedWorkflows.length > 0) {
    warnings.push(`Blocked calculation workflows require user inputs or better evidence: ${workspace.blockedWorkflows.join(', ')}.`);
  }

  return {
    schemaVersion: 'swarm-execution-plan.v1',
    generatedAt: (options.now ?? new Date()).toISOString(),
    skillsEnabled,
    skillCatalog: {
      installed: installedSkills.length,
      executableApproved: executableSkills.length,
      promptOnly: promptOnlySkills.length,
      heldBack: heldBackSkills.length,
    },
    workspace,
    roles,
    warnings,
  };
}

export function formatSwarmPlanForPrompt(plan: SwarmExecutionPlan): string {
  const roleLines = plan.roles.map((role) => [
    `- ${role.role} (${role.status}, ${role.legacyAgent}): ${role.objective}`,
    `  tools: ${role.toolStrategy.join(', ') || 'none; final synthesis or planning responsibility only'}`,
    role.recommendedSkills.length > 0 ? `  approved skills: ${role.recommendedSkills.join(', ')}` : '  approved skills: none selected',
    role.blockedSkills.length > 0 ? `  excluded skills: ${role.blockedSkills.join(', ')}` : '',
    `  handoff: ${role.handoff}`,
  ].filter(Boolean).join('\n')).join('\n');

  const workspaceLines = [
    `branches=${plan.workspace.branches.join(', ') || 'none'}`,
    `datasetTypes=${plan.workspace.datasetTypes.join(', ') || 'none'}`,
    `verifier=${plan.workspace.verifierStatus ?? 'not-run'}`,
    `standard=${plan.workspace.standardProfile ?? 'not-declared'}`,
    `readyWorkflows=${plan.workspace.readyWorkflows.join(', ') || 'none'}`,
    `blockedWorkflows=${plan.workspace.blockedWorkflows.join(', ') || 'none'}`,
    `missingInputs=${plan.workspace.missingInputs.join(', ') || 'none'}`,
  ].join('; ');

  return [
    'ROLE-BASED SWARM EXECUTION PLAN',
    `skillsEnabled=${plan.skillsEnabled}; installedSkills=${plan.skillCatalog.installed}; executableApproved=${plan.skillCatalog.executableApproved}; promptOnlyExcluded=${plan.skillCatalog.promptOnly}`,
    `workspace: ${workspaceLines}`,
    'Roles:',
    roleLines,
    plan.warnings.length > 0 ? `Warnings:\n${plan.warnings.map((warning) => `- ${warning}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function selectRoleSkills(seed: RoleSeed, skills: SwarmPlanningSkill[], contextText: string): string[] {
  const scored = skills.map((skill) => {
    const haystack = `${skill.name} ${skill.displayName} ${skill.description}`.toLowerCase();
    let score = 0;
    if (seed.preferredSkills.includes(skill.name)) score += 6;
    for (const keyword of seed.skillKeywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (haystack.includes(normalizedKeyword)) score += 2;
      if (haystack.includes(normalizedKeyword) && contextText.includes(normalizedKeyword)) score += 1;
    }
    if (contextText.includes(skill.name.toLowerCase())) score += 4;
    return { skill, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));

  return [...new Set(scored.map((entry) => entry.skill.name))].slice(0, 5);
}

function inferRoleStatus(seed: RoleSeed, workspace: SwarmPlanWorkspaceSnapshot, contextText: string): SwarmPlanStatus {
  if (seed.role === 'DesignEngineer' && workspace.blockedWorkflows.length > 0 && workspace.readyWorkflows.length === 0) {
    return 'blocked';
  }

  if (seed.role === 'ReportEngineer') {
    return 'supporting';
  }

  if (seed.role === 'GroundModeler' && !/(groundmodel|ground model|borehole|cpt|spt|strata|stratum)/i.test(contextText)) {
    return 'supporting';
  }

  return seed.status;
}

function buildContextText(
  task: string,
  sessionContext: Record<string, unknown> | undefined,
  workspace: SwarmPlanWorkspaceSnapshot,
): string {
  return [
    task,
    workspace.branches.join(' '),
    workspace.datasetTypes.join(' '),
    workspace.readyWorkflows.join(' '),
    workspace.blockedWorkflows.join(' '),
    safeStringify(sessionContext).slice(0, 10_000),
  ].join(' ').toLowerCase();
}

function extractWorkspaceSnapshot(sessionContext: Record<string, unknown> | undefined): SwarmPlanWorkspaceSnapshot {
  const workspace = isRecord(sessionContext?.workspace) ? sessionContext.workspace : {};
  const summary = isRecord(workspace.summary) ? workspace.summary : {};
  const verifier = isRecord(workspace.verifier) ? workspace.verifier : {};
  const readiness = isRecord(verifier.calculationReadiness) ? verifier.calculationReadiness : {};
  const workflows = Array.isArray(readiness.workflows) ? readiness.workflows.filter(isRecord) : [];

  return {
    branches: stringArray(summary.branches),
    datasetTypes: Object.keys(isRecord(summary.datasetTypes) ? summary.datasetTypes : {}),
    verifierStatus: typeof verifier.status === 'string' ? verifier.status : undefined,
    standardProfile: extractStandardProfile(workflows, verifier),
    readyWorkflows: workflows
      .filter((workflow) => workflow.status === 'ready' || workflow.status === 'ready_with_assumptions' || workflow.status === 'ready-with-assumptions')
      .map((workflow) => String(workflow.workflow ?? workflow.label ?? 'workflow')),
    blockedWorkflows: workflows
      .filter((workflow) => workflow.status === 'blocked')
      .map((workflow) => String(workflow.workflow ?? workflow.label ?? 'workflow')),
    missingInputs: [...new Set(workflows.flatMap((workflow) => stringArray(workflow.missing).slice(0, 4)))].slice(0, 12),
  };
}

function extractStandardProfile(workflows: Record<string, unknown>[], verifier: Record<string, unknown>): string | undefined {
  const fromWorkflow = workflows.find((workflow) => typeof workflow.standardProfile === 'string')?.standardProfile;
  if (typeof fromWorkflow === 'string') {
    return fromWorkflow;
  }

  return typeof verifier.standardProfile === 'string' ? verifier.standardProfile : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
}

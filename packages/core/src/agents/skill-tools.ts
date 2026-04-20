import { toolRegistry, type ToolResult } from './tools.js';
import {
  ensureBundledSkillsInstalled,
  getInstalledSkill,
  getStrongBetaSkillApproval,
  isStrongBetaSkillApproved,
  listInstalledSkills,
  readInstalledSkillGuide,
  runInstalledSkill,
} from '../skills/index.js';

toolRegistry.register(
  {
    name: 'list_skills',
    description: 'List installed local geotechCLI skills that are available for explicit agent use when skills are enabled.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  (): ToolResult => {
    try {
      ensureBundledSkillsInstalled();
      const skills = listInstalledSkills().map((skill) => ({
        name: skill.name,
        displayName: skill.displayName,
        description: skill.description,
        runtime: skill.runtime,
        approval: getStrongBetaSkillApproval(skill.name),
      }))
        .filter((skill) => skill.approval.status === 'approved');

      return {
        success: true,
        data: { skills },
        summary: skills.length > 0
          ? `${skills.length} installed skill${skills.length === 1 ? '' : 's'} available`
          : 'No installed skills available',
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

toolRegistry.register(
  {
    name: 'describe_skill',
    description: 'Describe one installed local skill, including its runtime and concise guide excerpt.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Installed skill name' },
      },
    },
  },
  (args): ToolResult => {
    try {
      ensureBundledSkillsInstalled();
      const name = String(args.name);
      if (!isStrongBetaSkillApproved(name)) {
        const approval = getStrongBetaSkillApproval(name);
        return {
          success: false,
          data: null,
          summary: '',
          error: `Skill "${name}" is not approved for strong-beta agent use. ${approval.reason}`,
        };
      }

      const skill = getInstalledSkill(name);
      const guide = readInstalledSkillGuide(skill.name);
      const guideExcerpt = guide.split(/\r?\n/).slice(0, 40).join('\n');

      return {
        success: true,
        data: {
          skill: {
            name: skill.name,
            displayName: skill.displayName,
            description: skill.description,
            runtime: skill.runtime,
            entryScript: skill.entryScript,
            hasOpenAIYaml: skill.hasOpenAIYaml,
            approval: getStrongBetaSkillApproval(skill.name),
          },
          guideExcerpt,
        },
        summary: `Skill "${skill.name}" loaded (${skill.runtime})`,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

toolRegistry.register(
  {
    name: 'run_skill',
    description: 'Run one installed deterministic local skill against a prepared input directory. Intended for explicit, controlled agent use when skills are enabled.',
    parameters: {
      type: 'object',
      required: ['name', 'inputDir'],
      properties: {
        name: { type: 'string', description: 'Installed skill name' },
        inputDir: { type: 'string', description: 'Directory containing the skill input contract files' },
        projectId: { type: 'string', description: 'Optional project id for persistence of outputs' },
      },
    },
  },
  (args): ToolResult => {
    try {
      ensureBundledSkillsInstalled();
      const name = String(args.name);
      if (!isStrongBetaSkillApproved(name)) {
        const approval = getStrongBetaSkillApproval(name);
        return {
          success: false,
          data: null,
          summary: '',
          error: `Skill "${name}" is not approved for strong-beta agent use. ${approval.reason}`,
        };
      }

      const run = runInstalledSkill(name, {
        inputDir: String(args.inputDir),
        projectId: typeof args.projectId === 'string' ? args.projectId : undefined,
      });

      return {
        success: run.success,
        data: {
          skill: run.skill.name,
          summary: run.summary,
          outputDir: run.outputDir,
          runDir: run.runDir,
          swarmHandoff: run.swarmHandoff ?? null,
          engineeringReport: run.engineeringReport ?? null,
          artifactMap: run.caseFileArtifactMap ?? null,
          stdout: run.stdout,
          stderr: run.stderr,
        },
        summary: run.summary,
        error: run.success ? undefined : (run.stderr.trim() || `Skill "${run.skill.name}" failed.`),
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

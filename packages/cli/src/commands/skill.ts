import { existsSync } from 'node:fs';

import { Command } from 'commander';
import {
  getInstalledSkill,
  getStrongBetaSkillApproval,
  importSkillsFromSource,
  isStrongBetaSkillApproved,
  listInstalledSkills,
  readInstalledSkillGuide,
  runInstalledSkill,
  validateInstalledSkill,
  validateSkillSource,
} from '@geotechcli/core';

import { dim, error, heading, keyValue, renderJSON, renderTable, success, warn } from '../ui/terminal.js';

function renderValidation(target: string, result: ReturnType<typeof validateInstalledSkill> | ReturnType<typeof validateSkillSource>): void {
  heading(`Skill Validation: ${target}`);
  keyValue('Valid', result.valid ? 'true' : 'false');
  keyValue('Candidates', result.candidates.length);

  if (result.candidates.length > 0) {
    renderTable(
      ['Name', 'Runtime', 'Issues'],
      result.candidates.map((candidate) => [
        candidate.name ?? '(unknown)',
        candidate.runtime ?? '(unknown)',
        candidate.issues.length,
      ]),
    );
  }

  const warnings = result.issues.filter((issue) => issue.severity === 'warning');
  const errors = result.issues.filter((issue) => issue.severity === 'error');

  if (warnings.length > 0) {
    warn(`Warnings (${warnings.length})`);
    for (const issue of warnings) {
      dim(issue.message);
    }
  }

  if (errors.length > 0) {
    error(`Errors (${errors.length})`);
    for (const issue of errors) {
      dim(issue.message);
    }
  }
}

export function registerSkillCommand(program: Command): void {
  const skill = new Command('skill')
    .description('Manage local strong-beta skills');

  skill
    .command('list')
    .description('List installed skills')
    .option('--json', 'Output raw JSON')
    .action((opts) => {
      const skills = listInstalledSkills();
      const skillsWithApproval = skills.map((skill) => ({
        ...skill,
        approval: getStrongBetaSkillApproval(skill.name),
      }));
      if (opts.json) {
        renderJSON({ skills: skillsWithApproval });
        return;
      }

      if (skills.length === 0) {
        warn('No local skills are installed.');
        return;
      }

      const rows = skillsWithApproval.map((entry) => {
        const approval = entry.approval;
        return [
          entry.name,
          approval.status,
          entry.runtime,
          entry.scriptCount,
          entry.referenceCount,
          entry.assetCount,
        ];
      });

      heading('Installed Skills');
      renderTable(
        ['Name', 'Approval', 'Runtime', 'Scripts', 'Refs', 'Assets'],
        rows,
      );
    });

  skill
    .command('import <source>')
    .description('Import one or more skills from a directory or zip bundle')
    .option('--force', 'Replace already installed skills with the same canonical name')
    .option('--json', 'Output raw JSON')
    .action((source: string, opts) => {
      try {
        const result = importSkillsFromSource(source, { force: opts.force === true });
        if (opts.json) {
          renderJSON(result);
          return;
        }

        success(`Imported ${result.imported.length} skill${result.imported.length === 1 ? '' : 's'} from ${source}.`);
        if (result.replaced.length > 0) {
          warn(`Replaced: ${result.replaced.join(', ')}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  skill
    .command('show <name>')
    .description('Show metadata and guide excerpt for one installed skill')
    .option('--json', 'Output raw JSON')
    .action((name: string, opts) => {
      try {
        const installedSkill = getInstalledSkill(name);
        const guide = readInstalledSkillGuide(name);
        const payload = {
          skill: installedSkill,
          approval: getStrongBetaSkillApproval(installedSkill.name),
          guideExcerpt: guide.split(/\r?\n/).slice(0, 60).join('\n'),
        };

        if (opts.json) {
          renderJSON(payload);
          return;
        }

        heading(installedSkill.displayName);
        keyValue('Name', installedSkill.name);
        keyValue('Runtime', installedSkill.runtime);
        keyValue('Approval', getStrongBetaSkillApproval(installedSkill.name).status);
        keyValue('Installed', installedSkill.installedAt);
        keyValue('Source', installedSkill.sourceLabel);
        keyValue('Entry script', installedSkill.entryScript ?? '(prompt-only)');
        console.log('');
        console.log(`  ${installedSkill.description}`);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  skill
    .command('validate <target>')
    .description('Validate an installed skill name or a source path before import')
    .option('--json', 'Output raw JSON')
    .action((target: string, opts) => {
      try {
        const result = existsSync(target) ? validateSkillSource(target) : validateInstalledSkill(target);
        if (opts.json) {
          renderJSON(result);
          return;
        }

        renderValidation(target, result);
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  skill
    .command('run <name>')
    .description('Run one installed deterministic skill against a prepared input directory')
    .requiredOption('--input-dir <dir>', 'Directory containing the skill input contract files')
    .option('--project <id>', 'Persist outputs into a stored project')
    .option('--json', 'Output raw JSON')
    .action((name: string, opts) => {
      try {
        if (!isStrongBetaSkillApproved(name)) {
          const approval = getStrongBetaSkillApproval(name);
          throw new Error(`Skill "${name}" is not approved for strong-beta CLI execution. ${approval.reason}`);
        }

        const result = runInstalledSkill(name, {
          inputDir: opts.inputDir,
          projectId: opts.project,
        });

        if (opts.json) {
          renderJSON(result);
          return;
        }

        if (!result.success) {
          error(result.summary);
          if (result.stderr.trim()) {
            dim(result.stderr.trim());
          }
          process.exitCode = 1;
          return;
        }

        success(result.summary);
        keyValue('Output dir', result.outputDir);
        keyValue('Persisted', result.persistedToProject ? 'true' : 'false');
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  program.addCommand(skill);
}

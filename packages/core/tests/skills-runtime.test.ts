import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProject,
  ensureBundledSkillsInstalled,
  getInstalledSkill,
  importSkillsFromSource,
  listInstalledSkills,
  loadProject,
  runInstalledSkill,
  validateSkillSource,
} from '../src/index.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const deterministicArchive = join(repoRoot, 'skill_archive (1).zip');
const promptOnlyArchive = join(repoRoot, 'skill.zip');
const waveTwoArchive = join(repoRoot, 'geotechcli-geotech-skills-wave-2.zip');
const tunnelWorkspaceArchive = join(repoRoot, 'geotechcli-tunnel-skills-workspace.zip');

describe('Skills runtime', () => {
  let configDir = '';
  let fixtureDir = '';
  let previousConfigDir: string | undefined;
  let previousPythonPath: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.GEOTECHCLI_CONFIG_DIR;
    previousPythonPath = process.env.GEOTECHCLI_SKILLS_PYTHON;
    configDir = mkdtempSync(join(tmpdir(), 'geotechcli-skills-config-'));
    fixtureDir = mkdtempSync(join(process.cwd(), '__skills-fixture-'));
    process.env.GEOTECHCLI_CONFIG_DIR = configDir;
    process.env.GEOTECHCLI_SKILLS_PYTHON = 'python';

    copyFileSync(deterministicArchive, join(fixtureDir, 'skill_archive (1).zip'));
    copyFileSync(promptOnlyArchive, join(fixtureDir, 'skill.zip'));
    copyFileSync(waveTwoArchive, join(fixtureDir, 'geotechcli-geotech-skills-wave-2.zip'));
    copyFileSync(tunnelWorkspaceArchive, join(fixtureDir, 'geotechcli-tunnel-skills-workspace.zip'));
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (previousConfigDir === undefined) {
      delete process.env.GEOTECHCLI_CONFIG_DIR;
    } else {
      process.env.GEOTECHCLI_CONFIG_DIR = previousConfigDir;
    }

    if (previousPythonPath === undefined) {
      delete process.env.GEOTECHCLI_SKILLS_PYTHON;
    } else {
      process.env.GEOTECHCLI_SKILLS_PYTHON = previousPythonPath;
    }

    rmSync(configDir, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('validates and imports a bundled deterministic skill archive', () => {
    const archivePath = join(fixtureDir, 'skill_archive (1).zip');
    const validation = validateSkillSource(archivePath);

    expect(validation.valid).toBe(true);
    expect(validation.candidates[0]?.name).toBe('shallow-foundation-option-screening');

    const imported = importSkillsFromSource(archivePath);
    expect(imported.imported).toHaveLength(1);
    expect(imported.imported[0]?.trusted).toBe(true);

    const installed = listInstalledSkills();
    expect(installed.map((skill) => skill.name)).toContain('shallow-foundation-option-screening');
  });

  it('bootstraps the packaged bundled skill catalog into an empty config directory', () => {
    const outsideCwd = mkdtempSync(join(tmpdir(), 'geotechcli-outside-cwd-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(outsideCwd);

    try {
      const installed = ensureBundledSkillsInstalled();

      expect(installed.length).toBeGreaterThan(40);
      expect(installed.every((skill) => skill.trusted)).toBe(true);
      expect(installed.map((skill) => skill.name)).toContain('shallow-foundation-option-screening');
      expect(installed.map((skill) => skill.name)).toContain('tunnel-engineering-reviewer');
    } finally {
      cwdSpy.mockRestore();
      rmSync(outsideCwd, { recursive: true, force: true });
    }
  }, 60_000);

  it('repairs a partial bundled skill install instead of stopping after the first manifest', () => {
    importSkillsFromSource(join(fixtureDir, 'skill_archive (1).zip'));
    expect(listInstalledSkills()).toHaveLength(1);

    const installed = ensureBundledSkillsInstalled();

    expect(installed.length).toBeGreaterThan(40);
    expect(installed.map((skill) => skill.name)).toContain('shallow-foundation-option-screening');
    expect(installed.map((skill) => skill.name)).toContain('standards-and-safety-factor-audit');
    expect(installed.map((skill) => skill.name)).toContain('tunnel-engineering-reviewer');
  }, 60_000);

  it('validates and imports a wave-2 container archive with nested skill zips', () => {
    const archivePath = join(fixtureDir, 'geotechcli-geotech-skills-wave-2.zip');
    const validation = validateSkillSource(archivePath);

    expect(validation.valid).toBe(true);
    expect(validation.candidates.length).toBe(12);
    expect(validation.candidates.map((candidate) => candidate.name)).toContain('borehole-cpt-ground-model');

    const imported = importSkillsFromSource(archivePath);
    expect(imported.imported.length).toBe(12);
    expect(imported.imported.map((skill) => skill.name)).toContain('site-investigation-data-quality');
  }, 30_000);

  it('runs a bundled deterministic skill and persists outputs into project memory', () => {
    const archivePath = join(fixtureDir, 'skill_archive (1).zip');
    importSkillsFromSource(archivePath);

    const installedSkill = getInstalledSkill('shallow-foundation-option-screening');
    const project = createProject('Skill Runtime Test');
    const result = runInstalledSkill(installedSkill.name, {
      inputDir: join(installedSkill.installPath, 'assets', 'example-inputs'),
      projectId: project.meta.id,
    });

    expect(result.success).toBe(true);
    expect(result.swarmHandoff?.skill).toBe(installedSkill.name);
    expect(result.engineeringReport).toMatch(/Shallow Foundation Option Screening/i);
    expect(result.persistedToProject).toBe(true);

    const persisted = loadProject(project.meta.id);
    expect(persisted.artifacts.some((artifact) => artifact.kind === 'skill-report')).toBe(true);
    expect(persisted.notes.some((note) => note.includes(installedSkill.name))).toBe(true);
    expect(persisted.namedDatasets[`skill:${installedSkill.name}:swarm_handoff`]).toBeDefined();
  });

  it('rejects prompt-only skills as non-executable', () => {
    const archivePath = join(fixtureDir, 'skill.zip');
    importSkillsFromSource(archivePath);

    expect(() =>
      runInstalledSkill('tunnel-engineering-reviewer', {
        inputDir: process.cwd(),
      }),
    ).toThrow(/not an executable python-script skill/i);
  });

  it('blocks deterministic skill runs when the input directory is outside allowed zones', () => {
    const archivePath = join(fixtureDir, 'skill_archive (1).zip');
    const outsideInput = mkdtempSync(join(tmpdir(), 'geotechcli-skill-outside-'));
    importSkillsFromSource(archivePath);

    try {
      expect(() =>
        runInstalledSkill('shallow-foundation-option-screening', {
          inputDir: outsideInput,
        }),
      ).toThrow(/outside allowed directories/i);
    } finally {
      rmSync(outsideInput, { recursive: true, force: true });
    }
  });

  it('runs the tunnel workspace legacy-compatible skills through the compatibility adapter', () => {
    const archivePath = join(fixtureDir, 'geotechcli-tunnel-skills-workspace.zip');
    importSkillsFromSource(archivePath);

    const cases = [
      {
        name: 'epb-soft-ground-screening',
        artifactTypes: ['ground-model', 'analysis-plan', 'results'],
        reportPattern: /EPB Soft-Ground Screening|EPB Soft Ground Screening/i,
        summaryField: 'overall_recommendation',
      },
      {
        name: 'epb-face-support-window',
        artifactTypes: ['results', 'review-checklist', 'acceptance-status'],
        reportPattern: /EPB face support window/i,
        summaryField: 'zone_results',
      },
      {
        name: 'epb-conditioning-clogging',
        artifactTypes: ['assumptions', 'results', 'issues-and-corrections'],
        reportPattern: /EPB conditioning and clogging/i,
        summaryField: 'zone_results',
      },
      {
        name: 'epb-production-and-ring-cycle',
        artifactTypes: ['results', 'final-report', 'review-checklist'],
        reportPattern: /EPB production and ring cycle/i,
        summaryField: 'total_rings',
      },
      {
        name: 'mixed-face-transition-planning',
        artifactTypes: ['analysis-plan', 'results', 'review-checklist', 'issues-and-corrections'],
        reportPattern: /Mixed[- ]face transition/i,
        summaryField: 'zone_results',
      },
      {
        name: 'soft-ground-settlement-observational-control',
        artifactTypes: ['results', 'review-checklist', 'acceptance-status', 'issues-and-corrections'],
        reportPattern: /settlement/i,
        summaryField: 'zone_results',
      },
    ] as const;
    const runDirs = new Set<string>();

    for (const testCase of cases) {
      const installedSkill = getInstalledSkill(testCase.name);
      const result = runInstalledSkill(installedSkill.name, {
        inputDir: join(installedSkill.installPath, 'assets', 'examples'),
      });

      expect(result.success).toBe(true);
      expect(result.swarmHandoff?.skill).toBe(testCase.name);
      expect(result.swarmHandoff?.project_summary).toBeTypeOf('string');
      expect(result.swarmHandoff?.summary).toBeTypeOf('string');
      expect(result.engineeringReport).toMatch(testCase.reportPattern);
      expect(result.swarmHandoff?.[testCase.summaryField]).toBeDefined();
      expect(result.caseFileArtifactMap?.candidate_case_file_artifact_types).toEqual(
        testCase.artifactTypes,
      );
      expect(runDirs.has(result.runDir)).toBe(false);
      runDirs.add(result.runDir);
    }
  }, 30_000);
});

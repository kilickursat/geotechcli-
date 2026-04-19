import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createProject,
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
  });

  afterEach(() => {
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

  it('validates and imports a wave-2 container archive with nested skill zips', () => {
    const archivePath = join(fixtureDir, 'geotechcli-geotech-skills-wave-2.zip');
    const validation = validateSkillSource(archivePath);

    expect(validation.valid).toBe(true);
    expect(validation.candidates.length).toBe(12);
    expect(validation.candidates.map((candidate) => candidate.name)).toContain('borehole-cpt-ground-model');

    const imported = importSkillsFromSource(archivePath);
    expect(imported.imported.length).toBe(12);
    expect(imported.imported.map((skill) => skill.name)).toContain('site-investigation-data-quality');
  });

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
});

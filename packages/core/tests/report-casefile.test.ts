import { describe, expect, it } from 'vitest';
import { buildArtifactDrivenReport, type CaseFileReportInput, type ScenarioArtifact } from '../src/report/casefile.js';

function artifact<T extends ScenarioArtifact['artifactType']>(
  artifactType: T,
  payload: ScenarioArtifact<T>['payload'],
): ScenarioArtifact<T> {
  return {
    artifactId: `${artifactType}-1`,
    projectId: 'p1',
    scenarioId: 'baseline',
    artifactType,
    version: 1,
    title: artifactType,
    payload,
  } as ScenarioArtifact<T>;
}

describe('buildArtifactDrivenReport', () => {
  it('assembles a deterministic report from typed artifacts', () => {
    const input: CaseFileReportInput = {
      projectName: 'Tokyo Soft Clay',
      scenarioId: 'baseline',
      task: 'Compare raft and bored piles.',
      location: 'Tokyo',
      artifacts: {
        'ground-model': artifact('ground-model', {
          summary: 'Soft clay over dense sand.',
          strata: [
            {
              id: 's1',
              fromM: 0,
              toM: 8,
              material: 'Soft clay',
              description: 'High plasticity clay',
              evidenceRefs: [
                { class: 'field', label: 'Borehole log', source: 'Appendix 1' },
              ],
            },
          ],
          groundwater: { detected: true, depthM: 1.5 },
          missingInputs: [],
          blockedInputs: [],
        }),
        assumptions: artifact('assumptions', {
          summary: 'Initial settlement assumptions.',
          assumptions: [
            {
              assumptionId: 'a1',
              category: 'soil-parameter',
              statement: 'Adopt cu = 25 kPa for preliminary checks.',
              impact: 'medium',
              evidenceRefs: [
                { class: 'field', label: 'Borehole log', source: 'Appendix 1' },
              ],
            },
          ],
          criticalAssumptions: ['Adopt cu = 25 kPa for preliminary checks.'],
        }),
        'data-quality': artifact('data-quality', {
          summary: 'Usable with one missing laboratory parameter.',
          parseStatus: 'partial',
          confidence: 78,
          missingInputs: ['oedometer compression index'],
          blockedInputs: [],
          checks: [
            { name: 'CPT alignment', status: 'pass', detail: 'Depths aligned.' },
          ],
        }),
        results: artifact('results', {
          summary: 'Pile option improves settlement margin.',
          analysesRun: ['bearing', 'pile', 'consolidation'],
          records: [
            {
              resultId: 'r1',
              label: 'Pile capacity',
              method: 'alpha',
              toolName: 'calculate_pile_capacity',
              metrics: [
                { name: 'Qa', value: 2200, units: 'kN', status: 'pass' },
              ],
              interpretation: 'Allowable pile capacity supports the column loads.',
              warnings: [],
              evidenceRefs: [
                { class: 'analysis', label: 'Pile capacity run', source: 'GeotechCLI' },
              ],
            },
          ],
        }),
        'option-matrix': artifact('option-matrix', {
          summary: 'Bored piles rank first for serviceability.',
          decisionBasis: ['Settlement control governs.'],
          preferredOptionId: 'opt-piles',
          rows: [
            {
              optionId: 'opt-piles',
              label: 'Bored piles',
              category: 'foundation',
              safety: 'strong',
              settlement: 'low',
              constructability: 'moderate',
              cost: 'high',
              scheduleRisk: 'medium',
              rank: 1,
              rationale: 'Best settlement performance.',
            },
          ],
        }),
        'review-checklist': artifact('review-checklist', {
          summary: 'Checks completed.',
          items: [
            {
              itemId: 'c1',
              category: 'safety',
              question: 'Are safety margins acceptable?',
              status: 'pass',
              detail: 'Preliminary margins acceptable.',
            },
          ],
        }),
        'acceptance-status': artifact('acceptance-status', {
          summary: 'Conditionally acceptable pending lab confirmation.',
          verdict: 'CONDITIONAL',
          confidence: 82,
          reasons: ['Compression index still assumed.'],
        }),
        'issues-and-corrections': artifact('issues-and-corrections', {
          summary: 'One follow-up item remains.',
          issues: [
            {
              issueId: 'i1',
              severity: 'major',
              issue: 'Compression index is assumed.',
              correction: 'Add oedometer data before final issue.',
              affectedArtifacts: ['results'],
            },
          ],
        }),
        'final-report': artifact('final-report', {
          summary: 'Final recommendation is bored piles.',
          markdown: '## Final design summary\nBored piles are preferred.',
          recommendation: 'Proceed with bored piles.',
          evidenceTable: [
            { class: 'lab', label: 'CPT results', source: 'Appendix 2' },
            { class: 'field', label: 'Borehole log', source: 'Appendix 1' },
          ],
        }),
      },
    };

    const report = buildArtifactDrivenReport(input);

    expect(report.title).toContain('Tokyo Soft Clay');
    expect(report.fullMarkdown).toContain('Bored piles');
    expect(report.fullMarkdown).toContain('Compression index is assumed.');
    expect(report.fullMarkdown).toContain('### Evidence records');
    expect(report.fullMarkdown).toContain('| ground-model | field | Borehole log | Appendix 1 |');
    expect(report.fullMarkdown).toContain('### Evidence table');
    expect(report.fullMarkdown).toContain('| field | Borehole log | Appendix 1 |');
    expect(report.fullMarkdown.indexOf('| field | Borehole log | Appendix 1 |'))
      .toBeLessThan(report.fullMarkdown.indexOf('| lab | CPT results | Appendix 2 |'));
    expect(report.fullMarkdown).toContain('## Missing Artifacts');
    expect(report.metadata.missingArtifactTypes).toContain('analysis-plan');
    expect(report.metadata.artifactTypes).toContain('ground-model');
    expect(report.metadata.artifactTypes).toContain('final-report');
  });

  it('keeps output stable when artifact insertion order changes', () => {
    const first = buildArtifactDrivenReport({
      projectName: 'Stable Order',
      scenarioId: 'baseline',
      artifacts: {
        'ground-model': artifact('ground-model', {
          summary: 'Ground model summary.',
          strata: [],
          missingInputs: [],
          blockedInputs: [],
        }),
        results: artifact('results', {
          summary: 'Results summary.',
          analysesRun: [],
          records: [],
        }),
      },
    });

    const second = buildArtifactDrivenReport({
      projectName: 'Stable Order',
      scenarioId: 'baseline',
      artifacts: {
        results: artifact('results', {
          summary: 'Results summary.',
          analysesRun: [],
          records: [],
        }),
        'ground-model': artifact('ground-model', {
          summary: 'Ground model summary.',
          strata: [],
          missingInputs: [],
          blockedInputs: [],
        }),
      },
    });

    expect(second.fullMarkdown).toBe(first.fullMarkdown);
    expect(second.sections.map((section) => section.title)).toEqual(first.sections.map((section) => section.title));
  });

  it('renders placeholder content for missing artifact types', () => {
    const report = buildArtifactDrivenReport({
      projectName: 'Sparse Case File',
      scenarioId: 'baseline',
      artifacts: {
        results: artifact('results', {
          summary: 'Only the results artifact is present.',
          analysesRun: [],
          records: [],
        }),
      },
    });

    expect(report.fullMarkdown).toContain('No ground-model artifact was available.');
    expect(report.fullMarkdown).toContain('No analysis-plan artifact was available.');
    expect(report.fullMarkdown).toContain('- ground-model');
    expect(report.fullMarkdown).toContain('- final-report');
  });

  it('sorts evidence rows and evidence tables deterministically', () => {
    const report = buildArtifactDrivenReport({
      projectName: 'Evidence Order',
      scenarioId: 'baseline',
      artifacts: {
        results: artifact('results', {
          summary: 'Results summary.',
          analysesRun: [],
          records: [
            {
              label: 'Result A',
              evidenceRefs: [
                { class: 'analysis', label: 'Zeta note', source: 'Source Z' },
                { class: 'analysis', label: 'Alpha note', source: 'Source A' },
              ],
            },
          ],
        }),
        'final-report': artifact('final-report', {
          summary: 'Evidence summary.',
          markdown: '## Evidence summary',
          evidenceTable: [
            { class: 'lab', label: 'Zulu', source: 'Source Z' },
            { class: 'field', label: 'Alpha', source: 'Source A' },
          ],
        }),
      },
    });

    const evidenceSection = report.fullMarkdown.slice(
      report.fullMarkdown.indexOf('### Evidence records'),
      report.fullMarkdown.indexOf('## Option Matrix'),
    );
    expect(evidenceSection.indexOf('| results | analysis | Alpha note | Source A |'))
      .toBeLessThan(evidenceSection.indexOf('| results | analysis | Zeta note | Source Z |'));

    const finalSection = report.fullMarkdown.slice(report.fullMarkdown.indexOf('## Final Report'));
    expect(finalSection.indexOf('| field | Alpha | Source A |'))
      .toBeLessThan(finalSection.indexOf('| lab | Zulu | Source Z |'));
  });
});

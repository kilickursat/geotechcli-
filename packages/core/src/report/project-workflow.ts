import type { GeneratedReport } from './index.js';
import type { ProjectWorkflowRun } from '../workspace/project-workflow-executor.js';

export function buildProjectWorkflowReport(run: ProjectWorkflowRun): GeneratedReport {
  const started = Date.now();
  const sections = [
    {
      title: 'Executive Summary',
      content: run.summary.map((item) => `- ${item}`).join('\n'),
    },
    {
      title: 'Findings',
      content: run.findings.length
        ? run.findings.map((finding) => [
            `### ${finding.title}`,
            '',
            `- Severity: ${finding.severity}`,
            `- Detail: ${finding.detail}`,
            finding.source ? `- Source: ${finding.source}` : undefined,
            finding.evidenceIds.length ? `- Evidence: ${finding.evidenceIds.join(', ')}` : '- Evidence: not bound',
            finding.recommendation ? `- Recommendation: ${finding.recommendation}` : undefined,
          ].filter(Boolean).join('\n')).join('\n\n')
        : 'No findings were recorded.',
    },
    {
      title: 'Actions',
      content: run.actions.length
        ? [
            '| Action | Status | Command | Missing | Recommendation |',
            '| --- | --- | --- | --- | --- |',
            ...run.actions.map((action) => `| ${escapeTable(action.label)} | ${action.status} | ${escapeTable(action.command ?? '-')} | ${escapeTable(action.missing.join(', ') || '-')} | ${escapeTable(action.recommendation)} |`),
          ].join('\n')
        : 'No downstream actions were prepared.',
    },
    {
      title: 'Visualization Specs',
      content: run.charts.length
        ? run.charts.map((chart) => `- ${chart.title}: ${chart.series.reduce((sum, series) => sum + series.points.length, 0)} point(s), ${chart.series.length} series.`).join('\n')
        : 'No visualization chart specs were prepared.',
    },
    {
      title: 'Audit',
      content: [
        `- Schema: ${run.schemaVersion}`,
        `- Run ID: ${run.runId}`,
        `- Task: ${run.task}`,
        `- Status: ${run.status}`,
        `- Provider neutral: ${run.providerContract.providerNeutral}`,
        `- Model calls: ${run.modelCalls.length}`,
        `- Tool calls: ${run.toolCalls.length}`,
      ].join('\n'),
    },
  ];
  const fullMarkdown = [
    `# Project Workflow Report: ${run.task}`,
    '',
    `Generated: ${run.generatedAt}`,
    `Workspace: ${run.workspace.rootPath}`,
    `Status: ${run.status}`,
    '',
    ...sections.map((section) => [`## ${section.title}`, '', section.content].join('\n')),
    '',
    '> This deterministic project workflow supports engineering review. It does not replace qualified professional judgment or final design checks.',
  ].join('\n\n');

  return {
    title: `Project Workflow Report: ${run.task}`,
    sections,
    fullMarkdown,
    latencyMs: Date.now() - started,
  };
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

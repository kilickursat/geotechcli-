import type { ProjectManifest, WorkspaceFileEntry } from './manifest.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function percent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function renderMetric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderFileRows(files: WorkspaceFileEntry[]): string {
  return files.map((file) => {
    const schema = file.schemas?.[0];
    const schemaText = schema
      ? `${schema.datasetType}${schema.sheetName ? ` / ${schema.sheetName}` : ''}`
      : file.classification.datasetType;
    return `<tr>
      <td><code>${escapeHtml(file.path)}</code></td>
      <td>${escapeHtml(file.classification.kind)}</td>
      <td>${escapeHtml(schemaText)}</td>
      <td>${escapeHtml(file.classification.branches.join(', ') || '-')}</td>
      <td>${escapeHtml(percent(file.classification.confidence))}</td>
      <td>${escapeHtml(formatBytes(file.sizeBytes))}</td>
    </tr>`;
  }).join('\n');
}

function renderSchemaRows(files: WorkspaceFileEntry[]): string {
  const rows = files.flatMap((file) => (file.schemas ?? []).map((schema) => ({
    file,
    schema,
  })));

  if (rows.length === 0) {
    return '<p class="empty">No tabular schemas were sampled in this workspace.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>Source</th>
        <th>Schema</th>
        <th>Rows</th>
        <th>Detected Columns</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(({ file, schema }) => {
        const detected = [
          ...schema.detected.depthColumns.map((column) => `depth:${column}`),
          ...schema.detected.coordinateColumns.map((column) => `coord:${column}`),
          ...schema.detected.sptColumns.map((column) => `SPT:${column}`),
          ...schema.detected.cptColumns.map((column) => `CPT:${column}`),
          ...schema.detected.labColumns.map((column) => `lab:${column}`),
          ...schema.detected.monitoringColumns.map((column) => `monitor:${column}`),
        ].slice(0, 8);
        return `<tr>
          <td><code>${escapeHtml(file.path)}${schema.sheetName ? `#${escapeHtml(schema.sheetName)}` : ''}</code></td>
          <td>${escapeHtml(schema.datasetType)} (${escapeHtml(percent(schema.confidence))})</td>
          <td>${escapeHtml(schema.sampledRowCount)}</td>
          <td>${escapeHtml(detected.join(', ') || 'generic numeric/text table')}</td>
        </tr>`;
      }).join('\n')}
    </tbody>
  </table>`;
}

function renderGroundModelSection(manifest: ProjectManifest): string {
  const model = manifest.groundModel;
  if (!model) {
    return '<p class="empty">GroundModel was not generated for this analysis.</p>';
  }

  const boreholeRows = model.boreholes.slice(0, 40).map((borehole) => `<tr>
    <td><code>${escapeHtml(borehole.id)}</code></td>
    <td>${escapeHtml(borehole.coordinates
      ? borehole.coordinates.latitude != null
        ? `${borehole.coordinates.latitude}, ${borehole.coordinates.longitude}`
        : `${borehole.coordinates.easting}, ${borehole.coordinates.northing}`
      : '-')}</td>
    <td>${escapeHtml(borehole.sptTests.length)}</td>
    <td>${escapeHtml(borehole.strata.length)}</td>
    <td>${escapeHtml(borehole.groundwater.length)}</td>
    <td>${escapeHtml(percent(borehole.confidence))}</td>
  </tr>`).join('\n');

  const parameterRows = model.parameters.slice(0, 40).map((parameter) => `<tr>
    <td>${escapeHtml(parameter.name)}</td>
    <td>${escapeHtml(parameter.value)}${parameter.unit ? ` ${escapeHtml(parameter.unit)}` : ''}</td>
    <td>${escapeHtml(parameter.boreholeId ?? '-')}</td>
    <td>${escapeHtml(parameter.sampleId ?? '-')}</td>
    <td>${escapeHtml(parameter.depth ?? '-')}</td>
    <td>${escapeHtml(parameter.evidenceIds.join(', '))}</td>
  </tr>`).join('\n');

  return `
    <div class="metrics">
      ${renderMetric('Boreholes', model.stats.boreholes)}
      ${renderMetric('SPT tests', model.stats.sptTests)}
      ${renderMetric('Lab tests', model.stats.labTests)}
      ${renderMetric('Parameters', model.stats.parameters)}
      ${renderMetric('Evidence refs', model.stats.evidenceRefs)}
      ${renderMetric('Rejected', model.stats.rejectedObservations)}
    </div>
    <div class="subgrid">
      <div>
        <h3>Boreholes</h3>
        ${boreholeRows
          ? `<table><thead><tr><th>ID</th><th>Location</th><th>SPT</th><th>Strata</th><th>GWL</th><th>Confidence</th></tr></thead><tbody>${boreholeRows}</tbody></table>`
          : '<p class="empty">No boreholes were bound to evidence yet.</p>'}
      </div>
      <div>
        <h3>Parameters</h3>
        ${parameterRows
          ? `<table><thead><tr><th>Name</th><th>Value</th><th>BH</th><th>Sample</th><th>Depth</th><th>Evidence</th></tr></thead><tbody>${parameterRows}</tbody></table>`
          : '<p class="empty">No lab or design parameters were bound to evidence yet.</p>'}
      </div>
    </div>
  `;
}

function renderVerifierSection(manifest: ProjectManifest): string {
  const verifier = manifest.verifier;
  if (!verifier) {
    return '<p class="empty">Verifier was not run for this analysis.</p>';
  }

  if (verifier.findings.length === 0) {
    return '<p class="empty">No verifier findings. Evidence-bound data passed the current deterministic checks.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Code</th>
        <th>Finding</th>
        <th>Evidence</th>
        <th>Recommendation</th>
      </tr>
    </thead>
    <tbody>
      ${verifier.findings.map((finding) => `<tr>
        <td><span class="badge ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
        <td><code>${escapeHtml(finding.code)}</code></td>
        <td>${escapeHtml(finding.message)}</td>
        <td>${escapeHtml(finding.evidenceIds.join(', ') || '-')}</td>
        <td>${escapeHtml(finding.recommendation ?? '-')}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function renderEvidenceRows(manifest: ProjectManifest): string {
  const evidence = manifest.groundModel?.evidence ?? [];
  if (evidence.length === 0) {
    return '<p class="empty">No evidence references were generated.</p>';
  }

  return `<table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Source</th>
        <th>Location</th>
        <th>Value</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>
      ${evidence.slice(0, 80).map((ref) => `<tr>
        <td><code>${escapeHtml(ref.id)}</code></td>
        <td><code>${escapeHtml(ref.sourcePath)}</code></td>
        <td>${escapeHtml([
          ref.location.sheetName ? `sheet ${ref.location.sheetName}` : '',
          ref.location.rowNumber ? `row ${ref.location.rowNumber}` : '',
          ref.location.columnName ? `col ${ref.location.columnName}` : '',
        ].filter(Boolean).join(', ') || '-')}</td>
        <td>${escapeHtml(ref.normalizedValue ?? ref.rawValue ?? '-')}</td>
        <td>${escapeHtml(percent(ref.confidence))}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

export function renderWorkspaceManifestAsHtml(manifest: ProjectManifest): string {
  const title = 'geotechCLI Workspace Dossier';
  const fileRows = renderFileRows(manifest.files);
  const warnings = manifest.warnings.slice(0, 20);
  const verifier = manifest.verifier;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17201d;
      --muted: #64706b;
      --line: #d8dfdc;
      --soft: #f3f6f4;
      --accent: #006b5a;
      --warning: #8a4b00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: #fbfcfb;
      line-height: 1.5;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 40px 22px 64px;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 26px;
      margin-bottom: 28px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 6px 0 8px;
      font-size: clamp(30px, 5vw, 56px);
      line-height: 1.02;
      letter-spacing: 0;
    }
    .subhead {
      max-width: 840px;
      color: var(--muted);
      font-size: 17px;
    }
    section {
      border-top: 1px solid var(--line);
      padding: 28px 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 20px;
      letter-spacing: 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
    }
    .metric {
      background: white;
      padding: 16px;
      min-height: 86px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 28px;
      line-height: 1.1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid var(--line);
      overflow-wrap: anywhere;
    }
    th, td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      color: var(--muted);
      background: var(--soft);
      font-size: 12px;
      font-weight: 700;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      color: #183d36;
    }
    .list {
      margin: 0;
      padding-left: 18px;
      color: var(--ink);
    }
    .list li { margin: 8px 0; }
    .warning { color: var(--warning); }
    .empty { color: var(--muted); }
    h3 {
      margin: 22px 0 10px;
      font-size: 15px;
    }
    .subgrid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 22px;
      margin-top: 20px;
    }
    .badge {
      display: inline-block;
      min-width: 68px;
      padding: 3px 7px;
      border: 1px solid var(--line);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.blocking { color: #8c1d18; background: #fff0ee; }
    .badge.review { color: #7b4a00; background: #fff7e8; }
    .badge.info { color: #165766; background: #edf8fa; }
    @media (max-width: 720px) {
      main { padding: 26px 14px 46px; }
      table { display: block; overflow-x: auto; }
      th, td { white-space: nowrap; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">geotechCLI analyze</div>
      <h1>Workspace Dossier</h1>
      <p class="subhead">${escapeHtml(manifest.rootPath)}</p>
    </header>

    <section>
      <h2>Overview</h2>
      <div class="metrics">
        ${renderMetric('Files', manifest.summary.totalFiles)}
        ${renderMetric('Supported', manifest.summary.supportedFiles)}
        ${renderMetric('Tabular', manifest.summary.tabularFiles)}
        ${renderMetric('PDFs', manifest.summary.pdfFiles)}
        ${renderMetric('Branches', manifest.summary.branches.length || '-')}
        ${renderMetric('Skipped', manifest.summary.skippedFiles)}
        ${renderMetric('Verifier', verifier?.status ?? '-')}
      </div>
    </section>

    <section>
      <h2>Detected Branches</h2>
      <p>${escapeHtml(manifest.summary.branches.join(', ') || 'No branch-specific evidence detected yet.')}</p>
    </section>

    <section>
      <h2>Recommended Next Steps</h2>
      <ul class="list">
        ${manifest.summary.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
      </ul>
    </section>

    <section>
      <h2>File Manifest</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Kind</th>
            <th>Dataset</th>
            <th>Branches</th>
            <th>Confidence</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>${fileRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Tabular Schemas</h2>
      ${renderSchemaRows(manifest.files)}
    </section>

    <section>
      <h2>GroundModel</h2>
      ${renderGroundModelSection(manifest)}
    </section>

    <section>
      <h2>Verifier Findings</h2>
      ${renderVerifierSection(manifest)}
    </section>

    <section>
      <h2>Evidence Table</h2>
      ${renderEvidenceRows(manifest)}
    </section>

    <section>
      <h2>Warnings</h2>
      ${warnings.length > 0
        ? `<ul class="list warning">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('\n')}</ul>`
        : '<p class="empty">No manifest warnings.</p>'}
    </section>
  </main>
</body>
</html>`;
}

import { GEOTECHCLI_VERSION } from '../meta/index.js';
import type {
  IngestDossier,
  IngestDossierBoreholeProfile,
  IngestDossierBoreholeProfileLayer,
  IngestDossierTable,
  IngestDossierTone,
} from './ingest-dossier.js';

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function idFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'section';
}

function toneClass(tone: IngestDossierTone | undefined): string {
  switch (tone) {
    case 'good':
      return 'tone-good';
    case 'warning':
      return 'tone-warning';
    case 'danger':
      return 'tone-danger';
    case 'accent':
      return 'tone-accent';
    default:
      return 'tone-neutral';
  }
}

function toneColor(tone: IngestDossierTone | undefined): string {
  switch (tone) {
    case 'good':
      return '#d9f5e8';
    case 'warning':
      return '#f7e4bd';
    case 'danger':
      return '#f9d3cf';
    case 'accent':
      return '#d8e9f7';
    default:
      return '#e8edf3';
  }
}

function parsePercent(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) {
    return null;
  }
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
}

function isOperationalAuditTable(title: string): boolean {
  return title === 'Page audit matrix' || title === 'Segment execution';
}

function sourceModeLabel(sourceHint?: string): string {
  switch (sourceHint) {
    case 'native-text':
    case 'pdfjs-text':
      return 'Text extraction used';
    case 'local-ocr':
    case 'glm-ocr':
      return 'Layout/OCR extraction used';
    case 'vision-ocr':
    case 'vision-visual':
      return 'Visual extraction used';
    default:
      return 'Extraction evidence retained';
  }
}

function renderMetric(metric: IngestDossier['metrics'][number]): string {
  const percent = parsePercent(metric.value);
  return `
    <article class="metric-card ${toneClass(metric.tone)}">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      ${percent != null ? `
        <span class="meter" aria-label="${escapeHtml(metric.label)} ${escapeHtml(metric.value)}">
          <span style="width: ${escapeHtml(percent)}%"></span>
        </span>
      ` : ''}
      ${metric.detail ? `<small>${escapeHtml(metric.detail)}</small>` : ''}
    </article>
  `;
}

function renderTable(table: IngestDossierTable, className = 'data-section'): string {
  const tableId = escapeHtml(idFromTitle(table.title));
  const body = table.rows.length === 0
    ? `<div class="empty-state">${escapeHtml(table.emptyState ?? 'No data available.')}</div>`
    : `
      <div class="table-shell">
        <table>
          <thead>
            <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

  return `
    <section class="${className}" id="${tableId}">
      <div class="section-heading">
        <h2>${escapeHtml(table.title)}</h2>
        ${table.description ? `<p>${escapeHtml(table.description)}</p>` : ''}
      </div>
      ${body}
    </section>
  `;
}

function renderTrustTable(dossier: IngestDossier): string {
  const rows = dossier.trustItems.length === 0
    ? '<tr><td colspan="6">No trust-layer rows were retained.</td></tr>'
    : dossier.trustItems.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.item)}</strong></td>
        <td>${escapeHtml(item.value)}</td>
        <td>${escapeHtml(item.sourcePage)}</td>
        <td><span class="status-pill ${toneClass(item.tone)}">${escapeHtml(item.confidence)}</span></td>
        <td>${escapeHtml(item.review)}</td>
        <td>${escapeHtml(item.evidence)}</td>
      </tr>
    `).join('');

  return `
    <section class="data-section" id="parameters">
      <div class="section-heading">
        <h2>Engineering Parameters</h2>
        <p>Evidence-first review table. Every retained or missing item is shown with source, confidence, review posture, and an evidence snippet.</p>
      </div>
      <div class="table-shell trust-table">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Value</th>
              <th>Source page</th>
              <th>Confidence</th>
              <th>Needs review?</th>
              <th>Evidence snippet</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderBoreholeProfile(profile: IngestDossierBoreholeProfile | undefined): string {
  if (!profile || profile.columns.length === 0 || profile.maxDepth <= 0) {
    return `
      <section class="data-section" id="boreholes">
        <div class="section-heading">
          <h2>Borehole Stratigraphy Visualization</h2>
          <p>No scaled borehole profile could be built from the retained evidence.</p>
        </div>
        <div class="empty-state">Borehole IDs, layer depths, or material intervals were not available in structured form.</div>
      </section>
    `;
  }

  const plotTop = 44;
  const plotHeight = 420;
  const columnWidth = 132;
  const gap = 42;
  const axisWidth = 78;
  const width = axisWidth + profile.columns.length * columnWidth + Math.max(0, profile.columns.length - 1) * gap + 42;
  const height = plotTop + plotHeight + 74;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((profile.maxDepth * index / 5).toFixed(2)));
  const layerRect = (layer: IngestDossierBoreholeProfileLayer, columnIndex: number): string => {
    const x = axisWidth + columnIndex * (columnWidth + gap);
    const y = plotTop + (Math.max(0, layer.depthFrom) / profile.maxDepth) * plotHeight;
    const rectHeight = Math.max(18, ((Math.min(profile.maxDepth, layer.depthTo) - Math.max(0, layer.depthFrom)) / profile.maxDepth) * plotHeight);
    const midY = y + rectHeight / 2;
    return `
      <rect x="${x}" y="${y.toFixed(2)}" width="${columnWidth}" height="${rectHeight.toFixed(2)}" rx="8"
        fill="${toneColor(layer.tone)}" stroke="#7a8aa0" stroke-width="1.2" ${layer.uncertain ? 'stroke-dasharray="6 5"' : ''} />
      <text x="${x + 10}" y="${midY.toFixed(2)}" class="profile-label">${escapeHtml(layer.label)}</text>
      <text x="${x + 10}" y="${(midY + 16).toFixed(2)}" class="profile-small">${escapeHtml(layer.description)}</text>
    `;
  };

  return `
    <section class="data-section" id="boreholes">
      <div class="section-heading">
        <h2>${escapeHtml(profile.title)}</h2>
        <p>Depth-scaled borehole columns with colored stratigraphy blocks. Dashed boundaries indicate missing or uncertain intervals that need source-page verification.</p>
      </div>
      <div class="profile-shell">
        <svg class="borehole-profile" viewBox="0 0 ${width} ${height}" role="img" aria-label="Borehole stratigraphy profile">
          <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#ffffff" />
          ${ticks.map((tick) => {
            const y = plotTop + (tick / profile.maxDepth) * plotHeight;
            return `
              <line x1="48" y1="${y.toFixed(2)}" x2="${width - 24}" y2="${y.toFixed(2)}" stroke="#d8e0ea" stroke-width="1" />
              <text x="8" y="${(y + 4).toFixed(2)}" class="profile-axis">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))} ${escapeHtml(profile.depthUnit)}</text>
            `;
          }).join('')}
          ${profile.columns.map((column, columnIndex) => {
            const x = axisWidth + columnIndex * (columnWidth + gap);
            const waterY = column.waterTableDepth != null
              ? plotTop + (column.waterTableDepth / profile.maxDepth) * plotHeight
              : null;
            return `
              <text x="${x}" y="24" class="profile-title">${escapeHtml(column.boreholeId)}</text>
              ${column.layers.map((layer) => layerRect(layer, columnIndex)).join('')}
              ${waterY != null ? `
                <line x1="${x - 8}" y1="${waterY.toFixed(2)}" x2="${x + columnWidth + 8}" y2="${waterY.toFixed(2)}" stroke="#0b4f8a" stroke-width="2" />
                <text x="${x + 8}" y="${(waterY - 6).toFixed(2)}" class="profile-water">Groundwater</text>
              ` : ''}
              <text x="${x}" y="${height - 24}" class="profile-small">TD ${escapeHtml(column.totalDepth != null ? `${column.totalDepth.toFixed(2)} m` : 'unavailable')}</text>
            `;
          }).join('')}
        </svg>
      </div>
      ${profile.notes.length > 0 ? `<ul class="profile-notes">${profile.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}
    </section>
  `;
}

function renderFindingGroups(dossier: IngestDossier): string {
  if (dossier.findings.length === 0) {
    return `
      <section class="data-section" id="risks">
        <div class="section-heading">
          <h2>Risks and Limitations</h2>
          <p>No blocking review finding was retained. Source verification is still recommended before engineering reuse.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="data-section" id="risks">
      <div class="section-heading">
        <h2>Risks and Limitations</h2>
        <p>Review gates and limitations are grouped for engineering decision-making, not as raw extraction logs.</p>
      </div>
      <div class="card-grid">
        ${dossier.findings.map((group) => `
          <article class="insight-card ${toneClass(group.tone)}">
            <h3>${escapeHtml(group.label)}</h3>
            <ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderSourceEvidence(dossier: IngestDossier): string {
  return `
    <section class="data-section" id="source-evidence">
      <div class="section-heading">
        <h2>Source Evidence</h2>
        <p>Page-level status with product-facing extraction posture. Technical model stages are kept in the processing audit below.</p>
      </div>
      <div class="evidence-grid">
        ${dossier.pageCards.map((card) => `
          <article class="evidence-card ${toneClass(card.tone)}">
            <div>
              <strong>${escapeHtml(card.pageLabel)}</strong>
              <span>${escapeHtml(card.parseStatus)} | ${escapeHtml(`${card.confidence}%`)}</span>
            </div>
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(sourceModeLabel(card.sourceHint))}</p>
            ${card.highlights.length > 0 ? `<ul>${card.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No strong structured highlight was retained for this page.</p>'}
            ${card.warnings.length > 0 ? `<small>Human verification recommended: ${escapeHtml(String(card.warnings.length))} retained warning(s).</small>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderProcessingAudit(dossier: IngestDossier, auditTables: IngestDossierTable[]): string {
  const counts = dossier.pageCards.reduce(
    (acc, page) => {
      if (page.parseStatus === 'parsed') acc.parsed += 1;
      else if (page.parseStatus === 'partial') acc.partial += 1;
      else acc.failed += 1;
      return acc;
    },
    { parsed: 0, partial: 0, failed: 0 },
  );

  return `
    <details class="audit-drawer" id="processing-audit">
      <summary>
        <span>
          <strong>Processing Audit</strong>
          <small>Model stages, page audit matrix, warnings, and operational details</small>
        </span>
        <span class="disclosure-hint">Show audit</span>
      </summary>
      <section class="audit-content">
        <div class="outcome-strip" aria-label="Page extraction outcomes">
          ${dossier.pageCards.map((card) => `
            <span class="outcome-cell ${toneClass(card.tone)}" title="${escapeHtml(`${card.pageLabel}: ${card.parseStatus}, ${card.confidence}% confidence`)}">${escapeHtml(card.pageLabel.replace(/^Page\s+/i, ''))}</span>
          `).join('')}
        </div>
        <div class="legend-row">
          <span><strong>${escapeHtml(counts.parsed)}</strong> parsed</span>
          <span><strong>${escapeHtml(counts.partial)}</strong> partial</span>
          <span><strong>${escapeHtml(counts.failed)}</strong> failed</span>
        </div>
        ${auditTables.map((table) => renderTable(table, 'audit-table')).join('')}
        <div class="audit-page-grid">
          ${dossier.pageCards.map((card) => `
            <article class="audit-page-card ${toneClass(card.tone)}">
              <div>
                <strong>${escapeHtml(card.pageLabel)}</strong>
                <span>${escapeHtml(card.classification)} | ${escapeHtml(card.parseStatus)} | ${escapeHtml(`${card.confidence}%`)}</span>
              </div>
              <div class="chip-row">
                ${card.sourceHint ? `<span class="chip">${escapeHtml(card.sourceHint)}</span>` : ''}
                ${card.sectionType ? `<span class="chip">${escapeHtml(card.sectionType)}</span>` : ''}
                ${card.scope ? `<span class="chip">${escapeHtml(card.scope)}</span>` : ''}
                ${(card.stageBadges ?? []).map((stage) => `<span class="chip stage-chip">${escapeHtml(stage)}</span>`).join('')}
              </div>
              ${card.warnings.length > 0 ? `<ul>${card.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
            </article>
          `).join('')}
        </div>
      </section>
    </details>
  `;
}

function renderActionBar(): string {
  return `
    <div class="action-bar" aria-label="Review actions">
      <a href="#parameters" class="primary-action">Approve Extraction</a>
      <a href="#risks">Flag for Review</a>
      <a href="#source-evidence">Open Source Page</a>
      <button type="button" onclick="window.print()">Export PDF</button>
      <a href="#ground-model">Generate Ground Model</a>
      <a href="#boreholes">Create Borehole Profile</a>
      <a href="#source-evidence">Ask Geotech Agent</a>
    </div>
  `;
}

export function renderIngestDossierAsHtml(dossier: IngestDossier): string {
  const generatedDate = new Date(dossier.generatedAt).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const auditTables = dossier.tables.filter((table) => isOperationalAuditTable(table.title));
  const mainTables = dossier.tables.filter((table) => !isOperationalAuditTable(table.title));
  const subtitle = /borehole/i.test(`${dossier.subtitle} ${dossier.title}`)
    ? 'Borehole Log Interpretation and Review Summary'
    : 'AI-Assisted Geotechnical Review Summary';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Geotechnical Intelligence Dossier - ${escapeHtml(dossier.title)}</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --surface: #ffffff;
      --surface-soft: #eef3f8;
      --text: #101828;
      --muted: #667085;
      --primary: #0b4f8a;
      --primary-soft: #e6f0fa;
      --success: #16875d;
      --success-soft: #e4f6ee;
      --warning: #b7791f;
      --warning-soft: #fff3d6;
      --danger: #b42318;
      --danger-soft: #fde5e2;
      --neutral: #475467;
      --neutral-soft: #edf1f6;
      --border: #d8e0ea;
      --shadow: 0 18px 45px rgba(16, 24, 40, 0.08);
      --radius: 16px;
      --radius-sm: 12px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    html, body { margin: 0; min-height: 100%; }

    body {
      font-family: Inter, "Segoe UI Variable", "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
      font-variant-numeric: tabular-nums;
      overflow-x: hidden;
    }

    .layout {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 28px;
      width: 100%;
      max-width: 1580px;
      margin: 0 auto;
      padding: 28px;
      min-width: 0;
    }

    .sidebar {
      position: sticky;
      top: 28px;
      align-self: start;
      min-height: calc(100vh - 56px);
      min-width: 0;
      padding: 22px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: #0b1220;
      color: #f8fafc;
      box-shadow: var(--shadow);
    }

    .brand {
      display: grid;
      gap: 8px;
      padding-bottom: 22px;
      border-bottom: 1px solid #263244;
      margin-bottom: 18px;
    }

    .brand strong { font-size: 1.05rem; }
    .brand span { color: #94a3b8; line-height: 1.5; font-size: 0.9rem; }

    .nav-list {
      display: grid;
      gap: 6px;
    }

    .nav-list a {
      color: #dbeafe;
      text-decoration: none;
      padding: 10px 12px;
      border-radius: 10px;
      font-weight: 650;
      font-size: 0.94rem;
      overflow-wrap: anywhere;
    }

    .nav-list a:hover, .nav-list a:focus {
      background: #1f2937;
      outline: none;
    }

    .content {
      display: grid;
      gap: 26px;
      min-width: 0;
      max-width: 100%;
    }

    .hero {
      padding: 32px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(135deg, #ffffff 0%, #eef6ff 100%);
      box-shadow: var(--shadow);
      display: grid;
      gap: 24px;
      min-width: 0;
    }

    .eyebrow {
      display: inline-flex;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--primary-soft);
      color: var(--primary);
      font-weight: 800;
      font-size: 0.78rem;
      text-transform: uppercase;
    }

    .hero-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 250px;
      gap: 24px;
      align-items: start;
      min-width: 0;
    }

    .hero-main > div {
      min-width: 0;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      margin-top: 12px;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.04;
      max-width: 22ch;
      overflow-wrap: anywhere;
    }

    .hero-subtitle {
      margin-top: 12px;
      color: var(--primary);
      font-weight: 800;
      font-size: 1.12rem;
    }

    .hero-summary {
      margin-top: 14px;
      color: var(--muted);
      line-height: 1.7;
      max-width: 92ch;
      overflow-wrap: anywhere;
    }

    .hero-meta {
      display: grid;
      gap: 10px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.72);
      color: var(--muted);
      font-size: 0.92rem;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .hero-meta strong { color: var(--text); }

    .executive-grid, .metric-grid, .card-grid, .evidence-grid, .audit-page-grid, .footer-grid {
      display: grid;
      gap: 16px;
    }

    .executive-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .fact-card, .metric-card, .insight-card, .evidence-card, .footer-card, .audit-page-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      padding: 18px;
      min-width: 0;
    }

    .fact-card {
      display: grid;
      gap: 8px;
    }

    .fact-card span, .metric-card span {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      font-weight: 800;
    }

    .fact-card strong {
      font-size: 1rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .fact-card small, .metric-card small {
      color: var(--muted);
      line-height: 1.5;
    }

    .metric-grid {
      grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
    }

    .metric-card {
      display: grid;
      gap: 10px;
    }

    .metric-card strong {
      font-size: 1.65rem;
      line-height: 1;
    }

    .meter {
      display: block;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(102, 112, 133, 0.18);
    }

    .meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: currentColor;
      opacity: 0.75;
    }

    .tone-accent { background: var(--primary-soft); color: var(--primary); }
    .tone-good { background: var(--success-soft); color: var(--success); }
    .tone-warning { background: var(--warning-soft); color: var(--warning); }
    .tone-danger { background: var(--danger-soft); color: var(--danger); }
    .tone-neutral { background: var(--neutral-soft); color: var(--neutral); }

    .action-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .action-bar button, .action-bar a {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      padding: 10px 13px;
      font: inherit;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
      cursor: pointer;
      overflow-wrap: anywhere;
    }

    .action-bar .primary-action {
      background: var(--primary);
      border-color: var(--primary);
      color: #ffffff;
    }

    .data-section {
      display: grid;
      gap: 16px;
      scroll-margin-top: 24px;
      min-width: 0;
    }

    .section-heading {
      display: grid;
      gap: 8px;
    }

    .section-heading h2 {
      font-size: 1.35rem;
      letter-spacing: 0;
    }

    .section-heading p {
      color: var(--muted);
      line-height: 1.65;
      max-width: 96ch;
    }

    .card-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .insight-card {
      display: grid;
      gap: 12px;
    }

    .insight-card h3 {
      color: var(--text);
      font-size: 1.06rem;
    }

    .insight-card p, .insight-card li, .evidence-card p, .evidence-card li {
      color: var(--muted);
      line-height: 1.62;
    }

    .insight-card ul, .evidence-card ul, .profile-notes, .footer-card ul, .audit-page-card ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 7px;
    }

    .profile-shell, .table-shell {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      min-width: 0;
      max-width: 100%;
    }

    .borehole-profile {
      display: block;
      min-width: 760px;
      width: 100%;
      height: auto;
    }

    .profile-title { font: 800 15px Inter, Segoe UI, sans-serif; fill: #101828; }
    .profile-label { font: 800 13px Inter, Segoe UI, sans-serif; fill: #101828; }
    .profile-small { font: 11px Inter, Segoe UI, sans-serif; fill: #475467; }
    .profile-axis { font: 11px Inter, Segoe UI, sans-serif; fill: #667085; }
    .profile-water { font: 800 11px Inter, Segoe UI, sans-serif; fill: #0b4f8a; }

    .profile-notes {
      color: var(--muted);
      line-height: 1.55;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 920px;
    }

    th, td {
      padding: 13px 14px;
      border-bottom: 1px solid rgba(11, 79, 138, 0.09);
      text-align: left;
      vertical-align: top;
      font-size: 0.92rem;
      line-height: 1.48;
      overflow-wrap: anywhere;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 0.76rem;
      text-transform: uppercase;
      font-weight: 900;
      white-space: nowrap;
      overflow-wrap: normal;
    }

    .status-pill, .chip {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(102, 112, 133, 0.2);
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1;
    }

    .evidence-grid {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }

    .evidence-card {
      display: grid;
      gap: 11px;
    }

    .evidence-card > div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 0.86rem;
    }

    .evidence-card h3 {
      color: var(--text);
      font-size: 1.02rem;
    }

    .evidence-card small {
      color: var(--warning);
      font-weight: 800;
      line-height: 1.45;
    }

    .empty-state {
      padding: 18px;
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--muted);
      line-height: 1.6;
    }

    .audit-drawer {
      scroll-margin-top: 24px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      overflow: hidden;
    }

    .audit-drawer summary {
      cursor: pointer;
      list-style: none;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .audit-drawer summary::-webkit-details-marker { display: none; }
    .audit-drawer summary span:first-child { display: grid; gap: 5px; }
    .audit-drawer small { color: var(--muted); }

    .disclosure-hint {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 7px 11px;
      color: var(--primary);
      background: var(--primary-soft);
      font-weight: 800;
      white-space: nowrap;
    }

    .audit-content {
      border-top: 1px solid var(--border);
      padding: 20px;
      display: grid;
      gap: 20px;
    }

    .outcome-strip {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
      gap: 6px;
    }

    .outcome-cell {
      min-height: 30px;
      border: 1px solid var(--border);
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      font-weight: 900;
    }

    .legend-row, .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
    }

    .legend-row strong { color: var(--text); }

    .audit-page-grid {
      grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
    }

    .audit-page-card {
      display: grid;
      gap: 12px;
    }

    .audit-page-card > div:first-child {
      display: grid;
      gap: 4px;
    }

    .audit-page-card > div:first-child span, .audit-page-card li {
      color: var(--muted);
      line-height: 1.5;
    }

    .stage-chip {
      color: var(--primary);
      background: var(--primary-soft);
      border-color: #b9d4ec;
    }

    .footer-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .footer-card {
      display: grid;
      gap: 9px;
    }

    .footer-card p, .footer-card li {
      color: var(--muted);
      line-height: 1.58;
    }

    @media (max-width: 980px) {
      .layout { grid-template-columns: minmax(0, 1fr); padding: 18px; max-width: 100%; }
      .sidebar { position: static; min-height: auto; }
      .nav-list { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
      .hero-main { grid-template-columns: 1fr; }
    }

    @media (max-width: 620px) {
      .layout { display: block; width: 100%; max-width: 390px; margin: 0; padding: 12px; }
      .sidebar, .content, .hero, .data-section, .audit-drawer, .footer-grid {
        width: 100%;
        max-width: 100%;
      }
      .content { margin-top: 18px; }
      .hero { padding: 22px; }
      .executive-grid, .metric-grid, .card-grid, .evidence-grid, .footer-grid { grid-template-columns: 1fr; }
      .nav-list { grid-template-columns: 1fr; }
      h1 { font-size: 1.72rem; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" aria-label="Dossier navigation">
      <div class="brand">
        <strong>Geotechnical Intelligence Dossier</strong>
        <span>AI-assisted extraction, verification, and engineering interpretation from geotechnical reports.</span>
      </div>
      <nav class="nav-list">
        <a href="#overview">Overview</a>
        <a href="#ground-model">Ground Model</a>
        <a href="#boreholes">Boreholes</a>
        <a href="#parameters">Engineering Parameters</a>
        <a href="#risks">Risks and Limitations</a>
        <a href="#source-evidence">Source Evidence</a>
        <a href="#processing-audit">Audit Trail</a>
      </nav>
    </aside>

    <main class="content">
      <header class="hero" id="overview">
        <div class="hero-main">
          <div>
            <span class="eyebrow">Geotechnical Intelligence Dossier</span>
            <h1>${escapeHtml(dossier.title)}</h1>
            <p class="hero-subtitle">${escapeHtml(subtitle)}</p>
            <p class="hero-summary">${escapeHtml(dossier.summary)}</p>
          </div>
          <div class="hero-meta">
            <strong>${escapeHtml(dossier.sourceLabel)}</strong>
            <span>Generated ${escapeHtml(generatedDate)}</span>
            <span>geotechCLI v${escapeHtml(GEOTECHCLI_VERSION)}</span>
            <span>${escapeHtml(dossier.documentType)}</span>
          </div>
        </div>
        <div class="executive-grid">
          ${dossier.executiveItems.map((item) => `
            <article class="fact-card ${toneClass(item.tone)}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
              ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}
            </article>
          `).join('')}
        </div>
        <div class="metric-grid">
          ${dossier.metrics.map(renderMetric).join('')}
        </div>
        ${renderActionBar()}
      </header>

      <section class="data-section" id="ground-model">
        <div class="section-heading">
          <h2>Ground Model</h2>
          <p>Decision-focused interpretation cards. The main view prioritizes engineering meaning, missing data, and verification needs.</p>
        </div>
        <div class="card-grid">
          ${dossier.insightCards.map((card) => `
            <article class="insight-card ${toneClass(card.tone)}">
              <h3>${escapeHtml(card.title)}</h3>
              <p>${escapeHtml(card.body)}</p>
              ${card.detail ? `<p>${escapeHtml(card.detail)}</p>` : ''}
            </article>
          `).join('')}
        </div>
      </section>

      ${renderBoreholeProfile(dossier.boreholeProfile)}
      ${renderTrustTable(dossier)}
      ${mainTables.map((table) => renderTable(table)).join('')}
      ${renderFindingGroups(dossier)}
      ${renderSourceEvidence(dossier)}
      ${renderProcessingAudit(dossier, auditTables)}

      <section class="footer-grid">
        ${dossier.storedReview ? `
          <article class="footer-card">
            <h3>Stored review</h3>
            <p>Project: ${escapeHtml(dossier.storedReview.projectId)}</p>
            <p>Dataset: ${escapeHtml(dossier.storedReview.datasetName)}</p>
            <p>Review ID: ${escapeHtml(dossier.storedReview.reviewId)}</p>
            ${dossier.storedReview.createdAt ? `<p>Created: ${escapeHtml(dossier.storedReview.createdAt)}</p>` : ''}
          </article>
        ` : ''}
        ${dossier.approval ? `
          <article class="footer-card">
            <h3>Approval</h3>
            <p>Dataset: ${escapeHtml(dossier.approval.datasetName)}</p>
            <p>Approved: ${escapeHtml(dossier.approval.approvedAt)}</p>
            <p>Approved by: ${escapeHtml(dossier.approval.approvedBy ?? 'Unspecified')}</p>
            ${dossier.approval.rationale ? `<p>${escapeHtml(dossier.approval.rationale)}</p>` : ''}
          </article>
        ` : ''}
        <article class="footer-card">
          <h3>Source notes</h3>
          <ul>${dossier.footerNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
        </article>
      </section>
    </main>
  </div>
</body>
</html>`;
}

import { GEOTECHCLI_VERSION } from '../meta/index.js';
import type { IngestDossier, IngestDossierTone, IngestDossierTable } from './ingest-dossier.js';

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
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

function renderTable(table: IngestDossierTable): string {
  if (table.rows.length === 0) {
    return `
      <section class="panel section-card" id="${escapeHtml(idFromTitle(table.title))}">
        <div class="section-head">
          <h2>${escapeHtml(table.title)}</h2>
          ${table.description ? `<p>${escapeHtml(table.description)}</p>` : ''}
        </div>
        <div class="empty-state">${escapeHtml(table.emptyState ?? 'No data available.')}</div>
      </section>
    `;
  }

  return `
    <section class="panel section-card" id="${escapeHtml(idFromTitle(table.title))}">
      <div class="section-head">
        <h2>${escapeHtml(table.title)}</h2>
        ${table.description ? `<p>${escapeHtml(table.description)}</p>` : ''}
      </div>
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
    </section>
  `;
}

export function renderIngestDossierAsHtml(dossier: IngestDossier): string {
  const generatedDate = new Date(dossier.generatedAt).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(dossier.title)}</title>
  <style>
    :root {
      --bg: #f7f8fa;
      --panel: #ffffff;
      --panel-strong: #ffffff;
      --border: #d9e1ea;
      --border-strong: #b8c5d4;
      --text: #1b2533;
      --muted: #607287;
      --accent: #0068d7;
      --accent-soft: rgba(0, 104, 215, 0.12);
      --good: #1d8f57;
      --good-soft: rgba(29, 143, 87, 0.12);
      --warning: #b26b00;
      --warning-soft: rgba(178, 107, 0, 0.14);
      --danger: #ba2d3f;
      --danger-soft: rgba(186, 45, 63, 0.12);
      --neutral: #526072;
      --neutral-soft: rgba(82, 96, 114, 0.12);
      --shadow: none;
      --radius: 8px;
      --radius-sm: 6px;
    }

    * { box-sizing: border-box; }

    html, body { margin: 0; min-height: 100%; }

    body {
      font-family: "Segoe UI Variable", "Segoe UI", "Inter", sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    .shell {
      max-width: 1520px;
      margin: 0 auto;
      padding: 28px;
      display: grid;
      gap: 22px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .hero {
      padding: 28px;
      display: grid;
      gap: 20px;
    }

    .hero-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
      align-items: start;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      background: #f8fafc;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.84rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.04;
      max-width: 18ch;
    }

    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 92ch;
      line-height: 1.65;
      font-size: 1rem;
    }

    .hero-meta {
      display: grid;
      gap: 6px;
      min-width: 230px;
      text-align: right;
      color: var(--muted);
      font-size: 0.95rem;
    }

    .badge-row, .metric-grid, .finding-grid, .section-grid, .page-grid, .footer-grid {
      display: grid;
      gap: 16px;
    }

    .badge-row {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .badge {
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.82);
      display: grid;
      gap: 6px;
    }

    .badge-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .badge-value {
      font-size: 1rem;
      font-weight: 700;
    }

    .metric-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .metric {
      padding: 18px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.86);
      display: grid;
      gap: 8px;
    }

    .metric-label {
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .metric-value {
      font-size: 1.6rem;
      font-weight: 800;
      line-height: 1;
    }

    .metric-detail {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.5;
    }

    .tone-accent { background: rgba(0, 104, 215, 0.08); }
    .tone-good { background: var(--good-soft); }
    .tone-warning { background: var(--warning-soft); }
    .tone-danger { background: var(--danger-soft); }
    .tone-neutral { background: var(--neutral-soft); }

    .section-card {
      padding: 24px;
      display: grid;
      gap: 18px;
    }

    .section-head {
      display: grid;
      gap: 8px;
    }

    .section-head h2 {
      margin: 0;
      font-size: 1.2rem;
    }

    .section-head p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }

    .finding-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .finding-card {
      padding: 18px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      display: grid;
      gap: 12px;
    }

    .finding-card h3 {
      margin: 0;
      font-size: 1rem;
    }

    .finding-card ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
      line-height: 1.55;
    }

    .table-shell {
      overflow-x: auto;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.72);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }

    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(19, 63, 120, 0.08);
      text-align: left;
      vertical-align: top;
      font-size: 0.95rem;
      line-height: 1.45;
    }

    th {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      background: rgba(247, 250, 255, 0.96);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .empty-state {
      padding: 18px;
      border-radius: var(--radius-sm);
      background: rgba(248, 250, 253, 0.92);
      color: var(--muted);
      border: 1px dashed var(--border-strong);
    }

    .section-grid {
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .narrative {
      padding: 22px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.82);
      display: grid;
      gap: 12px;
    }

    .narrative h3 {
      margin: 0;
      font-size: 1.04rem;
    }

    .narrative p {
      margin: 0;
      color: var(--muted);
      line-height: 1.65;
    }

    .page-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .page-card {
      padding: 18px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      display: grid;
      gap: 12px;
      background: rgba(255, 255, 255, 0.84);
    }

    .page-kicker {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      flex-wrap: wrap;
    }

    .page-kicker strong {
      font-size: 0.9rem;
    }

    .page-kicker span {
      color: var(--muted);
      font-size: 0.82rem;
    }

    .page-card h3 {
      margin: 0;
      font-size: 1.05rem;
    }

    .page-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .chip {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 0.78rem;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.86);
    }

    .page-card ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
      line-height: 1.55;
      color: var(--muted);
    }

    .page-card details {
      border-top: 1px dashed var(--border-strong);
      padding-top: 10px;
    }

    .page-card summary {
      cursor: pointer;
      color: var(--accent);
      font-weight: 600;
      list-style: none;
    }

    .page-card summary::-webkit-details-marker {
      display: none;
    }

    .page-card details ul {
      margin-top: 10px;
    }

    .footer-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .footer-card {
      padding: 18px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.82);
      display: grid;
      gap: 8px;
    }

    .footer-card h3 {
      margin: 0;
      font-size: 0.98rem;
    }

    .footer-card p, .footer-card li {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }

    .footer-card ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
    }

    @media (max-width: 920px) {
      .shell { padding: 18px; }
      .hero { padding: 22px; }
      .hero-meta { text-align: left; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel hero">
      <div class="hero-head">
        <div>
          <div class="eyebrow">geotechCLI ingest dossier</div>
          <h1>${escapeHtml(dossier.title)}</h1>
          <p>${escapeHtml(dossier.summary)}</p>
        </div>
        <div class="hero-meta">
          <strong>${escapeHtml(dossier.subtitle)}</strong>
          <span>${escapeHtml(dossier.sourceLabel)}</span>
          <span>Generated ${escapeHtml(generatedDate)}</span>
          <span>geotechCLI v${escapeHtml(GEOTECHCLI_VERSION)}</span>
        </div>
      </div>

      <div class="badge-row">
        ${dossier.badges.map((badge) => `
          <article class="badge ${toneClass(badge.tone)}">
            <span class="badge-label">${escapeHtml(badge.label)}</span>
            <span class="badge-value">${escapeHtml(badge.value)}</span>
          </article>
        `).join('')}
      </div>

      <div class="metric-grid">
        ${dossier.metrics.map((metric) => `
          <article class="metric ${toneClass(metric.tone)}">
            <span class="metric-label">${escapeHtml(metric.label)}</span>
            <strong class="metric-value">${escapeHtml(metric.value)}</strong>
            ${metric.detail ? `<span class="metric-detail">${escapeHtml(metric.detail)}</span>` : ''}
          </article>
        `).join('')}
      </div>
    </section>

    ${dossier.findings.length > 0 ? `
      <section class="panel section-card" id="review-findings">
        <div class="section-head">
          <h2>Review findings</h2>
          <p>What still needs attention before this ingest can be treated as fully trusted engineering input.</p>
        </div>
        <div class="finding-grid">
          ${dossier.findings.map((group) => `
            <article class="finding-card ${toneClass(group.tone)}">
              <h3>${escapeHtml(group.label)}</h3>
              <ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}

    ${dossier.sections.length > 0 ? `
      <section class="panel section-card" id="narrative">
        <div class="section-head">
          <h2>Engineering brief</h2>
          <p>A concise narrative view designed for fast review before deeper page-by-page inspection.</p>
        </div>
        <div class="section-grid">
          ${dossier.sections.map((section) => `
            <article class="narrative">
              <h3>${escapeHtml(section.title)}</h3>
              ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}

    ${dossier.tables.map(renderTable).join('')}

    ${dossier.pageCards.length > 0 ? `
      <section class="panel section-card" id="page-map">
        <div class="section-head">
          <h2>Page map</h2>
          <p>Page-level outcome, extraction posture, and the strongest retained signals for each page.</p>
        </div>
        <div class="page-grid">
          ${dossier.pageCards.map((card) => `
            <article class="page-card ${toneClass(card.tone)}">
              <div class="page-kicker">
                <div>
                  <strong>${escapeHtml(card.pageLabel)}</strong>
                  <div><span>${escapeHtml(card.classification)}</span></div>
                </div>
                <span>${escapeHtml(card.parseStatus)} | ${escapeHtml(`${card.confidence}%`)}</span>
              </div>
              <h3>${escapeHtml(card.title)}</h3>
              <div class="page-meta">
                ${card.sourceHint ? `<span class="chip">${escapeHtml(card.sourceHint)}</span>` : ''}
                ${card.sectionType ? `<span class="chip">${escapeHtml(card.sectionType)}</span>` : ''}
                ${card.scope ? `<span class="chip">${escapeHtml(card.scope)}</span>` : ''}
              </div>
              ${card.highlights.length > 0 ? `<ul>${card.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="empty-state">No strong structured highlights were retained for this page.</div>'}
              ${card.warnings.length > 0 ? `
                <details>
                  <summary>Warnings (${card.warnings.length})</summary>
                  <ul>${card.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
                </details>
              ` : ''}
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}

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
</body>
</html>`;
}

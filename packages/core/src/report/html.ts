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

function reviewFilterValue(item: IngestDossier['trustItems'][number]): 'verified' | 'needs_review' | 'missing' {
  if (/not extracted|missing/i.test(item.value) || /required/i.test(item.review)) {
    return 'missing';
  }
  if (/recommended|verify|manual|visual|review/i.test(item.review) && !/ready/i.test(item.review)) {
    return 'needs_review';
  }
  return 'verified';
}

function compactSvgText(value: string | null | undefined, maxLength = 28): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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

function renderStatusBadges(dossier: IngestDossier): string {
  if (dossier.badges.length === 0) {
    return '';
  }

  return `
    <div class="status-badge-row" aria-label="Document status">
      ${dossier.badges.map((badge) => `
        <span class="status-badge ${toneClass(badge.tone)}">
          <span>${escapeHtml(badge.label)}</span>
          <strong>${escapeHtml(badge.value)}</strong>
        </span>
      `).join('')}
    </div>
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
    : dossier.trustItems.map((item) => {
      const reviewFilter = reviewFilterValue(item);
      const searchText = [
        item.item,
        item.value,
        item.sourcePage,
        item.confidence,
        item.review,
        item.evidence,
      ].join(' ').toLowerCase();
      return `
      <tr data-trust-row data-review="${escapeHtml(reviewFilter)}" data-search="${escapeHtml(searchText)}">
        <td><strong>${escapeHtml(item.item)}</strong></td>
        <td>${escapeHtml(item.value)}</td>
        <td>${escapeHtml(item.sourcePage)}</td>
        <td><span class="status-pill ${toneClass(item.tone)}">${escapeHtml(item.confidence)}</span></td>
        <td>${escapeHtml(item.review)}</td>
        <td>${escapeHtml(item.evidence)}</td>
      </tr>
    `;
    }).join('');

  return `
    <section class="data-section" id="parameters">
      <div class="section-heading">
        <h2>Engineering Parameters</h2>
        <p>Evidence-first review table. Every retained or missing item is shown with source, confidence, review posture, and an evidence snippet.</p>
      </div>
      <div class="trust-controls" aria-label="Parameter table controls">
        <label>
          <span>Search parameters</span>
          <input id="trust-search" type="search" placeholder="Filter by parameter, value, source, or evidence" />
        </label>
        <div class="filter-row" aria-label="Review status filters">
          <button type="button" class="filter-button active" data-trust-filter="all">All</button>
          <button type="button" class="filter-button" data-trust-filter="needs_review">Needs review</button>
          <button type="button" class="filter-button" data-trust-filter="missing">Missing</button>
          <button type="button" class="filter-button" data-trust-filter="verified">Verified</button>
        </div>
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

function renderGroundModelCrossSection(profile: IngestDossierBoreholeProfile | undefined): string {
  if (!profile || profile.columns.length < 2 || profile.maxDepth <= 0) {
    return `
      <section class="data-section" id="ground-cross-section">
        <div class="section-heading">
          <h2>Ground Model Cross-Section</h2>
          <p>A schematic cross-section needs at least two boreholes with retained depth evidence.</p>
        </div>
        <div class="empty-state">Ground-model bands were not drawn because borehole depth and layer evidence were incomplete.</div>
      </section>
    `;
  }

  const width = 940;
  const height = 310;
  const plotTop = 58;
  const plotHeight = 182;
  const left = 84;
  const right = width - 44;
  const usableWidth = right - left;
  const referenceLayers = profile.columns
    .flatMap((column) => column.layers)
    .sort((leftLayer, rightLayer) => leftLayer.depthFrom - rightLayer.depthFrom)
    .slice(0, 8);
  const layers = referenceLayers.length > 0
    ? referenceLayers
    : [{
        depthFrom: 0,
        depthTo: profile.maxDepth,
        label: 'Ground profile',
        description: 'Layer boundaries were not available in structured form.',
        tone: 'neutral' as const,
        uncertain: true,
      }];
  const yForDepth = (depth: number) => plotTop + (Math.max(0, Math.min(profile.maxDepth, depth)) / profile.maxDepth) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((profile.maxDepth * index / 5).toFixed(2)));
  const columnX = (index: number) =>
    profile.columns.length === 1
      ? left + usableWidth / 2
      : left + (usableWidth * index / (profile.columns.length - 1));

  return `
    <section class="data-section" id="ground-cross-section">
      <div class="section-heading">
        <h2>Ground Model Cross-Section</h2>
        <p>Conceptual cross-section connecting retained borehole evidence. Bands are schematic and should be verified against source logs before design use.</p>
      </div>
      <div class="profile-shell cross-section-shell">
        <svg class="ground-cross-section" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI-assisted ground model cross-section">
          <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#ffffff" />
          ${ticks.map((tick) => {
            const y = yForDepth(tick);
            return `
              <line x1="${left - 34}" y1="${y.toFixed(2)}" x2="${right + 12}" y2="${y.toFixed(2)}" stroke="#d8e0ea" stroke-width="1" />
              <text x="14" y="${(y + 4).toFixed(2)}" class="profile-axis">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))} ${escapeHtml(profile.depthUnit)}</text>
            `;
          }).join('')}
          ${layers.map((layer) => {
            const y1 = yForDepth(layer.depthFrom);
            const y2 = Math.max(y1 + 18, yForDepth(layer.depthTo));
            return `
              <g>
                <title>${escapeHtml(`${layer.label}: ${layer.description}`)}</title>
                <path d="M ${left} ${y1.toFixed(2)} L ${right} ${y1.toFixed(2)} L ${right} ${y2.toFixed(2)} L ${left} ${y2.toFixed(2)} Z"
                  fill="${toneColor(layer.tone)}" stroke="#7a8aa0" stroke-width="1.2" ${layer.uncertain ? 'stroke-dasharray="8 6"' : ''} opacity="0.88" />
                <text x="${left + 18}" y="${(y1 + Math.min(34, (y2 - y1) / 2 + 5)).toFixed(2)}" class="profile-label">${escapeHtml(compactSvgText(layer.label, 32))}</text>
                <text x="${left + 18}" y="${(y1 + Math.min(52, (y2 - y1) / 2 + 23)).toFixed(2)}" class="profile-small">${escapeHtml(compactSvgText(layer.description, 64))}</text>
              </g>
            `;
          }).join('')}
          ${profile.columns.map((column, index) => {
            const x = columnX(index);
            const depth = column.totalDepth ?? profile.maxDepth;
            const bottomY = yForDepth(depth);
            const waterY = column.waterTableDepth != null ? yForDepth(column.waterTableDepth) : null;
            return `
              <g>
                <line x1="${x.toFixed(2)}" y1="${plotTop - 10}" x2="${x.toFixed(2)}" y2="${bottomY.toFixed(2)}" stroke="#0b4f8a" stroke-width="3" />
                <circle cx="${x.toFixed(2)}" cy="${plotTop - 12}" r="6" fill="#0b4f8a" />
                <text x="${(x - 24).toFixed(2)}" y="28" class="profile-title">${escapeHtml(column.boreholeId)}</text>
                <text x="${(x - 36).toFixed(2)}" y="${height - 32}" class="profile-small">TD ${escapeHtml(depth.toFixed(2))} ${escapeHtml(profile.depthUnit)}</text>
                ${waterY != null ? `
                  <line x1="${(x - 34).toFixed(2)}" y1="${waterY.toFixed(2)}" x2="${(x + 34).toFixed(2)}" y2="${waterY.toFixed(2)}" stroke="#0891b2" stroke-width="2" />
                  <text x="${(x - 40).toFixed(2)}" y="${(waterY - 7).toFixed(2)}" class="profile-water">GW</text>
                ` : ''}
              </g>
            `;
          }).join('')}
        </svg>
      </div>
      <p class="verification-note">AI-assisted ground model. Use source logs and engineering judgment before adopting layer continuity, groundwater, or design parameters.</p>
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
      <g>
        <title>${escapeHtml(`${layer.depthFrom.toFixed(2)}-${layer.depthTo.toFixed(2)} ${profile.depthUnit}: ${layer.description}`)}</title>
        <rect x="${x}" y="${y.toFixed(2)}" width="${columnWidth}" height="${rectHeight.toFixed(2)}" rx="8"
          fill="${toneColor(layer.tone)}" stroke="#7a8aa0" stroke-width="1.2" ${layer.uncertain ? 'stroke-dasharray="6 5"' : ''} />
        <text x="${x + 10}" y="${midY.toFixed(2)}" class="profile-label">${escapeHtml(layer.label)}</text>
        <text x="${x + 10}" y="${(midY + 16).toFixed(2)}" class="profile-small">${escapeHtml(compactSvgText(layer.description))}</text>
      </g>
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
            <p>${escapeHtml([
              sourceModeLabel(card.sourceHint),
              card.cacheStatus === 'hit'
                ? 'Evidence cache reused'
                : card.cacheStatus === 'stored'
                  ? 'Evidence cached for reruns'
                  : null,
            ].filter(Boolean).join(' | '))}</p>
            ${card.highlights.length > 0 ? `<ul>${card.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No strong structured highlight was retained for this page.</p>'}
            ${card.warnings.length > 0 ? `<small>Human verification recommended: ${escapeHtml(String(card.warnings.length))} retained warning(s).</small>` : ''}
            <div class="evidence-actions" aria-label="${escapeHtml(`${card.pageLabel} review actions`)}">
              <a href="#processing-audit">Open source page</a>
              <button type="button" data-dossier-action="verified">Mark verified</button>
              <button type="button" data-dossier-action="flagged">Flag issue</button>
            </div>
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

function renderReviewBar(dossier: IngestDossier): string {
  const missingCount = dossier.trustItems.filter((item) => reviewFilterValue(item) === 'missing').length;
  const needsReviewCount = dossier.trustItems.filter((item) => reviewFilterValue(item) === 'needs_review').length;
  const reviewBadgeValue = dossier.badges.find((badge) => /review/i.test(badge.label))?.value ?? 'Yes';
  const reviewRequired = /^no$/i.test(reviewBadgeValue) ? 'Review ready' : 'Review required';
  return `
    <div class="review-bar" role="region" aria-label="Human review workflow">
      <div>
        <strong>${escapeHtml(reviewRequired)}</strong>
        <span>${escapeHtml(`${dossier.pageCards.length} page(s), ${dossier.trustItems.length} review item(s), ${needsReviewCount} need review, ${missingCount} missing`)}</span>
      </div>
      <div class="review-actions">
        <a href="#parameters" class="primary-action">Approve Extraction</a>
        <a href="#risks">Flag for Review</a>
        <button type="button" onclick="window.print()">Export Dossier</button>
        <a href="#ground-cross-section">Generate Ground Model</a>
        <a href="#source-evidence">Ask Geotech Agent</a>
        <a href="#processing-audit">Open Audit Trail</a>
      </div>
    </div>
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
      padding-bottom: 98px;
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

    .status-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin-top: 16px;
    }

    .status-badge {
      display: inline-grid;
      gap: 4px;
      min-width: 126px;
      padding: 10px 12px;
      border: 1px solid rgba(102, 112, 133, 0.18);
      border-radius: 14px;
      line-height: 1.2;
    }

    .status-badge span {
      color: currentColor;
      opacity: 0.72;
      font-size: 0.68rem;
      text-transform: uppercase;
      font-weight: 900;
    }

    .status-badge strong {
      color: var(--text);
      font-size: 0.86rem;
      overflow-wrap: anywhere;
    }

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

    .review-bar {
      position: fixed;
      left: 50%;
      bottom: 0;
      z-index: 45;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      width: min(1180px, calc(100vw - 36px));
      margin: 10px auto 0;
      padding: 13px 14px;
      border: 1px solid #263244;
      border-radius: 18px 18px 0 0;
      background: rgba(11, 18, 32, 0.94);
      color: #f8fafc;
      box-shadow: 0 -18px 38px rgba(11, 18, 32, 0.2);
      backdrop-filter: blur(14px);
      transform: translate(-50%, 120%);
      transition: transform 180ms ease;
    }

    .review-bar.visible {
      transform: translate(-50%, 0);
    }

    .review-bar > div:first-child {
      display: grid;
      gap: 3px;
      min-width: 220px;
    }

    .review-bar strong { font-size: 0.95rem; }
    .review-bar span { color: #94a3b8; font-size: 0.84rem; line-height: 1.4; }

    .review-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .review-actions a, .review-actions button {
      border: 1px solid #334155;
      border-radius: 10px;
      background: #111827;
      color: #dbeafe;
      padding: 8px 10px;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 850;
      text-decoration: none;
      cursor: pointer;
    }

    .review-actions .primary-action {
      background: #38bdf8;
      border-color: #38bdf8;
      color: #0b1220;
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

    .cross-section-shell {
      background:
        linear-gradient(180deg, rgba(11, 79, 138, 0.04), rgba(22, 135, 93, 0.04)),
        var(--surface);
    }

    .ground-cross-section {
      display: block;
      min-width: 840px;
      width: 100%;
      height: auto;
    }

    .verification-note {
      color: var(--muted);
      font-weight: 700;
      line-height: 1.55;
      padding-left: 14px;
      border-left: 3px solid var(--warning);
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

    .trust-controls {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }

    .trust-controls label {
      display: grid;
      gap: 7px;
      flex: 1 1 320px;
      color: var(--muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 900;
    }

    .trust-controls input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #ffffff;
      color: var(--text);
      padding: 11px 12px;
      font: inherit;
      font-size: 0.92rem;
      outline: none;
      text-transform: none;
      font-weight: 600;
    }

    .trust-controls input:focus {
      border-color: #93c5fd;
      box-shadow: 0 0 0 4px rgba(11, 79, 138, 0.08);
    }

    .filter-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-button {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--muted);
      padding: 9px 12px;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 850;
      cursor: pointer;
    }

    .filter-button.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
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

    .evidence-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 4px;
    }

    .evidence-actions a, .evidence-actions button {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.62);
      color: var(--primary);
      padding: 8px 9px;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 850;
      text-decoration: none;
      cursor: pointer;
    }

    .evidence-actions button[data-state="verified"] {
      color: var(--success);
      border-color: rgba(22, 135, 93, 0.28);
      background: var(--success-soft);
    }

    .evidence-actions button[data-state="flagged"] {
      color: var(--warning);
      border-color: rgba(183, 121, 31, 0.28);
      background: var(--warning-soft);
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

    tr[hidden] { display: none; }

    .toast-region {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 60;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      max-width: 320px;
      padding: 11px 14px;
      border: 1px solid #334155;
      border-radius: 12px;
      background: #0b1220;
      color: #f8fafc;
      box-shadow: 0 18px 38px rgba(11, 18, 32, 0.22);
      font-size: 0.86rem;
      font-weight: 700;
    }

    @media (max-width: 980px) {
      .layout { grid-template-columns: minmax(0, 1fr); padding: 18px; max-width: 100%; }
      .sidebar { position: static; min-height: auto; }
      .nav-list { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
      .hero-main { grid-template-columns: 1fr; }
    }

    @media (max-width: 620px) {
      body { padding-bottom: 0; }
      .layout { display: block; width: 100%; max-width: 390px; margin: 0; padding: 12px; }
      .sidebar, .content, .hero, .data-section, .audit-drawer, .footer-grid {
        width: 100%;
        max-width: 100%;
      }
      .sidebar { padding: 16px; min-height: auto; border-radius: 14px; }
      .brand { gap: 5px; padding-bottom: 12px; margin-bottom: 10px; }
      .brand span { display: none; }
      .nav-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .nav-list a { padding: 8px 9px; font-size: 0.82rem; }
      .content { margin-top: 18px; }
      .hero { padding: 22px; }
      .executive-grid, .metric-grid, .card-grid, .evidence-grid, .footer-grid { grid-template-columns: 1fr; }
      .review-bar { position: static; transform: none; width: 100%; margin-top: 18px; border-radius: 18px; align-items: stretch; }
      .review-bar.visible { transform: none; }
      .review-actions { justify-content: flex-start; }
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
        <a href="#ground-cross-section">Cross-Section</a>
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
            ${renderStatusBadges(dossier)}
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

      ${renderGroundModelCrossSection(dossier.boreholeProfile)}
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
  ${renderReviewBar(dossier)}
  <div class="toast-region" aria-live="polite" aria-atomic="true"></div>
  <script>
    (() => {
      const search = document.getElementById('trust-search');
      const rows = Array.from(document.querySelectorAll('[data-trust-row]'));
      const buttons = Array.from(document.querySelectorAll('[data-trust-filter]'));
      const toastRegion = document.querySelector('.toast-region');
      const reviewBar = document.querySelector('.review-bar');
      let activeFilter = 'all';

      const showToast = (message) => {
        if (!toastRegion) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2600);
      };

      const applyTrustFilter = () => {
        const query = String(search?.value ?? '').trim().toLowerCase();
        rows.forEach((row) => {
          const text = row.getAttribute('data-search') ?? '';
          const review = row.getAttribute('data-review') ?? '';
          const queryMatch = !query || text.includes(query);
          const filterMatch = activeFilter === 'all' || review === activeFilter;
          row.hidden = !(queryMatch && filterMatch);
        });
      };

      const syncReviewBar = () => {
        if (!reviewBar) return;
        reviewBar.classList.toggle('visible', window.innerWidth > 620 && window.scrollY > 420);
      };

      syncReviewBar();
      window.addEventListener('scroll', syncReviewBar, { passive: true });
      window.addEventListener('resize', syncReviewBar);

      search?.addEventListener('input', applyTrustFilter);
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          activeFilter = button.getAttribute('data-trust-filter') ?? 'all';
          buttons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
          applyTrustFilter();
        });
      });

      document.querySelectorAll('[data-dossier-action]').forEach((control) => {
        control.addEventListener('click', () => {
          const state = control.getAttribute('data-dossier-action') ?? '';
          control.setAttribute('data-state', state);
          control.textContent = state === 'verified' ? 'Verified' : 'Issue flagged';
          showToast(state === 'verified'
            ? 'Evidence item marked verified in this local dossier view.'
            : 'Evidence item flagged for engineering review in this local dossier view.');
        });
      });
    })();
  </script>
</body>
</html>`;
}

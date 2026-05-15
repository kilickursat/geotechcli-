import { GEOTECHCLI_VERSION } from '../meta/index.js';
import type {
  IngestDossier,
  IngestDossierBoreholeProfile,
  IngestDossierBoreholeProfileLayer,
  IngestDossierTable,
  IngestDossierTone,
} from './ingest-dossier.js';
import type { GroundModel, GroundModelParameter, GroundModelStratum } from '../ground-model/index.js';
import {
  buildIntegratedReviewModel,
  integratedBoreholeMaxDepth,
  integratedPercent,
  sourcePagesLabel,
  type IntegratedReviewBorehole,
  type IntegratedReviewMaterialClass,
  type IntegratedReviewModel,
  type IntegratedReviewSourcePage,
  type IntegratedReviewSourceRegion,
  type IntegratedReviewSourceRegionType,
} from './integrated-review-model.js';

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
      return '#0f3d2e';
    case 'warning':
      return '#5f3b0b';
    case 'danger':
      return '#5f1717';
    case 'accent':
      return '#0b3b56';
    default:
      return '#1f2937';
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .filter(Boolean);
}

function layerMaterialKey(layer: IngestDossierBoreholeProfileLayer): string {
  const explicit = layer.materialKey?.trim();
  if (explicit) {
    return explicit;
  }
  const text = `${layer.label} ${layer.description} ${layer.uscsSymbol ?? ''}`.toLowerCase();
  if (/peat|organic|top\s*soil|topsoil/.test(text)) return 'organic';
  if (/bedrock|fresh\s+rock|strong\s+(?:shale|sandstone|siltstone|gneiss|rock)/.test(text)) return 'bedrock';
  if (/weathered|fractured|rock|shale|sandstone|gneiss/.test(text)) return 'weathered-rock';
  if (/gravel|\bgm\b|\bgp\b|\bgw\b/.test(text)) return 'gravel';
  if (/sand|\bsm\b|\bsp\b|\bsw\b|\bsc\b/.test(text)) return 'sand';
  if (/clay|\bci\b|\bcl\b|\bch\b/.test(text)) return 'clay';
  if (/silt|\bml\b|\bmh\b/.test(text)) return 'silt';
  if (/fill|made\s+ground|debris/.test(text)) return 'fill';
  return 'mixed';
}

function lithologyColor(key: string): string {
  switch (key) {
    case 'fill':
      return '#8f7a52';
    case 'organic':
      return '#4d3b2e';
    case 'clay':
      return '#a45f3f';
    case 'silt':
      return '#b08f57';
    case 'sand':
      return '#d8b85d';
    case 'gravel':
      return '#8d99a6';
    case 'weathered-rock':
      return '#667085';
    case 'bedrock':
      return '#384250';
    default:
      return '#64748b';
  }
}

function lithologyPatternId(key: string): string {
  return `pattern-${key.replace(/[^a-z0-9-]/gi, '-')}`;
}

function renderLithologyDefs(keys: string[]): string {
  const uniqueKeys = [...new Set(keys)];
  return `
    <defs>
      ${uniqueKeys.map((key) => {
        const color = lithologyColor(key);
        if (key === 'sand') {
          return `<pattern id="${lithologyPatternId(key)}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/><circle cx="2" cy="2" r="0.8" fill="#fff7d6" opacity="0.45"/><circle cx="6" cy="5" r="0.8" fill="#fff7d6" opacity="0.35"/></pattern>`;
        }
        if (key === 'gravel') {
          return `<pattern id="${lithologyPatternId(key)}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${color}"/><path d="M1 8 L4 2 L8 7 Z" fill="#d7dee8" opacity="0.32"/></pattern>`;
        }
        if (key === 'weathered-rock' || key === 'bedrock') {
          return `<pattern id="${lithologyPatternId(key)}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${color}"/><path d="M-2 10 L10 -2 M2 12 L12 2" stroke="#d7dee8" stroke-width="1" opacity="0.22"/></pattern>`;
        }
        if (key === 'clay' || key === 'silt') {
          return `<pattern id="${lithologyPatternId(key)}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/><path d="M0 4 H8" stroke="#fff7d6" stroke-width="0.8" opacity="0.24"/></pattern>`;
        }
        return `<pattern id="${lithologyPatternId(key)}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/></pattern>`;
      }).join('')}
    </defs>
  `;
}

function layerSourceLabel(layer: IngestDossierBoreholeProfileLayer): string {
  const pages = [...new Set((layer.sourcePages ?? []).filter((page) => Number.isInteger(page) && page > 0))]
    .sort((left, right) => left - right);
  return pages.length > 0 ? `p${pages.join(', ')}` : 'source review';
}

function renderProfileLegend(profile: IngestDossierBoreholeProfile): string {
  const layers = [...profile.columns.flatMap((column) => column.layers)];
  const uniqueRows = new Map<string, IngestDossierBoreholeProfileLayer>();
  for (const layer of layers) {
    const key = `${layer.depthFrom.toFixed(2)}-${layer.depthTo.toFixed(2)}-${layer.label}-${layer.description}`;
    if (!uniqueRows.has(key)) {
      uniqueRows.set(key, layer);
    }
  }
  return `
    <div class="profile-legend" aria-label="Layer evidence summary">
      ${[...uniqueRows.values()].slice(0, 8).map((layer) => {
        const key = layerMaterialKey(layer);
        return `
          <div class="profile-legend-row">
            <span class="legend-swatch" style="background: ${lithologyColor(key)}"></span>
            <strong>${escapeHtml(layer.label)}</strong>
            <span>${escapeHtml(layer.depthFrom.toFixed(2))}-${escapeHtml(layer.depthTo.toFixed(2))} ${escapeHtml(profile.depthUnit)}</span>
            <span>${escapeHtml(compactSvgText(layer.description, 92))}</span>
            <em>${escapeHtml(layerSourceLabel(layer))}${layer.uncertain ? ' · inferred' : ''}</em>
          </div>
        `;
      }).join('')}
    </div>
  `;
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

function renderConfidenceBreakdown(dossier: IngestDossier): string {
  if (!dossier.confidenceBreakdown?.length) {
    return '';
  }
  return `
    <section class="data-section compact-section" id="trust-breakdown">
      <div class="section-heading">
        <h2>Trust breakdown</h2>
        <p>Provider-neutral confidence split for review triage. Raw page/model details remain in Validation + JSON.</p>
      </div>
      <div class="metric-grid trust-breakdown-grid">
        ${dossier.confidenceBreakdown.map((item) => `
          <article class="metric-card ${toneClass(item.tone)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            ${parsePercent(item.value) != null ? `
              <span class="meter" aria-label="${escapeHtml(item.label)} ${escapeHtml(item.value)}">
                <span style="width: ${escapeHtml(parsePercent(item.value) ?? 0)}%"></span>
              </span>
            ` : ''}
            <small>${escapeHtml(item.detail)}</small>
          </article>
        `).join('')}
      </div>
    </section>
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

  const width = 860;
  const height = 360;
  const plotTop = 58;
  const plotHeight = 214;
  const left = 78;
  const right = width - 52;
  const usableWidth = right - left;
  const maxLayerCount = Math.max(1, ...profile.columns.map((column) => column.layers.length));
  const yForDepth = (depth: number) => plotTop + (Math.max(0, Math.min(profile.maxDepth, depth)) / profile.maxDepth) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((profile.maxDepth * index / 5).toFixed(2)));
  const columnX = (index: number) =>
    profile.columns.length === 1
      ? left + usableWidth / 2
      : left + (usableWidth * index / (profile.columns.length - 1));
  const layerKeys = profile.columns.flatMap((column) => column.layers.map((layer) => layerMaterialKey(layer)));
  const layerBand = (layerIndex: number): string => {
    const pointsTop: string[] = [];
    const pointsBottom: string[] = [];
    const representative = profile.columns.map((column) => column.layers[layerIndex]).find(Boolean)
      ?? profile.columns[0]?.layers[0]
      ?? {
        depthFrom: 0,
        depthTo: profile.maxDepth,
        label: 'Ground profile',
        description: 'Layer boundaries were not available in structured form.',
        tone: 'neutral' as const,
        uncertain: true,
      };
    profile.columns.forEach((column, index) => {
      const layer = column.layers[layerIndex] ?? representative;
      const x = columnX(index);
      pointsTop.push(`${x.toFixed(2)},${yForDepth(layer.depthFrom).toFixed(2)}`);
      pointsBottom.unshift(`${x.toFixed(2)},${yForDepth(layer.depthTo).toFixed(2)}`);
    });
    const key = layerMaterialKey(representative);
    const labelY = yForDepth((representative.depthFrom + representative.depthTo) / 2);
    return `
      <g>
        <title>${escapeHtml(`${representative.label}: ${representative.description}`)}</title>
        <polygon points="${[...pointsTop, ...pointsBottom].join(' ')}"
          fill="url(#${lithologyPatternId(key)})" stroke="${representative.uncertain ? '#f59e0b' : '#64748b'}"
          stroke-width="${representative.uncertain ? '1.6' : '1'}" ${representative.uncertain ? 'stroke-dasharray="7 5"' : ''} opacity="0.88" />
        ${layerIndex < 6 ? `<text x="${left + 18}" y="${(labelY + 4).toFixed(2)}" class="profile-label">${escapeHtml(compactSvgText(representative.label, 20))}</text>` : ''}
      </g>
    `;
  };

  return `
    <section class="data-section" id="ground-cross-section">
      <div class="section-heading">
        <h2>Ground Model Cross-Section</h2>
        <p>Evidence-backed schematic connecting retained borehole intervals. Boundaries remain approximate until checked against the source logs.</p>
      </div>
      <div class="profile-shell cross-section-shell">
        <svg class="ground-cross-section" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI-assisted ground model cross-section">
          <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#0f172a" />
          ${renderLithologyDefs(layerKeys)}
          ${ticks.map((tick) => {
            const y = yForDepth(tick);
            return `
              <line x1="${left - 34}" y1="${y.toFixed(2)}" x2="${right + 12}" y2="${y.toFixed(2)}" stroke="#334155" stroke-width="1" />
              <text x="14" y="${(y + 4).toFixed(2)}" class="profile-axis">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))} ${escapeHtml(profile.depthUnit)}</text>
            `;
          }).join('')}
          ${Array.from({ length: Math.min(maxLayerCount, 8) }, (_value, index) => layerBand(index)).join('')}
          ${profile.columns.map((column, index) => {
            const x = columnX(index);
            const depth = column.totalDepth ?? profile.maxDepth;
            const bottomY = yForDepth(depth);
            const waterY = column.waterTableDepth != null ? yForDepth(column.waterTableDepth) : null;
            return `
              <g>
                <line x1="${x.toFixed(2)}" y1="${plotTop - 12}" x2="${x.toFixed(2)}" y2="${bottomY.toFixed(2)}" stroke="#e2e8f0" stroke-width="2.2" stroke-dasharray="5 4" />
                <circle cx="${x.toFixed(2)}" cy="${plotTop - 12}" r="6" fill="#22d3ee" stroke="#0f172a" stroke-width="2" />
                <text x="${x.toFixed(2)}" y="30" text-anchor="middle" class="profile-title">${escapeHtml(column.boreholeId)}</text>
                <text x="${x.toFixed(2)}" y="${height - 46}" text-anchor="middle" class="profile-small">TD ${escapeHtml(depth.toFixed(2))} ${escapeHtml(profile.depthUnit)}</text>
                ${waterY != null ? `
                  <line x1="${(x - 34).toFixed(2)}" y1="${waterY.toFixed(2)}" x2="${(x + 34).toFixed(2)}" y2="${waterY.toFixed(2)}" stroke="#0891b2" stroke-width="2" />
                  <text x="${(x - 40).toFixed(2)}" y="${(waterY - 7).toFixed(2)}" class="profile-water">GW</text>
                ` : ''}
              </g>
            `;
          }).join('')}
          <text x="${left}" y="${height - 16}" class="profile-axis">Dashed outlines mark inferred or approximate contacts.</text>
        </svg>
      </div>
      ${renderProfileLegend(profile)}
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

  const plotTop = 46;
  const plotHeight = 320;
  const columnWidth = 82;
  const gap = 54;
  const axisWidth = 76;
  const width = Math.max(520, axisWidth + profile.columns.length * columnWidth + Math.max(0, profile.columns.length - 1) * gap + 46);
  const height = plotTop + plotHeight + 72;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((profile.maxDepth * index / 5).toFixed(2)));
  const layerKeys = profile.columns.flatMap((column) => column.layers.map((layer) => layerMaterialKey(layer)));
  const layerRect = (layer: IngestDossierBoreholeProfileLayer, columnIndex: number): string => {
    const x = axisWidth + columnIndex * (columnWidth + gap);
    const y = plotTop + (Math.max(0, layer.depthFrom) / profile.maxDepth) * plotHeight;
    const rectHeight = Math.max(10, ((Math.min(profile.maxDepth, layer.depthTo) - Math.max(0, layer.depthFrom)) / profile.maxDepth) * plotHeight);
    const midY = y + rectHeight / 2;
    const key = layerMaterialKey(layer);
    const showText = rectHeight >= 24;
    const showSource = rectHeight >= 42;
    return `
      <g>
        <title>${escapeHtml(`${layer.depthFrom.toFixed(2)}-${layer.depthTo.toFixed(2)} ${profile.depthUnit}: ${layer.description}`)}</title>
        <rect x="${x}" y="${y.toFixed(2)}" width="${columnWidth}" height="${rectHeight.toFixed(2)}" rx="4"
          fill="url(#${lithologyPatternId(key)})" stroke="${layer.uncertain ? '#f59e0b' : '#7a8aa0'}" stroke-width="${layer.uncertain ? '1.6' : '1'}" ${layer.uncertain ? 'stroke-dasharray="6 5"' : ''} />
        ${showText ? `<text x="${x + columnWidth / 2}" y="${(midY - (showSource ? 3 : -4)).toFixed(2)}" text-anchor="middle" class="profile-label">${escapeHtml(compactSvgText(layer.uscsSymbol ?? layer.label, 10))}</text>` : ''}
        ${showSource ? `<text x="${x + columnWidth / 2}" y="${(midY + 13).toFixed(2)}" text-anchor="middle" class="profile-small">${escapeHtml(layerSourceLabel(layer))}</text>` : ''}
      </g>
    `;
  };

  return `
    <section class="data-section" id="boreholes">
      <div class="section-heading">
        <h2>${escapeHtml(profile.title)}</h2>
        <p>Depth-scaled borehole columns with lithology colors and source-page cues. Detailed descriptions are kept in the evidence legend to prevent label overlap.</p>
      </div>
      <div class="profile-shell">
        <svg class="borehole-profile" viewBox="0 0 ${width} ${height}" role="img" aria-label="Borehole stratigraphy profile">
          <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#0f172a" />
          ${renderLithologyDefs(layerKeys)}
          ${ticks.map((tick) => {
            const y = plotTop + (tick / profile.maxDepth) * plotHeight;
            return `
              <line x1="48" y1="${y.toFixed(2)}" x2="${width - 24}" y2="${y.toFixed(2)}" stroke="#334155" stroke-width="1" />
              <text x="8" y="${(y + 4).toFixed(2)}" class="profile-axis">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))} ${escapeHtml(profile.depthUnit)}</text>
            `;
          }).join('')}
          ${profile.columns.map((column, columnIndex) => {
            const x = axisWidth + columnIndex * (columnWidth + gap);
            const waterY = column.waterTableDepth != null
              ? plotTop + (column.waterTableDepth / profile.maxDepth) * plotHeight
              : null;
            return `
              <text x="${x + columnWidth / 2}" y="24" text-anchor="middle" class="profile-title">${escapeHtml(column.boreholeId)}</text>
              ${column.layers.map((layer) => layerRect(layer, columnIndex)).join('')}
              ${waterY != null ? `
                <line x1="${x - 8}" y1="${waterY.toFixed(2)}" x2="${x + columnWidth + 8}" y2="${waterY.toFixed(2)}" stroke="#06b6d4" stroke-width="2" />
                <text x="${x + 8}" y="${(waterY - 6).toFixed(2)}" class="profile-water">Groundwater</text>
              ` : ''}
              <text x="${x + columnWidth / 2}" y="${height - 24}" text-anchor="middle" class="profile-small">TD ${escapeHtml(column.totalDepth != null ? `${column.totalDepth.toFixed(2)} m` : 'unavailable')}</text>
            `;
          }).join('')}
        </svg>
      </div>
      ${renderProfileLegend(profile)}
      ${profile.notes.length > 0 ? `<ul class="profile-notes">${profile.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}
    </section>
  `;
}

function groundModelMaterialKey(description: string): string {
  const text = description.toLowerCase();
  if (/bedrock|fresh\s+rock|strong\s+(?:rock|shale|sandstone|siltstone|gneiss)/.test(text)) return 'bedrock';
  if (/weathered|fractured|rock|shale|sandstone|siltstone|gneiss/.test(text)) return 'weathered-rock';
  if (/gravel|\bgm\b|\bgp\b|\bgw\b/.test(text)) return 'gravel';
  if (/sand|\bsm\b|\bsp\b|\bsw\b|\bsc\b/.test(text)) return 'sand';
  if (/clay|clayey|\bci\b|\bcl\b|\bch\b/.test(text)) return 'clay';
  if (/silt|silty|\bml\b|\bmh\b/.test(text)) return 'silt';
  if (/fill|made\s+ground|debris/.test(text)) return 'fill';
  return 'mixed';
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function groundModelMaxDepth(model: GroundModel): number {
  const depths = [
    ...model.boreholes.flatMap((borehole) => [
      ...borehole.sptTests.map((test) => test.depth),
      ...borehole.strata.flatMap((stratum) => [stratum.topDepth, stratum.bottomDepth]),
      ...borehole.groundwater.map((observation) => observation.depth),
    ]),
    ...model.groundwater.map((observation) => observation.depth),
    ...model.labTests.map((test) => test.depth),
    ...model.parameters.map((parameter) => parameter.depth),
  ].filter((value): value is number => finiteNumber(value) && value >= 0);
  return Math.max(1, ...depths);
}

function stratumTopDepth(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[]): number {
  if (finiteNumber(stratum.topDepth)) return Math.max(0, stratum.topDepth);
  if (index === 0) return 0;
  return sorted[index - 1]?.bottomDepth ?? sorted[index - 1]?.topDepth ?? 0;
}

function stratumBottomDepth(stratum: GroundModelStratum, index: number, sorted: GroundModelStratum[], maxDepth: number): number {
  if (finiteNumber(stratum.bottomDepth)) return Math.max(0, stratum.bottomDepth);
  const nextTop = sorted.slice(index + 1).find((candidate) => finiteNumber(candidate.topDepth))?.topDepth;
  if (finiteNumber(nextTop)) return nextTop;
  const top = stratumTopDepth(stratum, index, sorted);
  return Math.min(maxDepth, Math.max(top + Math.max(0.5, maxDepth * 0.08), top));
}

function renderGroundModelStripLogs(model: GroundModel): string {
  if (model.boreholes.length === 0) {
    return '<div class="empty-state">No borehole evidence was available for strip-log rendering.</div>';
  }

  const maxDepth = groundModelMaxDepth(model);
  const plotTop = 42;
  const plotHeight = 280;
  const axisWidth = 54;
  const columnWidth = 58;
  const gap = 74;
  const width = Math.max(520, axisWidth + model.boreholes.length * columnWidth + Math.max(0, model.boreholes.length - 1) * gap + 120);
  const height = plotTop + plotHeight + 54;
  const yForDepth = (depth: number) => plotTop + (Math.max(0, Math.min(maxDepth, depth)) / maxDepth) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((maxDepth * index / 5).toFixed(2)));
  const layerKeys = model.boreholes.flatMap((borehole) => borehole.strata.map((stratum) => groundModelMaterialKey(stratum.description)));

  const columns = model.boreholes.map((borehole, boreholeIndex) => {
    const x = axisWidth + boreholeIndex * (columnWidth + gap);
    const sorted = [...borehole.strata].sort((left, right) => stratumTopDepth(left, 0, []) - stratumTopDepth(right, 0, []));
    const strata = sorted.map((stratum, stratumIndex) => {
      const top = stratumTopDepth(stratum, stratumIndex, sorted);
      const bottom = stratumBottomDepth(stratum, stratumIndex, sorted, maxDepth);
      const y = yForDepth(top);
      const height = Math.max(8, yForDepth(bottom) - y);
      const key = groundModelMaterialKey(stratum.description);
      const uncertain = !finiteNumber(stratum.topDepth) || !finiteNumber(stratum.bottomDepth) || stratum.warnings.length > 0;
      return `
        <g>
          <title>${escapeHtml(`${borehole.id}: ${top.toFixed(2)}-${bottom.toFixed(2)} m | ${stratum.description} | evidence ${stratum.evidenceIds.join(', ') || '-'}`)}</title>
          <rect x="${x}" y="${y.toFixed(2)}" width="${columnWidth}" height="${height.toFixed(2)}" rx="4"
            fill="url(#${lithologyPatternId(key)})" stroke="${uncertain ? '#f59e0b' : '#7a8aa0'}" stroke-width="${uncertain ? '1.6' : '1'}" ${uncertain ? 'stroke-dasharray="6 5"' : ''} />
          ${height >= 28 ? `<text x="${x + columnWidth / 2}" y="${(y + Math.min(height - 8, 18)).toFixed(2)}" text-anchor="middle" class="profile-label">${escapeHtml(compactSvgText(key, 9))}</text>` : ''}
        </g>
      `;
    }).join('');
    const spt = borehole.sptTests.map((test) => {
      const y = yForDepth(test.depth);
      return `
        <g>
          <title>${escapeHtml(`${borehole.id}: SPT N=${test.nValue} at ${test.depth} m | evidence ${test.evidenceIds.join(', ') || '-'}`)}</title>
          <circle cx="${x + columnWidth + 14}" cy="${y.toFixed(2)}" r="4.5" fill="#38bdf8" stroke="#0f172a" stroke-width="1.5" />
          <text x="${x + columnWidth + 22}" y="${(y + 4).toFixed(2)}" class="profile-small">N${escapeHtml(test.nValue)}</text>
        </g>
      `;
    }).join('');
    const groundwater = borehole.groundwater.map((observation) => {
      const y = yForDepth(observation.depth);
      return `
        <g>
          <title>${escapeHtml(`${borehole.id}: groundwater ${observation.depth} m bgl | evidence ${observation.evidenceIds.join(', ') || '-'}`)}</title>
          <line x1="${x - 7}" y1="${y.toFixed(2)}" x2="${x + columnWidth + 8}" y2="${y.toFixed(2)}" stroke="#67e8f9" stroke-width="2" stroke-dasharray="6 4" />
          <text x="${x + columnWidth / 2}" y="${(y - 6).toFixed(2)}" text-anchor="middle" class="profile-water">GWL</text>
        </g>
      `;
    }).join('');

    return `
      <g>
        <text x="${x + columnWidth / 2}" y="24" text-anchor="middle" class="profile-title">${escapeHtml(borehole.id)}</text>
        <rect x="${x}" y="${plotTop}" width="${columnWidth}" height="${plotHeight}" rx="4" fill="#111827" stroke="#64748b" stroke-width="1" />
        ${strata || `<text x="${x + columnWidth / 2}" y="${plotTop + plotHeight / 2}" text-anchor="middle" class="profile-small">No strata</text>`}
        ${groundwater}
        ${spt}
      </g>
    `;
  }).join('');

  return `
    <div class="gm-chart-shell">
      <svg class="gm-strip-log" viewBox="0 0 ${width} ${height}" style="width: ${width}px; max-width: none;" role="img" aria-label="GroundModel borehole strip logs">
        <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#0f172a" />
        ${renderLithologyDefs(layerKeys)}
        ${ticks.map((tick) => {
          const y = yForDepth(tick);
          return `<line x1="46" y1="${y.toFixed(2)}" x2="${width - 24}" y2="${y.toFixed(2)}" stroke="#334155" /><text x="8" y="${(y + 4).toFixed(2)}" class="profile-axis">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))} m</text>`;
        }).join('')}
        ${columns}
      </svg>
    </div>
  `;
}

function renderGroundModelSptPlot(model: GroundModel): string {
  const tests = model.boreholes.flatMap((borehole) => borehole.sptTests.map((test) => ({ borehole, test })));
  if (tests.length === 0) {
    return '<div class="empty-state">No depth-bound SPT N-values were retained.</div>';
  }

  const width = 520;
  const height = 290;
  const pad = 48;
  const maxDepth = groundModelMaxDepth(model);
  const maxN = Math.max(1, ...tests.map(({ test }) => test.nValue));
  const xForN = (nValue: number) => pad + (nValue / maxN) * (width - pad * 2);
  const yForDepth = (depth: number) => pad + (depth / maxDepth) * (height - pad * 2);
  const colors = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#f87171'];
  const boreholeIndex = new Map(model.boreholes.map((borehole, index) => [borehole.id, index]));

  return `
    <div class="gm-chart-shell">
      <svg class="gm-depth-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="SPT N-value versus depth plot">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#0f172a" />
        <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#111827" stroke="#334155" />
        ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const x = pad + ratio * (width - pad * 2);
          const n = ratio * maxN;
          return `<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${height - pad}" stroke="#1e293b" /><text x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" class="profile-axis">${escapeHtml(n.toFixed(0))}</text>`;
        }).join('')}
        ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad + ratio * (height - pad * 2);
          const depth = ratio * maxDepth;
          return `<line x1="${pad}" y1="${y.toFixed(2)}" x2="${width - pad}" y2="${y.toFixed(2)}" stroke="#1e293b" /><text x="${pad - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="profile-axis">${escapeHtml(depth.toFixed(1))}</text>`;
        }).join('')}
        ${tests.map(({ borehole, test }) => {
          const color = colors[(boreholeIndex.get(borehole.id) ?? 0) % colors.length];
          return `<circle cx="${xForN(test.nValue).toFixed(2)}" cy="${yForDepth(test.depth).toFixed(2)}" r="5" fill="${color}" stroke="#0f172a" stroke-width="1.5"><title>${escapeHtml(`${borehole.id}: N=${test.nValue}, depth ${test.depth} m, evidence ${test.evidenceIds.join(', ') || '-'}`)}</title></circle>`;
        }).join('')}
        <text x="${width / 2}" y="${height - 4}" text-anchor="middle" class="profile-axis">SPT N-value</text>
        <text x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})" text-anchor="middle" class="profile-axis">Depth (m)</text>
      </svg>
    </div>
  `;
}

function numericGroundModelParameterGroups(model: GroundModel): Array<{ name: string; unit?: string; parameters: GroundModelParameter[] }> {
  const groups = new Map<string, { name: string; unit?: string; parameters: GroundModelParameter[] }>();
  for (const parameter of model.parameters) {
    const value = Number(parameter.value);
    if (!Number.isFinite(value) || !finiteNumber(parameter.depth)) continue;
    const key = `${parameter.name}::${parameter.unit ?? ''}`;
    const group = groups.get(key) ?? { name: parameter.name, unit: parameter.unit, parameters: [] };
    group.parameters.push(parameter);
    groups.set(key, group);
  }
  return [...groups.values()].slice(0, 6);
}

function renderGroundModelLabCharts(model: GroundModel): string {
  const groups = numericGroundModelParameterGroups(model);
  if (groups.length === 0) {
    return '<div class="empty-state">No depth-bound lab or design parameters were retained for plotting.</div>';
  }

  return `<div class="gm-mini-grid">${groups.map((group) => {
    const width = 300;
    const height = 190;
    const pad = 38;
    const values = group.parameters.map((parameter) => Number(parameter.value));
    const depths = group.parameters.map((parameter) => parameter.depth ?? 0);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue === minValue ? 1 : maxValue - minValue;
    const maxDepth = Math.max(groundModelMaxDepth(model), ...depths);
    const xForValue = (value: number) => pad + ((value - minValue) / valueRange) * (width - pad * 2);
    const yForDepth = (depth: number) => pad + (depth / maxDepth) * (height - pad * 2);
    return `
      <article class="gm-mini-card">
        <h4>${escapeHtml(compactSvgText(group.name, 34))}${group.unit ? ` (${escapeHtml(group.unit)})` : ''}</h4>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(group.name)} versus depth plot">
          <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#0f172a" />
          <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#111827" stroke="#334155" />
          ${group.parameters.map((parameter) => `<circle cx="${xForValue(Number(parameter.value)).toFixed(2)}" cy="${yForDepth(parameter.depth ?? 0).toFixed(2)}" r="4.5" fill="#34d399" stroke="#0f172a" stroke-width="1.4"><title>${escapeHtml(`${parameter.name}: ${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''} at ${parameter.depth} m | ${parameter.boreholeId ?? '-'} | evidence ${parameter.evidenceIds.join(', ') || '-'}`)}</title></circle>`).join('')}
          <text x="${pad}" y="${height - 12}" class="profile-axis">${escapeHtml(minValue.toFixed(1))}</text>
          <text x="${width - pad}" y="${height - 12}" text-anchor="end" class="profile-axis">${escapeHtml(maxValue.toFixed(1))}</text>
          <text x="10" y="${pad + 4}" class="profile-axis">0 m</text>
          <text x="10" y="${height - pad + 4}" class="profile-axis">${escapeHtml(maxDepth.toFixed(1))} m</text>
        </svg>
      </article>
    `;
  }).join('')}</div>`;
}

function renderGroundModelWaterSummary(model: GroundModel): string {
  if (model.groundwater.length === 0 && model.monitoringSeries.length === 0) {
    return '<div class="empty-state">No groundwater or monitoring observations were retained.</div>';
  }

  const rows = [
    ...model.groundwater.map((observation) => `<tr><td>Groundwater</td><td>${escapeHtml(observation.boreholeId ?? '-')}</td><td>${escapeHtml(`${observation.depth} m bgl`)}</td><td>${escapeHtml(observation.evidenceIds.join(', ') || '-')}</td></tr>`),
    ...model.monitoringSeries.map((series) => `<tr><td>${escapeHtml(series.kind)}</td><td>${escapeHtml(series.sourcePath)}</td><td>${escapeHtml(`${series.sampleCount} samples`)}</td><td>${escapeHtml(series.evidenceIds.join(', ') || '-')}</td></tr>`),
  ];

  return `
    <div class="table-shell gm-monitoring-table">
      <table>
        <thead><tr><th>Type</th><th>Source / Borehole</th><th>Observation</th><th>Evidence</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

function renderGroundModelVisualReview(model: GroundModel | undefined): string {
  const hasVisualEvidence = model
    && (
      model.boreholes.some((borehole) => borehole.strata.length > 0 || borehole.sptTests.length > 0 || borehole.groundwater.length > 0)
      || model.groundwater.length > 0
      || model.parameters.length > 0
      || model.monitoringSeries.length > 0
    );
  if (!model || !hasVisualEvidence) {
    return `
      <section class="data-section" id="groundmodel-visual-review">
        <div class="section-heading">
          <h2>GroundModel Visual Review</h2>
          <p>Structured visual review needs borehole, depth, and material evidence.</p>
        </div>
        <div class="empty-state">No GroundModel visual review could be generated from retained PDF evidence.</div>
      </section>
    `;
  }

  const waterPanelTitle = model.monitoringSeries.length > 0 ? 'Groundwater and Monitoring' : 'Groundwater Summary';
  return `
    <section class="data-section" id="groundmodel-visual-review">
      <div class="section-heading">
        <h2>GroundModel Visual Review</h2>
        <p>Provider-neutral engineering visuals adapted from source-page evidence. Use these for review routing, not as final design stratigraphy.</p>
      </div>
      <div class="gm-visual-grid">
        <article class="gm-panel gm-panel-wide">
          <h3>Borehole Strip Logs</h3>
          ${renderGroundModelStripLogs(model)}
        </article>
        <article class="gm-panel">
          <h3>SPT N vs Depth</h3>
          ${renderGroundModelSptPlot(model)}
        </article>
        <article class="gm-panel gm-panel-wide">
          <h3>Lab Parameter Depth Charts</h3>
          ${renderGroundModelLabCharts(model)}
        </article>
        <article class="gm-panel">
          <h3>${waterPanelTitle}</h3>
          ${renderGroundModelWaterSummary(model)}
        </article>
      </div>
      ${model.warnings.length > 0 ? `<ul class="profile-notes">${model.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
    </section>
  `;
}

function lightMaterialClass(className: IntegratedReviewMaterialClass): 'made' | 'clay' | 'sand' | 'gravel' {
  if (className === 'fill') return 'made';
  if (className === 'clay') return 'clay';
  if (className === 'sand' || className === 'silt' || className === 'mixed') return 'sand';
  return 'gravel';
}

function lightMaterialColor(className: IntegratedReviewMaterialClass): string {
  switch (lightMaterialClass(className)) {
    case 'made': return '#8b5a2b';
    case 'clay': return '#c98b67';
    case 'sand': return '#f5d77b';
    default: return '#a3a3a3';
  }
}

function renderLightMetric(label: string, value: string, note: string, status: 'good' | 'warn' | 'blue' = 'blue'): string {
  return `
    <article class="metric">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value status-${status}">${escapeHtml(value)}</div>
      <div class="note">${escapeHtml(note)}</div>
    </article>
  `;
}

function renderLightEvidenceBox(input: {
  type: IntegratedReviewSourceRegionType;
  id: string;
  label: string;
  style: string;
  mode: 'layout' | 'reconstructed';
  status?: 'accepted' | 'review_recommended';
  regionId?: string;
  text?: string;
}): string {
  const classes = [
    'evidence-box',
    input.status === 'review_recommended' ? 'warn' : '',
  ].filter(Boolean).join(' ');
  const regionAttr = input.regionId ? ` data-region-id="${escapeHtml(input.regionId)}"` : '';
  const text = input.text ? `<span class="layout-region-text">${escapeHtml(compactSvgText(input.text, 120))}</span>` : '';
  return `<button class="${classes}" type="button" data-type="${escapeHtml(input.type)}" data-id="${escapeHtml(input.id)}" data-region-mode="${escapeHtml(input.mode)}"${regionAttr} aria-label="${escapeHtml(input.label)}" title="${escapeHtml(input.label)}" style="${escapeHtml(input.style)}">${text}</button>`;
}

function collectBoreholeEvidenceIds(borehole: IntegratedReviewBorehole): Set<string> {
  return new Set([
    ...borehole.evidenceIds,
    borehole.coordinateEvidenceId,
    ...borehole.strata.map((stratum) => stratum.evidenceId),
    ...borehole.spt.map((point) => point.evidenceId),
    ...borehole.groundwater.map((point) => point.evidenceId),
    ...borehole.parameters.map((parameter) => parameter.evidenceId),
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0));
}

function sourcePageScoreForBorehole(page: IntegratedReviewSourcePage, borehole: IntegratedReviewBorehole): number {
  const evidenceIds = collectBoreholeEvidenceIds(borehole);
  const pageMatch = borehole.sourcePages.includes(page.pageNumber) ? 3 : 0;
  const regionMatches = page.regions.filter((region) => evidenceIds.has(region.evidenceId)).length * 5;
  const textMatches = page.regions.filter((region) => region.text.toUpperCase().includes(borehole.id.toUpperCase())).length;
  return pageMatch + regionMatches + textMatches;
}

function selectSourcePageForBorehole(
  borehole: IntegratedReviewBorehole,
  model: IntegratedReviewModel,
): IntegratedReviewSourcePage | undefined {
  const ranked = model.sourcePages
    .filter((page) => page.regions.length > 0)
    .map((page) => ({ page, score: sourcePageScoreForBorehole(page, borehole) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.page.pageNumber - right.page.pageNumber);
  return ranked[0]?.page;
}

function layoutRegionStyle(region: IntegratedReviewSourceRegion, page: IntegratedReviewSourcePage): string {
  const [x1, y1, x2, y2] = region.bbox;
  const left = (x1 / page.width) * 100;
  const top = (y1 / page.height) * 100;
  const width = ((x2 - x1) / page.width) * 100;
  const height = ((y2 - y1) / page.height) * 100;
  return `left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${Math.max(0.3, width).toFixed(3)}%;height:${Math.max(0.3, height).toFixed(3)}%`;
}

function renderLightLayoutSourcePage(
  page: IntegratedReviewSourcePage,
  borehole: IntegratedReviewBorehole,
  model: IntegratedReviewModel,
): string {
  const evidenceIds = collectBoreholeEvidenceIds(borehole);
  const sortedRegions = [...page.regions].sort((left, right) =>
    left.bbox[1] - right.bbox[1] || left.bbox[0] - right.bbox[0]);
  return `
    <div class="layout-source" aria-label="GLM-OCR source layout for ${escapeHtml(borehole.id)}">
      <div class="layout-meta">
        <span>Page ${escapeHtml(page.pageNumber)}</span>
        <span>${escapeHtml(page.method)}</span>
        <span>${escapeHtml(`${Math.round(page.width)} x ${Math.round(page.height)}`)}</span>
        <span>${escapeHtml(page.sourcePath)}</span>
      </div>
      <div class="layout-page" style="aspect-ratio:${escapeHtml(page.width.toFixed(0))}/${escapeHtml(page.height.toFixed(0))}">
        <div class="layout-grid-label">GLM-OCR layout regions linked to ${escapeHtml(model.run.models.ocr)}</div>
        ${sortedRegions.map((region) => {
          const linked = evidenceIds.has(region.evidenceId);
          const label = `${region.type} evidence ${region.evidenceId}: ${region.text || region.label}`;
          return renderLightEvidenceBox({
            type: region.type,
            id: region.evidenceId,
            regionId: region.id,
            label,
            mode: 'layout',
            status: linked ? region.status : 'review_recommended',
            style: layoutRegionStyle(region, page),
            text: region.text || region.label,
          });
        }).join('')}
      </div>
    </div>
  `;
}

function renderLightSourcePage(borehole: IntegratedReviewBorehole | undefined, model: IntegratedReviewModel): string {
  if (!borehole) {
    return '<div class="empty-light">No borehole object was available for source-page review.</div>';
  }
  const layoutPage = selectSourcePageForBorehole(borehole, model);
  if (layoutPage) {
    return renderLightLayoutSourcePage(layoutPage, borehole, model);
  }
  const maxDepth = integratedBoreholeMaxDepth(borehole);
  const yPct = (depth: number) => 7 + (Math.max(0, Math.min(maxDepth, depth)) / maxDepth) * 91;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((maxDepth * index / 5).toFixed(2)));
  const coordinateValue = borehole.latitude != null && borehole.longitude != null
    ? `${borehole.latitude.toFixed(6)}, ${borehole.longitude.toFixed(6)}`
    : borehole.easting != null && borehole.northing != null
      ? `E ${borehole.easting.toFixed(2)} / N ${borehole.northing.toFixed(2)}`
      : 'not resolved';
  return `
    <div class="mock-page" aria-label="Extracted source borehole log page">
      <div class="page-title"><span>GROUND INVESTIGATION LOG</span><span>${escapeHtml(borehole.id)}</span></div>
      <div class="page-meta">
        <div>Project: ${escapeHtml(model.project.name)}</div><div>Exploratory Hole: ${escapeHtml(borehole.id)}</div>
        <div>Ground Level: ${escapeHtml(borehole.groundLevel.toFixed(2))} ${escapeHtml(model.project.verticalDatum)}</div><div>Final Depth: ${escapeHtml(borehole.totalDepth.toFixed(2))} m bgl</div>
        <div>${escapeHtml(coordinateValue)}</div><div>${escapeHtml(sourcePagesLabel(borehole.sourcePages))}</div>
      </div>
      ${renderLightEvidenceBox({ type: 'header', id: borehole.evidenceIds[0] ?? `${borehole.id}-id`, label: 'Borehole ID evidence', mode: 'reconstructed', style: 'left:63%;top:10.2%;width:22%;height:3.8%' })}
      ${renderLightEvidenceBox({ type: 'coordinates', id: borehole.coordinateEvidenceId ?? `${borehole.id}-coords`, label: 'Coordinate evidence', mode: 'reconstructed', style: 'left:5.5%;top:16.7%;width:83%;height:2.0%' })}
      ${renderLightEvidenceBox({ type: 'totalDepth', id: `${borehole.id}-td`, label: 'Total depth evidence', mode: 'reconstructed', style: 'left:50.5%;top:14.1%;width:38%;height:3.2%' })}
      <div class="log-frame">
        <div class="col c-depth"><div class="col-label">Depth<br>m</div></div>
        <div class="col c-lith"><div class="col-label">Legend</div></div>
        <div class="col c-desc"><div class="col-label">Strata description</div></div>
        <div class="col c-sample"><div class="col-label">Sample</div></div>
        <div class="col c-spt"><div class="col-label">SPT</div></div>
        <div class="col c-water"><div class="col-label">Water</div></div>
        <div class="col c-remarks"><div class="col-label">Remarks</div></div>
        ${ticks.map((tick) => `<div class="depth-tick" style="top:${yPct(tick).toFixed(3)}%"><span>${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))}</span></div>`).join('')}
        ${borehole.strata.map((stratum) => {
          const top = yPct(stratum.top);
          const base = yPct(stratum.base);
          const height = Math.max(3.8, base - top);
          const material = lightMaterialClass(stratum.className);
          return `
            <div class="hatch ${material}" style="top:${top.toFixed(3)}%;height:${height.toFixed(3)}%"></div>
            <div class="layer-line ${stratum.status === 'accepted' ? '' : 'review'}" style="top:${base.toFixed(3)}%"></div>
            <div class="desc-text" style="top:${(top + 1).toFixed(3)}%;height:${Math.max(4, height - 1).toFixed(3)}%">${escapeHtml(stratum.description)}</div>
            ${renderLightEvidenceBox({ type: 'strata', id: stratum.evidenceId, label: `${stratum.name} evidence`, mode: 'reconstructed', status: stratum.status, style: `left:23%;top:${(top + 0.7).toFixed(3)}%;width:34%;height:${Math.max(4.2, Math.min(8, height - 1)).toFixed(3)}%` })}
          `;
        }).join('')}
        ${borehole.spt.map((spt) => {
          const y = yPct(spt.depth);
          return `
            <div class="spt-text" style="top:${(y - 0.7).toFixed(3)}%">${escapeHtml(spt.label.replace(/^N/i, 'N='))}</div>
            ${renderLightEvidenceBox({ type: 'spt', id: spt.evidenceId, label: `${spt.label} evidence`, mode: 'reconstructed', style: `left:72.5%;top:${(y - 1.2).toFixed(3)}%;width:10.5%;height:2.6%` })}
          `;
        }).join('')}
        ${borehole.groundwater.map((water) => {
          const y = yPct(water.depth);
          return `
            <div class="water-text" style="top:${(y - 0.9).toFixed(3)}%">GW</div>
            ${renderLightEvidenceBox({ type: 'water', id: water.evidenceId, label: 'Groundwater symbol evidence', mode: 'reconstructed', status: 'review_recommended', style: `left:84.7%;top:${(y - 1.3).toFixed(3)}%;width:6.8%;height:3.0%` })}
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderLightStripLog(borehole: IntegratedReviewBorehole | undefined, model: IntegratedReviewModel): string {
  if (!borehole) {
    return '<div class="empty-light">No borehole object was available for strip-log rendering.</div>';
  }
  const maxDepth = integratedBoreholeMaxDepth(borehole);
  const top = 82;
  const height = 560;
  const yForDepth = (depth: number) => top + (Math.max(0, Math.min(maxDepth, depth)) / maxDepth) * height;
  const ticks = Array.from({ length: 6 }, (_value, index) => Number((maxDepth * index / 5).toFixed(2)));
  return `
    <div class="svg-wrap">
      <svg width="430" height="720" viewBox="0 0 430 720" role="img" aria-label="Rendered borehole log">
        <defs>
          <pattern id="strip-made" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#8b5a2b" opacity=".75"/><path d="M0 10 L12 0" stroke="#6b3f1d" stroke-width="2" opacity=".5"/></pattern>
          <pattern id="strip-clay" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f3d3c1"/><line x1="0" y1="0" x2="0" y2="8" stroke="#8a4d33" stroke-width="2" opacity=".55"/></pattern>
          <pattern id="strip-sand" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#f5d77b"/><circle cx="2" cy="2" r="1.2" fill="#8a6a10"/><circle cx="7" cy="6" r="1.2" fill="#8a6a10"/></pattern>
          <pattern id="strip-gravel" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#d4d4d4"/><circle cx="4" cy="5" r="2" fill="#64748b"/><circle cx="10" cy="10" r="2.4" fill="#64748b"/></pattern>
        </defs>
        <rect x="0" y="0" width="430" height="720" rx="14" fill="#ffffff"/>
        <text x="20" y="32" font-size="18" font-weight="850" fill="#111827">${escapeHtml(borehole.id)}</text>
        <text x="20" y="52" font-size="12" fill="#64748b">GL ${escapeHtml(borehole.groundLevel.toFixed(2))} ${escapeHtml(model.project.verticalDatum)} | TD ${escapeHtml(borehole.totalDepth.toFixed(2))} m bgl | ${escapeHtml(sourcePagesLabel(borehole.sourcePages))}</text>
        <line x1="72" y1="${top}" x2="72" y2="${top + height}" stroke="#334155" stroke-width="2"/>
        <line x1="260" y1="${top}" x2="260" y2="${top + height}" stroke="#334155" stroke-width="2"/>
        <line x1="320" y1="${top}" x2="320" y2="${top + height}" stroke="#334155" stroke-width="2"/>
        <line x1="388" y1="${top}" x2="388" y2="${top + height}" stroke="#334155" stroke-width="2"/>
        <text x="24" y="78" font-size="11" font-weight="850" fill="#334155">Depth</text>
        <text x="118" y="78" font-size="11" font-weight="850" fill="#334155">Strata</text>
        <text x="275" y="78" font-size="11" font-weight="850" fill="#334155">SPT N</text>
        <text x="335" y="78" font-size="11" font-weight="850" fill="#334155">Water</text>
        ${ticks.map((tick) => {
          const y = yForDepth(tick);
          return `<text x="30" y="${(y + 4).toFixed(2)}" font-size="10" fill="#475569">${escapeHtml(tick.toFixed(tick % 1 === 0 ? 0 : 1))}</text><line x1="52" y1="${y.toFixed(2)}" x2="388" y2="${y.toFixed(2)}" stroke="#e2e8f0"/>`;
        }).join('')}
        ${borehole.strata.map((stratum) => {
          const y = yForDepth(stratum.top);
          const h = Math.max(2, yForDepth(stratum.base) - y);
          const material = lightMaterialClass(stratum.className);
          return `
            <g class="log-highlight" data-id="${escapeHtml(stratum.evidenceId)}">
              <rect x="72" y="${y.toFixed(2)}" width="188" height="${h.toFixed(2)}" fill="url(#strip-${material})" stroke="${stratum.status === 'accepted' ? '#111827' : '#b7791f'}" stroke-width="1.5" ${stratum.status === 'accepted' ? '' : 'stroke-dasharray="7 5"'}/>
              <text x="84" y="${(y + Math.min(30, h / 2)).toFixed(2)}" font-size="11" fill="#111827">${escapeHtml(compactSvgText(stratum.name, 20))}</text>
              <text x="84" y="${(y + Math.min(46, h / 2 + 16)).toFixed(2)}" font-size="10" fill="#475569">${escapeHtml(stratum.top.toFixed(2))} - ${escapeHtml(stratum.base.toFixed(2))} m</text>
            </g>
          `;
        }).join('')}
        ${borehole.spt.map((spt) => {
          const y = yForDepth(spt.depth);
          return `<g class="log-highlight" data-id="${escapeHtml(spt.evidenceId)}"><circle cx="290" cy="${y.toFixed(2)}" r="9" fill="#dbeafe" stroke="#1d4ed8"/><text x="306" y="${(y + 4).toFixed(2)}" font-size="12" fill="#111827">${escapeHtml(spt.label.replace(/^N/i, ''))}</text></g>`;
        }).join('')}
        ${borehole.groundwater.map((water) => {
          const y = yForDepth(water.depth);
          return `<g class="log-highlight" data-id="${escapeHtml(water.evidenceId)}"><path d="M346 ${y - 6} l18 0 l-9 15 z" fill="#bae6fd" stroke="#0369a1" stroke-width="2"/><text x="334" y="${y + 30}" font-size="10" fill="#0369a1">${escapeHtml(water.depth.toFixed(2))} m</text></g>`;
        }).join('')}
        <rect x="20" y="668" width="390" height="34" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="34" y="689" font-size="11" fill="#475569">Rendered from validated JSON; dashed boundaries require review.</text>
      </svg>
    </div>
  `;
}

function renderLightFields(borehole: IntegratedReviewBorehole | undefined, model: IntegratedReviewModel): string {
  if (!borehole) {
    return '<div class="empty-light">No extracted fields were available.</div>';
  }
  const fields = [
    { id: borehole.evidenceIds[0] ?? `${borehole.id}-id`, type: 'header', title: 'Borehole ID', value: borehole.id, conf: borehole.confidence, status: 'accepted', engine: 'GLM-OCR + GLM-5.1' },
    { id: borehole.coordinateEvidenceId ?? `${borehole.id}-coords`, type: 'header', title: 'Coordinates', value: borehole.easting != null && borehole.northing != null ? `E ${borehole.easting.toFixed(2)} / N ${borehole.northing.toFixed(2)} (${model.project.inputCrs})` : 'not resolved', conf: borehole.confidence, status: 'accepted', engine: 'OCR + CRS validator' },
    { id: `${borehole.id}-td`, type: 'header', title: 'Final depth', value: `${borehole.totalDepth.toFixed(2)} m bgl`, conf: borehole.confidence, status: 'accepted', engine: 'GLM-OCR' },
    ...borehole.strata.map((stratum, index) => ({ id: stratum.evidenceId, type: 'strata', title: `Stratum ${index + 1}`, value: `${stratum.top.toFixed(2)}-${stratum.base.toFixed(2)} m | ${stratum.description}`, conf: stratum.confidence, status: stratum.status === 'accepted' ? 'accepted' : 'review', engine: 'OCR + depth map' })),
    ...borehole.spt.map((spt) => ({ id: spt.evidenceId, type: 'spt', title: 'SPT', value: `${spt.label} at ${spt.depth.toFixed(2)} m`, conf: spt.confidence, status: 'accepted', engine: 'OCR + geometry' })),
    ...borehole.groundwater.map((water) => ({ id: water.evidenceId, type: 'water', title: 'Groundwater', value: `${water.label} at ${water.depth.toFixed(2)} m`, conf: water.confidence, status: 'review', engine: 'vision symbol check' })),
    ...borehole.parameters.map((parameter) => ({
      id: parameter.evidenceId,
      type: 'parameter',
      title: parameter.name,
      value: `${parameter.value}${parameter.depth != null ? ` at ${parameter.depth.toFixed(2)} m` : ''}`,
      conf: parameter.confidence,
      status: 'accepted',
      engine: 'OCR + lab/index parser',
    })),
  ];
  return `
    <div class="fields">
      ${fields.map((field) => {
        const barClass = field.conf >= 0.85 ? '' : field.conf >= 0.7 ? 'warn' : 'bad';
        return `
          <button type="button" class="field-card" data-id="${escapeHtml(field.id)}" data-type="${escapeHtml(field.type)}">
            <div class="field-title"><span>${escapeHtml(field.title)}</span><span class="pill ${field.status === 'accepted' ? 'good' : 'warn'}">${escapeHtml(field.status)}</span></div>
            <div class="field-value">${escapeHtml(field.value)}</div>
            <div class="field-meta"><span>${escapeHtml(integratedPercent(field.conf))} confidence</span><span>${escapeHtml(field.id)}</span><span>${escapeHtml(field.engine)}</span></div>
            <div class="confidence"><span class="${barClass}" style="width:${escapeHtml(Math.round(field.conf * 100))}%"></span></div>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderLightMap(model: IntegratedReviewModel): string {
  const points = model.boreholes.filter((borehole) =>
    borehole.easting != null && borehole.northing != null,
  );
  if (points.length === 0) {
    return '<div class="empty-light">No validated borehole coordinates were available for map rendering.</div>';
  }
  const width = 860;
  const height = 420;
  const pad = 52;
  const xs = points.map((point) => point.easting ?? 0);
  const ys = points.map((point) => point.northing ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xFor = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (width - pad * 2);
  const yFor = (y: number) => height - pad - ((y - minY) / Math.max(1, maxY - minY)) * (height - pad * 2);
  return `
    <div class="map-canvas">
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block" role="img" aria-label="Borehole coordinate map">
        <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#f8fafc"/>
        ${Array.from({ length: 9 }, (_value, index) => `<line x1="${pad + index * ((width - pad * 2) / 8)}" y1="${pad}" x2="${pad + index * ((width - pad * 2) / 8)}" y2="${height - pad}" stroke="#dbe4f0"/><line x1="${pad}" y1="${pad + index * ((height - pad * 2) / 8)}" x2="${width - pad}" y2="${pad + index * ((height - pad * 2) / 8)}" stroke="#dbe4f0"/>`).join('')}
        <polyline points="${points.map((point) => `${xFor(point.easting ?? 0).toFixed(2)},${yFor(point.northing ?? 0).toFixed(2)}`).join(' ')}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map((point, index) => {
          const x = xFor(point.easting ?? 0);
          const y = yFor(point.northing ?? 0);
          return `<g><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${index === 0 ? 11 : 9}" fill="#2563eb" stroke="#ffffff" stroke-width="4"/><text x="${(x + 14).toFixed(2)}" y="${(y - 12).toFixed(2)}" font-size="12" font-weight="850" fill="#172033">${escapeHtml(point.id)}</text></g>`;
        }).join('')}
        <text x="${pad}" y="${height - 18}" font-size="12" fill="#64748b">Source coordinates retained in ${escapeHtml(model.project.inputCrs)}. Map-ready coordinates render only after CRS validation.</text>
      </svg>
    </div>
  `;
}

function renderLightSelectedBorehole(borehole: IntegratedReviewBorehole | undefined, model: IntegratedReviewModel): string {
  if (!borehole) {
    return '<div class="empty-light">No selected borehole was available.</div>';
  }
  return `
    <div class="selected-panel">
      <strong>${escapeHtml(borehole.id)}</strong>
      <div class="selected-grid">
        <div><b>Source</b><br>${escapeHtml(sourcePagesLabel(borehole.sourcePages))}</div><div><b>Confidence</b><br>${escapeHtml(integratedPercent(borehole.confidence))}</div>
        <div><b>Easting</b><br>${escapeHtml(borehole.easting != null ? borehole.easting.toFixed(2) : '-')}</div><div><b>Northing</b><br>${escapeHtml(borehole.northing != null ? borehole.northing.toFixed(2) : '-')}</div>
        <div><b>Latitude</b><br>${escapeHtml(borehole.latitude != null ? borehole.latitude.toFixed(6) : '-')}</div><div><b>Longitude</b><br>${escapeHtml(borehole.longitude != null ? borehole.longitude.toFixed(6) : '-')}</div>
        <div><b>GL</b><br>${escapeHtml(borehole.groundLevel.toFixed(2))} ${escapeHtml(model.project.verticalDatum)}</div><div><b>Total depth</b><br>${escapeHtml(borehole.totalDepth.toFixed(2))} m</div>
      </div>
    </div>
    <div class="crs-card">
      <div class="crs-box"><div class="k">Project</div><div class="v">${escapeHtml(model.project.name)}</div><div class="s">Document: ${escapeHtml(model.run.document)}</div></div>
      <div class="crs-box"><div class="k">Input coordinates</div><div class="v">${escapeHtml(model.project.inputCrs)}</div><div class="s">Source coordinate system retained for checking.</div></div>
      <div class="crs-box"><div class="k">Display coordinates</div><div class="v">${escapeHtml(model.project.displayCrs)}</div><div class="s">Map rendering is gated by CRS validation.</div></div>
      <div class="crs-box"><div class="k">Transform engine</div><div class="v">${escapeHtml(model.project.crsTransformEngine)}</div><div class="s">Production transform must run locally or in trusted infrastructure.</div></div>
    </div>
  `;
}

function renderLightCrossSection(model: IntegratedReviewModel): string {
  const boreholes = model.boreholes.filter((borehole) => borehole.strata.length > 0);
  if (boreholes.length < 2) {
    return '<div class="empty-light">A-A section needs at least two boreholes with retained stratum boundaries.</div>';
  }
  const maxDepth = Math.max(...boreholes.map(integratedBoreholeMaxDepth));
  const width = Math.max(980, 220 + boreholes.length * 210);
  const height = 590;
  const chart = { x0: 86, y0: 86, w: width - 170, h: 360 };
  const xFor = (index: number) => chart.x0 + (index / Math.max(1, boreholes.length - 1)) * chart.w;
  const yForDepth = (depth: number) => chart.y0 + (Math.max(0, Math.min(maxDepth, depth)) / maxDepth) * chart.h;
  const maxLayerCount = Math.max(...boreholes.map((borehole) => borehole.strata.length));
  return `
    <div class="cross-section-wrap">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Professional stratigraphic cross-section">
        <defs>
          <pattern id="aa-made" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#8b5a2b" opacity=".78"/><path d="M0 12 L14 0" stroke="#6b3f1d" stroke-width="2" opacity=".45"/></pattern>
          <pattern id="aa-clay" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#c98b67" opacity=".72"/><line x1="0" y1="0" x2="0" y2="10" stroke="#8a4d33" stroke-width="2" opacity=".45"/></pattern>
          <pattern id="aa-sand" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#f5d77b" opacity=".80"/><circle cx="3" cy="3" r="1.2" fill="#9a7216" opacity=".55"/><circle cx="9" cy="8" r="1.2" fill="#9a7216" opacity=".55"/></pattern>
          <pattern id="aa-gravel" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#a3a3a3" opacity=".72"/><circle cx="5" cy="6" r="2.1" fill="#525252" opacity=".55"/><circle cx="11" cy="11" r="2.5" fill="#525252" opacity=".55"/></pattern>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#ffffff"/>
        <text x="28" y="34" font-size="19" font-weight="850" fill="#111827">A-A Stratigraphic Section Along Borehole Alignment</text>
        <text x="28" y="56" font-size="12" fill="#64748b">Direct log columns are drawn at borehole positions. Dashed layer contacts are interpolated between extracted borehole boundaries.</text>
        <rect x="${chart.x0}" y="${chart.y0}" width="${chart.w}" height="${chart.h}" fill="#f8fafc" stroke="#cbd5e1"/>
        ${Array.from({ length: 6 }, (_value, index) => {
          const depth = Number((maxDepth * index / 5).toFixed(2));
          const y = yForDepth(depth);
          return `<line x1="${chart.x0}" y1="${y.toFixed(2)}" x2="${chart.x0 + chart.w}" y2="${y.toFixed(2)}" stroke="#e2e8f0"/><text x="${chart.x0 - 58}" y="${(y + 4).toFixed(2)}" font-size="10" fill="#475569">${escapeHtml(depth.toFixed(depth % 1 === 0 ? 0 : 1))} m bgl</text>`;
        }).join('')}
        ${Array.from({ length: Math.min(maxLayerCount, 8) }, (_value, layerIndex) => {
          const representative = boreholes.map((borehole) => borehole.strata[layerIndex]).find(Boolean);
          if (!representative) return '';
          const topPoints: string[] = [];
          const bottomPoints: string[] = [];
          boreholes.forEach((borehole, index) => {
            const layer = borehole.strata[layerIndex] ?? representative;
            const x = xFor(index);
            topPoints.push(`${x.toFixed(2)},${yForDepth(layer.top).toFixed(2)}`);
            bottomPoints.unshift(`${x.toFixed(2)},${yForDepth(layer.base).toFixed(2)}`);
          });
          const material = lightMaterialClass(representative.className);
          return `<polygon points="${[...topPoints, ...bottomPoints].join(' ')}" fill="url(#aa-${material})" stroke="${lightMaterialColor(representative.className)}" stroke-width="1.4" stroke-dasharray="${layerIndex === 0 ? '' : '6 5'}" opacity=".88"/>`;
        }).join('')}
        ${boreholes.map((borehole, index) => {
          const x = xFor(index);
          return `
            <g class="bh-log">
              <line x1="${x.toFixed(2)}" y1="${chart.y0}" x2="${x.toFixed(2)}" y2="${yForDepth(integratedBoreholeMaxDepth(borehole)).toFixed(2)}" stroke="#111827" stroke-width="1" opacity=".35"/>
              ${borehole.strata.map((stratum) => `<rect x="${(x - 15).toFixed(2)}" y="${yForDepth(stratum.top).toFixed(2)}" width="30" height="${Math.max(2, yForDepth(stratum.base) - yForDepth(stratum.top)).toFixed(2)}" fill="url(#aa-${lightMaterialClass(stratum.className)})" stroke="${stratum.status === 'accepted' ? '#172033' : '#b7791f'}" stroke-width="1" ${stratum.status === 'accepted' ? '' : 'stroke-dasharray="5 4"'}/>`).join('')}
              ${borehole.spt.map((spt) => `<circle cx="${(x + 24).toFixed(2)}" cy="${yForDepth(spt.depth).toFixed(2)}" r="4.2" fill="#dbeafe" stroke="#1d4ed8"/>`).join('')}
              ${borehole.groundwater.map((water) => `<path d="M${(x - 40).toFixed(2)} ${yForDepth(water.depth) - 5} l15 0 l-7.5 12 z" fill="#bae6fd" stroke="#0369a1" stroke-width="1.5"/>`).join('')}
              <circle cx="${x.toFixed(2)}" cy="${chart.y0}" r="7.5" fill="#2563eb" stroke="#fff" stroke-width="3"/>
              <text x="${(x - 22).toFixed(2)}" y="${chart.y0 - 14}" font-size="12" font-weight="850" fill="#111827">${escapeHtml(borehole.id)}</text>
              <text x="${(x - 24).toFixed(2)}" y="${(yForDepth(integratedBoreholeMaxDepth(borehole)) + 18).toFixed(2)}" font-size="10" fill="#64748b">TD ${escapeHtml(borehole.totalDepth.toFixed(1))} m</text>
            </g>
          `;
        }).join('')}
        <text x="${chart.x0}" y="${height - 28}" font-size="11" fill="#64748b">Vertical exaggeration used for review. Use engineering judgment before adopting interpolated strata surfaces.</text>
      </svg>
    </div>
  `;
}

function renderLightTables(dossier: IngestDossier): string {
  if (dossier.tables.length === 0) {
    return '<div class="empty-light">No audit tables were retained.</div>';
  }
  return `
    <div class="table-panel-grid">
      ${dossier.tables.map((table) => `
        <article class="panel embedded-panel">
          <h2>${escapeHtml(table.title)}${table.description ? `<small>${escapeHtml(table.description)}</small>` : ''}</h2>
          <div class="panel-body table-scroll">
            <table>
              <thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
              <tbody>${table.rows.length > 0 ? table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${escapeHtml(table.columns.length)}">${escapeHtml(table.emptyState ?? 'No rows retained.')}</td></tr>`}</tbody>
            </table>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLightAgentReviews(model: IntegratedReviewModel): string {
  if (model.agentReviews.length === 0) {
    return '<div class="empty-light">No single-agent or swarm review session was attached to this ingest output.</div>';
  }
  return `
    <div class="pipeline">
      ${model.agentReviews.map((review, index) => `
        <div class="step">
          <div class="num">${index + 1}</div>
          <div>
            <strong>${escapeHtml(review.title)}</strong>
            <small>${escapeHtml(review.summary)}</small>
            ${review.warnings.length > 0 ? `<small>${escapeHtml(review.warnings.join(' | '))}</small>` : ''}
          </div>
          <span class="pill ${review.warnings.length > 0 ? 'warn' : 'good'}">${escapeHtml([
            review.mode,
            review.stepCount != null ? `${review.stepCount} steps` : null,
            review.tokens != null ? `${review.tokens} tokens` : null,
          ].filter(Boolean).join(' | '))}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLightValidation(dossier: IngestDossier, model: IntegratedReviewModel): string {
  const warnings = model.quality.warnings.length > 0
    ? model.quality.warnings
    : ['No integrated review warnings were retained.'];
  const json = escapeHtml(JSON.stringify(model, null, 2));
  return `
    <div class="data-grid">
      <div class="panel">
        <h2>Validation workflow <small>extraction, geospatial, and rendering checks</small></h2>
        <div class="tabs">
          <button class="tab active" type="button" data-tab-target="warningsTab">Warnings</button>
          <button class="tab" type="button" data-tab-target="pipelineTab">Pipeline</button>
          <button class="tab" type="button" data-tab-target="agentsTab">Agents</button>
          <button class="tab" type="button" data-tab-target="tablesTab">Tables</button>
        </div>
        <div class="panel-body">
          <div id="warningsTab" class="tab-content active">
            <div class="warning-list">
              ${warnings.map((warning) => `<div class="warning"><strong>Review gate</strong><br>${escapeHtml(warning)}</div>`).join('')}
            </div>
          </div>
          <div id="pipelineTab" class="tab-content">
            <div class="pipeline">
              <div class="step"><div class="num">1</div><div><strong>GLM-OCR layout evidence</strong><small>Text, tables, layout blocks, bboxes, and page dimensions seed the extraction.</small></div><span class="pill good">ready</span></div>
              <div class="step"><div class="num">2</div><div><strong>GLM-5.1 document routing</strong><small>Pages are classified into borehole logs, report narrative, lab data, and ground model evidence.</small></div><span class="pill good">ready</span></div>
              <div class="step"><div class="num">3</div><div><strong>Deterministic depth mapping</strong><small>Depth intervals, SPT records, and groundwater are rendered from structured objects.</small></div><span class="pill good">ready</span></div>
              <div class="step"><div class="num">4</div><div><strong>Vision verification gate</strong><small>Uncertain symbols remain review-gated before engineering reuse.</small></div><span class="pill warn">review</span></div>
              <div class="step"><div class="num">5</div><div><strong>Provider-neutral schema</strong><small>The same JSON drives fields, strip logs, map, section, validation, and export.</small></div><span class="pill good">ready</span></div>
            </div>
          </div>
          <div id="agentsTab" class="tab-content">
            ${renderLightAgentReviews(model)}
          </div>
          <div id="tablesTab" class="tab-content">
            ${renderLightTables(dossier)}
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Integrated extraction JSON <small>single source of truth for this UI</small></h2>
        <div class="panel-body"><pre>${json}</pre></div>
      </div>
    </div>
  `;
}

function renderIntegratedReviewOnlyHtml(dossier: IngestDossier): string {
  const model = buildIntegratedReviewModel(dossier);
  const selected = model.boreholes[0];
  const generatedDate = new Date(dossier.generatedAt).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const depthMapping = model.quality.depthMappingR2 == null
    ? 'n/a'
    : model.quality.depthMappingR2.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>geotechCLI Integrated Vision + Geospatial Review - ${escapeHtml(dossier.title)}</title>
  <style>
    :root{--bg:#f6f7f9;--panel:#fff;--ink:#172033;--muted:#697386;--line:#d8dee9;--soft:#eef2f7;--good:#1f8f5f;--warn:#b7791f;--bad:#c2410c;--blue:#2563eb;--deep:#0f172a;--made:#8b5a2b;--clay:#c98b67;--sand:#f5d77b;--gravel:#a3a3a3;--shadow:0 10px 25px rgba(23,32,51,.08);--radius:16px}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%}body{background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}button,select{font:inherit}h1,h2,p{margin:0}
    header{background:linear-gradient(135deg,#0f172a,#1e293b 55%,#334155);color:#fff;padding:28px 36px}.header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:22px}h1{font-size:28px;letter-spacing:0;line-height:1.08}.subtitle{margin-top:8px;color:#cbd5e1;line-height:1.5;max-width:1120px}.badge-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.badge{display:inline-flex;border-radius:999px;padding:7px 10px;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.16);color:#e5e7eb;font-size:12px;font-weight:750}.run-card{min-width:315px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:16px;font-size:13px}.run-card div{display:flex;justify-content:space-between;gap:14px;padding:4px 0;color:#dbeafe}.run-card span:first-child{color:#a7b3c7}
    main{padding:24px 28px 42px;max-width:1760px;margin:0 auto}.summary-grid{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:14px;margin-bottom:16px}.metric{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}.metric .label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.metric .value{font-size:25px;font-weight:850;letter-spacing:0}.metric .note{color:var(--muted);font-size:12px;margin-top:6px;line-height:1.35}.status-good{color:var(--good)}.status-warn{color:var(--warn)}.status-blue{color:var(--blue)}.status-bad{color:var(--bad)}
    .view-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.nav-btn{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:9px 12px;font-weight:800;font-size:13px;cursor:pointer}.nav-btn:hover{border-color:var(--blue);color:var(--blue)}.nav-btn.active{background:var(--blue);border-color:var(--blue);color:#fff}.view{display:none}.view.active{display:block}
    .panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}.panel h2{font-size:16px;margin:0;padding:15px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:center}.panel h2 small{color:var(--muted);font-weight:500}.panel-body{padding:15px}.review-grid{display:grid;grid-template-columns:minmax(340px,1.02fr) minmax(340px,.78fr) minmax(380px,1.08fr);gap:16px;align-items:start}
    .toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.tool-btn{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:7px 10px;font-weight:750;font-size:12px;cursor:pointer}.tool-btn.active{background:var(--blue);border-color:var(--blue);color:#fff}
    .mock-page{position:relative;width:100%;aspect-ratio:.707/1;background:#fff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}.page-title{position:absolute;left:5%;top:3.2%;width:90%;height:5%;border-bottom:2px solid #111827;font-weight:850;font-size:clamp(12px,1vw,18px);display:flex;align-items:center;justify-content:space-between}.page-title span:last-child{color:#475569}.page-meta{position:absolute;left:5%;top:9.5%;width:90%;height:8.4%;border:1px solid #94a3b8;display:grid;grid-template-columns:1fr 1fr;font-size:clamp(8px,.62vw,11px)}.page-meta div{padding:4px 6px;border-bottom:1px solid #e2e8f0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .log-frame{position:absolute;left:5%;top:20%;width:90%;height:72%;border:2px solid #334155}.col{position:absolute;top:0;height:100%;border-right:1px solid #64748b}.c-depth{left:0;width:11%}.c-lith{left:11%;width:10%}.c-desc{left:21%;width:38%}.c-sample{left:59%;width:13%}.c-spt{left:72%;width:12%}.c-water{left:84%;width:8%}.c-remarks{left:92%;width:8%;border-right:none}.col-label{position:absolute;top:0;height:6.2%;width:100%;background:#e2e8f0;border-bottom:1px solid #64748b;font-size:clamp(6px,.55vw,9px);font-weight:800;display:flex;justify-content:center;align-items:center;text-align:center}
    .depth-tick{position:absolute;left:0;width:100%;border-top:1px solid #cbd5e1;font-size:clamp(6px,.55vw,9px);color:#334155}.depth-tick span{position:absolute;left:5%;top:-7px;background:#fff;padding-right:2px}.desc-text{position:absolute;left:23%;width:34%;font-size:clamp(6.5px,.58vw,10px);line-height:1.18;color:#111827;overflow:hidden}.hatch{position:absolute;left:12%;width:8%;border-left:1px solid #94a3b8;border-right:1px solid #94a3b8;background:repeating-linear-gradient(45deg,rgba(15,23,42,.24) 0 2px,transparent 2px 7px)}.hatch.made{background:repeating-linear-gradient(135deg,rgba(139,90,43,.55) 0 4px,rgba(139,90,43,.18) 4px 8px)}.hatch.clay{background:repeating-linear-gradient(45deg,rgba(111,78,55,.3) 0 2px,transparent 2px 7px),#f3d3c1}.hatch.sand{background:radial-gradient(circle,rgba(15,23,42,.35) 1px,transparent 1.5px) 0 0/8px 8px,#fde68a}.hatch.gravel{background:radial-gradient(circle,rgba(15,23,42,.35) 1.5px,transparent 2px) 0 0/10px 10px,repeating-linear-gradient(135deg,transparent 0 7px,rgba(15,23,42,.2) 7px 9px),#d4d4d4}.layer-line{position:absolute;left:11%;width:48%;border-top:2px solid #111827}.layer-line.review{border-top:2px dashed var(--warn)}
    .spt-text,.water-text{position:absolute;font-size:clamp(6.5px,.58vw,10px);color:#111827;font-weight:850}.spt-text{left:75%}.water-text{left:86%;color:#0369a1}.evidence-box{position:absolute;border:2px solid var(--blue);background:rgba(37,99,235,.10);border-radius:4px;opacity:.55;cursor:pointer;transition:.15s ease;padding:0;color:#172033;text-align:left;overflow:hidden}.evidence-box:hover,.evidence-box.active,.evidence-box:focus-visible{opacity:1;background:rgba(37,99,235,.18);box-shadow:0 0 0 3px rgba(37,99,235,.16);z-index:20;outline:none}.evidence-box.warn{border-color:var(--warn);background:rgba(183,121,31,.12)}.hidden-box{display:none!important}
    .layout-source{width:100%}.layout-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;color:#475569;font-size:12px}.layout-meta span{display:inline-flex;align-items:center;border:1px solid #d8dee9;background:#f8fafc;border-radius:999px;padding:5px 8px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.layout-page{position:relative;width:100%;background:linear-gradient(#fff,#fbfdff);border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;box-shadow:inset 0 0 0 1px #eef2f7}.layout-page:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(148,163,184,.16) 1px,transparent 1px),linear-gradient(rgba(148,163,184,.16) 1px,transparent 1px);background-size:8.33% 8.33%;pointer-events:none}.layout-grid-label{position:absolute;left:10px;top:8px;z-index:1;background:rgba(255,255,255,.88);border:1px solid #e2e8f0;border-radius:999px;padding:5px 8px;color:#475569;font-size:11px;font-weight:800}.layout-region-text{position:absolute;inset:3px;font-size:clamp(6.5px,.54vw,10px);line-height:1.16;color:#172033;overflow:hidden;pointer-events:none}
    .legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:12px;color:var(--muted)}.legend-item{display:flex;align-items:center;gap:7px}.swatch{width:20px;height:12px;border-radius:3px;border:2px solid var(--blue);background:rgba(37,99,235,.12)}.swatch.warn{border-color:var(--warn);background:rgba(183,121,31,.12)}.swatch.good{border-color:var(--good);background:rgba(31,143,95,.12)}.swatch.bad{border-color:var(--bad);background:rgba(194,65,12,.12)}.swatch.made{background:var(--made);border-color:rgba(15,23,42,.2)}.swatch.clay{background:var(--clay);border-color:rgba(15,23,42,.2)}.swatch.sand{background:var(--sand);border-color:rgba(15,23,42,.2)}.swatch.gravel{background:var(--gravel);border-color:rgba(15,23,42,.2)}
    .svg-wrap{display:flex;justify-content:center;background:linear-gradient(#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:13px;padding:8px;overflow:auto}svg text{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.log-highlight{cursor:pointer;transition:.15s ease}.log-highlight.active{filter:drop-shadow(0 0 6px rgba(37,99,235,.72))}
    .fields{display:grid;gap:9px;max-height:694px;overflow:auto;padding-right:4px}.field-card{border:1px solid #e2e8f0;border-radius:12px;padding:11px;cursor:pointer;transition:.15s ease;background:#fff;text-align:left}.field-card:hover,.field-card.active{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.12)}.field-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;font-weight:850}.field-value{margin-top:6px;color:#111827;font-size:13.5px;line-height:1.32}.field-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px;color:var(--muted);font-size:12px}.pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#eef2f7;color:#475569;font-size:12px;font-weight:800}.pill.good{background:#dcfce7;color:#166534}.pill.warn{background:#fef3c7;color:#92400e}.pill.bad{background:#ffedd5;color:#9a3412}.pill.blue{background:#dbeafe;color:#1d4ed8}.confidence{margin-top:9px;height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden}.confidence span{display:block;height:100%;background:linear-gradient(90deg,var(--good),#65a30d)}.confidence span.warn{background:linear-gradient(90deg,var(--warn),#d97706)}.confidence span.bad{background:linear-gradient(90deg,var(--bad),#ef4444)}
    .geo-grid{display:grid;grid-template-columns:minmax(520px,1.18fr) minmax(360px,.82fr);gap:16px;align-items:start}.map-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.map-canvas{border:1px solid #d8dee9;border-radius:14px;overflow:auto;background:#e2e8f0}.notice{border:1px solid #fde68a;background:#fffbeb;color:#78350f;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.45;margin-top:10px}.selected-panel{border:1px solid #dbeafe;border-radius:14px;background:#eff6ff;padding:13px;margin-bottom:11px}.selected-panel strong{font-size:18px}.selected-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;font-size:13px;color:#334155}.crs-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.crs-box{border:1px solid #e2e8f0;border-radius:12px;padding:11px;background:#f8fafc}.crs-box .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}.crs-box .v{font-weight:850}.crs-box .s{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.35}.section-panel{margin-top:16px}.cross-section-wrap{overflow:auto;background:linear-gradient(#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:14px;padding:8px}
    .data-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.table-panel-grid{display:grid;gap:12px}.embedded-panel{box-shadow:none}.table-scroll{overflow:auto;max-height:360px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#172033}th{color:#475569;background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em}code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px}.tabs{display:flex;gap:8px;padding:0 15px 13px;border-bottom:1px solid var(--line);flex-wrap:wrap}.tab{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:999px;padding:7px 10px;font-weight:800;font-size:12px;cursor:pointer}.tab.active{background:var(--blue);border-color:var(--blue);color:#fff}.tab-content{display:none}.tab-content.active{display:block}.warning-list{display:grid;gap:10px}.warning{border-left:4px solid var(--warn);background:#fffbeb;border-radius:10px;padding:12px;color:#78350f;font-size:13px}.pipeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:12px;padding:10px}.num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#dbeafe;color:#1d4ed8;font-weight:900}.step strong{display:block}.step small{color:var(--muted)}pre{background:#0f172a;color:#e2e8f0;border-radius:12px;padding:14px;overflow:auto;font-size:12px;line-height:1.45;max-height:620px}.empty-light{border:1px dashed #cbd5e1;background:#f8fafc;color:#475569;border-radius:12px;padding:16px;line-height:1.5}
    @media(max-width:1400px){.review-grid,.geo-grid,.data-grid{grid-template-columns:1fr}.fields{max-height:none}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.header-top{flex-direction:column}.run-card{min-width:0;width:100%}}@media(max-width:720px){main{padding:16px}header{padding:22px 18px}.summary-grid,.crs-card{grid-template-columns:1fr}.metric .value{font-size:22px}.review-grid{gap:12px}.panel h2{align-items:flex-start;flex-direction:column}.legend{display:grid;grid-template-columns:1fr}.mock-page{min-height:560px}.page-meta{font-size:8px}.view-nav{display:grid}.nav-btn{width:100%}.selected-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header>
    <div class="header-top">
      <div>
        <h1>geotechCLI Integrated Vision + Geospatial Review</h1>
        <p class="subtitle">${escapeHtml(dossier.summary)}</p>
        <div class="badge-row">
          <span class="badge">OCR: ${escapeHtml(model.run.models.ocr)}</span>
          <span class="badge">Vision: ${escapeHtml(model.run.models.vision)}</span>
          <span class="badge">Text / Agent: ${escapeHtml(model.run.models.text)}</span>
          <span class="badge">BYOK profile: ${escapeHtml(model.run.providerProfile)}</span>
          <span class="badge">CRS checked before map render</span>
        </div>
      </div>
      <div class="run-card">
        <div><span>Run ID</span><strong>${escapeHtml(model.run.id)}</strong></div>
        <div><span>Document</span><strong>${escapeHtml(model.run.document)}</strong></div>
        <div><span>Generated</span><strong>${escapeHtml(generatedDate)}</strong></div>
        <div><span>Schema</span><strong>${escapeHtml(model.schemaVersion)}</strong></div>
        <div><span>geotechCLI</span><strong>v${escapeHtml(GEOTECHCLI_VERSION)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(model.run.status.replace(/_/g, ' '))}</strong></div>
      </div>
    </div>
  </header>
  <main>
    <section class="summary-grid" aria-label="Integrated review summary">
      ${renderLightMetric('Overall confidence', integratedPercent(model.quality.overallConfidence), 'Borehole extraction confidence after validation.', model.quality.overallConfidence >= 0.85 ? 'good' : 'warn')}
      ${renderLightMetric('Evidence coverage', integratedPercent(model.quality.evidenceCoverage), 'Rendered values retain source evidence where available.', model.quality.evidenceCoverage >= 0.85 ? 'good' : 'warn')}
      ${renderLightMetric('Boreholes', String(model.boreholes.length), 'Mapped and included in A-A section.', 'blue')}
      ${renderLightMetric('CRS', model.project.inputCrs, `Display coordinates: ${model.project.displayCrs}.`, model.project.inputCrs === 'unknown' ? 'warn' : 'good')}
      ${renderLightMetric('Depth mapping', depthMapping === 'n/a' ? 'n/a' : `R2 ${depthMapping}`, 'Deterministic depth calibration from structured intervals.', depthMapping === 'n/a' ? 'warn' : 'good')}
    </section>
    <nav class="view-nav" aria-label="Review views">
      <button class="nav-btn active" type="button" data-view-target="reviewView">Extraction review</button>
      <button class="nav-btn" type="button" data-view-target="geoView">Map + A-A section</button>
      <button class="nav-btn" type="button" data-view-target="validationView">Validation + JSON</button>
    </nav>
    <section id="reviewView" class="view active">
      <div class="review-grid">
        <div class="panel">
          <h2>Source report evidence <small>GLM-OCR regions when available, reconstructed log otherwise</small></h2>
          <div class="panel-body">
            <div class="toolbar">
              <button class="tool-btn filter active" type="button" data-filter="all">All evidence</button>
              <button class="tool-btn filter" type="button" data-filter="header">Header</button>
              <button class="tool-btn filter" type="button" data-filter="coordinates">Coordinates</button>
              <button class="tool-btn filter" type="button" data-filter="totalDepth">Total depth</button>
              <button class="tool-btn filter" type="button" data-filter="strata">Strata</button>
              <button class="tool-btn filter" type="button" data-filter="spt">SPT</button>
              <button class="tool-btn filter" type="button" data-filter="water">Water</button>
              <button class="tool-btn filter" type="button" data-filter="parameter">Parameters</button>
              <button class="tool-btn filter" type="button" data-filter="table">Tables</button>
            </div>
            ${renderLightSourcePage(selected, model)}
            <div class="legend">
              <span class="legend-item"><span class="swatch"></span>Accepted evidence</span>
              <span class="legend-item"><span class="swatch warn"></span>Review recommended</span>
              <span class="legend-item"><span class="swatch good"></span>Validated geometry</span>
              <span class="legend-item"><span class="swatch bad"></span>Blocking error, if present</span>
            </div>
          </div>
        </div>
        <div class="panel"><h2>Validated strip log <small>deterministic renderer</small></h2><div class="panel-body">${renderLightStripLog(selected, model)}</div></div>
        <div class="panel"><h2>Extracted fields <small>schema + confidence + evidence</small></h2><div class="panel-body">${renderLightFields(selected, model)}</div></div>
      </div>
    </section>
    <section id="geoView" class="view">
      <div class="geo-grid">
        <div class="panel">
          <h2>Map-ready borehole view <small>source CRS guarded before visualization</small></h2>
          <div class="panel-body">
            <div class="map-toolbar"><span class="pill ${model.project.inputCrs === 'unknown' ? 'warn' : 'good'}">Input CRS: ${escapeHtml(model.project.inputCrs)}</span><span class="pill blue">Display: ${escapeHtml(model.project.displayCrs)}</span></div>
            ${renderLightMap(model)}
            <div class="notice"><strong>CRS rule:</strong> no map or section should be treated as design-grade until source CRS, units, project location, and vertical datum have passed validation.</div>
          </div>
        </div>
        <div class="panel"><h2>Selected borehole + CRS guardrail <small>same object drives log, map, and section</small></h2><div class="panel-body">${renderLightSelectedBorehole(selected, model)}</div></div>
      </div>
      <div class="panel section-panel">
        <h2>Professional A-A stratigraphic section <small>interpolated contacts + actual vertical borehole log columns</small></h2>
        <div class="panel-body">
          ${renderLightCrossSection(model)}
          <div class="legend">
            <span class="legend-item"><span class="swatch made"></span>Made Ground / Fill</span>
            <span class="legend-item"><span class="swatch clay"></span>Clay</span>
            <span class="legend-item"><span class="swatch sand"></span>Sand / Silt</span>
            <span class="legend-item"><span class="swatch gravel"></span>Gravel / Rock</span>
            <span class="legend-item"><span style="width:30px;border-top:2px dashed #64748b;display:inline-block"></span>Interpolated contacts</span>
          </div>
          <div class="notice"><strong>Engineering note:</strong> strata between boreholes are conceptual interpolations for review. Directly extracted log columns are shown at borehole locations.</div>
        </div>
      </div>
    </section>
    <section id="validationView" class="view">${renderLightValidation(dossier, model)}</section>
  </main>
  <script>
    (() => {
      const setActiveEvidence = (id) => {
        document.querySelectorAll('[data-id]').forEach((element) => {
          element.classList.toggle('active', element.getAttribute('data-id') === id);
        });
      };
      const firstEvidence = document.querySelector('[data-id]');
      if (firstEvidence) setActiveEvidence(firstEvidence.getAttribute('data-id'));
      document.addEventListener('click', (event) => {
        const evidence = event.target.closest('[data-id]');
        if (evidence) setActiveEvidence(evidence.getAttribute('data-id'));
      });
      document.querySelectorAll('[data-view-target]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-view-target');
          document.querySelectorAll('[data-view-target]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
          document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === target));
        });
      });
      document.querySelectorAll('[data-tab-target]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-tab-target');
          document.querySelectorAll('[data-tab-target]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
          document.querySelectorAll('.tab-content').forEach((content) => content.classList.toggle('active', content.id === target));
        });
      });
      document.querySelectorAll('.filter').forEach((button) => {
        button.addEventListener('click', () => {
          const filter = button.getAttribute('data-filter') || 'all';
          document.querySelectorAll('.filter').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
          document.querySelectorAll('.evidence-box').forEach((box) => {
            const visible = filter === 'all' || box.getAttribute('data-type') === filter;
            box.classList.toggle('hidden-box', !visible);
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}

export function renderIngestDossierAsHtml(dossier: IngestDossier): string {
  return renderIntegratedReviewOnlyHtml(dossier);
}

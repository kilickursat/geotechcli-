'use client';

import { useMemo, useState } from 'react';

// The changelog carries 100+ releases. Rendering them all, fully expanded, on
// one flat scroll makes it unreadable. This applies the Sphinx/Furo approach:
// a persistent index sidebar grouped by release series, progressive disclosure
// (recent releases open, history collapsed), and a filter so a reader can find
// when something actually changed.

export interface ChangelogEntry {
  type: string;
  text: string;
}

export interface Release {
  version: string;
  date: string;
  tag: string;
  changes: readonly ChangelogEntry[];
}

const TYPE_STYLES: Record<string, string> = {
  feat: 'bg-[rgba(45,212,191,0.15)] text-[var(--accent-teal)]',
  fix: 'bg-[rgba(59,130,246,0.15)] text-[var(--accent-blue)]',
  security: 'bg-[rgba(245,158,11,0.15)] text-[var(--accent-orange)]',
  breaking: 'bg-[rgba(239,68,68,0.15)] text-red-400',
};

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Fixes',
  security: 'Security',
  breaking: 'Breaking',
};

/** Releases open by default; everything older starts collapsed. */
const OPEN_BY_DEFAULT = 3;

function seriesOf(version: string): string {
  const [major, minor] = version.split('.');
  return `${major}.${minor}.x`;
}

function highlight(text: string, query: string, keyPrefix: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark key={keyPrefix} className="rounded bg-[rgba(45,212,191,0.25)] px-0.5 text-[var(--text-primary)]">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function ChangelogBrowser({ releases }: { releases: readonly Release[] }) {
  const [query, setQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const availableTypes = useMemo(() => {
    const seen = new Set<string>();
    releases.forEach((r) => r.changes.forEach((c) => seen.add(c.type)));
    return ['feat', 'fix', 'security', 'breaking'].filter((t) => seen.has(t));
  }, [releases]);

  // A release survives filtering only if it still has matching entries.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return releases
      .map((r) => {
        const changes = r.changes.filter((c) => {
          const typeOk = activeTypes.length === 0 || activeTypes.includes(c.type);
          const textOk =
            !q || c.text.toLowerCase().includes(q) || r.version.includes(q) || r.tag.toLowerCase().includes(q);
          return typeOk && textOk;
        });
        return { ...r, changes };
      })
      .filter((r) => r.changes.length > 0);
  }, [releases, query, activeTypes]);

  const isFiltering = query.trim() !== '' || activeTypes.length > 0;

  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const s = seriesOf(r.version);
      if (!map.has(s)) {
        map.set(s, []);
        order.push(s);
      }
      map.get(s)!.push(r);
    }
    return order.map((s) => ({ series: s, items: map.get(s)! }));
  }, [filtered]);

  const isOpen = (version: string, index: number) => {
    if (version in expanded) return expanded[version];
    // While filtering, show every surviving match rather than hiding hits.
    if (isFiltering) return true;
    return index < OPEN_BY_DEFAULT;
  };

  const toggleType = (t: string) =>
    setActiveTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const setAll = (open: boolean) =>
    setExpanded(Object.fromEntries(releases.map((r) => [r.version, open])));

  const totalEntries = releases.reduce((n, r) => n + r.changes.length, 0);
  const shownEntries = filtered.reduce((n, r) => n + r.changes.length, 0);

  const sidebar = (
    <nav className="space-y-6">
      {grouped.map(({ series, items }) => (
        <div key={series}>
          <div className="mb-2 font-[var(--font-mono)] text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
            {series}
            <span className="ml-1.5 normal-case tracking-normal opacity-60">({items.length})</span>
          </div>
          <ul className="space-y-0.5 border-l border-[var(--border-color)]">
            {items.map((r) => (
              <li key={r.version}>
                <a
                  href={`#v${r.version}`}
                  onClick={() => {
                    setExpanded((prev) => ({ ...prev, [r.version]: true }));
                    setMobileNavOpen(false);
                  }}
                  className="-ml-px flex items-baseline justify-between gap-2 border-l-2 border-transparent py-1 pl-3 text-[13px] text-[var(--text-secondary)] transition hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <span className="font-[var(--font-mono)]">v{r.version}</span>
                  <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{r.date}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {grouped.length === 0 && (
        <p className="text-[13px] text-[var(--text-muted)]">No releases match this filter.</p>
      )}
    </nav>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] gap-10 px-6 lg:px-10">
      {/* Version index */}
      <aside className="hidden w-[220px] shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-12 pr-2">{sidebar}</div>
      </aside>

      <div className="fixed bottom-5 right-5 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="rounded-full bg-[var(--accent-teal)] px-5 py-3 text-[13px] font-semibold text-[var(--bg-primary)] shadow-lg"
        >
          {mobileNavOpen ? 'Close' : 'Versions'}
        </button>
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[var(--bg-primary)] px-6 pb-28 pt-24 lg:hidden">
          {sidebar}
        </div>
      )}

      {/* Releases */}
      <div className="min-w-0 flex-1 pb-24">
        <header className="mb-8 border-b border-[var(--border-color)] pb-8">
          <h1 className="mb-3 text-[clamp(30px,4vw,40px)] font-bold tracking-tight">Changelog</h1>
          <p className="max-w-[65ch] text-[15px] leading-relaxed text-[var(--text-secondary)]">
            Every release of geotechCLI, newest first. The most recent releases are expanded; older
            ones are collapsed to keep the history readable — open any of them, or search across all{' '}
            {totalEntries} entries at once.
          </p>
        </header>

        {/* Toolbar */}
        <div className="mb-10 space-y-3">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search every release — try “liquefaction”, “guardrail”, or a version…"
              aria-label="Search the changelog"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 pr-9 text-[13.5px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-teal)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableTypes.map((t) => {
              const on = activeTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  aria-pressed={on}
                  className={
                    on
                      ? `rounded-full px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wider ${TYPE_STYLES[t]}`
                      : 'rounded-full border border-[var(--border-color)] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)] transition hover:text-[var(--text-primary)]'
                  }
                >
                  {TYPE_LABELS[t] ?? t}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-3">
              {isFiltering && (
                <span className="text-[12px] text-[var(--text-muted)]">
                  {shownEntries} of {totalEntries} entries · {filtered.length} releases
                </span>
              )}
              <button
                type="button"
                onClick={() => setAll(true)}
                className="text-[12px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setAll(false)}
                className="text-[12px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Collapse all
              </button>
              {isFiltering && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setActiveTypes([]);
                  }}
                  className="text-[12px] text-[var(--accent-teal)] transition hover:brightness-110"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            No changelog entries match that search.
          </p>
        ) : (
          filtered.map((release, idx) => {
            const open = isOpen(release.version, idx);
            const isLatest = idx === 0 && !isFiltering;
            return (
              <section key={release.version} id={`v${release.version}`} className="mb-4 scroll-mt-24">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [release.version]: !open }))
                  }
                  aria-expanded={open}
                  className={
                    'flex w-full items-center gap-3 rounded-xl border px-5 py-4 text-left transition ' +
                    (open
                      ? 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
                      : 'border-[var(--border-color)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-secondary)]/50')
                  }
                >
                  <span
                    aria-hidden
                    className={
                      'shrink-0 text-[var(--text-muted)] transition-transform ' + (open ? 'rotate-90' : '')
                    }
                  >
                    ›
                  </span>
                  <h2 className="font-[var(--font-mono)] text-[17px] font-bold tracking-tight">
                    v{release.version}
                  </h2>
                  {isLatest && (
                    <span className="rounded-full bg-[rgba(45,212,191,0.15)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-teal)]">
                      Latest
                    </span>
                  )}
                  <span className="hidden text-[12.5px] text-[var(--text-secondary)] sm:block">
                    {release.tag}
                  </span>
                  <span className="ml-auto shrink-0 font-[var(--font-mono)] text-[11.5px] text-[var(--text-muted)]">
                    {release.date}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">
                    {release.changes.length}
                  </span>
                </button>

                {open && (
                  <div className="space-y-2.5 px-5 pb-6 pt-5">
                    <div className="mb-3 text-[12.5px] text-[var(--text-muted)] sm:hidden">
                      {release.tag}
                    </div>
                    {release.changes.map((change, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span
                          className={`mt-[3px] shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            TYPE_STYLES[change.type] ?? TYPE_STYLES.feat
                          }`}
                        >
                          {change.type}
                        </span>
                        <span className="text-[13.5px] leading-[1.7] text-[var(--text-secondary)]">
                          {highlight(change.text, query, `${release.version}-${i}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

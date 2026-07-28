'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Furo-inspired documentation shell: a persistent, grouped, filterable sidebar
// beside the content, with scroll-spy so the reader always knows where they are.
// Furo's own third column is a page-level table of contents; our sections carry
// no sub-headings, so a third column would be empty scaffolding — and Furo's
// stated principle is that the content matters, not the scaffolding around it.

export interface DocSection {
  id: string;
  title: string;
  group: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Inline markdown (code spans, bold, links)
// ---------------------------------------------------------------------------

function renderInline(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-[var(--bg-card)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12.5px] text-[var(--accent-teal)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--text-primary)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target={linkMatch[2].startsWith('http') ? '_blank' : undefined}
            rel={linkMatch[2].startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-[var(--accent-teal)] underline decoration-[var(--accent-teal)]/30 underline-offset-2 transition hover:decoration-[var(--accent-teal)]"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; text: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().replace(/^```/, '').trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: 'code', lang: lang || 'text', code: body.join('\n') });
      continue;
    }

    // pipe table
    if (line.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|[-:\s|]+\|$/)) {
      const header = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    // paragraph
    if (line.trim() === '') {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Code block with copy
// ---------------------------------------------------------------------------

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the code is still selectable */
    }
  };

  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2">
        <span className="font-[var(--font-mono)] text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-1 font-[var(--font-mono)] text-[11px] text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          aria-label="Copy code to clipboard"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-[var(--font-mono)] text-[12.5px] leading-[1.65] text-[var(--text-secondary)]">
          {code}
        </code>
      </pre>
    </div>
  );
}

function BlockView({ block, k }: { block: Block; k: string }) {
  switch (block.kind) {
    case 'code':
      return <CodeBlock lang={block.lang} code={block.code} />;
    case 'table':
      return (
        <div className="my-5 overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--bg-secondary)]">
              <tr>
                {block.header.map((h, idx) => (
                  <th
                    key={idx}
                    className="border-b border-[var(--border-color)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-primary)]"
                  >
                    {renderInline(h, `${k}-th${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx} className="transition hover:bg-[var(--bg-secondary)]/50">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="border-b border-[var(--border-color)] px-4 py-2.5 align-top text-[12.5px] text-[var(--text-secondary)]"
                    >
                      {renderInline(cell, `${k}-td${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'list':
      return (
        <ul className="my-4 space-y-2">
          {block.items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
              <span className="mt-[2px] shrink-0 text-[var(--accent-teal)]">·</span>
              <span>{renderInline(item, `${k}-li${idx}`)}</span>
            </li>
          ))}
        </ul>
      );
    default:
      return (
        <p className="my-4 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
          {renderInline(block.text, k)}
        </p>
      );
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function DocsBrowser({ sections, intro }: { sections: DocSection[]; intro: string }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(
    () => sections.map((s) => ({ ...s, blocks: parseBlocks(s.content) })),
    [sections],
  );

  // Filter matches the title, the group, and the body text.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parsed;
    return parsed.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [parsed, query]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, typeof visible>();
    for (const s of visible) {
      if (!map.has(s.group)) {
        map.set(s.group, []);
        order.push(s.group);
      }
      map.get(s.group)!.push(s);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [visible]);

  // Scroll-spy: the topmost section intersecting the reading area wins.
  useEffect(() => {
    const nodes = visible
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null);
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView[0]) setActiveId(inView[0].target.id);
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [visible]);

  const sidebar = (
    <>
      <div className="relative mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter documentation…"
          aria-label="Filter documentation"
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 pr-8 text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-teal)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="text-[13px] text-[var(--text-muted)]">
          No sections match “{query}”.
        </p>
      )}

      <nav className="space-y-6">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="mb-2 font-[var(--font-mono)] text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
              {group}
            </div>
            <ul className="space-y-0.5 border-l border-[var(--border-color)]">
              {items.map((s) => {
                const active = s.id === activeId;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={() => setMobileNavOpen(false)}
                      aria-current={active ? 'true' : undefined}
                      className={
                        active
                          ? '-ml-px block border-l-2 border-[var(--accent-teal)] py-1 pl-3 text-[13px] font-medium text-[var(--accent-teal)]'
                          : '-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] text-[var(--text-secondary)] transition hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }
                    >
                      {s.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] gap-10 px-6 lg:px-10">
      {/* Left sidebar — persistent on desktop */}
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-12 pr-2">
          {sidebar}
        </div>
      </aside>

      {/* Mobile nav toggle */}
      <div className="fixed bottom-5 right-5 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="rounded-full bg-[var(--accent-teal)] px-5 py-3 text-[13px] font-semibold text-[var(--bg-primary)] shadow-lg"
        >
          {mobileNavOpen ? 'Close' : 'Contents'}
        </button>
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-[var(--bg-primary)] px-6 pb-28 pt-24 lg:hidden">
          {sidebar}
        </div>
      )}

      {/* Content */}
      <div ref={contentRef} className="min-w-0 flex-1 pb-24">
        <header className="mb-12 border-b border-[var(--border-color)] pb-8">
          <h1 className="mb-3 text-[clamp(30px,4vw,40px)] font-bold tracking-tight">Documentation</h1>
          <p className="max-w-[65ch] text-[15px] leading-relaxed text-[var(--text-secondary)]">{intro}</p>
        </header>

        {visible.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            Nothing matches “{query}”. Try a command name such as <code className="font-[var(--font-mono)]">bearing</code>.
          </p>
        ) : (
          visible.map((s, idx) => {
            const prev = visible[idx - 1];
            const next = visible[idx + 1];
            return (
              <section key={s.id} id={s.id} className="mb-20 scroll-mt-24">
                <div className="mb-1 font-[var(--font-mono)] text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
                  {s.group}
                </div>
                {/* Sphinx-style permalink anchor */}
                <h2 className="group mb-6 flex items-baseline gap-2 border-b border-[var(--border-color)] pb-3 text-[26px] font-bold tracking-tight">
                  {s.title}
                  <a
                    href={`#${s.id}`}
                    aria-label={`Permalink to ${s.title}`}
                    className="text-[18px] text-[var(--text-muted)] opacity-0 transition hover:text-[var(--accent-teal)] group-hover:opacity-100"
                  >
                    ¶
                  </a>
                </h2>

                {s.blocks.map((b, bIdx) => (
                  <BlockView key={bIdx} block={b} k={`${s.id}-b${bIdx}`} />
                ))}

                {/* Furo-style previous / next */}
                {(prev || next) && (
                  <div className="mt-10 flex gap-3 border-t border-[var(--border-color)] pt-5">
                    {prev ? (
                      <a
                        href={`#${prev.id}`}
                        className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-3 transition hover:border-[var(--accent-teal)]"
                      >
                        <div className="mb-0.5 text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
                          Previous
                        </div>
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">← {prev.title}</div>
                      </a>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {next ? (
                      <a
                        href={`#${next.id}`}
                        className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-3 text-right transition hover:border-[var(--accent-teal)]"
                      >
                        <div className="mb-0.5 text-[10.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
                          Next
                        </div>
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">{next.title} →</div>
                      </a>
                    ) : (
                      <div className="flex-1" />
                    )}
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

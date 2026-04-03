export function Footer() {
  return (
    <footer className="px-12 py-10 border-t border-[var(--border-color)]">
      <div className="flex items-start justify-between gap-8">
        <div>
          <div className="font-[var(--font-mono)] font-semibold text-sm text-[var(--text-primary)]">
            geotech<span className="text-[var(--accent-teal)]">CLI</span>
          </div>
          <p className="text-[var(--text-muted)] text-xs mt-2 max-w-[320px] leading-relaxed">
            Strong beta: no signup, no live billing, and no hosted anonymous AI yet.
            Deterministic commands are live now. Hosted GLM beta access is the next rollout.
          </p>
        </div>
        <div className="flex gap-8">
          <a href="/docs" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">Documentation</a>
          <a href="/privacy" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">Privacy</a>
          <a href="https://github.com/kilickursat/geotechcli-" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">GitHub</a>
          <a href="/changelog" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">Changelog</a>
        </div>
        <div className="text-[var(--text-muted)] text-xs">Copyright 2026 Kursat Kilic. All rights reserved.</div>
      </div>
    </footer>
  );
}

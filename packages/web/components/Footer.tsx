export function Footer() {
  return (
    <footer className="px-12 py-10 border-t border-[var(--border-color)] flex items-center justify-between">
      <div className="font-[var(--font-mono)] font-semibold text-sm text-[var(--text-primary)]">
        geotech<span className="text-[var(--accent-teal)]">CLI</span>
      </div>
      <div className="flex gap-8">
        <a href="/docs" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">Documentation</a>
        <a href="https://github.com/kilickursat/geotechcli" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">GitHub</a>
        <a href="/changelog" className="text-[var(--text-muted)] text-xs hover:text-[var(--text-secondary)] transition">Changelog</a>
      </div>
      <div className="text-[var(--text-muted)] text-xs">© 2026 Kursat Kilic. All Rights Reserved.</div>
    </footer>
  );
}

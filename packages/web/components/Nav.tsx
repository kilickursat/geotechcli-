'use client';

import { IS_PUBLIC_PRODUCTION, PATREON_JOIN_URL } from '@/lib/site';

export function Nav() {
  const installLabel = IS_PUBLIC_PRODUCTION ? 'Install' : 'Install Beta';
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-12 h-16 flex items-center justify-between bg-[rgba(10,14,23,0.7)] backdrop-blur-2xl border-b border-[var(--border-color)]">
      <a href="/" className="font-[var(--font-mono)] font-semibold text-[17px] text-[var(--text-primary)] tracking-tight hover:opacity-80 transition">
        geotech<span className="text-[var(--accent-teal)]">CLI</span>
      </a>
      <div className="flex items-center gap-9">
        <a href="/docs" className="text-[var(--text-secondary)] text-[13.5px] font-medium hover:text-[var(--text-primary)] transition">
          Docs
        </a>
        <a href="/pricing" className="text-[var(--text-secondary)] text-[13.5px] font-medium hover:text-[var(--text-primary)] transition">
          Support
        </a>
        <a href="/changelog" className="text-[var(--text-secondary)] text-[13.5px] font-medium hover:text-[var(--text-primary)] transition">
          Changelog
        </a>
        <a href="mailto:support@geotechcli.com" className="text-[var(--text-secondary)] text-[13.5px] font-medium hover:text-[var(--text-primary)] transition">
          Contact
        </a>
        <a
          href={PATREON_JOIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-teal)] text-[13.5px] font-semibold hover:brightness-110 transition"
        >
          Donate
        </a>
        <a href="/docs" className="px-[18px] py-[7px] bg-[var(--accent-teal)] text-[var(--bg-primary)] text-[13px] font-semibold rounded-md hover:brightness-110 transition">
          {installLabel}
        </a>
      </div>
    </nav>
  );
}

'use client';

import { useState } from 'react';

export function Hero() {
  const [copied, setCopied] = useState(false);

  const copyInstall = () => {
    navigator.clipboard.writeText('npm install -g geotechcli');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[rgba(10,14,23,0.3)] via-transparent to-[var(--bg-primary)]" />
      <div
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(45,212,191,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.1) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-end px-12 pb-20 max-w-[820px]">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[rgba(45,212,191,0.1)] border border-[rgba(45,212,191,0.2)] rounded-full text-xs font-medium text-[var(--accent-teal)] font-[var(--font-mono)] mb-7 w-fit">
          <span className="w-1.5 h-1.5 bg-[var(--accent-teal)] rounded-full animate-pulse" />
          Strong Beta - deterministic CLI live, hosted AI coming next wave
        </div>

        <h1 className="text-[clamp(38px,5.2vw,62px)] font-bold leading-[1.08] tracking-[-2px] mb-6 text-[var(--text-primary)]">
          Geotechnical engineering,
          <span className="bg-gradient-to-r from-[var(--accent-teal)] to-[var(--accent-blue)] bg-clip-text text-transparent">
            one command away.
          </span>
        </h1>

        <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)] max-w-[560px] mb-9 font-normal">
          Deterministic geotechnical calculations are ready today. AI commands are
          available in strong beta with your own provider key while hosted GLM beta
          access is being prepared with rate limits and abuse protection.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={copyInstall}
            className="flex items-center gap-3 px-5 py-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[10px] font-[var(--font-mono)] text-sm text-[var(--text-primary)] cursor-pointer hover:border-[rgba(45,212,191,0.3)] hover:bg-[rgba(19,27,42,0.9)] transition"
          >
            <span>
              <span className="text-[var(--accent-teal)]">$</span> npm install -g
              geotechcli
            </span>
            <span className="text-[var(--text-muted)] ml-2 text-xs">
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
          <a
            href="/docs"
            className="px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1.5"
          >
            Beta Docs -&gt;
          </a>
        </div>
      </div>
    </section>
  );
}

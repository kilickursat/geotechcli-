import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'geotechCLI — Geotechnical analysis and AI workflows in one CLI',
  description:
    'Deterministic geotechnical calculations, tunnel and foundation workflows, document and vision AI, and privacy-first beta access in one terminal-first workflow.',
  keywords: [
    'geotechnical engineering software',
    'geotechnical cli',
    'bearing capacity calculator',
    'liquefaction analysis',
    'tbm analysis',
    'tunnel engineering software',
    'foundation design cli',
    'soil classification',
  ],
  alternates: {
    canonical: 'https://beta.geotechcli.com/',
  },
  openGraph: {
    title: 'geotechCLI — Geotechnical analysis and AI workflows in one CLI',
    description:
      'Deterministic geotechnical calculations, subsurface vision workflows, and privacy-first AI tooling in one terminal-first product.',
    url: 'https://beta.geotechcli.com/',
    siteName: 'geotechCLI',
    type: 'website',
    images: [
      {
        url: '/og/geotechcli-landing.png',
        width: 1200,
        height: 630,
        alt: 'geotechCLI landing page preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geotechCLI — Geotechnical analysis and AI workflows in one CLI',
    description:
      'Deterministic geotechnical calculations, subsurface vision workflows, and privacy-first AI tooling in one terminal-first product.',
    images: ['/og/geotechcli-landing.png'],
  },
};

const pillars = [
  {
    title: 'Deterministic first',
    description:
      'Run bearing capacity, rock mass, retaining, liquefaction, tunnel, and plotting workflows with engineering-grade command outputs before AI ever enters the loop.',
    label: 'Reliable math',
  },
  {
    title: 'AI where it helps',
    description:
      'Use agent workflows for option exploration, report drafting, vision extraction, and document Q&A without turning the product into a black box.',
    label: 'Scoped intelligence',
  },
  {
    title: 'Built for field reality',
    description:
      'From borehole logs and tunnel faces to foundation screening and TBM prediction, the experience speaks the language of geotechnical teams.',
    label: 'Domain-native UX',
  },
  {
    title: 'Hard trust boundary',
    description:
      'The beta message stays simple and readable: no signup, no billing wall, minimal abuse metadata, and clear handling of hosted requests.',
    label: 'Privacy-first',
  },
] as const;

const workflows = [
  {
    eyebrow: 'Foundation',
    title: 'Screen options before the spreadsheet marathon',
    description:
      'Compare shallow, pile, and piled-raft paths from early site parameters, then export clean results for engineering review.',
    command: 'geotech agent "compare shallow vs pile vs piled raft for 12-story on soft clay"',
    output: [
      'Clay profile identified · Cu = 35 kPa · SPT N = 8',
      'Settlement risk elevated for shallow footings',
      'Recommended option · piled raft with 18 m bored piles',
    ],
  },
  {
    eyebrow: 'Tunnel',
    title: 'Move from face conditions to TBM decisions faster',
    description:
      'Blend rock mass classification, predicted penetration, and support notes in one workflow tailored to tunnel delivery teams.',
    command: 'geotech tunnel tbm-predict --diameter 6.5 --ucs 80 --rqd 65',
    output: ['Penetration · 8.4 mm/rev', 'Daily advance · 14.2 m/day', 'Cutter life · 380 m/cutter'],
  },
  {
    eyebrow: 'Vision',
    title: 'Turn field imagery into structured data',
    description:
      'Extract usable observations from tunnel face photos, core boxes, and logs, then push them into deterministic or report workflows.',
    command: 'geotech vision rmr face.jpg',
    output: ['UCS ≈ 85 MPa', 'RQD ≈ 72%', 'RMR = 65 · Class II Good Rock'],
  },
] as const;

const betaFeatures = [
  'Unlimited deterministic calculations',
  'Hosted GLM beta access with no user provider key',
  'No signup or billing during this wave',
  'Docs, changelog, and feedback-driven iterations',
] as const;

const commercialFeatures = [
  'Procurement-ready rollout after beta validation',
  'Hosted usage tiers and policy controls',
  'Enterprise deployment and governance options',
  'Support for larger production workflows',
] as const;

const faqs = [
  {
    q: 'Is geotechCLI a calculator, an AI assistant, or both?',
    a: 'It should present itself as both, with the boundary made explicit. Deterministic calculations are the foundation. AI augments interpretation, vision extraction, report drafting, and multi-step reasoning where useful.',
  },
  {
    q: 'Why remove most of the current pricing cards?',
    a: 'A beta landing page converts better when it focuses on the one thing users can actually access now. One active beta card and one future commercial path read as more premium than several unavailable plans.',
  },
  {
    q: 'Does the redesign require WebGL?',
    a: 'No. The hero scene below uses layered CSS depth so it feels dimensional without the performance and maintenance cost of a heavy 3D stack.',
  },
  {
    q: 'What should be the first real asset to produce?',
    a: 'A crisp product hero asset that combines a terminal session, a report excerpt, and a subsurface visual. That single visual would do more for trust than more abstract gradients.',
  },
] as const;

const ldJson = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'geotechCLI',
  applicationCategory: 'EngineeringApplication',
  operatingSystem: 'Windows, macOS, Linux',
  description:
    'Deterministic geotechnical calculations, subsurface vision workflows, and privacy-first AI agent tooling in one terminal-first product.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
  url: 'https://beta.geotechcli.com/',
};

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300/90">
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-slate-300 sm:text-base">
        {copy}
      </p>
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#071019]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-white">
          geotech<span className="text-emerald-300">CLI</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
          <a href="#demo" className="transition hover:text-white">
            Demo
          </a>
          <a href="#capabilities" className="transition hover:text-white">
            Capabilities
          </a>
          <a href="#trust" className="transition hover:text-white">
            Trust
          </a>
          <a href="#beta" className="transition hover:text-white">
            Beta access
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="hidden rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white sm:inline-flex"
          >
            Read docs
          </Link>
          <Link
            href="/docs"
            className="inline-flex rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110"
          >
            Install beta
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroScene() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute inset-0 -translate-y-8 translate-x-8 rounded-full bg-cyan-400/15 blur-3xl" />
      <div className="absolute inset-x-10 top-20 h-56 rounded-full bg-emerald-400/12 blur-3xl" />

      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="rounded-[26px] border border-white/8 bg-[#0a1624]/95 p-4">
          <div className="flex items-center justify-between border-b border-white/8 pb-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                Subsurface preview
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                Product story told as data, not decoration
              </h3>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-mono text-[11px] text-emerald-200">
              CSS depth scene
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative h-[340px] overflow-hidden rounded-[24px] border border-white/8 bg-[#071019]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.10),_transparent_38%)]" />
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:34px_34px]" />

              <div className="absolute left-5 right-5 top-5 h-11 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-lg">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Boreholes · foundation screening · tunnel context</span>
                  <span>3D-like depth</span>
                </div>
              </div>

              <div className="absolute inset-x-5 top-[86px] h-[56px] rounded-[18px] border border-white/10 bg-gradient-to-r from-slate-700/80 via-slate-600/70 to-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.3)]" />
              <div className="absolute inset-x-5 top-[132px] h-[74px] rounded-[20px] border border-amber-200/8 bg-gradient-to-r from-[#4a3728]/90 via-[#5d4630]/85 to-[#3d2d20]/90 shadow-[0_18px_44px_rgba(0,0,0,0.32)]" />
              <div className="absolute inset-x-5 top-[204px] h-[54px] rounded-[18px] border border-cyan-200/8 bg-gradient-to-r from-[#1b3440]/95 via-[#1a4052]/90 to-[#163141]/95 shadow-[0_22px_46px_rgba(0,0,0,0.35)]" />
              <div className="absolute inset-x-5 bottom-5 h-[70px] rounded-[22px] border border-white/8 bg-gradient-to-r from-[#2a2238] via-[#1f2740] to-[#1a2235] shadow-[0_22px_46px_rgba(0,0,0,0.36)]" />

              <div className="absolute left-[88px] top-[68px] h-[220px] w-[12px] rounded-full bg-gradient-to-b from-emerald-200 via-emerald-300 to-slate-100 shadow-[0_0_20px_rgba(52,211,153,0.35)]" />
              <div className="absolute left-[176px] top-[92px] h-[196px] w-[12px] rounded-full bg-gradient-to-b from-cyan-100 via-cyan-300 to-slate-100 shadow-[0_0_20px_rgba(34,211,238,0.35)]" />
              <div className="absolute left-[264px] top-[110px] h-[178px] w-[12px] rounded-full bg-gradient-to-b from-violet-100 via-violet-300 to-slate-100 shadow-[0_0_20px_rgba(167,139,250,0.30)]" />

              <div className="absolute right-8 top-[150px] h-[84px] w-[84px] rounded-full border border-cyan-200/20 bg-cyan-300/8 shadow-[0_0_30px_rgba(34,211,238,0.25)]" />
              <div className="absolute right-[52px] top-[194px] h-[10px] w-[124px] -rotate-[18deg] rounded-full bg-cyan-200/30 blur-[1px]" />
              <div className="absolute right-[44px] top-[134px] rounded-full border border-white/10 bg-slate-950/75 px-3 py-2 font-mono text-[11px] text-slate-200 shadow-lg">
                Tunnel path
              </div>
            </div>

            <div className="grid gap-4">
              <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#07111b] shadow-[0_18px_48px_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
                  <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    terminal
                  </span>
                </div>
                <pre className="overflow-x-auto px-4 py-4 font-mono text-[12px] leading-7 text-slate-300">
                  <span className="text-emerald-300">$</span> geotech agent{' '}
                  <span className="text-cyan-300">
                    "screen foundation options for 12-story on soft clay"
                  </span>
                  {'\n'}
                  <span className="text-slate-500">→ Geo + Foundation agents launched</span>
                  {'\n'}
                  <span className="text-slate-500">→ Settlement risk flagged for shallow option</span>
                  {'\n'}
                  <span className="text-emerald-300">✓</span> Recommended: piled raft
                  {'\n'}
                  <span className="text-emerald-300">✓</span> Report exported → foundation-analysis.md
                </pre>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">
                    trust boundary
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    <li>No signup</li>
                    <li>No provider key</li>
                    <li>Minimal abuse metadata</li>
                  </ul>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-violet-300/80">
                    outputs
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    <li>Markdown reports</li>
                    <li>JSON and GeoJSON</li>
                    <li>CLI-ready workflows</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.10),_transparent_34%),radial-gradient(circle_at_85%_18%,_rgba(56,189,248,0.10),_transparent_26%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:60px_60px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-16 pt-10 lg:grid-cols-[1.04fr_0.96fr] lg:px-8 lg:pb-24">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 font-mono text-[12px] text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Deterministic geotechnical workflows + hosted AI beta
          </div>

          <h1 className="mt-8 max-w-[12ch] text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
            Geotechnical engineering, from field data to decision, in one command line.
          </h1>

          <p className="mt-7 max-w-2xl text-[17px] leading-8 text-slate-300 sm:text-lg">
            geotechCLI should feel less like a generic AI launch page and more like a domain-native
            engineering system. Lead with deterministic calculations, show the product, then layer in
            AI, vision, and privacy as proof of seriousness.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Install beta
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              View product story
            </a>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
            {['No signup', 'No provider key', 'Foundation + tunnel + rock mass', 'Privacy-first beta'].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <HeroScene />
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-5 lg:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400">
          Built for
        </span>
        {[
          'bearing capacity',
          'settlement screening',
          'liquefaction',
          'RMR and Q-system',
          'TBM prediction',
          'retaining systems',
          'field vision workflows',
        ].map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/10 bg-[#0b1622] px-3 py-1.5 text-sm text-slate-200"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading
        eyebrow="Product evidence"
        title="Show the product before explaining the product"
        copy="The current page talks well, but it proves too little. This section reframes the story around real workflows, visible inputs, and outputs people can trust at a glance."
      />

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {workflows.map((workflow) => (
          <article
            key={workflow.title}
            className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-white/16 hover:bg-white/[0.05]"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-emerald-300/90">
              {workflow.eyebrow}
            </p>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">
              {workflow.title}
            </h3>
            <p className="mt-4 text-[15px] leading-7 text-slate-300">{workflow.description}</p>

            <div className="mt-6 rounded-[22px] border border-white/8 bg-[#07111b] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">command</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-6 text-slate-200">
                {workflow.command}
              </pre>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-[#0b1622] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">result</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-200">
                {workflow.output.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading
        eyebrow="Why this feels more premium"
        title="Reduce repetition. Increase proof. Make the brand feel domain-native."
        copy="A premium engineering landing page earns trust by being precise, sparse, and visibly useful. The redesign shifts from generic neon-card repetition to a tighter narrative with stronger product proof."
      />

      <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => (
          <article
            key={pillar.title}
            className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
          >
            <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-200">
              {pillar.label}
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-white">{pillar.title}</h3>
            <p className="mt-4 text-[15px] leading-7 text-slate-300">{pillar.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrustArchitecture() {
  return (
    <section id="trust" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <div className="overflow-hidden rounded-[32px] border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(8,18,29,0.96),rgba(7,16,25,0.94))] shadow-[0_40px_120px_rgba(0,0,0,0.4)]">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="border-b border-white/8 p-8 lg:border-b-0 lg:border-r lg:p-12">
            <Eyebrow>Trust model</Eyebrow>
            <h2 className="mt-4 max-w-[12ch] text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
              Explain the privacy boundary like an architecture choice.
            </h2>
            <p className="mt-6 max-w-xl text-[15px] leading-8 text-slate-300">
              The current trust message is strong. The redesign simply makes it easier to scan,
              easier to believe, and more premium in tone. Users should understand what stays,
              what moves, and why.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {['No signup', 'No prompt vault', 'No training on project data', 'Minimal abuse counters'].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="p-8 lg:p-12">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Input',
                  text: 'Commands, images, or documents enter the hosted beta flow only when needed for completion.',
                },
                {
                  step: '02',
                  title: 'Processing',
                  text: 'Deterministic engines calculate locally in product logic; hosted AI handles bounded reasoning and extraction tasks.',
                },
                {
                  step: '03',
                  title: 'Retention boundary',
                  text: 'Keep the promise readable: short-lived hashed counters for abuse protection, not reusable prompt archives.',
                },
              ].map((item) => (
                <div key={item.step} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-300/80">
                    {item.step}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-[#0b1622] p-5">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  user input
                </span>
                <span className="text-slate-500">→</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  deterministic engine
                </span>
                <span className="text-slate-500">→</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  hosted model completion
                </span>
                <span className="text-slate-500">→</span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">
                  exportable output
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Beta() {
  return (
    <section id="beta" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading
        eyebrow="Commercial story"
        title="A beta page should sell the present, not decorate the future"
        copy="The current four-card pricing block adds friction because only one path is real today. This redesign keeps one active beta card and one forward-looking commercial track."
      />

      <div className="mt-16 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative overflow-hidden rounded-[30px] border border-emerald-300/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0.03))] p-8 shadow-[0_30px_100px_rgba(16,185,129,0.08)]">
          <div className="absolute right-6 top-6 rounded-full bg-emerald-300 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-950">
            Available now
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-emerald-200">Strong beta</p>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-5xl font-semibold tracking-[-0.06em] text-white">$0</span>
            <span className="pb-2 text-slate-300">during current wave</span>
          </div>
          <p className="mt-5 max-w-2xl text-[15px] leading-8 text-slate-200/90">
            Focus the page on what engineers can evaluate now: deterministic workflows, hosted AI beta
            access, documentation, and feedback-driven iteration without signup or billing friction.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {betaFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Install beta
            </Link>
            <Link
              href="/changelog"
              className="inline-flex rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20"
            >
              View changelog
            </Link>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">
            Commercial rollout
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">Planned, but not pretending to be purchasable yet</h3>
          <p className="mt-5 text-[15px] leading-8 text-slate-300">
            Premium products look confident about their current state. A tighter roadmap card signals
            maturity better than multiple unavailable tiers.
          </p>
          <ul className="mt-8 space-y-3">
            {commercialFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0b1622] p-4 text-sm text-slate-200">
                <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <a
            href="mailto:support@geotechcli.com?subject=geotechCLI%20Commercial%20Interest"
            className="mt-8 inline-flex rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20"
          >
            Register commercial interest
          </a>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 lg:px-8">
      <SectionHeading
        eyebrow="SEO and objections"
        title="Add FAQ content that answers intent, not just branding"
        copy="A well-written FAQ helps both people and search engines understand what the product does, who it is for, and why the beta model is unusual."
      />
      <div className="mt-14 space-y-4">
        {faqs.map((item) => (
          <details
            key={item.q}
            className="group rounded-[24px] border border-white/10 bg-white/[0.03] p-6 open:bg-white/[0.04]"
          >
            <summary className="cursor-pointer list-none text-left text-lg font-semibold tracking-tight text-white">
              {item.q}
            </summary>
            <p className="mt-4 max-w-3xl text-[15px] leading-8 text-slate-300">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 lg:px-8">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] px-8 py-12 sm:px-12 sm:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.10),_transparent_34%)]" />
        <div className="relative">
          <Eyebrow>Final call to action</Eyebrow>
          <h2 className="mt-4 max-w-[12ch] text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
            Let the page feel like a serious engineering product from the first screen.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-8 text-slate-300">
            Stronger hierarchy, better product proof, tighter SEO, and a more grounded visual system
            together do more than extra glow effects ever will.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Install beta
            </Link>
            <a
              href="mailto:support@geotechcli.com"
              className="inline-flex rounded-full border border-white/12 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20"
            >
              Contact team
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 text-sm text-slate-400 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <div className="font-mono font-semibold text-white">
            geotech<span className="text-emerald-300">CLI</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-slate-400">
            Deterministic geotechnical calculations, domain-aware AI workflows, and a clearer trust
            story for the hosted beta.
          </p>
        </div>

        <div className="flex flex-wrap gap-5">
          <Link href="/docs" className="transition hover:text-white">
            Docs
          </Link>
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <Link href="/changelog" className="transition hover:text-white">
            Changelog
          </Link>
          <a href="mailto:support@geotechcli.com" className="transition hover:text-white">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#071019] text-white antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }} />
      <Nav />
      <Hero />
      <ProofStrip />
      <Demo />
      <Capabilities />
      <TrustArchitecture />
      <Beta />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}

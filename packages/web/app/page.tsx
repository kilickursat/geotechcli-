import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { CodeDemo } from '@/components/CodeDemo';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Nav />
      <Hero />
      <section className="px-12 py-24 max-w-[960px]">
        <p className="text-[clamp(26px,3.5vw,40px)] leading-[1.45] font-normal text-[var(--text-secondary)] tracking-tight">
          Geotechnical engineering has no AI-native CLI tool.{' '}
          <strong className="text-[var(--text-primary)] font-semibold">
            geotechCLI changes that.
          </strong>{' '}
          Deterministic calculations, LLM-powered interpretation, and rich
          terminal visualization —{' '}
          <strong className="text-[var(--text-primary)] font-semibold">
            all from one command.
          </strong>
        </p>
      </section>
      <Features />
      <CodeDemo />
      <Pricing />
      <section className="py-24 text-center">
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight mb-4">
          Start analyzing ground truth.
        </h2>
        <p className="text-[var(--text-secondary)] text-base mb-8 max-w-md mx-auto">
          AI-native. Runs anywhere Node does. Install in seconds, deliver
          results in minutes.
        </p>
        <div className="flex gap-4 justify-center items-center">
          <a
            href="/docs"
            className="px-6 py-3 bg-[var(--accent-teal)] text-[var(--bg-primary)] font-semibold text-sm rounded-lg hover:brightness-110 transition"
          >
            Install geotechCLI
          </a>
          <a
            href="https://github.com/kilickursat/geotechcli"
            className="px-6 py-3 text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition"
          >
            View on GitHub
          </a>
        </div>
      </section>
      <Footer />
    </>
  );
}

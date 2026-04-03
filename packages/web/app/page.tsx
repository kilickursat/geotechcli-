import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { PrivacyCallout } from '@/components/PrivacyCallout';
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
          geotechCLI is now running as a strong beta.
          <strong className="text-[var(--text-primary)] font-semibold">
            {' '}Deterministic workflows are ready today.
          </strong>
          {' '}AI capabilities are available with your own provider key. Hosted
          anonymous GLM access, signup, and billing are not live yet in this wave.
          <strong className="text-[var(--text-primary)] font-semibold">
            {' '}The goal of this branch is safe public validation, not fake production.
          </strong>
        </p>
      </section>
      <PrivacyCallout />
      <Features />
      <CodeDemo />
      <Pricing />
      <section className="py-24 text-center">
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight mb-4">
          Install the beta. Shape the product.
        </h2>
        <p className="text-[var(--text-secondary)] text-base mb-8 max-w-md mx-auto">
          The public beta is focused on real CLI usage, deterministic confidence,
          and a safer rollout path for hosted GLM features.
        </p>
        <div className="flex gap-4 justify-center items-center">
          <a
            href="/docs"
            className="px-6 py-3 bg-[var(--accent-teal)] text-[var(--bg-primary)] font-semibold text-sm rounded-lg hover:brightness-110 transition"
          >
            Install Beta
          </a>
          <a
            href="https://github.com/kilickursat/geotechcli-"
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

import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { Stats } from '@/components/Stats';
import { CodeDemo } from '@/components/CodeDemo';
import { PrivacyCallout } from '@/components/PrivacyCallout';
import { Pricing } from '@/components/Pricing';
import { CTASection } from '@/components/CTASection';
import { Footer } from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Nav />
      <Hero />

      {/* First-in-field statement */}
      <section className="px-12 py-16 border-y border-[var(--border-color)]">
        <p
          className="font-semibold tracking-tight text-[var(--text-secondary)] max-w-[780px] mx-auto text-center leading-[1.55]"
          style={{ fontSize: 'clamp(18px,2.5vw,28px)' }}
        >
          geotechCLI is the{' '}
          <span style={{ color: 'var(--accent-teal)' }}>world&apos;s first agentic AI CLI</span>
          {' '}purpose-built for geotechnical engineering — combining deterministic calculation
          engines with{' '}
          <span style={{ color: 'var(--accent-cyan)' }}>GLM-5.1 multi-agent orchestration</span>,
          vision workflows, and AI-drafted reports in a single terminal interface.
        </p>
      </section>

      <Features />
      <HowItWorks />
      <Stats />
      <CodeDemo />
      <PrivacyCallout />
      <Pricing />

      <CTASection />

      <Footer />
    </>
  );
}

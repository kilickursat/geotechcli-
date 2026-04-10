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

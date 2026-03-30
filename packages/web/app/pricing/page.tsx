import { Nav } from '@/components/Nav';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
  TIER_LIMITS,
} from '@geotechcli/core';

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="pt-24">
        <Pricing />
        <section className="px-12 pb-24 max-w-[800px] mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-6">FAQ</h2>
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-2">Are deterministic calculations really free?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Yes. Bearing capacity, settlement, liquefaction, classification, TBM prediction, and
                all other deterministic commands are always free with no limits. They work offline
                too — no API key required.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What happens if I hit the free limit?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Unregistered users get 5 free AI calls to try the platform. After that, you&apos;ll
                see an upgrade prompt. Registered free users get {TIER_LIMITS.free.llmCallsPerMonth}{' '}
                AI analyses per month. Deterministic calculations continue working normally at all times.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What is "Bring Your Own LLM" (BYOL)?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Pro and Annual subscribers can configure any OpenAI-compatible LLM endpoint. This
                includes OpenAI, Anthropic, self-hosted models (Ollama, vLLM), or any cloud provider.
                Your API calls go directly to your provider — not through our servers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What LLM models are used by default?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Free and Lite Pro tiers use Zhipu {DEFAULT_LLM_MODEL} for text and{' '}
                {DEFAULT_LLM_VISION_MODEL} for vision analysis. These are high-quality models from
                Z.AI with strong performance on technical tasks.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How is usage tracked?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Each AI-powered command (vision, agent, analyze, report) counts as one call against
                your monthly quota. You can check your usage anytime with <code className="bg-[var(--bg-card)] px-1.5 py-0.5 rounded text-[var(--accent-teal)] font-[var(--font-mono)] text-xs">geotech status</code>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import { Nav } from '@/components/Nav';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core';

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="pt-24">
        <Pricing />
        <section className="px-12 pb-24 max-w-[800px] mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-6">Strong Beta FAQ</h2>
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-2">What is included in strong beta today?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Deterministic commands are available now with no signup or billing.
                That includes bearing capacity, liquefaction, classification, pile,
                slope, retaining, tunnel, exports, and bridge script generation.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How does AI work in this beta branch?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Right now, AI commands work with your own provider key. The current
                default model family is Zhipu {DEFAULT_LLM_MODEL} for text and{' '}
                {DEFAULT_LLM_VISION_MODEL} for vision. Hosted anonymous GLM beta
                access is being prepared for the next wave.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Why are the paid plans marked coming soon?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Stripe approval, billing, signup, and entitlement flows are
                intentionally disabled during strong beta. The goal of this branch
                is to validate the CLI, docs, and hosted beta rollout safely before
                commercial plans go live.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What LLM models are used by default?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                The strong-beta defaults are Zhipu {DEFAULT_LLM_MODEL} for text and{' '}
                {DEFAULT_LLM_VISION_MODEL} for vision analysis. These defaults will
                also be used for the hosted beta gateway once it is enabled.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Will there be hosted AI limits?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Yes. Hosted anonymous beta access will ship with strict rate limits
                and anti-abuse controls. Those limits will be published once the
                beta proxy rollout is active.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

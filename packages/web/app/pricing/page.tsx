import { Nav } from '@/components/Nav';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core/meta';
import { PATREON_JOIN_URL, DONATION_MINIMUM_USD } from '@/lib/site';

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="pt-24">
        <Pricing />
        <section className="px-12 pb-24 max-w-[800px] mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-6">Donation &amp; Membership FAQ</h2>
          <div className="space-y-8">
            <div>
              <h3 className="font-semibold mb-2">What is free?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                All deterministic geotechnical tools are free for everyone, forever — no signup, no API key,
                works offline. That includes bearing capacity, liquefaction, classification, pile, slope,
                retaining, settlement, tunnel/TBM, seepage, workspace analysis, monitoring signal analysis,
                visualization, exports, and bundled skills.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What do donations support?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Donations support the Tier-1 LLM and agentic features — chat, agent, ingest, vision, GBR Q&amp;A,
                AI reports, and natural-language classification — using the hosted GLM defaults ({DEFAULT_LLM_MODEL}{' '}
                for text and {DEFAULT_LLM_VISION_MODEL} for vision) or your own provider key (BYOK).
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How much, and where?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Donations start at ${DONATION_MINIMUM_USD} or more through Patreon —{' '}
                <a
                  href={PATREON_JOIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-teal)] hover:brightness-110 transition"
                >
                  donate on Patreon
                </a>
                .
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How do I avoid being charged every month?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Patreon has no one-time payment option; memberships renew automatically every month. Our goal is
                a donation, not a subscription. To keep your donation a one-time gift and avoid automatic
                withdrawals in the following months, cancel your Patreon membership immediately after your
                payment clears — your support for the month still counts.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Can I use my own LLM key?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Yes. geotechCLI is LLM-agnostic — configure OpenAI, Anthropic, Zhipu/Z.ai, any
                OpenAI-compatible/OpenRouter endpoint, or Hugging Face with your own key. The hosted GLM
                defaults are {DEFAULT_LLM_MODEL} for text and {DEFAULT_LLM_VISION_MODEL} for vision.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

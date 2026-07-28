import { Nav } from '@/components/Nav';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_VISION_MODEL,
} from '@geotechcli/core/meta';
import {
  GITHUB_SPONSORS_URL,
  PATREON_JOIN_URL,
  DONATION_MINIMUM_USD,
  ONE_TIME_AMOUNTS_USD,
} from '@/lib/site';

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="pt-24">
        <Pricing />
        <section className="px-12 pb-24 max-w-[800px] mx-auto">
          <h2 className="text-2xl font-bold tracking-tight mb-6">Sponsorship FAQ</h2>
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
                Monthly tiers start at ${DONATION_MINIMUM_USD} through{' '}
                <a
                  href={GITHUB_SPONSORS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-teal)] hover:brightness-110 transition"
                >
                  GitHub Sponsors
                </a>
                , which is the primary flow. If you already sponsor through{' '}
                <a
                  href={PATREON_JOIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-teal)] hover:brightness-110 transition"
                >
                  Patreon
                </a>
                , that support continues to count and there is no need to move.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Is there a one-time option?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Yes. GitHub Sponsors supports genuine one-time contributions of{' '}
                ${ONE_TIME_AMOUNTS_USD.join(', $')} with no automatic renewal — nothing starts, so there is
                nothing to cancel afterwards. Monthly tiers can be cancelled at any time from your GitHub
                sponsorship settings.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What does sponsorship get me?</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                Optional public recognition, and the project staying maintained. Sponsorship is optional and
                never changes access to the project — it does not purchase engineering approval, an SLA,
                roadmap control, or a guaranteed feature. Priorities remain based on safety, community value,
                and maintainer capacity.
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

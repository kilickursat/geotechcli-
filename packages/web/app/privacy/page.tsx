import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const sections = [
  {
    title: 'What geotechCLI does not do',
    points: [
      'We do not sell user engineering data.',
      'We do not use prompts, uploaded project files, or outputs to train geotechCLI.',
      'We do not keep a signup-based customer profile in strong beta.',
      'We do not persist raw prompt or file content on geotechCLI servers as part of the intended hosted beta path.',
    ],
  },
  {
    title: 'What happens in strong beta',
    points: [
      'AI, vision, and agent commands use the hosted GLM beta path by default.',
      'That means requests are forwarded from the CLI to the geotechCLI beta gateway and then to the model provider needed to answer them.',
      'Deterministic calculations stay local and do not require an AI provider.',
    ],
  },
  {
    title: 'What hosted beta is designed to keep',
    points: [
      'Hosted beta requests are intended to be forwarded only for real-time completion.',
      'The privacy target is no raw prompt storage, no file-content logging, and no reuse of user engineering data for model training.',
      'Abuse protection should keep only minimal hashed counters and service metadata.',
    ],
  },
  {
    title: 'Important provider note',
    points: [
      'A response still requires sending the request to the model provider that generates it.',
      'In strong beta, the hosted defaults are glm-5.1 for text and agent reasoning, and glm-5v-turbo for vision unless the user intentionally switches to another provider.',
      'The hosted model path is backed by Z.ai. User prompts are processed in real-time and not stored or used for model training by geotechCLI.',
      'For the hosted beta path, provider-side handling follows Z.ai platform terms in addition to geotechCLI server behavior.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="pt-24 px-12 pb-16 max-w-[920px]">
        <div className="max-w-[760px]">
          <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-4">
            Privacy
          </div>
          <h1 className="text-[clamp(34px,4vw,52px)] font-bold tracking-tight leading-[1.05] mb-5">
            Privacy is part of the product, not a footnote.
          </h1>
          <p className="text-[15px] leading-[1.85] text-[var(--text-secondary)] max-w-[720px]">
            geotechCLI is being shaped around a simple principle: engineers
            should be able to evaluate AI workflows without giving up control of
            their project data. Strong beta keeps that boundary visible.
          </p>
        </div>

        <div className="mt-14 border-t border-[var(--border-color)]">
          {sections.map((section, index) => (
            <section
              key={section.title}
              className={`grid gap-6 py-10 md:grid-cols-[220px_minmax(0,1fr)] ${
                index > 0 ? 'border-t border-[var(--border-color)]' : ''
              }`}
            >
              <div className="font-[var(--font-mono)] text-[12px] uppercase tracking-[1.8px] text-[var(--text-muted)]">
                {section.title}
              </div>
              <div className="space-y-4">
                {section.points.map((point) => (
                  <p
                    key={point}
                    className="text-[15px] leading-[1.8] text-[var(--text-secondary)]"
                  >
                    {point}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

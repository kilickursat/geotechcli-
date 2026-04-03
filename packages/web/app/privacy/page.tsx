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
    title: 'What happens in Wave 1',
    points: [
      'AI, vision, and agent commands use the provider configured by the user.',
      'That means requests go directly from the CLI to the chosen provider in this wave.',
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
      'In Wave 1, that provider is selected by the user.',
      'According to the current Z.AI API terms for developers, end-user content is used only as necessary to provide the API service and is not used to develop or improve services unless the customer explicitly agrees.',
      'For hosted Z.AI beta, provider-side handling follows the provider API terms and privacy commitments in addition to geotechCLI server behavior.',
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

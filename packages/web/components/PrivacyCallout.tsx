const guarantees = [
  {
    label: 'No signup',
    title: 'No account wall for beta evaluation',
    body:
      'Strong beta does not require account creation, billing setup, or profile completion before users can evaluate the CLI.',
  },
  {
    label: 'No prompt storage',
    title: 'geotechCLI does not keep your prompt or file content',
    body:
      'Hosted beta requests are intended to be forwarded only for real-time completion, not stored on geotechCLI servers as reusable prompt or file history.',
  },
  {
    label: 'No training',
    title: 'Your project data is not used to train geotechCLI',
    body:
      'We do not build training datasets from user prompts, uploaded engineering files, or generated outputs.',
  },
  {
    label: 'Minimal metadata',
    title: 'Only lightweight abuse-protection counters remain',
    body:
      'For hosted beta safety, the design keeps short-lived hashed rate-limit data and service health metadata, not raw prompt logs or reusable engineering content.',
  },
];

export function PrivacyCallout() {
  return (
    <section className="px-12 pb-24">
      <div className="relative overflow-hidden rounded-[28px] border border-[rgba(45,212,191,0.2)] bg-[linear-gradient(135deg,rgba(12,18,29,0.98),rgba(9,14,23,0.94))]">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(90deg, rgba(45,212,191,0.08) 0, rgba(45,212,191,0.08) 1px, transparent 1px), linear-gradient(rgba(45,212,191,0.05) 0, rgba(45,212,191,0.05) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
        <div className="relative grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="px-8 py-10 lg:px-12 lg:py-14">
            <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-4">
              Privacy First
            </div>
            <h2 className="text-[clamp(28px,3.4vw,44px)] font-bold tracking-tight leading-[1.05] max-w-[12ch]">
              Engineering data deserves a hard boundary.
            </h2>
            <p className="text-[15px] leading-[1.8] text-[var(--text-secondary)] max-w-[540px] mt-5">
              The strong beta trust model is intentionally simple: no signup,
              no data resale, no training on user project data, and no prompt
              or file storage on geotechCLI servers as part of the intended
              hosted beta path.
            </p>
            <p className="text-[12.5px] leading-[1.8] text-[var(--text-muted)] max-w-[560px] mt-6">
              Requests still have to reach the model provider needed to answer
              them. In hosted beta, geotechCLI forwards requests only for
              completion and keeps minimal hashed abuse-protection counters
              instead of raw prompt history.
            </p>
            <a
              href="/privacy"
              className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-[var(--accent-teal)] hover:text-[var(--text-primary)] transition"
            >
              Read privacy details
              <span aria-hidden="true">-&gt;</span>
            </a>
          </div>

          <div className="border-t border-[rgba(45,212,191,0.12)] lg:border-l lg:border-t-0">
            {guarantees.map((item, index) => (
              <div
                key={item.title}
                className={`group px-8 py-7 lg:px-10 lg:py-9 transition-colors duration-300 hover:bg-[rgba(45,212,191,0.04)] ${
                  index > 0 ? 'border-t border-[rgba(45,212,191,0.12)]' : ''
                }`}
              >
                <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[1.8px] text-[var(--accent-blue)] mb-2">
                  {item.label}
                </div>
                <h3 className="text-lg font-semibold tracking-tight mb-2 group-hover:text-[var(--accent-teal)] transition-colors">
                  {item.title}
                </h3>
                <p className="text-[13.5px] leading-[1.75] text-[var(--text-secondary)] max-w-[44ch]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

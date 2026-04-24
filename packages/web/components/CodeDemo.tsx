export function CodeDemo() {
  return (
    <section className="px-12 pb-24">
      <div className="mb-12">
        <div className="font-[var(--font-mono)] text-[11px] font-medium uppercase tracking-[2px] text-[var(--accent-teal)] mb-3">
          Workflow
        </div>
        <h2 className="text-[clamp(28px,3.5vw,42px)] font-bold tracking-tight">
          From raw data to insight.
        </h2>
        <p className="text-[var(--text-secondary)] text-[15px] mt-3 max-w-[500px]">
          Local GroundModels, deterministic checks, and hosted-beta workflows without boilerplate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 max-w-[1100px]">
        {/* Input terminal */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[14px] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
            <div className="flex gap-[7px]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
            </div>
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
              input
            </span>
          </div>
          <pre className="p-5 font-[var(--font-mono)] text-[13px] leading-[1.8] text-[var(--text-secondary)] overflow-x-auto">
            <span className="text-[var(--text-muted)]"># Bearing capacity analysis</span>
{'\n'}<span className="text-[var(--accent-teal)]">geotech</span> bearing <span className="text-[var(--accent-blue)]">--depth</span> 5 <span className="text-[var(--accent-blue)]">--phi</span> 30 \
{'\n'}  <span className="text-[var(--accent-blue)]">--cohesion</span> 25 <span className="text-[var(--accent-blue)]">--width</span> 2.5
{'\n'}
{'\n'}<span className="text-[var(--text-muted)]"># RMR from tunnel face photo</span>
{'\n'}<span className="text-[var(--accent-teal)]">geotech</span> vision rmr <span className="text-[var(--accent-orange)]">face.jpg</span>
{'\n'}
{'\n'}<span className="text-[var(--text-muted)]"># TBM performance prediction</span>
{'\n'}<span className="text-[var(--accent-teal)]">geotech</span> tunnel tbm-predict \
{'\n'}  <span className="text-[var(--accent-blue)]">--diameter</span> 6.5 <span className="text-[var(--accent-blue)]">--ucs</span> 80 <span className="text-[var(--accent-blue)]">--rqd</span> 65
{'\n'}
{'\n'}<span className="text-[var(--text-muted)]"># Local GroundModel dossier</span>
{'\n'}<span className="text-[var(--accent-teal)]">geotech</span> analyze <span className="text-[var(--accent-orange)]">.</span> <span className="text-[var(--accent-blue)]">--format</span> html
          </pre>
        </div>

        {/* Output terminal */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[14px] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
            <div className="flex gap-[7px]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-muted)] opacity-30" />
            </div>
            <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
              output
            </span>
          </div>
          <pre className="p-5 font-[var(--font-mono)] text-[13px] leading-[1.8] text-[var(--text-secondary)] overflow-x-auto">
            <span className="text-[var(--accent-teal)]">OK</span> Bearing Capacity - Meyerhof
{'\n'}  Ultimate:   <span className="text-[var(--text-primary)]">4,184 kPa</span>
{'\n'}  Allowable:  <span className="text-[var(--text-primary)]">1,395 kPa</span> (FS=3)
{'\n'}
{'\n'}<span className="text-[var(--accent-teal)]">OK</span> Hybrid RMR Classification
{'\n'}  Vision:     UCS approx 85 MPa, RQD approx 72%
{'\n'}  <span className="text-[var(--text-primary)]">RMR = 65</span> -&gt; Class II: Good Rock
{'\n'}  Support: spot bolts + 50mm shotcrete
{'\n'}
{'\n'}<span className="text-[var(--accent-teal)]">OK</span> TBM Performance
{'\n'}  Penetration: <span className="text-[var(--text-primary)]">8.4 mm/rev</span>
{'\n'}  Daily advance: <span className="text-[var(--text-primary)]">14.2 m/day</span>
{'\n'}  Cutter life: <span className="text-[var(--text-primary)]">380 m/cutter</span>
{'\n'}
{'\n'}<span className="text-[var(--accent-teal)]">OK</span> Workspace dossier saved to .geotech/workspace-dossier.html
{'\n'}  GroundModel: <span className="text-[var(--text-primary)]">4 boreholes, 52 evidence refs</span>
{'\n'}  Verifier: <span className="text-[var(--text-primary)]">review</span> (0 blocking, 2 review)
          </pre>
        </div>
      </div>
    </section>
  );
}

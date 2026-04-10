'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  { display: '1st', label: 'Agentic AI CLI in Geotechnical Engineering', accent: 'var(--accent-teal)', static: true },
  { target: 6, suffix: '+', label: 'AI-Powered Commands', accent: 'var(--accent-cyan)', static: false },
  { target: 11, suffix: '+', label: 'Deterministic Commands', accent: 'var(--accent-purple)', static: false },
  { target: 0, suffix: '', label: 'API Keys Required', accent: 'var(--accent-teal)', static: false },
];

function Counter({
  target,
  suffix,
  accent,
  display,
  isStatic,
}: {
  target?: number;
  suffix?: string;
  accent: string;
  display?: string;
  isStatic: boolean;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isStatic) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          if (!target) { setCount(0); return; }
          const duration = 1800;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, isStatic]);

  return (
    <div ref={ref} className="text-center">
      <div
        className="font-black leading-none tracking-[-3px]"
        style={{ fontSize: 'clamp(40px,5vw,60px)', color: accent }}
      >
        {isStatic ? display : `${target === 0 ? '0' : count}${suffix ?? ''}`}
      </div>
    </div>
  );
}

export function Stats() {
  return (
    <section className="py-16 px-12 max-w-[1000px] mx-auto">
      <div className="grid grid-cols-4 gap-8">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <Counter
              target={s.target}
              suffix={s.suffix}
              accent={s.accent}
              display={s.display}
              isStatic={s.static}
            />
            <div className="text-[13px] text-[var(--text-muted)] mt-2.5 font-medium leading-tight">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

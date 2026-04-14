'use client';

import { useEffect, useRef, useState } from 'react';

function GeologicalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;
    let scanY = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const layers = [
      { yRatio: 0.38, color: 'rgba(0,229,160,0.07)', amp: 18, speed: 0.35, freq: 0.007 },
      { yRatio: 0.52, color: 'rgba(0,196,255,0.05)', amp: 22, speed: 0.25, freq: 0.009 },
      { yRatio: 0.66, color: 'rgba(123,97,255,0.04)', amp: 14, speed: 0.45, freq: 0.006 },
      { yRatio: 0.80, color: 'rgba(0,229,160,0.03)', amp: 10, speed: 0.20, freq: 0.011 },
    ];

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * (canvas?.width ?? 1200),
      y: Math.random() * (canvas?.height ?? 800),
      r: Math.random() * 1.2 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.35 + 0.08,
    }));

    const draw = () => {
      t += 0.007;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Geological layers
      for (const layer of layers) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 3) {
          const y =
            h * layer.yRatio +
            Math.sin(x * layer.freq + t * layer.speed) * layer.amp +
            Math.sin(x * layer.freq * 2.5 + t * layer.speed * 1.6) * (layer.amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = layer.color;
        ctx.fill();
      }

      // Particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,160,${p.alpha})`;
        ctx.fill();
      }

      // Scan line
      scanY = (scanY + 0.6) % h;
      const grad = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, 'rgba(0,229,160,0.06)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, scanY - 50, w, 100);

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.75 }}
    />
  );
}

export function Hero() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText('npm install -g geotechcli');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-20 text-center">
      {/* Canvas background */}
      <GeologicalCanvas />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)] via-transparent to-[var(--bg-primary)] opacity-60 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-[860px] w-full flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[rgba(0,229,160,0.07)] border border-[rgba(0,229,160,0.18)] rounded-full text-[12px] font-medium text-[var(--accent-teal)] font-[var(--font-mono)] mb-8 w-fit tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse" />
          World&apos;s first agentic AI CLI for geotechnical engineering
        </div>

        {/* Headline */}
        <h1
          className="font-bold leading-[1.05] tracking-[-3px] mb-6"
          style={{ fontSize: 'clamp(40px,7vw,78px)' }}
        >
          Agentic AI meets
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, var(--accent-teal), var(--accent-cyan))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            the subsurface.
          </span>
        </h1>

        {/* Sub */}
        <p
          className="text-[var(--text-secondary)] leading-[1.65] max-w-[600px] mb-10 font-normal"
          style={{ fontSize: 'clamp(16px,2vw,19px)' }}
        >
          Multi-agent orchestration, vision workflows, and AI reasoning powered by{' '}
          <span style={{ color: 'var(--accent-teal)' }}>GLM-4.7-Flash</span> — combined with
          deterministic geotechnical engines. No provider key. No signup. One command.
        </p>

        {/* CTAs */}
        <div className="flex gap-4 justify-center flex-wrap mb-14">
          <button
            onClick={copy}
            className="px-7 py-3.5 font-bold text-[15px] rounded-lg transition-all duration-300 cursor-pointer"
            style={{
              background: 'var(--accent-teal)',
              color: 'var(--bg-primary)',
              letterSpacing: '-0.3px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 40px rgba(0,229,160,0.35)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = '';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
            }}
          >
            {copied ? 'Copied!' : '$ npm install -g geotechcli'}
          </button>
          <button
            onClick={() => scrollTo('how-it-works')}
            className="px-7 py-3.5 text-[15px] font-semibold rounded-lg border border-[rgba(255,255,255,0.1)] text-[var(--text-primary)] transition-all duration-300 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', letterSpacing: '-0.3px' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            See How It Works
          </button>
        </div>

        {/* CLI demo */}
        <div
          className="w-full max-w-[620px] text-left rounded-xl overflow-hidden"
          style={{
            background: 'rgba(10,10,20,0.85)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 0 1px rgba(0,229,160,0.06), 0 32px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Top gradient line */}
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent-teal), transparent)' }}
          />
          {/* Mac dots */}
          <div className="flex gap-1.5 px-5 pt-4 pb-3">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ffbd2e' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28ca41' }} />
          </div>
          {/* CLI lines */}
          <pre className="px-5 pb-5 font-[var(--font-mono)] text-[13px] leading-[1.9] overflow-x-auto">
            <span style={{ color: 'var(--accent-teal)' }}>$</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>geotech</span>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>agent</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>&quot;evaluate foundation options for 12-story on soft clay&quot;</span>
            {'\n'}
            <span style={{ color: 'var(--text-muted)' }}>⠋ Spawning Geo + Foundation + Seismic agents via GLM-4.7-Flash...</span>
            {'\n'}
            <span style={{ color: 'var(--text-muted)' }}>⠙ Geo agent: SPT N=8, clay CU=35 kPa, LL=52% identified</span>
            {'\n'}
            <span style={{ color: 'var(--text-muted)' }}>⠹ Foundation agent: pile vs raft analysis running...</span>
            {'\n'}
            <span style={{ color: 'var(--accent-teal)' }}>✓</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>Recommendation: piled raft — 18m bored piles at 450mm dia.</span>
            {'\n'}
            <span style={{ color: 'var(--accent-teal)' }}>✓</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>Report saved → ./foundation-analysis.md</span>
            {'\n'}
            <span style={{ color: 'var(--accent-teal)' }}>$</span>{' '}
            <span
              className="inline-block w-2 h-[14px] align-middle ml-0.5"
              style={{ background: 'var(--accent-teal)', animation: 'blink 1s step-end infinite' }}
            />
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </pre>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";

/**
 * Visuals scoped ONLY to the admin dashboard overview page.
 * All styles live under the `.dash-glow` root class so no other
 * admin page or shared component is affected.
 */
export const DashboardStyles = () => (
  <style>{`
    .dash-glow {
      --dg-bg: #0a0b10;
      --dg-blue: 213 94% 62%;
      --dg-purple: 268 86% 68%;
      --dg-cyan: 187 92% 60%;
      color-scheme: dark;
      position: relative;
      background:
        radial-gradient(900px 520px at 12% -8%, hsl(var(--dg-blue) / 0.16), transparent 62%),
        radial-gradient(760px 480px at 92% 4%, hsl(var(--dg-purple) / 0.14), transparent 60%),
        radial-gradient(700px 520px at 50% 108%, hsl(var(--dg-cyan) / 0.10), transparent 60%),
        var(--dg-bg);
      color: #e6e8f0;
      min-height: 100%;
    }
    .dash-glow h1, .dash-glow h2 { color: #f3f5fb; }
    .dash-glow .dg-muted { color: #8b90a3; }
    .dash-glow .dg-sep { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent); border: 0; }

    .dash-glow .dg-card {
      position: relative;
      border-radius: 16px;
      background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
      border: 1px solid rgba(255,255,255,.08);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 12px 32px -20px rgba(0,0,0,.9);
      transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
    }
    .dash-glow .dg-card:hover {
      transform: translateY(-2px);
      border-color: hsl(var(--dg-blue) / 0.42);
      box-shadow: 0 0 0 1px hsl(var(--dg-blue) / 0.16), 0 18px 46px -22px hsl(var(--dg-purple) / 0.75);
    }
    .dash-glow .dg-card-hero {
      border-color: hsl(var(--dg-blue) / 0.30);
      box-shadow: 0 0 44px -22px hsl(var(--dg-blue) / 0.9), 0 14px 40px -24px hsl(var(--dg-purple) / 0.8);
    }
    .dash-glow .dg-card-alert {
      border-color: rgba(245,180,80,.42);
      box-shadow: 0 0 40px -22px rgba(245,180,80,.9);
    }

    .dash-glow .dg-grad-text {
      background-image: linear-gradient(100deg, hsl(var(--dg-cyan)), hsl(var(--dg-blue)) 45%, hsl(var(--dg-purple)));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 0 18px hsl(var(--dg-blue) / 0.45));
    }

    .dash-glow .dg-chip {
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.04);
      border-radius: 10px;
      overflow: hidden;
    }
    .dash-glow .dg-chip button { color: #b9bed0; }
    .dash-glow .dg-chip button:hover { background: rgba(255,255,255,.06); }
    .dash-glow .dg-chip button[data-active="true"] {
      color: #fff;
      background: linear-gradient(100deg, hsl(var(--dg-blue) / .9), hsl(var(--dg-purple) / .9));
      box-shadow: inset 0 0 22px hsl(var(--dg-cyan) / .25);
    }

    .dash-glow .dg-live { position: relative; display: inline-flex; align-items: center; gap: .4rem; }
    .dash-glow .dg-dot {
      width: 7px; height: 7px; border-radius: 999px;
      background: hsl(var(--dg-cyan));
      box-shadow: 0 0 0 0 hsl(var(--dg-cyan) / .6);
      animation: dg-pulse 2s ease-out infinite;
    }
    @keyframes dg-pulse {
      0%   { box-shadow: 0 0 0 0 hsl(var(--dg-cyan) / .55); }
      70%  { box-shadow: 0 0 0 9px hsl(var(--dg-cyan) / 0); }
      100% { box-shadow: 0 0 0 0 hsl(var(--dg-cyan) / 0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dash-glow .dg-dot { animation: none; }
      .dash-glow .dg-card { transition: none; }
    }
  `}</style>
);

export const CountUp = ({
  value,
  duration = 900,
  format,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) => {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    const start = from.current;
    const diff = value - start;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + diff * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    from.current = value;
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <span className={className}>{format ? format(display) : Math.round(display).toLocaleString()}</span>;
};

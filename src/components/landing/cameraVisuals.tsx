import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

export function Reveal({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' }) {
  const [ref, seen] = useSeen<HTMLElement>();
  return <Tag ref={ref as never} className={`cam-reveal ${seen ? 'is-seen' : ''} ${className}`}>{children}</Tag>;
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setN(value); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min((t - t0) / 1100, 1); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <span ref={ref} className={className}>{n.toLocaleString('en-US')}</span>;
}

export function ShineButton({ onClick, children, pulse = false, className = '' }: { onClick: () => void; children: ReactNode; pulse?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} className={`cam-buy ${pulse ? 'animate-cta-pulse-success' : ''} ${className}`}>
    <span className="relative z-[1] flex items-center justify-center gap-1">{children}<ChevronRight className="w-5 h-5 shrink-0" strokeWidth={3} /></span>
  </button>;
}

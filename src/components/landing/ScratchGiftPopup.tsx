import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Fraction of silver pixels that must be cleared before the gift is revealed. */
const REVEAL_AT = 0.5;

export default function ScratchGiftPopup({ image, onActivate, onClose }: { image: string; onActivate: () => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, r.width, r.height);
    g.addColorStop(0, '#9ea3a8'); g.addColorStop(0.35, '#e4e7ea'); g.addColorStop(0.5, '#fbfcfd'); g.addColorStop(0.65, '#d5d9dc'); g.addColorStop(1, '#8d9297');
    ctx.fillStyle = g; ctx.fillRect(0, 0, r.width, r.height);
    for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * r.width, Math.random() * r.height, 2, 1); }
    ctx.fillStyle = '#5b6066'; ctx.font = 'bold 20px "Noto Sans Georgian", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('გადაფხიკე აქ ✨', r.width / 2, r.height / 2 + 7);
    ctx.globalCompositeOperation = 'destination-out';
  }, []);

  const reveal = useCallback(() => {
    if (done) return;
    setDone(true);
    const c = canvas.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    try { confetti({ particleCount: 140, spread: 80, origin: { y: 0.55 }, zIndex: 10001 }); } catch { /* ignore */ }
    try { navigator.vibrate?.(100); } catch { /* ignore */ }
  }, [done]);

  const scratch = (x: number, y: number) => {
    const c = canvas.current, ctx = c?.getContext('2d'); if (!c || !ctx || done) return;
    const r = c.getBoundingClientRect();
    ctx.beginPath(); ctx.arc(x - r.left, y - r.top, 22, 0, Math.PI * 2); ctx.fill();
  };
  const check = () => {
    const c = canvas.current, ctx = c?.getContext('2d'); if (!c || !ctx || done) return;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, n = 0;
    for (let i = 3; i < d.length; i += 64) { n++; if (d[i] === 0) clear++; }
    if (n && clear / n >= REVEAL_AT) reveal();
  };

  // Non-passive touch listeners so scratching never scrolls the page.
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const start = (e: TouchEvent) => { e.preventDefault(); drawing.current = true; setTouched(true); const t = e.touches[0]; scratch(t.clientX, t.clientY); };
    const move = (e: TouchEvent) => { e.preventDefault(); if (!drawing.current) return; const t = e.touches[0]; scratch(t.clientX, t.clientY); };
    const end = () => { drawing.current = false; check(); };
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end);
    return () => { c.removeEventListener('touchstart', start); c.removeEventListener('touchmove', move); c.removeEventListener('touchend', end); };
  });

  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);

  return (
    <div className="scratch-overlay fixed inset-0 z-[10000] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="სიურპრიზი">
      <div className="scratch-card relative w-full max-w-sm rounded-2xl p-[3px]">
        <div className="scratch-inner rounded-[14px] p-5 text-center">
          <button type="button" onClick={onClose} aria-label="დახურვა" className="scratch-close absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full"><X className="h-5 w-5" /></button>
          {!done ? <>
            <h2 className="text-[22px] font-black leading-tight pr-8">🎁 შენთვის სიურპრიზი გვაქვს!</h2>
            <p className="mt-1 text-base">გადაფხიკე და ნახე შენი საჩუქარი 👇</p>
          </> : <h2 className="text-[22px] font-black leading-tight pr-8">🎉 გილოცავ! მიიღებ +1 ცალს საჩუქრად</h2>}
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-[260px] overflow-hidden rounded-xl">
            <img src={image} alt="საჩუქარი" className="h-full w-full object-cover" />
            <span className="scratch-badge absolute right-2 top-2 rounded-full px-3 py-1 text-lg font-black">+1 🎁</span>
            <span className="scratch-prize absolute inset-x-0 bottom-0 py-2 text-lg font-black">+1 ცალი საჩუქრად</span>
            {!done && <canvas ref={canvas} aria-label="გადასაფხეკი ზედაპირი" className="absolute inset-0 h-full w-full cursor-pointer touch-none"
              onMouseDown={(e) => { drawing.current = true; setTouched(true); scratch(e.clientX, e.clientY); }}
              onMouseMove={(e) => drawing.current && scratch(e.clientX, e.clientY)}
              onMouseUp={() => { drawing.current = false; check(); }}
              onMouseLeave={() => { if (drawing.current) { drawing.current = false; check(); } }} />}
            {!done && !touched && <span aria-hidden className="scratch-finger pointer-events-none absolute left-1/2 top-[62%] text-5xl">👆</span>}
          </div>
          {done && <Button onClick={onActivate} className="scratch-cta mt-5 w-full min-h-14 text-lg font-black">საჩუქრის გააქტიურება</Button>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Flame, TrendingDown } from 'lucide-react';
import { cameraDemoFill, nextCameraDemoStock, readCameraDemoStock } from '@/lib/cameraDemoStock';

const storageKey = () => `camera-demo-stock:${new Date().toISOString().slice(0, 10)}`;
export default function CameraDemoStock() {
 const panel = useRef<HTMLDivElement>(null);
 const [stock, setStock] = useState(() => {
  try { return readCameraDemoStock(localStorage.getItem(storageKey())); } catch { return readCameraDemoStock(null); }
 });
 const [seen, setSeen] = useState(false);
 const [drop, setDrop] = useState(0);
 useEffect(() => {
  const node = panel.current;
  if (!node) return;
  const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setSeen(true); }, { threshold: 0.5 });
  observer.observe(node);
  let previous = window.scrollY, distance = 0, lastDrop = 0;
  const scroll = () => {
   const current = window.scrollY, delta = current - previous;
   previous = current;
   const rect = node.getBoundingClientRect();
   if (delta <= 0 || rect.bottom < 80 || rect.top > window.innerHeight - 100) { distance = 0; return; }
   distance += delta;
   if (distance < 100 || performance.now() - lastDrop < 1000) return;
   distance = 0; lastDrop = performance.now();
   setStock(old => {
    const next = nextCameraDemoStock(old);
    setDrop(old.remaining - next.remaining);
    try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* Storage is optional. */ }
    return next;
   });
  };
  window.addEventListener('scroll', scroll, { passive: true });
  return () => { observer.disconnect(); window.removeEventListener('scroll', scroll); };
 }, []);
 useEffect(() => { if (!drop) return; const timer = setTimeout(() => setDrop(0), 2200); return () => clearTimeout(timer); }, [drop, stock.drops]);
 return <div ref={panel} className="cam-demo-stock mt-4 p-4 space-y-3" aria-label="მარაგის დემონსტრაცია">
  <div className="flex justify-between items-center gap-2"><span className="flex items-center gap-1.5 text-sm font-bold text-destructive"><Flame className="w-4 h-4"/>მარაგი იწურება</span><span className="text-xs text-muted-foreground">დემო</span></div>
  <div className="flex justify-between items-baseline gap-2"><span className="font-bold text-base">დარჩა <strong key={stock.remaining} className="cam-stock-number text-2xl text-destructive tabular-nums inline-block min-w-8 text-center">{stock.remaining}</strong> ცალი</span><span className="text-xs font-semibold text-destructive min-w-14 text-right" aria-live="polite">{drop > 0 && <span className="inline-flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5"/>−{drop}</span>}</span></div>
  <div className="cam-stock-track h-2.5 overflow-hidden rounded-full" role="progressbar" aria-label="დემო მარაგის შემცირება" aria-valuemin={0} aria-valuemax={200} aria-valuenow={200-stock.remaining}><div className="cam-stock-fill h-full w-full rounded-full" style={{ transform: `scaleX(${seen ? cameraDemoFill(stock.remaining) : 0})` }}/></div>
 </div>;
}
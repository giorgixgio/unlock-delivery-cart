import { useEffect, useState, type RefObject } from 'react';
import { markScratchRevealed, readScratch } from '@/lib/scratchGift';

/** Show the scratch popup once per visitor: 8s or scrolling past `anchor`, whichever first. */
export function useScratchTrigger(enabled: boolean, anchor: RefObject<HTMLElement>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const st = readScratch(); if (st.revealed || st.active) return;
    let fired = false;
    const cleanup = () => { clearTimeout(t); window.removeEventListener('scroll', onScroll); };
    const show = () => { if (fired) return; fired = true; markScratchRevealed(); setOpen(true); cleanup(); };
    const onScroll = () => { const el = anchor.current; if (el && el.getBoundingClientRect().bottom < window.innerHeight * 0.5) show(); };
    const t = setTimeout(show, 8000);
    window.addEventListener('scroll', onScroll, { passive: true });
    return cleanup;
  }, [enabled, anchor]);
  return [open, setOpen] as const;
}

import { useEffect, useState, type RefObject } from 'react';
import { markScratchRevealed, readScratch } from '@/lib/scratchGift';
import { shouldShowScratchPopup } from '@/lib/scratchLeads';

export const SCRATCH_FALLBACK_MS = 13000;

/** Show the scratch popup when scrolling past `anchor` (13s fallback). Once per visitor unless `tester`. */
export function useScratchTrigger(enabled: boolean, anchor: RefObject<HTMLElement>, tester = false) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (!shouldShowScratchPopup(readScratch(), tester)) return;
    let fired = false;
    const cleanup = () => { clearTimeout(t); window.removeEventListener('scroll', onScroll); };
    const show = () => { if (fired) return; fired = true; if (!tester) markScratchRevealed(); setOpen(true); cleanup(); };
    const onScroll = () => { const el = anchor.current; if (el && el.getBoundingClientRect().bottom < window.innerHeight * 0.5) show(); };
    const t = setTimeout(show, SCRATCH_FALLBACK_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    return cleanup;
  }, [enabled, anchor, tester]);
  return [open, setOpen] as const;
}

import '@/styles/keratin.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck, Truck, Clock3, Droplet, Sparkles, Waves, Leaf, Star, Check, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Product } from '@/lib/constants';
import { getDiscountedTotal, getQtyDiscountPct } from '@/lib/landingDiscounts';
import { supabase } from '@/integrations/supabase/client';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import { useProductReviews, useProductStats } from '@/hooks/useCameraReviews';
import { cameraRating, cameraSoldLabel } from '@/lib/miniCameraConfig';
import { KERATIN_URGENCY_KEY, keratinVisibleSections, resolveKeratinConfig, type KeratinMaskConfig } from '@/lib/keratinMaskConfig';
import type { LastOrderRecord } from '@/lib/lastOrderStore';
import logo from '@/assets/logo.png';
import StickyAnnouncementBar from './StickyAnnouncementBar';
import RepeatOrderBlock from './RepeatOrderBlock';
import SkuUrgencyTimer from './SkuUrgencyTimer';
import CameraReviewList from './CameraReviewList';

const money = (n: number) => new Intl.NumberFormat('ka-GE', { maximumFractionDigits: 2 }).format(n);
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <section ref={ref} className={`k-reveal ${seen ? 'is-seen' : ''} ${className}`}>{children}</section>;
}

const Diamond = () => <div className="k-divider my-1" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0 10 5 5 10 0 5Z" fill="currentColor" /></svg></div>;
const Heading = ({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) => <div className="text-center mb-7">{eyebrow && <p className="k-eyebrow mb-2">{eyebrow}</p>}<h2 className="text-[26px] leading-snug">{children}</h2><div className="mx-auto w-40 mt-3"><Diamond /></div></div>;
const HairWave = ({ className = '' }: { className?: string }) => <svg className={className} viewBox="0 0 400 60" fill="none" aria-hidden="true"><path d="M0 40 C 80 10, 140 55, 220 30 S 340 12, 400 26" stroke="currentColor" strokeWidth="1" /><path d="M0 48 C 90 20, 150 60, 230 38 S 340 22, 400 34" stroke="currentColor" strokeWidth=".6" opacity=".6" /></svg>;
const benefitIcons = [Sparkles, Droplet, Waves, Leaf];

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [split, setSplit] = useState(50);
  return <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] k-card">
    <img src={after} alt="შემდეგ" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
    <img src={before} alt="მანამდე" loading="lazy" className="absolute inset-0 w-full h-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
    <span className="absolute top-3 left-3 k-chip text-xs">მანამდე</span><span className="absolute top-3 right-3 k-chip text-xs">შემდეგ</span>
    <div className="absolute inset-y-0 w-px bg-card" style={{ left: `${split}%` }} aria-hidden="true" />
    <input aria-label="მანამდე და შემდეგ შედარება" type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
  </div>;
}

interface Props { product: Product; config?: Partial<KeratinMaskConfig> | null; selectedQty: number; onSelect: (n: number) => void; onBuy: () => void; repeatBlocked: LastOrderRecord | null; onReorder: () => void; preview: boolean }

export default function KeratinMaskLanding({ product, config, selectedQty, onSelect, onBuy, repeatBlocked, onReorder, preview }: Props) {
  const c = resolveKeratinConfig(config);
  const { logoUrl, siteName } = useSiteBranding();
  const { data: reviews = [] } = useProductReviews(product.id, product.sku, preview);
  const { data: stats } = useProductStats(product.id, product.sku);
  const { data: stock } = useQuery({ queryKey: ['keratin-live-stock', product.id], queryFn: async () => { const { data, error } = await supabase.from('products').select('stock_quantity').eq('id', product.id).single(); if (error) throw error; return data.stock_quantity; }, staleTime: 60000 });
  const [active, setActive] = useState(0);
  const [toast, setToast] = useState('');
  const gallery = useRef<HTMLDivElement>(null);
  const rating = cameraRating(reviews);
  const sold = stats ? cameraSoldLabel(stats.sold_units) : 0;
  const show = keratinVisibleSections(c, reviews.length);
  const s = c.sections;

  const images = c.gallery.filter(Boolean).length ? c.gallery.filter(Boolean) : (product.images?.length ? product.images : [product.image]);
  const slots = images.length + (c.video_url ? 1 : 0);
  const total = getDiscountedTotal(product.price, selectedQty, product.sku);
  const unitOld = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
  const compare = unitOld ? unitOld * selectedQty : null;
  const pct = compare ? Math.round((1 - total / compare) * 100) : 0;

  useEffect(() => {
    if (!s.recent || !stats?.recent_cities?.length) return;
    let i = 0; let hide: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => { const used = Number(sessionStorage.getItem('keratin-toast-count') ?? 0); if (used >= 4) return; setToast(stats.recent_cities[i++ % stats.recent_cities.length]); sessionStorage.setItem('keratin-toast-count', String(used + 1)); hide = setTimeout(() => setToast(''), 5000); }, 25000);
    return () => { clearInterval(timer); clearTimeout(hide); };
  }, [stats?.recent_cities, s.recent]);

  const go = (i: number) => { setActive(i); gallery.current?.scrollTo({ left: i * gallery.current.clientWidth, behavior: reduced() ? 'auto' : 'smooth' }); };
  const buyButton = repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder} /> : <button type="button" onClick={onBuy} className="k-btn">შეუკვეთე ახლა — გადახდა მიღებისას</button>;

  const offer = <div className="k-card overflow-hidden">
    <div className="p-5">
      <div className="flex items-baseline gap-2.5 flex-wrap"><strong className="k-serif text-[40px] leading-none">{money(total)}₾</strong>{compare && <s className="text-lg text-muted-foreground">{money(compare)}₾</s>}{pct > 0 && <span className="k-chip k-chip-rose text-xs font-bold py-1">−{pct}%</span>}</div>
      <div className="k-seg grid grid-cols-3 gap-2 mt-5">{[1, 2, 3].map(q => <button key={q} type="button" onClick={() => onSelect(q)} aria-pressed={q === selectedQty} className="relative py-3 flex flex-col items-center gap-0.5">{q === 2 && <span className="absolute -top-2.5 k-chip-rose text-[9px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap">პოპულარული</span>}<span className="font-semibold text-[15px]">{q} ცალი</span><span className="text-sm font-bold k-rose">{money(getDiscountedTotal(product.price, q, product.sku))}₾</span><span className="text-[11px] text-muted-foreground">{getQtyDiscountPct(q, product.sku) > 0 ? `დაზოგე ${money(product.price * q - getDiscountedTotal(product.price, q, product.sku))}₾` : 'ერთი ნიღაბი'}</span></button>)}</div>
      <div className="mt-5">{buyButton}</div>
      <p className="text-center text-xs text-muted-foreground mt-3">მიტანა — 5₾ · გადახდა კურიერთან მიღებისას</p>
    </div>
  </div>;

  const trustIcons = [ShieldCheck, Truck, Clock3, Droplet];

  return <div className="keratin-page min-h-screen pb-32">
    <StickyAnnouncementBar />
    <header className="border-b border-border/70 bg-card/70 backdrop-blur"><div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between"><a href="/" aria-label={siteName}><img src={logoUrl || logo} alt={siteName} className="h-7 w-auto" /></a><span className="flex gap-1.5 text-xs font-semibold items-center"><ShieldCheck className="w-4 h-4 k-rose" />გადახდა მიღებისას</span></div></header>
    <main className="max-w-lg mx-auto px-5">
      {/* 1. Gallery */}
      {s.gallery && <div className="pt-6">
        <div className="k-stage">
          <div ref={gallery} onScroll={e => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="relative z-[1] flex overflow-x-auto snap-x snap-mandatory aspect-square k-gallery">
            {images.map((url, i) => <div key={url} className="w-full h-full shrink-0 snap-center relative grid place-items-center p-8"><img src={url} alt={`${c.title} ${i + 1}`} width={800} height={800} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} className="k-hero max-w-full max-h-full object-contain" /></div>)}
            {c.video_url && <video controls preload="none" src={c.video_url} className="w-full h-full shrink-0 snap-center object-cover" />}
          </div>
          <div className="k-pedestal" /><div className="k-shimmer" />
          <HairWave className="absolute bottom-3 left-0 w-full k-gold opacity-70 pointer-events-none" />
        </div>
        {slots > 1 && <><div className="flex justify-center gap-1.5 mt-3">{Array.from({ length: slots }, (_, i) => <button key={i} type="button" aria-label={`ფოტო ${i + 1}`} aria-pressed={active === i} onClick={() => go(i)} className="p-1"><span className={`k-dot block ${active === i ? 'on' : ''}`} /></button>)}</div>
          <div className="flex gap-2 overflow-x-auto mt-2 pb-1">{images.map((url, i) => <button key={i} type="button" aria-label={`აირჩიე ფოტო ${i + 1}`} aria-pressed={active === i} onClick={() => go(i)} className={`w-14 h-14 p-1 shrink-0 rounded-xl border ${active === i ? 'border-primary' : 'border-border'} bg-card`}><img src={url} alt="" loading="lazy" className="w-full h-full object-contain" /></button>)}</div></>}
      </div>}

      {/* 2. Title */}
      <div className="mt-6 text-center">
        <p className="k-eyebrow">{c.eyebrow}</p>
        <h1 className="text-[30px] leading-[1.25] mt-2.5">{c.title}</h1>
        <div className="mx-auto w-44 mt-3"><Diamond /></div>
        <p className="mt-3 text-[17px] text-muted-foreground leading-relaxed">{c.subtitle}</p>
        {rating.count >= 5 ? <a href="#keratin-reviews" className="inline-flex items-center gap-1.5 mt-3"><span className="flex k-rose">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}</span><strong>{rating.average.toFixed(1)}</strong><span className="text-muted-foreground text-sm">· {rating.count} შეფასება</span></a> : sold > 0 ? <p className="mt-3 text-sm font-semibold">{sold}+ გაყიდული</p> : null}
      </div>

      {/* 3. Offer */}
      <section className="mt-6">{offer}</section>

      {/* 4. Today / stock / timer / delivery */}
      <div className="mt-5 space-y-3">
        {s.today && (stats?.today_orders ?? 0) >= 10 && <p className="text-center text-sm">დღეს შეუკვეთა <strong className="k-rose">{stats!.today_orders}</strong> ადამიანმა</p>}
        {s.stock && stock != null && stock > 0 && <div className="k-card p-4"><div className="flex justify-between text-sm mb-2"><span className="font-semibold">დარჩა {stock} ცალი</span><span className="text-muted-foreground">მარაგშია</span></div><progress className="k-progress w-full h-2" max={Math.max(c.stock_bar_max, stock)} value={stock} /></div>}
        {s.timer && <SkuUrgencyTimer storageKey={KERATIN_URGENCY_KEY} showStock={false} />}
        <div className="flex flex-wrap justify-center gap-2"><span className="k-chip flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 k-rose" />მიწოდება მთელ საქართველოში</span><span className="k-chip">მიტანა 5₾</span></div>
      </div>

      {/* 5. Trust row */}
      {s.trust && <div className="grid grid-cols-2 gap-2.5 mt-6">{c.trust.filter(Boolean).map((t, i) => { const Icon = trustIcons[i] ?? ShieldCheck; return <div key={i} className="k-card p-3.5 flex items-center gap-2.5 !rounded-[18px]"><span className="w-9 h-9 rounded-full grid place-items-center k-sand shrink-0"><Icon className="w-4 h-4 k-rose" /></span><span className="text-[12.5px] font-medium leading-snug min-w-0 [overflow-wrap:anywhere]">{t}</span></div>; })}</div>}
    </main>

    <div className="mt-6">
      {/* 6. Benefits */}
      {show.benefits && <Reveal className="py-12 px-5"><div className="max-w-lg mx-auto"><Heading eyebrow="Ritual of care">{c.headings.benefits}</Heading><div className="grid grid-cols-2 gap-3">{c.benefits.map((b, i) => { const Icon = benefitIcons[i] ?? Sparkles; return <article key={i} className="k-card p-4"><span className="w-10 h-10 rounded-full grid place-items-center k-blush-bg border border-border mb-3"><Icon className="w-[18px] h-[18px] k-rose" /></span><p className="k-serif text-[15px] leading-snug">{b.title}</p><p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{b.text}</p></article>; })}</div></div></Reveal>}

      {/* 7. Ritual */}
      {s.ritual && c.ritual.filter(Boolean).length > 0 && <Reveal className="py-12 px-5 k-sand"><div className="max-w-lg mx-auto"><Heading eyebrow="4 steps">{c.headings.ritual}</Heading><ol className="k-card p-5 space-y-5">{c.ritual.filter(Boolean).map((step, i) => <li key={i} className="flex items-center gap-4"><span className="k-numeral">{i + 1}</span><span className="text-[15px] leading-snug">{step}</span></li>)}</ol>
        <div className="flex items-center justify-center gap-3 mt-5 text-sm text-muted-foreground"><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="none" stroke="hsl(var(--k-gold))" strokeWidth="1" /><path d="M22 3 A19 19 0 0 1 39.5 15" fill="none" stroke="hsl(var(--k-rose))" strokeWidth="3" strokeLinecap="round" /><path d="M22 12v10l6 4" stroke="hsl(var(--k-cocoa))" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg><span className="k-serif text-lg text-foreground">3–5 წუთი</span></div></div></Reveal>}

      {/* 8. Ingredients */}
      {show.ingredients && <Reveal className="py-12 px-5"><div className="max-w-lg mx-auto"><Heading eyebrow="Formula">{c.headings.ingredients}</Heading><div className="grid gap-3">{c.ingredients.map((g, i) => <article key={i} className="k-card p-5 flex gap-4 items-start relative overflow-hidden"><span className="w-12 h-12 rounded-full grid place-items-center k-blush-bg border border-border shrink-0">{i === 0 ? <Sparkles className="w-5 h-5 k-rose" /> : <Droplet className="w-5 h-5 k-rose" />}</span><div><p className="k-serif text-lg">{g.title}</p><p className="text-sm text-muted-foreground mt-1 leading-relaxed">{g.text}</p></div></article>)}</div></div></Reveal>}

      {/* 9. Hair types */}
      {show.hair_types && <Reveal className="py-12 px-5 k-blush-bg"><div className="max-w-lg mx-auto"><Heading eyebrow="For you">{c.headings.hair_types}</Heading><div className="grid grid-cols-2 gap-2.5">{c.hair_types.filter(Boolean).map((t, i) => <div key={i} className="k-card !rounded-full px-4 py-3 flex items-center gap-2 justify-center text-sm font-medium"><Check className="w-4 h-4 k-rose shrink-0" />{t}</div>)}</div></div></Reveal>}

      {/* 10. Before / after */}
      {show.before_after && <Reveal className="py-12 px-5"><div className="max-w-lg mx-auto"><Heading>{c.headings.before_after}</Heading><BeforeAfter before={c.before_image} after={c.after_image} /></div></Reveal>}

      {/* 11. Texture / size */}
      {s.texture && <Reveal className="py-12 px-5 k-sand"><div className="max-w-lg mx-auto"><Heading eyebrow="Texture">{c.headings.texture}</Heading><div className="k-card p-6 flex items-center gap-6"><svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true" className="shrink-0"><rect x="14" y="10" width="64" height="16" rx="5" fill="none" stroke="hsl(var(--k-gold))" strokeWidth="1.5" /><rect x="10" y="28" width="72" height="54" rx="14" fill="hsl(var(--k-blush) / .5)" stroke="hsl(var(--k-rose))" strokeWidth="1.5" /><path d="M22 52c8-6 16 6 24 0s16 6 24 0" fill="none" stroke="hsl(var(--k-rose))" strokeWidth="1" /></svg><div><p className="k-serif text-[52px] leading-none">{c.volume}<span className="text-2xl ml-1">მლ</span></p><p className="text-sm text-muted-foreground mt-2">{c.volume_text}</p></div></div>{c.texture_image && <img src={c.texture_image} alt="ნიღბის ტექსტურა" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[22px] mt-4 k-card" />}</div></Reveal>}

      {/* 12. Comparison */}
      {s.comparison && c.comparison.length > 0 && <Reveal className="py-12 px-5"><div className="max-w-lg mx-auto"><Heading>{c.headings.comparison}</Heading><div className="k-card overflow-hidden"><div className="grid grid-cols-[1.1fr_1fr_1fr] text-[13px]"><div className="p-3" /><div className="p-3 text-center k-serif font-semibold bg-[hsl(var(--k-blush)/.55)]">KERAVÉ®</div><div className="p-3 text-center text-muted-foreground">სალონი</div>{c.comparison.map((r, i) => <div key={i} className="contents"><div className="px-3 py-3.5 border-t border-border font-medium">{r.label}</div><div className="px-2 py-3.5 border-t border-border text-center font-semibold bg-[hsl(var(--k-blush)/.55)] flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5 k-rose shrink-0" />{r.ours}</div><div className="px-2 py-3.5 border-t border-border text-center text-muted-foreground flex items-center justify-center gap-1"><Minus className="w-3.5 h-3.5 shrink-0" />{r.salon}</div></div>)}</div></div></div></Reveal>}

      {/* 13. Specs */}
      {s.specs && c.specs.length > 0 && <Reveal className="py-12 px-5 k-sand"><div className="max-w-lg mx-auto"><Heading>{c.headings.specs}</Heading><dl className="k-card px-5 divide-y divide-border">{c.specs.map((sp, i) => <div key={i} className="py-3.5 flex justify-between gap-4"><dt className="text-sm text-muted-foreground">{sp.label}</dt><dd className="text-sm font-semibold text-right">{sp.value}</dd></div>)}</dl></div></Reveal>}

      {/* 14. Reviews */}
      {show.reviews && <Reveal className="py-12 px-5"><div id="keratin-reviews" className="max-w-lg mx-auto"><Heading eyebrow="Reviews">{c.headings.reviews}</Heading>{preview && <p className="text-center text-xs text-muted-foreground mb-4">DEMO — სატესტო შეფასებები ჩანს მხოლოდ preview რეჟიმში</p>}<CameraReviewList reviews={reviews} /></div></Reveal>}

      {/* 15. Box */}
      {show.box && <Reveal className="py-12 px-5 k-sand"><div className="max-w-lg mx-auto"><Heading>{c.headings.box}</Heading><ul className="k-card p-5 space-y-3">{c.box_contents.filter(Boolean).map((t, i) => <li key={i} className="flex gap-3"><Check className="w-5 h-5 k-rose shrink-0" />{t}</li>)}</ul></div></Reveal>}

      {/* 16. FAQ */}
      {show.faq && <Reveal className="py-12 px-5"><div className="max-w-lg mx-auto"><Heading>{c.headings.faq}</Heading><Accordion type="single" collapsible className="k-card px-5">{c.faq.filter(f => f.answer.trim()).map((f, i) => <AccordionItem key={i} value={String(i)} className="border-border"><AccordionTrigger className="text-left text-base font-semibold">{f.question}</AccordionTrigger><AccordionContent className="text-[15px] leading-relaxed">{f.answer}</AccordionContent></AccordionItem>)}</Accordion></div></Reveal>}

      {/* 17. Final CTA */}
      {s.final_cta && <Reveal className="py-12 px-5 k-blush-bg"><div className="max-w-lg mx-auto"><p className="k-eyebrow text-center">{c.eyebrow}</p><h2 className="text-[26px] text-center mt-2 mb-6">მიანიჭე თმას სალონური მოვლის შეგრძნება</h2>{offer}</div></Reveal>}
    </div>

    {toast && <div role="status" className="k-toast fixed left-4 right-4 bottom-28 z-40 max-w-sm mx-auto rounded-full px-4 py-2.5 text-sm text-center shadow-lg">ახლახან შეუკვეთეს: {toast}</div>}

    <div className="k-sticky fixed bottom-0 inset-x-0 z-40 px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <div className="shrink-0"><p className="k-serif text-2xl leading-none">{money(total)}₾</p>{compare && <s className="text-xs text-muted-foreground">{money(compare)}₾</s>}</div>
        <div className="flex-1">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder} /> : <button type="button" onClick={onBuy} className="k-btn !min-h-14 text-base">შეუკვეთე ახლა</button>}</div>
      </div>
    </div>
  </div>;
}

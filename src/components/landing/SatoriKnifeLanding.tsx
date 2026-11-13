import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, PhoneCall, Truck, Star, X, Check, Beef, Carrot, Fish, Apple, Tent, ChefHat, Gift, Droplets, Wind, Archive } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Product } from '@/lib/constants';
import type { LastOrderRecord } from '@/lib/lastOrderStore';
import { getDiscountedTotal } from '@/lib/landingDiscounts';
import { cameraRating, cameraSoldLabel } from '@/lib/miniCameraConfig';
import { useProductReviews, useProductStats } from '@/hooks/useCameraReviews';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import logo from '@/assets/logo.png';
import { DR_LANDINGS, type DrLanding } from '@/lib/drLandings';
import { discountPct, resolveSatoriConfig, satoriImages, satoriVisibleFaq, satoriVisibleSpecs, type SatoriConfig } from '@/lib/satoriKnifeConfig';
import MiniCameraOfferCard from './MiniCameraOfferCard';
import RepeatOrderBlock from './RepeatOrderBlock';
import SkuUrgencyTimer from './SkuUrgencyTimer';
import { CountUp, Reveal, ShineButton } from './cameraVisuals';

const money = (n: number) => new Intl.NumberFormat('ka-GE', { maximumFractionDigits: 2 }).format(n);
const useIcons = [Beef, Carrot, Fish, Apple, Tent, ChefHat];
const careIcons = [Droplets, Wind, Archive];
const perks = [{ icon: ShieldCheck, label: 'გადახდა მხოლოდ მიღებისას' }, { icon: PhoneCall, label: 'ოპერატორი დაგიკავშირდება დასადასტურებლად' }, { icon: Truck, label: 'მიტანა — 5₾' }];

/** Decorative vermilion hanko stamp. */
const Hanko = ({ className = '' }: { className?: string }) => <svg viewBox="0 0 40 40" aria-hidden="true" className={`sat-hanko ${className}`}><rect x="2" y="2" width="36" height="36" rx="4" fill="currentColor"/><path d="M12 12h16M20 12v16M13 20h14M12 28h16" stroke="hsl(var(--sat-paper))" strokeWidth="2.6" strokeLinecap="round" fill="none"/></svg>;
/** Decorative thin brush-stroke divider. */
const Brush = () => <svg viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true" className="sat-brush block w-28 h-3 my-3"><path d="M2 7 C 60 2, 120 11, 180 6 S 270 3, 298 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none"/></svg>;

function Placeholder({ title }: { title: string }) {
  return <div role="img" aria-label={title} className="sat-placeholder w-full h-full grid place-items-center">
    <div className="flex flex-col items-center gap-4 px-6 text-center">
      <svg viewBox="0 0 240 60" aria-hidden="true" className="w-56 sat-steel"><path d="M6 34 L150 22 Q 196 20 230 34 Q 196 44 150 42 Z" fill="currentColor" opacity=".9"/><circle cx="60" cy="31" r="4" fill="hsl(var(--sat-ink))"/><rect x="150" y="26" width="84" height="12" rx="6" className="sat-walnut-fill"/></svg>
      <Hanko className="w-9 h-9"/>
      <span className="sat-serif text-lg sat-on-dark">SATORI</span>
    </div>
  </div>;
}

export default function SatoriKnifeLanding({ product, config, selectedQty, onSelect, onBuy, repeatBlocked, onReorder, preview, entry = DR_LANDINGS[1] }: { product: Product; config?: Partial<SatoriConfig>; selectedQty: number; onSelect: (n: number) => void; onBuy: () => void; repeatBlocked: LastOrderRecord | null; onReorder: () => void; preview: boolean; entry?: DrLanding }) {
  const c = resolveSatoriConfig(config);
  const { logoUrl, siteName } = useSiteBranding();
  const sku = String(product.sku ?? entry.fallbackSku);
  const { data: reviews = [] } = useProductReviews(product.id, sku, preview);
  const { data: stats } = useProductStats(product.id, sku);
  const rating = cameraRating(reviews);
  const sold = stats ? cameraSoldLabel(stats.sold_units) : 0;
  const images = satoriImages(c, product.images?.length ? product.images : [product.image]);
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const shown = images.filter(u => !broken[u]);
  const compareUnit = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
  const total = getDiscountedTotal(product.price, selectedQty, product.sku);
  const pct = discountPct(product.price, compareUnit);
  const heroCta = useRef<HTMLDivElement>(null); const finalOffer = useRef<HTMLDivElement>(null);
  const [heroOut, setHeroOut] = useState(false); const [finalIn, setFinalIn] = useState(false);
  const [toast, setToast] = useState(''); const [videoOk, setVideoOk] = useState(true);
  const gallery = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const a = new IntersectionObserver(e => setHeroOut(!e[0].isIntersecting && e[0].boundingClientRect.top < 0));
    const b = new IntersectionObserver(e => setFinalIn(e[0].isIntersecting || e[0].boundingClientRect.top < 0));
    if (heroCta.current) a.observe(heroCta.current); if (finalOffer.current) b.observe(finalOffer.current);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  useEffect(() => {
    if (!c.sections.recent || !stats?.recent_cities?.length) return;
    let i = 0; let hide: ReturnType<typeof setTimeout>;
    const t = setInterval(() => { const used = Number(sessionStorage.getItem(entry.toastKey) ?? 0); if (used >= 4) return; setToast(stats.recent_cities[i++ % stats.recent_cities.length]); sessionStorage.setItem(entry.toastKey, String(used + 1)); hide = setTimeout(() => setToast(''), 5000); }, 25000);
    return () => { clearInterval(t); clearTimeout(hide); };
  }, [stats?.recent_cities, c.sections.recent, entry.toastKey]);

  const faq = satoriVisibleFaq(c); const specs = satoriVisibleSpecs(c);
  const go = (i: number) => { setActive(i); gallery.current?.scrollTo({ left: i * gallery.current.clientWidth, behavior: 'smooth' }); };
  const priceRow = (big = true) => <div className="flex items-baseline gap-2 flex-wrap"><strong className={`${big ? 'text-[34px]' : 'text-2xl'} font-black leading-none sat-on-dark`}>{money(product.price)}₾</strong>{compareUnit && <s className="text-base sat-muted-dark">{money(compareUnit)}₾</s>}{pct > 0 && <span className="sat-chip-accent text-sm font-extrabold rounded-md px-2 py-0.5">−{pct}%</span>}</div>;

  return <div className="satori-page min-h-screen pb-6">
    <header className="sat-band-ink border-b sat-line"><div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between"><a href="/" aria-label={siteName}><img src={logoUrl || logo} alt={siteName} className="h-7 w-auto sat-logo"/></a><span className="flex gap-1.5 text-xs font-semibold items-center sat-on-dark"><ShieldCheck className="w-4 h-4 sat-accent"/>გადახდა მიღებისას</span></div></header>
    <main>
      {/* 1 · Hero */}
      <section className="max-w-lg mx-auto px-5 pt-4">
        <div className="relative overflow-hidden rounded-2xl sat-hero-frame">
          <Hanko className="absolute top-3 right-3 z-[2] w-8 h-8"/>
          <div ref={gallery} onScroll={e => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="flex overflow-x-auto snap-x snap-mandatory aspect-[4/3] camera-gallery">
            {shown.length ? shown.map((url, i) => <img key={url} src={url} alt={`${c.title} ${i + 1}`} width={800} height={600} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} onError={() => setBroken(b => ({ ...b, [url]: true }))} className="w-full h-full shrink-0 object-cover snap-center"/>) : <div className="w-full h-full shrink-0"><Placeholder title={c.title}/></div>}
          </div>
        </div>
        {shown.length > 1 && <div className="flex justify-center gap-1.5 mt-2">{shown.map((_, i) => <button key={i} type="button" aria-label={`ფოტო ${i + 1}`} aria-pressed={active === i} onClick={() => go(i)} className="p-1"><span className={`cam-dot block ${active === i ? 'on' : ''}`}/></button>)}</div>}
        <h1 className="sat-serif text-[24px] leading-snug mt-4 sat-on-dark">{c.headline}</h1>
        <p className="text-[15px] mt-2 sat-muted-dark">{c.subtitle}</p>
        <div className="flex flex-wrap gap-2 mt-3">{c.chips.filter(Boolean).map(ch => <span key={ch} className="sat-chip text-sm font-semibold rounded-full px-3 py-1">{ch}</span>)}</div>
        <div className="mt-3">{rating.count >= 5 ? <a href="#satori-reviews" className="flex items-center gap-1.5 text-base"><span className="flex cam-amber">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="w-5 h-5 fill-current"/>)}</span><strong className="font-extrabold sat-on-dark">{rating.average.toFixed(1)}</strong><span className="sat-muted-dark">· {rating.count} შეფასება</span></a> : sold > 0 ? <p className="text-base font-bold sat-on-dark">🔥 <CountUp value={sold}/>+ გაყიდული</p> : null}</div>
        <div className="mt-3 flex items-end justify-between gap-3">{priceRow()}</div>
        <div ref={heroCta} className="mt-4">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <ShineButton onClick={onBuy}>შეუკვეთე ახლა</ShineButton>}</div>
        <div className="mt-3 sat-timer"><SkuUrgencyTimer storageKey={entry.urgencyKey} showStock={false}/></div>
      </section>

      {/* 2 · Offer card + video */}
      <section className="max-w-lg mx-auto px-5 mt-6"><MiniCameraOfferCard product={product} selectedQty={selectedQty} onSelect={onSelect} onBuy={onBuy} repeatBlocked={repeatBlocked} onReorder={onReorder} compareUnit={compareUnit} ribbonQty={2} ribbonText="🎁 ხშირი არჩევანი" ribbonAbove={c.ribbon} perks={perks} header={<div className="cam-offer-head text-center text-sm font-extrabold py-2 tracking-wide">აირჩიე რაოდენობა</div>}/></section>
      {c.video_url && videoOk && <section className="max-w-lg mx-auto px-5 mt-5"><video src={c.video_url} poster={c.video_poster || undefined} autoPlay muted loop playsInline preload="metadata" onError={() => setVideoOk(false)} aria-label={c.title} className="w-full h-auto block rounded-2xl"/></section>}

      {/* 3 · Pain → solution */}
      {c.sections.pain && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.pain_heading}</h2><Brush/>
        <div className="grid grid-cols-2 gap-3 mt-2"><div className="sat-card-ink rounded-2xl p-4 space-y-3"><p className="text-xs font-bold uppercase tracking-wider sat-muted-dark">ჩვეულებრივი დანა</p>{c.pains.map(p => <p key={p} className="flex gap-2 text-[15px] font-semibold sat-on-dark"><X className="w-5 h-5 shrink-0 sat-muted-dark"/>{p}</p>)}</div>
        <div className="sat-paper rounded-2xl p-4 space-y-3"><p className="text-xs font-bold uppercase tracking-wider sat-accent">SATORI</p>{c.solutions.map(p => <p key={p} className="flex gap-2 text-[15px] font-semibold"><Check className="w-5 h-5 shrink-0 sat-accent"/>{p}</p>)}</div></div></Reveal>}

      {/* 4 · Feature hotspots */}
      {c.sections.hotspots && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.hotspot_heading}</h2><Brush/>
        {shown.length > 0 && <div className="relative rounded-2xl overflow-hidden mt-2"><img src={shown[0]} alt={c.title} loading="lazy" className="w-full aspect-[4/3] object-cover block"/>{c.hotspots.map((h, i) => <span key={i} aria-hidden="true" style={{ left: `${h.x}%`, top: `${h.y}%` }} className="sat-hotspot absolute -translate-x-1/2 -translate-y-1/2">{i + 1}</span>)}</div>}
        <ol className="mt-4 grid gap-3">{c.hotspots.map((h, i) => <li key={i} className="sat-paper rounded-2xl p-4 flex gap-3 items-start"><span className="sat-hotspot static shrink-0">{i + 1}</span><span><strong className="block text-[16px]">{h.title}</strong><span className="text-[15px] sat-body">{h.text}</span></span></li>)}</ol></Reveal>}

      {/* 5 · Use cases */}
      {c.sections.uses && <section className="sat-band-ink mt-10 py-9"><Reveal className="max-w-lg mx-auto px-5"><h2 className="sat-serif text-[24px] sat-on-dark">{c.uses_heading}</h2><Brush/><div className="grid grid-cols-2 gap-3 mt-2">{c.uses.filter(Boolean).map((u, i) => { const I = useIcons[i] ?? ChefHat; return <div key={u} className="sat-card-ink rounded-2xl p-4 flex flex-col gap-2"><I className="w-6 h-6 sat-steel"/><span className="text-[15px] font-bold sat-on-dark leading-snug">{u}</span></div>; })}</div></Reveal></section>}

      {/* 6 · Mid CTA */}
      <section className="max-w-lg mx-auto px-5 mt-8"><div className="sat-paper rounded-2xl p-4 flex items-center gap-3"><div className="shrink-0 leading-tight"><strong className="text-2xl font-black">{money(product.price)}₾</strong>{compareUnit && <s className="block text-sm sat-body">{money(compareUnit)}₾</s>}</div>{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <ShineButton onClick={onBuy} className="flex-1 text-sm">შეუკვეთე ახლა</ShineButton>}</div></section>

      {/* 7 · Comparison */}
      {c.sections.comparison && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.comparison_heading}</h2><Brush/><div className="sat-paper rounded-2xl overflow-hidden mt-2"><div className="grid grid-cols-[1.1fr_1fr_1fr] text-xs font-extrabold uppercase tracking-wide sat-band-ink"><span className="p-3 sat-muted-dark"> </span><span className="p-3 sat-accent">SATORI</span><span className="p-3 sat-muted-dark">ჩვეულებრივი</span></div>{c.comparison.map(r => <div key={r.label} className="grid grid-cols-[1.1fr_1fr_1fr] border-t sat-line-paper text-[14px]"><span className="p-3 font-semibold sat-body">{r.label}</span><strong className="p-3">{r.ours}</strong><span className="p-3 sat-body">{r.other}</span></div>)}</div></Reveal>}

      {/* 8 · Gift */}
      {c.sections.gift && <section className="sat-band-walnut mt-10 py-9"><Reveal className="max-w-lg mx-auto px-5 text-center"><Gift className="w-9 h-9 mx-auto sat-on-dark"/><h2 className="sat-serif text-[22px] mt-3 sat-on-dark">{c.gift_heading}</h2><p className="mt-3 text-[16px] sat-on-dark opacity-90">{c.gift_text}</p></Reveal></section>}

      {/* 9 · Care */}
      {c.sections.care && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.care_heading}</h2><Brush/><div className="grid grid-cols-3 gap-2 mt-2">{c.care.filter(Boolean).map((t, i) => { const I = careIcons[i] ?? Droplets; return <div key={t} className="sat-card-ink rounded-2xl p-3 flex flex-col items-center text-center gap-2"><I className="w-6 h-6 sat-steel"/><span className="text-[14px] font-semibold sat-on-dark leading-snug">{t}</span></div>; })}</div></Reveal>}

      {/* 10 · Specs */}
      {c.sections.specs && specs.length > 0 && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.specs_heading}</h2><Brush/><dl className="sat-paper rounded-2xl mt-2">{specs.map((s, i) => <div key={s.label} className={`flex justify-between gap-4 p-4 text-[15px] ${i ? 'border-t sat-line-paper' : ''}`}><dt className="sat-body">{s.label}</dt><dd className="font-bold text-right">{s.value}</dd></div>)}</dl></Reveal>}

      {/* 11 · Reviews */}
      {c.sections.reviews && reviews.length > 0 && <Reveal className="max-w-lg mx-auto px-5 mt-10"><div id="satori-reviews"/><h2 className="sat-serif text-[24px] sat-on-dark">{c.reviews_heading}</h2><Brush/>{rating.count >= 5 && <p className="flex items-center gap-2 sat-on-dark mb-3"><span className="flex cam-amber">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="w-4 h-4 fill-current"/>)}</span><strong>{rating.average.toFixed(1)}</strong><span className="sat-muted-dark">· {rating.count} შეფასება</span></p>}
        <div className="grid gap-3">{reviews.slice(0, 12).map(r => <article key={r.id} className="sat-paper rounded-2xl p-4 space-y-2"><div className="flex items-center justify-between gap-3"><strong className="flex items-center gap-2">{r.customer_display_name}{r.source === 'demo' && <span className="sat-chip-accent text-[10px] font-extrabold rounded px-1.5 py-0.5">DEMO</span>}</strong><span className="text-sm sat-body">{r.city}</span></div><div className="flex gap-0.5 cam-amber">{Array.from({ length: r.rating }, (_, i) => <Star key={i} className="w-4 h-4 fill-current"/>)}</div><p className="text-[15px] leading-relaxed sat-body">{r.text}</p>{r.verified && <p className="text-sm font-semibold flex gap-1 items-center"><Check className="w-4 h-4 sat-accent"/>დადასტურებული შეკვეთა</p>}{r.photo_urls.filter(Boolean).map((u, i) => <img key={i} src={u} alt="შეფასების ფოტო" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl"/>)}</article>)}</div></Reveal>}

      {/* 12 · FAQ */}
      {c.sections.faq && faq.length > 0 && <Reveal className="max-w-lg mx-auto px-5 mt-10"><h2 className="sat-serif text-[24px] sat-on-dark">{c.faq_heading}</h2><Brush/><Accordion type="single" collapsible className="sat-paper rounded-2xl px-4 mt-2">{faq.map((f, i) => <AccordionItem key={i} value={`f${i}`} className="sat-line-paper"><AccordionTrigger className="text-left text-[16px] font-bold">{f.question}</AccordionTrigger><AccordionContent className="text-[15px] sat-body">{f.answer}</AccordionContent></AccordionItem>)}</Accordion></Reveal>}

      {/* 13 · Final offer */}
      <section ref={finalOffer} className="max-w-lg mx-auto px-5 pt-10 pb-6"><MiniCameraOfferCard product={product} selectedQty={selectedQty} onSelect={onSelect} onBuy={onBuy} repeatBlocked={repeatBlocked} onReorder={onReorder} compareUnit={compareUnit} ribbonQty={2} ribbonText="🎁 ხშირი არჩევანი" ribbonAbove={c.ribbon} perks={perks} header={<div className="flex items-center gap-3 p-4 border-b sat-line-paper"><Hanko className="w-8 h-8 shrink-0"/><strong className="text-sm font-extrabold leading-snug">{c.title}</strong></div>}/></section>
    </main>
    <div aria-hidden={!heroOut || finalIn} className={`fixed bottom-0 inset-x-0 z-50 sat-bottom transition-transform duration-300 ${heroOut && !finalIn ? 'translate-y-0' : 'translate-y-full'}`}><div className="max-w-lg mx-auto px-4 py-3 flex gap-3 items-center">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <><div className="shrink-0 leading-tight"><span className="text-xs font-bold sat-accent">{selectedQty} ცალი</span><div className="flex items-baseline gap-1.5"><strong className="text-2xl font-black sat-on-dark">{money(total)}₾</strong>{compareUnit && <s className="text-xs sat-muted-dark">{money(compareUnit * selectedQty)}₾</s>}</div></div><ShineButton onClick={onBuy} pulse className="flex-1 text-sm">შეუკვეთე ახლა</ShineButton></>}</div></div>
    {toast && <div role="status" className="fixed bottom-28 left-4 right-4 max-w-sm mx-auto z-40 sat-paper rounded-2xl p-4 text-sm font-medium shadow-lg">📦 ახლახან შეუკვეთეს — {toast}</div>}
  </div>;
}

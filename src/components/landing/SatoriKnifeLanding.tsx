import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck, PhoneCall, Truck, Star, Check, Gift, Sparkles, Hand, Layers, Flame } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Product } from '@/lib/constants';
import type { LastOrderRecord } from '@/lib/lastOrderStore';
import { cameraRating, cameraSoldLabel } from '@/lib/miniCameraConfig';
import { useProductReviews, useProductStats } from '@/hooks/useCameraReviews';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import logo from '@/assets/logo.png';
import { DR_LANDINGS, type DrLanding } from '@/lib/drLandings';
import { discountPct, isVideoUrl, resolveSatoriConfig, satoriDemoMedia, satoriDemoLayout, satoriImages, satoriMoney as money, satoriTiers, satoriVisibleFaq, satoriVisibleSpecs, type SatoriConfig } from '@/lib/satoriKnifeConfig';
import RepeatOrderBlock from './RepeatOrderBlock';
import { CountUp, ShineButton } from './cameraVisuals';

const benefitIcons = [Sparkles, Hand, Layers];
const CTA = <span className="flex flex-col items-center leading-tight"><span className="text-[18px] font-black">შეუკვეთე</span><span className="text-[13px] font-semibold opacity-95">გადახდა მიღებისას</span></span>;

const Hanko = ({ className = '' }: { className?: string }) => <svg viewBox="0 0 40 40" aria-hidden="true" className={`sat-hanko ${className}`}><rect x="2" y="2" width="36" height="36" rx="4" fill="currentColor"/><path d="M12 12h16M20 12v16M13 20h14M12 28h16" stroke="hsl(var(--sat-paper))" strokeWidth="2.6" strokeLinecap="round" fill="none"/></svg>;
const Brush = () => <svg viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true" className="sat-brush block w-24 h-2.5 mt-1.5 mb-3"><path d="M2 7 C 60 2, 120 11, 180 6 S 270 3, 298 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none"/></svg>;
const H2 = ({ children }: { children: ReactNode }) => <><h2 className="sat-serif text-[26px] leading-tight sat-on-dark">{children}</h2><Brush/></>;
const Sec = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`max-w-lg mx-auto px-4 mt-8 ${className}`}>{children}</section>;

function Placeholder({ title }: { title: string }) {
  return <div role="img" aria-label={title} className="sat-placeholder w-full h-full grid place-items-center"><div className="flex flex-col items-center gap-4 px-6 text-center"><Hanko className="w-9 h-9"/><span className="sat-serif text-lg sat-on-dark">SATORI</span></div></div>;
}

/** Lazy demo media: images lazy-load; videos get their src only once near the viewport. */
function DemoItem({ url, label }: { url: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null); const [near, setNear] = useState(false); const [bad, setBad] = useState(false);
  useEffect(() => { const o = new IntersectionObserver(e => { if (e[0].isIntersecting) { setNear(true); o.disconnect(); } }, { rootMargin: '300px' }); if (ref.current) o.observe(ref.current); return () => o.disconnect(); }, []);
  if (bad) return null;
  return <figure ref={ref} className="snap-start shrink-0 w-[78%] sat-card-ink rounded-2xl overflow-hidden">
    {isVideoUrl(url) ? (near ? <video src={url} autoPlay muted loop playsInline preload="metadata" onError={() => setBad(true)} aria-label={label || 'SATORI'} className="w-full h-auto block"/> : <div className="aspect-square"/>) : <img src={url} alt={label || 'SATORI'} loading="lazy" onError={() => setBad(true)} className="w-full h-auto block"/>}
    {label && <figcaption className="px-3 py-2.5 text-[15px] font-bold sat-on-dark">{label}</figcaption>}
  </figure>;
}

/** Single demo as a GIF-like feature card: lazy src, plays only while >=25% visible, aspect from metadata. */
function DemoFeature({ url, label, poster }: { url: string; label: string; poster?: string }) {
  const ref = useRef<HTMLDivElement>(null); const vid = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false); const [vis, setVis] = useState(false); const [ratio, setRatio] = useState('16 / 9'); const [bad, setBad] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; const [tapped, setTapped] = useState(false);
  const video = isVideoUrl(url);
  useEffect(() => { const el = ref.current; if (!el) return; const a = new IntersectionObserver(e => { if (e[0].isIntersecting) { setNear(true); a.disconnect(); } }, { rootMargin: '400px' }); const b = new IntersectionObserver(e => setVis(e[0].intersectionRatio >= 0.25), { threshold: [0, 0.25, 0.5, 1] }); a.observe(el); b.observe(el); return () => { a.disconnect(); b.disconnect(); }; }, []);
  const allowed = !reduced || tapped;
  useEffect(() => { const v = vid.current; if (!v) return; if (vis && allowed) v.play().catch(() => {}); else v.pause(); }, [vis, allowed, near]);
  if (bad) return null;
  return <div ref={ref} className="sat-demo-feature relative rounded-[20px] overflow-hidden" style={{ aspectRatio: ratio }}>
    {video ? (near ? <video ref={vid} src={url} poster={poster || undefined} muted loop playsInline autoPlay={allowed} preload="metadata" disablePictureInPicture disableRemotePlayback controls={false} aria-label={label || 'SATORI'} onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setRatio(`${v.videoWidth} / ${v.videoHeight}`); }} onError={() => setBad(true)} className="absolute inset-0 w-full h-full object-cover"/> : poster ? <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover"/> : null)
      : <img src={url} alt={label || 'SATORI'} loading="lazy" onLoad={e => { const i = e.currentTarget; if (i.naturalWidth) setRatio(`${i.naturalWidth} / ${i.naturalHeight}`); }} onError={() => setBad(true)} className="absolute inset-0 w-full h-full object-cover"/>}
    {label && <span className="absolute top-2.5 left-2.5 sat-chip text-[13px] font-bold rounded-full px-2.5 py-1 max-w-[85%]">{label}</span>}
    {video && reduced && !tapped && <button type="button" onClick={() => setTapped(true)} className="absolute bottom-3 right-3 sat-chip-accent rounded-full px-3 py-2 text-[14px] font-bold min-h-[44px]">▶ ნახვა</button>}
  </div>;
}

/** Zoomed crop of the real hero photo with numbered callouts (no generated imagery). */
function Crop({ src, pos, label, spots }: { src: string; pos: string; label: string; spots: { n: number; x: number; y: number }[] }) {
  return <figure className="relative rounded-2xl overflow-hidden aspect-square sat-card-ink" role="img" aria-label={label} style={{ backgroundImage: `url("${src}")`, backgroundSize: '200%', backgroundPosition: pos }}>
    {spots.map(s => <span key={s.n} aria-hidden="true" style={{ left: `${s.x}%`, top: `${s.y}%` }} className="sat-hotspot absolute -translate-x-1/2 -translate-y-1/2">{s.n}</span>)}
    <figcaption className="absolute bottom-0 inset-x-0 px-2.5 py-1.5 text-[13px] font-bold sat-on-dark sat-crop-cap">{label}</figcaption>
  </figure>;
}

type Tier = ReturnType<typeof satoriTiers>[number];
function OfferCard({ tiers, compareUnit, selectedQty, onSelect, onBuy, repeatBlocked, onReorder, ribbon, price, pct, top, id }: { tiers: Tier[]; compareUnit: number | null; selectedQty: number; onSelect: (n: number) => void; onBuy: () => void; repeatBlocked: LastOrderRecord | null; onReorder: () => void; ribbon: string; price: number; pct: number; top?: ReactNode; id: string }) {
  return <div id={id} className="sat-paper rounded-2xl overflow-hidden shadow-lg">
    {top}
    <div className="p-4">
      <div className="flex items-baseline gap-2 flex-wrap"><strong className="text-[30px] font-black leading-none">{money(price)}₾</strong>{compareUnit && <s className="text-base sat-body">{money(compareUnit)}₾</s>}{pct > 0 && <span className="sat-chip-accent text-sm font-extrabold rounded-md px-2 py-0.5">−{pct}%</span>}</div>
      <p className="text-[15px] font-semibold sat-body mt-1">აირჩიე რაოდენობა — მეტი ცალი, მეტი დანაზოგი</p>
      <div role="radiogroup" aria-label="რაოდენობა" className="mt-3 grid gap-2.5">
        {tiers.map(t => { const on = selectedQty === t.qty; return <button key={t.qty} type="button" role="radio" aria-checked={on} onClick={() => onSelect(t.qty)} className={`sat-tier relative w-full text-left rounded-xl px-3.5 py-3 min-h-[64px] flex items-center gap-3 ${on ? 'is-on' : ''} ${t.qty === 2 && ribbon ? 'mt-3' : ''}`}>
          {t.qty === 2 && ribbon && <span className="absolute -top-3 left-3 sat-chip-accent text-[12px] font-extrabold rounded-full px-2.5 py-0.5">{ribbon}</span>}
          <span aria-hidden="true" className="sat-radio shrink-0"/>
          <span className="flex-1 min-w-0"><strong className="block text-[17px] font-extrabold">{t.qty} ცალი</strong><span className="block text-[13px] sat-body">{t.qty > 1 ? `${money(t.unit)}₾ / ცალი` : 'ერთი დანა'}{t.saveSingle > 0 && <> · <b className="sat-accent">−{money(t.saveSingle)}₾</b></>}</span></span>
          <span className="text-right shrink-0"><strong className="block text-[22px] font-black leading-none">{money(t.total)}₾</strong>{compareUnit && <s className="block text-[13px] sat-body mt-0.5">{money(compareUnit * t.qty)}₾</s>}{t.saveCompare > 0 && <span className="block text-[12px] font-bold sat-accent">დაზოგავ {money(t.saveCompare)}₾</span>}</span>
        </button>; })}
      </div>
      <div className="mt-4">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <ShineButton onClick={onBuy}>{CTA}</ShineButton>}</div>
      <ul className="mt-3 grid gap-1.5 text-[14px] font-semibold sat-body">
        <li className="flex gap-2 items-center"><Truck className="w-4 h-4 shrink-0 sat-accent"/>მიტანა — 5₾ · თბილისი 1–2 დღე, რეგიონები 2–4 დღე</li>
        <li className="flex gap-2 items-center"><ShieldCheck className="w-4 h-4 shrink-0 sat-accent"/>გადახდა მიღებისას</li>
        <li className="flex gap-2 items-center"><PhoneCall className="w-4 h-4 shrink-0 sat-accent"/>უსაფრთხო შეკვეთა — ოპერატორი დაგიკავშირდება</li>
      </ul>
    </div>
  </div>;
}

export default function SatoriKnifeLanding({ product, config, selectedQty, onSelect, onBuy, repeatBlocked, onReorder, preview, modalOpen = false, entry = DR_LANDINGS[1] }: { product: Product; config?: Partial<SatoriConfig>; selectedQty: number; onSelect: (n: number) => void; onBuy: () => void; repeatBlocked: LastOrderRecord | null; onReorder: () => void; preview: boolean; modalOpen?: boolean; entry?: DrLanding }) {
  const c = resolveSatoriConfig(config);
  const { logoUrl, siteName } = useSiteBranding();
  const sku = String(product.sku ?? entry.fallbackSku);
  const { data: reviews = [] } = useProductReviews(product.id, sku, preview);
  const { data: stats } = useProductStats(product.id, sku);
  const rating = cameraRating(reviews);
  const sold = stats ? cameraSoldLabel(stats.sold_units) : 0;
  const today = stats?.today_orders ?? 0;
  const images = satoriImages(c, product.images?.length ? product.images : [product.image]);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const shown = images.filter(u => !broken[u]);
  const compareUnit = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
  const tiers = satoriTiers(product.price, compareUnit, product.sku);
  const sel = tiers.find(t => t.qty === selectedQty) ?? tiers[0];
  const pct = discountPct(product.price, compareUnit);
  const [chosen, setChosen] = useState(false);
  const choose = (n: number) => { setChosen(true); onSelect(n); };
  const heroCta = useRef<HTMLDivElement>(null); const offerA = useRef<HTMLDivElement>(null); const offerB = useRef<HTMLDivElement>(null);
  const [heroOut, setHeroOut] = useState(false); const [offerVis, setOfferVis] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    const a = new IntersectionObserver(e => setHeroOut(!e[0].isIntersecting && e[0].boundingClientRect.top < 0));
    const b = new IntersectionObserver(es => setOfferVis(v => { const n = { ...v }; es.forEach(e => { n[(e.target as HTMLElement).dataset.k!] = e.isIntersecting; }); return n; }));
    if (heroCta.current) a.observe(heroCta.current); [offerA.current, offerB.current].forEach(el => el && b.observe(el));
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  useEffect(() => {
    if (!c.sections.recent || !stats?.recent_cities?.length) return;
    let i = 0; let hide: ReturnType<typeof setTimeout>;
    const t = setInterval(() => { const used = Number(sessionStorage.getItem(entry.toastKey) ?? 0); if (used >= 4) return; setToast(stats.recent_cities[i++ % stats.recent_cities.length]); sessionStorage.setItem(entry.toastKey, String(used + 1)); hide = setTimeout(() => setToast(''), 5000); }, 25000);
    return () => { clearInterval(t); clearTimeout(hide); };
  }, [stats?.recent_cities, c.sections.recent, entry.toastKey]);

  /** Far-away CTAs: scroll to the nearest offer card until a quantity is picked, then open the order form. */
  const nearBuy = useCallback((el: HTMLElement | null) => () => {
    if (chosen) return onBuy();
    const cards = [offerA.current, offerB.current].filter(Boolean) as HTMLElement[];
    const y = el?.getBoundingClientRect().top ?? 0;
    const target = cards.sort((p, q) => Math.abs(p.getBoundingClientRect().top - y) - Math.abs(q.getBoundingClientRect().top - y))[0];
    target ? target.scrollIntoView({ behavior: 'smooth', block: 'start' }) : onBuy();
  }, [chosen, onBuy]);
  const giftRef = useRef<HTMLDivElement>(null);

  const stickyOn = heroOut && !offerVis.a && !offerVis.b && !modalOpen;
  const faq = satoriVisibleFaq(c); const specs = satoriVisibleSpecs(c); const media = satoriDemoMedia(c);
  const hero = shown[0];
  const spots = (crop: 'blade' | 'handle') => c.hotspots.map((h, i) => ({ ...h, n: i + 1 })).filter(h => (h.crop ?? 'blade') === crop);
  const proof = rating.count >= 5 ? <a href="#satori-reviews" className="flex items-center gap-1.5 text-base"><span className="flex cam-amber">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="w-5 h-5 fill-current"/>)}</span><strong className="font-extrabold sat-on-dark">{rating.average.toFixed(1)}</strong><span className="sat-muted-dark">· {rating.count} შეფასება</span></a> : sold > 0 ? <p className="text-base font-bold sat-on-dark"><Flame className="inline w-4 h-4 sat-accent -mt-0.5"/> <CountUp value={sold}/>+ გაყიდული</p> : today >= 10 ? <p className="text-base font-bold sat-on-dark"><Flame className="inline w-4 h-4 sat-accent -mt-0.5"/> დღეს შეუკვეთა {today}-მა</p> : null;

  return <div className={`satori-page min-h-screen ${stickyOn ? 'pb-28' : 'pb-6'}`}>
    <header className="sat-band-ink border-b sat-line"><div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between"><a href="/" aria-label={siteName}><img src={logoUrl || logo} alt={siteName} className="h-7 w-auto sat-logo"/></a><span className="flex gap-1.5 text-[13px] font-semibold items-center sat-on-dark"><ShieldCheck className="w-4 h-4 sat-accent"/>გადახდა მიღებისას</span></div></header>
    <main>
      {/* Hero */}
      <section className="max-w-lg mx-auto px-4 pt-3">
        <div className="relative overflow-hidden rounded-2xl sat-hero-frame aspect-[4/3]">
          {hero ? <img src={hero} alt={c.title} width={800} height={800} loading="eager" fetchPriority="high" onError={() => setBroken(b => ({ ...b, [hero]: true }))} className="w-full h-full object-cover object-[50%_45%]"/> : <Placeholder title={c.title}/>}
        </div>
        <h1 className="sat-serif text-[24px] leading-[1.3] mt-3 sat-on-dark">{c.headline}</h1>
        <ul className="mt-2.5 grid gap-1.5">{c.benefits.filter(Boolean).slice(0, 3).map((b, i) => { const I = benefitIcons[i] ?? Check; return <li key={b} className="flex items-center gap-2 text-[16px] font-semibold sat-on-dark"><I className="w-5 h-5 shrink-0 sat-accent"/>{b}</li>; })}</ul>
        {proof && <div className="mt-2.5">{proof}</div>}
        <div className="mt-2.5 flex items-baseline gap-2 flex-wrap"><strong className="text-[32px] font-black leading-none sat-on-dark">{money(product.price)}₾</strong>{compareUnit && <s className="text-base sat-muted-dark">{money(compareUnit)}₾</s>}{pct > 0 && <span className="sat-chip-accent text-sm font-extrabold rounded-md px-2 py-0.5">−{pct}%</span>}</div>
        <div ref={heroCta} className="mt-3">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <ShineButton onClick={onBuy}>{CTA}</ShineButton>}</div>
      </section>

      {/* Offer */}
      <section ref={offerA} data-k="a" className="max-w-lg mx-auto px-4 mt-6 scroll-mt-4"><OfferCard id="satori-offer" tiers={tiers} compareUnit={compareUnit} selectedQty={selectedQty} onSelect={choose} onBuy={onBuy} repeatBlocked={repeatBlocked} onReorder={onReorder} ribbon={c.ribbon} price={product.price} pct={pct}/></section>

      {/* Demo: real uploaded media, else close-up crops of the real photo */}
      {c.sections.demo && satoriDemoLayout(c) === 'single' && <Sec><H2>{c.demo_heading}</H2>{c.demo_subline && <p className="-mt-1 mb-3 text-[16px] sat-muted-dark">{c.demo_subline}</p>}<DemoFeature url={media[0].url} label={media[0].label} poster={media[0].poster}/></Sec>}
      {c.sections.demo && satoriDemoLayout(c) === 'strip' && <Sec><H2>{c.demo_heading}</H2><div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 camera-gallery">{media.map((m, i) => <DemoItem key={`${m.url}-${i}`} url={m.url} label={m.label}/>)}</div></Sec>}
      {c.sections.demo && hero && c.hotspots.length > 0 && <Sec><H2>{c.hotspot_heading}</H2>
        <div className="grid grid-cols-2 gap-2.5"><Crop src={hero} pos="56% 66%" label="პირი" spots={spots('blade')}/><Crop src={hero} pos="96% 10%" label="სახელური" spots={spots('handle')}/></div>
        <ol className="mt-3 grid gap-2">{c.hotspots.map((h, i) => <li key={i} className="sat-card-ink rounded-xl px-3 py-2.5 flex gap-3 items-center"><span className="sat-hotspot shrink-0">{i + 1}</span><span className="text-[15px] leading-snug sat-on-dark"><strong>{h.title}</strong> — <span className="sat-muted-dark">{h.text}</span></span></li>)}</ol></Sec>}

      {/* Uses */}
      {c.sections.uses && c.uses.some(Boolean) && <Sec><H2>{c.uses_heading}</H2><div className="flex flex-wrap gap-2">{c.uses.filter(Boolean).map(u => <span key={u} className="sat-chip text-[15px] font-semibold rounded-full px-3.5 py-2">{u}</span>)}</div></Sec>}

      {/* Comparison */}
      {c.sections.comparison && c.comparison.length > 0 && <Sec><H2>{c.comparison_heading}</H2><div className="sat-paper rounded-2xl overflow-hidden"><div className="grid grid-cols-[1fr_1fr_1fr] text-[13px] font-extrabold sat-band-ink"><span className="p-2.5"/><span className="p-2.5 sat-accent">SATORI</span><span className="p-2.5 sat-muted-dark">ჩვეულებრივი</span></div>{c.comparison.map(r => <div key={r.label} className="grid grid-cols-[1fr_1fr_1fr] border-t sat-line-paper text-[15px]"><span className="p-2.5 font-semibold sat-body">{r.label}</span><strong className="p-2.5">{r.ours}</strong><span className="p-2.5 sat-body">{r.other}</span></div>)}</div></Sec>}

      {/* Reviews: public = approved real; demo rows only with ?preview=1 */}
      {c.sections.reviews && reviews.length > 0 && <Sec><div id="satori-reviews"/><H2>{c.reviews_heading}</H2>{rating.count >= 5 && <p className="flex items-center gap-2 sat-on-dark mb-3"><span className="flex cam-amber">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="w-4 h-4 fill-current"/>)}</span><strong>{rating.average.toFixed(1)}</strong><span className="sat-muted-dark">· {rating.count} შეფასება</span></p>}
        <div className="grid gap-2.5">{reviews.slice(0, 12).map(r => <article key={r.id} className="sat-paper rounded-2xl p-3.5 space-y-1.5"><div className="flex items-center justify-between gap-3"><strong className="flex items-center gap-2">{r.customer_display_name}{r.source === 'demo' && <span className="sat-chip-accent text-[10px] font-extrabold rounded px-1.5 py-0.5">DEMO</span>}</strong><span className="text-sm sat-body">{r.city}</span></div><div className="flex gap-0.5 cam-amber">{Array.from({ length: r.rating }, (_, i) => <Star key={i} className="w-4 h-4 fill-current"/>)}</div><p className="text-[16px] leading-normal sat-body">{r.text}</p>{r.verified && <p className="text-sm font-semibold flex gap-1 items-center"><Check className="w-4 h-4 sat-accent"/>დადასტურებული შეკვეთა</p>}{r.photo_urls.filter(Boolean).map((u, i) => <img key={i} src={u} alt="შეფასების ფოტო" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl"/>)}</article>)}</div></Sec>}

      {/* Gift */}
      {c.sections.gift && <section className="sat-band-walnut mt-8 py-6"><div ref={giftRef} className="max-w-lg mx-auto px-4 flex items-center gap-3"><Gift className="w-8 h-8 shrink-0 sat-on-dark"/><div className="flex-1 min-w-0"><h2 className="sat-serif text-[20px] leading-tight sat-on-dark">{c.gift_heading}</h2><p className="text-[15px] mt-1 sat-on-dark">{c.gift_text}</p></div></div>{!repeatBlocked && <div className="max-w-lg mx-auto px-4 mt-3"><button type="button" onClick={nearBuy(giftRef.current)} className="sat-ghost w-full min-h-[48px] rounded-xl text-[16px] font-extrabold">აჩუქე SATORI — {money(sel.total)}₾</button></div>}</section>}

      {/* Specs */}
      {c.sections.specs && specs.length > 0 && <Sec><H2>{c.specs_heading}</H2><dl className="sat-paper rounded-2xl grid grid-cols-2">{specs.map((s, i) => <div key={s.label} className={`p-3 ${i > 1 ? 'border-t sat-line-paper' : ''} ${i % 2 ? 'border-l sat-line-paper' : ''}`}><dt className="text-[13px] sat-body">{s.label}</dt><dd className="text-[15px] font-bold leading-snug">{s.value}</dd></div>)}</dl></Sec>}

      {/* FAQ */}
      {c.sections.faq && faq.length > 0 && <Sec><H2>{c.faq_heading}</H2><Accordion type="single" collapsible className="sat-paper rounded-2xl px-4">{faq.map((f, i) => <AccordionItem key={i} value={`f${i}`} className="sat-line-paper"><AccordionTrigger className="text-left text-[16px] font-bold min-h-[56px] py-3">{f.question}</AccordionTrigger><AccordionContent className="text-[16px] leading-normal sat-body">{f.answer}</AccordionContent></AccordionItem>)}</Accordion></Sec>}

      {/* Final offer */}
      <section ref={offerB} data-k="b" className="max-w-lg mx-auto px-4 pt-8 pb-4 scroll-mt-4"><OfferCard id="satori-offer-final" tiers={tiers} compareUnit={compareUnit} selectedQty={selectedQty} onSelect={choose} onBuy={onBuy} repeatBlocked={repeatBlocked} onReorder={onReorder} ribbon={c.ribbon} price={product.price} pct={pct} top={<div className="flex items-center gap-3 px-4 py-3 border-b sat-line-paper"><Hanko className="w-7 h-7 shrink-0"/><strong className="text-[15px] font-extrabold leading-snug">{c.title}</strong></div>}/></section>
    </main>
    <div aria-hidden={!stickyOn} className={`fixed bottom-0 inset-x-0 z-50 sat-bottom transition-transform duration-300 ${stickyOn ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}><div className="max-w-lg mx-auto px-4 py-3 flex gap-3 items-center">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder}/> : <><div className="shrink-0 leading-tight"><span className="text-[13px] font-bold sat-accent">{sel.qty} ცალი</span><div className="flex items-baseline gap-1.5"><strong className="text-[22px] font-black sat-on-dark">{money(sel.total)}₾</strong>{compareUnit && <s className="text-[13px] sat-muted-dark">{money(compareUnit * sel.qty)}₾</s>}</div></div><ShineButton onClick={onBuy} className="flex-1 text-[15px]">შეუკვეთე</ShineButton></>}</div></div>
    {toast && <div role="status" className={`fixed left-4 right-4 max-w-sm mx-auto z-40 sat-paper rounded-2xl p-3.5 text-[15px] font-medium shadow-lg transition-[bottom] ${stickyOn ? 'bottom-28' : 'bottom-4'}`}>📦 ახლახან შეუკვეთეს — {toast}</div>}
  </div>;
}

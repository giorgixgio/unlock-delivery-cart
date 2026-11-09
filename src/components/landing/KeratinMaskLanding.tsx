import '@/styles/keratin.css';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ShieldCheck, Truck, Banknote, PhoneCall, Droplet, Sparkles, Waves, Leaf, Star, Check, X, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Product } from '@/lib/constants';
import { getDiscountedTotal } from '@/lib/landingDiscounts';
import { supabase } from '@/integrations/supabase/client';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import { useProductReviews, useProductStats } from '@/hooks/useCameraReviews';
import { cameraRating, cameraSoldLabel } from '@/lib/miniCameraConfig';
import { KERAVE_PRODUCTS, keratinVisibleSections, resolveKeratinConfig, type KeraveProduct, type KeratinMaskConfig } from '@/lib/keratinMaskConfig';
import type { LastOrderRecord } from '@/lib/lastOrderStore';
import logo from '@/assets/logo.png';
import StickyAnnouncementBar from './StickyAnnouncementBar';
import RepeatOrderBlock from './RepeatOrderBlock';
import SkuUrgencyTimer from './SkuUrgencyTimer';
import CameraReviewList from './CameraReviewList';

const money = (n: number) => new Intl.NumberFormat('ka-GE', { maximumFractionDigits: 2 }).format(n);
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Reveal({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.08 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <section id={id} ref={ref} className={`k-reveal ${seen ? 'is-seen' : ''} ${className}`}>{children}</section>;
}

/** Tracks whether an element is on screen (used for the sticky bar). */
function useOnScreen(ref: RefObject<HTMLElement>, initial: boolean, past = false) {
  const [on, setOn] = useState(initial);
  useEffect(() => {
    const el = ref.current; if (!el) { setOn(false); return; }
    // "past" counts as on-screen so the sticky bar stays hidden below the final offer (footer).
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting || (past && e.boundingClientRect.bottom < 0)), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, past]);
  return on;
}

const Stars = ({ className = 'w-4 h-4' }: { className?: string }) => <span className="flex k-goldtx">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`${className} fill-current`} />)}</span>;

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [split, setSplit] = useState(50);
  return <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] k-card">
    <img src={after} alt="შემდეგ" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
    <img src={before} alt="მანამდე" loading="lazy" className="absolute inset-0 w-full h-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
    <span className="absolute top-3 left-3 k-chip text-xs">მანამდე</span><span className="absolute top-3 right-3 k-chip text-xs">შემდეგ</span>
    <div className="absolute inset-y-0 w-px bg-card" style={{ left: `${split}%` }} aria-hidden="true" />
    <input aria-label="მანამდე და შემდეგ შედარება" type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
  </div>;
}

/** Before/after clip: lazy src, plays only in view, poster + tap-to-play under reduced motion. */
function BeforeAfterVideo({ src, poster }: { src: string; poster: string }) {
  const box = useRef<HTMLDivElement>(null); const vid = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false); const [ratio, setRatio] = useState('2 / 3');
  const [still] = useState(reduced); const [playing, setPlaying] = useState(false);
  useEffect(() => { const el = box.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px 0px' }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => { const el = box.current; const v = vid.current; if (!el || !v || !near || still) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.25 }); io.observe(el); return () => io.disconnect(); }, [near, still]);
  return <div ref={box} className="k-bavideo" style={{ aspectRatio: ratio }}>
    <video ref={vid} src={near ? src : undefined} poster={poster || undefined} autoPlay={!still} muted loop playsInline preload="metadata" disablePictureInPicture disableRemotePlayback controls={false}
      onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setRatio(`${v.videoWidth} / ${v.videoHeight}`); }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <span className="k-chip absolute top-3 left-3 text-xs">მანამდე</span><span className="k-chip absolute top-3 right-3 text-xs">შემდეგ</span>
    {still && !playing && <button type="button" onClick={() => vid.current?.play()} aria-label="ვიდეოს ჩართვა" className="k-playbtn">▶</button>}
  </div>;
}

/** 3–5 minute dial: the rose arc covers 3→5 of a 5-minute face. */
const Dial = () => <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" className="shrink-0">
  <circle cx="38" cy="38" r="32" fill="none" stroke="hsl(var(--k-ivory) / .18)" strokeWidth="6" />
  <circle cx="38" cy="38" r="32" fill="none" stroke="hsl(var(--k-gold))" strokeWidth="6" strokeLinecap="round" pathLength="100" strokeDasharray="40 100" strokeDashoffset="-60" transform="rotate(-90 38 38)" />
  {Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return <circle key={i} cx={38 + Math.cos(a) * 22} cy={38 + Math.sin(a) * 22} r="1.6" fill="hsl(var(--k-ivory) / .6)" />; })}
  <path d="M38 38 L38 20" stroke="hsl(var(--k-ivory))" strokeWidth="2" strokeLinecap="round" className="k-hand" />
  <circle cx="38" cy="38" r="3" fill="hsl(var(--k-gold))" />
</svg>;

const Molecule = ({ label, tone }: { label: string; tone: 'rose' | 'gold' }) => <div className={`k-molecule k-molecule-${tone}`}>
  <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1" opacity=".55"><path d="M60 22 93 41v38L60 98 27 79V41Z" /><path d="M60 40 77 50v20L60 80 43 70V50Z" /><path d="M60 22v18M93 41 77 50M93 79 77 70M60 98V80M27 79l16-9M27 41l16 9" /></g>
    {[[60, 22], [93, 41], [93, 79], [60, 98], [27, 79], [27, 41]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="currentColor" />)}
  </svg>
  <span className="relative k-serif text-[18px] leading-tight text-center px-3 k-wrap">{label}</span>
</div>;

interface Props { product: Product; config?: Partial<KeratinMaskConfig> | null; selectedQty: number; onSelect: (n: number) => void; onBuy: () => void; repeatBlocked: LastOrderRecord | null; onReorder: () => void; preview: boolean; entry?: KeraveProduct }

export default function KeratinMaskLanding({ product, config, selectedQty, onSelect, onBuy, repeatBlocked, onReorder, preview, entry = KERAVE_PRODUCTS[0] }: Props) {
  const c = resolveKeratinConfig(config, entry.defaults);
  const { logoUrl, siteName } = useSiteBranding();
  const { data: reviews = [] } = useProductReviews(product.id, product.sku, preview);
  const { data: stats } = useProductStats(product.id, product.sku);
  const { data: stock } = useQuery({ queryKey: ['keratin-live-stock', product.id], queryFn: async () => { const { data, error } = await supabase.from('products').select('stock_quantity').eq('id', product.id).single(); if (error) throw error; return data.stock_quantity; }, staleTime: 60000 });
  const [active, setActive] = useState(0);
  const [toast, setToast] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const gallery = useRef<HTMLDivElement>(null);
  const heroCta = useRef<HTMLDivElement>(null);
  const finalOffer = useRef<HTMLDivElement>(null);
  const mainOffer = useRef<HTMLDivElement>(null);
  const heroOn = useOnScreen(heroCta, true);
  const finalOn = useOnScreen(finalOffer, false, true);
  const mainOn = useOnScreen(mainOffer, false);
  const stickyOn = !heroOn && !finalOn && !mainOn;

  const rating = cameraRating(reviews);
  const sold = stats ? cameraSoldLabel(stats.sold_units) : 0;
  const show = keratinVisibleSections(c, reviews.length);
  const s = c.sections;

  const images = c.gallery.filter(Boolean).length ? c.gallery.filter(Boolean) : (product.images?.length ? product.images : [product.image]);
  const hero = images[0];
  const slots = images.length + (c.video_url ? 1 : 0);
  const unitOld = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
  const priceFor = (q: number) => getDiscountedTotal(product.price, q, product.sku);
  const compareFor = (q: number) => (unitOld ?? product.price) * q;
  const total = priceFor(selectedQty);
  const compare = unitOld ? unitOld * selectedQty : null;
  const pct = compare ? Math.round((1 - total / compare) * 100) : 0;
  const heroPct = unitOld ? Math.round((1 - product.price / unitOld) * 100) : 0;

  useEffect(() => {
    if (!s.recent || !stats?.recent_cities?.length) return;
    let i = 0; let hide: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => { const used = Number(sessionStorage.getItem(entry.toastKey) ?? 0); if (used >= 4) return; setToast(stats.recent_cities[i++ % stats.recent_cities.length]); sessionStorage.setItem(entry.toastKey, String(used + 1)); hide = setTimeout(() => setToast(''), 5000); }, 25000);
    return () => { clearInterval(timer); clearTimeout(hide); };
  }, [stats?.recent_cities, s.recent, entry.toastKey]);

  const go = (i: number) => { setActive(i); gallery.current?.scrollTo({ left: i * gallery.current.clientWidth, behavior: reduced() ? 'auto' : 'smooth' }); };
  const cta = (label = 'შეუკვეთე ახლა') => repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder} /> : <button type="button" onClick={onBuy} className="k-btn"><span className="relative z-[1] flex items-center justify-center gap-2">{label}<ArrowRight className="w-5 h-5" /></span></button>;

  const proof = rating.count >= 5
    ? <a href="#keratin-reviews" className="inline-flex items-center gap-1.5 text-[14px]"><Stars /><strong>{rating.average.toFixed(1)}</strong><span className="k-mutetx">· {rating.count} შეფასება</span></a>
    : sold > 0 ? <p className="inline-flex items-center gap-1.5 text-[14px]"><Stars /><strong>{sold}+</strong><span className="k-mutetx">გაყიდული</span></p> : null;

  const offer = (ref: RefObject<HTMLDivElement>, heading?: string) => <div ref={ref} className="k-offer">
    {heading && <h2 className="text-[26px] leading-tight text-center mb-4 k-wrap">{heading}</h2>}
    <div role="radiogroup" aria-label="აირჩიე რაოდენობა" className="flex flex-col gap-3.5">
      {[1, 2, 3].map(q => {
        const t = priceFor(q); const save = Math.round(compareFor(q) - t); const on = q === selectedQty;
        return <button key={q} type="button" role="radio" aria-checked={on} onClick={() => onSelect(q)} className={`k-bundle ${on ? 'on' : ''}`}>
          {q === 2 && <span className="k-ribbon">ყველაზე ხშირად ირჩევენ</span>}
          <span className="k-radio" aria-hidden="true" />
          <span className="flex-1 min-w-0 text-left">
            <span className="block font-bold text-[17px]">{q} {c.unit_label}</span>
            <span className="block text-[13px] k-mutetx">{money(Math.round((t / q) * 100) / 100)}₾ / ცალი</span>
          </span>
          <span className="text-right shrink-0">
            <span className="block k-serif text-[22px] font-bold leading-none">{money(t)}₾</span>
            {save > 0 && <span className="k-save">დაზოგე {money(save)}₾</span>}
          </span>
        </button>;
      })}
    </div>
    <div className="mt-4">{cta(`შეუკვეთე — ${money(total)}₾`)}</div>
    <p className="text-center text-[13px] k-mutetx mt-2">{c.cta_note}</p>
    <ul className="k-assure mt-4">
      <li><Banknote className="w-5 h-5" /><span>გადახდა მიღებისას</span></li>
      <li><PhoneCall className="w-5 h-5" /><span>ოპერატორი დაგიკავშირდება დასადასტურებლად</span></li>
      <li><Truck className="w-5 h-5" /><span>მიტანა — 5₾</span></li>
    </ul>
  </div>;

  const midCta = <div className="k-midcta">
    <div className="flex items-center gap-3">
      <img src={hero} alt="" loading="lazy" width={56} height={56} className="w-14 h-14 object-contain shrink-0 k-float" />
      <div className="flex-1 min-w-0">
        <p className="k-serif text-[18px] leading-snug k-wrap">{c.headings.mid_cta}</p>
        <p className="text-[14px]"><strong className="text-[18px]">{money(total)}₾</strong>{compare && <s className="k-mutetx ml-1.5">{money(compare)}₾</s>}{pct > 0 && <span className="k-rose font-bold ml-1.5">−{pct}%</span>}</p>
      </div>
    </div>
    <div className="mt-3">{cta('შეუკვეთე ახლა')}</div>
  </div>;

  const benefitIcons = [Sparkles, Droplet, Waves, Leaf];
  const trustIcons = [Banknote, Truck, ShieldCheck, Droplet];
  const ritual = c.ritual.filter(Boolean);

  return <div className="keratin-page min-h-screen">
    <StickyAnnouncementBar variant="keratin" />
    <header className="k-header"><div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between"><a href="/" aria-label={siteName}><img src={logoUrl || logo} alt={siteName} width={112} height={28} className="h-7 w-auto" /></a><span className="flex gap-1.5 text-[13px] font-semibold items-center"><ShieldCheck className="w-4 h-4 k-rose" />გადახდა მიღებისას</span></div></header>

    {/* HERO — must sell above the fold */}
    <section className="max-w-lg mx-auto px-4 pt-3">
      <div className="k-stage">
        <img src={hero} alt="" aria-hidden="true" className="k-stage-blur" width={400} height={400} />
        <div className="k-stage-light" /><div className="k-sweep" />
        <div ref={gallery} onScroll={e => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="relative z-[2] flex h-full overflow-x-auto snap-x snap-mandatory k-gallery">
          {(s.gallery ? images : [hero]).map((url, i) => <div key={url + i} className="w-full h-full shrink-0 snap-center grid place-items-center px-10 pt-5 pb-9"><img src={url} alt={`${c.title} ${i + 1}`} width={600} height={600} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} decoding={i === 0 ? 'sync' : 'async'} className="k-hero max-w-full max-h-full object-contain" /></div>)}
          {s.gallery && c.video_url && <video controls preload="none" src={c.video_url} className="w-full h-full shrink-0 snap-center object-cover" />}
        </div>
        <div className="k-pedestal" />
        {heroPct > 0 && <span className="k-badge-off">−{heroPct}%</span>}
        {(c.hero_badge || c.volume) && <span className="k-badge-vol">{c.hero_badge || `${c.volume} მლ`}</span>}
        {s.gallery && slots > 1 && <div className="absolute z-[3] bottom-2.5 inset-x-0 flex justify-center gap-1">{Array.from({ length: slots }, (_, i) => <button key={i} type="button" aria-label={`ფოტო ${i + 1}`} aria-pressed={active === i} onClick={() => go(i)} className="p-1.5"><span className={`k-dot block ${active === i ? 'on' : ''}`} /></button>)}</div>}
      </div>

      <p className="mt-3 text-[13px] font-semibold tracking-wide k-rose k-wrap">{c.title}</p>
      <h1 className="text-[27px] leading-[1.22] mt-1 k-wrap">{c.headline}</h1>
      {proof && <div className="mt-2">{proof}</div>}
      <div className="flex items-end gap-2.5 mt-2.5 flex-wrap">
        <strong className="k-serif text-[40px] leading-none">{money(total)}₾</strong>
        {compare && <s className="text-[19px] k-mutetx mb-0.5">{money(compare)}₾</s>}
        {pct > 0 && <span className="k-chip-cocoa mb-1">−{pct}%</span>}
        <span className="text-[13px] k-mutetx mb-1 ml-auto">{selectedQty} ცალი</span>
      </div>
      <div ref={heroCta} className="mt-3">{cta()}</div>
      <p className="flex items-center justify-center gap-3 text-[13px] k-mutetx mt-2 flex-wrap"><span className="flex items-center gap-1"><Banknote className="w-4 h-4 k-rose" />გადახდა მიღებისას</span><span className="flex items-center gap-1"><Truck className="w-4 h-4 k-rose" />მიტანა — 5₾</span></p>
    </section>

    {/* Live strips */}
    {((s.today && (stats?.today_orders ?? 0) >= 10) || (s.stock && stock != null && stock > 0) || s.timer) && <div className="max-w-lg mx-auto px-4 mt-5 space-y-2.5">
      {s.today && (stats?.today_orders ?? 0) >= 10 && <p className="k-live"><span className="k-pulse" />დღეს შეუკვეთა <strong>{stats!.today_orders}</strong> ადამიანმა</p>}
      {s.stock && stock != null && stock > 0 && <div className="k-card px-4 py-3"><div className="flex justify-between text-[14px] mb-1.5"><span className="font-semibold">დარჩა {stock} ცალი</span><span className="k-mutetx">მარაგშია</span></div><progress className="k-progress w-full h-2" max={Math.max(c.stock_bar_max, stock)} value={stock} /></div>}
      {s.timer && <SkuUrgencyTimer storageKey={entry.urgencyKey} showStock={false} />}
    </div>}

    {/* OFFER — conversion centrepiece */}
    <section className="max-w-lg mx-auto px-4 mt-5">{offer(mainOffer)}</section>

    {/* Trust strip */}
    {s.trust && c.trust.filter(Boolean).length > 0 && <div className="max-w-lg mx-auto px-4 mt-5"><ul className="k-truststrip">{c.trust.filter(Boolean).map((t, i) => { const Icon = trustIcons[i] ?? ShieldCheck; return <li key={i}><Icon className="w-5 h-5 k-rose shrink-0" /><span className="k-wrap">{t}</span></li>; })}</ul></div>}

    {show.before_after_video && <Reveal className="max-w-lg mx-auto px-4 mt-8 text-center">
      <BeforeAfterVideo src={c.before_after_video} poster={c.before_after_video_poster} />
      <h2 className="text-[26px] leading-tight mt-4 k-wrap">იხილე განსხვავება</h2>
      <p className="text-[15px] k-mutetx mt-1 k-wrap">{c.video_caption}</p>
    </Reveal>}

    {/* Problem → solution (editorial split) */}
    {s.problem && <Reveal className="mt-10 k-problem">
      <div className="max-w-lg mx-auto px-4 py-9">
        <h2 className="text-[28px] leading-tight k-wrap">{c.headings.problem}</h2>
        <div className="grid grid-cols-[1fr_auto] gap-4 mt-5 items-center">
          <ul className="flex flex-wrap gap-2">{c.pain_points.filter(Boolean).map((p, i) => <li key={i} className="k-pain"><X className="w-3.5 h-3.5 shrink-0" /><span className="k-wrap">{p}</span></li>)}</ul>
          <img src={hero} alt="" loading="lazy" width={96} height={96} className="w-24 h-24 object-contain k-angled" />
        </div>
        <div className="k-arrow" aria-hidden="true"><span />KERAVÉ®-ით<span /></div>
        <ul className="flex flex-wrap gap-2">{c.results.filter(Boolean).map((p, i) => <li key={i} className="k-result"><Check className="w-4 h-4 shrink-0" /><span className="k-wrap">{p}</span></li>)}</ul>
        <p className="text-[15px] leading-relaxed mt-5 k-mutetx k-wrap">{c.subtitle}</p>
      </div>
    </Reveal>}

    {/* Benefits — editorial numbered list */}
    {show.benefits && <Reveal className="max-w-lg mx-auto px-4 mt-10">
      <h2 className="text-[30px] leading-tight k-wrap">{c.headings.benefits}</h2>
      <ol className="mt-4">{c.benefits.map((b, i) => { const Icon = benefitIcons[i] ?? Sparkles; return <li key={i} className="k-benefit"><span className="k-bnum">{String(i + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="k-serif text-[19px] leading-snug flex items-center gap-2 k-wrap"><Icon className="w-[18px] h-[18px] k-rose shrink-0" />{b.title}</p><p className="text-[15px] k-mutetx mt-1 leading-relaxed k-wrap">{b.text}</p></div></li>; })}</ol>
      {s.mid_cta && <div className="mt-5">{midCta}</div>}
    </Reveal>}

    {/* Ritual — full-bleed cocoa band, horizontal timeline */}
    {s.ritual && ritual.length > 0 && <Reveal className="k-band mt-10">
      <div className="max-w-lg mx-auto py-10">
        <div className="px-4 flex items-center gap-4">
          <Dial />
          <div className="min-w-0"><h2 className="text-[26px] min-[380px]:text-[28px] leading-tight k-wrap">{c.headings.ritual}</h2><p className="k-goldtx k-serif text-[18px] mt-1">{c.ritual_time}</p></div>
        </div>
        <ol className="k-steps mt-6" aria-label="გამოყენების ნაბიჯები">
          {ritual.map((step, i) => <li key={i} className="k-step"><span className="k-stepnum">{i + 1}</span><p className="text-[16px] leading-snug mt-3 k-wrap">{step}</p></li>)}
        </ol>
        <p className="px-4 mt-3 text-[13px] k-ivorymute">გადაფურცლე →</p>
      </div>
    </Reveal>}

    {/* Ingredients — overlapping molecules */}
    {show.ingredients && <Reveal className="max-w-lg mx-auto px-4 mt-10">
      <h2 className="text-[30px] leading-tight text-center k-wrap">{c.headings.ingredients}</h2>
      <div className="k-molecules mt-5" aria-hidden="true">{c.ingredients.slice(0, 2).map((g, i) => <Molecule key={i} label={g.title} tone={i === 0 ? 'rose' : 'gold'} />)}</div>
      <div className="grid gap-3 mt-4">{c.ingredients.map((g, i) => <div key={i} className="flex gap-3"><span className={`k-swatch ${i % 2 ? 'gold' : ''}`} /><div className="min-w-0"><p className="font-bold text-[16px] k-wrap">{g.title}</p><p className="text-[15px] k-mutetx leading-relaxed k-wrap">{g.text}</p></div></div>)}</div>
    </Reveal>}

    {/* Hair types — tappable chip cloud */}
    {show.hair_types && <Reveal className="mt-10 k-blush-bg">
      <div className="max-w-lg mx-auto px-4 py-9 text-center">
        <h2 className="text-[28px] leading-tight k-wrap">{c.headings.hair_types}</h2>
        <p className="text-[15px] k-mutetx mt-1">{c.hair_types_hint}</p>
        <div className="flex flex-wrap justify-center gap-2.5 mt-5">{c.hair_types.filter(Boolean).map(t => { const on = picked.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => setPicked(p => on ? p.filter(x => x !== t) : [...p, t])} className={`k-cloud ${on ? 'on' : ''}`}>{on && <Check className="w-4 h-4 shrink-0" />}<span className="k-wrap">{t}</span></button>; })}</div>
        {picked.length > 0 && <p className="mt-4 k-serif text-[18px]" role="status">{c.hair_types_done}</p>}
      </div>
    </Reveal>}

    {show.before_after && <Reveal className="max-w-lg mx-auto px-4 mt-10"><h2 className="text-[30px] leading-tight text-center mb-4 k-wrap">{c.headings.before_after}</h2><BeforeAfter before={c.before_image} after={c.after_image} /></Reveal>}

    {/* Volume / texture */}
    {s.texture && <Reveal className="max-w-lg mx-auto px-4 mt-10">
      <div className="k-volume">
        <img src={hero} alt="" aria-hidden="true" loading="lazy" className="k-volume-img" width={260} height={260} />
        <div className="relative z-[1] max-w-[58%]">
          <p className={c.feature_kind === 'waterproof' ? 'k-serif text-[30px] leading-tight k-wrap' : 'text-[14px] font-semibold k-rose k-wrap'}>{c.headings.texture}</p>
          {c.feature_kind === 'waterproof'
            ? <div className="k-drop mt-2" aria-hidden="true"><svg viewBox="0 0 64 80" width="72" height="90"><defs><linearGradient id="kdrop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="hsl(var(--k-blush))" /><stop offset="1" stopColor="hsl(var(--k-rose))" /></linearGradient></defs><path d="M32 4C22 22 8 36 8 52a24 24 0 0 0 48 0C56 36 42 22 32 4Z" fill="url(#kdrop)" stroke="hsl(var(--k-gold))" strokeWidth="1.5" /><path d="M20 52a12 12 0 0 0 10 12" fill="none" stroke="hsl(var(--k-ivory))" strokeWidth="3" strokeLinecap="round" opacity=".8" /></svg></div>
            : <p className="k-serif text-[64px] leading-none mt-1">{c.volume}<span className="text-[26px] ml-1">მლ</span></p>}
          <p className="text-[15px] k-mutetx mt-2 leading-snug k-wrap">{c.volume_text}</p>
        </div>
      </div>
      {c.texture_image && <img src={c.texture_image} alt="ნიღბის ტექსტურა" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[24px] mt-3 k-card" />}
    </Reveal>}

    {/* Comparison — side by side, KERAVÉ raised */}
    {s.comparison && c.comparison.length > 0 && <Reveal className="max-w-lg mx-auto px-4 mt-10">
      <h2 className="text-[28px] leading-tight text-center k-wrap">{c.headings.comparison}</h2>
      <div className="grid grid-cols-2 gap-2.5 mt-6 items-center">
        <div className="k-vs-ours">
          <p className="k-serif text-[19px] text-center">KERAVÉ®</p><p className="text-[12px] text-center k-goldtx">{c.vs_ours_sub}</p>
          <ul className="mt-3 space-y-3">{c.comparison.map((r, i) => <li key={i}><p className="text-[12px] k-ivorymute k-wrap">{r.label}</p><p className="font-bold text-[15px] flex items-start gap-1.5 k-wrap"><Check className="w-4 h-4 k-goldtx shrink-0 mt-0.5" />{r.ours}</p></li>)}</ul>
        </div>
        <div className="k-vs-salon">
          <p className="k-serif text-[17px] text-center">{c.vs_other}</p><p className="text-[12px] text-center k-mutetx">{c.vs_other_sub}</p>
          <ul className="mt-3 space-y-3">{c.comparison.map((r, i) => <li key={i}><p className="text-[12px] k-mutetx k-wrap">{r.label}</p><p className="text-[15px] flex items-start gap-1.5 k-mutetx k-wrap"><X className="w-4 h-4 shrink-0 mt-0.5" />{r.salon}</p></li>)}</ul>
        </div>
      </div>
      {s.mid_cta && <div className="mt-5">{midCta}</div>}
    </Reveal>}

    {show.reviews && <Reveal id="keratin-reviews" className="max-w-lg mx-auto px-4 mt-10">
      <h2 className="text-[28px] leading-tight text-center k-wrap">{c.headings.reviews}</h2>
      {rating.count > 0 && <div className="flex justify-center items-center gap-2 mt-2"><Stars className="w-5 h-5" /><strong className="text-[18px]">{rating.average.toFixed(1)}</strong><span className="k-mutetx text-[14px]">· {rating.count}</span></div>}
      {preview && <p className="text-center text-xs k-mutetx mt-2">DEMO — სატესტო შეფასებები ჩანს მხოლოდ preview რეჟიმში</p>}
      <div className="mt-4"><CameraReviewList reviews={reviews} /></div>
    </Reveal>}

    {/* Details — compact accordions */}
    {((s.specs && c.specs.length > 0) || show.box || show.faq) && <Reveal className="max-w-lg mx-auto px-4 mt-10">
      <h2 className="text-[26px] leading-tight k-wrap">{c.headings.faq}</h2>
      <Accordion type="single" collapsible className="k-acc mt-3">
        {s.specs && c.specs.length > 0 && <AccordionItem value="specs"><AccordionTrigger className="text-left text-[16px] font-semibold">{c.headings.specs}</AccordionTrigger><AccordionContent><dl className="divide-y divide-border">{c.specs.map((sp, i) => <div key={i} className="py-2.5 flex justify-between gap-4"><dt className="text-[14px] k-mutetx">{sp.label}</dt><dd className="text-[14px] font-semibold text-right k-wrap">{sp.value}</dd></div>)}</dl></AccordionContent></AccordionItem>}
        {show.box && <AccordionItem value="box"><AccordionTrigger className="text-left text-[16px] font-semibold">{c.headings.box}</AccordionTrigger><AccordionContent><ul className="space-y-2">{c.box_contents.filter(Boolean).map((t, i) => <li key={i} className="flex gap-2 text-[15px]"><Check className="w-5 h-5 k-rose shrink-0" />{t}</li>)}</ul></AccordionContent></AccordionItem>}
        {show.faq && c.faq.filter(f => f.answer.trim()).map((f, i) => <AccordionItem key={i} value={`f${i}`}><AccordionTrigger className="text-left text-[16px] font-semibold k-wrap">{f.question}</AccordionTrigger><AccordionContent className="text-[15px] leading-relaxed k-wrap">{f.answer}</AccordionContent></AccordionItem>)}
      </Accordion>
    </Reveal>}

    {/* Final offer */}
    {s.final_cta && <section className="k-final mt-10">
      <img src={hero} alt="" aria-hidden="true" loading="lazy" className="k-final-blur" width={400} height={400} />
      <div className="relative max-w-lg mx-auto px-4 py-10">{offer(finalOffer, c.final_heading)}</div>
    </section>}
    

    {toast && <div role="status" className={`k-toast fixed left-4 right-4 z-40 max-w-sm mx-auto rounded-full px-4 py-2.5 text-[14px] text-center ${stickyOn ? 'bottom-[96px]' : 'bottom-5'}`}>ახლახან შეუკვეთეს: {toast}</div>}

    <div className={`k-sticky ${stickyOn ? 'on' : ''}`} aria-hidden={!stickyOn} style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <div className="shrink-0"><p className="text-[12px] k-mutetx leading-none">{selectedQty} ცალი</p><p className="k-serif text-[24px] font-bold leading-tight">{money(total)}₾</p>{compare && <s className="text-[12px] k-mutetx leading-none block">{money(compare)}₾</s>}</div>
        <div className="flex-1">{repeatBlocked ? <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={onReorder} compact /> : <button type="button" tabIndex={stickyOn ? 0 : -1} onClick={onBuy} className="k-btn"><span className="relative z-[1]">შეუკვეთე ახლა</span></button>}</div>
      </div>
    </div>
  </div>;
}

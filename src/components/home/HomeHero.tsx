import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import type { Product } from "@/lib/constants";

interface Slide { eyebrow: string; title: string; sub: string; cta: string; target: string; }
const SLIDES: Slide[] = [
  { eyebrow: "დღის შეთავაზება", title: "ფასდაკლებები 65%-მდე", sub: "ტოპ გაყიდვადი ნივთები საუკეთესო ფასად", cta: "ნახეთ შეთავაზებები", target: "#products" },
  { eyebrow: "მიტანა", title: "მიტანა მთელ საქართველოში", sub: "კურიერით — ქალაქებსა და სოფლებში", cta: "დაიწყეთ შოპინგი", target: "#products" },
  { eyebrow: "სიახლე", title: "ახალი ტრენდული ნივთები", sub: "ყოველკვირეულად ვამატებთ ახალ პროდუქტებს", cta: "ნახეთ სიახლეები", target: "#products" },
  { eyebrow: "უსაფრთხოდ", title: "თანხის გადახდა მიტანისას", sub: "გადაიხდით მხოლოდ ნივთის მიღების შემდეგ", cta: "შეუკვეთეთ ახლა", target: "#products" },
];
const INTERVAL = 5000;

function useMidnightCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Midnight in Tbilisi (UTC+4)
  const tb = new Date(now + 4 * 3600_000);
  const left = 86400_000 - ((tb.getUTCHours() * 3600 + tb.getUTCMinutes() * 60 + tb.getUTCSeconds()) * 1000);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function HomeHero({ products }: { products: Product[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const countdown = useMidnightCountdown();

  const imgs = useMemo(() => {
    const pool = products.filter((p) => p.available && p.image);
    return SLIDES.map((_, i) => [pool[i * 2], pool[i * 2 + 1]].filter(Boolean) as Product[]);
  }, [products]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SLIDES.length), INTERVAL);
    return () => clearTimeout(t);
  }, [idx, paused]);

  const go = (d: number) => setIdx((i) => (i + d + SLIDES.length) % SLIDES.length);
  const scrollTo = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <section
      aria-roledescription="carousel"
      className="relative overflow-hidden rounded-3xl bg-gradient-brand tm-anim-gradient text-primary-foreground h-[300px] md:h-[400px] shadow-brand select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setTilt({ x: 0, y: 0 }); }}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }); }}
      onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        setPaused(false);
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Blobs & sparkles */}
      <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-secondary/50 blur-3xl tm-blob" aria-hidden />
      <div className="absolute -bottom-28 left-10 w-80 h-80 rounded-full bg-primary-foreground/15 blur-3xl tm-blob" style={{ animationDelay: "-4s" }} aria-hidden />
      {[["12%", "62%", "0s"], ["30%", "88%", "-.8s"], ["70%", "55%", "-1.6s"], ["82%", "92%", "-.4s"]].map(([t, l, d], i) => (
        <Sparkles key={i} className="absolute w-4 h-4 text-primary-foreground/80 tm-sparkle" style={{ top: t, left: l, animationDelay: d }} aria-hidden />
      ))}

      {SLIDES.map((s, i) => {
        const on = i === idx;
        return (
          <div key={s.title} aria-hidden={!on} className={`absolute inset-0 grid grid-cols-[1.25fr_1fr] md:grid-cols-2 items-center px-5 md:px-14 transition-all duration-700 ease-out ${on ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6 pointer-events-none"}`}>
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 bg-primary-foreground/20 backdrop-blur-sm rounded-full px-3 py-1 text-[11px] md:text-xs font-bold">
                {i === 0 ? <><Clock className="w-3.5 h-3.5" /> მთავრდება {countdown}</> : s.eyebrow}
              </span>
              <h1 className="mt-3 text-[26px] leading-[1.1] md:text-5xl font-black tracking-tight">{s.title}</h1>
              <p className="mt-2 text-sm md:text-lg opacity-90 max-w-md">{s.sub}</p>
              <button tabIndex={on ? 0 : -1} onClick={() => scrollTo(s.target)} className="mt-4 md:mt-6 inline-flex items-center gap-2 bg-primary-foreground text-foreground font-bold rounded-2xl px-5 h-11 md:h-12 md:px-7 text-sm md:text-base shadow-soft active:scale-95 transition-transform">
                {s.cta} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="relative h-full" style={{ transform: `translate(${tilt.x * -18}px, ${tilt.y * -14}px)`, transition: "transform .3s ease-out" }}>
              {imgs[i]?.[0] && (
                <img src={imgs[i][0].image} alt={imgs[i][0].title} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} width={260} height={260}
                  className="absolute top-1/2 right-0 md:right-10 -translate-y-1/2 w-32 h-32 md:w-64 md:h-64 object-cover rounded-3xl shadow-2xl ring-4 ring-primary-foreground/30 tm-float" />
              )}
              {imgs[i]?.[1] && (
                <img src={imgs[i][1].image} alt={imgs[i][1].title} loading="lazy" width={160} height={160}
                  className="hidden sm:block absolute bottom-8 left-0 md:left-6 w-24 h-24 md:w-36 md:h-36 object-cover rounded-2xl shadow-xl ring-4 ring-primary-foreground/30 tm-float" style={{ animationDelay: "-3s" }} />
              )}
            </div>
          </div>
        );
      })}

      {/* Progress indicators */}
      <div className="absolute bottom-4 left-5 md:left-14 flex gap-2 z-10">
        {SLIDES.map((s, i) => (
          <button key={s.title} onClick={() => setIdx(i)} aria-label={`სლაიდი ${i + 1}`} className="h-1.5 w-8 rounded-full bg-primary-foreground/30 overflow-hidden">
            <span
              key={`${i}-${idx}`}
              className="block h-full bg-primary-foreground origin-left"
              style={i === idx ? { animation: `tm-progress ${INTERVAL}ms linear forwards`, animationPlayState: paused ? "paused" : "running" } : { transform: i < idx ? "scaleX(1)" : "scaleX(0)" }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

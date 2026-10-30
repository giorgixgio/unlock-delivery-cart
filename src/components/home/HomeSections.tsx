import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Truck, Banknote, ShieldCheck, RotateCcw, Headphones, Star, ArrowRight, Sparkles,
  ChefHat, Home, Wrench, Car, Baby, Dumbbell, Bath, Lightbulb, Flower2, Smartphone, Watch,
  PawPrint, Tent, HardHat, Briefcase, LayoutGrid, Package, PhoneCall, PackageCheck,
} from "lucide-react";
import { CATEGORIES, type CategoryId, type Product } from "@/lib/constants";
import { useCameraReviews } from "@/hooks/useCameraReviews";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";

/* Scroll-reveal wrapper */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`tm-reveal ${shown ? "is-visible" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 md:mb-5">
      <div>
        <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* Trust strip */
const TRUST = [
  { icon: Truck, title: "მიტანა მთელ საქართველოში", sub: "ქალაქებსა და სოფლებში" },
  { icon: Banknote, title: "გადახდა მიტანისას", sub: "გადაიხდით კურიერთან" },
  { icon: ShieldCheck, title: "ხარისხის კონტროლი", sub: "ყველა ნივთი მოწმდება" },
  { icon: RotateCcw, title: "14-დღიანი დაბრუნება", sub: "დაზიანებულ ნივთზე" },
  { icon: Headphones, title: "მხარდაჭერა", sub: "info@trendmart.ge" },
];
export function TrustStrip() {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5">
      {TRUST.map(({ icon: Icon, title, sub }) => (
        <div key={title} className="snap-start flex-shrink-0 flex items-center gap-3 bg-card rounded-2xl px-4 py-3 shadow-soft border border-border/60 min-w-[220px] md:min-w-0">
          <span className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Category tiles */
const CAT_ICONS: Record<string, typeof Home> = {
  all: LayoutGrid, "სამზარეულო": ChefHat, "სახლი-ინტერიერი": Home, "თავის-მოვლა-სილამაზე": Sparkles,
  "ხელსაწყოები": Wrench, "ავტომობილი": Car, "ბავშვები": Baby, "სპორტი-აქტიური-ცხოვრება": Dumbbell,
  "აბაზანა-სანტექნიკა": Bath, "განათება": Lightbulb, "ბაღი-ეზო": Flower2, "ელექტრონიკა-გაჯეტები": Smartphone,
  "აქსესუარები": Watch, "ცხოველები": PawPrint, "კემპინგი-ტურიზმი": Tent, "უსაფრთხოება-სპეცტანსაცმელი": HardHat,
  "ჩანთები-ორგანაიზერები": Briefcase,
};
export function CategoryTiles({ products, active, onChange }: { products: Product[]; active: CategoryId; onChange: (c: CategoryId) => void }) {
  const cats = useMemo(() => {
    const has = new Set<string>();
    products.forEach((p) => (p.categories?.length ? p.categories : [p.category]).forEach((c) => has.add(c)));
    return CATEGORIES.filter((c) => c.id === "all" || has.has(c.id));
  }, [products]);
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
      {cats.map((c) => {
        const Icon = CAT_ICONS[c.id] ?? Package;
        const on = active === c.id;
        return (
          <button key={c.id} onClick={() => onChange(c.id)} className="flex-shrink-0 w-[84px] flex flex-col items-center gap-1.5 group">
            <span className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 ${on ? "bg-gradient-brand shadow-brand scale-105" : "bg-card shadow-soft border border-border/60 group-hover:-translate-y-0.5"}`}>
              <Icon className={`w-7 h-7 ${on ? "text-primary-foreground" : "text-primary"}`} />
            </span>
            <span className={`text-xs text-center leading-tight line-clamp-2 ${on ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Mid-page promo banner */
export function PromoBanner({ product }: { product?: Product }) {
  const { addAndGate } = useCheckoutGate();
  if (!product) return null;
  const old = getFakeOldPrice(product.id, product.price);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-brand tm-anim-gradient text-primary-foreground p-6 md:p-10 grid md:grid-cols-2 gap-6 items-center shadow-brand">
      <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full bg-primary-foreground/15 blur-2xl tm-blob" aria-hidden />
      <div className="relative">
        <span className="inline-flex items-center gap-1 bg-primary-foreground/20 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" /> კვირის შეთავაზება
        </span>
        <h3 className="mt-3 text-2xl md:text-4xl font-extrabold leading-tight line-clamp-3">{product.title}</h3>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl md:text-4xl font-black">{product.price} ₾</span>
          <span className="text-base line-through opacity-75">{old.toFixed(2)} ₾</span>
          <span className="bg-primary-foreground text-brand text-xs font-extrabold rounded-full px-2 py-0.5">-{getDiscountPercent(product.price, old)}%</span>
        </div>
        <button onClick={() => addAndGate(product, "home_promo_banner")} className="mt-5 inline-flex items-center gap-2 bg-primary-foreground text-foreground font-bold rounded-2xl px-6 h-12 active:scale-95 transition-transform shadow-soft">
          შეკვეთა <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative flex justify-center">
        <img src={product.image} alt={product.title} loading="lazy" width={320} height={320} className="w-48 h-48 md:w-72 md:h-72 object-cover rounded-3xl shadow-2xl tm-float" />
      </div>
    </div>
  );
}

/* Real approved customer reviews (hidden when none) */
export function ReviewsSection() {
  const { data: reviews = [] } = useCameraReviews(false);
  const list = reviews.filter((r) => r.text?.trim()).slice(0, 6);
  if (list.length === 0) return null;
  return (
    <section>
      <SectionTitle title="მომხმარებლების შეფასებები" subtitle="რეალური შეფასებები ჩვენი მყიდველებისგან" />
      <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3">
        {list.map((r) => (
          <article key={r.id} className="snap-start flex-shrink-0 w-[280px] md:w-auto bg-card rounded-3xl p-5 shadow-soft border border-border/60">
            <div className="flex gap-0.5" aria-label={`${r.rating} ვარსკვლავი`}>
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-4 h-4 ${i < r.rating ? "fill-secondary text-secondary" : "text-border"}`} />)}
            </div>
            <p className="mt-3 text-sm text-foreground leading-relaxed line-clamp-5">{r.text}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-accent text-accent-foreground font-bold flex items-center justify-center">{r.customer_display_name?.[0] ?? "?"}</span>
              <div>
                <p className="text-sm font-bold text-foreground">{r.customer_display_name}</p>
                <p className="text-xs text-muted-foreground">{r.city}{r.verified ? " · დადასტურებული შეძენა" : ""}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* About + 3 steps */
const STEPS = [
  { icon: Package, title: "აირჩიეთ ნივთი", text: "დაამატეთ კალათაში და მიუთითეთ ტელეფონის ნომერი." },
  { icon: PhoneCall, title: "დავადასტურებთ", text: "ოპერატორი დაგიკავშირდებათ და დააზუსტებს მისამართს." },
  { icon: PackageCheck, title: "მიიღეთ და გადაიხადეთ", text: "კურიერი მოგიტანთ ნივთს — გადახდა მიღებისას." },
];
export function WhyTrendmart() {
  return (
    <section className="bg-card rounded-3xl p-6 md:p-10 shadow-soft border border-border/60 grid md:grid-cols-[1fr_1.4fr] gap-8">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-primary">რატომ trendmart</span>
        <h2 className="mt-2 text-2xl md:text-3xl font-extrabold text-foreground leading-tight">პრაქტიკული ნივთები სახლისთვის — მარტივად და უსაფრთხოდ</h2>
        <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
          TrendMart ქართული ონლაინ მაღაზიაა. ნივთები ინახება ჩვენს საწყობში თბილისში და იგზავნება კურიერით მთელ საქართველოში. თანხას იხდით მხოლოდ მაშინ, როცა ნივთს ხელში მიიღებთ.
        </p>
        <Link to="/about" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline underline-offset-4">ჩვენს შესახებ <ArrowRight className="w-4 h-4" /></Link>
      </div>
      <ol className="grid sm:grid-cols-3 gap-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative bg-surface-warm rounded-2xl p-5">
            <span className="absolute top-4 right-4 text-3xl font-black text-gradient-brand opacity-80">{i + 1}</span>
            <span className="w-11 h-11 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand"><Icon className="w-5 h-5 text-primary-foreground" /></span>
            <h3 className="mt-4 font-bold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

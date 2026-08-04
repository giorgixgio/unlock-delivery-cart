import { useState, useMemo, useEffect, useRef } from "react";
import { Truck, HandCoins, ShieldCheck, Clock, Loader2 } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { Product } from "@/lib/constants";
import BundleTile from "@/components/bundle/BundleTile";
import BundleQuickViewSheet from "@/components/bundle/BundleQuickViewSheet";

import BundlePhoneSheet from "@/components/bundle/BundlePhoneSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";
import LandingDoneSheet from "@/components/landing/LandingDoneSheet";
import RepeatOrderBlock from "@/components/landing/RepeatOrderBlock";
import { readLastOrder, saveLastOrder, markIntentionalRepeat } from "@/lib/lastOrderStore";
import { trackEvent } from "@/lib/analytics";

const BUNDLE_SIZE = 5;
const BUNDLE_PRICE = 39;
const LANDING_SLUG = "5for39";
const COUNTDOWN_MIN = 60;
const STORAGE_KEY = "bundle_5for39_countdown_end";
const SCROLL_COLLAPSE_PX = 80; // hide top bars once user scrolls past hero

/** Slim sticky countdown bar. */
const CountdownBar = () => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const rem = Math.max(0, Math.floor((Number(stored) - Date.now()) / 1000));
      if (rem > 0) return rem;
    }
    sessionStorage.setItem(STORAGE_KEY, String(Date.now() + COUNTDOWN_MIN * 60_000));
    return COUNTDOWN_MIN * 60;
  });

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          sessionStorage.setItem(STORAGE_KEY, String(Date.now() + COUNTDOWN_MIN * 60_000));
          return COUNTDOWN_MIN * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div
      className="text-white bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] shadow-[0_6px_20px_rgba(255,59,59,.28)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-9 flex items-center justify-center gap-2 px-4">
        <Clock className="w-3.5 h-3.5" />
        <span className="text-[11px] font-extrabold uppercase tracking-[1.2px]">ფასი მოქმედებს:</span>
        <span className="font-mono text-[14px] font-extrabold tabular-nums">
          {mins}:{secs}
        </span>
      </div>
    </div>
  );
};


const BundleLanding = () => {
  const { data: products, isLoading } = useProducts();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hintId, setHintId] = useState<number>(0);
  const [celebrate, setCelebrate] = useState(false);

  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);

  const [topCollapsed, setTopCollapsed] = useState(false);

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [repeatOrder, setRepeatOrder] = useState<{ orderNumber: string } | null>(null);

  const pool = useMemo(
    () => (products || []).filter((p) => p.available && p.price > 0).slice(0, 60),
    [products],
  );

  const selected: Product[] = useMemo(
    () => selectedIds.map((id) => pool.find((p) => p.id === id)).filter(Boolean) as Product[],
    [selectedIds, pool],
  );

  const anchorSum = selected.reduce((s, p) => s + p.price, 0);
  const savings = Math.max(0, Math.round(anchorSum - BUNDLE_PRICE));
  const n = selected.length;
  const complete = n === BUNDLE_SIZE;
  const dupSku = selected[0]?.sku || selected[0]?.id || "";

  // Client-side duplicate guard (Fix #11) keyed on the primary sku of the bundle.
  useEffect(() => {
    if (!dupSku) { setRepeatOrder(null); return; }
    const last = readLastOrder(dupSku);
    if (last) {
      setRepeatOrder({ orderNumber: last.orderNumber });
      trackEvent("duplicate_block_shown", { sku: dupSku, orderNumber: last.orderNumber, source: "client" });
    } else {
      setRepeatOrder(null);
    }
  }, [dupSku]);

  useEffect(() => {
    if (complete) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 900);
      return () => clearTimeout(t);
    }
  }, [complete]);

  // Collapse top announcement bars while scrolling products for more screen space.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      setTopCollapsed(y > SCROLL_COLLAPSE_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= BUNDLE_SIZE) {
        // Smoothest: swap out the oldest selection.
        setHintId(Date.now());
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const handleCta = () => {
    if (!complete) {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHintId(Date.now());
      return;
    }
    setPhoneOpen(true);
  };

  const handleOrderCreated = (id: string, num: string) => {
    setOrderId(id);
    setOrderNumber(num);
    if (dupSku) {
      saveLastOrder({
        orderNumber: num,
        sku: dupSku,
        productName: `ნაკრები 5 = ${BUNDLE_PRICE}₾`,
        phone: "",
        createdAt: Date.now(),
      });
    }
    setPhoneOpen(false);
    setAddressOpen(true);
  };

  const ctaLabel = n === 0
    ? `აირჩიე ${BUNDLE_SIZE} პროდუქტი — ${BUNDLE_PRICE}₾`
    : complete
      ? `შეუკვეთე ახლა — ${BUNDLE_PRICE}₾ · მიტანა უფასო`
      : `აირჩიე კიდევ ${BUNDLE_SIZE - n} — და გადაიხდი ${BUNDLE_PRICE}₾`;

  return (
    <div className="bnd-root min-h-screen overflow-x-hidden">
      {/* Top announcement bars — collapse on scroll to free up product space */}
      <div
        className={`fixed left-0 right-0 z-50 bnd-top-bar ${topCollapsed ? "bnd-top-bar--collapsed" : ""}`}
        style={{ top: 0 }}
      >
        <CountdownBar />

        {/* Marquee ticker under the timer, straight from the reference skin */}
        <div className="bnd-ticker">
          <div className="bnd-ticker-track py-1.5">
            {[0, 1].map((k) => (
              <div key={k} className="flex">
                {[
                  "ნებისმიერი 5 ნივთი — 39₾",
                  "მიტანა უფასო",
                  "გადაიხდი კურიერთან",
                  "7 დღის გარანტია",
                ].map((t) => (
                  <span
                    key={t + k}
                    className="inline-flex items-center gap-2 px-5 text-[11px] font-extrabold uppercase tracking-[1px] text-white/95"
                  >
                    {t}
                    <span className="w-1 h-1 rounded-full bg-white/50" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <main
        className="container max-w-lg mx-auto px-4"
        style={{
          paddingTop: topCollapsed
            ? "calc(16px + env(safe-area-inset-top))"
            : "calc(36px + 28px + env(safe-area-inset-top) + 20px)",
          paddingBottom: "calc(190px + env(safe-area-inset-bottom))",
          transition: "padding-top .28s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div className="bnd-slide-up text-center">
          <span className="bnd-kicker">
            <span className="bnd-kicker-dot" />
            BIGMART · მხოლოდ დღეს
          </span>
          <h1 className="bnd-display mt-4 text-[clamp(30px,8vw,42px)] leading-[1.05]">
            <span className="block text-[#0b0b12]">აირჩიე ნებისმიერი 5</span>
            <span className="block bnd-accent-text">სულ&nbsp;39₾</span>
          </h1>
          <p className="text-[15px] text-[#6f6f85] mt-3 font-medium">
            ცალკე გაცილებით ძვირია. დღეს — მხოლოდ <strong className="text-[#0b0b12]">39₾</strong> + მიტანა უფასო.
          </p>
        </div>

        {/* Trust strip */}
        <div className="flex flex-wrap justify-center gap-2 mt-5 bnd-slide-up">
          {[
            { icon: Truck, label: "მიტანა უფასო", green: true },
            { icon: HandCoins, label: "გადაიხდი მიღებისას", green: true },
            { icon: ShieldCheck, label: "7 დღის გარანტია", green: false },
          ].map(({ icon: Icon, label, green }) => (
            <span key={label} className={`bnd-pill ${green ? "bnd-pill-green" : ""}`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </span>
          ))}
        </div>

        {/* Live anchor */}
        <div className="bnd-card mt-5 p-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-[linear-gradient(90deg,#ff3b3b,#ff6b00,#ff3b3b)]" />
          {n > 0 ? (
            <>
              <p className="text-[11px] font-extrabold uppercase tracking-[1.5px] text-[#6f6f85]">
                შენი ნაკრები
              </p>
              <p className="bnd-display mt-1.5 text-[26px]">
                <span className="line-through text-[#6f6f85] not-italic font-bold text-[18px]">
                  {Math.round(anchorSum)}₾
                </span>{" "}
                <span className="text-[#00a15a]">39₾</span>
              </p>
              {savings > 0 && (
                <p className="mt-1 text-[12px] font-extrabold text-[#c2410c]">
                  ზოგავ {savings}₾
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] font-bold text-[#6f6f85]">
              აირჩიე 5 პროდუქტი და ნახე რამდენს ზოგავ
            </p>
          )}
        </div>

        {/* Grid */}
        <div ref={gridRef} className="mt-6 scroll-mt-24">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex-1 h-px bg-[rgba(11,11,18,.1)]" />
            <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-[#c2410c]">
              აირჩიე შენი 5
            </span>
            <span className="flex-1 h-px bg-[rgba(11,11,18,.1)]" />
          </div>

          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#6f6f85]" />
            </div>
          ) : (
            <div key={hintId} className="grid grid-cols-2 gap-3 animate-fade-in">
              {pool.map((p) => (
                <BundleTile
                  key={p.id}
                  product={p}
                  selected={selectedIds.includes(p.id)}
                  onToggle={() => toggle(p.id)}
                  onQuickView={() => {
                    setQuickViewId(p.id);
                    setQuickViewOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Sticky bottom CTA */}
      <div
        className="bnd-root fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[rgba(11,11,18,.08)] shadow-[0_-8px_28px_rgba(11,11,18,.10)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="container max-w-lg mx-auto px-4 py-3 space-y-2">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[12px] font-extrabold uppercase tracking-wide ${
                    complete ? "text-[#00a15a]" : "text-[#0b0b12]"
                  } ${celebrate ? "bnd-pop" : ""}`}
                >
                  არჩეული: {n}/{BUNDLE_SIZE} {complete && "🎉"}
                </span>
                <span className="text-[12px] font-extrabold text-[#0b0b12]">
                  39₾ · <span className="text-[#00a15a]">მიტანა უფასო</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#ececef] overflow-hidden">
                <div
                  className="bnd-progress-fill h-full rounded-full"
                  style={{ width: `${(n / BUNDLE_SIZE) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {n === BUNDLE_SIZE - 1 && (
            <p className="text-[12px] font-extrabold text-[#c2410c] text-center">
              დაამატე კიდევ 1 და გადაიხდი მხოლოდ 39₾!
            </p>
          )}
          {n > 0 && (
            <p className="text-[11px] text-[#6f6f85] text-center font-medium">
              ცალკე <span className="line-through">{Math.round(anchorSum)}₾</span> → 39₾
              {savings > 0 && ` · ზოგავ ${savings}₾`}
            </p>
          )}

          {repeatOrder ? (
            <RepeatOrderBlock
              orderNumber={repeatOrder.orderNumber}
              onReorder={() => {
                if (dupSku) markIntentionalRepeat(dupSku);
                setRepeatOrder(null);
              }}
              compact
            />
          ) : (
            <>
              <button
                onClick={handleCta}
                className="bnd-btn-green w-full h-14 rounded-[16px] text-[15px] uppercase tracking-wide"
              >
                {ctaLabel}
              </button>
              <p className="text-[11px] text-[#6f6f85] text-center font-medium">
                გადაიხდი კურიერთან. თანხა წინასწარ არ იხდი.
              </p>
            </>
          )}
        </div>
      </div>


      {/* Quick view bottom sheet — selection only, never touches the COD flow */}
      <BundleQuickViewSheet
        product={pool.find((p) => p.id === quickViewId) || null}
        open={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
        selected={quickViewId ? selectedIds.includes(quickViewId) : false}
        selectedCount={n}
        bundleSize={BUNDLE_SIZE}
        bundlePrice={BUNDLE_PRICE}
        onToggle={() => quickViewId && toggle(quickViewId)}
      />

      {/* Existing COD flow — reused as-is */}
      <BundlePhoneSheet
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        products={selected}
        flatTotal={BUNDLE_PRICE}
        landingSlug={LANDING_SLUG}
        onOrderCreated={handleOrderCreated}
        onDuplicateBlocked={(num) => setRepeatOrder({ orderNumber: num })}
      />

      {orderId && (
        <AddressFormModal
          open={addressOpen}
          onClose={() => setAddressOpen(false)}
          orderId={orderId}
          orderNumber={orderNumber}
          orderTotal={BUNDLE_PRICE}
          deliveryFee={0}
          productId={selected[0]?.id || ""}
          quantity={BUNDLE_SIZE}
          unitPrice={BUNDLE_PRICE / BUNDLE_SIZE}
          landingSlug={LANDING_SLUG}
          onComplete={() => {
            setAddressOpen(false);
            setDoneOpen(true);
          }}
        />
      )}

      {orderId && (
        <LandingDoneSheet
          open={doneOpen}
          onClose={() => setDoneOpen(false)}
          orderId={orderId}
          orderNumber={orderNumber}
          deliveryFee={0}
          total={BUNDLE_PRICE}
        />
      )}
    </div>
  );
};

export default BundleLanding;

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Truck, Clock, Loader2 } from "lucide-react";
import { useStorefrontProducts as useProducts } from "@/hooks/useProducts";
import { Product, CATEGORIES } from "@/lib/constants";
import BundleTile from "@/components/bundle/BundleTile";
import { getBundleDisplayPrice } from "@/lib/bundleDisplayPrice";
import BundleQuickViewSheet from "@/components/bundle/BundleQuickViewSheet";
import BundleSwapModal from "@/components/bundle/BundleSwapModal";

import BundlePhoneSheet from "@/components/bundle/BundlePhoneSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";
import LandingDoneSheet from "@/components/landing/LandingDoneSheet";
import RepeatOrderBlock from "@/components/landing/RepeatOrderBlock";
import { readLastBundleOrder, readLastOrder, saveLastOrder, markIntentionalRepeat } from "@/lib/lastOrderStore";
import { trackEvent } from "@/lib/analytics";
import { getUrgencySignal } from "@/lib/bundleUrgency";

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

  const [swapIncoming, setSwapIncoming] = useState<Product | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);

  const [topCollapsed, setTopCollapsed] = useState(false);

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [repeatOrder, setRepeatOrder] = useState<{ orderNumber: string; sku: string } | null>(() => {
    const last = readLastBundleOrder();
    return last ? { orderNumber: last.orderNumber, sku: last.sku } : null;
  });
  const [intentionalReorder, setIntentionalReorder] = useState(false);

  const [searchParams] = useSearchParams();
  const featuredParam = (searchParams.get("featured") || "").trim();

  const [activeCat, setActiveCat] = useState<string>("all");

  // Full eligible catalog (used for category counts + category-filtered views)
  const eligible = useMemo(
    () => (products || []).filter((p) => p.available && p.price > 0),
    [products],
  );

  // Top categories by product count, labelled from the shared catalog constants
  const catChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of eligible) {
      for (const c of p.categories?.length ? p.categories : [p.category]) {
        if (!c || c === "uncategorized") continue;
        counts.set(c, (counts.get(c) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 10)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => ({
        id,
        label: CATEGORIES.find((c) => c.id === id)?.label || id,
      }));
  }, [eligible]);

  const basePool = useMemo(() => {
    const all = eligible;
    if (!featuredParam) return all.slice(0, 60);
    // Search the whole eligible catalog, not just the first 60, so a featured
    // SKU deep in the list still gets promoted to position 1.
    const idx = all.findIndex(
      (p) =>
        String(p.sku || "").toLowerCase() === featuredParam.toLowerCase() ||
        String(p.id) === featuredParam,
    );
    // No match → grid renders normally, no error surfaced.
    if (idx < 0) return all.slice(0, 60);
    const copy = [...all];
    const [hit] = copy.splice(idx, 1);
    return [hit, ...copy].slice(0, 60);
  }, [eligible, featuredParam]);

  const pool = basePool;

  // Purely visual filtering — never touches selectedIds
  const visible = useMemo(() => {
    if (activeCat === "all") return basePool;
    return eligible
      .filter((p) => (p.categories?.length ? p.categories : [p.category]).includes(activeCat))
      .slice(0, 60);
  }, [activeCat, basePool, eligible]);



  const featuredId = useMemo(() => {
    if (!featuredParam) return null;
    const hit = pool[0];
    if (!hit) return null;
    const matches =
      String(hit.sku || "").toLowerCase() === featuredParam.toLowerCase() ||
      String(hit.id) === featuredParam;
    return matches ? hit.id : null;
  }, [pool, featuredParam]);

  const selected: Product[] = useMemo(
    () => selectedIds.map((id) => eligible.find((p) => p.id === id)).filter(Boolean) as Product[],
    [selectedIds, eligible],
  );

  const anchorSum = selected.reduce((s, p) => s + getBundleDisplayPrice(p.id), 0);
  const savings = Math.max(0, Math.round(anchorSum - BUNDLE_PRICE));
  const n = selected.length;
  const complete = n === BUNDLE_SIZE;
  const dupSku = selected[0]?.sku || selected[0]?.id || "";

  // Client-side duplicate guard (Fix #11) keyed on the primary sku of the bundle.
  useEffect(() => {
    // Once the customer explicitly chooses to order again, keep the warning
    // dismissed while they build the replacement bundle. Changing the first
    // selected product must not re-trigger the local duplicate guard.
    if (intentionalReorder) { setRepeatOrder(null); return; }
    // The newest saved bundle is loaded before any product is selected, so the
    // customer can confirm a repeat order without losing their first choice.
    if (!dupSku) return;
    const last = readLastOrder(dupSku);
    if (last) {
      setRepeatOrder({ orderNumber: last.orderNumber, sku: last.sku });
      trackEvent("duplicate_block_shown", { sku: dupSku, orderNumber: last.orderNumber, source: "client" });
    } else {
      setRepeatOrder(null);
    }
  }, [dupSku, intentionalReorder]);

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
        // Bundle is full — open the swap modal so the user explicitly
        // chooses which item to replace, instead of silently dropping one.
        const incoming = eligible.find((p) => p.id === id);
        if (incoming) {
          setSwapIncoming(incoming);
          setSwapOpen(true);
        }
        return prev;
      }
      return [...prev, id];
    });
  };

  const performSwap = (outgoingId: string) => {
    if (!swapIncoming) return;
    const incomingId = swapIncoming.id;
    setSelectedIds((prev) => {
      const withoutOut = prev.filter((x) => x !== outgoingId);
      if (withoutOut.includes(incomingId)) return withoutOut;
      return [...withoutOut, incomingId];
    });
    setHintId(Date.now());
    setSwapOpen(false);
    setSwapIncoming(null);
  };

  const handleCta = () => {
    if (!complete) {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHintId(Date.now());
      return;
    }
    // The new bundle may start with a different product, so transfer the
    // customer's explicit reorder choice to the SKU used by server dedupe.
    if (intentionalReorder && dupSku) markIntentionalRepeat(dupSku);
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

  // Urgency line under the main CTA — follows the currently selected product
  const ctaUrgency = useMemo(() => {
    if (selected.length > 0) return getUrgencySignal(selected[selected.length - 1].id).text;
    return getUrgencySignal(LANDING_SLUG).text;
  }, [selected]);

  const ctaLabel = n === 0
    ? "აირჩიეთ პროდუქტები ქვემოთ 👇"
    : complete
      ? `გადასვლა შეკვეთაზე — ${BUNDLE_PRICE}₾`
      : `დაამატეთ კიდევ ${BUNDLE_SIZE - n} პროდუქტი`;

  return (
    <div className="bnd-root min-h-screen overflow-x-clip">
      {/* Top announcement bars — collapse on scroll to free up product space */}
      <div
        className={`fixed left-0 right-0 z-50 bnd-top-bar ${topCollapsed ? "bnd-top-bar--collapsed" : ""}`}
        style={{ top: 0 }}
      >
        {/* COD trust announcement */}
        <div className="bg-[#0b0b12] text-white">
          <div className="h-8 flex items-center justify-center px-4">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.6px]">
              ⚡ შეუკვეთე ახლა და გადაიხადე კურიერთან!
            </span>
          </div>
        </div>
        <CountdownBar />
      </div>

      <main
        className="container max-w-lg mx-auto px-4"
          style={{
            paddingTop: topCollapsed
              ? "calc(16px + env(safe-area-inset-top))"
              : "calc(32px + 36px + env(safe-area-inset-top) + 20px)",
            paddingBottom: "calc(190px + env(safe-area-inset-bottom))",
            transition: "padding-top .28s cubic-bezier(.4,0,.2,1)",
          }}
      >
        <div className="bnd-slide-up text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[2.5px] text-[#6f6f85]">
            აირჩიე ნებისმიერი
          </p>
          <h1 className="bnd-display mt-3 leading-[1.05]">
            <span className="flex items-center justify-center gap-3">
              <span className="inline-flex flex-col items-center justify-center leading-none rounded-2xl px-5 py-3 text-white bg-[linear-gradient(135deg,#0b0b12,#2a2a3d)] shadow-[0_10px_26px_rgba(11,11,18,.25)]">
                <span className="text-[42px] font-black">5</span>
                <span className="text-[11px] font-extrabold uppercase tracking-[1.5px] not-italic">
                  ნივთი
                </span>
              </span>
              <span className="text-[30px] font-black text-[#6f6f85]">=</span>
              <span className="inline-flex flex-col items-center justify-center leading-none rounded-2xl px-5 py-3 text-white bg-[linear-gradient(135deg,#ff3b3b,#ff6b00)] shadow-[0_10px_26px_rgba(255,107,0,.35)]">
                <span className="text-[42px] font-black">{BUNDLE_PRICE}₾</span>
                <span className="text-[11px] font-extrabold uppercase tracking-[1.5px] not-italic">
                  სულ
                </span>
              </span>
            </span>
          </h1>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,161,90,.1)] border border-[rgba(0,161,90,.3)] px-3.5 py-1.5 text-[13px] font-extrabold text-[#007a45]">
            <Truck className="w-4 h-4" strokeWidth={3} />
            უფასო მიტანა
          </p>
          <p className="mt-2.5 text-[12px] font-semibold text-[#6f6f85]">
            გადაიხდი მიღებისას · 7 დღის გარანტია
          </p>
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
                <span className="text-[#00a15a]">{BUNDLE_PRICE}₾</span>
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

          {/* Sticky category filter — visual only, never affects selection */}
          {catChips.length > 0 && (
            <div
              className="sticky z-40 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-y border-[rgba(11,11,18,.07)]"
              style={{
                top: topCollapsed
                  ? "env(safe-area-inset-top)"
                  : "calc(32px + 36px + env(safe-area-inset-top))",
                transition: "top .28s cubic-bezier(.4,0,.2,1)",
              }}
            >
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {[{ id: "all", label: "ყველა" }, ...catChips].map((c) => {
                  const active = activeCat === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCat(c.id)}
                      className={`bnd-pill whitespace-nowrap shrink-0 text-[14px] font-extrabold px-4 py-2.5 transition-colors ${
                        active
                          ? "bg-[#0b0b12] text-white border-[#0b0b12]"
                          : "text-[#6f6f85]"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}



          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[rgba(11,11,18,.08)] overflow-hidden bg-white"
                >
                  <div className="aspect-square bg-[rgba(11,11,18,.06)] animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 rounded bg-[rgba(11,11,18,.08)] animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-[rgba(11,11,18,.08)] animate-pulse" />
                    <div className="h-9 rounded-xl bg-[rgba(11,11,18,.06)] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (

            <div key={`${hintId}-${activeCat}`} className="grid grid-cols-2 gap-3 bnd-cat-swap">

              {visible.map((p) => (
                <BundleTile
                  key={p.id}
                  product={p}
                  featured={p.id === featuredId}
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
                <span className="text-[12px] font-extrabold text-[#0b0b12] flex items-center gap-1.5">
                  {BUNDLE_PRICE}₾ · <span className="text-[#00a15a]">უფასო მიტანა</span>
                  <span className="text-[10px] font-extrabold text-[#6f6f85] bg-[#f2f2f7] rounded-full px-2 py-0.5">💵 კურიერთან</span>
                </span>
              </div>
              <div className="bnd-progress-track relative h-2 rounded-full bg-[#ececef] overflow-hidden">
                <div
                  className="bnd-progress-fill h-full rounded-full"
                  style={{ width: `${(n / BUNDLE_SIZE) * 100}%` }}
                />
                {n > 0 && (
                  <span
                    key={`burst-${n}`}
                    className="bnd-progress-burst"
                    style={{ left: `${(n / BUNDLE_SIZE) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          {n === BUNDLE_SIZE - 1 && (
            <p className="text-[12px] font-extrabold text-[#c2410c] text-center">
              დაამატე კიდევ 1 და გადაიხდი მხოლოდ {BUNDLE_PRICE}₾!
            </p>
          )}

          {repeatOrder ? (
            <RepeatOrderBlock
              orderNumber={repeatOrder.orderNumber}
              onReorder={() => {
                markIntentionalRepeat(repeatOrder.sku || dupSku);
                setIntentionalReorder(true);
                setRepeatOrder(null);
                // Fresh start: clear the previous bundle selection so the user
                // builds a new set instead of deselecting the old one.
                setSelectedIds([]);
                setActiveCat("all");
                gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              compact
            />
          ) : (
            <>
              <button
                onClick={handleCta}
                className={`w-full h-14 rounded-[16px] text-[15px] uppercase tracking-wide ${
                  complete
                    ? "bnd-btn-green bnd-cta-pulse"
                    : n === 0
                      ? "bnd-btn-grad opacity-95"
                      : "bnd-btn-grad"
                }`}
              >
                {ctaLabel}
              </button>

              <p className="text-[12px] text-[#0b0b12] text-center font-extrabold">
                💵 კურიერთან გადახდა
              </p>
            </>
          )}
        </div>
      </div>


      {/* Quick view bottom sheet — selection only, never touches the COD flow */}
      <BundleQuickViewSheet
        product={eligible.find((p) => p.id === quickViewId) || null}
        open={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
        selected={quickViewId ? selectedIds.includes(quickViewId) : false}
        selectedCount={n}
        bundleSize={BUNDLE_SIZE}
        bundlePrice={BUNDLE_PRICE}
        onToggle={() => quickViewId && toggle(quickViewId)}
      />

      {/* Swap modal — opened when the user tries to add a 6th item */}
      <BundleSwapModal
        incoming={swapIncoming}
        selected={selected}
        open={swapOpen}
        onClose={() => {
          setSwapOpen(false);
          setSwapIncoming(null);
        }}
        onSwap={performSwap}
      />

      {/* Existing COD flow — reused as-is */}
      <BundlePhoneSheet
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        products={selected}
        flatTotal={BUNDLE_PRICE}
        landingSlug={LANDING_SLUG}
        onOrderCreated={handleOrderCreated}
        onDuplicateBlocked={(num) => setRepeatOrder({ orderNumber: num, sku: dupSku })}
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

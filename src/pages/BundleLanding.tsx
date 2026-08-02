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
      className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-8 flex items-center justify-center gap-2 px-4">
        <Clock className="w-3.5 h-3.5" />
        <span className="text-[12px] font-bold">ფასი მოქმედებს:</span>
        <span className="font-mono text-[13px] font-extrabold tabular-nums">
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <CountdownBar />

      <main
        className="container max-w-lg mx-auto px-4"
        style={{
          paddingTop: "calc(32px + env(safe-area-inset-top) + 16px)",
          paddingBottom: "calc(180px + env(safe-area-inset-bottom))",
        }}
      >
        <p className="text-[11px] font-extrabold tracking-[0.2em] text-primary mb-1">BIGMART</p>
        <h1 className="text-[26px] leading-tight font-extrabold text-foreground">
          აირჩიე ნებისმიერი 5 პროდუქტი — სულ 39₾
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          ცალკე გაცილებით ძვირია. დღეს — მხოლოდ 39₾. + მიტანა უფასო.
        </p>

        {/* Trust strip */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { icon: Truck, label: "მიტანა უფასო" },
            { icon: HandCoins, label: "გადაიხდი მიღებისას" },
            { icon: ShieldCheck, label: "7 დღის გარანტია" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-2 text-center">
              <Icon className="w-4 h-4 mx-auto text-success mb-1" />
              <p className="text-[11px] font-bold text-foreground leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Live anchor */}
        <div className="mt-4 rounded-xl border-2 border-success/40 bg-success/5 p-3 text-center">
          {n > 0 ? (
            <p className="text-sm font-extrabold text-foreground">
              ცალკე <span className="line-through text-muted-foreground">{Math.round(anchorSum)}₾</span>{" "}
              → დღეს მხოლოდ <span className="text-success">39₾</span>
              {savings > 0 && <> · ზოგავ {savings}₾</>}
            </p>
          ) : (
            <p className="text-sm font-bold text-muted-foreground">
              აირჩიე 5 პროდუქტი და ნახე რამდენს ზოგავ
            </p>
          )}
        </div>

        {/* Grid */}
        <div ref={gridRef} className="mt-5 scroll-mt-20">
          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div
              key={hintId}
              className="grid grid-cols-2 gap-3 animate-fade-in"
            >
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
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="container max-w-lg mx-auto px-4 py-3 space-y-2">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[12px] font-extrabold ${complete ? "text-success" : "text-foreground"} ${
                    celebrate ? "animate-scale-in" : ""
                  }`}
                >
                  არჩეული: {n}/{BUNDLE_SIZE} {complete && "🎉"}
                </span>
                <span className="text-[12px] font-extrabold text-foreground">
                  39₾ · <span className="text-success">მიტანა უფასო</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{ width: `${(n / BUNDLE_SIZE) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {n === BUNDLE_SIZE - 1 && (
            <p className="text-[12px] font-bold text-primary text-center">
              დაამატე კიდევ 1 და გადაიხდი მხოლოდ 39₾!
            </p>
          )}
          {n > 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
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
                className="w-full h-14 rounded-xl bg-success text-success-foreground text-[15px] font-extrabold active:scale-[0.99] transition-transform"
              >
                {ctaLabel}
              </button>
              <p className="text-[11px] text-muted-foreground text-center">
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

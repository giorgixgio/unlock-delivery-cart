import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, User, ShoppingCart, Check, DollarSign, Shield, ChevronRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* ─── Trust badge detail modals ─── */
const TrustModal = ({ title, children, contentKey }: { title: string; children: React.ReactNode; contentKey: string }) => {
  const { t } = useLanguage();
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[60vh]">
        <SheetHeader>
          <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
        </SheetHeader>
        <div className="py-4 text-sm text-muted-foreground leading-relaxed space-y-2">
          {contentKey === "delivery" ? (
            <>
              <p>{t("free_delivery_desc_1")}</p>
              <p>{t("free_delivery_desc_2")}</p>
            </>
          ) : contentKey === "price" ? (
            <p>{t("price_guarantee_desc")}</p>
          ) : contentKey === "why" ? (
            <>
              <p>{t("why_us_desc_1")}</p>
              <p>{t("why_us_desc_2")}</p>
            </>
          ) : (
            <>
              <p>{t("secure_payment_desc_1")}</p>
              <p>{t("secure_payment_desc_2")}</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ─── Category drawer ─── */
const CategoryDrawer = ({ children }: { children: React.ReactNode }) => {
  const { t } = useLanguage();
  const cats = [
    t("cat_drawer_kitchen"),
    t("cat_drawer_home"),
    t("cat_drawer_beauty"),
    t("cat_drawer_tools"),
    t("cat_drawer_electronics"),
    t("cat_drawer_sport"),
    t("cat_drawer_kids"),
  ];
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-lg font-bold">{t("categories")}</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-1">
          {cats.map((c) => (
            <button key={c} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors">
              {c}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ─── Main component ─── */
const HomeHeaderTemuStyle = ({ headerVisible }: { headerVisible?: boolean }) => {
  const { itemCount } = useCart();
  const { openCart } = useCartOverlay();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [internalVisible, setInternalVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const scrollStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = headerVisible !== undefined ? headerVisible : internalVisible;

  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const handleScroll = useCallback(() => {
    if (headerVisible !== undefined) return;
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;

      if (y <= 10) {
        setInternalVisible(true);
      } else if (delta > 8) {
        setInternalVisible(false);
      } else if (delta < -8) {
        setInternalVisible(true);
      }

      lastScrollY.current = y;
      ticking.current = false;

      if (scrollStopTimer.current) clearTimeout(scrollStopTimer.current);
      scrollStopTimer.current = setTimeout(() => {
        setInternalVisible(true);
      }, 600);
    });
  }, [headerVisible]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollStopTimer.current) clearTimeout(scrollStopTimer.current);
    };
  }, [handleScroll]);

  const slideStyle: React.CSSProperties = {
    transform: visible ? "translateY(0)" : "translateY(-100%)",
    transition: reducedMotion ? "none" : "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
  };

  return (
    <>
      <div className="sticky top-0 z-40" style={slideStyle}>
        <header className="bg-card text-foreground shadow-sm border-b border-border">
          <div className="container max-w-2xl mx-auto px-3 flex items-center gap-2 h-14">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex-shrink-0 font-extrabold tracking-tight text-xl text-primary"
            >
              BigMart
            </button>

            <div className="flex-1 flex items-center gap-2 bg-background/10 rounded-full px-3 h-9 border border-background/20">
              <Search className="w-4 h-4 opacity-70 flex-shrink-0" />
              <input
                type="text"
                placeholder={t("search")}
                className="bg-transparent text-background placeholder:text-background/50 text-sm w-full outline-none"
                readOnly
              />
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <LanguageSwitcher />
              <CategoryDrawer>
                <button className="p-1.5 rounded-full hover:bg-background/10 transition-colors" aria-label={t("menu")}>
                  <Menu className="w-5 h-5" />
                </button>
              </CategoryDrawer>
              <button className="p-1.5 rounded-full hover:bg-background/10 transition-colors" aria-label={t("account")}>
                <User className="w-5 h-5" />
              </button>
              <button
                onClick={() => openCart()}
                className="p-1.5 rounded-full hover:bg-background/10 transition-colors relative"
                aria-label={t("cart")}
              >
                <ShoppingCart className="w-5 h-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* ── Trust badges (NOT sticky) ── */}
      <div className="bg-background border-b border-border">
        <div className="container max-w-2xl mx-auto px-3 py-2 flex gap-2">
          <TrustModal title={t("free_delivery")} contentKey="delivery">
            <button className="flex-1 flex items-center gap-2 bg-card rounded-xl px-3 py-2 border border-border shadow-sm hover:shadow-md transition-shadow text-left">
              <Check className="w-4 h-4 text-success flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-success leading-tight">{t("free_delivery")}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{t("for_you")}</p>
              </div>
            </button>
          </TrustModal>
          <TrustModal title={t("price_guarantee")} contentKey="price">
            <button className="flex-1 flex items-center gap-2 bg-card rounded-xl px-3 py-2 border border-border shadow-sm hover:shadow-md transition-shadow text-left">
              <DollarSign className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground leading-tight">{t("price_guarantee")}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{t("price_guarantee_days")}</p>
              </div>
            </button>
          </TrustModal>
        </div>
      </div>

      {/* ── Green bar (NOT sticky) ── */}
      <div className="bg-success">
        <div className="container max-w-2xl mx-auto px-3 py-2 flex items-center">
          <TrustModal title={t("why_us")} contentKey="why">
            <button className="flex-1 flex items-center gap-1.5 text-success-foreground text-left">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-bold">{t("why_us")}</span>
            </button>
          </TrustModal>
          <TrustModal title={t("secure_payment")} contentKey="secure">
            <button className="flex items-center gap-1 text-success-foreground ml-auto">
              <span className="text-xs font-bold">{t("secure_payment")}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </TrustModal>
        </div>
      </div>
    </>
  );
};

export default HomeHeaderTemuStyle;

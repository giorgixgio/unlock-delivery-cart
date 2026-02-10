import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, User, ShoppingCart, Check, DollarSign, Shield, ChevronRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* ─── Trust badge detail modals ─── */
const TrustModal = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Sheet>
    <SheetTrigger asChild>{children}</SheetTrigger>
    <SheetContent side="bottom" className="rounded-t-2xl max-h-[60vh]">
      <SheetHeader>
        <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
      </SheetHeader>
      <div className="py-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        {title.includes("მიტანა") || title.includes("shipping") ? (
          <>
            <p>უფასო მიტანა თბილისში 40₾-ზე მეტი შეკვეთისას.</p>
            <p>რეგიონებში მიტანის პირობები შეიძლება განსხვავდებოდეს.</p>
          </>
        ) : title.includes("ფასი") || title.includes("adjustment") ? (
          <>
            <p>თუ პროდუქტის ფასი შემცირდა შეძენიდან 30 დღეში, ჩვენ ავანაზღაურებთ სხვაობას.</p>
          </>
        ) : title.includes("რატომ") || title.includes("choose") ? (
          <>
            <p>ხარისხიანი პროდუქტები საუკეთესო ფასად.</p>
            <p>სწრაფი მიტანა და მომხმარებლის მხარდაჭერა.</p>
          </>
        ) : (
          <>
            <p>ყველა გადახდა დაშიფრულია და უსაფრთხოა.</p>
            <p>ჩვენ ვიღებთ ბარათებს, Apple Pay-ს და სხვა მეთოდებს.</p>
          </>
        )}
      </div>
    </SheetContent>
  </Sheet>
);

/* ─── Category drawer ─── */
const CategoryDrawer = ({ children }: { children: React.ReactNode }) => (
  <Sheet>
    <SheetTrigger asChild>{children}</SheetTrigger>
    <SheetContent side="left" className="w-72">
      <SheetHeader>
        <SheetTitle className="text-lg font-bold">კატეგორიები</SheetTitle>
      </SheetHeader>
      <div className="py-4 space-y-1">
        {["სამზარეულო", "სახლი & ინტერიერი", "სილამაზე", "ხელსაწყოები", "ელექტრონიკა", "სპორტი", "ბავშვები"].map((c) => (
          <button key={c} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors">
            {c}
          </button>
        ))}
      </div>
    </SheetContent>
  </Sheet>
);

/* ─── Main component ─── */
const HomeHeaderTemuStyle = () => {
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [isCompact, setIsCompact] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transition = reducedMotion ? "none" : "max-height 0.25s ease, opacity 0.2s ease";

  const handleScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      setIsCompact(y > 30);
      lastScrollY.current = y;
      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div className="sticky top-0 z-40">
      {/* ── Header bar (hides on scroll) ── */}
      <div
        style={{
          maxHeight: isCompact ? 0 : 56,
          opacity: isCompact ? 0 : 1,
          overflow: "hidden",
          transition,
        }}
      >
        <header className="bg-primary text-primary-foreground shadow-md">
          <div className="container max-w-2xl mx-auto px-3 flex items-center gap-2 h-14">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex-shrink-0 font-extrabold tracking-tight text-xl"
            >
              BigMart
            </button>

            <div className="flex-1 flex items-center gap-2 bg-primary-foreground/15 rounded-full px-3 h-9">
              <Search className="w-4 h-4 opacity-70 flex-shrink-0" />
              <input
                type="text"
                placeholder="ძიება..."
                className="bg-transparent text-primary-foreground placeholder:text-primary-foreground/60 text-sm w-full outline-none"
                readOnly
              />
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <CategoryDrawer>
                <button className="p-1.5 rounded-full hover:bg-primary-foreground/10 transition-colors" aria-label="მენიუ">
                  <Menu className="w-5 h-5" />
                </button>
              </CategoryDrawer>
              <button className="p-1.5 rounded-full hover:bg-primary-foreground/10 transition-colors" aria-label="ანგარიში">
                <User className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate("/cart")}
                className="p-1.5 rounded-full hover:bg-primary-foreground/10 transition-colors relative"
                aria-label="კალათა"
              >
                <ShoppingCart className="w-5 h-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-secondary text-secondary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* ── Trust pill cards (hide on scroll) ── */}
      <div
        style={{
          maxHeight: isCompact ? 0 : 60,
          opacity: isCompact ? 0 : 1,
          overflow: "hidden",
          transition,
        }}
      >
        <div className="bg-background border-b border-border">
          <div className="container max-w-2xl mx-auto px-3 py-2 flex gap-2">
            <TrustModal title="უფასო მიტანა">
              <button className="flex-1 flex items-center gap-2 bg-card rounded-xl px-3 py-2 border border-border shadow-sm hover:shadow-md transition-shadow text-left">
                <Check className="w-4 h-4 text-success flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-success leading-tight">უფასო მიტანა</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">სპეციალურად შენთვის</p>
                </div>
              </button>
            </TrustModal>
            <TrustModal title="ფასის გარანტია">
              <button className="flex-1 flex items-center gap-2 bg-card rounded-xl px-3 py-2 border border-border shadow-sm hover:shadow-md transition-shadow text-left">
                <DollarSign className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground leading-tight">ფასის გარანტია</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">30 დღის განმავლობაში</p>
                </div>
              </button>
            </TrustModal>
          </div>
        </div>
      </div>

      {/* ── Green bar (ALWAYS stays visible) ── */}
      <div className="bg-success">
        <div className="container max-w-2xl mx-auto px-3 py-2 flex items-center">
          <TrustModal title="რატომ ჩვენ?">
            <button className="flex-1 flex items-center gap-1.5 text-success-foreground text-left">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-bold">რატომ ჩვენ?</span>
            </button>
          </TrustModal>
          <TrustModal title="უსაფრთხო გადახდა">
            <button className="flex items-center gap-1 text-success-foreground ml-auto">
              <span className="text-xs font-bold">უსაფრთხო გადახდა</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </TrustModal>
        </div>
      </div>
    </div>
  );
};

export default HomeHeaderTemuStyle;

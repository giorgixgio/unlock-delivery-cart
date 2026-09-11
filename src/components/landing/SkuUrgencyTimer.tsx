import { useEffect, useRef, useState } from "react";
import { Clock3, Flame } from "lucide-react";

const TIMER_MINUTES = 29;
const STORAGE_KEY = "sku_002_urgency_end";

const getInitialSeconds = () => {
  const storedEnd = Number(sessionStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(storedEnd) && storedEnd > Date.now()) {
    return Math.ceil((storedEnd - Date.now()) / 1000);
  }

  const nextEnd = Date.now() + TIMER_MINUTES * 60 * 1000;
  sessionStorage.setItem(STORAGE_KEY, String(nextEnd));
  return TIMER_MINUTES * 60;
};

const SkuUrgencyTimer = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(getInitialSeconds);
  const [isVisible, setIsVisible] = useState(false);
  const [stockLeft, setStockLeft] = useState(17);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.45 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setStockLeft(4);
      return;
    }

    let current = 17;
    const interval = window.setInterval(() => {
      current -= 1;
      setStockLeft(current);
      if (current <= 4) window.clearInterval(interval);
    }, 80);

    return () => window.clearInterval(interval);
  }, [isVisible]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <section
      ref={sectionRef}
      aria-label="შეზღუდული შეთავაზება"
      className="overflow-hidden rounded-xl border border-primary/35 bg-dark-surface p-4 shadow-lg"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary-foreground/60">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            შეთავაზება დასრულდება
          </div>
          <div className="flex items-baseline gap-1 font-mono text-primary tabular-nums">
            <span className="text-3xl font-extrabold">{String(minutes).padStart(2, "0")}</span>
            <span className="animate-pulse text-xl font-bold">:</span>
            <span className="text-3xl font-extrabold">{String(seconds).padStart(2, "0")}</span>
          </div>
        </div>

        <div className="h-12 w-px bg-primary-foreground/15" aria-hidden="true" />

        <div className="text-right">
          <p className="mb-1 text-[10px] font-bold text-primary-foreground/55">მარაგის სტატუსი</p>
          <p className="flex items-center justify-end gap-1 text-xs font-extrabold text-destructive">
            <Flame className="h-4 w-4 animate-pulse" aria-hidden="true" />
            სწრაფად იყიდება
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-end justify-between gap-2">
          <p className="text-xs font-bold text-primary-foreground">მარაგი თითქმის ამოიწურა</p>
          <p className="shrink-0 text-sm font-extrabold text-primary">დარჩა {stockLeft} ცალი</p>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-primary-foreground/10 ring-1 ring-primary-foreground/10"
          role="progressbar"
          aria-label="გაყიდული მარაგი"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isVisible ? 92 : 12}
        >
          <div
            className={`relative h-full rounded-full bg-gradient-to-r from-primary via-secondary to-destructive transition-[width] ease-out motion-reduce:transition-none ${
              isVisible ? "w-[92%] duration-[1400ms]" : "w-[12%] duration-300"
            }`}
          >
            <span className="absolute inset-y-0 right-0 w-10 animate-pulse bg-primary-foreground/30" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default SkuUrgencyTimer;
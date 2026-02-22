import { useState, useEffect, memo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export const MicroBenefitRotating = memo(() => {
  const { t } = useLanguage();
  const benefits = [t("benefit_free_delivery"), t("benefit_1day_delivery")];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % benefits.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [benefits.length]);

  return (
    <div className="h-4 overflow-hidden relative mt-1.5">
      <div
        className="transition-transform duration-300 ease-out"
        style={{ transform: `translateY(-${index * 16}px)` }}
      >
        {benefits.map((b, i) => (
          <p key={i} className="text-[10px] font-semibold text-success h-4 flex items-center leading-none">
            {b}
          </p>
        ))}
      </div>
    </div>
  );
});
MicroBenefitRotating.displayName = "MicroBenefitRotating";

export const MicroBenefitStacked = memo(() => {
  const { t } = useLanguage();
  const benefits = [t("benefit_free_delivery"), t("benefit_1day_delivery")];
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {benefits.map((b, i) => (
        <p
          key={i}
          className="text-xs font-semibold text-success flex items-center animate-fade-in"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          {b}
        </p>
      ))}
    </div>
  );
});
MicroBenefitStacked.displayName = "MicroBenefitStacked";

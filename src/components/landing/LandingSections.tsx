import { LandingSection } from "@/hooks/useLandingConfig";
import { Check, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface LandingSectionsProps {
  sections: LandingSection[];
}

const LandingSections = ({ sections }: LandingSectionsProps) => {
  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        switch (section.type) {
          case "benefits":
            return <BenefitsSection key={i} items={section.items || []} />;
          case "video":
            return <VideoSection key={i} url={section.url || ""} />;
          case "faq":
            return <FAQSection key={i} items={(section.items as any) || []} />;
          default:
            return null;
        }
      })}
    </div>
  );
};

const BenefitsSection = ({ items }: { items: string[] }) => {
  const { t } = useLanguage();
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-2">
      <p className="text-sm font-bold text-foreground">{t("why_us_section")}</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Check className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-sm text-foreground">{item}</span>
        </div>
      ))}
    </div>
  );
};

const VideoSection = ({ url }: { url: string }) => {
  if (!url) return null;
  return (
    <div className="rounded-xl overflow-hidden aspect-video bg-muted">
      <iframe src={url} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen title="Product video" />
    </div>
  );
};

const FAQSection = ({ items }: { items: Array<{ q: string; a: string }> }) => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const { t } = useLanguage();

  if (!items || items.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-2">
      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <HelpCircle className="w-4 h-4 text-primary" />
        {t("faq_section")}
      </p>
      {items.map((item, i) => (
        <div key={i} className="border-b border-border last:border-0 pb-2 last:pb-0">
          <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between text-left py-1.5">
            <span className="text-sm font-semibold text-foreground">{item.q}</span>
            <span className="text-muted-foreground text-xs">{openIdx === i ? "−" : "+"}</span>
          </button>
          {openIdx === i && <p className="text-sm text-muted-foreground pb-1">{item.a}</p>}
        </div>
      ))}
    </div>
  );
};

export default LandingSections;

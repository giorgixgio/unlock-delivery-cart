import { useLanguage, Lang } from "@/contexts/LanguageContext";

const LanguageSwitcher = () => {
  const { lang, setLang } = useLanguage();

  return (
    <button
      onClick={() => setLang(lang === "ge" ? "ru" : "ge")}
      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border border-border bg-card hover:bg-accent transition-colors"
      aria-label="Switch language"
    >
      <span className={lang === "ge" ? "opacity-100" : "opacity-50"}>GE</span>
      <span className="text-muted-foreground">/</span>
      <span className={lang === "ru" ? "opacity-100" : "opacity-50"}>RU</span>
    </button>
  );
};

export default LanguageSwitcher;

import { Banknote, Shield, Truck } from "lucide-react";

interface LandingTrustRowProps {
  dark?: boolean;
}

const TRUST_ITEMS = [
  { icon: Banknote, text: "გადახდა კურიერთან", colorClass: "text-success" },
  { icon: Shield, text: "7 დღის გარანტია", colorClass: "text-primary" },
  { icon: Truck, text: "სწრაფი მიტანა", colorClass: "text-primary" },
];

const LandingTrustRow = ({ dark = false }: LandingTrustRowProps) => {
  return (
    <div className="space-y-3">
      {/* Nationwide delivery badge */}
      <div
        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border ${
          dark
            ? "bg-emerald-500/10 border-emerald-500/20"
            : "bg-success/5 border-success/20"
        }`}
      >
        <Truck className={`w-4 h-4 ${dark ? "text-emerald-400" : "text-success"}`} />
        <span
          className={`text-sm font-bold ${
            dark ? "text-emerald-300" : "text-success"
          }`}
        >
          მიწოდება ყველა ქალაქში და სოფელში
        </span>
      </div>

      {/* Trust icons row */}
      <div className="grid grid-cols-3 gap-2">
        {TRUST_ITEMS.map(({ icon: Icon, text, colorClass }, i) => (
          <div
            key={i}
            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center ${
              dark
                ? "bg-white/5 border-white/10"
                : "bg-card border-border"
            }`}
          >
            <Icon className={`w-5 h-5 ${dark ? (i === 0 ? "text-emerald-400" : "text-blue-400") : colorClass}`} />
            <span
              className={`text-[11px] font-bold leading-tight ${
                dark ? "text-white" : "text-foreground"
              }`}
            >
              {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingTrustRow;

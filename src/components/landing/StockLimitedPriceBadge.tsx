import { Flame, Truck } from "lucide-react";

const StockLimitedPriceBadge = () => (
  <div className="overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5" aria-label="მარაგით შეზღუდული ფასი">
    <div className="flex items-center gap-3 border-l-4 border-destructive px-3 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Flame className="h-6 w-6 motion-safe:animate-pulse" aria-hidden="true" />
      </div>
      <p className="min-w-0 text-base font-extrabold leading-relaxed text-foreground">
        ეს ფასი მოქმედებს <span className="text-destructive">მარაგის ამოწურვამდე!</span>
      </p>
    </div>
    <div className="flex items-center justify-center gap-2 border-t border-destructive/15 bg-card px-3 py-2 text-sm font-semibold text-muted-foreground">
      <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
      მიტანა — 5₾
    </div>
  </div>
);

export default StockLimitedPriceBadge;
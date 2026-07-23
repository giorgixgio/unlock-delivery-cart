import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  orderNumber: string;
  onReorder: () => void;
  compact?: boolean;
}

/** Green confirmation card shown in place of the buy CTA when a recent order exists. */
const RepeatOrderBlock = ({ orderNumber, onReorder, compact = false }: Props) => {
  return (
    <div className={compact ? "w-full" : "w-full space-y-2"}>
      <div className="rounded-xl border-2 border-success bg-success/10 p-3 text-success-foreground">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-left">
            <p className="text-sm font-extrabold text-success">
              ✅ შენი შეკვეთა #{orderNumber} უკვე მიღებულია
            </p>
            <p className="text-xs text-foreground/80 leading-snug">
              ოპერატორი დაგიკავშირდებათ დასადასტურებლად. გადაიხდი კურიერთან მიღებისას.
            </p>
            <p className="text-xs font-semibold text-foreground">
              არ საჭიროებს ხელახლა შეკვეთას.
            </p>
          </div>
        </div>
      </div>
      <Button
        onClick={onReorder}
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs font-medium text-muted-foreground border-border hover:bg-muted"
      >
        მინდა კიდევ ერთი შეკვეთა
      </Button>
    </div>
  );
};

export default RepeatOrderBlock;

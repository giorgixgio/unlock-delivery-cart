import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStore, type AdminStore } from "@/contexts/StoreContext";

const OPTIONS: Array<{ value: AdminStore; label: string }> = [
  { value: "ALL", label: "All Stores" },
  { value: "B", label: "TrendMart" },
  { value: "A", label: "BigMart" },
];

export default function ToggleStore({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { activeStore, setActiveStore, loading } = useStore();
  return (
    <div className={cn("inline-flex max-w-full items-center rounded-md border border-border bg-muted/40 p-1", className)} aria-label="Store filter">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={activeStore === option.value ? "default" : "ghost"}
          disabled={loading}
          onClick={() => setActiveStore(option.value)}
          className={cn("h-8 min-w-0 px-2 text-xs", !compact && "sm:px-3")}
        >
          {compact && option.value !== "ALL" ? option.value : option.label}
        </Button>
      ))}
    </div>
  );
}
import { useState } from "react";
import { X, Store, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, type AdminStore } from "@/contexts/StoreContext";

export default function DefaultStorePicker() {
  const { pickerOpen, dismissPicker, saveDefaultStore } = useStore();
  const [saving, setSaving] = useState<AdminStore | null>(null);
  if (!pickerOpen) return null;

  const choose = async (store: AdminStore) => {
    setSaving(store);
    await saveDefaultStore(store);
    setSaving(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-background" role="dialog" aria-modal="true" aria-labelledby="store-picker-title">
      <Button variant="ghost" size="icon" onClick={dismissPicker} className="absolute right-4 top-4 z-10" aria-label="Close without choosing">
        <X className="h-6 w-6" />
      </Button>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-5 py-16">
        <div className="text-center">
          <Store className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 id="store-picker-title" className="text-3xl font-extrabold text-foreground">Choose your default store</h1>
          <p className="mt-2 text-base text-muted-foreground">This opens first after sign-in. You can switch stores anytime.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Button onClick={() => choose("B")} disabled={saving !== null} variant="outline" className="h-auto min-h-48 flex-col gap-3 border-primary/40 bg-card p-8 text-foreground hover:bg-primary/5">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary text-2xl font-black text-primary-foreground">T</div>
            <span className="text-2xl font-extrabold">TrendMart</span>
            <span className="text-sm font-medium text-muted-foreground">Warehouse B</span>
            {saving === "B" && <Check className="h-5 w-5 animate-pulse" />}
          </Button>
          <Button onClick={() => choose("A")} disabled={saving !== null} variant="outline" className="h-auto min-h-48 flex-col gap-3 border-blue-500/40 bg-yellow-300 p-8 text-blue-900 hover:bg-yellow-200">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-700 text-2xl font-black text-yellow-300">B</div>
            <span className="text-2xl font-extrabold">BigMart</span>
            <span className="text-sm font-medium text-blue-900/70">Warehouse A</span>
            {saving === "A" && <Check className="h-5 w-5 animate-pulse" />}
          </Button>
        </div>
        <Button onClick={() => choose("ALL")} disabled={saving !== null} variant="ghost" className="mx-auto min-h-12 px-8 text-base">
          View All Stores
        </Button>
      </div>
    </div>
  );
}
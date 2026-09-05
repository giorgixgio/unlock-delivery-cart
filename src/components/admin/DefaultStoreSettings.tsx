import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useStore, type AdminStore } from "@/contexts/StoreContext";
import { toast } from "sonner";

export default function DefaultStoreSettings() {
  const { defaultStore, saveDefaultStore } = useStore();
  const [value, setValue] = useState<AdminStore>(defaultStore ?? "ALL");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await saveDefaultStore(value);
    setSaving(false);
    ok ? toast.success("Default store saved") : toast.error("Could not save default store");
  };
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-bold">Default store</h3>
        <p className="mt-1 text-xs text-muted-foreground">The store selected automatically when you sign in.</p>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="default-store" className="text-xs">Store</Label>
          <select id="default-store" value={value} onChange={(e) => setValue(e.target.value as AdminStore)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-base">
            <option value="ALL">All Stores</option>
            <option value="B">TrendMart — Warehouse B</option>
            <option value="A">BigMart — Warehouse A</option>
          </select>
        </div>
        <Button onClick={save} disabled={saving} className="h-10">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
        </Button>
      </div>
    </div>
  );
}
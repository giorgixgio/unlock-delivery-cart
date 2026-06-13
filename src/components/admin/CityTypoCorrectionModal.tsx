import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, X, AlertTriangle, Check } from "lucide-react";
import { KNOWN_GEORGIAN_CITIES } from "@/lib/georgianCities";

export interface TypoRow {
  order_id: string;
  public_order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  original_city: string;
  suggested_city: string;
}

type Action = "accept" | "ignore" | "custom";

interface RowState {
  action: Action;
  customValue: string;
}

interface Props {
  open: boolean;
  rows: TypoRow[];
  onClose: () => void;
  /** Called when user wants to proceed. Receives a map of order_id -> corrected city (only for orders the user chose to correct). */
  onProceed: (corrections: Record<string, string>) => Promise<void> | void;
}

const CityTypoCorrectionModal = ({ open, rows, onClose, onProceed }: Props) => {
  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const r of rows) init[r.order_id] = { action: "accept", customValue: r.suggested_city };
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init when rows change while modal opens
  if (open && Object.keys(state).length !== rows.length) {
    const init: Record<string, RowState> = {};
    for (const r of rows) init[r.order_id] = state[r.order_id] || { action: "accept", customValue: r.suggested_city };
    setState(init);
  }

  if (!open) return null;

  const setRow = (id: string, patch: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const acceptAll = () =>
    setState(Object.fromEntries(rows.map((r) => [r.order_id, { action: "accept" as Action, customValue: r.suggested_city }])));

  const buildCorrections = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const r of rows) {
      const s = state[r.order_id];
      if (!s || s.action === "ignore") continue;
      const value = s.action === "accept" ? r.suggested_city : s.customValue.trim();
      if (!value || value === r.original_city) continue;
      out[r.order_id] = value;
    }
    return out;
  };

  const persist = async (corrections: Record<string, string>) => {
    const entries = Object.entries(corrections);
    for (const [id, city] of entries) {
      const { error: e } = await (supabase.from("orders") as any)
        .update({ normalized_city: city })
        .eq("id", id);
      if (e) throw e;
    }
  };

  const handleSaveAndExport = async () => {
    setError(null);
    setSaving(true);
    try {
      const corrections = buildCorrections();
      if (Object.keys(corrections).length > 0) await persist(corrections);
      await onProceed(corrections);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to save corrections");
      setSaving(false);
    }
  };

  const handleExportWithoutSaving = async () => {
    setSaving(true);
    try {
      await onProceed({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-lg border border-border w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">Possible city typos ({rows.length})</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded" disabled={saving}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
          <span>Review each city below. We only show <b>possible</b> typos — nothing is auto-fixed.</span>
          <Button size="sm" variant="outline" onClick={acceptAll} disabled={saving} className="ml-auto">
            <Check className="w-3 h-3 mr-1" /> Accept all suggestions
          </Button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="p-2 font-semibold">Order #</th>
                <th className="p-2 font-semibold">Customer</th>
                <th className="p-2 font-semibold">Phone</th>
                <th className="p-2 font-semibold">Current</th>
                <th className="p-2 font-semibold">Suggested</th>
                <th className="p-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = state[r.order_id];
                if (!s) return null;
                return (
                  <tr key={r.order_id} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">{r.public_order_number || r.order_id.slice(0, 8)}</td>
                    <td className="p-2">{r.customer_name || "—"}</td>
                    <td className="p-2 text-xs">{r.customer_phone || "—"}</td>
                    <td className="p-2 text-amber-600">{r.original_city}</td>
                    <td className="p-2 text-emerald-700 font-semibold">{r.suggested_city}</td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            checked={s.action === "accept"}
                            onChange={() => setRow(r.order_id, { action: "accept" })}
                          />
                          Accept
                        </label>
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            checked={s.action === "custom"}
                            onChange={() => setRow(r.order_id, { action: "custom" })}
                          />
                          Edit:
                          <input
                            list="known-cities"
                            value={s.customValue}
                            onChange={(e) => setRow(r.order_id, { action: "custom", customValue: e.target.value })}
                            className="border border-border rounded px-1 py-0.5 text-xs w-32"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            checked={s.action === "ignore"}
                            onChange={() => setRow(r.order_id, { action: "ignore" })}
                          />
                          Keep original
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="known-cities">
            {KNOWN_GEORGIAN_CITIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm border-t border-border">{error}</div>
        )}

        <div className="p-4 border-t border-border flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={handleExportWithoutSaving} disabled={saving}>
            Export without changes
          </Button>
          <Button onClick={handleSaveAndExport} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save corrections & export
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CityTypoCorrectionModal;

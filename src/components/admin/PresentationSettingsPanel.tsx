import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface PresentationRow {
  id: string;
  target_email: string;
  is_active: boolean;
  revenue_multiplier: number;
}

/**
 * Super-admin only. Visible inside Admin Settings when the signed-in
 * user is info@bigmart.ge. Lets the operator toggle "presentation mode"
 * for any admin email and configure how much of real revenue should be
 * displayed (0–100%).
 */
const PresentationSettingsPanel = () => {
  const [rows, setRows] = useState<PresentationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Add-new form
  const [newEmail, setNewEmail] = useState("");
  const [newPct, setNewPct] = useState("40");
  const [adding, setAdding] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("presentation_settings")
      .select("*")
      .order("created_at");
    setRows((data as PresentationRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const updateRow = async (id: string, patch: Partial<PresentationRow>) => {
    setSaving(id);
    const { error } = await supabase
      .from("presentation_settings")
      .update(patch)
      .eq("id", id);
    setSaving(null);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("Saved");
    await fetchRows();
  };

  const addRow = async () => {
    const email = newEmail.trim().toLowerCase();
    const pct = parseFloat(newPct);
    if (!email) {
      toast.error("Enter an email");
      return;
    }
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Percentage must be between 0 and 100");
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("presentation_settings")
      .upsert(
        {
          target_email: email,
          is_active: true,
          revenue_multiplier: pct / 100,
        },
        { onConflict: "target_email" },
      );
    setAdding(false);
    if (error) {
      toast.error("Add failed: " + error.message);
      return;
    }
    setNewEmail("");
    setNewPct("40");
    toast.success("Added");
    await fetchRows();
  };

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-4">
      <div>
        <h3 className="font-bold text-sm">Presentation Mode</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Scale displayed revenue and orders for specific admin accounts.
          Real data is never modified — only what they see is filtered.
        </p>
      </div>

      {/* Add new */}
      <div className="flex gap-3 items-end pb-3 border-b border-border">
        <div className="flex-1">
          <Label className="text-xs">Email</Label>
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="h-10"
          />
        </div>
        <div className="w-24">
          <Label className="text-xs">Show %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={newPct}
            onChange={(e) => setNewPct(e.target.value)}
            className="h-10"
          />
        </div>
        <Button onClick={addRow} disabled={adding} className="h-10">
          {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          Add
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No presentation accounts configured.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const pct = Math.round(r.revenue_multiplier * 100);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-background"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{r.target_email}</div>
                  <div className="text-xs text-muted-foreground">
                    Showing {pct}% of real revenue
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={pct}
                    onBlur={(e) => {
                      const next = parseFloat(e.target.value);
                      if (Number.isNaN(next) || next < 0 || next > 100) return;
                      const nextMult = next / 100;
                      if (Math.abs(nextMult - r.revenue_multiplier) < 0.001) return;
                      void updateRow(r.id, { revenue_multiplier: nextMult });
                    }}
                    className="h-9 w-16 text-center"
                    disabled={saving === r.id}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => updateRow(r.id, { is_active: v })}
                    disabled={saving === r.id}
                  />
                  <span className="text-xs font-medium w-10">
                    {r.is_active ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PresentationSettingsPanel;

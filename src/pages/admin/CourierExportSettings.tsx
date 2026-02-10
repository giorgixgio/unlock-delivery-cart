import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FIXED_COLUMN_LABELS: Record<string, string> = {
  D: "დამატებით ლოკაცია (Additional Location)",
  F: "წონა (Weight)",
  J: "დამატებიტი სერვისი (Additional Service)",
  L: "შიპინგს იხდის მიმღები (Recipient Pays)",
  M: "ტერმინალი (Terminal)",
  N: "SPO",
  P: "გამგზავნის სახელი (Sender Name)",
  Q: "გამგზავნის მისამართი (Sender Address)",
  R: "გამგზავნის ქალაქი (Sender City)",
  S: "გამგზავნის ტელეფონი (Sender Phone)",
  T: "გამგზავნი კომპანია (Sender Company)",
  U: "მომსახურების დონე (Service Level)",
  V: "თიფი (Type)",
};

interface TemplateSettings {
  id: string;
  name: string;
  fixed_columns_map: Record<string, string>;
  include_headers: boolean;
}

const CourierExportSettings = () => {
  const [settings, setSettings] = useState<TemplateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("courier_export_settings")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (data) {
        setSettings({
          id: data.id,
          name: data.name,
          fixed_columns_map: (data.fixed_columns_map || {}) as Record<string, string>,
          include_headers: data.include_headers,
        });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const updateFixed = (key: string, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      fixed_columns_map: { ...settings.fixed_columns_map, [key]: value },
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    await supabase
      .from("courier_export_settings")
      .update({
        name: settings.name,
        fixed_columns_map: settings.fixed_columns_map,
        include_headers: settings.include_headers,
      })
      .eq("id", settings.id);
    toast({ title: "Template saved" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return <p className="p-6 text-muted-foreground">No export template found.</p>;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-extrabold text-foreground">Courier Export Template</h1>

      <div className="bg-card rounded-lg p-4 border border-border space-y-4">
        <div>
          <Label className="text-xs">Template Name</Label>
          <Input
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            className="h-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.include_headers}
            onChange={(e) => setSettings({ ...settings, include_headers: e.target.checked })}
            className="rounded"
          />
          <Label className="text-sm">Include column headers in export</Label>
        </div>
      </div>

      <div className="bg-card rounded-lg p-4 border border-border space-y-4">
        <h3 className="font-bold text-sm">Fixed Column Values</h3>
        <p className="text-xs text-muted-foreground">
          These values are the same for every row in the export. Dynamic columns (A, B, C, E, G, H, I, K, O) are auto-filled from order data.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(FIXED_COLUMN_LABELS).map(([col, label]) => (
            <div key={col}>
              <Label className="text-xs">
                <span className="font-bold text-primary">Col {col}</span> — {label}
              </Label>
              <Input
                value={settings.fixed_columns_map[col] || ""}
                onChange={(e) => updateFixed(col, e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 border border-border">
        <h3 className="font-bold text-sm mb-2">Dynamic Columns (auto-filled)</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="font-bold">A</span> — Customer Name</p>
          <p><span className="font-bold">B</span> — Address (normalized)</p>
          <p><span className="font-bold">C</span> — City (normalized)</p>
          <p><span className="font-bold">E</span> — Phone</p>
          <p><span className="font-bold">G</span> — Item quantities (comma-separated)</p>
          <p><span className="font-bold">H</span> — Order ID (internal UUID)</p>
          <p><span className="font-bold">I</span> — SKUs (comma-separated)</p>
          <p><span className="font-bold">K</span> — Total price</p>
          <p><span className="font-bold">O</span> — Notes (customer + risk flags)</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Template"}
      </Button>
    </div>
  );
};

export default CourierExportSettings;

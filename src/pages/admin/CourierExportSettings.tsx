import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ONWAY_FIXED_LABELS: Record<string, string> = {
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

const TRACKINGS_FIXED_LABELS: Record<string, string> = {
  trackings_shipping_method: "გაგზავნის მეთოდი (Shipping Method)",
  trackings_sender_city: "გამგზავნის ქალაქი (Sender City)",
  trackings_sender_address: "გამგზავნის მისამართი (Sender Address)",
  trackings_sender_phone: "გამგზავნის ტელეფონი (Sender Phone)",
  trackings_delivery_method: "მიწოდების მეთოდი (Delivery Method)",
  trackings_weight: "წონა (Weight)",
  trackings_cod_commission_payer: "COD საკომისიო გადამხდელი (COD Commission Payer)",
  trackings_return_method: "უკან დაბრუნება (Return Method)",
  trackings_payer: "გადამხდელი (Payer)",
  trackings_payment_type: "ანგარიშწორების ტიპი (Payment Type)",
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

      {/* ONWAY Fixed Columns */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-4">
        <h3 className="font-bold text-sm">🚚 ONWAY — Fixed Column Values</h3>
        <p className="text-xs text-muted-foreground">
          These values are the same for every ONWAY export row. Dynamic columns (A, B, C, E, G, H, I, K, O) are auto-filled from order data.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(ONWAY_FIXED_LABELS).map(([col, label]) => (
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

      {/* TRACKINGS.GE Fixed Columns */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-4">
        <h3 className="font-bold text-sm">📦 TRACKINGS.GE — Fixed Column Values</h3>
        <p className="text-xs text-muted-foreground">
          These values are the same for every TRACKINGS.GE export row. Dynamic columns (recipient name, phone, city, address, qty, COD, notes, order#, price, description) are auto-filled.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(TRACKINGS_FIXED_LABELS).map(([col, label]) => (
            <div key={col}>
              <Label className="text-xs">
                <span className="font-bold text-primary">{col.replace("trackings_", "").replace(/_/g, " ")}</span> — {label}
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

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Template"}
      </Button>
    </div>
  );
};

export default CourierExportSettings;

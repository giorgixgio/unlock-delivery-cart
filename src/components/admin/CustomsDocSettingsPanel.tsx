import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { CUSTOMS_SETTING_KEYS, CUSTOMS_DEFAULTS, type CustomsDocSettings } from "@/lib/customsDocSettings";

const FIELDS: { key: keyof CustomsDocSettings; label: string; placeholder?: string }[] = [
  { key: "sellerName", label: "Seller Company Name" },
  { key: "sellerAddress", label: "Seller Address" },
  { key: "receiverName", label: "Receiver Company Name" },
  { key: "receiverCode", label: "Receiver Code (tax / registration no.)" },
  { key: "receiverAddress", label: "Receiver Address" },
  { key: "incoterms", label: "Incoterms / Условия поставки", placeholder: "FCA -Guangzhou" },
  { key: "invoicePrefix", label: "Invoice Number Prefix", placeholder: "G888" },
];

const CustomsDocSettingsPanel = () => {
  const [values, setValues] = useState<CustomsDocSettings>(CUSTOMS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", Object.values(CUSTOMS_SETTING_KEYS))
      .then(({ data }) => {
        const next = { ...CUSTOMS_DEFAULTS };
        for (const row of data || []) {
          const field = (Object.keys(CUSTOMS_SETTING_KEYS) as (keyof CustomsDocSettings)[]).find(
            (k) => CUSTOMS_SETTING_KEYS[k] === row.key,
          );
          if (field) next[field] = row.value ?? "";
        }
        setValues(next);
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = (Object.keys(CUSTOMS_SETTING_KEYS) as (keyof CustomsDocSettings)[]).map((k) => ({
      key: CUSTOMS_SETTING_KEYS[k],
      value: values[k] ?? "",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Customs document settings saved");
  };

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <div>
        <h3 className="font-bold text-sm">Customs Document Settings</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Used by the wholesale packing list / invoice generator.
        </p>
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                <Input
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </>
      )}
    </div>
  );
};

export default CustomsDocSettingsPanel;

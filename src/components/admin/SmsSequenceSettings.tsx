import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  SEQ_TYPES, parseSmsSettings, renderSms, smsSegments, isGsm7, type SeqType, type SmsSettings,
} from "../../../supabase/functions/_shared/smsTemplates";

const LABELS: Record<SeqType, string> = {
  lead_created: "1. Lead created (instant)",
  call_no_answer: "2. Call — no answer (max 2)",
  order_confirmed: "3. Order confirmed (+5 min)",
  out_for_delivery: "5. Out for delivery (Onway)",
  delivery_failed: "6. Delivery failed (Onway, max 2)",
};

async function saveSetting(key: string, value: string) {
  const { error } = await supabase.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export default function SmsSequenceSettings() {
  const [s, setS] = useState<SmsSettings | null>(null);
  const [pickup, setPickup] = useState({ BIGMART: "", TRENDMART: "" });
  const [saving, setSaving] = useState(false);
  const [sampleProduct, setSampleProduct] = useState("Mini WiFi kamera");

  useEffect(() => {
    supabase.from("site_settings").select("key, value").in("key", ["sms_sequence", "onway_pickup_phones"]).then(({ data }) => {
      const get = (k: string) => data?.find((r) => r.key === k)?.value;
      setS(parseSmsSettings(get("sms_sequence")));
      try { const p = JSON.parse(get("onway_pickup_phones") || "{}"); setPickup({ BIGMART: p.BIGMART || "", TRENDMART: p.TRENDMART || "" }); } catch { /* keep empty */ }
    });
  }, []);

  if (!s) return <div className="bg-card rounded-lg p-4 border border-border"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const badPhone = (v: string) => { const d = v.replace(/\D/g, "").replace(/^995/, ""); return !/^\d{9}$/.test(d) || d === "555555555"; };
  const save = async () => {
    setSaving(true);
    try {
      await saveSetting("sms_sequence", JSON.stringify(s));
      await saveSetting("onway_pickup_phones", JSON.stringify(pickup));
      toast.success("SMS settings saved");
    } catch { toast.error("Could not save SMS settings"); }
    setSaving(false);
  };
  const sample = { n: "122579", store: "TRENDMART" as const, num1: s.num1 || "5XXXXXXXX", num2: s.num2 || "5XXXXXXXX", total: 34, when: "xval" };

  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-4">
      <h3 className="font-bold text-sm">SMS & courier</h3>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Operator number 1</Label><Input value={s.num1} onChange={(e) => setS({ ...s, num1: e.target.value.trim() })} placeholder="5XXXXXXXX" className="!text-base" /></div>
        <div><Label className="text-xs">Operator number 2</Label><Input value={s.num2} onChange={(e) => setS({ ...s, num2: e.target.value.trim() })} placeholder="5XXXXXXXX" className="!text-base" /></div>
        {(["BIGMART", "TRENDMART"] as const).map((k) => (
          <div key={k}>
            <Label className="text-xs">Onway pickup phone — {k}</Label>
            <Input value={pickup[k]} onChange={(e) => setPickup({ ...pickup, [k]: e.target.value.trim() })} placeholder="5XXXXXXXX" className="!text-base" aria-invalid={badPhone(pickup[k])} />
            {badPhone(pickup[k]) && <p className="text-xs text-destructive mt-1">Required for shipments; 555555555 is not allowed.</p>}
          </div>
        ))}
      </div>
      <div><Label className="text-xs">Sample product name for preview</Label><Input value={sampleProduct} maxLength={20} onChange={(e) => setSampleProduct(e.target.value)} className="!text-base" /></div>
      <div className="space-y-3">
        {SEQ_TYPES.map((t) => {
          const { text } = renderSms(t, { ...sample, product: sampleProduct || null });
          const seg = smsSegments(text);
          return (
            <div key={t} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{LABELS[t]}</span>
                <Switch checked={s.enabled[t]} onCheckedChange={(v) => setS({ ...s, enabled: { ...s.enabled, [t]: v } })} aria-label={`Enable ${t}`} />
              </div>
              <p className="text-xs font-mono bg-muted rounded p-2 break-words">{text}</p>
              <p className={`text-xs ${seg > 1 || !isGsm7(text) ? "text-destructive" : "text-muted-foreground"}`}>
                {text.length} chars · {seg} SMS{isGsm7(text) ? "" : " · non-GSM characters"}
              </p>
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save</Button>
    </div>
  );
}

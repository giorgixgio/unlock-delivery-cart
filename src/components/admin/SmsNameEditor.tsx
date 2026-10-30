import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toGsm7 } from "../../../supabase/functions/_shared/smsTemplates";

let cache: Promise<Record<string, string>> | null = null;
function loadSmsNames() {
  cache ??= (async () => {
    const out: Record<string, string> = {};
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("products").select("id, sms_name").not("sms_name", "is", null).range(from, from + 999);
      (data || []).forEach((p) => { if (p.sms_name) out[p.id] = p.sms_name; });
      if (!data || data.length < 1000) break;
    }
    return out;
  })();
  return cache;
}

/** Short Latin product name used in customer SMS (max 20 characters). */
export default function SmsNameEditor({ productId }: { productId: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => { loadSmsNames().then((m) => { setValue(m[productId] || ""); setSaved(m[productId] || ""); }); }, [productId]);
  const save = async () => {
    const clean = toGsm7(value.trim()).text.slice(0, 20);
    if (clean === saved) { setValue(clean); return; }
    const { error } = await supabase.from("products").update({ sms_name: clean || null }).eq("id", productId);
    if (error) { toast.error("SMS name not saved"); return; }
    setValue(clean); setSaved(clean);
    loadSmsNames().then((m) => { if (clean) m[productId] = clean; else delete m[productId]; });
    toast.success("SMS name saved");
  };
  return (
    <input
      aria-label="SMS name"
      value={value}
      maxLength={20}
      placeholder="SMS name (Latin)"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="mt-1 w-[180px] h-7 rounded border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground"
    />
  );
}

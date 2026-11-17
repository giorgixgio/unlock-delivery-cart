import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cleanPhoneInput } from "@/lib/phoneValidation";
import { normalizeScratchPhone, saveScratchPhone, noteTesterPhone } from "@/lib/scratchLeads";

export const formatGePhone = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`.trim();

/** One-tap orders: shows the saved phone with a small "change" link that updates the fresh order. */
export default function ScratchPhoneLine({ orderId, phone, onChange }: { orderId: string; phone: string; onChange: (p: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = normalizeScratchPhone(val);
  const save = async () => {
    if (!valid) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("orders").update({ customer_phone: valid, customer_name: valid } as any).eq("id", orderId);
    setBusy(false);
    if (error) { setErr("ვერ შეიცვალა, სცადე თავიდან"); return; }
    saveScratchPhone(valid); noteTesterPhone(valid); onChange(valid); setEdit(false);
  };
  if (!edit) return (
    <p className="mt-3 flex items-center gap-3 text-base font-bold text-foreground">
      <span>📞 {formatGePhone(phone)}</span>
      <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => { setVal(phone); setEdit(true); }}>შეცვლა</button>
    </p>
  );
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="h-12 px-3 grid place-items-center rounded-lg border border-border bg-muted text-sm font-semibold">+995</span>
      <Input type="tel" inputMode="numeric" maxLength={9} value={val} onChange={(e) => setVal(cleanPhoneInput(e.target.value))} className="h-12 text-base" aria-label="ტელეფონი" />
      <Button type="button" onClick={save} disabled={!valid || busy} className="h-12">შენახვა</Button>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

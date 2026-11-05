import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GSM = new Set([..."@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€"]);
const SAMPLE_LINK = "https://trendmart.ge/t/Ab3x9K";
const preview = (t: string, days: number) => t.replaceAll("{link}", SAMPLE_LINK).replaceAll("{store}", "TRENDMART").replaceAll("{days}", String(days)).replaceAll("{order}", "125712");

/** Support ticket SMS and timing settings. Only admins can save (database rule). */
export default function SupportSettingsCard() {
  const { toast } = useToast();
  const [s, setS] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { (supabase as any).from("support_ticket_settings").select("*").eq("id", 1).maybeSingle().then(({ data }: any) => setS(data)); }, []);
  if (!s) return null;
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });
  const save = async () => {
    const bad = ["sms_ack", "sms_followup", "sms_update"].find((k) => { const p = preview(s[k], s.sla_working_days); return p.length > 160 || ![...p].every((c) => GSM.has(c)); });
    if (bad) { toast({ title: "Text must be Latin letters and ≤160 characters", description: bad, variant: "destructive" }); return; }
    const { id, updated_at, ...rest } = s;
    const { data: u } = await supabase.auth.getUser();
    const { error, data } = await (supabase as any).from("support_ticket_settings").update({ ...rest, updated_at: new Date().toISOString(), updated_by: u.user?.email ?? null }).eq("id", 1).select("id");
    toast(error || !data?.length ? { title: "Not saved (admins only)", variant: "destructive" } : { title: "Saved" });
  };
  const num = (k: string, label: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">{label}<Input type="number" value={s[k]} onChange={(e) => set(k, Number(e.target.value))} className="h-9 w-24 text-base" /></label>
  );
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <button type="button" className="text-sm font-semibold" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} Issue SMS settings</button>
      {open && (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Send customer SMS for issues</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {num("sla_working_days", "Promise: call within (working days)")}
            {num("ack_delay_min", "First text after (minutes)")}
            {num("followup_working_days", "Follow-up after (working days, 0 = off)")}
            {num("min_gap_min", "Min gap between texts (minutes)")}
            {num("max_auto_sms", "Max automatic texts")}
            <label className="flex items-center justify-between gap-2 text-sm">Quiet hours
              <span className="flex gap-1"><Input value={s.quiet_from} onChange={(e) => set("quiet_from", e.target.value)} className="h-9 w-20 text-base" /><Input value={s.quiet_to} onChange={(e) => set("quiet_to", e.target.value)} className="h-9 w-20 text-base" /></span>
            </label>
          </div>
          {([["sms_ack", "Received"], ["sms_followup", "Follow-up"], ["sms_update", "Update"]] as const).map(([k, l]) => {
            const p = preview(s[k], s.sla_working_days);
            return (
              <div key={k} className="space-y-1">
                <div className="text-sm font-medium">{l} <span className={`text-xs ${p.length > 160 ? "text-destructive" : "text-muted-foreground"}`}>{p.length}/160</span></div>
                <textarea rows={2} value={s[k]} onChange={(e) => set(k, e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-base" />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Placeholders: {"{link} {store} {days} {order}"}. Working days: Mon–Fri, Tbilisi time.</p>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}

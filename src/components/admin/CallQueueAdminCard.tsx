import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Headphones } from "lucide-react";
import {
  fetchCallQueueSettings, saveCallQueueSettings, getCallQueueTestMode, setCallQueueTestMode,
  type CallQueueSettings,
} from "@/lib/callQueueService";

/** Admin-only rollout card for Call Queue (test). Renders nothing for other roles. */
export default function CallQueueAdminCard() {
  const { role, user } = useAdminAuth();
  const { toast } = useToast();
  const [testMode, setTestMode] = useState(getCallQueueTestMode());
  const [settings, setSettings] = useState<CallQueueSettings | null>(null);
  const [operators, setOperators] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "admin") return;
    fetchCallQueueSettings().then(setSettings).catch(() => {});
    supabase.from("admin_users").select("email, role, is_active").eq("role", "operator").eq("is_active", true)
      .then(({ data }) => setOperators(((data as any[]) || []).map((r) => r.email).filter(Boolean).sort()));
  }, [role]);

  if (role !== "admin") return null;

  const toggleTest = (on: boolean) => { setCallQueueTestMode(on); setTestMode(on); };

  const toggleOperator = async (email: string, on: boolean) => {
    if (!settings) return;
    setBusy(email);
    const lower = email.toLowerCase();
    const list = settings.enabled_operators.filter((e) => e.toLowerCase() !== lower);
    if (on) list.push(email);
    const ok = await saveCallQueueSettings({ enabled_operators: list }, user?.email || "admin");
    setBusy(null);
    if (!ok) { toast({ title: "Couldn't save", variant: "destructive" }); return; }
    setSettings({ ...settings, enabled_operators: list });
    setCallQueueTestMode(getCallQueueTestMode()); // notify listeners to refetch
  };

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground p-3 sm:p-4 max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4" />
          <div>
            <div className="text-sm font-bold">Call Queue (test)</div>
            <div className="text-xs text-muted-foreground">Off by default. Only affects people switched on here.</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          Me
          <Switch checked={testMode} onCheckedChange={toggleTest} />
        </label>
      </div>
      {testMode && (
        <Link to="/admin/call-queue" className="mt-2 inline-block text-xs font-bold text-primary underline">
          Open Call Queue →
        </Link>
      )}
      <div className="mt-3 border-t border-border pt-2 space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">Operators</div>
        {operators.length === 0 && <div className="text-xs text-muted-foreground">No active operators.</div>}
        {operators.map((email) => {
          const on = !!settings?.enabled_operators.some((e) => e.toLowerCase() === email.toLowerCase());
          return (
            <div key={email} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{email}</span>
              <Switch checked={on} disabled={!settings || busy === email} onCheckedChange={(v) => toggleOperator(email, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

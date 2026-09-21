import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCourierAlerts, type AlertItem } from "@/hooks/useCourierAlerts";

export default function AdminCourierAlerts() {
  const { alerts, settings, isLoading } = useCourierAlerts();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const byRule = useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    for (const a of alerts) {
      const arr = m.get(a.rule_key) || []; arr.push(a); m.set(a.rule_key, arr);
    }
    return m;
  }, [alerts]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { sku: string; title: string; orders: number; units: number; oldest: number }>();
    for (const a of alerts) {
      for (const u of a.units) {
        const r = m.get(u.sku) || { sku: u.sku, title: u.title, orders: 0, units: 0, oldest: 0 };
        r.orders++; r.units += u.qty; r.oldest = Math.max(r.oldest, a.days);
        m.set(u.sku, r);
      }
    }
    return [...m.values()].sort((a, b) => b.units - a.units);
  }, [alerts]);

  async function saveSetting(rule_key: string, patch: Record<string, any>) {
    setSaving(rule_key);
    const { error } = await supabase.from("courier_alert_settings")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("rule_key", rule_key);
    setSaving(null);
    if (error) { toast({ title: "ვერ შეინახა", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["courier-alert-settings"] });
    qc.invalidateQueries({ queryKey: ["courier-alert-badge"] });
  }

  if (isLoading) {
    return <div className="p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> იტვირთება...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">Courier Alerts</h1>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
          {alerts.length}
        </span>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">წესების მიხედვით</TabsTrigger>
          <TabsTrigger value="products">პროდუქტების მიხედვით</TabsTrigger>
          <TabsTrigger value="settings">ზღვრები</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {settings.filter((s) => s.is_enabled).map((s) => {
            const list = byRule.get(s.rule_key) || [];
            return (
              <Card key={s.rule_key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${list.length ? "text-amber-600" : "text-muted-foreground"}`} />
                    {s.label}
                    <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
                  </CardTitle>
                </CardHeader>
                {list.length > 0 && (
                  <CardContent className="p-0 overflow-auto max-h-96">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Tracking</TableHead><TableHead>შეკვეთა</TableHead><TableHead>ტელეფონი</TableHead>
                        <TableHead>ქალაქი</TableHead><TableHead>სტატუსი</TableHead><TableHead className="text-right">დღე</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {list.slice(0, 200).map((a) => (
                          <TableRow key={s.rule_key + a.tracking}>
                            <TableCell className="font-mono text-xs">{a.tracking}</TableCell>
                            <TableCell className="text-xs">{a.order_number || "—"}</TableCell>
                            <TableCell className="text-xs">{a.phone || "—"}</TableCell>
                            <TableCell className="text-xs">{a.city || "—"}</TableCell>
                            <TableCell className="text-xs">{a.status || "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{a.days}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="products">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU</TableHead><TableHead>დასახელება</TableHead>
                <TableHead className="text-right">შეკვეთა</TableHead><TableHead className="text-right">ცალი</TableHead>
                <TableHead className="text-right">ყველაზე ძველი (დღე)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {byProduct.map((p) => (
                  <TableRow key={p.sku}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{p.title}</TableCell>
                    <TableCell className="text-right">{p.orders}</TableCell>
                    <TableCell className="text-right">{p.units}</TableCell>
                    <TableCell className="text-right font-semibold">{p.oldest}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>წესი</TableHead><TableHead className="w-40">ზღვარი (დღე)</TableHead><TableHead className="w-24">ჩართული</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {settings.map((s) => (
                  <TableRow key={s.rule_key}>
                    <TableCell>{s.label}</TableCell>
                    <TableCell>
                      <Input type="number" defaultValue={s.threshold_days} className="w-28"
                        onBlur={(e) => {
                          const v = parseInt(e.target.value);
                          if (!Number.isNaN(v) && v !== s.threshold_days) saveSetting(s.rule_key, { threshold_days: v });
                        }} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={s.is_enabled} disabled={saving === s.rule_key}
                        onCheckedChange={(v) => saveSetting(s.rule_key, { is_enabled: v })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
          <div className="pt-3">
            <Button variant="outline" onClick={() => window.location.reload()}>განახლება</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DERIVED_LABEL, DERIVED_BADGE, DerivedStatus } from "@/lib/courierStatus";

type Shipment = {
  id: string; tracking_number: string; sku: string | null; city: string | null;
  derived_status: DerivedStatus | null; shipment_type: string | null;
  cod_amount: number | null; company_receives: number | null;
  first_seen_at: string | null; latest_status_date: string | null;
};

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

export default function AdminCourierAnalytics() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const monthAgoISO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(monthAgoISO);
  const [to, setTo] = useState(todayISO);
  const [skuFilter, setSkuFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [ships, setShips] = useState<Shipment[]>([]);
  const [returnsLink, setReturnsLink] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from("courier_shipments")
        .select("id, tracking_number, sku, city, derived_status, shipment_type, cod_amount, company_receives, first_seen_at, latest_status_date")
        .gte("latest_status_date", `${from}T00:00:00Z`)
        .lte("latest_status_date", `${to}T23:59:59Z`)
        .limit(10000);
      if (skuFilter) q = q.ilike("sku", `%${skuFilter}%`);
      if (cityFilter) q = q.ilike("city", `%${cityFilter}%`);
      if (statusFilter !== "ALL") q = q.eq("derived_status", statusFilter);
      if (typeFilter !== "ALL") q = q.eq("shipment_type", typeFilter);
      const { data } = await q;
      setShips((data as any) || []);

      const { data: rm } = await supabase.from("return_matches").select("original_shipment_id, return_shipment_id").in("matched_by", ["AUTO", "MANUAL"]);
      const m = new Map<string, string>();
      (rm || []).forEach((r: any) => m.set(r.original_shipment_id, r.return_shipment_id));
      setReturnsLink(m);
      setLoading(false);
    })();
  }, [from, to, skuFilter, cityFilter, statusFilter, typeFilter]);

  const kpis = useMemo(() => {
    const total = ships.length;
    let delivered = 0, refused = 0, returned = 0, transit = 0, codSum = 0, compSum = 0;
    let delivDays: number[] = []; let retDays: number[] = [];
    const shipById = new Map(ships.map((s) => [s.id, s]));
    for (const s of ships) {
      if (s.derived_status === "DELIVERED_TO_CUSTOMER") {
        delivered++;
        codSum += Number(s.cod_amount || 0);
        compSum += Number(s.company_receives || 0);
        const d = daysBetween(s.first_seen_at, s.latest_status_date);
        if (d != null && d >= 0) delivDays.push(d);
      } else if (s.derived_status === "CANCELLED_OR_REFUSED") refused++;
      else if (s.derived_status === "RETURNED_TO_SENDER") returned++;
      else if (s.derived_status === "IN_TRANSIT") transit++;
    }
    // avg days to return: original -> matched return latest_status_date
    for (const [origId, retId] of returnsLink) {
      const o = shipById.get(origId), r = shipById.get(retId);
      if (o && r) { const d = daysBetween(o.first_seen_at, r.latest_status_date); if (d != null && d >= 0) retDays.push(d); }
    }
    const pct = (n: number) => total ? Math.round((n / total) * 1000) / 10 : 0;
    const avg = (a: number[]) => a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : "—";
    return { total, delivered, refused, returned, transit, codSum, compSum,
      deliveryPct: pct(delivered), refusedPct: pct(refused), returnPct: pct(returned),
      avgDelivDays: avg(delivDays), avgRetDays: avg(retDays) };
  }, [ships, returnsLink]);

  const skuTable = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of ships) {
      const k = s.sku || "—";
      const r = m.get(k) || { sku: k, total: 0, delivered: 0, refused: 0, returned: 0, pending: 0, revenue: 0 };
      r.total++;
      if (s.derived_status === "DELIVERED_TO_CUSTOMER") { r.delivered++; r.revenue += Number(s.company_receives || 0); }
      else if (s.derived_status === "CANCELLED_OR_REFUSED") r.refused++;
      else if (s.derived_status === "RETURNED_TO_SENDER") r.returned++;
      else r.pending++;
      m.set(k, r);
    }
    return Array.from(m.values()).map((r) => ({
      ...r,
      deliveryPct: r.total ? Math.round((r.delivered / r.total) * 1000) / 10 : 0,
      returnPct: r.total ? Math.round((r.returned / r.total) * 1000) / 10 : 0,
    })).sort((a, b) => b.total - a.total);
  }, [ships]);

  const cityTable = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of ships) {
      const k = s.city || "—";
      const r = m.get(k) || { city: k, total: 0, delivered: 0, refused: 0, returned: 0 };
      r.total++;
      if (s.derived_status === "DELIVERED_TO_CUSTOMER") r.delivered++;
      else if (s.derived_status === "CANCELLED_OR_REFUSED") r.refused++;
      else if (s.derived_status === "RETURNED_TO_SENDER") r.returned++;
      m.set(k, r);
    }
    return Array.from(m.values()).map((r) => ({
      ...r, deliveryPct: r.total ? Math.round((r.delivered / r.total) * 1000) / 10 : 0,
    })).sort((a, b) => b.total - a.total);
  }, [ships]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-extrabold">Courier Analytics</h1>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label className="text-xs">SKU</Label><Input value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} placeholder="any" /></div>
          <div><Label className="text-xs">City</Label><Input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="any" /></div>
          <div>
            <Label className="text-xs">Status</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="DELIVERED_TO_CUSTOMER">Delivered</option>
              <option value="CANCELLED_OR_REFUSED">Refused</option>
              <option value="RETURNED_TO_SENDER">Returned</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="CUSTOMER_DELIVERY">Customer Delivery</option>
              <option value="RETURN_TO_SENDER">Return</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Delivered" value={kpis.delivered} sub={`${kpis.deliveryPct}%`} />
        <Kpi label="Refused" value={kpis.refused} sub={`${kpis.refusedPct}%`} />
        <Kpi label="Returned" value={kpis.returned} sub={`${kpis.returnPct}%`} />
        <Kpi label="In Transit" value={kpis.transit} />
        <Kpi label="COD ₾" value={Math.round(kpis.codSum)} />
        <Kpi label="Company ₾" value={Math.round(kpis.compSum)} />
        <Kpi label="Avg Days→Delivery" value={kpis.avgDelivDays} />
        <Kpi label="Avg Days→Return" value={kpis.avgRetDays} />
      </div>

      {/* SKU table */}
      <Card>
        <CardHeader><CardTitle className="text-base">By SKU</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>SKU</TableHead><TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Refused</TableHead>
              <TableHead className="text-right">Returned</TableHead><TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Delivery %</TableHead><TableHead className="text-right">Return %</TableHead>
              <TableHead className="text-right">Revenue ₾</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {skuTable.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                  <TableCell className="text-right text-red-700">{r.refused}</TableCell>
                  <TableCell className="text-right text-orange-700">{r.returned}</TableCell>
                  <TableCell className="text-right">{r.pending}</TableCell>
                  <TableCell className="text-right font-semibold">{r.deliveryPct}%</TableCell>
                  <TableCell className="text-right">{r.returnPct}%</TableCell>
                  <TableCell className="text-right">{Math.round(r.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* City table */}
      <Card>
        <CardHeader><CardTitle className="text-base">By City</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>City</TableHead><TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Refused</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead className="text-right">Delivery %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {cityTable.map((r) => (
                <TableRow key={r.city}>
                  <TableCell>{r.city}</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                  <TableCell className="text-right text-red-700">{r.refused}</TableCell>
                  <TableCell className="text-right text-orange-700">{r.returned}</TableCell>
                  <TableCell className="text-right font-semibold">{r.deliveryPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

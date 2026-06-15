import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DerivedStatus } from "@/lib/courierStatus";

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

// "Customer delivery attempt" = excludes return-to-sender tracking rows.
// "Finalized" = courier flow is done (delivered or failed). Excludes pending and cancelled-before-courier.
const isFinalized = (d: DerivedStatus | null) =>
  d === "DELIVERED_TO_CUSTOMER" || d === "FINAL_NOT_DELIVERED";

export default function AdminCourierAnalytics() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const monthAgoISO = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(monthAgoISO);
  const [to, setTo] = useState(todayISO);
  const [skuFilter, setSkuFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [includeUndated, setIncludeUndated] = useState(true);
  const [ships, setShips] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fromISO = `${from}T00:00:00Z`;
      const toISO = `${to}T23:59:59Z`;
      let q = supabase.from("courier_shipments")
        .select("id, tracking_number, sku, city, derived_status, shipment_type, cod_amount, company_receives, first_seen_at, latest_status_date")
        .limit(20000);
      if (includeUndated) {
        q = q.or(`and(latest_status_date.gte.${fromISO},latest_status_date.lte.${toISO}),latest_status_date.is.null`);
      } else {
        q = q.gte("latest_status_date", fromISO).lte("latest_status_date", toISO);
      }
      if (skuFilter) q = q.ilike("sku", `%${skuFilter}%`);
      if (cityFilter) q = q.ilike("city", `%${cityFilter}%`);
      const { data } = await q;
      setShips((data as any) || []);
      setLoading(false);
    })();
  }, [from, to, skuFilter, cityFilter, includeUndated]);

  const kpis = useMemo(() => {
    // Only customer-delivery rows count toward the main rate.
    // Return-to-sender tracking is excluded entirely.
    const customerRows = ships.filter((s) => s.shipment_type !== "RETURN_TO_SENDER");

    let delivered = 0, failed = 0, cancelledBefore = 0, pending = 0, returned = 0;
    let codSum = 0, compSum = 0;
    const delivDays: number[] = [];

    for (const s of customerRows) {
      switch (s.derived_status) {
        case "DELIVERED_TO_CUSTOMER":
          delivered++;
          codSum += Number(s.cod_amount || 0);
          compSum += Number(s.company_receives || 0);
          const d = daysBetween(s.first_seen_at, s.latest_status_date);
          if (d != null && d >= 0) delivDays.push(d);
          break;
        case "FINAL_NOT_DELIVERED":
          failed++;
          break;
        case "CANCELLED_BEFORE_COURIER":
          cancelledBefore++;
          break;
        case "IN_TRANSIT":
          pending++;
          break;
        case "RETURNED_TO_SENDER":
          returned++;
          break;
        case "CANCELLED_OR_REFUSED": // legacy
          failed++;
          break;
        default:
          pending++;
      }
    }
    // Return-to-sender tracking (separate, excluded from main rate)
    const returnTracking = ships.filter((s) => s.shipment_type === "RETURN_TO_SENDER").length + returned;

    const finalized = delivered + failed;
    const pct = (n: number) => finalized ? Math.round((n / finalized) * 1000) / 10 : 0;
    const avg = (a: number[]) => a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : "—";

    return {
      totalRows: ships.length,
      finalized,
      delivered,
      failed,
      pending,
      cancelledBefore,
      returnTracking,
      deliveryRate: pct(delivered),
      failureRate: pct(failed),
      codSum, compSum,
      avgDelivDays: avg(delivDays),
    };
  }, [ships]);

  const skuTable = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of ships) {
      if (s.shipment_type === "RETURN_TO_SENDER") continue;
      if (!isFinalized(s.derived_status)) continue;
      const k = s.sku || "—";
      const r = m.get(k) || { sku: k, finalized: 0, delivered: 0, failed: 0, revenue: 0 };
      r.finalized++;
      if (s.derived_status === "DELIVERED_TO_CUSTOMER") { r.delivered++; r.revenue += Number(s.company_receives || 0); }
      else if (s.derived_status === "FINAL_NOT_DELIVERED") r.failed++;
      m.set(k, r);
    }
    return Array.from(m.values()).map((r) => ({
      ...r,
      deliveryRate: r.finalized ? Math.round((r.delivered / r.finalized) * 1000) / 10 : 0,
      failureRate: r.finalized ? Math.round((r.failed / r.finalized) * 1000) / 10 : 0,
    })).sort((a, b) => b.finalized - a.finalized);
  }, [ships]);

  const cityTable = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of ships) {
      if (s.shipment_type === "RETURN_TO_SENDER") continue;
      if (!isFinalized(s.derived_status)) continue;
      const k = s.city || "—";
      const r = m.get(k) || { city: k, finalized: 0, delivered: 0, failed: 0 };
      r.finalized++;
      if (s.derived_status === "DELIVERED_TO_CUSTOMER") r.delivered++;
      else if (s.derived_status === "FINAL_NOT_DELIVERED") r.failed++;
      m.set(k, r);
    }
    return Array.from(m.values()).map((r) => ({
      ...r, deliveryRate: r.finalized ? Math.round((r.delivered / r.finalized) * 1000) / 10 : 0,
    })).sort((a, b) => b.finalized - a.finalized);
  }, [ships]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Main rate = delivered ÷ (delivered + failed). Pending, cancelled-before-courier and return-to-sender rows are excluded.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label className="text-xs">SKU</Label><Input value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} placeholder="any" /></div>
          <div><Label className="text-xs">City</Label><Input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="any" /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />
              Include undated
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Main finalized KPIs */}
      <div>
        <h2 className="text-sm font-bold mb-2 text-muted-foreground uppercase tracking-wide">Finalized courier outcomes</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Courier Finalized Orders" value={kpis.finalized} accent="border-l-4 border-l-foreground" />
          <Kpi label="Delivered to Client" value={kpis.delivered} sub={`${kpis.deliveryRate}%`} accent="border-l-4 border-l-green-600" />
          <Kpi label="Failed / Refused" value={kpis.failed} sub={`${kpis.failureRate}%`} accent="border-l-4 border-l-red-600" />
          <Kpi label="Successful Delivery Rate" value={`${kpis.deliveryRate}%`} accent="border-l-4 border-l-green-600" />
          <Kpi label="Failed / Refused Rate" value={`${kpis.failureRate}%`} accent="border-l-4 border-l-red-600" />
        </div>
      </div>

      {/* Excluded */}
      <div>
        <h2 className="text-sm font-bold mb-2 text-muted-foreground uppercase tracking-wide">Excluded from main rate</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Pending / Active" value={kpis.pending} sub="in transit, warehouse" />
          <Kpi label="Cancelled Before Courier" value={kpis.cancelledBefore} sub="მიღების გაუქმება" />
          <Kpi label="Return-to-Sender rows" value={kpis.returnTracking} sub="separate tracking" />
          <Kpi label="Total uploaded rows" value={kpis.totalRows} />
        </div>
      </div>

      {/* Financial */}
      <div>
        <h2 className="text-sm font-bold mb-2 text-muted-foreground uppercase tracking-wide">Money (delivered only)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="COD ₾" value={Math.round(kpis.codSum)} />
          <Kpi label="Company receives ₾" value={Math.round(kpis.compSum)} />
          <Kpi label="Avg days → delivery" value={kpis.avgDelivDays} />
        </div>
      </div>

      {/* SKU table — finalized only */}
      <Card>
        <CardHeader><CardTitle className="text-base">By SKU (finalized only)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Finalized</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Delivery %</TableHead>
              <TableHead className="text-right">Failure %</TableHead>
              <TableHead className="text-right">Revenue ₾</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {skuTable.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-right">{r.finalized}</TableCell>
                  <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                  <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                  <TableCell className="text-right font-semibold">{r.deliveryRate}%</TableCell>
                  <TableCell className="text-right">{r.failureRate}%</TableCell>
                  <TableCell className="text-right">{Math.round(r.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* City table — finalized only */}
      <Card>
        <CardHeader><CardTitle className="text-base">By City (finalized only)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Finalized</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Delivery %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {cityTable.map((r) => (
                <TableRow key={r.city}>
                  <TableCell>{r.city}</TableCell>
                  <TableCell className="text-right">{r.finalized}</TableCell>
                  <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                  <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                  <TableCell className="text-right font-semibold">{r.deliveryRate}%</TableCell>
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

function Kpi({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: string }) {
  return (
    <Card className={accent}><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

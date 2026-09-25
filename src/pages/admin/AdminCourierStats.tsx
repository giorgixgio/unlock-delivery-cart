import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { useCourierDataset, unitsFor, type Shipment } from "@/hooks/useCourierDataset";
import {
  rateBlock, isDelivered, isFailedFinal, isOutbound, isExcluded, pct, weekKey, shipmentDate,
  recoveryOf, emptyRecovery, addRecovery, unitCount, type RecoveryTotals,
} from "@/lib/courierAnalytics";
import { STATE_LABEL, STATE_BADGE } from "@/lib/courierStates";

type Dir = "all" | "outbound" | "return";
type DateMode = "order" | "pickup";

export default function AdminCourierStats() {
  const { data: ds, isLoading } = useCourierDataset();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dir, setDir] = useState<Dir>("outbound");
  const [dateMode, setDateMode] = useState<DateMode>("order");
  const [minSample, setMinSample] = useState(5);

  // Which courier-file date column the period filter counts by
  const dateOf = (s: Shipment): string | null =>
    dateMode === "pickup"
      ? s.pickup_date || shipmentDate(s)
      : shipmentDate(s);

  const filtered = useMemo<Shipment[]>(() => {
    if (!ds) return [];
    return ds.shipments.filter((s) => {
      if (dir === "outbound" && s.is_return) return false;
      if (dir === "return" && !s.is_return) return false;
      // Courier dates are calendar days (stored as midnight) — compare by YYYY-MM-DD only
      const d = dateOf(s)?.slice(0, 10) ?? null;
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, from, to, dir, dateMode]);

  const byTracking = useMemo(() => {
    const m = new Map<string, Shipment>();
    for (const s of ds?.shipments || []) m.set(s.tracking_number, s);
    return m;
  }, [ds]);

  const kpi = useMemo(() => rateBlock(filtered), [filtered]);

  const statusRows = useMemo(() => {
    const m = new Map<string, { status: string; state: string; count: number }>();
    for (const s of filtered) {
      const key = `${s.current_courier_status}|${s.derived_state}`;
      const row = m.get(key) || { status: s.current_courier_status || "—", state: s.derived_state || "IN_PROGRESS", count: 0 };
      row.count++;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  const confirmSplit = useMemo(() => {
    if (!ds) return [];
    const groups: Record<string, Shipment[]> = { auto: [], operator: [] };
    for (const s of filtered) {
      if (!isOutbound(s) || !s.original_order_id) continue;
      const o = ds.orders.get(s.original_order_id);
      if (!o || o.is_return) continue;
      (o.auto_confirmed ? groups.auto : groups.operator).push(s);
    }
    return [
      { key: "ავტო-დადასტურება", ...rateBlock(groups.auto) },
      { key: "ოპერატორის დადასტურება", ...rateBlock(groups.operator) },
    ];
  }, [filtered, ds]);

  const productRows = useMemo(() => {
    if (!ds) return [];
    const m = new Map<string, { sku: string; title: string; orders: number; units: number; delivered: number; failed: number; unresolved: number }>();
    for (const s of filtered) {
      if (!isOutbound(s) || isExcluded(s)) continue;
      for (const u of unitsFor(ds, s)) {
        const row = m.get(u.sku) || { sku: u.sku, title: u.title, orders: 0, units: 0, delivered: 0, failed: 0, unresolved: 0 };
        row.orders++; row.units += u.qty;
        if (isDelivered(s)) row.delivered++;
        else if (isFailedFinal(s)) row.failed++;
        else row.unresolved++;
        m.set(u.sku, row);
      }
    }
    return [...m.values()]
      .filter((r) => r.delivered + r.failed >= minSample)
      .sort((a, b) => (b.failed / Math.max(1, b.delivered + b.failed)) - (a.failed / Math.max(1, a.delivered + a.failed)));
  }, [filtered, ds, minSample]);

  const cityRows = useMemo(() => {
    if (!ds) return [];
    const m = new Map<string, Shipment[]>();
    for (const s of filtered) {
      if (!isOutbound(s)) continue;
      const o = s.original_order_id ? ds.orders.get(s.original_order_id) : null;
      const city = (o?.normalized_city || o?.city || s.city || "—").trim();
      const arr = m.get(city) || []; arr.push(s); m.set(city, arr);
    }
    return [...m.entries()].map(([city, list]) => ({ city, ...rateBlock(list) }))
      .filter((r) => r.resolved >= minSample)
      .sort((a, b) => b.handed - a.handed);
  }, [filtered, ds, minSample]);

  const bandRows = useMemo(() => {
    if (!ds) return [];
    const bands: [string, (v: number) => boolean][] = [
      ["0–29₾", (v) => v < 30], ["30–49₾", (v) => v >= 30 && v < 50],
      ["50–79₾", (v) => v >= 50 && v < 80], ["80–119₾", (v) => v >= 80 && v < 120],
      ["120₾+", (v) => v >= 120],
    ];
    const m = new Map<string, Shipment[]>();
    for (const s of filtered) {
      if (!isOutbound(s)) continue;
      const o = s.original_order_id ? ds.orders.get(s.original_order_id) : null;
      const value = o?.total ?? Number(s.cod_amount || 0);
      const band = bands.find(([, f]) => f(value))?.[0] || "—";
      const arr = m.get(band) || []; arr.push(s); m.set(band, arr);
    }
    return bands.map(([b]) => ({ band: b, ...rateBlock(m.get(b) || []) })).filter((r) => r.handed > 0);
  }, [filtered, ds]);

  const itemCountRows = useMemo(() => {
    if (!ds) return [];
    const m = new Map<number, Shipment[]>();
    for (const s of filtered) {
      if (!isOutbound(s)) continue;
      const n = unitsFor(ds, s).reduce((a, b) => a + b.qty, 0) || 1;
      const key = Math.min(n, 5);
      const arr = m.get(key) || []; arr.push(s); m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
      .map(([n, list]) => ({ items: n === 5 ? "5+" : String(n), ...rateBlock(list) }));
  }, [filtered, ds]);

  const weekly = useMemo(() => {
    const m = new Map<string, Shipment[]>();
    for (const s of filtered) {
      if (!isOutbound(s)) continue;
      const d = dateOf(s);
      if (!d) continue;
      const k = weekKey(d);
      const arr = m.get(k) || []; arr.push(s); m.set(k, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, list]) => {
      const r = rateBlock(list);
      return { week: week.slice(5), rate: +(r.deliveryRate * 100).toFixed(1), resolved: r.resolved, handed: r.handed };
    });
  }, [filtered]);

  const recovery = useMemo<RecoveryTotals>(() => {
    const t = emptyRecovery();
    if (!ds) return t;
    for (const s of filtered) {
      if (!isOutbound(s) || !isFailedFinal(s)) continue;
      addRecovery(t, recoveryOf(ds, s, byTracking), unitCount(ds, s));
    }
    return t;
  }, [filtered, ds, byTracking]);

  const recoveryByProduct = useMemo(() => {
    if (!ds) return [];
    const m = new Map<string, RecoveryTotals & { sku: string; title: string }>();
    for (const s of filtered) {
      if (!isOutbound(s) || !isFailedFinal(s)) continue;
      const r = recoveryOf(ds, s, byTracking);
      for (const u of unitsFor(ds, s)) {
        const row = m.get(u.sku) || { sku: u.sku, title: u.title, ...emptyRecovery() };
        addRecovery(row, r, u.qty);
        m.set(u.sku, row);
      }
    }
    return [...m.values()].sort((a, b) => b.failedUnits - a.failedUnits);
  }, [filtered, ds, byTracking]);

  if (isLoading) {
    return <div className="p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> იტვირთება...</div>;
  }

  const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-extrabold">Courier Statistics</h1>

      <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
        <div><Label className="text-xs">დან</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">მდე</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <div className="flex gap-1">
          {(["outbound", "return", "all"] as Dir[]).map((d) => (
            <Button key={d} size="sm" variant={dir === d ? "default" : "outline"} onClick={() => setDir(d)}>
              {d === "outbound" ? "გასული" : d === "return" ? "დაბრუნება" : "ყველა"}
            </Button>
          ))}
        </div>
        <div>
          <Label className="text-xs">თარიღი</Label>
          <div className="flex gap-1">
            {(["order", "pickup"] as DateMode[]).map((m) => (
              <Button key={m} size="sm" variant={dateMode === m ? "default" : "outline"} onClick={() => setDateMode(m)}>
                {m === "order" ? "შეკვ. თარიღი" : "აღების თარიღი"}
              </Button>
            ))}
          </div>
        </div>
        <div><Label className="text-xs">მინ. ნიმუში</Label>
          <Input type="number" value={minSample} onChange={(e) => setMinSample(parseInt(e.target.value) || 0)} className="w-24" /></div>
      </CardContent></Card>

      <div className="grid gap-3 md:grid-cols-5">
        <Kpi
          label="ჩაბარების პროცენტი"
          value={pct(kpi.deliveryRate)}
          sub={`${kpi.delivered} / ${kpi.resolved} • ${kpi.unresolved} ჯერ გზაშია (არ ითვლება)`}
        />
        <Kpi label="დასრულებულთა წილი" value={pct(kpi.resolvedShare)} sub={`${kpi.resolved} / ${kpi.handed}`} />
        <Kpi label="ჩაბარდა" value={String(kpi.delivered)} />
        <Kpi label="ვერ ჩაბარდა (საბოლოო)" value={String(kpi.failed)} />
        <Kpi label="ჯერ მიმდინარე" value={String(kpi.unresolved)} />
      </div>

      <Tabs defaultValue="status">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="status">სტატუსები</TabsTrigger>
          <TabsTrigger value="confirm">ავტო vs ოპერატორი</TabsTrigger>
          <TabsTrigger value="product">პროდუქტები</TabsTrigger>
          <TabsTrigger value="city">ქალაქები</TabsTrigger>
          <TabsTrigger value="value">თანხა / რაოდენობა</TabsTrigger>
          <TabsTrigger value="week">კვირები</TabsTrigger>
          <TabsTrigger value="recovery">დაბრუნებული ნივთები</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>კურიერის სტატუსი</TableHead><TableHead>ჩვენი მდგომარეობა</TableHead><TableHead className="text-right">რაოდენობა</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {statusRows.map((r) => (
                  <TableRow key={r.status + r.state}>
                    <TableCell className="text-sm">{r.status}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded border ${STATE_BADGE[r.state] || ""}`}>
                        {STATE_LABEL[r.state] || r.state}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">{r.status}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="confirm">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ჯგუფი</TableHead><TableHead className="text-right">კურიერთან</TableHead>
                <TableHead className="text-right">ჩაბარდა</TableHead><TableHead className="text-right">ვერ ჩაბარდა</TableHead>
                <TableHead className="text-right">ჩაბარების %</TableHead><TableHead className="text-right">დასრულებული %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {confirmSplit.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.key}</TableCell>
                    <TableCell className="text-right">{r.handed}</TableCell>
                    <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                    <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                    <TableCell className="text-right font-bold">{pct(r.deliveryRate)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{pct(r.resolvedShare)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="product">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU</TableHead><TableHead>დასახელება</TableHead>
                <TableHead className="text-right">შეკვეთა</TableHead><TableHead className="text-right">ცალი</TableHead>
                <TableHead className="text-right">ჩაბარდა</TableHead><TableHead className="text-right">ვერ ჩაბარდა</TableHead>
                <TableHead className="text-right">წუნის %</TableHead><TableHead className="text-right">მიმდინარე</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {productRows.map((r) => (
                  <TableRow key={r.sku}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{r.title}</TableCell>
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="text-right">{r.units}</TableCell>
                    <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                    <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                    <TableCell className="text-right font-bold">{pct(r.failed / Math.max(1, r.delivered + r.failed))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.unresolved}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="city">
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ქალაქი</TableHead><TableHead className="text-right">კურიერთან</TableHead>
                <TableHead className="text-right">ჩაბარდა</TableHead><TableHead className="text-right">ვერ ჩაბარდა</TableHead>
                <TableHead className="text-right">ჩაბარების %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {cityRows.map((r) => (
                  <TableRow key={r.city}>
                    <TableCell>{r.city}</TableCell>
                    <TableCell className="text-right">{r.handed}</TableCell>
                    <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                    <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                    <TableCell className="text-right font-bold">{pct(r.deliveryRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="value" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">შეკვეთის თანხა</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bandRows.map((b) => ({ band: b.band, rate: +(b.deliveryRate * 100).toFixed(1) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="band" /><YAxis unit="%" /><Tooltip />
                  <Bar dataKey="rate" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ცალის რაოდენობა</TableHead><TableHead className="text-right">კურიერთან</TableHead>
                <TableHead className="text-right">ჩაბარდა</TableHead><TableHead className="text-right">ვერ ჩაბარდა</TableHead>
                <TableHead className="text-right">ჩაბარების %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {itemCountRows.map((r) => (
                  <TableRow key={r.items}>
                    <TableCell>{r.items}</TableCell>
                    <TableCell className="text-right">{r.handed}</TableCell>
                    <TableCell className="text-right text-green-700">{r.delivered}</TableCell>
                    <TableCell className="text-right text-red-700">{r.failed}</TableCell>
                    <TableCell className="text-right font-bold">{pct(r.deliveryRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="week">
          <Card>
            <CardHeader><CardTitle className="text-base">ჩაბარების % კვირების მიხედვით</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" /><YAxis unit="%" /><Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="ვერ ჩაბარებული" value={`${recovery.failedOrders} / ${recovery.failedUnits} ც.`} />
            <Kpi label="ავიღეთ" value={`${recovery.collectedOrders} / ${recovery.collectedUnits} ც.`}
              sub={pct(recovery.failedUnits ? recovery.collectedUnits / recovery.failedUnits : 0)} />
            <Kpi label="გზაშია უკან" value={`${recovery.onTheWayOrders} / ${recovery.onTheWayUnits} ც.`}
              sub={pct(recovery.failedUnits ? recovery.onTheWayUnits / recovery.failedUnits : 0)} />
            <Kpi label="დაბრუნება არ აქვს" value={`${recovery.notRegisteredOrders} / ${recovery.notRegisteredUnits} ც.`}
              sub={pct(recovery.failedUnits ? recovery.notRegisteredUnits / recovery.failedUnits : 0)} />
          </div>
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>SKU</TableHead><TableHead>დასახელება</TableHead>
                <TableHead className="text-right">ვერ ჩაბარდა (ც.)</TableHead>
                <TableHead className="text-right">ავიღეთ</TableHead>
                <TableHead className="text-right">გზაშია</TableHead>
                <TableHead className="text-right">არ არის</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {recoveryByProduct.map((r) => (
                  <TableRow key={r.sku}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{r.title}</TableCell>
                    <TableCell className="text-right font-semibold">{r.failedUnits}</TableCell>
                    <TableCell className="text-right text-green-700">{r.collectedUnits}</TableCell>
                    <TableCell className="text-right text-blue-700">{r.onTheWayUnits}</TableCell>
                    <TableCell className="text-right text-red-700">{r.notRegisteredUnits}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

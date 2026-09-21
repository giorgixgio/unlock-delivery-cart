import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useCourierDataset, unitsFor, type Shipment } from "@/hooks/useCourierDataset";
import {
  isOutbound, isFailedFinal, isInProgress, recoveryOf, emptyRecovery, addRecovery, pct,
  type RecoveryTotals,
} from "@/lib/courierAnalytics";

type Row = RecoveryTotals & { sku: string; title: string; possibleUnits: number };

export default function AdminCourierRestock() {
  const { data: ds, isLoading } = useCourierDataset();

  const byTracking = useMemo(() => {
    const m = new Map<string, Shipment>();
    for (const s of ds?.shipments || []) m.set(s.tracking_number, s);
    return m;
  }, [ds]);

  const rows = useMemo<Row[]>(() => {
    if (!ds) return [];
    const m = new Map<string, Row>();
    const ensure = (sku: string, title: string) => {
      const r = m.get(sku) || { sku, title, possibleUnits: 0, ...emptyRecovery() };
      m.set(sku, r);
      return r;
    };
    for (const s of ds.shipments) {
      if (!isOutbound(s)) continue;
      if (isFailedFinal(s)) {
        const rec = recoveryOf(ds, s, byTracking);
        for (const u of unitsFor(ds, s)) addRecovery(ensure(u.sku, u.title), rec, u.qty);
      } else if (isInProgress(s)) {
        for (const u of unitsFor(ds, s)) ensure(u.sku, u.title).possibleUnits += u.qty;
      }
    }
    return [...m.values()].sort((a, b) => (b.collectedUnits + b.onTheWayUnits) - (a.collectedUnits + a.onTheWayUnits));
  }, [ds, byTracking]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    failed: t.failed + r.failedUnits,
    collected: t.collected + r.collectedUnits,
    onWay: t.onWay + r.onTheWayUnits,
    none: t.none + r.notRegisteredUnits,
    possible: t.possible + r.possibleUnits,
  }), { failed: 0, collected: 0, onWay: 0, none: 0, possible: 0 }), [rows]);

  if (isLoading) {
    return <div className="p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> იტვირთება...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Restock</h1>
        <p className="text-sm text-muted-foreground">რამდენი ცალი ბრუნდება უკან საწყობში, პროდუქტების მიხედვით.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["ვერ ჩაბარებული ცალი", totals.failed],
          ["ავიღეთ", totals.collected],
          ["გზაშია უკან", totals.onWay],
          ["დაბრუნება არ აქვს", totals.none],
          ["შესაძლო დამატებითი", totals.possible],
        ].map(([l, v]) => (
          <Card key={String(l)}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-2xl font-extrabold">{v as number}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">პროდუქტების მიხედვით</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>SKU</TableHead><TableHead>დასახელება</TableHead>
              <TableHead className="text-right">ვერ ჩაბარდა (ც.)</TableHead>
              <TableHead className="text-right">ავიღეთ</TableHead>
              <TableHead className="text-right">გზაშია</TableHead>
              <TableHead className="text-right">არ არის</TableHead>
              <TableHead className="text-right">ავიღეთ %</TableHead>
              <TableHead className="text-right">შესაძლო დამატებითი</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="text-xs max-w-[280px] truncate">{r.title}</TableCell>
                  <TableCell className="text-right font-semibold">{r.failedUnits}</TableCell>
                  <TableCell className="text-right text-green-700">{r.collectedUnits}</TableCell>
                  <TableCell className="text-right text-blue-700">{r.onTheWayUnits}</TableCell>
                  <TableCell className="text-right text-red-700">{r.notRegisteredUnits}</TableCell>
                  <TableCell className="text-right">{pct(r.failedUnits ? r.collectedUnits / r.failedUnits : 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.possibleUnits}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">მონაცემები არ არის</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

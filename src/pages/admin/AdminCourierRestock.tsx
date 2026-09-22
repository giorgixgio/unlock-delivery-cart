import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useCourierDataset } from "@/hooks/useCourierDataset";
import { pct } from "@/lib/courierAnalytics";
import { recoveryBySku, recoveryTotals, type SkuRecovery } from "@/lib/courierRecovery";

export default function AdminCourierRestock() {
  const { data: ds, isLoading } = useCourierDataset();

  const rows = useMemo<SkuRecovery[]>(() => {
    const map = recoveryBySku(ds);
    return [...map.values()].sort(
      (a, b) => (b.collectedUnits + b.inTransitUnits) - (a.collectedUnits + a.inTransitUnits),
    );
  }, [ds]);

  const totals = useMemo(() => recoveryTotals(recoveryBySku(ds)), [ds]);
  const failedUnits = totals.collectedUnits + totals.inTransitUnits + totals.notRegisteredUnits;

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
          ["ვერ ჩაბარებული ცალი", failedUnits],
          ["ავიღეთ", totals.collectedUnits],
          ["გზაშია უკან", totals.inTransitUnits],
          ["დაბრუნება არ აქვს", totals.notRegisteredUnits],
          ["შესაძლო დამატებითი", totals.inProgressUnits],
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
              {rows.map((r) => {
                const failed = r.collectedUnits + r.inTransitUnits + r.notRegisteredUnits;
                return (
                  <TableRow key={r.sku}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{r.title}</TableCell>
                    <TableCell className="text-right font-semibold">{failed}</TableCell>
                    <TableCell className="text-right text-green-700">{r.collectedUnits}</TableCell>
                    <TableCell className="text-right text-blue-700">{r.inTransitUnits}</TableCell>
                    <TableCell className="text-right text-red-700">{r.notRegisteredUnits}</TableCell>
                    <TableCell className="text-right">{pct(failed ? r.collectedUnits / failed : 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.inProgressUnits}</TableCell>
                  </TableRow>
                );
              })}
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

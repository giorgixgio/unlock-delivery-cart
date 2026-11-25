import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { buildCsv, formatMoney, triggerCsvDownload } from "@/lib/accountantUtils";

export interface AccountantSkuRow {
  sku: string;
  title: string;
  units_sold: number;
  orders_count: number;
  net_payout_attributed: number;
}

interface Props {
  rows: AccountantSkuRow[];
  totalNetPayout: number;
  totalUnits: number;
  from: string;
  to: string;
  loading: boolean;
}

const AccountantSkuTab = ({ rows, totalNetPayout, totalUnits, from, to, loading }: Props) => {
  const handleDownloadCsv = () => {
    const headers = ["SKU", "Product title", "Units sold", "Orders containing SKU", "Net payout attributed"];
    const csvRows: Array<Array<string | number>> = rows.map((r) => [
      r.sku,
      r.title,
      String(r.units_sold),
      String(r.orders_count),
      Number(r.net_payout_attributed),
    ]);
    csvRows.push(["TOTAL", "", String(totalUnits), "", Number(totalNetPayout)]);
    const csv = buildCsv(headers, csvRows);
    triggerCsvDownload(csv, `sales_by_sku_${from}_${to}.csv`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Multi-item orders split proportionally by catalog price × qty; column total matches delivered net payout exactly.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadCsv}
          disabled={loading || rows.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Download CSV
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">SKU</th>
              <th className="text-left px-3 py-2.5 font-semibold">Product title</th>
              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Units sold</th>
              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Orders</th>
              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Net payout attributed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {loading ? "Loading..." : "No product sales in this period."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.sku} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.sku}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.units_sold.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.orders_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.net_payout_attributed)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/60 border-t-2 border-border font-bold">
              <tr>
                <td className="px-3 py-2.5" colSpan={2}>Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totalUnits.toLocaleString()}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totalNetPayout)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default AccountantSkuTab;
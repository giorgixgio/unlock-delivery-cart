import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  buildCsv,
  formatMoney,
  triggerCsvDownload,
  type GroupByOption,
} from "@/lib/accountantUtils";

export interface SummaryPeriodRow {
  period_key: string;
  period_label: string;
  orders: number;
  units: number;
  onway_fees: number;
  failed_orders: number;
  failed_fees: number;
  net_payout: number;
  is_pending?: boolean;
}

export interface SummaryKpis {
  delivered_orders: number;
  units_sold: number;
  onway_fees: number;
  failed_orders: number;
  failed_delivery_fees: number;
  net_payout: number;
  pending_payout: number;
  avg_net_payout: number;
}

interface Props {
  periods: SummaryPeriodRow[];
  kpis: SummaryKpis;
  groupBy: GroupByOption;
  from: string;
  to: string;
  loading: boolean;
}

const PERIOD_HEADER: Record<GroupByOption, string> = {
  day: "Delivery date",
  week: "Week (Mon–Sun)",
  month: "Month",
  payout_date: "Expected payout date",
};

const AccountantSummaryTab = ({ periods, kpis, groupBy, from, to, loading }: Props) => {
  const totalActualNet = Number((kpis.net_payout + kpis.pending_payout).toFixed(2));

  const handleDownloadCsv = () => {
    const headers = [
      PERIOD_HEADER[groupBy],
      "Delivered orders",
      "Units sold",
      "Delivered Onway fees",
      "Failed delivery fees",
      "Actual net payout",
      "Status",
    ];
    const rows: Array<Array<string | number>> = periods.map((p) => [
      p.period_label,
      String(p.orders),
      String(p.units),
      Number(p.onway_fees),
      Number(p.failed_fees ?? 0),
      Number(p.net_payout),
      p.is_pending ? "Pending" : "",
    ]);
    rows.push([
      "TOTAL",
      String(kpis.delivered_orders),
      String(kpis.units_sold),
      Number(kpis.onway_fees),
      Number(kpis.failed_delivery_fees),
      totalActualNet,
      "",
    ]);
    const csv = buildCsv(headers, rows);
    triggerCsvDownload(csv, `sales_summary_${from}_${to}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Grouped by {PERIOD_HEADER[groupBy].toLowerCase()} · Asia/Tbilisi timezone
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadCsv}
          disabled={loading || periods.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Download CSV
        </Button>
      </div>

      {/* Bar chart of actual net payout per period */}
      {periods.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            Actual net payout per period (GEL)
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periods} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis
                  dataKey="period_key"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number) => [formatMoney(value), "Actual net"]}
                  labelFormatter={(label) => `${PERIOD_HEADER[groupBy]}: ${label}`}
                />
                <Bar dataKey="net_payout" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Period summary table */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold">{PERIOD_HEADER[groupBy]}</th>
              <th className="text-right px-3 py-2.5 font-semibold">Orders</th>
              <th className="text-right px-3 py-2.5 font-semibold">Units</th>
              <th className="text-right px-3 py-2.5 font-semibold">Delivered fees</th>
              <th className="text-right px-3 py-2.5 font-semibold">Failed fees</th>
              <th className="text-right px-3 py-2.5 font-semibold">Actual net</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {loading ? "Loading..." : "No delivered sales in this period."}
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={p.period_key} className={`border-t border-border hover:bg-muted/30 ${p.is_pending ? "text-muted-foreground" : ""}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {p.period_label}
                    {p.is_pending && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.orders.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.units.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(p.onway_fees)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatMoney(p.failed_fees ?? 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(p.net_payout)}</td>
                </tr>
              ))
            )}
          </tbody>
          {periods.length > 0 && (
            <tfoot className="bg-muted/60 border-t-2 border-border font-bold">
              <tr>
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{kpis.delivered_orders.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{kpis.units_sold.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(kpis.onway_fees)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-destructive">{formatMoney(kpis.failed_delivery_fees)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totalActualNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default AccountantSummaryTab;
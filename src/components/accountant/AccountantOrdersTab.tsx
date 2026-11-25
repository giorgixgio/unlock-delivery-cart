import { Button } from "@/components/ui/button";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/accountantUtils";

export interface AccountantOrderRow {
  shipment_id: string;
  sale_date: string;
  payout_date: string;
  tracking_number: string;
  order_number: string;
  store: string;
  source: string;
  skus_summary: string;
  titles_summary: string;
  units: number;
  onway_fee: number | null;
  net_payout: number;
}

export type OrderSortCol =
  | "sale_date"
  | "payout_date"
  | "tracking_number"
  | "order_number"
  | "store"
  | "units"
  | "onway_fee"
  | "net_payout";

interface Props {
  rows: AccountantOrderRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sortBy: OrderSortCol;
  sortDir: "asc" | "desc";
  loading: boolean;
  exportingOrders: boolean;
  exportingLines: boolean;
  onPageChange: (page: number) => void;
  onSort: (col: OrderSortCol) => void;
  onExportOrdersCsv: () => void;
  onExportLineItemsCsv: () => void;
}

const AccountantOrdersTab = ({
  rows,
  totalCount,
  page,
  pageSize,
  sortBy,
  sortDir,
  loading,
  exportingOrders,
  exportingLines,
  onPageChange,
  onSort,
  onExportOrdersCsv,
  onExportLineItemsCsv,
}: Props) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const SortHeader = ({
    col,
    label,
    align = "left",
  }: {
    col: OrderSortCol;
    label: string;
    align?: "left" | "right";
  }) => {
    const active = sortBy === col;
    return (
      <th className={`${align === "right" ? "text-right" : "text-left"} px-3 py-2.5 font-semibold whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => onSort(col)}
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
        >
          {label}
          <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
          {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {totalCount.toLocaleString()} delivered shipments · page {page} of {totalPages}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportOrdersCsv}
            disabled={loading || totalCount === 0 || exportingOrders}
          >
            {exportingOrders ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Download CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportLineItemsCsv}
            disabled={loading || totalCount === 0 || exportingLines}
          >
            {exportingLines ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            CSV – line items
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader col="sale_date" label="Delivery date" />
              <SortHeader col="payout_date" label="Expected payout" />
              <SortHeader col="tracking_number" label="Tracking" />
              <SortHeader col="order_number" label="Order #" />
              <SortHeader col="store" label="Store" />
              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">SKU(s)</th>
              <th className="text-left px-3 py-2.5 font-semibold">Product title(s)</th>
              <SortHeader col="units" label="Units" align="right" />
              <SortHeader col="onway_fee" label="Onway fee" align="right" />
              <SortHeader col="net_payout" label="Net payout" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  {loading ? "Loading..." : "No delivered shipments match these filters."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.shipment_id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.sale_date}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{r.payout_date}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.tracking_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">{r.order_number || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{r.store}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.skus_summary}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate" title={r.titles_summary}>
                    {r.titles_summary}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.units}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.onway_fee === null ? "—" : formatMoney(r.onway_fee)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.net_payout)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountantOrdersTab;
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import AccountantFilterBar from "@/components/accountant/AccountantFilterBar";
import AccountantSummaryTab, {
  type SummaryKpis,
  type SummaryPeriodRow,
} from "@/components/accountant/AccountantSummaryTab";
import AccountantOrdersTab, {
  type AccountantOrderRow,
  type OrderSortCol,
} from "@/components/accountant/AccountantOrdersTab";
import AccountantSkuTab, { type AccountantSkuRow } from "@/components/accountant/AccountantSkuTab";
import {
  type AccountantFilters,
  buildCsv,
  formatMoney,
  loadAccountantFilters,
  saveAccountantFilters,
  triggerCsvDownload,
} from "@/lib/accountantUtils";

const EMPTY_KPIS: SummaryKpis = {
  delivered_orders: 0,
  units_sold: 0,
  gross_collected: 0,
  onway_fees: 0,
  failed_orders: 0,
  failed_delivery_fees: 0,
  net_payout: 0,
  pending_payout: 0,
  avg_order_value: 0,
};

const PAGE_SIZE = 50;

const AccountantPortal = () => {
  const [filters, setFilters] = useState<AccountantFilters>(() => loadAccountantFilters());
  const [debouncedSku, setDebouncedSku] = useState(filters.skuSearch);
  const [tab, setTab] = useState<"summary" | "orders" | "sku">("summary");

  // Summary state
  const [kpis, setKpis] = useState<SummaryKpis>(EMPTY_KPIS);
  const [periods, setPeriods] = useState<SummaryPeriodRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Orders state
  const [orders, setOrders] = useState<AccountantOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<OrderSortCol>("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ordersLoading, setOrdersLoading] = useState(false);

  // SKU state
  const [skuRows, setSkuRows] = useState<AccountantSkuRow[]>([]);
  const [skuTotalRev, setSkuTotalRev] = useState(0);
  const [skuTotalUnits, setSkuTotalUnits] = useState(0);
  const [skuLoading, setSkuLoading] = useState(false);

  // Export states
  const [exportingOrders, setExportingOrders] = useState(false);
  const [exportingLines, setExportingLines] = useState(false);

  const updateFilters = (next: AccountantFilters) => {
    setFilters(next);
    saveAccountantFilters(next);
    setPage(1);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSku(filters.skuSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [filters.skuSearch]);

  const invalidRange = !filters.from || !filters.to || filters.from > filters.to;

  // Load summary + KPIs whenever filters change
  useEffect(() => {
    if (invalidRange) return;
    let cancelled = false;
    setSummaryLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("accountant_summary", {
        p_from: filters.from,
        p_to: filters.to,
        p_group_by: filters.groupBy,
        p_store: filters.store,
        p_source: filters.source,
        p_sku_search: debouncedSku || null,
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Failed to load summary");
      } else if (data) {
        const parsed = data as unknown as { kpis?: SummaryKpis; periods?: SummaryPeriodRow[] };
        setKpis(parsed.kpis ?? EMPTY_KPIS);
        setPeriods(parsed.periods ?? []);
      }
      setSummaryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, filters.groupBy, filters.store, filters.source, debouncedSku, invalidRange]);

  // Load paginated orders when Orders tab is active
  useEffect(() => {
    if (tab !== "orders" || invalidRange) return;
    let cancelled = false;
    setOrdersLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("accountant_sales", {
        p_from: filters.from,
        p_to: filters.to,
        p_store: filters.store,
        p_source: filters.source,
        p_sku_search: debouncedSku || null,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Failed to load orders");
      } else if (data) {
        const parsed = data as unknown as { total_count?: number; rows?: AccountantOrderRow[] };
        setOrdersTotal(parsed.total_count ?? 0);
        setOrders(parsed.rows ?? []);
      }
      setOrdersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, filters.from, filters.to, filters.store, filters.source, debouncedSku, sortBy, sortDir, page, invalidRange]);

  // Load By-SKU when SKU tab is active
  useEffect(() => {
    if (tab !== "sku" || invalidRange) return;
    let cancelled = false;
    setSkuLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("accountant_by_sku", {
        p_from: filters.from,
        p_to: filters.to,
        p_store: filters.store,
        p_source: filters.source,
        p_sku_search: debouncedSku || null,
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Failed to load product breakdown");
      } else if (data) {
        const parsed = data as unknown as {
          rows?: AccountantSkuRow[];
          total_revenue?: number;
          total_units?: number;
        };
        setSkuRows(parsed.rows ?? []);
        setSkuTotalRev(parsed.total_revenue ?? 0);
        setSkuTotalUnits(parsed.total_units ?? 0);
      }
      setSkuLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, filters.from, filters.to, filters.store, filters.source, debouncedSku, invalidRange]);

  const handleSort = (col: OrderSortCol) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const handleExportOrdersCsv = useCallback(async () => {
    setExportingOrders(true);
    const { data, error } = await supabase.rpc("accountant_sales", {
      p_from: filters.from,
      p_to: filters.to,
      p_store: filters.store,
      p_source: filters.source,
      p_sku_search: debouncedSku || null,
      p_sort_by: sortBy,
      p_sort_dir: sortDir,
      p_page: 1,
      p_page_size: 50000,
    });
    setExportingOrders(false);
    if (error) {
      toast.error(error.message || "Export failed");
      return;
    }
    const parsed = data as unknown as { rows?: AccountantOrderRow[] };
    const allRows = parsed?.rows ?? [];
    const headers = [
      "Delivery date",
      "Expected payout date",
      "Tracking number",
      "Order number",
      "Store",
      "SKU(s)",
      "Product title(s)",
      "Units",
      "Final price",
      "Onway fee",
      "Net payout",
    ];
    const csvRows = allRows.map((r) => [
      r.sale_date,
      r.payout_date,
      r.tracking_number,
      r.order_number,
      r.store,
      r.skus_summary,
      r.titles_summary,
      String(r.units),
      Number(r.final_price),
      r.onway_fee === null ? "" : Number(r.onway_fee),
      Number(r.net_payout),
    ]);
    triggerCsvDownload(buildCsv(headers, csvRows), `sales_${filters.from}_${filters.to}.csv`);
  }, [filters.from, filters.to, filters.store, filters.source, debouncedSku, sortBy, sortDir]);

  const handleExportLineItemsCsv = useCallback(async () => {
    setExportingLines(true);
    const { data, error } = await supabase.rpc("accountant_export_line_items", {
      p_from: filters.from,
      p_to: filters.to,
      p_store: filters.store,
      p_source: filters.source,
      p_sku_search: debouncedSku || null,
    });
    setExportingLines(false);
    if (error) {
      toast.error(error.message || "Line-item export failed");
      return;
    }
    const items = (data as unknown as Array<{
      tracking_number: string;
      sale_date: string;
      sku: string;
      title: string;
      qty: number;
      attributed_amount: number;
    }>) ?? [];
    const headers = ["Tracking number", "Delivery date", "SKU", "Product title", "Qty", "Attributed amount"];
    const csvRows = items.map((it) => [
      it.tracking_number,
      it.sale_date,
      it.sku,
      it.title,
      String(it.qty),
      Number(it.attributed_amount),
    ]);
    triggerCsvDownload(buildCsv(headers, csvRows), `sales_line_items_${filters.from}_${filters.to}.csv`);
  }, [filters.from, filters.to, filters.store, filters.source, debouncedSku]);

  const kpiCards = [
    { label: "Delivered orders", value: kpis.delivered_orders.toLocaleString() },
    { label: "Units sold", value: kpis.units_sold.toLocaleString() },
    { label: "Gross collected", value: formatMoney(kpis.gross_collected), highlight: true },
    { label: "Delivered fees", value: formatMoney(kpis.onway_fees) },
    {
      label: "Failed delivery fees",
      value: formatMoney(kpis.failed_delivery_fees),
      sub: kpis.failed_orders > 0 ? `${kpis.failed_orders.toLocaleString()} failed` : undefined,
    },
    {
      label: "Paid-out net payout",
      value: formatMoney(kpis.net_payout),
      highlight: true,
      sub: "Due ≤ today, after failed fees",
    },
    {
      label: "Pending payout",
      value: formatMoney(kpis.pending_payout),
      sub: "Next Tue/Fri, not yet paid",
    },
    { label: "Avg order value", value: formatMoney(kpis.avg_order_value) },
  ];

  return (
    <div className="space-y-5">
      <AccountantFilterBar filters={filters} onChange={updateFilters} />

      {invalidRange && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Start date must be on or before end date.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map((c) => (
          <div
            key={c.label}
            className={`bg-card border rounded-lg p-3 ${
              c.highlight ? "border-primary/50" : "border-border"
            }`}
          >
            <div className="text-[11px] font-medium text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums tracking-tight">
              {summaryLoading ? "…" : c.value}
            </div>
            {c.sub && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "summary" | "orders" | "sku")}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="sku">By product (SKU)</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <AccountantSummaryTab
            periods={periods}
            kpis={kpis}
            groupBy={filters.groupBy}
            from={filters.from}
            to={filters.to}
            loading={summaryLoading}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <AccountantOrdersTab
            rows={orders}
            totalCount={ordersTotal}
            page={page}
            pageSize={PAGE_SIZE}
            sortBy={sortBy}
            sortDir={sortDir}
            loading={ordersLoading}
            exportingOrders={exportingOrders}
            exportingLines={exportingLines}
            onPageChange={setPage}
            onSort={handleSort}
            onExportOrdersCsv={handleExportOrdersCsv}
            onExportLineItemsCsv={handleExportLineItemsCsv}
          />
        </TabsContent>

        <TabsContent value="sku" className="mt-4">
          <AccountantSkuTab
            rows={skuRows}
            totalRevenue={skuTotalRev}
            totalUnits={skuTotalUnits}
            from={filters.from}
            to={filters.to}
            loading={skuLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AccountantPortal;
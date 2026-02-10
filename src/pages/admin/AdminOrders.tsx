import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Download, AlertTriangle } from "lucide-react";
import RiskBadge from "@/components/admin/RiskBadge";
import FulfillmentBadge from "@/components/admin/FulfillmentBadge";
import OrdersExportModal from "@/components/admin/OrdersExportModal";

type Tab = "review" | "ready" | "merged" | "canceled";

const DATE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7days" },
];

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  packed: "bg-amber-100 text-amber-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  on_hold: "bg-orange-100 text-orange-800",
  merged: "bg-slate-100 text-slate-500",
};

function getDateRange(filter: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return { from: startOfDay.toISOString() };
  if (filter === "yesterday") {
    const y = new Date(startOfDay);
    y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: startOfDay.toISOString() };
  }
  if (filter === "7days") {
    const d = new Date(startOfDay);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString() };
  }
  return {};
}

interface OrderRow {
  id: string;
  public_order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  region: string;
  total: number;
  status: string;
  assigned_to: string | null;
  tracking_number: string | null;
  is_confirmed: boolean;
  is_fulfilled: boolean;
  risk_score: number;
  risk_level: string;
  risk_reasons: string[];
  review_required: boolean;
  auto_confirmed: boolean;
  tags: string[];
  internal_note: string | null;
  order_items: { image_url: string; quantity: number }[];
}

const AdminOrders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "review";

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [exportOpen, setExportOpen] = useState(false);
  const [counts, setCounts] = useState({ review: 0, ready: 0 });

  const fetchCounts = useCallback(async () => {
    // Needs Review count
    const { count: reviewCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "merged")
      .neq("status", "canceled")
      .neq("status", "returned")
      .or("status.in.(new,on_hold),is_confirmed.eq.false,review_required.eq.true");

    // Ready count
    const { count: readyCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed")
      .eq("is_confirmed", true)
      .eq("review_required", false)
      .neq("status", "merged")
      .lt("risk_score", 25);

    setCounts({
      review: reviewCount || 0,
      ready: readyCount || 0,
    });
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("orders")
      .select("id, public_order_number, created_at, customer_name, customer_phone, city, region, total, status, assigned_to, tracking_number, is_confirmed, is_fulfilled, risk_score, risk_level, risk_reasons, review_required, auto_confirmed, tags, internal_note, order_items(image_url, quantity)");

    // Tab-based filtering
    if (activeTab === "review") {
      query = query
        .neq("status", "merged")
        .neq("status", "canceled")
        .neq("status", "returned")
        .or("status.in.(new,on_hold),is_confirmed.eq.false,review_required.eq.true")
        .order("risk_score", { ascending: false })
        .order("created_at", { ascending: false });
    } else if (activeTab === "ready") {
      query = query
        .eq("status", "confirmed")
        .eq("is_confirmed", true)
        .eq("review_required", false)
        .neq("status", "merged")
        .lt("risk_score", 25)
        .order("created_at", { ascending: false });
    } else if (activeTab === "merged") {
      query = query
        .eq("status", "merged")
        .order("created_at", { ascending: false });
    } else if (activeTab === "canceled") {
      query = query
        .in("status", ["canceled", "returned"])
        .order("created_at", { ascending: false });
    }

    // Date filter
    const dateRange = getDateRange(dateFilter);
    if (dateRange.from) query = query.gte("created_at", dateRange.from);
    if ((dateRange as any).to) query = query.lt("created_at", (dateRange as any).to);

    // Search
    if (search.trim()) {
      query = query.or(
        `public_order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
      );
    }

    const { data } = await query.limit(200);
    setOrders((data as unknown as OrderRow[]) || []);
    setLoading(false);
  }, [activeTab, dateFilter, search]);

  useEffect(() => {
    fetchOrders();
    fetchCounts();
  }, [fetchOrders, fetchCounts]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const goToOrder = (orderId: string) => {
    navigate(`/admin/orders/${orderId}?from=${activeTab}`);
  };

  const isReviewTab = activeTab === "review";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-foreground">Orders</h1>
        <Button onClick={() => setExportOpen(true)} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export to Courier
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        <button
          onClick={() => switchTab("review")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "review"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Needs Review
          {counts.review > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
              {counts.review}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab("ready")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "ready"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Ready
          {counts.ready > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
              {counts.ready}
            </span>
          )}
        </button>
        <button
          onClick={() => switchTab("merged")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "merged"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Merged
        </button>
        <button
          onClick={() => switchTab("canceled")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "canceled"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Canceled/Returned
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search order #, name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <div className="flex gap-1.5">
          {DATE_FILTERS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDateFilter(d.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                dateFilter === d.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : orders.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">
          {activeTab === "review" ? "No orders need review 🎉" : "No orders found"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Order</th>
                <th className="text-left px-4 py-3 font-bold">Date</th>
                <th className="text-left px-4 py-3 font-bold">Customer</th>
                <th className="text-left px-4 py-3 font-bold">Items</th>
                <th className="text-left px-4 py-3 font-bold">Total</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                {isReviewTab && <th className="text-left px-4 py-3 font-bold">Risk</th>}
                <th className="text-left px-4 py-3 font-bold">Fulfillment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => goToOrder(order.id)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold text-primary">{order.public_order_number}</span>
                    {order.tags?.includes("auto_merged") && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">Merged</span>
                    )}
                    {order.auto_confirmed && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-600">Auto</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(order.created_at).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {order.order_items?.slice(0, 4).map((item, i) => (
                        <div key={i} className="w-8 h-8 rounded border border-border overflow-hidden flex-shrink-0">
                          <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {(order.order_items?.length || 0) > 4 && (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          +{order.order_items.length - 4}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold">{Number(order.total).toFixed(1)} ₾</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize w-fit ${statusColor[order.status] || "bg-muted text-foreground"}`}>
                        {order.status.replace("_", " ")}
                      </span>
                      {order.review_required && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 w-fit">
                          Review needed
                        </span>
                      )}
                    </div>
                  </td>
                  {isReviewTab && (
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <RiskBadge riskLevel={order.risk_level} riskScore={order.risk_score} compact />
                        <div className="flex flex-wrap gap-1">
                          {order.risk_reasons?.slice(0, 3).map((r, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground">
                              {r.split(" (")[0]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <FulfillmentBadge isConfirmed={order.is_confirmed} isFulfilled={order.is_fulfilled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OrdersExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
};

export default AdminOrders;

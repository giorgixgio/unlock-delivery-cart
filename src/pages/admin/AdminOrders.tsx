import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

const STATUS_OPTIONS = ["all", "new", "confirmed", "packed", "shipped", "delivered", "canceled", "returned", "on_hold"];

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  packed: "bg-amber-100 text-amber-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  on_hold: "bg-orange-100 text-orange-800",
};

const DATE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7days" },
];

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
  order_items: { image_url: string; quantity: number }[];
}

const AdminOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "total" | "status">("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("id, public_order_number, created_at, customer_name, customer_phone, city, region, total, status, assigned_to, tracking_number, order_items(image_url, quantity)")
      .order(sortField, { ascending: sortAsc });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const dateRange = getDateRange(dateFilter);
    if (dateRange.from) query = query.gte("created_at", dateRange.from);
    if (dateRange.to) query = query.lt("created_at", dateRange.to);

    if (search.trim()) {
      query = query.or(
        `public_order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
      );
    }

    const { data } = await query;
    setOrders((data as unknown as OrderRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, dateFilter, sortField, sortAsc, search]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-extrabold text-foreground">Orders</h1>

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
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/50"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
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
        <p className="text-center py-12 text-muted-foreground">No orders found</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Order</th>
                <th className="text-left px-4 py-3 font-bold cursor-pointer" onClick={() => toggleSort("created_at")}>
                  Date {sortField === "created_at" && (sortAsc ? "↑" : "↓")}
                </th>
                <th className="text-left px-4 py-3 font-bold">Customer</th>
                <th className="text-left px-4 py-3 font-bold">City/Region</th>
                <th className="text-left px-4 py-3 font-bold">Items</th>
                <th className="text-left px-4 py-3 font-bold cursor-pointer" onClick={() => toggleSort("total")}>
                  Total {sortField === "total" && (sortAsc ? "↑" : "↓")}
                </th>
                <th className="text-left px-4 py-3 font-bold cursor-pointer" onClick={() => toggleSort("status")}>
                  Status {sortField === "status" && (sortAsc ? "↑" : "↓")}
                </th>
                <th className="text-left px-4 py-3 font-bold">Assigned</th>
                <th className="text-left px-4 py-3 font-bold">Tracking</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/admin/orders/${order.id}`)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-bold text-primary">{order.public_order_number}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(order.created_at).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{order.city || order.region}</td>
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
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${statusColor[order.status] || "bg-muted text-foreground"}`}>
                      {order.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{order.assigned_to || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{order.tracking_number || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, DollarSign, ShoppingCart, AlertTriangle, CheckCircle, Clock, TruckIcon, XCircle } from "lucide-react";

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  aov: number;
  confirmedOrders: number;
  reviewRequired: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  newOrders: number;
  todayOrders: number;
  todayRevenue: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);

  const fetchStats = useCallback(async () => {
    setSpinning(true);
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, total, status, is_confirmed, review_required, is_fulfilled, created_at");

      if (error) throw error;

      const all = orders || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = all.filter((o) => new Date(o.created_at) >= today);
      const confirmed = all.filter((o) => o.is_confirmed);
      const review = all.filter((o) => o.review_required && !o.is_confirmed);
      const fulfilled = all.filter((o) => o.is_fulfilled);
      const cancelled = all.filter((o) => o.status === "cancelled");
      const newOrders = all.filter((o) => o.status === "new");

      const totalRevenue = confirmed.reduce((s, o) => s + Number(o.total), 0);
      const todayRev = todayOrders.filter((o) => o.is_confirmed).reduce((s, o) => s + Number(o.total), 0);

      setStats({
        totalOrders: all.length,
        totalRevenue,
        aov: confirmed.length > 0 ? totalRevenue / confirmed.length : 0,
        confirmedOrders: confirmed.length,
        reviewRequired: review.length,
        fulfilledOrders: fulfilled.length,
        cancelledOrders: cancelled.length,
        newOrders: newOrders.length,
        todayOrders: todayOrders.length,
        todayRevenue: todayRev,
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 500);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", maximumFractionDigits: 0 }).format(n);

  const cards = stats
    ? [
        { label: "Total Revenue", value: fmt(stats.totalRevenue), icon: DollarSign, accent: "text-emerald-500" },
        { label: "Today Revenue", value: fmt(stats.todayRevenue), icon: DollarSign, accent: "text-emerald-400" },
        { label: "AOV", value: fmt(stats.aov), icon: ShoppingCart, accent: "text-blue-500" },
        { label: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, accent: "text-foreground" },
        { label: "Today Orders", value: stats.todayOrders, icon: Clock, accent: "text-foreground" },
        { label: "Confirmed", value: stats.confirmedOrders, icon: CheckCircle, accent: "text-emerald-500" },
        { label: "Needs Review", value: stats.reviewRequired, icon: AlertTriangle, accent: "text-amber-500" },
        { label: "New", value: stats.newOrders, icon: Clock, accent: "text-blue-400" },
        { label: "Fulfilled", value: stats.fulfilledOrders, icon: TruckIcon, accent: "text-emerald-600" },
        { label: "Cancelled", value: stats.cancelledOrders, icon: XCircle, accent: "text-red-500" },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${spinning ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 h-24" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <c.icon className={`w-3.5 h-3.5 ${c.accent}`} />
                  {c.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

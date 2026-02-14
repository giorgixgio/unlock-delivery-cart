import { useEffect, useState, useCallback } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  RefreshCw, DollarSign, ShoppingCart, AlertTriangle, CheckCircle,
  Clock, TruckIcon, XCircle, Merge, Package, Banknote, CalendarIcon,
} from "lucide-react";

const DELIVERY_FEE = 6.5;

type DateMode = "today" | "custom" | "all";

interface Stats {
  totalRevenue: number;
  deliveryRevenue: number;
  productRevenue: number;
  aov: number;
  confirmedCount: number;
  totalOrders: number;
  needsReview: number;
  confirmed: number;
  fulfilled: number;
  shipped: number;
  newOrders: number;
  onHold: number;
  canceled: number;
  merged: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const fetchStats = useCallback(async () => {
    setSpinning(true);
    try {
      let query = supabase
        .from("orders")
        .select("id, total, status, is_confirmed, review_required, is_fulfilled, created_at");

      if (dateMode === "today" || dateMode === "custom") {
        const day = dateMode === "today" ? new Date() : selectedDate;
        query = query
          .gte("created_at", startOfDay(day).toISOString())
          .lte("created_at", endOfDay(day).toISOString());
      }

      const { data: orders, error } = await query;
      if (error) throw error;
      const all = orders || [];

      // Exclude merged — they're not real orders
      const active = all.filter((o) => o.status !== "merged");
      // "Live" orders = exclude merged + canceled/returned
      const live = active.filter((o) => o.status !== "canceled" && o.status !== "returned");

      const needsReview = live.filter(
        (o) =>
          o.status === "new" || o.status === "on_hold" || !o.is_confirmed || o.review_required
      );

      const confirmedOrders = live.filter((o) => o.is_confirmed && !o.is_fulfilled);
      const fulfilled = live.filter((o) => o.is_fulfilled);
      const shipped = active.filter((o) => o.status === "shipped");
      const canceled = all.filter((o) => o.status === "canceled" || o.status === "returned");
      const merged = all.filter((o) => o.status === "merged");
      const newOrders = live.filter((o) => o.status === "new" && !o.is_confirmed);
      const onHold = live.filter((o) => o.status === "on_hold");

      // Revenue = only confirmed, non-canceled orders
      const revenueOrders = active.filter((o) => o.is_confirmed && o.status !== "canceled" && o.status !== "returned");
      const productRevenue = revenueOrders.reduce((s, o) => s + Number(o.total), 0);
      const deliveryRevenue = revenueOrders.length * DELIVERY_FEE;
      const totalRevenue = productRevenue + deliveryRevenue;
      const aov = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

      setStats({
        totalRevenue,
        deliveryRevenue,
        productRevenue,
        aov,
        confirmedCount: revenueOrders.length,
        totalOrders: live.length,
        needsReview: needsReview.length,
        confirmed: confirmedOrders.length,
        fulfilled: fulfilled.length,
        shipped: shipped.length,
        newOrders: newOrders.length,
        onHold: onHold.length,
        canceled: canceled.length,
        merged: merged.length,
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 500);
    }
  }, [dateMode, selectedDate]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  const gel = (n: number) => `₾${n.toFixed(0)}`;

  const dateLabel =
    dateMode === "today"
      ? "Today"
      : dateMode === "custom"
        ? format(selectedDate, "dd MMM yyyy")
        : "All Time";

  if (loading && !stats) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Showing: <span className="font-semibold text-foreground">{dateLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date mode buttons */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setDateMode("today")}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors",
                dateMode === "today" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              Today
            </button>
            <button
              onClick={() => setDateMode("all")}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors border-l border-border",
                dateMode === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              All Time
            </button>
          </div>

          {/* Date picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(dateMode === "custom" && "border-primary text-primary")}
              >
                <CalendarIcon className="w-4 h-4 mr-1.5" />
                {dateMode === "custom" ? format(selectedDate, "dd MMM") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  if (d) {
                    setSelectedDate(d);
                    setDateMode("custom");
                  }
                }}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={fetchStats}>
            <RefreshCw className={`w-4 h-4 mr-2 ${spinning ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Revenue Section — based on confirmed orders only */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Revenue <span className="text-foreground">({stats.confirmedCount} confirmed orders)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={DollarSign} label="Total Revenue" value={gel(stats.totalRevenue)} accent="text-emerald-500" size="lg" />
          <MetricCard icon={ShoppingCart} label="AOV" value={gel(stats.aov)} accent="text-blue-500" size="lg" />
          <MetricCard icon={Banknote} label="Product Revenue" value={gel(stats.productRevenue)} accent="text-emerald-600" />
          <MetricCard icon={TruckIcon} label={`Delivery (${stats.confirmedCount}×₾${DELIVERY_FEE})`} value={gel(stats.deliveryRevenue)} accent="text-sky-500" />
        </div>
      </section>

      <Separator />

      {/* Order Pipeline */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Order Pipeline <span className="text-foreground">({stats.totalOrders} orders)</span>
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          <MetricCard icon={AlertTriangle} label="Needs Review" value={stats.needsReview} accent="text-amber-500" highlight={stats.needsReview > 0} />
          <MetricCard icon={Clock} label="New" value={stats.newOrders} accent="text-blue-400" />
          <MetricCard icon={AlertTriangle} label="On Hold" value={stats.onHold} accent="text-orange-500" />
          <MetricCard icon={CheckCircle} label="Confirmed" value={stats.confirmed} accent="text-emerald-500" />
          <MetricCard icon={Package} label="Fulfilled" value={stats.fulfilled} accent="text-emerald-600" />
          <MetricCard icon={XCircle} label="Canceled" value={stats.canceled} accent="text-red-400" />
          <MetricCard icon={Merge} label="Merged" value={stats.merged} accent="text-muted-foreground" />
        </div>
      </section>

      <Separator />

      {/* Shipped */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Shipping</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={TruckIcon} label="Shipped" value={stats.shipped} accent="text-purple-500" size="lg" />
        </div>
      </section>
    </div>
  );
};

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  size?: "sm" | "lg";
  highlight?: boolean;
}

const MetricCard = ({ icon: Icon, label, value, accent, size = "sm", highlight }: MetricCardProps) => (
  <Card className={`transition-shadow hover:shadow-md ${highlight ? "ring-2 ring-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${accent}`} />
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <p className={`font-bold ${accent} ${size === "lg" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}>{value}</p>
    </CardContent>
  </Card>
);

export default AdminDashboard;

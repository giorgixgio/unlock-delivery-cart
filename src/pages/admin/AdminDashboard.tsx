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
  TruckIcon, XCircle, Merge, Package, Banknote, CalendarIcon,
} from "lucide-react";
import { DeliveryZoneList } from "@/components/admin/DeliveryZoneList";
import StockoutAlertCard from "@/components/admin/StockoutAlertCard";
import { useViewModifier } from "@/hooks/useViewModifier";

const DELIVERY_FEE = 6.5;

type DateMode = "today" | "custom" | "all";

interface Stats {
  totalRevenue: number;
  deliveryRevenue: number;
  productRevenue: number;
  aov: number;
  confirmedCount: number;
  totalOrders: number;
  totalRealOrders: number;
  activeOrders: number;
  needsReview: number;
  confirmed: number;
  confirmedValid: number;
  rawConfirmed: number;
  successful: number;
  successfulActive: number;
  fulfilled: number;
  shipped: number;
  newOrders: number;
  onHold: number;
  canceled: number;
  merged: number;
  tbilisiCount: number;
  regionCount: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { applyToRevenue, applyToCount, hideBeforeDate, loaded: modifierLoaded } = useViewModifier();

  const fetchStats = useCallback(async () => {
    setSpinning(true);
    try {
      let query = supabase
        .from("orders")
        .select("id, total, shipping_fee, status, is_confirmed, review_required, is_fulfilled, is_tbilisi, created_at");

      if (dateMode === "today" || dateMode === "custom") {
        const day = dateMode === "today" ? new Date() : selectedDate;
        query = query
          .gte("created_at", startOfDay(day).toISOString())
          .lte("created_at", endOfDay(day).toISOString());
      }

      // Hidden history cutoff for restricted accounts (e.g. data-masked admins)
      if (hideBeforeDate) {
        query = query.gte("created_at", hideBeforeDate.toISOString());
      }

      const { data: orders, error } = await query;
      if (error) throw error;
      const all = orders || [];

      // Mutually-exclusive main status buckets
      const canceled = all.filter((o) => o.status === "canceled" || o.status === "returned");
      const merged = all.filter((o) => o.status === "merged");
      // Total real orders = all created in period, excluding merged duplicates.
      // Canceled orders STAY in this cohort (they are real orders).
      const realOrders = all.filter((o) => o.status !== "merged");
      // Active = not canceled, not merged. Used only for Active Confirm Rate.
      const active = all.filter(
        (o) => o.status !== "canceled" && o.status !== "returned" && o.status !== "merged"
      );

      const needsReview = active.filter(
        (o) =>
          o.status === "new" || o.status === "on_hold" || o.status === "pending_bump" || !o.is_confirmed || o.review_required
      );

      const confirmedOrders = active.filter((o) => o.is_confirmed && !o.is_fulfilled);
      const fulfilled = active.filter((o) => o.is_fulfilled);
      const shipped = active.filter((o) => o.status === "shipped");
      const newOrders = active.filter((o) => o.status === "new" && !o.is_confirmed);
      const onHold = active.filter((o) => o.status === "on_hold");

      // Successful = confirmed OR fulfilled (counted once). Used for Lead-to-Confirm.
      // Pull from realOrders so a confirmed-then-canceled order is NOT counted as success.
      const successful = realOrders.filter((o) => (o.is_confirmed || o.is_fulfilled) && o.status !== "canceled" && o.status !== "returned").length;
      const successfulActive = active.filter((o) => o.is_confirmed || o.is_fulfilled).length;

      // Raw confirmed across ALL orders (incl. canceled/merged) — used only to warn
      const rawConfirmedAll = all.filter((o) => o.is_confirmed).length;
      const confirmedValid = active.filter((o) => o.is_confirmed).length;

      // Revenue = active orders only (excludes canceled + merged).
      const revenueOrders = active;
      const totalRevenue = revenueOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const deliveryRevenue = revenueOrders.reduce((s, o) => s + Number(o.shipping_fee || 0), 0);
      const productRevenue = totalRevenue - deliveryRevenue;
      const aov = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

      setStats({
        totalRevenue,
        deliveryRevenue,
        productRevenue,
        aov,
        confirmedCount: revenueOrders.length,
        totalOrders: all.length,
        totalRealOrders: realOrders.length,
        activeOrders: active.length,
        needsReview: needsReview.length,
        confirmed: confirmedOrders.length,
        confirmedValid,
        rawConfirmed: rawConfirmedAll,
        successful,
        successfulActive,
        fulfilled: fulfilled.length,
        shipped: shipped.length,
        newOrders: newOrders.length,
        onHold: onHold.length,
        canceled: canceled.length,
        merged: merged.length,
        tbilisiCount: active.filter((o) => o.is_tbilisi).length,
        regionCount: active.filter((o) => !o.is_tbilisi).length,
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 500);
    }
  }, [dateMode, selectedDate, hideBeforeDate]);

  useEffect(() => {
    if (!modifierLoaded) return;
    setLoading(true);
    fetchStats();
  }, [fetchStats, modifierLoaded]);

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
          <DeliveryZoneList />
        </div>
      </div>

      <StockoutAlertCard />

      {/* Revenue — all live orders (review + confirmed) */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Revenue <span className="text-foreground">({applyToCount(stats.activeOrders)} active orders · {applyToCount(stats.tbilisiCount)} Tbilisi · {applyToCount(stats.regionCount)} Region)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={DollarSign} label="Total Revenue" value={gel(applyToRevenue(stats.totalRevenue))} accent="text-emerald-500" size="lg" />
          <MetricCard icon={ShoppingCart} label="AOV" value={gel(applyToCount(stats.activeOrders) > 0 ? applyToRevenue(stats.totalRevenue) / applyToCount(stats.activeOrders) : 0)} accent="text-blue-500" size="lg" />
          <MetricCard icon={Banknote} label="Product Revenue" value={gel(applyToRevenue(stats.productRevenue))} accent="text-emerald-600" />
          <MetricCard icon={TruckIcon} label="Delivery Revenue" value={gel(applyToRevenue(stats.deliveryRevenue))} accent="text-sky-500" />
        </div>
      </section>

      <Separator />

      {/* Order Status & Flags */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Order Status & Flags
          </h2>
          <span className="text-[10px] text-muted-foreground italic">Flags may overlap with statuses</span>
        </div>

        {/* Main statuses (mutually exclusive) */}
        <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Statuses</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard icon={CheckCircle} label="Confirmed" value={applyToCount(stats.confirmed)} accent="text-emerald-500" />
          <MetricCard icon={Package} label="Fulfilled" value={applyToCount(stats.fulfilled)} accent="text-emerald-600" />
          <MetricCard icon={XCircle} label="Canceled" value={applyToCount(stats.canceled)} accent="text-red-400" />
          <MetricCard icon={Merge} label="Merged" value={applyToCount(stats.merged)} accent="text-muted-foreground" />
        </div>

        {/* Operational flags (can overlap) */}
        <div className="mt-5 mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Operational Flags</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            icon={AlertTriangle}
            label="Needs Operator Action"
            value={applyToCount(stats.needsReview)}
            accent="text-amber-600"
            highlight={stats.needsReview > 0}
            subtext={`Needs Review: ${applyToCount(stats.needsReview)} · On Hold: ${applyToCount(stats.onHold)} · flags may overlap`}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Needs Review"
            value={applyToCount(stats.needsReview)}
            accent="text-amber-500"
            subtext="Includes on-hold orders"
          />
          <MetricCard
            icon={AlertTriangle}
            label="On Hold"
            value={applyToCount(stats.onHold)}
            accent="text-orange-500"
            subtext="Can also be Needs Review"
          />
        </div>

        {/* Derived — cohort rates based on order creation date */}
        <div className="mt-5 mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Derived</div>
        <p className="text-[10px] text-muted-foreground italic mb-3">
          Rates are based on order creation date. Later confirmations update the original order's day.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {(() => {
            const totalReal = stats.totalRealOrders;
            const activeOrders = stats.activeOrders;
            const successful = stats.successful;
            const successfulActive = stats.successfulActive;
            const leadRate = totalReal > 0 ? Math.min(1, successful / totalReal) : 0;
            const activeRate = activeOrders > 0 ? Math.min(1, successfulActive / activeOrders) : 0;
            const cancelRate = totalReal > 0 ? stats.canceled / totalReal : 0;
            const needsActionRate = totalReal > 0 ? stats.needsReview / totalReal : 0;
            return (
              <>
                <MetricCard
                  icon={ShoppingCart}
                  label="Total Real Orders"
                  value={applyToCount(totalReal)}
                  accent="text-foreground"
                  subtext={`Created in selected period · excludes ${applyToCount(stats.merged)} merged`}
                />
                <MetricCard
                  icon={ShoppingCart}
                  label="Active Orders"
                  value={applyToCount(activeOrders)}
                  accent="text-blue-500"
                  subtext={`${applyToCount(stats.totalOrders)} total − ${applyToCount(stats.canceled)} canceled − ${applyToCount(stats.merged)} merged`}
                />
                <MetricCard
                  icon={CheckCircle}
                  label="Lead-to-Confirm Rate"
                  value={totalReal > 0 ? `${(leadRate * 100).toFixed(1)}%` : "—"}
                  accent="text-emerald-500"
                  size="lg"
                  subtext={`${applyToCount(successful)} / ${applyToCount(totalReal)} total orders · confirmed or fulfilled (canceled included in denominator)`}
                />
                <MetricCard
                  icon={CheckCircle}
                  label="Active Confirm Rate"
                  value={activeOrders > 0 ? `${(activeRate * 100).toFixed(1)}%` : "—"}
                  accent="text-emerald-600"
                  subtext={`${applyToCount(successfulActive)} / ${applyToCount(activeOrders)} active · operational view, excludes canceled`}
                />
                <MetricCard
                  icon={XCircle}
                  label="Cancel Rate"
                  value={totalReal > 0 ? `${(cancelRate * 100).toFixed(1)}%` : "—"}
                  accent="text-red-400"
                  subtext={`${applyToCount(stats.canceled)} canceled / ${applyToCount(totalReal)} total orders`}
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Needs Action Rate"
                  value={totalReal > 0 ? `${(needsActionRate * 100).toFixed(1)}%` : "—"}
                  accent="text-amber-500"
                  subtext={`${applyToCount(stats.needsReview)} pending / ${applyToCount(totalReal)} total orders`}
                />
              </>
            );
          })()}
        </div>
      </section>



      <Separator />

      {/* Shipped */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Shipping</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={TruckIcon} label="Shipped" value={applyToCount(stats.shipped)} accent="text-purple-500" size="lg" />
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
  subtext?: string;
}

const MetricCard = ({ icon: Icon, label, value, accent, size = "sm", highlight, subtext }: MetricCardProps) => (
  <Card className={`transition-shadow hover:shadow-md ${highlight ? "ring-2 ring-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${accent}`} />
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <p className={`font-bold ${accent} ${size === "lg" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}>{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{subtext}</p>}
    </CardContent>
  </Card>
);

export default AdminDashboard;

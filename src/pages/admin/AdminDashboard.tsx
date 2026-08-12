import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  RefreshCw, DollarSign, ShoppingCart, AlertTriangle, CheckCircle,
  TruckIcon, XCircle, Merge, Package, Banknote, CalendarIcon, PhoneOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CANCEL_REASON_LABEL } from "@/lib/cancelReasons";
import { DeliveryZoneList } from "@/components/admin/DeliveryZoneList";
import StockoutAlertCard from "@/components/admin/StockoutAlertCard";
import { useViewModifier } from "@/hooks/useViewModifier";
import { tbilisiStartOfDay, tbilisiEndOfDay } from "@/lib/tbilisiTime";
import { DashboardStyles, CountUp } from "@/components/admin/DashboardVisuals";

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
  autoConfirmed: number;
  operatorConfirmed: number;
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
  eodRemaining: number;
  retryNeeded: number;
  cancelReasonBreakdown: Array<{ reason: string; count: number }>;
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
        .select("id, total, shipping_fee, status, is_confirmed, auto_confirmed, review_required, is_fulfilled, is_tbilisi, created_at, call_outcome, call_outcome_updated_by, call_attempt_count, next_call_after, final_cancel_reason")
        .or("is_return.is.null,is_return.eq.false");


      if (dateMode === "today" || dateMode === "custom") {
        const day = dateMode === "today" ? new Date() : selectedDate;
        query = query
          .gte("created_at", tbilisiStartOfDay(day).toISOString())
          .lte("created_at", tbilisiEndOfDay(day).toISOString());
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

      // Split confirmed orders into system-confirmed vs operator-confirmed.
      // An order counts as operator-confirmed when an operator explicitly set
      // call_outcome = 'confirmed'; everything else confirmed is automatic.
      const confirmedActive = active.filter((o) => o.is_confirmed);
      const operatorConfirmed = confirmedActive.filter(
        (o) => (o as any).call_outcome === "confirmed" && (o as any).call_outcome_updated_by
      ).length;
      const autoConfirmed = confirmedActive.length - operatorConfirmed;


      // Revenue = active orders only (excludes canceled + merged).
      const revenueOrders = active;
      const totalRevenue = revenueOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const deliveryRevenue = revenueOrders.reduce((s, o) => s + Number(o.shipping_fee || 0), 0);
      const productRevenue = totalRevenue - deliveryRevenue;
      const aov = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

      // End-of-day unresolved: still in operator workflow (not confirmed/canceled/fulfilled/merged),
      // and any scheduled callback is already in the past (or unset).
      const nowMs = Date.now();
      const unresolved = realOrders.filter((o) => {
        if (o.is_confirmed || o.is_fulfilled) return false;
        if (o.status === "canceled" || o.status === "returned") return false;
        const nca = (o as any).next_call_after ? new Date((o as any).next_call_after).getTime() : null;
        if (nca && nca > nowMs) return false; // future callback = resolved-for-now
        return true;
      });
      const retryNeeded = unresolved.filter((o) => Number((o as any).call_attempt_count || 0) > 0).length;

      // Cancellation reason breakdown
      const reasonMap = new Map<string, number>();
      for (const o of canceled) {
        const r = (o as any).final_cancel_reason || "unspecified";
        reasonMap.set(r, (reasonMap.get(r) || 0) + 1);
      }
      const cancelReasonBreakdown = Array.from(reasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

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
        autoConfirmed,
        operatorConfirmed,

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
        eodRemaining: unresolved.length,
        retryNeeded,
        cancelReasonBreakdown,
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
      <div className="dash-glow p-6 space-y-6">
        <DashboardStyles />
        <div className="h-8 w-40 bg-white/5 animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-white/5 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="dash-glow p-4 sm:p-6 space-y-6 sm:space-y-8 -m-4 sm:-m-6">
      <DashboardStyles />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm dg-muted mt-0.5 dg-live">
            <span className="dg-dot" />
            Showing: <span className="font-semibold text-white">{dateLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date mode buttons */}
          <div className="flex dg-chip text-sm">
            <button
              onClick={() => setDateMode("today")}
              data-active={dateMode === "today"}
              className="px-3 py-1.5 font-medium transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setDateMode("all")}
              data-active={dateMode === "all"}
              className="px-3 py-1.5 font-medium transition-colors border-l border-white/10"
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
                className={cn(
                  "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white",
                  dateMode === "custom" && "border-sky-400/60 text-sky-300"
                )}
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

          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${spinning ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <DeliveryZoneList />
        </div>
      </div>

      <StockoutAlertCard />

      {/* Revenue — all live orders (review + confirmed) */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted mb-3">
          Revenue <span className="text-slate-200">({applyToCount(stats.activeOrders)} active orders · {applyToCount(stats.tbilisiCount)} Tbilisi · {applyToCount(stats.regionCount)} Region)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={DollarSign} label="Total Revenue" numeric={applyToRevenue(stats.totalRevenue)} format={gel} size="lg" hero />
          <MetricCard icon={ShoppingCart} label="AOV" numeric={applyToCount(stats.activeOrders) > 0 ? applyToRevenue(stats.totalRevenue) / applyToCount(stats.activeOrders) : 0} format={gel} size="lg" hero />
          <MetricCard icon={Banknote} label="Product Revenue" numeric={applyToRevenue(stats.productRevenue)} format={gel} accent="text-emerald-400" />
          <MetricCard icon={TruckIcon} label="Delivery Revenue" numeric={applyToRevenue(stats.deliveryRevenue)} format={gel} accent="text-sky-400" />
        </div>
      </section>

      <div className="dg-sep" />

      {/* Order Status & Flags */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted">
            Order Status & Flags
          </h2>
          <span className="text-[10px] dg-muted italic">Flags may overlap with statuses</span>
        </div>

        {/* Main statuses (mutually exclusive) */}
        <div className="mb-2 text-[11px] font-medium dg-muted uppercase tracking-wide">Statuses</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            icon={CheckCircle}
            label="Confirmed"
            numeric={applyToCount(stats.confirmed)}
            accent="text-emerald-400"
            subtext={`Auto: ${applyToCount(stats.autoConfirmed)} · Operator: ${applyToCount(stats.operatorConfirmed)}`}
          />

          <MetricCard icon={Package} label="Fulfilled" numeric={applyToCount(stats.fulfilled)} accent="text-emerald-300" />
          <MetricCard icon={XCircle} label="Canceled" numeric={applyToCount(stats.canceled)} accent="text-red-400" />
          <MetricCard icon={Merge} label="Merged" numeric={applyToCount(stats.merged)} accent="text-slate-400" />
        </div>

        {/* Operational flags (can overlap) */}
        <div className="mt-5 mb-2 text-[11px] font-medium dg-muted uppercase tracking-wide">Operational Flags</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            icon={AlertTriangle}
            label="Needs Operator Action"
            numeric={applyToCount(stats.needsReview)}
            accent="text-amber-400"
            highlight={stats.needsReview > 0}
            subtext={`Needs Review: ${applyToCount(stats.needsReview)} · On Hold: ${applyToCount(stats.onHold)} · flags may overlap`}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Needs Review"
            numeric={applyToCount(stats.needsReview)}
            accent="text-amber-300"
            subtext="Includes on-hold orders"
          />
          <MetricCard
            icon={AlertTriangle}
            label="On Hold"
            numeric={applyToCount(stats.onHold)}
            accent="text-orange-400"
            subtext="Can also be Needs Review"
          />
        </div>

        {/* Derived — cohort rates based on order creation date */}
        <div className="mt-5 mb-2 text-[11px] font-medium dg-muted uppercase tracking-wide">Derived</div>
        <p className="text-[10px] dg-muted italic mb-3">
          Cohort: orders <b>created</b> in the selected Tbilisi day (00:00–24:00, UTC+4), including auto-confirmed ones.
          Later confirmations update the original order's day. For work operators did on a given day
          (including calls on older orders), see{" "}
          <Link to="/admin/operator-stats" className="underline text-sky-300">Operator Stats</Link>.
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
            const pct = (n: number) => `${n.toFixed(1)}%`;
            return (
              <>
                <MetricCard
                  icon={ShoppingCart}
                  label="Total Real Orders"
                  numeric={applyToCount(totalReal)}
                  accent="text-slate-100"
                  subtext={`Created in selected period · excludes ${applyToCount(stats.merged)} merged`}
                />
                <MetricCard
                  icon={ShoppingCart}
                  label="Active Orders"
                  numeric={applyToCount(activeOrders)}
                  accent="text-blue-400"
                  subtext={`${applyToCount(stats.totalOrders)} total − ${applyToCount(stats.canceled)} canceled − ${applyToCount(stats.merged)} merged`}
                />
                <MetricCard
                  icon={CheckCircle}
                  label="Lead-to-Confirm Rate"
                  numeric={totalReal > 0 ? leadRate * 100 : undefined}
                  format={pct}
                  value={totalReal > 0 ? undefined : "—"}
                  size="lg"
                  hero
                  subtext={`${applyToCount(successful)} / ${applyToCount(totalReal)} total orders · confirmed or fulfilled (canceled included in denominator)`}
                />
                <MetricCard
                  icon={CheckCircle}
                  label="Active Confirm Rate"
                  numeric={activeOrders > 0 ? activeRate * 100 : undefined}
                  format={pct}
                  value={activeOrders > 0 ? undefined : "—"}
                  accent="text-emerald-400"
                  subtext={`${applyToCount(successfulActive)} / ${applyToCount(activeOrders)} active · operational view, excludes canceled`}
                />
                <MetricCard
                  icon={XCircle}
                  label="Cancel Rate"
                  numeric={totalReal > 0 ? cancelRate * 100 : undefined}
                  format={pct}
                  value={totalReal > 0 ? undefined : "—"}
                  accent="text-red-400"
                  subtext={`${applyToCount(stats.canceled)} canceled / ${applyToCount(totalReal)} total orders`}
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Needs Action Rate"
                  numeric={totalReal > 0 ? needsActionRate * 100 : undefined}
                  format={pct}
                  value={totalReal > 0 ? undefined : "—"}
                  accent="text-amber-300"
                  subtext={`${applyToCount(stats.needsReview)} pending / ${applyToCount(totalReal)} total orders`}
                />
              </>
            );
          })()}
        </div>
      </section>


      <div className="dg-sep" />

      {/* End-of-Day / Call attempts */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted mb-3">
          End of Day & Call Attempts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Link to="/admin/orders?filter=unresolved" className="block">
            <MetricCard
              icon={AlertTriangle}
              label="End of Day Remaining"
              numeric={applyToCount(stats.eodRemaining)}
              accent="text-amber-400"
              highlight={stats.eodRemaining > 0}
              size="lg"
              subtext="Not confirmed, canceled, fulfilled or merged · excludes future callbacks"
            />
          </Link>
          <Link to="/admin/orders?filter=retry" className="block">
            <MetricCard
              icon={PhoneOff}
              label="Retry Needed"
              numeric={applyToCount(stats.retryNeeded)}
              accent="text-orange-400"
              subtext="No-answer attempts pending finalization"
            />
          </Link>
          <MetricCard
            icon={XCircle}
            label="Canceled after Attempts"
            numeric={applyToCount(stats.cancelReasonBreakdown.find((r) => r.reason === "no_answer_after_attempts")?.count || 0)}
            accent="text-red-400"
            subtext="Finalized after max no-answer attempts"
          />
        </div>

        {stats.cancelReasonBreakdown.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-medium dg-muted uppercase tracking-wide">
              Cancellation Reasons
            </div>
            <div className="dg-card p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stats.cancelReasonBreakdown.map((r) => (
                <div key={r.reason} className="flex items-center justify-between text-sm border-b border-white/5 last:border-0 py-1.5">
                  <span className="dg-muted truncate pr-2">
                    {CANCEL_REASON_LABEL[r.reason] || r.reason}
                  </span>
                  <span className="font-bold tabular-nums text-slate-100">{applyToCount(r.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="dg-sep" />


      {/* Shipped */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted mb-3">Shipping</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={TruckIcon} label="Shipped" numeric={applyToCount(stats.shipped)} accent="text-purple-400" size="lg" />
        </div>
      </section>
    </div>
  );
};

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value?: string | number;
  numeric?: number;
  format?: (n: number) => string;
  accent?: string;
  size?: "sm" | "lg";
  highlight?: boolean;
  hero?: boolean;
  subtext?: string;
}

const MetricCard = ({
  icon: Icon,
  label,
  value,
  numeric,
  format: fmt,
  accent = "text-slate-100",
  size = "sm",
  highlight,
  hero,
  subtext,
}: MetricCardProps) => (
  <div className={cn("dg-card p-3 sm:p-4 h-full", hero && "dg-card-hero", highlight && "dg-card-alert")}>
    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
      <Icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0", hero ? "text-sky-300" : accent)} />
      <span className="text-[11px] sm:text-xs font-medium dg-muted truncate">{label}</span>
    </div>
    <p
      className={cn(
        "font-bold tabular-nums",
        hero ? "dg-grad-text" : accent,
        size === "lg" ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
      )}
    >
      {numeric !== undefined ? <CountUp value={numeric} format={fmt} /> : value}
    </p>
    {subtext && <p className="text-[10px] dg-muted mt-1 leading-tight">{subtext}</p>}
  </div>
);

export default AdminDashboard;


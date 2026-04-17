import { useState } from "react";
import { format } from "date-fns";
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

/**
 * Static demo dashboard.
 * Visually identical to AdminDashboard but every metric is hardcoded to 0.
 * No Supabase queries, no contexts that read sales data — fully inert UI
 * served only to the demo account (lado@bigmart.ge).
 */

const DELIVERY_FEE = 6.5;

type DateMode = "today" | "custom" | "all";

const AdminDemoDashboard = () => {
  const [spinning, setSpinning] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const gel = (n: number) => `₾${n.toFixed(0)}`;

  const dateLabel =
    dateMode === "today"
      ? "Today"
      : dateMode === "custom"
        ? format(selectedDate, "dd MMM yyyy")
        : "All Time";

  const handleRefresh = () => {
    // Cosmetic only — no data fetch.
    setSpinning(true);
    setTimeout(() => setSpinning(false), 600);
  };

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

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className={`w-4 h-4 mr-2 ${spinning ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Revenue */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Revenue <span className="text-foreground">(0 orders · 0 Tbilisi · 0 Region)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={DollarSign} label="Total Revenue" value={gel(0)} accent="text-emerald-500" size="lg" />
          <MetricCard icon={ShoppingCart} label="AOV" value={gel(0)} accent="text-blue-500" size="lg" />
          <MetricCard icon={Banknote} label="Product Revenue" value={gel(0)} accent="text-emerald-600" />
          <MetricCard icon={TruckIcon} label={`Delivery (0×₾${DELIVERY_FEE})`} value={gel(0)} accent="text-sky-500" />
        </div>
      </section>

      <Separator />

      {/* Order Pipeline */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Order Pipeline
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <MetricCard icon={AlertTriangle} label="Needs Review" value={0} accent="text-amber-500" />
          <MetricCard icon={AlertTriangle} label="On Hold" value={0} accent="text-orange-500" />
          <MetricCard icon={CheckCircle} label="Confirmed" value={0} accent="text-emerald-500" />
          <MetricCard icon={Package} label="Fulfilled" value={0} accent="text-emerald-600" />
          <MetricCard icon={XCircle} label="Canceled" value={0} accent="text-red-400" />
          <MetricCard icon={Merge} label="Merged" value={0} accent="text-muted-foreground" />
        </div>
      </section>

      <Separator />

      {/* Shipped */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Shipping</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={TruckIcon} label="Shipped" value={0} accent="text-purple-500" size="lg" />
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
}

const MetricCard = ({ icon: Icon, label, value, accent, size = "sm" }: MetricCardProps) => (
  <Card className="transition-shadow hover:shadow-md">
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${accent}`} />
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <p className={`font-bold ${accent} ${size === "lg" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}>{value}</p>
    </CardContent>
  </Card>
);

export default AdminDemoDashboard;

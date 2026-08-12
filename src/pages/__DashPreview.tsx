import { DashboardStyles, CountUp } from "@/components/admin/DashboardVisuals";
import { DollarSign, ShoppingCart, Banknote, TruckIcon, CheckCircle, XCircle, Merge, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const Card = ({ icon: Icon, label, numeric, format, accent = "text-slate-100", size = "sm", hero, highlight, subtext }: any) => (
  <div className={cn("dg-card p-3 sm:p-4 h-full", hero && "dg-card-hero", highlight && "dg-card-alert")}>
    <div className="flex items-center gap-2 mb-2">
      <Icon className={cn("w-4 h-4 shrink-0", hero ? "text-sky-300" : accent)} />
      <span className="text-xs font-medium dg-muted truncate">{label}</span>
    </div>
    <p className={cn("font-bold tabular-nums", hero ? "dg-grad-text" : accent, size === "lg" ? "text-3xl" : "text-xl")}>
      <CountUp value={numeric} format={format} />
    </p>
    {subtext && <p className="text-[10px] dg-muted mt-1 leading-tight">{subtext}</p>}
  </div>
);

const gel = (n: number) => `₾${n.toFixed(0)}`;

export default function DashPreview() {
  return (
    <div className="dash-glow p-6 space-y-8">
      <DashboardStyles />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm dg-muted mt-0.5 dg-live"><span className="dg-dot" />Showing: <span className="font-semibold text-white">Today</span></p>
        </div>
        <div className="flex dg-chip text-sm">
          <button data-active className="px-3 py-1.5 font-medium">Today</button>
          <button className="px-3 py-1.5 font-medium border-l border-white/10">All Time</button>
        </div>
      </div>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider dg-muted mb-3">Revenue</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card icon={DollarSign} label="Total Revenue" numeric={18420} format={gel} size="lg" hero />
          <Card icon={ShoppingCart} label="AOV" numeric={64} format={gel} size="lg" hero />
          <Card icon={Banknote} label="Product Revenue" numeric={15200} format={gel} accent="text-emerald-400" />
          <Card icon={TruckIcon} label="Delivery Revenue" numeric={3220} format={gel} accent="text-sky-400" />
        </div>
      </section>
      <div className="dg-sep" />
      <section>
        <div className="grid grid-cols-4 gap-4">
          <Card icon={CheckCircle} label="Confirmed" numeric={212} accent="text-emerald-400" subtext="Auto: 180 · Operator: 32" />
          <Card icon={Package} label="Fulfilled" numeric={140} accent="text-emerald-300" />
          <Card icon={XCircle} label="Canceled" numeric={18} accent="text-red-400" />
          <Card icon={Merge} label="Merged" numeric={4} accent="text-slate-400" />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-5">
          <Card icon={AlertTriangle} label="Needs Operator Action" numeric={26} accent="text-amber-400" highlight subtext="Needs Review: 26 · On Hold: 4" />
          <Card icon={AlertTriangle} label="Needs Review" numeric={26} accent="text-amber-300" />
          <Card icon={AlertTriangle} label="On Hold" numeric={4} accent="text-orange-400" />
        </div>
      </section>
    </div>
  );
}

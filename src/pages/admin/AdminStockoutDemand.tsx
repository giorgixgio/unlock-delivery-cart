import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertTriangle, PackageX, Phone, Users, TrendingDown, Copy, ExternalLink } from "lucide-react";
import {
  fetchStockoutAttempts, aggregateByProduct, updateStockoutStatus, isStockoutAlert,
  type StockoutAttemptRow, type StockoutProductAgg,
} from "@/lib/stockoutService";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ProductInfo { id: string; title: string; price: number; image?: string | null; available?: boolean | null; }

const STATUS_OPTIONS = [
  { key: "reviewed", label: "Mark reviewed", color: "bg-blue-100 text-blue-800" },
  { key: "ad_turned_off", label: "Ad turned off", color: "bg-purple-100 text-purple-800" },
  { key: "restock_needed", label: "Restock needed", color: "bg-amber-100 text-amber-800" },
  { key: "ignored", label: "Ignore", color: "bg-muted text-muted-foreground" },
];

const AdminStockoutDemand = () => {
  const [rows, setRows] = useState<StockoutAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Record<string, ProductInfo>>({});
  const [stockMap, setStockMap] = useState<Record<string, boolean>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter");

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStockoutAttempts(7);
      setRows(data);

      const ids = Array.from(new Set(data.map((r) => r.product_id).filter(Boolean))) as string[];
      if (ids.length) {
          const { data: prods } = await supabase
          .from("products")
            .select("id, title, price, image, available")
          .in("id", ids);
        const map: Record<string, ProductInfo> = {};
        (prods || []).forEach((p: any) => (map[p.id] = p));
        setProducts(map);

        const { data: overrides } = await supabase
          .from("product_stock_overrides")
          .select("product_id, available")
          .in("product_id", ids);
        const sm: Record<string, boolean> = {};
        Object.values(map).forEach((p) => {
          sm[p.id] = p.available !== false;
        });
        (overrides || []).forEach((o: any) => (sm[o.product_id] = o.available !== false));
        setStockMap(sm);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const aggregated = useMemo(() => aggregateByProduct(rows), [rows]);
  const alerts = useMemo(() => aggregated.filter(isStockoutAlert), [aggregated]);

  const visible = filter === "alerts" ? alerts : aggregated;

  // Top cards (today)
  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const todayRows = rows.filter((r) => new Date(r.last_attempt_at).getTime() >= todayMs);
  const totalAttemptsToday = todayRows.reduce((s, r) => s + r.attempt_count, 0);
  const uniquePhonesToday = new Set(todayRows.map((r) => r.phone_normalized).filter(Boolean)).size;
  const distinctProductsToday = new Set(todayRows.map((r) => r.product_id || r.sku).filter(Boolean)).size;
  const topToday = aggregated.find((a) => a.attemptsToday > 0);

  const estLostRevenue = aggregated.reduce((s, a) => {
    const price = (a.productId && products[a.productId]?.price) || 0;
    return s + price * a.uniquePhones7d;
  }, 0);

  const updateStatus = async (ids: string[], status: string) => {
    try {
      await updateStockoutStatus(ids, status);
      toast({ title: "Updated" });
      load();
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <PackageX className="w-6 h-6 text-amber-600" />
            Stockout Demand
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Buyer intent on sold-out products. Use this to spot Meta ads that need to be paused.
          </p>
        </div>
        <div className="flex gap-2">
          {filter === "alerts" ? (
            <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>Show all</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSearchParams({ filter: "alerts" })}>
              <AlertTriangle className="w-4 h-4 mr-1.5" /> Alerts only ({alerts.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Top cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={PackageX} label="Attempts today" value={totalAttemptsToday} accent="text-amber-600" />
        <StatCard icon={Phone} label="Unique phones today" value={uniquePhonesToday} accent="text-blue-600" />
        <StatCard icon={Users} label="Products" value={distinctProductsToday} accent="text-purple-600" />
        <StatCard icon={AlertTriangle} label="Top stockout" value={topToday?.productName?.slice(0, 14) || "—"} accent="text-orange-600" small />
        <StatCard icon={TrendingDown} label="Est. lost revenue (7d)" value={`₾${estLostRevenue.toFixed(0)}`} accent="text-red-600" />
      </div>

      {/* Alerts banner */}
      {alerts.length > 0 && filter !== "alerts" && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 text-sm">
              <strong>{alerts.length}</strong> sold-out SKU{alerts.length === 1 ? "" : "s"} {alerts.length === 1 ? "is" : "are"} still receiving order attempts.
              Suggested action: check active Meta ads and turn them off, or restock.
            </div>
            <Button size="sm" variant="outline" onClick={() => setSearchParams({ filter: "alerts" })}>View</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Today</TableHead>
                <TableHead className="text-right">Unique today</TableHead>
                <TableHead className="text-right">7d</TableHead>
                <TableHead className="text-right">Est. lost</TableHead>
                <TableHead>Last attempt</TableHead>
                <TableHead>Top campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && visible.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No stockout attempts yet.</TableCell></TableRow>
              )}
              {visible.map((a) => {
                const product = a.productId ? products[a.productId] : null;
                const inStock = a.productId ? stockMap[a.productId] !== false : true;
                const lost = (product?.price || 0) * a.uniquePhones7d;
                const alert = isStockoutAlert(a);
                return (
                  <TableRow key={a.productId || a.sku || Math.random()} className={alert ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {product?.image && <img src={product.image} alt="" className="w-8 h-8 rounded object-cover" />}
                        <div className="min-w-0">
                          <div className="truncate max-w-[200px]">{a.productName || product?.title || "Unknown"}</div>
                          {alert && <Badge variant="destructive" className="text-[10px] mt-0.5">Alert</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.sku || "—"}</TableCell>
                    <TableCell>
                      {a.productId == null ? "—" : inStock ? (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300">In stock</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-700 border-red-300">Out</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{a.attemptsToday}</TableCell>
                    <TableCell className="text-right">{a.uniquePhonesToday}</TableCell>
                    <TableCell className="text-right">{a.attempts7d}</TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">₾{lost.toFixed(0)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(a.lastAttemptAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[140px] truncate" title={a.topCampaign || ""}>
                      {a.topCampaign || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{a.worstStatus.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {STATUS_OPTIONS.map((s) => (
                          <Button key={s.key} size="sm" variant="ghost" className="h-7 text-xs px-2"
                            onClick={() => updateStatus(a.attemptIds, s.key)}>
                            {s.label}
                          </Button>
                        ))}
                        {a.sku && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                            onClick={() => { navigator.clipboard.writeText(a.sku!); toast({ title: "SKU copied" }); }}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                        {a.productId && (
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs px-2">
                            <Link to={`/admin/products?focus=${a.productId}`}>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  small?: boolean;
}

const StatCard = ({ icon: Icon, label, value, accent, small }: StatCardProps) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn("w-3.5 h-3.5 shrink-0", accent)} />
        <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <p className={cn("font-bold", accent, small ? "text-sm truncate" : "text-xl")}>{value}</p>
    </CardContent>
  </Card>
);

export default AdminStockoutDemand;

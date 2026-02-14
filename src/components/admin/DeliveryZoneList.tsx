import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Package } from "lucide-react";


interface ZoneOrder {
  id: string;
  public_order_number: string;
  customer_name: string;
  customer_phone: string;
  normalized_city: string | null;
  normalized_address: string | null;
  city: string;
  address_line1: string;
  is_tbilisi: boolean;
  is_confirmed: boolean;
  review_required: boolean;
  status: string;
  total: number;
  created_at: string;
}

interface CityGroup {
  city: string;
  orders: ZoneOrder[];
}

export const DeliveryZoneList = () => {
  const [orders, setOrders] = useState<ZoneOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("orders")
      .select("id, public_order_number, customer_name, customer_phone, normalized_city, normalized_address, city, address_line1, is_tbilisi, is_confirmed, review_required, status, total, created_at")
      .not("status", "in", '("merged","canceled","returned")')
      .gte("created_at", today.toISOString())
      .order("is_tbilisi", { ascending: false })
      .order("normalized_city")
      .order("normalized_address");

    if (!error && data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchOrders();
  }, [open]);

  // Group by city
  const grouped: CityGroup[] = [];
  const cityMap = new Map<string, ZoneOrder[]>();
  for (const o of orders) {
    const key = o.normalized_city || o.city || "Unknown";
    if (!cityMap.has(key)) cityMap.set(key, []);
    cityMap.get(key)!.push(o);
  }

  // Tbilisi first, then alphabetical
  const sortedCities = Array.from(cityMap.keys()).sort((a, b) => {
    if (a === "თბილისი") return -1;
    if (b === "თბილისი") return 1;
    return a.localeCompare(b);
  });

  for (const city of sortedCities) {
    grouped.push({ city, orders: cityMap.get(city)! });
  }

  const statusBadge = (o: ZoneOrder) => {
    if (o.review_required || o.status === "on_hold")
      return <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">Review</Badge>;
    if (o.is_confirmed)
      return <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">Confirmed</Badge>;
    return <Badge variant="outline" className="text-muted-foreground text-[10px]">New</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MapPin className="w-4 h-4 mr-1.5" />
          Delivery Zones
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Today's Orders by Zone
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No orders today</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(g => (
              <div key={g.city}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{g.city}</h3>
                  <Badge variant="secondary" className="text-[10px]">{g.orders.length}</Badge>
                </div>
                <div className="space-y-2">
                  {g.orders.map(o => (
                    <div
                      key={o.id}
                      className="border rounded-lg p-3 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">#{o.public_order_number}</span>
                            {statusBadge(o)}
                          </div>
                          <p className="font-medium truncate">{o.customer_name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {o.normalized_address || o.address_line1}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {o.customer_phone}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              ₾{Number(o.total).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

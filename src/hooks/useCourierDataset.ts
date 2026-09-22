import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StatusMapRow } from "@/lib/courierStates";

export type Shipment = {
  id: string;
  tracking_number: string;
  order_number: string | null;
  original_order_id: string | null;
  current_courier_status: string | null;
  derived_state: string | null;
  is_return: boolean;
  phone: string | null;
  phone_normalized: string | null;
  customer_name: string | null;
  city: string | null;
  cod_amount: number | null;
  order_date: string | null;
  latest_status_date: string | null;
  status_changed_at: string | null;
  final_status_date: string | null;
  comment_items: { code: string; qty: number }[] | null;
  linked_original_tracking_number: string | null;
  linked_return_tracking_number: string | null;
};

export type OrderLite = {
  id: string;
  public_order_number: string;
  created_at: string;
  auto_confirmed: boolean | null;
  is_return: boolean;
  city: string | null;
  normalized_city: string | null;
  region: string | null;
  total: number;
};

export type ItemLite = { order_id: string; sku: string; title: string; quantity: number };

const SHIPMENT_COLS =
  "id, tracking_number, order_number, original_order_id, current_courier_status, derived_state, is_return, phone, phone_normalized, customer_name, city, cod_amount, order_date, latest_status_date, status_changed_at, final_status_date, comment_items, linked_original_tracking_number, linked_return_tracking_number";

/** Run async jobs with bounded concurrency (keeps requests parallel but polite). */
async function pooled<T, R>(items: T[], limit: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await job(items[i]);
      }
    }),
  );
  return out;
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}


export type CourierDataset = {
  shipments: Shipment[];
  orders: Map<string, OrderLite>;
  itemsByOrder: Map<string, ItemLite[]>;
  statusMap: Map<string, StatusMapRow>;
};

export function useCourierDataset() {
  return useQuery<CourierDataset>({
    queryKey: ["courier-dataset"],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const PAGE = 1000;

      // How many shipment rows exist -> fetch all pages in parallel instead of one by one.
      const { count } = await supabase
        .from("courier_shipments")
        .select("id", { count: "exact", head: true });
      const total = count || 0;
      const pages = Array.from({ length: Math.max(1, Math.ceil(total / PAGE)) }, (_, i) => i);

      const [shipmentPages, smRes] = await Promise.all([
        pooled(pages, 6, async (p) => {
          const { data, error } = await supabase
            .from("courier_shipments")
            .select(SHIPMENT_COLS)
            .order("tracking_number")
            .range(p * PAGE, p * PAGE + PAGE - 1);
          if (error) throw error;
          return (data as any as Shipment[]) || [];
        }),
        supabase.from("courier_status_map").select("*").order("sort_order"),
      ]);
      const shipments = shipmentPages.flat();

      const statusMap = new Map<string, StatusMapRow>();
      for (const r of (smRes.data as any as StatusMapRow[]) || []) statusMap.set(r.courier_status.trim(), r);

      const orderIds = [...new Set(shipments.map((s) => s.original_order_id).filter(Boolean) as string[])];
      const idChunks = chunk(orderIds, 500);

      const orders = new Map<string, OrderLite>();
      const itemsByOrder = new Map<string, ItemLite[]>();

      const [orderRes, itemRes] = await Promise.all([
        pooled(idChunks, 6, async (ids) => {
          const { data } = await supabase
            .from("orders")
            .select("id, public_order_number, created_at, auto_confirmed, is_return, city, normalized_city, region, total")
            .in("id", ids);
          return (data as any as OrderLite[]) || [];
        }),
        pooled(idChunks, 6, async (ids) => {
          const { data } = await supabase
            .from("order_items")
            .select("order_id, sku, title, quantity")
            .in("order_id", ids);
          return (data as any as ItemLite[]) || [];
        }),
      ]);

      for (const o of orderRes.flat()) orders.set(o.id, o);
      for (const it of itemRes.flat()) {
        const arr = itemsByOrder.get(it.order_id) || [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }

      return { shipments, orders, itemsByOrder, statusMap };

    },
  });
}

/** Units for a shipment: matched order's items, falling back to the courier comment list. */
export function unitsFor(ds: CourierDataset, s: Shipment): { sku: string; title: string; qty: number }[] {
  if (s.original_order_id) {
    const items = ds.itemsByOrder.get(s.original_order_id);
    if (items?.length) return items.map((i) => ({ sku: i.sku, title: i.title, qty: i.quantity }));
  }
  return (s.comment_items || []).map((c) => ({ sku: c.code, title: c.code, qty: c.qty }));
}

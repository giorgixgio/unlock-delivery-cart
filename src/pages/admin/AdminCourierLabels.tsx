import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Printer, Download, Search } from "lucide-react";
import CourierLabel, { CourierLabelData } from "@/components/admin/CourierLabel";
import { downloadLabelPdf, printLabelPdf } from "@/lib/courierLabelPdf";

const SELECT =
  "id, public_order_number, customer_name, customer_phone, city, address_line1, address_line2, total, tracking_number, courier_zone_id, courier_label_text, courier_label_date";

const AdminCourierLabels = () => {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<CourierLabelData[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedOrders = useMemo(
    () => orders.filter((o) => selected[o.id]),
    [orders, selected]
  );

  const search = async () => {
    setLoading(true);
    try {
      let q = supabase.from("orders").select(SELECT).order("created_at", { ascending: false }).limit(200);
      const term = query.trim();
      if (term) {
        q = q.or(
          `public_order_number.ilike.%${term}%,tracking_number.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_name.ilike.%${term}%`
        );
      }
      if (date) q = q.eq("courier_label_date", date);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as unknown as CourierLabelData[];
      setOrders(rows);
      setSelected(Object.fromEntries(rows.map((r) => [r.id, true])));
      if (!rows.length) toast.info("ჩანაწერი ვერ მოიძებნა");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const nodes = () =>
    selectedOrders
      .map((o) => nodeRefs.current[o.id])
      .filter((n): n is HTMLDivElement => !!n);

  const run = async (mode: "print" | "download") => {
    if (!selectedOrders.length) {
      toast.error("აირჩიე მინიმუმ ერთი შეკვეთა");
      return;
    }
    setBusy(true);
    try {
      const list = nodes();
      if (mode === "print") await printLabelPdf(list);
      else
        await downloadLabelPdf(
          list,
          `courier-labels-${new Date().toISOString().slice(0, 10)}.pdf`
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  };

  const allSelected = orders.length > 0 && selectedOrders.length === orders.length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Labels</h1>
        <p className="text-sm text-muted-foreground">
          Reprint OnWay thermal stickers (76 × 92 mm) exactly as exported.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Order number, tracking, phone or name"
            className="text-base"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="md:w-48 text-base"
          />
          <Button onClick={search} disabled={loading} className="md:w-32">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Search
          </Button>
        </div>

        {orders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelected(
                  allSelected ? {} : Object.fromEntries(orders.map((o) => [o.id, true]))
                )
              }
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedOrders.length} / {orders.length} selected
            </span>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => run("print")} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Print
              </Button>
              <Button variant="outline" onClick={() => run("download")} disabled={busy}>
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                checked={!!selected[o.id]}
                onCheckedChange={(v) =>
                  setSelected((s) => ({ ...s, [o.id]: !!v }))
                }
              />
              <div className="min-w-0 text-sm">
                <div className="font-bold">{o.public_order_number}</div>
                <div className="text-muted-foreground truncate">
                  {o.customer_name} · {o.customer_phone}
                </div>
                <div className="text-muted-foreground truncate">
                  {o.city} · zone {o.courier_zone_id ?? "—"}
                </div>
                <div className="font-mono text-xs truncate">
                  {o.tracking_number || "no tracking"}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded border bg-white">
              <div
                style={{
                  width: 608,
                  transform: "scale(0.42)",
                  transformOrigin: "top left",
                  height: 736 * 0.42,
                }}
              >
                <CourierLabel
                  data={o}
                  ref={(el) => (nodeRefs.current[o.id] = el)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminCourierLabels;

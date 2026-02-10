import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COLUMNS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "preview";

    // Fetch eligible orders
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("*, order_items(sku, quantity, title)")
      .eq("is_confirmed", true)
      .eq("is_fulfilled", false)
      .eq("status", "confirmed")
      .eq("review_required", false)
      .order("created_at", { ascending: true });

    if (ordersErr) {
      return new Response(JSON.stringify({ error: ordersErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "preview") {
      const summary = {
        count: (orders || []).length,
        earliest: orders?.length ? orders[0].created_at : null,
        latest: orders?.length ? orders[orders.length - 1].created_at : null,
        totalSum: (orders || []).reduce((sum: number, o: any) => sum + Number(o.total || 0), 0),
      };
      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "download" — return data + template for client-side XLSX generation
    const { data: template } = await supabase
      .from("courier_export_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const fixedMap = (template?.fixed_columns_map || {}) as Record<string, string>;
    const includeHeaders = template?.include_headers !== false;

    // Build rows as arrays
    const rows: string[][] = [];

    for (const order of (orders || [])) {
      const items = order.order_items || [];
      const quantities = items.map((i: any) => String(i.quantity)).join(",");
      const skus = items.map((i: any) => i.sku).join(",");

      const notes: string[] = [];
      if (order.notes_customer) notes.push(order.notes_customer);
      if (order.risk_level && order.risk_level !== "low") {
        notes.push(`RISK:${order.risk_level.toUpperCase()} ${(order.risk_reasons || []).join(", ")}`);
      }
      if (order.internal_note) notes.push(order.internal_note);

      const dynamicValues: Record<string, string> = {
        A: order.customer_name || "",
        B: order.normalized_address || order.raw_address || order.address_line1 || "",
        C: order.normalized_city || order.raw_city || order.city || "",
        E: order.customer_phone || "",
        G: quantities,
        H: order.id,
        I: skus,
        K: String(Number(order.total || 0)),
        O: notes.join(" | "),
      };

      const row = COLUMNS.map(col => {
        if (dynamicValues[col] !== undefined) return dynamicValues[col];
        if (fixedMap[col] !== undefined) return fixedMap[col];
        return "";
      });
      rows.push(row);
    }

    // Log export events
    for (const order of (orders || [])) {
      await supabase.from("order_events").insert({
        order_id: order.id,
        actor: "admin_export",
        event_type: "courier_export",
        payload: { exported_at: new Date().toISOString(), order_count: (orders || []).length },
      });
    }

    return new Response(JSON.stringify({ rows, includeHeaders, columns: COLUMNS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("export-courier error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

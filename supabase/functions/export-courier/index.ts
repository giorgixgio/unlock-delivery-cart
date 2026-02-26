import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONWAY_COLUMNS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V"];

const TRACKINGS_COLUMNS = [
  "გაგზავნის მეთოდი",
  "გამგზავნის ქალაქი",
  "გამგზავნის მისამართი",
  "გამგზავნი გაცემის პუნქტი",
  "გამგზავნის ტელეფონის ნომერი",
  "მიმღების სახელი და გვარი",
  "კომპანიის სახელი",
  "საიდენტიფიკაციო ნომერი",
  "მიმღების ტელეფონის ნომერი",
  "მიწოდების მეთოდი",
  "მიმღების ქალაქი",
  "მიმღების მისამართი",
  "მიმღები გაცემის პუნქტი",
  "წონა",
  "ნივთების რაოდენობა",
  "COD",
  "COD საკომისიოს გადაიხდის",
  "ექსპრეს სერვისი",
  "დაზღვევა",
  "ამანათის დასურათება",
  "მსხვრევადი",
  "კომენტარი",
  "უკან დაბრუნება",
  "გაცემის პუნქტი",
  "გადამხდელი",
  "ანგარიშწორების ტიპი",
  "შეკვეთის ნომერი თქვენ სისტემაში",
  "პროდუქციის ფასი",
  "პროდუქციის აღწერა",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "preview";
    const courier = url.searchParams.get("courier") || "onway";

    // Fetch eligible orders
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("*, order_items(sku, quantity, title)")
      .eq("is_confirmed", true)
      .eq("is_fulfilled", false)
      .eq("status", "confirmed")
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

    // action === "download"
    const { data: template } = await supabase
      .from("courier_export_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const fixedMap = (template?.fixed_columns_map || {}) as Record<string, string>;
    const includeHeaders = template?.include_headers !== false;

    const rows: string[][] = [];
    const orderIds: string[] = [];

    for (const order of (orders || [])) {
      const items = order.order_items || [];
      const totalQuantity = items.reduce((sum: number, i: any) => sum + Number(i.quantity || 1), 0);
      const skus = items.map((i: any) => i.sku).join(",");
      const titles = items.map((i: any) => i.title).join(", ");

      const notes: string[] = [];
      if (order.notes_customer) notes.push(order.notes_customer);
      if (order.risk_level && order.risk_level !== "low") {
        notes.push(`RISK:${order.risk_level.toUpperCase()} ${(order.risk_reasons || []).join(", ")}`);
      }
      if (order.internal_note) notes.push(order.internal_note);

      orderIds.push(order.id);

      if (courier === "trackings") {
        // TRACKINGS.GE format — 29 columns
        const row = [
          fixedMap["trackings_shipping_method"] || "კურიერი",           // 1 გაგზავნის მეთოდი
          fixedMap["trackings_sender_city"] || "თბილისი",               // 2 გამგზავნის ქალაქი
          fixedMap["trackings_sender_address"] || "იუმაშევის 11",       // 3 გამგზავნის მისამართი
          "",                                                            // 4 გამგზავნი გაცემის პუნქტი
          fixedMap["trackings_sender_phone"] || "555555555",             // 5 გამგზავნის ტელეფონი
          order.customer_name || "",                                     // 6 მიმღების სახელი
          "",                                                            // 7 კომპანიის სახელი
          "",                                                            // 8 საიდენტიფიკაციო ნომერი
          order.customer_phone || "",                                    // 9 მიმღების ტელეფონი
          fixedMap["trackings_delivery_method"] || "კურიერი",           // 10 მიწოდების მეთოდი
          order.normalized_city || order.raw_city || order.city || "",   // 11 მიმღების ქალაქი
          order.normalized_address || order.raw_address || order.address_line1 || "", // 12 მიმღების მისამართი
          "",                                                            // 13 მიმღები გაცემის პუნქტი
          fixedMap["trackings_weight"] || "1",                           // 14 წონა
          String(totalQuantity),                                         // 15 ნივთების რაოდენობა
          String(Number(order.total || 0)),                              // 16 COD
          fixedMap["trackings_cod_commission_payer"] || "გამგზავნი",    // 17 COD საკომისიოს გადაიხდის
          "",                                                            // 18 ექსპრეს სერვისი
          "",                                                            // 19 დაზღვევა
          "",                                                            // 20 ამანათის დასურათება
          "",                                                            // 21 მსხვრევადი
          notes.join(" | "),                                             // 22 კომენტარი
          fixedMap["trackings_return_method"] || "კურიერი",             // 23 უკან დაბრუნება
          "",                                                            // 24 გაცემის პუნქტი (return)
          fixedMap["trackings_payer"] || "გამგზავნი",                   // 25 გადამხდელი
          fixedMap["trackings_payment_type"] || "ინვოისი",              // 26 ანგარიშწორების ტიპი
          order.public_order_number,                                     // 27 შეკვეთის ნომერი
          String(Number(order.total || 0)),                              // 28 პროდუქციის ფასი
          `${titles} [${skus}]`,                                         // 29 პროდუქციის აღწერა
        ];
        rows.push(row);
      } else {
        // ONWAY format — 22 columns (A-V)
        const dynamicValues: Record<string, string> = {
          A: order.customer_name || "",
          B: order.normalized_address || order.raw_address || order.address_line1 || "",
          C: order.normalized_city || order.raw_city || order.city || "",
          E: order.customer_phone || "",
          G: String(totalQuantity),
          H: order.public_order_number,
          I: skus,
          K: String(Number(order.total || 0)),
          O: notes.join(" | "),
        };

        const row = ONWAY_COLUMNS.map(col => {
          if (dynamicValues[col] !== undefined) return dynamicValues[col];
          if (fixedMap[col] !== undefined) return fixedMap[col];
          return "";
        });
        rows.push(row);
      }
    }

    // Log export events
    for (const order of (orders || [])) {
      await supabase.from("order_events").insert({
        order_id: order.id,
        actor: "admin_export",
        event_type: "courier_export",
        payload: { exported_at: new Date().toISOString(), order_count: (orders || []).length, courier },
      });
    }

    const columns = courier === "trackings" ? TRACKINGS_COLUMNS : ONWAY_COLUMNS;

    return new Response(JSON.stringify({ rows, includeHeaders, columns, orderIds, courier }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("export-courier error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

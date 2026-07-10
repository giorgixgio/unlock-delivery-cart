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

/** Numeric-aware bin compare so "2" sorts before "10", blanks last. */
function cmpBin(a: string, b: string): number {
  const av = (a || "").trim();
  const bv = (b || "").trim();
  if (av === "" && bv === "") return 0;
  if (av === "") return 1;
  if (bv === "") return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Admin auth check --------------------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("is_active_admin", { user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ----------------------------------------------------------------------

    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* ignore */ } }
    const action = String(body.action ?? url.searchParams.get("action") ?? "preview");
    const courier = String(body.courier ?? url.searchParams.get("courier") ?? "onway");
    const waveId = body.wave_id ?? url.searchParams.get("wave_id") ?? null;
    const roundSize = Math.max(1, parseInt(String(body.round_size ?? url.searchParams.get("round_size") ?? "10"), 10) || 10);

    let query = supabase
      .from("orders")
      .select("*, order_items(sku, quantity, title, product_id)")
      .order("created_at", { ascending: true });

    if (waveId) {
      query = query.eq("packing_wave_id", waveId);
    } else {
      query = query
        .eq("is_confirmed", true)
        .eq("is_fulfilled", false)
        .eq("status", "confirmed");
    }

    const { data: ordersRaw, error: ordersErr } = await query;
    if (ordersErr) {
      return new Response(JSON.stringify({ error: ordersErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Load bin locations for single-SKU pick-path sorting.
    //    Degrades gracefully if the bin_location column isn't there yet.
    const allSkus = [...new Set((ordersRaw || []).flatMap((o: any) => (o.order_items || []).map((i: any) => String(i.sku || "")).filter(Boolean)))];
    const binBySku: Record<string, string> = {};
    if (allSkus.length) {
      let prods: any = null;
      const first = await supabase.from("products").select("sku, bin_location").in("sku", allSkus);
      if (first.error) {
        const fallback = await supabase.from("products").select("sku").in("sku", allSkus);
        prods = fallback.data;
      } else {
        prods = first.data;
      }
      for (const p of prods || []) binBySku[String(p.sku)] = String((p as any).bin_location ?? "");
    }

    // ── Classify + compute primary SKU + bin for each order.
    const meta = (ordersRaw || []).map((o: any) => {
      const items = o.order_items || [];
      const skus = new Set(items.map((i: any) => String(i.sku || "")));
      const primary = [...items]
        .map((i: any) => String(i.sku || ""))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] || "";
      return { order: o, multi: skus.size > 1, primary, bin: binBySku[primary] || "" };
    });

    // ── Single-SKU lane: sort by bin (fallback SKU, then date). Same SKU/bin ends up contiguous.
    const singles = meta
      .filter((m) => !m.multi)
      .sort((a, b) => {
        const bc = cmpBin(a.bin, b.bin);
        if (bc) return bc;
        const sc = a.primary.localeCompare(b.primary, undefined, { numeric: true });
        if (sc) return sc;
        return new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
      });

    // ── Assign printed tags: [S-####] for singles, [R##-##] for multi round/slot.
    type Assigned = { order: any; lane: "single" | "multi"; tag: string; round: number | null; slot: number | null; primary: string; bin: string };
    const assigned: Assigned[] = [];
    singles.forEach((m, i) => {
      assigned.push({ order: m.order, lane: "single", tag: `S-${pad(i + 1, 4)}`, round: null, slot: null, primary: m.primary, bin: m.bin });
    });

    const multiMeta = meta.filter((m) => m.multi);
    let effectiveRoundSize = roundSize;

    if (waveId) {
      // Frozen path: read persisted (run_number, slot_number) so slip tags
      // match the packing tab exactly, regardless of any later order changes.
      const { data: frozenSlots } = await supabase
        .from("packing_run_slots")
        .select("order_id, slot_number, packing_runs(run_number, slot_count)")
        .eq("wave_id", waveId);
      const frozen: Record<string, { round: number; slot: number }> = {};
      let maxSlotCount = 0;
      for (const s of frozenSlots || []) {
        const rn = (s as any).packing_runs?.run_number ?? 1;
        const sc = (s as any).packing_runs?.slot_count ?? 0;
        if (sc > maxSlotCount) maxSlotCount = sc;
        frozen[String((s as any).order_id)] = { round: rn, slot: (s as any).slot_number };
      }
      if (maxSlotCount > 0) effectiveRoundSize = maxSlotCount;
      multiMeta
        .map((m) => ({ m, f: frozen[String(m.order.id)] }))
        .filter((x) => x.f)
        .sort((a, b) => (a.f!.round - b.f!.round) || (a.f!.slot - b.f!.slot))
        .forEach(({ m, f }) => {
          assigned.push({ order: m.order, lane: "multi", tag: `R${pad(f!.round, 2)}-${pad(f!.slot, 2)}`, round: f!.round, slot: f!.slot, primary: m.primary, bin: m.bin });
        });
    } else {
      // Ad-hoc path: chunk by round_size on the fly (preview / no session).
      multiMeta
        .sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime())
        .forEach((m, i) => {
          const round = Math.floor(i / roundSize) + 1;
          const slot = (i % roundSize) + 1;
          assigned.push({ order: m.order, lane: "multi", tag: `R${pad(round, 2)}-${pad(slot, 2)}`, round, slot, primary: m.primary, bin: m.bin });
        });
    }

    const singleCount = singles.length;
    const multiCount = assigned.filter((a) => a.lane === "multi").length;
    const roundCount = assigned.reduce((mx, a) => (a.lane === "multi" && (a.round || 0) > mx ? (a.round as number) : mx), 0);
    const cutGuide = multiCount > 0
      ? `First ${singleCount} slip(s) = single-SKU. Then cut every ${effectiveRoundSize} for ${roundCount} round(s).`
      : `All ${singleCount} slip(s) = single-SKU.`;

    const rounds = Array.from({ length: roundCount }, (_, r) => ({
      round: r + 1,
      slots: assigned
        .filter((a) => a.lane === "multi" && a.round === r + 1)
        .map((a) => ({
          slot: a.slot,
          tag: a.tag,
          order_id: a.order.id,
          order_number: a.order.public_order_number,
          name: a.order.customer_name,
          phone: a.order.customer_phone,
        })),
    }));

    const singlesMeta = assigned
      .filter((a) => a.lane === "single")
      .map((a) => ({ tag: a.tag, order_id: a.order.id, order_number: a.order.public_order_number, sku: a.primary, bin: a.bin }));

    const summary = {
      single_count: singleCount,
      multi_count: multiCount,
      round_size: effectiveRoundSize,
      round_count: roundCount,
      cut_guide: cutGuide,
      rounds,
      singles: singlesMeta,
    };

    if (action === "preview") {
      return new Response(JSON.stringify({
        count: assigned.length,
        earliest: assigned.length ? assigned[0].order.created_at : null,
        latest: assigned.length ? assigned[assigned.length - 1].order.created_at : null,
        totalSum: assigned.reduce((sum, a) => sum + Number(a.order.total || 0), 0),
        ...summary,
        orders: assigned.map((a) => ({
          id: a.order.id,
          public_order_number: a.order.public_order_number,
          customer_name: a.order.customer_name,
          customer_phone: a.order.customer_phone,
          city: a.order.normalized_city || a.order.raw_city || a.order.city || "",
          tag: a.tag,
          lane: a.lane,
          round: a.round,
          slot: a.slot,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // action === "download"
    // Safety net: some orders may reach export without normalized_city/address
    // (e.g. the fire-and-forget normalize call was cancelled when the tab
    // closed, or an operator confirmed before it finished). Normalize them
    // synchronously now so the courier file gets the Georgian version, not
    // the Latin/English text the customer typed.
    const missing = assigned.filter((a) => {
      const o = a.order;
      const hasCity = !!(o.normalized_city && String(o.normalized_city).trim());
      const hasAddr = !!(o.normalized_address && String(o.normalized_address).trim());
      return !hasCity || !hasAddr;
    });
    if (missing.length) {
      for (const m of missing) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/normalize-and-score`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ order_id: m.order.id }),
          });
          if (!res.ok) continue;
          const { data: refreshed } = await supabase
            .from("orders")
            .select("normalized_city, normalized_address, raw_city, raw_address")
            .eq("id", m.order.id)
            .single();
          if (refreshed) {
            m.order.normalized_city = refreshed.normalized_city ?? m.order.normalized_city;
            m.order.normalized_address = refreshed.normalized_address ?? m.order.normalized_address;
            m.order.raw_city = refreshed.raw_city ?? m.order.raw_city;
            m.order.raw_address = refreshed.raw_address ?? m.order.raw_address;
          }
        } catch (_e) {
          // best-effort — fall back to raw/city on the row
        }
      }
    }

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

    for (const a of assigned) {
      const order = a.order;
      const items = order.order_items || [];
      // Quantity column is always "1"; real qty lives in the SKU string as "SKU - QTY".
      const skuWithQty = items.map((i: any) => `${i.sku ?? ""} - ${Number(i.quantity || 1)}`).join(", ");
      const titles = items.map((i: any) => i.title).join(", ");
      const quantityColumn = "1";
      const tag = `[${a.tag}]`; // printed on the slip so the stack self-sorts

      const notes: string[] = [];
      if (order.notes_customer) notes.push(order.notes_customer);
      if (order.risk_level && order.risk_level !== "low") {
        notes.push(`RISK:${order.risk_level.toUpperCase()} ${(order.risk_reasons || []).join(", ")}`);
      }
      if (order.internal_note) notes.push(order.internal_note);

      orderIds.push(order.id);

      if (courier === "trackings") {
        const row = [
          fixedMap["trackings_shipping_method"] || "კურიერი",
          fixedMap["trackings_sender_city"] || "თბილისი",
          fixedMap["trackings_sender_address"] || "იუმაშევის 11",
          "",
          fixedMap["trackings_sender_phone"] || "555555555",
          order.customer_name || "",
          "",
          "",
          order.customer_phone || "",
          fixedMap["trackings_delivery_method"] || "კურიერი",
          order.normalized_city || order.raw_city || order.city || "",
          order.normalized_address || order.raw_address || order.address_line1 || "",
          "",
          fixedMap["trackings_weight"] || "1",
          quantityColumn,
          String(Number(order.total || 0)),
          fixedMap["trackings_cod_commission_payer"] || "გამგზავნი",
          "",
          "",
          "",
          "",
          notes.join(" | "),
          fixedMap["trackings_return_method"] || "გამგზავნის მისამართი",
          "",
          fixedMap["trackings_payer"] || "გამგზავნი",
          fixedMap["trackings_payment_type"] || "ქეში",
          order.public_order_number,
          String(Number(order.total || 0)),
          `${tag} ${titles} [${skuWithQty}]`, // 29 description — tag first so it prints prominently
        ];
        rows.push(row);
      } else {
        const dynamicValues: Record<string, string> = {
          A: order.customer_name || "",
          B: order.normalized_address || order.raw_address || order.address_line1 || "",
          C: order.normalized_city || order.raw_city || order.city || "",
          E: order.customer_phone || "",
          G: quantityColumn,
          H: order.public_order_number,
          I: `${tag} ${skuWithQty}`, // SKU column — tag prepended so it prints on the slip
          K: String(Number(order.total || 0)),
          O: notes.join(" | "),
        };
        const row = ONWAY_COLUMNS.map((col) => {
          if (dynamicValues[col] !== undefined) return dynamicValues[col];
          if (fixedMap[col] !== undefined) return fixedMap[col];
          return "";
        });
        rows.push(row);
      }
    }

    // Log export events
    for (const a of assigned) {
      await supabase.from("order_events").insert({
        order_id: a.order.id,
        actor: "admin_export",
        event_type: "courier_export",
        payload: { exported_at: new Date().toISOString(), order_count: assigned.length, courier, tag: a.tag, lane: a.lane, round: a.round, slot: a.slot },
      });
    }

    const columns = courier === "trackings" ? TRACKINGS_COLUMNS : ONWAY_COLUMNS;

    return new Response(JSON.stringify({ rows, includeHeaders, columns, orderIds, courier, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("export-courier error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

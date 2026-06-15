// Courier Import Edge Function
// Accepts JSON payload parsed client-side (SheetJS) and upserts shipments + history.
// Always returns JSON: { success, message, details }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, any>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Header detection ----------
type Field =
  | "tracking_number" | "courier_status" | "status_date" | "cod_amount" | "company_receives"
  | "phone" | "customer_name" | "city" | "address" | "sku" | "quantity" | "order_number";

const REQUIRED_FIELDS: { field: Field; label: string }[] = [
  { field: "tracking_number", label: "Tracking Number" },
  { field: "courier_status", label: "Status" },
  { field: "phone", label: "Phone" },
  { field: "cod_amount", label: "COD Amount" },
  { field: "company_receives", label: "Company Receives" },
];

const FALLBACK_ALIASES: Record<Field, string[]> = {
  tracking_number: ["თრექინგი", "შტრიხკოდი", "ნომერი", "tracking", "barcode"],
  courier_status: ["სტატუსი", "მიმდინარე სტატუსი", "status"],
  status_date: ["დას. თარიღი", "სტატუსის თარიღი", "თარიღი", "date"],
  cod_amount: ["cod - გადახდა კურიერთან", "cod", "თანხა", "გადასახდელი"],
  company_receives: ["კომპანიას ერიცხება", "კომპანია იღებს", "ჩასარიცხი"],
  phone: ["მიმღ. ტელეფონი", "ტელეფონი", "მობილური", "phone"],
  customer_name: ["მიმღ. სახელი, გვარი", "მიმღები", "სახელი", "name"],
  city: ["მიმღ. ქალაქი", "ქალაქი", "city"],
  address: ["მიმღ. მისამართი", "მისამართი", "address"],
  sku: ["sku", "არტიკული", "კოდი"],
  quantity: ["რაოდენობა", "ცალი", "qty", "quantity"],
  order_number: ["შეკვეთის ნომერი", "order", "order_number"],
};

function normHeader(s: any): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

type MappingRow = { target_field: string; source_header: string | null; occurrence: number };

function buildHeaderMap(headers: string[], mappings: MappingRow[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const normalized = headers.map(normHeader);
  const fields: Field[] = [
    "tracking_number", "courier_status", "status_date", "cod_amount", "company_receives",
    "phone", "customer_name", "city", "address", "sku", "quantity", "order_number",
  ];
  for (const field of fields) {
    const dbRows = mappings
      .filter((m) => m.target_field === field && m.source_header)
      .sort((a, b) => (a.occurrence || 1) - (b.occurrence || 1));
    let found = false;
    for (const m of dbRows) {
      const want = normHeader(m.source_header);
      let seen = 0;
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] === want) {
          seen++;
          if (seen === (m.occurrence || 1)) { map[field] = i; found = true; break; }
        }
      }
      if (found) break;
    }
    if (found) continue;
    for (const alias of FALLBACK_ALIASES[field]) {
      const a = alias.toLowerCase();
      const idx = normalized.findIndex((h) => h === a || h.includes(a));
      if (idx >= 0) { map[field] = idx; break; }
    }
  }
  return map;
}

function deriveStatus(courierStatus: string, cod: number, comp: number): { derived: string; type: string } {
  const s = (courierStatus || "").toLowerCase();
  const has = (k: string) => s.includes(k.toLowerCase());
  const isDelivered = has("ჩაბარებული");
  const isReturnKW = has("დაბრუნებ") || has("უკან") || has("return") || has("გამომგზავ");
  const isCancelKW = has("მიღების გაუქმება") || has("უარი") || has("გაუქმებ") || has("cancel") || has("refus");
  const isTransitKW = has("გაგზავნილი") || has("გზაში") || has("საწყობ") || has("კურიერთან") || has("დამუშავება") || has("transit");
  if (isDelivered && cod > 0 && comp > 0) return { derived: "DELIVERED_TO_CUSTOMER", type: "CUSTOMER_DELIVERY" };
  if (isReturnKW || (isDelivered && cod === 0 && comp === 0)) return { derived: "RETURNED_TO_SENDER", type: "RETURN_TO_SENDER" };
  if (isCancelKW) return { derived: "CANCELLED_OR_REFUSED", type: "CUSTOMER_DELIVERY" };
  if (isTransitKW) return { derived: "IN_TRANSIT", type: "CUSTOMER_DELIVERY" };
  return { derived: "UNKNOWN", type: "UNKNOWN" };
}

function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return isNaN(+d) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json(405, { success: false, message: "Method not allowed", details: {} });
  }

  let stage = "init";
  const debug: Record<string, any> = {};

  try {
    // ---- Auth ----
    stage = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { success: false, message: "Unauthorized", details: { stage } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Missing env vars", { hasUrl: !!supabaseUrl, hasAnon: !!anonKey, hasService: !!serviceKey });
      return json(500, { success: false, message: "Server configuration error", details: { stage } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return json(401, { success: false, message: "Unauthorized", details: { stage } });
    }
    const userId = claims.claims.sub;
    const userEmail = claims.claims.email as string | undefined;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_active_admin", { user_id: userId });
    if (!isAdmin) {
      return json(403, { success: false, message: "Forbidden", details: { stage } });
    }

    // ---- Payload ----
    stage = "parse_payload";
    let payload: any;
    try {
      payload = await req.json();
    } catch (e: any) {
      return json(400, { success: false, message: "Invalid JSON body", details: { stage, error: e.message } });
    }

    const {
      file_name,
      file_size,
      file_hash,
      sheet_names,
      headers,
      rows,
      dry_run,
    } = payload || {};

    debug.file_name = file_name;
    debug.file_size = file_size;
    debug.sheet_names = sheet_names;
    debug.header_count = Array.isArray(headers) ? headers.length : 0;
    debug.row_count = Array.isArray(rows) ? rows.length : 0;

    console.log("import-courier received", debug);

    if (!file_name || !file_hash || !Array.isArray(headers) || !Array.isArray(rows)) {
      return json(400, {
        success: false,
        message: "Missing required payload fields (file_name, file_hash, headers, rows)",
        details: { stage, debug },
      });
    }

    // ---- Idempotent dedup ----
    stage = "dedup";
    const { data: existing } = await admin
      .from("courier_import_batches").select("*").eq("file_hash", file_hash).maybeSingle();
    if (existing) {
      return json(200, {
        success: true,
        message: "This file was already imported.",
        details: { deduped: true, batch: existing },
      });
    }

    // ---- Header mapping ----
    stage = "mapping";
    const { data: mappingsData } = await admin
      .from("courier_import_mappings")
      .select("target_field, source_header, occurrence");
    const mappings: MappingRow[] = (mappingsData as any) || [];

    const headerStrs = headers.map((h: any) => String(h ?? ""));
    const hmap = buildHeaderMap(headerStrs, mappings);
    debug.detected_mapping = Object.fromEntries(
      Object.entries(hmap).map(([k, v]) => [k, headerStrs[v as number]]),
    );

    const missing = REQUIRED_FIELDS.filter((r) => hmap[r.field] === undefined);
    if (missing.length > 0) {
      const msg = `Column mapping missing: ${missing.map((m) => m.label).join(", ")}`;
      return json(400, {
        success: false,
        message: msg,
        details: {
          stage,
          missing_fields: missing.map((m) => m.field),
          detected_headers: headerStrs,
          detected_mapping: debug.detected_mapping,
        },
      });
    }

    // ---- Dry run (preview only) ----
    if (dry_run) {
      return json(200, {
        success: true,
        message: "Preview OK",
        details: { ...debug, mapping_ok: true },
      });
    }

    // ---- Create batch ----
    stage = "create_batch";
    const { data: batch, error: batchErr } = await admin
      .from("courier_import_batches")
      .insert({
        file_name,
        file_hash,
        uploaded_by: userEmail || userId,
        total_rows: rows.length,
        status: "processing",
      })
      .select().single();
    if (batchErr) {
      console.error("create_batch failed", batchErr);
      return json(500, { success: false, message: `Failed to create batch: ${batchErr.message}`, details: { stage } });
    }

    // ---- Process rows ----
    stage = "process_rows";
    let successful = 0, errored = 0, newShip = 0, updShip = 0, newHist = 0, possRet = 0, autoLinked = 0;
    const errors: any[] = [];
    const get = (row: any[], f: Field) => {
      const i = hmap[f]; return i === undefined ? null : row[i];
    };

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!Array.isArray(row) || row.every((v) => v == null || v === "")) continue;

      try {
        const tracking = String(get(row, "tracking_number") ?? "").trim();
        if (!tracking) { errored++; errors.push({ row: ri + 1, error: "missing tracking" }); continue; }

        const courierStatus = String(get(row, "courier_status") ?? "").trim();
        const cod = parseNum(get(row, "cod_amount"));
        const comp = parseNum(get(row, "company_receives"));
        const { derived, type } = deriveStatus(courierStatus, cod, comp);
        const statusDate = parseDate(get(row, "status_date"));
        const phone = (get(row, "phone") ?? "")?.toString().trim() || null;
        const customerName = (get(row, "customer_name") ?? "")?.toString().trim() || null;
        const city = (get(row, "city") ?? "")?.toString().trim() || null;
        const address = (get(row, "address") ?? "")?.toString().trim() || null;
        const sku = (get(row, "sku") ?? "")?.toString().trim() || null;
        const quantity = parseInt(String(get(row, "quantity") ?? "0")) || null;
        const orderNumber = (get(row, "order_number") ?? "")?.toString().trim() || null;

        const rawObj: Record<string, any> = {};
        headerStrs.forEach((h, i) => { rawObj[h || `col_${i}`] = row[i]; });

        const { data: existShip } = await admin
          .from("courier_shipments").select("*").eq("tracking_number", tracking).maybeSingle();

        let shipmentId: string;
        let isNew = false;
        let prevStatus: string | null = null;
        let prevStatusDate: string | null = null;

        if (existShip) {
          shipmentId = existShip.id;
          prevStatus = existShip.current_courier_status;
          prevStatusDate = existShip.latest_status_date;
          const { error: upErr } = await admin.from("courier_shipments").update({
            order_number: orderNumber ?? existShip.order_number,
            phone: phone ?? existShip.phone,
            customer_name: customerName ?? existShip.customer_name,
            city: city ?? existShip.city,
            address: address ?? existShip.address,
            sku: sku ?? existShip.sku,
            quantity: quantity ?? existShip.quantity,
            cod_amount: cod,
            company_receives: comp,
            current_courier_status: courierStatus,
            derived_status: derived,
            shipment_type: type,
            last_seen_at: new Date().toISOString(),
            latest_status_date: statusDate ?? existShip.latest_status_date,
          }).eq("id", shipmentId);
          if (upErr) throw upErr;
          updShip++;
        } else {
          isNew = true;
          const { data: matchOrder } = await admin
            .from("orders").select("id").eq("tracking_number", tracking).maybeSingle();

          const { data: inserted, error: insErr } = await admin.from("courier_shipments").insert({
            tracking_number: tracking,
            original_order_id: matchOrder?.id ?? null,
            order_number: orderNumber,
            phone, customer_name: customerName, city, address, sku, quantity,
            cod_amount: cod, company_receives: comp,
            current_courier_status: courierStatus,
            derived_status: derived,
            shipment_type: type,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            latest_status_date: statusDate,
          }).select().single();
          if (insErr) throw insErr;
          shipmentId = inserted.id;
          newShip++;
        }

        if (prevStatus !== courierStatus || (statusDate && prevStatusDate !== statusDate) || isNew) {
          const { error: hErr } = await admin.from("courier_status_history").insert({
            courier_shipment_id: shipmentId,
            tracking_number: tracking,
            import_batch_id: batch.id,
            courier_status: courierStatus,
            derived_status: derived,
            status_date: statusDate,
            cod_amount: cod,
            company_receives: comp,
            raw_row_json: rawObj,
          });
          if (!hErr) newHist++;
        }

        if (isNew && type === "RETURN_TO_SENDER" && phone) {
          const phoneNorm = phone.replace(/[^0-9]/g, "");
          const refDate = statusDate ? new Date(statusDate) : new Date();
          const windowStart = new Date(refDate.getTime() - 21 * 86400000).toISOString();
          const windowEnd = refDate.toISOString();
          const { data: candidates } = await admin
            .from("courier_shipments")
            .select("*")
            .eq("phone_normalized", phoneNorm)
            .eq("shipment_type", "CUSTOMER_DELIVERY")
            .gte("latest_status_date", windowStart)
            .lte("latest_status_date", windowEnd)
            .limit(20);

          let best: { id: string; score: number; reasons: string[] } | null = null;
          for (const c of candidates || []) {
            let score = 0; const reasons: string[] = [];
            if (c.phone_normalized === phoneNorm) { score += 40; reasons.push("phone"); }
            if (sku && c.sku === sku) { score += 25; reasons.push("sku"); }
            if (customerName && c.customer_name && c.customer_name.trim().toLowerCase() === customerName.trim().toLowerCase()) { score += 15; reasons.push("name"); }
            if (city && c.city && c.city.trim().toLowerCase() === city.trim().toLowerCase()) { score += 10; reasons.push("city"); }
            if (c.latest_status_date) { score += 10; reasons.push("date_window"); }
            if (orderNumber && c.order_number === orderNumber) { score += 50; reasons.push("order_number"); }
            if (!best || score > best.score) best = { id: c.id, score, reasons };
          }

          if (best && best.score >= 50) {
            const matchedBy = best.score >= 70 ? "AUTO" : "SUGGESTED";
            await admin.from("return_matches").insert({
              original_shipment_id: best.id,
              return_shipment_id: shipmentId,
              confidence_score: best.score,
              match_reason: best.reasons.join(","),
              matched_by: matchedBy,
            });
            if (matchedBy === "AUTO") {
              autoLinked++;
              const { data: origShip } = await admin.from("courier_shipments").select("tracking_number").eq("id", best.id).single();
              if (origShip) {
                await admin.from("courier_shipments").update({ linked_original_tracking_number: origShip.tracking_number }).eq("id", shipmentId);
                await admin.from("courier_shipments").update({ linked_return_tracking_number: tracking }).eq("id", best.id);
              }
            } else {
              possRet++;
            }
          }
        }

        successful++;
      } catch (e: any) {
        errored++;
        const errEntry = {
          row: ri + 1,
          error: e?.message || String(e),
          stack: e?.stack,
          row_data: row,
        };
        errors.push(errEntry);
        console.error("row failure", errEntry);
      }
    }

    stage = "finalize";
    const { data: finalBatch } = await admin.from("courier_import_batches").update({
      successful_rows: successful, error_rows: errored,
      new_shipments: newShip, updated_shipments: updShip,
      new_history_rows: newHist, possible_returns: possRet, auto_linked_returns: autoLinked,
      errors: errors.slice(0, 200), status: "completed",
    }).eq("id", batch.id).select().single();

    return json(200, {
      success: true,
      message: `Import complete — ${successful} ok, ${errored} errors`,
      details: { batch: finalBatch, ...debug },
    });
  } catch (e: any) {
    console.error("import-courier fatal", { stage, error: e?.message, stack: e?.stack, debug });
    return json(500, {
      success: false,
      message: e?.message || "Unknown error",
      details: { stage, stack: e?.stack, ...debug },
    });
  }
});

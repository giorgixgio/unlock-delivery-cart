// Courier Import Edge Function — Bulk, idempotent.
// Accepts JSON payload parsed client-side and bulk-upserts shipments + history.
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

// ---------- Field mapping ----------
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

const normHeader = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

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
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let [, dd, mm, yy, hh, mi, ss] = m;
    let year = parseInt(yy); if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, parseInt(mm) - 1, parseInt(dd),
      parseInt(hh || "0"), parseInt(mi || "0"), parseInt(ss || "0")));
    return isNaN(+d) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString();
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed", details: {} });

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
      return json(500, { success: false, message: "Server configuration error", details: { stage } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json(401, { success: false, message: "Unauthorized", details: { stage } });
    const userId = claims.claims.sub;
    const userEmail = claims.claims.email as string | undefined;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_active_admin", { user_id: userId });
    if (!isAdmin) return json(403, { success: false, message: "Forbidden", details: { stage } });

    // ---- Payload ----
    stage = "parse_payload";
    let payload: any;
    try { payload = await req.json(); }
    catch (e: any) { return json(400, { success: false, message: "Invalid JSON body", details: { stage, error: e.message } }); }

    const { file_name, file_size, file_hash, sheet_names, headers, rows, dry_run } = payload || {};
    debug.file_name = file_name;
    debug.file_size = file_size;
    debug.sheet_names = sheet_names;
    debug.header_count = Array.isArray(headers) ? headers.length : 0;
    debug.row_count = Array.isArray(rows) ? rows.length : 0;
    console.log("import-courier received", debug);

    if (!file_name || !file_hash || !Array.isArray(headers) || !Array.isArray(rows)) {
      return json(400, { success: false, message: "Missing required payload fields", details: { stage, debug } });
    }

    // ---- Idempotent file dedup ----
    stage = "dedup_file";
    const { data: existing } = await admin
      .from("courier_import_batches").select("*").eq("file_hash", file_hash).maybeSingle();
    if (existing && !dry_run) {
      return json(200, {
        success: true,
        message: `This file was already imported on ${new Date(existing.uploaded_at).toLocaleString()}.`,
        details: { deduped: true, batch: existing },
      });
    }

    // ---- Header mapping ----
    stage = "mapping";
    const { data: mappingsData } = await admin
      .from("courier_import_mappings").select("target_field, source_header, occurrence");
    const mappings: MappingRow[] = (mappingsData as any) || [];
    const headerStrs = headers.map((h: any) => String(h ?? ""));
    const hmap = buildHeaderMap(headerStrs, mappings);
    debug.detected_mapping = Object.fromEntries(
      Object.entries(hmap).map(([k, v]) => [k, headerStrs[v as number]]),
    );
    const missing = REQUIRED_FIELDS.filter((r) => hmap[r.field] === undefined);
    if (missing.length > 0) {
      return json(400, {
        success: false,
        message: `Column mapping missing: ${missing.map((m) => m.label).join(", ")}`,
        details: { stage, missing_fields: missing.map((m) => m.field), detected_headers: headerStrs, detected_mapping: debug.detected_mapping },
      });
    }

    if (dry_run) {
      return json(200, { success: true, message: "Preview OK", details: { ...debug, mapping_ok: true } });
    }

    // ---- Parse all rows into structured records (in-memory, single pass) ----
    stage = "transform_rows";
    const get = (row: any[], f: Field) => { const i = hmap[f]; return i === undefined ? null : row[i]; };

    type Parsed = {
      tracking: string; courierStatus: string; cod: number; comp: number;
      derived: string; type: string; statusDate: string | null;
      phone: string | null; phoneNorm: string | null;
      customerName: string | null; city: string | null; address: string | null;
      sku: string | null; quantity: number | null; orderNumber: string | null;
      rawObj: Record<string, any>; rowIndex: number;
    };

    const parsedRows: Parsed[] = [];
    const seenTracking = new Set<string>();
    let duplicateInFile = 0;
    let errored = 0;
    const errors: any[] = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!Array.isArray(row) || row.every((v) => v == null || v === "")) continue;
      try {
        const tracking = String(get(row, "tracking_number") ?? "").trim();
        if (!tracking) { errored++; errors.push({ row: ri + 1, error: "missing tracking" }); continue; }
        if (seenTracking.has(tracking)) { duplicateInFile++; continue; }
        seenTracking.add(tracking);

        const courierStatus = String(get(row, "courier_status") ?? "").trim();
        const cod = parseNum(get(row, "cod_amount"));
        const comp = parseNum(get(row, "company_receives"));
        const { derived, type } = deriveStatus(courierStatus, cod, comp);
        const phone = (get(row, "phone") ?? "")?.toString().trim() || null;
        const phoneNorm = phone ? phone.replace(/[^0-9]/g, "") || null : null;
        const rawObj: Record<string, any> = {};
        headerStrs.forEach((h, i) => { rawObj[h || `col_${i}`] = row[i]; });

        parsedRows.push({
          tracking, courierStatus, cod, comp, derived, type,
          statusDate: parseDate(get(row, "status_date")),
          phone, phoneNorm,
          customerName: (get(row, "customer_name") ?? "")?.toString().trim() || null,
          city: (get(row, "city") ?? "")?.toString().trim() || null,
          address: (get(row, "address") ?? "")?.toString().trim() || null,
          sku: (get(row, "sku") ?? "")?.toString().trim() || null,
          quantity: parseInt(String(get(row, "quantity") ?? "0")) || null,
          orderNumber: (get(row, "order_number") ?? "")?.toString().trim() || null,
          rawObj, rowIndex: ri + 1,
        });
      } catch (e: any) {
        errored++;
        errors.push({ row: ri + 1, error: e?.message || String(e) });
      }
    }
    debug.parsed_rows = parsedRows.length;
    debug.duplicate_in_file = duplicateInFile;

    // ---- Create batch ----
    stage = "create_batch";
    const { data: batch, error: batchErr } = await admin
      .from("courier_import_batches")
      .insert({
        file_name, file_hash,
        uploaded_by: userEmail || userId,
        total_rows: rows.length,
        status: "processing",
      })
      .select().single();
    if (batchErr) return json(500, { success: false, message: `Failed to create batch: ${batchErr.message}`, details: { stage } });

    // ---- Bulk fetch existing shipments by tracking ----
    stage = "fetch_existing";
    const allTracking = parsedRows.map((p) => p.tracking);
    const existingMap = new Map<string, any>();
    for (const tchunk of chunk(allTracking, 500)) {
      const { data: existRows, error: e1 } = await admin
        .from("courier_shipments")
        .select("id, tracking_number, current_courier_status, latest_status_date, cod_amount, company_receives, order_number, phone, customer_name, city, address, sku, quantity")
        .in("tracking_number", tchunk);
      if (e1) throw e1;
      for (const r of existRows || []) existingMap.set(r.tracking_number, r);
    }
    debug.existing_found = existingMap.size;

    // ---- Match original order_id for new tracking numbers (bulk) ----
    stage = "match_orders";
    const newTracking = parsedRows.filter((p) => !existingMap.has(p.tracking)).map((p) => p.tracking);
    const orderMatch = new Map<string, string>();
    for (const tchunk of chunk(newTracking, 500)) {
      const { data: oRows } = await admin
        .from("orders").select("id, tracking_number").in("tracking_number", tchunk);
      for (const o of (oRows || []) as any[]) orderMatch.set(o.tracking_number, o.id);
    }

    // ---- Build upsert payload + classify new/updated/skipped ----
    stage = "classify";
    const nowISO = new Date().toISOString();
    let newCount = 0, updatedCount = 0, skippedCount = 0;
    const toUpsert: any[] = [];
    const historyCandidates: Parsed[] = [];

    for (const p of parsedRows) {
      const ex = existingMap.get(p.tracking);
      if (ex) {
        const changed =
          (ex.current_courier_status || "") !== p.courierStatus ||
          (ex.latest_status_date || null) !== (p.statusDate || null) ||
          Number(ex.cod_amount || 0) !== p.cod ||
          Number(ex.company_receives || 0) !== p.comp;
        if (!changed) { skippedCount++; continue; }
        updatedCount++;
        toUpsert.push({
          tracking_number: p.tracking,
          order_number: p.orderNumber ?? ex.order_number,
          phone: p.phone ?? ex.phone,
          customer_name: p.customerName ?? ex.customer_name,
          city: p.city ?? ex.city,
          address: p.address ?? ex.address,
          sku: p.sku ?? ex.sku,
          quantity: p.quantity ?? ex.quantity,
          cod_amount: p.cod,
          company_receives: p.comp,
          current_courier_status: p.courierStatus,
          derived_status: p.derived,
          shipment_type: p.type,
          last_seen_at: nowISO,
          latest_status_date: p.statusDate ?? ex.latest_status_date,
        });
        // Add history only if status (or status_date) is new
        if ((ex.current_courier_status || "") !== p.courierStatus || (ex.latest_status_date || null) !== (p.statusDate || null)) {
          historyCandidates.push(p);
        }
      } else {
        newCount++;
        toUpsert.push({
          tracking_number: p.tracking,
          original_order_id: orderMatch.get(p.tracking) ?? null,
          order_number: p.orderNumber,
          phone: p.phone, customer_name: p.customerName, city: p.city, address: p.address,
          sku: p.sku, quantity: p.quantity,
          cod_amount: p.cod, company_receives: p.comp,
          current_courier_status: p.courierStatus,
          derived_status: p.derived,
          shipment_type: p.type,
          first_seen_at: nowISO,
          last_seen_at: nowISO,
          latest_status_date: p.statusDate,
        });
        historyCandidates.push(p);
      }
    }
    debug.to_upsert = toUpsert.length;
    debug.history_candidates = historyCandidates.length;

    // ---- Bulk upsert shipments ----
    stage = "upsert_shipments";
    for (const part of chunk(toUpsert, 500)) {
      const { error: upErr } = await admin
        .from("courier_shipments")
        .upsert(part, { onConflict: "tracking_number" });
      if (upErr) throw upErr;
    }

    // ---- Re-fetch ids for history insert ----
    stage = "fetch_ids";
    const trackingToId = new Map<string, string>();
    for (const tchunk of chunk(historyCandidates.map((p) => p.tracking), 500)) {
      const { data: rows2 } = await admin
        .from("courier_shipments").select("id, tracking_number").in("tracking_number", tchunk);
      for (const r of (rows2 || []) as any[]) trackingToId.set(r.tracking_number, r.id);
    }

    // ---- Bulk insert history (deduped by unique index on shipment+status+date) ----
    stage = "insert_history";
    const historyRows = historyCandidates
      .map((p) => ({
        courier_shipment_id: trackingToId.get(p.tracking)!,
        tracking_number: p.tracking,
        import_batch_id: batch.id,
        courier_status: p.courierStatus,
        derived_status: p.derived,
        status_date: p.statusDate,
        cod_amount: p.cod,
        company_receives: p.comp,
        raw_row_json: p.rawObj,
      }))
      .filter((r) => r.courier_shipment_id);

    let newHistoryRows = 0;
    for (const part of chunk(historyRows, 500)) {
      // Use plain insert; rely on partial-failure tolerance per chunk
      const { data: ins, error: hErr } = await admin
        .from("courier_status_history").insert(part).select("id");
      if (hErr) {
        // Likely dedup index violation on a sub-row; fall back to per-row
        for (const one of part) {
          const { data: oneIns, error: oneErr } = await admin
            .from("courier_status_history").insert(one).select("id");
          if (!oneErr && oneIns) newHistoryRows += oneIns.length;
        }
      } else {
        newHistoryRows += ins?.length || 0;
      }
    }

    // ---- Finalize batch ----
    stage = "finalize";
    const successful = newCount + updatedCount + skippedCount;
    const { data: finalBatch } = await admin
      .from("courier_import_batches").update({
        successful_rows: successful,
        error_rows: errored,
        new_shipments: newCount,
        updated_shipments: updatedCount,
        skipped_rows: skippedCount + duplicateInFile,
        new_history_rows: newHistoryRows,
        possible_returns: 0,
        auto_linked_returns: 0,
        errors: errors.slice(0, 200),
        status: "completed",
      }).eq("id", batch.id).select().single();

    return json(200, {
      success: true,
      message: `${rows.length} rows checked — ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${duplicateInFile} duplicate, ${errored} errors`,
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

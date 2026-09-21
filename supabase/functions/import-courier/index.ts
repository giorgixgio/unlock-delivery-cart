// Courier Import — chunked, idempotent, crash-safe.
// Modes: "start" (create batch) | "chunk" (process rows) | "finalize" (close batch).
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
  | "phone" | "customer_name" | "city" | "address" | "sku" | "quantity" | "order_number"
  | "sender_name" | "receiver_name" | "order_date" | "pickup_date" | "comment";

const FIELDS: Field[] = [
  "tracking_number", "courier_status", "status_date", "cod_amount", "company_receives",
  "phone", "customer_name", "city", "address", "sku", "quantity", "order_number",
  "sender_name", "receiver_name", "order_date", "pickup_date", "comment",
];

const REQUIRED_FIELDS: { field: Field; label: string }[] = [
  { field: "tracking_number", label: "Tracking Number" },
  { field: "courier_status", label: "Status" },
];

const FALLBACK_ALIASES: Record<Field, string[]> = {
  tracking_number: ["თრექინგი", "შტრიხკოდი", "tracking", "barcode"],
  courier_status: ["სტატუსი", "მიმდინარე სტატუსი", "status"],
  status_date: ["დას. თარიღი", "სტატუსის თარიღი", "date"],
  cod_amount: ["cod - გადახდა კურიერთან", "cod", "გადასახდელი"],
  company_receives: ["კომპანიას ერიცხება", "კომპანია იღებს", "ჩასარიცხი"],
  phone: ["მიმღ. ტელეფონი", "ტელეფონი", "მობილური", "phone"],
  customer_name: ["მიმღ. სახელი, გვარი", "მიმღები", "name"],
  city: ["მიმღ. ქალაქი", "ქალაქი", "city"],
  address: ["მიმღ. მისამართი", "მისამართი", "address"],
  sku: ["sku", "არტიკული", "კოდი"],
  quantity: ["რაოდენობა", "ცალი", "qty", "quantity"],
  order_number: ["შეკვეთის ნომერი", "order_number", "order"],
  sender_name: ["გამგზ. სახელი, გვარი", "გამგზავნი", "sender"],
  receiver_name: ["მიმღ. სახელი, გვარი", "მიმღები", "receiver"],
  order_date: ["შეკვ. თარიღი", "შეკვეთის თარიღი"],
  pickup_date: ["აღების თარიღი"],
  comment: ["კომენტარი", "comment", "შენიშვნა"],
};

const normHeader = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

type MappingRow = { target_field: string; source_header: string | null; occurrence: number };

function buildHeaderMap(headers: string[], mappings: MappingRow[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const normalized = headers.map(normHeader);
  for (const field of FIELDS) {
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
      const idx = normalized.findIndex((h) => h === a);
      if (idx >= 0) { map[field] = idx; break; }
    }
    if (map[field] === undefined) {
      for (const alias of FALLBACK_ALIASES[field]) {
        const a = alias.toLowerCase();
        const idx = normalized.findIndex((h) => h.includes(a));
        if (idx >= 0) { map[field] = idx; break; }
      }
    }
  }
  return map;
}

// ---------- Helpers shared with the client lib ----------
function senderIsCustomer(sender: string | null): boolean {
  const s = (sender || "").trim();
  if (!s) return false;
  if (/^customer[-\s]?\d+/i.test(s)) return true;
  const digits = s.replace(/[^0-9]/g, "");
  return digits.length >= 6 && digits.length >= s.replace(/\s/g, "").length - 3;
}

function parseCommentItems(comment: string | null): { code: string; qty: number }[] {
  const s = (comment || "").trim();
  if (!s) return [];
  const body = s.replace(/\[[^\]]*\]/g, " ");
  const out: { code: string; qty: number }[] = [];
  for (const part of body.split(/[,;]+/)) {
    const m = part.trim().match(/^([A-Za-z0-9_\-\/.]+)\s*[-–xX*]\s*(\d+)$/);
    if (m) out.push({ code: m[1], qty: parseInt(m[2], 10) || 1 });
    else {
      const only = part.trim().match(/^([A-Za-z0-9_\-\/.]+)$/);
      if (only) out.push({ code: only[1], qty: 1 });
    }
  }
  return out;
}

const itemsKey = (items: { code: string; qty: number }[]) =>
  items.map((i) => `${i.code}:${i.qty}`).sort().join("|");

function normPhone(p: string | null): string | null {
  const d = (p || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  return d.length > 9 ? d.slice(-9) : d;
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
    const [, dd, mm, yy, hh, mi, ss] = m;
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

type StatusMapRow = {
  courier_status: string;
  outbound_state: string; outbound_is_final: boolean;
  return_state: string; return_is_final: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed", details: {} });

  let stage = "init";
  const debug: Record<string, any> = {};
  let batchId: string | null = null;
  let admin: any = null;

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
    admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_active_admin", { user_id: userId });
    if (!isAdmin) return json(403, { success: false, message: "Forbidden", details: { stage } });

    stage = "parse_payload";
    const payload = await req.json().catch(() => null);
    if (!payload) return json(400, { success: false, message: "Invalid JSON body", details: { stage } });
    const mode: string = payload.mode || "start";

    // ================= START =================
    if (mode === "start") {
      const { file_name, file_hash, file_size, total_rows, covered_from, covered_to } = payload;
      if (!file_name || !file_hash) {
        return json(400, { success: false, message: "Missing file_name / file_hash", details: { stage } });
      }
      // Only a COMPLETED batch with the same hash blocks a re-upload; failed ones may be retried.
      const { data: existingRows } = await admin
        .from("courier_import_batches").select("*")
        .eq("file_hash", file_hash).eq("status", "completed")
        .order("uploaded_at", { ascending: false }).limit(1);
      const existing = (existingRows || [])[0];
      if (existing) {
        return json(200, {
          success: true,
          message: `This exact file was already imported on ${new Date(existing.uploaded_at).toLocaleString()}.`,
          details: { deduped: true, batch: existing },
        });
      }
      const { data: batch, error } = await admin.from("courier_import_batches").insert({
        file_name, file_hash,
        uploaded_by: userEmail || userId,
        total_rows: total_rows || 0,
        covered_from: covered_from || null,
        covered_to: covered_to || null,
        status: "processing",
      }).select().single();
      if (error) return json(500, { success: false, message: `Failed to create batch: ${error.message}`, details: { stage } });
      return json(200, { success: true, message: "Batch created", details: { batch_id: batch.id, batch } });
    }

    // ================= FINALIZE =================
    if (mode === "finalize") {
      batchId = payload.batch_id;
      if (!batchId) return json(400, { success: false, message: "Missing batch_id", details: { stage } });
      const { data: batch } = await admin
        .from("courier_import_batches").select("*").eq("id", batchId).maybeSingle();
      // never overwrite a specific server-side error with a generic client message
      const keepExisting = payload.keep_existing_error && (batch as any)?.error_message;
      const { data: updated } = await admin.from("courier_import_batches").update({
        status: payload.failed ? "failed" : "completed",
        finalized_at: new Date().toISOString(),
        error_message: keepExisting ? (batch as any).error_message : (payload.error_message || null),
      }).eq("id", batchId).select().single();
      return json(200, { success: true, message: "Batch finalized", details: { batch: updated || batch } });
    }

    if (mode !== "chunk") {
      return json(400, { success: false, message: `Unknown mode: ${mode}`, details: { stage } });
    }

    // ================= CHUNK =================
    batchId = payload.batch_id;
    const headers: any[] = payload.headers || [];
    const rows: any[][] = payload.rows || [];
    const onlyFrom: string | null = payload.only_from || null;
    if (!batchId || !Array.isArray(headers) || !Array.isArray(rows)) {
      return json(400, { success: false, message: "Missing batch_id / headers / rows", details: { stage } });
    }

    stage = "mapping";
    const { data: mappingsData } = await admin
      .from("courier_import_mappings").select("target_field, source_header, occurrence");
    const headerStrs = headers.map((h: any) => String(h ?? ""));
    const hmap = buildHeaderMap(headerStrs, (mappingsData as MappingRow[]) || []);
    const missing = REQUIRED_FIELDS.filter((r) => hmap[r.field] === undefined);
    if (missing.length > 0) {
      return json(400, {
        success: false,
        message: `Column mapping missing: ${missing.map((m) => m.label).join(", ")}`,
        details: { stage, detected_headers: headerStrs },
      });
    }

    stage = "status_map";
    const { data: smRows } = await admin.from("courier_status_map")
      .select("courier_status, outbound_state, outbound_is_final, return_state, return_is_final");
    const statusMap = new Map<string, StatusMapRow>();
    for (const r of (smRows || []) as StatusMapRow[]) statusMap.set(r.courier_status.trim(), r);

    // Legacy derived_status kept in sync so old pages keep working.
    const legacyOf = (state: string, isReturn: boolean): { derived: string; type: string } => {
      const type = isReturn ? "RETURN_TO_SENDER" : "CUSTOMER_DELIVERY";
      switch (state) {
        case "DELIVERED": return { derived: "DELIVERED_TO_CUSTOMER", type };
        case "FAILED_FINAL": return { derived: "FINAL_NOT_DELIVERED", type };
        case "FAILED_ATTEMPT": return { derived: "IN_TRANSIT", type };
        case "RETURNED_FAILED": return { derived: "RETURNED_TO_SENDER", type };
        case "CANCELLED_EXCLUDED": return { derived: "CANCELLED_BEFORE_COURIER", type };
        case "RETURN_COLLECTED":
        case "RETURN_FAILED": return { derived: "RETURNED_TO_SENDER", type };
        case "RETURN_CANCELLED": return { derived: "CANCELLED_BEFORE_COURIER", type };
        default: return { derived: "IN_TRANSIT", type };
      }
    };

    stage = "transform_rows";
    const get = (row: any[], f: Field) => { const i = hmap[f]; return i === undefined ? null : row[i]; };
    const nowISO = new Date().toISOString();

    type Parsed = {
      tracking: string; courierStatus: string; cod: number; comp: number;
      isReturn: boolean; state: string; isFinal: boolean;
      statusDate: string | null; orderDate: string | null; pickupDate: string | null;
      phone: string | null; phoneNorm: string | null;
      sender: string | null; receiver: string | null;
      customerName: string | null; city: string | null; address: string | null;
      sku: string | null; quantity: number | null; orderNumber: string | null;
      comment: string | null; items: { code: string; qty: number }[];
      rawObj: Record<string, any>;
    };

    const parsed: Parsed[] = [];
    const seen = new Set<string>();
    let errored = 0, duplicateInFile = 0, filteredOut = 0;
    const errors: any[] = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!Array.isArray(row) || row.every((v) => v == null || v === "")) continue;
      try {
        const tracking = String(get(row, "tracking_number") ?? "").trim();
        if (!tracking) { errored++; errors.push({ row: ri + 1, error: "missing tracking" }); continue; }
        if (seen.has(tracking)) { duplicateInFile++; continue; }
        seen.add(tracking);

        const orderDate = parseDate(get(row, "order_date"));
        if (onlyFrom && orderDate && orderDate < onlyFrom) { filteredOut++; continue; }

        const courierStatus = String(get(row, "courier_status") ?? "").trim();
        const sender = (get(row, "sender_name") ?? "")?.toString().trim() || null;
        const orderNumber = (get(row, "order_number") ?? "")?.toString().trim() || null;
        const isReturn = senderIsCustomer(sender) || (!orderNumber && senderIsCustomer(sender));
        const sm = statusMap.get(courierStatus);
        const state = sm ? (isReturn ? sm.return_state : sm.outbound_state) : "IN_PROGRESS";
        const isFinal = sm ? (isReturn ? sm.return_is_final : sm.outbound_is_final) : false;
        const phone = (get(row, "phone") ?? "")?.toString().trim() || (isReturn ? sender : null);
        const comment = (get(row, "comment") ?? "")?.toString().trim() || null;
        const rawObj: Record<string, any> = {};
        headerStrs.forEach((h, i) => { rawObj[h || `col_${i}`] = row[i]; });

        parsed.push({
          tracking, courierStatus,
          cod: parseNum(get(row, "cod_amount")),
          comp: parseNum(get(row, "company_receives")),
          isReturn, state, isFinal,
          statusDate: parseDate(get(row, "status_date")),
          orderDate,
          pickupDate: parseDate(get(row, "pickup_date")),
          phone, phoneNorm: normPhone(phone),
          sender,
          receiver: (get(row, "receiver_name") ?? "")?.toString().trim() || null,
          customerName: (get(row, "customer_name") ?? "")?.toString().trim() || null,
          city: (get(row, "city") ?? "")?.toString().trim() || null,
          address: (get(row, "address") ?? "")?.toString().trim() || null,
          sku: (get(row, "sku") ?? "")?.toString().trim() || null,
          quantity: parseInt(String(get(row, "quantity") ?? "0")) || null,
          orderNumber,
          comment, items: parseCommentItems(comment),
          rawObj,
        });
      } catch (e: any) {
        errored++;
        errors.push({ row: ri + 1, error: e?.message || String(e) });
      }
    }

    // ---- Existing shipments ----
    stage = "fetch_existing";
    const existingMap = new Map<string, any>();
    for (const t of chunk(parsed.map((p) => p.tracking), 400)) {
      const { data, error } = await admin.from("courier_shipments")
        .select("id, tracking_number, current_courier_status, derived_state, derived_status, latest_status_date, cod_amount, company_receives, order_number, phone, customer_name, city, address, sku, quantity, is_return, original_order_id, comment_raw")
        .in("tracking_number", t);
      if (error) throw error;
      for (const r of data || []) existingMap.set(r.tracking_number, r);
    }

    // ---- Classify ----
    stage = "classify";
    let newCount = 0, updatedCount = 0, unchanged = 0, ignoredFinal = 0;
    const conflicts: any[] = [];
    const toUpsert: any[] = [];
    const historyCandidates: Parsed[] = [];

    const finalStates = new Set([
      "DELIVERED", "FAILED_FINAL", "RETURNED_FAILED", "CANCELLED_EXCLUDED",
      "RETURN_COLLECTED", "RETURN_FAILED", "RETURN_CANCELLED",
    ]);

    for (const p of parsed) {
      const ex = existingMap.get(p.tracking);
      if (ex) {
        const exFinal = ex.derived_state ? finalStates.has(ex.derived_state) : false;
        const statusDifferent = (ex.current_courier_status || "") !== p.courierStatus;
        if (exFinal) {
          ignoredFinal++;
          if (statusDifferent) {
            conflicts.push({
              tracking: p.tracking,
              stored_status: ex.current_courier_status,
              file_status: p.courierStatus,
              stored_state: ex.derived_state,
            });
          }
          continue; // never modify a finalized shipment
        }
        const dateDifferent = (ex.latest_status_date || null) !== (p.statusDate || null);
        if (!statusDifferent && !dateDifferent) { unchanged++; continue; }
        updatedCount++;
        const legacy = legacyOf(p.state, p.isReturn);
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
          derived_state: p.state,
          derived_status: legacy.derived,
          shipment_type: legacy.type,
          is_return: p.isReturn,
          sender_name: p.sender,
          receiver_name: p.receiver,
          order_date: p.orderDate,
          pickup_date: p.pickupDate,
          final_status_date: p.isFinal ? (p.statusDate ?? nowISO) : null,
          comment_raw: p.comment ?? ex.comment_raw,
          comment_items: p.items,
          last_seen_at: nowISO,
          latest_status_date: p.statusDate ?? ex.latest_status_date,
          status_changed_at: statusDifferent ? nowISO : undefined,
        });
        historyCandidates.push(p);
      } else {
        newCount++;
        const legacy = legacyOf(p.state, p.isReturn);
        toUpsert.push({
          tracking_number: p.tracking,
          order_number: p.orderNumber,
          phone: p.phone,
          customer_name: p.customerName, city: p.city, address: p.address,
          sku: p.sku, quantity: p.quantity,
          cod_amount: p.cod, company_receives: p.comp,
          current_courier_status: p.courierStatus,
          derived_state: p.state,
          derived_status: legacy.derived,
          shipment_type: legacy.type,
          is_return: p.isReturn,
          sender_name: p.sender, receiver_name: p.receiver,
          order_date: p.orderDate, pickup_date: p.pickupDate,
          final_status_date: p.isFinal ? (p.statusDate ?? nowISO) : null,
          comment_raw: p.comment, comment_items: p.items,
          first_seen_at: nowISO, last_seen_at: nowISO,
          latest_status_date: p.statusDate,
          status_changed_at: nowISO,
        });
        historyCandidates.push(p);
      }
    }

    // ---- Upsert ----
    stage = "upsert_shipments";
    for (const part of chunk(toUpsert, 400)) {
      const cleaned = part.map((r) => {
        const o: any = {};
        for (const [k, v] of Object.entries(r)) if (v !== undefined) o[k] = v;
        return o;
      });
      const { error } = await admin.from("courier_shipments").upsert(cleaned, { onConflict: "tracking_number" });
      if (error) throw error;
    }

    // ---- Match outbound rows to orders (set-based, one RPC) ----
    stage = "match_orders";
    let ordersUpdated = 0, unmatchedRows = 0;
    const outbound = parsed.filter((p) => !p.isReturn);
    if (outbound.length) {
      const syncRows = outbound.map((p) => ({
        tracking: p.tracking,
        order_number: p.orderNumber ?? null,
        status: p.courierStatus,
      }));
      for (const part of chunk(syncRows, 1000)) {
        const { data: res, error } = await admin.rpc("courier_sync_orders", {
          p_batch_id: batchId, p_rows: part,
        });
        if (error) throw error;
        ordersUpdated += Number((res as any)?.orders_updated || 0);
        unmatchedRows += Number((res as any)?.unmatched || 0);
      }
    }

    // ---- Link returns to their original outbound shipment (set-based, one RPC) ----
    stage = "link_returns";
    let linkedReturns = 0, unlinkedReturns = 0;
    const returns = parsed.filter((p) => p.isReturn);
    if (returns.length) {
      for (const part of chunk(returns.map((r) => r.tracking), 1000)) {
        const { data: res, error } = await admin.rpc("courier_link_returns", { p_trackings: part });
        if (error) throw error;
        linkedReturns += Number((res as any)?.linked || 0);
        unlinkedReturns += Number((res as any)?.unlinked || 0);
      }
    }

    // ---- History ----
    stage = "insert_history";
    const trackingToId = new Map<string, string>();
    for (const t of chunk(historyCandidates.map((p) => p.tracking), 400)) {
      const { data } = await admin.from("courier_shipments").select("id, tracking_number").in("tracking_number", t);
      for (const r of (data || []) as any[]) trackingToId.set(r.tracking_number, r.id);
    }
    const historyRows = historyCandidates.map((p) => ({
      courier_shipment_id: trackingToId.get(p.tracking)!,
      tracking_number: p.tracking,
      import_batch_id: batchId,
      courier_status: p.courierStatus,
      derived_status: legacyOf(p.state, p.isReturn).derived,
      status_date: p.statusDate,
      cod_amount: p.cod,
      company_receives: p.comp,
      raw_row_json: p.rawObj,
    })).filter((r) => r.courier_shipment_id);

    let newHistoryRows = 0;
    for (const part of chunk(historyRows, 400)) {
      const { data: ins, error } = await admin.from("courier_status_history").insert(part).select("id");
      if (error) {
        for (const one of part) {
          const { data: oneIns } = await admin.from("courier_status_history").insert(one).select("id");
          if (oneIns) newHistoryRows += oneIns.length;
        }
      } else newHistoryRows += ins?.length || 0;
    }

    // ---- Accumulate batch counters (crash-safe: written per chunk) ----
    stage = "accumulate";
    const { data: b } = await admin.from("courier_import_batches").select("*").eq("id", batchId).maybeSingle();
    if (b) {
      await admin.from("courier_import_batches").update({
        successful_rows: (b.successful_rows || 0) + newCount + updatedCount + unchanged + ignoredFinal,
        error_rows: (b.error_rows || 0) + errored,
        new_shipments: (b.new_shipments || 0) + newCount,
        updated_shipments: (b.updated_shipments || 0) + updatedCount,
        skipped_rows: (b.skipped_rows || 0) + unchanged + ignoredFinal + duplicateInFile + filteredOut,
        new_history_rows: (b.new_history_rows || 0) + newHistoryRows,
        order_count: (b.order_count || 0) + ordersUpdated,
        linked_returns: (b.linked_returns || 0) + linkedReturns,
        unlinked_returns: (b.unlinked_returns || 0) + unlinkedReturns,
        conflict_rows: (b.conflict_rows || 0) + conflicts.length,
        conflicts: [...(Array.isArray(b.conflicts) ? b.conflicts : []), ...conflicts].slice(0, 500),
        errors: [...(Array.isArray(b.errors) ? b.errors : []), ...errors].slice(0, 200),
        updated_at: nowISO,
      }).eq("id", batchId);
    }

    return json(200, {
      success: true,
      message: `${parsed.length} rows: ${newCount} new, ${updatedCount} updated, ${unchanged} unchanged, ${ignoredFinal} finalized-ignored`,
      details: {
        new: newCount, updated: updatedCount, unchanged, ignored_final: ignoredFinal,
        conflicts: conflicts.length, errors: errored, duplicate_in_file: duplicateInFile,
        filtered_out: filteredOut, orders_updated: ordersUpdated, unmatched_rows: unmatchedRows,
        linked_returns: linkedReturns, unlinked_returns: unlinkedReturns,
        new_history_rows: newHistoryRows,
      },
    });
  } catch (e: any) {
    console.error("import-courier fatal", { stage, error: e?.message, stack: e?.stack, debug });
    if (batchId && admin) {
      try {
        await admin.from("courier_import_batches").update({
          status: "failed",
          finalized_at: new Date().toISOString(),
          error_message: `${stage}: ${e?.message || String(e)}`,
        }).eq("id", batchId);
      } catch { /* ignore */ }
    }
    return json(500, { success: false, message: e?.message || "Unknown error", details: { stage } });
  }
});

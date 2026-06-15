// Courier Import Edge Function
// Parses xlsx, upserts shipments, appends history, auto-links returns
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- Header detection ----------
type Field =
  | "tracking_number" | "courier_status" | "status_date" | "cod_amount" | "company_receives"
  | "phone" | "customer_name" | "city" | "address" | "sku" | "quantity" | "order_number";

// Fallback aliases only used if DB mapping is missing for a field.
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

function buildHeaderMap(
  headers: string[],
  mappings: MappingRow[],
): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const normalized = headers.map(normHeader);
  const fields: Field[] = [
    "tracking_number","courier_status","status_date","cod_amount","company_receives",
    "phone","customer_name","city","address","sku","quantity","order_number",
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

// Some courier files start with a title row. Find the actual header row by
// scanning the first 15 rows for the configured tracking-number header.
function findHeaderRow(rows: any[][], mappings: MappingRow[]): number {
  const tn = mappings.find((m) => m.target_field === "tracking_number")?.source_header;
  const wanted = new Set([
    tn ? normHeader(tn) : "თრექინგი",
    "თრექინგი", "შტრიხკოდი", "tracking", "tracking_number",
  ]);
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = (rows[i] || []).map(normHeader);
    if (row.some((c) => wanted.has(c))) return i;
  }
  return 0;
}

// ---------- Derived status ----------
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
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0))).toISOString();
  }
  const d = new Date(String(v));
  return isNaN(+d) ? null : d.toISOString();
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub;
    const userEmail = claims.claims.email as string | undefined;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_active_admin", { user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing file" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const buf = await file.arrayBuffer();
    const fileHash = await sha256(buf);

    // Idempotent re-upload
    const { data: existing } = await admin
      .from("courier_import_batches").select("*").eq("file_hash", fileHash).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ batch: existing, deduped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse xlsx
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: "Empty file" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const headers = rows[0].map((h) => String(h ?? ""));
    const hmap = buildHeaderMap(headers);
    if (hmap.tracking_number === undefined) {
      return new Response(JSON.stringify({ error: "Missing tracking number column", detected_headers: headers }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create batch (processing)
    const { data: batch, error: batchErr } = await admin
      .from("courier_import_batches")
      .insert({
        file_name: file.name,
        file_hash: fileHash,
        uploaded_by: userEmail || userId,
        total_rows: rows.length - 1,
        status: "processing",
      })
      .select().single();
    if (batchErr) throw batchErr;

    let successful = 0, errored = 0, newShip = 0, updShip = 0, newHist = 0, possRet = 0, autoLinked = 0;
    const errors: any[] = [];

    const get = (row: any[], f: Field) => {
      const i = hmap[f]; return i === undefined ? null : row[i];
    };

    for (let ri = 1; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || row.every((v) => v == null || v === "")) continue;

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

        // raw row as object
        const rawObj: Record<string, any> = {};
        headers.forEach((h, i) => { rawObj[h || `col_${i}`] = row[i]; });

        // Find existing shipment
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
          // Update current fields
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
          // Try linking to existing order via tracking
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

        // History (dedup via unique idx)
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
          // ignore unique-violation duplicates silently
        }

        // Return matching for new return shipments
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
              // update linked tracking on both
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
        errors.push({ row: ri + 1, error: e.message || String(e) });
      }
    }

    const { data: finalBatch } = await admin.from("courier_import_batches").update({
      successful_rows: successful, error_rows: errored,
      new_shipments: newShip, updated_shipments: updShip,
      new_history_rows: newHist, possible_returns: possRet, auto_linked_returns: autoLinked,
      errors: errors.slice(0, 200), status: "completed",
    }).eq("id", batch.id).select().single();

    return new Response(JSON.stringify({ batch: finalBatch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("import-courier error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

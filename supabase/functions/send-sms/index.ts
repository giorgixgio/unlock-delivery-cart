// send-sms — SMSOffice.ge dispatcher with insert-first dedup guard.
// verify_jwt = false at the platform level; we validate in code:
//   type=confirmation  → the (orderNumber, phone) pair must match an order
//                        created within the last 10 minutes.
//   type=fulfillment   → the caller must be an active admin (JWT required).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SMSOFFICE_URL = "https://smsoffice.ge/api/v2/send/";
const SENDER = "BIGMART";

type SmsType = "confirmation" | "fulfillment";

function normalizeGePhone(input: string): string | null {
  if (!input) return null;
  let digits = String(input).replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("995")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) return null;
  return `995${digits}`;
}

function buildContent(type: SmsType, orderNumber: string): string {
  if (type === "confirmation") {
    return `შეკვეთა #${orderNumber} მიღებულია. ოპერატორი დაგირეკავთ. BIGMART`;
  }
  return `შეკვეთა #${orderNumber} გზაშია. კურიერი დაგირეკავთ. BIGMART`;
}

function buildReference(type: SmsType, orderNumber: string): string {
  const suffix = type === "confirmation" ? "-C" : "-F";
  return `${orderNumber}${suffix}`.slice(0, 20);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SMSOFFICE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SMSOFFICE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const { phone, orderNumber, type } = body as { phone?: string; orderNumber?: string; type?: SmsType };

    if (!orderNumber || (type !== "confirmation" && type !== "fulfillment")) {
      return new Response(JSON.stringify({ error: "orderNumber and valid type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const service = createClient(supabaseUrl, serviceKey);

    // --- Authorization ---
    if (type === "fulfillment") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claims } = await userClient.auth.getClaims(token);
      const uid = claims?.claims?.sub;
      if (!uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: isAdmin } = await service.rpc("is_active_admin", { user_id: uid });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      // confirmation → verify the (orderNumber, phone) pair matches a fresh order
      const { data: ord } = await service
        .from("orders")
        .select("public_order_number, customer_phone, created_at")
        .eq("public_order_number", orderNumber)
        .maybeSingle();
      if (!ord) {
        return new Response(JSON.stringify({ error: "order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const ageMs = Date.now() - new Date(ord.created_at as string).getTime();
      if (ageMs > 10 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "order too old for confirmation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Best-effort phone match (last 9 digits)
      const submittedLast9 = String(phone || "").replace(/\D/g, "").slice(-9);
      const orderLast9 = String(ord.customer_phone || "").replace(/\D/g, "").slice(-9);
      if (!submittedLast9 || submittedLast9 !== orderLast9) {
        return new Response(JSON.stringify({ error: "phone mismatch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // --- Phone normalization ---
    const destination = normalizeGePhone(phone || "");
    if (!destination) {
      // Log skip and return
      await service.from("sms_logs").insert({
        order_number: orderNumber, phone: phone ?? null, type, sender: SENDER,
        content: null, error_code: null, api_message: "invalid_phone", status: "skipped",
      }).select("id").maybeSingle();
      return new Response(JSON.stringify({ skipped: "invalid_phone" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = buildContent(type, orderNumber);
    const reference = buildReference(type, orderNumber);

    // --- INSERT-FIRST DEDUP GUARD ---
    // Row goes in with status='pending'; unique(order_number, type) makes a
    // concurrent second attempt fail with 23505 → we skip the send entirely.
    const { data: inserted, error: insertErr } = await service
      .from("sms_logs")
      .insert({
        order_number: orderNumber, phone: destination, type, sender: SENDER,
        content, status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      const code = (insertErr as any).code;
      if (code === "23505") {
        return new Response(JSON.stringify({ skipped: "already_sent" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: `log insert failed: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const logId = inserted!.id as string;

    // --- Call SMSOffice ---
    const params = new URLSearchParams({
      key: apiKey,
      destination,
      sender: SENDER,
      content,
      reference,
    });

    let errorCode: number | null = null;
    let apiMessage: string | null = null;
    let status: "sent" | "failed" = "failed";

    try {
      const resp = await fetch(`${SMSOFFICE_URL}?${params.toString()}`, { method: "GET" });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      if (json) {
        errorCode = typeof json.ErrorCode === "number" ? json.ErrorCode : (json.Success ? 0 : -1);
        apiMessage = json.Message ?? null;
        status = errorCode === 0 ? "sent" : "failed";
      } else {
        apiMessage = text.slice(0, 500);
        status = resp.ok ? "sent" : "failed";
      }
    } catch (e) {
      apiMessage = `network: ${(e as Error).message}`;
      status = "failed";
    }

    await service.from("sms_logs")
      .update({ error_code: errorCode, api_message: apiMessage, status })
      .eq("id", logId);

    return new Response(JSON.stringify({ ok: status === "sent", status, errorCode, apiMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// send-sms — Sender.ge dispatcher with insert-first dedup guard.
// verify_jwt = false at the platform level; we validate in code:
//   type=confirmation  → the (orderNumber, phone) pair must match an order
//                        created within the last 10 minutes.
//   type=fulfillment   → the caller must be an active admin (JWT required).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeGePhone, sendSms, senderApiKey } from "../_shared/senderGe.ts";

const PROVIDER = "sender.ge";

type SmsType = "confirmation" | "fulfillment";

function buildContent(type: SmsType, orderNumber: string): string {
  if (type === "confirmation") {
    return `შეკვეთა #${orderNumber} მიღებულია. ოპერატორი დაგირეკავთ. BIGMART`;
  }
  return `შეკვეთა #${orderNumber} გზაშია. კურიერი დაგირეკავთ. BIGMART`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = senderApiKey();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SENDER_GE_API_KEY not configured" }),
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
        order_number: orderNumber, phone: phone ?? null, type, sender: PROVIDER, provider: PROVIDER,
        content: null, error_code: null, api_message: "invalid_phone", status: "skipped",
      }).select("id").maybeSingle();
      return new Response(JSON.stringify({ skipped: "invalid_phone" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = buildContent(type, orderNumber);

    // --- INSERT-FIRST DEDUP GUARD ---
    // unique(order_number, type): a fresh insert wins; on conflict a single
    // conditional UPDATE reclaims only failed or stale-pending (>2 min) rows.
    let logId: string | null = null;
    let priorAttempts = 0;
    const { data: inserted, error: insertErr } = await service
      .from("sms_logs")
      .insert({ order_number: orderNumber, phone: destination, type, sender: PROVIDER, provider: PROVIDER, content, status: "pending", attempts: 1 })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      if ((insertErr as any).code !== "23505") {
        return new Response(JSON.stringify({ error: `log insert failed: ${insertErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: claimed, error: claimErr } = await service.rpc("sms_claim_retry", {
        p_order_number: orderNumber, p_type: type, p_phone: destination, p_content: content,
      });
      if (claimErr) {
        return new Response(JSON.stringify({ error: `retry claim failed: ${claimErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!claimed) {
        return new Response(JSON.stringify({ skipped: "already_sent" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      logId = claimed as string;
      const { data: row } = await service.from("sms_logs").select("attempts").eq("id", logId).maybeSingle();
      priorAttempts = Math.max(0, Number(row?.attempts ?? 1) - 1);
    } else {
      logId = inserted!.id as string;
    }

    // --- Call Sender.ge ---
    const result = await sendSms(apiKey, destination, content);
    const status = result.status;
    const errorCode = result.httpStatus;
    const apiMessage = result.apiMessage;

    await service.from("sms_logs").update({
      error_code: errorCode, api_message: apiMessage, status,
      message_id: result.messageId, segments: result.segments,
      delivery_status: status === "sent" ? "pending" : null,
      attempts: priorAttempts + result.attempts,
    }).eq("id", logId);

    if (status === "skipped") {
      return new Response(JSON.stringify({ skipped: "unsubscribed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: status === "sent", status, errorCode, apiMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

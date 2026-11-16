// refund-request — staff send a refund link by SMS; customers open /r/:token and submit name + IBAN.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { normalizeGePhone, senderApiKey, sendSms } from "../_shared/senderGe.ts";
import { loadSmsContext } from "../_shared/smsOrderContext.ts";
import { newToken, normalizeIban, refundText } from "./policy.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Tok = z.string().regex(/^[0-9A-Za-z]{10}$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), request_id: z.string().uuid() }),
  z.object({ action: z.literal("get"), token: Tok }),
  z.object({ action: z.literal("submit"), token: Tok, full_name: z.string().trim().min(3).max(100), iban: z.string().trim().min(15).max(40) }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return json({ error: "invalid_request" }, 400);
  const b = p.data;

  if (b.action === "send") {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: u } = await auth.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: staff } = await db.rpc("is_active_staff", { user_id: u.user.id });
    if (!staff) return json({ error: "forbidden" }, 403);

    const { data: t } = await db.from("customer_requests").select("id, order_id, kind").eq("id", b.request_id).maybeSingle();
    if (!t || t.kind !== "operator_flag") return json({ error: "ticket_not_found" }, 404);
    const ctx = await loadSmsContext(db, { id: t.order_id });
    if (!ctx) return json({ error: "order_not_found" }, 404);
    const phone = normalizeGePhone(ctx.order.customer_phone);
    if (!phone) return json({ error: "bad_phone" }, 400);

    const { data: existing } = await db.from("refund_requests").select("id, token, status").eq("request_id", t.id).maybeSingle();
    if (existing && existing.status !== "sent") return json({ error: "already_" + existing.status }, 409);
    const amount = (ctx.order.order_items || []).reduce((s: number, i: any) => s + Number(i.unit_price || 0) * Number(i.quantity || 1), 0);
    const token = existing?.token || newToken();
    const row = { request_id: t.id, order_id: t.order_id, token, phone, amount, status: "sent", sent_by: u.user.email, sent_at: new Date().toISOString(), sms_status: "pending", sms_error: null };
    const { data: saved, error } = await db.from("refund_requests").upsert(row, { onConflict: "request_id" }).select("id").single();
    if (error) return json({ error: error.message }, 500);

    const link = `https://${ctx.store === "BIGMART" ? "bigmart.ge" : "trendmart.ge"}/refund/${token}`;
    // Test orders still get the refund SMS: it is a manual staff action and is how the flow is tested.
    const key = senderApiKey();
    if (!key) return json({ error: "sms_not_configured" }, 500);
    const content = refundText(link, String(ctx.order.public_order_number), amount, ctx.store === "BIGMART" ? "BIGMART" : "TRENDMART");
    const logId = crypto.randomUUID();
    await db.from("sms_logs").insert({ id: logId, order_number: ctx.order.public_order_number, phone, type: "refund_link", sender: "sender.ge", provider: "sender.ge", content, status: "pending", attempts: 1 });
    const r = await sendSms(key, phone, content);
    await db.from("sms_logs").update({ status: r.status, error_code: r.httpStatus, api_message: r.apiMessage, message_id: r.messageId, segments: r.segments, attempts: r.attempts, delivery_status: r.status === "sent" ? "pending" : null }).eq("id", logId);
    await db.from("refund_requests").update({ sms_status: r.status, sms_error: r.status === "sent" ? null : r.apiMessage }).eq("id", saved.id);
    await db.from("support_ticket_messages").insert({ request_id: t.id, author_type: "system", author: u.user.email, body: `💸 თანხის დაბრუნების ბმული გაიგზავნა (${r.status})`, link_url: link, notify_customer: false });
    return json({ ok: r.status === "sent", sms: r.status, link });
  }

  const { data: rr } = await db.from("refund_requests").select("id, order_id, amount, status, full_name, submitted_at, refunded_at, opened_at").eq("token", b.token).maybeSingle();
  if (!rr) return json({ error: "not_found" }, 404);
  const { data: o } = await db.from("orders").select("public_order_number").eq("id", rr.order_id).maybeSingle();

  if (b.action === "get") {
    if (!rr.opened_at) await db.from("refund_requests").update({ opened_at: new Date().toISOString() }).eq("id", rr.id);
    return json({ order_number: o?.public_order_number, amount: rr.amount, status: rr.status, submitted_at: rr.submitted_at, refunded_at: rr.refunded_at });
  }
  if (rr.status !== "sent") return json({ error: "already_submitted", status: rr.status, submitted_at: rr.submitted_at }, 409);
  const iban = normalizeIban(b.iban);
  if (!iban) return json({ error: "bad_iban" }, 400);
  const now = new Date().toISOString();
  await db.from("refund_requests").update({ full_name: b.full_name, iban, status: "submitted", submitted_at: now }).eq("id", rr.id).eq("status", "sent");
  return json({ ok: true, status: "submitted", submitted_at: now });
});

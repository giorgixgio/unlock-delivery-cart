// sms-queue — sends due customer-sequence SMS from sms_queue through Sender.ge.
// Callers: the every-minute schedule (x-cron-secret from internal_job_secrets 'sms_queue') or an active admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeGePhone, sendSms, senderApiKey } from "../_shared/senderGe.ts";
import { applyQuietHours, deliveryWhen, isTbilisiCity, renderSms, type SeqType } from "../_shared/smsTemplates.ts";
import { loadSmsContext, STOPPED_STATUSES } from "../_shared/smsOrderContext.ts";
import { logBlockedSms } from "../_shared/smsGuard.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey);
  const given = req.headers.get("x-cron-secret");
  let allowed = false;
  if (given) {
    const { data: s } = await db.from("internal_job_secrets").select("value").eq("name", "sms_queue").maybeSingle();
    allowed = !!s?.value && s.value === given;
  }
  if (!allowed) {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: claims } = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub;
    const { data: isAdmin } = uid ? await db.rpc("is_active_admin", { user_id: uid }) : { data: false };
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
  }
  const apiKey = senderApiKey();
  if (!apiKey) return json({ error: "SENDER_GE_API_KEY not configured" }, 500);

  // Release rows stuck in 'sending' (worker crashed) after 5 minutes.
  await db.from("sms_queue").update({ status: "pending" }).eq("status", "sending").lt("send_after", new Date(Date.now() - 5 * 60000).toISOString());

  const now = new Date();
  const { data: due, error } = await db.from("sms_queue").select("*").eq("status", "pending").lte("send_after", now.toISOString()).order("send_after").limit(40);
  if (error) return json({ error: error.message }, 500);
  const stats = { sent: 0, skipped: 0, failed: 0, deferred: 0 };

  for (const item of due || []) {
    const { data: claimed } = await db.from("sms_queue").update({ status: "sending", attempts: item.attempts + 1 })
      .eq("id", item.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;
    const finish = (patch: Record<string, unknown>) => db.from("sms_queue").update(patch).eq("id", item.id);
    const skip = async (why: string) => { stats.skipped++; await finish({ status: "skipped", last_error: why }); };
    try {
      const quiet = applyQuietHours(now);
      if (quiet.getTime() !== now.getTime()) { stats.deferred++; await finish({ status: "pending", attempts: item.attempts, send_after: quiet.toISOString() }); continue; }
      const ctx = await loadSmsContext(db, { id: item.order_id });
      if (!ctx) { await skip("order_missing"); continue; }
      const { order, settings } = ctx;
      const type = item.type as SeqType;
      if (!settings.enabled[type]) { await skip("type_disabled"); continue; }
      if (STOPPED_STATUSES.has(String(order.status))) {
        await db.from("sms_queue").update({ status: "skipped", last_error: `order_${order.status}` }).eq("order_id", order.id).eq("status", "pending");
        await skip(`order_${order.status}`); continue;
      }
      if (type === "order_confirmed" && order.status !== "confirmed" && order.status !== "shipped") { await skip("not_confirmed"); continue; }
      if (type === "order_confirmed" && order.auto_confirmed === true) { await skip("auto_confirmed"); continue; }
      if (type === "call_no_answer" && order.status === "confirmed") { await skip("already_confirmed"); continue; }
      const phone = normalizeGePhone(order.customer_phone);
      if (!phone) { await skip("invalid_phone"); continue; }

      const confirmedAt = new Date(item.created_at); // enqueued at confirmation time
      const { text, warnings, skip: skipReason } = renderSms(type, {
        n: String(order.public_order_number), store: ctx.store, num1: settings.num1, num2: settings.num2,
        product: ctx.product, total: Number(order.total || 0),
        when: type === "order_confirmed" ? deliveryWhen(confirmedAt, isTbilisiCity(order.normalized_city || order.city, order.is_tbilisi)) : undefined,
      });
      if (warnings.length) console.warn(`sms-queue ${item.order_number}/${type}: ${warnings.join(",")}`);

      // sms_logs keeps unique(order_number, type); repeat steps get a suffix.
      const logType = item.seq > 1 ? `${type}_${item.seq}` : type;
      if (skipReason) {
        await logBlockedSms(db, { orderNumber: item.order_number, phone, type: logType, content: text, reason: skipReason });
        await skip(skipReason); continue;
      }
      const { data: log, error: logErr } = await db.from("sms_logs").insert({
        order_number: item.order_number, phone, type: logType, sender: "sender.ge", provider: "sender.ge", content: text, status: "pending", attempts: 1,
      }).select("id").maybeSingle();
      let logId = log?.id as string | undefined;
      if (logErr) {
        if ((logErr as any).code !== "23505") throw new Error(logErr.message);
        const { data: re } = await db.rpc("sms_claim_retry", { p_order_number: item.order_number, p_type: logType, p_phone: phone, p_content: text });
        if (!re) { stats.skipped++; await finish({ status: "sent", last_error: "already_sent", sent_at: new Date().toISOString() }); continue; }
        logId = re as string;
      }
      const r = await sendSms(apiKey, phone, text);
      await db.from("sms_logs").update({
        error_code: r.httpStatus, api_message: r.apiMessage, status: r.status, message_id: r.messageId, segments: r.segments,
        delivery_status: r.status === "sent" ? "pending" : null, attempts: r.attempts,
      }).eq("id", logId!);
      if (r.status === "sent") { stats.sent++; await finish({ status: "sent", sent_at: new Date().toISOString(), last_error: null }); }
      else if (r.status === "skipped") await skip("unsubscribed");
      else {
        stats.failed++;
        const final = item.attempts + 1 >= MAX_ATTEMPTS;
        await finish({ status: final ? "failed" : "pending", last_error: r.apiMessage || `HTTP ${r.httpStatus}`, send_after: new Date(Date.now() + 5 * 60000).toISOString() });
      }
    } catch (e) {
      stats.failed++;
      await finish({ status: item.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending", last_error: String((e as Error).message).slice(0, 300), send_after: new Date(Date.now() + 5 * 60000).toISOString() });
    }
  }
  return json({ due: due?.length || 0, ...stats });
});

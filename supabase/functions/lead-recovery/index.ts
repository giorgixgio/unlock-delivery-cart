import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeGePhone, senderApiKey, sendSms } from "../_shared/senderGe.ts";
import { loadSmsContext } from "../_shared/smsOrderContext.ts";
import { trackingLink, applyQuietHours } from "../_shared/smsTemplates.ts";
import { CAMPAIGN, WINDOW_START, WINDOW_END, eligible, recoveryText } from "./policy.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "configuration" }, 500);
  const db = createClient(url, key);
  const { data: secret } = await db.from("internal_job_secrets").select("value").eq("name", "sms_queue").maybeSingle();
  if (!secret?.value || req.headers.get("x-cron-secret") !== secret.value) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  if (body.send === true && now.getTime() > Date.parse("2026-11-15T18:00:00Z")) return json({ error: "campaign_expired" }, 409);
  if (body.send === true && applyQuietHours(now).getTime() !== now.getTime()) return json({ error: "quiet_hours" }, 409);
  const { data: orders, error } = await db.from("orders").select("*, order_items(sku,product_id)")
    .gte("created_at", WINDOW_START).lte("created_at", WINDOW_END).in("status", ["new", "pending_details", "pending_address"])
    .eq("call_attempt_count", 0).order("created_at", { ascending: false }).limit(2000);
  if (error) return json({ error: error.message }, 500);
  const { data: logs, error: logsError } = await db.from("sms_logs").select("phone,order_number").eq("type", CAMPAIGN);
  if (logsError) return json({ error: logsError.message }, 500);
  const seen = new Set((logs || []).map(l => l.phone));
  const candidates = (orders || []).filter(eligible).filter(o => {
    const phone = normalizeGePhone(o.customer_phone);
    if (!phone || seen.has(phone)) return false;
    seen.add(phone); return true;
  });
  if (body.send !== true) return json({ campaign: CAMPAIGN, remaining: candidates.length, logged: logs?.length || 0 });
  const apiKey = senderApiKey();
  if (!apiKey) return json({ error: "SMS not configured" }, 500);
  const stats = { sent: 0, failed: 0, skipped: 0, remaining: candidates.length, campaign: CAMPAIGN };
  const deadline = Date.now() + 100_000;
  for (const candidate of candidates.slice(0, 80)) {
    if (Date.now() > deadline) break;
    const ctx = await loadSmsContext(db, { id: candidate.id });
    if (!ctx || !eligible(ctx.order)) { stats.skipped++; continue; }
    const phone = normalizeGePhone(ctx.order.customer_phone);
    const baseLink = trackingLink(ctx.store, ctx.order.tracking_token);
    if (!phone || !baseLink) { stats.skipped++; continue; }
    const id = crypto.randomUUID();
    const content = recoveryText(`${baseLink}?sms=${id}`);
    const { error: insertError } = await db.from("sms_logs").insert({ id, order_number: ctx.order.public_order_number, phone, type: CAMPAIGN, sender: "sender.ge", provider: "sender.ge", content, status: "pending", attempts: 1 });
    if (insertError) { stats.skipped++; continue; }
    const result = await sendSms(apiKey, phone, content);
    const { error: saveError } = await db.from("sms_logs").update({ status: result.status, error_code: result.httpStatus, api_message: result.apiMessage, message_id: result.messageId, segments: result.segments, attempts: result.attempts, delivery_status: result.status === "sent" ? "pending" : null }).eq("id", id);
    if (saveError) return json({ ...stats, error: "delivery_log_save_failed" }, 500);
    stats[result.status === "sent" ? "sent" : result.status === "skipped" ? "skipped" : "failed"]++;
    if (result.status === "failed") break;
  }
  return json(stats);
});
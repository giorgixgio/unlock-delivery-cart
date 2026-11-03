// onway-status-pull — admin-only backfill: rebuilds courier_shipments/history for API shipments
// from the newest stored webhook payload per tracking, through the same write path as the webhook.
// action "probe": READ-ONLY attempts to find Onway's per-tracking status call (logged to onway_api_log).
// action "silent_check": webhook-silent Telegram alert (cron). Live provider pull stays DISABLED
// until Onway confirms an endpoint — do not guess further.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { upsertOnwayShipment } from "../_shared/courierApiUpsert.ts";
import { proxyFetch } from "../_shared/proxyFetch.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { isOwnerAlertEnabled } from "../_shared/telegramAlertPolicy.ts";
import { isWebhookSilent, WEBHOOK_SILENT_HOURS } from "../_shared/webhookSilence.ts";

const ONWAY_BASE = "https://onway.ge/index.php?route=";
// Only read-style route names; never add/cancel/edit.
const PROBE_ROUTES = ["api/order/get", "api/order/status", "api/order/tracking", "api/order/history", "api/order/info"];
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const mask = (raw: string) => raw.replace(/("?(to_phone|from_phone|phone|to_address|address|to_name|from_name)"?\s*:\s*")[^"]*"/gi, '$1***"').slice(0, 1500);

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const given = req.headers.get("x-cron-secret");
  let allowed = false;
  if (given) {
    const { data: s } = await db.from("internal_job_secrets").select("value").eq("name", "onway_status_pull").maybeSingle();
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

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || "backfill");

  if (action === "probe") {
    const username = Deno.env.get("ONWAY_API_USERNAME") || "", apiKey = Deno.env.get("ONWAY_API_KEY") || "";
    if (!username || !apiKey) return json({ error: "Onway API credentials missing" }, 500);
    const { data: ords } = await db.from("orders").select("onway_tracking, onway_sent_at").not("onway_tracking", "is", null)
      .not("onway_sent_at", "is", null).order("onway_sent_at", { ascending: false }).limit(3);
    const trackings = (ords || []).map((o: any) => String(o.onway_tracking)).slice(0, 3);
    if (!trackings.length) return json({ error: "No API trackings found" }, 404);
    const results: any[] = [];
    const t0 = trackings[0];
    const hashA = await sha256(`${username}:${apiKey}:${t0}`);
    const shapes = (t: string, h: string) => [
      { label: "json username+key+trackingnumber", body: { username, key: apiKey, trackingnumber: t } },
      { label: "json username+hash+trackingnumber", body: { username, hash: h, trackingnumber: t } },
    ];
    for (const route of PROBE_ROUTES) {
      for (const sh of shapes(t0, hashA)) {
        let status: number | null = null, raw = "", err: string | null = null;
        try {
          const r = await proxyFetch(ONWAY_BASE + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sh.body) });
          status = r.status; raw = await r.text();
        } catch (e) { err = String(e); }
        const masked = mask(raw);
        const looksOk = status === 200 && /trackingnumber|order_status|history/i.test(raw) && !/error|invalid|not found/i.test(raw.slice(0, 200));
        await db.from("onway_api_log").insert({ created_by: "probe", endpoint: route, request_masked: { shape: sh.label, tracking: t0 }, http_status: status, response_raw: masked, error_message: err });
        results.push({ route, shape: sh.label, http_status: status, looks_ok: looksOk, sample: masked.slice(0, 300), error: err });
      }
    }
    return json({ trackings_tested: [t0], results });
  }

  if (action === "silent_check") {
    const { data: last } = await db.from("onway_webhook_log").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle();
    const { count } = await db.from("courier_shipments").select("id", { count: "exact", head: true }).eq("source", "api").is("final_status_date", null);
    const now = new Date();
    const lastAt = last?.received_at ? new Date(last.received_at) : null;
    const silent = isWebhookSilent(now, lastAt, count || 0);
    if (!silent || !isOwnerAlertEnabled("webhook_silent")) return json({ ok: true, silent, open: count || 0 });
    // One alert per silence window: remember which last-received timestamp we already alerted on.
    const marker = lastAt?.toISOString() || "never";
    const { data: prev } = await db.from("site_settings").select("value").eq("key", "onway_webhook_silent_alerted").maybeSingle();
    if (prev?.value === marker) return json({ ok: true, silent, already_alerted: true });
    const hrs = lastAt ? Math.floor((now.getTime() - lastAt.getTime()) / 3600_000) : null;
    await sendTelegramMessage(`⚠️ Onway webhook silent${hrs != null ? ` ${hrs}h` : ""} (>${WEBHOOK_SILENT_HOURS}h) while ${count} API shipments are open. Courier statuses may be stale.`);
    await db.from("site_settings").upsert({ key: "onway_webhook_silent_alerted", value: marker }, { onConflict: "key" });
    return json({ ok: true, silent, alerted: true });
  }

  if (action === "pull") return json({ ok: false, disabled: true, reason: "pull not enabled — waiting for Onway endpoint" });

  // Newest payload per tracking, oldest first so newer-wins ordering holds.
  const { data: logs, error } = await db.from("onway_webhook_log").select("id, received_at, body_json")
    .not("body_json", "is", null).order("received_at", { ascending: false }).limit(5000);
  if (error) return json({ error: error.message }, 500);
  const latest = new Map<string, any>();
  for (const l of logs || []) {
    const t = String((l as any).body_json?.order_info?.trackingnumber ?? "").trim();
    if (t && !latest.has(t)) latest.set(t, l);
  }
  const counts: Record<string, number> = {};
  let historyAdded = 0, failed = 0;
  for (const l of [...latest.values()].reverse()) {
    try {
      const r = await upsertOnwayShipment(db, l.body_json);
      counts[r.result] = (counts[r.result] || 0) + 1;
      historyAdded += Number((r as any).history_added || 0);
    } catch (e) { failed++; console.error("onway-status-pull", e instanceof Error ? e.message : e); }
  }
  return json({ ok: true, trackings: latest.size, results: counts, history_added: historyAdded, failed });
});

// onway-status-pull — admin-only backfill: rebuilds courier_shipments/history for API shipments
// from the newest stored webhook payload per tracking, through the same write path as the webhook.
// action "probe": READ-ONLY attempts to find Onway's per-tracking status call (logged to onway_api_log).
// action "silent_check": webhook-silent Telegram alert (cron). Live provider pull stays DISABLED
// until Onway confirms an endpoint — do not guess further.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { upsertOnwayShipment } from "../_shared/courierApiUpsert.ts";
import { onwayPayloadToShipment } from "../_shared/courierShipment.ts";
import { fetchAndStoreOnwayLabels } from "../_shared/onwayLabels.ts";
import { fetchOnwayOrderInfo, openOnwaySession } from "../_shared/onwayPublicTrack.ts";
import { proxyFetch } from "../_shared/proxyFetch.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { isOwnerAlertEnabled } from "../_shared/telegramAlertPolicy.ts";
import { isWebhookSilent, WEBHOOK_SILENT_HOURS } from "../_shared/webhookSilence.ts";

const ONWAY_BASE = "https://onway.ge/index.php?route=";
// Only read-style route names; never add/cancel/edit.
const PROBE_ROUTES = ["api/order/get", "api/order/status", "api/order/tracking", "api/order/history", "api/order/info"];
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const mask = (raw: string) => raw.replace(/("?(to_phone|from_phone|phone|to_address|address|to_name|from_name)"?\s*:\s*")[^"]*"/gi, '$1***"').slice(0, 1500);
const maskSecrets = (raw: string, u: string, k: string) => mask((k ? raw.split(k).join("***") : raw).split(u || "\0").join("***"));
const toB64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const classifyBytes = (bytes: Uint8Array, ct: string) => {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  if (head.startsWith("%PDF")) return "pdf";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 600)).trim();
  if (/^<!doctype html|^<html/i.test(text) || /text\/html/i.test(ct)) return "html";
  if (/^https?:\/\//i.test(text)) return "url";
  if (/^JVBERi0/.test(text)) return "base64_pdf";
  if (text.startsWith("{") || text.startsWith("[") || /json/i.test(ct)) {
    if (/JVBERi0/.test(text)) return "json_base64_pdf";
    if (/https?:\/\/[^\s"]+\.pdf/i.test(text)) return "json_pdf_url";
    return "json";
  }
  return /image\//i.test(ct) ? ct : "text";
};

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const given = req.headers.get("x-cron-secret");
  let allowed = false;
  let isAdmin = false;
  if (given) {
    const { data: s } = await db.from("internal_job_secrets").select("value").eq("name", "onway_status_pull").maybeSingle();
    allowed = !!s?.value && s.value === given;
  }
  if (!allowed) {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: claims } = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub;
    const { data: adminFlag } = uid ? await db.rpc("is_active_admin", { user_id: uid }) : { data: false };
    isAdmin = !!adminFlag;
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

  if (action === "labels_probe") {
    const username = Deno.env.get("ONWAY_API_USERNAME") || "", apiKey = Deno.env.get("ONWAY_API_KEY") || "";
    if (!username || !apiKey) return json({ error: "Onway API credentials missing" }, 500);
    const { data: ords } = await db.from("orders").select("onway_tracking, onway_sent_at").not("onway_tracking", "is", null)
      .not("onway_sent_at", "is", null).order("onway_sent_at", { ascending: false }).limit(3);
    const rawTr = (ords || []).map((o: any) => String(o.onway_tracking)).slice(0, 3);
    if (!rawTr.length) return json({ error: "No API trackings found" }, 404);
    // Non-monotonic order [middle, newest, oldest] so we can tell sent-order vs sorted.
    const tr = rawTr.length === 3 ? [rawTr[1], rawTr[0], rawTr[2]] : rawTr;
    const t0 = tr[0];
    const formOf = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();
    const attempts: { id: string; ct: string; body: string; multi: boolean }[] = [
      { id: "1_auth_only_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey }), multi: true },
      { id: "2_trackingnumber_one_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey, trackingnumber: t0 }), multi: false },
      { id: "3_trackingnumbers_arr_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey, trackingnumbers: tr }), multi: true },
      { id: "4_trackingnumber_csv_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey, trackingnumber: tr.join(",") }), multi: true },
      { id: "5a_tracking_arr_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey, tracking: tr }), multi: true },
      { id: "5b_orders_arr_json", ct: "application/json", body: JSON.stringify({ username, key: apiKey, orders: tr }), multi: true },
      { id: "6a_trackingnumber_one_form", ct: "application/x-www-form-urlencoded", body: formOf([["username", username], ["key", apiKey], ["trackingnumber", t0]]), multi: false },
      { id: "6b_trackingnumbers_arr_form", ct: "application/x-www-form-urlencoded", body: formOf([["username", username], ["key", apiKey], ...tr.map((x): [string, string] => ["trackingnumbers[]", x])]), multi: true },
    ];
    const results: any[] = [];
    let singleHit = false;
    for (const a of attempts) {
      if (singleHit && !a.multi) continue;
      let status: number | null = null, ct = "", size = 0, kind = "error", sample = "", err: string | null = null, pdfB64: string | undefined;
      try {
        const r = await proxyFetch(ONWAY_BASE + "api/order/labels", { method: "POST", headers: { "Content-Type": a.ct }, body: a.body });
        status = r.status;
        ct = r.headers.get("content-type") || "";
        const bytes = new Uint8Array(await r.arrayBuffer());
        size = bytes.length;
        kind = classifyBytes(bytes, ct);
        if (kind === "pdf") {
          sample = "%PDF (" + size + " bytes)";
          if (size <= 2_500_000) pdfB64 = toB64(bytes);
        } else {
          sample = maskSecrets(new TextDecoder("utf-8", { fatal: false }).decode(bytes), username, apiKey);
        }
      } catch (e) { err = String(e); }
      const isLabel = status === 200 && size > 100 && (kind === "pdf" || kind.startsWith("image/") || kind === "base64_pdf" || kind === "json_base64_pdf" || kind === "json_pdf_url" || (kind === "html" && /barcode|tracking|onway|1062/i.test(sample)));
      await db.from("onway_api_log").insert({
        created_by: "labels_probe", endpoint: "api/order/labels",
        request_masked: { shape: a.id, content_type: a.ct, trackings: a.multi ? tr : [t0] },
        http_status: status, response_raw: `${kind} (${size}B) ${sample}`.slice(0, 1500), error_message: err,
      });
      results.push({ shape: a.id, http_status: status, content_type: ct, byte_size: size, kind, is_label: isLabel, sample: sample.slice(0, 300), ...(pdfB64 ? { pdf_base64: pdfB64 } : {}), error: err });
      if (isLabel) {
        if (a.multi) break;
        singleHit = true; // Got single label; keep going only for multi-tracking shapes to test order.
      }
    }
    return json({ trackings_sent_order: tr, single_tracking: t0, results });
  }

  if (action === "labels_fetch") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const username = Deno.env.get("ONWAY_API_USERNAME") || "", apiKey = Deno.env.get("ONWAY_API_KEY") || "";
    if (!username || !apiKey) return json({ error: "Onway API credentials missing" }, 500);
    const summary = await fetchAndStoreOnwayLabels(db, { username, key: apiKey });
    return json(summary);
  }

  if (action === "sync_stale") {
    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 100);
    const statusFilter = typeof body?.status === "string" && body.status.trim() ? body.status.trim() : null;
    const olderThanHours = body?.older_than_hours != null ? Math.max(Number(body.older_than_hours) || 0, 0) : 0;
    let trackings: string[] = Array.isArray(body?.trackings)
      ? body.trackings.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, limit)
      : [];
    if (!trackings.length) {
      let q = db.from("courier_shipments")
        .select("tracking_number, source_status_at, status_changed_at")
        .eq("source", "api")
        .eq("is_return", false)
        .in("derived_state", ["IN_PROGRESS", "FAILED_ATTEMPT"])
        .order("last_seen_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (statusFilter) q = q.eq("current_courier_status", statusFilter);
      if (olderThanHours > 0) {
        const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
        q = q.lt("source_status_at", cutoff);
      }
      const { data: rows, error: qErr } = await q;
      if (qErr) return json({ error: qErr.message }, 500);
      trackings = (rows || []).map((r: any) => String(r.tracking_number));
    }
    if (!trackings.length) return json({ ok: true, checked: 0, results: {}, orders_updated: 0, not_found: 0, failed: 0 });

    const cookie = await openOnwaySession();
    const results: Record<string, number> = {};
    let ordersUpdated = 0, notFound = 0, failed = 0;
    const CONCURRENCY = 6;
    for (let i = 0; i < trackings.length; i += CONCURRENCY) {
      const chunk = trackings.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (tn) => {
        try {
          const payload = await fetchOnwayOrderInfo(tn, cookie);
          if (!payload) { notFound++; return; }
          const r = await upsertOnwayShipment(db, payload, "api");
          results[r.result] = (results[r.result] || 0) + 1;
          const parsed = onwayPayloadToShipment(payload, new Map());
          const statusName = String(parsed?.row?.current_courier_status ?? "").trim();
          const statusAt = (parsed?.row?.source_status_at as string | null) ?? null;
          if (statusName) {
            const { data: ord } = await db.from("orders")
              .select("id, onway_last_status, onway_last_status_at")
              .eq("onway_tracking", tn).maybeSingle();
            if (ord) {
              const evMs = statusAt ? Date.parse(statusAt) : NaN;
              const curMs = ord.onway_last_status_at ? Date.parse(ord.onway_last_status_at) : NaN;
              const isNewer = Number.isNaN(evMs) || Number.isNaN(curMs) || evMs >= curMs;
              if (isNewer && (ord.onway_last_status !== statusName || (statusAt && ord.onway_last_status_at !== statusAt))) {
                await db.from("orders")
                  .update({ onway_last_status: statusName, onway_last_status_at: statusAt || new Date().toISOString() })
                  .eq("id", ord.id);
                ordersUpdated++;
              }
            }
          }
        } catch (e) {
          failed++;
          console.error("sync_stale", tn, e instanceof Error ? e.message : e);
        }
      }));
    }
    return json({ ok: true, checked: trackings.length, results, orders_updated: ordersUpdated, not_found: notFound, failed });
  }

  if (action === "silent_check") {
    const { data: last } = await db.from("onway_webhook_log").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle();
    // Open = API-sent in the last 14 days and not yet finalized (includes shipments no webhook ever reached).
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: sent } = await db.from("orders").select("onway_tracking").not("onway_tracking", "is", null).gte("onway_sent_at", since).limit(5000);
    const tr = (sent || []).map((o: any) => String(o.onway_tracking));
    const { data: fin } = tr.length ? await db.from("courier_shipments").select("tracking_number").in("tracking_number", tr).not("final_status_date", "is", null) : { data: [] };
    const count = tr.length - (fin || []).length;
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

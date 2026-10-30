// sms-delivery-sync — refreshes Sender.ge delivery status for recent sent SMS.
// Callers: the 15-minute schedule (anon apikey + internal secret header) or an active admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getDelivery, senderApiKey } from "../_shared/senderGe.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = senderApiKey();
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) return json({ error: "SENDER_GE_API_KEY not configured" }, 500);
    const service = createClient(url, serviceKey);

    const cronSecret = Deno.env.get("SMS_SYNC_CRON_SECRET");
    const fromCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const { data: claims } = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getClaims(auth.slice(7));
      const uid = claims?.claims?.sub;
      if (!uid) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await service.rpc("is_active_admin", { user_id: uid });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: rows, error } = await service.from("sms_logs")
      .select("id,message_id").eq("provider", "sender.ge").eq("status", "sent").eq("delivery_status", "pending")
      .not("message_id", "is", null).gte("created_at", since).order("created_at").limit(200);
    if (error) return json({ error: error.message }, 500);

    let delivered = 0, undelivered = 0, pending = 0, errors = 0;
    const queue = [...(rows || [])];
    await Promise.all(Array.from({ length: 5 }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const r = await getDelivery(apiKey, row.message_id as string);
        if (!r) { errors++; continue; }
        if (r.state === "pending") { pending++; continue; }
        r.state === "delivered" ? delivered++ : undelivered++;
        const at = r.timestamp ? new Date(r.timestamp.replace(" ", "T") + "+04:00") : null;
        await service.from("sms_logs").update({
          delivery_status: r.state,
          delivered_at: r.state === "delivered" ? (at && !isNaN(+at) ? at.toISOString() : new Date().toISOString()) : null,
        }).eq("id", row.id);
      }
    }));
    return json({ checked: rows?.length ?? 0, delivered, undelivered, pending, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

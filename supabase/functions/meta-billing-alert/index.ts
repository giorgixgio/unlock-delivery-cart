// Checks the Meta ad account's unpaid balance and SMSes the owner at every $10 step
// from $250 due up to the billing threshold, so a partial payment can be made in time.
// Runs from pg_cron. Resets after a payment drops the balance below $250.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY = "https://connector-gateway.lovable.dev/meta_ads";
const START_USD = 250;
const STEP_USD = 10;

// Same 9-digit local format the working customer SMS function uses (5XXXXXXXX).
function toMsisdn(p: string): string {
  let d = p.replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("995")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: rows, error } = await db.from("meta_billing_alerts").select("*");
  if (error) return json({ error: error.message }, 500);
  const results: unknown[] = [];

  let isTest = false;
  if (req.method === "POST") { try { isTest = (await req.clone().json())?.test === true; } catch { /* cron body */ } }
  if (isTest) {
    for (const r of rows ?? []) {
      if (!r.phone) continue;
      const params = new URLSearchParams({ key: Deno.env.get("SMSOFFICE_API_KEY")!, destination: toMsisdn(r.phone), sender: "BIGMART", content: "BIGMART: სატესტო შეტყობინება Meta ბილინგის შეხსენებისთვის.", reference: `bill-test-${Date.now()}` });
      const sms = await fetch(`https://smsoffice.ge/api/v2/send/?${params}`);
      results.push({ destination: toMsisdn(r.phone), status: sms.status, body: (await sms.text()).slice(0, 300) });
    }
    return json({ test: true, results });
  }

  for (const r of rows ?? []) {
    const res = await fetch(`${GATEWAY}/v26.0/${r.ad_account_id}?fields=balance,currency`, {
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": Deno.env.get("META_ADS_API_KEY")! },
    });
    const text = await res.text();
    if (!res.ok) {
      await db.from("meta_billing_alerts").update({ last_error: `[${res.status}] ${text.slice(0, 300)}`, last_checked_at: new Date().toISOString() }).eq("ad_account_id", r.ad_account_id);
      results.push({ account: r.ad_account_id, error: res.status });
      continue;
    }
    const due = Number(JSON.parse(text).balance) / 100;
    const threshold = Number(r.threshold_usd);
    const upd: Record<string, unknown> = { last_balance_usd: due, last_checked_at: new Date().toISOString(), last_error: null };

    if (due < START_USD) {
      upd.last_milestone = null; // paid → re-arm
    } else {
      const milestone = Math.floor(due / STEP_USD) * STEP_USD;
      if (milestone > Number(r.last_milestone ?? -1)) {
        const left = Math.max(0, threshold - due).toFixed(2);
        const content = `Meta ads: ვალი $${due.toFixed(2)}. ზღვრამდე ($${threshold}) დარჩა $${left}. გადაიხადე ნაწილი.`;
        if (!r.phone) {
          upd.last_error = "no phone set";
        } else {
          const params = new URLSearchParams({ key: Deno.env.get("SMSOFFICE_API_KEY")!, destination: toMsisdn(r.phone), sender: "BIGMART", content, reference: `bill-${milestone}` });
          const sms = await fetch(`https://smsoffice.ge/api/v2/send/?${params}`);
          const body = await sms.text();
          let ok = sms.ok;
          try { ok = ok && JSON.parse(body).Success !== false; } catch { /* ignore */ }
          if (ok) upd.last_milestone = milestone;
          else upd.last_error = `sms ${sms.status}: ${body.slice(0, 200)}`;
        }
      }
    }
    await db.from("meta_billing_alerts").update(upd).eq("ad_account_id", r.ad_account_id);
    results.push({ account: r.ad_account_id, due, ...upd });
  }
  return json({ results });
});

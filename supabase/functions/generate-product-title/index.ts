import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminClient.rpc("is_active_admin", { user_id: userData.user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const rawTitle = String(body?.raw_title || "").slice(0, 300).trim();
    if (!rawTitle) return json({ error: "raw_title required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const prompt = `გადააკეთე ეს ნედლი ინგლისური პროდუქტის ტექსტი (URL slug-დან ამოღებული) მოკლე, მიმიდველ ქართულ პროდუქტის სათაურად ონლაინ მაღაზიისთვის.

ნედლი ტექსტი: "${rawTitle}"

წესები:
- მხოლოდ ქართულად.
- ეს არის სათაური, არა აღწერა — მოკლე, ენერგიული ფრაზა, დაახლოებით 4-8 სიტყვა.
- ბუნებრივი თარგმნა/ადაპტაცია, არა სიტყვასიტყვით — გაასუფთავე, დაალაგე, მოაშორე ზედმეტი სიტყვები (მაგ. "hot sale", "free shipping", "dropshipping", საიტის სახელები), შეინარჩუნე პროდუქტის ვინაობა და მთავარი მახასიათებლები.
- ემოჯების გარეშე, ბრჭყალების გარეშე, markdown-ის გარეშე.
- დააბრუნე მხოლოდ სათაურის ტექსტი.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: "You are an expert Georgian direct-response e-commerce copywriter." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limit reached, try again shortly" }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI request failed: ${t.slice(0, 200)}` }, 500);
    }

    const data = await aiRes.json();
    const title = String(data?.choices?.[0]?.message?.content || "")
      .replace(/^["'«»]+|["'«»]+$/g, "")
      .trim()
      .slice(0, 200);
    if (!title) return json({ error: "AI returned an empty title" }, 500);

    return json({ title });
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

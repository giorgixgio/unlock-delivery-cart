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
    const title = String(body?.title || "").slice(0, 500).trim();
    const features = String(body?.features || "").slice(0, 1500).trim();
    const existing = String(body?.existing_description || "").slice(0, 3000).trim();
    const sourceUrl = String(body?.source_url || "").slice(0, 500).trim();
    const price = body?.price != null && !isNaN(Number(body.price)) ? Number(body.price) : null;

    if (!title && !features && !existing) {
      return json({ error: "Need at least a title or key features" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const prompt = `დაწერე პროდუქტის აღწერა ქართულ ენაზე ონლაინ მაღაზიისთვის.

პროდუქტი: ${title || "(უცნობი)"}
${price ? `ფასი: ${price}₾` : ""}
${features ? `ძირითადი მახასიათებლები: ${features}` : ""}
${sourceUrl ? `წყარო: ${sourceUrl}` : ""}
${existing ? `არსებული აღწერა (გადააკეთე უკეთესად): ${existing}` : ""}

წესები:
- მხოლოდ ქართულად.
- პირდაპირი გაყიდვის (direct-response) სტილი: მოკლე ჰუკი, სარგებელზე ორიენტირებული ტექსტი, მსუბუქი გადაუდებლობა/მოწოდება მოქმედებისკენ.
- ჩართე რელევანტური ემოჯები ბუნებრივად, არა გადაჭარბებულად.
- სიგრძე შენ გადაწყვიტე პროდუქტის მიხედვით — მოკლე და მკაფიო, უშნო შევსების ტექსტის გარეშე.
- არ გამოიგონო ტექნიკური მახასიათებლები, რომლებიც არ არის მოცემული.
- დააბრუნე მხოლოდ აღწერის ტექსტი, სათაურის, ბრჭყალების ან markdown-ის გარეშე.`;

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
    const description = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!description) return json({ error: "AI returned an empty description" }, 500);

    return json({ description });
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

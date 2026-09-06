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
    const title = String(body?.title || "").slice(0, 400).trim();
    const alibabaTitle = String(body?.alibaba_title || "").slice(0, 400).trim();
    if (!title && !alibabaTitle) return json({ error: "title required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const prompt = `Translate the following product name into Russian for a customs invoice / packing list.

Product name: "${title || alibabaTitle}"
${title && alibabaTitle ? `Supplier listing title: "${alibabaTitle}"` : ""}

Rules:
- Output Russian only.
- Plain, accurate, descriptive product name a customs officer or freight forwarder would recognize (e.g. "Светодиодный настольный светильник").
- NOT marketing copy: no emojis, no adjectives like "лучший", no punctuation flourish, no quotes, no markdown.
- Keep it short: 2-6 words. Include the material/type only if it is clear from the source name.
- Do not invent specifications.
- Return only the Russian product name.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a customs documentation specialist producing plain, literal Russian product descriptions for import paperwork.",
          },
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
    const titleRu = String(data?.choices?.[0]?.message?.content || "")
      .replace(/[\p{Extended_Pictographic}]/gu, "")
      .replace(/^["'«»\s]+|["'«»\s.]+$/g, "")
      .trim()
      .slice(0, 200);
    if (!titleRu) return json({ error: "AI returned an empty translation" }, 500);

    return json({ title_ru: titleRu });
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

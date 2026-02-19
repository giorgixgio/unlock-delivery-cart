import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function temuUrlToTitle(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segment = path.split("/").filter(Boolean).pop() || "";
    // Remove trailing ID part (e.g. -g-601099532043902)
    const cleaned = segment.replace(/-g-\d+$/, "").replace(/^ge-en-/, "");
    // Remove leading numbers/dashes
    const words = cleaned
      .replace(/^[-\d]+/, "")
      .split("-")
      .filter((w) => w && !/^\d+$/.test(w))
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.slice(0, 8).join(" ");
  } catch {
    return "Product";
  }
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { temu_url, hero_image_url } = await req.json();

    const inferredTitle = temuUrlToTitle(temu_url);
    const baseSlug = toSlug(inferredTitle);

    const prompt = `You are a product copywriter for a Georgian e-commerce store. 
Given this product page URL: ${temu_url}
Product title hint: "${inferredTitle}"

Generate marketing content in JSON format. Respond ONLY with valid JSON, no markdown.

{
  "title": "Clean English product title (max 10 words)",
  "short_pitch": "One compelling sentence about the product benefit",
  "benefits": ["benefit 1", "benefit 2", "benefit 3", "benefit 4", "benefit 5"],
  "use_cases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "how_to_use": ["step 1", "step 2", "step 3", "step 4"],
  "faq": [
    {"q": "question 1", "a": "answer 1"},
    {"q": "question 2", "a": "answer 2"},
    {"q": "question 3", "a": "answer 3"}
  ],
  "specs": [
    {"k": "Type", "v": "value"},
    {"k": "Material", "v": "value"},
    {"k": "Use", "v": "value"}
  ]
}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text();
      throw new Error(`AI error: ${err}`);
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices[0].message.content.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    const generated = JSON.parse(jsonStr);

    const slug = baseSlug || toSlug(generated.title || "product");

    return new Response(
      JSON.stringify({
        slug,
        title: generated.title || inferredTitle,
        hero_image_url,
        gallery: [hero_image_url],
        short_pitch: generated.short_pitch || "",
        benefits: generated.benefits || [],
        use_cases: generated.use_cases || [],
        how_to_use: generated.how_to_use || [],
        faq: generated.faq || [],
        specs: generated.specs || [],
        temu_url,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

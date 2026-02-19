import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STORE_URL = "https://bigmart-9917.myshopify.com";

const TAG_CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["სამზარეულო"], category: "სამზარეულო" },
  { keywords: ["მანქანა", "ავტო"], category: "ავტომობილი" },
  { keywords: ["სილამაზე", "თავის მოვლა", "კანი"], category: "თავის-მოვლა-სილამაზე" },
  { keywords: ["სპორტი", "ფიტნესი"], category: "სპორტი-აქტიური-ცხოვრება" },
  { keywords: ["ბავშვ"], category: "ბავშვები" },
  { keywords: ["ბაღი", "ეზო"], category: "ბაღი-ეზო" },
  { keywords: ["აბაზანა", "სანტექნიკა"], category: "აბაზანა-სანტექნიკა" },
  { keywords: ["განათება", "ნათურა", "ლამპა"], category: "განათება" },
  { keywords: ["ელექტრონიკა", "გაჯეტ"], category: "ელექტრონიკა-გაჯეტები" },
  { keywords: ["ხელსაწყო"], category: "ხელსაწყოები" },
  { keywords: ["აქსესუარ"], category: "აქსესუარები" },
  { keywords: ["სახლი", "ინტერიერი"], category: "სახლი-ინტერიერი" },
];

function categorizeByTags(tags: string[], title: string): string {
  const searchText = [...tags, title].join(" ").toLowerCase();
  for (const rule of TAG_CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) return rule.category;
    }
  }
  return "uncategorized";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all products from Shopify
    const allProducts: any[] = [];
    let page = 1;

    while (true) {
      const res = await fetch(
        `${STORE_URL}/collections/all/products.json?limit=250&page=${page}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (!data.products || data.products.length === 0) break;
      allProducts.push(...data.products);
      if (data.products.length < 250) break;
      page++;
    }

    // Map and upsert
    let upserted = 0;
    const batchSize = 50;

    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize).map((p: any) => {
        const variant = p.variants?.[0] || {};
        const tags = p.tags || [];
        return {
          id: String(p.id),
          title: p.title || "",
          handle: p.handle || "",
          description: p.body_html || "",
          vendor: p.vendor || "",
          sku: variant.sku || "",
          price: parseFloat(variant.price || "0"),
          compare_at_price: variant.compare_at_price
            ? parseFloat(variant.compare_at_price)
            : null,
          image: p.images?.[0]?.src || "/placeholder.svg",
          images: (p.images || []).map((img: any) => img.src),
          category: categorizeByTags(tags, p.title || ""),
          tags,
          available: variant.available ?? true,
          synced_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from("products")
        .upsert(batch, { onConflict: "id" });

      if (error) {
        console.error("Upsert batch error:", error);
      } else {
        upserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allProducts.length,
        upserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("sync-products error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

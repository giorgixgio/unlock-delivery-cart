import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ExternalLink, Loader2, AlertCircle, Sparkles } from "lucide-react";

interface InputProduct {
  temu_url: string;
  hero_image_url: string;
}

interface ImportedProduct {
  slug: string;
  title: string;
  hero_image_url: string;
  gallery: string[];
  short_pitch: string;
  benefits: string[];
  use_cases: string[];
  how_to_use: string[];
  faq: { q: string; a: string }[];
  specs: { k: string; v: string }[];
  temu_url: string;
}

interface ResultRow {
  slug: string;
  title: string;
  status: "success" | "error" | "skipped";
  message?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function generateContent(item: InputProduct): Promise<ImportedProduct> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-product-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(item),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(err);
  }
  return resp.json();
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const { data } = await supabase
      .from("products")
      .select("handle")
      .eq("handle", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
}

async function insertProduct(p: ImportedProduct): Promise<{ slug: string; existed: boolean }> {
  const uniqueSlug = await ensureUniqueSlug(p.slug);
  const existed = uniqueSlug !== p.slug;

  // Insert into products table
  const { error: pErr } = await supabase.from("products").insert({
    id: `temu-${uniqueSlug}`,
    handle: uniqueSlug,
    title: p.title,
    image: p.hero_image_url,
    images: p.gallery,
    description: p.short_pitch,
    price: 29.90,
    category: "imported",
    tags: ["temu", "imported"],
    sku: `TEMU-${uniqueSlug.toUpperCase().slice(0, 12)}`,
    available: true,
    vendor: "TETRI",
  });
  if (pErr) throw new Error(pErr.message);

  // Build landing config
  const landingConfig = {
    hero_title: p.title,
    hero_subtitle: p.short_pitch,
    sections: [
      { type: "benefits", items: p.benefits },
      { type: "faq", items: p.faq },
    ],
    bundle: {
      enabled: true,
      default_qty: 1,
      bundle_options: [
        { qty: 1, label: `${p.title} × 1`, discount_pct: 0 },
        { qty: 2, label: `${p.title} × 2 — 15% OFF`, discount_pct: 15 },
      ],
    },
    use_cases: p.use_cases,
    how_to_use: p.how_to_use,
    specs: p.specs,
    gallery: p.gallery,
    temu_url: p.temu_url,
  };

  const { error: lcErr } = await supabase.from("product_landing_config").insert({
    product_handle: uniqueSlug,
    landing_variant: "tailored",
    landing_use_cod_modal: true,
    landing_bypass_min_cart: true,
    landing_config: landingConfig,
  });
  if (lcErr) throw new Error(lcErr.message);

  return { slug: uniqueSlug, existed };
}

const AdminProductsImport = () => {
  const [json, setJson] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleImport = async () => {
    let items: InputProduct[];
    try {
      items = JSON.parse(json);
      if (!Array.isArray(items)) throw new Error("Must be an array");
    } catch (e) {
      alert("Invalid JSON: " + String(e));
      return;
    }

    setRunning(true);
    setResults([]);
    setProgress({ current: 0, total: items.length });

    const newResults: ResultRow[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setProgress({ current: i + 1, total: items.length });
      try {
        const generated = await generateContent(item);
        const { slug, existed } = await insertProduct(generated);
        newResults.push({
          slug,
          title: generated.title,
          status: "success",
          message: existed ? "Slug already existed, used unique variant" : undefined,
        });
      } catch (err) {
        newResults.push({
          slug: "",
          title: item.temu_url.slice(0, 60) + "...",
          status: "error",
          message: String(err),
        });
      }
      setResults([...newResults]);
    }

    setRunning(false);
    setProgress(null);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">AI Product Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a JSON array of <code className="bg-muted px-1 rounded text-xs">{"[{temu_url, hero_image_url}]"}</code> objects.
          AI will generate full landing page content automatically.
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={`[\n  {\n    "temu_url": "https://www.temu.com/...",\n    "hero_image_url": "https://img.kwcdn.com/..."\n  }\n]`}
          className="font-mono text-xs min-h-[200px]"
          disabled={running}
        />
        <Button
          onClick={handleImport}
          disabled={running || !json.trim()}
          className="w-full h-12 text-base font-bold"
          size="lg"
        >
          {running ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Generating... ({progress?.current}/{progress?.total})
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate &amp; Import
            </>
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-foreground">Results</h2>
            {successCount > 0 && (
              <Badge className="bg-success/20 text-success border-success/30">
                {successCount} created
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} failed</Badge>
            )}
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  r.status === "success"
                    ? "bg-success/5 border-success/20"
                    : "bg-destructive/5 border-destructive/20"
                }`}
              >
                {r.status === "success" ? (
                  <Check className="w-4 h-4 text-success flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                  {r.status === "success" && (
                    <p className="text-xs text-muted-foreground font-mono">/p/{r.slug}</p>
                  )}
                  {r.message && (
                    <p className={`text-xs mt-0.5 ${r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.message}
                    </p>
                  )}
                </div>

                {r.status === "success" && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Copy link"
                      onClick={() => copyLink(r.slug)}
                    >
                      {copiedSlug === r.slug
                        ? <Check className="w-3.5 h-3.5 text-success" />
                        : <Copy className="w-3.5 h-3.5" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      asChild
                    >
                      <a href={`/p/${r.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {successCount > 0 && (
            <div className="p-3 bg-muted rounded-xl">
              <p className="text-xs font-semibold text-foreground mb-2">All ad links:</p>
              <div className="space-y-1">
                {results.filter((r) => r.status === "success").map((r) => (
                  <p key={r.slug} className="text-xs font-mono text-muted-foreground break-all">
                    {window.location.origin}/p/{r.slug}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminProductsImport;

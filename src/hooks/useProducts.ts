import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore, useMemo } from "react";
import { Product } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { getStockOverrides, subscribeOverrides } from "@/lib/stockOverrideStore";

const CACHE_KEY = "bigmart-products-v4";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Priority-ordered tag-to-category mapping
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
      if (searchText.includes(kw.toLowerCase())) {
        return rule.category;
      }
    }
  }
  return "uncategorized";
}

// Shopify CDN supports _WIDTHx on filename for resized images
export function shopifyThumb(src: string, size = 400): string {
  if (!src || src === "/placeholder.svg") return "/placeholder.svg";
  // Skip transform if URL already has a Shopify size suffix (e.g. _400x, _800x)
  if (/_\d+x(\.|$|\?)/.test(src)) return src;
  return src.replace(/\.([a-z]+)(\?|$)/, `_${size}x.$1$2`);
}

interface DbProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  image: string;
  images: any;
  category: string;
  tags: string[];
  available: boolean;
}

function mapDbProduct(p: DbProduct): Product {
  const category = p.category && p.category !== "uncategorized"
    ? p.category
    : categorizeByTags(p.tags || [], p.title);
  return {
    id: p.id,
    title: p.title,
    price: Number(p.price) || 0,
    compareAtPrice: p.compare_at_price ? Number(p.compare_at_price) : null,
    image: shopifyThumb(p.image || "/placeholder.svg", 400),
    images: Array.isArray(p.images) ? p.images : [],
    category,
    tags: p.tags || [],
    sku: p.sku || "",
    available: p.available ?? true,
    description: p.description || "",
    vendor: p.vendor || "",
    handle: p.handle || "",
  };
}

function getFromLocalCache(): Product[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveToLocalCache(products: Product[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: products, timestamp: Date.now() }));
  } catch {
    // quota exceeded — ignore
  }
}

async function fetchAllProducts(): Promise<Product[]> {
  const cached = getFromLocalCache();
  if (cached) return cached;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("title");

  if (error) {
    console.error("Failed to fetch products from database:", error);
    return [];
  }

  const products = (data as DbProduct[]).map(mapDbProduct);

  // Deduplicate by id
  const seen = new Set<string>();
  const unique: Product[] = [];
  for (const p of products) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      unique.push(p);
    }
  }

  saveToLocalCache(unique);
  return unique;
}

/**
 * Returns products with stock overrides applied reactively.
 * When an admin toggles stock, ALL mounted components update instantly.
 */
export function useProducts() {
  const { data: rawProducts, isLoading, error } = useQuery({
    queryKey: ["bigmart-products"],
    queryFn: fetchAllProducts,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Subscribe to the override store — triggers re-render on every toggle
  const overrides = useSyncExternalStore(subscribeOverrides, getStockOverrides);

  // Apply overrides on top of DB data
  const data = useMemo(() => {
    if (!rawProducts) return undefined;
    if (Object.keys(overrides).length === 0) return rawProducts;
    return rawProducts.map(p =>
      overrides[p.id] !== undefined ? { ...p, available: overrides[p.id] } : p
    );
  }, [rawProducts, overrides]);

  return { data, isLoading, error };
}

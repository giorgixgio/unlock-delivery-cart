import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore, useMemo } from "react";
import { Product } from "@/lib/constants";
import { getStockOverrides, subscribeOverrides, applyOverrides } from "@/lib/stockOverrideStore";

const STORE_URL = "https://bigmart.ge";
const CACHE_KEY = "bigmart-products-v2";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface ShopifyVariant {
  id: number;
  price: string;
  compare_at_price: string | null;
  sku: string;
  available: boolean;
}

interface ShopifyImage {
  src: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

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
  return src.replace(/\.([a-z]+)(\?|$)/, `_${size}x.$1$2`);
}

function mapShopifyProduct(p: ShopifyProduct): Product {
  const variant = p.variants[0];
  const originalImage = p.images[0]?.src || "/placeholder.svg";
  const category = categorizeByTags(p.tags || [], p.title);
  return {
    id: String(p.id),
    title: p.title,
    price: parseFloat(variant?.price || "0"),
    compareAtPrice: variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null,
    image: shopifyThumb(originalImage, 400),
    images: p.images.map((img) => img.src),
    category,
    tags: p.tags || [],
    sku: variant?.sku || "",
    available: variant?.available ?? true,
    description: p.body_html || "",
    vendor: p.vendor || "",
    handle: p.handle,
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

  const allRaw: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${STORE_URL}/collections/all/products.json?limit=250&page=${page}`
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!data.products || data.products.length === 0) break;
    allRaw.push(...data.products);
    if (data.products.length < 250) break;
    page++;
  }

  const seen = new Set<string>();
  const products: Product[] = [];

  for (const raw of allRaw) {
    const id = String(raw.id);
    if (!seen.has(id)) {
      seen.add(id);
      products.push(mapShopifyProduct(raw));
    }
  }

  saveToLocalCache(products);
  return products;
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

  // Apply overrides on top of raw Shopify data
  const data = useMemo(() => {
    if (!rawProducts) return undefined;
    if (Object.keys(overrides).length === 0) return rawProducts;
    return rawProducts.map(p =>
      overrides[p.id] !== undefined ? { ...p, available: overrides[p.id] } : p
    );
  }, [rawProducts, overrides]);

  return { data, isLoading, error };
}

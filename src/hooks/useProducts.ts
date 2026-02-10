import { useQuery } from "@tanstack/react-query";
import { Product } from "@/lib/constants";

const STORE_URL = "https://bigmart.ge";
const CACHE_KEY = "bigmart-products-cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const COLLECTION_HANDLES = [
  "აბაზანა-სანტექნიკა",
  "ავტომობილი",
  "აქსესუარები",
  "ბავშვები",
  "ბაღი-ეზო",
  "განათება",
  "ელექტრონიკა-გაჯეტები",
  "თავის-მოვლა-სილამაზე",
  "სამზარეულო",
  "სახლი-ინტერიერი",
  "სპორტი-აქტიური-ცხოვრება",
  "ხელსაწყოები",
] as const;

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
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

// Shopify CDN supports _WIDTHx on filename for resized images
export function shopifyThumb(src: string, size = 400): string {
  if (!src || src === "/placeholder.svg") return "/placeholder.svg";
  return src.replace(/\.([a-z]+)(\?|$)/, `_${size}x.$1$2`);
}

function mapShopifyProduct(p: ShopifyProduct, category: string): Product {
  const variant = p.variants[0];
  const originalImage = p.images[0]?.src || "/placeholder.svg";
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

async function fetchCollectionProducts(handle: string): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${STORE_URL}/collections/${handle}/products.json?limit=250&page=${page}`
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!data.products || data.products.length === 0) break;
    products.push(...data.products.map((p: ShopifyProduct) => mapShopifyProduct(p, handle)));
    if (data.products.length < 250) break;
    page++;
  }

  return products;
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
  // Check localStorage cache first
  const cached = getFromLocalCache();
  if (cached) return cached;

  const results = await Promise.all(
    COLLECTION_HANDLES.map((handle) => fetchCollectionProducts(handle))
  );

  const seen = new Set<string>();
  const allProducts: Product[] = [];

  for (const collectionProducts of results) {
    for (const product of collectionProducts) {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        allProducts.push(product);
      }
    }
  }

  saveToLocalCache(allProducts);
  return allProducts;
}

export function useProducts() {
  return useQuery({
    queryKey: ["bigmart-products"],
    queryFn: fetchAllProducts,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

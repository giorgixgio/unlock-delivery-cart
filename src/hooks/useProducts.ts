import { useQuery } from "@tanstack/react-query";
import { Product } from "@/lib/constants";

const STORE_URL = "https://bigmart.ge";

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

function mapShopifyProduct(p: ShopifyProduct, category: string): Product {
  const variant = p.variants[0];
  return {
    id: String(p.id),
    title: p.title,
    price: parseFloat(variant?.price || "0"),
    compareAtPrice: variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null,
    image: p.images[0]?.src || "/placeholder.svg",
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

async function fetchAllProducts(): Promise<Product[]> {
  const results = await Promise.all(
    COLLECTION_HANDLES.map((handle) => fetchCollectionProducts(handle))
  );

  // Deduplicate by product ID, keeping first occurrence (primary collection)
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

  return allProducts;
}

export function useProducts() {
  return useQuery({
    queryKey: ["bigmart-products"],
    queryFn: fetchAllProducts,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes cache
  });
}

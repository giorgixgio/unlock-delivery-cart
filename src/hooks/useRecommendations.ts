import { useMemo, useRef } from "react";
import { Product } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";

// ── Similarity-first scoring for inline recommendation blocks ──

const STOPWORDS = new Set([
  "და", "ან", "არის", "ეს", "იყო", "რომ", "რა", "მე", "შენ",
  "the", "and", "for", "with", "this", "that", "from", "your",
  "pcs", "pack", "piece", "pieces", "size", "color", "style",
]);

function getKeywords(title: string): Set<string> {
  const words = new Set<string>();
  const raw = title.toLowerCase().replace(/[.,;:!?'"()[\]{}#@&%$^*+=<>~`|\\\/]/g, " ").split(/\s+/);
  for (const w of raw) {
    if (w.length > 2 && !STOPWORDS.has(w)) words.add(w);
  }
  return words;
}

function scoreSimilarity(
  product: Product,
  cartProductIds: Set<string>,
  cartTags: Set<string>,
  cartCategories: Set<string>,
  cartKeywords: Set<string>
): number {
  if (cartProductIds.has(product.id)) return -1;
  if (!product.available) return -1;
  if (product.price <= 0) return -1;

  let score = 0;

  // Tag overlap — primary signal
  if (product.tags) {
    for (const tag of product.tags) {
      if (cartTags.has(tag.toLowerCase())) score += 10;
    }
  }

  // Category match
  if (cartCategories.has(product.category)) score += 8;

  // Title keyword overlap
  const pWords = getKeywords(product.title);
  for (const w of pWords) {
    if (cartKeywords.has(w)) score += 4;
  }

  return score;
}

const BLOCK_SIZE = 12;
const MAX_PER_CATEGORY = 4;

function applyDiversityCap(items: { product: Product; score: number }[], max: number, limit: number) {
  const result: { product: Product; score: number }[] = [];
  const catCount: Record<string, number> = {};
  for (const item of items) {
    const cat = item.product.category || "__none__";
    const count = catCount[cat] || 0;
    if (count < max) {
      result.push(item);
      catCount[cat] = count + 1;
      if (result.length >= limit) break;
    }
  }
  if (result.length < limit) {
    const picked = new Set(result.map((r) => r.product.id));
    for (const item of items) {
      if (!picked.has(item.product.id)) {
        result.push(item);
        if (result.length >= limit) break;
      }
    }
  }
  return result;
}

function cartKey(items: { product: { id: string }; quantity: number }[]): string {
  return items.map((i) => `${i.product.id}:${i.quantity}`).sort().join(",");
}

export function useRecommendations(products: Product[]) {
  const { items, total, remaining, isUnlocked, itemCount } = useCart();

  const cacheRef = useRef<{ key: string; result: Product[]; ts: number }>({ key: "", result: [], ts: 0 });

  const shouldShow = !isUnlocked && itemCount > 0;

  const recommendations = useMemo(() => {
    if (!shouldShow || products.length === 0) return [];

    const currentKey = cartKey(items);
    const now = Date.now();

    if (cacheRef.current.key === currentKey && cacheRef.current.result.length > 0 && now - cacheRef.current.ts < 60000) {
      return cacheRef.current.result;
    }

    const cartProductIds = new Set(items.map((i) => i.product.id));
    const cartTags = new Set(items.flatMap((i) => (i.product.tags || []).map((t) => t.toLowerCase())));
    const cartCategories = new Set(items.map((i) => i.product.category));
    const cartKeywords = new Set<string>();
    for (const item of items) {
      for (const w of getKeywords(item.product.title)) cartKeywords.add(w);
    }

    const scored = products
      .map((p) => ({ product: p, score: scoreSimilarity(p, cartProductIds, cartTags, cartCategories, cartKeywords) }))
      .filter((s) => s.score > 0)
      // Similarity first, then higher price within same similarity
      .sort((a, b) => b.score - a.score || b.product.price - a.product.price);

    const diverse = applyDiversityCap(scored, MAX_PER_CATEGORY, BLOCK_SIZE);
    let result = diverse.map((s) => s.product);

    // Fallback: if too few similar, add highest-priced available products
    if (result.length < 6 && products.length > 0) {
      const relaxed = products
        .filter((p) => !cartProductIds.has(p.id) && p.available && p.price > 0)
        .sort((a, b) => b.price - a.price)
        .slice(0, BLOCK_SIZE);
      const existingIds = new Set(result.map((r) => r.id));
      for (const p of relaxed) {
        if (!existingIds.has(p.id)) {
          result.push(p);
          if (result.length >= BLOCK_SIZE) break;
        }
      }
    }

    cacheRef.current = { key: currentKey, result, ts: now };
    return result;
  }, [shouldShow, products, remaining, items]);

  const prevKey = useRef(cartKey(items));
  const currentKey = cartKey(items);
  if (prevKey.current !== currentKey) {
    cacheRef.current = { key: "", result: [], ts: 0 };
    prevKey.current = currentKey;
  }

  return { recommendations, shouldShow, remaining };
}

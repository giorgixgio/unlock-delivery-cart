import { useMemo, useRef } from "react";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCart } from "@/contexts/CartContext";

// Bucket remaining into groups for caching
function getBucket(remaining: number): string {
  if (remaining <= 0) return "0";
  if (remaining <= 5) return "0-5";
  if (remaining <= 10) return "5-10";
  if (remaining <= 20) return "10-20";
  return "20+";
}

// Score a product for recommendation
function scoreProduct(
  product: Product,
  remaining: number,
  cartProductIds: Set<string>,
  recentlyShownIds: Set<string>,
  cartTags: Set<string>
): number {
  // Skip items already in cart
  if (cartProductIds.has(product.id)) return -1;
  // Skip unavailable
  if (!product.available) return -1;
  // Skip items priced above remaining (not helpful)
  if (product.price > remaining * 1.5) return -1;
  // Skip free items
  if (product.price <= 0) return -1;

  let score = 0;

  // Prefer items that help reach threshold efficiently
  // Best: price close to remaining (fills gap in one tap)
  const ratio = product.price / remaining;
  if (ratio >= 0.8 && ratio <= 1.2) {
    score += 50; // Perfect fit
  } else if (ratio >= 0.4 && ratio < 0.8) {
    score += 30; // Good partial fill
  } else if (ratio < 0.4) {
    score += 15; // Small booster
  } else {
    score += 5; // Over remaining but still ok
  }

  // Tag complementarity — prefer items with tags matching cart items
  if (product.tags) {
    for (const tag of product.tags) {
      if (cartTags.has(tag)) {
        score += 8;
        break;
      }
    }
  }

  // Cheap boosters get a bonus (easy add)
  if (product.price <= 5) score += 10;

  // Penalize recently shown
  if (recentlyShownIds.has(product.id)) score -= 25;

  return score;
}

const BLOCK_SIZE = 12;
const MAX_PER_CATEGORY = 4;
const RECENT_PENALTY_BLOCKS = 3;

// Enforce diversity: max N items from same category
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
  // If not enough after diversity cap, fill from remaining
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

// Generate a stable cart key for deduplication
function cartKey(items: { product: { id: string }; quantity: number }[]): string {
  return items
    .map((i) => `${i.product.id}:${i.quantity}`)
    .sort()
    .join(",");
}

export function useRecommendations(products: Product[]) {
  const { items, total, remaining, isUnlocked, itemCount } = useCart();

  // Track recently shown IDs across blocks
  const recentlyShownRef = useRef<string[][]>([]);
  const cacheRef = useRef<{ key: string; result: Product[]; ts: number }>({ key: "", result: [], ts: 0 });

  // Flag: should show recommendations?
  const shouldShow = !isUnlocked && itemCount > 0;

  const recommendations = useMemo(() => {
    if (!shouldShow || products.length === 0) return [];

    const currentKey = cartKey(items);
    const now = Date.now();

    // Use cache if same key and within 60s
    if (
      cacheRef.current.key === currentKey &&
      cacheRef.current.result.length > 0 &&
      now - cacheRef.current.ts < 60000
    ) {
      return cacheRef.current.result;
    }

    const cartProductIds = new Set(items.map((i) => i.product.id));
    const cartTags = new Set(items.flatMap((i) => i.product.tags || []));

    // Build recently shown set from last N blocks
    const recentlyShownIds = new Set(
      recentlyShownRef.current.slice(-RECENT_PENALTY_BLOCKS).flat()
    );

    const scored = products
      .map((p) => ({
        product: p,
        score: scoreProduct(p, remaining, cartProductIds, recentlyShownIds, cartTags),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Apply diversity cap then take BLOCK_SIZE
    const diverse = applyDiversityCap(scored, MAX_PER_CATEGORY, BLOCK_SIZE);
    let result = diverse.map((s) => s.product);

    // Fallback: if too few, relax recently-shown penalty
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

    // Track shown
    if (result.length > 0) {
      recentlyShownRef.current.push(result.map((p) => p.id));
      if (recentlyShownRef.current.length > RECENT_PENALTY_BLOCKS * 2) {
        recentlyShownRef.current = recentlyShownRef.current.slice(-RECENT_PENALTY_BLOCKS);
      }
    }

    cacheRef.current = { key: currentKey, result, ts: now };
    return result;
  }, [shouldShow, products, remaining, items]);

  // Invalidate cache when cart changes
  const prevKey = useRef(cartKey(items));
  const currentKey = cartKey(items);
  if (prevKey.current !== currentKey) {
    cacheRef.current = { key: "", result: [], ts: 0 };
    prevKey.current = currentKey;
  }

  return { recommendations, shouldShow, remaining };
}

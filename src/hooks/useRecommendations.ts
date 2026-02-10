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

const BLOCK_SIZE = 6;
const RECENT_PENALTY_BLOCKS = 3;

export function useRecommendations(products: Product[]) {
  const { items, total, remaining, isUnlocked, itemCount } = useCart();

  // Track recently shown IDs across blocks
  const recentlyShownRef = useRef<string[][]>([]);
  const cacheRef = useRef<{ bucket: string; result: Product[] }>({ bucket: "", result: [] });

  // Flag: should show recommendations?
  const shouldShow = !isUnlocked && itemCount > 0;

  const recommendations = useMemo(() => {
    if (!shouldShow || products.length === 0) return [];

    const bucket = getBucket(remaining);

    // Use cache if same bucket
    if (cacheRef.current.bucket === bucket && cacheRef.current.result.length > 0) {
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
      .sort((a, b) => b.score - a.score)
      .slice(0, BLOCK_SIZE)
      .map((s) => s.product);

    // Track shown
    if (scored.length > 0) {
      recentlyShownRef.current.push(scored.map((p) => p.id));
      // Keep only last N*2 blocks in memory
      if (recentlyShownRef.current.length > RECENT_PENALTY_BLOCKS * 2) {
        recentlyShownRef.current = recentlyShownRef.current.slice(-RECENT_PENALTY_BLOCKS);
      }
    }

    cacheRef.current = { bucket, result: scored };
    return scored;
  }, [shouldShow, products, remaining, items]);

  // Invalidate cache when cart changes
  const prevItemCount = useRef(itemCount);
  if (prevItemCount.current !== itemCount) {
    cacheRef.current = { bucket: "", result: [] };
    prevItemCount.current = itemCount;
  }

  return { recommendations, shouldShow, remaining };
}

import { Product } from "@/lib/constants";

/**
 * Heuristic ranking engine.
 * Uses Shopify product data only. Designed to be swapped for DB-backed scoring later.
 *
 * ranking_engine(heroProduct, allProducts, userSessionData?) → ordered Product[]
 */

// Deterministic shuffle seeded by string
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    h = ((h << 5) - h + i) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tagOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
}

/** Get related products: same category or overlapping tags */
export function getRelated(hero: Product, all: Product[], limit = 8): Product[] {
  const candidates = all
    .filter((p) => p.id !== hero.id && p.available !== false)
    .map((p) => {
      let score = 0;
      if (p.category === hero.category) score += 10;
      if (p.vendor === hero.vendor) score += 3;
      score += tagOverlap(p.tags, hero.tags) * 2;
      return { product: p, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map((c) => c.product);
}

/** Trending heuristic: bestseller/hot tags → newest-ish → random */
export function getTrending(all: Product[], exclude: Set<string>, limit = 16): Product[] {
  const available = all.filter((p) => !exclude.has(p.id) && p.available !== false);

  // Tier 1: products with "bestseller" or "hot" tags
  const tagged = available.filter((p) =>
    p.tags.some((t) => {
      const lower = t.toLowerCase();
      return lower.includes("bestseller") || lower.includes("hot") || lower.includes("popular");
    })
  );

  // Tier 2: rest shuffled deterministically
  const rest = available.filter((p) => !tagged.some((t) => t.id === p.id));
  const shuffled = seededShuffle(rest, "trending-" + new Date().toDateString());

  const combined = [...tagged, ...shuffled];
  return combined.slice(0, limit);
}

/** Weighted random: 40% same category, 30% trending-heuristic, 30% random */
export function getWeightedRandom(
  hero: Product | null,
  all: Product[],
  exclude: Set<string>,
  batchSize = 12
): Product[] {
  const available = all.filter((p) => !exclude.has(p.id) && p.available !== false);
  if (available.length === 0) return [];

  const sameCategory = hero
    ? available.filter((p) => p.category === hero.category)
    : available;
  const otherCategory = available.filter((p) => !hero || p.category !== hero.category);

  const catCount = Math.ceil(batchSize * 0.4);
  const trendCount = Math.ceil(batchSize * 0.3);
  const randCount = batchSize - catCount - trendCount;

  const seed = "wr-" + Date.now().toString(36);

  const catPick = seededShuffle(sameCategory, seed + "c").slice(0, catCount);
  const catIds = new Set(catPick.map((p) => p.id));

  const trendPool = available.filter((p) => !catIds.has(p.id));
  const trendPick = seededShuffle(trendPool, seed + "t").slice(0, trendCount);
  const trendIds = new Set(trendPick.map((p) => p.id));

  const randPool = otherCategory.filter((p) => !catIds.has(p.id) && !trendIds.has(p.id));
  const randPick = seededShuffle(randPool, seed + "r").slice(0, randCount);

  return [...catPick, ...trendPick, ...randPick];
}

/**
 * Main ranking function.
 * Returns a flat ordered array: [hero, ...related, ...trending, ...weighted]
 */
export function rankingEngine(
  heroProduct: Product | null,
  allProducts: Product[],
  _userSessionData?: unknown
): { sections: { type: string; products: Product[] }[]; flat: Product[] } {
  const seen = new Set<string>();
  const sections: { type: string; products: Product[] }[] = [];

  // Hero
  if (heroProduct) {
    sections.push({ type: "hero", products: [heroProduct] });
    seen.add(heroProduct.id);
  }

  // Related (only if hero exists)
  if (heroProduct) {
    const related = getRelated(heroProduct, allProducts, 8);
    related.forEach((p) => seen.add(p.id));
    sections.push({ type: "related", products: related });
  }

  // Trending
  const trending = getTrending(allProducts, seen, 16);
  trending.forEach((p) => seen.add(p.id));
  sections.push({ type: "trending", products: trending });

  // Weighted random (first batch)
  const weighted = getWeightedRandom(heroProduct, allProducts, seen, 12);
  weighted.forEach((p) => seen.add(p.id));
  sections.push({ type: "weighted", products: weighted });

  const flat = sections.flatMap((s) => s.products);
  return { sections, flat };
}

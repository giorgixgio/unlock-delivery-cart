import { Product } from "@/lib/constants";

// ── Georgian + English stopwords ──
const STOPWORDS = new Set([
  "და", "ან", "არის", "ეს", "იყო", "რომ", "რა", "ვის", "მას", "ის",
  "ამ", "მე", "შენ", "ჩვენ", "თქვენ", "ისინი", "ყველა", "ერთი", "ორი",
  "სამი", "კარგი", "ახალი", "დიდი", "პატარა", "თვის", "ზე", "თან",
  "the", "and", "for", "with", "this", "that", "from", "your", "are",
  "was", "were", "been", "have", "has", "had", "but", "not", "you",
  "all", "can", "her", "his", "one", "our", "out", "new", "set",
  "use", "how", "its", "may", "who", "get", "also",
  "pcs", "pack", "piece", "pieces", "size", "color", "style",
]);

// ── Normalization cache ──
const normalizedTagsCache = new Map<string, Set<string>>();
const normalizedKeywordsCache = new Map<string, Set<string>>();

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim()
    .replace(/[.,;:!?'"()[\]{}#@&%$^*+=<>~`|\\\/\-_]/g, "")
    .replace(/\s+/g, " ");
}

function getNormalizedTags(p: Product): Set<string> {
  let cached = normalizedTagsCache.get(p.id);
  if (cached) return cached;
  const tags = new Set<string>();
  if (p.tags) {
    for (const t of p.tags) {
      const n = normalizeTag(t);
      if (n.length > 1) tags.add(n);
    }
  }
  normalizedTagsCache.set(p.id, tags);
  return tags;
}

function getKeywords(p: Product): Set<string> {
  let cached = normalizedKeywordsCache.get(p.id);
  if (cached) return cached;
  const words = new Set<string>();
  const raw = p.title.toLowerCase()
    .replace(/[.,;:!?'"()[\]{}#@&%$^*+=<>~`|\\\/]/g, " ")
    .split(/\s+/);
  for (const w of raw) {
    if (w.length > 2 && !STOPWORDS.has(w)) words.add(w);
  }
  normalizedKeywordsCache.set(p.id, words);
  return words;
}

// ── Similarity scoring (NO price-gap logic) ──
function similarityScore(
  candidate: Product,
  contextTags: Set<string>,
  contextKeywords: Set<string>,
  contextCategories: Set<string>,
  contextVendors: Set<string>,
): number {
  let score = 0;

  // 1) Tag overlap — highest weight (10 per match)
  const cTags = getNormalizedTags(candidate);
  for (const t of cTags) {
    if (contextTags.has(t)) score += 10;
  }

  // 2) Title keyword overlap — medium weight (4 per match)
  const cWords = getKeywords(candidate);
  for (const w of cWords) {
    if (contextKeywords.has(w)) score += 4;
  }

  // 3) Category match — bonus 8
  if (contextCategories.has(candidate.category)) score += 8;

  // 4) Vendor match — bonus 3
  if (candidate.vendor && contextVendors.has(candidate.vendor)) score += 3;

  // 5) Discount signal — bonus if ≥30% off
  if (candidate.compareAtPrice && candidate.compareAtPrice > 0) {
    const discount = (candidate.compareAtPrice - candidate.price) / candidate.compareAtPrice;
    if (discount >= 0.3) score += 2;
  }

  return score;
}

// ── Context builder ──
function buildContext(cartItems: { product: Product }[], currentProduct?: Product | null) {
  const contextTags = new Set<string>();
  const contextKeywords = new Set<string>();
  const contextCategories = new Set<string>();
  const contextVendors = new Set<string>();

  const sources = cartItems.map((i) => i.product);
  if (currentProduct) sources.push(currentProduct);

  for (const p of sources) {
    for (const t of getNormalizedTags(p)) contextTags.add(t);
    for (const w of getKeywords(p)) contextKeywords.add(w);
    if (p.category) contextCategories.add(p.category);
    if (p.vendor) contextVendors.add(p.vendor);
  }

  return { contextTags, contextKeywords, contextCategories, contextVendors };
}

// ── Diversity enforcement ──
function applyDiversity(
  scored: { product: Product; score: number }[],
  maxPerCategory: number,
  limit: number
): Product[] {
  const result: Product[] = [];
  const catCount: Record<string, number> = {};

  for (const { product } of scored) {
    const cat = product.category || "__none__";
    if ((catCount[cat] || 0) < maxPerCategory) {
      result.push(product);
      catCount[cat] = (catCount[cat] || 0) + 1;
      if (result.length >= limit) return result;
    }
  }

  // Fill remaining from skipped items
  if (result.length < limit) {
    const picked = new Set(result.map((r) => r.id));
    for (const { product } of scored) {
      if (!picked.has(product.id)) {
        result.push(product);
        if (result.length >= limit) break;
      }
    }
  }

  return result;
}

// ══════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════

export interface RecommendationResult {
  /** Most similar products to cart context, higher-ticket first within similarity tier */
  similar: Product[];
  /** Broader catalog after similar products are exhausted */
  broader: Product[];
}

/**
 * Similarity-first recommendation engine.
 *
 * Priority:
 *   1. Similarity score (tags, keywords, category, vendor)
 *   2. Higher price within same similarity tier
 *   3. Broader catalog as fallback
 *
 * NO cheap-filler / threshold-gap logic.
 */
export function getRecommendedProducts(
  currentProduct: Product | null | undefined,
  cartItems: { product: Product; quantity: number }[],
  _remaining: number,
  allProducts: Product[]
): RecommendationResult {
  const excludeIds = new Set(cartItems.map((i) => i.product.id));
  if (currentProduct) excludeIds.add(currentProduct.id);

  const available = allProducts.filter(
    (p) => !excludeIds.has(p.id) && p.available !== false && p.price > 0
  );

  const { contextTags, contextKeywords, contextCategories, contextVendors } =
    buildContext(cartItems, currentProduct);

  // ── Score all candidates by similarity only ──
  const scored = available.map((p) => ({
    product: p,
    score: similarityScore(p, contextTags, contextKeywords, contextCategories, contextVendors),
  }));

  // ── Sort: similarity DESC, then price DESC (higher-ticket first within same similarity) ──
  scored.sort((a, b) => b.score - a.score || b.product.price - a.product.price);

  // ── Split into "similar" (score > 0) and "broader" (score == 0) ──
  const SIMILAR_LIMIT = 12;
  const BROADER_LIMIT = 50;

  const similarCandidates = scored.filter((s) => s.score > 0);
  const broaderCandidates = scored.filter((s) => s.score === 0);

  const similar = applyDiversity(similarCandidates, 4, SIMILAR_LIMIT);
  const similarIds = new Set(similar.map((p) => p.id));

  // Broader: remaining similar items that didn't make the cut + zero-score items
  const overflowSimilar = similarCandidates.filter((s) => !similarIds.has(s.product.id));
  const broaderPool = [...overflowSimilar, ...broaderCandidates];
  // Within broader, still sort by price DESC for commercial value
  broaderPool.sort((a, b) => b.product.price - a.product.price);
  const broader = applyDiversity(broaderPool, 6, BROADER_LIMIT);

  return { similar, broader };
}

/**
 * Clear normalization caches (call on product data refresh if needed)
 */
export function clearRecommendationCache() {
  normalizedTagsCache.clear();
  normalizedKeywordsCache.clear();
}

import { Product } from "@/lib/constants";

// ── Georgian + English stopwords ──
const STOPWORDS = new Set([
  // Georgian
  "და", "ან", "არის", "ეს", "იყო", "რომ", "რა", "ვის", "მას", "ის",
  "ამ", "მე", "შენ", "ჩვენ", "თქვენ", "ისინი", "ყველა", "ერთი", "ორი",
  "სამი", "კარგი", "ახალი", "დიდი", "პატარა", "თვის", "ზე", "თან",
  // English
  "the", "and", "for", "with", "this", "that", "from", "your", "are",
  "was", "were", "been", "have", "has", "had", "but", "not", "you",
  "all", "can", "her", "his", "one", "our", "out", "new", "set",
  "use", "how", "its", "may", "who", "get", "also",
  // Common product noise
  "pcs", "pack", "piece", "pieces", "size", "color", "style",
]);

// ── Normalization cache (keyed by product id) ──
const normalizedTagsCache = new Map<string, Set<string>>();
const normalizedKeywordsCache = new Map<string, Set<string>>();

function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
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
  const raw = p.title
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]{}#@&%$^*+=<>~`|\\\/]/g, " ")
    .split(/\s+/);
  for (const w of raw) {
    if (w.length > 2 && !STOPWORDS.has(w)) words.add(w);
  }
  normalizedKeywordsCache.set(p.id, words);
  return words;
}

// ── Similarity scoring ──
function similarityScore(
  candidate: Product,
  contextTags: Set<string>,
  contextKeywords: Set<string>,
  contextCategories: Set<string>,
  contextVendors: Set<string>,
  remaining: number
): number {
  let score = 0;

  // 1) Tag overlap — highest weight (10 per match)
  const cTags = getNormalizedTags(candidate);
  let tagMatches = 0;
  for (const t of cTags) {
    if (contextTags.has(t)) tagMatches++;
  }
  score += tagMatches * 10;

  // 2) Title keyword overlap — medium weight (4 per match)
  const cWords = getKeywords(candidate);
  let wordMatches = 0;
  for (const w of cWords) {
    if (contextKeywords.has(w)) wordMatches++;
  }
  score += wordMatches * 4;

  // 3) Category match — bonus 8
  if (contextCategories.has(candidate.category)) score += 8;

  // 4) Vendor match — bonus 3
  if (candidate.vendor && contextVendors.has(candidate.vendor)) score += 3;

  // 5) Price-to-gap fitness (0–10 scale)
  if (remaining > 0) {
    const gapFit = 10 - Math.min(10, (Math.abs(candidate.price - remaining) / Math.max(1, remaining)) * 10);
    score += gapFit;
  }

  // 6) Discount signal — bonus if ≥30% off
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
  const topTagCount: Record<string, number> = {};

  for (const { product } of scored) {
    const cat = product.category || "__none__";
    const topTag = (product.tags?.[0] || "").toLowerCase();

    const catOk = (catCount[cat] || 0) < maxPerCategory;
    const tagOk = topTag ? (topTagCount[topTag] || 0) < 2 : true;

    if (catOk && tagOk) {
      result.push(product);
      catCount[cat] = (catCount[cat] || 0) + 1;
      if (topTag) topTagCount[topTag] = (topTagCount[topTag] || 0) + 1;
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

// ── Fallback tags ──
const FALLBACK_TAGS = new Set(["flash deal", "trending", "popular", "popular choice", "fast delivery", "bestseller", "hot"]);

function isFallbackCandidate(p: Product): boolean {
  const tags = getNormalizedTags(p);
  for (const t of tags) {
    if (FALLBACK_TAGS.has(t)) return true;
    for (const fb of FALLBACK_TAGS) {
      if (t.includes(fb)) return true;
    }
  }
  return false;
}

// ══════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════

export interface RecommendationResult {
  /** "Perfect to unlock" — 8–10 gap-filling items */
  gapFillers: Product[];
  /** "Recommended for you" — broader relevance pool */
  recommended: Product[];
}

export function getRecommendedProducts(
  currentProduct: Product | null | undefined,
  cartItems: { product: Product; quantity: number }[],
  remaining: number,
  allProducts: Product[]
): RecommendationResult {
  const cartIds = new Set(cartItems.map((i) => i.product.id));
  const excludeIds = new Set(cartIds);
  if (currentProduct) excludeIds.add(currentProduct.id);

  const available = allProducts.filter(
    (p) => !excludeIds.has(p.id) && p.available !== false && p.price > 0
  );

  const { contextTags, contextKeywords, contextCategories, contextVendors } =
    buildContext(cartItems, currentProduct);

  // ── Score all candidates ──
  const scored = available.map((p) => ({
    product: p,
    score: similarityScore(p, contextTags, contextKeywords, contextCategories, contextVendors, remaining),
  }));

  // ── Gap fillers: price in target range ──
  const minPrice = remaining <= 5 ? 2 : remaining * 0.5;
  const maxPrice = remaining <= 5 ? 8 : remaining * 1.5;

  const gapCandidates = scored
    .filter((s) => s.product.price >= minPrice && s.product.price <= maxPrice)
    .sort((a, b) => b.score - a.score || Math.abs(a.product.price - remaining) - Math.abs(b.product.price - remaining));

  let gapFillers = applyDiversity(gapCandidates, 2, 10);

  // Fallback: if fewer than 4 gap fillers, add cheap impulse items
  if (gapFillers.length < 4) {
    const gapIds = new Set(gapFillers.map((p) => p.id));
    const fallbacks = scored
      .filter((s) => !gapIds.has(s.product.id) && (isFallbackCandidate(s.product) || s.product.price <= 10))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10 - gapFillers.length)
      .map((s) => s.product);
    gapFillers = [...gapFillers, ...fallbacks];
  }

  // ── Recommended: broader pool, excluding gap fillers ──
  const gapFillerIds = new Set(gapFillers.map((p) => p.id));
  const recCandidates = scored
    .filter((s) => !gapFillerIds.has(s.product.id))
    .sort((a, b) => b.score - a.score);

  const recommended = applyDiversity(recCandidates, 6, 50);

  return { gapFillers, recommended };
}

/**
 * Clear normalization caches (call on product data refresh if needed)
 */
export function clearRecommendationCache() {
  normalizedTagsCache.clear();
  normalizedKeywordsCache.clear();
}

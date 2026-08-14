/**
 * Ordering for the /5for39 bundle grid.
 *
 * Two independent steps so the grid never jumps under the user's finger:
 *
 *   1. `buildBaseOrder` — a stable, session-deterministic catalog order
 *      (priority impulse hooks first, then an evenly mixed round-robin of every
 *      other category). It only depends on the catalog + seed, so selecting or
 *      deselecting products never reshuffles it.
 *
 *   2. `insertCategoryStrips` — keeps everything through the most recently
 *      selected card in place, then silently ranks the remaining feed in phases:
 *      four similar products, priority products, then the existing mixed order.
 */

import { Product } from "@/lib/constants";

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Fisher–Yates with a seeded RNG — stable across renders for the same seed. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const catsOf = (p: Product): string[] =>
  p.categories?.length ? p.categories : [p.category].filter(Boolean);

/** Round-robin across categories so no single category clumps together. */
function evenlyMixed(items: Product[], seed: number): Product[] {
  const buckets = new Map<string, Product[]>();
  for (const p of items) {
    const key = catsOf(p)[0] || "uncategorized";
    const list = buckets.get(key) || [];
    list.push(p);
    buckets.set(key, list);
  }
  const keys = seededShuffle([...buckets.keys()], seed + 7);
  const out: Product[] = [];
  let added = true;
  let i = 0;
  while (added) {
    added = false;
    for (const k of keys) {
      const list = buckets.get(k);
      if (!list) continue;
      if (i < list.length) {
        out.push(list[i]);
        added = true;
      }
    }
    i++;
  }
  return out;
}

export interface BaseOrderInput {
  pool: Product[];
  /** Stable per-session seed. */
  seed: number;
  /** Product promoted by ?featured=SKU — always stays first. */
  featuredId?: string | null;
}

/** Stable catalog order. Depends on the catalog + seed only — never selection. */
export function buildBaseOrder({ pool, seed, featuredId }: BaseOrderInput): Product[] {
  const impulse = pool.filter((p) => p.isPriorityImpulse);
  const rest = pool.filter((p) => !p.isPriorityImpulse);

  let ordered = [...seededShuffle(impulse, seed), ...evenlyMixed(rest, seed)];

  if (featuredId) {
    const idx = ordered.findIndex((p) => p.id === featuredId);
    if (idx > 0) {
      const copy = [...ordered];
      const [hit] = copy.splice(idx, 1);
      ordered = [hit, ...copy];
    }
  }
  return ordered;
}

export interface CategoryStripInput {
  base: Product[];
  selectedIds: string[];
  /** Stable per-session seed (used for filler shuffling). */
  seed: number;
  /** Disable strips entirely (e.g. a category filter is already active). */
  enabled?: boolean;
}

export interface BundleGridResult {
  items: Product[];
  /** Active anchor id -> same-category recommendations that follow it. */
  strips: Map<string, string[]>;
  /** Ids rendered as part of a suggestion strip (for subtle styling). */
  suggestionIds: Set<string>;
}

/** Max suggestions injected right after a selected card. */
const STRIP_SIZE = 4;

/** Cards after the selected one that are never re-ordered (visual buffer). */
const BUFFER_SIZE = 4;

/**
 * Re-ranks only the feed after the latest selection. This deliberately avoids
 * dividers and nested grid rows: cards always occupy the normal two-column flow,
 * so choosing a left-hand card can never leave the right-hand column empty.
 */
export function insertCategoryStrips({
  base,
  selectedIds,
  seed,
  enabled = true,
}: CategoryStripInput): BundleGridResult {
  const strips = new Map<string, string[]>();
  const suggestionIds = new Set<string>();

  if (!enabled || selectedIds.length === 0) {
    return { items: base, strips, suggestionIds };
  }

  const selected = new Set(selectedIds);
  const anchorId = [...selectedIds].reverse().find((id) => base.some((p) => p.id === id));
  if (!anchorId) return { items: base, strips, suggestionIds };

  const anchorIdx = base.findIndex((p) => p.id === anchorId);
  const anchor = base[anchorIdx];
  const categories = new Set(catsOf(anchor));
  // Visual buffer zone: the cards the user is currently looking at (the anchor
  // plus the next few) stay exactly where they were, so selecting never shifts
  // the layout under the finger. Re-ranking starts below that buffer.
  const bufferEnd = Math.min(base.length, anchorIdx + 1 + BUFFER_SIZE);
  const prefix = base.slice(0, bufferEnd);
  const remainder = base.slice(bufferEnd);

  const similar = remainder
    .filter((p) => !selected.has(p.id) && catsOf(p).some((category) => categories.has(category)))
    .slice(0, STRIP_SIZE);
  const similarIds = new Set(similar.map((p) => p.id));
  const priority = seededShuffle(
    remainder.filter(
      (p) => !selected.has(p.id) && !similarIds.has(p.id) && p.isPriorityImpulse,
    ),
    seed + anchorIdx,
  );
  const promotedIds = new Set([...similarIds, ...priority.map((p) => p.id)]);
  const mixed = remainder.filter((p) => !promotedIds.has(p.id));

  similar.forEach((p) => suggestionIds.add(p.id));
  strips.set(anchorId, similar.map((p) => p.id));

  const items = [...prefix, ...similar, ...priority, ...mixed];

  return { items, strips, suggestionIds };
}

export interface RerankInput {
  /** The order currently on screen (NOT the pristine base order). */
  current: Product[];
  /** Id of the card the user just selected. */
  anchorId: string;
  selectedIds: string[];
  seed: number;
  /** Index below which nothing may ever move again (monotonic freeze). */
  freezeFrom?: number;
}

export interface RerankResult {
  items: Product[];
  /** New monotonic freeze index to carry into the next selection. */
  freezeFrom: number;
}

/**
 * Incremental, append-only re-rank.
 *
 * Re-ranking always starts from the order that is CURRENTLY on screen and never
 * touches anything above `freezeFrom` (which only ever grows). That means cards
 * the user has already seen — including the tapped card and the buffer right
 * after it — keep their exact index and column, so selecting a product can
 * never shuffle the grid upwards or flip a card to the other column.
 */
export function rerankFeed({
  current,
  anchorId,
  selectedIds,
  seed,
  freezeFrom = 0,
}: RerankInput): RerankResult {
  const anchorIdx = current.findIndex((p) => p.id === anchorId);
  if (anchorIdx < 0) return { items: current, freezeFrom };

  const anchor = current[anchorIdx];
  const cut = Math.min(current.length, Math.max(freezeFrom, anchorIdx + 1 + BUFFER_SIZE));
  const prefix = current.slice(0, cut);
  const remainder = current.slice(cut);
  if (remainder.length === 0) return { items: current, freezeFrom: cut };

  const selected = new Set(selectedIds);
  const categories = new Set(catsOf(anchor));

  const similar = remainder
    .filter((p) => !selected.has(p.id) && catsOf(p).some((c) => categories.has(c)))
    .slice(0, STRIP_SIZE);
  const similarIds = new Set(similar.map((p) => p.id));
  const priority = seededShuffle(
    remainder.filter((p) => !selected.has(p.id) && !similarIds.has(p.id) && p.isPriorityImpulse),
    seed + anchorIdx,
  );
  const promoted = new Set([...similarIds, ...priority.map((p) => p.id)]);
  const mixed = remainder.filter((p) => !promoted.has(p.id));

  return { items: [...prefix, ...similar, ...priority, ...mixed], freezeFrom: cut };
}

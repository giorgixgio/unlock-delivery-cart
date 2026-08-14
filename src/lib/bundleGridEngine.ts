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
 *   2. `insertCategoryStrips` — splices a short strip of same-category
 *      suggestions *directly after* each selected card, pulling only items that
 *      already sat below that card. Everything above the tapped card keeps its
 *      exact index, so the scroll position stays anchored.
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
      const list = buckets.get(k)!;
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
  /** anchor product id -> ids of the suggestion cards that follow it. */
  strips: Map<string, string[]>;
  /** Ids rendered as part of a suggestion strip (for subtle styling). */
  suggestionIds: Set<string>;
}

/** Max suggestions injected right after a selected card. */
const STRIP_SIZE = 4;

/**
 * Splices same-category suggestions in place after each selected product.
 * Only items that already sat *below* the anchor get moved, so nothing above
 * the tapped card ever shifts.
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
  const indexOf = new Map(base.map((p, i) => [p.id, i] as const));
  const moved = new Set<string>();

  // Anchors in grid order so earlier strips don't steal from later ones oddly.
  const anchors = selectedIds
    .filter((id) => indexOf.has(id))
    .sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);

  for (const anchorId of anchors) {
    const anchorIdx = indexOf.get(anchorId)!;
    const anchor = base[anchorIdx];
    const cats = new Set(catsOf(anchor));

    const below = base.slice(anchorIdx + 1);

    const sameCat = below.filter(
      (p) =>
        !selected.has(p.id) &&
        !moved.has(p.id) &&
        catsOf(p).some((c) => cats.has(c)),
    );

    let picks = sameCat.slice(0, STRIP_SIZE);

    if (picks.length < STRIP_SIZE) {
      // Shallow category — top up with impulse hooks so it never dead-ends.
      const pickIds = new Set(picks.map((p) => p.id));
      const filler = seededShuffle(
        below.filter(
          (p) =>
            p.isPriorityImpulse &&
            !selected.has(p.id) &&
            !moved.has(p.id) &&
            !pickIds.has(p.id),
        ),
        seed + anchorIdx,
      ).slice(0, STRIP_SIZE - picks.length);
      picks = [...picks, ...filler];
    }

    if (picks.length === 0) continue;

    for (const p of picks) {
      moved.add(p.id);
      suggestionIds.add(p.id);
    }
    strips.set(anchorId, picks.map((p) => p.id));
  }

  if (moved.size === 0) return { items: base, strips, suggestionIds };

  const byId = new Map(base.map((p) => [p.id, p] as const));
  const items: Product[] = [];
  for (const p of base) {
    if (moved.has(p.id) && !strips.has(p.id)) continue;
    items.push(p);
    const strip = strips.get(p.id);
    if (strip) {
      for (const id of strip) {
        const hit = byId.get(id);
        if (hit) items.push(hit);
      }
    }
  }

  return { items, strips, suggestionIds };
}

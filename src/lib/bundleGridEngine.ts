/**
 * State-driven ordering for the /5for39 bundle grid.
 *
 * The order reacts to how many items the visitor has already picked:
 *   Phase 1 (0 selected)   — shuffled `isPriorityImpulse` hooks first, then an
 *                            evenly mixed round-robin of every other category.
 *   Phase 2 (1–2 selected) — inject 2–3 unselected products from the exact
 *                            category of the last pick right at the top.
 *   Phase 3 (3–4 selected) — decision fatigue: inject the remaining shuffled
 *                            impulse items as brain-dead easy filler.
 *
 * Everything is pure and deterministic for a given seed, so re-renders never
 * reshuffle the grid (no jitter) and lazy loading stays stable.
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

export interface BundleGridInput {
  pool: Product[];
  selectedIds: string[];
  /** Category of the most recently selected product (drives phase 2). */
  lastCategory?: string | null;
  /** Stable per-session seed. */
  seed: number;
  /** Product promoted by ?featured=SKU — always stays first. */
  featuredId?: string | null;
}

export interface BundleGridResult {
  items: Product[];
  /**
   * Id of the last same-category item when that category ran dry and general /
   * impulse recommendations take over right after it. Drives the soft divider.
   */
  dividerAfterId: string | null;
}

/** How many unselected items a category needs before it counts as "deep". */
const CATEGORY_DEPLETED_BELOW = 4;

/** Returns the full ordered grid for the current bundle state. */
export function buildBundleGrid({
  pool,
  selectedIds,
  lastCategory,
  seed,
  featuredId,
}: BundleGridInput): BundleGridResult {
  const selected = new Set(selectedIds);
  const n = selectedIds.length;

  const impulse = pool.filter((p) => p.isPriorityImpulse);
  const rest = pool.filter((p) => !p.isPriorityImpulse);

  // Phase 1 base order: hooks up top, everything else evenly mixed below.
  const base = [...seededShuffle(impulse, seed), ...evenlyMixed(rest, seed)];

  let head: Product[] = [];
  let dividerAfterId: string | null = null;

  if (n >= 1 && n <= 2 && lastCategory) {
    // Phase 2 — match intent: unselected products from the same category.
    const sameCat = base.filter(
      (p) => !selected.has(p.id) && catsOf(p).includes(lastCategory),
    );

    if (sameCat.length > 0 && sameCat.length < CATEGORY_DEPLETED_BELOW) {
      // Shallow category — show everything it has, then seamlessly continue
      // with impulse/general picks so the grid never feels like a dead end.
      const catIds = new Set(sameCat.map((p) => p.id));
      const filler = seededShuffle(
        impulse.filter((p) => !selected.has(p.id) && !catIds.has(p.id)),
        seed + n,
      ).slice(0, 6);
      head = [...sameCat, ...filler];
      dividerAfterId = sameCat[sameCat.length - 1].id;
    } else {
      head = sameCat.slice(0, 3);
    }
  } else if (n >= 3) {
    // Phase 3 — filler: remaining impulse items, shuffled.
    head = seededShuffle(
      impulse.filter((p) => !selected.has(p.id)),
      seed + n,
    ).slice(0, 6);
  }

  const headIds = new Set(head.map((p) => p.id));
  let ordered = [...head, ...base.filter((p) => !headIds.has(p.id))];

  if (featuredId) {
    const idx = ordered.findIndex((p) => p.id === featuredId);
    if (idx > 0) {
      const copy = [...ordered];
      const [hit] = copy.splice(idx, 1);
      ordered = [hit, ...copy];
    }
  }

  return { items: ordered, dividerAfterId };
}

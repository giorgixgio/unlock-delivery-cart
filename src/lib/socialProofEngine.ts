/**
 * AI-driven Social Proof Engine
 * Generates believable, non-repetitive badges, micro-proof lines, and urgency signals.
 * Admin overrides take priority over auto-generated content.
 */

import { Product } from "@/lib/constants";

// ─── Types ─────────────────────────────────────────────────────────
export interface AdminOverrides {
  forcePrimaryBadge?: string;
  forceSecondaryBadge?: string;
  customBadgeText?: string;
  suppressBadges?: boolean;
  featuredForLanding?: boolean;
  priorityWeight?: number; // 0-100
  isBestseller?: boolean;
  isRecommended?: boolean;
  isTopPick?: boolean;
}

export interface ProofBadge {
  text: string;
  color: "red" | "orange" | "green" | "dark" | "yellow";
  position: "top-left" | "top-right";
}

export interface MicroProofLine {
  text: string;
  icon?: string;
}

export interface ProductProof {
  badges: ProofBadge[];
  microLines: MicroProofLine[];
  urgencyLine?: string;
  trustChip?: string;
}

// ─── Config ────────────────────────────────────────────────────────
export const socialProofConfig = {
  enableDynamicBadges: true,
  enableLiveTicker: true,
  enableMicroProof: true,
  refreshIntervalMs: 5000,
  allowSimulatedFallback: true,
};

// ─── Deterministic seeded random (session-stable) ─────────────────
function seededHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: string): number {
  return (seededHash(seed) % 10000) / 10000;
}

function seededRange(seed: string, min: number, max: number): number {
  return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
}

function pickOne<T>(arr: T[], seed: string): T {
  return arr[seededHash(seed) % arr.length];
}

// ─── Price tier detection ──────────────────────────────────────────
type PriceTier = "impulse" | "mid" | "premium";
function getPriceTier(price: number): PriceTier {
  if (price <= 15) return "impulse";
  if (price <= 50) return "mid";
  return "premium";
}

// ─── Badge Pools (Georgian) ────────────────────────────────────────
const VELOCITY_BADGES = [
  { text: "სწრაფად იყიდება", color: "red" as const },
  { text: "პოპულარული", color: "orange" as const },
  { text: "დღეს ტრენდში", color: "red" as const },
  { text: "ხალხის არჩევანი", color: "orange" as const },
];

const SCARCITY_BADGES = [
  { text: "მარაგი იწურება", color: "red" as const },
  { text: "შეზღუდული რაოდენობა", color: "orange" as const },
  { text: "სწრაფად ქრება", color: "red" as const },
];

const BESTSELLER_BADGES = [
  { text: "Best Seller", color: "dark" as const },
  { text: "TOP არჩევანი", color: "dark" as const },
  { text: "რეკომენდებული", color: "dark" as const },
];

const TRUST_BADGES = [
  { text: "ადგილზე გადახდა", color: "green" as const },
  { text: "სწრაფი მიწოდება", color: "green" as const },
  { text: "მარტივი შეკვეთა", color: "green" as const },
];

const VALUE_BADGES = [
  { text: "სპეციალური ფასი", color: "yellow" as const },
  { text: "საუკეთესო ფასი", color: "yellow" as const },
  { text: "კვირის შეთავაზება", color: "yellow" as const },
];

// ─── Micro proof templates ─────────────────────────────────────────
type MicroTemplate = (n: number) => string;

const MICRO_VELOCITY: MicroTemplate[] = [
  (n) => `👁 ახლა უყურებს ${n} ადამიანი`,
  (n) => `🛒 ბოლო 24სთ-ში იყიდა ${n}-მა`,
  (n) => `📦 დღეს დაამატა კალათაში ${n}-მა`,
];

const MICRO_RECENCY: MicroTemplate[] = [
  (n) => `⏱ ბოლო შეკვეთა ${n} წუთის წინ`,
];

const MICRO_SCARCITY: MicroTemplate[] = [
  (n) => `🔥 დარჩა მხოლოდ ${n}`,
];

const MICRO_SOCIAL: string[] = [
  "🏙 ხშირად ირჩევენ თბილისში",
  "📱 COD შეკვეთებში პოპულარული",
  "⭐ მომხმარებლების ფავორიტი",
  "✅ შემოწმება მიწოდებისას",
];

// ─── Anti-repetition tracking (per render cycle) ───────────────────
const viewportBadgeTracker = new Map<string, Set<string>>();
let lastTrackReset = 0;

function resetTrackerIfNeeded() {
  const now = Date.now();
  if (now - lastTrackReset > 10000) {
    viewportBadgeTracker.clear();
    lastTrackReset = now;
  }
}

function trackBadge(gridKey: string, badgeText: string): boolean {
  resetTrackerIfNeeded();
  if (!viewportBadgeTracker.has(gridKey)) {
    viewportBadgeTracker.set(gridKey, new Set());
  }
  const set = viewportBadgeTracker.get(gridKey)!;
  // Max 3 of same badge type per viewport
  const count = Array.from(set).filter(b => b === badgeText).length;
  if (count >= 2) return false;
  set.add(badgeText);
  return true;
}

// ─── Main generator ───────────────────────────────────────────────
export function generateProductProof(
  product: Product,
  gridIndex: number = 0,
  overrides?: AdminOverrides,
  context: "grid" | "hero" | "landing" = "grid"
): ProductProof {
  if (!socialProofConfig.enableDynamicBadges) {
    return { badges: [], microLines: [] };
  }

  // Admin suppression
  if (overrides?.suppressBadges) {
    return { badges: [], microLines: [] };
  }

  const seed = product.id;
  const tier = getPriceTier(product.price);
  const priority = overrides?.priorityWeight ?? seededRange(seed + "_priority", 20, 80);
  const gridKey = `grid_${Math.floor(gridIndex / 8)}`;

  // ── Badges ──
  const badges: ProofBadge[] = [];

  // Admin forced badges
  if (overrides?.forcePrimaryBadge) {
    badges.push({ text: overrides.forcePrimaryBadge, color: "red", position: "top-left" });
  }
  if (overrides?.forceSecondaryBadge) {
    badges.push({ text: overrides.forceSecondaryBadge, color: "green", position: "top-right" });
  }

  // Admin flag-based badges
  if (!overrides?.forcePrimaryBadge) {
    if (overrides?.isBestseller) {
      badges.push({ text: "Best Seller", color: "dark", position: "top-left" });
    } else if (overrides?.isTopPick) {
      badges.push({ text: "TOP არჩევანი", color: "dark", position: "top-left" });
    } else if (overrides?.isRecommended) {
      badges.push({ text: "რეკომენდებული", color: "dark", position: "top-left" });
    }
  }

  // Auto-generate if no admin badges
  if (badges.length === 0) {
    const r = seededRandom(seed + "_badgecat" + gridIndex);
    // Weighted pool selection based on product traits
    let pool: { text: string; color: ProofBadge["color"] }[];
    if (r < 0.25) pool = VELOCITY_BADGES;
    else if (r < 0.40 && tier !== "premium") pool = SCARCITY_BADGES;
    else if (r < 0.55) pool = BESTSELLER_BADGES;
    else if (r < 0.70) pool = TRUST_BADGES;
    else if (r < 0.85) pool = VALUE_BADGES;
    else pool = VELOCITY_BADGES;

    const picked = pickOne(pool, seed + "_bp" + gridIndex);
    if (trackBadge(gridKey, picked.text)) {
      badges.push({ text: picked.text, color: picked.color, position: "top-left" });
    }
  }

  // Secondary badge (30% chance for grid, always for landing)
  if (badges.length < 2) {
    const showSecondary = context === "landing" || seededRandom(seed + "_sec") > 0.7;
    if (showSecondary && !overrides?.forceSecondaryBadge) {
      const secPool = seededRandom(seed + "_secpool") > 0.5 ? TRUST_BADGES : VALUE_BADGES;
      const secPick = pickOne(secPool, seed + "_sp");
      if (secPick.text !== badges[0]?.text) {
        badges.push({ text: secPick.text, color: secPick.color, position: "top-right" });
      }
    }
  }

  // Limit to max 2
  const finalBadges = badges.slice(0, 2);

  // ── Micro proof lines ──
  const microLines: MicroProofLine[] = [];

  if (socialProofConfig.enableMicroProof) {
    // Line 1: velocity/social
    const microR = seededRandom(seed + "_micro1");
    if (microR < 0.35) {
      const viewers = tier === "impulse"
        ? seededRange(seed + "_viewers", 8, 41)
        : tier === "mid"
          ? seededRange(seed + "_viewers", 3, 22)
          : seededRange(seed + "_viewers", 3, 12);
      const tmpl = pickOne(MICRO_VELOCITY, seed + "_mv");
      microLines.push({ text: tmpl(viewers) });
    } else if (microR < 0.6) {
      const bought = tier === "impulse"
        ? seededRange(seed + "_bought", 12, 67)
        : tier === "mid"
          ? seededRange(seed + "_bought", 2, 34)
          : seededRange(seed + "_bought", 2, 15);
      microLines.push({ text: MICRO_VELOCITY[1](bought) });
    } else if (microR < 0.8) {
      const mins = seededRange(seed + "_mins", 2, 57);
      microLines.push({ text: MICRO_RECENCY[0](mins) });
    } else {
      microLines.push({ text: pickOne(MICRO_SOCIAL, seed + "_soc") });
    }

    // Line 2 (50% chance): scarcity or social
    if (seededRandom(seed + "_micro2show") > 0.5) {
      const line2R = seededRandom(seed + "_micro2");
      if (line2R < 0.4 && tier !== "premium") {
        const stock = seededRange(seed + "_stock", 3, 18);
        microLines.push({ text: MICRO_SCARCITY[0](stock) });
      } else {
        const socialLine = pickOne(MICRO_SOCIAL, seed + "_soc2");
        if (socialLine !== microLines[0]?.text) {
          microLines.push({ text: socialLine });
        }
      }
    }
  }

  // Limit to max 2
  const finalMicro = microLines.slice(0, 2);

  // ── Urgency line (landing/hero only) ──
  let urgencyLine: string | undefined;
  if (context === "landing" || context === "hero") {
    const stock = seededRange(seed + "_urgstock", 3, 14);
    urgencyLine = `🔥 დარჩა მხოლოდ ${stock} — შეუკვეთე სანამ არ გაიყიდა`;
  }

  // ── Trust chip (landing only) ──
  let trustChip: string | undefined;
  if (context === "landing") {
    trustChip = pickOne([
      "✅ ადგილზე გადახდა",
      "🚚 სწრაფი მიწოდება",
      "🔒 უსაფრთხო შეკვეთა",
    ], seed + "_trust");
  }

  return { badges: finalBadges, microLines: finalMicro, urgencyLine, trustChip };
}

// ─── Rotating micro-text pool for interval updates ─────────────────
export function getMicroProofRotation(product: Product, tick: number): string {
  const tier = getPriceTier(product.price);
  const seed = product.id;

  const pool: string[] = [];

  // Velocity
  const viewers = tier === "impulse"
    ? seededRange(seed + "_rv" + (tick % 3), 5, 38)
    : seededRange(seed + "_rv" + (tick % 3), 3, 19);
  pool.push(`👁 ახლა უყურებს ${viewers} ადამიანი`);

  // Bought
  const bought = tier === "impulse"
    ? seededRange(seed + "_rb" + (tick % 4), 8, 54)
    : seededRange(seed + "_rb" + (tick % 4), 2, 28);
  pool.push(`🛒 ბოლო 24სთ-ში იყიდა ${bought}-მა`);

  // Recency
  const mins = seededRange(seed + "_rm" + (tick % 5), 2, 42);
  pool.push(`⏱ ბოლო შეკვეთა ${mins} წუთის წინ`);

  // Cart adds
  const carts = seededRange(seed + "_rc" + (tick % 3), 3, 29);
  pool.push(`📦 დღეს კალათაში დაამატა ${carts}-მა`);

  // Social
  pool.push("🏙 ხშირად ირჩევენ თბილისში");
  pool.push("⭐ მომხმარებლების ფავორიტი");

  // Scarcity (sometimes)
  if (tier !== "premium" && tick % 3 === 0) {
    const stock = seededRange(seed + "_rs", 3, 15);
    pool.push(`🔥 დარჩა მხოლოდ ${stock}`);
  }

  return pool[tick % pool.length];
}

// ─── Live Activity Ticker messages ─────────────────────────────────
const TICKER_TEMPLATES = [
  () => {
    const cities = ["თბილისში", "ბათუმში", "ქუთაისში", "რუსთავში"];
    const city = cities[Math.floor(Math.random() * cities.length)];
    return `📍 ვიღაცამ ${city} ახლახანს შეუკვეთა`;
  },
  () => {
    const n = Math.floor(Math.random() * 40) + 15;
    return `📦 დღეს უკვე ${n}+ შეკვეთა`;
  },
  () => {
    const n = Math.floor(Math.random() * 30) + 8;
    return `👁 ახლა ${n} ადამიანი ათვალიერებს`;
  },
  () => {
    const n = Math.floor(Math.random() * 20) + 5;
    return `🛒 ბოლო 1 საათში ${n}-მა შეუკვეთა`;
  },
  () => `🚚 თბილისში მიტანა 1-2 დღეში`,
  () => `💵 გადახდა კურიერთან — უსაფრთხო`,
];

export function getTickerMessage(): string {
  const tmpl = TICKER_TEMPLATES[Math.floor(Math.random() * TICKER_TEMPLATES.length)];
  return tmpl();
}

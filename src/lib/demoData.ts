// Demo/simulated data generators — session-based, NOT linked to real inventory

const BADGE_OPTIONS = ["Flash deal", "Fast delivery", "Trending today", "Popular choice"] as const;
const TIMER_DURATIONS = [45 * 60, 60 * 60, 2 * 60 * 60, 3 * 60 * 60]; // seconds

// Session stores
const stockStore = new Map<string, number>();
const badgeStore = new Map<string, string[]>();
const timerStore = new Map<string, number>(); // epoch when timer started
const timerDurationStore = new Map<string, number>(); // seconds

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  h = Math.abs(h);
  return (h % 1000) / 1000;
}

export function getSimulatedStock(productId: string): number {
  if (!stockStore.has(productId)) {
    stockStore.set(productId, Math.floor(seededRandom(productId + "_stock") * 16) + 2); // 2-17
  }
  return stockStore.get(productId)!;
}

export function getStockLabel(stock: number): { text: string; color: "red" | "orange" | "green" } {
  if (stock <= 5) return { text: `მხოლოდ ${stock} დარჩა დღეს`, color: "red" };
  if (stock <= 11) return { text: "შეზღუდული რაოდენობა", color: "orange" };
  return { text: "პოპულარული პროდუქტი დღეს", color: "green" };
}

export function getStockBarPercent(productId: string): number {
  if (!stockStore.has(productId)) getSimulatedStock(productId);
  return Math.floor(seededRandom(productId + "_bar") * 65) + 25; // 25-90
}

export function getDemoBadges(productId: string): string[] {
  if (!badgeStore.has(productId)) {
    const r = seededRandom(productId + "_badge");
    const count = r < 0.3 ? 0 : r < 0.7 ? 1 : 2;
    const shuffled = [...BADGE_OPTIONS].sort(() => seededRandom(productId + "_shuf") - 0.5);
    badgeStore.set(productId, shuffled.slice(0, count));
  }
  return badgeStore.get(productId)!;
}

export function getTimerEnd(productId: string): number {
  const now = Date.now();
  if (timerStore.has(productId)) {
    const end = timerStore.get(productId)! + timerDurationStore.get(productId)! * 1000;
    if (end > now) return end;
    // Timer expired — reset with new random duration
  }
  const dur = TIMER_DURATIONS[Math.floor(seededRandom(productId + "_t" + now) * TIMER_DURATIONS.length)];
  timerStore.set(productId, now);
  timerDurationStore.set(productId, dur);
  return now + dur * 1000;
}

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";
  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

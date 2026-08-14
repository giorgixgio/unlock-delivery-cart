/** Deterministic per-product urgency lines (sold count vs low stock). */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export interface UrgencySignal {
  text: string;
  kind: "sold" | "stock";
}

/** ~60% show "sold" proof, ~40% show a low-stock warning. Stable per product id. */
export const getUrgencySignal = (id: string): UrgencySignal => {
  const h = hash(String(id));
  if (h % 10 < 6) {
    const sold = 100 + (h % 251); // 100–350
    return { text: `🔥 გაიყიდა ${sold}+ ცალი`, kind: "sold" };
  }
  const stock = 5 + (h % 15); // 5–19
  return { text: `⚡ მარაგშია ${stock} ცალი`, kind: "stock" };
};

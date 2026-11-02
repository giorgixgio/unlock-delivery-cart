export interface PrevOrderLike {
  created_at: string;
  status: string;
  order_items?: { sku: string }[];
}

export interface PrevOrdersSummary {
  line: string;
  /** red: 2+ cancels in 30d; amber: 2+ same-product orders in 30d; none otherwise */
  level: "none" | "amber" | "red";
}

const DAY = 86400e3;

export function summarizePreviousOrders(prev: PrevOrderLike[], currentSkus: string[], now: Date): PrevOrdersSummary {
  const skus = new Set(currentSkus.filter(Boolean));
  const cutoff = now.getTime() - 30 * DAY;
  const sameProduct = (p: PrevOrderLike) => (p.order_items || []).some((i) => skus.has(i.sku));
  const cancelled = prev.filter((p) => p.status === "canceled").length;
  const delivered = prev.filter((p) => p.status === "delivered").length;
  const same = prev.filter(sameProduct).length;
  const recent = prev.filter((p) => new Date(p.created_at).getTime() >= cutoff);
  const cancels30 = recent.filter((p) => p.status === "canceled").length;
  const same30 = recent.filter(sameProduct).length;
  const parts = [`${prev.length} previous`, `${cancelled} cancelled`, `${delivered} delivered`];
  if (same > 0) parts.push(`${same}× same product`);
  const level = cancels30 >= 2 ? "red" : same30 >= 2 ? "amber" : "none";
  return { line: parts.join(" · "), level };
}

/**
 * Parse a human-readable product title from a marketplace URL slug itself — no
 * network request, so nothing to bot-block. Returns null for unknown patterns.
 * Shared by the product form and the Wholesale CRM item popup.
 */
export function titleFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    let slug: string | null = null;

    if (host.includes("temu.com")) {
      // temu.com/{hyphenated-slug}-g-{numeric-id}.html
      const m = path.match(/\/([a-z0-9-]+)-g-\d+\.html/i);
      if (m) slug = m[1];
    } else if (host.includes("aliexpress.")) {
      const desc = u.searchParams.get("description");
      if (desc && desc.length > 3) slug = desc;
      else {
        const m = path.match(/\/([a-z0-9-]{8,})\/\d+\.html/i) || path.match(/\/([a-z0-9-]{8,})-\d+\.html/i);
        if (m) slug = m[1];
      }
    } else if (host.includes("amazon.")) {
      const m = path.match(/^\/([A-Za-z0-9-]{8,})\/(?:dp|gp\/product)\//);
      if (m) slug = m[1];
    } else if (host.includes("alibaba.")) {
      // alibaba.com/product-detail/{Hyphenated-Slug}_{id}.html
      const m = path.match(/\/product-detail\/([A-Za-z0-9-]{6,})_\d+/i);
      if (m) slug = m[1];
    }

    if (!slug) return null;
    const words = decodeURIComponent(slug)
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 0 && !/^\d+$/.test(w));
    if (words.length < 2) return null;
    return words
      .map((w) => (w.length <= 2 && /^[a-z]+$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
      .join(" ")
      .slice(0, 200);
  } catch {
    return null;
  }
}

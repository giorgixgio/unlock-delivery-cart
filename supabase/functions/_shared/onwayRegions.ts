export interface OnwayRegion { id: string; name: string; fields: Record<string, unknown> }
export const cityKey = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/^ქ\.?\s+/, "").replace(/\s+/g, " ");

/** Accept only identifiable provider entries; never fabricate IDs from array positions. */
export function parseRegions(raw: string): OnwayRegion[] {
  const json: unknown = JSON.parse(raw);
  const found = new Map<string, OnwayRegion>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const row = value as Record<string, unknown>;
    const id = row.zone_id ?? row.region_id ?? row.city_id ?? row.id;
    const name = row.name ?? row.region_name ?? row.city_name ?? row.title;
    if ((typeof id === "string" || typeof id === "number") && typeof name === "string" && name.trim()) {
      found.set(String(id), { id: String(id), name: name.trim(), fields: row });
      return;
    }
    Object.values(row).forEach(walk);
  };
  walk(json);
  return [...found.values()];
}

export function uniqueRegionMatch(city: string, regions: OnwayRegion[], aliases: { alias_normalized: string; canonical_city: string }[] = []): OnwayRegion | null {
  const key = cityKey(city);
  if (!key) return null;
  const canonical = new Set([key, ...aliases.filter(a => cityKey(a.alias_normalized) === key).map(a => cityKey(a.canonical_city))]);
  const matches = regions.filter(r => canonical.has(cityKey(r.name)) || canonical.has(cityKey(r.name.split(">").at(-1))));
  return matches.length === 1 ? matches[0] : null;
}
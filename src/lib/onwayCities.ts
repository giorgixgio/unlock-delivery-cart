import { supabase } from "@/integrations/supabase/client";
import { transliterate } from "./addressPredictor";
export interface CityOption { id: string; name: string; aliases: string[] }
const key = (s: string) => transliterate(s.trim().toLowerCase()).replace(/\s+/g, " ");
let cached: Promise<CityOption[]> | null = null;
export function loadOnwayCities(refresh = false): Promise<CityOption[]> {
  if (refresh) cached = null;
  if (!cached) cached = (async () => {
    const rows: { id: string; name: string }[] = [];
    const aliases: { alias: string; region_id: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("onway_regions").select("id,name").eq("active", true).order("id").range(offset, offset + 999);
      if (error) { cached = null; throw error; } rows.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("onway_region_aliases").select("alias,region_id").order("alias").range(offset, offset + 999);
      if (error) break; aliases.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return rows.map(r => ({ ...r, aliases: aliases.filter(a => a.region_id === r.id).map(a => a.alias) })).sort((a,b) => a.name.localeCompare(b.name));
  })();
  return cached;
}
/** Quick-select chips under the city field (top cities by recent orders). Edit freely. */
export const POPULAR_CITIES = ["თბილისი", "ბათუმი", "ქუთაისი", "გორი", "რუსთავი", "ზუგდიდი", "ოზურგეთი", "თელავი"];
/** Ranks: exact/startsWith city, then villages ("ქალაქი > სოფელი"), then contains. Empty query returns nothing. */
export function searchOnwayCities(cities: CityOption[], query: string, limit = 8): CityOption[] {
  const q = key(query);
  if (!q) return [];
  const rank = (c: CityOption) => {
    const keys = [c.name, ...c.aliases].map(key);
    if (!keys.some(k => k.includes(q))) return -1;
    const village = c.name.includes(">");
    if (keys.some(k => k === q)) return village ? 2 : 0;
    if (!village && keys.some(k => k.startsWith(q))) return 1;
    if (village) return keys.some(k => k.startsWith(q)) ? 2 : 3;
    return 4;
  };
  return cities.map(c => [c, rank(c)] as const).filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).slice(0, limit).map(([c]) => c);
}
export function selectedCityValid(cities: CityOption[], id: string | null, name: string) {
  return cities.some(c => c.id === id && c.name === name);
}
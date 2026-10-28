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
export function searchOnwayCities(cities: CityOption[], query: string): CityOption[] {
  const q = key(query);
  return cities.filter(c => !q || [c.name, ...c.aliases].some(s => key(s).includes(q)))
    .sort((a, b) => Number(key(b.name) === q) - Number(key(a.name) === q)).slice(0, 30);
}
export function selectedCityValid(cities: CityOption[], id: string | null, name: string) {
  return cities.some(c => c.id === id && c.name === name);
}
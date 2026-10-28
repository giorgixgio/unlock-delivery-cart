import { supabase } from "@/integrations/supabase/client";
import { transliterate } from "./addressPredictor";
export interface CityOption { id: string; name: string; aliases: string[] }
const key = (s: string) => transliterate(s.trim().toLowerCase()).replace(/\s+/g, " ");
let cached: Promise<CityOption[]> | null = null;
export function loadOnwayCities(refresh = false): Promise<CityOption[]> {
  if (refresh) cached = null;
  if (!cached) cached = (async () => {
    const [{ data, error }, { data: aliases }] = await Promise.all([
      supabase.from("onway_regions").select("id,name").eq("active", true).order("name").limit(1000),
      supabase.from("onway_region_aliases").select("alias,region_id").limit(1000),
    ]);
    if (error) { cached = null; throw error; }
    return (data || []).map(r => ({ ...r, aliases: (aliases || []).filter(a => a.region_id === r.id).map(a => a.alias) }));
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
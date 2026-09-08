// City validation / auto-fix pipeline.
// Shared by the City QA admin page and the courier export pre-flight step.
// Purely additive: never used by checkout / storefront / order creation.

import { supabase } from "@/integrations/supabase/client";

export type CityStatus = "valid" | "auto_fix" | "needs_review" | "unresolvable";

export interface CityCandidate {
  city: string;
  zoneId: number | null;
  score: number; // lower = better (edit distance)
}

export interface CityResult {
  input: string;
  cleaned: string;
  status: CityStatus;
  /** Proposed canonical city (auto_fix) or best candidate (needs_review). */
  city: string | null;
  zoneId: number | null;
  /** Human readable explanation of what the pipeline did. */
  reason: string;
  /** Text that was split out of the city field (street / recipient info). */
  leftover: string | null;
  candidates: CityCandidate[];
}

export interface CityRef {
  zones: { city: string; zoneId: number | null }[];
  aliases: { alias: string; city: string; zoneId: number | null }[];
}

/** Regions / districts that can never be resolved to a single city. */
export const REGION_NAMES = [
  "აჭარა", "კახეთი", "იმერეთი", "გურია", "სამეგრელო", "რაჭა-ლეჩხუმი",
  "რაჭა", "ლეჩხუმი", "სვანეთი", "ქართლი", "ქვემო ქართლი", "შიდა ქართლი",
  "მცხეთა-მთიანეთი", "სამცხე-ჯავახეთი", "რეგიონი", "აფხაზეთი",
];

export function cleanCity(raw: string): string {
  let s = (raw || "").normalize("NFC").trim();
  s = s.replace(/\s+/g, " ");
  // leading city markers
  s = s.replace(/^(ქ\s*\.\s*|ქ\s+|ქალაქი\s+|გ\s*\.\s*)/i, "");
  // trailing punctuation
  s = s.replace(/[.,;:\-–—/\\]+$/g, "");
  return s.trim();
}

const norm = (s: string) => cleanCity(s).toLowerCase();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

/** Loads canonical cities + aliases once per run. */
export async function loadCityRef(): Promise<CityRef> {
  const [zonesRes, aliasRes] = await Promise.all([
    (supabase.from("courier_zone_codes") as any).select("city_name, zone_id"),
    (supabase.from("city_aliases") as any).select("alias_normalized, canonical_city, zone_id"),
  ]);
  const zones = (zonesRes.data || [])
    .map((z: any) => ({ city: String(z.city_name || "").trim(), zoneId: z.zone_id ?? null }))
    .filter((z: any) => z.city);
  const aliases = (aliasRes.data || [])
    .map((a: any) => ({
      alias: String(a.alias_normalized || "").trim().toLowerCase(),
      city: String(a.canonical_city || "").trim(),
      zoneId: a.zone_id ?? null,
    }))
    .filter((a: any) => a.alias && a.city);
  return { zones, aliases };
}

function zoneFor(ref: CityRef, city: string): number | null {
  const key = norm(city);
  const z = ref.zones.find((x) => norm(x.city) === key);
  return z ? z.zoneId : null;
}

function isRegion(cleaned: string): boolean {
  const n = cleaned.toLowerCase();
  if (REGION_NAMES.some((r) => r.toLowerCase() === n)) return true;
  // "მცხეთის რაიონი", "ქობულეთის რაიონი" — district-only strings
  return /^\S+\s*რაიონი$/.test(cleaned) || /^რეგიონ/i.test(cleaned);
}

/**
 * Runs the full validation pipeline for a single city string.
 */
export function classifyCity(input: string, ref: CityRef): CityResult {
  const cleaned = cleanCity(input);
  const base: CityResult = {
    input: input || "",
    cleaned,
    status: "unresolvable",
    city: null,
    zoneId: null,
    reason: "",
    leftover: null,
    candidates: [],
  };

  if (!cleaned) return { ...base, reason: "Empty city" };

  const n = cleaned.toLowerCase();

  // (b) exact canonical match — always short-circuits before any fuzzy logic
  const exact = ref.zones.find((z) => norm(z.city) === n);
  if (exact) {
    return { ...base, status: "valid", city: exact.city, zoneId: exact.zoneId, reason: "Exact match in courier zone list" };
  }

  // (c) alias match
  const alias = ref.aliases.find((a) => a.alias === n);
  if (alias) {
    return {
      ...base,
      status: "auto_fix",
      city: alias.city,
      zoneId: alias.zoneId ?? zoneFor(ref, alias.city),
      reason: "Known alias / transliteration",
    };
  }

  // (d) long / multi-word strings: extract an embedded city
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length > 1 || cleaned.length > 15) {
    for (let size = Math.min(3, words.length); size >= 1; size--) {
      for (let i = 0; i + size <= words.length; i++) {
        const phrase = words.slice(i, i + size).join(" ");
        const key = norm(phrase);
        if (!key) continue;
        const hitZone = ref.zones.find((z) => norm(z.city) === key);
        const hitAlias = hitZone ? null : ref.aliases.find((a) => a.alias === key);
        if (hitZone || hitAlias) {
          const city = hitZone ? hitZone.city : hitAlias!.city;
          const leftover = [...words.slice(0, i), ...words.slice(i + size)].join(" ").trim();
          return {
            ...base,
            status: "auto_fix",
            city,
            zoneId: hitZone ? hitZone.zoneId : (hitAlias!.zoneId ?? zoneFor(ref, city)),
            reason: leftover ? "City extracted from address text" : "City found inside text",
            leftover: leftover || null,
          };
        }
      }
    }
  }

  // (f) region / district names are never auto-fixable
  if (isRegion(cleaned)) {
    return { ...base, reason: "Region or district name — needs a real city" };
  }

  // (e) fuzzy match against zones + aliases
  const pool: CityCandidate[] = [];
  const seen = new Set<string>();
  const consider = (city: string, zoneId: number | null, target: string) => {
    const d = levenshtein(n, target);
    const k = norm(city);
    const existing = pool.find((p) => norm(p.city) === k);
    if (existing) {
      if (d < existing.score) existing.score = d;
      return;
    }
    if (seen.has(k)) return;
    seen.add(k);
    pool.push({ city, zoneId, score: d });
  };
  for (const z of ref.zones) consider(z.city, z.zoneId, norm(z.city));
  for (const a of ref.aliases) consider(a.city, a.zoneId ?? zoneFor(ref, a.city), a.alias);

  pool.sort((x, y) => x.score - y.score);
  const top = pool.slice(0, 3);
  const best = top[0];
  const runnerUp = top[1];

  const maxDist = cleaned.length <= 4 ? 1 : 2;
  if (best && best.score <= maxDist) {
    const clearWinner = !runnerUp || runnerUp.score >= best.score * 2 || runnerUp.score - best.score >= 2;
    if (clearWinner) {
      return {
        ...base,
        status: "auto_fix",
        city: best.city,
        zoneId: best.zoneId ?? zoneFor(ref, best.city),
        reason: `Close spelling match (distance ${best.score})`,
        candidates: top,
      };
    }
    return {
      ...base,
      status: "needs_review",
      city: best.city,
      zoneId: best.zoneId ?? zoneFor(ref, best.city),
      reason: "Several similar cities — pick one",
      candidates: top,
    };
  }

  if (best && best.score <= 4) {
    return {
      ...base,
      status: "needs_review",
      city: best.city,
      zoneId: best.zoneId ?? zoneFor(ref, best.city),
      reason: "No confident match — review suggestions",
      candidates: top,
    };
  }

  return { ...base, reason: "Unrecognised city — manual entry needed", candidates: top };
}

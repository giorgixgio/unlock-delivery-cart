// Client-side Latin→Georgian transliteration + fuzzy matching for address prediction

// ===== TRANSLITERATION MAP =====
const LATIN_TO_GEORGIAN: Record<string, string> = {
  a: "ა", b: "ბ", g: "გ", d: "დ", e: "ე", v: "ვ", z: "ზ",
  t: "თ", i: "ი", k: "კ", l: "ლ", m: "მ", n: "ნ", o: "ო",
  p: "პ", r: "რ", s: "ს", u: "უ", f: "ფ", q: "ქ", y: "ყ",
  sh: "შ", ch: "ჩ", ts: "ც", dz: "ძ", w: "წ", kh: "ხ",
  j: "ჯ", h: "ჰ", gh: "ღ", zh: "ჟ",
  // Common phonetic mappings
  c: "ქ", x: "ხ",
};

// Multi-char digraphs sorted by length (match longest first)
const DIGRAPHS = ["sh", "ch", "ts", "dz", "kh", "gh", "zh"];

/** Transliterate Latin text to Georgian */
export function transliterate(input: string): string {
  if (!input) return "";
  let result = "";
  let i = 0;
  const lower = input.toLowerCase();

  while (i < lower.length) {
    // Try digraph first
    let matched = false;
    for (const dg of DIGRAPHS) {
      if (lower.substring(i, i + dg.length) === dg) {
        result += LATIN_TO_GEORGIAN[dg] || dg;
        i += dg.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const char = lower[i];
      if (LATIN_TO_GEORGIAN[char]) {
        result += LATIN_TO_GEORGIAN[char];
      } else {
        result += input[i]; // Keep original (spaces, numbers, Georgian chars)
      }
      i++;
    }
  }
  return result;
}

/** Check if string contains Latin characters */
export function hasLatin(str: string): boolean {
  return /[a-zA-Z]/.test(str);
}

/** Normalize string for comparison: lowercase, trim, collapse spaces */
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Simple fuzzy similarity score between two strings (0-1) */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // Prefix match gets high score
  if (nb.startsWith(na) || na.startsWith(nb)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return 0.7 + 0.3 * (shorter / longer);
  }

  // Contains match
  if (nb.includes(na)) {
    return 0.6 + 0.2 * (na.length / nb.length);
  }

  // Levenshtein-based for typos (only for short strings to keep fast)
  if (na.length <= 20 && nb.length <= 20) {
    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    const score = 1 - dist / maxLen;
    return Math.max(0, score);
  }

  return 0;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface Suggestion {
  text: string;
  confidence: number;
  source: "onway" | "history";
  region?: string;
  label?: string; // e.g. "Suggested"
}

import { getOnwayCities, getOnwayAddressLocations, type OnwayLocation } from "./onwayDataset";

/** Get city suggestions for an input string */
export function getCitySuggestions(
  input: string,
  historicalCities: string[] = []
): Suggestion[] {
  if (!input || input.length < 1) return [];

  const query = input.trim();
  // If Latin, also try Georgian transliteration
  const queries = [query];
  if (hasLatin(query)) {
    queries.push(transliterate(query));
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  // Match against Onway dataset
  const cities = getOnwayCities();
  for (const loc of cities) {
    const bestScore = Math.max(
      ...queries.map(q => {
        const nameScore = similarity(q, loc.name);
        const latinScore = loc.latin ? similarity(q.toLowerCase(), loc.latin) : 0;
        return Math.max(nameScore, latinScore);
      })
    );

    // Boost popular cities slightly
    const boosted = loc.popular ? Math.min(1, bestScore + 0.05) : bestScore;

    if (boosted >= 0.4 && !seen.has(loc.name)) {
      seen.add(loc.name);
      suggestions.push({
        text: loc.name,
        confidence: boosted,
        source: "onway",
        region: loc.region,
      });
    }
  }

  // Match against historical cities
  for (const city of historicalCities) {
    if (seen.has(city)) continue;
    const bestScore = Math.max(
      ...queries.map(q => similarity(q, city))
    );
    if (bestScore >= 0.4) {
      seen.add(city);
      suggestions.push({
        text: city,
        confidence: bestScore * 0.95, // Slightly lower weight vs dataset
        source: "history",
      });
    }
  }

  // Sort by confidence DESC
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Filter by minimum display threshold and limit
  return suggestions
    .filter(s => s.confidence >= 0.6)
    .slice(0, 6);
}

/** Get address/district suggestions for an input string */
export function getAddressSuggestions(
  input: string,
  city: string,
  historicalAddresses: string[] = []
): Suggestion[] {
  if (!input || input.length < 2) return [];

  const query = input.trim();
  const queries = [query];
  if (hasLatin(query)) {
    queries.push(transliterate(query));
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  // Match against Tbilisi districts if city is Tbilisi
  const isTbilisi = normalize(city) === "თბილისი";
  if (isTbilisi) {
    const districts = getOnwayAddressLocations();
    for (const loc of districts) {
      const bestScore = Math.max(
        ...queries.map(q => {
          const nameScore = similarity(q, loc.name);
          const latinScore = loc.latin ? similarity(q.toLowerCase(), loc.latin) : 0;
          return Math.max(nameScore, latinScore);
        })
      );
      if (bestScore >= 0.4 && !seen.has(loc.name)) {
        seen.add(loc.name);
        suggestions.push({
          text: loc.name,
          confidence: bestScore,
          source: "onway",
        });
      }
    }
  }

  // Match against historical addresses
  for (const addr of historicalAddresses) {
    if (seen.has(addr)) continue;
    const bestScore = Math.max(
      ...queries.map(q => similarity(q, addr))
    );
    if (bestScore >= 0.4) {
      seen.add(addr);
      suggestions.push({
        text: addr,
        confidence: bestScore * 0.9,
        source: "history",
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions
    .filter(s => s.confidence >= 0.6)
    .slice(0, 5);
}

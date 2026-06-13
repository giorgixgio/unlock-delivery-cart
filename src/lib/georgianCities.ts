// Known valid Georgian city names for typo detection
export const KNOWN_GEORGIAN_CITIES = [
  "თბილისი", "ბათუმი", "ქუთაისი", "რუსთავი", "გორი", "ზუგდიდი", "ფოთი",
  "თელავი", "ოზურგეთი", "მარნეული", "ქობულეთი", "ხაშური", "სამტრედია",
  "სენაკი", "ახალციხე", "ბორჯომი", "ზესტაფონი", "ჭიათურა", "საჩხერე",
  "ლაგოდეხი", "ყვარელი", "გურჯაანი", "სიღნაღი", "მცხეთა", "დუშეთი",
  "კასპი", "ბოლნისი", "გარდაბანი", "თიანეთი", "ამბროლაური", "ონი",
  "ცაგერი", "ლენტეხი", "მესტია", "ხონი", "წყალტუბო", "ტყიბული",
  "ლანჩხუთი", "ჩოხატაური", "ახალქალაქი", "ნინოწმინდა", "წალკა",
  "დედოფლისწყარო", "ხობი", "აბაშა", "მარტვილი", "წალენჯიხა", "ჩხოროწყუ",
  "ადიგენი", "ასპინძა", "თერჯოლა", "ბაღდათი", "ვანი", "ხარაგაული",
  "საგარეჯო", "კარალეთი", "დმანისი", "თეთრიწყარო", "სურამი",
];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
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

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const KNOWN_SET = new Set(KNOWN_GEORGIAN_CITIES.map(normalize));

/**
 * Returns a suggested city if the input looks like a typo of a known city.
 * Returns null if the input is exact match OR no good suggestion.
 * Conservative: requires distance 1-2 (depending on length) AND a clear winner.
 */
export function suggestCity(input: string): string | null {
  const n = normalize(input);
  if (!n) return null;
  if (KNOWN_SET.has(n)) return null; // already valid

  let best: { city: string; dist: number } | null = null;
  let secondBest: number = Infinity;

  for (const city of KNOWN_GEORGIAN_CITIES) {
    const d = levenshtein(n, normalize(city));
    if (!best || d < best.dist) {
      secondBest = best?.dist ?? Infinity;
      best = { city, dist: d };
    } else if (d < secondBest) {
      secondBest = d;
    }
  }

  if (!best) return null;

  // Conservative thresholds based on input length
  const len = n.length;
  let maxDist: number;
  if (len <= 4) maxDist = 1;
  else if (len <= 8) maxDist = 2;
  else maxDist = 2;

  if (best.dist === 0) return null;
  if (best.dist > maxDist) return null;
  // Require some separation from the runner-up to avoid ambiguity
  if (secondBest !== Infinity && secondBest - best.dist < 1 && best.dist > 1) return null;

  return best.city;
}

export function isKnownCity(input: string): boolean {
  return KNOWN_SET.has(normalize(input));
}

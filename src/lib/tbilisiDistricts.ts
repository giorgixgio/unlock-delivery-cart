// Tbilisi district helpers — the district is stored INSIDE address_line1
// as a prefix ("ვაკე, ჭავჭავაძის 12"). No schema change required.

export const TBILISI_DISTRICTS = [
  "ვაკე",
  "საბურთალო",
  "მთაწმინდა",
  "ვერა",
  "ჩუღურეთი",
  "დიდუბე",
  "ნაძალადევი",
  "გლდანი",
  "მუხიანი",
  "თემქა",
  "ავლაბარი",
  "ისანი",
  "სამგორი",
  "ვარკეთილი",
  "ლილო",
  "კრწანისი",
  "ორთაჭალა",
  "დიღომი",
  "დიდი დიღომი",
  "ვაშლიჯვარი",
  "ნუცუბიძე",
  "დიღმის მასივი",
  "ფონიჭალა",
  "დიდი ლილო",
  "წყნეთი",
  "დიდგორი",
] as const;

const LATIN_ALIASES: Record<string, string> = {
  vake: "ვაკე",
  saburtalo: "საბურთალო",
  mtatsminda: "მთაწმინდა",
  vera: "ვერა",
  chugureti: "ჩუღურეთი",
  didube: "დიდუბე",
  nadzaladevi: "ნაძალადევი",
  gldani: "გლდანი",
  mukhiani: "მუხიანი",
  temka: "თემქა",
  avlabari: "ავლაბარი",
  isani: "ისანი",
  samgori: "სამგორი",
  varketili: "ვარკეთილი",
  lilo: "ლილო",
  krtsanisi: "კრწანისი",
  ortachala: "ორთაჭალა",
  dighomi: "დიღომი",
  vashlijvari: "ვაშლიჯვარი",
  nutsubidze: "ნუცუბიძე",
  ponichala: "ფონიჭალა",
};

/** True when the order's city is Tbilisi (Georgian or Latin spelling). */
export function isTbilisiCity(city: string | null | undefined): boolean {
  const c = (city || "").trim().toLowerCase();
  return c === "თბილისი" || c === "tbilisi" || c === "tbilisi city";
}

function canonical(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const geo = TBILISI_DISTRICTS.find((d) => d.toLowerCase() === v);
  if (geo) return geo;
  if (LATIN_ALIASES[v]) return LATIN_ALIASES[v];
  return null;
}

/**
 * Split an address into { district, rest }.
 * Only splits when the address starts with a known district followed by a separator.
 */
export function splitDistrict(address: string | null | undefined): { district: string; rest: string } {
  const addr = (address || "").trim();
  if (!addr) return { district: "", rest: "" };

  const m = addr.match(/^([^,\-–—]{2,25})\s*[,\-–—]\s*(.+)$/);
  if (m) {
    const known = canonical(m[1]);
    if (known) return { district: known, rest: m[2].trim() };
  }
  return { district: "", rest: addr };
}

/** Compose "District, rest of address". Safe if district is empty. */
export function composeAddress(district: string, rest: string): string {
  const d = (district || "").trim();
  const r = (rest || "").trim();
  if (!d) return r;
  if (!r) return d;
  return `${d}, ${r}`;
}

/** Whether a Tbilisi address already carries a district prefix. */
export function hasDistrict(address: string | null | undefined): boolean {
  return splitDistrict(address).district !== "";
}

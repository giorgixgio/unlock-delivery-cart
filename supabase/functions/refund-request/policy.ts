// Pure rules for the refund-link flow (shared with tests).
/** 24 -> "24₾", 24.5 -> "24.50₾". */
export function formatGel(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0₾";
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + "₾";
}

// Names the store, the order and the sum, and asks only for the account number:
// a bare "send us your bank details" link reads like a scam SMS.
export const refundText = (link: string, orderNumber: string, amountGel: number, storeName: string) =>
  `${storeName}: შეკვეთაზე #${orderNumber} ${formatGel(amountGel)} უკან დაბრუნება დაწყებულია. ` +
  `მოგვწერეთ სახელი და ბანკის ანგარიშის ნომერი (IBAN) აქ: ${link} 24-72 საათში ჩაგერიცხებათ.`;

/** Georgian IBAN: GE + 2 check digits + 2-letter bank code + 16 digits (22 chars), mod-97 valid. */
export function normalizeIban(input: string): string | null {
  const s = String(input || "").replace(/\s+/g, "").toUpperCase();
  if (!/^GE\d{2}[A-Z]{2}\d{16}$/.test(s)) return null;
  const moved = s.slice(4) + s.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? s : null;
}

export function newToken(len = 10): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

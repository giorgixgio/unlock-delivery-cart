/** Shared Georgian mobile phone validation used by every COD checkout entry
 *  point (individual product landings + the 5-for-39 bundle landing). */

export const cleanPhoneInput = (raw: string): string => {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("995")) d = d.slice(3);
  while (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 9);
};

export const JUNK_PATTERNS = new Set([
  "555555555", "500000000", "512345678", "555123456",
  "123456789", "111111111", "000000000",
]);

export const isValidGeorgianMobile = (digits: string): boolean => {
  if (digits.length !== 9) return false;
  if (digits[0] !== "5") return false;
  if (/^(\d)\1{8}$/.test(digits)) return false;
  if (JUNK_PATTERNS.has(digits)) return false;
  return true;
};

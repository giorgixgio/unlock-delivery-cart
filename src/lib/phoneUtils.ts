/**
 * Normalize a Georgian phone number for identity matching.
 * Strips whitespace, dashes, parens, dots.
 * Normalizes +995 prefix to canonical form.
 * Returns a clean string like "995591234567" or the raw digits if unparseable.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Strip everything except digits and leading +
  let digits = raw.replace(/[\s\-().]/g, "");

  // Handle +995 prefix
  if (digits.startsWith("+995")) {
    digits = "995" + digits.slice(4);
  } else if (digits.startsWith("00995")) {
    digits = "995" + digits.slice(5);
  } else if (digits.startsWith("995") && digits.length >= 12) {
    // already has country code
  } else if (digits.startsWith("+")) {
    // Non-Georgian international, just strip +
    digits = digits.replace(/^\+/, "");
  } else if (digits.startsWith("5") && digits.length === 9) {
    // Georgian mobile without country code
    digits = "995" + digits;
  } else if (digits.startsWith("05") && digits.length === 10) {
    // Sometimes written as 05XX...
    digits = "995" + digits.slice(1);
  }

  return digits;
}

import { isTbilisiCity } from "@/lib/tbilisiDistricts";

export type ConfirmAddressField = "city" | "district" | "address";
export type ConfirmAddressResult =
  | { ok: true }
  | { ok: false; field: ConfirmAddressField; message: string };

export const MIN_CONFIRM_ADDRESS_LENGTH = 3;

/**
 * Operator confirm rule (quick-review pop-up + Call Queue only):
 * city required, street/village part ≥ 3 chars, district required for Tbilisi.
 * `address` is the street part WITHOUT the district prefix.
 */
export function validateConfirmAddress(city: string, district: string, address: string): ConfirmAddressResult {
  const c = (city || "").trim();
  if (!c) return { ok: false, field: "city", message: "ქალაქი / რეგიონი არ არის მითითებული" };
  if (isTbilisiCity(c) && !(district || "").trim()) {
    return { ok: false, field: "district", message: "თბილისის შეკვეთისთვის რაიონი სავალდებულოა (მაგ: ვაკე)" };
  }
  if ((address || "").trim().length < MIN_CONFIRM_ADDRESS_LENGTH) {
    return { ok: false, field: "address", message: "მისამართი (ქუჩა / სოფელი) მინიმუმ 3 სიმბოლო" };
  }
  return { ok: true };
}

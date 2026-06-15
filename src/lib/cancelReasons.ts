/** Cancellation reasons (internal value + Georgian label). */

export type CancelReason =
  | "no_answer_after_attempts"
  | "customer_refused"
  | "price_objection"
  | "delivery_issue"
  | "wrong_number"
  | "duplicate_order"
  | "changed_mind"
  | "other";

export interface CancelReasonDef {
  value: CancelReason;
  label: string;
  /** Only available once max no-answer attempts reached */
  requiresMaxAttempts?: boolean;
}

export const CANCEL_REASONS: CancelReasonDef[] = [
  { value: "no_answer_after_attempts", label: "არ პასუხობს რამდენიმე ცდის შემდეგ", requiresMaxAttempts: true },
  { value: "customer_refused", label: "კლიენტმა უარი თქვა" },
  { value: "price_objection", label: "ფასი არ მოეწონა" },
  { value: "delivery_issue", label: "მიწოდება არ აწყობს" },
  { value: "wrong_number", label: "არასწორი ნომერი" },
  { value: "duplicate_order", label: "დუბლიკატი შეკვეთა" },
  { value: "changed_mind", label: "პროდუქტი აღარ უნდა" },
  { value: "other", label: "სხვა მიზეზი" },
];

export const CANCEL_REASON_LABEL: Record<string, string> = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.label]),
);

export const DEFAULT_MAX_CALL_ATTEMPTS = 3;

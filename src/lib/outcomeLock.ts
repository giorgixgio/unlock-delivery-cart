/** While the master switch is on, every non-admin caller (managers and plain operators) sets outcomes only in the Call Queue. */
export const OUTCOME_LOCK_REASON = "Calls are made from the Call Queue";

export function outcomeLockFor(
  role: string | null | undefined,
  _email: string | null | undefined,
  settings: { operators_use_queue?: boolean; manager_emails?: string[] } | null | undefined,
): { locked: boolean; reason: string | null } {
  if (!settings?.operators_use_queue || !role || role === "admin") return { locked: false, reason: null };
  return { locked: true, reason: OUTCOME_LOCK_REASON };
}

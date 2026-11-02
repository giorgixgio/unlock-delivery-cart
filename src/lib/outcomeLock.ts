/** Managers call only from the Call Queue while the master switch is on; admins are never locked. */
export const OUTCOME_LOCK_REASON = "Calls are made from the Call Queue";

export function outcomeLockFor(
  role: string | null | undefined,
  email: string | null | undefined,
  settings: { operators_use_queue?: boolean; manager_emails?: string[] } | null | undefined,
): { locked: boolean; reason: string | null } {
  if (!settings?.operators_use_queue || role === "admin") return { locked: false, reason: null };
  const e = (email || "").toLowerCase();
  const isManager = !!e && (settings.manager_emails || []).some((m) => m.toLowerCase() === e);
  return isManager ? { locked: true, reason: OUTCOME_LOCK_REASON } : { locked: false, reason: null };
}

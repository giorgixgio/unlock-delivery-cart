// A billing balance cannot plausibly jump by $167 in five minutes on this account.
// Allow $50 headroom plus $100/hour since the last accepted observation.
export function acceptBillingBalance(due: number, previous: number | null, checkedAt: string | null, now: number): boolean {
  if (!Number.isFinite(due) || due < 0) return false;
  if (previous === null || !checkedAt) return true;
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked)) return true;
  const hours = Math.max(0, now - checked) / 3_600_000;
  return due <= previous + 50 + 100 * hours;
}

export function isPaymentDrop(due: number, previous: number | null): boolean {
  return previous !== null && previous - due >= 50;
}
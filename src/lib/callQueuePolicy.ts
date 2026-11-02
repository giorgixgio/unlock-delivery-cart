/**
 * Call Queue pure rules. Mirrored in SQL:
 *  - computeRetry  ↔ public.call_queue_compute_retry
 *  - queueTier     ↔ public.call_queue_tier
 * Keep both in sync.
 */
const TBILISI_OFFSET_MS = 4 * 3600 * 1000; // Georgia has no DST

export interface QueuePolicySettings {
  retryGapMinutes: number;
  maxAttempts: number;
  workStart: string; // "HH:MM"
  workEnd: string;   // "HH:MM"
  nightFrom?: string;
  nightTo?: string;
  nightFirstCallAfter?: string;
  nightRetrySlot?: string;
}

export const DEFAULT_QUEUE_SETTINGS: QueuePolicySettings = {
  retryGapMinutes: 120, maxAttempts: 3, workStart: "10:00", workEnd: "21:00",
  nightFrom: "00:00", nightTo: "07:00", nightFirstCallAfter: "12:00", nightRetrySlot: "18:00",
};

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
/** Tbilisi day number + minute-of-day for an instant. */
function local(d: Date) {
  const t = d.getTime() + TBILISI_OFFSET_MS;
  return { day: Math.floor(t / 86400000), minute: Math.floor((t % 86400000) / 60000), hour: new Date(t).getUTCHours() };
}
const atLocal = (day: number, minute: number) => new Date(day * 86400000 + minute * 60000 - TBILISI_OFFSET_MS);

/** Order created inside [nightFrom, nightTo) Tbilisi time (window may wrap past midnight). ↔ call_queue_is_night */
export function isNightLead(createdAt: Date, s: QueuePolicySettings = DEFAULT_QUEUE_SETTINGS): boolean {
  const from = hm(s.nightFrom ?? "00:00"), to = hm(s.nightTo ?? "07:00"), m = local(createdAt).minute;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** When a fresh night lead becomes eligible, or null if it is not a night lead. ↔ call_queue_night_held */
export function nightReleaseAt(createdAt: Date, s: QueuePolicySettings = DEFAULT_QUEUE_SETTINGS): Date | null {
  if (!isNightLead(createdAt, s)) return null;
  const from = hm(s.nightFrom ?? "00:00"), to = hm(s.nightTo ?? "07:00"), c = local(createdAt);
  const day = from > to && c.minute >= from ? c.day + 1 : c.day;
  return atLocal(day, hm(s.nightFirstCallAfter ?? "12:00"));
}

export type RetryDecision = { action: "retry"; at: Date } | { action: "cancel" };

/**
 * attemptCount = no-answer attempts INCLUDING the one just recorded.
 * firstAttemptAt = time of the first no-answer attempt (decides morning/afternoon).
 */
export function computeRetry(
  attemptCount: number, firstAttemptAt: Date, now: Date,
  s: QueuePolicySettings = DEFAULT_QUEUE_SETTINGS, extraAttempts = 0, createdAt?: Date,
): RetryDecision {
  if (attemptCount >= s.maxAttempts + extraAttempts) return { action: "cancel" };
  const n = local(now);
  // Night lead, first no-answer: retry at nightRetrySlot today if it is still ahead.
  if (attemptCount <= 1 && createdAt && isNightLead(createdAt, s)) {
    const slot = atLocal(n.day, hm(s.nightRetrySlot ?? "18:00"));
    if (slot.getTime() > now.getTime()) return { action: "retry", at: slot };
  }
  const otherHalf = local(firstAttemptAt).hour < 14 ? 15 * 60 : 11 * 60;
  if (attemptCount <= 1) {
    const cand = new Date(now.getTime() + s.retryGapMinutes * 60000);
    const c = local(cand);
    if (c.day > n.day || c.minute > hm(s.workEnd)) return { action: "retry", at: atLocal(n.day + 1, otherHalf) };
    if (c.minute < hm(s.workStart)) return { action: "retry", at: atLocal(c.day, hm(s.workStart)) };
    return { action: "retry", at: cand };
  }
  return { action: "retry", at: atLocal(n.day + 1, otherHalf) };
}

export interface QueueOrderLike {
  id: string;
  created_at: string;
  status: string;
  is_return?: boolean | null;
  auto_confirmed?: boolean | null;
  is_confirmed?: boolean | null;
  is_fulfilled?: boolean | null;
  tags?: string[] | null;
  call_outcome?: string | null;
  call_attempt_count?: number | null;
  next_call_after?: string | null;
  last_call_attempt_at?: string | null;
  queue_locked_by?: string | null;
  queue_locked_until?: string | null;
  queue_last_touched_by?: string | null;
}

/** 1 = my sticky callback, 2 = fresh, 3 = other callback, 4 = no-answer retry; null = not eligible now. */
export function queueTier(
  o: QueueOrderLike, caller: string, now: Date, gapMinutes = DEFAULT_QUEUE_SETTINGS.retryGapMinutes,
  s: QueuePolicySettings = DEFAULT_QUEUE_SETTINGS,
): number | null {
  const t = now.getTime();
  const ts = (v?: string | null) => (v ? new Date(v).getTime() : null);
  if (!["new", "on_hold", "pending_bump"].includes(o.status)) return null;
  if (o.is_return || o.auto_confirmed || o.is_confirmed || o.is_fulfilled) return null;
  if ((o.tags ?? []).includes("test_sku")) return null;
  const next = ts(o.next_call_after);
  if (next !== null && next > t) return null;
  const lockUntil = ts(o.queue_locked_until);
  const me = caller.toLowerCase();
  if (lockUntil !== null && lockUntil > t && (o.queue_locked_by ?? "").toLowerCase() !== me) return null;
  if (Number(o.call_attempt_count || 0) === 0 && o.call_outcome !== "callback") {
    const rel = nightReleaseAt(new Date(o.created_at), s);
    if (rel && t < rel.getTime()) return null;
  }
  if (o.call_outcome === "callback" && (o.queue_last_touched_by ?? "").toLowerCase() === me) return 1;
  if (Number(o.call_attempt_count || 0) === 0 && o.call_outcome !== "callback") return 2;
  if (o.call_outcome === "callback") {
    return !o.queue_last_touched_by || next === null || next <= t - 30 * 60000 ? 3 : null;
  }
  const last = ts(o.last_call_attempt_at);
  if (next === null && last !== null && last > t - gapMinutes * 60000) return null;
  return 4;
}

/** Same ordering as call_queue_next. */
export function sortQueue<T extends QueueOrderLike>(orders: T[], caller: string, now: Date): T[] {
  return orders
    .map((o) => ({ o, tier: queueTier(o, caller, now) }))
    .filter((x): x is { o: T; tier: number } => x.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier === 2) return a.o.created_at.localeCompare(b.o.created_at);
      const an = a.o.next_call_after ? new Date(a.o.next_call_after).getTime() : -Infinity;
      const bn = b.o.next_call_after ? new Date(b.o.next_call_after).getTime() : -Infinity;
      if (an !== bn) return an - bn;
      return a.o.created_at.localeCompare(b.o.created_at);
    })
    .map((x) => x.o);
}

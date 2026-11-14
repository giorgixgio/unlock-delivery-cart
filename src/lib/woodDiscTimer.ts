/** Presentation-only repeating clock; product pricing remains catalog-driven. */
export const WOOD_DISC_TIMER_SECONDS = 15 * 60;
export function woodDiscTimerSeconds(startedAt: number, now: number): number {
 const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
 return WOOD_DISC_TIMER_SECONDS - (elapsed % WOOD_DISC_TIMER_SECONDS);
}
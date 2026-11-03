// Pure rule: the Onway webhook is "silent" when no push arrived for > thresholdHours during
// Tbilisi working hours (Mon–Sat 10:00–20:00) while open API shipments exist.
export const WEBHOOK_SILENT_HOURS = 3;
export function tbilisiParts(now: Date) {
  const t = new Date(now.getTime() + 4 * 3600_000); // Tbilisi is UTC+4, no DST
  return { day: t.getUTCDay(), hour: t.getUTCHours() };
}
export function isWorkingWindow(now: Date): boolean {
  const { day, hour } = tbilisiParts(now);
  return day !== 0 && hour >= 10 && hour < 20;
}
export function isWebhookSilent(now: Date, lastReceivedAt: Date | null, openShipments: number, thresholdHours = WEBHOOK_SILENT_HOURS): boolean {
  if (openShipments <= 0 || !isWorkingWindow(now)) return false;
  if (!lastReceivedAt) return true;
  return now.getTime() - lastReceivedAt.getTime() > thresholdHours * 3600_000;
}

// Keep the owner's explicitly requested notification scope in one pure rule.
export function isOwnerAlertEnabled(type: string): boolean {
  return type === "billing" || type === "bulk_fulfilled" || type === "onway_api_batch";
}

export type OnwaySendResult = { ok: boolean; skipped?: boolean };
export function onwayBatchCounts(results: OnwaySendResult[]) {
  const attempted = results.filter(r => !r.skipped);
  return { attempted: attempted.length, sent: attempted.filter(r => r.ok).length,
    failed: attempted.filter(r => !r.ok).length };
}
export interface ReviewOrder {
  auto_confirmed?: boolean | null; risk_level?: string | null; normalization_confidence?: number | string | null;
  normalized_city?: string | null; normalized_address?: string | null; operator_review_status?: string | null; call_outcome_updated_by?: string | null;
  onway_sent_at?: string | null; onway_tracking?: string | null; onway_api_status?: string | null; onway_reviewed_at?: string | null;
}
export function operatorConfirmed(o: ReviewOrder) { return o.operator_review_status === "confirmed" && !!o.call_outcome_updated_by; }
export function heldReasons(o: ReviewOrder): string[] {
  if (!o.auto_confirmed || operatorConfirmed(o) || o.onway_reviewed_at) return [];
  const reasons: string[] = [];
  if (o.risk_level !== "low") reasons.push("risk_not_low");
  if (o.normalization_confidence == null || Number(o.normalization_confidence) < 0.75) reasons.push("low_normalization_confidence");
  if (!o.normalized_city?.trim() || !o.normalized_address?.trim()) reasons.push("missing_normalized_address");
  return reasons;
}
export function reviewState(o: ReviewOrder): "held" | "rejected" | "unclear" | null {
  if (o.onway_tracking || o.onway_api_status === "sent") return null;
  if (o.onway_api_status === "rejected") return "rejected";
  if (o.onway_sent_at) return "unclear";
  return heldReasons(o).length || o.onway_api_status === "held" ? "held" : null;
}
/** Unknown provider contract: only an explicit success plus tracking is accepted. */
export function classifyOnwayReply(status: number | null, raw: string, tracking: string | null): "sent" | "unclear" {
  if (!status || status < 200 || status >= 300 || !tracking) return "unclear";
  try { const j = JSON.parse(raw); if (j.error || j.errors || j.success === false || j.status === "error" || j.status === false) return "unclear"; return "sent"; } catch { return "unclear"; }
}
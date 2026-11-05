// Support tickets (customer_requests kind 'operator_flag'). Writes go only through support_ticket_* RPCs.
// Pure rules here mirror the SQL in migration 0050 (support_add_working_days / support_quiet_shift / support_enqueue_sms).
import { supabase } from "@/integrations/supabase/client";

export type IssueReason = "cant_use" | "question" | "complaint" | "problematic" | "other";
export const ISSUE_REASONS: [IssueReason, string][] = [
  ["cant_use", "ვერ იყენებს პროდუქტს"], ["question", "კითხვა"], ["complaint", "პრეტენზია"], ["problematic", "პრობლემური კლიენტი"], ["other", "სხვა"],
];
export const REASON_LABEL = Object.fromEntries(ISSUE_REASONS) as Record<string, string>;
export type Resolution = "explained" | "tutorial_sent" | "replacement" | "refund" | "unreachable" | "other";
export const RESOLUTIONS: [Resolution, string][] = [
  ["explained", "აეხსნა"], ["tutorial_sent", "ინსტრუქცია გაეგზავნა"], ["replacement", "შეცვლა"], ["refund", "თანხის დაბრუნება"], ["unreachable", "ვერ დავუკავშირდით"], ["other", "სხვა"],
];
export const OPEN_STATUSES = ["open", "in_review", "waiting_customer"];
export const STATUS_LABEL: Record<string, string> = { open: "ახალი", in_review: "განიხილება", waiting_customer: "ველოდებით კლიენტს", resolved: "მოგვარდა", done: "დასრულდა" };

const TBS_MS = 4 * 3600_000; // Tbilisi is UTC+4 all year.

/** Adds n working days (default Mon–Fri, Tbilisi), keeping the time of day. */
export function addWorkingDays(from: Date, n: number, workingDays: number[] = [1, 2, 3, 4, 5]): Date {
  if (!workingDays.length) return new Date(from.getTime() + n * 86400_000);
  let d = from.getTime();
  let left = Math.max(0, n);
  while (left > 0) {
    d += 86400_000;
    const dow = new Date(d + TBS_MS).getUTCDay() || 7; // ISO: Mon=1..Sun=7
    if (workingDays.includes(dow)) left--;
  }
  return new Date(d);
}

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
/** Moves a send time out of the quiet window (e.g. 21:00–09:00 Tbilisi) to its end. */
export function quietShift(at: Date, from = "21:00", to = "09:00"): Date {
  const local = new Date(at.getTime() + TBS_MS);
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  const qf = hm(from), qt = hm(to);
  if (qf === qt) return at;
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TBS_MS;
  const inWindow = qf > qt ? mins >= qf || mins < qt : mins >= qf && mins < qt;
  if (!inWindow) return at;
  const nextDay = qf > qt && mins >= qf ? 1 : 0;
  return new Date(dayStart + nextDay * 86400_000 + qt * 60_000);
}

/** When a ticket SMS goes out: never sooner than the min gap after the previous one, then out of quiet hours. */
export function supportSendAt(requested: Date, lastSendAt: Date | null, gapMin = 30, quiet: [string, string] = ["21:00", "09:00"]): Date {
  const gapped = lastSendAt ? new Date(Math.max(requested.getTime(), lastSendAt.getTime() + gapMin * 60_000)) : requested;
  return quietShift(gapped, quiet[0], quiet[1]);
}

export interface TicketSortable { status: string; last_customer_reply_at: string | null; staff_seen_at: string | null; sla_due_at: string | null; created_at: string }
export const hasUnreadReply = (t: TicketSortable) =>
  !!t.last_customer_reply_at && (!t.staff_seen_at || t.last_customer_reply_at > t.staff_seen_at);
export const isOverdue = (t: TicketSortable, now = new Date()) =>
  OPEN_STATUSES.includes(t.status) && !!t.sla_due_at && new Date(t.sla_due_at) < now;

/** Review list order: unread customer replies, then overdue SLA, then oldest first. */
export function sortTickets<T extends TicketSortable>(rows: T[], now = new Date()): T[] {
  const rank = (t: T) => (hasUnreadReply(t) ? 0 : isOverdue(t, now) ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
export const createSupportTicket = (orderId: string, reason: IssueReason, text: string, source: string) =>
  rpc("support_ticket_create", { p_order_id: orderId, p_reason: reason, p_text: text.trim().slice(0, 200), p_source: source }) as Promise<{ id: string; existing: boolean }>;
export const postTicketUpdate = (id: string, body: string, link: string, video: string, status: string | null, notify: boolean) =>
  rpc("support_ticket_post_update", { p_request_id: id, p_body: body, p_link: link, p_video: video, p_status: status, p_notify: notify }) as Promise<{ sms_queued: boolean }>;
export const resolveTicket = (id: string, resolution: Resolution, note: string) => rpc("support_ticket_resolve", { p_request_id: id, p_resolution: resolution, p_note: note });
export const releaseToQueue = (orderId: string) => rpc("support_ticket_release", { p_order_id: orderId });
export const assignTicket = (id: string, to: string) => rpc("support_ticket_assign", { p_request_id: id, p_to: to });
export const markTicketSeen = (id: string) => rpc("support_ticket_mark_seen", { p_request_id: id });

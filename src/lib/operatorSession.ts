/**
 * Operator order session tracker.
 *
 * Lifecycle for one active operator at a time (one modal open):
 *   startSession(orderId, operator)  ← call after order modal has fully loaded
 *   markAction(kind?)                ← call on every meaningful interaction
 *   endSession(reason, outcome?)     ← call on outcome / save / close / unmount
 *
 * Timing rules:
 *  - raw_duration_seconds      = wall-clock from start → end (no cap)
 *  - capped_duration_seconds   = min(raw, 10 min) — protects productivity stats
 *  - active_duration_seconds   = capped minus tab-hidden time beyond a 30s grace
 *  - was_abandoned             = end fired by 10-min watchdog or page unload
 *  - had_meaningful_action     = at least one markAction() during the session
 *
 * Only ONE session is active in memory at a time; switching to a new order
 * implicitly ends the previous one as `switched_order`.
 */
import { supabase } from "@/integrations/supabase/client";

const CAP_MS = 10 * 60 * 1000;          // 10 minutes
const HIDDEN_GRACE_MS = 30 * 1000;       // tab can be hidden up to 30s for free

interface ActiveSession {
  id: string;
  orderId: string;
  operator: string;
  startedAt: number;
  endedAt: number | null;
  hadAction: boolean;
  actions: number;
  activeMs: number;
  lastActiveTickAt: number;
  hiddenSinceAt: number | null;
  abandonTimer: ReturnType<typeof setTimeout> | null;
}

let current: ActiveSession | null = null;
let visibilityBound = false;

function bindGlobalListeners() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);
}

function accumulateActive(s: ActiveSession) {
  // skip if tab currently hidden — that span is counted on visibility return
  if (typeof document !== "undefined" && document.visibilityState === "hidden" && s.hiddenSinceAt) return;
  const now = Date.now();
  s.activeMs += now - s.lastActiveTickAt;
  s.lastActiveTickAt = now;
}

function onVisibilityChange() {
  if (!current || current.endedAt) return;
  if (document.visibilityState === "hidden") {
    accumulateActive(current);
    current.hiddenSinceAt = Date.now();
  } else {
    if (current.hiddenSinceAt) {
      const hiddenMs = Date.now() - current.hiddenSinceAt;
      // Hidden < 30s grace: count the whole span. Beyond 30s: count only the grace.
      current.activeMs += Math.min(hiddenMs, HIDDEN_GRACE_MS);
      current.hiddenSinceAt = null;
    }
    current.lastActiveTickAt = Date.now();
  }
}

function onBeforeUnload() {
  if (current && !current.endedAt) {
    // Fire-and-forget; browser will not wait for the await.
    void endSession("page_unload", undefined, true);
  }
}

export async function startSession(orderId: string, operator: string): Promise<void> {
  bindGlobalListeners();
  // End previous session before starting new
  if (current && !current.endedAt) {
    await endSession("switched_order");
  }
  const now = Date.now();
  try {
    const { data, error } = await supabase
      .from("operator_order_sessions" as any)
      .insert({
        order_id: orderId,
        operator,
        session_started_at: new Date(now).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      console.warn("[op-session] start insert failed", error);
      return;
    }
    current = {
      id: (data as any).id,
      orderId,
      operator,
      startedAt: now,
      endedAt: null,
      hadAction: false,
      actions: 0,
      activeMs: 0,
      lastActiveTickAt: now,
      hiddenSinceAt: typeof document !== "undefined" && document.visibilityState === "hidden" ? now : null,
      abandonTimer: setTimeout(() => {
        void endSession("abandoned", undefined, true);
      }, CAP_MS),
    };
  } catch (e) {
    console.warn("[op-session] start exception", e);
  }
}

export function markAction(_kind?: string): void {
  if (!current || current.endedAt) return;
  // first action transitions session to "handled"
  current.hadAction = true;
  current.actions += 1;
}

export async function endSession(
  reason: string,
  outcome?: string,
  abandoned = false,
): Promise<void> {
  const s = current;
  if (!s || s.endedAt) return;
  s.endedAt = Date.now();
  accumulateActive(s);
  if (s.abandonTimer) { clearTimeout(s.abandonTimer); s.abandonTimer = null; }
  current = null;

  const raw = Math.max(0, Math.round((s.endedAt - s.startedAt) / 1000));
  const capped = Math.min(raw, Math.round(CAP_MS / 1000));
  const active = Math.min(Math.max(0, Math.round(s.activeMs / 1000)), capped);

  try {
    const { error } = await supabase
      .from("operator_order_sessions" as any)
      .update({
        session_ended_at: new Date(s.endedAt).toISOString(),
        raw_duration_seconds: raw,
        capped_duration_seconds: capped,
        active_duration_seconds: active,
        was_abandoned: abandoned,
        had_meaningful_action: s.hadAction,
        end_reason: reason,
        outcome: outcome || null,
        actions_count: s.actions,
      })
      .eq("id", s.id);
    if (error) console.warn("[op-session] end update failed", error);
  } catch (e) {
    console.warn("[op-session] end exception", e);
  }
}

export function currentSessionOrderId(): string | null {
  return current?.orderId ?? null;
}

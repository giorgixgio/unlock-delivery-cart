import { supabase } from "@/integrations/supabase/client";

/** Lightweight checkout-funnel tracking. Fire-and-forget; never throws,
 *  never blocks. Each event fires at most once per session per page path.
 *  Never pass phone numbers or address text in metadata. */
export type FunnelEvent =
  | "landing_view"
  | "form_open"
  | "phone_entered"
  | "address_entered"
  | "order_submitted";

const SID_KEY = "funnel_session_id";
const SENT_KEY = "funnel_sent";

function safeSession(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function getSessionId(): string {
  const s = safeSession();
  let id = s?.getItem(SID_KEY) || "";
  if (!id) {
    id = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { s?.setItem(SID_KEY, id); } catch {}
  }
  return id;
}

export function funnelDedupeKey(event: string, path: string) {
  return `${event}|${path}`;
}

function alreadySent(key: string): boolean {
  const s = safeSession();
  try {
    const list: string[] = JSON.parse(s?.getItem(SENT_KEY) || "[]");
    if (list.includes(key)) return true;
    list.push(key);
    s?.setItem(SENT_KEY, JSON.stringify(list.slice(-200)));
  } catch {}
  return false;
}

function attribution() {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source")?.slice(0, 100) || null,
      utm_campaign: p.get("utm_campaign")?.slice(0, 150) || null,
      has_fbclid: p.has("fbclid"),
    };
  } catch { return {}; }
}

export function trackFunnel(event: FunnelEvent, metadata: Record<string, unknown> = {}) {
  try {
    const path = window.location.pathname;
    if (alreadySent(funnelDedupeKey(event, path))) return;
    const m = path.match(/^\/p\/([^/]+)/);
    const row = {
      session_id: getSessionId(),
      event_type: event,
      product_slug: m ? decodeURIComponent(m[1]).slice(0, 200) : null,
      page_path: path.slice(0, 500),
      metadata: { ...attribution(), ...metadata },
    };
    const send = () => {
      try {
        (supabase as any).from("funnel_events").insert(row).then(() => {}, () => {});
      } catch {}
    };
    setTimeout(send, 0);
  } catch {}
}

// Read-only live tracking lookup against OnWay's public orderinfo endpoint.
// Returns the same { order_info, history } shape used by onwayPayloadToShipment.

const ONWAY_HOME = "https://onway.ge/";
const ONWAY_ORDERINFO = "https://onway.ge/index.php?route=common/home/orderinfo";

export function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const m = setCookieHeader.match(/OCSESSID=([^;,\s]+)/i);
  return m ? `OCSESSID=${m[1]}` : null;
}

export function parseOrderInfoPayload(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t || !t.startsWith("{")) return null;
  try {
    const j = JSON.parse(t);
    if (!j || typeof j !== "object") return null;
    const oi = (j as any).order_info;
    if (!oi || typeof oi !== "object") return null;
    const tn = String(oi.trackingnumber ?? oi.traking ?? "").trim();
    if (!tn) return null;
    return j as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function openOnwaySession(timeoutMs = 10_000): Promise<string> {
  const r = await fetch(ONWAY_HOME, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  await r.text().catch(() => "");
  const cookie = extractSessionCookie(r.headers.get("set-cookie"));
  if (!cookie) throw new Error(`No OCSESSID cookie from onway.ge (HTTP ${r.status})`);
  return cookie;
}

export async function fetchOnwayOrderInfo(
  tracking: string,
  cookie: string,
  timeoutMs = 10_000,
): Promise<Record<string, unknown> | null> {
  const body = new URLSearchParams({ tracking, type: "1" }).toString();
  const r = await fetch(ONWAY_ORDERINFO, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": ONWAY_HOME,
      "Origin": "https://onway.ge",
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookie,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) return null;
  const raw = await r.text();
  return parseOrderInfoPayload(raw);
}
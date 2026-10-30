// Sender.ge SMS API v1 client. POST + x-www-form-urlencoded only; the API key
// never appears in URLs, logs or returned values.
const BASE = "https://sender.ge/api";
const TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [1000, 3000];

export function senderApiKey(): string | null {
  return Deno.env.get("SENDER_GE_API_KEY") || null;
}

/** 9-digit Georgian mobile (5XXXXXXXX) or null. */
export function normalizeGePhone(input: unknown): string | null {
  let d = String(input ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("995")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? d : null;
}

interface RawResult { httpStatus: number | null; json: any; text: string; networkError?: string }

async function post(path: string, fields: Record<string, string>): Promise<RawResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { httpStatus: resp.status, json, text };
  } catch (e) {
    const timeout = (e as Error).name === "AbortError";
    return { httpStatus: null, json: null, text: "", networkError: timeout ? "timeout" : "network error" };
  } finally { clearTimeout(timer); }
}

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  httpStatus: number | null;
  apiMessage: string | null;
  messageId: string | null;
  segments: number | null;
  attempts: number;
}

/** Maps a Sender.ge send reply. Pure, for tests. */
export function mapSendReply(r: RawResult): Omit<SendResult, "attempts"> {
  const message = r.networkError ?? (typeof r.json?.message === "string" ? r.json.message : (r.text || null)?.slice(0, 300) ?? null);
  const row = Array.isArray(r.json?.data) ? r.json.data[0] : null;
  if (r.httpStatus === 200 && row?.messageId) {
    return { status: "sent", httpStatus: 200, apiMessage: null, messageId: String(row.messageId), segments: Number.isFinite(Number(row.qnt)) ? Number(row.qnt) : null };
  }
  if (r.httpStatus === 403 && /subscription has been canceled/i.test(String(message))) {
    return { status: "skipped", httpStatus: 403, apiMessage: "unsubscribed", messageId: null, segments: null };
  }
  return { status: "failed", httpStatus: r.httpStatus, apiMessage: message, messageId: null, segments: null };
}

export const isRetryable = (r: RawResult) => r.httpStatus === null || r.httpStatus === 503;

/** Informational SMS (smsno=2). Retries only 503/network/timeout, max 2 times. */
export async function sendSms(apiKey: string, destination: string, content: string): Promise<SendResult> {
  let attempts = 0;
  let raw: RawResult;
  for (;;) {
    attempts++;
    raw = await post("send.php", { apikey: apiKey, smsno: "2", destination, content });
    if (!isRetryable(raw) || attempts > RETRY_DELAYS_MS.length) break;
    await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[attempts - 1]));
  }
  return { ...mapSendReply(raw), attempts };
}

export async function getBalance(apiKey: string): Promise<{ balance: number; overdraft: number } | null> {
  const r = await post("getBalance.php", { apikey: apiKey });
  const balance = Number(r.json?.data?.balance), overdraft = Number(r.json?.data?.overdraft ?? 0);
  return r.httpStatus === 200 && Number.isFinite(balance) ? { balance, overdraft: Number.isFinite(overdraft) ? overdraft : 0 } : null;
}

export type DeliveryState = "pending" | "delivered" | "undelivered";
export async function getDelivery(apiKey: string, messageId: string): Promise<{ state: DeliveryState; timestamp: string | null } | null> {
  const r = await post("callback.php", { apikey: apiKey, messageId });
  const row = Array.isArray(r.json?.data) ? r.json.data[0] : null;
  if (r.httpStatus !== 200 || !row) return null;
  const id = Number(row.statusId);
  const state: DeliveryState = id === 1 ? "delivered" : id === 2 ? "undelivered" : "pending";
  return { state, timestamp: typeof row.timestamp === "string" ? row.timestamp : null };
}

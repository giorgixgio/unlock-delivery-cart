// AI classification of free-text Georgian courier comments.
export const REASONS = ["no_answer", "refused", "wrong_address", "reschedule", "not_home", "price_or_product_complaint", "wrong_phone", "other"] as const;
export type FailReason = typeof REASONS[number];
export interface Classified { reason: FailReason; confidence: number; summary: string | null }

/** Coerces model output; unknown reason or confidence < 0.6 -> other. */
export function normalizeAiResult(raw: any): Classified {
  const reason = REASONS.includes(raw?.reason) ? raw.reason as FailReason : "other";
  const c = Number(raw?.confidence);
  const confidence = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0;
  const summary = raw?.short_en_summary ? String(raw.short_en_summary).slice(0, 200) : null;
  return { reason: confidence < 0.6 ? "other" : reason, confidence, summary };
}

export type FailAction = { sms: "delivery_failed" | "address_problem" | null; priority: boolean };
/** What a delivery_failed event does, by classified reason. */
export function actionForReason(r: FailReason): FailAction {
  switch (r) {
    case "no_answer": case "not_home": case "wrong_phone": return { sms: "delivery_failed", priority: false };
    case "refused": case "price_or_product_complaint": return { sms: null, priority: true };
    case "wrong_address": return { sms: "address_problem", priority: false };
    default: return { sms: null, priority: false }; // reschedule, other
  }
}

export async function commentHash(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim().toLowerCase()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reason", "confidence", "short_en_summary"],
  properties: {
    reason: { type: "string", enum: [...REASONS] },
    confidence: { type: "number" },
    short_en_summary: { type: "string" },
  },
};

/** Cached by comment hash; any AI failure -> other. */
export async function classifyComment(db: any, comment: string, statusName: string): Promise<Classified> {
  const hash = await commentHash(comment);
  const { data: hit } = await db.from("onway_comment_ai_cache").select("reason, confidence, summary").eq("comment_hash", hash).maybeSingle();
  if (hit) return { reason: hit.reason, confidence: hit.confidence, summary: hit.summary };
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { reason: "other", confidence: 0, summary: null };
  let out: Classified = { reason: "other", confidence: 0, summary: null };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          { role: "system", content: `Classify a Georgian courier's delivery comment into exactly one reason:
no_answer = customer didn't answer / phone off / unreachable; refused = doesn't want it / refused at door; wrong_address = wrong or incomplete address, can't find;
reschedule = asked for another day/time; not_home = not at home; price_or_product_complaint = complains about price or product; wrong_phone = wrong number; other = anything else.
Return reason, confidence 0-1 and a short English summary.` },
          { role: "user", content: `Status: ${statusName}\nComment: ${comment}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "courier_reason", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok) { console.error("classifyComment AI status", res.status); return out; }
    const j = await res.json();
    const txt = String(j.choices?.[0]?.message?.content || "").replace(/```json?\n?|```/g, "").trim();
    out = normalizeAiResult(JSON.parse(txt));
    await db.from("onway_comment_ai_cache").insert({ comment_hash: hash, reason: out.reason, confidence: out.confidence, summary: out.summary });
  } catch (e) { console.error("classifyComment failed", (e as Error).message); }
  return out;
}

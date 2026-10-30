// Records a blocked customer SMS and alerts the owner (max once per hour) when a template rendered incomplete.
import { sendTelegramMessage } from "./telegram.ts";

export async function logBlockedSms(db: any, row: { orderNumber: string; phone: string | null; type: string; content: string; reason: string }) {
  const { error } = await db.from("sms_logs").insert({
    order_number: row.orderNumber, phone: row.phone, type: row.type, sender: "sender.ge", provider: "sender.ge",
    content: row.content || null, status: "skipped", api_message: row.reason,
  });
  if (error && error.code !== "23505") console.error("logBlockedSms", error.message);
  if (row.reason !== "template_incomplete") return;
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("sms_logs").select("id", { count: "exact", head: true })
    .eq("api_message", "template_incomplete").gte("created_at", since);
  if ((count ?? 0) > 1) return; // already alerted within the hour
  const r = await sendTelegramMessage(`⚠️ SMS შეჩერდა — შაბლონი არასრულია\nშეკვეთა #${row.orderNumber}\nტიპი: ${row.type}\nშეამოწმე Admin → Settings → SMS.`);
  if (!r.ok) console.error("logBlockedSms telegram failed", r.status);
}

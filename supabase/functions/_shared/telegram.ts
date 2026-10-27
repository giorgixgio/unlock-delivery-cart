// Shared Telegram sender for Lovable Cloud edge functions.
// Routes through the Telegram connector gateway; the chat id lives in
// site_settings (key: telegram_chat_id) so alerts follow the configured owner.
import { createClient } from "npm:@supabase/supabase-js@2";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export function serviceDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function readSetting(db: ReturnType<typeof serviceDb>, key: string, fallback: string | null = null): Promise<string | null> {
  const { data } = await db.from("site_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

export async function sendTelegramMessage(content: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const chatId = await readSetting(serviceDb(), "telegram_chat_id");
  if (!chatId) return { ok: false, error: "telegram_chat_id is not set" };
  const res = await fetch(`${GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: Number(chatId), text: content }),
  });
  const body = await res.text();
  let ok = res.ok;
  try { ok = ok && JSON.parse(body).ok !== false; } catch { /* non-JSON body */ }
  if (!ok) console.error(`telegram sendMessage failed [${res.status}]: ${body.slice(0, 300)}`);
  return { ok, status: res.status, error: ok ? undefined : body.slice(0, 300) };
}

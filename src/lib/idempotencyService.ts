import { supabase } from "@/integrations/supabase/client";

/**
 * Check if an idempotency key already exists. If so, return the stored result.
 * Otherwise return null so the caller can proceed with the operation.
 */
export async function checkIdempotency(key: string): Promise<{ exists: true; result: any } | { exists: false }> {
  const { data } = await supabase
    .from("idempotency_keys")
    .select("result_json")
    .eq("idempotency_key", key)
    .maybeSingle();

  if (data) return { exists: true, result: data.result_json };
  return { exists: false };
}

/**
 * Record an idempotency key with its result after a successful operation.
 */
export async function recordIdempotency(key: string, actionType: string, entityId: string, result: Record<string, unknown>) {
  await supabase.from("idempotency_keys").insert({
    idempotency_key: key,
    action_type: actionType,
    entity_id: entityId,
    result_json: result,
  } as any);
}

/**
 * Perform a versioned (optimistic concurrency) update on an order.
 * Returns the new version on success, or throws a conflict error.
 */
export async function versionedOrderUpdate(
  orderId: string,
  currentVersion: number,
  updates: Record<string, unknown>
): Promise<number> {
  const newVersion = currentVersion + 1;

  // Use RPC-style raw query to avoid deep type instantiation
  const allUpdates = { ...updates, version: newVersion };

  const { data, error } = await (supabase
    .from("orders") as any)
    .update(allUpdates)
    .eq("id", orderId)
    .eq("version", currentVersion)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("CONFLICT: Order was updated by another user. Please refresh and try again.");
  }

  return newVersion;
}

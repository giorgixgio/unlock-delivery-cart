import { supabase } from "@/integrations/supabase/client";

export type SystemEntityType = "order" | "variant" | "import_batch" | "export_batch";
export type SystemEventType =
  | "ORDER_CONFIRM"
  | "ORDER_STATUS_SET"
  | "ORDER_CANCEL"
  | "ORDER_HOLD"
  | "ORDER_FULFILL_TOGGLE"
  | "ORDER_SAVE"
  | "ORDER_UNDO_MERGE"
  | "ORDER_CREATE"
  | "SKU_UPDATE"
  | "COURIER_EXPORT_CREATE"
  | "COURIER_IMPORT_APPLY"
  | "BULK_DELETE"
  | "MANUAL_MERGE";

interface LogSystemEventInput {
  entityType: SystemEntityType;
  entityId: string;
  eventType: SystemEventType;
  actorId?: string;
  payload?: Record<string, unknown>;
}

// Storefront-allowed event types (must match public.storefront_log_system_event allowlist)
const STOREFRONT_ALLOWED = new Set<SystemEventType>(["ORDER_CREATE", "ORDER_SAVE", "ORDER_STATUS_SET"]);

async function insertViaRpcOrDirect(input: LogSystemEventInput, status: "SUCCESS" | "FAILED", errorMessage: string | null) {
  const { data: sessionData } = await supabase.auth.getSession();
  const isAuthed = !!sessionData?.session;

  // Anon storefront calls MUST go through the RPC (RLS now blocks direct inserts
  // with anything other than the allowlisted set). Admin/authenticated writes
  // continue to use the direct insert path so all internal event types remain
  // available to server-side/admin code.
  if (!isAuthed) {
    if (!STOREFRONT_ALLOWED.has(input.eventType)) return null;
    const { error } = await (supabase as any).rpc("storefront_log_system_event", {
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_event_type: input.eventType,
      p_actor_id: input.actorId || null,
      p_payload: (input.payload || {}) as any,
      p_status: status,
      p_error_message: errorMessage,
    });
    if (error) console.error("storefront_log_system_event error:", error);
    return null;
  }

  const { data, error } = await supabase
    .from("system_events" as any)
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      event_type: input.eventType,
      actor_id: input.actorId || null,
      payload_json: (input.payload || {}) as any,
      status,
      error_message: errorMessage,
    })
    .select("event_id")
    .single();

  if (error) {
    console.error("Failed to log system event:", error);
    return null;
  }
  return (data as any)?.event_id || null;
}

export async function logSystemEvent(input: LogSystemEventInput): Promise<string | null> {
  try {
    return await insertViaRpcOrDirect(input, "SUCCESS", null);
  } catch (e) {
    console.error("System event logging exception:", e);
    return null;
  }
}

export async function logSystemEventFailed(
  input: LogSystemEventInput & { errorMessage: string }
): Promise<string | null> {
  try {
    return await insertViaRpcOrDirect(input, "FAILED", input.errorMessage);
  } catch (e) {
    console.error("System event logging exception:", e);
    return null;
  }
}

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
  | "COURIER_IMPORT_APPLY";

interface LogSystemEventInput {
  entityType: SystemEntityType;
  entityId: string;
  eventType: SystemEventType;
  actorId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Log a SUCCESS system event. Returns the event_id as a receipt.
 */
export async function logSystemEvent(input: LogSystemEventInput): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("system_events" as any)
      .insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        event_type: input.eventType,
        actor_id: input.actorId || null,
        payload_json: (input.payload || {}) as any,
        status: "SUCCESS",
      })
      .select("event_id")
      .single();

    if (error) {
      console.error("Failed to log system event:", error);
      return null;
    }
    return (data as any)?.event_id || null;
  } catch (e) {
    console.error("System event logging exception:", e);
    return null;
  }
}

/**
 * Log a FAILED system event with error message. Returns the event_id as a receipt.
 */
export async function logSystemEventFailed(
  input: LogSystemEventInput & { errorMessage: string }
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("system_events" as any)
      .insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        event_type: input.eventType,
        actor_id: input.actorId || null,
        payload_json: (input.payload || {}) as any,
        status: "FAILED",
        error_message: input.errorMessage,
      })
      .select("event_id")
      .single();

    if (error) {
      console.error("Failed to log system event (FAILED):", error);
      return null;
    }
    return (data as any)?.event_id || null;
  } catch (e) {
    console.error("System event logging exception:", e);
    return null;
  }
}

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

interface SystemEvent {
  event_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_id: string | null;
  payload_json: Record<string, unknown>;
  status: string;
  error_message: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  "ALL",
  "ORDER_CONFIRM",
  "ORDER_STATUS_SET",
  "ORDER_CANCEL",
  "ORDER_HOLD",
  "ORDER_FULFILL_TOGGLE",
  "ORDER_SAVE",
  "ORDER_UNDO_MERGE",
  "ORDER_CREATE",
  "SKU_UPDATE",
  "COURIER_EXPORT_CREATE",
  "COURIER_IMPORT_APPLY",
];

const STATUS_FILTERS = ["ALL", "SUCCESS", "FAILED"];

const AdminSystemEvents = () => {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("system_events" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (eventTypeFilter !== "ALL") {
      query = query.eq("event_type", eventTypeFilter);
    }
    if (statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    let results = (data as unknown as SystemEvent[]) || [];

    if (search.trim()) {
      const s = search.toLowerCase();
      results = results.filter(
        (e) =>
          e.entity_id.toLowerCase().includes(s) ||
          e.event_type.toLowerCase().includes(s) ||
          (e.actor_id && e.actor_id.toLowerCase().includes(s)) ||
          (e.error_message && e.error_message.toLowerCase().includes(s))
      );
    }

    setEvents(results);
    setLoading(false);
  }, [eventTypeFilter, statusFilter, search]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const successCount = events.filter((e) => e.status === "SUCCESS").length;
  const failedCount = events.filter((e) => e.status === "FAILED").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-foreground">System Events</h1>
        <Button onClick={fetchEvents} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">{successCount} Success</span>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm font-bold text-red-700">{failedCount} Failed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search entity ID, actor, error..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="h-10 px-3 rounded-lg border border-border bg-card text-sm font-medium"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "All Event Types" : t}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                statusFilter === s
                  ? s === "FAILED"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border"
              }`}
            >
              {s === "ALL" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No events found</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Time</th>
                <th className="text-left px-4 py-3 font-bold">Event Type</th>
                <th className="text-left px-4 py-3 font-bold">Entity</th>
                <th className="text-left px-4 py-3 font-bold">Actor</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-left px-4 py-3 font-bold">Error</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <>
                  <tr
                    key={evt.event_id}
                    onClick={() => setExpandedId(expandedId === evt.event_id ? null : evt.event_id)}
                    className={`border-t border-border cursor-pointer transition-colors ${
                      evt.status === "FAILED" ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(evt.created_at).toLocaleString("ka-GE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-muted text-foreground">
                        {evt.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{evt.entity_type}:</span>{" "}
                      <span className="font-mono text-xs font-bold text-primary">
                        {evt.entity_id.length > 12
                          ? evt.entity_id.slice(0, 8) + "…"
                          : evt.entity_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{evt.actor_id || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          evt.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">
                      {evt.error_message || "—"}
                    </td>
                  </tr>
                  {expandedId === evt.event_id && (
                    <tr key={`${evt.event_id}-detail`} className="border-t border-border bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-2">
                          <div className="text-xs">
                            <span className="font-bold">Event ID: </span>
                            <span className="font-mono">{evt.event_id}</span>
                          </div>
                          <div className="text-xs">
                            <span className="font-bold">Full Entity ID: </span>
                            <span className="font-mono">{evt.entity_id}</span>
                          </div>
                          {evt.error_message && (
                            <div className="text-xs">
                              <span className="font-bold text-red-600">Error: </span>
                              <span>{evt.error_message}</span>
                            </div>
                          )}
                          <div className="text-xs">
                            <span className="font-bold">Payload: </span>
                            <pre className="mt-1 p-2 bg-background rounded border border-border text-xs overflow-x-auto max-h-40">
                              {JSON.stringify(evt.payload_json, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminSystemEvents;

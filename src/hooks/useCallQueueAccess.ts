import { useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  fetchCallQueueSettings, getCallQueueTestMode, TEST_MODE_EVENT, type CallQueueSettings,
} from "@/lib/callQueueService";

/** Who may open the Call Queue: admins with test mode on, or operators in enabled_operators. */
export function useCallQueueAccess() {
  const { user, role } = useAdminAuth();
  const [settings, setSettings] = useState<CallQueueSettings | null>(null);
  const [testMode, setTestMode] = useState(getCallQueueTestMode());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const on = () => setTestMode(getCallQueueTestMode());
    window.addEventListener(TEST_MODE_EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(TEST_MODE_EVENT, on); window.removeEventListener("storage", on); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchCallQueueSettings().then((s) => { if (alive) { setSettings(s); setLoaded(true); } }).catch(() => setLoaded(true));
    const on = () => fetchCallQueueSettings().then((s) => alive && setSettings(s)).catch(() => {});
    window.addEventListener(TEST_MODE_EVENT, on);
    return () => { alive = false; window.removeEventListener(TEST_MODE_EVENT, on); };
  }, [user]);

  const email = (user?.email || "").toLowerCase();
  const isAdminRole = role === "admin";
  const enabled = !!settings?.enabled_operators.some((e) => e.toLowerCase() === email);
  const isManager = isAdminRole || !!settings?.manager_emails.some((e) => e.toLowerCase() === email);
  const allowed = (isAdminRole && testMode) || enabled;
  return { allowed, loaded, testMode: isAdminRole && testMode, isAdminRole, isManager, settings };
}

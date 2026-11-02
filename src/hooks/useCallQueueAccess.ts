import { useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  fetchCallQueueSettingsCached, getCallQueueTestMode, TEST_MODE_EVENT, type CallQueueSettings,
} from "@/lib/callQueueService";
import { isQueueOnlyOperator } from "@/lib/adminPermissions";

/**
 * Who may open the Call Queue: admins with test mode on, or (master switch on) operators and managers.
 * The old per-operator list (enabled_operators) is no longer read.
 * Settings are re-read on load and window focus (cached up to 60 s).
 */
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
    fetchCallQueueSettingsCached().then((s) => { if (alive) { setSettings(s); setLoaded(true); } }).catch(() => alive && setLoaded(true));
    const refresh = (force: boolean) => () =>
      fetchCallQueueSettingsCached(force ? 0 : undefined).then((s) => alive && setSettings(s)).catch(() => {});
    const onChange = refresh(true), onFocus = refresh(false);
    const onVisible = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener(TEST_MODE_EVENT, onChange);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(onFocus, 60_000);
    return () => {
      alive = false; clearInterval(t);
      window.removeEventListener(TEST_MODE_EVENT, onChange);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const email = (user?.email || "").toLowerCase();
  const isAdminRole = role === "admin";
  const masterOn = !!settings?.operators_use_queue;
  const isListedManager = !!settings?.manager_emails.some((e) => e.toLowerCase() === email);
  const isManager = isAdminRole || isListedManager;
  // Admins: only via their test toggle. Others: master switch + operator role or manager list.
  const allowed = isAdminRole ? testMode : masterOn && (role === "operator" || isListedManager);
  const queueOnly = isQueueOnlyOperator(role, email, settings);
  return { allowed, loaded, testMode: isAdminRole && testMode, isAdminRole, isManager, settings, queueOnly };
}

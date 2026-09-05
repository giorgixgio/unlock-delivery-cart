import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export type AdminStore = "A" | "B" | "ALL";

type StoreContextValue = {
  activeStore: AdminStore;
  setActiveStore: (store: AdminStore) => void;
  defaultStore: AdminStore | null;
  saveDefaultStore: (store: AdminStore) => Promise<boolean>;
  loading: boolean;
  pickerOpen: boolean;
  dismissPicker: () => void;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAdminAuth();
  const [activeStore, setActiveStore] = useState<AdminStore>("ALL");
  const [defaultStore, setDefaultStore] = useState<AdminStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPreference = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await (supabase.from("admin_preferences") as any)
        .select("default_store")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const saved = data?.default_store as AdminStore | null | undefined;
      if (error) {
        console.error("Unable to load the admin store preference", error);
        setPickerOpen(false);
      } else if (saved === "A" || saved === "B" || saved === "ALL") {
        setDefaultStore(saved);
        setActiveStore(saved);
        setPickerOpen(false);
      } else {
        setDefaultStore(null);
        setActiveStore("ALL");
        setPickerOpen(true);
      }
      setLoading(false);
    };
    void loadPreference();
    return () => { cancelled = true; };
  }, [user?.id]);

  const saveDefaultStore = useCallback(async (store: AdminStore) => {
    if (!user?.id) return false;
    const { error } = await (supabase.from("admin_preferences") as any).upsert({
      user_id: user.id,
      default_store: store,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return false;
    setDefaultStore(store);
    setActiveStore(store);
    setPickerOpen(false);
    return true;
  }, [user?.id]);

  const value = useMemo<StoreContextValue>(() => ({
    activeStore,
    setActiveStore,
    defaultStore,
    saveDefaultStore,
    loading,
    pickerOpen,
    dismissPicker: () => setPickerOpen(false),
  }), [activeStore, defaultStore, saveDefaultStore, loading, pickerOpen]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}
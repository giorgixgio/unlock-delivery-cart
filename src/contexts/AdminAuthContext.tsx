import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setDemoMode, wrapSupabaseForDemo } from "@/lib/demoMode";
import {
  setPresentationMode,
  wrapSupabaseForPresentation,
  getPresentationMultiplier,
} from "@/lib/presentationMode";

// Install client wrappers exactly once at module load.
wrapSupabaseForDemo(supabase);
wrapSupabaseForPresentation(supabase);

interface AdminAuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  isDemo: boolean;
  /** True when this signed-in admin has presentation mode active. */
  isPresentation: boolean;
  /** Multiplier (0–1) currently applied to displayed revenue. */
  presentationMultiplier: number;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [presentationMultiplier, setPresentationMultiplierState] = useState(1);
  const [loading, setLoading] = useState(true);

  const resolveAdminState = async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user?.id) {
      setIsAdmin(false);
      setIsDemo(false);
      setDemoMode(false);
      setIsPresentation(false);
      setPresentationMultiplierState(1);
      setPresentationMode(null);
      setLoading(false);
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("is_active_admin", {
        user_id: nextSession.user.id,
      });

      if (error) throw error;

      const adminActive = data === true;
      setIsAdmin(adminActive);

      const email = nextSession.user.email?.toLowerCase() ?? null;

      // Demo flag (legacy — leaves real data intact, just labels the UI)
      let demoActive = false;
      if (adminActive && email) {
        const { data: row } = await supabase
          .from("admin_users")
          .select("is_demo")
          .eq("email", email)
          .maybeSingle();
        demoActive = (row as any)?.is_demo === true;
      }
      setIsDemo(demoActive);
      setDemoMode(demoActive);

      // Presentation mode — load this user's row (RLS allows own-row read)
      let pres = false;
      let mult = 1;
      if (adminActive && email) {
        const { data: pRow } = await supabase
          .from("presentation_settings")
          .select("is_active, revenue_multiplier")
          .eq("target_email", email)
          .maybeSingle();
        if ((pRow as any)?.is_active === true) {
          pres = true;
          mult = Number((pRow as any).revenue_multiplier) || 0;
        }
      }
      setIsPresentation(pres);
      setPresentationMultiplierState(mult);
      setPresentationMode(pres && email ? { email, multiplier: mult } : null);

      setLoading(false);
      return adminActive;
    } catch {
      setIsAdmin(false);
      setIsDemo(false);
      setDemoMode(false);
      setIsPresentation(false);
      setPresentationMultiplierState(1);
      setPresentationMode(null);
      setLoading(false);
      return false;
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setLoading(true);
      void resolveAdminState(newSession);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      await resolveAdminState(data.session);
    })();

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    const adminActive = await resolveAdminState(data.session);
    if (!adminActive) {
      await supabase.auth.signOut();
      return { error: "This account does not have admin access." };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setIsDemo(false);
    setDemoMode(false);
    setIsPresentation(false);
    setPresentationMultiplierState(1);
    setPresentationMode(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        user,
        isAdmin,
        isDemo,
        isPresentation,
        presentationMultiplier,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};
